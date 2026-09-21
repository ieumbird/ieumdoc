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

export function insertBlock(document: Document, index: number, block: DocumentNode): Document {
  if (!block || typeof block.type !== "string" || block.type.length === 0) {
    throw new Error("insertBlock requires a block with a type");
  }
  const next = cloneDocument(document);
  const blocks = next.children;
  if (!Array.isArray(blocks)) {
    throw new Error("insertBlock requires a document with top-level blocks");
  }
  if (!Number.isInteger(index) || index < 0 || index > blocks.length) {
    throw new Error(`insertBlock index out of range: ${index}`);
  }
  blocks.splice(index, 0, structuredClone(block));
  return next;
}

export function updateNodeText(
  document: Document,
  type: string,
  from: string,
  to: string,
): Document {
  if (type.length === 0) {
    throw new Error("updateNodeText requires a node type");
  }
  if (from.length === 0) {
    throw new Error("updateNodeText requires a non-empty search string");
  }
  const next = cloneDocument(document);
  const node = findNodeWithText(next, type, from);
  if (!node) {
    throw new Error(`updateNodeText could not find ${type} text: ${from}`);
  }
  if (replaceInTextNodes(node, from, to)) {
    return next;
  }
  if (typeof node.value === "string" && node.value.includes(from)) {
    node.value = node.value.replaceAll(from, to);
    return next;
  }
  if (toText(node) === from) {
    node.children = [{ type: "text", value: to }];
    return next;
  }
  throw new Error(`updateNodeText could not replace text in ${type}`);
}

export function removeBlock(document: Document, index: number): Document {
  const next = cloneDocument(document);
  const blocks = next.children;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new Error("removeBlock requires a document with top-level blocks");
  }
  if (!Number.isInteger(index) || index < 0 || index >= blocks.length) {
    throw new Error(`removeBlock index out of range: ${index}`);
  }
  blocks.splice(index, 1);
  return next;
}

function findNodeWithText(node: DocumentNode, type: string, from: string): DocumentNode | undefined {
  if (node.type === type && toText(node).includes(from)) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findNodeWithText(child, type, from);
    if (found) return found;
  }
  return undefined;
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
