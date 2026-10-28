import { ImageValidationError, validateImage } from "./image-validation.ts";
import { NativeDocumentError } from "@ieumdoc/core";
import { assertUnicode, decodeUtf8 } from "@ieumdoc/file-commit";
import { validFileStem } from "../shared/file-operations.ts";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { ASSET_FORMATS, ASSET_TYPES, isAssetMime, MAX_ASSET_BYTES } from "../shared/asset-policy.ts";
import type { AssetResponse, AssetRollbackRequest, ImageChoiceRequest, ImageChoiceResponse } from "../shared/asset-protocol.ts";
import { loadDocumentFile, MEDIA_TYPES, resolveDocumentPath, resolveMediaPath } from "./document-api.ts";
import { requestQuery } from "./request-query.ts";
import { accessPath, FileAccessError, fileErrorMessage, fileErrorStatus, inside, LOCAL_FILE_ACCESS, type FileAccess } from "./file-access.ts";
import { readRequestBody, RequestBodyError } from "./request-body.ts";

const ASSET_PATH = /^\.\/assets\/([^/\\]+)\.(png|jpg|gif|webp)$/;
const UNSUPPORTED = `Only ${ASSET_FORMATS} images are supported.`;

class AssetError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

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
    loadDocumentFile(document, access);
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
export function createImageAsset(locator: string, mime: string, bytes: Buffer, key: Buffer, access: FileAccess = LOCAL_FILE_ACCESS, originalName = "", source = "paste"): AssetResponse {
  validateImage(mime, bytes); // Rejected input must not create even a directory/temp file.
  assertUnicode(originalName);
  if (source !== "paste" && source !== "drop") throw new AssetError("Invalid image input source.");
  const scope = documentScope(locator, true, access);
  const cleanStem = (name: string) => {
    let stem = name.replace(/%(?=2e|2f|5c|00)/gi, "-").replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-").replace(/\.{2,}/g, "-").trim().replace(/[. ]+$/, "").replace(/^\.+/, "");
    if (stem && !validFileStem(stem)) stem = `_${stem}`;
    // Leave room for a collision suffix and MIME extension, without splitting Unicode.
    let bounded = "";
    for (const point of stem) {
      if (Buffer.byteLength(bounded + point, "utf8") > 180) break;
      bounded += point;
    }
    return bounded.trim().replace(/[. ]+$/, "");
  };
  const originalStem = cleanStem(originalName.replace(/\.[^.]*$/, ""));
  // Chromium's clipboard File is named image.png; match exact MIME-family generic names,
  // not descriptive names such as image-architecture.png or image1.png.
  const numbered = !originalStem || source === "paste" && /^image\.(?:png|jpe?g|gif|webp)$/i.test(originalName);
  const stem = numbered ? cleanStem(path.basename(scope.document, path.extname(scope.document))) || "document" : originalStem;
  const directory = assetDirectory(scope.root, true, access);
  let sequence = 1;
  if (numbered) for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (!name.toLowerCase().startsWith(`${stem}-`.toLowerCase())) continue;
    const match = /^(\d+)\.[^.]+$/.exec(name.slice(stem.length + 1));
    if (match && Number.isSafeInteger(Number(match[1]))) sequence = Math.max(sequence, Number(match[1]) + 1);
  }
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
    for (; Number.isSafeInteger(sequence); sequence++) {
      const destination = path.join(directory, `${stem}${numbered || sequence > 1 ? `-${sequence}` : ""}.${ASSET_TYPES[mime]}`);
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
  return createImageAsset(request.documentPath, mime, fs.readFileSync(file), key, access, path.basename(file), "drop"); // A chosen real file keeps its name too.
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
  if (typeof request?.path !== "string" || !ASSET_PATH.test(request.path) || !validFileStem(ASSET_PATH.exec(request.path)![1])) throw new AssetError("Invalid relative asset path.");
  assertUnicode(request.path);
  const receipt = readReceipt(request.rollbackToken, key);
  const scope = documentScope(request.documentPath, false, access);
  if (receipt.document !== scope.document || receipt.path !== request.path) throw new AssetError("Asset rollback receipt does not match this request.");
  assetDirectory(scope.root, false, access);
  const file = resolveMediaPath(request.path.split("/").map(encodeURIComponent).join("/"), scope.document, access);
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
    const query = requestQuery(req.url ?? "");
    if (req.method === "POST" && /^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? "")) {
      json(200, chooseImageAsset(JSON.parse(decodeUtf8(await readRequestBody(req, 65536))) as ImageChoiceRequest, key, access));
    } else if (req.method === "POST") {
      const mime = req.headers["content-type"] ?? "";
      if (!isAssetMime(mime)) throw new AssetError(UNSUPPORTED);
      if (Number(req.headers["content-length"]) > MAX_ASSET_BYTES) throw new AssetError(`Image exceeds the ${MAX_ASSET_BYTES / 1024 / 1024} MiB limit.`, 413);
      const locator = query.get("path");
      if (!locator) throw new AssetError("A document locator is required.");
      const bytes = await readRequestBody(req, MAX_ASSET_BYTES);
      json(201, createImageAsset(locator, mime, bytes, key, access, query.get("name") ?? "", query.get("source") ?? "paste"));
    } else if (req.method === "DELETE") {
      const body = JSON.parse(decodeUtf8(await readRequestBody(req, 8192))) as AssetRollbackRequest;
      rollbackImageAsset(body, key, access);
      res.statusCode = 204; res.end();
    } else { res.statusCode = 405; res.end(); }
  } catch (error) {
    req.resume();
    json(error instanceof AssetError || error instanceof ImageValidationError || error instanceof RequestBodyError ? error.status : fileErrorStatus(error), { error: error instanceof NativeDocumentError ? error.message : fileErrorMessage(error, access) });
  }
}
