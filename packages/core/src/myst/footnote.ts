import { createTokenizer } from "myst-parser";
import { inlineContentToNodes, projectInlineContent, type InlineContent } from "../inline.ts";
import { endnoteOrder, type EndnoteBlock } from "../numbering.ts";
import { labelIdentifier } from "./label.ts";
import { cloneDocument, type MystDocument, type MystNode } from "./tree.ts";

/**
 * Footnotes at the MyST boundary. The syntax and node names are MyST's (`[^label]`,
 * `footnoteReference`, `footnoteDefinition`); IeumDoc presents them as endnotes: definitions
 * belong to the document, not to the block or section they are written after, and canonical
 * Markdown writes them after the body in endnote order.
 *
 * markdown-it-footnote reads every `[^label]: ...` definition first, keeps the last definition
 * of each label that the text references, and moves the kept ones to the end of the tree. It
 * gives them no source position, so myst-parser copies a neighbouring block's. A reference to
 * an undefined label is plain text.
 */

/** Root field: why the parse dropped a written definition. Its parenthesized name is not a
 * MyST field. Canonical write refuses a document that has it: the definition would be lost. */
export const DROPPED_FOOTNOTE_FIELD = "(dropped footnote)";

const REPEATED = (label: string) => `footnote [^${label}] is defined more than once`;
const UNREFERENCED = (label: string) => `footnote [^${label}] has no reference, and MyST drops an unreferenced definition`;

type SourceDefinition = { label: string; start: number; end: number };

const tokenizers = new WeakMap<object, ReturnType<typeof createTokenizer>>();

/** Footnote definitions as written, in source order, with their 1-based lines. `options` are the parse's. */
export function sourceDefinitions(text: string, options: object): SourceDefinition[] {
  if (!text.includes("[^")) return [];
  // Keep definitions in place: the tail rule is what moves, drops and unpositions them.
  let tokenizer = tokenizers.get(options);
  if (!tokenizer) tokenizers.set(options, tokenizer = createTokenizer(options));
  // MyST's nested directive/role parsing re-enables this rule; reset it on every reuse.
  tokenizer.disable("footnote_tail");
  const lines = text.split(/\r?\n/);
  const definitions: SourceDefinition[] = [];
  let depth = 0;
  let cursor = 0;
  let current: SourceDefinition | undefined;
  for (const token of tokenizer.parse(text, {})) {
    if (token.type === "footnote_reference_open" && depth++ === 0) {
      const label = String(token.meta?.label ?? "");
      let line = cursor;
      while (line < lines.length && !lines[line].includes(`[^${label}]:`)) line++;
      current = { label, start: line + 1, end: line + 1 };
    } else if (token.type === "footnote_reference_close" && --depth === 0 && current) {
      definitions.push(current);
      current = undefined;
    }
    if (!token.map) continue;
    // The definition line is at or after the start of the last opened block, or the end of the last leaf.
    cursor = token.nesting === 1 ? token.map[0] : token.map[1];
    if (current) current.end = Math.max(current.end, token.map[1]);
  }
  return definitions;
}

/**
 * Give each kept definition its own source lines, record a definition the parse dropped, and
 * place the definitions after the body in endnote order (`endnotePlacement`). A parsed
 * document therefore has the order canonical write gives it, whatever the source placement:
 * the read model, the Editor and section operations see one order.
 */
export function locateFootnotes(document: MystDocument, text: string, options: object): void {
  const written = sourceDefinitions(text, options);
  // The last definition of a label is the one kept.
  const last = new Map(written.map(definition => [definition.label, definition]));
  const kept = new Set<string>();
  for (const node of document.children) {
    if (node.type !== "footnoteDefinition") continue;
    const source = last.get(String(node.label));
    kept.add(String(node.label));
    if (source) node.position = { start: { line: source.start, column: 1 }, end: { line: source.end, column: 1 } };
    else delete node.position;
  }
  // Written order first: definitions no reference ranks keep it.
  const line = (node: MystNode) => node.type === "footnoteDefinition" ? node.position?.start.line ?? Infinity : 0;
  document.children = endnotePlacement({ ...document, children: [...document.children].sort((left, right) => line(left) - line(right)) });
  const repeated = written.find(definition => last.get(definition.label) !== definition);
  const unreferenced = written.find(definition => !kept.has(definition.label));
  if (repeated) document[DROPPED_FOOTNOTE_FIELD] = REPEATED(repeated.label);
  else if (unreferenced) document[DROPPED_FOOTNOTE_FIELD] = UNREFERENCED(unreferenced.label);
}

/** Each top-level block as endnote ordering sees it: the label it defines, and the references it holds. */
export function endnoteBlocks(document: MystDocument): EndnoteBlock[] {
  return document.children.map(node => ({
    ...(node.type === "footnoteDefinition" ? { definition: String(node.label) } : {}),
    references: footnoteReferences(node),
  }));
}

/**
 * The top-level blocks in the order canonical Markdown writes them: the body as it is, then the
 * footnote definitions in endnote order (`endnoteOrder`). The same nodes, in a new array.
 */
export function endnotePlacement(document: MystDocument): MystNode[] {
  if (!document.children.some(node => node.type === "footnoteDefinition")) return document.children;
  return endnoteOrder(endnoteBlocks(document)).map(index => document.children[index]);
}

/**
 * Where the body block at `index` is once canonical write has placed the endnotes after the body:
 * body blocks keep their order, so it is the number of body blocks before it. An operation's
 * round-trip check finds the block it wrote at this index of the reloaded document.
 */
