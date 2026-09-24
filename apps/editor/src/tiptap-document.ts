import type { EditableBlock, EditableDocument, FigureContent, InlineContent, NodePath } from "@ieumdoc/core";
import { figureContentError } from "@ieumdoc/core/figure";
import { fromTiptapContent, toTiptapContent, type TiptapJSON } from "./tiptap-inline.ts";

export type { TiptapJSON };

export type HeadingEdit = {
  path: NodePath;
  from: string;
  to: string;
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

export type AdmonitionEdit = {
  path: NodePath;
  content: InlineContent[];
};

export type FigureEdit = {
  path: NodePath;
  from: FigureContent;
  to: FigureContent;
};

export type InsertEdit =
  | { block: "paragraph"; content: InlineContent[] }
  | { block: "heading"; level: number; text: string }
  | { block: "equation"; latex: string }
  | ({ block: "figure" } & FigureContent);

/** A new top-level block's position in the next order, or an original snapshot block part. */
export type OrderItem = { path: NodePath; part: number } | { insert: number };

export type SupportedEdits = {
  order?: OrderItem[];
  headings: HeadingEdit[];
  paragraphs: ParagraphEdit[];
  equations?: EquationEdit[];
  figures?: FigureEdit[];
  cells?: TableCellEdit[];
  admonitions?: AdmonitionEdit[];
  splits?: { path: NodePath; parts: InlineContent[][] }[];
  merges?: { paths: NodePath[]; parts: InlineContent[][] }[];
  inserts?: InsertEdit[];
  deletes?: NodePath[];
};

// Unsaved top-level paragraphs have no snapshot locator yet. This session-only
// marker is replaced by the saved snapshot path; it is never persisted.
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
  "unsupportedBlock",
]);

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
      ? document.blocks.map(toTiptapBlock)
      : [{ type: "paragraph", attrs: { sourcePath: EMPTY_DOCUMENT_BLOCK_PATH } }],
  };
}

