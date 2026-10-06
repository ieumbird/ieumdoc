import type { GenericNode, GenericParent } from "myst-common";
import type { NodePath } from "../document.ts";

export { toText } from "myst-common";

/**
 * The MyST AST that currently represents a Document inside Core. Internal only:
 * the package root exposes it as the opaque `Document` (see `index.ts`).
 */
export type MystDocument = GenericParent;

export type MystNode = GenericNode;

// Source provenance for read-only projections, never a serialization input. Keep it
// outside the semantic tree, and carry it through Core's immutable operations. Node
// positions address `text`: the opening source, then block sources applied since, whose
// lines come after the opening `lines` and are no line of the opened file.
type Provenance = { text: string; lines: number };
const sources = new WeakMap<MystDocument, Provenance>();
export function rememberSource(document: MystDocument, source: string): void {
  sources.set(document, { text: source, lines: lineCount(source) });
}

/** The source a node was parsed from, and its line in the opened file when it has one. */
export function sourceExcerpt(document: MystDocument, node: MystNode): { text: string; line?: number } | undefined {
  const provenance = sources.get(document);
  const line = node.position?.start.line;
  const end = node.position?.end.line;
  if (provenance === undefined || line === undefined || end === undefined) return undefined;
  const text = provenance.text.split(/\r?\n/).slice(line - 1, end).join("\n");
  return line <= provenance.lines ? { text, line } : { text };
}

/** Make the nodes of a separately parsed fragment address its source within `document`'s provenance. */
export function appendSource(document: MystDocument, fragment: MystDocument): void {
  const provenance = sources.get(document) ?? { text: "", lines: 0 };
  const lines = lineCount(provenance.text);
  const offset = provenance.text.length + 1;
  const shift = (node: MystNode) => {
    for (const point of [node.position?.start, node.position?.end]) {
      if (!point) continue;
      point.line += lines;
      if (point.offset !== undefined) point.offset += offset;
    }
    node.children?.forEach(shift);
  };
  fragment.children.forEach(shift);
  sources.set(document, { text: `${provenance.text}\n${sources.get(fragment)?.text ?? ""}`, lines: provenance.lines });
}

function lineCount(text: string): number {
  return text.split(/\r?\n/).length;
}

export function cloneDocument(document: MystDocument): MystDocument {
  const clone = structuredClone(document);
  const provenance = sources.get(document);
  if (provenance !== undefined) sources.set(clone, provenance);
  return clone;
}

export function getNode(document: MystDocument, path: NodePath): MystNode {
  let current: MystNode = document;
  for (const index of path) {
    const children = current.children;
    if (!Array.isArray(children) || !Number.isInteger(index) || index < 0 || index >= children.length) {
      throw new Error(`NodePath out of range: [${path.join(",")}]`);
    }
    current = children[index];
  }
  return current;
}
