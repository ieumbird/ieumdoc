import { useEffect, useRef, useState } from "react";
import type { EditableDocument } from "@ieumdoc/core";
import { DocumentEditor, type DocumentEditorHandle } from "./DocumentEditor.tsx";
import { collectSupportedEdits, type SupportedEdits } from "./tiptap-document.ts";

export function App() {
  const editorRef = useRef<DocumentEditorHandle>(null);
  const [document, setDocument] = useState<EditableDocument | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    void load();
  }, []);

  async function load(): Promise<void> {
    setError("");
    setNotice("");
    setStatus("Loading…");
    try {
      const next = await requestDocument("GET");
      setDocument(next);
      setRevision((value) => value + 1);
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
      const next = await requestDocument("POST", payload);
      setDocument(next);
      setRevision((value) => value + 1);
      setStatus("Saved");
    } catch (cause) {
      setError(messageOf(cause));
      setStatus("Save failed");
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
          key={revision}
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

async function requestDocument(method: "GET" | "POST", body?: SupportedEdits): Promise<EditableDocument> {
  const response = await fetch("/api/document", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as { document?: EditableDocument; error?: string };
  if (!response.ok || !payload.document) {
    throw new Error(payload.error ?? `request failed (${response.status})`);
  }
  return payload.document;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
