import { Node, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { footnoteNumbers } from "@ieumdoc/core/numbering";

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

/** Whether a top-level block is the definition of the footnote `label`. Labels match exactly, as in MyST. */
function definesFootnote(block: ProseMirrorNode, label: string): boolean {
  return block.type.name === "unsupportedBlock" && block.attrs.footnote === label;
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

/** Select the definition of the footnote `label` and bring it into view; false when there is none. */
function revealFootnote(editor: Editor, label: string): boolean {
  const { doc } = editor.state;
  let target: number | undefined;
  doc.forEach((block, pos) => { if (target === undefined && definesFootnote(block, label)) target = pos; });
  if (target === undefined) return false;
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(doc, target)));
  editor.view.focus();
  const element = editor.view.nodeDOM(target);
  if (element instanceof HTMLElement) element.scrollIntoView({ block: "center" });
  return true;
}

// A footnote reference `[^label]` is an atomic inline node holding its label. Bold and italic
// apply to it like to text; a link cannot contain it. Its definition is a read-only block.
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
