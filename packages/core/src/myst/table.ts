import type { MystNode } from "./tree.ts";

/**
 * Table cell editing v1 supports cells of a top-level Markdown (GFM) table whose
 * content is empty or plain text only. Cells with marks, math, links, roles or
 * any other inline node stay read-only so an edit never flattens them.
 */
export function tableCellText(cell: MystNode | undefined): string | undefined {
  if (cell?.type !== "tableCell") return undefined;
  const children = cell.children ?? [];
  const plain = children.every((child) => child.type === "text" && typeof child.value === "string" &&
    Object.keys(child).every((key) => key === "type" || key === "value" || key === "position"));
  return plain ? children.map((child) => child.value).join("") : undefined;
}

/** Replace a supported cell's content; an empty cell has no children, as MyST parses it. */
export function setTableCellText(cell: MystNode, text: string): void {
  cell.children = text.length > 0 ? [{ type: "text", value: text }] : [];
}

// New columns are unaligned; new rows inherit each existing column's alignment.
function cell(text: string, header: boolean): MystNode {
  return {
    type: "tableCell",
    ...(header ? { header: true } : {}),
    children: text.length > 0 ? [{ type: "text", value: text }] : [],
  };
}

/** A GFM table of plain-text cells; the first row is the header row. */
export function createTableNode(rows: string[][], align?: ("left" | "center" | "right" | null)[]): MystNode {
  return {
    type: "table",
    children: rows.map((row, index) => ({ type: "tableRow", children: row.map((text, column) => ({ ...cell(text, index === 0), ...(align?.[column] ? { align: align[column] } : {}) })) })),
  };
}

/** Insert a body row of empty cells, one per header cell. */
export function insertTableRowNode(table: MystNode, index: number): void {
  const columns = table.children?.[0]?.children ?? [];
  table.children!.splice(index, 0, { type: "tableRow", children: columns.map(header => ({
    ...cell("", false), ...(header.align === undefined ? {} : { align: header.align }),
  })) });
}

/** Insert an empty column; its header cell is empty too. */
export function insertTableColumnNode(table: MystNode, index: number): void {
  table.children!.forEach((row, rowIndex) => row.children!.splice(index, 0, cell("", rowIndex === 0)));
}
