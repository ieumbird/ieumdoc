import { DocumentDiagnosticError } from "../write-error.ts";
import { evaluateBibliography, type BibliographySource } from "../bibliography.ts";
import { isScalar, isSeq, parseDocument } from "yaml";
import { bibliographyError, canonicalCitation, citationContentError, citationText, type CitationContent, type CitationReport } from "../citation.ts";
import { endnoteOrder, firstReferenceNumbers } from "../numbering.ts";
import { endnoteBlocks } from "./footnote.ts";
import { labelIdentifier } from "./label.ts";
import { FRONT_MATTER_FIELD } from "./parse.ts";
import { metadata } from "./metadata.ts";
import { serializeFor } from "./serialize.ts";
import { cloneDocument, type MystDocument, type MystNode } from "./tree.ts";

const CITE_FIELDS = new Set(["type", "kind", "label", "identifier", "position"]);
const GROUP_FIELDS = new Set(["type", "kind", "children", "position"]);

/** Strict projection: upstream prefix/suffix/partial and unknown attributes have no native meaning. */
export function projectCitation(node: MystNode): CitationContent | undefined {
  const group = node.type === "citeGroup";
  if (!group && node.type !== "cite") return undefined;
  if (node.kind !== "narrative" && node.kind !== "parenthetical") return undefined;
  if (!group && node.kind !== "narrative") return undefined;
  if (group && (!Object.keys(node).every(key => GROUP_FIELDS.has(key)) || !node.children?.length)) return undefined;
  const children = group ? node.children! : [node];
  if (children.some(child => child.type !== "cite" || child.kind !== node.kind || typeof child.label !== "string" ||
    child.identifier !== labelIdentifier(child.label) || !Object.keys(child).every(key => CITE_FIELDS.has(key)))) return undefined;
  const content: CitationContent = { kind: "citation", role: group ? node.kind === "narrative" ? "cite:t" : "cite:p" : "cite",
    keys: children.map(child => String(child.label)) };
  return citationContentError(content) ? undefined : content;
}

export function citationToNode(input: CitationContent): MystNode {
  const content = canonicalCitation(input);
  const kind = content.role === "cite:p" ? "parenthetical" : "narrative";
  const children = content.keys.map(label => ({ type: "cite", kind, label, identifier: labelIdentifier(label) }));
  return content.role === "cite" ? children[0] : { type: "citeGroup", kind, children };
}

export function declaredBibliography(document: MystDocument): string[] {
  const node = document.children[0];
  if (node?.[FRONT_MATTER_FIELD] !== true) return [];
  const yaml = parseDocument(String(node.value ?? ""));
  if (!yaml.has("bibliography")) return [];
  const value = yaml.get("bibliography", true);
  // No alias or scalar coercion: the declaration itself must be a string sequence.
  const paths = isSeq(value) ? value.items.map(item => isScalar(item) ? item.value : undefined) : undefined;
  const error = bibliographyError(paths);
  if (error) throw new DocumentDiagnosticError("unsupported-content", error);
  return paths as string[];
}

/** An empty list removes the optional declaration. Comments and unrelated metadata are retained. */
export function updateBibliography(document: MystDocument, paths: string[]): MystDocument {
  if (!Array.isArray(paths) || paths.length) {
    const error = bibliographyError(paths);
    if (error) throw new DocumentDiagnosticError("unsupported-content", error);
  }
  const next = cloneDocument(document);
  const { node, yaml } = metadata(next);
  if (paths.length) yaml.set("bibliography", yaml.createNode(paths));
  else yaml.delete("bibliography");
  node.value = String(yaml);
  serializeFor(next, "bibliography declaration cannot be preserved through canonical round-trip");
  return next;
}

/** Canonical reading order, also before an operation's result has been serialized. Groups are visited once. */
export function citationReport(document: MystDocument, sources?: readonly BibliographySource[]): CitationReport {
  const occurrences: { path: number[]; content: CitationContent }[] = [];
  const visit = (node: MystNode, path: number[]): void => {
    const content = projectCitation(node);
    if (content) occurrences.push({ path, content });
    else node.children?.forEach(child => visit(child, path));
  };
  endnoteOrder(endnoteBlocks(document)).forEach(index => visit(document.children[index], [index]));
  const numbers = firstReferenceNumbers(occurrences.flatMap(({ content }) => content.keys));
  const report: CitationReport = {
    bibliography: declaredBibliography(document),
    citations: occurrences.map(({ path, content }) => ({ path, role: content.role, keys: content.keys,
      numbers: content.keys.map(key => numbers.get(key)!), text: citationText(content.keys, numbers) })),
    readiness: { status: "not-evaluated", complete: null, diagnostics: [] },
  };
  return sources === undefined ? report : { ...report, ...evaluateBibliography(report, sources) };
}
