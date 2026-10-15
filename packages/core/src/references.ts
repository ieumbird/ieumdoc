import type { NodePath } from "./document.ts";
import { referenceTargetIndex, resolveReference } from "./myst/label.ts";
import { literalSyntaxDiagnostics, type LiteralSyntax } from "./myst/literal-syntax.ts";
import type { MystDocument, MystNode } from "./myst/tree.ts";

/** Unresolved semantic references and source syntax that MyST read as literal text. */
export type UnresolvedReference = ((
  | {
    /** The reference role as written, such as `eq`, `numref` or `ref`. */
    role: string;
  }
  | {
    /** A link reference such as `[](#label)`: its URL as written. */
    link: string;
  }
) & {
  /** The label as written; for a link, its URL after `#`. */
  label: string;
  /** Why MyST cannot process this reference, rather than merely finding no target. */
  reason?: string;
} | LiteralSyntax) & {
  /** The top-level block that contains the reference. */
  path: NodePath;
  /** 1-based source line where the innermost element holding the reference (a paragraph,
   * table row, list item, ...) starts, when the document was parsed from Markdown. */
  line?: number;
};

/**
 * References that name no target or fail MyST lookup, by block and source line, including
 * those in read-only content. Both role references ({eq}, {numref}, {ref}) and links whose URL
 * starts with `#` count, as MyST resolves them: by identifier, against labeled blocks, `(label)=`
 * targets and the implicit IDs of unlabeled headings. Other links are never references.
 * These are reports, never write rules; links and role references stay as written.
 * Core sees one document: a reference to another page of a
 * MyST project is reported too.
 * Unescaped literal syntax is reported from parsed source evidence;
 * operation-created text is literal and has no source syntax to diagnose.
 */
export function unresolvedReferences(document: MystDocument): UnresolvedReference[] {
  const { lookup } = referenceTargetIndex(document);
  const unresolved: UnresolvedReference[] = [];
  // MyST drops the position of a role's reference node, so the line comes from its container.
  const visit = (node: MystNode, path: NodePath, line: number | undefined) => {
    line = node.position?.start.line ?? line;
    const at = { path, ...(typeof line === "number" ? { line } : {}) };
    const resolved = resolveReference(node, lookup);
    const failure = resolved?.reason ? { reason: resolved.reason } : {};
    if (node.type === "crossReference" && typeof node.label === "string") {
      if (!resolved?.target) {
        unresolved.push({ role: typeof node.kind === "string" ? node.kind : "ref", label: node.label, ...failure, ...at });
      }
    }
    if (node.type === "link" && typeof node.url === "string" && node.url.startsWith("#")) {
      const label = node.url.slice(1);
      if (!resolved?.target) unresolved.push({ link: node.url, label, ...failure, ...at });
    }
    node.children?.forEach((child) => visit(child, path, line));
  };
  document.children.forEach((block, index) => visit(block, [index], undefined));
  // Source-only literal warnings use the same block/line location contract.
  return [...unresolved, ...literalSyntaxDiagnostics(document)].sort((left, right) =>
    left.path[0] - right.path[0] || (left.line ?? 0) - (right.line ?? 0));
}
