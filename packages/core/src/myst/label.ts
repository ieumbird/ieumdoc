import { isTargetIdentifierNode, normalizeLabel } from "myst-common";
import { basicTransformations, enumerateTargetsTransform, ReferenceState } from "myst-transforms";
import { VFile } from "vfile";
import { cloneDocument, type MystDocument, type MystNode } from "./tree.ts";

/** The identifier MyST resolves references against, or undefined when the label names nothing. */
export function labelIdentifier(label: string): string | undefined {
  return normalizeLabel(label)?.identifier || undefined;
}

/**
 * Identifiers of the reference targets in a document, as MyST's target enumeration
 * sees them, except `except` when given. `(label)=` targets are not yet attached to their block
 * after parsing, so their label is normalized here the same way.
 */
export function targetIdentifiers(root: MystNode, except?: MystNode): Set<string> {
  const identifiers = new Set<string>();
  const visit = (node: MystNode) => {
    if (node !== except) {
      const identifier = node.type === "mystTarget"
        ? typeof node.label === "string" ? labelIdentifier(node.label) : undefined
        : isTargetIdentifierNode(node) && typeof node.identifier === "string" ? node.identifier : undefined;
      if (identifier) identifiers.add(identifier);
    }
    node.children?.forEach(visit);
  };
  visit(root);
  return identifiers;
}

/**
 * Whether an identifier names a target as MyST's own reference resolution finds it on one page:
 * labeled blocks, `(label)=` targets and the implicit IDs of unlabeled headings. MyST's
 * transforms run on a clone, so the document is unchanged.
 */
export function referenceTargets(document: MystDocument): (identifier: string) => boolean {
  const tree = cloneDocument(document);
  const file = new VFile();
  basicTransformations(tree as never, file);
  const state = new ReferenceState("document.md", { vfile: file });
  enumerateTargetsTransform(tree as never, { state });
  return (identifier) => state.getTarget(identifier) !== undefined;
}
