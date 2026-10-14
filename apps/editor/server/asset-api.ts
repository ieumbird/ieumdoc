import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { ASSET_FORMATS, ASSET_TYPES, isAssetMime, MAX_ASSET_BYTES, type AssetMime } from "../shared/asset-policy.ts";
import type { AssetResponse, AssetRollbackRequest, ImageChoiceRequest, ImageChoiceResponse } from "../shared/asset-protocol.ts";
import { loadDocumentFile, MEDIA_TYPES, resolveDocumentPath, resolveMediaPath } from "./document-api.ts";
import { accessPath, FileAccessError, fileErrorMessage, fileErrorStatus, inside, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import { readRequestBody, RequestBodyError } from "./request-body.ts";

const ASSET_PATH = /^\.\/assets\/image-[a-f0-9-]{36}\.(png|jpg|gif|webp)$/;
const UNSUPPORTED = `Only ${ASSET_FORMATS} images are supported.`;

class AssetError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** MIME plus the complete container of that format; no SVG, decoder, or image transformation. */
function validateImage(mime: string, bytes: Buffer): asserts mime is AssetMime {
  if (!isAssetMime(mime)) throw new AssetError(UNSUPPORTED);
  if (bytes.length === 0) throw new AssetError("The image is empty.");
  if (bytes.length > MAX_ASSET_BYTES) throw new AssetError(`Image exceeds the ${MAX_ASSET_BYTES / 1024 / 1024} MiB limit.`, 413);
  const format = FORMATS[mime];
  if (!format.complete(bytes)) throw new AssetError(`The image is not a complete ${format.name} file.`);
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

const FORMATS: Record<AssetMime, { name: string; complete(bytes: Buffer): boolean }> = {
  // Signature, IHDR first, image data, and IEND exactly at the end.
  "image/png": { name: "PNG", complete(bytes) {
    if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
    let at = 8, imageData = false;
    while (at + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(at);
      const type = bytes.toString("ascii", at + 4, at + 8);
      if (size > bytes.length - at - 12) return false;
      if (at === 8 && (type !== "IHDR" || size !== 13 || !bytes.readUInt32BE(at + 8) || !bytes.readUInt32BE(at + 12))) return false;
      if (type === "IDAT" && size > 0) imageData = true;
      at += size + 12;
      if (type === "IEND") return size === 0 && imageData && at === bytes.length;
    }
    return false;
  } },
  // SOI, length-framed segments with a frame header before the first scan, and EOI after it.
  // Bytes after EOI, which some cameras append, are kept: viewers ignore them.
  "image/jpeg": { name: "JPEG", complete(bytes) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
    let at = 2, frame = false;
    while (at + 4 <= bytes.length) {
      if (bytes[at] !== 0xff) return false;
      const marker = bytes[at + 1];
      if (marker === 0xff) { at++; continue; } // Fill byte.
      const size = bytes.readUInt16BE(at + 2);
      if (size < 2 || size > bytes.length - at - 2) return false;
      // SOF0–SOF15 with a non-zero width; DHT, JPG and DAC share the range.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) frame = size >= 8 && bytes.readUInt16BE(at + 7) > 0;
      // Scan data escapes 0xFF, so the first FF D9 after a scan header is EOI.
      if (marker === 0xda) return frame && bytes.indexOf(JPEG_EOI, at + 2 + size) !== -1;
      at += 2 + size;
    }
    return false;
  } },
  // Header and screen size, then extension and image blocks of sub-blocks, up to the trailer.
  "image/gif": { name: "GIF", complete(bytes) {
    const header = bytes.toString("ascii", 0, 6);
    if ((header !== "GIF87a" && header !== "GIF89a") || bytes.length < 13 || !bytes.readUInt16LE(6) || !bytes.readUInt16LE(8)) return false;
    const colorTable = (flags: number) => flags & 0x80 ? 3 << ((flags & 7) + 1) : 0;
    const subBlocks = (from: number) => {
      let at = from;
      while (at < bytes.length && bytes[at] !== 0) at += bytes[at] + 1;
      return at + 1;
    };
    let at = 13 + colorTable(bytes[10]), image = false;
    while (at < bytes.length) {
      if (bytes[at] === 0x3b) return image;
      if (bytes[at] === 0x21) at = subBlocks(at + 2);
      // Descriptor, local color table and LZW code size, then the data.
      else if (bytes[at] === 0x2c && at + 10 <= bytes.length) { at = subBlocks(at + 10 + colorTable(bytes[at + 9]) + 1); image = true; }
      else return false;
    }
    return false;
  } },
  // A RIFF WEBP container as long as the file, of whole chunks holding image data.
  "image/webp": { name: "WebP", complete(bytes) {
    if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP" || bytes.readUInt32LE(4) !== bytes.length - 8) return false;
    let at = 12, image = false;
    while (at + 8 <= bytes.length) {
      const type = bytes.toString("ascii", at, at + 4), size = bytes.readUInt32LE(at + 4);
      if (size > bytes.length - at - 8) return false;
      if ((type === "VP8 " || type === "VP8L" || type === "ANMF") && size > 0) image = true;
      at += 8 + size + (size & 1);
    }
    return image && at === bytes.length;
  } },
};

function documentScope(locator: string, writable: boolean, access: FileAccess): { document: string; root: string } {
  if (typeof locator !== "string" || !locator.trim() || locator.includes("\0")) throw new AssetError("A valid document locator is required.");
  const document = resolveDocumentPath(locator, access);
  const root = fs.realpathSync(path.dirname(document));
  const actual = fs.realpathSync(document);
  const relative = path.relative(root, actual);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.statSync(actual).isFile()) {
    throw new AssetError("Document symlink escapes its directory.");
  }
  if (writable) {
    const loaded = loadDocumentFile(document, access);
    if (loaded.writeError) throw new AssetError(`Document is read-only: ${loaded.writeError}`);
    fs.accessSync(actual, fs.constants.W_OK);
  }
  return { document, root };
}

