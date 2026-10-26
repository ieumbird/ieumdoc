import { allocateBlockPath } from "./block-locators.ts";
import { SaveContentError } from "../shared/save-error.ts";
import { inlineContentText as inlineText, sameInlineContent as sameInline, isAdmonitionVariant, type CodeBlockContent, type EditableDocument, type FigureContent, type InlineContent, type ListContent } from "@ieumdoc/core";
import { defaultHeadingNumbering, referenceTemplatesError, NUMBERED_KINDS, type ReferenceTemplates } from "@ieumdoc/core/numbering";
import { figureCaptionContent, figureContentError } from "@ieumdoc/core/figure";
import { fromTiptapContent, toTiptapContent, type TiptapJSON } from "./tiptap-inline.ts";
import {
  isNewBlockPath,
  pathKey,
  sourcePathOf,
  TABLE_CELL_SOURCE_ATTR,
  toTiptapBlock,
  toTiptapDocument,
} from "./tiptap-projection.ts";
import type {
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
  FootnoteEdit,
  InsertEdit,
  OrderItem,
  SupportedEdits,
} from "../shared/document-protocol.ts";

/**
 * Tiptap → Core: validate an editor document against its snapshot projection and collect the
 * SupportedEdits the Host replays through Core operations. Pure functions over Tiptap JSON.
 */

/** Editor document attribute listing snapshot paths removed by an explicit Delete command. */
export const DELETED_PATHS_ATTR = "deletedPaths";

export function deletedPathsOf(document: TiptapJSON): string[] {
  const value = document.attrs?.[DELETED_PATHS_ATTR];
  return Array.isArray(value) ? value.map(String) : [];
}

const KNOWN_BLOCKS = new Set([
  "heading",
  "paragraph",
  "admonition",
  "quote",
  "footnoteDefinition",
  "divider",
  "figure",
  "equation",
  "table",
  "bulletList",
  "orderedList",
  "codeBlock",
  "labelTarget",
]);

const LIST_BLOCKS = new Set(["bulletList", "orderedList"]);

/** Text blocks that convert into each other as a new block with a fresh locator. */
const TEXT_BLOCKS = new Set(["paragraph", "heading", "codeBlock"]);

/** Opening-snapshot lookup. Keep the first occurrence, as the former find did. */
export function snapshotBlocksByPath(baseline: TiptapJSON): ReadonlyMap<string, TiptapJSON> {
  const blocks = new Map<string, TiptapJSON>();
  for (const node of baseline.content ?? []) {
    const key = sourcePathOf(node);
    if (!blocks.has(key)) blocks.set(key, node);
  }
  return blocks;
}

function groupBlocksByPath(nodes: TiptapJSON[]): Map<string, TiptapJSON[]> {
  const groups = new Map<string, TiptapJSON[]>();
  for (const node of nodes) {
    const key = sourcePathOf(node);
    const group = groups.get(key);
    if (group) group.push(node);
    else groups.set(key, [node]);
  }
  return groups;
}

