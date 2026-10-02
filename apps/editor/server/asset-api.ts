import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { ASSET_MIME, MAX_ASSET_BYTES } from "../shared/asset-policy.ts";
import type { AssetResponse, AssetRollbackRequest } from "../shared/asset-protocol.ts";
import { loadDocumentFile, resolveDocumentPath, resolveMediaPath } from "./document-api.ts";

const ASSET_PATH = /^\.\/assets\/image-[a-f0-9-]{36}\.png$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

class AssetError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

/** MIME plus a complete PNG chunk envelope; no SVG, decoder, or image transformation. */
function validateImage(mime: string, bytes: Buffer): void {
  if (mime !== ASSET_MIME) throw new AssetError("Only PNG images (image/png) are supported.");
  if (bytes.length === 0) throw new AssetError("The image is empty.");
  if (bytes.length > MAX_ASSET_BYTES) throw new AssetError(`Image exceeds the ${MAX_ASSET_BYTES / 1024 / 1024} MiB limit.`, 413);
  const invalid = () => { throw new AssetError("The image is not a complete PNG file."); };
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) invalid();
  let at = 8, imageData = false;
  while (at + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(at);
    const type = bytes.toString("ascii", at + 4, at + 8);
    if (size > bytes.length - at - 12) invalid();
    if (at === 8 && (type !== "IHDR" || size !== 13 || !bytes.readUInt32BE(at + 8) || !bytes.readUInt32BE(at + 12))) invalid();
    if (type === "IDAT" && size > 0) imageData = true;
    at += size + 12;
    if (type === "IEND") {
      if (size !== 0 || !imageData || at !== bytes.length) invalid();
      return;
    }
  }
  invalid();
}

function documentScope(locator: string, writable: boolean): { document: string; root: string } {
  if (typeof locator !== "string" || !locator.trim() || locator.includes("\0")) throw new AssetError("A valid document locator is required.");
  const document = resolveDocumentPath(locator);
  const root = fs.realpathSync(path.dirname(document));
  const actual = fs.realpathSync(document);
  const relative = path.relative(root, actual);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.statSync(actual).isFile()) {
    throw new AssetError("Document symlink escapes its directory.");
  }
  if (writable) {
    const loaded = loadDocumentFile(document);
    if (loaded.writeError) throw new AssetError(`Document is read-only: ${loaded.writeError}`);
    fs.accessSync(actual, fs.constants.W_OK);
  }
  return { document, root };
}

function assetDirectory(root: string, create: boolean): string {
  const directory = path.join(root, "assets");
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

function inspectAsset(file: string, expectedOwner?: fs.Stats): { identity: string; owner: fs.Stats; hash: string } {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new AssetError("Asset file changed; rollback refused.");
  if (expectedOwner) assertOwnedFile(file, expectedOwner);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd);
    if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.birthtimeMs !== stat.birthtimeMs) throw new AssetError("Asset file changed during validation.");
    const hash = createHash("sha256").update(fs.readFileSync(fd)).digest("hex");
    assertOwnedFile(file, opened);
    return { identity: `${opened.dev}:${opened.ino}:${opened.birthtimeMs}:${opened.size}:${hash}`, owner: opened, hash };
  } finally { fs.closeSync(fd); }
}

function assertOwnedFile(file: string, owner: fs.Stats, unchanged = false): void {
  const current = fs.lstatSync(file);
  if (!current.isFile() || current.isSymbolicLink() || current.dev !== owner.dev || current.ino !== owner.ino || current.birthtimeMs !== owner.birthtimeMs ||
      (unchanged && (current.size !== owner.size || current.mtimeMs !== owner.mtimeMs || current.ctimeMs !== owner.ctimeMs))) {
    throw new AssetError("Asset file ownership changed; cleanup refused.");
  }
}

