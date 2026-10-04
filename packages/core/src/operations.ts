import { assertPersistentParagraph } from "./myst/paragraph.ts";
import { type NodePath } from "./document.ts";
import { getEditableDocument } from "./editable.ts";
import { sectionBoundaries, sectionMarker, sectionRange } from "./section.ts";
import {
  assertInlineContent,
  sameInlineContent,
  inlineContentLength,
  inlineMarkKey,
  splitInlineContent,
  concatenateInlineContent,
  insertInlineBreak,
  inlineContentText,
  inlineContentToNodes,
  projectInlineContent,
  type InlineContent,
} from "./inline.ts";

import { figureCaptionContent, figureContentError, type FigureContent } from "./figure.ts";
import {
  assertFigureRoundTrip,
  createFigureNode,
  isFigure,
  setFigureContent,
  supportedFigureContent,
} from "./myst/figure.ts";
import { assertInlineBlockRoundTrip } from "./myst/inline-round-trip.ts";
import { labelIdentifier, targetIdentifiers } from "./myst/label.ts";
import { assertReferenceableLabel } from "./myst/reference.ts";
import { labelError } from "./label.ts";
import { isAdmonitionVariant, supportedAdmonitionContent, type AdmonitionVariant } from "./myst/admonition.ts";
import type { ListContent } from "./list.ts";
import type { CodeBlockContent } from "./code.ts";
import { createCodeNode, supportedCodeBlock } from "./myst/code.ts";
import { createListNode, hasVisibleContent, supportedListContent } from "./myst/list.ts";
import { createQuoteNode, supportedQuoteContent } from "./myst/quote.ts";
import { parse } from "./myst/parse.ts";
import { serialize, serializeFor } from "./myst/serialize.ts";
import {
  createTableNode, insertTableColumnNode, insertTableRowNode, moveTableColumnNode, moveTableRowNode, removeTableColumnNode, removeTableRowNode,
  setTableCellContent, setTableColumnAlignNode, tableCellContent,
} from "./myst/table.ts";
import { cloneDocument, getNode, type MystDocument, type MystNode, toText } from "./myst/tree.ts";

const TEXT_BLOCKS = new Set(["paragraph", "heading"]);

export function replaceText(document: MystDocument, from: string, to: string): MystDocument {
  if (from.length === 0) {
    throw new Error("replaceText requires a non-empty search string");
  }
  const next = cloneDocument(document);
  const block = findTextBlock(next, from);
  if (!block) {
    throw new Error(`replaceText could not find paragraph or heading text: ${from}`);
  }
  if (!replaceInTextNodes(block, from, to) && toText(block) === from) {
    block.children = [{ type: "text", value: to }];
  }
  assertInlineBlockRoundTrip(block);
  return next;
}

export function moveBlock(document: MystDocument, fromIndex: number, toIndex: number): MystDocument {
  const next = cloneDocument(document);
  const blocks = next.children;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error("moveBlock requires a document with top-level blocks");
  }
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= blocks.length) {
    throw new Error(`moveBlock fromIndex out of range: ${fromIndex}`);
  }
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= blocks.length) {
    throw new Error(`moveBlock toIndex out of range: ${toIndex}`);
  }
  const [block] = blocks.splice(fromIndex, 1);
  blocks.splice(toIndex, 0, block);
  assertCanonicalBlockBoundaries(next);
  return next;
}

/**
 * Move the section a top-level heading opens, with its label targets and deeper sections, to `to`:
 * the start of another section or the end of the document. Heading levels are kept.
 */
export function moveSection(document: MystDocument, heading: number, to: number): MystDocument {
  const markers = sectionMarkers(document);
  const { start, end } = sectionRange(markers, heading);
  if (!Number.isInteger(to) || !sectionBoundaries(markers).includes(to)) {
    throw new Error(`a section moves to the start of a section or the end of the document: ${to}`);
  }
  if (to > start && to < end) throw new Error("a section cannot move into itself");
  const next = cloneDocument(document);
  const moved = next.children.splice(start, end - start);
  next.children.splice(to > start ? to - moved.length : to, 0, ...moved);
  assertCanonicalBlockBoundaries(next);
  return next;
}

/** Remove the section a top-level heading opens, with its label targets and deeper sections. */
export function removeSection(document: MystDocument, heading: number): MystDocument {
  const { start, end } = sectionRange(sectionMarkers(document), heading);
  const next = cloneDocument(document);
  next.children.splice(start, end - start);
  return next;
}

function sectionMarkers(document: MystDocument) {
  return getEditableDocument(document).blocks.map(sectionMarker);
}

const BOUNDARY_FAILURE = "Canonical save changed block boundaries; this order cannot be saved";

function assertCanonicalBlockBoundaries(document: MystDocument): void {
  const expectedBlocks = getEditableDocument(document).blocks;
  const reloadedBlocks = getEditableDocument(parse(serializeFor(document, BOUNDARY_FAILURE))).blocks;
  if (
    reloadedBlocks.length !== expectedBlocks.length ||
    reloadedBlocks.some((block, index) => block.block !== expectedBlocks[index].block)
  ) {
    throw new Error(BOUNDARY_FAILURE);
  }
}

