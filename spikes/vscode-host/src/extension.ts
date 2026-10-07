// Spike: IeumDoc Editor in VS Code. Not product code.
// The webview runs the unchanged Editor bundle; a fetch shim turns its /api/* calls into
// messages, answered here with the existing Host functions. Two provider models are compared:
// - "text"   CustomTextEditorProvider: the VS Code TextDocument is the buffer IeumDoc reads and saves into.
// - "custom" CustomEditorProvider: IeumDoc owns its document; the Host reads and writes the file.
// IEUMDOC_SPIKE_PROVIDER picks the one the driver opens.
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import * as vscode from "vscode";
import {
  commitDocumentSave,
  DocumentConflictError,
  documentRevision,
  loadDocumentFile,
  previewDocumentFile,
  saveDocumentFile,
} from "../../../apps/editor/server/document-api.ts";
import { applyBlockSource, readModel, validateFigureRequest } from "../../../apps/editor/server/document-replay.ts";

type Request = { type: "request"; id: number; method: string; route: string; query: Record<string, string>; body?: string };
type WebviewMessage = Request | { type: "dirty"; dirty: boolean } | { type: "saved"; ok: boolean; error?: string } | { type: "editor-saved" };
type Reply = { status: number; body: unknown };

const TEXT_VIEW = "ieumdoc.markdown";
const CUSTOM_VIEW = "ieumdoc.markdownFile";
const viewType = () => process.env.IEUMDOC_SPIKE_PROVIDER === "custom" ? CUSTOM_VIEW : TEXT_VIEW;

function log(event: string, data: Record<string, unknown> = {}): void {
  const file = process.env.IEUMDOC_SPIKE_LOG;
  if (file) appendFileSync(file, `${JSON.stringify({ at: Date.now(), event, ...data })}\n`);
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.window.registerCustomEditorProvider(TEXT_VIEW, {
    resolveCustomTextEditor: (document, panel) => resolveText(context, document, panel),
  }));
  context.subscriptions.push(vscode.window.registerCustomEditorProvider(CUSTOM_VIEW, new FileProvider(context)));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.languageId !== "markdown" || event.contentChanges.length === 0) return;
    log("text-change", { reason: event.reason ?? null, dirty: event.document.isDirty, changes: event.contentChanges.length });
  }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => {
    log("did-save", { file: path.basename(document.uri.fsPath), text: document.getText() });
  }));
  // Driver-only: IeumDoc and the default text editor on the same file, side by side.
  context.subscriptions.push(vscode.commands.registerCommand("ieumdocSpike.openBoth", async () => {
    const uri = vscode.Uri.file(process.env.IEUMDOC_SPIKE_OPEN ?? "");
    await vscode.commands.executeCommand("vscode.openWith", uri, viewType(), vscode.ViewColumn.One);
    await vscode.commands.executeCommand("vscode.openWith", uri, "default", vscode.ViewColumn.Two);
  }));
  // Driver-only stand-in for Prettier's markdown style: `*emphasis*` becomes `_emphasis_`.
  if (process.env.IEUMDOC_SPIKE_FORMATTER === "emphasis") {
    context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider("markdown", {
      provideDocumentFormattingEdits(document) {
        const text = document.getText();
        const formatted = text.replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, "_$1_");
        log("formatter-ran", { changed: formatted !== text });
        return formatted === text ? [] : [vscode.TextEdit.replace(new vscode.Range(0, 0, document.lineCount, 0), formatted)];
      },
    }));
  }
  const open = process.env.IEUMDOC_SPIKE_OPEN;
  if (open) void vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(open), viewType());
  log("activated", { provider: viewType() });
}

function errorReply(error: unknown): Reply {
  return { status: error instanceof DocumentConflictError ? 409 : 400, body: { error: error instanceof Error ? error.message : String(error) } };
}

/** Requests both providers answer the same way. */
function shared(filePath: string, request: Request, body: any): Reply | undefined {
  switch (`${request.method} ${request.route}`) {
    case "POST document-source": return { status: 200, body: previewDocumentFile(filePath, body) };
    case "POST block-source": return { status: 200, body: applyBlockSource(body) };
    case "POST figure-validation": return { status: 200, body: { error: validateFigureRequest(body) ?? null } };
    default: return undefined;
  }
}