function unlinkOwnedFile(file: string, owner: fs.Stats, root: string, directoryId: fs.Stats, unchanged = false): void {
  const current = fs.statSync(assetDirectory(root, false));
  if (current.dev !== directoryId.dev || current.ino !== directoryId.ino) throw new AssetError("Asset directory changed; cleanup refused.");
  try { assertOwnedFile(file, owner, unchanged); fs.unlinkSync(file); }
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

/** The signing key belongs to the dev Host lifetime, never to an Editor session. */
export function createImageAsset(locator: string, mime: string, bytes: Buffer, key: Buffer): AssetResponse {
  validateImage(mime, bytes); // Rejected input must not create even a directory/temp file.
  const scope = documentScope(locator, true);
  const directory = assetDirectory(scope.root, true);
  const directoryId = fs.statSync(directory);
  const temporary = path.join(directory, `.image-${randomUUID()}.tmp`);
  let fd: number | undefined, owner: fs.Stats | undefined, ownsTemporary = false, published: string | undefined;
  try {
    fd = fs.openSync(temporary, "wx", 0o600);
    ownsTemporary = true;
    owner = fs.fstatSync(fd);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    const current = fs.statSync(assetDirectory(scope.root, false));
    if (current.dev !== directoryId.dev || current.ino !== directoryId.ino) throw new AssetError("Asset directory changed during write.");
    assertOwnedFile(temporary, owner);
    // A hard link publishes the completed bytes atomically and fails on EEXIST.
    // Unlike rename on POSIX, it cannot overwrite another file on a name collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const destination = path.join(directory, `image-${randomUUID()}.png`);
      try { fs.linkSync(temporary, destination); published = destination; break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    if (!published) throw new AssetError("Could not allocate a unique asset filename.");
    assertOwnedFile(published, owner);
    unlinkOwnedFile(temporary, owner, scope.root, directoryId); ownsTemporary = false;
    const relative = `./assets/${path.basename(published)}`;
    const verified = inspectAsset(published, owner);
    if (verified.owner.size !== bytes.length || verified.hash !== createHash("sha256").update(bytes).digest("hex")) throw new AssetError("Asset content changed during publication.");
    return { path: relative, rollbackToken: signReceipt({ document: scope.document, path: relative, identity: verified.identity }, key) };
  } catch (error) {
    if (published && owner) {
      const verified = inspectAsset(published, owner);
      if (verified.hash !== createHash("sha256").update(bytes).digest("hex")) throw new AssetError(`Asset content changed; cleanup refused for assets/${path.basename(published)}.`);
      unlinkOwnedFile(published, verified.owner, scope.root, directoryId, true);
    }
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (ownsTemporary && owner) {
      try { unlinkOwnedFile(temporary, owner, scope.root, directoryId); }
      catch (error) { throw new AssetError(`Asset write failed. Temporary cleanup failed for assets/${path.basename(temporary)}: ${error instanceof Error ? error.message : String(error)}`); }
    }
  }
}

/** No arbitrary delete API: only a signed receipt for this exact, unchanged created file. */
export function rollbackImageAsset(request: AssetRollbackRequest, key: Buffer): void {
  if (typeof request?.path !== "string" || !ASSET_PATH.test(request.path)) throw new AssetError("Invalid relative asset path.");
  const receipt = readReceipt(request.rollbackToken, key);
  const scope = documentScope(request.documentPath, false);
  if (receipt.document !== scope.document || receipt.path !== request.path) throw new AssetError("Asset rollback receipt does not match this request.");
  assetDirectory(scope.root, false);
  const file = resolveMediaPath(request.path, scope.document);
  try {
    if (inspectAsset(file).identity !== receipt.identity) throw new AssetError("Asset file changed; rollback refused.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  // Rename isolates the inode before deletion. If another process replaced the
  // original between validation and rename, retain and exclusively restore it.
  const directoryId = fs.statSync(assetDirectory(scope.root, false));
  const quarantine = path.join(scope.root, "assets", `.rollback-${randomUUID()}.tmp`);
  const fd = fs.openSync(quarantine, "wx", 0o600);
  const reservation = fs.fstatSync(fd);
  fs.closeSync(fd);
  let moved = false;
  try {
    assertOwnedFile(quarantine, reservation);
    fs.renameSync(file, quarantine); moved = true;
    const verified = inspectAsset(quarantine);
    if (verified.identity !== receipt.identity) throw new AssetError("Asset file changed before rollback deletion.");
    unlinkOwnedFile(quarantine, verified.owner, scope.root, directoryId, true);
  } catch (error) {
    if (moved) {
      try {
        const owner = fs.lstatSync(quarantine);
        assetDirectory(scope.root, false);
        fs.linkSync(quarantine, file); // Exclusive: never overwrite a later file at the original path.
        unlinkOwnedFile(quarantine, owner, scope.root, directoryId);
      } catch (restoreError) {
        throw new AssetError(`Rollback failed; retained asset may be at assets/${path.basename(quarantine)}: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
      }
    } else unlinkOwnedFile(quarantine, reservation, scope.root, directoryId);
    throw error;
  }
}

function readBytes(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0, failed = false;
    req.on("data", (chunk: Buffer) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) { failed = true; chunks.length = 0; reject(new AssetError(`Request exceeds the ${limit === MAX_ASSET_BYTES ? `${MAX_ASSET_BYTES / 1024 / 1024} MiB image` : "rollback"} limit.`, 413)); }
      else chunks.push(chunk);
    });
    req.on("end", () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on("aborted", () => reject(new AssetError("Asset upload was interrupted.")));
    req.on("error", reject);
  });
}

export async function handleAssetRequest(req: IncomingMessage, res: ServerResponse, key: Buffer): Promise<void> {
  const json = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(body));
  };
  try {
    if (req.method === "POST") {
      const mime = req.headers["content-type"] ?? "";
      if (mime !== ASSET_MIME) throw new AssetError("Only PNG images (image/png) are supported.");
      if (Number(req.headers["content-length"]) > MAX_ASSET_BYTES) throw new AssetError(`Image exceeds the ${MAX_ASSET_BYTES / 1024 / 1024} MiB limit.`, 413);
      const locator = new URL(req.url ?? "", "http://localhost").searchParams.get("path");
      if (!locator) throw new AssetError("A document locator is required.");
      const bytes = await readBytes(req, MAX_ASSET_BYTES);
      json(201, createImageAsset(locator, mime, bytes, key));
    } else if (req.method === "DELETE") {
      const body = JSON.parse((await readBytes(req, 8192)).toString("utf8")) as AssetRollbackRequest;
      rollbackImageAsset(body, key);
      res.statusCode = 204; res.end();
    } else { res.statusCode = 405; res.end(); }
  } catch (error) {
    req.resume();
    json(error instanceof AssetError ? error.status : 400, { error: error instanceof Error ? error.message : String(error) });
  }
}
