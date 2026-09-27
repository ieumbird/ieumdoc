import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import type { AdmonitionVariant } from "@ieumdoc/core";
import { isNewBlockPath, NEW_BLOCK_PREFIX, TABLE_CELL_ADDED_ATTR } from "./tiptap-document.ts";

// Editor commands for block insert/delete and table rows/columns. Each command is one engine
// transaction; Save maps the result to Core insertParagraph/insertHeading/insertEquation/
// insertFigure/insertTable/insertTableRow/insertTableColumn/removeBlock. Only blocks whose Core
// create/edit/save path exists are listed.

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
  /** Whether the block menu lists this command for the block at all; default: every block. */
  applies?(state: EditorState, index: number): boolean;
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
    id: "note",
    label: "Note",
    keywords: ["note", "admonition"],
    run: (state, index, slash) => insertAdmonitionAfter(state, index, "note", slash),
  },
  {
    id: "warning",
    label: "Warning",
    keywords: ["warning", "admonition"],
    run: (state, index, slash) => insertAdmonitionAfter(state, index, "warning", slash),
  },
  {
    id: "equation",
    label: "Equation",
    keywords: ["equation", "math", "latex"],
    run: insertEquationAfter,
  },
  {
    id: "figure",
    label: "Figure",
    keywords: ["figure", "image", "picture"],
    run: insertFigureAfter,
  },
  {
    id: "table",
    label: "Table",
    keywords: ["table", "grid"],
    run: insertTableAfter,
  },
];

const isTable = (state: EditorState, index: number) => state.doc.maybeChild(index)?.type.name === "table";
const isHeading = (state: EditorState, index: number) => state.doc.maybeChild(index)?.type.name === "heading";

export const BLOCK_COMMANDS: BlockCommand[] = [
  ...Array.from({ length: 6 }, (_, index) => {
    const level = index + 1;
    return {
      id: `heading-level-${level}`,
      label: `Change to Heading ${level}`,
      applies: isHeading,
      enabled: (state: EditorState, block: number) =>
        isHeading(state, block) && Number(state.doc.child(block).attrs.level) !== level,
      run: (state: EditorState, block: number) => changeHeadingLevel(state, block, level),
    };
  }),
  {
    id: "table-row",
    label: "Add row below",
    applies: isTable,
    enabled: isTable,
    run: addTableRowBelow,
  },
  {
    id: "table-column",
    label: "Add column right",
    applies: isTable,
    enabled: isTable,
    run: addTableColumnRight,
  },
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
  return insertAtomAfter(state, index, "equation", { latex: "", label: "" }, slash);
}

/** Insert an empty, unlabeled Figure after the target, reusing only a transient empty paragraph. */
export function insertFigureAfter(state: EditorState, index: number, slash?: SlashRange): Transaction {
  return insertAtomAfter(state, index, "figure", {
    label: "",
    imageUrl: "",
    imageAlt: "",
    caption: "",
    editable: true,
  }, slash);
}