export function collectSupportedEdits(snapshot: EditableDocument, next: TiptapJSON): SupportedEdits & Required<Pick<SupportedEdits, "headings" | "paragraphs">> {
  const document = snapshot;
  assertSupportedDocumentChange(toTiptapDocument(document), next);
  const headings: HeadingEdit[] = [];
  const headingLevels: HeadingLevelEdit[] = [];
  const paragraphs: ParagraphEdit[] = [];
  const equations: EquationEdit[] = [];
  const figures: FigureEdit[] = [];
  const cells: TableCellEdit[] = [];
  const tables: TableShapeEdit[] = [];
  const tableCaptions: NonNullable<SupportedEdits["tableCaptions"]> = [];
  const admonitions: AdmonitionEdit[] = [];
  const quotes: QuoteEdit[] = [];
  const footnotes: FootnoteEdit[] = [];
  const lists: ListEdit[] = [];
  const codes: CodeEdit[] = [];
  const labels: LabelEdit[] = [];
  const splits: NonNullable<SupportedEdits["splits"]> = [];
  const merges: NonNullable<SupportedEdits["merges"]> = [];
  const inserts: InsertEdit[] = [];
  const insertOf = new Map<TiptapJSON, number>();
  const used = new Set<string>();
  const nodes = (next.content ?? []).filter(node => !isSessionPlaceholder(node));
  const saveError = (node: TiptapJSON, message: string, action = "Enter the required content or delete the empty block/item.") => new SaveContentError(message, undefined, {
    phase: "collect", block: { index: (next.content ?? []).indexOf(node), type: node.type ?? "unknown" },
    action,
  });
  const blocksByPath = new Map(document.blocks.map(block => [pathKey(block.path), block]));
  for (const [key, group] of groupBlocksByPath(nodes)) {
    const paths = snapshotPaths(key);
    paths.forEach(path => used.add(path));
    if (paths.length === 0) {
      for (const node of group) {
        atEditorBlock(next, node, () => {
          const insert = insertEdit(node);
          if (insert.block === "paragraph" && inlineText(insert.content).length === 0) {
            throw saveError(node, "empty paragraph cannot be saved");
          }
          if (insert.block === "heading" && inlineText(insert.content).length === 0) {
            throw saveError(node, "empty heading cannot be saved.", "Enter text or delete this block.");
          }
          if (insert.block === "admonition" && inlineText(insert.content).trim().length === 0) {
            throw saveError(node, "admonition body cannot be empty");
          }
          if (insert.block === "quote" && inlineText(insert.content).trim().length === 0) {
            throw saveError(node, "quote cannot be empty");
          }
          if (insert.block === "footnote" && inlineText(insert.content).trim().length === 0) {
            throw saveError(node, EMPTY_FOOTNOTE, "Enter its text or delete the footnote.");
          }
          if (insert.block === "equation" && insert.latex.length === 0) {
            throw saveError(node, "empty equation LaTeX cannot be saved");
          }
          if (insert.block === "figure") assertFigureContent(insert);
          if (insert.block === "table" && insert.rows.flat().every(content => inlineText(content).length === 0)) {
            throw saveError(node, "empty table cannot be saved");
          }
          if (insert.block === "list" && hasEmptyListItem(insert.list)) {
            throw saveError(node, EMPTY_LIST_ITEM, "Enter text or remove the item.");
          }
          insertOf.set(node, inserts.length);
          inserts.push(insert);
        });
      }
      continue;
    }
    const node = group[0];
    atEditorBlock(next, node, () => {
      const block = blocksByPath.get(paths[0])!;
      if (paths.length > 1) {
        merges.push({ paths: paths.map(path => path.split(",").map(Number)), parts: group.map(paragraphInline) });
      } else if (block.block === "heading" && block.editable) {
        const level = headingLevel(node);
        if (level !== block.level) headingLevels.push({ path: block.path, from: block.level, to: level });
        const content = headingInline(node);
        if (!sameInline(content, block.content)) {
          if (inlineText(content).length === 0) throw saveError(node, "empty heading text cannot be saved");
          headings.push({ path: block.path, content });
        }
      } else if (block.block === "paragraph") {
        if (group.length > 1) {
          splits.push({ path: block.path, parts: group.map(paragraphInline) });
          return;
        }
        const content = paragraphInline(node);
        if (sameInline(content, block.content)) return;
        if (inlineText(content).length === 0) throw saveError(node, "empty paragraph cannot be saved.", "Enter text or delete this block.");
        paragraphs.push({ path: block.path, content });
      } else if (block.block === "equation") {
        const latex = equationLatex(node);
        if (latex !== block.latex) equations.push({ path: block.path, from: block.latex, to: latex });
        const label = blockLabel(node);
        if (label !== block.label) labels.push({ path: block.path, from: block.label, to: label });
      } else if (block.block === "figure" && block.editable) {
        const label = blockLabel(node);
        if (label !== block.label) labels.push({ path: block.path, from: block.label, to: label });
        const from = { imageUrl: block.imageUrl, imageAlt: block.imageAlt, caption: captionValue(block.caption.content) };
        const to = figureContent(node);
        if (to.imageUrl === from.imageUrl && to.imageAlt === from.imageAlt &&
            sameInline(figureCaptionContent(to.caption), block.caption.content)) return;
        assertFigureContent(to);
        figures.push({ path: block.path, from, to });
      } else if (block.block === "admonition" && block.editable) {
        const variant = String(node.attrs?.variant ?? "");
        const content = paragraphInline(node);
        const edit: AdmonitionEdit = { path: block.path };
        if (variant !== block.variant && isAdmonitionVariant(variant)) edit.variant = variant;
        if (!sameInline(content, block.content)) {
          if (inlineText(content).trim().length === 0) throw saveError(node, "admonition body cannot be empty");
          edit.content = content;
        }
        if (edit.variant || edit.content) admonitions.push(edit);
      } else if (block.block === "quote" && block.editable) {
        const content = paragraphInline(node);
        if (sameInline(content, block.content)) return;
        if (inlineText(content).trim().length === 0) throw saveError(node, "quote cannot be empty");
        quotes.push({ path: block.path, content });
      } else if (block.block === "footnote" && block.editable) {
        const content = paragraphInline(node);
        if (sameInline(content, block.content)) return;
        if (inlineText(content).trim().length === 0) throw saveError(node, EMPTY_FOOTNOTE, "Enter its text or delete the footnote.");
        footnotes.push({ path: block.path, content });
      } else if (block.block === "target") {
        const label = targetLabel(node);
        if (label !== block.label) labels.push({ path: block.path, from: block.label, to: label });
      } else if (block.block === "code") {
        const code = codeContent(node);
        if (code.language !== block.language || code.code !== block.code) codes.push({ path: block.path, code });
      } else if (block.block === "list") {
        const list = listContent(node);
        if (sameList(list, block)) return;
        if (hasEmptyListItem(list)) throw saveError(node, EMPTY_LIST_ITEM, "Enter text or remove the item.");
        lists.push({ path: block.path, list });
      } else if (block.block === "table") {
        const label = blockLabel(node);
        if (label !== (block.label ?? "")) labels.push({ path: block.path, from: block.label ?? "", to: label });
        const caption = tableCaption(node);
        if (!sameInline(caption, block.caption ?? [])) tableCaptions.push({ path: block.path, content: caption });
        const next = tableCells(node);
        const shape = tableShape(tableCells(toTiptapBlock(block)), next);
        block.rows.forEach((row, rowIndex) => row.cells.forEach((cell, index) => {
          const content = next[shape.rows.indexOf(rowIndex)]?.[shape.columns.indexOf(index)]?.content;
          if (cell.editable && content !== undefined && !sameInline(content, cell.content)) cells.push({ path: cell.path, content });
        }));
        const unchanged = (axis: (number | null)[], count: number) => axis.length === count && axis.every((from, index) => from === index);
        if (shape.align || !unchanged(shape.rows, block.rows.length) || !unchanged(shape.columns, block.rows[0]?.cells.length ?? 0)) {
          tables.push({ path: block.path, ...shape, cells: next.flatMap((row, rowIndex) => row.flatMap((cell, column) =>
            (shape.rows[rowIndex] === null || shape.columns[column] === null) && cell.content.length ? [{ row: rowIndex, column, content: cell.content }] : [])) });
        }
      }
    });
  }
  const deletes = document.blocks.filter(block => !used.has(pathKey(block.path))).map(block => block.path);
  const counts = new Map<string, number>();
  // The displayed order; canonical write places the endnotes after the body whatever it is.
  const order: OrderItem[] = nodes.map(node => {
    const insert = insertOf.get(node);
    if (insert !== undefined) return { insert };
    const key = snapshotPaths(sourcePathOf(node)).join(";");
    const part = counts.get(key) ?? 0;
    counts.set(key, part + 1);
    return { path: key.split(";")[0].split(",").map(Number), part };
  });
  const positions = order.flatMap(item => "path" in item ? [item.path[0]] : []);
  const reordered = inserts.length > 0 || deletes.length > 0 ||
    positions.some((position, index) => index > 0 && position < positions[index - 1]) ||
    merges.some(merge => merge.paths.some((path, index) => index > 0 && path[0] !== merge.paths[index - 1][0] + 1));
  const templates = next.attrs?.referenceTemplates as ReferenceTemplates | null | undefined;
  const templateError = referenceTemplatesError(templates ?? {});
  if (templateError) throw new Error(templateError);
  const changedTemplates = NUMBERED_KINDS.some(kind => templates?.[kind] !== document.referenceTemplates?.[kind]);
  const settings = next.attrs?.headingNumbering ?? null;
  const changedSettings = JSON.stringify(settings) !== JSON.stringify(document.headingNumbering ?? null);
  if (changedSettings && settings !== null && JSON.stringify(settings) !== JSON.stringify(defaultHeadingNumbering(true))) {
    throw new Error("unsupported heading numbering settings");
  }
  return {
    ...(changedSettings ? { headingNumbering: settings !== null } : {}),
    ...(changedTemplates ? { referenceTemplates: Object.fromEntries(NUMBERED_KINDS.map(kind => [kind, templates?.[kind] ?? null])) } : {}),
    ...(next.attrs?.bibliography !== null && next.attrs?.bibliography !== undefined ? { bibliography: next.attrs.bibliography as string[] } : {}),
    ...(reordered ? { order } : {}),
    headings,
    ...(headingLevels.length ? { headingLevels } : {}),
    paragraphs,
    ...(equations.length ? { equations } : {}),
    ...(figures.length ? { figures } : {}),
    ...(cells.length ? { cells } : {}),
    ...(tables.length ? { tables } : {}),
    ...(tableCaptions.length ? { tableCaptions } : {}),
    ...(admonitions.length ? { admonitions } : {}),
    ...(quotes.length ? { quotes } : {}),
    ...(footnotes.length ? { footnotes } : {}),
    ...(lists.length ? { lists } : {}),
    ...(codes.length ? { codes } : {}),
    ...(labels.length ? { labels } : {}),
    ...(splits.length ? { splits } : {}),
    ...(merges.length ? { merges } : {}),
    ...(inserts.length ? { inserts } : {}),
    ...(deletes.length ? { deletes } : {}),
  };
}

