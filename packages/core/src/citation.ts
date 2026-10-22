import type { BibliographyEvaluation } from "./bibliography.ts";
import type { InlineContent } from "./inline.ts";

/** Explicit citation roles. A single cite:t stays a group; multi-key cite canonicalizes to cite:t. */
export type CitationRole = "cite" | "cite:t" | "cite:p";
export type CitationContent = { kind: "citation"; role: CitationRole; keys: string[] };

/** Bibliography keys are exact strings, independent of target labels and endnote identifiers. */
export function citationContentError(value: CitationContent): string | undefined {
  if (!["cite", "cite:t", "cite:p"].includes(value.role)) return "citation role must be cite, cite:t or cite:p";
  if (!Array.isArray(value.keys) || value.keys.length === 0 || value.keys.some(key =>
    typeof key !== "string" || !key || /[\s\u0000-\u001f\u007f,;{}\[\]`\\]/u.test(key))) {
    return "citation keys must be non-empty strings without whitespace, control characters or role delimiters";
  }
  if (Object.keys(value).some(key => !["kind", "role", "keys"].includes(key))) return "unsupported citation attribute";
  return undefined;
}

export function canonicalCitation(content: CitationContent): CitationContent {
  const error = citationContentError(content);
  if (error) throw new Error(error);
  return { kind: "citation", role: content.role === "cite" && content.keys.length > 1 ? "cite:t" : content.role, keys: [...content.keys] };
}

/** Display only, in stored group order; never sort or compress ranges. */
export function citationText(keys: readonly string[], numbers: ReadonlyMap<string, number>): string {
  return keys.map(key => `[${numbers.get(key) ?? key}]`).join(", ");
}

/** Keys within typed inline content, including marks, in their stored order. */
export function citationKeys(content: readonly InlineContent[]): string[] {
  return content.flatMap(item => item.kind === "citation" ? item.keys : "children" in item ? citationKeys(item.children) : []);
}

export type CitationReport = {
  bibliography: string[];
  citations: { path: number[]; role: CitationRole; keys: string[]; numbers: number[]; text: string }[];
  readiness: { status: "not-evaluated"; complete: null; diagnostics: [] } | BibliographyEvaluation["readiness"];
  references?: BibliographyEvaluation["references"];
};
