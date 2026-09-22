import { assertPersistentParagraph } from "./myst/paragraph.ts";
import { toText } from "myst-common";
import {
  cloneDocument,
  getNode,
  type Document,
  type DocumentNode,
  type NodePath,
} from "./document.ts";
import {
  assertInlineContent,
  inlineContentLength,
  splitInlineContent,
  concatenateInlineContent,
  insertInlineBreak,
  inlineContentToNodes,
  projectInlineContent,
  type InlineContent,
} from "./inline.ts";

import { assertInlineBlockRoundTrip } from "./myst/inline-round-trip.ts";

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
  assertInlineBlockRoundTrip(block);
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

export function insertParagraph(document: Document, index: number, text: string): Document {
  const paragraph: DocumentNode = {
    type: "paragraph",
    children: [{ type: "text", value: text }],
  };
  assertInlineBlockRoundTrip(paragraph);
  return insertBlock(document, index, paragraph);
}

export function updateNodeTextAtPath(
  document: Document,
  path: NodePath,
  from: string,
  to: string,
): Document {
  if (from.length === 0) {
    throw new Error("updateNodeTextAtPath requires a non-empty search string");
  }
  const next = cloneDocument(document);
  const node = getNode(next, path);
  if (replaceInTextNodes(node, from, to)) {
    assertInlineBlockRoundTrip(node);
    return next;
  }
  if (typeof node.value === "string" && node.value.includes(from)) {
    node.value = node.value.replaceAll(from, to);
    assertInlineBlockRoundTrip(node);
    return next;
  }
  if (toText(node) === from) {
    node.children = [{ type: "text", value: to }];
    assertInlineBlockRoundTrip(node);
    return next;
  }
  throw new Error(`updateNodeTextAtPath could not replace text at [${path.join(",")}]`);
}

export function updateParagraphInlineContent(
  document: Document,
  path: NodePath,
  content: InlineContent[],
): Document {
  assertInlineContent(content);
  const next = cloneDocument(document);
  const node = getNode(next, path);
  if (node.type !== "paragraph") {
    throw new Error(`updateParagraphInlineContent requires a paragraph at [${path.join(",")}]`);
  }
  if (!projectInlineContent(node)) {
    throw new Error(`updateParagraphInlineContent cannot replace unsupported inline content at [${path.join(",")}]`);
  }
  node.children = inlineContentToNodes(content);
  assertInlineBlockRoundTrip(node);
  return next;
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

/** Insert an intentional line break at an interior rendered UTF-16 offset. */
export function insertHardBreak(document: Document, path: NodePath, offset: number): Document {
  const content = paragraphContent(document, path);
  assertInteriorOffset(content, offset);
  const next = cloneDocument(document);
  getNode(next, path).children = inlineContentToNodes(insertInlineBreak(content, offset));
  assertPersistentParagraph(getNode(next, path));
  return next;
}

/** Split a top-level paragraph without creating persistent empty paragraphs. */
export function splitParagraph(document: Document, path: NodePath, offset: number): Document {
  assertTopLevelPath(path);
  const content = paragraphContent(document, path);
  assertInteriorOffset(content, offset);
  const [left, right] = splitInlineContent(content, offset);
  const next = cloneDocument(document);
  const original = getNode(next, path);
  next.children.splice(path[0], 1,
    { ...original, children: inlineContentToNodes(left) },
    { type: "paragraph", children: inlineContentToNodes(right) });
  assertPersistentParagraph(next.children[path[0]]);
  assertPersistentParagraph(next.children[path[0] + 1]);
  return next;
}

/** Concatenate the current and previous top-level paragraphs; add no space. */
export function mergeParagraphWithPrevious(document: Document, path: NodePath): Document {
  assertTopLevelPath(path);
  if (path[0] <= 0) throw new Error("merge requires a previous paragraph");
  const current = paragraphContent(document, path);
  const previous = paragraphContent(document, [path[0] - 1]);
  const next = cloneDocument(document);
  next.children[path[0] - 1].children = inlineContentToNodes(concatenateInlineContent(previous, current));
  assertPersistentParagraph(next.children[path[0] - 1]);
  next.children.splice(path[0], 1);
  return next;
}

function paragraphContent(document: Document, path: NodePath): InlineContent[] {
  const node = getNode(document, path);
  if (node.type !== "paragraph") throw new Error("operation requires a paragraph");
  const content = projectInlineContent(node);
  if (!content) throw new Error("unsupported paragraph inline content");
  return content;
}

function assertTopLevelPath(path: NodePath): void {
  if (path.length !== 1) throw new Error("operation requires a top-level paragraph path [index]");
}

function assertInteriorOffset(content: InlineContent[], offset: number): void {
  if (!Number.isInteger(offset) || offset <= 0 || offset >= inlineContentLength(content)) {
    throw new Error("offset must be an interior UTF-16 position (0 < offset < paragraph length)");
  }
}
