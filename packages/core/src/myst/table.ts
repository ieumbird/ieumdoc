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
