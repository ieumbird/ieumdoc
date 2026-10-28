import type { GenericNode, GenericParent } from "myst-common";
import type { NodePath } from "../document.ts";
import { DocumentDiagnosticError, DocumentWriteError } from "../write-error.ts";
import { FRONT_MATTER_FIELD } from "./parse.ts";

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

/** Body locators cannot address or precede metadata. Internal fragments have no metadata. */
export function assertBodyIndex(document: MystDocument, index: number): void {
  if (index === 0 && document.children[0]?.[FRONT_MATTER_FIELD] === true) {
    throw new DocumentWriteError("block 0 is the document metadata; body blocks start at 1", { code: "invalid-operation",
      path: [0], action: "Use a body block index or path starting at 1; run inspect again for the current snapshot.",
    });
  }
}

export function getNode(document: MystDocument, path: NodePath): MystNode {
  assertBodyIndex(document, path[0]);
  let current: MystNode = document;
  for (const index of path) {
    const children = current.children;
    if (!Array.isArray(children) || !Number.isInteger(index) || index < 0 || index >= children.length) {
      throw new DocumentDiagnosticError("invalid-operation", `NodePath out of range: [${path.join(",")}]`);
    }
    current = children[index];
  }
  return current;
}
