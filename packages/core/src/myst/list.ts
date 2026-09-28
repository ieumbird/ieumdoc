import { inlineContentToNodes, projectInlineContent, type InlineContent } from "../inline.ts";
import type { ListContent, ListItemContent } from "../list.ts";
import type { MystNode } from "./tree.ts";

const LIST_FIELDS = new Set(["type", "ordered", "start", "spread", "children", "position"]);
const ITEM_FIELDS = new Set(["type", "spread", "children", "position"]);
const PARAGRAPH_FIELDS = new Set(["type", "children", "position"]);

const hasOnly = (node: MystNode, fields: Set<string>) => Object.keys(node).every((key) => fields.has(key));

/**
 * List v1 authoring supports bullet and numbered lists whose items hold one paragraph of
 * supported inline content, optionally followed by one nested list. Task items, items with
 * several paragraphs or other blocks stay read-only so an edit never flattens them.
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
    const [paragraph, nested, ...rest] = item.children ?? [];
    if (paragraph?.type !== "paragraph" || !hasOnly(paragraph, PARAGRAPH_FIELDS) || rest.length > 0) return undefined;
    const content = projectInlineContent(paragraph);
    if (!content || !hasVisibleContent(content)) return undefined;
    const list = nested === undefined ? undefined : supportedListContent(nested);
    if (nested !== undefined && !list) return undefined;
    items.push(list ? { content, list } : { content });
  }
  return node.ordered ? { ordered: true, start: node.start, items } : { ordered: false, items };
}

/** An item needs visible content: whitespace alone does not persist as a Markdown list item. */
export function hasVisibleContent(content: InlineContent[]): boolean {
  return content.some((item) => item.kind === "math" || item.kind === "reference" ||
    (item.kind === "text" && item.text.trim().length > 0) || ("children" in item && hasVisibleContent(item.children)));
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
        { type: "paragraph", children: inlineContentToNodes(item.content) },
        ...(item.list ? [createListNode(item.list)] : []),
      ],
    })),
  };
}
