import { writeMd } from "myst-to-md";
import { VFile } from "vfile";
import type { DocumentNode } from "../document.ts";
import { parse } from "./parse.ts";

/**
 * MyST reference roles whose `crossReference` Core writes back as the same role:
 * {eq}`eq-label`, {numref}`Figure %s <fig-label>`, {ref}`Text <sec-label>`.
 *
 * myst-to-md writes every crossReference as a `[](#label)` fragment link, which
 * Core parses back as an ordinary `link`. Core never promotes ordinary links to
 * references, so the role syntax is the canonical form that keeps them distinct.
 * Targets are not resolved here: an unknown target is preserved as written.
 */
const REFERENCE_ROLES = new Set(["eq", "numref", "ref"]);
const REFERENCE_KEYS = new Set(["type", "kind", "identifier", "label", "children", "position"]);
const TARGET_KEYS = new Set(["type", "label", "position"]);

/** Rewrite semantic references in a serializer-owned clone, or fail closed. */
export function prepareReferences(node: DocumentNode): void {
  // Never add a `children` key to leaf nodes: mdast handlers treat its presence as meaningful.
  if (!node.children) return;
  node.children = node.children.map((child) => {
    if (child.type === "crossReference") return referenceRole(child);
    if (child.type === "mystTarget") return targetLine(child);
    prepareReferences(child);
    return child;
  });
}

function referenceRole(node: DocumentNode): DocumentNode {
  const { kind, label, children } = node;
  if (typeof kind !== "string" || !REFERENCE_ROLES.has(kind)) {
    throw new Error(`cross-reference kind ${JSON.stringify(kind)} cannot be preserved through canonical Markdown`);
  }
  const text = children === undefined ? undefined
    : children.length === 1 && children[0].type === "text" && typeof children[0].value === "string"
      ? children[0].value : null;
  if (typeof label !== "string" || text === null || Object.keys(node).some((key) => !REFERENCE_KEYS.has(key))) {
    throw new Error(`{${kind}} cross-reference cannot be preserved through canonical Markdown`);
  }
  const role: DocumentNode = { type: "mystRole", name: kind, value: text === undefined ? label : `${text} <${label}>` };
  const reparsed = parse(write(role)).children;
  const block = reparsed[0]?.children ?? [];
  const reference = block[0];
  if (reparsed.length !== 1 || block.length !== 1 || reference.type !== "crossReference" ||
      reference.kind !== kind || reference.label !== label || reference.identifier !== node.identifier ||
      reference.children?.[0]?.value !== text) {
    throw new Error(`{${kind}}\`${label}\` cannot round-trip through canonical Markdown`);
  }
  return role;
}

/** `(label)=` targets label the following block, e.g. a section heading.
 * myst-to-md has no handler for them and would write nothing. */
function targetLine(node: DocumentNode): DocumentNode {
  const line = `(${String(node.label)})=`;
  const reparsed = parse(`${line}\n`).children;
  if (typeof node.label !== "string" || Object.keys(node).some((key) => !TARGET_KEYS.has(key)) ||
      reparsed.length !== 1 || reparsed[0].type !== "mystTarget" || reparsed[0].label !== node.label) {
    throw new Error(`target ${JSON.stringify(node.label)} cannot be preserved through canonical Markdown`);
  }
  return { type: "html", value: line };
}

function write(role: DocumentNode): string {
  const file = new VFile();
  writeMd(file, { type: "root", children: [{ type: "paragraph", children: [role] }] } as never);
  return String(file.result ?? "");
}
