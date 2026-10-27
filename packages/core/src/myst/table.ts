import { inlineContentToNodes, projectInlineContent, type InlineContent } from "../inline.ts";
import type { MystNode } from "./tree.ts";

/**
 * Editable cells of a top-level Markdown (GFM) table hold supported inline content
 * (marks, links, inline math, references) without line breaks, or nothing. Cells with
 * any other inline node are rejected by native admission.
 */
export function tableCellContent(cell: MystNode | undefined): InlineContent[] | undefined {
  if (cell?.type !== "tableCell") return undefined;
  const content = projectInlineContent(cell);
  return content && !containsBreak(content) ? content : undefined;
}

function containsBreak(content: InlineContent[]): boolean {
  return content.some((item) => item.kind === "break" || ("children" in item && containsBreak(item.children)));
}

/** Replace a supported cell's content; an empty cell has no children, as MyST parses it. */
export function setTableCellContent(cell: MystNode, content: InlineContent[]): void {
  cell.children = inlineContentToNodes(content);
}

// New columns are unaligned; new rows inherit each existing column's alignment.
function cell(content: InlineContent[], header: boolean): MystNode {
  return {
    type: "tableCell",
    ...(header ? { header: true } : {}),
    children: inlineContentToNodes(content),
  };
}

/** A GFM table of inline-content cells; the first row is the header row. */
export function createTableNode(rows: InlineContent[][][], align?: ("left" | "center" | "right" | null)[]): MystNode {
  return {
    type: "table",
    children: rows.map((row, index) => ({ type: "tableRow", children: row.map((content, column) => ({ ...cell(content, index === 0), ...(align?.[column] ? { align: align[column] } : {}) })) })),
  };
}

/** Insert a body row of empty cells, one per header cell. */
export function insertTableRowNode(table: MystNode, index: number): void {
  const columns = table.children?.[0]?.children ?? [];
  table.children!.splice(index, 0, { type: "tableRow", children: columns.map(header => ({
    ...cell([], false), ...(header.align === undefined ? {} : { align: header.align }),
  })) });
}

/** Insert an empty column; its header cell is empty too. */
export function insertTableColumnNode(table: MystNode, index: number): void {
  table.children!.forEach((row, rowIndex) => row.children!.splice(index, 0, cell([], rowIndex === 0)));
}

/** Remove a row and its cells. */
export function removeTableRowNode(table: MystNode, index: number): void {
  table.children!.splice(index, 1);
}

/** Remove a column from every row. */
export function removeTableColumnNode(table: MystNode, index: number): void {
  table.children!.forEach(row => row.children!.splice(index, 1));
}

/** Move a row; its cells keep their content and alignment. */
export function moveTableRowNode(table: MystNode, from: number, to: number): void {
  table.children!.splice(to, 0, ...table.children!.splice(from, 1));
}

/** Move a column in every row; its cells keep their content and alignment. */
export function moveTableColumnNode(table: MystNode, from: number, to: number): void {
  table.children!.forEach(row => row.children!.splice(to, 0, ...row.children!.splice(from, 1)));
}

/** GFM alignment belongs to a column, so MyST records it on every cell of the column. */
export function setTableColumnAlignNode(table: MystNode, index: number, align: "left" | "center" | "right" | null): void {
  for (const row of table.children!) {
    const target = row.children![index];
    if (align) target.align = align;
    else delete target.align;
  }
}

const TABLE_DIRECTIVE_FIELDS = new Set(["type", "kind", "children", "label", "identifier", "position"]);
const CAPTION_FIELDS = new Set(["type", "children", "position"]);

/**
 * MyST keeps original options on mystDirective, but drops some (including align)
 * from its table container. Preserve unsupported evidence before directive lifting;
 * admission's field whitelist and the write fingerprint must both see it.
 */
export function retainTableOptions(node: MystNode): void {
  if (node.type === "mystDirective" && node.name === "table") {
    const unsupported = Object.fromEntries(Object.entries(node.options ?? {})
      .filter(([name]) => name !== "name" && name !== "label"));
    if (Object.keys(unsupported).length && node.children?.[0]) {
      node.children[0]["(unsupported table options)"] = unsupported;
    }
  }
  node.children?.forEach(retainTableOptions);
}

/**
 * A `{table}` directive Core can author: a Markdown table with optional one-paragraph caption
 * and label. Other table directives (options, legends) are rejected by native admission.
 */
export function isTableDirective(node: MystNode | undefined): boolean {
  if (node?.type !== "container" || node.kind !== "table") return false;
  if (!Object.keys(node).every((key) => TABLE_DIRECTIVE_FIELDS.has(key) || node[key] === undefined)) return false;
  const children = node.children ?? [];
  const caption = children[0]?.type === "caption" ? children[0] : undefined;
  const rest = caption ? children.slice(1) : children;
  if (rest.length !== 1 || rest[0].type !== "table") return false;
  // Native grids have a header row. Headerless csv/list-table containers are
  // outside this writer's GFM shape and must not acquire an invented header.
  const header = rest[0].children?.[0]?.children;
  if (!header?.length || !header.every(cell => cell.header === true)) return false;
  if (caption && !(Object.keys(caption).every((key) => CAPTION_FIELDS.has(key)) &&
      caption.children?.length === 1 && caption.children[0].type === "paragraph" &&
      Object.keys(caption.children[0]).every(key => CAPTION_FIELDS.has(key)))) return false;
  return true;
}

/** The Markdown table of a top-level block: a plain table, or the table of a table directive. */
export function tableOf(node: MystNode | undefined): MystNode | undefined {
  if (node?.type === "table") return node;
  return isTableDirective(node) ? node!.children!.find((child) => child.type === "table") : undefined;
}

/** The caption paragraph of a table directive, if it has a caption. */
export function tableCaptionParagraph(node: MystNode | undefined): MystNode | undefined {
  return isTableDirective(node) && node!.children![0].type === "caption" ? node!.children![0].children![0] : undefined;
}

/**
 * The top-level block for every authored table: a `{table}` directive, even without caption or label.
 */
export function tableBlockNode(table: MystNode, caption: InlineContent[], label: string, identifier?: string): MystNode {
  return {
    type: "container",
    kind: "table",
    ...(label.length > 0 ? { label, identifier } : {}),
    children: [
      ...(caption.length > 0 ? [{ type: "caption", children: [{ type: "paragraph", children: inlineContentToNodes(caption) }] }] : []),
      table,
    ],
  };
}
