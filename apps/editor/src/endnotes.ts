import { i18n } from "./i18n.ts";
import { Extension, type Editor } from "@tiptap/core";
import { closeHistory, isHistoryTransaction } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type EditorState } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { endnoteOrder, footnoteNumbers, nextFootnoteLabel, orphanedEndnotes, type EndnoteBlock } from "@ieumdoc/core/numbering";
import { LABEL_PROPERTIES_META } from "./label-rename.ts";

/**
 * The Editor's endnotes. MyST footnotes keep their syntax and node names (`footnoteReference`,
 * `footnoteDefinition`);
 * the Editor presents their definitions as endnotes: one region after the body, ordered and
 * numbered by Core's endnote policy (`endnoteOrder`). A document Core opens is already in that
 * order, and canonical write places definitions again, so keeping the order while the user
 * edits is presentation: Save never depends on it.
 */

/** The label a top-level block defines as an endnote, otherwise undefined. */
export function endnoteLabel(block: ProseMirrorNode): string | undefined {
  if (block.type.name === "footnoteDefinition") return String(block.attrs.label);
  return undefined;
}

// Blocks are immutable and shared between engine documents, so an unchanged block is read once.
const referencesOf = new WeakMap<ProseMirrorNode, readonly string[]>();

/** Footnote references a top-level block holds, in document order: inline references in native content. */
function blockReferences(block: ProseMirrorNode): readonly string[] {
  let labels = referencesOf.get(block);
  if (!labels) {
    const found: string[] = [];
    const visit = (node: ProseMirrorNode) => { if (node.type.name === "footnoteReference") found.push(String(node.attrs.label)); };
    if (block.type.name === "table") {
      if (block.lastChild?.type.name === "tableCaption") block.lastChild.descendants(visit);
      block.forEach(row => { if (row.type.name === "tableRow") row.descendants(visit); });
    } else block.descendants(visit);
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

/** Ephemeral editor interaction, never a document attribute or history event. */
export const endnoteEditingKey = new PluginKey<string | null>("endnoteEditing");
const ownerTokens = new WeakMap<Editor, string>();
let nextOwnerToken = 0;

export function endnoteEditorToken(editor: Editor): string {
  let token = ownerTokens.get(editor);
  if (!token) ownerTokens.set(editor, token = `endnote-editor-${++nextOwnerToken}`);
  return token;
}

export function endnoteAt(state: EditorState, pos: number): string | null {
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === "footnoteDefinition") return String($pos.node(depth).attrs.label);
  }
  return null;
}

/** Inline editors inside a definition follow that definition's explicit edit session. */
export function canEditEndnoteAt(state: EditorState, pos: number): boolean {
  const label = endnoteAt(state, pos);
  return label === null || endnoteEditingKey.getState(state) === label;
}

export function setEndnoteEditing(editor: Editor, label: string | null): void {
  editor.view.dispatch(editor.state.tr.setMeta(endnoteEditingKey, label));
}

/** Protect native input crossing a read-only definition while retaining engine history and
 * explicit whole-block deletion. Other semantic operations may update references elsewhere. */
