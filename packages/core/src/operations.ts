import { toText } from "myst-common";
import { cloneDocument, type Document, type DocumentNode } from "./document.ts";

const TEXT_BLOCKS = new Set(["paragraph", "heading"]);

export function replaceText(document: Document, from: string, to: string): Document {
  if (from.length === 0) {
    throw new Error("replaceText requires a non-empty search string");
  }
  const next = cloneDocument(document);
  const block = findTextBlock(next, from);
  if (!block) {
    throw new Error(`replaceText could not find paragraph or heading text: ${from}`);
  }
  if (!replaceInTextNodes(block, from, to) && toText(block) === from) {
    block.children = [{ type: "text", value: to }];
  }
  return next;
}

export function moveBlock(document: Document, fromIndex: number, toIndex: number): Document {
  const next = cloneDocument(document);
  const blocks = next.children;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error("moveBlock requires a document with top-level blocks");
  }
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= blocks.length) {
    throw new Error(`moveBlock fromIndex out of range: ${fromIndex}`);
  }
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= blocks.length) {
    throw new Error(`moveBlock toIndex out of range: ${toIndex}`);
  }
  const [block] = blocks.splice(fromIndex, 1);
  blocks.splice(toIndex, 0, block);
  return next;
}

function findTextBlock(node: DocumentNode, from: string): DocumentNode | undefined {
  if (TEXT_BLOCKS.has(node.type) && toText(node).includes(from)) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findTextBlock(child, from);
    if (found) return found;
  }
  return undefined;
}

function replaceInTextNodes(node: DocumentNode, from: string, to: string): boolean {
  if (node.type === "text" && typeof node.value === "string" && node.value.includes(from)) {
    node.value = node.value.replaceAll(from, to);
    return true;
  }
  let replaced = false;
  for (const child of node.children ?? []) {
    if (replaceInTextNodes(child, from, to)) replaced = true;
  }
  return replaced;
}