const notAvailable = (request: Request): Reply =>
  ({ status: 404, body: { error: `${request.method} ${request.route} is not available in the VS Code spike` } });

// --- CustomTextEditorProvider: the TextDocument is the buffer -------------------------------

function resolveText(context: vscode.ExtensionContext, document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
  setUp(context, panel);
  panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
    if (message.type !== "request") return;
    const reply = await handleText(document, message).catch(errorReply);
    log("request", { method: message.method, route: message.route, status: reply.status });
    void panel.webview.postMessage({ type: "response", id: message.id, ...reply });
  });
  panel.onDidDispose(() => log("panel-disposed", { dirty: document.isDirty }));
}

async function handleText(document: vscode.TextDocument, request: Request): Promise<Reply> {
  const body = request.body ? JSON.parse(request.body) : undefined;
  const filePath = document.uri.fsPath;
  switch (`${request.method} ${request.route}`) {
    case "GET document": {
      const source = document.getText();
      return { status: 200, body: { path: filePath, source, ...readModel(source), revision: documentRevision(source) } };
    }
    case "POST document": {
      let markdown = "";
      const saved = commitDocumentSave(() => document.getText(), (next) => { markdown = next; }, { ...body, path: undefined });
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), markdown);
      await vscode.workspace.applyEdit(edit);
      const written = await document.save();
      const after = document.getText();
      log("ieumdoc-save", { written, dirty: document.isDirty, formatted: after !== markdown, markdown, after });
      return { status: 200, body: { path: filePath, document: saved.document, revision: saved.revision, writeError: saved.writeError } };
    }
    default:
      return shared(filePath, request, body) ?? notAvailable(request);
  }
}

// --- CustomEditorProvider: IeumDoc owns the document, the Host owns the file ----------------

class FileDocument implements vscode.CustomDocument {
  panel?: vscode.WebviewPanel;
  render?: () => void;
  savedBy?: (result: { ok: boolean; error?: string }) => void;
  constructor(readonly uri: vscode.Uri) {}
  dispose(): void {}
}

class FileProvider implements vscode.CustomEditorProvider<FileDocument> {
  private readonly changes = new vscode.EventEmitter<vscode.CustomDocumentContentChangeEvent<FileDocument>>();
  readonly onDidChangeCustomDocument = this.changes.event;
  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): FileDocument {
    return new FileDocument(uri);
  }

  resolveCustomEditor(document: FileDocument, panel: vscode.WebviewPanel): void {
    document.panel = panel;
    document.render = () => setUp(this.context, panel);
    document.render();
    panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      if (message.type === "dirty") {
        log("ieumdoc-dirty", { dirty: message.dirty });
        // A content change marks the editor dirty; only a VS Code save, revert or close clears it.
        if (message.dirty) this.changes.fire({ document });
        return;
      }
      if (message.type === "saved") {
        document.savedBy?.(message);
        document.savedBy = undefined;
        return;
      }
      if (message.type === "editor-saved") {
        // The Editor's own Save button wrote the file; let VS Code record the save so the tab is clean.
        log("editor-saved");
        if (panel.active) void vscode.commands.executeCommand("workbench.action.files.save");
        return;
      }
      const reply = await this.handle(document, message).catch(errorReply);
      log("request", { method: message.method, route: message.route, status: reply.status });
      void panel.webview.postMessage({ type: "response", id: message.id, ...reply });
    });
    panel.onDidDispose(() => log("panel-disposed"));
  }

  private async handle(document: FileDocument, request: Request): Promise<Reply> {
    const body = request.body ? JSON.parse(request.body) : undefined;
    const filePath = document.uri.fsPath;
    switch (`${request.method} ${request.route}`) {
      case "GET document":
        return { status: 200, body: loadDocumentFile(filePath) };
      case "POST document": {
        const saved = saveDocumentFile(filePath, body);
        log("ieumdoc-save", { markdown: saved.markdown });
        return { status: 200, body: { path: filePath, document: saved.document, revision: saved.revision, writeError: saved.writeError } };
      }
      default:
        return shared(filePath, request, body) ?? notAvailable(request);
    }
  }

  async saveCustomDocument(document: FileDocument): Promise<void> {
    log("vscode-save-requested");
    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      document.savedBy = resolve;
      void document.panel?.webview.postMessage({ type: "save" });
    });
    log("vscode-save-finished", result);
    if (!result.ok) throw new Error(result.error ?? "IeumDoc could not save");
  }

  saveCustomDocumentAs(): Promise<void> {
    throw new Error("Save As is not part of the spike");
  }

  async revertCustomDocument(document: FileDocument): Promise<void> {
    // A fresh Editor session opened from the file on disk.
    log("vscode-revert");
    document.render?.();
  }

  async backupCustomDocument(_document: FileDocument, context: vscode.CustomDocumentBackupContext): Promise<vscode.CustomDocumentBackup> {
    // Spike: hot-exit backup of an IeumDoc session is not explored.
    log("vscode-backup-requested");
    return { id: context.destination.toString(), delete: () => {} };
  }
}

