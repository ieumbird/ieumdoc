import type { NodePath } from "./document.ts";
import { labelIdentifier, targetIdentifiers } from "./myst/label.ts";
import type { MystDocument, MystNode } from "./myst/tree.ts";

/** A cross-reference whose label names no reference target in this document. */
export type UnresolvedReference = {
  /** The reference role as written, such as `eq`, `numref` or `ref`. */
  role: string;
  /** The label as written. */
  label: string;
  /** The top-level block that contains the reference. */
  path: NodePath;
  /** 1-based source line where the innermost element holding the reference (a paragraph,
   * table row, list item, ...) starts, when the document was parsed from Markdown. */
  line?: number;
};

/**
 * Cross-references that name no target in this document, in document order, including
 * those in read-only content. Labels and targets are compared as MyST resolves them, by
 * identifier and whatever block the target is. An unresolved reference is still valid
 * Markdown and is kept as written, so this is a report, never a write rule. Core sees
 * one document: a reference to another page of a MyST project is reported too.
 */
export function unresolvedReferences(document: MystDocument): UnresolvedReference[] {
  const targets = targetIdentifiers(document);
  const unresolved: UnresolvedReference[] = [];
  // MyST drops the position of a role's reference node, so the line comes from its container.
  const visit = (node: MystNode, path: NodePath, line: number | undefined) => {
    line = node.position?.start.line ?? line;
    if (node.type === "crossReference" && typeof node.label === "string") {
      const identifier = typeof node.identifier === "string" ? node.identifier : labelIdentifier(node.label);
      if (!identifier || !targets.has(identifier)) {
        unresolved.push({
          role: typeof node.kind === "string" ? node.kind : "ref",
          label: node.label,
          path,
          ...(typeof line === "number" ? { line } : {}),
        });
      }
    }
    node.children?.forEach((child) => visit(child, path, line));
  };
  document.children.forEach((block, index) => visit(block, [index], undefined));
  return unresolved;
}
