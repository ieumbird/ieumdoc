import { Extension, type Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { endnoteOrder, footnoteNumbers, nextFootnoteLabel, orphanedEndnotes, type EndnoteBlock } from "@ieumdoc/core/numbering";

/**
 * The Editor's endnotes. MyST footnotes keep their syntax and node names (`footnoteReference`,
 * `footnoteDefinition`, and preserved definitions as `unsupportedBlock` with a `footnote` label);
 * the Editor presents their definitions as endnotes: one region after the body, ordered and
 * numbered by Core's endnote policy (`endnoteOrder`). A document Core opens is already in that
 * order, and canonical write places definitions again, so keeping the order while the user
 * edits is presentation: Save never depends on it.
 */

/** The label a top-level block defines as an endnote, editable or preserved; otherwise undefined. */
export function endnoteLabel(block: ProseMirrorNode): string | undefined {
  if (block.type.name === "footnoteDefinition") return String(block.attrs.label);
  return block.type.name === "unsupportedBlock" && block.attrs.footnote ? String(block.attrs.footnote) : undefined;
}

// Blocks are immutable and shared between engine documents, so an unchanged block is read once.
const referencesOf = new WeakMap<ProseMirrorNode, readonly string[]>();

/** Footnote references a top-level block holds, in document order: inline references in editable
 * content, or the ones Core read in a read-only block. */
function blockReferences(block: ProseMirrorNode): readonly string[] {
  let labels = referencesOf.get(block);
  if (!labels) {
    const found: string[] = [];
    if (Array.isArray(block.attrs.footnotes)) found.push(...block.attrs.footnotes as string[]);
    else block.descendants((node) => { if (node.type.name === "footnoteReference") found.push(String(node.attrs.label)); });
    referencesOf.set(block, labels = found);
  }
  return labels;
}

/** The engine document's top-level blocks as Core's endnote policy reads them. */
export function endnoteBlocks(doc: ProseMirrorNode): EndnoteBlock[] {
  const blocks: EndnoteBlock[] = [];
  doc.forEach((block) => {
    const definition = endnoteLabel(block);
    blocks.push({ ...(definition === undefined ? {} : { definition }), references: blockReferences(block) });
  });
  return blocks;
}

const numbersOf = new WeakMap<ProseMirrorNode, { numbers: Map<string, number>; defined: Set<string> }>();

/** An endnote's number as MyST shows it, in the order references are read; undefined when the
 * document defines no such endnote. Computed once per engine document; numbers are display only. */
export function endnoteNumber(doc: ProseMirrorNode, label: string): number | undefined {
  let numbering = numbersOf.get(doc);
  if (!numbering) {
    const blocks = endnoteBlocks(doc);
    numbering = {
      numbers: footnoteNumbers(blocks.flatMap(block => block.references)),
      defined: new Set(blocks.flatMap(block => block.definition === undefined ? [] : [block.definition])),
    };
    numbersOf.set(doc, numbering);
  }
  return numbering.defined.has(label) ? numbering.numbers.get(label) : undefined;
}

/** An endnote's number, following every change to the editor document. */
export function useEndnoteNumber(editor: Editor, label: string): number | undefined {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => current ? endnoteNumber(current.state.doc, label) : undefined,
  }) ?? undefined;
}

/** The top-level order that puts the endnotes after the body in endnote order, or undefined
 * when the document is already in it. Documents without endnotes are not read further. */
function endnotePlacement(doc: ProseMirrorNode): number[] | undefined {
  let endnotes = false;
  doc.forEach((block) => { endnotes ||= endnoteLabel(block) !== undefined; });
  if (!endnotes) return undefined;
  const order = endnoteOrder(endnoteBlocks(doc));
  return order.every((index, at) => index === at) ? undefined : order;
}

/**
 * Labels of the endnotes that removing the top-level blocks `removed` selects would leave with no
 * reference, as numbers the reader sees. Save refuses such a document.
 */
export function orphanedEndnoteNumbers(doc: ProseMirrorNode, removed: (index: number) => boolean): string[] {
  return orphanedEndnotes(endnoteBlocks(doc), removed).map(label => String(endnoteNumber(doc, label) ?? `[^${label}]`));
}

type ReturnPoint = { label: string; pos: number };
const returnPointKey = new PluginKey<ReturnPoint | null>("endnoteReturn");
const ORDER_META = "endnoteOrder";

/** Engine meta: a block draft closed, so a placement it postponed can run. */
export const ENDNOTE_DRAFT_CLOSED = "endnoteDraftClosed";

/** Move a position with its top-level block, for a reordering of the top-level blocks. */
function orderedPosition(doc: ProseMirrorNode, order: number[], pos: number): number {
  const index = doc.resolve(pos).index(0);
  if (index === doc.childCount) return doc.content.size;
  let before = 0;
  let after = 0;
  doc.forEach((node, _pos, at) => { if (at < index) before += node.nodeSize; });
  for (const at of order) { if (at === index) break; after += doc.child(at).nodeSize; }
  return after + pos - before;
}

/**
 * Keeps the endnotes after the body in endnote order as the user edits: an appended transaction,
 * so the placement shares the edit's history event and selection moves with its block. It waits
 * while `canOrder` is false (a block holds an open draft its view would lose) and runs again when
 * a draft closes. Also remembers the reference an endnote was reached from, to return to it.
 */