// --- Webview --------------------------------------------------------------------------------

function setUp(context: vscode.ExtensionContext, panel: vscode.WebviewPanel): void {
  const editorDir = vscode.Uri.joinPath(context.extensionUri, "media", "editor");
  panel.webview.options = { enableScripts: true, localResourceRoots: [editorDir] };
  panel.webview.html = html(panel.webview, editorDir);
}

function html(webview: vscode.Webview, editorDir: vscode.Uri): string {
  const nonce = Math.random().toString(36).slice(2);
  const built = readFileSync(vscode.Uri.joinPath(editorDir, "index.html").fsPath, "utf8")
    .replaceAll("./assets/", `${webview.asWebviewUri(vscode.Uri.joinPath(editorDir, "assets"))}/`);
  const csp = [
    "default-src 'none'",
    `script-src ${webview.cspSource} 'nonce-${nonce}'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
  ].join("; ");
  return built.replace("<head>", `<head>
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <script nonce="${nonce}">${SHIM}</script>`);
}

// Spike-only glue around the unchanged Editor: the /api/* transport, the Editor's dirty state
// read from its status line, and VS Code save/revert driven through the Editor's own Save.
const SHIM = `
(() => {
  const vscode = acquireVsCodeApi();
  const pending = new Map();
  let next = 0;
  let hostSave = false;
  let inflightSave;
  const status = () => document.querySelector('[data-testid="status"]')?.textContent ?? "";
  window.addEventListener("message", async (event) => {
    const message = event.data;
    if (message?.type === "response") {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    } else if (message?.type === "save") {
      if (inflightSave) {
        const reply = await inflightSave;
        vscode.postMessage({ type: "saved", ok: reply.status === 200, error: reply.body?.error });
      } else if (status() === "Unsaved changes") {
        hostSave = true;
        document.querySelector('[data-testid="save"]').click();
      } else {
        vscode.postMessage({ type: "saved", ok: true });
      }
    }
  });
  let dirty = false;
  new MutationObserver(() => {
    const now = status() === "Unsaved changes";
    if (now !== dirty) vscode.postMessage({ type: "dirty", dirty: (dirty = now) });
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const at = url.pathname.indexOf("/api/");
    if (at < 0) return realFetch(input, init);
    const id = ++next;
    const route = url.pathname.slice(at + 5);
    const method = init.method ?? "GET";
    const request = new Promise((resolve) => {
      pending.set(id, resolve);
      vscode.postMessage({ type: "request", id, method, route,
        query: Object.fromEntries(url.searchParams), body: typeof init.body === "string" ? init.body : undefined });
    });
    const save = method === "POST" && route === "document";
    if (save) inflightSave = request;
    const reply = await request;
    if (save) {
      inflightSave = undefined;
      if (hostSave) vscode.postMessage({ type: "saved", ok: reply.status === 200, error: reply.body?.error });
      else if (reply.status === 200) vscode.postMessage({ type: "editor-saved" });
      hostSave = false;
    }
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
  };
})();`;
