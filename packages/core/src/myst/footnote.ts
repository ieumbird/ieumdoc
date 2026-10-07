import { createTokenizer } from "myst-parser";
import { labelIdentifier } from "./label.ts";
import { cloneDocument, type MystDocument, type MystNode } from "./tree.ts";

/**
 * Footnotes at the MyST boundary. markdown-it-footnote reads every `[^label]: ...` definition
 * first, keeps the last definition of each label that the text references, and moves the kept
 * ones to the end of the tree. It gives them no source position, so myst-parser copies a
 * neighbouring block's. A reference to an undefined label is plain text.
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
  if (!tokenizer) tokenizers.set(options, tokenizer = createTokenizer(options).disable("footnote_tail"));
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
 * Put each kept definition back where it is written, with its own source lines, and record a
 * definition the parse dropped. Canonical write then keeps definitions where they are, and a
 * document reloads with its blocks in the order they were written.
 */
export function locateFootnotes(document: MystDocument, text: string, options: object): void {
  const written = sourceDefinitions(text, options);
  // The last definition of a label is the one kept.
  const last = new Map(written.map(definition => [definition.label, definition]));
  const kept = new Set<string>();
  const located: MystNode[] = [];
  for (const node of document.children) {
    if (node.type !== "footnoteDefinition") continue;
    const source = last.get(String(node.label));
    kept.add(String(node.label));
    if (!source) {
      delete node.position;
      continue;
    }
    node.position = { start: { line: source.start, column: 1 }, end: { line: source.end, column: 1 } };
    located.push(node);
  }
  const blocks = document.children.filter(node => !located.includes(node));
  for (const definition of located) {
    const at = blocks.findIndex(node => (node.position?.start.line ?? 0) > definition.position!.start.line);
    blocks.splice(at < 0 ? blocks.length : at, 0, definition);
  }
  document.children = blocks;
  const repeated = written.find(definition => last.get(definition.label) !== definition);
  const unreferenced = written.find(definition => !kept.has(definition.label));
  if (repeated) document[DROPPED_FOOTNOTE_FIELD] = REPEATED(repeated.label);
  else if (unreferenced) document[DROPPED_FOOTNOTE_FIELD] = UNREFERENCED(unreferenced.label);
}

/**
 * Why canonical Markdown cannot keep this document's footnotes, or undefined. Each definition
 * must be referenced and each reference defined, once per label, or the reload would drop or
 * reread them.
 */
export function footnoteWriteError(document: MystDocument): string | undefined {
  if (typeof document[DROPPED_FOOTNOTE_FIELD] === "string") return document[DROPPED_FOOTNOTE_FIELD];
  const defined = new Set<string>();
  for (const label of footnoteDefinitions(document)) {
    if (defined.has(label)) return REPEATED(label);
    defined.add(label);
  }
  const referenced = new Set(footnoteReferences(document));
  const missing = [...referenced].find(label => !defined.has(label));
  if (missing !== undefined) return `footnote reference [^${missing}] has no definition`;
  const unused = [...defined].find(label => !referenced.has(label));
  if (unused !== undefined) return UNREFERENCED(unused);
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