function assetDirectory(root: string, create: boolean, access: FileAccess): string {
  const directory = accessPath(path.join(root, "assets"), access, create);
  if (create) {
    try { fs.mkdirSync(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory) {
    throw new AssetError("The assets directory must be a real directory, not a symlink.");
  }
  return directory;
}

function inspectAsset(file: string, expectedOwner: fs.Stats | undefined, access: FileAccess): { identity: string; owner: fs.Stats; hash: string } {
  accessPath(file, access);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new AssetError("Asset file changed; rollback refused.");
  if (expectedOwner) assertOwnedFile(file, expectedOwner, access);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd);
    if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.birthtimeMs !== stat.birthtimeMs) throw new AssetError("Asset file changed during validation.");
    const hash = createHash("sha256").update(fs.readFileSync(fd)).digest("hex");
    assertOwnedFile(file, opened, access);
    return { identity: `${opened.dev}:${opened.ino}:${opened.birthtimeMs}:${opened.size}:${hash}`, owner: opened, hash };
  } finally { fs.closeSync(fd); }
}

function assertOwnedFile(file: string, owner: fs.Stats, access: FileAccess, unchanged = false): void {
  accessPath(file, access);
  const current = fs.lstatSync(file);
  if (!current.isFile() || current.isSymbolicLink() || current.dev !== owner.dev || current.ino !== owner.ino || current.birthtimeMs !== owner.birthtimeMs ||
      (unchanged && (current.size !== owner.size || current.mtimeMs !== owner.mtimeMs || current.ctimeMs !== owner.ctimeMs))) {
    throw new AssetError("Asset file ownership changed; cleanup refused.");
  }
}

