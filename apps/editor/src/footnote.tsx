import { i18n } from "./i18n.ts";
import { useTranslation } from "react-i18next";
import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { revealEndnote, useEndnoteNumber } from "./endnotes.ts";

// A MyST footnote reference `[^label]`: an atomic inline node holding its label, shown as the
// endnote's number (endnotes.ts). Bold and italic apply to it like to text; a link cannot contain
// it. Its definition is a top-level block in the endnotes region.
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

function FootnoteReferenceView({ node, editor, selected, getPos }: ReactNodeViewProps) {
  useTranslation();
  const label = String(node.attrs.label ?? "");
  const number = useEndnoteNumber(editor, label);
  const status = number !== undefined ? i18n.t("Endnote {{number}}. Click to go to its definition.", { number: number })
    : i18n.t("Unresolved: no definition of footnote [^{{label}}] in this document", { label: label });
  return (
    <NodeViewWrapper
      as="span"
      className="cross-reference footnote-reference"
      data-selected={selected ? "true" : "false"}
      data-resolved={number !== undefined ? "true" : "false"}
      data-testid="footnote-reference"
      data-label={label}
    >
      <sup className="cross-reference-chip" aria-label={status} onClick={() => revealEndnote(editor, label, getPos())}>
        {number ?? label}
      </sup>
    </NodeViewWrapper>
  );
}
