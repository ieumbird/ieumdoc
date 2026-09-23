import { writeMd } from "myst-to-md";
import { VFile } from "vfile";
import { cloneDocument, type Document } from "../document.ts";
import { semanticDifference, semanticFingerprint } from "./fingerprint.ts";
import { parse } from "./parse.ts";
import { prepareReferences } from "./reference.ts";

const LOSS = "Document contains semantic content that cannot be preserved in canonical Markdown";

/** Canonical serialization would lose semantics; `detail` names the node and reason. */
export class SemanticLossError extends Error {
  constructor(readonly detail: string, options?: ErrorOptions) {
    super(`${LOSS}: ${detail}`, options);
  }
}

/** Serialize for an operation's own round-trip check, reporting a loss as that operation's failure. */
export function serializeFor(document: Document, failure: string): string {
  try {
    return serialize(document);
  } catch (error) {
    if (error instanceof SemanticLossError) throw new Error(`${failure} (${error.detail})`, { cause: error });
    throw error;
  }
}

/**
 * Canonical write path. Never returns Markdown that loses document semantics:
 * 1. myst-to-md diagnostics mean output it could not render;
 * 2. the reparsed Markdown must keep the original semantic fingerprint.
 */
export function serialize(document: Document): string {
  const expected = semanticFingerprint(document);
  const tree = cloneDocument(document);
  prepareReferences(tree);
  const file = new VFile();
  try {
    writeMd(file, tree as never);
  } catch (error) {
    assertNoSerializationDiagnostics(file);
    throw new SemanticLossError("serializer failed", { cause: error });
  }
  assertNoSerializationDiagnostics(file);
  const markdown = `${String(file.result ?? "").trimEnd()}\n`;
  const difference = semanticDifference(expected, semanticFingerprint(parse(markdown)));
  if (difference) throw new SemanticLossError(difference);
  return markdown;
}

/**
 * myst-to-md reports nodes it cannot render (rule `md-renders`) on the VFile,
 * writes an empty string for them and continues. In myst-to-md 1.0.17 every
 * message it emits means lost output, and supported documents emit none, so any
 * message rejects the write. Revisit this policy if a version adds harmless ones.
 */
function assertNoSerializationDiagnostics(file: VFile): void {
  if (file.messages.length === 0) return;
  const reasons = [...new Set(file.messages.map((message) => message.reason))];
  throw new SemanticLossError(reasons.join("; "));
}