/** Editor-only space and never-applied atoms have no persistent document meaning.
 * Existing content emptied by the user is deliberately not a placeholder. */
export function isSessionPlaceholder(node: TiptapJSON): boolean {
  if (!isNewBlockPath(sourcePathOf(node))) return false;
  if (node.type === "paragraph") return (node.content ?? []).length === 0;
  if (node.type === "equation") return node.attrs?.latex === "";
  if (node.type === "codeBlock") return (node.content ?? []).length === 0 && !node.attrs?.language;
  // A new list whose only item was never written.
  if (LIST_BLOCKS.has(node.type ?? "")) {
    const items = node.content ?? [];
    return items.length === 1 && (items[0].content ?? []).length === 1 && (items[0].content?.[0]?.content ?? []).length === 0;
  }
  return false;
}

/** Compare the applied state that Save acknowledges, excluding editor-only placeholders.
 * Use schema-normalized input on both sides; paths remain opening-snapshot locators. */
export function appliedDocument(document: TiptapJSON): TiptapJSON {
  const attrs = {
    ...(document.attrs?.headingNumbering ? { headingNumbering: document.attrs.headingNumbering } : {}),
    ...(document.attrs?.referenceTemplates && Object.keys(document.attrs.referenceTemplates).length ? { referenceTemplates: document.attrs.referenceTemplates } : {}),
    ...(document.attrs?.bibliography !== null && document.attrs?.bibliography !== undefined ? { bibliography: document.attrs.bibliography } : {}),
  };
  return { type: "doc", ...(Object.keys(attrs).length ? { attrs } : {}), content: (document.content ?? []).filter(node => !isSessionPlaceholder(node)) };
}

