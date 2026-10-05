import { createHash, randomUUID } from "node:crypto";
import fs, { readFileSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { figureCaptionContent } from "@ieumdoc/core/figure";
import {
  canonicalWriteError,
  getEditableDocument,
  isAdmonitionVariant,
  inlineContentLength,
  insertAdmonition,
  insertHeading,
  insertEquation,
  insertFigure,
  insertTable,
  insertTableColumn,
  insertTableRow,
  moveTableColumn,
  moveTableRow,
  removeTableColumn,
  removeTableRow,
  updateTableColumnAlignment,
  insertList,
  insertCodeBlock,
  insertParagraph,
  parse,
  removeBlock,
  serialize,
  splitParagraph,
  mergeParagraphWithPrevious,
  moveBlock,
  updateNodeTextAtPath,
  updateHeadingLevel,
  updateHeadingInlineContent,
  updateEquationLatex,
  updateAdmonitionInlineContent,
  updateAdmonitionVariant,
  insertQuote,
  updateQuoteInlineContent,
  insertDivider,
  updateFigure,
  updateLabel,
  updateList,
  updateCodeBlock,
  updateTableCell,
  updateTableCaption,
  updateParagraphInlineContent,
  validateFigure,
  validateStructure,
  type EditableBlock,
  type EditableDocument,
  type FigureContent,
  type InlineContent,
  type NodePath,
} from "@ieumdoc/core";

import type {
  OrderItem,
  SupportedEdits,
  SaveRequest,
  DocumentFileResponse,
  SaveResponse,
  SourceResponse,
  DocumentErrorResponse,
} from "../shared/document-protocol.ts";
export type {
  HeadingEdit,
  HeadingLevelEdit,
  ParagraphEdit,
  EquationEdit,
  FigureEdit,
  AdmonitionEdit,
  TableCellEdit,
  TableShapeEdit,
  ListEdit,
  CodeEdit,
  LabelEdit,
  QuoteEdit,
  InsertEdit,
  OrderItem,
  SupportedEdits,
  SaveRequest,
  DocumentFileResponse,
} from "../shared/document-protocol.ts";

class SaveContentError extends Error {
  constructor(message: string, readonly target: OrderItem | undefined, options: ErrorOptions) {
    super(message, options);
  }
}

function editAt<T>(target: OrderItem, apply: () => T): T {
  try { return apply(); }
  catch (error) { throw new SaveContentError(error instanceof Error ? error.message : String(error), target, { cause: error }); }
}

function errorPayload(error: unknown): DocumentErrorResponse {
  return { error: error instanceof Error ? error.message : String(error),
    ...(error instanceof SaveContentError && error.target ? { target: error.target } : {}) };
}

/** The read model and canonical writeability of one parsed snapshot. */
function readModel(source: string): { document: EditableDocument; writeError: string | null } {
  const document = parse(source);
  return { document: getEditableDocument(document), writeError: canonicalWriteError(document) ?? null };
}

export const DOCUMENT_CONFLICT_MESSAGE = "Document changed outside the editor. Your edits are kept. Use Source to copy applied content, or Reload to discard local changes and open the disk version.";
const EMPTY_DOCUMENT_MARKDOWN = serialize(parse(""));

export class DocumentConflictError extends Error {
  constructor() {
    super(DOCUMENT_CONFLICT_MESSAGE);
    this.name = "DocumentConflictError";
  }
}

const editorRoot = fileURLToPath(new URL("..", import.meta.url));
export const DOCUMENT_DIR = path.join(editorRoot, "document");
const DEFAULT_DOCUMENT_PATH = path.join(DOCUMENT_DIR, "technical-document.md");

export function resolveDocumentPath(requestedPath?: string): string {
  const candidate = requestedPath?.trim() || DEFAULT_DOCUMENT_PATH;
  const resolved = path.resolve(candidate);
  if (path.extname(resolved).toLowerCase() !== ".md") {
    throw new Error("document path must point to a .md file");
  }
  return resolved;
}

export function loadEditableDocument(source: string): EditableDocument {
  return getEditableDocument(parse(source));
}

export function documentRevision(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function loadDocumentFile(requestedPath?: string): DocumentFileResponse {
  const filePath = resolveDocumentPath(requestedPath);
  const source = readFileSync(filePath, "utf8");
  return { path: filePath, source, ...readModel(source), revision: documentRevision(source) };
}

export function createDocumentFile(requestedPath?: string): DocumentFileResponse {
  if (!requestedPath?.trim()) {
    throw new Error("document path is required");
  }
  const filePath = resolveDocumentPath(requestedPath);
  const parentDirectory = path.dirname(filePath);
  try {
    if (!statSync(parentDirectory).isDirectory()) {
      throw new Error("parent directory does not exist");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "parent directory does not exist") throw error;
    throw new Error("parent directory does not exist");
  }
  try {
    writeFileSync(filePath, EMPTY_DOCUMENT_MARKDOWN, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("file already exists");
    }
    throw error;
  }
  return loadDocumentFile(filePath);
}

export function saveDocumentFile(
  requestedPath: string | undefined,
  request: SaveRequest,
): DocumentFileResponse & { markdown: string } {
  const filePath = resolveDocumentPath(requestedPath);
  const saved = commitDocumentSave(
    () => readFileSync(filePath, "utf8"),
    (markdown) => replaceDocumentFile(filePath, markdown, request.revision),
    request,
  );
  return { ...saved, source: saved.markdown, path: filePath };
}

/** Finish writing beside the destination before replacing it; a failed write keeps the original. */
function replaceDocumentFile(filePath: string, markdown: string, revision: string | undefined): void {
  // Preserve a symlink itself by replacing its resolved target.
  const target = fs.realpathSync(filePath);
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, markdown, { encoding: "utf8", flag: "wx", mode: statSync(target).mode });
    if (documentRevision(readFileSync(target, "utf8")) !== revision) throw new DocumentConflictError();
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/**
 * The canonical Markdown this save request would write, through the same Core
 * save path. The file is only read, never written.
 */
export function previewDocumentFile(requestedPath: string | undefined, request: SaveRequest): SourceResponse {
  const filePath = resolveDocumentPath(requestedPath);
  if (request.base) {
    // A preview describes this session, even after an external conflict. Validate its
    // acknowledged revision without writing or requiring the disk to remain unchanged.
    const previous = request.base.savedEdits
      ? saveEdits(request.base.source, request.base.savedEdits).markdown : request.base.source;
    return { markdown: saveCurrentDocument(previous, request).markdown };
  }
  return { markdown: saveCurrentDocument(readFileSync(filePath, "utf8"), request).markdown };
}

export function saveCurrentDocument(
  source: string,
  request: SaveRequest,
): { markdown: string; document: EditableDocument; writeError: string | null; revision: string } {
  if (request.revision !== documentRevision(source)) {
    throw new DocumentConflictError();
  }
  const base = sessionSource(source, request);
  const saved = saveEdits(base, {
    headings: request.headings ?? [],
    headingLevels: request.headingLevels ?? [],
    paragraphs: request.paragraphs ?? [],
    equations: request.equations ?? [],
    figures: request.figures ?? [],
    cells: request.cells ?? [],
    tables: request.tables ?? [],
    tableCaptions: request.tableCaptions ?? [],
    admonitions: request.admonitions ?? [],
    quotes: request.quotes ?? [],
    lists: request.lists ?? [],
    codes: request.codes ?? [],
    labels: request.labels ?? [],
    splits: request.splits ?? [],
    merges: request.merges ?? [],
    inserts: request.inserts ?? [],
    deletes: request.deletes ?? [],
    order: request.order,
  });
  return { ...saved, revision: documentRevision(saved.markdown) };
}

function sessionSource(source: string, request: SaveRequest): string {
  if (request.base === undefined) return source;
  const base = request.base;
  if (!base || typeof base.source !== "string") throw new Error("invalid session source");
  // This is not a raw Markdown replacement API. A different baseline is accepted only
  // when replaying the previously saved Core operations reproduces the actual file.
  if (base.source !== source && (!base.savedEdits || saveEdits(base.source, base.savedEdits).markdown !== source)) {
    throw new DocumentConflictError();
  }
  return base.source;
}

export function commitDocumentSave(
  readSource: () => string,
  writeSource: (markdown: string) => void,
  request: SaveRequest,
): { markdown: string; document: EditableDocument; writeError: string | null; revision: string } {
  const source = readSource();
  const saved = saveCurrentDocument(source, request);
  writeSource(saved.markdown);
  return saved;
}

export function saveEdits(
  source: string,
  edits: SupportedEdits,
): { markdown: string; document: EditableDocument; writeError: string | null } {
  const editable = loadEditableDocument(source);
  let document = parse(source);
  for (const edit of edits.headings ?? []) {
    const target = { path: [edit.path[0]], part: 0 };
    assertPath(edit.path, "heading");
    const block = blockAt(editable, edit.path);
    if (block?.block !== "heading" || !block.editable) {
      throw new Error(`heading edit is not allowed at [${edit.path.join(",")}]`);
    }
    document = editAt(target, () => updateHeadingInlineContent(document, edit.path, edit.content));
  }
  for (const edit of edits.headingLevels ?? []) {
    const target = { path: [edit.path[0]], part: 0 };
    assertPath(edit.path, "heading");
    const block = blockAt(editable, edit.path);
    if (block?.block !== "heading" || !block.editable) {
      throw new Error(`heading level change is not allowed at [${edit.path.join(",")}]`);
    }
    if (edit.from !== block.level) {
      throw new Error(`heading level does not match at [${edit.path.join(",")}]`);
    }
    document = editAt(target, () => updateHeadingLevel(document, edit.path, edit.from, edit.to));
  }
  for (const paragraph of edits.paragraphs ?? []) {
    const target = { path: [paragraph.path[0]], part: 0 };
    assertPath(paragraph.path, "paragraph");
    const block = blockAt(editable, paragraph.path);
    if (block?.block !== "paragraph" || !block.editable) {
      throw new Error(`paragraph edit is not allowed at [${paragraph.path.join(",")}]`);
    }
    if (inlineText(paragraph.content).length === 0) {
      throw new Error("empty paragraph cannot be saved");
    }
    document = editAt(target, () => updateParagraphInlineContent(document, paragraph.path, paragraph.content));
  }
  for (const admonition of edits.admonitions ?? []) {
    const target = { path: [admonition.path[0]], part: 0 };
    assertPath(admonition.path, "admonition");
    const block = blockAt(editable, admonition.path);
    if (block?.block !== "admonition" || !block.editable) {
      throw new Error(`admonition edit is not allowed at [${admonition.path.join(",")}]`);
    }
    const { variant, content } = admonition;
    if (variant !== undefined) document = editAt(target, () => updateAdmonitionVariant(document, admonition.path, variant));
    if (content !== undefined) document = editAt(target, () => updateAdmonitionInlineContent(document, admonition.path, content));
  }
  for (const quote of edits.quotes ?? []) {
    const target = { path: [quote.path[0]], part: 0 };
    assertPath(quote.path, "quote");
    const block = blockAt(editable, quote.path);
    if (block?.block !== "quote" || !block.editable) {
      throw new Error(`quote edit is not allowed at [${quote.path.join(",")}]`);
    }
    document = editAt(target, () => updateQuoteInlineContent(document, quote.path, quote.content));
  }
  for (const edit of edits.lists ?? []) {
    const target = { path: [edit.path[0]], part: 0 };
    assertPath(edit.path, "list");
    if (edit.path.length !== 1 || blockAt(editable, edit.path)?.block !== "list") {
      throw new Error(`list edit is not allowed at [${edit.path.join(",")}]`);
    }
    document = editAt(target, () => updateList(document, edit.path, edit.list));
  }
  for (const edit of edits.codes ?? []) {
    const target = { path: [edit.path[0]], part: 0 };
    assertPath(edit.path, "code block");
    if (edit.path.length !== 1 || blockAt(editable, edit.path)?.block !== "code") {
      throw new Error(`code block edit is not allowed at [${edit.path.join(",")}]`);
    }
    document = editAt(target, () => updateCodeBlock(document, edit.path, edit.code));
  }
  for (const equation of edits.equations ?? []) {
    const target = { path: [equation.path[0]], part: 0 };
    assertPath(equation.path, "equation");
    const block = blockAt(editable, equation.path);
    if (block?.block !== "equation") {
      throw new Error(`equation edit is not allowed at [${equation.path.join(",")}]`);
    }
    document = editAt(target, () => updateEquationLatex(document, equation.path, equation.from, equation.to));
  }
  for (const figure of edits.figures ?? []) {
    const target = { path: [figure.path[0]], part: 0 };
    assertPath(figure.path, "figure");
    const block = blockAt(editable, figure.path);
    if (block?.block !== "figure" || !block.editable) {
      throw new Error(`figure edit is not allowed at [${figure.path.join(",")}]`);
    }
    if (figure.from?.imageUrl !== block.imageUrl || figure.from.imageAlt !== block.imageAlt ||
        JSON.stringify(figureCaptionContent(figure.from.caption)) !== JSON.stringify(block.caption.content)) {
      throw new Error(`figure does not match at [${figure.path.join(",")}]`);
    }
    document = editAt(target, () => updateFigure(document, figure.path, figureContent(figure.to)));
  }
  for (const edit of edits.cells ?? []) {
    const target = { path: [edit.path[0]], part: 0 };
    assertPath(edit.path, "table cell");
    const [table, row, index] = edit.path;
    const block = blockAt(editable, [table]);
    const cell = edit.path.length === 3 && block?.block === "table" ? block.rows[row]?.cells[index] : undefined;
    if (!cell?.editable) {
      throw new Error(`table cell edit is not allowed at [${edit.path.join(",")}]`);
    }
    if (!Array.isArray(edit.content)) {
      throw new Error(`table cell content must be InlineContent at [${edit.path.join(",")}]`);
    }
    document = editAt(target, () => updateTableCell(document, edit.path, edit.content));
  }
  // Snapshot cells are edited above at their snapshot paths. Core then removes the absent rows and
  // columns, moves the kept ones into their new order, adds rows and columns in new-grid order,
  // aligns the columns and fills the added cells.
  for (const edit of edits.tables ?? []) {
    const target = { path: [edit.path[0]], part: 0 };
    assertPath(edit.path, "table");
    const block = blockAt(editable, edit.path);
    const width = block?.block === "table" ? block.rows[0]?.cells.length ?? 0 : 0;
    if (edit.path.length !== 1 || block?.block !== "table" || edit.rows[0] !== 0 ||
        !isTableAxis(edit.rows, block.rows.length) || !isTableAxis(edit.columns, width) || !Array.isArray(edit.cells) ||
        (edit.align !== undefined && (!Array.isArray(edit.align) || edit.align.length !== edit.columns.length ||
          edit.align.some(align => align !== null && !["left", "center", "right"].includes(align))))) {
      throw new Error(`table edit is not allowed at [${edit.path.join(",")}]`);
    }
    const reshape = (axis: (number | null)[], count: number, remove: typeof removeTableRow, move: typeof moveTableRow) => {
      for (let index = count - 1; index >= 0; index--) {
        if (!axis.includes(index)) document = editAt(target, () => remove(document, edit.path, index));
      }
      const order = [...Array(count).keys()].filter(index => axis.includes(index));
      axis.filter(index => index !== null).forEach((index, to) => {
        const from = order.indexOf(index);
        if (from === to) return;
        document = editAt(target, () => move(document, edit.path, from, to));
        order.splice(to, 0, ...order.splice(from, 1));
      });
    };
    reshape(edit.rows, block.rows.length, removeTableRow, moveTableRow);
    reshape(edit.columns, width, removeTableColumn, moveTableColumn);
    for (const [row, from] of edit.rows.entries()) if (from === null) document = insertTableRow(document, edit.path, row);
    for (const [column, from] of edit.columns.entries()) if (from === null) document = insertTableColumn(document, edit.path, column);
    for (const [column, align] of (edit.align ?? []).entries()) {
      document = editAt(target, () => updateTableColumnAlignment(document, edit.path, column, align));
    }
    for (const cell of edit.cells) {
      if (edit.rows[cell.row] !== null && edit.columns[cell.column] !== null) {
        throw new Error(`table cell [${cell.row},${cell.column}] was not added`);
      }
      document = editAt(target, () => updateTableCell(document, [edit.path[0], cell.row, cell.column], cell.content));
    }
  }
  for (const edit of edits.tableCaptions ?? []) {
    const target = { path: edit.path, part: 0 };
    assertPath(edit.path, "table caption");
    if (edit.path.length !== 1 || blockAt(editable, edit.path)?.block !== "table" || !Array.isArray(edit.content)) {
      throw new Error("table caption edit is not allowed");
    }
    document = editAt(target, () => updateTableCaption(document, edit.path, edit.content));
  }
  const labels = edits.labels ?? [];
  for (const edit of labels) {
    assertPath(edit.path, "label");
    const block = blockAt(editable, edit.path);
    if (edit.path.length !== 1 || !(block?.block === "equation" || block?.block === "table" || (block?.block === "figure" && block.editable))) {
      throw new Error(`label edit is not allowed at [${edit.path.join(",")}]`);
    }
    if (edit.from !== (block.label ?? "") || typeof edit.to !== "string") {
      throw new Error(`label does not match at [${edit.path.join(",")}]`);
    }
  }
  // Clear the changed labels first, so labels can move between blocks in one save.
  for (const edit of labels) {
    const target = { path: edit.path, part: 0 };
    document = editAt(target, () => updateLabel(document, edit.path, ""));
  }
  for (const edit of labels) if (edit.to.length > 0) {
    const target = { path: edit.path, part: 0 };
    document = editAt(target, () => updateLabel(document, edit.path, edit.to));
  }
  const splits = edits.splits ?? [];
  const merges = edits.merges ?? [];
  if (splits.some(split => !Array.isArray(split.parts) || split.parts.length < 2) ||
      merges.some(merge => !Array.isArray(merge.paths) || merge.paths.length < 2)) {
    throw new Error("invalid paragraph split or merge");
  }
  const groups = [
    ...splits.map(split => ({ paths: [split.path], parts: split.parts })),
    ...merges,
  ];
  const seen = new Set<number>();
  for (const group of groups) {
    if (!Array.isArray(group.parts) || group.parts.length === 0) throw new Error("invalid paragraph parts");
    for (const [index, path] of group.paths.entries()) {
      assertPath(path, "paragraph");
      const block = blockAt(editable, path);
      if (path.length !== 1 || block?.block !== "paragraph" || !block.editable || seen.has(path[0]) ||
          (!edits.order && index > 0 && path[0] !== group.paths[index - 1][0] + 1) ||
          (edits.paragraphs ?? []).some(edit => edit.path.join(",") === path.join(","))) {
        throw new Error("invalid paragraph split or merge");
      }
      seen.add(path[0]);
    }
  }
  const inserts = edits.inserts ?? [];
  const deletes = edits.deletes ?? [];
  const edited = new Set([
    ...(edits.headings ?? []).map(edit => edit.path),
    ...(edits.headingLevels ?? []).map(edit => edit.path),
    ...(edits.paragraphs ?? []).map(edit => edit.path),
    ...(edits.equations ?? []).map(edit => edit.path),
    ...(edits.figures ?? []).map(edit => edit.path),
    ...(edits.admonitions ?? []).map(edit => edit.path),
    ...(edits.quotes ?? []).map(edit => edit.path),
    ...(edits.lists ?? []).map(edit => edit.path),
    ...(edits.codes ?? []).map(edit => edit.path),
    ...(edits.tables ?? []).map(edit => edit.path),
    ...(edits.tableCaptions ?? []).map(edit => edit.path),
    ...labels.map(edit => edit.path),
    ...groups.flatMap(group => group.paths),
  ].map(path => path.join(",")));
  const deleted = new Set<string>();
  for (const path of deletes) {
    assertPath(path, "delete");
    if (path.length !== 1 || !blockAt(editable, path) || edited.has(path.join(",")) || deleted.has(path.join(","))) {
      throw new Error("invalid block deletion");
    }
    deleted.add(path.join(","));
  }
  for (const insert of inserts) {
    if ((insert.block === "equation" || insert.block === "figure") &&
        insert.label !== undefined && typeof insert.label !== "string") {
      throw new Error("inserted label must be a string");
    }
    if (insert.block === "paragraph") {
      if (!Array.isArray(insert.content) || inlineText(insert.content).length === 0) {
        throw new Error("empty paragraph cannot be saved");
      }
      continue;
    }
    if (insert.block === "admonition") {
      if (!isAdmonitionVariant(insert.variant)) throw new Error("inserted admonition must be of a standard MyST kind");
      if (!Array.isArray(insert.content) || inlineText(insert.content).trim().length === 0) {
        throw new Error("admonition body cannot be empty");
      }
      continue;
    }
    if (insert.block === "equation") {
      if (insert.latex.length === 0) {
        throw new Error("empty equation LaTeX cannot be saved");
      }
      continue;
    }
    if (insert.block === "figure") {
      figureContent(insert);
      continue;
    }
    if (insert.block === "table") {
      if (!Array.isArray(insert.rows) || insert.rows.flat().every(content => inlineText(content) === "")) {
        throw new Error("empty table cannot be saved");
      }
      continue;
    }
    if (insert.block === "quote") {
      if (!Array.isArray(insert.content) || inlineText(insert.content).trim().length === 0) {
        throw new Error("quote cannot be empty");
      }
      continue;
    }
    // Core validates list and code block content itself when it is inserted.
    if (insert.block === "list" || insert.block === "code" || insert.block === "divider") continue;
    if (insert.block !== "heading" || !Number.isInteger(insert.level) || insert.level < 1 || insert.level > 6) {
      throw new Error("invalid heading insertion");
    }
    if (!Array.isArray(insert.content) || inlineText(insert.content).length === 0) {
      throw new Error("empty heading cannot be saved");
    }
  }
  if ((inserts.length > 0 || deletes.length > 0) && edits.order === undefined) {
    throw new Error("block insertion or deletion requires a block order");
  }
  // Locators address this save's source snapshot, then each split result.
  // Core alone performs every persistent move, merge, content update and split.
  const locators: Locator[] = editable.blocks.map(block => ({ path: block.path, part: 0 }));
  const move = (from: number, to: number) => {
    document = moveBlock(document, from, to);
    locators.splice(to, 0, locators.splice(from, 1)[0]);
  };
  for (const group of [...groups].sort((a, b) => b.paths[0][0] - a.paths[0][0])) {
    const target = { path: group.paths[0], part: 0 };
    // Reordered neighbors may originate at non-adjacent snapshot paths.
    for (let index = 1; index < group.paths.length; index++) {
      const from = locators.findIndex(item => locatorKey(item) === locatorKey({path: group.paths[index], part: 0}));
      let previous = locators.findIndex(item => locatorKey(item) === locatorKey({path: group.paths[index - 1], part: 0}));
      if (from < previous) previous--;
      move(from, previous + 1);
    }
    const start = locators.findIndex(item => locatorKey(item) === locatorKey({path: group.paths[0], part: 0}));
    for (let index = group.paths.length - 1; index > 0; index--) {
      document = editAt(target, () => mergeParagraphWithPrevious(document, [start + index]));
    }
    document = editAt(target, () => updateParagraphInlineContent(document, [start], group.parts.flat()));
    // Split offsets use Core's paragraph offset definition (inline math counts as one).
    const lengths = group.parts.map(part => inlineContentLength(part));
    let offset = lengths.reduce((sum, length) => sum + length, 0);
    for (let index = lengths.length - 1; index > 0; index--) {
      offset -= lengths[index];
      document = editAt(target, () => splitParagraph(document, [start], offset));
    }
    locators.splice(start, group.paths.length, ...group.parts.map((_, part) => ({path: group.paths[0], part})));
  }
  for (const path of deletes) {
    const index = locators.findIndex(item => locatorKey(item) === locatorKey({path, part: 0}));
    document = removeBlock(document, index);
    locators.splice(index, 1);
  }
  for (const [insert, item] of inserts.entries()) {
    const target = { insert };
    // New blocks start at the end; the requested order places them.
    const index = locators.length;
    if (item.block === "paragraph") {
      document = editAt(target, () => insertParagraph(document, index, item.content));
    } else if (item.block === "heading") {
      document = editAt(target, () => insertHeading(document, index, item.level, item.content));
    } else if (item.block === "admonition") {
      document = editAt(target, () => insertAdmonition(document, index, item.variant, item.content));
    } else if (item.block === "quote") {
      document = editAt(target, () => insertQuote(document, index, item.content));
    } else if (item.block === "divider") {
      document = editAt(target, () => insertDivider(document, index));
    } else if (item.block === "equation") {
      document = editAt(target, () => insertEquation(document, index, item.latex));
    } else if (item.block === "table") {
      document = editAt(target, () => insertTable(document, index, item.rows, item.align));
      if (item.caption) document = editAt(target, () => updateTableCaption(document, [index], item.caption!));
    } else if (item.block === "list") {
      document = editAt(target, () => insertList(document, index, item.list));
    } else if (item.block === "code") {
      document = editAt(target, () => insertCodeBlock(document, index, { language: item.language, code: item.code }));
    } else {
      document = editAt(target, () => insertFigure(document, index, figureContent(item)));
    }
    if ((item.block === "equation" || item.block === "figure" || item.block === "table") && item.label) {
      const label = item.label;
      document = editAt(target, () => updateLabel(document, [index], label));
    }
    locators.push({ insert });
  }
  if (edits.order !== undefined) {
    if (!Array.isArray(edits.order) || edits.order.length !== locators.length) throw new Error("invalid block order");
    const expected = new Set(locators.map(locatorKey));
    for (const item of edits.order) {
      if ("insert" in item) {
        if (!Number.isInteger(item.insert) || !expected.delete(locatorKey(item))) throw new Error("invalid block order");
        continue;
      }
      assertPath(item.path, "order");
      if (item.path.length !== 1 || !Number.isInteger(item.part) || !expected.delete(locatorKey(item))) throw new Error("invalid block order");
    }
    for (const [to, item] of edits.order.entries()) {
      const from = locators.findIndex(locator => locatorKey(locator) === locatorKey(item));
      if (from !== to) move(from, to);
    }
  }
  validateStructure(document);
  const markdown = serialize(document);
  return { markdown, ...readModel(markdown) };
}

export async function handleDocumentRequest(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): Promise<void> {
  const requestUrl = new URL(req.url ?? "", "http://localhost");
  const url = requestUrl.pathname;
  if (url.startsWith("/document/")) {
    serveMedia(url.slice("/document/".length), res, requestUrl.searchParams.get("path") ?? undefined);
    return;
  }
  if (url === "/api/figure-validation") {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      sendJson(res, 200, { error: validateFigureRequest(JSON.parse(await readBody(req))) ?? null });
    } catch (error) {
      sendJson(res, 400, errorPayload(error));
    }
    return;
  }
  if (url === "/api/document-source") {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    try {
      const body = JSON.parse(await readBody(req)) as SaveRequest;
      sendJson(res, 200, previewDocumentFile(typeof body.path === "string" ? body.path : undefined, saveRequestOf(body)));
    } catch (error) {
      sendJson(res, error instanceof DocumentConflictError ? 409 : 400, errorPayload(error));
    }
    return;
  }
  if (url !== "/api/document") {
    next();
    return;
  }

  try {
    if (req.method === "GET") {
      sendJson(res, 200, loadDocumentFile(requestUrl.searchParams.get("path") ?? undefined));
      return;
    }
    if (req.method === "PUT") {
      const body = JSON.parse(await readBody(req)) as { path?: unknown };
      const created = createDocumentFile(typeof body.path === "string" ? body.path : undefined);
      sendJson(res, 201, created);
      return;
    }
    if (req.method === "POST") {
      const body = JSON.parse(await readBody(req)) as SaveRequest;
      try {
        const saved = saveDocumentFile(typeof body.path === "string" ? body.path : undefined, saveRequestOf(body));
        sendJson(res, 200, { path: saved.path, document: saved.document, revision: saved.revision, writeError: saved.writeError } satisfies SaveResponse);
      } catch (error) {
        if (error instanceof DocumentConflictError) {
          sendJson(res, 409, { error: error.message });
          return;
        }
        throw error;
      }
      return;
    }
    res.statusCode = 405;
    res.end();
  } catch (error) {
    sendJson(res, 400, errorPayload(error));
  }
}

function saveRequestOf(body: SaveRequest): SaveRequest {
  return {
    revision: body.revision,
    base: body.base,
    headings: Array.isArray(body.headings) ? body.headings : [],
    headingLevels: Array.isArray(body.headingLevels) ? body.headingLevels : [],
    paragraphs: Array.isArray(body.paragraphs) ? body.paragraphs : [],
    equations: Array.isArray(body.equations) ? body.equations : [],
    figures: Array.isArray(body.figures) ? body.figures : [],
    cells: Array.isArray(body.cells) ? body.cells : [],
    tables: Array.isArray(body.tables) ? body.tables : [],
    tableCaptions: Array.isArray(body.tableCaptions) ? body.tableCaptions : [],
    admonitions: Array.isArray(body.admonitions) ? body.admonitions : [],
    quotes: Array.isArray(body.quotes) ? body.quotes : [],
    lists: Array.isArray(body.lists) ? body.lists : [],
    codes: Array.isArray(body.codes) ? body.codes : [],
    labels: Array.isArray(body.labels) ? body.labels : [],
    splits: Array.isArray(body.splits) ? body.splits : [],
    merges: Array.isArray(body.merges) ? body.merges : [],
    inserts: Array.isArray(body.inserts) ? body.inserts : [],
    deletes: Array.isArray(body.deletes) ? body.deletes : [],
    order: body.order,
  };
}

type Locator = OrderItem;

/** Each new row or column is a distinct snapshot index or null (added); at least one remains. */
function isTableAxis(axis: unknown, count: number): axis is (number | null)[] {
  if (!Array.isArray(axis) || axis.length === 0) return false;
  const kept = axis.filter(item => item !== null);
  return new Set(kept).size === kept.length && kept.every(item => Number.isInteger(item) && item >= 0 && item < count);
}

function locatorKey(item: Locator): string {
  return "insert" in item ? `insert:${item.insert}` : `${item.path.join(",")}:${item.part}`;
}

function blockAt(document: EditableDocument, path: NodePath): EditableBlock | undefined {
  return document.blocks.find(
    (block) => block.path.length === path.length && block.path.every((part, index) => part === path[index]),
  );
}

function assertPath(path: NodePath, label: string): void {
  if (!Array.isArray(path) || path.length === 0 || path.some((index) => !Number.isInteger(index) || index < 0)) {
    throw new Error(`${label} path is invalid`);
  }
}

/** Core's persistent Figure validation for Editor Apply; returns the error message, if any. */
export function validateFigureRequest(value: FigureContent | undefined): string | undefined {
  return validateFigure(figureContent(value));
}

/** A complete typed Figure value; omitted properties are not treated as unchanged. */
function figureContent(value: FigureContent | undefined): FigureContent {
  if (typeof value?.imageUrl !== "string" || typeof value.imageAlt !== "string" ||
      (typeof value.caption !== "string" && !Array.isArray(value.caption))) {
    throw new Error("figure image URL and alt text must be strings; caption must be text or InlineContent");
  }
  return { imageUrl: value.imageUrl, imageAlt: value.imageAlt, caption: value.caption };
}

function inlineText(content: InlineContent[]): string {
  if (!Array.isArray(content)) return "";
  return content.map((item) => (item.kind === "text" ? item.text : item.kind === "break" ? "\n"
    : item.kind === "math" ? `$${item.value}$` : item.kind === "code" ? `\`${item.value}\`` : item.kind === "reference" ? `{${item.role}}\`${item.label}\``
    : inlineText(item.children))).join("");
}

export function resolveMediaPath(assetPath: string, documentPath?: string): string {
  const decodedPath = decodeURIComponent(assetPath);
  const documentFile = resolveDocumentPath(documentPath);
  const documentDirectory = path.dirname(documentFile);
  if (!decodedPath || decodedPath.includes("\0") || path.isAbsolute(decodedPath) || path.win32.isAbsolute(decodedPath) || /^[A-Za-z]:/.test(decodedPath)) {
    throw new Error("media path must be relative to the document");
  }
  if (/%(?:2e|2f|5c|00)/i.test(decodedPath)) {
    throw new Error("media path escapes the document directory");
  }
  const resolved = path.resolve(documentDirectory, decodedPath);
  const relative = path.relative(documentDirectory, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("media path escapes the document directory");
  }
  // Existing media (and the nearest existing parent) must also stay inside the real boundary.
  const root = fs.realpathSync(documentDirectory);
  let existing = resolved;
  while (!fs.existsSync(existing) && existing !== documentDirectory) existing = path.dirname(existing);
  const actual = path.relative(root, fs.realpathSync(existing));
  if (actual === ".." || actual.startsWith(`..${path.sep}`) || path.isAbsolute(actual)) {
    throw new Error("media symlink escapes the document directory");
  }
  return resolved;
}

function serveMedia(assetPath: string, res: ServerResponse, documentPath?: string): void {
  let file: string;
  try {
    file = resolveMediaPath(assetPath, documentPath);
  } catch {
    res.statusCode = 400;
    res.end();
    return;
  }
  try {
    const data = readFileSync(file);
    res.statusCode = 200;
    res.setHeader("Content-Type", path.extname(file).toLowerCase() === ".svg" ? "image/svg+xml" : path.extname(file).toLowerCase() === ".png" ? "image/png" : "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end();
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
