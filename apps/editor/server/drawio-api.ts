// SPIKE: local Draw.io webapp, custom shape libraries and .drawio.svg diagram files.
// The webapp is a separate static folder (never bundled into the Editor build) served under /drawio/.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { commitFile, decodeUtf8, textRevision } from "@ieumdoc/file-commit";
import { DRAWIO_SVG, type DrawioFile, type DrawioInfo, type DrawioWriteRequest, type DrawioWriteResponse } from "../shared/drawio-protocol.ts";
import { MAX_ASSET_BYTES } from "../shared/asset-policy.ts";
import { resolveDocumentPath, resolveMediaPath } from "./document-path.ts";
import { accessPath, inside, fileErrorMessage, fileErrorStatus, type FileAccess } from "./file-access.ts";
import { readRequestBody } from "./request-body.ts";
import { requestQuery } from "./request-query.ts";

export type DrawioOptions = { webappDir?: string; librariesDir?: string };

/**
 * The Draw.io webapp runs same-origin in the Editor's frame. Its policy still forbids any
 * network peer other than this Host, so diagrams cannot reach diagrams.net or other services.
 */
export const DRAWIO_CONTENT_SECURITY_POLICY = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self' data:", "connect-src 'self'", "worker-src 'self' blob:",
  "frame-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'none'", "frame-ancestors 'self'",
].join("; ");

const SVG_ROOT = /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[^]*?-->\s*)*(?:<!DOCTYPE\s+svg\b[^<>\[\]]*>\s*)?(?:<!--[^]*?-->\s*)*<svg(?:\s|\/?>)/i;
const LIBRARY = /^[^/\\\0]+\.xml$/i;

const STATIC_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".wasm": "application/wasm",
};

/** A regular file inside the fixed folder, including through symlinks; otherwise undefined. */
function staticFile(folder: string, relative: string): string | undefined {
  if (relative.includes("\0")) return undefined;
  try {
    const root = fs.realpathSync(folder);
    const real = fs.realpathSync(path.resolve(root, `.${relative}`));
    return inside(root, real) && fs.statSync(real).isFile() ? real : undefined;
  } catch { return undefined; }
}

class DrawioError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function libraries(options: DrawioOptions): DrawioInfo["libraries"] {
  if (!options.librariesDir) return [];
  return fs.readdirSync(options.librariesDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && LIBRARY.test(entry.name)).map(entry => entry.name).sort()
    .map(name => ({ title: name.replace(/\.xml$/i, ""), url: `/drawio-libraries/${encodeURIComponent(name)}` }));
}

function assertDiagram(svg: unknown): asserts svg is string {
  if (typeof svg !== "string" || !SVG_ROOT.test(svg)) throw new DrawioError("Draw.io must save an SVG image.");
  if (Buffer.byteLength(svg) > MAX_ASSET_BYTES) throw new DrawioError("Diagram exceeds the 10 MiB limit.", 413);
  // Editable SVG keeps the diagram in the root `content` attribute; without it the file is a plain picture.
  if (!/<svg[^>]*\scontent="[^"]*mxfile/i.test(svg.slice(0, 64 * 1024 * 1024))) throw new DrawioError("The SVG has no embedded Draw.io diagram.");
}

function diagramFile(relative: unknown, documentPath: string, access: FileAccess): string {
  if (typeof relative !== "string" || !relative.startsWith("./") || !DRAWIO_SVG.test(relative)) throw new DrawioError("Only ./…/*.drawio.svg files beside the document can be edited.");
  return resolveMediaPath(relative.slice(2).split("/").map(encodeURIComponent).join("/"), documentPath, access);
}

export function readDiagram(documentPath: string, relative: string, access: FileAccess): DrawioFile {
  const document = resolveDocumentPath(documentPath, access);
  const svg = decodeUtf8(fs.readFileSync(accessPath(diagramFile(relative, document, access), access)));
  return { svg, revision: textRevision(svg) };
}