export function isSupportedDocumentChange(baseline: TiptapJSON, next: TiptapJSON, blocksByPath?: ReadonlyMap<string, TiptapJSON>): boolean {
  try {
    assertSupportedDocumentChange(baseline, next, blocksByPath);
    return true;
  } catch {
    return false;
  }
}

export function freshBlockPath(): string { return allocateBlockPath("engine"); }

/** Adapt engine-created blocks to opening-snapshot locators, without changing content.
 * Kept separate from validation: unknown semantics still fail closed. */
export function normalizeEngineDocument(baseline: TiptapJSON, next: TiptapJSON, emptySpace = false, blocksByPath = snapshotBlocksByPath(baseline)): TiptapJSON {
  const seen = new Set<string>();
  const content = (next.content ?? []).map(node => {
    const key = sourcePathOf(node);
    const original = blocksByPath.get(key);
    const conversion = TEXT_BLOCKS.has(node.type ?? "") && TEXT_BLOCKS.has(original?.type ?? "") && node.type !== original?.type;
    const emptyParagraph = node.type === "paragraph" && !(node.content?.length);
    const duplicate = seen.has(key) && node.type !== "paragraph";
    seen.add(key);
    if (!key || conversion || duplicate || (emptySpace && emptyParagraph && !isNewBlockPath(key))) {
      // Validate representability before granting a fresh identity.
      insertEdit(node);
      return { ...node, attrs: { ...node.attrs, sourcePath: freshBlockPath() } };
    }
    return node;
  });
  const present = new Set(content.flatMap(node => snapshotPaths(sourcePathOf(node))));
  return { ...next, content, attrs: { ...next.attrs, [DELETED_PATHS_ATTR]:
    [...new Set([...deletedPathsOf(next), ...(baseline.content ?? []).map(sourcePathOf).filter(key => !isNewBlockPath(key) && !present.has(key))])] } };
}

/**
 * Validates the editor document against the loaded snapshot. New paragraphs and headings are
 * representable here; a missing snapshot block must be declared as deleted.
 * The structure guard declares deletions from accepted engine transactions.
 */
