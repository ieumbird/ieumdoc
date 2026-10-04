import { inlineContentToNodes, projectInlineContent, type InlineContent } from "../inline.ts";
import type { MystNode } from "./tree.ts";

/**
 * Editable cells of a top-level Markdown (GFM) table hold supported inline content
 * (marks, links, inline math, references) without line breaks, or nothing. Cells with
 * any other inline node stay read-only so an edit never flattens them.
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

/** Remove a row; its cells, read-only ones included, go with it. */
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
