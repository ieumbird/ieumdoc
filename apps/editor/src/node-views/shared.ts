import { useEffect, useRef, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { TextSelection, type EditorState } from "@tiptap/pm/state";
import { i18n } from "../i18n.ts";

/** Reports whether the block at a source path holds an unapplied draft. */
export type DraftKind = "Equation" | "Figure" | "Table" | "Section label" | "Inline math";
export type DraftListener = (kind: DraftKind, path: string, active: boolean, id?: string) => void;

export const EDIT_PROPERTIES = "ieumdoc-edit-properties";

export function usePropertyEntry(anchor: RefObject<HTMLElement | null>, begin: () => void) {
  useEffect(() => {
    const wrapper = anchor.current?.closest("[data-node-view-wrapper]");
    const open = (event: Event) => { event.preventDefault(); begin(); };
    wrapper?.addEventListener(EDIT_PROPERTIES, open);
    return () => wrapper?.removeEventListener(EDIT_PROPERTIES, open);
  }, [anchor, begin]);
}

export function handleTextblockMouseDown(event: ReactMouseEvent, { editor, node, getPos }: Pick<ReactNodeViewProps, "editor" | "node" | "getPos">): void {
  if (!editor.isEditable || event.button !== 0 || event.defaultPrevented) return;
  if (node.content.size !== 0 && event.detail !== 3) return;
  const position = getPos();
  if (typeof position !== "number") return;
  // Outside contentDOM, Tiptap stops the editable wrapper's mousedown. Prevent
  // native triple-click selection from extending into the following block.
  event.preventDefault();
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, position + 1,
    event.detail === 3 ? position + node.nodeSize - 1 : position + 1)));
  editor.view.focus();
}

export function captionPlaceholderVisible(state: EditorState, pos: number, editable: boolean): boolean {
  const node = state.doc.nodeAt(pos);
  if (!editable || !node || node.content.size !== 0) return false;
  const selection = state.selection;
  return !(selection instanceof TextSelection && selection.head === pos + 1);
}

export function useCaptionPlaceholder({ editor, getPos }: Pick<ReactNodeViewProps, "editor" | "getPos">, kind: "table" | "figure") {
  const show = useEditorState({ editor, selector: ({ editor: current }) => {
    const pos = getPos();
    if (!current || !current.isEditable || typeof pos !== "number") return false;
    return captionPlaceholderVisible(current.state, pos, current.isEditable);
  } });
  return show ? i18n.t(kind === "table" ? "Enter a table caption…" : "Enter a figure caption…") : undefined;
}

// Keep native text dragging inside form controls; ProseMirror otherwise handles their drop.
export function isolateInputDrag(event: ReactDragEvent<HTMLDivElement>) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.stopPropagation();
}

/** Insertion refocuses the engine first; deferred entry must yield to subsequent user input. */
export function useSourceInputFocus(input: RefObject<HTMLElement | null>, editing: boolean) {
  const frame = useRef<number | null>(null);
  const interaction = useRef<AbortController | null>(null);
  const cancel = () => {
    interaction.current?.abort();
    interaction.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  useEffect(() => {
    if (!editing) return;
    cancel();
    // Entry's pointerdown/Enter has already passed document capture. Any later trusted
    // input cancels entry; the insertion command's programmatic focus does not.
    interaction.current = new AbortController();
    const leave = (event: Event) => {
      if (event.isTrusted) cancel();
    };
    const options = { capture: true, signal: interaction.current.signal };
    document.addEventListener("pointerdown", leave, options);
    document.addEventListener("keydown", leave, options);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      cancel();
      const element = input.current;
      if (element?.getClientRects().length &&
        !element.closest("form")?.contains(document.activeElement)) element.focus();
    });
    return cancel;
  }, [editing, input]);
  return cancel;
}

/**
 * Closing properties keeps a text selection inside the block; otherwise it returns a caret just
 * after the block. Use the engine's gap cursor where no adjacent text is available, so the next
 * input cannot replace the whole block. Selection changes add no history or document edits.
 */
export function focusBlock(view: ReactNodeViewProps["view"], getPos: ReactNodeViewProps["getPos"]): void {
  // This is explicit property navigation, not native caret normalization on a preview.
  view.dom.contentEditable = String(view.editable);
  const position = getPos();
  const node = typeof position === "number" ? view.state.doc.nodeAt(position) : null;
  const current = view.state.selection;
  if (node && typeof position === "number" && !(current instanceof TextSelection &&
    current.from > position && current.to < position + node.nodeSize)) {
    const $after = view.state.doc.resolve(position + node.nodeSize);
    const selection = view.someProp("createSelectionBetween", create => create(view, $after, $after))
      ?? TextSelection.between($after, $after);
    view.dispatch(view.state.tr.setSelection(selection));
  }
  view.focus();
}