export function assertSupportedDocumentChange(baseline: TiptapJSON, next: TiptapJSON, blocksByPath = snapshotBlocksByPath(baseline)): void {
  if (baseline.type !== "doc" || next.type !== "doc") {
    throw new Error('Tiptap document must have type "doc"');
  }
  const before = baseline.content ?? [];
  const after = next.content ?? [];
  if (!Array.isArray(after)) {
    throw new Error("Tiptap document content must be an array");
  }
  const used = new Set<string>();
  for (const [key, group] of groupBlocksByPath(after)) {
    const all = key.split(";");
    for (const path of all) {
      if (used.has(path) || (!isNewBlockPath(path) && !blocksByPath.has(path))) {
        throw new Error("block insertion or identity changed");
      }
      used.add(path);
    }
    const paths = snapshotPaths(key);
    if (paths.length === 0) {
      for (const node of group) {
        atEditorBlock(next, node, () => insertEdit(node));
      }
      continue;
    }
    const originals = paths.map(path => blocksByPath.get(path));
    if (all.length > 1 && originals.some(block => block!.type !== "paragraph")) {
      throw new Error("only editable paragraphs can merge");
    }
    if (group.length > 1 && originals[0]!.type !== "paragraph") throw new Error("block insertion is not allowed");
    for (const node of group) atEditorBlock(next, node, () => assertBlockChange(originals[0], node));
  }
  const deleted = new Set(deletedPathsOf(next));
  // A new document's empty starting paragraph is no snapshot block: replacing it deletes nothing.
  if (before.some(node => !isNewBlockPath(sourcePathOf(node)) && !used.has(sourcePathOf(node)) && !deleted.has(sourcePathOf(node)))) {
    throw new Error("block deletion is not allowed");
  }
}

/** List v1 content of an editor list: each item holds one paragraph and at most one nested list.
 * Empty items are representable while editing; Save rejects them. */
function listContent(node: TiptapJSON): ListContent {
  if (!LIST_BLOCKS.has(node.type ?? "")) throw new Error(`unsupported Tiptap node ${describeType(node)} as a list`);
  const items = (node.content ?? []).map((item) => {
    if (item.type !== "listItem") throw new Error(`unsupported Tiptap node ${describeType(item)} in list`);
    const [paragraph, nested, ...rest] = item.content ?? [];
    if (paragraph?.type !== "paragraph" || rest.length > 0 || (nested !== undefined && !LIST_BLOCKS.has(nested.type ?? ""))) {
      throw new Error("a list item holds one paragraph, optionally followed by one nested list");
    }
    const content = paragraphInline(paragraph);
    return nested ? { content, list: listContent(nested) } : { content };
  });
  if (items.length === 0) throw new Error("a list needs at least one item");
  if (node.type === "bulletList") return { ordered: false, items };
  const start = Number(node.attrs?.start ?? 1);
  if (!Number.isInteger(start) || start < 0) throw new Error("numbered list start must be a non-negative integer");
  return { ordered: true, start, items };
}

/** Code block v1 content of an editor code block: unmarked text and a language. */
function codeContent(node: TiptapJSON): CodeBlockContent {
  let code = "";
  for (const child of node.content ?? []) {
    if (child.type !== "text" || typeof child.text !== "string" || (child.marks?.length ?? 0) > 0) {
      throw new Error("code blocks hold plain text only");
    }
    code += child.text;
  }
  const language = node.attrs?.language ?? "";
  if (typeof language !== "string") throw new Error("code block language must be a string");
  return { language, code };
}

const EMPTY_FOOTNOTE = "footnote definition cannot be empty.";

function footnoteLabel(node: TiptapJSON): string {
  const label = node.attrs?.label;
  if (typeof label !== "string" || label.length === 0) throw new Error("a footnote definition needs a label");
  return label;
}

const EMPTY_LIST_ITEM = "empty list item cannot be saved.";

function hasEmptyListItem(list: ListContent): boolean {
  return list.items.some(item => inlineText(item.content).trim().length === 0 || (item.list !== undefined && hasEmptyListItem(item.list)));
}

function sameList(left: ListContent, right: ListContent): boolean {
  return left.ordered === right.ordered && (left.start ?? 1) === (right.start ?? 1) && left.items.length === right.items.length &&
    left.items.every((item, index) => {
      const other = right.items[index];
      return sameInline(item.content, other.content) &&
        (item.list === undefined ? other.list === undefined : other.list !== undefined && sameList(item.list, other.list));
    });
}

