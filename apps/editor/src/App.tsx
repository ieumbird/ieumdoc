import { useEffect, useState } from "react";
import type { EditableDocument, InlineContent, NodePath } from "@ieumdoc/core";
import { DocumentView, type PendingFocus } from "./DocumentView.tsx";
import {
  collectEdits,
  collectEquationEdits,
  collectHeadingEdits,
  mergeParagraphEdits,
  omitPathIndex,
  pathKey,
  type BlockInsert,
  type ParagraphEdit,
} from "./edits.ts";
import { type FocusEdge } from "./editor-focus.ts";
import { concatInlineContent, inlineText } from "./inline-edit.ts";

export type ParagraphErrors = Record<string, string>;

export function App() {
  const [document, setDocument] = useState<EditableDocument | null>(null);
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [paragraphDrafts, setParagraphDrafts] = useState<Record<string, InlineContent[]>>({});
  const [headingDrafts, setHeadingDrafts] = useState<Record<string, string>>({});
  const [equationDrafts, setEquationDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [paragraphErrors, setParagraphErrors] = useState<ParagraphErrors>({});
  const [revision, setRevision] = useState(0);
  const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null);
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
      clearDrafts();
      setParagraphErrors({});
      setPendingFocus(null);
      setRevision((value) => value + 1);
      setStatus("Ready");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("Load failed");
    }
  }

  async function save(): Promise<void> {
    await commit();
  }

  async function commit(action?: {
    insert?: BlockInsert;
    remove?: number;
    paragraphs?: ParagraphEdit[];
    focus?: PendingFocus;
  }): Promise<void> {
    if (!document) return;
    if (Object.keys(paragraphErrors).length > 0) {
      setStatus("Save failed");
      return;
    }
    const headings = omitPathIndex(collectHeadingEdits(document, headingDrafts), action?.remove);
    const equations = omitPathIndex(collectEquationEdits(document, equationDrafts), action?.remove);
    const blankEquation = equations.find((edit) => edit.latex.trim().length === 0);
    if (blankEquation) {
      setError("Equation LaTeX must be non-empty. An empty math fence does not survive canonical reload.");
      setStatus("Save failed");
      return;
    }
    setError("");
    setStatus("Saving…");
    try {
      const next = await requestDocument("POST", {
        edits: omitPathIndex(collectEdits(document, textDrafts), action?.remove),
        paragraphs: mergeParagraphEdits(document, paragraphDrafts, action?.paragraphs ?? [], action?.remove),
        headings,
        equations,
        insert: action?.insert,
        remove: action?.remove,
      });
      setDocument(next);
      clearDrafts();
      setParagraphErrors({});
      setPendingFocus(action?.focus ?? null);
      setRevision((value) => value + 1);
      setStatus("Saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("Save failed");
    }
  }

  function clearDrafts(): void {
    setTextDrafts({});
    setParagraphDrafts({});
    setHeadingDrafts({});
    setEquationDrafts({});
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

  function onHeadingDraft(path: NodePath, text: string): void {
    setHeadingDrafts((current) => ({ ...current, [pathKey(path)]: text }));
  }

  function onEquationDraft(path: NodePath, latex: string): void {
    setEquationDrafts((current) => ({ ...current, [pathKey(path)]: latex }));
  }

  function onInsert(index: number, block: "paragraph" | "heading" | "equation"): void {
    if (block === "paragraph") {
      void commit({ insert: { index, block, text: " " }, focus: { index, edge: "all" } });
      return;
    }
    if (block === "heading") {
      void commit({ insert: { index, block, text: "", level: 2 }, focus: { index, edge: "start" } });
      return;
    }
    void commit({ insert: { index, block, latex: "x" }, focus: { index, edge: "all" } });
  }

  function onDelete(index: number): void {
    const focus = index > 0 ? { index: index - 1, edge: "end" as FocusEdge } : { index: 0, edge: "start" as FocusEdge };
    void commit({ remove: index, focus });
  }

  function onEnterSplit(path: NodePath, before: InlineContent[], after: InlineContent[]): void {
    const index = path[0];
    if (index === undefined) return;
    const insertAt = index + 1;
    if (inlineText(before).length > 0 && inlineText(after).length > 0) {
      void commit({
        paragraphs: [{ path, content: before }],
        insert: { index: insertAt, block: "paragraph", text: inlineText(after), content: after },
        focus: { index: insertAt, edge: "start" },
      });
      return;
    }
    // Enter at either edge would need an empty sibling. Canonical MyST drops it,
    // so the new paragraph is a single space that reload can keep.
    void commit({
      insert: { index: insertAt, block: "paragraph", text: " " },
      focus: { index: insertAt, edge: "all" },
    });
  }

  function onParagraphBackspace(path: NodePath, content: InlineContent[]): void {
    if (!document) return;
    const index = path[0];
    if (index === undefined || index === 0) return;
    const block = document.blocks[index];
    if (block?.block !== "paragraph" || !block.editable) return;
    if (inlineText(content).trim().length === 0) {
      void commit({ remove: index, focus: { index: index - 1, edge: "end" } });
      return;
    }
    const previous = document.blocks[index - 1];
    if (previous?.block === "paragraph" && previous.editable) {
      const previousContent = paragraphDrafts[pathKey(previous.path)] ?? previous.content;
      void commit({
        paragraphs: [{ path: previous.path, content: concatInlineContent(previousContent, content) }],
        remove: index,
        focus: { index: index - 1, edge: { offset: inlineText(previousContent).length } },
      });
      return;
    }
    setPendingFocus({ index: index - 1, edge: "end" });
  }

  function onHeadingBackspace(path: NodePath, text: string): void {
    const index = path[0];
    if (index === undefined || index === 0) return;
    if (text.length === 0) {
      void commit({ remove: index, focus: { index: index - 1, edge: "end" } });
      return;
    }
    setPendingFocus({ index: index - 1, edge: "end" });
  }

  function onEquationBackspace(path: NodePath, latex: string): void {
    const index = path[0];
    if (index === undefined || index === 0) return;
    if (latex.trim().length === 0) {
      void commit({ remove: index, focus: { index: index - 1, edge: "end" } });
      return;
    }
    setPendingFocus({ index: index - 1, edge: "end" });
  }

  const visibleError = paragraphError || error;

  return (
    <div className="app">
      <header className="toolbar">
        <div>
          <h1 className="product">IeumDoc</h1>
          <p className="filename">per-block.md</p>
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
          headingDrafts={headingDrafts}
          equationDrafts={equationDrafts}
          pendingFocus={pendingFocus}
          onTextDraft={onTextDraft}
          onParagraphDraft={onParagraphDraft}
          onParagraphError={onParagraphError}
          onHeadingDraft={onHeadingDraft}
          onEquationDraft={onEquationDraft}
          onInsert={onInsert}
          onDelete={onDelete}
          onEnterSplit={onEnterSplit}
          onParagraphBackspace={onParagraphBackspace}
          onHeadingBackspace={onHeadingBackspace}
          onEquationBackspace={onEquationBackspace}
          onAutoFocusApplied={() => setPendingFocus(null)}
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
