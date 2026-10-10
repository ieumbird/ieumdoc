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
  insertTarget,
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
  replaceBlockSource,
  serialize,
  splitParagraph,
  mergeParagraphWithPrevious,
  moveBlock,
  updateHeadingLevel,
  updateHeadingInlineContent,
  updateEquationLatex,
  updateAdmonitionInlineContent,
  updateAdmonitionVariant,
  insertQuote,
  updateQuoteInlineContent,
  insertFootnoteDefinition,
  updateFootnoteDefinition,
  insertDivider,
  updateFigure,
  updateLabel,
  updateList,
  updateCodeBlock,
  updateTableCell,
  updateTableCaption,
  updateHeadingNumbering,
  updateParagraphInlineContent,
  validateFigure,
  validateStructure,
  type Document,
  type EditableBlock,
  type EditableDocument,
  type FigureContent,
  type InlineContent,
  type NodePath,
} from "@ieumdoc/core";
import type {
  BlockSourceEdit,
  BlockSourceRequest,
  BlockSourceResponse,
  OrderItem,
  SupportedEdits,
} from "../shared/document-protocol.ts";

/**
 * SupportedEdits → Core operations: replay an editing session's declarative edits on its
 * opening snapshot. Pure functions over Markdown source; no HTTP, filesystem or revision
 * handling (document-api.ts owns those).
 */

export class SaveContentError extends Error {
  constructor(message: string, readonly target: OrderItem | undefined, options: ErrorOptions) {
    super(message, options);
  }
}

function editAt<T>(target: OrderItem, apply: () => T): T {
  try { return apply(); }
  catch (error) { throw new SaveContentError(error instanceof Error ? error.message : String(error), target, { cause: error }); }
}

/** The read model and canonical writeability of one parsed snapshot. */
export function readModel(source: string): { document: EditableDocument; writeError: string | null } {
  const document = parse(source);
  return { document: getEditableDocument(document), writeError: canonicalWriteError(document) ?? null };
}

export function saveEdits(
  source: string,
  edits: SupportedEdits,
): { markdown: string } {
  let document = applySources(parse(source), edits.sources ?? []);
  const editable = getEditableDocument(document);
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
  for (const footnote of edits.footnotes ?? []) {
    const target = { path: [footnote.path[0]], part: 0 };
    assertPath(footnote.path, "footnote");
    const block = blockAt(editable, footnote.path);
    if (block?.block !== "footnote" || !block.editable) {
      throw new Error(`footnote edit is not allowed at [${footnote.path.join(",")}]`);
    }
    document = editAt(target, () => updateFootnoteDefinition(document, footnote.path, footnote.content));
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
    if (edit.path.length !== 1 || !(block?.block === "equation" || block?.block === "table" || block?.block === "target" || (block?.block === "figure" && block.editable))) {
      throw new Error(`label edit is not allowed at [${edit.path.join(",")}]`);
    }
    if (edit.from !== (block.label ?? "") || typeof edit.to !== "string") {
      throw new Error(`label does not match at [${edit.path.join(",")}]`);
    }
  }
  // Clear the changed labels first, so labels can move between blocks in one save.
  // A section label target is its label and is only renamed.
  for (const edit of labels) {
    if (blockAt(editable, edit.path)?.block === "target") continue;
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
    ...(edits.footnotes ?? []).map(edit => edit.path),
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
    // Core validates the label and the content when it inserts the definition.
    if (insert.block === "footnote") continue;
    // Core validates list and code block content and target labels itself when it inserts them.
    if (insert.block === "list" || insert.block === "code" || insert.block === "divider" || insert.block === "target") continue;
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
    } else if (item.block === "footnote") {
      document = editAt(target, () => insertFootnoteDefinition(document, index, item.label, item.content));
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
    } else if (item.block === "target") {
      document = editAt(target, () => insertTarget(document, index, typeof item.label === "string" ? item.label : ""));
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
  if (edits.headingNumbering !== undefined) document = updateHeadingNumbering(document, edits.headingNumbering);
  validateStructure(document);
  const markdown = serialize(document);
  return { markdown };
}

/** Replace read-only opening blocks with applied MyST source, in place: their locators stay valid. */
function applySources(opening: Document, sources: BlockSourceEdit[]): Document {
  if (sources.length === 0) return opening;
  const blocks = getEditableDocument(opening).blocks;
  let document = opening;
  for (const edit of sources) {
    assertPath(edit.path, "block source");
    if (edit.path.length !== 1 || !blockAt({ blocks }, edit.path)?.original || typeof edit.source !== "string") {
      throw new Error(`block source edit is not allowed at [${edit.path.join(",")}]`);
    }
    document = editAt({ path: edit.path, part: 0 }, () => replaceBlockSource(document, edit.path[0], edit.source));
  }
  return document;
}

/** The block an Editor Apply makes: the session's applied sources, then this one, on its opening snapshot. */
export function applyBlockSource(request: BlockSourceRequest): BlockSourceResponse {
  if (typeof request?.base !== "string") throw new Error("invalid session source");
  const others = Array.isArray(request.sources) ? request.sources : [];
  const document = applySources(parse(request.base), [...others, { path: request.path, source: request.source }]);
  return { block: getEditableDocument(document).blocks[request.path[0]] };
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

/** Core's persistent Figure validation for Editor Apply, label included (a pending Figure may
 * have only a label); returns the error message, if any. */
export function validateFigureRequest(value: (FigureContent & { label?: string }) | undefined): string | undefined {
  if (value?.label !== undefined && typeof value.label !== "string") throw new Error("figure label must be a string");
  return validateFigure(figureContent(value), value?.label ?? "");
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
    : item.kind === "footnote" ? `[^${item.label}]` : inlineText(item.children))).join("");
}