function insertEdit(node: TiptapJSON): InsertEdit {
  if (node.type === "paragraph") {
    return { block: "paragraph", content: paragraphInline(node) };
  }
  if (node.type === "heading") {
    return { block: "heading", level: headingLevel(node), content: headingInline(node) };
  }
  if (node.type === "admonition") {
    const variant = String(node.attrs?.variant ?? "");
    if (!isAdmonitionVariant(variant)) {
      throw new Error("a new admonition must be editable and of a standard MyST kind");
    }
    return { block: "admonition", variant, content: paragraphInline(node) };
  }
  if (node.type === "quote") {
    return { block: "quote", content: paragraphInline(node) };
  }
  if (node.type === "footnoteDefinition") {
    return { block: "footnote", label: footnoteLabel(node), content: paragraphInline(node) };
  }
  if (node.type === "divider") {
    if ((node.content ?? []).length > 0) throw new Error("a divider has no content");
    return { block: "divider" };
  }
  if (node.type === "equation") {
    const label = blockLabel(node);
    return { block: "equation", latex: equationLatex(node), ...(label ? { label } : {}) };
  }
  if (node.type === "figure") {
    const label = blockLabel(node);
    return { block: "figure", ...figureContent(node), ...(label ? { label } : {}) };
  }
  if (node.type === "table") {
    const grid = tableCells(node);
    if (grid.some((row, index) => row.some(cell => cell.header !== (index === 0)))) {
      throw new Error("a new table holds editable cells, with header cells only in its first row");
    }
    const align = grid[0].map(cell => cell.align || null) as ("left" | "center" | "right" | null)[];
    if (grid.some(row => row.some((cell, column) => (cell.align || null) !== align[column]))) {
      throw new SaveContentError("table alignment must be uniform within each column", undefined, { phase: "collect", action: "Set alignment for the whole column using the table controls." });
    }
    const caption = tableCaption(node);
    const label = blockLabel(node);
    return { block: "table", rows: grid.map(row => row.map(cell => cell.content)), ...(align.some(Boolean) ? { align } : {}),
      ...(caption.length ? { caption } : {}), ...(label ? { label } : {}) };
  }
  if (LIST_BLOCKS.has(node.type ?? "")) {
    return { block: "list", list: listContent(node) };
  }
  if (node.type === "codeBlock") {
    return { block: "code", ...codeContent(node) };
  }
  if (node.type === "labelTarget") {
    return { block: "target", label: targetLabel(node) };
  }
  throw new Error("only paragraphs, headings, admonitions, quotes, footnote definitions, dividers, equations, figures, tables, lists, code blocks and section labels can be inserted");
}

export function figureContent(node: TiptapJSON): FigureContent {
  const { imageUrl, imageAlt } = node.attrs ?? {};
  if (typeof imageUrl !== "string" || typeof imageAlt !== "string") {
    throw new Error("figure image URL and alt text must be strings");
  }
  return { imageUrl, imageAlt, caption: captionValue(paragraphInline(node)) };
}

// Retain the text convenience representation for existing plain-caption clients.
function captionValue(content: InlineContent[]): FigureContent["caption"] {
  return content.every(item => item.kind === "text") ? inlineText(content) : content;
}

function assertFigureContent(figure: FigureContent): void {
  const error = figureContentError(figure);
  if (error) throw new SaveContentError(error, undefined, { phase: "collect",
    action: "Review the Figure image, alt text and caption in its Edit form." });
}

function headingLevel(node: TiptapJSON): number {
  const level = Number(node.attrs?.level ?? 1);
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    throw new Error("heading level must be an integer from 1 to 6");
  }
  return level;
}

