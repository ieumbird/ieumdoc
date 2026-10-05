import { enumerateTargetsTransform, ReferenceState } from "myst-transforms";
import { VFile } from "vfile";
import type { NumberedKind, NumberedTargets } from "../numbering.ts";
import { cloneDocument, type MystDocument, type MystNode } from "./tree.ts";

/**
 * The numbered targets each top-level block holds, as MyST's own enumeration numbers them
 * with its default numbering (front matter numbering settings are not read). It runs on a clone,
 * so top-level blocks keep their positions.
 */
export function numberedTargets(document: MystDocument): NumberedTargets[] {
  const tree = cloneDocument(document);
  const file = new VFile();
  enumerateTargetsTransform(tree as never, { state: new ReferenceState("document.md", { vfile: file }) });
  return (tree.children ?? []).map((block) => {
    const targets: NumberedTargets = {};
    const visit = (node: MystNode) => {
      const kind = numberedKind(node);
      if (kind) targets[kind] = (targets[kind] ?? 0) + 1;
      node.children?.forEach(visit);
    };
    visit(block);
    return targets;
  });
}

function numberedKind(node: MystNode): NumberedKind | undefined {
  if (node.enumerator === undefined) return undefined;
  if (node.type === "math") return "equation";
  if (node.type === "container" && node.kind === "figure") return "figure";
  if (node.type === "container" && node.kind === "table") return "table";
  return undefined;
}
