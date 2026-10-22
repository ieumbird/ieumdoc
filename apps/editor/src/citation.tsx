import { Node, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeViewWrapper, ReactNodeViewRenderer, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { citationKeys, citationText, type CitationRole } from "@ieumdoc/core/citation";
import { endnoteOrder, firstReferenceNumbers } from "@ieumdoc/core/numbering";
import { endnoteBlocks } from "./endnotes.ts";
import { i18n } from "./i18n.ts";

// Like endnotes, unchanged engine blocks keep their extracted references and each engine
// document computes numbers once. Only the engine-to-Core projection belongs here.
const keysOf = new WeakMap<ProseMirrorNode, string[]>();
const numbersOf = new WeakMap<ProseMirrorNode, Map<string, number>>();

export function citationNumbers(doc: ProseMirrorNode): Map<string, number> {
  let numbers = numbersOf.get(doc);
  if (!numbers) {
    const keys: string[] = [];
    endnoteOrder(endnoteBlocks(doc)).forEach(index => {
      const block = doc.child(index);
      let found = keysOf.get(block);
      if (!found) {
        // Core's table directive reads its caption before cells; the caption is an Editor attr.
        found = block.type.name === "table" ? citationKeys(block.attrs.caption ?? []) : [];
        block.descendants(node => { if (node.type.name === "citation") found!.push(...node.attrs.keys); });
        keysOf.set(block, found);
      }
      keys.push(...found);
    });
    numbersOf.set(doc, numbers = firstReferenceNumbers(keys));
  }
  return numbers;
}

export function citationStatus(keys: readonly string[], text: string): string {
  return i18n.t("Citation {{numbers}}: {{keys}}. Bibliography has not been checked.", { numbers: text, keys: keys.join(", ") });
}

export function useCitationText(editor: Editor, keys: readonly string[]): string {
  return useEditorState({ editor, selector: ({ editor: current }) => current ? citationText(keys, citationNumbers(current.state.doc)) : "" }) ?? "";
}

export const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  marks: "bold italic strike",
  addAttributes() {
    return {
      role: { default: "cite", parseHTML: element => element.getAttribute("data-role"),
        renderHTML: attrs => ({ "data-role": attrs.role }) },
      keys: { default: [], parseHTML: element => {
        try { return JSON.parse(element.getAttribute("data-keys") ?? "[]"); }
        catch { return []; } // The existing structural guard refuses malformed typed inline content.
      }, renderHTML: attrs => ({ "data-keys": JSON.stringify(attrs.keys) }) },
    };
  },
  parseHTML() { return [{ tag: "span[data-citation]" }]; },
  renderHTML({ HTMLAttributes }) { return ["span", { ...HTMLAttributes, "data-citation": "" }]; },
  addNodeView() { return ReactNodeViewRenderer(CitationView, { as: "span" }); },
});

function CitationView({ node, editor, selected }: ReactNodeViewProps) {
  useTranslation();
  const keys = node.attrs.keys as string[];
  const text = useCitationText(editor, keys);
  const status = citationStatus(keys, text);
  return <NodeViewWrapper as="span" className="cross-reference citation" data-citation=""
    data-role={node.attrs.role as CitationRole} data-keys={JSON.stringify(keys)}
    data-selected={String(selected)} data-readiness="not-evaluated">
    <span className="cross-reference-chip" title={status} aria-label={status}>{text}</span>
  </NodeViewWrapper>;
}
