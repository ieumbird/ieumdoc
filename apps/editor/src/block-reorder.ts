import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { Selection, type EditorState, type Transaction } from "@tiptap/pm/state";

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
  tr.setSelection(Selection.near(tr.doc.resolve(target + (source.node.isTextblock ? 1 : 0))));
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
