import type { GenericNode, GenericParent } from "myst-common";

/** MyST AST root used as IeumDoc's document representation. */
export type Document = GenericParent;

export type DocumentNode = GenericNode;

/** Positional locator valid only for the current parsed document snapshot. */
export type NodePath = readonly number[];

export type BlockSummary = {
  index: number;
  type: string;
  kind?: string;
};

export function cloneDocument(document: Document): Document {
  return structuredClone(document);
}

export function inspectDocument(document: Document): BlockSummary[] {
  return document.children.map((node, index) => {
    const summary: BlockSummary = { index, type: node.type };
    if (typeof node.kind === "string" && node.kind.length > 0) {
      summary.kind = node.kind;
    }
    return summary;
  });
}

export function getNode(document: Document, path: NodePath): DocumentNode {
  let current: DocumentNode = document;
  for (const index of path) {
    const children = current.children;
    if (!Array.isArray(children) || !Number.isInteger(index) || index < 0 || index >= children.length) {
      throw new Error(`NodePath out of range: [${path.join(",")}]`);
    }
    current = children[index];
  }
  return current;
}
