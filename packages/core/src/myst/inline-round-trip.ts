import type { DocumentNode } from "../document.ts";
import { inlineContentText, projectInlineContent, type InlineContent } from "../inline.ts";
import { parse } from "./parse.ts";
import { serialize } from "./serialize.ts";

/** Persistent text edits must retain their block type, text and marks.
 * This is a write-time MyST constraint, not an Editor interaction rule. */
export function assertInlineBlockRoundTrip(node: DocumentNode): void {
  if (node.type !== "paragraph" && node.type !== "heading") return;
  const content = projectInlineContent(node);
  // This check covers the supported inline contract only. It does not rebuild
  // or reinterpret links, references or other unsupported inline semantics.
  if (!content) return;
  if (inlineContentText(content).length === 0) {
    throw new Error(`empty ${node.type} cannot be saved`);
  }
  const markdown = serialize({ type: "root", children: [node] });
  const reparsed = parse(markdown);
  const block = reparsed.children[0];
  const projected = block && projectInlineContent(block);
  if (reparsed.children.length !== 1 || block?.type !== node.type ||
      (node.type === "heading" && block.depth !== node.depth) || !projected ||
      JSON.stringify(markedText(content)) !== JSON.stringify(markedText(projected)) ||
      serialize(reparsed) !== markdown) {
    throw new Error(`${node.type} edit cannot round-trip losslessly through canonical Markdown`);
  }
}

// Compare rendered text and mark coverage, not text-node fragmentation or the
// nesting order of equivalent strong/emphasis marks produced by adapters.
function markedText(content: InlineContent[], marks: string[] = []): [string, string][] {
  return content.flatMap((item): [string, string][] => {
    if (item.kind === "text") return item.text.split("").map((text) => [text, marks.join(",")]);
    if (item.kind === "break") return [["\n", [...marks, "break"].join(",")]];
    return markedText(item.children, [...new Set([...marks, item.kind])].sort());
  });
}
