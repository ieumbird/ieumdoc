import { isAdmonitionVariant, type AdmonitionVariant, type EditableBlock, type EditableDocument, type FigureContent, type InlineContent, type ListContent, type CodeBlockContent, type NodePath } from "@ieumdoc/core";
import { figureContentError } from "@ieumdoc/core/figure";
import { fromTiptapContent, toTiptapContent, type TiptapJSON } from "./tiptap-inline.ts";

export type { TiptapJSON };

export type HeadingEdit = {
  path: NodePath;
  from: string;
  to: string;
};

export type HeadingLevelEdit = {
  path: NodePath;
  from: number;
  to: number;
};

export type ParagraphEdit = {
  path: NodePath;
  content: InlineContent[];
};

export type EquationEdit = {
  path: NodePath;
  from: string;
  to: string;
};

export type TableCellEdit = {
  path: NodePath;
  from: string;
  to: string;
};

/**
 * Rows and columns added to a snapshot table. Each entry of `rows`/`columns` is the snapshot
 * index of that row/column in the new grid, or null when it was added.
 */
export type TableShapeEdit = {
  path: NodePath;
  rows: (number | null)[];
  columns: (number | null)[];
  /** Text typed into added cells, by position in the new grid. */
  cells: { row: number; column: number; text: string }[];
};

export type AdmonitionEdit = {
  path: NodePath;
  content: InlineContent[];
};

export type FigureEdit = {
  path: NodePath;
  from: FigureContent;
  to: FigureContent;
};

/** The new language and code of an editable code block. */
export type CodeEdit = {
  path: NodePath;
  code: CodeBlockContent;
};

/** The whole new content of an editable list. */
export type ListEdit = {
  path: NodePath;
  list: ListContent;
};

/** An Equation or Figure label; an empty `to` removes it. */
export type LabelEdit = {
  path: NodePath;
  from: string;
  to: string;
};

export type InsertEdit =
  | { block: "paragraph"; content: InlineContent[] }
  | { block: "heading"; level: number; text: string }
  | { block: "admonition"; variant: AdmonitionVariant; content: InlineContent[] }
  | { block: "equation"; latex: string; label?: string }
  | ({ block: "figure"; label?: string } & FigureContent)
  | { block: "table"; rows: string[][]; align?: ("left" | "center" | "right" | null)[] }
  | { block: "list"; list: ListContent }
  | ({ block: "code" } & CodeBlockContent);

/** A new top-level block's position in the next order, or an original snapshot block part. */
export type OrderItem = { path: NodePath; part: number } | { insert: number };

export type SupportedEdits = {
  order?: OrderItem[];
  headings: HeadingEdit[];
  headingLevels?: HeadingLevelEdit[];
  paragraphs: ParagraphEdit[];
  equations?: EquationEdit[];
  figures?: FigureEdit[];
  cells?: TableCellEdit[];
  tables?: TableShapeEdit[];
  admonitions?: AdmonitionEdit[];
  lists?: ListEdit[];
  codes?: CodeEdit[];
  labels?: LabelEdit[];
  splits?: { path: NodePath; parts: InlineContent[][] }[];
  merges?: { paths: NodePath[]; parts: InlineContent[][] }[];
  inserts?: InsertEdit[];
  deletes?: NodePath[];
};

// Unsaved top-level paragraphs have no snapshot locator yet. This session-only
// marker stays in the session across saves; a newly opened document gets fresh snapshot paths. It is never persisted.
export const NEW_BLOCK_PREFIX = "new:";
const EMPTY_DOCUMENT_BLOCK_PATH = `${NEW_BLOCK_PREFIX}empty`;

export function isNewBlockPath(path: string): boolean {
  return path.startsWith(NEW_BLOCK_PREFIX);
}

/** Editor document attribute listing snapshot paths removed by an explicit Delete command. */
export const DELETED_PATHS_ATTR = "deletedPaths";

export function deletedPathsOf(document: TiptapJSON): string[] {
  const value = document.attrs?.[DELETED_PATHS_ATTR];
  return Array.isArray(value) ? value.map(String) : [];
}

const KNOWN_BLOCKS = new Set([
  "heading",
  "paragraph",
  "readonlyHeading",
  "readonlyParagraph",
  "admonition",
  "figure",
  "equation",
  "table",
  "bulletList",
  "orderedList",
  "codeBlock",
  "unsupportedBlock",
]);

