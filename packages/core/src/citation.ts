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
  entries?: BibliographyEvaluation["entries"];
};

/** Pure declaration-shape validation. No filesystem or Host access policy belongs here. */
export function bibliographyError(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) return "bibliography must be a non-empty list of relative .bib paths";
  const seen = new Set<string>();
  for (const source of value) {
    if (typeof source !== "string" || source !== source.trim() || !source.endsWith(".bib") ||
      source.startsWith("/") || source.startsWith("~") || /[\\:\u0000-\u001f\u007f*?\[\]{}!]/u.test(source) ||
      /[+@]\(/u.test(source) ||
      source.split("/").some(part => !part)) {
      return "bibliography paths must be relative .bib files using /; URLs, absolute/drive/UNC paths and globs are not supported";
    }
    const parts: string[] = [];
    for (const part of source.split("/")) {
      if (part === ".") continue;
      if (part === ".." && parts.length && parts.at(-1) !== "..") parts.pop();
      else parts.push(part);
    }
    const key = parts.join("/");
    if (seen.has(key)) return `duplicate bibliography declaration: ${source}`;
    seen.add(key);
  }
  return undefined;
}
