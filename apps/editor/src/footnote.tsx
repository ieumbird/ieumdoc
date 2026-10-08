import { Node, type Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection, type Selection } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { footnoteNumbers, nextFootnoteLabel } from "@ieumdoc/core/numbering";

/**
 * Footnote reference labels of the current editor document, in document order: inline
 * references in editable content, and the ones Core read in each read-only block.
 */
function footnoteReferences(doc: ProseMirrorNode): string[] {
  const labels: string[] = [];
  doc.forEach((block) => {
    if (Array.isArray(block.attrs.footnotes)) labels.push(...block.attrs.footnotes as string[]);
    else block.descendants((node) => { if (node.type.name === "footnoteReference") labels.push(String(node.attrs.label)); });
  });
  return labels;
}

/** The label a top-level footnote definition defines, editable or read-only; otherwise undefined. */
function definitionLabel(block: ProseMirrorNode): string | undefined {
  if (block.type.name === "footnoteDefinition") return String(block.attrs.label);
  return block.type.name === "unsupportedBlock" && block.attrs.footnote ? String(block.attrs.footnote) : undefined;
}

/** Whether a top-level block is the definition of the footnote `label`. Labels match exactly, as in MyST. */
function definesFootnote(block: ProseMirrorNode, label: string): boolean {
  return definitionLabel(block) === label;
}

/** Every footnote label the editor document uses, defined or referenced. */
function footnoteLabels(doc: ProseMirrorNode): string[] {
  const labels = footnoteReferences(doc);
  doc.forEach((block) => { const label = definitionLabel(block); if (label !== undefined) labels.push(label); });
  return labels;
}

/** A footnote's number as MyST shows it, following every change to the editor document;
 * undefined when the document has no definition for it. Numbers are display only. */
export function useFootnoteNumber(editor: Editor, label: string): number | undefined {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return undefined;
      let defined = false;
      current.state.doc.forEach((block) => { defined ||= definesFootnote(block, label); });
      return defined ? footnoteNumbers(footnoteReferences(current.state.doc)).get(label) : undefined;
    },
  }) ?? undefined;
}

/** Go to the definition of the footnote `label`: the caret at the end of an editable one, a
 * read-only one selected; false when there is none. */
function revealFootnote(editor: Editor, label: string): boolean {
  const { doc } = editor.state;
  let target: ProseMirrorNode | undefined;
  let at = 0;
  doc.forEach((block, pos) => { if (!target && definesFootnote(block, label)) { target = block; at = pos; } });
  if (!target) return false;
  const selection = target.type.name === "footnoteDefinition"
    ? TextSelection.create(doc, at + 1 + target.content.size) : NodeSelection.create(doc, at);
  return reveal(editor, selection, at);
}

/** Go back to the first reference of the footnote `label`, or the read-only block holding it. */
export function revealReference(editor: Editor, label: string): boolean {
  const { doc } = editor.state;
  let found: number | undefined;
  doc.forEach((block, pos) => {
    if (found !== undefined) return;
    if (Array.isArray(block.attrs.footnotes)) {
      if ((block.attrs.footnotes as string[]).includes(label)) found = pos;
      return;
    }
    block.descendants((node, offset) => {
      if (found === undefined && node.type.name === "footnoteReference" && node.attrs.label === label) found = pos + 1 + offset;
      return found === undefined;
    });
  });
  if (found === undefined) return false;
  return reveal(editor, NodeSelection.create(doc, found), found);
}

function reveal(editor: Editor, selection: Selection, pos: number): boolean {
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  editor.view.focus();
  const element = editor.view.nodeDOM(pos);
  if (element instanceof HTMLElement) element.scrollIntoView({ block: "center" });
  return true;
}

/**
 * Replace a slash query in a paragraph, and the space before it, with a new footnote: a reference
 * keeping the bold/italic marks there, and an empty definition at the end of the document that
 * takes the caret. The label is Core's next unused number. Save writes both through Core.
 */
export function insertFootnote(editor: Editor, range: { from: number; to: number }, sourcePath: string): boolean {
  const { state } = editor;
  const $from = state.doc.resolve(range.from);
  if ($from.depth !== 1 || $from.parent.type.name !== "paragraph" || !$from.sameParent(state.doc.resolve(range.to))) return false;
  const label = nextFootnoteLabel(footnoteLabels(state.doc));
  const marks = (state.storedMarks ?? $from.marks()).filter((mark) => mark.type.name === "bold" || mark.type.name === "italic");
  // `/` opens after a space; the reference follows the word, as footnotes are written.
  const from = range.from > $from.start() && state.doc.textBetween(range.from - 1, range.from) === " " ? range.from - 1 : range.from;
  const tr = closeHistory(state.tr).replaceWith(from, range.to, state.schema.nodes.footnoteReference.create({ label }, null, marks));
  const end = tr.doc.content.size;
  tr.insert(end, state.schema.nodes.footnoteDefinition.create({ sourcePath, label }));
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1)).scrollIntoView());
  editor.view.focus();
  return true;
}

/** The slash menu's Footnote item, when the query asks for it. */
export function footnoteCommandItems(query: string): { id: string; label: string; group: string }[] {
  const needle = query.toLowerCase();
  return needle.length === 0 || ["footnote", "fn"].some((word) => word.startsWith(needle))
    ? [{ id: FOOTNOTE_COMMAND, label: "Footnote", group: "References" }] : [];
}

export const FOOTNOTE_COMMAND = "footnote";

// A footnote reference `[^label]` is an atomic inline node holding its label. Bold and italic
// apply to it like to text; a link cannot contain it. Its definition is a top-level block.
export const FootnoteReference = Node.create({
  name: "footnoteReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  marks: "bold italic",
  addAttributes() {
    return {
      label: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-label") ?? "",
        renderHTML: (attributes) => ({ "data-label": String(attributes.label ?? "") }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-footnote-reference]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, "data-footnote-reference": "" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FootnoteReferenceView, { as: "span" });
  },
});

function FootnoteReferenceView({ node, editor, selected }: ReactNodeViewProps) {
  const label = String(node.attrs.label ?? "");
  const number = useFootnoteNumber(editor, label);
  const status = number !== undefined ? `Footnote ${number}. Click to go to its definition.`
    : `Unresolved: no definition of footnote [^${label}] in this document`;
  return (
    <NodeViewWrapper
      as="span"
      className="cross-reference footnote-reference"
      data-selected={selected ? "true" : "false"}
      data-resolved={number !== undefined ? "true" : "false"}
      data-testid="footnote-reference"
      data-label={label}
    >
      <sup className="cross-reference-chip" title={status} aria-label={status} onClick={() => revealFootnote(editor, label)}>
        {number ?? label}
      </sup>
    </NodeViewWrapper>
  );
}
