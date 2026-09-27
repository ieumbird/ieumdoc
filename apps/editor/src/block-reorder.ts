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

export type SavedRange = { start: number; end: number; path: string };

// Delete+insert step maps discard the moved range. Recognize a pure block
// permutation (including engine undo/redo) and carry each saved range with it.
export function mapSavedRanges(ranges: SavedRange[], transaction: Transaction): SavedRange[] {
  const before: { node: ProseMirrorNode; pos: number }[] = [];
  const after: { node: ProseMirrorNode; pos: number }[] = [];
  transaction.before.forEach((node, pos) => before.push({node, pos}));
  transaction.doc.forEach((node, pos) => after.push({node, pos}));
  const used = new Set<number>();
  const matches = before.map(block => {
    const index = after.findIndex((next, i) => !used.has(i) && block.node.eq(next.node));
    used.add(index);
    return index;
  });
  if (before.length === after.length && matches.every(index => index >= 0) && matches.some((index, i) => index !== i)) {
    return before.flatMap((block, i) => ranges.flatMap(range => {
      const start = Math.max(range.start, block.pos);
      const end = Math.min(range.end, block.pos + block.node.nodeSize);
      const delta = after[matches[i]].pos - block.pos;
      return start < end ? [{...range, start: start + delta, end: end + delta}] : [];
    }));
  }
  return ranges.map(range => ({...range, start: transaction.mapping.map(range.start, -1), end: transaction.mapping.map(range.end, -1)}));
}