export function bodyIndex(document: MystDocument, index: number): number {
  return document.children.slice(0, index).filter(node => node.type !== "footnoteDefinition").length;
}

/**
 * Whether a parsed snapshot's definitions are written where canonical Markdown puts them: after
 * every body block, in endnote order. It reads the source lines `parse` gave them, so it
 * describes the opened source; when false, the first canonical write moves definitions.
 */
export function endnotesInPlace(document: MystDocument): boolean {
  let line = 0;
  for (const node of document.children) {
    if (node.type !== "footnoteDefinition") {
      line = Math.max(line, node.position?.end.line ?? 0);
      continue;
    }
    const start = node.position?.start.line;
    if (start === undefined || start <= line) return false;
    line = node.position!.end.line;
  }
  return true;
}

/**
 * Why canonical Markdown cannot keep this document's footnotes, or undefined. Each definition
 * must be referenced and each reference defined, once per label, or the reload would drop or
 * reread them.
 */
export function footnoteWriteError(document: MystDocument): string | undefined {
  return footnoteWriteIssue(document)?.reason;
}

export function footnoteWriteIssue(document: MystDocument): { reason: string; action: string; path?: number[] } | undefined {
  const action = "Check the footnote reference and definition. Keep one definition per referenced label; add the missing definition or remove an unused reference/definition.";
  if (typeof document[DROPPED_FOOTNOTE_FIELD] === "string") return { reason: document[DROPPED_FOOTNOTE_FIELD], action };
  const defined = new Set<string>();
  for (const [index, node] of document.children.entries()) {
    if (node.type !== "footnoteDefinition") continue;
    const label = String(node.label);
    if (defined.has(label)) return { reason: REPEATED(label), action, path: [index] };
    defined.add(label);
  }
  const referenced = new Set(footnoteReferences(document));
  const missing = [...referenced].find(label => !defined.has(label));
  if (missing !== undefined) return { reason: `footnote reference [^${missing}] has no definition`, action,
    path: [document.children.findIndex(node => footnoteReferences(node).includes(missing))] };
  const unused = [...defined].find(label => !referenced.has(label));
  if (unused !== undefined) return { reason: UNREFERENCED(unused), action,
    path: [document.children.findIndex(node => node.type === "footnoteDefinition" && String(node.label) === unused)] };
  return undefined;
}

/** Footnote reference labels in `node`, in document order. */
export function footnoteReferences(node: MystNode): string[] {
  const labels: string[] = [];
  const visit = (child: MystNode) => {
    if (child.type === "footnoteReference") labels.push(String(child.label));
    child.children?.forEach(visit);
  };
  visit(node);
  return labels;
}

const DEFINITION_FIELDS = new Set(["type", "identifier", "label", "children", "position"]);
const PARAGRAPH_FIELDS = new Set(["type", "children", "position"]);

/**
 * Footnotes v2: the content of a definition holding one paragraph of supported inline content
 * without footnote references. Other definitions are read-only and edited as block source.
 */
export function supportedFootnoteContent(node: MystNode): InlineContent[] | undefined {
  if (node.type !== "footnoteDefinition" || typeof node.label !== "string" || node.identifier !== labelIdentifier(node.label) ||
      !Object.keys(node).every(key => DEFINITION_FIELDS.has(key))) return undefined;
  const [paragraph, ...rest] = node.children ?? [];
  if (rest.length > 0 || paragraph?.type !== "paragraph" || !Object.keys(paragraph).every(key => PARAGRAPH_FIELDS.has(key))) return undefined;
  const content = projectInlineContent(paragraph);
  return content && footnoteReferences(paragraph).length === 0 ? content : undefined;
}

export function createFootnoteDefinition(label: string, content: InlineContent[]): MystNode {
  return { type: "footnoteDefinition", identifier: labelIdentifier(label), label,
    children: [{ type: "paragraph", children: inlineContentToNodes(content) }] };
}

/** Labels of the document's footnote definitions and references. */
export function footnoteLabels(document: MystDocument): string[] {
  return [...footnoteDefinitions(document), ...footnoteReferences(document)];
}

function footnoteDefinitions(document: MystDocument): string[] {
  return document.children.filter(node => node.type === "footnoteDefinition").map(node => String(node.label));
}

/**
 * For an operation's own round-trip check, which covers its blocks rather than the document's
 * footnotes: a copy in which each definition is referenced (from itself) and each reference
 * defined (by a definition after the blocks), so the blocks reload as they are. Whether the
 * document's footnotes are complete is checked when it is written (`footnoteWriteError`).
 */
export function completeFootnotes(document: MystDocument): MystDocument {
  const defined = new Set(footnoteDefinitions(document));
  const referenced = new Set(footnoteReferences(document));
  if ([...defined].every(label => referenced.has(label)) && [...referenced].every(label => defined.has(label))) return document;
  const tree = cloneDocument(document);
  const reference = (label: string): MystNode => ({ type: "footnoteReference", identifier: labelIdentifier(label), label });
  for (const node of tree.children) {
    if (node.type !== "footnoteDefinition" || referenced.has(String(node.label))) continue;
    const last = node.children?.at(-1);
    if (last?.type === "paragraph") last.children = [...(last.children ?? []), reference(String(node.label))];
    else node.children = [...(node.children ?? []), { type: "paragraph", children: [reference(String(node.label))] }];
  }
  for (const label of referenced) {
    if (defined.has(label)) continue;
    tree.children.push({ type: "footnoteDefinition", identifier: labelIdentifier(label), label,
      children: [{ type: "paragraph", children: [{ type: "text", value: "x" }] }] });
  }
  return tree;
}