const LIST_BLOCKS = new Set(["bulletList", "orderedList"]);
/** Text blocks that convert into each other as a new block with a fresh locator. */
const TEXT_BLOCKS = new Set(["paragraph", "heading", "codeBlock"]);

const READONLY_BLOCKS = new Set([
  "readonlyHeading",
  "readonlyParagraph",
  "unsupportedBlock",
]);

export function pathKey(path: NodePath): string {
  return path.join(",");
}

export function toTiptapDocument(document: EditableDocument): TiptapJSON {
  return {
    type: "doc",
    content: document.blocks.length > 0
      ? document.blocks.map(block => {
        const node = toTiptapBlock(block);
        if (block.original) node.attrs = { ...node.attrs, original: block.original };
        return node;
      })
      : [{ type: "paragraph", attrs: { sourcePath: EMPTY_DOCUMENT_BLOCK_PATH } }],
  };
}

export function collectSupportedEdits(document: EditableDocument, next: TiptapJSON): SupportedEdits {
  assertSupportedDocumentChange(toTiptapDocument(document), next);
  const headings: HeadingEdit[] = [];
  const headingLevels: HeadingLevelEdit[] = [];
  const paragraphs: ParagraphEdit[] = [];
  const equations: EquationEdit[] = [];
  const figures: FigureEdit[] = [];
  const cells: TableCellEdit[] = [];
  const tables: TableShapeEdit[] = [];
  const admonitions: AdmonitionEdit[] = [];
  const lists: ListEdit[] = [];
  const codes: CodeEdit[] = [];
  const labels: LabelEdit[] = [];
  const splits: NonNullable<SupportedEdits["splits"]> = [];
  const merges: NonNullable<SupportedEdits["merges"]> = [];
  const inserts: InsertEdit[] = [];
  const insertOf = new Map<TiptapJSON, number>();
  const used = new Set<string>();
  const nodes = (next.content ?? []).filter(node => !isSessionPlaceholder(node));
  const saveError = (node: TiptapJSON, message: string) => new Error(`Block ${(next.content ?? []).indexOf(node) + 1} (${node.type}): ${message}`);
  const keys = [...new Set(nodes.map(sourcePathOf))];
  for (const key of keys) {
    const group = nodes.filter(node => sourcePathOf(node) === key);
    const paths = snapshotPaths(key);
    paths.forEach(path => used.add(path));
    if (paths.length === 0) {
      for (const node of group) {
        const insert = insertEdit(node);
        if (insert.block === "paragraph" && inlineText(insert.content).length === 0) {
          throw saveError(node, "empty paragraph cannot be saved");
        }
        if (insert.block === "heading" && insert.text.length === 0) {
          throw saveError(node, "empty heading cannot be saved. Enter text or delete this block.");
        }
        if (insert.block === "admonition" && inlineText(insert.content).trim().length === 0) {
          throw saveError(node, "admonition body cannot be empty");
        }
        if (insert.block === "equation" && insert.latex.length === 0) {
          throw saveError(node, "empty equation LaTeX cannot be saved");
        }
        if (insert.block === "figure") assertFigureContent(insert);
        if (insert.block === "table" && insert.rows.flat().every(text => text.length === 0)) {
          throw saveError(node, "empty table cannot be saved");
        }
        if (insert.block === "list" && hasEmptyListItem(insert.list)) {
          throw saveError(node, EMPTY_LIST_ITEM);
        }
        insertOf.set(node, inserts.length);
        inserts.push(insert);
      }
      continue;
    }
    const node = group[0];
    const block = document.blocks.find(block => pathKey(block.path) === paths[0])!;
    if (paths.length > 1) {
      merges.push({ paths: paths.map(path => path.split(",").map(Number)), parts: group.map(paragraphInline) });
    } else if (block.block === "heading" && block.editable) {
      const level = headingLevel(node);
      if (level !== block.level) headingLevels.push({ path: block.path, from: block.level, to: level });
      const text = headingText(node);
      if (text !== block.text) {
        if (text.length === 0) throw saveError(node, "empty heading text cannot be saved");
        headings.push({ path: block.path, from: block.text, to: text });
      }
    } else if (block.block === "paragraph" && editableParagraph(block)) {
      if (group.length > 1) {
        splits.push({ path: block.path, parts: group.map(paragraphInline) });
        continue;
      }
      const content = paragraphInline(node);
      if (sameInline(content, block.content)) continue;
      if (inlineText(content).length === 0) throw saveError(node, "empty paragraph cannot be saved. Enter text or delete this block.");
      paragraphs.push({ path: block.path, content });
    } else if (block.block === "equation") {
      const latex = equationLatex(node);
      if (latex !== block.latex) equations.push({ path: block.path, from: block.latex, to: latex });
      const label = blockLabel(node);
      if (label !== block.label) labels.push({ path: block.path, from: block.label, to: label });
    } else if (block.block === "figure" && block.editable) {
      const label = blockLabel(node);
      if (label !== block.label) labels.push({ path: block.path, from: block.label, to: label });
      const from = { imageUrl: block.imageUrl, imageAlt: block.imageAlt, caption: block.caption.text };
      const to = figureContent(node);
      if (JSON.stringify(to) === JSON.stringify(from)) continue;
      assertFigureContent(to);
      figures.push({ path: block.path, from, to });
    } else if (block.block === "admonition" && block.editable) {
      const content = paragraphInline(node);
      if (sameInline(content, block.content)) continue;
      if (inlineText(content).trim().length === 0) throw saveError(node, "admonition body cannot be empty");
      admonitions.push({ path: block.path, content });
    } else if (block.block === "code") {
      const code = codeContent(node);
      if (code.language !== block.language || code.code !== block.code) codes.push({ path: block.path, code });
    } else if (block.block === "list") {
      const list = listContent(node);
      if (sameList(list, block)) continue;
      if (hasEmptyListItem(list)) throw saveError(node, EMPTY_LIST_ITEM);
      lists.push({ path: block.path, list });
    } else if (block.block === "table") {
      const next = tableCells(node);
      const shape = tableShape(tableCells(toTiptapBlock(block)), next);
      block.rows.forEach((row, rowIndex) => row.cells.forEach((cell, index) => {
        const text = next[shape.rows.indexOf(rowIndex)]?.[shape.columns.indexOf(index)]?.text;
        if (cell.editable && text !== undefined && text !== cell.text) cells.push({ path: cell.path, from: cell.text, to: text });
      }));
      if (shape.rows.includes(null) || shape.columns.includes(null)) {
        tables.push({ path: block.path, ...shape, cells: next.flatMap((row, rowIndex) => row.flatMap((cell, column) =>
          (shape.rows[rowIndex] === null || shape.columns[column] === null) && cell.text ? [{ row: rowIndex, column, text: cell.text }] : [])) });
      }
    }
  }
  const deletes = document.blocks.filter(block => !used.has(pathKey(block.path))).map(block => block.path);
  const counts = new Map<string, number>();
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
  return {
    ...(reordered ? { order } : {}),
    headings,
    ...(headingLevels.length ? { headingLevels } : {}),
    paragraphs,
    ...(equations.length ? { equations } : {}),
    ...(figures.length ? { figures } : {}),
    ...(cells.length ? { cells } : {}),
    ...(tables.length ? { tables } : {}),
    ...(admonitions.length ? { admonitions } : {}),
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
  if (node.type === "figure") return node.attrs?.imageUrl === "";
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
  return { type: "doc", content: (document.content ?? []).filter(node => !isSessionPlaceholder(node)) };
}

export function isSupportedDocumentChange(baseline: TiptapJSON, next: TiptapJSON): boolean {
  try {
    assertSupportedDocumentChange(baseline, next);
    return true;
  } catch {
    return false;
  }
}

let nextEngineLocator = 0;
export function freshBlockPath(): string { return `${NEW_BLOCK_PREFIX}engine:${++nextEngineLocator}`; }

/** Adapt engine-created blocks to opening-snapshot locators, without changing content.
 * Kept separate from validation: unknown/read-only semantics still fail closed. */
export function normalizeEngineDocument(baseline: TiptapJSON, next: TiptapJSON, emptySpace = false): TiptapJSON {
  const seen = new Set<string>();
  const content = (next.content ?? []).map(node => {
    const key = sourcePathOf(node);
    const original = baseline.content?.find(block => sourcePathOf(block) === key);
    const conversion = TEXT_BLOCKS.has(node.type ?? "") && TEXT_BLOCKS.has(original?.type ?? "") && node.type !== original?.type;
    const emptyParagraph = node.type === "paragraph" && !(node.content?.length);
    const duplicate = seen.has(key) && node.type !== "paragraph";
    seen.add(key);
    if (!key || conversion || duplicate || (emptySpace && emptyParagraph && !isNewBlockPath(key))) {
      // Validate representability before granting a fresh identity.
      insertEdit(node);
      return { ...node, attrs: { ...node.attrs, sourcePath: freshBlockPath(), original: undefined } };
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
export function assertSupportedDocumentChange(baseline: TiptapJSON, next: TiptapJSON): void {
  if (baseline.type !== "doc" || next.type !== "doc") {
    throw new Error('Tiptap document must have type "doc"');
  }
  const before = baseline.content ?? [];
  const after = next.content ?? [];
  if (!Array.isArray(after)) {
    throw new Error("Tiptap document content must be an array");
  }
  const used = new Set<string>();
  for (const key of new Set(after.map(sourcePathOf))) {
    const all = key.split(";");
    for (const path of all) {
      if (used.has(path) || (!isNewBlockPath(path) && !before.some(node => sourcePathOf(node) === path))) {
        throw new Error("block insertion or identity changed");
      }
      used.add(path);
    }
    const group = after.filter(node => sourcePathOf(node) === key);
    const paths = snapshotPaths(key);
    if (paths.length === 0) {
      for (const node of group) {
        insertEdit(node);
      }
      continue;
    }
    const originals = paths.map(path => before.find(node => sourcePathOf(node) === path));
    if (all.length > 1 && originals.some(block => block!.type !== "paragraph")) {
      throw new Error("only editable paragraphs can merge");
    }
    if (group.length > 1 && originals[0]!.type !== "paragraph") throw new Error("block insertion is not allowed");
    for (const node of group) assertBlockChange(originals[0], node);
  }
  const deleted = new Set(deletedPathsOf(next));
  if (before.some(node => !used.has(sourcePathOf(node)) && !deleted.has(sourcePathOf(node)))) {
    throw new Error("block deletion is not allowed");
  }
}

function toTiptapBlock(block: EditableBlock): TiptapJSON {
  if (block.block === "heading") {
    if (!block.editable) {
      return readonlyNode("readonlyHeading", block.path, {
        level: block.level,
        text: block.text,
      });
    }
    const content = block.text.length > 0 ? [{ type: "text", text: block.text }] : [];
    return {
      type: "heading",
      attrs: { level: block.level, sourcePath: pathKey(block.path) },
      content,
    };
  }
  if (block.block === "paragraph") {
    if (!editableParagraph(block)) {
      return readonlyNode("readonlyParagraph", block.path, { text: block.text });
    }
    return {
      type: "paragraph",
      attrs: { sourcePath: pathKey(block.path) },
      content: paragraphContent(block.content),
    };
  }
  if (block.block === "admonition") {
    if (block.editable) {
      return {
        type: "admonition",
        attrs: { sourcePath: pathKey(block.path), variant: block.variant, text: block.text, editable: true },
        content: paragraphContent(block.content),
      };
    }
    return readonlyNode("admonition", block.path, {
      variant: block.variant,
      text: block.text,
      editable: false,
    });
  }
  if (block.block === "figure") {
    return {
      type: "figure",
      attrs: {
        sourcePath: pathKey(block.path),
        label: block.label,
        imageUrl: block.imageUrl,
        imageAlt: block.imageAlt,
        caption: block.caption.text,
        editable: block.editable,
      },
    };
  }
  if (block.block === "equation") {
    return readonlyNode("equation", block.path, {
      latex: block.latex,
      label: block.label,
    });
  }
  if (block.block === "code") {
    return {
      type: "codeBlock",
      attrs: { sourcePath: pathKey(block.path), language: block.language },
      content: block.code ? [{ type: "text", text: block.code }] : [],
    };
  }
  if (block.block === "list") {
    const node = listNode(block);
    return { ...node, attrs: { ...node.attrs, sourcePath: pathKey(block.path) } };
  }
  if (block.block === "table") {
    return {
      type: "table",
      attrs: { sourcePath: pathKey(block.path) },
      content: block.rows.map((row) => ({
        type: "tableRow",
        content: row.cells.map((cell): TiptapJSON => cell.editable
          ? { type: "tableCell", attrs: { header: cell.header, ...(cell.align ? { align: cell.align } : {}) }, content: cell.text ? [{ type: "text", text: cell.text }] : [] }
          : { type: "readonlyTableCell", attrs: { header: cell.header, ...(cell.align ? { align: cell.align } : {}), text: cell.text } }),
      })),
    };
  }
  return readonlyNode("unsupportedBlock", block.path, { text: block.text });
}

function listNode(list: ListContent): TiptapJSON {
  return {
    type: list.ordered ? "orderedList" : "bulletList",
    ...(list.ordered ? { attrs: { start: list.start } } : {}),
    content: list.items.map(item => ({
      type: "listItem",
      content: [
        { type: "paragraph", content: paragraphContent(item.content) },
        ...(item.list ? [listNode(item.list)] : []),
      ],
    })),
  };
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

const EMPTY_LIST_ITEM = "empty list item cannot be saved. Enter text or remove the item.";

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

function readonlyNode(
  type: string,
  path: NodePath,
  attrs: Record<string, string | number | boolean>,
): TiptapJSON {
  return {
    type,
    attrs: { sourcePath: pathKey(path), ...attrs },
  };
}

function paragraphContent(content: InlineContent[]): TiptapJSON[] {
  const projected = toTiptapContent(content);
  return projected.content?.[0]?.content ?? [];
}

function insertEdit(node: TiptapJSON): InsertEdit {
  if (node.type === "paragraph") {
    return { block: "paragraph", content: paragraphInline(node) };
  }
  if (node.type === "heading") {
    return { block: "heading", level: headingLevel(node), text: headingText(node) };
  }
  if (node.type === "admonition") {
    const variant = String(node.attrs?.variant ?? "");
    if (node.attrs?.editable !== true || !isAdmonitionVariant(variant)) {
      throw new Error("a new admonition must be an editable Note or Warning");
    }
    return { block: "admonition", variant, content: paragraphInline(node) };
  }
  if (node.type === "equation") {
    const label = blockLabel(node);
    return { block: "equation", latex: equationLatex(node), ...(label ? { label } : {}) };
  }
  if (node.type === "figure") {
    if (node.attrs?.editable !== true) {
      throw new Error("a new figure must be editable");
    }
    const label = blockLabel(node);
    return { block: "figure", ...figureContent(node), ...(label ? { label } : {}) };
  }
  if (node.type === "table") {
    const grid = tableCells(node);
    if (grid.some((row, index) => row.some(cell => !cell.editable || cell.header !== (index === 0)))) {
      throw new Error("a new table holds editable cells, with header cells only in its first row");
    }
    const align = grid[0].map(cell => cell.align || null) as ("left" | "center" | "right" | null)[];
    if (grid.some(row => row.some((cell, column) => (cell.align || null) !== align[column]))) {
      throw new Error("table alignment must be uniform within each column");
    }
    return { block: "table", rows: grid.map(row => row.map(cell => cell.text)), ...(align.some(Boolean) ? { align } : {}) };
  }
  if (LIST_BLOCKS.has(node.type ?? "")) {
    return { block: "list", list: listContent(node) };
  }
  if (node.type === "codeBlock") {
    return { block: "code", ...codeContent(node) };
  }
  throw new Error("only paragraphs, headings, equations, figures, tables, lists, and code blocks can be inserted");
}

function figureContent(node: TiptapJSON): FigureContent {
  const { imageUrl, imageAlt, caption } = node.attrs ?? {};
  if (typeof imageUrl !== "string" || typeof imageAlt !== "string" || typeof caption !== "string") {
    throw new Error("figure image URL, alt text, and caption must be strings");
  }
  return { imageUrl, imageAlt, caption };
}

function assertFigureContent(figure: FigureContent): void {
  const error = figureContentError(figure);
  if (error) throw new Error(error);
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
    for (const key of ["sourcePath", "editable"]) {
      if (normalizeAttr(beforeAttrs[key]) !== normalizeAttr(afterAttrs[key])) {
        throw new Error(`figure identity cannot change (${key})`);
      }
    }
    if (beforeAttrs.editable !== true) {
      assertReadonlyUnchanged(before, after);
      return;
    }
    blockLabel(after);
    figureContent(after);
    if ((after.content ?? []).length > 0) {
      throw new Error("figure content cannot change");
    }
    return;
  }
  if (beforeType === "table") {
    if (normalizeAttr(before.attrs?.sourcePath) !== normalizeAttr(after.attrs?.sourcePath)) {
      throw new Error("table identity cannot change");
    }
    tableShape(tableCells(before), tableCells(after));
    return;
  }
  if (beforeType === "admonition") {
    const beforeAttrs = before.attrs ?? {};
    const afterAttrs = after.attrs ?? {};
    for (const key of ["sourcePath", "variant", "text", "editable"]) {
      if (normalizeAttr(beforeAttrs[key]) !== normalizeAttr(afterAttrs[key])) {
        throw new Error(`admonition identity cannot change (${key})`);
      }
    }
    if (beforeAttrs.editable !== true) {
      assertReadonlyUnchanged(before, after);
      return;
    }
    const content = paragraphInline(after);
    if (inlineText(content).trim().length === 0) throw new Error("admonition body cannot be empty");
    return;
  }
  if (READONLY_BLOCKS.has(beforeType)) {
    assertReadonlyUnchanged(before, after);
    return;
  }
  if (beforeType === "heading") {
    headingLevel(after);
    headingText(after);
    return;
  }
  if (beforeType === "paragraph") {
    paragraphInline(after);
    return;
  }
  throw new Error(`unsupported Tiptap block "${beforeType || "unknown"}"`);
}

function assertReadonlyUnchanged(before: TiptapJSON, after: TiptapJSON): void {
  const beforeAttrs = before.attrs ?? {};
  for (const [key, value] of Object.entries(beforeAttrs)) {
    if (normalizeAttr(value) !== normalizeAttr(after.attrs?.[key])) {
      throw new Error(`read-only block changed (${before.type ?? "block"} ${key})`);
    }
  }
  if ((after.content ?? []).length > 0) {
    throw new Error(`read-only block changed (${before.type ?? "block"} content)`);
  }
}

/** `added` marks a cell absent from the opening snapshot (see TABLE_CELL_ADDED_ATTR). */
type TableCellShape = { editable: boolean; header: boolean; text: string; align: string; added: boolean };

/** Session-only tableCell attribute: an id for a cell added since Open/New, else empty. */
export const TABLE_CELL_ADDED_ATTR = "added";

/** The cell grid of a table node; editable cells must hold unmarked text only. */
function tableCells(node: TiptapJSON): TableCellShape[][] {
  return (node.content ?? []).map((row) => {
    if (row.type !== "tableRow") throw new Error(`unsupported Tiptap node ${describeType(row)} in table`);
    return (row.content ?? []).map((cell) => {
      const header = cell.attrs?.header === true;
      const align = String(cell.attrs?.align ?? "");
      if (cell.type === "readonlyTableCell") return { editable: false, header, align, text: String(cell.attrs?.text ?? ""), added: false };
      if (cell.type !== "tableCell") throw new Error(`unsupported Tiptap node ${describeType(cell)} in table row`);
      let text = "";
      for (const child of cell.content ?? []) {
        if (child.type !== "text" || typeof child.text !== "string" || (child.marks?.length ?? 0) > 0) {
          throw new Error("table cells hold plain text only");
        }
        text += child.text;
      }
      return { editable: true, header, align, text, added: Boolean(cell.attrs?.[TABLE_CELL_ADDED_ATTR]) };
    });
  });
}

/**
 * How an edited table grid maps to its snapshot grid. Only whole rows (below the header row) and
 * whole columns can be added; snapshot cells keep their order, kind and read-only text.
 */
function tableShape(was: TableCellShape[][], is: TableCellShape[][]): { rows: (number | null)[]; columns: (number | null)[] } {
  const width = is[0]?.length ?? 0;
  if (is.some(row => row.length !== width)) throw new Error("table rows must have the same number of cells");
  const kept = (row: TableCellShape[]) => row.flatMap((cell, index) => cell.added ? [] : [index]);
  const keptRows = is.flatMap((row, index) => row.some(cell => !cell.added) ? [index] : []);
  if (keptRows.length !== was.length || keptRows[0] !== 0) {
    throw new Error("table rows can only be added below the header row, never removed");
  }
  const keptColumns = kept(is[0]);
  if (keptColumns.length !== was[0].length || keptRows.some(index => kept(is[index]).join() !== keptColumns.join())) {
    throw new Error("table cells can only be added as whole rows or columns, never removed");
  }
  let row = 0;
  let column = 0;
  const rows = is.map((_, index) => keptRows.includes(index) ? row++ : null);
  const columns = is[0].map((_, index) => keptColumns.includes(index) ? column++ : null);
  is.forEach((cells, rowIndex) => cells.forEach((cell, index) => {
    const from = rows[rowIndex];
    const to = columns[index];
    if (from !== null && to !== null) {
      const old = was[from][to];
      if (cell.editable !== old.editable || cell.header !== old.header || cell.align !== old.align || (!old.editable && cell.text !== old.text)) {
        throw new Error("read-only table cells and cell kinds cannot change");
      }
    } else if (!cell.editable || cell.header !== (rowIndex === 0)) {
      throw new Error("added table cells are editable, with header cells only in the header row");
    } else if (cell.align !== (to === null ? "" : was[0][to].align)) {
      throw new Error("added cells must preserve existing column alignment; new columns are unaligned");
    }
  }));
  return { rows, columns };
}

function headingText(node: TiptapJSON): string {
  if (node.content === undefined) return "";
  if (!Array.isArray(node.content)) {
    throw new Error("heading content must be an array");
  }
  let text = "";
  for (const [index, child] of node.content.entries()) {
    if (!child || child.type !== "text") {
      throw new Error(`unsupported Tiptap node ${describeType(child)} in heading`);
    }
    if (child.marks !== undefined && (!Array.isArray(child.marks) || child.marks.length > 0)) {
      throw new Error("heading text cannot contain marks");
    }
    if (typeof child.text !== "string") {
      throw new Error(`heading text node at ${index} must contain text`);
    }
    text += child.text;
  }
  return text;
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

function blockLabel(node: TiptapJSON): string {
  const label = node.attrs?.label ?? "";
  if (typeof label !== "string") throw new Error("label must be a string");
  return label;
}

function sourcePathOf(node: TiptapJSON | undefined): string {
  return String(node?.attrs?.sourcePath ?? "");
}

function snapshotPaths(key: string): string[] {
  return key.split(";").filter(path => !isNewBlockPath(path));
}

/** Same rendered text and mark coverage (a link's target is part of its mark). Nesting order
 * and text fragmentation differ between Core content and the editor's flat marks. */
function sameInline(left: InlineContent[], right: InlineContent[]): boolean {
  return JSON.stringify(inlineUnits(left)) === JSON.stringify(inlineUnits(right));
}

function inlineUnits(content: InlineContent[], marks: string[] = []): string[] {
  return content.flatMap((item) => {
    if (item.kind === "text") return item.text.split("").map((char) => `${char} ${marks.join(",")}`);
    if (item.kind === "break") return [`\n ${marks.join(",")}`];
    if (item.kind === "math") return [`math ${item.value} ${marks.join(",")}`];
    if (item.kind === "code") return item.value.split("").map((char) => `${char} ${[...marks, "code"].sort().join(",")}`);
    if (item.kind === "reference") return [`reference ${item.role} ${item.label} ${marks.join(",")}`];
    return inlineUnits(item.children, [...new Set([...marks, markKey(item)])].sort());
  });
}

function markKey(item: InlineContent): string {
  return item.kind === "link" ? `link ${JSON.stringify([item.url, item.title ?? null])}` : item.kind;
}

/**
 * Adjacent links with the same target (`[a](x)[b](x)`) become one link in the editor's
 * flat marks, so such a paragraph stays read-only rather than silently merging them.
 */
function editableParagraph(block: EditableBlock): boolean {
  if (block.block !== "paragraph" || !block.editable) return false;
  // The link (if any) that owns each text/break leaf, in reading order.
  const owners: (InlineContent | undefined)[] = [];
  const walk = (items: InlineContent[], owner?: InlineContent): void => {
    for (const item of items) {
      if (item.kind === "link") walk(item.children, item);
      else if ("children" in item) walk(item.children, owner);
      else owners.push(owner);
    }
  };
  walk(block.content);
  return !owners.some((owner, index) => {
    const previous = owners[index - 1];
    return owner !== undefined && previous !== undefined && owner !== previous && markKey(owner) === markKey(previous);
  });
}

function inlineText(content: InlineContent[]): string {
  return content.map((item) => (item.kind === "text" ? item.text : item.kind === "break" ? "\n"
    : item.kind === "math" ? `$${item.value}$` : item.kind === "code" ? `\`${item.value}\`` : item.kind === "reference" ? `{${item.role}}\`${item.label}\``
    : inlineText(item.children))).join("");
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
