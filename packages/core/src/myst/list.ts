import { structuralInlineContent, inlineContentToNodes, projectInlineContent } from "../inline.ts";
import type { ListContent, ListItemContent } from "../list.ts";
import type { MystNode } from "./tree.ts";

const LIST_FIELDS = new Set(["type", "ordered", "start", "spread", "children", "position"]);
const ITEM_FIELDS = new Set(["type", "spread", "children", "position"]);
const PARAGRAPH_FIELDS = new Set(["type", "children", "position"]);

const hasOnly = (node: MystNode, fields: Set<string>) => Object.keys(node).every((key) => fields.has(key));

/**
 * List v1 authoring supports bullet and numbered lists whose items hold zero or one paragraph
 * of supported inline content, optionally followed by one nested list. Task items, items with
 * several paragraphs or other blocks are rejected by native admission.
 * `spread` is recorded as myst-parser produces it for every Markdown list.
 */
export function supportedListContent(node: MystNode): ListContent | undefined {
  if (node.type !== "list" || typeof node.ordered !== "boolean" || node.spread !== false || !hasOnly(node, LIST_FIELDS)) {
    return undefined;
  }
  if (node.ordered ? !Number.isInteger(node.start) : node.start !== undefined) return undefined;
  const children = node.children ?? [];
  if (children.length === 0) return undefined;
  const items: ListItemContent[] = [];
  for (const item of children) {
    if (item.type !== "listItem" || item.spread !== true || !hasOnly(item, ITEM_FIELDS)) return undefined;
    const children = [...(item.children ?? [])];
    const paragraph = children[0]?.type === "paragraph" ? children.shift() : undefined;
    const [nested, ...rest] = children;
    if ((paragraph && !hasOnly(paragraph, PARAGRAPH_FIELDS)) || rest.length > 0) return undefined;
    const content = paragraph ? projectInlineContent(paragraph) : [];
    if (!content || (paragraph && structuralInlineContent(content).length === 0)) return undefined;
    const list = nested === undefined ? undefined : supportedListContent(nested);
    if (nested !== undefined && !list) return undefined;
    items.push(list ? { content, list } : { content });
  }
  return node.ordered ? { ordered: true, start: node.start, items } : { ordered: false, items };
}

/** The MyST structure myst-parser produces for a Markdown list of this content. */
export function createListNode(list: ListContent): MystNode {
  return {
    type: "list",
    ordered: list.ordered,
    ...(list.ordered ? { start: list.start ?? 1 } : {}),
    spread: false,
    children: list.items.map((item) => ({
      type: "listItem",
      spread: true,
      children: [
        ...(item.content.length ? [{ type: "paragraph", children: inlineContentToNodes(item.content) }] : []),
        ...(item.list ? [createListNode(item.list)] : []),
      ],
    })),
  };
}
