import { randomBytes } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import path from "node:path";
import { handleAssetRequest } from "./asset-api.ts";
import { handleDocumentRequest } from "./document-api.ts";
import { SECURITY_HEADERS, serveEditorFile } from "./editor-static.ts";
import { RootAccess } from "./file-access.ts";
import { requestQuery } from "./request-query.ts";

export const MAX_JSON_BYTES = 32 * 1024 * 1024;
const DOCUMENT_ROUTES = new Set(["/api/file-preview", "/api/document", "/api/folder", "/api/folder-browse", "/api/folder-places",
  "/api/document-source", "/api/figure-validation"]);

export type HttpHostOptions = {
  roots: readonly string[];
  editorDir: string;
  port?: number;
  host?: string;
  publicOrigin?: string;
};

const loopback = (host: string) => host === "::1" || /^127\./.test(host);
const authority = (host: string, port: number) => `${host.includes(":") ? `[${host}]` : host}:${port}`;

export function publicOrigin(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("--public-origin must be an http(s) origin without a path, credentials, query or fragment.");
  }
  return url.origin;
}

function json(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: message }));
}

/** The only TCP Host: fixed roots and production assets, without a document/session store. */
export async function startHttpHost(options: HttpHostOptions) {
  const access = new RootAccess(options.roots);
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 5180;
  if (!isIP(host)) throw new Error("--host must be an IP address (default: 127.0.0.1).");
  // Port zero is for an OS-assigned test listener; the public CLI accepts only 1–65535.
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port.");
  const external = options.publicOrigin === undefined ? undefined : publicOrigin(options.publicOrigin);
  if (!loopback(host) && !external) throw new Error("Non-loopback binding requires --public-origin and an access-controlled proxy/network.");
  const editorDir = realpathSync(options.editorDir);
  if (!statSync(path.join(editorDir, "index.html")).isFile()) throw new Error("The production Editor build is missing.");
  const key = randomBytes(32);
  const origins = new Set<string>();
  const authorities = new Set<string>();

  const respond = async (req: IncomingMessage, res: ServerResponse) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    // Drain rejected bodies without buffering. Destroying at response finish can lose the
    // 413 response (TCP reset on Windows); the server's request timeout still bounds input.
    const hosts = req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index]!.toLowerCase() === "host");
    if (hosts.length !== 1 || !authorities.has(req.headers.host?.toLowerCase() ?? "")) return json(res, 403, "Host is not allowed.");
    if (!req.url?.startsWith("/") || req.url.startsWith("//")) return json(res, 400, "Invalid request target.");
    let url: URL;
    try {
      const query = requestQuery(req.url);
      url = new URL(req.url, "http://localhost");
      const decoded = decodeURIComponent(url.pathname);
      if (decoded.includes("\0") || decoded.includes("\\") || /%(?:2e|2f|5c|00)/i.test(decoded)) throw new Error();
      for (const name of new Set(query.keys())) if (query.getAll(name).length !== 1) throw new Error();
    } catch { return json(res, 400, "Invalid request path."); }
    const api = url.pathname.startsWith("/api/");
    const media = url.pathname.startsWith("/document/");
    const writing = req.method === "POST" || req.method === "PUT" || req.method === "DELETE";
    const origin = req.headers.origin;
    if ((origin !== undefined && !origins.has(origin)) || (writing && !origin) ||
        ((api || media || writing) && req.headers["sec-fetch-site"] === "cross-site")) {
      return json(res, 403, "Request origin is not allowed.");
    }
    if ((req.method === "GET" || req.method === "HEAD") && (Number(req.headers["content-length"]) > 0 || req.headers["transfer-encoding"])) {
      return json(res, 400, "This request must not have a body.");
    }
    if (writing && (url.pathname !== "/api/asset" || req.method === "DELETE") && !/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] ?? "")) {
      return json(res, 415, "Expected application/json.");
    }
    if (media) {
      // User-controlled SVG/HTML must never execute with the application's origin authority.
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    }
    if (url.pathname === "/api/asset") return handleAssetRequest(req, res, key, access);
    if (DOCUMENT_ROUTES.has(url.pathname) || media) {
      return handleDocumentRequest(req, res, () => json(res, 404, "Not found."), access, MAX_JSON_BYTES);
    }
    if (api) return json(res, 404, "Not found.");
    if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, "Method not allowed.");
    const response = serveEditorFile(editorDir, url.pathname);
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(req.method === "HEAD" ? undefined : Buffer.from(await response.arrayBuffer()));
  };

  const server = createServer({ maxHeaderSize: 16 * 1024, headersTimeout: 15_000, requestTimeout: 60_000,
    keepAliveTimeout: 5_000 }, (req, res) => {
    void respond(req, res).catch(() => {
      if (!res.headersSent) json(res, 500, "The Host could not complete this request.");
      else res.destroy();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => { server.off("error", reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("The HTTP listener has no address.");
  if (loopback(host)) {
    origins.add(new URL(`http://${authority(host, address.port)}`).origin);
    origins.add(new URL(`http://localhost:${address.port}`).origin);
  } else {
    // A same-machine proxy may rewrite Host to the loopback upstream address.
    origins.add(new URL(`http://127.0.0.1:${address.port}`).origin);
    origins.add(new URL(`http://[::1]:${address.port}`).origin);
  }
  if (external) origins.add(external);
  for (const origin of origins) authorities.add(new URL(origin).host.toLowerCase());
  return {
    server,
    roots: access.roots,
    url: external ?? `http://${authority(host, address.port)}`,
    async close(): Promise<void> {
      if (!server.listening) return;
      const forced = setTimeout(() => server.closeAllConnections(), 5_000);
      forced.unref();
      try { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
      finally { clearTimeout(forced); }
    },
  };
}
