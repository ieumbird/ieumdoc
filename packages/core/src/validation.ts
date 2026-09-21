import type { Document, DocumentNode } from "./document.ts";

export function validateStructure(document: Document): void {
  if (!document || document.type !== "root") {
    throw new Error("document root must have type \"root\"");
  }
  if (!Array.isArray(document.children)) {
    throw new Error("document root must have a children array");
  }
  walk(document, "root", (node, path) => {
    if (!node || typeof node !== "object") {
      throw new Error(`invalid node at ${path}`);
    }
    if (typeof node.type !== "string" || node.type.length === 0) {
      throw new Error(`node type missing at ${path}`);
    }
    if (node.children !== undefined && !Array.isArray(node.children)) {
      throw new Error(`children must be an array at ${path}`);
    }
  });
}

function walk(
  node: DocumentNode,
  path: string,
  visit: (node: DocumentNode, path: string) => void,
): void {
  visit(node, path);
  (node.children ?? []).forEach((child, index) => {
    walk(child, `${path}.children[${index}]`, visit);
  });
}