function assertBlockChange(before: TiptapJSON | undefined, after: TiptapJSON | undefined): void {
  if (!before || !after) {
    throw new Error("missing Tiptap block");
  }
  const beforeType = before.type ?? "";
  const afterType = after.type ?? "";
  if (!KNOWN_BLOCKS.has(afterType)) {
    throw new Error(`unsupported Tiptap block "${afterType || "unknown"}"`);
  }
  // A list can switch between bullets and numbers at the same locator.
  if (beforeType !== afterType && !(LIST_BLOCKS.has(beforeType) && LIST_BLOCKS.has(afterType))) {
    throw new Error(`top-level block type changed from "${beforeType}" to "${afterType}"`);
  }
  if (LIST_BLOCKS.has(beforeType)) {
    listContent(after);
    return;
  }
  if (beforeType === "codeBlock") {
    codeContent(after);
    return;
  }
  if (beforeType === "equation") {
    const beforeAttrs = before.attrs ?? {};
    const afterAttrs = after.attrs ?? {};
    // The label is an authored reference target name, not the block's identity.
    if (normalizeAttr(beforeAttrs.sourcePath) !== normalizeAttr(afterAttrs.sourcePath)) {
      throw new Error("equation identity cannot change (sourcePath)");
    }
    blockLabel(after);
    if (typeof afterAttrs.latex !== "string") {
      throw new Error("equation LaTeX must be a string");
    }
    if ((after.content ?? []).length > 0) {
      throw new Error("equation content cannot change");
    }
    return;
  }
  if (beforeType === "figure") {
    const beforeAttrs = before.attrs ?? {};
    const afterAttrs = after.attrs ?? {};
    // Unsupported Figure structures stay read-only, label included.
    for (const key of ["sourcePath"]) {
      if (normalizeAttr(beforeAttrs[key]) !== normalizeAttr(afterAttrs[key])) {
        throw new Error(`figure identity cannot change (${key})`);
      }
    }
    blockLabel(after);
    figureContent(after);
    return;
  }
  if (beforeType === "table") {
    blockLabel(after);
    tableCaption(after);
    if (normalizeAttr(before.attrs?.sourcePath) !== normalizeAttr(after.attrs?.sourcePath)) {
      throw new Error("table identity cannot change");
    }
    tableShape(tableCells(before), tableCells(after));
    return;
  }
  if (beforeType === "admonition") {
    const beforeAttrs = before.attrs ?? {};
    const afterAttrs = after.attrs ?? {};
    for (const key of ["sourcePath"]) {
      if (normalizeAttr(beforeAttrs[key]) !== normalizeAttr(afterAttrs[key])) {
        throw new Error(`admonition identity cannot change (${key})`);
      }
    }
    // An editable admonition may change to another standard kind.
    if (!isAdmonitionVariant(String(afterAttrs.variant ?? ""))) throw new Error("admonition kind is not a standard MyST kind");
    const content = paragraphInline(after);
    if (inlineText(content).trim().length === 0) throw new SaveContentError("admonition body cannot be empty", undefined, { phase: "collect", action: "Enter text in the admonition or delete this block." });
    return;
  }
  if (beforeType === "quote") {
    paragraphInline(after);
    return;
  }
  if (beforeType === "footnoteDefinition") {
    // The label is the footnote's identity; its references name it.
    if (footnoteLabel(after) !== footnoteLabel(before)) throw new Error("a footnote label cannot change");
    paragraphInline(after);
    return;
  }
  if (beforeType === "divider") {
    if (normalizeAttr(before.attrs?.sourcePath) !== normalizeAttr(after.attrs?.sourcePath) || (after.content ?? []).length > 0) {
      throw new Error("a divider cannot change");
    }
    return;
  }
  if (beforeType === "labelTarget") {
    targetLabel(after);
    return;
  }
  if (beforeType === "heading") {
    headingLevel(after);
    headingInline(after);
    return;
  }
  if (beforeType === "paragraph") {
    paragraphInline(after);
    return;
  }
  throw new Error(`unsupported Tiptap block "${beforeType || "unknown"}"`);
}

/** `source` is a cell's `row,column` in the opening snapshot, empty when it was added since.
 * `text` is a read-only cell's display text; `content` is an editable cell's content. */
type TableCellShape = { header: boolean; content: InlineContent[]; align: string; source: string };

/** The cell grid of a table node; editable cells hold inline content without line breaks. */
function tableCells(node: TiptapJSON): TableCellShape[][] {
  return (node.content ?? []).filter(row => row.type !== "tableCaption").map((row, rowIndex) => {
    if (row.type !== "tableRow") throw new Error(`unsupported Tiptap node ${describeType(row)} in table`);
    return (row.content ?? []).map((cell, column) => {
      try {
        const header = cell.attrs?.header === true;
        const align = String(cell.attrs?.align ?? "");
        const source = String(cell.attrs?.[TABLE_CELL_SOURCE_ATTR] ?? "");
        if (cell.type !== "tableCell") throw new Error(`unsupported Tiptap node ${describeType(cell)} in table row`);
        const content = paragraphInline(cell);
        if (hasBreak(content)) throw new SaveContentError("a table cell cannot contain line breaks", undefined, {
          phase: "collect", action: "Remove the line breaks from this table cell.", cell: { row: rowIndex, column } });
        return { header, align, content, source };
      } catch (error) {
        throw new SaveContentError(error instanceof Error ? error.message : String(error), undefined, {
          cause: error, phase: "collect", cell: { row: rowIndex, column },
          ...(error instanceof SaveContentError ? { action: error.action } : {}),
        });
      }
    });
  });
}

type TableShape = Pick<TableShapeEdit, "rows" | "columns" | "align">;

/**
 * How an edited table grid maps to its snapshot grid: each row and column is a snapshot index or
 * null when added. Whole rows and columns can be added, removed or moved; the header row stays
 * first. Snapshot cells keep their kind and read-only text. Alignment belongs to a column; `align`
 * is set when it differs from the snapshot.
 */
