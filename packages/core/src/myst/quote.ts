import { inlineContentText, inlineContentToNodes, projectInlineContent, type InlineContent } from "../inline.ts";
import type { MystNode } from "./tree.ts";

const QUOTE_FIELDS = new Set(["type", "children", "position"]);
const PARAGRAPH_FIELDS = new Set(["type", "children", "position"]);

/**
 * Quote v1: a block quote holding one paragraph of supported inline content. Quotes with
 * several paragraphs or other blocks inside stay read-only so an edit never drops them.
 */
export function supportedQuoteContent(node: MystNode): InlineContent[] | undefined {
  if (node.type !== "blockquote" || !Object.keys(node).every((key) => QUOTE_FIELDS.has(key))) return undefined;
  const children = node.children ?? [];
  if (children.length !== 1) return undefined;
  const paragraph = children[0];
  if (paragraph.type !== "paragraph" || !Object.keys(paragraph).every((key) => PARAGRAPH_FIELDS.has(key))) {
    return undefined;
  }
  const content = projectInlineContent(paragraph);
  if (!content || inlineContentText(content).trim().length === 0) return undefined;
  return content;
}

export function createQuoteNode(content: InlineContent[]): MystNode {
  return { type: "blockquote", children: [{ type: "paragraph", children: inlineContentToNodes(content) }] };
}

/** A divider is a plain Markdown thematic break (`---`). */
export function isDivider(node: MystNode): boolean {
  return node.type === "thematicBreak" && Object.keys(node).every((key) => key === "type" || key === "position");
}
