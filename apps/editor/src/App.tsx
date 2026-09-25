import { useEffect, useRef, useState } from "react";
import type { EditableDocument, FigureContent } from "@ieumdoc/core";
import { DocumentEditor, type DocumentEditorHandle } from "./DocumentEditor.tsx";
import { MessageArea } from "./shell/MessageArea.tsx";
import { NewDialog } from "./shell/NewDialog.tsx";
import { OpenDialog } from "./shell/OpenDialog.tsx";
import { Sidebar } from "./shell/Sidebar.tsx";
import { TopBar, type DocumentView } from "./shell/TopBar.tsx";
import { collectSupportedEdits, type SupportedEdits } from "./tiptap-document.ts";

const EQUATION_DRAFT_SAVE_HINT = "Apply or Cancel the Equation edit before saving.";
const FIGURE_DRAFT_SAVE_HINT = "Apply or Cancel the Figure edit before saving.";
const EQUATION_DRAFT_SOURCE_HINT = "Apply or Cancel the Equation edit before viewing Source.";
const FIGURE_DRAFT_SOURCE_HINT = "Apply or Cancel the Figure edit before viewing Source.";

export function App() {
  const editorRef = useRef<DocumentEditorHandle>(null);
  const [document, setDocument] = useState<EditableDocument | null>(null);
  const [sourceRevision, setSourceRevision] = useState("");
  const [openedPath, setOpenedPath] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [newDialog, setNewDialog] = useState(false);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [equationDraftActive, setEquationDraftActive] = useState(false);
  const [figureDraftActive, setFigureDraftActive] = useState(false);
  const [documentDirty, setDocumentDirty] = useState(false);
  const saveHint = equationDraftActive ? EQUATION_DRAFT_SAVE_HINT : figureDraftActive ? FIGURE_DRAFT_SAVE_HINT : undefined;
  const sourceHint = equationDraftActive ? EQUATION_DRAFT_SOURCE_HINT : figureDraftActive ? FIGURE_DRAFT_SOURCE_HINT : undefined;
  const [view, setView] = useState<DocumentView>("visual");
  const [sourceMarkdown, setSourceMarkdown] = useState("");
  const [sourcePending, setSourcePending] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  // A pending Source preview belongs to the open document, so it blocks document switches too.
  const busy = status === "Loading…" || status === "Opening…" || status === "Creating…" || status === "Saving…" ||
    sourcePending;

  /** Resolves to an error message for a requested path, or "" on success. */
  async function load(requestedPath?: string): Promise<string> {
    setError("");
    setNotice("");
    setStatus(requestedPath ? "Opening…" : "Loading…");
    try {
      const next = await requestDocument("GET", requestedPath);
      setDocument(next.document);
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
    if (!document || !editorRef.current || !openedPath) return;
    if (equationDraftActive) return;
    if (figureDraftActive) return;
    setError("");
    setNotice("");
    setStatus("Saving…");
    try {
      const submitted = editorRef.current.beginSave();
      const payload = collectSupportedEdits(document, submitted);
      const next = await requestDocument("POST", openedPath, { revision: sourceRevision, ...payload });
      setDocument(next.document);
      setSourceRevision(next.revision);
      setOpenedPath(next.path);
      // A successful response must not replace input entered while saving.
      const hasPendingDocumentEdits = JSON.stringify(editorRef.current?.getDocument()) !== JSON.stringify(submitted);
      const hasPendingEquationDraft = editorRef.current?.hasUnappliedEquationDraft() ?? false;
      const hasPendingFigureDraft = editorRef.current?.hasUnappliedFigureDraft() ?? false;
      const hasPendingUserState = hasPendingDocumentEdits || hasPendingEquationDraft || hasPendingFigureDraft;
      editorRef.current?.finishSave(hasPendingUserState ? next.document : undefined);
      if (!hasPendingUserState) setEditorGeneration((value) => value + 1);
      setStatus(hasPendingUserState ? "Saved; newer edits pending" : "Saved");
    } catch (cause) {
      editorRef.current?.finishSave();
      setError(messageOf(cause));
      setStatus(cause instanceof SaveConflictError ? "Save conflict" : "Save failed");
    }
  }

  /**
   * Shows the canonical Markdown the current editor state would save as. The Host runs
   * the Save request through Core without writing; any failure keeps the Visual view.
   */
  async function showSource(): Promise<void> {
    if (!document || !editorRef.current || !openedPath || busy) return;
    if (equationDraftActive || figureDraftActive) return;
    setError("");
    setSourcePending(true);
    try {
      const payload = collectSupportedEdits(document, editorRef.current.getDocument());
      setSourceMarkdown(await requestSource(openedPath, { revision: sourceRevision, ...payload }));
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
            view={view}
            viewDisabled={!document || busy}
            sourceHint={sourceHint}
            onViewChange={(next) => (next === "source" ? void showSource() : setView("visual"))}
            saveDisabled={!document || status === "Saving…" || sourcePending || equationDraftActive || figureDraftActive}
            saveHint={saveHint}
            onSave={() => void save()}
          />
          <MessageArea
            error={error}
            notice={notice}
            onDismissError={() => setError("")}
            onNoticeExpired={() => setNotice("")}
          />
        </div>
        <main className="document-column">
          {view === "source" ? (
            <article className="document source-view" data-testid="source-view" aria-label="Markdown source">
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
                documentPath={openedPath}
                onEquationDraftChange={setEquationDraftActive}
                onFigureDraftChange={setFigureDraftActive}
                onDirtyChange={setDocumentDirty}
                validateFigure={validateFigure}
                onStructuralReject={() =>
                  setNotice("That change is not editable in this version, so it was discarded.")
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
        onClose={() => setOpenDialog(false)}
      />
      <NewDialog
        open={newDialog}
        busy={busy}
        onCreate={createFile}
        onClose={() => setNewDialog(false)}
      />
    </div>
  );
}

type DocumentResponse = {
  path: string;
  document: EditableDocument;
  revision: string;
};

class SaveConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveConflictError";
  }
}

async function requestDocument(
  method: "GET" | "POST" | "PUT",
  filePath?: string,
  body?: (SupportedEdits & { revision: string; path?: string }) | { path: string },
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
    error?: string;
  };
  if (response.status === 409) {
    throw new SaveConflictError(payload.error ?? "Document changed outside the editor. Reload before saving.");
  }
  if (!response.ok || !payload.document || typeof payload.revision !== "string" || typeof payload.path !== "string") {
    throw new Error(payload.error ?? `request failed (${response.status})`);
  }
  return { path: payload.path, document: payload.document, revision: payload.revision };
}

/** Asks the Host for the canonical Markdown a Save request would write. */
async function requestSource(filePath: string, body: SupportedEdits & { revision: string }): Promise<string> {
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
