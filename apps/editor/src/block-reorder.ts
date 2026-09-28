import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { Selection, type EditorState, type Transaction } from "@tiptap/pm/state";

type Span = { top: number; bottom: number };

/** Where a dragged block lands: the gap nearest the pointer, or null when it would stay in place. */
export function blockDropTarget(blocks: Span[], y: number, from: number): { to: number; line: number } | null {
  const found = blocks.findIndex(block => y < (block.top + block.bottom) / 2);
  const gap = found < 0 ? blocks.length : found;
  if (blocks.length === 0 || gap === from || gap === from + 1) return null;
  const line = gap === 0 ? blocks[0].top : gap === blocks.length ? blocks[gap - 1].bottom : (blocks[gap - 1].bottom + blocks[gap].top) / 2;
  return {to: gap > from ? gap - 1 : gap, line};
}

// A single engine transaction; this is session ordering, not document semantics.
export function reorderBlock(state: EditorState, from: number, to: number): Transaction {
  const blocks: { node: ProseMirrorNode; pos: number }[] = [];
  state.doc.forEach((node, pos) => blocks.push({node, pos}));
  if (!Number.isInteger(from) || !Number.isInteger(to) || !blocks[from] || !blocks[to]) throw new Error("invalid block move");
  const tr = closeHistory(state.tr);
  if (from === to) return tr;
  const source = blocks[from];
  tr.delete(source.pos, source.pos + source.node.nodeSize);
  const target = blocks[to].pos + (to > from ? blocks[to].node.nodeSize - source.node.nodeSize : 0);
  tr.insert(target, source.node);
  // A selection inside the block moves with it, and a moved text block takes the caret. Otherwise
  // the selection stays: selecting a moved Equation or Figure would open its editor or properties.
  const {from: start, to: end} = state.selection;
  if (start >= source.pos && end <= source.pos + source.node.nodeSize) {
    const json = state.selection.toJSON();
    const shift = (pos: number) => pos - source.pos + target;
    tr.setSelection(Selection.fromJSON(tr.doc, {...json, anchor: shift(json.anchor), head: json.head === undefined ? undefined : shift(json.head)}));
  } else if (source.node.isTextblock) {
    tr.setSelection(Selection.near(tr.doc.resolve(target + 1)));
  }
  return tr.setMeta("blockReorder", true);
}
