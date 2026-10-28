import { parseNativeDocument, serializeNativeDocument } from "./native.ts";
import { serialize } from "./serialize.ts";
import type { MystDocument, MystNode } from "./tree.ts";

/**
 * SPIKE (AI edit proposals): a native document as its canonical top-level Markdown blocks.
 * Block i is top-level child i; the front matter is block 0 and all endnote definitions
 * share one final "endnotes" block, because canonical write keeps them together after the body.
 */
export type DocumentBlock = { index: number; type: string; markdown: string };

const SEPARATOR = "IEUMDOCBLOCKSEPARATOR";
const separator = (): MystNode => ({ type: "paragraph", children: [{ type: "text", value: SEPARATOR }] } as MystNode);

export function documentBlocks(source: string): DocumentBlock[] {
  const document: MystDocument = parseNativeDocument(serializeNativeDocument(parseNativeDocument(source)));
  const children = document.children;
  const firstEndnote = children.findIndex(node => node.type === "footnoteDefinition");
  const body = firstEndnote < 0 ? children : children.slice(0, firstEndnote);
  const marked = body.flatMap((node, index) => index === 0 ? [node] : [separator(), node]);
  if (firstEndnote >= 0) marked.push(separator(), ...children.slice(firstEndnote));
  const chunks = serialize({ ...document, children: marked }).replace(/\n+$/, "").split(new RegExp(`\\n+${SEPARATOR}\\n+`));
  if (chunks.length !== body.length + (firstEndnote >= 0 ? 1 : 0) || chunks.some(chunk => chunk.includes(SEPARATOR))) {
    throw new Error("document blocks could not be separated");
  }
  return chunks.map((markdown, index) => ({
    index,
    type: index === 0 ? "frontmatter" : index >= body.length ? "endnotes" : String(children[index].type),
    markdown,
  }));
}

/** Canonical native Markdown of blocks in order; throws when Core would not write the result. */
export function composeBlocks(blocks: readonly string[]): string {
  const markdown = blocks.map(block => block.trim()).filter(Boolean).join("\n\n") + "\n";
  return serializeNativeDocument(parseNativeDocument(markdown));
}
