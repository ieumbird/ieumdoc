import { useEffect, useState } from "react";
import type { EditableDocument } from "@ieumdoc/core";
import { SingleDocumentEditor } from "./SingleDocumentEditor.tsx";

export function App() {
  const [document, setDocument] = useState<EditableDocument | null>(null);
  const [draft, setDraft] = useState<EditableDocument | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    void load();
  }, []);

  async function load(): Promise<void> {
    setError("");
    setStatus("Loading…");
    try {
      const next = await requestDocument("GET");
      setDocument(next);
      setDraft(next);
      setRevision((value) => value + 1);
      setStatus("Ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("Load failed");
    }
  }

  async function save(): Promise<void> {
    if (!draft) return;
    setError("");
    setStatus("Saving…");
    try {
      const next = await requestDocument("POST", { document: draft });
      setDocument(next);
      setDraft(next);
      setRevision((value) => value + 1);
      setStatus("Saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("Save failed");
    }
  }

  return (
    <div className="app">
      <header className="toolbar">
        <div>
          <h1 className="product">IeumDoc · Single Editor Spike</h1>
          <p className="filename">technical-document.md</p>
        </div>
        <div className="toolbar-actions">
          <p className="status" data-testid="status">
            {status}
          </p>
          <button type="button" onClick={() => void save()} disabled={!draft}>
            Save
          </button>
        </div>
      </header>
      {error ? (
        <p className="error" data-testid="error">
          {error}
        </p>
      ) : null}
      {document ? (
        <SingleDocumentEditor
          key={revision}
          document={document}
          onChange={setDraft}
          onError={(cause) => {
            setError(cause instanceof Error ? cause.message : String(cause));
            setStatus("Editing error");
          }}
        />
      ) : null}
    </div>
  );
}

async function requestDocument(method: "GET" | "POST", body?: unknown): Promise<EditableDocument> {
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
