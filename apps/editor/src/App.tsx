import { useEffect, useRef, useState } from "react";
import type { EditableDocument } from "@ieumdoc/core";
import { DocumentEditor, type DocumentEditorHandle } from "./DocumentEditor.tsx";
import { collectSupportedEdits, type SupportedEdits } from "./tiptap-document.ts";
import { Button, Notice } from "./ui/primitives.tsx";

export function App() {
  const editorRef = useRef<DocumentEditorHandle>(null);
  const [document, setDocument] = useState<EditableDocument | null>(null);
  const [sourceRevision, setSourceRevision] = useState("");
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [equationDraftActive, setEquationDraftActive] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load(): Promise<void> {
    setError("");
    setNotice("");
    setStatus("Loading…");
    try {
      const next = await requestDocument("GET");
      setDocument(next.document);
      setSourceRevision(next.revision);
      setEditorGeneration((value) => value + 1);
      setStatus("Ready");
    } catch (cause) {
      setError(messageOf(cause));
      setStatus("Load failed");
    }
  }

  async function save(): Promise<void> {
    if (!document || !editorRef.current) return;
    if (equationDraftActive) return;
    setError("");
    setNotice("");
    setStatus("Saving…");
    try {
      const submitted = editorRef.current.beginSave();
      const payload = collectSupportedEdits(document, submitted);
      const next = await requestDocument("POST", { revision: sourceRevision, ...payload });
      setDocument(next.document);
      setSourceRevision(next.revision);
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
    <div className="app">
      <header className="toolbar">
        <div>
          <h1 className="product">IeumDoc</h1>
          <p className="filename">technical-document.md</p>
        </div>
        <div className="toolbar-actions">
          <p className="status" data-testid="status">
            {status}
          </p>
          <Button type="button" onClick={() => void save()} disabled={!document || status === "Saving…"}>
            Save
          </Button>
        </div>
      </header>
      {equationDraftActive ? (
        <Notice data-testid="equation-draft-notice">
          Apply or Cancel the Equation edit before saving.
        </Notice>
      ) : null}
      {notice ? (
        <Notice data-testid="notice">
          {notice}
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="error" data-testid="error">
          {error}
        </Notice>
      ) : null}
      {document ? (
        <DocumentEditor
          key={editorGeneration}
          ref={editorRef}
          document={document}
          onEquationDraftChange={setEquationDraftActive}
          onStructuralReject={() =>
            setNotice("That change is not editable in this version, so it was discarded.")
          }
        />
      ) : null}
    </div>
  );
}

type DocumentResponse = {
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
  body?: SupportedEdits & { revision: string },
): Promise<DocumentResponse> {
  const response = await fetch("/api/document", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as { document?: EditableDocument; revision?: string; error?: string };
  if (response.status === 409) {
    throw new SaveConflictError(payload.error ?? "Document changed outside the editor. Reload before saving.");
  }
  if (!response.ok || !payload.document || typeof payload.revision !== "string") {
    throw new Error(payload.error ?? `request failed (${response.status})`);
  }
  return { document: payload.document, revision: payload.revision };
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
