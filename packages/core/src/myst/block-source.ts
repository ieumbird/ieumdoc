import { semanticDifference, semanticFingerprint } from "./fingerprint.ts";
import { DROPPED_FOOTNOTE_FIELD, sourceDefinitions } from "./footnote.ts";
import { OPTIONS, parse } from "./parse.ts";
import { rememberSource, type MystDocument } from "./tree.ts";

/** A paragraph after the block source; a construct the source leaves open would take it in. */
const NEXT_BLOCK = "Next block.";

/**
 * Parse the MyST source of one top-level block on its own. It must be exactly one block,
 * and complete: an unclosed fence, directive or HTML block would continue into the block
 * after it in the document, so a following paragraph must reload as a separate block.
 * `footnotes` are the labels the rest of the document defines.
 */
export function parseBlockSource(source: string, footnotes: string[] = []): MystDocument {
  if (typeof source !== "string") throw new Error("block source must be text");
  const fragment = parseInDocument(source, footnotes);
  if (fragment.children.length !== 1) {
    throw new Error(`block source must be exactly one block; it parses as ${fragment.children.length}`);
  }
  const followed = parseInDocument(`${source}\n\n${NEXT_BLOCK}\n`, footnotes);
  const expected = { type: "root", children: [fragment.children[0], ...parse(NEXT_BLOCK).children] };
  if (semanticDifference(semanticFingerprint(expected), semanticFingerprint(followed))) {
    throw new Error("block source is not closed: it would continue into the next block");
  }
  return fragment;
}

/**
 * Parse block source as it reads in its document: `[^x]` is a footnote reference only where the
 * document defines `x`, and a definition is kept only where something references it. Stub
 * definitions and references after the source give it that context and are removed again.
 */
function parseInDocument(source: string, footnotes: string[]): MystDocument {
  const written = sourceDefinitions(source, OPTIONS);
  const own = new Set(written.map(definition => definition.label));
  const context = [...[...own].map(label => `[^${label}]`), ...footnotes.filter(label => !own.has(label)).map(label => `[^${label}]: x`)];
  if (context.length === 0) return parse(source);
  const lines = source.split(/\r?\n/).length;
  const document = parse(`${source}\n\n${context.join("\n\n")}\n`);
  // Stubs nothing references are dropped; the source's own definitions are all referenced, so
  // only a repeated one can be.
  if (own.size < written.length) throw new Error(String(document[DROPPED_FOOTNOTE_FIELD]));
  delete document[DROPPED_FOOTNOTE_FIELD];
  document.children = document.children.filter(node => (node.position?.start.line ?? 0) <= lines);
  rememberSource(document, source);
  return document;
}
