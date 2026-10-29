import { createTokenizer } from "myst-parser";
import { isScalar } from "yaml";
import { DocumentDiagnosticError } from "../write-error.ts";
import { metadata } from "./metadata.ts";
import { FRONT_MATTER_FIELD, OPTIONS } from "./parse.ts";
import { serializeFor } from "./serialize.ts";
import { cloneDocument, type MystDocument } from "./tree.ts";
import { assertUnicode } from "./unicode.ts";

const tokenizer = createTokenizer(OPTIONS);

/** Titles are plain strings, never flattened Markdown or inline math. */
function assertTitle(value: unknown): asserts value is string {
  if (typeof value !== "string" || tokenizer.parseInline(value, {}).some(token =>
    token.children?.some(child => child.type !== "text" && child.type !== "softbreak"))) {
    throw new DocumentDiagnosticError("native-metadata", "Document title must be a plain string without inline formatting or math");
  }
  assertUnicode(value, [0]);
}

export function getDocumentTitle(document: MystDocument): string | undefined {
  if (document.children[0]?.[FRONT_MATTER_FIELD] !== true) return undefined;
  const { yaml } = metadata(document);
  if (!yaml.has("title")) return undefined;
  const title = yaml.get("title", true);
  if (!isScalar(title)) throw new DocumentDiagnosticError("native-metadata", "Document title must be a plain string without inline formatting or math");
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
  node.value = String(yaml).trimEnd();
  serializeFor(next, "document title cannot be preserved through canonical round-trip");
  return next;
}