export function collectSupportedEdits(document: EditableDocument, next: TiptapJSON): SupportedEdits {
  assertSupportedDocumentChange(toTiptapDocument(document), next);
  const headings: HeadingEdit[] = [];
  const paragraphs: ParagraphEdit[] = [];
  const equations: EquationEdit[] = [];
  const figures: FigureEdit[] = [];
  const cells: TableCellEdit[] = [];
  const admonitions: AdmonitionEdit[] = [];
  const splits: NonNullable<SupportedEdits["splits"]> = [];
  const merges: NonNullable<SupportedEdits["merges"]> = [];
  const inserts: InsertEdit[] = [];
  const insertOf = new Map<TiptapJSON, number>();
  const used = new Set<string>();
  const nodes = next.content ?? [];
  const keys = [...new Set(nodes.map(sourcePathOf))];
  for (const key of keys) {
    const group = nodes.filter(node => sourcePathOf(node) === key);
    const paths = snapshotPaths(key);
    paths.forEach(path => used.add(path));
    if (paths.length === 0) {
      if (document.blocks.length === 0 && key === EMPTY_DOCUMENT_BLOCK_PATH && group[0]?.type === "paragraph" &&
          inlineText(paragraphInline(group[0])).length === 0) {
        continue;
      }
      for (const node of group) {
        const insert = insertEdit(node);
        if (insert.block === "paragraph" && inlineText(insert.content).length === 0) {
          throw new Error("empty paragraph cannot be saved");
        }
        if (insert.block === "heading" && insert.text.length === 0) {
          throw new Error("empty heading cannot be saved");
        }
        if (insert.block === "equation" && insert.latex.length === 0) {
          throw new Error("empty equation LaTeX cannot be saved");
        }
        if (insert.block === "figure") assertFigureContent(insert);
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
      const text = headingText(node);
      if (text === block.text) continue;
      if (text.length === 0) throw new Error("empty heading text cannot be saved");
      headings.push({ path: block.path, from: block.text, to: text });
    } else if (block.block === "paragraph" && editableParagraph(block)) {
      if (group.length > 1) {
        splits.push({ path: block.path, parts: group.map(paragraphInline) });
        continue;
      }
      const content = paragraphInline(node);
      if (sameInline(content, block.content)) continue;
      if (inlineText(content).length === 0) throw new Error("empty paragraph cannot be saved");
      paragraphs.push({ path: block.path, content });
    } else if (block.block === "equation") {
      const latex = equationLatex(node);
      if (latex !== block.latex) equations.push({ path: block.path, from: block.latex, to: latex });
    } else if (block.block === "figure" && block.editable) {
      const from = { imageUrl: block.imageUrl, imageAlt: block.imageAlt, caption: block.caption.text };
      const to = figureContent(node);
      if (JSON.stringify(to) === JSON.stringify(from)) continue;
      assertFigureContent(to);
      figures.push({ path: block.path, from, to });
    } else if (block.block === "admonition" && block.editable) {
      const content = paragraphInline(node);
      if (sameInline(content, block.content)) continue;
      if (inlineText(content).trim().length === 0) throw new Error("admonition body cannot be empty");
      admonitions.push({ path: block.path, content });
    } else if (block.block === "table") {
      const next = tableCells(node);
      block.rows.forEach((row, rowIndex) => row.cells.forEach((cell, index) => {
        const text = next[rowIndex]?.[index]?.text;
        if (cell.editable && text !== undefined && text !== cell.text) cells.push({ path: cell.path, from: cell.text, to: text });
      }));
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
    paragraphs,
    ...(equations.length ? { equations } : {}),
    ...(figures.length ? { figures } : {}),
    ...(cells.length ? { cells } : {}),
    ...(admonitions.length ? { admonitions } : {}),
    ...(splits.length ? { splits } : {}),
    ...(merges.length ? { merges } : {}),
    ...(inserts.length ? { inserts } : {}),
    ...(deletes.length ? { deletes } : {}),
  };
}

export function isSupportedDocumentChange(baseline: TiptapJSON, next: TiptapJSON): boolean {
  try {
    assertSupportedDocumentChange(baseline, next);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates the editor document against the loaded snapshot. New paragraphs and headings are
 * representable here; a missing snapshot block must be declared as deleted.
 * The editor's structure guard admits both only from explicit block commands.
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
  if (block.block === "table") {
    return {
      type: "table",
      attrs: { sourcePath: pathKey(block.path) },
      content: block.rows.map((row) => ({
        type: "tableRow",
        content: row.cells.map((cell): TiptapJSON => cell.editable
          ? { type: "tableCell", attrs: { header: cell.header }, content: cell.text ? [{ type: "text", text: cell.text }] : [] }
          : { type: "readonlyTableCell", attrs: { header: cell.header, text: cell.text } }),
      })),
    };
  }
  return readonlyNode("unsupportedBlock", block.path, { text: block.text });
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
  if (node.type === "equation") {
    return { block: "equation", latex: equationLatex(node) };
  }
  if (node.type === "figure") {
    if (node.attrs?.editable !== true || normalizeAttr(node.attrs?.label) !== "") {
      throw new Error("a new figure must be editable and unlabeled");
    }
    return { block: "figure", ...figureContent(node) };
  }
  throw new Error("only paragraphs, headings, equations, and figures can be inserted");
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
  if (beforeType !== afterType) {
    throw new Error(`top-level block type changed from "${beforeType}" to "${afterType}"`);
  }
  if (beforeType === "equation") {
    const beforeAttrs = before.attrs ?? {};
    const afterAttrs = after.attrs ?? {};
    for (const key of ["sourcePath", "label"]) {
      if (normalizeAttr(beforeAttrs[key]) !== normalizeAttr(afterAttrs[key])) {
        throw new Error(`equation identity cannot change (${key})`);
      }
    }
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
    // The label is displayed only; unsupported Figure structures stay read-only.
    for (const key of ["sourcePath", "label", "editable"]) {
      if (normalizeAttr(beforeAttrs[key]) !== normalizeAttr(afterAttrs[key])) {
        throw new Error(`figure identity cannot change (${key})`);
      }
    }
    if (beforeAttrs.editable !== true) {
      assertReadonlyUnchanged(before, after);
      return;
    }
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
    const was = tableCells(before);
    const is = tableCells(after);
    if (is.length !== was.length || is.some((row, index) => row.length !== was[index].length)) {
      throw new Error("table rows and cells cannot be added or removed");
    }
    was.forEach((row, rowIndex) => row.forEach((cell, index) => {
      const next = is[rowIndex][index];
      if (next.editable !== cell.editable || next.header !== cell.header || (!cell.editable && next.text !== cell.text)) {
        throw new Error("read-only table cells and cell kinds cannot change");
      }
    }));
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
    if (Number(before.attrs?.level ?? 1) !== Number(after.attrs?.level ?? 1)) {
      throw new Error("heading level cannot change");
    }
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

type TableCellShape = { editable: boolean; header: boolean; text: string };

/** The cell grid of a table node; editable cells must hold unmarked text only. */
function tableCells(node: TiptapJSON): TableCellShape[][] {
  return (node.content ?? []).map((row) => {
    if (row.type !== "tableRow") throw new Error(`unsupported Tiptap node ${describeType(row)} in table`);
    return (row.content ?? []).map((cell) => {
      const header = cell.attrs?.header === true;
      if (cell.type === "readonlyTableCell") return { editable: false, header, text: String(cell.attrs?.text ?? "") };
      if (cell.type !== "tableCell") throw new Error(`unsupported Tiptap node ${describeType(cell)} in table row`);
      let text = "";
      for (const child of cell.content ?? []) {
        if (child.type !== "text" || typeof child.text !== "string" || (child.marks?.length ?? 0) > 0) {
          throw new Error("table cells hold plain text only");
        }
        text += child.text;
      }
      return { editable: true, header, text };
    });
  });
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
    : item.kind === "math" ? `$${item.value}$` : inlineText(item.children))).join("");
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
