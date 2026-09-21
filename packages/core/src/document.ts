import type { GenericNode, GenericParent } from "myst-common";

/** MyST AST root used as IeumDoc's document representation. */
export type Document = GenericParent;

export type DocumentNode = GenericNode;

export function cloneDocument(document: Document): Document {
  return structuredClone(document);
}
