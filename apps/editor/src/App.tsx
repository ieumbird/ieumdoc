import { useEffect, useRef, useState } from "react";
import type { EditableDocument } from "@ieumdoc/core";
import { DocumentEditor, type DocumentEditorHandle } from "./DocumentEditor.tsx";
import { MessageArea } from "./shell/MessageArea.tsx";
import { OpenDialog } from "./shell/OpenDialog.tsx";
import { Sidebar } from "./shell/Sidebar.tsx";
import { TopBar } from "./shell/TopBar.tsx";
import { collectSupportedEdits, type SupportedEdits } from "./tiptap-document.ts";

const EQUATION_DRAFT_SAVE_HINT = "Apply or Cancel the Equation edit before saving.";

export function App() {
  const editorRef = useRef<DocumentEditorHandle>(null);
  const [document, setDocument] = useState<EditableDocument | null>(null);
  const [sourceRevision, setSourceRevision] = useState("");
  const [openedPath, setOpenedPath] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [equationDraftActive, setEquationDraftActive] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  const busy = status === "Loading…" || status === "Opening…" || status === "Saving…";

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
      const hasPendingUserState = hasPendingDocumentEdits || hasPendingEquationDraft;
      editorRef.current?.finishSave(hasPendingUserState ? next.document : undefined);
      if (!hasPendingUserState) setEditorGeneration((value) => value + 1);
      setStatus(hasPendingUserState ? "Saved; newer edits pending" : "Saved");
    } catch (cause) {
      editorRef.current?.finishSave();
      setError(messageOf(cause));
      setStatus(cause instanceof SaveConflictError ? "Save conflict" : "Save failed");
    }
  }

  return (
    <div className={`app-shell${sidebarOpen ? "" : " app-shell--collapsed"}`}>
      <Sidebar
        open={sidebarOpen}
        documentPath={openedPath}
        onToggle={() => setSidebarOpen((value) => !value)}
        onOpen={() => setOpenDialog(true)}
      />
      <div className="app-main">
        <div className="app-header">
          <TopBar
            documentPath={openedPath}
            status={status}
            saveDisabled={!document || status === "Saving…" || equationDraftActive}
            saveHint={equationDraftActive ? EQUATION_DRAFT_SAVE_HINT : undefined}
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
          {document ? (
            <DocumentEditor
              key={editorGeneration}
              ref={editorRef}
              document={document}
              documentPath={openedPath}
              onEquationDraftChange={setEquationDraftActive}
              onStructuralReject={() =>
                setNotice("That change is not editable in this version, so it was discarded.")
              }
            />
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
  method: "GET" | "POST",
  filePath?: string,
  body?: SupportedEdits & { revision: string },
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

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
