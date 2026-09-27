import { inlineContentText, projectInlineContent, type InlineContent } from "../inline.ts";
import type { MystNode } from "./tree.ts";

export const ADMONITION_VARIANTS = ["note", "warning"] as const;
export type AdmonitionVariant = typeof ADMONITION_VARIANTS[number];

const SIMPLE_VARIANTS = new Set<string>(ADMONITION_VARIANTS);
const ADMONITION_FIELDS = new Set(["type", "kind", "children", "position"]);
const PARAGRAPH_FIELDS = new Set(["type", "children", "position"]);

export function isAdmonitionVariant(variant: string): variant is AdmonitionVariant {
  return SIMPLE_VARIANTS.has(variant);
}

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
