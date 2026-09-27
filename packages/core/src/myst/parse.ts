import { mystParse } from "myst-parser";
import {
  containerChildrenTransform,
  liftMystDirectivesAndRolesTransform,
} from "myst-transforms";
import { VFile } from "vfile";
import type { MystDocument } from "./tree.ts";

/**
 * Parse boundary. The canonical-write guard compares this parse with the parse of
 * its own output, so anything decided here is invisible to it:
 * - text is the user's text: MyST's default typographic quote substitution
 *   (markdown-it `typographer` + `smartquotes`) would turn `Don't` into `Don’t`,
 *   so it is off, and a typed straight quote reloads exactly as written;
 * - a leading UTF-8 byte order mark is an encoding signature, not content;
 * - front matter is marked so canonical write fails instead of rewriting it.
 */
const OPTIONS = { extensions: { smartquotes: false } };

/**
 * Marks the code block MyST makes from front matter. The fingerprint treats every
 * node field as semantic, so a canonical write that cannot reproduce front matter
 * fails with this field in its reason. The parenthesized name is not a MyST field.
 */
const FRONT_MATTER_FIELD = "(front matter)";

export function parse(source: string): MystDocument {
  const text = source.startsWith("\uFEFF") ? source.slice(1) : source;
  const document = mystParse(text, OPTIONS) as MystDocument;
  markFrontMatter(document, text);
  liftMystDirectivesAndRolesTransform(document);
  containerChildrenTransform(document, new VFile());
  return document;
}

/**
 * myst-parser replaces its `front_matter` token with an ordinary `yaml` fence, so the
 * tree alone cannot tell front matter from a leading ```yaml block. The source can:
 * of the block rules, only front matter opens a code block with `-` (fences open with
 * ``` or ~~~, indented code with spaces), and it only starts at the first line.
 */
function markFrontMatter(document: MystDocument, source: string): void {
  const first = document.children[0];
  if (first?.type === "code" && first.position?.start.line === 1 && source.startsWith("-")) {
    first[FRONT_MATTER_FIELD] = true;
  }
}
