import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { toText } from "myst-common";
import {
  insertParagraph,
  insertHeading,
  getEditableDocument,
  moveBlock,
  parse,
  removeBlock,
  replaceText,
  serialize,
  validateStructure,
  type Document,
  type DocumentNode,
} from "../src/index.ts";

const ORIGINAL_TEXT = "The converter regulates voltage.";
const MUTATED_TEXT = "The converter regulates voltage and current.";
const INSERTED_TEXT = "Inserted block.";

const source = readFileSync(new URL("./fixtures/document.md", import.meta.url), "utf8");
const technicalSource = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");

test("Core can parse a real document", () => {
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

test("Core can replace text", () => {
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

test("Core can insert a top-level block", () => {
  const document = parse(source);
  const originalLength = document.children.length;
  const changed = insertParagraph(document, 1, INSERTED_TEXT);
  assert.equal(document.children.length, originalLength);
  assert.equal(changed.children.length, originalLength + 1);
  assert.equal(changed.children[1]?.type, "paragraph");
  assert.equal(toText(changed.children[1]!), INSERTED_TEXT);
  assert.equal(changed.children[2]?.type, "paragraph");
  assert.equal(toText(changed.children[2]!), ORIGINAL_TEXT);
});

test("Core inserts headings with a canonical semantic round-trip", () => {
  const changed = insertHeading(parse("Intro"), 1, 3, "Details");
  const editable = getEditableDocument(parse(serialize(changed)));
  assert.deepEqual(editable.blocks.map((block) => block.block), ["paragraph", "heading"]);
  assert.deepEqual(editable.blocks[1], {
    block: "heading",
    path: [1],
    level: 3,
    text: "Details",
    editable: true,
  });
  assert.throws(() => insertHeading(parse("Intro"), 1, 0, "Invalid"), /1 to 6/);
  assert.throws(() => insertHeading(parse("Intro"), 1, 7, "Invalid"), /1 to 6/);
  assert.throws(() => insertHeading(parse("Intro"), 1, 1, ""), /empty heading/);
});

test("Core can remove a top-level block", () => {
  const document = parse(source);
  const noteIndex = indexOfType(document, "admonition");
  const originalLength = document.children.length;
  const changed = removeBlock(document, noteIndex);
  assert.equal(document.children[noteIndex]?.type, "admonition");
  assert.equal(changed.children.length, originalLength - 1);
  assert.equal(
    changed.children.some((node) => node.type === "admonition"),
    false,
  );
});

test("Core can move a top-level block", () => {
  const document = parse(source);
  const fromIndex = indexOfType(document, "admonition");
  const changed = moveBlock(document, fromIndex, 1);
  assert.equal(document.children[fromIndex]?.type, "admonition");
  assert.equal(changed.children[1]?.type, "admonition");
  assert.equal(changed.children[2]?.type, "paragraph");
  assert.equal(toText(changed.children[2]!), ORIGINAL_TEXT);
  assert.notEqual(changed.children, document.children);
});

test("Core rejects a reorder that changes canonical top-level block boundaries", () => {
  const document = parse("- A\n\nMiddle\n\n- B");
  const before = structuredClone(document);
  assert.throws(
    () => moveBlock(document, 2, 1),
    /Canonical save changed block boundaries; this order cannot be saved/,
  );
  assert.deepEqual(document, before);
});

test("Core preserves canonical semantics when reordering paragraph, heading, figure, and equation blocks", () => {
  const document = parse(technicalSource);
  for (const type of ["paragraph", "heading", "container", "math"]) {
    const index = document.children.findIndex((node) =>
      node.type === type && (type !== "container" || node.kind === "figure"),
    );
    assert.ok(index >= 0, `missing ${type} block`);
    const changed = moveBlock(document, index, 0);
    assert.deepEqual(
      getEditableDocument(parse(serialize(changed))).blocks.map((block) => block.block),
      getEditableDocument(changed).blocks.map((block) => block.block),
    );
  }
});

test("Modified document validates", () => {
  const document = modify(parse(source));
  validateStructure(document);
  assert.equal(document.type, "root");
  assert.ok(Array.isArray(document.children));
});

test("Modified document serializes canonically", () => {
  const output = serialize(modify(parse(source)));
  assert.equal(output.includes(MUTATED_TEXT), true);
  assert.equal(output.includes(INSERTED_TEXT), true);
  assert.equal(output.includes("phase current"), false);
  assert.match(output, /^# Converter Control\n\n:::{note}/);
  assert.equal(output.endsWith("\n"), true);
});

test("Serialized document reparses successfully", () => {
  const output = serialize(modify(parse(source)));
  const reparsed = parse(output);
  assert.equal(reparsed.type, "root");
  assert.ok((reparsed.children?.length ?? 0) > 0);
  assert.equal(reparsed.children[1]?.type, "admonition");
  assert.equal(toText(findTextBlock(reparsed, MUTATED_TEXT)!), MUTATED_TEXT);
  assert.equal(toText(findTextBlock(reparsed, INSERTED_TEXT)!), INSERTED_TEXT);
});

test("Second serialization is stable", () => {
  const output1 = serialize(modify(parse(source)));
  const output2 = serialize(parse(output1));
  assert.equal(output1, output2);
});

function modify(document: Document): Document {
  const withText = replaceText(document, ORIGINAL_TEXT, MUTATED_TEXT);
  const withInsert = insertParagraph(withText, 1, INSERTED_TEXT);
  const withMove = moveBlock(withInsert, indexOfType(withInsert, "admonition"), 1);
  return removeBlock(withMove, 4);
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

test("replaceText rejects lossy paragraph and heading replacements without mutating the source", () => {
  for (const source of ["Original.", "# Original."]) {
    const document = parse(source);
    const before = structuredClone(document);
    assert.throws(() => replaceText(document, "Original.", "A\n\nB"), /round-trip/);
    assert.deepEqual(document, before);
  }
});

test("insertParagraph rejects text that serializes as multiple paragraphs without mutation", () => {
  const document = parse("Original.");
  const before = structuredClone(document);
  assert.throws(() => insertParagraph(document, 1, "A\n\nB"), /round-trip/);
  assert.deepEqual(document, before);
});