/** Create a new diagram in assets/, or replace an existing one only at the revision the Editor read. */
export function writeDiagram(request: DrawioWriteRequest, access: FileAccess): DrawioWriteResponse {
  if (typeof request?.documentPath !== "string" || !request.documentPath.trim()) throw new DrawioError("A document locator is required.");
  const document = resolveDocumentPath(request.documentPath, access);
  assertDiagram(request.svg);
  if (request.path !== undefined) {
    if (typeof request.revision !== "string") throw new DrawioError("A diagram revision is required to replace it.");
    const file = diagramFile(request.path, document, access);
    commitFile(accessPath(file, access), request.svg, request.revision);
    return { path: request.path, revision: textRevision(request.svg) };
  }
  const directory = accessPath(path.join(path.dirname(document), "assets"), access, true);
  try { fs.mkdirSync(directory); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  if (!fs.lstatSync(directory).isDirectory()) throw new DrawioError("The assets directory must be a real directory.");
  for (let attempt = 0; attempt < 5; attempt++) {
    const name = `diagram-${randomBytes(4).toString("hex")}.drawio.svg`;
    try {
      fs.writeFileSync(accessPath(path.join(directory, name), access, true), request.svg, { encoding: "utf8", flag: "wx" });
      return { path: `./assets/${name}`, revision: textRevision(request.svg) };
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  throw new DrawioError("Could not allocate a unique diagram filename.");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/** Static webapp/library files. Returns false when the path is not a Draw.io route. */
export async function serveDrawioStatic(req: IncomingMessage, res: ServerResponse, pathname: string, options: DrawioOptions): Promise<boolean> {
  const webapp = pathname === "/drawio" || pathname.startsWith("/drawio/");
  const library = pathname.startsWith("/drawio-libraries/");
  if (!webapp && !library) return false;
  const root = webapp ? options.webappDir : options.librariesDir;
  const relative = webapp ? pathname.slice("/drawio".length) || "/" : `/${pathname.slice("/drawio-libraries/".length)}`;
  if (library && !LIBRARY.test(decodeURIComponent(relative.slice(1)))) { res.statusCode = 404; res.end(); return true; }
  if (!root) { res.statusCode = 404; res.end(); return true; }
  const file = staticFile(root, decodeURIComponent(relative.endsWith("/") ? `${relative}index.html` : relative));
  res.setHeader("Content-Security-Policy", DRAWIO_CONTENT_SECURITY_POLICY);
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!file) { res.statusCode = 404; res.end(); return true; }
  res.statusCode = 200;
  res.setHeader("Content-Type", library ? "application/xml; charset=utf-8" : STATIC_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
  res.end(req.method === "HEAD" ? undefined : fs.readFileSync(file));
  return true;
}

export async function handleDrawioRequest(req: IncomingMessage, res: ServerResponse, access: FileAccess, options: DrawioOptions): Promise<void> {
  try {
    const query = requestQuery(req.url ?? "");
    if (req.method === "GET" && !query.has("path")) {
      sendJson(res, 200, { available: !!options.webappDir, libraries: libraries(options) } satisfies DrawioInfo);
    } else if (req.method === "GET") {
      sendJson(res, 200, readDiagram(query.get("documentPath") ?? "", query.get("path") ?? "", access));
    } else if (req.method === "POST") {
      const body = JSON.parse(decodeUtf8(await readRequestBody(req, MAX_ASSET_BYTES * 2))) as DrawioWriteRequest;
      sendJson(res, 200, writeDiagram(body, access));
    } else { res.statusCode = 405; res.end(); }
  } catch (error) {
    req.resume();
    const status = error instanceof DrawioError ? error.status : (error as Error)?.name === "FileChangedError" ? 409 : fileErrorStatus(error);
    sendJson(res, status, { error: fileErrorMessage(error, access) });
  }
}