function tableShape(was: TableCellShape[][], is: TableCellShape[][]): TableShape {
  const width = is[0]?.length ?? 0;
  if (width === 0 || is.some(row => row.length !== width)) throw new SaveContentError("table rows must have the same number of cells", undefined, { phase: "collect", action: "Use the table row/column controls to give every row the same number of cells." });
  const snapshot = (cells: TableCellShape[], part: number) => {
    const found = new Set(cells.flatMap(cell => cell.source ? [Number(cell.source.split(",")[part])] : []));
    if (found.size > 1) throw new Error("table cells can only move as whole rows or columns");
    return found.size ? [...found][0] : null;
  };
  const rows = is.map(row => snapshot(row, 0));
  const columns = is[0].map((_, column) => snapshot(is.map(row => row[column]), 1));
  const distinct = (axis: (number | null)[], count: number) => {
    const kept = axis.filter(index => index !== null);
    return new Set(kept).size === kept.length && kept.every(index => index < count);
  };
  if (rows[0] !== 0 || !distinct(rows, was.length) || !distinct(columns, was[0].length)) {
    throw new Error("the header row stays first; rows and columns are added, moved or removed whole");
  }
  const align = is[0].map(cell => cell.align);
  is.forEach((cells, rowIndex) => cells.forEach((cell, index) => {
    const from = rows[rowIndex];
    const to = columns[index];
    if (cell.align !== align[index]) throw new SaveContentError("table alignment must be uniform within each column", undefined, { phase: "collect", action: "Set alignment for the whole column using the table controls." });
    if (from !== null && to !== null) {
      const old = was[from][to];
      if (cell.source !== `${from},${to}` || cell.header !== old.header) {
        throw new Error("table cell locators and header kinds cannot change");
      }
    } else if (cell.source || cell.header !== (rowIndex === 0)) {
      throw new Error("added table cells are editable, with header cells only in the header row");
    }
  }));
  const aligned = align.some((value, index) => value !== (columns[index] === null ? "" : was[0][columns[index]!].align));
  return { rows, columns, ...(aligned ? { align: align.map(value => (value || null) as "left" | "center" | "right" | null) } : {}) };
}

/** Heading content is paragraph inline content without line breaks. */
function headingInline(node: TiptapJSON): InlineContent[] {
  const content = paragraphInline(node);
  if (hasBreak(content)) throw new SaveContentError("a heading cannot contain line breaks", undefined, { phase: "collect", action: "Remove line breaks from the heading or convert it to a paragraph." });
  return content;
}

function hasBreak(items: InlineContent[]): boolean {
  return items.some(item => item.kind === "break" || ("children" in item && hasBreak(item.children)));
}

function paragraphInline(node: TiptapJSON): InlineContent[] {
  return fromTiptapContent({
    type: "doc",
    content: [{ type: "paragraph", content: node.content }],
  });
}

function equationLatex(node: TiptapJSON): string {
  if (typeof node.attrs?.latex !== "string") throw new Error("equation LaTeX must be a string");
  return node.attrs.latex;
}

export function tableCaption(node: TiptapJSON): InlineContent[] {
  const children = node.content ?? [];
  const captions = children.filter(child => child.type === "tableCaption");
  if (captions.length > 1 || captions.length && children.at(-1) !== captions[0]) throw new Error("a table caption must follow its rows");
  const caption = captions.length ? paragraphInline(captions[0]) : [];
  if (hasBreak(caption)) throw new Error("a table caption cannot contain line breaks");
  return caption;
}

/** A section label target always has a label; removing it removes the block. */
function targetLabel(node: TiptapJSON): string {
  const label = blockLabel(node);
  if (label.length === 0) throw new SaveContentError("a section label cannot be empty; delete it instead", undefined, { phase: "collect", action: "Enter a section label or delete the label target." });
  return label;
}

function blockLabel(node: TiptapJSON): string {
  const label = node.attrs?.label ?? "";
  if (typeof label !== "string") throw new Error("label must be a string");
  return label;
}

function snapshotPaths(key: string): string[] {
  return key.split(";").filter(path => !isNewBlockPath(path));
}

function normalizeAttr(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function describeType(value: TiptapJSON | undefined): string {
  if (value && typeof value.type === "string" && value.type.length > 0) {
    return `"${value.type}"`;
  }
  return "unknown node";
}

/** Keep submitted block/cell coordinates even when preflight fails before Host replay. */
function atEditorBlock<T>(document: TiptapJSON, node: TiptapJSON, apply: () => T): T {
  try { return apply(); }
  catch (error) {
    const detail = error instanceof SaveContentError ? error : undefined;
    throw new SaveContentError(detail?.reason ?? (error instanceof Error ? error.message : String(error)), undefined, {
      cause: error, phase: "collect", block: { index: (document.content ?? []).indexOf(node), type: node.type ?? "unknown" },
      ...(detail ? { action: detail.action, cell: detail.cell } : {}),
    });
  }
}
