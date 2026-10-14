import type { GenericNode, GenericParent } from "myst-common";
import type { NodePath } from "../document.ts";

export { toText } from "myst-common";

/**
 * The MyST AST that currently represents a Document inside Core. Internal only:
 * the package root exposes it as the opaque `Document` (see `index.ts`).
 */
export type MystDocument = GenericParent;

export type MystNode = GenericNode;

export function cloneDocument(document: MystDocument): MystDocument {
  return structuredClone(document);
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