export function endnoteEditingPlugin(): Plugin<string | null> {
  return new Plugin<string | null>({
    key: endnoteEditingKey,
    state: {
      init: () => null,
      apply(tr, active, _oldState, newState) {
        const requested = tr.getMeta(endnoteEditingKey) as string | null | undefined;
        if (requested !== undefined) return requested;
        if (!active) return null;
        const { selection } = tr;
        return endnoteAt(newState, selection.from) === active && endnoteAt(newState, selection.to) === active ? active : null;
      },
    },
    filterTransaction(tr, state) {
      if (!tr.docChanged || isHistoryTransaction(tr) || tr.getMeta(ORDER_META) || tr.getMeta("blockCommand") ||
          tr.getMeta(LABEL_PROPERTIES_META)) return true;
      // A whole-document selection alone says nothing about a drop or targeted
      // transaction. Composition can first normalize AllSelection to text positions
      // just inside the outer blocks; ProseMirror's fitted replacement also consumes
      // the last block's closing boundary. Restrict that case to composition input.
      const { selection, doc } = state;
      const uiEvent = tr.getMeta("uiEvent");
      const wholeSelection = selection.from === 0 && selection.to === doc.content.size;
      const wholeComposition = !selection.empty && selection.from === 1 && selection.to === doc.content.size - 1 &&
        tr.getMeta("composition") !== undefined && uiEvent !== "paste";
      if ((wholeSelection || wholeComposition) && uiEvent !== "drop") {
        let replacesDocument = false;
        tr.steps[0]?.getMap().forEach((from, to) => {
          if (from === (wholeSelection ? 0 : selection.from) && to === doc.content.size) replacesDocument = true;
        });
        if (replacesDocument) return true;
      }
      const active = endnoteEditingKey.getState(state);
      // Compare the actual immutable nodes, not the previous selection: a drop can target a
      // different block, and mark/attribute steps may have an empty positional step map.
      const after = new Map<string, ProseMirrorNode>();
      tr.doc.forEach(node => { const label = endnoteLabel(node); if (label !== undefined) after.set(label, node); });
      let allowed = true;
      state.doc.forEach(node => {
        const label = endnoteLabel(node);
        if (label === undefined || label === active) return;
        const replacement = after.get(label);
        if (!replacement || !replacement.content.eq(node.content)) allowed = false;
      });
      return allowed;
    },
    appendTransaction(transactions, _oldState, state) {
      if (endnoteEditingKey.getState(state) || !transactions.some(tr => tr.selectionSet)) return null;
      const { selection } = state;
      if (!(selection instanceof TextSelection) || !selection.empty) return null;
      const label = endnoteAt(state, selection.from);
      if (!label) return null;
      let pos: number | undefined;
      state.doc.forEach((node, at) => { if (endnoteLabel(node) === label) pos = at; });
      return pos === undefined ? null : state.tr.setSelection(NodeSelection.create(state.doc, pos));
    },
    props: {
      handleDOMEvents: {
        focus(view) {
          const { state } = view;
          if (endnoteEditingKey.getState(state) || !(state.selection instanceof TextSelection) || !state.selection.empty) return false;
          const label = endnoteAt(state, state.selection.from);
          if (!label) return false;
          state.doc.forEach((node, pos) => {
            if (endnoteLabel(node) === label) view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
          });
          return false;
        },
      },
    },
  });
}

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
  priority: 125,
  addOptions() { return { canOrder: () => true }; },
  addProseMirrorPlugins() { return [endnoteEditingPlugin(), endnotesPlugin(this.options.canOrder)]; },
  addKeyboardShortcuts() {
    const selectAdjacent = (direction: -1 | 1) => {
      const { state, view } = this.editor;
      const { selection, doc } = state;
      if (view.composing) return false;
      if (selection instanceof NodeSelection && selection.node.type.name === "footnoteDefinition") {
        const adjacent = direction > 0 ? doc.nodeAt(selection.to) : doc.resolve(selection.from).nodeBefore;
        if (endnoteLabel(adjacent ?? doc) === undefined) return false;
        const pos = direction > 0 ? selection.to : selection.from - adjacent!.nodeSize;
        view.dispatch(state.tr.setSelection(NodeSelection.create(doc, pos)));
        return true;
      }
      if (direction < 0 || !selection.empty || selection.$from.depth !== 1 ||
          selection.$from.parentOffset !== selection.$from.parent.content.size) return false;
      const pos = selection.$from.after();
      if (endnoteLabel(doc.nodeAt(pos) ?? doc) === undefined) return false;
      view.dispatch(state.tr.setSelection(NodeSelection.create(doc, pos)));
      return true;
    };
    return {
      ArrowRight: () => selectAdjacent(1),
      ArrowDown: () => selectAdjacent(1),
      ArrowLeft: () => selectAdjacent(-1),
      ArrowUp: () => selectAdjacent(-1),
      Enter: () => {
        const { state, view } = this.editor;
        const selection = state.selection;
        if (view.composing || !(selection instanceof NodeSelection) || selection.node.type.name !== "footnoteDefinition") return false;
        const label = String(selection.node.attrs.label);
        view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, selection.to - 1)).setMeta(endnoteEditingKey, label));
        return true;
      },
      Escape: () => {
        const { state, view } = this.editor;
        const label = endnoteEditingKey.getState(state);
        if (!label || view.composing) return false;
        let pos: number | undefined;
        state.doc.forEach((node, at) => { if (endnoteLabel(node) === label) pos = at; });
        if (pos === undefined) return false;
        view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)).setMeta(endnoteEditingKey, null));
        return true;
      },
    };
  },
});