export function insertBlock(document: MystDocument, index: number, block: MystNode): MystDocument {
  if (!block || typeof block.type !== "string" || block.type.length === 0) {
    throw new Error("insertBlock requires a block with a type");
  }
  const next = cloneDocument(document);
  const blocks = next.children;
  if (!Array.isArray(blocks)) {
    throw new Error("insertBlock requires a document with top-level blocks");
  }
  if (!Number.isInteger(index) || index < 0 || index > blocks.length) {
    throw new Error(`insertBlock index out of range: ${index}`);
  }
  blocks.splice(index, 0, structuredClone(block));
  return next;
}

export function insertParagraph(document: MystDocument, index: number, text: string | InlineContent[]): MystDocument {
  const content: InlineContent[] = typeof text === "string" ? [{ kind: "text", text }] : text;
  assertInlineContent(content);
  const paragraph: MystNode = {
    type: "paragraph",
    children: inlineContentToNodes(concatenateInlineContent(content)),
  };
  assertInlineBlockRoundTrip(paragraph);
  return insertBlock(document, index, paragraph);
}

const HEADING_FAILURE = "heading insertion cannot round-trip losslessly through canonical Markdown";

/** Insert a persistent top-level heading of plain text or supported inline content without line breaks. */
export function insertHeading(document: MystDocument, index: number, level: number, text: string | InlineContent[]): MystDocument {
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    throw new Error(`heading level must be an integer from 1 to 6: ${level}`);
  }
  const content = headingContent(typeof text === "string" ? [{ kind: "text", text }] : text);
  const heading: MystNode = { type: "heading", depth: level, children: inlineContentToNodes(content) };
  assertInlineBlockRoundTrip(heading);
  const next = insertBlock(document, index, heading);
  const markdown = serializeFor(next, HEADING_FAILURE);
  const reparsed = parse(markdown);
  const reparsedHeading = reparsed.children[index];
  const projected = reparsedHeading && projectInlineContent(reparsedHeading);
  if (
    reparsedHeading?.type !== "heading" ||
    Number(reparsedHeading.depth) !== level ||
    !projected || !sameInlineContent(content, projected) ||
    serialize(reparsed) !== markdown
  ) {
    throw new Error(HEADING_FAILURE);
  }
  return next;
}

/** Replace the inline content of one editable top-level Heading, keeping its level. */
export function updateHeadingInlineContent(document: MystDocument, path: NodePath, content: InlineContent[]): MystDocument {
  if (path.length !== 1) throw new Error("heading edits require a top-level path");
  const normalized = headingContent(content);
  const block = getEditableDocument(document).blocks[path[0]];
  if (getNode(document, path).type !== "heading" || block?.block !== "heading" || !block.editable) {
    throw new Error(`heading edit is not supported at [${path.join(",")}]`);
  }
  const next = cloneDocument(document);
  getNode(next, path).children = inlineContentToNodes(normalized);
  assertInlineBlockRoundTrip(getNode(next, path));
  return next;
}

/** Heading content is non-empty supported inline content without line breaks. */
function headingContent(content: InlineContent[]): InlineContent[] {
  assertInlineContent(content);
  if (containsBreak(content)) throw new Error("a heading cannot contain line breaks");
  if (inlineContentText(content).length === 0) throw new Error("empty heading cannot be saved");
  return concatenateInlineContent(content);
}

const ADMONITION_INSERTION_FAILURE = "admonition insertion cannot round-trip losslessly through canonical Markdown";

/** Insert a top-level simple admonition of a standard MyST kind with supported inline content. */
export function insertAdmonition(
  document: MystDocument,
  index: number,
  variant: AdmonitionVariant,
  content: InlineContent[],
): MystDocument {
  if (!isAdmonitionVariant(variant)) throw new Error(`unsupported admonition variant: ${variant}`);
  assertInlineContent(content);
  if (inlineContentText(content).trim().length === 0) {
    throw new Error("admonition body must contain non-empty text");
  }
  const normalizedContent = concatenateInlineContent(content);
  const admonition: MystNode = {
    type: "admonition",
    kind: variant,
    children: [{ type: "paragraph", children: inlineContentToNodes(normalizedContent) }],
  };
  const next = insertBlock(document, index, admonition);
  const markdown = serializeFor(next, ADMONITION_INSERTION_FAILURE);
  const reparsed = parse(markdown);
  const inserted = reparsed.children[index];
  const insertedContent = inserted && supportedAdmonitionContent(inserted);
  if (
    inserted?.type !== "admonition" ||
    inserted.kind !== variant ||
    !insertedContent ||
    !sameInlineContent(normalizedContent, insertedContent) ||
    serialize(reparsed) !== markdown
  ) {
    throw new Error(ADMONITION_INSERTION_FAILURE);
  }
  return next;
}

const QUOTE_FAILURE = "quote cannot round-trip losslessly through canonical Markdown";

/** Insert a top-level quote holding one paragraph of supported inline content. */
export function insertQuote(document: MystDocument, index: number, content: InlineContent[]): MystDocument {
  const normalized = quoteContent(content);
  const next = insertBlock(document, index, createQuoteNode(normalized));
  assertQuoteRoundTrip(next, index, normalized);
  return next;
}