/** The new atom block is node-selected so its NodeView opens its authoring UI. */
function insertAtomAfter(
  state: EditorState,
  index: number,
  type: "equation" | "figure",
  attrs: Record<string, unknown>,
  slash?: SlashRange,
): Transaction {
  if (!Number.isInteger(index) || index < 0 || index >= state.doc.childCount) throw new Error("invalid block index");
  const tr = closeHistory(state.tr);
  if (slash) tr.delete(slash.from, slash.to);
  let pos = 0;
  for (let i = 0; i < index; i++) pos += tr.doc.child(i).nodeSize;
  const target = tr.doc.child(index);
  const sourcePath = String(target.attrs.sourcePath ?? "");
  if (target.type.name === "paragraph" && target.content.size === 0 && isNewBlockPath(sourcePath)) {
    tr.setNodeMarkup(pos, state.schema.nodes[type], { sourcePath, ...attrs });
    return tr
      .setSelection(NodeSelection.create(tr.doc, pos))
      .setMeta(BLOCK_COMMAND_META, true)
      .scrollIntoView();
  }
  const at = pos + target.nodeSize;
  tr.insert(at, state.schema.nodes[type].create({ sourcePath: `${NEW_BLOCK_PREFIX}${++nextNewBlock}`, ...attrs }));
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

/** Insert an editable Note or Warning after the target, reusing a transient empty paragraph. */
export function insertAdmonitionAfter(
  state: EditorState,
  index: number,
  variant: AdmonitionVariant,
  slash?: SlashRange,
): Transaction {
  if (!Number.isInteger(index) || index < 0 || index >= state.doc.childCount) throw new Error("invalid block index");
  const tr = closeHistory(state.tr);
  if (slash) tr.delete(slash.from, slash.to);
  const pos = blockPos(state, index);
  const target = tr.doc.child(index);
  const sourcePath = String(target.attrs.sourcePath ?? "");
  if (target.type.name === "paragraph" && target.content.size === 0 && isNewBlockPath(sourcePath)) {
    tr.setNodeMarkup(pos, state.schema.nodes.admonition, {
      sourcePath,
      variant,
      text: "",
      editable: true,
    });
    return tr
      .setSelection(TextSelection.create(tr.doc, pos + 1))
      .setMeta(BLOCK_COMMAND_META, true)
      .scrollIntoView();
  }
  const at = pos + target.nodeSize;
  tr.insert(at, state.schema.nodes.admonition.create({
    sourcePath: `${NEW_BLOCK_PREFIX}${++nextNewBlock}`,
    variant,
    text: "",
    editable: true,
  }));
  return tr
    .setSelection(TextSelection.create(tr.doc, at + 1))
    .setMeta(BLOCK_COMMAND_META, true)
    .scrollIntoView();
}

/** Change the level of an existing editable Heading. */
export function changeHeadingLevel(state: EditorState, index: number, level: number): Transaction {
  if (!isHeading(state, index)) throw new Error("heading level changes require a Heading block");
  if (!Number.isInteger(level) || level < 1 || level > 6) throw new Error("invalid heading level");
  const pos = blockPos(state, index);
  const heading = state.doc.child(index);
  if (Number(heading.attrs.level) === level) return state.tr;
  return closeHistory(state.tr)
    .setNodeMarkup(pos, undefined, { ...heading.attrs, level })
    .setMeta(BLOCK_COMMAND_META, true)
    .scrollIntoView();
}

const NEW_TABLE_COLUMNS = 3;
const NEW_TABLE_ROWS = 3; // The header row and two body rows.

/** Insert an empty table after the target, reusing only a transient empty paragraph; the caret goes to its first cell. */
export function insertTableAfter(state: EditorState, index: number, slash?: SlashRange): Transaction {
  if (!Number.isInteger(index) || index < 0 || index >= state.doc.childCount) throw new Error("invalid block index");
  const tr = closeHistory(state.tr);
  if (slash) tr.delete(slash.from, slash.to);
  let pos = 0;
  for (let i = 0; i < index; i++) pos += tr.doc.child(i).nodeSize;
  const target = tr.doc.child(index);
  const reuse = target.type.name === "paragraph" && target.content.size === 0 && isNewBlockPath(String(target.attrs.sourcePath ?? ""));
  const { table, tableRow, tableCell } = state.schema.nodes;
  // Cells of a new table are part of the new block, so they are not marked as added.
  const node = table.create(
    { sourcePath: reuse ? target.attrs.sourcePath : `${NEW_BLOCK_PREFIX}${++nextNewBlock}` },
    Array.from({ length: NEW_TABLE_ROWS }, (_, row) =>
      tableRow.create(null, Array.from({ length: NEW_TABLE_COLUMNS }, () => tableCell.create({ header: row === 0 })))),
  );
  const at = reuse ? pos : pos + target.nodeSize;
  if (reuse) tr.replaceWith(pos, pos + target.nodeSize, node);
  else tr.insert(at, node);
  // Inside the table, its first row and its first cell.
  return tr.setSelection(TextSelection.create(tr.doc, at + 3)).setMeta(BLOCK_COMMAND_META, true).scrollIntoView();
}

/** The caret's cell when it is inside the table at `index`. */
function tableCellAt(state: EditorState, index: number): { row: number; column: number } | undefined {
  const { $from } = state.selection;
  if ($from.depth < 3 || $from.index(0) !== index) return undefined;
  return { row: $from.index(1), column: $from.index(2) };
}

function blockPos(state: EditorState, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
  return pos;
}

function addedCell(state: EditorState, header: boolean) {
  return state.schema.nodes.tableCell.create({ header, [TABLE_CELL_ADDED_ATTR]: `${NEW_BLOCK_PREFIX}${++nextNewBlock}` });
}

/** Add an empty row below the caret's row, or below the last row; the caret moves into it. */
export function addTableRowBelow(state: EditorState, index: number): Transaction {
  if (!isTable(state, index)) throw new Error("invalid table index");
  const table = state.doc.child(index);
  const current = tableCellAt(state, index);
  const row = (current?.row ?? table.childCount - 1) + 1;
  const cells = Array.from({ length: table.child(0).childCount }, () => addedCell(state, false));
  let at = blockPos(state, index) + 1;
  for (let i = 0; i < row; i++) at += table.child(i).nodeSize;
  const tr = closeHistory(state.tr).insert(at, state.schema.nodes.tableRow.create(null, cells));
  // Empty cells are two positions wide: into the new row, past the cells before the caret's column.
  const caret = at + 2 + 2 * (current?.column ?? 0);
  return tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView();
}

/** Add an empty column right of the caret's column, or right of the last column; the caret moves into it. */
export function addTableColumnRight(state: EditorState, index: number): Transaction {
  if (!isTable(state, index)) throw new Error("invalid table index");
  const table = state.doc.child(index);
  const current = tableCellAt(state, index);
  const column = (current?.column ?? table.child(0).childCount - 1) + 1;
  const tr = closeHistory(state.tr);
  let rowPos = blockPos(state, index) + 1;
  let caret = 0;
  table.forEach((row, _offset, rowIndex) => {
    let at = rowPos + 1;
    for (let i = 0; i < column; i++) at += row.child(i).nodeSize;
    const mapped = tr.mapping.map(at);
    tr.insert(mapped, addedCell(state, rowIndex === 0));
    if (rowIndex === (current?.row ?? 0)) caret = mapped + 1;
    rowPos += row.nodeSize;
  });
  return tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView();
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
  const parent = $from.parent;
  const editableInlineParent = parent.type.name === "paragraph" ||
    (parent.type.name === "admonition" && parent.attrs.editable === true);
  if (!$from.sameParent($to) || !editableInlineParent) return null;
  return { from: selection.from, to: selection.to };
}
