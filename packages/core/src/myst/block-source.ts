import { semanticDifference, semanticFingerprint } from "./fingerprint.ts";
import { parse } from "./parse.ts";
import type { MystDocument } from "./tree.ts";

/** A paragraph after the block source; a construct the source leaves open would take it in. */
const NEXT_BLOCK = "Next block.";

/**
 * Parse the MyST source of one top-level block on its own. It must be exactly one block,
 * and complete: an unclosed fence, directive or HTML block would continue into the block
 * after it in the document, so a following paragraph must reload as a separate block.
 */
export function parseBlockSource(source: string): MystDocument {
  if (typeof source !== "string") throw new Error("block source must be text");
  const fragment = parse(source);
  if (fragment.children.length !== 1) {
    throw new Error(`block source must be exactly one block; it parses as ${fragment.children.length}`);
  }
  const followed = parse(`${source}\n\n${NEXT_BLOCK}\n`);
  const expected = { type: "root", children: [fragment.children[0], ...parse(NEXT_BLOCK).children] };
  if (semanticDifference(semanticFingerprint(expected), semanticFingerprint(followed))) {
    throw new Error("block source is not closed: it would continue into the next block");
  }
  return fragment;
}
