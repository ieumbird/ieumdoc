import { inlineContentText, projectInlineContent, type InlineContent } from "../inline.ts";
import type { MystNode } from "./tree.ts";

const SIMPLE_VARIANTS = new Set(["note", "warning"]);
const ADMONITION_FIELDS = new Set(["type", "kind", "children", "position"]);
const PARAGRAPH_FIELDS = new Set(["type", "children", "position"]);

/** The deliberately narrow MyST shape that can be edited without flattening admonition semantics. */
export function supportedAdmonitionContent(node: MystNode): InlineContent[] | undefined {
  if (node.type !== "admonition" || typeof node.kind !== "string" || !SIMPLE_VARIANTS.has(node.kind) ||
      !Object.keys(node).every((key) => ADMONITION_FIELDS.has(key))) return undefined;
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