export function endnotesPlugin(canOrder: () => boolean = () => true): Plugin<ReturnPoint | null> {
  return new Plugin<ReturnPoint | null>({
    key: returnPointKey,
    state: {
      init: () => null,
      apply(tr, point) {
        const visited = tr.getMeta(returnPointKey) as ReturnPoint | undefined;
        if (visited) return visited;
        if (!point) return null;
        const order = tr.getMeta(ORDER_META) as number[] | undefined;
        const mapped = order ? { pos: orderedPosition(tr.before, order, point.pos), deleted: false } : tr.mapping.mapResult(point.pos);
        const node = tr.doc.nodeAt(mapped.pos);
        return !mapped.deleted && node?.type.name === "footnoteReference" && node.attrs.label === point.label
          ? { ...point, pos: mapped.pos } : null;
      },
    },
    appendTransaction(transactions, _old, state) {
      if (!transactions.some(tr => tr.docChanged || tr.getMeta(ENDNOTE_DRAFT_CLOSED)) || !canOrder()) return null;
      const order = endnotePlacement(state.doc);
      if (!order) return null;
      // Replace only the span whose blocks move; blocks outside it keep their views.
      let first = 0;
      let last = order.length;
      while (order[first] === first) first++;
      while (last > first && order[last - 1] === last - 1) last--;
      let from = 0;
      let to = 0;
      state.doc.forEach((node, _pos, index) => { if (index < first) from += node.nodeSize; if (index < last) to += node.nodeSize; });
      const tr = state.tr.replaceWith(from, to, order.slice(first, last).map(index => state.doc.child(index)));
      const selected = state.selection.toJSON();
      if (selected.anchor !== undefined) selected.anchor = orderedPosition(state.doc, order, selected.anchor);
      if (selected.head !== undefined) selected.head = orderedPosition(state.doc, order, selected.head);
      return tr.setSelection(Selection.fromJSON(tr.doc, selected)).setMeta(ORDER_META, order);
    },
  });
}

/** The engine extension of `endnotesPlugin`. */
export const Endnotes = Extension.create<{ canOrder(): boolean }>({
  name: "endnotes",
  addOptions() { return { canOrder: () => true }; },
  addProseMirrorPlugins() { return [endnotesPlugin(this.options.canOrder)]; },
});

/** Every footnote label the editor document uses, defined or referenced. */
function footnoteLabels(doc: ProseMirrorNode): string[] {
  return endnoteBlocks(doc).flatMap(block => [...block.references, ...(block.definition === undefined ? [] : [block.definition])]);
}

/** Go to the endnote `label`: the caret at the end of an editable one, a read-only one selected;
 * false when there is none. Its number returns to `referencePos`. */
export function revealEndnote(editor: Editor, label: string, referencePos?: number): boolean {
  const { doc } = editor.state;
  let target: ProseMirrorNode | undefined;
  let at = 0;
  doc.forEach((block, pos) => { if (!target && endnoteLabel(block) === label) { target = block; at = pos; } });
  if (!target) return false;
  const selection = target.type.name === "footnoteDefinition"
    ? TextSelection.create(doc, at + 1 + target.content.size) : NodeSelection.create(doc, at);
  return reveal(editor, selection, at, referencePos === undefined ? undefined : { label, pos: referencePos });
}

/** Return to the invoking reference, falling back to the first remaining reference or its read-only block. */
export function revealReference(editor: Editor, label: string): boolean {
  const { doc } = editor.state;
  const point = returnPointKey.getState(editor.state);
  if (point?.label === label) return reveal(editor, NodeSelection.create(doc, point.pos), point.pos);
  let found: number | undefined;
  doc.forEach((block, pos) => {
    if (found !== undefined || !blockReferences(block).includes(label)) return;
    if (Array.isArray(block.attrs.footnotes)) {
      found = pos;
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

function reveal(editor: Editor, selection: Selection, pos: number, point?: ReturnPoint): boolean {
  const tr = editor.state.tr.setSelection(selection);
  if (point) tr.setMeta(returnPointKey, point);
  editor.view.dispatch(tr);
  editor.view.focus();
  const element = editor.view.nodeDOM(pos);
  if (element instanceof HTMLElement) element.scrollIntoView({ block: "center" });
  return true;
}

/**
 * Replace a slash query in a paragraph, and the space before it, with a new endnote: a reference
 * keeping the bold/italic marks there, and an empty definition that takes the caret in the
 * endnotes region. The label is Core's next unused number. Save writes both through Core.
 */
export function insertEndnote(editor: Editor, range: { from: number; to: number }, sourcePath: string): boolean {
  const { state } = editor;
  const $from = state.doc.resolve(range.from);
  if ($from.depth !== 1 || $from.parent.type.name !== "paragraph" || !$from.sameParent(state.doc.resolve(range.to))) return false;
  const label = nextFootnoteLabel(footnoteLabels(state.doc));
  const marks = (state.storedMarks ?? $from.marks()).filter((mark) => mark.type.name === "bold" || mark.type.name === "italic");
  // `/` opens after a space; the reference follows the word, as footnotes are written.
  const from = range.from > $from.start() && state.doc.textBetween(range.from - 1, range.from) === " " ? range.from - 1 : range.from;
  const tr = closeHistory(state.tr).replaceWith(from, range.to, state.schema.nodes.footnoteReference.create({ label }, null, marks));
  // Appended with the endnotes; placement then moves it, and the caret, to its reference's place.
  const end = tr.doc.content.size;
  tr.insert(end, state.schema.nodes.footnoteDefinition.create({ sourcePath, label }));
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1))
    .setMeta(returnPointKey, { label, pos: from }).scrollIntoView());
  editor.view.focus();
  return true;
}

export const ENDNOTE_COMMAND = "endnote";

/** The slash menu's Endnote item, when the query asks for it. */
export function endnoteCommandItems(query: string): { id: string; label: string; group: string }[] {
  const needle = query.toLowerCase();
  return needle.length === 0 || ["endnote", "en", "footnote", "fn", "미주"].some((word) => word.startsWith(needle))
    ? [{ id: ENDNOTE_COMMAND, label: "Endnote", group: "References" }] : [];
}
