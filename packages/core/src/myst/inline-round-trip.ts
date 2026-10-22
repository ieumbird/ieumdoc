import { inlineContentText, projectInlineContent, sameInlineContent } from "../inline.ts";
import { parse } from "./parse.ts";
import { serialize, serializeFor } from "./serialize.ts";
import type { MystNode } from "./tree.ts";

/** Persistent text edits must retain their block type, text and marks.
 * This is a write-time MyST constraint, not an Editor interaction rule. */
export function assertInlineBlockRoundTrip(node: MystNode): void {
  if (node.type !== "paragraph" && node.type !== "heading") return;
  const content = projectInlineContent(node);
  // This check covers the supported inline contract only. It does not rebuild
  // or reinterpret references or other unsupported inline semantics.
  if (!content) return;
  if (inlineContentText(content).length === 0) {
    throw new Error(`empty ${node.type} cannot be saved`);
  }
  const failure = `${node.type} edit cannot round-trip losslessly through canonical Markdown`;
  const markdown = serializeFor({ type: "root", children: [node] }, failure);
  const reparsed = parse(markdown);
  // Footnote definitions after the block complete its references (see `serializeFor`).
  const blocks = reparsed.children.filter((child) => child.type !== "footnoteDefinition");
  const block = blocks[0];
  const projected = block && projectInlineContent(block);
  if (blocks.length !== 1 || block?.type !== node.type ||
      (node.type === "heading" && block.depth !== node.depth) || !projected ||
      !sameInlineContent(content, projected) ||
      serialize(reparsed) !== markdown) {
    throw new Error(failure);
  }
}
