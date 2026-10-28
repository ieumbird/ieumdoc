import { DocumentDiagnosticError } from "./write-error.ts";
import type { MystDocument, MystNode } from "./myst/tree.ts";

export function validateStructure(document: MystDocument): void {
  if (!document || document.type !== "root") {
    throw new DocumentDiagnosticError("invalid-structure", "document root must have type \"root\"");
  }
  if (!Array.isArray(document.children)) {
    throw new DocumentDiagnosticError("invalid-structure", "document root must have a children array");
  }
  walk(document, "root", (node, path) => {
    if (!node || typeof node !== "object") {
      throw new DocumentDiagnosticError("invalid-structure", `invalid node at ${path}`);
    }
    if (typeof node.type !== "string" || node.type.length === 0) {
      throw new DocumentDiagnosticError("invalid-structure", `node type missing at ${path}`);
    }
    if (node.children !== undefined && !Array.isArray(node.children)) {
      throw new DocumentDiagnosticError("invalid-structure", `children must be an array at ${path}`);
    }
  });
}

function walk(
  node: MystNode,
  path: string,
  visit: (node: MystNode, path: string) => void,
): void {
  visit(node, path);
  (node.children ?? []).forEach((child, index) => {
    walk(child, `${path}.children[${index}]`, visit);
  });
}
