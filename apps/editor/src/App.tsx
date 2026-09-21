import { useEffect, useState } from "react";
import type { EditableDocument, InlineContent, NodePath } from "@ieumdoc/core";
import { collectEdits, collectParagraphEdits, pathKey } from "./edits.ts";
import { DocumentView } from "./DocumentView.tsx";

export type ParagraphErrors = Record<string, string>;

export function App() {
  const [document, setDocument] = useState<EditableDocument | null>(null);
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [paragraphDrafts, setParagraphDrafts] = useState<Record<string, InlineContent[]>>({});
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [paragraphErrors, setParagraphErrors] = useState<ParagraphErrors>({});
  const [revision, setRevision] = useState(0);
  const paragraphError = firstParagraphError(paragraphErrors);

  useEffect(() => {
    void load();
  }, []);

  async function load(): Promise<void> {
    setError("");
    setParagraphErrors({});
    setStatus("Loading…");
    try {
      const next = await requestDocument("GET");
      setDocument(next);
      setTextDrafts({});
      setParagraphDrafts({});
      setParagraphErrors({});
      setRevision((value) => value + 1);
      setStatus("Ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("Load failed");
    }
  }

  async function save(): Promise<void> {
    if (!document) return;
    if (Object.keys(paragraphErrors).length > 0) {
      setStatus("Save failed");
      return;
    }
    setError("");
    setStatus("Saving…");
    try {
      const next = await requestDocument("POST", {
        edits: collectEdits(document, textDrafts),
        paragraphs: collectParagraphEdits(document, paragraphDrafts),
      });
      setDocument(next);
      setTextDrafts({});
      setParagraphDrafts({});
      setParagraphErrors({});
      setRevision((value) => value + 1);
      setStatus("Saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("Save failed");
    }
  }

  function onTextDraft(path: NodePath, text: string): void {
    setTextDrafts((current) => ({ ...current, [pathKey(path)]: text }));
  }

  function onParagraphDraft(path: NodePath, content: InlineContent[]): void {
    setParagraphErrors((current) => clearParagraphError(current, path));
    setError("");
    setParagraphDrafts((current) => ({ ...current, [pathKey(path)]: content }));
  }

  function onParagraphError(path: NodePath, cause: unknown): void {
    setParagraphErrors((current) => recordParagraphError(current, path, cause));
    setError("");
    setStatus("Save failed");
  }

  const visibleError = paragraphError || error;

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
          <button type="button" onClick={() => void save()} disabled={!document}>
            Save
          </button>
        </div>
      </header>
      {visibleError ? (
        <p className="error" data-testid="error">
          {visibleError}
        </p>
      ) : null}
      {document ? (
        <DocumentView
          key={revision}
          document={document}
          onTextDraft={onTextDraft}
          onParagraphDraft={onParagraphDraft}
          onParagraphError={onParagraphError}
        />
      ) : null}
    </div>
  );
}

export function recordParagraphError(
  errors: ParagraphErrors,
  path: NodePath,
  cause: unknown,
): ParagraphErrors {
  const message = cause instanceof Error ? cause.message : String(cause);
  return { ...errors, [pathKey(path)]: message };
}

export function clearParagraphError(errors: ParagraphErrors, path: NodePath): ParagraphErrors {
  const key = pathKey(path);
  if (!(key in errors)) return errors;
  const next = { ...errors };
  delete next[key];
  return next;
}

export function firstParagraphError(errors: ParagraphErrors): string {
  return Object.values(errors)[0] ?? "";
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
