import { useEffect, useRef, useState } from "react";
import type { EditableDocument, FigureContent } from "@ieumdoc/core";
import { DocumentEditor, type DocumentEditorHandle } from "./DocumentEditor.tsx";
import { MessageArea } from "./shell/MessageArea.tsx";
import { NewDialog } from "./shell/NewDialog.tsx";
import { OpenDialog } from "./shell/OpenDialog.tsx";
import { Sidebar } from "./shell/Sidebar.tsx";
import { TopBar, type DocumentView } from "./shell/TopBar.tsx";
import { collectSupportedEdits, isSessionPlaceholder, type OrderItem, type SupportedEdits, type TiptapJSON } from "./tiptap-document.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

const WRITE_BLOCKED_SAVE_HINT = "IeumDoc cannot save this document. See the message below the top bar.";

/** Shown for the whole session of a document Core cannot write as canonical Markdown. */
function writeBlockedMessage(reason: string): string {
  return `Read-only: IeumDoc cannot save this document safely. ${reason} Open Source to inspect or copy the original Markdown. Repair the file in an external editor or with the CLI, then Reload to check it again.`;
}

export function App() {
  const editorRef = useRef<DocumentEditorHandle>(null);
  const [document, setDocument] = useState<EditableDocument | null>(null);
  const [sourceRevision, setSourceRevision] = useState("");
  const sessionBase = useRef<{ source: string; savedEdits?: SupportedEdits } | undefined>(undefined);
  const [openedPath, setOpenedPath] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [newDialog, setNewDialog] = useState(false);
  const [reloadDialog, setReloadDialog] = useState(false);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [equationDraftActive, setEquationDraftActive] = useState(false);
  const [figureDraftActive, setFigureDraftActive] = useState(false);
  const [documentDirty, setDocumentDirty] = useState(false);
  // Unwritable snapshots are read-only. Reload checks the repaired file through Core;
  // writable sessions are validated again on every Save/Source request.
  const [writeError, setWriteError] = useState("");
  const saveHint = writeError ? WRITE_BLOCKED_SAVE_HINT : undefined;
  const draftNotice = equationDraftActive || figureDraftActive
    ? "Save and Source include applied content only. Equation and Figure drafts remain unsaved until Apply."
    : "";
  const [view, setView] = useState<DocumentView>("visual");
  const [sourceMarkdown, setSourceMarkdown] = useState("");
  const [sourcePending, setSourcePending] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  // A pending Source preview belongs to the open document, so it blocks document switches too.
  const busy = status === "Loading…" || status === "Opening…" || status === "Creating…" || status === "Saving…" ||
    sourcePending;
  const switching = status === "Loading…" || status === "Opening…" || status === "Creating…";

  /** Resolves to an error message for a requested path, or "" on success. */
  async function load(requestedPath?: string): Promise<string> {
    setError("");
    setNotice("");
    setStatus(requestedPath ? "Opening…" : "Loading…");
    try {
      const next = await requestDocument("GET", requestedPath);
      setDocument(next.document);
      sessionBase.current = next.source === undefined ? undefined : { source: next.source };
      setWriteError(next.writeError);
      setSourceRevision(next.revision);
      setOpenedPath(next.path);
      setEditorGeneration((value) => value + 1);
      setEquationDraftActive(false);
      setFigureDraftActive(false);
      setView("visual");
      setStatus("Ready");
      return "";
    } catch (cause) {
      const message = messageOf(cause);
      if (!requestedPath) setError(message);
      setStatus(requestedPath ? "Open failed" : "Load failed");
      return message;
    }
  }

  async function openFile(path: string): Promise<string> {
    const requestedPath = path.trim();
    if (!requestedPath) return "Enter a Markdown file path.";
    if (!requestedPath.toLowerCase().endsWith(".md")) return "Only .md files can be opened.";
    if (busy) return "Wait for the current operation to finish.";
    if (editorRef.current?.hasUnsavedChanges()) {
      return "Save or discard the current changes before opening another file.";
    }
    return load(requestedPath);
  }

  async function save(): Promise<void> {
    if (!document || !editorRef.current || !openedPath || busy) return;
    if (writeError) return;
    setError("");
    setNotice("");
    setStatus("Saving…");
    let submitted: TiptapJSON | undefined;
    let payload: SupportedEdits | undefined;
    try {
      submitted = editorRef.current.beginSave();
      payload = collectSupportedEdits(document, submitted);
      const next = await requestDocument("POST", openedPath, { revision: sourceRevision, base: sessionBase.current, ...payload });
      setWriteError(next.writeError);
      setSourceRevision(next.revision);
      if (sessionBase.current) sessionBase.current.savedEdits = payload;
      editorRef.current?.finishSave(true);
      const hasPendingUserState = editorRef.current?.hasUnsavedChanges() ?? false;
      setStatus(hasPendingUserState ? "Saved; newer edits pending" : "Saved");
    } catch (cause) {
      editorRef.current?.finishSave();
      setError(saveErrorMessage(cause, submitted, payload));
      setStatus(cause instanceof SaveConflictError ? "Save conflict" : "Save failed");
    }
  }

  /**
   * Shows the canonical Markdown the current editor state would save as. The Host runs
   * the Save request through Core without writing; any failure keeps the Visual view.
   */
  async function showSource(): Promise<void> {
    if (!document || !editorRef.current || !openedPath || busy) return;
    if (writeError) {
      setSourceMarkdown(sessionBase.current?.source ?? "");
      setView("source");
      return;
    }
    setError("");
    setSourcePending(true);
    try {
      const payload = collectSupportedEdits(document, editorRef.current.getDocument());
      setSourceMarkdown(await requestSource(openedPath, { revision: sourceRevision, base: sessionBase.current, ...payload }));
      setView("source");
    } catch (cause) {
      setError(`Source view unavailable: ${messageOf(cause)}`);
    } finally {
      setSourcePending(false);
    }
  }

  async function createFile(path: string): Promise<string> {
    const requestedPath = path.trim();
    if (!requestedPath) return "Enter a Markdown file path.";
    if (!requestedPath.toLowerCase().endsWith(".md")) return "Only .md files can be created.";
    if (busy) return "Wait for the current operation to finish.";
    if (editorRef.current?.hasUnsavedChanges()) {
      return "Save or discard the current changes before creating another file.";
    }
    setError("");
    setNotice("");
    setStatus("Creating…");
    try {
      const next = await requestDocument("PUT", requestedPath, { path: requestedPath });
      setDocument(next.document);
      sessionBase.current = next.source === undefined ? undefined : { source: next.source };
      setWriteError(next.writeError);
      setSourceRevision(next.revision);
      setOpenedPath(next.path);
      setEditorGeneration((value) => value + 1);
      setEquationDraftActive(false);
      setFigureDraftActive(false);
      setView("visual");
      setStatus("Ready");
      return "";
    } catch (cause) {
      const message = messageOf(cause);
      setError(message);
      setStatus("Create failed");
      return message;
    }
  }

  // Ctrl/Cmd+S is the Save button: same path, same messages. The browser's own page save
  // never applies. Modal dialogs cover the Save button, so the shortcut waits for them too.
  const saveShortcut = useRef<(event: KeyboardEvent) => void>(() => {});
  saveShortcut.current = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey ||
        (event.key.toLowerCase() !== "s" && event.code !== "KeyS")) return;
    event.preventDefault();
    if (openDialog || newDialog || reloadDialog) return;
    void save();
  };
  useEffect(() => {
    // Capture, so inputs inside node views (Equation, Figure, code language) cannot swallow it.
    const listener = (event: KeyboardEvent) => saveShortcut.current(event);
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!editorRef.current?.hasUnsavedChanges() && !busy) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [busy]);

  async function reload(): Promise<void> {
    if (busy || !openedPath) return;
    if (editorRef.current?.hasUnsavedChanges()) {
      setReloadDialog(true);
      return;
    }
    await reloadFromDisk();
  }

  async function reloadFromDisk(): Promise<void> {
    // Keep a modal boundary during the read, so newly typed input cannot race a reload.
    setReloadDialog(true);
    const message = await load(openedPath);
    setReloadDialog(false);
    if (message) setError(message);
  }

  return (
    <div className={`app-shell${sidebarOpen ? "" : " app-shell--collapsed"}`}>
      <Sidebar
        open={sidebarOpen}
        documentPath={openedPath}
        onToggle={() => setSidebarOpen((value) => !value)}
        onOpen={() => setOpenDialog(true)}
        onNew={() => setNewDialog(true)}
      />
      <div className="app-main">
        <div className="app-header">
          <TopBar
            documentPath={openedPath}
            status={status}
            unsaved={documentDirty || equationDraftActive || figureDraftActive}
            writable={!writeError}
            view={view}
            viewDisabled={!document || busy}
            onViewChange={(next) => (next === "source" ? void showSource() : setView("visual"))}
            saveDisabled={!document || busy ||
              Boolean(writeError)}
            saveHint={saveHint}
            onSave={() => void save()}
            onReload={() => void reload()}
            reloadDisabled={!document || busy}
          />
          <MessageArea
            error={error}
            notice={notice}
            draftNotice={draftNotice}
            warning={writeError ? writeBlockedMessage(writeError) : ""}
            onDismissError={() => setError("")}
            onNoticeExpired={() => setNotice("")}
          />
        </div>
        <main className="document-column">
          {view === "source" ? (
            <article className="document source-view" data-testid="source-view" aria-label="Markdown source">
              {writeError ? <p className="block-kind">Original Markdown · read-only</p> : null}
              <pre className="source-view-text">{sourceMarkdown}</pre>
            </article>
          ) : null}
          {/* Hidden, not unmounted, in Source: the one editor state and its history stay intact. */}
          {document ? (
            <div hidden={view === "source"}>
              <DocumentEditor
                key={editorGeneration}
                ref={editorRef}
                document={document}
                readOnly={Boolean(writeError)}
                documentPath={openedPath}
                onEquationDraftChange={setEquationDraftActive}
                onFigureDraftChange={setFigureDraftActive}
                onDirtyChange={setDocumentDirty}
                validateFigure={validateFigure}
                onStructuralReject={(reason) =>
                  setNotice(reason ?? "This change cannot preserve the supported document structure. Your document is unchanged.")
                }
              />
            </div>
          ) : null}
        </main>
      </div>
      <OpenDialog
        open={openDialog}
        initialPath={openedPath}
        busy={busy}
        onOpen={openFile}
        onClose={() => { if (!switching) setOpenDialog(false); }}
      />
      <NewDialog
        open={newDialog}
        busy={busy}
        onCreate={createFile}
        onClose={() => { if (!switching) setNewDialog(false); }}
      />
      <Dialog open={reloadDialog} onOpenChange={(open) => { if (!switching) setReloadDialog(open); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{switching ? "Reloading…" : "Discard local changes?"}</DialogTitle>
            <DialogDescription>Reload replaces your unsaved changes and unapplied drafts with the file on disk. Keep editing to preserve them. Source lets you copy applied content first.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="sm" disabled={switching} onClick={() => setReloadDialog(false)}>Keep editing</Button>
            <Button size="sm" disabled={switching} onClick={() => void reloadFromDisk()}>Discard and reload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type SessionSaveRequest = SupportedEdits & { revision: string; base?: { source: string; savedEdits?: SupportedEdits } };

type DocumentResponse = {
  path: string;
  document: EditableDocument;
  revision: string;
  source?: string;
  /** Why Core cannot write the snapshot as canonical Markdown; "" when it can. */
  writeError: string;
};

class SaveContentError extends Error {
  constructor(message: string, readonly target?: OrderItem) { super(message); }
}

function saveErrorMessage(error: unknown, submitted?: TiptapJSON, edits?: SupportedEdits): string {
  if (!(error instanceof SaveContentError) || !error.target || !submitted) return messageOf(error);
  const target = error.target;
  const nodes = submitted.content ?? [];
  const node = "path" in target
    ? nodes.find(node => String(node.attrs?.sourcePath).split(";").includes(target.path.join(",")))
    : nodes.filter(node => !isSessionPlaceholder(node))[edits?.order?.findIndex(item => "insert" in item && item.insert === target.insert) ?? -1];
  return node ? `Block ${nodes.indexOf(node) + 1} (${node.type}): ${error.message}` : error.message;
}

class SaveConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveConflictError";
  }
}

async function requestDocument(
  method: "GET" | "POST" | "PUT",
  filePath?: string,
  body?: (SessionSaveRequest & { path?: string }) | { path: string },
): Promise<DocumentResponse> {
  const query = method === "GET" && filePath ? `?path=${encodeURIComponent(filePath)}` : "";
  const response = await fetch(`/api/document${query}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify({ path: filePath, ...body }) : undefined,
  });
  const payload = (await response.json()) as {
    path?: string;
    document?: EditableDocument;
    revision?: string;
    source?: string;
    writeError?: string | null;
    error?: string;
    target?: OrderItem;
  };
  if (response.status === 409) {
    throw new SaveConflictError(payload.error ?? "Document changed outside the editor. Reload before saving.");
  }
  if (!response.ok || !payload.document || typeof payload.revision !== "string" || typeof payload.path !== "string") {
    throw new SaveContentError(payload.error ?? `request failed (${response.status})`, payload.target);
  }
  return {
    path: payload.path,
    document: payload.document,
    revision: payload.revision,
    source: payload.source,
    writeError: typeof payload.writeError === "string" ? payload.writeError : "",
  };
}

/** Asks the Host for the canonical Markdown a Save request would write. */
async function requestSource(filePath: string, body: SessionSaveRequest): Promise<string> {
  const response = await fetch("/api/document-source", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: filePath, ...body }),
  });
  const payload = (await response.json()) as { markdown?: string; error?: string };
  if (!response.ok || typeof payload.markdown !== "string") {
    throw new Error(payload.error ?? `request failed (${response.status})`);
  }
  return payload.markdown;
}

/** Asks the Host to run Core's persistent Figure validation. */
async function validateFigure(figure: FigureContent): Promise<string | undefined> {
  const response = await fetch("/api/figure-validation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(figure),
  });
  const payload = (await response.json()) as { error?: string | null };
  if (!response.ok) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload.error ?? undefined;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
