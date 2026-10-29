import type { EditableBlock, EditableDocument, InlineContent, ListContent, NodePath } from "@ieumdoc/core";
import { toTiptapContent, type TiptapJSON } from "./tiptap-inline.ts";

/**
 * Core → Tiptap: the editor document a Core read model projects to, and the session-only
 * locators (snapshot paths, new-block paths) both directions share.
 * Pure functions; nothing here collects edits or validates an editor change (tiptap-edits.ts).
 */

// Unsaved top-level paragraphs have no snapshot locator yet. This session-only
// marker stays in the session across saves; a newly opened document gets fresh snapshot paths. It is never persisted.
export const NEW_BLOCK_PREFIX = "new:";

const EMPTY_DOCUMENT_BLOCK_PATH = `${NEW_BLOCK_PREFIX}empty`;

export function isNewBlockPath(path: string): boolean {
  return path.startsWith(NEW_BLOCK_PREFIX);
}

export function pathKey(path: NodePath): string {
  return path.join(",");
}

/** The editor document of a Core read model, block for block. Core's order already puts the
 * endnotes after the body (endnotes.ts keeps it while editing). */
export function toTiptapDocument(document: EditableDocument): TiptapJSON {
  return {
    type: "doc",
    ...(document.headingNumbering || document.referenceTemplates ? { attrs: {
      ...(document.headingNumbering ? { headingNumbering: document.headingNumbering } : {}),
      ...(document.referenceTemplates ? { referenceTemplates: document.referenceTemplates } : {}),
    } } : {}),
    content: document.blocks.length > 0
      ? document.blocks.map(toTiptapBlockNode)
      : [{ type: "paragraph", attrs: { sourcePath: EMPTY_DOCUMENT_BLOCK_PATH } }],
  };
}

export function toTiptapBlockNode(block: EditableBlock): TiptapJSON {
  return toTiptapBlock(block);
}

export function toTiptapBlock(block: EditableBlock): TiptapJSON {
  const attrs = { sourcePath: pathKey(block.path),
    ...("enumerator" in block && block.enumerator !== undefined ? { enumerator: block.enumerator } : {}) };
  switch (block.block) {
    case "heading": return { type: "heading", attrs: { ...attrs, level: block.level }, content: paragraphContent(block.content) };
    case "paragraph": return { type: "paragraph", attrs, content: paragraphContent(block.content) };
    case "admonition": return { type: "admonition", attrs: { ...attrs, variant: block.variant }, content: paragraphContent(block.content) };
    case "quote": return { type: "quote", attrs, content: paragraphContent(block.content) };
    case "footnote": return { type: "footnoteDefinition", attrs: { ...attrs, label: block.label }, content: paragraphContent(block.content) };
    case "divider": return { type: "divider", attrs };
    case "figure": return { type: "figure", attrs: { ...attrs, label: block.label, imageUrl: block.imageUrl, imageAlt: block.imageAlt,
      ...(block.contentKind === "mermaid" ? { mermaidSource: block.mermaidSource } : {}) }, content: paragraphContent(block.caption.content) };
    case "equation": return { type: "equation", attrs: { ...attrs, latex: block.latex, label: block.label } };
    case "code": return { type: "codeBlock", attrs: { ...attrs, language: block.language }, content: block.code ? [{ type: "text", text: block.code }] : [] };
    case "list": { const node = listNode(block); return { ...node, attrs: { ...node.attrs, ...attrs } }; }
    case "table": return {
      type: "table", attrs: { ...attrs, label: block.label ?? "" },
      content: [...block.rows.map((row, rowIndex) => ({ type: "tableRow", content: row.cells.map((cell, column) => ({
        type: "tableCell", attrs: { header: cell.header, ...(cell.align ? { align: cell.align } : {}), [TABLE_CELL_SOURCE_ATTR]: `${rowIndex},${column}` },
        content: paragraphContent(cell.content),
      })) })), { type: "tableCaption", content: paragraphContent(block.caption ?? []) }],
    };
    case "target": return { type: "labelTarget", attrs: { ...attrs, label: block.label } };
  }
}

function listNode(list: ListContent): TiptapJSON {
  return {
    type: list.ordered ? "orderedList" : "bulletList",
    ...(list.ordered ? { attrs: { start: list.start, style: list.style ?? "decimal", delimiter: list.delimiter ?? "." } } : {}),
    content: list.items.map(item => ({
      type: "listItem",
      content: [
        { type: "paragraph", content: paragraphContent(item.content) },
        ...(item.list ? [listNode(item.list)] : []),
      ],
    })),
  };
}

export function paragraphContent(content: InlineContent[]): TiptapJSON[] {
  const projected = toTiptapContent(content);
  return projected.content?.[0]?.content ?? [];
}

/** Session-only cell attribute: the cell's `row,column` in the opening snapshot table, empty for a
 * cell added since Open/New. A snapshot locator like `sourcePath`, never persisted (ADR-0003). */
export const TABLE_CELL_SOURCE_ATTR = "sourceCell";

export function sourcePathOf(node: TiptapJSON | undefined): string {
  return String(node?.attrs?.sourcePath ?? "");
}
