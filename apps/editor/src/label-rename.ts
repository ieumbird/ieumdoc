import { planLabelRename, type LabelRenameBlock, type LabelRenameReference } from "@ieumdoc/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Fragment } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { fromTiptapContent } from "./tiptap-inline.ts";

/** Apply properties and Core's reference plan in one engine transaction. Body text may still
 * be unfinished; only target context and reference attributes cross the Core boundary here. */
export function updateLabelProperties(state: EditorState, position: number, attributes: Record<string, unknown>, caption?: Fragment): Transaction {
  const current = state.doc.nodeAt(position);
  if (!current) throw new Error("Label target changed.");
  const { label = current.attrs.label, ...properties } = attributes;
  const attrs = { ...current.attrs, ...properties };
  const tr = closeHistory(state.tr);
  if (caption === undefined) tr.setNodeMarkup(position, undefined, attrs);
  else tr.replaceWith(position, position + current.nodeSize, current.type.create(attrs, caption));
  if (current.attrs.label && label && current.attrs.label !== label) {
    const blocks: LabelRenameBlock[] = [];
    tr.doc.forEach(node => blocks.push({
      block: node.type.name === "labelTarget" ? "target" : node.type.name,
      label: node.attrs.label, level: node.attrs.level,
      ...(node.type.name === "heading" ? { content: fromTiptapContent({ type: "doc", content: [{ type: "paragraph", content: node.toJSON().content }] }) } : {}),
    }));
    const references: LabelRenameReference[] = [];
    const apply: ((reference: LabelRenameReference) => void)[] = [];
    const add = (reference: LabelRenameReference, change: (reference: LabelRenameReference) => void) => {
      references.push(reference); apply.push(change);
    };
    tr.doc.descendants((node, pos) => {
      if (node.type.name === "crossReference") {
        add({ kind: "reference", role: node.attrs.role, label: node.attrs.label }, reference => {
          if (reference.kind === "reference") tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, label: reference.label });
        });
      }
      for (const mark of node.marks) if (mark.type.name === "link") {
        add({ kind: "link", url: mark.attrs.href }, reference => {
          if (reference.kind === "link") tr.addMark(pos, pos + node.nodeSize, mark.type.create({ ...mark.attrs, href: reference.url }));
        });
      }
    });
    const plan = planLabelRename(blocks, tr.doc.resolve(position).index(0), String(label), references);
    for (const edit of plan) apply[edit.index](edit.reference);
  }
  return tr.setNodeMarkup(position, undefined, { ...tr.doc.nodeAt(position)!.attrs, label });
}