/** Replace the paragraph of one Quote v1 block. */
export function updateQuoteInlineContent(document: MystDocument, path: NodePath, content: InlineContent[]): MystDocument {
  if (path.length !== 1) throw new Error("quote edits require a top-level path");
  const normalized = quoteContent(content);
  if (!supportedQuoteContent(getNode(document, path))) {
    throw new Error(`quote edit is not supported at [${path.join(",")}]`);
  }
  const next = cloneDocument(document);
  next.children[path[0]] = createQuoteNode(normalized);
  assertQuoteRoundTrip(next, path[0], normalized);
  return next;
}

function quoteContent(content: InlineContent[]): InlineContent[] {
  assertInlineContent(content);
  if (inlineContentText(content).trim().length === 0) throw new Error("quote must contain non-empty text");
  return concatenateInlineContent(content);
}

function assertQuoteRoundTrip(document: MystDocument, index: number, content: InlineContent[]): void {
  const markdown = serializeFor(document, QUOTE_FAILURE);
  const reparsed = parse(markdown);
  const quote = reparsed.children[index];
  const projected = quote && supportedQuoteContent(quote);
  if (!projected || !sameInlineContent(content, projected) || serialize(reparsed) !== markdown) {
    throw new Error(QUOTE_FAILURE);
  }
  assertCanonicalBlockBoundaries(document);
}

/** Insert a top-level divider (a Markdown thematic break). */
export function insertDivider(document: MystDocument, index: number): MystDocument {
  const next = insertBlock(document, index, { type: "thematicBreak" });
  assertCanonicalBlockBoundaries(next);
  return next;
}


const LIST_FAILURE = "list cannot round-trip losslessly through canonical Markdown";
const MAX_LIST_START = 999_999_999;

/** Insert a top-level bullet or numbered list. */
export function insertList(document: MystDocument, index: number, list: ListContent): MystDocument {
  const normalized = normalizeList(list);
  const next = insertBlock(document, index, createListNode(normalized));
  assertListRoundTrip(next, index, normalized);
  return next;
}

/** Replace the whole content of an editable top-level list: its kind, numbering, items and nesting. */
export function updateList(document: MystDocument, path: NodePath, list: ListContent): MystDocument {
  if (!Array.isArray(path) || path.length !== 1) {
    throw new Error("updateList requires a top-level list path [index]");
  }
  if (!supportedListContent(getNode(document, path))) {
    throw new Error(`list at [${path.join(",")}] is not editable in this version`);
  }
  const normalized = normalizeList(list);
  const next = cloneDocument(document);
  next.children[path[0]] = createListNode(normalized);
  assertListRoundTrip(next, path[0], normalized);
  return next;
}

function normalizeList(list: ListContent): ListContent {
  if (!list || typeof list !== "object" || typeof list.ordered !== "boolean") {
    throw new Error("list requires a boolean ordered");
  }
  if (!Array.isArray(list.items) || list.items.length === 0) {
    throw new Error("a list needs at least one item");
  }
  const start = list.start ?? 1;
  if (list.ordered && (!Number.isInteger(start) || start < 0 || start > MAX_LIST_START)) {
    throw new Error(`numbered list start must be an integer from 0 to ${MAX_LIST_START}`);
  }
  if (!list.ordered && list.start !== undefined) {
    throw new Error("a bullet list has no start number");
  }
  const items = list.items.map((item) => {
    if (!item || typeof item !== "object") throw new Error("list item must be an object");
    assertInlineContent(item.content);
    if (!hasVisibleContent(item.content)) throw new Error("list item must contain non-empty text");
    const content = concatenateInlineContent(item.content);
    return item.list === undefined ? { content } : { content, list: normalizeList(item.list) };
  });
  return list.ordered ? { ordered: true, start, items } : { ordered: false, items };
}

function assertListRoundTrip(document: MystDocument, index: number, list: ListContent): void {
  const markdown = serializeFor(document, LIST_FAILURE);
  const reparsed = parse(markdown);
  const reloaded = reparsed.children[index];
  const content = reloaded && supportedListContent(reloaded);
  if (reparsed.children.length !== document.children.length || !content || !sameList(content, list) ||
      serialize(reparsed) !== markdown) {
    throw new Error(LIST_FAILURE);
  }
}

function sameList(left: ListContent, right: ListContent): boolean {
  return left.ordered === right.ordered && left.start === right.start && left.items.length === right.items.length &&
    left.items.every((item, index) => {
      const other = right.items[index];
      return sameInlineContent(item.content, other.content) && (item.list === undefined
        ? other.list === undefined : other.list !== undefined && sameList(item.list, other.list));
    });
}

const CODE_FAILURE = "code block cannot round-trip losslessly through canonical Markdown";

/** Insert a top-level fenced code block. */
export function insertCodeBlock(document: MystDocument, index: number, content: CodeBlockContent): MystDocument {
  assertCodeBlockContent(content);
  const next = insertBlock(document, index, createCodeNode(content));
  assertCodeBlockRoundTrip(next, index, content);
  return next;
}

/** Replace the language and/or code of an editable top-level code block; omitted properties are unchanged. */
export function updateCodeBlock(document: MystDocument, path: NodePath, changes: Partial<CodeBlockContent>): MystDocument {
  if (!Array.isArray(path) || path.length !== 1) {
    throw new Error("updateCodeBlock requires a top-level code block path [index]");
  }
  const current = supportedCodeBlock(getNode(document, path));
  if (!current) {
    throw new Error(`code block at [${path.join(",")}] is not editable in this version`);
  }
  const content = { language: changes?.language ?? current.language, code: changes?.code ?? current.code };
  assertCodeBlockContent(content);
  const next = cloneDocument(document);
  next.children[path[0]] = createCodeNode(content);
  assertCodeBlockRoundTrip(next, path[0], content);
  return next;
}

