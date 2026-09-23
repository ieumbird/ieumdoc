import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { isNewBlockPath, NEW_BLOCK_PREFIX } from "./tiptap-document.ts";

// Editor commands for block insert/delete. Each command is one engine transaction;
// Save maps the result to Core insertParagraph/insertHeading/insertEquation/removeBlock. Only blocks whose
// Core create/edit/save path exists are listed.

export type SlashRange = { from: number; to: number };

export type InsertCommand = {
  id: string;
  label: string;
  keywords: string[];
  run(state: EditorState, index: number, slash?: SlashRange): Transaction;
};

export type BlockCommand = {
  id: string;
  label: string;
  enabled(state: EditorState, index: number): boolean;
  run(state: EditorState, index: number): Transaction;
};

/** Structural transactions carrying this meta come from an explicit block command. */
export const BLOCK_COMMAND_META = "blockCommand";

let nextNewBlock = 0;

export const INSERT_COMMANDS: InsertCommand[] = [
  {
    id: "paragraph",
    label: "Paragraph",
    keywords: ["text", "p"],
    run: insertParagraphAfter,
  },
  {
    id: "heading-1",
    label: "Heading 1",
    keywords: ["heading", "h1"],
    run: (state, index, slash) => insertHeadingAfter(state, index, 1, slash),
  },
  {
    id: "heading-2",
    label: "Heading 2",
    keywords: ["heading", "h2"],
    run: (state, index, slash) => insertHeadingAfter(state, index, 2, slash),
  },
  {
    id: "heading-3",
    label: "Heading 3",
    keywords: ["heading", "h3"],
    run: (state, index, slash) => insertHeadingAfter(state, index, 3, slash),
  },
  {
    id: "equation",
    label: "Equation",
    keywords: ["equation", "math", "latex"],
    run: insertEquationAfter,
  },
];

export const BLOCK_COMMANDS: BlockCommand[] = [
  {
    id: "delete",
    label: "Delete",
    // The engine document needs at least one block.
    enabled: (state, index) => state.doc.childCount > 1 && index >= 0 && index < state.doc.childCount,
    run: deleteBlock,
  },
];

export function filterInsertCommands(query: string): InsertCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return INSERT_COMMANDS;
  return INSERT_COMMANDS.filter(command =>
    [command.label, ...command.keywords].some(word => word.toLowerCase().startsWith(needle)));
}

/** An empty target paragraph is reused; otherwise a new paragraph follows the target block. */
export function insertParagraphAfter(state: EditorState, index: number, slash?: SlashRange): Transaction {
  if (!Number.isInteger(index) || index < 0 || index >= state.doc.childCount) throw new Error("invalid block index");
  const tr = closeHistory(state.tr);
  if (slash) tr.delete(slash.from, slash.to);
  let pos = 0;
  for (let i = 0; i < index; i++) pos += tr.doc.child(i).nodeSize;
  const target = tr.doc.child(index);
  if (target.type.name === "paragraph" && target.content.size === 0) {
    return tr.setSelection(TextSelection.create(tr.doc, pos + 1)).scrollIntoView();
  }
  const at = pos + target.nodeSize;
  const paragraph = state.schema.nodes.paragraph.create({ sourcePath: `${NEW_BLOCK_PREFIX}${++nextNewBlock}` });
  tr.insert(at, paragraph);
  return tr.setSelection(TextSelection.create(tr.doc, at + 1)).setMeta(BLOCK_COMMAND_META, true).scrollIntoView();
}

