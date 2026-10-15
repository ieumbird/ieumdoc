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
 * MyST's one-page reference targets: labeled blocks, `(label)=` targets and implicit
 * heading IDs. Lookup uses MyST's resolver; candidates retain duplicates for fail-closed
 * edits, and paths locate resolved nodes in the original snapshot. Transforms run on a clone.
 */
export function referenceTargetIndex(document: MystDocument) {
  const tree = cloneDocument(document);
  // Keep snapshot locators outside the tree: transforms must not see invented attributes.
  const paths = new Map<MystNode, number[]>();
  const remember = (node: MystNode, path: number[]) => {
    paths.set(node, path);
    node.children?.forEach((child, index) => remember(child, [...path, index]));
  };
  remember(tree, []);
  const file = new VFile();
  basicTransformations(tree as never, file);
  const state = new ReferenceState("document.md", { vfile: file });
  enumerateTargetsTransform(tree as never, { state });
  // MyST chooses the first duplicate. Writes must also see the discarded candidates.
  const candidates = new Map<string, MystNode[]>();
  const visit = (node: MystNode) => {
    if (isTargetIdentifierNode(node) && typeof node.identifier === "string" && node.identifier) {
      const nodes = candidates.get(node.identifier) ?? [];
      nodes.push(node);
      candidates.set(node.identifier, nodes);
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  return {
    // MyST's plain-object lookup can return inherited values such as `constructor`.
    // Only own entries are targets it actually registered; keep its duplicate selection.
    lookup: (identifier: string) => Object.hasOwn(state.targets, identifier) ? state.getTarget(identifier) : undefined,
    candidates: (identifier: string) => candidates.get(identifier) ?? [],
    path: (node: MystNode) => paths.get(node),
  };
}

/** Shared role/link lookup order, including MyST's raw-then-normalized fragment lookup. */
export function resolveReference<T>(node: MystNode, lookup: (identifier: string) => T | undefined): T | undefined {
  if (node.type === "crossReference" && typeof node.label === "string") {
    const identifier = typeof node.identifier === "string" ? node.identifier : labelIdentifier(node.label);
    return identifier ? lookup(identifier) : undefined;
  }
  if (node.type === "link" && typeof node.url === "string" && node.url.startsWith("#")) {
    const label = node.url.slice(1);
    const identifier = labelIdentifier(label);
    return identifier ? lookup(label) ?? lookup(identifier) : undefined;
  }
  return undefined;
}
