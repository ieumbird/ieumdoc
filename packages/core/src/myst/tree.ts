import type { GenericNode, GenericParent } from "myst-common";
import type { NodePath } from "../document.ts";

export { toText } from "myst-common";

/**
 * The MyST AST that currently represents a Document inside Core. Internal only:
 * the package root exposes it as the opaque `Document` (see `index.ts`).
 */
export type MystDocument = GenericParent;

export type MystNode = GenericNode;

// Opening-source provenance for read-only projections, never a serialization input.
// Keep it outside the semantic tree, and carry it through Core's immutable operations.
const sources = new WeakMap<MystDocument, string>();
export function rememberSource(document: MystDocument, source: string): void {
  sources.set(document, source);
}

export function sourceExcerpt(document: MystDocument, node: MystNode): { text: string; line: number } | undefined {
  const source = sources.get(document);
  const line = node.position?.start.line;
  const end = node.position?.end.line;
  if (source === undefined || line === undefined || end === undefined) return undefined;
  return { text: source.split(/\r?\n/).slice(line - 1, end).join("\n"), line };
}

export function cloneDocument(document: MystDocument): MystDocument {
  const clone = structuredClone(document);
  const source = sources.get(document);
  if (source !== undefined) rememberSource(clone, source);
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
