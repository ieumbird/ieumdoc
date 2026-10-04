import { closeHistory } from "@tiptap/pm/history";
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { ADMONITION_VARIANTS, type AdmonitionVariant, type FigureContent } from "@ieumdoc/core";
import { isNewBlockPath, NEW_BLOCK_PREFIX } from "./tiptap-document.ts";

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
  /** Why the command cannot run on this block; the menu reports it and leaves the document unchanged. */
  rejection?(state: EditorState, index: number): string | undefined;
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
  ...Array.from({ length: 6 }, (_, index): InsertCommand => ({
    id: `heading-${index + 1}`,
    label: `Heading ${index + 1}`,
    keywords: ["heading", `h${index + 1}`],
    run: (state, block, slash) => insertHeadingAfter(state, block, index + 1, slash),
  })),
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
    id: "quote",
    label: "Quote",
    keywords: ["quote", "blockquote", "citation"],
    run: insertQuoteAfter,
  },
  {
    id: "divider",
    label: "Divider",
    keywords: ["divider", "hr", "rule", "separator", "line"],
    run: insertDividerAfter,
  },
  {
    id: "bulleted-list",
    label: "Bulleted list",
    keywords: ["list", "bullet", "ul"],
    run: (state, index, slash) => insertListAfter(state, index, false, slash),
  },
  {
    id: "numbered-list",
    label: "Numbered list",
    keywords: ["list", "numbered", "ordered", "ol"],
    run: (state, index, slash) => insertListAfter(state, index, true, slash),
  },
  {
    id: "code-block",
    label: "Code block",
    keywords: ["code", "pre", "snippet"],
    run: insertCodeBlockAfter,
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

/** Display names of MyST's standard admonition kinds, in menu order. */
export const ADMONITION_LABELS: Record<AdmonitionVariant, string> = {
  note: "Note", tip: "Tip", hint: "Hint", important: "Important", seealso: "See also",
  attention: "Attention", caution: "Caution", warning: "Warning", danger: "Danger", error: "Error",
};

/** The visual tone of a kind: informational, cautionary or dangerous. */
export function admonitionTone(variant: string): "note" | "warning" | "danger" {
  if (variant === "danger" || variant === "error") return "danger";
  return ["attention", "caution", "warning"].includes(variant) ? "warning" : "note";
}

const isTable = (state: EditorState, index: number) => state.doc.maybeChild(index)?.type.name === "table";
const isEditableAdmonition = (state: EditorState, index: number) => {
  const node = state.doc.maybeChild(index);
  return node?.type.name === "admonition" && node.attrs.editable === true;
};
const isHeading = (state: EditorState, index: number) => state.doc.maybeChild(index)?.type.name === "heading";
const isParagraph = (state: EditorState, index: number) => state.doc.maybeChild(index)?.type.name === "paragraph";
const isTextBlock = (state: EditorState, index: number) => isHeading(state, index) || isParagraph(state, index);

export const BLOCK_COMMANDS: BlockCommand[] = [
  {
    id: "paragraph",
    label: "Change to Paragraph",
    applies: isHeading,
    enabled: isHeading,
    run: headingToParagraph,
  },
  ...Array.from({ length: 6 }, (_, index) => {
    const level = index + 1;
    return {
      id: `heading-level-${level}`,
      label: `Change to Heading ${level}`,
      applies: isTextBlock,
      enabled: (state: EditorState, block: number) =>
        isParagraph(state, block) || (isHeading(state, block) && Number(state.doc.child(block).attrs.level) !== level),
      rejection: (state: EditorState, block: number) =>
        isParagraph(state, block) ? paragraphToHeadingRejection(state, block) : undefined,
      run: (state: EditorState, block: number) => isParagraph(state, block)
        ? paragraphToHeading(state, block, level)
        : changeHeadingLevel(state, block, level),
    };
  }),
  ...ADMONITION_VARIANTS.map((variant): BlockCommand => ({
    id: `admonition-${variant}`,
    label: `Change to ${ADMONITION_LABELS[variant]}`,
    applies: isEditableAdmonition,
    enabled: (state, block) => isEditableAdmonition(state, block) && state.doc.child(block).attrs.variant !== variant,
    run: (state, block) => changeAdmonitionVariant(state, block, variant),
  })),
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
  // These act on the caret's cell; the header row stays first.
  {
    id: "table-row-up",
    label: "Move row up",
    applies: isTable,
    enabled: (state, index) => (caretTable(state, index)?.row ?? 0) > 1,
    run: (state, index) => moveTableRow(state, index, -1),
  },
  {
    id: "table-row-down",
    label: "Move row down",
    applies: isTable,
    enabled: (state, index) => { const caret = caretTable(state, index); return !!caret && caret.row > 0 && caret.row < caret.rows - 1; },
    run: (state, index) => moveTableRow(state, index, 1),
  },
  {
    id: "table-column-left",
    label: "Move column left",
    applies: isTable,
    enabled: (state, index) => (caretTable(state, index)?.column ?? 0) > 0,
    run: (state, index) => moveTableColumn(state, index, -1),
  },
  {
    id: "table-column-right",
    label: "Move column right",
    applies: isTable,
    enabled: (state, index) => { const caret = caretTable(state, index); return !!caret && caret.column < caret.columns - 1; },
    run: (state, index) => moveTableColumn(state, index, 1),
  },
  ...(["left", "center", "right", ""] as const).map((align): BlockCommand => ({
    id: `table-align-${align || "none"}`,
    label: align ? `Align column ${align}` : "Clear column alignment",
    applies: isTable,
    enabled: (state, index) => { const caret = caretTable(state, index); return !!caret && caret.align !== align; },
    run: (state, index) => alignTableColumn(state, index, align),
  })),
  {
    id: "table-row-delete",
    label: "Delete row",
    applies: isTable,
    enabled: (state, index) => (caretTable(state, index)?.row ?? 0) > 0,
    run: removeTableRow,
  },
  {
    id: "table-column-delete",
    label: "Delete column",
    applies: isTable,
    enabled: (state, index) => (caretTable(state, index)?.columns ?? 0) > 1,
    run: removeTableColumn,
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

/** Insert an unlabeled Figure with an empty caption and optional applied image, reusing transient empty prose. */
export function insertFigureAfter(state: EditorState, index: number, slash?: SlashRange, applied?: Pick<FigureContent, "imageUrl" | "imageAlt">): Transaction {
  return insertAtomAfter(state, index, "figure", {
    label: "",
    imageUrl: "",
    imageAlt: "",
    caption: "",
    editable: true,
    ...applied,
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

/** Insert a list with one empty item after the target, reusing a transient empty paragraph; the caret goes into the item. */
export function insertListAfter(state: EditorState, index: number, ordered: boolean, slash?: SlashRange): Transaction {
  if (!Number.isInteger(index) || index < 0 || index >= state.doc.childCount) throw new Error("invalid block index");
  const tr = closeHistory(state.tr);
  if (slash) tr.delete(slash.from, slash.to);
  const pos = blockPos(state, index);
  const target = tr.doc.child(index);
  const reuse = target.type.name === "paragraph" && target.content.size === 0 && isNewBlockPath(String(target.attrs.sourcePath ?? ""));
  const { bulletList, orderedList, listItem, paragraph } = state.schema.nodes;
  const list = (ordered ? orderedList : bulletList).create(
    { sourcePath: reuse ? target.attrs.sourcePath : `${NEW_BLOCK_PREFIX}${++nextNewBlock}` },
    listItem.create(null, paragraph.create()),
  );
  const at = reuse ? pos : pos + target.nodeSize;
  if (reuse) tr.replaceWith(pos, pos + target.nodeSize, list);
  else tr.insert(at, list);
  // Inside the list, its item and the item's paragraph.
  return tr.setSelection(TextSelection.create(tr.doc, at + 3)).setMeta(BLOCK_COMMAND_META, true).scrollIntoView();
}

/** Insert an empty code block after the target, reusing a transient empty paragraph; the caret goes into it. */
export function insertCodeBlockAfter(state: EditorState, index: number, slash?: SlashRange): Transaction {
  if (!Number.isInteger(index) || index < 0 || index >= state.doc.childCount) throw new Error("invalid block index");
  const tr = closeHistory(state.tr);
  if (slash) tr.delete(slash.from, slash.to);
  const pos = blockPos(state, index);
  const target = tr.doc.child(index);
  const reuse = target.type.name === "paragraph" && target.content.size === 0 && isNewBlockPath(String(target.attrs.sourcePath ?? ""));
  const code = state.schema.nodes.codeBlock.create({ sourcePath: reuse ? target.attrs.sourcePath : `${NEW_BLOCK_PREFIX}${++nextNewBlock}` });
  const at = reuse ? pos : pos + target.nodeSize;
  if (reuse) tr.replaceWith(pos, pos + target.nodeSize, code);
  else tr.insert(at, code);
  return tr.setSelection(TextSelection.create(tr.doc, at + 1)).setMeta(BLOCK_COMMAND_META, true).scrollIntoView();
}

/** Insert an editable admonition after the target, reusing a transient empty paragraph. */
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

// Save maps a converted block to Core removeBlock and insertHeading/insertParagraph; Core
// convertBlock is the same conversion for CLI and other headless callers.

/** Markdown headings cannot hold line breaks; other paragraph content carries over. */
export function paragraphToHeadingRejection(state: EditorState, index: number): string | undefined {
  let lineBreak = false;
  state.doc.child(index).forEach(child => { if (child.type.name === "hardBreak") lineBreak = true; });
  return lineBreak ? "A heading cannot contain line breaks. Remove them first. Your document is unchanged." : undefined;
}

/** Turn a Paragraph without line breaks into a Heading, keeping its inline content. */
export function paragraphToHeading(state: EditorState, index: number, level: number): Transaction {
  if (!isParagraph(state, index) || paragraphToHeadingRejection(state, index)) throw new Error("only a Paragraph without line breaks can become a Heading");
  if (!Number.isInteger(level) || level < 1 || level > 6) throw new Error("invalid heading level");
  return closeHistory(state.tr)
    .setNodeMarkup(blockPos(state, index), state.schema.nodes.heading, { ...state.doc.child(index).attrs, level })
    .setMeta(BLOCK_COMMAND_META, true)
    .scrollIntoView();
}

/** Turn a Heading into a Paragraph, keeping its text. */
export function headingToParagraph(state: EditorState, index: number): Transaction {
  if (!isHeading(state, index)) throw new Error("only a Heading can become a Paragraph");
  // The paragraph type keeps the attributes it defines (the session locator) and drops the level.
  return closeHistory(state.tr)
    .setNodeMarkup(blockPos(state, index), state.schema.nodes.paragraph, state.doc.child(index).attrs)
    .setMeta(BLOCK_COMMAND_META, true)
    .scrollIntoView();
}

/** Insert an empty Quote after the target, reusing a transient empty paragraph; the caret goes into it. */
export function insertQuoteAfter(state: EditorState, index: number, slash?: SlashRange): Transaction {
  if (!Number.isInteger(index) || index < 0 || index >= state.doc.childCount) throw new Error("invalid block index");
  const tr = closeHistory(state.tr);
  if (slash) tr.delete(slash.from, slash.to);
  const pos = blockPos(state, index);
  const target = tr.doc.child(index);
  const reuse = target.type.name === "paragraph" && target.content.size === 0 && isNewBlockPath(String(target.attrs.sourcePath ?? ""));
  const quote = state.schema.nodes.quote.create({ sourcePath: reuse ? target.attrs.sourcePath : `${NEW_BLOCK_PREFIX}${++nextNewBlock}` });
  const at = reuse ? pos : pos + target.nodeSize;
  if (reuse) tr.replaceWith(pos, pos + target.nodeSize, quote);
  else tr.insert(at, quote);
  return tr.setSelection(TextSelection.create(tr.doc, at + 1)).setMeta(BLOCK_COMMAND_META, true).scrollIntoView();
}

/**
 * Insert a Divider after the target, followed by an empty paragraph that takes the caret.
 * A transient empty target paragraph is replaced; an unused empty paragraph is never saved.
 */
export function insertDividerAfter(state: EditorState, index: number, slash?: SlashRange): Transaction {
  if (!Number.isInteger(index) || index < 0 || index >= state.doc.childCount) throw new Error("invalid block index");
  const tr = closeHistory(state.tr);
  if (slash) tr.delete(slash.from, slash.to);
  const pos = blockPos(state, index);
  const target = tr.doc.child(index);
  const reuse = target.type.name === "paragraph" && target.content.size === 0 && isNewBlockPath(String(target.attrs.sourcePath ?? ""));
  const { divider, paragraph } = state.schema.nodes;
  const nodes = [
    divider.create({ sourcePath: `${NEW_BLOCK_PREFIX}${++nextNewBlock}` }),
    paragraph.create({ sourcePath: reuse ? target.attrs.sourcePath : `${NEW_BLOCK_PREFIX}${++nextNewBlock}` }),
  ];
  const at = reuse ? pos : pos + target.nodeSize;
  if (reuse) tr.replaceWith(pos, pos + target.nodeSize, nodes);
  else tr.insert(at, nodes);
  return tr.setSelection(TextSelection.create(tr.doc, at + nodes[0].nodeSize + 1)).setMeta(BLOCK_COMMAND_META, true).scrollIntoView();
}

/** Change an editable admonition to another standard kind, keeping its body. */
export function changeAdmonitionVariant(state: EditorState, index: number, variant: AdmonitionVariant): Transaction {
  if (!isEditableAdmonition(state, index)) throw new Error("kind changes require an editable admonition");
  return closeHistory(state.tr)
    .setNodeMarkup(blockPos(state, index), undefined, { ...state.doc.child(index).attrs, variant })
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

function addedCell(state: EditorState, header: boolean, align = "") {
  // An added cell has no snapshot position.
  return state.schema.nodes.tableCell.create({ header, align });
}

/** Add an empty row below the caret's row, or below the last row; the caret moves into it. */
export function addTableRowBelow(state: EditorState, index: number): Transaction {
  if (!isTable(state, index)) throw new Error("invalid table index");
  const table = state.doc.child(index);
  const current = tableCellAt(state, index);
  const row = (current?.row ?? table.childCount - 1) + 1;
  const cells = Array.from({ length: table.child(0).childCount }, (_, column) => addedCell(state, false, table.child(0).child(column).attrs.align));
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

/** The caret's cell and the table's shape, when the caret is inside the table at `index`. */
function caretTable(state: EditorState, index: number) {
  const cell = isTable(state, index) ? tableCellAt(state, index) : undefined;
  if (!cell) return undefined;
  const table = state.doc.child(index);
  return { ...cell, rows: table.childCount, columns: table.child(0).childCount, align: String(table.child(0).child(cell.column).attrs.align ?? "") };
}

/** The start of each row, and of each cell in each row, of the table at `index`. */
function tableLayout(doc: EditorState["doc"], index: number) {
  let rowPos = 1;
  for (let i = 0; i < index; i++) rowPos += doc.child(i).nodeSize;
  const rows: { pos: number; cells: number[] }[] = [];
  doc.child(index).forEach(row => {
    const cells: number[] = [];
    let cellPos = rowPos + 1;
    row.forEach(cell => { cells.push(cellPos); cellPos += cell.nodeSize; });
    rows.push({ pos: rowPos, cells });
    rowPos += row.nodeSize;
  });
  return rows;
}

/** Move the caret's body row up (-1) or down (+1); the caret moves with it. */
export function moveTableRow(state: EditorState, index: number, by: -1 | 1): Transaction {
  const caret = caretTable(state, index);
  const to = (caret?.row ?? 0) + by;
  if (!caret || caret.row < 1 || to < 1 || to >= caret.rows) throw new Error("invalid table row move");
  const table = state.doc.child(index);
  const layout = tableLayout(state.doc, index);
  const [upper, lower] = by < 0 ? [to, caret.row] : [caret.row, to];
  const offset = state.selection.from - layout[caret.row].pos;
  const tr = closeHistory(state.tr).replaceWith(layout[upper].pos, layout[lower].pos + table.child(lower).nodeSize, [table.child(lower), table.child(upper)]);
  // The rows swap places, so the moved row starts where the upper row did, or right after the other one.
  const start = by < 0 ? layout[upper].pos : layout[upper].pos + table.child(lower).nodeSize;
  return tr.setSelection(TextSelection.create(tr.doc, start + offset)).scrollIntoView();
}

/** Move the caret's column left (-1) or right (+1) in every row; the caret moves with it. */
export function moveTableColumn(state: EditorState, index: number, by: -1 | 1): Transaction {
  const caret = caretTable(state, index);
  const to = (caret?.column ?? 0) + by;
  if (!caret || to < 0 || to >= caret.columns) throw new Error("invalid table column move");
  const table = state.doc.child(index);
  const [left, right] = by < 0 ? [to, caret.column] : [caret.column, to];
  const layout = tableLayout(state.doc, index);
  const offset = state.selection.from - layout[caret.row].cells[caret.column];
  // Swapping two cells keeps the row's size, so the positions of later rows stay valid.
  const tr = closeHistory(state.tr);
  layout.forEach(({ cells }, row) => {
    const cell = table.child(row);
    tr.replaceWith(cells[left], cells[right] + cell.child(right).nodeSize, [cell.child(right), cell.child(left)]);
  });
  const cells = layout[caret.row].cells;
  const start = by < 0 ? cells[left] : cells[left] + table.child(caret.row).child(right).nodeSize;
  return tr.setSelection(TextSelection.create(tr.doc, start + offset)).scrollIntoView();
}

/** Remove the caret's body row; the caret goes to the nearest remaining cell. */
export function removeTableRow(state: EditorState, index: number): Transaction {
  const caret = caretTable(state, index);
  if (!caret || caret.row < 1) throw new Error("only a body row can be removed");
  const { pos } = tableLayout(state.doc, index)[caret.row];
  const tr = closeHistory(state.tr).delete(pos, pos + state.doc.child(index).child(caret.row).nodeSize);
  return tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size)), -1)).scrollIntoView();
}

/** Remove the caret's column from every row; a table keeps at least one column. */
export function removeTableColumn(state: EditorState, index: number): Transaction {
  const caret = caretTable(state, index);
  if (!caret || caret.columns <= 1) throw new Error("a table keeps at least one column");
  const layout = tableLayout(state.doc, index);
  const tr = closeHistory(state.tr);
  // From the last row up, so earlier positions stay valid.
  for (let row = layout.length - 1; row >= 0; row--) {
    const at = layout[row].cells[caret.column];
    tr.delete(at, at + state.doc.child(index).child(row).child(caret.column).nodeSize);
  }
  const at = tr.mapping.map(layout[caret.row].cells[caret.column]);
  return tr.setSelection(Selection.near(tr.doc.resolve(at), caret.column > 0 ? -1 : 1)).scrollIntoView();
}

/** Set ("left", "center", "right") or clear ("") the alignment of the caret's column. */
export function alignTableColumn(state: EditorState, index: number, align: string): Transaction {
  const caret = caretTable(state, index);
  if (!caret) throw new Error("place the caret in a table cell first");
  const tr = closeHistory(state.tr);
  for (const { cells } of tableLayout(state.doc, index)) {
    const node = tr.doc.nodeAt(cells[caret.column])!;
    tr.setNodeMarkup(cells[caret.column], undefined, { ...node.attrs, align });
  }
  return tr.scrollIntoView();
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

/** Inline formatting applies only to a text selection inside one editable inline block. */
export function formattableSelection(state: EditorState): { from: number; to: number } | null {
  const { selection } = state;
  if (selection.empty || !(selection instanceof TextSelection)) return null;
  const { $from, $to } = selection;
  const parent = $from.parent;
  const editableInlineParent = parent.type.name === "paragraph" ||
    parent.type.name === "quote" || parent.type.name === "heading" || parent.type.name === "tableCell" || (parent.type.name === "figure" && parent.attrs.editable === true) || (parent.type.name === "admonition" && parent.attrs.editable === true);
  if (!$from.sameParent($to) || !editableInlineParent) return null;
  return { from: selection.from, to: selection.to };
}
