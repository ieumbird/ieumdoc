import type { NodePath } from "./document.ts";
import { labelIdentifier, referenceTargets } from "./myst/label.ts";
import { unresolvedFootnotes } from "./myst/footnote.ts";
import type { MystDocument, MystNode } from "./myst/tree.ts";

/** A reference whose label names no target or footnote definition in this document. */
export type UnresolvedReference = (
  | {
    /** The reference role as written, such as `eq`, `numref` or `ref`. */
    role: string;
  }
  | {
    /** A link reference such as `[](#label)`: its URL as written. */
    link: string;
  }
  | {
    /** Unescaped `[^label]` source text with no matching footnote definition. */
    footnote: true;
  }
) & {
  /** The label as written; for a link, its URL after `#`. */
  label: string;
  /** The top-level block that contains the reference. */
  path: NodePath;
  /** 1-based source line where the innermost element holding the reference (a paragraph,
   * table row, list item, ...) starts, when the document was parsed from Markdown. */
  line?: number;
};

/**
 * References that name no target in this document, by block and source line, including
 * those in read-only content. Both role references ({eq}, {numref}, {ref}) and links whose URL
 * starts with `#` count, as MyST resolves them: by identifier, against labeled blocks, `(label)=`
 * targets and the implicit IDs of unlabeled headings. Other links are never references.
 * These are reports, never write rules; links and role references stay as written.
 * Core sees one document: a reference to another page of a
 * MyST project is reported too.
 * Unescaped undefined footnote-shaped text is reported from parsed source evidence;
 * operation-created text is literal and has no source syntax to diagnose.
 */
export function unresolvedReferences(document: MystDocument): UnresolvedReference[] {
  const resolves = referenceTargets(document);
  const unresolved: UnresolvedReference[] = [];
  // MyST drops the position of a role's reference node, so the line comes from its container.
  const visit = (node: MystNode, path: NodePath, line: number | undefined) => {
    line = node.position?.start.line ?? line;
    const at = { path, ...(typeof line === "number" ? { line } : {}) };
    if (node.type === "crossReference" && typeof node.label === "string") {
      const identifier = typeof node.identifier === "string" ? node.identifier : labelIdentifier(node.label);
      if (!identifier || !resolves(identifier)) {
        unresolved.push({ role: typeof node.kind === "string" ? node.kind : "ref", label: node.label, ...at });
      }
    }
    if (node.type === "link" && typeof node.url === "string" && node.url.startsWith("#")) {
      // MyST looks a link's URL up as written, then normalized.
      const label = node.url.slice(1);
      const identifier = labelIdentifier(label);
      if (!identifier || !(resolves(label) || resolves(identifier))) unresolved.push({ link: node.url, label, ...at });
    }
    node.children?.forEach((child) => visit(child, path, line));
  };
  document.children.forEach((block, index) => visit(block, [index], undefined));
  // Source-only footnote warnings use the same block/line location contract.
  return [...unresolved, ...unresolvedFootnotes(document)].sort((left, right) =>
    left.path[0] - right.path[0] || (left.line ?? 0) - (right.line ?? 0));
}
