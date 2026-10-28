// The `ieumdoc://app` origin: the Editor's production build and the existing local Host handlers,
// answered in-process. No TCP port is opened. Host paths, document rules and Save stay in
// apps/editor/server and Core; this file only turns fetch Requests into the Node shapes they read.
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { SECURITY_HEADERS, serveEditorFile } from "../../editor/server/editor-static.ts";
import { LOCAL_FILE_ACCESS } from "../../editor/server/file-access.ts";
export { CONTENT_SECURITY_POLICY, serveEditorFile } from "../../editor/server/editor-static.ts";
import { handleAssetRequest } from "../../editor/server/asset-api.ts";
import { handleDocumentRequest } from "../../editor/server/document-api.ts";
import { requestQuery } from "../../editor/server/request-query.ts";
import type { DocumentStartResponse, SampleAvailability } from "../../editor/shared/document-protocol.ts";

export const SCHEME = "ieumdoc";
export const ORIGIN = `${SCHEME}://app`;

/** The Host routes the Vite dev server forwards, with the same handlers. */
const DOCUMENT_ROUTES = new Set(["/api/file", "/api/bibliography", "/api/file-preview", "/api/document", "/api/folder", "/api/folder-browse", "/api/folder-places", "/api/document-source", "/api/figure-validation"]);

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

/** What the Editor's first request, which names no document, opens: a document, or none. */
export type FirstDocument = { document?: string } & SampleAvailability;

/**
 * The protocol handler. `first` answers the Editor's first request: the document the app was
 * started with or, without one, a start without a document that offers the sample. The
 * development server's default file is not part of the app.
 */
export function createProtocolHandler(editorDir: string, first: FirstDocument, trashItem: (file: string) => Promise<void> = async () => { throw new Error("OS trash is unavailable."); }, onListedRoot?: (root: string) => void): (request: Request) => Promise<Response> {
  // Lives as long as this process, as the development server's key does.
  const assetSigningKey = randomBytes(32);
  const sampleAvailability: SampleAvailability = { samples: first.samples, sampleProblem: first.sampleProblem };
  return async (request) => {
    const url = new URL(request.url);
    if (url.protocol !== `${SCHEME}:` || url.host !== "app") return notFound();
    let query: URLSearchParams;
    try { query = requestQuery(request.url); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: SECURITY_HEADERS }); }
    if (url.pathname === "/api/asset") {
      return callNodeHandler(request, url, (req, res) => handleAssetRequest(req, res, assetSigningKey, LOCAL_FILE_ACCESS));
    }
    if (DOCUMENT_ROUTES.has(url.pathname) || url.pathname.startsWith("/document/")) {
      if (url.pathname === "/api/document" && request.method === "GET" && !query.get("path")) {
        if (!first.document) {
          const start: DocumentStartResponse = { start: true, ...sampleAvailability };
          return new Response(JSON.stringify(start), { headers: { ...SECURITY_HEADERS, "Content-Type": "application/json; charset=utf-8" } });
        }
        url.searchParams.set("path", first.document);
      }
      const response = await callNodeHandler(request, url, (req, res, next) => handleDocumentRequest(req, res, next, LOCAL_FILE_ACCESS, Infinity, trashItem, sampleAvailability));
      if (onListedRoot && url.pathname === "/api/folder" && request.method === "GET" && response.ok) {
        const folder = await response.clone().json() as { root: string; path: string };
        if (folder.root === folder.path) {
          // UNC folders may still be browsed, but never gain the OS-launch capability.
          try { onListedRoot(folder.root); } catch { /* Not an eligible local root. */ }
        }
      }
      return response;
    }
    if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: SECURITY_HEADERS });
    return serveEditorFile(editorDir, url.pathname);
  };
}
