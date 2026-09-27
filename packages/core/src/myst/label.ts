import { isTargetIdentifierNode, normalizeLabel } from "myst-common";
import type { MystNode } from "./tree.ts";

/** The identifier MyST resolves references against, or undefined when the label names nothing. */
export function labelIdentifier(label: string): string | undefined {
  return normalizeLabel(label)?.identifier || undefined;
}

/**
 * Identifiers of the reference targets in a document, as MyST's target enumeration
 * sees them, except `except`. `(label)=` targets are not yet attached to their block
 * after parsing, so their label is normalized here the same way.
 */
export function targetIdentifiers(root: MystNode, except: MystNode): Set<string> {
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
