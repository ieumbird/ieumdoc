import { createTokenizer } from "myst-parser";
import { isScalar, Scalar } from "yaml";
import { DocumentWriteError } from "../write-error.ts";
import { metadata } from "./metadata.ts";
import { FRONT_MATTER_FIELD, OPTIONS } from "./parse.ts";
import { serializeFor } from "./serialize.ts";
import { cloneDocument, type MystDocument } from "./tree.ts";
import { assertUnicode } from "./unicode.ts";

const tokenizer = createTokenizer(OPTIONS);

const TITLE_REASON = "Document title must be a plain string on one line, without line breaks, inline formatting, math or YAML block scalar syntax";
function invalidTitle(): never {
  throw new DocumentWriteError(TITLE_REASON, { code: "native-metadata", path: [0],
    action: "Use a single-line plain string for title. Remove line separators and YAML block scalar syntax." });
}

/** Titles are single-line plain strings, never flattened Markdown or inline math. */
function assertTitle(value: unknown): asserts value is string {
  if (typeof value !== "string" || /[\r\n\v\f\u0085\u2028\u2029]/u.test(value) ||
      tokenizer.parseInline(value, {}).some(token => token.children?.some(child => child.type !== "text"))) invalidTitle();
  assertUnicode(value, [0]);
}

export function getDocumentTitle(document: MystDocument): string | undefined {
  if (document.children[0]?.[FRONT_MATTER_FIELD] !== true) return undefined;
  const { yaml } = metadata(document);
  if (!yaml.has("title")) return undefined;
  const title = yaml.get("title", true);
  if (!isScalar(title) || title.type === Scalar.BLOCK_LITERAL || title.type === Scalar.BLOCK_FOLDED) invalidTitle();
  assertTitle(title.value);
  return title.value;
}

/** null removes the field; an empty string remains an explicitly empty title. */
export function updateDocumentTitle(document: MystDocument, title: string | null): MystDocument {
  if (title !== null) assertTitle(title);
  const next = cloneDocument(document);
  const { node, yaml } = metadata(next);
  if (title === null) yaml.delete("title");
  else yaml.set("title", title);
  node.value = String(yaml);
  serializeFor(next, "document title cannot be preserved through canonical round-trip");
  return next;
}