function unlinkOwnedFile(file: string, owner: fs.Stats, root: string, directoryId: fs.Stats, access: FileAccess, unchanged = false): void {
  const current = fs.statSync(assetDirectory(root, false, access));
  if (current.dev !== directoryId.dev || current.ino !== directoryId.ino) throw new AssetError("Asset directory changed; cleanup refused.");
  try { assertOwnedFile(file, owner, access, unchanged); fs.unlinkSync(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

type Receipt = { document: string; path: string; identity: string };
function signReceipt(receipt: Receipt, key: Buffer): string {
  const payload = Buffer.from(JSON.stringify(receipt)).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}

function readReceipt(token: string, key: Buffer): Receipt {
  if (typeof token !== "string" || token.length > 4096) throw new AssetError("Invalid asset rollback receipt.");
  const [payload, signature, extra] = token.split(".");
  const expected = createHmac("sha256", key).update(payload ?? "").digest();
  const actual = Buffer.from(signature ?? "", "base64url");
  if (extra !== undefined || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AssetError("Invalid asset rollback receipt.");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Receipt;
}

/** The signing key belongs to the Host process lifetime, never to an Editor session. */
export function createImageAsset(locator: string, mime: string, bytes: Buffer, key: Buffer, access: FileAccess = LOCAL_FILE_ACCESS): AssetResponse {
  validateImage(mime, bytes); // Rejected input must not create even a directory/temp file.
  const scope = documentScope(locator, true, access);
  const directory = assetDirectory(scope.root, true, access);
  const directoryId = fs.statSync(directory);
  const temporary = path.join(directory, `.image-${randomUUID()}.tmp`);
  let fd: number | undefined, owner: fs.Stats | undefined, ownsTemporary = false, published: string | undefined;
  try {
    fd = fs.openSync(accessPath(temporary, access, true), "wx", 0o600);
    ownsTemporary = true;
    owner = fs.fstatSync(fd);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    const current = fs.statSync(assetDirectory(scope.root, false, access));
    if (current.dev !== directoryId.dev || current.ino !== directoryId.ino) throw new AssetError("Asset directory changed during write.");
    assertOwnedFile(temporary, owner, access);
    // A hard link publishes the completed bytes atomically and fails on EEXIST.
    // Unlike rename on POSIX, it cannot overwrite another file on a name collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const destination = path.join(directory, `image-${randomUUID()}.${ASSET_TYPES[mime]}`);
      try { fs.linkSync(accessPath(temporary, access), accessPath(destination, access, true)); published = destination; break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    if (!published) throw new AssetError("Could not allocate a unique asset filename.");
    assertOwnedFile(published, owner, access);
    unlinkOwnedFile(temporary, owner, scope.root, directoryId, access); ownsTemporary = false;
    const relative = `./assets/${path.basename(published)}`;
    const verified = inspectAsset(published, owner, access);
    if (verified.owner.size !== bytes.length || verified.hash !== createHash("sha256").update(bytes).digest("hex")) throw new AssetError("Asset content changed during publication.");
    return { path: relative, rollbackToken: signReceipt({ document: scope.document, path: relative, identity: verified.identity }, key) };
  } catch (error) {
    if (published && owner) {
      const verified = inspectAsset(published, owner, access);
      if (verified.hash !== createHash("sha256").update(bytes).digest("hex")) throw new AssetError(`Asset content changed; cleanup refused for assets/${path.basename(published)}.`);
      unlinkOwnedFile(published, verified.owner, scope.root, directoryId, access, true);
    }
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (ownsTemporary && owner) {
      try { unlinkOwnedFile(temporary, owner, scope.root, directoryId, access); }
      catch (error) { throw new AssetError(`Asset write failed. Temporary cleanup failed for assets/${path.basename(temporary)}: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }
}

/**
 * An image the user chose on the Host. Inside the document's folder it is linked where it is,
 * so the document keeps a readable path; elsewhere it is copied into assets/ like a pasted image.
 */
export function chooseImageAsset(request: ImageChoiceRequest, key: Buffer, access: FileAccess = LOCAL_FILE_ACCESS): ImageChoiceResponse {
  const source = request?.source;
  if (typeof source !== "string" || !source.trim() || source.includes("\0")) throw new AssetError("Choose an image file.");
  const file = path.resolve(accessPath(source.trim(), access));
  const mime = MEDIA_TYPES[path.extname(file).toLowerCase()];
  let stat: fs.Stats;
  try { stat = fs.statSync(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new AssetError("The image does not exist."); throw error; }
  if (!stat.isFile() || !mime) throw new AssetError(`Choose a ${ASSET_FORMATS} or SVG image file.`);
  const scope = documentScope(request.documentPath, false, access);
  const directory = path.dirname(scope.document);
  if (inside(directory, file) && inside(scope.root, fs.realpathSync(file))) {
    const relative = `./${path.relative(directory, file).split(path.sep).join("/")}`;
    if (servable(relative, scope.document, access)) return { path: relative };
  }
  if (!isAssetMime(mime)) throw new AssetError(`Only ${ASSET_FORMATS} images can be copied into assets/. Move the SVG into the document's folder to use it.`);
  if (stat.size > MAX_ASSET_BYTES) throw new AssetError(`Image exceeds the ${MAX_ASSET_BYTES / 1024 / 1024} MiB limit.`, 413);
  return createImageAsset(request.documentPath, mime, fs.readFileSync(file), key, access);
}

/**
 * The media route accepts the path as the Editor requests it, segments URL-encoded. A name it
 * cannot serve, such as one holding `%2e` or a backslash, is copied rather than linked.
 */
function servable(relative: string, document: string, access: FileAccess): boolean {
  if (relative.includes("\\")) return false;
  try {
    resolveMediaPath(relative.slice(2).split("/").map(encodeURIComponent).join("/"), document, access);
    return true;
  } catch (error) {
    if (error instanceof FileAccessError) throw error;
    return false;
  }
}

/** No arbitrary delete API: only a signed receipt for this exact, unchanged created file. */
export function rollbackImageAsset(request: AssetRollbackRequest, key: Buffer, access: FileAccess = LOCAL_FILE_ACCESS): void {
  if (typeof request?.path !== "string" || !ASSET_PATH.test(request.path)) throw new AssetError("Invalid relative asset path.");
  const receipt = readReceipt(request.rollbackToken, key);
  const scope = documentScope(request.documentPath, false, access);
  if (receipt.document !== scope.document || receipt.path !== request.path) throw new AssetError("Asset rollback receipt does not match this request.");
  assetDirectory(scope.root, false, access);
  const file = resolveMediaPath(request.path, scope.document, access);
  try {
    if (inspectAsset(file, undefined, access).identity !== receipt.identity) throw new AssetError("Asset file changed; rollback refused.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  // Rename isolates the inode before deletion. If another process replaced the
  // original between validation and rename, retain and exclusively restore it.
  // The quarantine name is unguessable and never created beforehand: on Windows,
  // renaming over a just-created placeholder fails with EPERM while a scanner holds it.
  const directoryId = fs.statSync(assetDirectory(scope.root, false, access));
  const quarantine = path.join(scope.root, "assets", `.rollback-${randomUUID()}.tmp`);
  let moved = false;
  try {
    try { fs.lstatSync(quarantine); throw new AssetError("Rollback quarantine name is in use; rollback refused."); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    fs.renameSync(accessPath(file, access), accessPath(quarantine, access, true)); moved = true;
    const verified = inspectAsset(quarantine, undefined, access);
    if (verified.identity !== receipt.identity) throw new AssetError("Asset file changed before rollback deletion.");
    unlinkOwnedFile(quarantine, verified.owner, scope.root, directoryId, access, true);
  } catch (error) {
    if (moved) {
      try {
        const owner = fs.lstatSync(accessPath(quarantine, access));
        assetDirectory(scope.root, false, access);
        fs.linkSync(accessPath(quarantine, access), accessPath(file, access, true)); // Exclusive: never overwrite a later file at the original path.
        unlinkOwnedFile(quarantine, owner, scope.root, directoryId, access);
      } catch (restoreError) {
        throw new AssetError(`Rollback failed; retained asset may be at assets/${path.basename(quarantine)}: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
      }
    }
    throw error;
  }
}

export async function handleAssetRequest(req: IncomingMessage, res: ServerResponse, key: Buffer, access: FileAccess = LOCAL_FILE_ACCESS): Promise<void> {
  const json = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === "POST" && /^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? "")) {
      json(200, chooseImageAsset(JSON.parse((await readRequestBody(req, 65536)).toString("utf8")) as ImageChoiceRequest, key, access));
    } else if (req.method === "POST") {
      const mime = req.headers["content-type"] ?? "";
      if (!isAssetMime(mime)) throw new AssetError(UNSUPPORTED);
      if (Number(req.headers["content-length"]) > MAX_ASSET_BYTES) throw new AssetError(`Image exceeds the ${MAX_ASSET_BYTES / 1024 / 1024} MiB limit.`, 413);
      const locator = new URL(req.url ?? "", "http://localhost").searchParams.get("path");
      if (!locator) throw new AssetError("A document locator is required.");
      const bytes = await readRequestBody(req, MAX_ASSET_BYTES);
      json(201, createImageAsset(locator, mime, bytes, key, access));
    } else if (req.method === "DELETE") {
      const body = JSON.parse((await readRequestBody(req, 8192)).toString("utf8")) as AssetRollbackRequest;
      rollbackImageAsset(body, key, access);
      res.statusCode = 204; res.end();
    } else { res.statusCode = 405; res.end(); }
  } catch (error) {
    req.resume();
    json(error instanceof AssetError || error instanceof RequestBodyError ? error.status : fileErrorStatus(error), { error: fileErrorMessage(error, access) });
  }
}
