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
