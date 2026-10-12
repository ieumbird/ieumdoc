// The `ieumdoc://app` origin: the Editor's production build and the existing local Host handlers,
// answered in-process. No TCP port is opened. Host paths, document rules and Save stay in
// apps/editor/server and Core; this file only turns fetch Requests into the Node shapes they read.
import { randomBytes } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { handleAssetRequest } from "../../editor/server/asset-api.ts";
import { handleDocumentRequest } from "../../editor/server/document-api.ts";

export const SCHEME = "ieumdoc";
export const ORIGIN = `${SCHEME}://app`;

/** The Host routes the Vite dev server forwards, with the same handlers. */
const DOCUMENT_ROUTES = new Set(["/api/document", "/api/folder", "/api/folder-browse", "/api/folder-places", "/api/document-source", "/api/block-source", "/api/figure-validation"]);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};

/**
 * Only this origin's scripts and styles run. Inline styles are the editor engine's and KaTeX's;
 * document images can be data/blob URLs while pasted. Nothing frames, embeds or submits elsewhere.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:",
  "font-src 'self' data:", "connect-src 'self'", "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'",
].join("; ");

const SECURITY_HEADERS = { "Content-Security-Policy": CONTENT_SECURITY_POLICY, "X-Content-Type-Options": "nosniff" };

type NodeResponse = { statusCode: number; setHeader(name: string, value: string): void; end(data?: string | Buffer): void };
type Handler = (req: IncomingMessage, res: ServerResponse, notFound: () => void) => Promise<void> | void;

/** A fetch Request in the Node request/response shapes the existing Host handlers read and write. */
export async function callNodeHandler(request: Request, url: URL, handler: Handler): Promise<Response> {
  const body = request.method === "GET" || request.method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
  const req = Readable.from(body.length ? [body] : []) as unknown as IncomingMessage;
  req.method = request.method;
  req.url = url.pathname + url.search;
  req.headers = Object.fromEntries([...request.headers].map(([name, value]) => [name.toLowerCase(), value]));
  req.headers["content-length"] ??= String(body.length);
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...SECURITY_HEADERS };
    const res: NodeResponse = {
      statusCode: 200,
      setHeader(name, value) { headers[name] = value; },
      end(data) {
        const empty = data === undefined || this.statusCode === 204 || this.statusCode === 304;
        resolve(new Response(empty ? null : new Uint8Array(Buffer.from(data)), { status: this.statusCode, headers }));
      },
    };
    Promise.resolve(handler(req, res as unknown as ServerResponse, () => resolve(notFound()))).catch(reject);
  });
}

const notFound = () => new Response(null, { status: 404, headers: SECURITY_HEADERS });

/** A file of the Editor build; nothing outside its folder, including through symlinks. */
export function serveEditorFile(editorDir: string, pathname: string): Response {
  let relative: string;
  try {
    relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    return notFound();
  }
  if (relative.includes("\0")) return notFound();
  const root = realpathSync(editorDir);
  const file = path.resolve(root, `.${relative}`);
  try {
    const real = realpathSync(file);
    const inside = path.relative(root, real);
    if (!inside || inside.startsWith("..") || path.isAbsolute(inside) || !statSync(real).isFile()) return notFound();
    return new Response(new Uint8Array(readFileSync(real)), {
      headers: { ...SECURITY_HEADERS, "Content-Type": TYPES[path.extname(real).toLowerCase()] ?? "application/octet-stream" },
    });
  } catch {
    return notFound();
  }
}

/**
 * The protocol handler. `initialDocument` answers the Editor's first request, which names no
 * document; the development server's default file is not part of the app.
 */
export function createProtocolHandler(editorDir: string, initialDocument: string): (request: Request) => Promise<Response> {
  // Lives as long as this process, as the development server's key does.
  const assetSigningKey = randomBytes(32);
  return async (request) => {
    const url = new URL(request.url);
    if (url.protocol !== `${SCHEME}:` || url.host !== "app") return notFound();
    if (url.pathname === "/api/asset") {
      return callNodeHandler(request, url, (req, res) => handleAssetRequest(req, res, assetSigningKey));
    }
    if (DOCUMENT_ROUTES.has(url.pathname) || url.pathname.startsWith("/document/")) {
      if (url.pathname === "/api/document" && request.method === "GET" && !url.searchParams.get("path")) url.searchParams.set("path", initialDocument);
      return callNodeHandler(request, url, handleDocumentRequest);
    }
    if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: SECURITY_HEADERS });
    return serveEditorFile(editorDir, url.pathname);
  };
}
