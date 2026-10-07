// Spike: the unchanged Vite Editor and the existing local Host handlers in a thin Electron shell.
// No TCP port: an in-process custom protocol serves the Editor and answers its /api/* and
// /document/* requests through the same Node handlers the dev server uses. Not product code.
import { randomBytes } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { app, BrowserWindow, dialog, Menu, protocol, shell } from "electron";
import { handleAssetRequest } from "../../../apps/editor/server/asset-api.ts";
import { handleDocumentRequest } from "../../../apps/editor/server/document-api.ts";

const SCHEME = "ieumdoc";
const ORIGIN = `${SCHEME}://app`;
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

const appRoot = path.join(__dirname, "..", "app");
const editorDir = path.join(appRoot, "editor");
// Lives as long as this process, as the dev server's key does.
const assetSigningKey = randomBytes(32);
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};

function log(event: string, data: Record<string, unknown> = {}): void {
  const file = process.env.IEUMDOC_SPIKE_LOG;
  if (file) appendFileSync(file, `${JSON.stringify({ at: Date.now(), event, ...data })}\n`);
}

/** The document the window opens first: a `.md` argument (drag onto the exe), else a writable sample copy. */
function initialDocument(): string {
  const argument = process.argv.slice(1).find((value) => value.toLowerCase().endsWith(".md") && existsSync(value));
  if (argument) return path.resolve(argument);
  const sampleDir = path.join(app.getPath("userData"), "sample");
  const sample = path.join(sampleDir, "technical-document.md");
  if (!existsSync(sample)) {
    mkdirSync(sampleDir, { recursive: true });
    for (const file of ["technical-document.md", "diagram.svg"]) copyFileSync(path.join(appRoot, "sample", file), path.join(sampleDir, file));
  }
  return sample;
}

type NodeResponse = { statusCode: number; setHeader(name: string, value: string): void; end(data?: string | Buffer): void };

/** A fetch Request in the Node request/response shapes the existing Host handlers read and write. */
async function callNodeHandler(request: Request, url: URL,
  run: (req: any, res: NodeResponse, notFound: () => void) => Promise<void> | void): Promise<Response> {
  const body = request.method === "GET" || request.method === "HEAD" ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
  const req = Readable.from(body.length ? [body] : []) as any;
  req.method = request.method;
  req.url = url.pathname + url.search;
  req.headers = Object.fromEntries([...request.headers].map(([name, value]) => [name.toLowerCase(), value]));
  req.headers["content-length"] ??= String(body.length);
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    const res: NodeResponse = {
      statusCode: 200,
      setHeader(name, value) { headers[name] = value; },
      end(data) {
        resolve(new Response(data === undefined || this.statusCode === 204 ? null : new Uint8Array(Buffer.from(data)), { status: this.statusCode, headers }));
      },
    };
    Promise.resolve(run(req, res, () => resolve(new Response(null, { status: 404 })))).catch(reject);
  });
}

function serveEditorFile(pathname: string): Response {
  const file = path.normalize(path.join(editorDir, pathname === "/" ? "index.html" : decodeURIComponent(pathname)));
  if (path.relative(editorDir, file).startsWith("..")) return new Response(null, { status: 404 });
  try {
    return new Response(new Uint8Array(readFileSync(file)), { headers: { "Content-Type": TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream" } });
  } catch {
    return new Response(null, { status: 404 });
  }
}

function handleProtocol(initial: string) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.host !== "app") return new Response(null, { status: 404 });
    if (url.pathname === "/api/asset") {
      return callNodeHandler(request, url, (req, res) => handleAssetRequest(req, res, assetSigningKey));
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/document/")) {
      // The Editor's first load names no document; the dev server's default file is not in the exe.
      if (url.pathname === "/api/document" && request.method === "GET" && !url.searchParams.has("path")) url.searchParams.set("path", initial);
      const response = await callNodeHandler(request, url, (req, res, notFound) => handleDocumentRequest(req, res, notFound));
      log("request", { method: request.method, route: url.pathname, status: response.status });
      return response;
    }
    return serveEditorFile(url.pathname);
  };
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1400, height: 900, title: "IeumDoc Spike",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Unsaved edits: the Editor's beforeunload asks; Electron needs the shell to show the question.
  window.webContents.on("will-prevent-unload", (event) => {
    const answer = process.env.IEUMDOC_SPIKE_UNLOAD_ANSWER;
    const leave = answer ? answer === "leave" : dialog.showMessageBoxSync(window, {
      type: "warning", buttons: ["Discard changes and close", "Keep editing"], defaultId: 1, cancelId: 1,
      message: "This document has unsaved changes.", detail: "Closing discards them. Keep editing to Save first.",
    }) === 0;
    log("unload-question", { leave });
    if (leave) event.preventDefault();
  });
  // The window shows only the Editor; links leave through the system browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ORIGIN)) event.preventDefault();
  });
  void window.loadURL(`${ORIGIN}/index.html`);
}

// No application menu: its Reload and DevTools shortcuts are not part of the Editor.
Menu.setApplicationMenu(null);
app.whenReady().then(() => {
  const initial = initialDocument();
  protocol.handle(SCHEME, handleProtocol(initial));
  log("ready", { initial });
  createWindow();
});
app.on("window-all-closed", () => app.quit());