function assertCodeBlockContent(content: CodeBlockContent): void {
  if (!content || typeof content.language !== "string" || typeof content.code !== "string") {
    throw new Error("code block language and code must be strings");
  }
  if (/[\s`]/.test(content.language) || content.language.startsWith("{")) {
    throw new Error("code block language must be one word without spaces, backticks or a leading {");
  }
  if (content.code.includes("\r")) {
    throw new Error("code block line breaks must be \\n");
  }
}

function assertCodeBlockRoundTrip(document: MystDocument, index: number, content: CodeBlockContent): void {
  const markdown = serializeFor(document, CODE_FAILURE);
  const reparsed = parse(markdown);
  const reloaded = reparsed.children[index];
  const block = reloaded && supportedCodeBlock(reloaded);
  if (reparsed.children.length !== document.children.length || !block || block.language !== content.language ||
      block.code !== content.code || serialize(reparsed) !== markdown) {
    throw new Error(CODE_FAILURE);
  }
}

/** Insert a persistent top-level equation while keeping its MyST details inside Core. */
export function insertEquation(document: MystDocument, index: number, latex: string): MystDocument {
  if (latex.length === 0) {
    throw new Error("empty equation LaTeX cannot be saved");
  }
  const equation: MystNode = {
    type: "math",
    value: latex,
  };
  const next = insertBlock(document, index, equation);
  assertEquationRoundTrip(next, [index], undefined, undefined, latex);
  return next;
}

/** Insert a persistent top-level Figure without a label. */
export function insertFigure(document: MystDocument, index: number, figure: FigureContent): MystDocument {
  assertFigureContent(figure);
  const next = insertBlock(document, index, createFigureNode(figure));
  assertFigureRoundTrip(next, index, figure, undefined, undefined);
  return next;
}

const TABLE_CELL_FAILURE = "table cell text cannot be preserved through canonical round-trip";

/** A cell's content: plain text, or supported inline content without line breaks. */
export type TableCellInput = string | InlineContent[];

/** Replace the whole content of an editable cell in a top-level table ([table, row, cell]). */
export function updateTableCell(document: MystDocument, path: NodePath, cell: TableCellInput): MystDocument {
  if (path.length !== 3) {
    throw new Error("updateTableCell requires a top-level table cell path [table,row,cell]");
  }
  if (getNode(document, [path[0]]).type !== "table" || tableCellContent(getNode(document, path)) === undefined) {
    throw new Error(`table cell at [${path.join(",")}] is not editable in this version`);
  }
  const content = tableCellInput(cell);
  const next = cloneDocument(document);
  setTableCellContent(getNode(next, path), content);
  assertStableTable(next, path[0], TABLE_CELL_FAILURE);
  return next;
}

function tableCellInput(cell: TableCellInput): InlineContent[] {
  if (typeof cell !== "string" && !Array.isArray(cell)) {
    throw new Error("table cell content must be text or InlineContent");
  }
  const content: InlineContent[] = typeof cell === "string" ? (cell.length > 0 ? [{ kind: "text", text: cell }] : []) : cell;
  assertInlineContent(content);
  const text = inlineContentText(content);
  if (containsBreak(content) || /[\r\n]/.test(text)) {
    throw new Error("table cell text cannot contain line breaks");
  }
  if (text !== text.trim()) {
    throw new Error("table cell text cannot start or end with whitespace");
  }
  // An empty cell has no children, as MyST parses it.
  return concatenateInlineContent(content).filter((item) => item.kind !== "text" || item.text.length > 0);
}

// serialize() rejects any semantic change; also require a stable canonical form in which every
// editable cell of the table keeps its inline content (typed `$x$` text must not become math).
function assertStableTable(document: MystDocument, index: number, failure: string): void {
  const markdown = serializeFor(document, failure);
  const reparsed = parse(markdown);
  const cells = (table: MystNode | undefined) => (table?.children ?? []).map((row) => (row.children ?? []).map(tableCellContent));
  const before = cells(document.children[index]);
  const after = cells(reparsed.children[index]);
  if (serialize(reparsed) !== markdown || reparsed.children[index]?.type !== "table" || after.length !== before.length ||
      before.some((row, rowIndex) => row.length !== after[rowIndex].length || row.some((content, column) => {
        const reloaded = after[rowIndex][column];
        return content !== undefined && (reloaded === undefined || !sameInlineContent(content, reloaded));
      }))) {
    throw new Error(failure);
  }
}

const TABLE_FAILURE = "table cannot be preserved through canonical round-trip";

/** Insert a top-level Markdown table of text or inline-content cells; the first row is its header row. */
export function insertTable(document: MystDocument, index: number, rows: TableCellInput[][], align?: ("left" | "center" | "right" | null)[]): MystDocument {
  if (!Array.isArray(rows) || !Array.isArray(rows[0]) || rows[0].length === 0) {
    throw new Error("a table needs a header row with at least one cell");
  }
  if (rows.some((row) => !Array.isArray(row) || row.length !== rows[0].length)) {
    throw new Error("every table row needs the same number of cells");
  }
  if (align !== undefined && (!Array.isArray(align) || align.length !== rows[0].length ||
      align.some(value => value !== null && !["left", "center", "right"].includes(value)))) {
    throw new Error("table alignment must contain left, center, right or null for each column");
  }
  const content = rows.map((row) => row.map(tableCellInput));
  const next = insertBlock(document, index, createTableNode(content, align));
  assertStableTable(next, index, TABLE_FAILURE);
  return next;
}

/** Insert an empty body row into a top-level table; row 0 is the header row, so `row` starts at 1. */
export function insertTableRow(document: MystDocument, path: NodePath, row: number): MystDocument {
  const rows = tableAt(document, path, "insertTableRow").children?.length ?? 0;
  if (!Number.isInteger(row) || row < 1 || row > rows) {
    throw new Error(`table row index must be an integer from 1 to ${rows}: ${row}`);
  }
  const next = cloneDocument(document);
  insertTableRowNode(getNode(next, path), row);
  assertStableTable(next, path[0], TABLE_FAILURE);
  return next;
}

/** Insert an empty column into a top-level table at `column` (0 to the column count). */
export function insertTableColumn(document: MystDocument, path: NodePath, column: number): MystDocument {
  const columns = tableAt(document, path, "insertTableColumn").children?.[0]?.children?.length ?? 0;
  if (!Number.isInteger(column) || column < 0 || column > columns) {
    throw new Error(`table column index must be an integer from 0 to ${columns}: ${column}`);
  }
  const next = cloneDocument(document);
  insertTableColumnNode(getNode(next, path), column);
  assertStableTable(next, path[0], TABLE_FAILURE);
  return next;
}

/** Remove a body row from a top-level table; row 0 is the header row and stays. */
export function removeTableRow(document: MystDocument, path: NodePath, row: number): MystDocument {
  const rows = tableAt(document, path, "removeTableRow").children?.length ?? 0;
  assertTableBodyRow(row, rows);
  const next = cloneDocument(document);
  removeTableRowNode(getNode(next, path), row);
  assertStableTable(next, path[0], TABLE_FAILURE);
  return next;
}

/** Remove a column, header cell included; a table keeps at least one column. */
export function removeTableColumn(document: MystDocument, path: NodePath, column: number): MystDocument {
  const columns = tableAt(document, path, "removeTableColumn").children?.[0]?.children?.length ?? 0;
  if (columns <= 1) throw new Error("a table needs at least one column; remove the table instead");
  assertTableColumn(column, columns);
  const next = cloneDocument(document);
  removeTableColumnNode(getNode(next, path), column);
  assertStableTable(next, path[0], TABLE_FAILURE);
  return next;
}

/** Move a body row to another body position; the header row stays first. */
export function moveTableRow(document: MystDocument, path: NodePath, from: number, to: number): MystDocument {
  const rows = tableAt(document, path, "moveTableRow").children?.length ?? 0;
  assertTableBodyRow(from, rows);
  assertTableBodyRow(to, rows);
  const next = cloneDocument(document);
  moveTableRowNode(getNode(next, path), from, to);
  assertStableTable(next, path[0], TABLE_FAILURE);
  return next;
}

/** Move a column, header cell included, to another column position. */
export function moveTableColumn(document: MystDocument, path: NodePath, from: number, to: number): MystDocument {
  const columns = tableAt(document, path, "moveTableColumn").children?.[0]?.children?.length ?? 0;
  assertTableColumn(from, columns);
  assertTableColumn(to, columns);
  const next = cloneDocument(document);
  moveTableColumnNode(getNode(next, path), from, to);
  assertStableTable(next, path[0], TABLE_FAILURE);
  return next;
}

/** Set (left, center, right) or clear (null) the alignment of a table column. */
export function updateTableColumnAlignment(document: MystDocument, path: NodePath, column: number, align: "left" | "center" | "right" | null): MystDocument {
  const columns = tableAt(document, path, "updateTableColumnAlignment").children?.[0]?.children?.length ?? 0;
  assertTableColumn(column, columns);
  if (align !== null && !["left", "center", "right"].includes(align)) {
    throw new Error("table alignment must be left, center, right or null");
  }
  const next = cloneDocument(document);
  setTableColumnAlignNode(getNode(next, path), column, align);
  assertStableTable(next, path[0], TABLE_FAILURE);
  return next;
}

function assertTableBodyRow(row: number, rows: number): void {
  if (rows <= 1) throw new Error("the table has no body row");
  if (!Number.isInteger(row) || row < 1 || row >= rows) {
    throw new Error(`table body row index must be an integer from 1 to ${rows - 1}: ${row}`);
  }
}

function assertTableColumn(column: number, columns: number): void {
  if (!Number.isInteger(column) || column < 0 || column >= columns) {
    throw new Error(`table column index must be an integer from 0 to ${columns - 1}: ${column}`);
  }
}

function tableAt(document: MystDocument, path: NodePath, operation: string): MystNode {
  if (path.length !== 1) {
    throw new Error(`${operation} requires a top-level table path [index]`);
  }
  const table = getNode(document, path);
  if (table.type !== "table") {
    throw new Error(`${operation} requires a table at [${path.join(",")}]`);
  }
  return table;
}

export function updateFigure(document: MystDocument, path: NodePath, changes: Partial<FigureContent>): MystDocument {
  const current = getNode(document, path);
  if (!isFigure(current)) {
    throw new Error(`updateFigure requires a figure at [${path.join(",")}]`);
  }
  if (path.length !== 1) {
    throw new Error("updateFigure requires a top-level figure path [index]");
  }
  const content = supportedFigureContent(current);
  if (!content) {
    throw new Error(`figure structure at [${path.join(",")}] is not editable in this version`);
  }
  const figure: FigureContent = {
    imageUrl: changes.imageUrl ?? content.imageUrl,
    imageAlt: changes.imageAlt ?? content.imageAlt,
    caption: changes.caption ?? content.caption,
  };
  assertFigureContent(figure);
  const next = cloneDocument(document);
  setFigureContent(getNode(next, path), figure);
  assertFigureRoundTrip(next, path[0], figure, current.label, current.identifier);
  return next;
}

/**
 * Set, change or remove ("") the label of a top-level Equation or Figure: the name
 * references use to target it. Content is kept, and references are never renamed.
 * The label must name a target MyST can resolve, be addressable by the reference role
 * Core writes for that block, and not name another target in the document.
 */
export function updateLabel(document: MystDocument, path: NodePath, label: string): MystDocument {
  if (!Array.isArray(path) || path.length !== 1) {
    throw new Error("updateLabel requires a top-level Equation or Figure path [index]");
  }
  const current = getNode(document, path);
  const kind = current.type === "math" ? "Equation" : isFigure(current) ? "Figure" : undefined;
  if (!kind) throw new Error(`updateLabel requires a top-level Equation or Figure at [${path.join(",")}]`);
  const error = labelError(label);
  if (error) throw new Error(error);
  const next = cloneDocument(document);
  const node = getNode(next, path);
  // `$$ ... $$ (label)` math records an anchor derived from the old identifier.
  delete node.html_id;
  if (label.length === 0) {
    delete node.label;
    delete node.identifier;
  } else {
    const identifier = labelIdentifier(label);
    if (!identifier) throw new Error(`${kind} label ${JSON.stringify(label)} does not name a reference target`);
    try {
      assertReferenceableLabel(kind === "Equation" ? "eq" : "numref", label, identifier);
    } catch {
      throw new Error(`${kind} label ${JSON.stringify(label)} cannot be referenced through canonical Markdown`);
    }
    if (targetIdentifiers(document, current).has(identifier)) {
      throw new Error(`label ${JSON.stringify(label)} already names another target in this document`);
    }
    node.label = label;
    node.identifier = identifier;
  }
  const failure = `${kind} label cannot be preserved through canonical round-trip`;
  const markdown = serializeFor(next, failure);
  const reparsed = parse(markdown);
  const reloaded = reparsed.children[path[0]];
  if (reloaded?.type !== node.type || (reloaded.label ?? "") !== label || serialize(reparsed) !== markdown) {
    throw new Error(failure);
  }
  return next;
}

/**
 * Authoritative persistent validity of Figure v1 properties: the same field rules and
 * canonical round-trip that insertFigure and updateFigure enforce. Returns the error message.
 */
export function validateFigure(figure: FigureContent): string | undefined {
  try {
    insertFigure({ type: "root", children: [] }, 0, figure);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function assertFigureContent(figure: FigureContent): void {
  const error = figureContentError(figure);
  if (error) throw new Error(error);
  assertInlineContent(figureCaptionContent(figure.caption));
}

export function updateNodeTextAtPath(
  document: MystDocument,
  path: NodePath,
  from: string,
  to: string,
): MystDocument {
  if (from.length === 0) {
    throw new Error("updateNodeTextAtPath requires a non-empty search string");
  }
  const next = cloneDocument(document);
  const node = getNode(next, path);
  if (replaceInTextNodes(node, from, to)) {
    assertInlineBlockRoundTrip(node);
    return next;
  }
  if (typeof node.value === "string" && node.value.includes(from)) {
    node.value = node.value.replaceAll(from, to);
    assertInlineBlockRoundTrip(node);
    return next;
  }
  if (toText(node) === from) {
    node.children = [{ type: "text", value: to }];
    assertInlineBlockRoundTrip(node);
    return next;
  }
  throw new Error(`updateNodeTextAtPath could not replace text at [${path.join(",")}]`);
}

const HEADING_LEVEL_FAILURE = "heading level change cannot round-trip losslessly through canonical Markdown";

/** Change the level of one editable top-level Heading while preserving its text and meaning. */
export function updateHeadingLevel(
  document: MystDocument,
  path: NodePath,
  from: number,
  to: number,
): MystDocument {
  if (path.length !== 1) throw new Error("updateHeadingLevel requires a top-level heading path");
  if (!Number.isInteger(from) || from < 1 || from > 6 || !Number.isInteger(to) || to < 1 || to > 6) {
    throw new Error("heading level must be an integer from 1 to 6");
  }
  const current = getNode(document, path);
  const block = getEditableDocument(document).blocks[path[0]];
  if (current.type !== "heading" || block?.block !== "heading" || !block.editable) {
    throw new Error(`heading level change is not supported at [${path.join(",")}]`);
  }
  if (Number(current.depth) !== from) {
    throw new Error(`heading level does not match at [${path.join(",")}]`);
  }

  const next = cloneDocument(document);
  getNode(next, path).depth = to;
  const markdown = serializeFor(next, HEADING_LEVEL_FAILURE);
  const reparsed = parse(markdown);
  const updated = getNode(reparsed, path);
  if (
    updated.type !== "heading" ||
    Number(updated.depth) !== to ||
    toText(updated) !== toText(current) ||
    serialize(reparsed) !== markdown
  ) {
    throw new Error(HEADING_LEVEL_FAILURE);
  }
  return next;
}

/** The block kind a top-level Paragraph or Heading becomes. */
export type BlockConversion = { block: "paragraph" } | { block: "heading"; level: number };

const TEXT_BLOCK_FIELDS: Record<string, Set<string>> = {
  paragraph: new Set(["type", "children", "position"]),
  heading: new Set(["type", "depth", "children", "position"]),
};

/** Convert a top-level Paragraph or Heading to another text block kind or heading level, keeping
 * its inline content. Fails when the target cannot keep that content (e.g. a line break in a heading). */
export function convertBlock(document: MystDocument, path: NodePath, to: BlockConversion): MystDocument {
  if (path.length !== 1) throw new Error("convertBlock requires a top-level block path");
  if (to.block === "heading" && (!Number.isInteger(to.level) || to.level < 1 || to.level > 6)) {
    throw new Error(`heading level must be an integer from 1 to 6: ${to.level}`);
  }
  const current = getNode(document, path);
  const fields = TEXT_BLOCK_FIELDS[current.type];
  if (!fields) throw new Error(`only a paragraph or heading can be converted at [${path.join(",")}]`);
  if (current.type === to.block && (to.block === "paragraph" || Number(current.depth) === to.level)) {
    throw new Error(`block at [${path.join(",")}] is already this kind`);
  }
  const content = projectInlineContent(current);
  if (!content || Object.entries(current).some(([key, value]) => value !== undefined && !fields.has(key))) {
    throw new Error(`${current.type} at [${path.join(",")}] has content that conversion cannot preserve`);
  }
  if (to.block === "heading" && containsBreak(content)) {
    throw new Error("a heading cannot contain line breaks");
  }

  const next = cloneDocument(document);
  const children = inlineContentToNodes(content);
  const converted: MystNode = to.block === "heading"
    ? { type: "heading", depth: to.level, children }
    : { type: "paragraph", children };
  next.children[path[0]] = converted;
  if (converted.type === "paragraph") assertPersistentParagraph(converted);
  else assertInlineBlockRoundTrip(converted);
  assertCanonicalBlockBoundaries(next);
  return next;
}

function containsBreak(content: InlineContent[]): boolean {
  return content.some((item) => item.kind === "break" || ("children" in item && containsBreak(item.children)));
}

/** Update one Equation's LaTeX source while preserving its semantic identity. */
export function updateEquationLatex(
  document: MystDocument,
  path: NodePath,
  from: string,
  to: string,
): MystDocument {
  const current = getNode(document, path);
  if (current.type !== "math") {
    throw new Error(`updateEquationLatex requires an equation at [${path.join(",")}]`);
  }
  if (typeof current.value !== "string" || current.value !== from) {
    throw new Error(`equation LaTeX does not match at [${path.join(",")}]`);
  }
  if (to.length === 0) {
    throw new Error("empty equation LaTeX cannot be saved");
  }

  const next = cloneDocument(document);
  getNode(next, path).value = to;
  assertEquationRoundTrip(next, path, current.label, current.identifier, to);
  return next;
}

const EQUATION_FAILURE = "Equation LaTeX change cannot be preserved through canonical round-trip";

function assertEquationRoundTrip(
  document: MystDocument,
  path: NodePath,
  label: string | undefined,
  identifier: string | undefined,
  latex: string,
): void {
  const markdown = serializeFor(document, EQUATION_FAILURE);
  const reparsed = parse(markdown);
  const equation = getNode(reparsed, path);
  if (
    equation.type !== "math" ||
    equation.value !== latex ||
    equation.label !== label ||
    equation.identifier !== identifier
  ) {
    throw new Error(EQUATION_FAILURE);
  }
  if (serialize(reparsed) !== markdown) {
    throw new Error("Equation LaTeX change is not canonical after round-trip");
  }
}

export function updateParagraphInlineContent(
  document: MystDocument,
  path: NodePath,
  content: InlineContent[],
): MystDocument {
  assertInlineContent(content);
  const next = cloneDocument(document);
  const node = getNode(next, path);
  if (node.type !== "paragraph") {
    throw new Error(`updateParagraphInlineContent requires a paragraph at [${path.join(",")}]`);
  }
  if (!projectInlineContent(node)) {
    throw new Error(`updateParagraphInlineContent cannot replace unsupported inline content at [${path.join(",")}]`);
  }
  node.children = inlineContentToNodes(concatenateInlineContent(content));
  assertInlineBlockRoundTrip(node);
  return next;
}

/** Update the single supported paragraph body of a simple admonition. */
export function updateAdmonitionInlineContent(
  document: MystDocument,
  path: NodePath,
  content: InlineContent[],
): MystDocument {
  assertInlineContent(content);
  if (path.length !== 1) throw new Error("admonition edits require a top-level path");
  if (inlineContentText(content).trim().length === 0) {
    throw new Error("admonition body must contain non-empty text");
  }
  const next = cloneDocument(document);
  const node = getNode(next, path);
  if (!supportedAdmonitionContent(node)) {
    throw new Error(`admonition edit is not supported at [${path.join(",")}]`);
  }
  const paragraph = node.children![0];
  paragraph.children = inlineContentToNodes(concatenateInlineContent(content));

  const failure = "admonition body edit cannot round-trip losslessly through canonical Markdown";
  const markdown = serializeFor({ type: "root", children: [node] }, failure);
  const reloaded = parse(markdown).children[0];
  if (!reloaded || reloaded.kind !== node.kind || !supportedAdmonitionContent(reloaded) ||
      serialize(parse(markdown)) !== markdown) {
    throw new Error(failure);
  }
  return next;
}

/** Change the kind of one simple admonition, keeping its body. */
export function updateAdmonitionVariant(document: MystDocument, path: NodePath, variant: AdmonitionVariant): MystDocument {
  if (path.length !== 1) throw new Error("admonition edits require a top-level path");
  if (!isAdmonitionVariant(variant)) throw new Error(`unsupported admonition variant: ${variant}`);
  const node = getNode(document, path);
  const content = supportedAdmonitionContent(node);
  if (!content) throw new Error(`admonition edit is not supported at [${path.join(",")}]`);
  if (node.kind === variant) throw new Error(`admonition at [${path.join(",")}] is already a ${variant}`);
  const next = cloneDocument(document);
  getNode(next, path).kind = variant;
  const failure = "admonition kind change cannot round-trip losslessly through canonical Markdown";
  const markdown = serializeFor({ type: "root", children: [getNode(next, path)] }, failure);
  const reloaded = parse(markdown).children[0];
  const reloadedContent = reloaded && supportedAdmonitionContent(reloaded);
  if (reloaded?.kind !== variant || !reloadedContent || !sameInlineContent(content, reloadedContent) ||
      serialize(parse(markdown)) !== markdown) {
    throw new Error(failure);
  }
  return next;
}

export function removeBlock(document: MystDocument, index: number): MystDocument {
  const next = cloneDocument(document);
  const blocks = next.children;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error("removeBlock requires a document with top-level blocks");
  }
  if (!Number.isInteger(index) || index < 0 || index >= blocks.length) {
    throw new Error(`removeBlock index out of range: ${index}`);
  }
  blocks.splice(index, 1);
  return next;
}

function findTextBlock(node: MystNode, from: string): MystNode | undefined {
  if (TEXT_BLOCKS.has(node.type) && toText(node).includes(from)) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findTextBlock(child, from);
    if (found) return found;
  }
  return undefined;
}

function replaceInTextNodes(node: MystNode, from: string, to: string): boolean {
  if (node.type === "text" && typeof node.value === "string" && node.value.includes(from)) {
    node.value = node.value.replaceAll(from, to);
    return true;
  }
  let replaced = false;
  for (const child of node.children ?? []) {
    if (replaceInTextNodes(child, from, to)) replaced = true;
  }
  return replaced;
}

/** Insert an intentional line break at an interior rendered UTF-16 offset. */
export function insertHardBreak(document: MystDocument, path: NodePath, offset: number): MystDocument {
  const content = paragraphContent(document, path);
  assertInteriorOffset(content, offset);
  const next = cloneDocument(document);
  getNode(next, path).children = inlineContentToNodes(insertInlineBreak(content, offset));
  assertPersistentParagraph(getNode(next, path));
  return next;
}

/** Split a top-level paragraph without creating persistent empty paragraphs. */
export function splitParagraph(document: MystDocument, path: NodePath, offset: number): MystDocument {
  assertTopLevelPath(path);
  const content = paragraphContent(document, path);
  assertInteriorOffset(content, offset);
  const [left, right] = splitInlineContent(content, offset);
  const next = cloneDocument(document);
  const original = getNode(next, path);
  next.children.splice(path[0], 1,
    { ...original, children: inlineContentToNodes(left) },
    { type: "paragraph", children: inlineContentToNodes(right) });
  assertPersistentParagraph(next.children[path[0]]);
  assertPersistentParagraph(next.children[path[0] + 1]);
  return next;
}

/** Concatenate the current and previous top-level paragraphs; add no space. */
export function mergeParagraphWithPrevious(document: MystDocument, path: NodePath): MystDocument {
  assertTopLevelPath(path);
  if (path[0] <= 0) throw new Error("merge requires a previous paragraph");
  const current = paragraphContent(document, path);
  const previous = paragraphContent(document, [path[0] - 1]);
  const next = cloneDocument(document);
  next.children[path[0] - 1].children = inlineContentToNodes(concatenateInlineContent(previous, current));
  assertPersistentParagraph(next.children[path[0] - 1]);
  next.children.splice(path[0], 1);
  return next;
}

function paragraphContent(document: MystDocument, path: NodePath): InlineContent[] {
  const node = getNode(document, path);
  if (node.type !== "paragraph") throw new Error("operation requires a paragraph");
  const content = projectInlineContent(node);
  if (!content) throw new Error("unsupported paragraph inline content");
  return content;
}

function assertTopLevelPath(path: NodePath): void {
  if (path.length !== 1) throw new Error("operation requires a top-level paragraph path [index]");
}

function assertInteriorOffset(content: InlineContent[], offset: number): void {
  if (!Number.isInteger(offset) || offset <= 0 || offset >= inlineContentLength(content)) {
    throw new Error("offset must be an interior UTF-16 position (0 < offset < paragraph length)");
  }
}