/** Insert an empty Equation after the target, reusing only a transient empty paragraph. */
export function insertEquationAfter(state: EditorState, index: number, slash?: SlashRange): Transaction {
  if (!Number.isInteger(index) || index < 0 || index >= state.doc.childCount) throw new Error("invalid block index");
  const tr = closeHistory(state.tr);
  if (slash) tr.delete(slash.from, slash.to);
  let pos = 0;
  for (let i = 0; i < index; i++) pos += tr.doc.child(i).nodeSize;
  const target = tr.doc.child(index);
  const sourcePath = String(target.attrs.sourcePath ?? "");
  if (target.type.name === "paragraph" && target.content.size === 0 && isNewBlockPath(sourcePath)) {
    tr.setNodeMarkup(pos, state.schema.nodes.equation, {
      sourcePath,
      latex: "",
      label: "",
    });
    return tr
      .setSelection(NodeSelection.create(tr.doc, pos))
      .setMeta(BLOCK_COMMAND_META, true)
      .scrollIntoView();
  }
  const at = pos + target.nodeSize;
  const equation = state.schema.nodes.equation.create({
    sourcePath: `${NEW_BLOCK_PREFIX}${++nextNewBlock}`,
    latex: "",
    label: "",
  });
  tr.insert(at, equation);
  return tr.setSelection(NodeSelection.create(tr.doc, at)).setMeta(BLOCK_COMMAND_META, true).scrollIntoView();
}

/** Insert a heading after the target, reusing a transient empty paragraph as its editable block. */
export function insertHeadingAfter(
  state: EditorState,
  index: number,
  level: number,
  slash?: SlashRange,
): Transaction {
  if (!Number.isInteger(index) || index < 0 || index >= state.doc.childCount) throw new Error("invalid block index");
  if (!Number.isInteger(level) || level < 1 || level > 6) throw new Error("invalid heading level");
  const tr = closeHistory(state.tr);
  if (slash) tr.delete(slash.from, slash.to);
  let pos = 0;
  for (let i = 0; i < index; i++) pos += tr.doc.child(i).nodeSize;
  const target = tr.doc.child(index);
  if (target.type.name === "paragraph" && target.content.size === 0 && isNewBlockPath(String(target.attrs.sourcePath ?? ""))) {
    tr.setNodeMarkup(pos, state.schema.nodes.heading, {
      level,
      sourcePath: target.attrs.sourcePath,
    });
    return tr
      .setSelection(TextSelection.create(tr.doc, pos + 1))
      .setMeta(BLOCK_COMMAND_META, true)
      .scrollIntoView();
  }
  const at = pos + target.nodeSize;
  const heading = state.schema.nodes.heading.create({
    level,
    sourcePath: `${NEW_BLOCK_PREFIX}${++nextNewBlock}`,
  });
  tr.insert(at, heading);
  return tr.setSelection(TextSelection.create(tr.doc, at + 1)).setMeta(BLOCK_COMMAND_META, true).scrollIntoView();
}

export function deleteBlock(state: EditorState, index: number): Transaction {
  if (state.doc.childCount <= 1 || !Number.isInteger(index) || index < 0 || index >= state.doc.childCount) {
    throw new Error("invalid block deletion");
  }
  let pos = 0;
  for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
  // The structure guard declares the snapshot blocks removed by this command.
  const tr = closeHistory(state.tr).delete(pos, pos + state.doc.child(index).nodeSize);
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size))));
  return tr.setMeta(BLOCK_COMMAND_META, true).scrollIntoView();
}

export type SlashQuery = SlashRange & { index: number; query: string };

/** A `/` typed at a paragraph start or after whitespace opens the insert menu. */
export function slashQueryAt(state: EditorState): SlashQuery | null {
  const { selection } = state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if ($from.depth !== 1 || $from.parent.type.name !== "paragraph") return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\n");
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(before);
  if (!match) return null;
  return {
    from: $from.pos - match[1].length - 1,
    to: $from.pos,
    index: $from.index(0),
    query: match[1],
  };
}

/** Inline formatting applies only to a text selection inside one paragraph. */
export function formattableSelection(state: EditorState): { from: number; to: number } | null {
  const { selection } = state;
  if (selection.empty || !(selection instanceof TextSelection)) return null;
  const { $from, $to } = selection;
  if (!$from.sameParent($to) || $from.parent.type.name !== "paragraph") return null;
  return { from: selection.from, to: selection.to };
}