/** Every footnote label the editor document uses, defined or referenced. */
function footnoteLabels(doc: ProseMirrorNode): string[] {
  return endnoteBlocks(doc).flatMap(block => [...block.references, ...(block.definition === undefined ? [] : [block.definition])]);
}

/** Go to the endnote `label`: the caret at the end of its definition;
 * false when there is none. Its number returns to `referencePos`. */
export function revealEndnote(editor: Editor, label: string, referencePos?: number): boolean {
  const { doc } = editor.state;
  let target: ProseMirrorNode | undefined;
  let at = 0;
  doc.forEach((block, pos) => { if (!target && endnoteLabel(block) === label) { target = block; at = pos; } });
  if (!target) return false;
  const selection = NodeSelection.create(doc, at);
  return reveal(editor, selection, at, referencePos === undefined ? undefined : { label, pos: referencePos });
}

/** Return to the invoking reference, falling back to the first remaining reference . */
export function revealReference(editor: Editor, label: string): boolean {
  const { doc } = editor.state;
  const point = returnPointKey.getState(editor.state);
  if (point?.label === label) return reveal(editor, NodeSelection.create(doc, point.pos), point.pos);
  let found: number | undefined;
  doc.forEach((block, pos) => {
    if (found !== undefined || !blockReferences(block).includes(label)) return;
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
 * Replace a slash query in supported inline content, and the space before it, with a new endnote: a reference
 * keeping the bold/italic marks there, and an empty definition that takes the caret in the
 * endnotes region. The label is Core's next unused number. Save writes both through Core.
 */
export function insertEndnote(editor: Editor, range: { from: number; to: number }, sourcePath: string): boolean {
  const { state } = editor;
  const $from = state.doc.resolve(range.from);
  if (!$from.sameParent(state.doc.resolve(range.to)) ||
      !$from.parent.canReplaceWith($from.index(), $from.index(), state.schema.nodes.footnoteReference)) return false;
  const label = nextFootnoteLabel(footnoteLabels(state.doc));
  const marks = (state.storedMarks ?? $from.marks()).filter((mark) => mark.type.name === "bold" || mark.type.name === "italic");
  // `/` opens after a space; the reference follows the word, as footnotes are written.
  const from = range.from > $from.start() && state.doc.textBetween(range.from - 1, range.from) === " " ? range.from - 1 : range.from;
  const tr = closeHistory(state.tr).replaceWith(from, range.to, state.schema.nodes.footnoteReference.create({ label }, null, marks));
  // Appended with the endnotes; placement then moves it, and the caret, to its reference's place.
  const end = tr.doc.content.size;
  tr.insert(end, state.schema.nodes.footnoteDefinition.create({ sourcePath, label }));
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, end + 1))
    .setMeta(returnPointKey, { label, pos: from }).setMeta(endnoteEditingKey, label).scrollIntoView());
  editor.view.focus();
  return true;
}

export const ENDNOTE_COMMAND = "endnote";

/** The slash menu's Endnote item, when the query asks for it. */
export function endnoteCommandItems(query: string): { id: string; label: string; group: string }[] {
  const needle = query.toLowerCase();
  return needle.length === 0 || ["endnote", "en", "footnote", "fn", "미주"].some((word) => word.startsWith(needle))
    ? [{ id: ENDNOTE_COMMAND, label: i18n.t("Endnote"), group: i18n.t("References") }] : [];
}
