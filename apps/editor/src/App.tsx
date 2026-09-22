import { useEffect, useRef, useState } from "react";
import type { EditableDocument } from "@ieumdoc/core";
import { DocumentEditor, type DocumentEditorHandle } from "./DocumentEditor.tsx";
import { collectSupportedEdits, type SupportedEdits } from "./tiptap-document.ts";

export function App() {
  const editorRef = useRef<DocumentEditorHandle>(null);
  const [document, setDocument] = useState<EditableDocument | null>(null);
  const [sourceRevision, setSourceRevision] = useState("");
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editorGeneration, setEditorGeneration] = useState(0);

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
    setError("");
    setNotice("");
    setStatus("Saving…");
    try {
      const payload = collectSupportedEdits(document, editorRef.current.getDocument());
      const next = await requestDocument("POST", { revision: sourceRevision, ...payload });
      setDocument(next.document);
      setSourceRevision(next.revision);
      setEditorGeneration((value) => value + 1);
      setStatus("Saved");
    } catch (cause) {
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
          <button type="button" onClick={() => void save()} disabled={!document || status === "Saving…"}>
            Save
          </button>
        </div>
      </header>
      {notice ? (
        <p className="notice" data-testid="notice">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="error" data-testid="error">
          {error}
        </p>
      ) : null}
      {document ? (
        <DocumentEditor
          key={editorGeneration}
          ref={editorRef}
          document={document}
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
