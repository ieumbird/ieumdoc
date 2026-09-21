import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { toText } from "myst-common";
import {
  moveBlock,
  parse,
  replaceText,
  serialize,
  validate,
  type Document,
  type DocumentNode,
} from "../src/index.ts";

const ORIGINAL_TEXT = "The converter regulates voltage.";
const MUTATED_TEXT = "The converter regulates voltage and current.";

const source = readFileSync(new URL("./fixtures/document.md", import.meta.url), "utf8");

test("parse document", () => {
  const document = parse(source);
  const types = collectTypes(document);
  assert.equal(document.type, "root");
  assert.ok((document.children?.length ?? 0) > 0);
  assert.ok(types.has("heading"));
  assert.ok(types.has("paragraph"));
  assert.ok(types.has("strong"));
  assert.ok(types.has("emphasis"));
  assert.ok(types.has("list"));
  assert.ok(types.has("admonition"));
  assert.ok(types.has("math"));
});

test("mutate text through Core operation", () => {
  const document = parse(source);
  const changed = replaceText(document, ORIGINAL_TEXT, MUTATED_TEXT);
  const originalBlock = findTextBlock(document, ORIGINAL_TEXT);
  const mutatedBlock = findTextBlock(changed, MUTATED_TEXT);
  assert.ok(originalBlock);
  assert.equal(toText(originalBlock), ORIGINAL_TEXT);
  assert.ok(mutatedBlock);
  assert.equal(toText(mutatedBlock), MUTATED_TEXT);
  assert.equal(mutatedBlock.type, "paragraph");
  assert.notEqual(changed, document);
  assert.equal(source.includes(ORIGINAL_TEXT), true);
  assert.equal(source.includes(MUTATED_TEXT), false);
});

test("move block through Core operation", () => {
  const document = parse(source);
  const fromIndex = indexOfType(document, "admonition");
  const changed = moveBlock(document, fromIndex, 1);
  assert.equal(document.children[fromIndex]?.type, "admonition");
  assert.equal(changed.children[1]?.type, "admonition");
  assert.equal(changed.children[2]?.type, "paragraph");
  assert.equal(toText(changed.children[2]!), ORIGINAL_TEXT);
  assert.notEqual(changed.children, document.children);
});

test("validate modified document", () => {
  const document = modify(parse(source));
  validate(document);
  assert.equal(document.type, "root");
  assert.ok(Array.isArray(document.children));
});

test("canonical serialize", () => {
  const output = serialize(modify(parse(source)));
  assert.equal(output.includes(MUTATED_TEXT), true);
  assert.match(output, /^# Converter Control\n\n:::{note}/);
  assert.equal(output.endsWith("\n"), true);
});

test("reparse serialized document", () => {
  const output = serialize(modify(parse(source)));
  const reparsed = parse(output);
  assert.equal(reparsed.type, "root");
  assert.ok((reparsed.children?.length ?? 0) > 0);
  assert.equal(reparsed.children[1]?.type, "admonition");
  assert.equal(toText(findTextBlock(reparsed, MUTATED_TEXT)!), MUTATED_TEXT);
});

test("stable second serialization", () => {
  const output1 = serialize(modify(parse(source)));
  const output2 = serialize(parse(output1));
  assert.equal(output1, output2);
});

function modify(document: Document): Document {
  const withText = replaceText(document, ORIGINAL_TEXT, MUTATED_TEXT);
  return moveBlock(withText, indexOfType(withText, "admonition"), 1);
}

function indexOfType(document: Document, type: string): number {
  const index = document.children.findIndex((node) => node.type === type);
  assert.ok(index >= 0, `missing top-level ${type}`);
  return index;
}

function findTextBlock(node: DocumentNode, text: string): DocumentNode | undefined {
  if ((node.type === "paragraph" || node.type === "heading") && toText(node).includes(text)) {
    return node;
  }
  for (const child of node.children ?? []) {
    const found = findTextBlock(child, text);
    if (found) return found;
  }
  return undefined;
}

function collectTypes(node: DocumentNode, types = new Set<string>()): Set<string> {
  types.add(node.type);
  for (const child of node.children ?? []) collectTypes(child, types);
  return types;
}
