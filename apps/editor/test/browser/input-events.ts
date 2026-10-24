import type { Editor } from "@tiptap/core";
import { undoDepth, redoDepth } from "@tiptap/pm/history";

// Bundled and injected by the test fixture, never imported by the product.
const capacity = 400;
const events: Record<string, unknown>[] = new Array(capacity);
let total = 0;
const startedAt = new Date().toISOString();
const editors = new Map<Editor, { element: HTMLElement; id: number; stop: () => void }>();
let nextEditor = 0;
type EditorElement = HTMLElement & { editor?: Editor };

function describe(target: EventTarget | null) {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!element) return null;
  // Only short control labels; never editor text, input values, document JSON or steps.
  const label = element.getAttribute("aria-label") ??
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
      ? element.labels?.[0]?.textContent : null) ??
    (element.matches('button, [role="button"], [role="menuitem"]') ? element.textContent : null);
  return {
    tag: element.tagName,
    testId: element.getAttribute("data-testid")?.slice(0, 80) ?? null,
    role: element.getAttribute("role"),
    label: label?.slice(0, 80) ?? null,
  };
}

function engine(editor: Editor) {
  const { selection } = editor.state;
  const entry = editors.get(editor)!;
  const tab = entry.element.closest("[data-document-tab]");
  return {
    id: entry.id,
    tab: tab?.getAttribute("data-document-tab")?.slice(0, 80) ?? null,
    active: tab?.getAttribute("data-active") === "true",
    focused: editor.view.hasFocus(),
    selection: { from: selection.from, to: selection.to, type: selection.toJSON().type },
    undoDepth: undoDepth(editor.state),
    redoDepth: redoDepth(editor.state),
  };
}

function record(type: string, details: Record<string, unknown> = {}) {
  const dom = window.getSelection();
  const point = (node: Node | null, offset: number) => ({
    node: node?.nodeName ?? null, offset, textLength: node?.nodeType === Node.TEXT_NODE ? node.textContent?.length : null, element: describe(node),
  });
  const active = document.querySelector<EditorElement>('[data-document-tab][data-active="true"] .document-editor')?.editor;
  events[total % capacity] = {
    sequence: total++, timestamp: new Date().toISOString(), elapsedMs: performance.now(), type,
    activeElement: describe(document.activeElement),
    domSelection: dom ? { anchor: point(dom.anchorNode, dom.anchorOffset), focus: point(dom.focusNode, dom.focusOffset), collapsed: dom.isCollapsed } : null,
    activeEditor: active && editors.has(active) && !active.isDestroyed ? engine(active) : null,
    ...details,
  };
}

function discover() {
  for (const element of document.querySelectorAll<EditorElement>(".document-editor")) {
    const editor = element.editor;
    if (!editor || editor.isDestroyed || editors.has(editor)) continue;
    // Subscribe to the public Tiptap event; no dispatchTransaction wrapping or product hooks.
    const onTransaction = ({ transaction }: { transaction: Editor["state"]["tr"] }) =>
      record("transaction", { editor: engine(editor), docChanged: transaction.docChanged,
        selection: { from: transaction.selection.from, to: transaction.selection.to, type: transaction.selection.toJSON().type } });
    const stop = () => {
      editor.off("transaction", onTransaction);
      editor.off("destroy", stop);
      editors.delete(editor);
    };
    editors.set(editor, { element, id: ++nextEditor, stop });
    editor.on("transaction", onTransaction);
    editor.on("destroy", stop);
    record("editor-attached", { editor: engine(editor) });
  }
  for (const [editor, entry] of editors) if (!entry.element.isConnected || editor.isDestroyed) entry.stop();
}

for (const type of ["keydown", "keyup"] as const) {
  document.addEventListener(type, event => {
    discover();
    record(type, { target: describe(event.target), key: event.key, code: event.code,
      modifiers: { alt: event.altKey, control: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey },
      repeat: event.repeat, composing: event.isComposing });
  }, true); // Before the editor handles the key, including when it stops propagation.
}
for (const type of ["focusin", "focusout"] as const) {
  document.addEventListener(type, event => {
    discover();
    record(type, { previous: describe(type === "focusin" ? event.relatedTarget : event.target),
      next: describe(type === "focusin" ? event.target : event.relatedTarget) });
  }, true);
}
document.addEventListener("selectionchange", () => record("selectionchange"));
new MutationObserver(records => {
  // Ignore routine text/NodeView mutations. Scan only when an editor/tab mounts or switches.
  if (records.some(record => record.type === "attributes" ||
    [...record.addedNodes, ...record.removedNodes].some(node => node instanceof Element &&
      (node.matches(".document-editor, [data-document-tab]") || node.querySelector(".document-editor"))))) discover();
}).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-active"] });

Object.assign(window, { __ieumdocInputEvents: () => ({
  version: 1, startedAt, capacity, total, dropped: Math.max(0, total - capacity),
  events: Array.from({ length: Math.min(total, capacity) }, (_, index) => events[(Math.max(0, total - capacity) + index) % capacity]),
}) });
