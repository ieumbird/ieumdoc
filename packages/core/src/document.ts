import type { MystDocument } from "./myst/tree.ts";

declare const opaqueDocument: unique symbol;

/**
 * A parsed IeumDoc document. Opaque to consumers: read it through Core
 * projections (`getEditableDocument`, `inspectDocument`) and change it through
 * Core operations. Its internal representation is not part of the public contract.
 */
export type Document = { readonly [opaqueDocument]: true };

/** Positional locator valid only for the current parsed document snapshot. */
export type NodePath = readonly number[];

export type BlockSummary = {
  index: number;
  type: string;
  kind?: string;
};

export function inspectDocument(document: MystDocument): BlockSummary[] {
  return document.children.map((node, index) => {
    const summary: BlockSummary = { index, type: node.type };
    if (typeof node.kind === "string" && node.kind.length > 0) {
      summary.kind = node.kind;
    }
    return summary;
  });
}
