import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getEditableDocument,
  insertEquation,
  insertHeading,
  insertParagraph,
  parse,
  removeBlock,
  serialize,
  updateEquation,
  updateHeading,
  updateParagraphInlineContent,
  type EditableBlock,
} from "../src/index.ts";

const SOURCE = [
  "# Converter Control",
  "",
  "The converter regulates the DC-link voltage.",
  "",
  "```{math}",
  "i* = P* / Vrms",
  "```",
  "",
  "The current reference follows the active power command.",
  "",
].join("\n");

test("insert paragraph, heading, and equation, then delete, round-trips canonically", () => {
  let document = parse(SOURCE);
  document = insertParagraph(document, 2, "Added paragraph.");
  document = insertHeading(document, 3, "Limits", 2);
  document = insertEquation(document, 5, "E = mc^2");
  document = removeBlock(document, 3);

  const markdown = serialize(document);
  const reparsed = parse(markdown);
  assert.equal(serialize(reparsed), markdown);

  const blocks = getEditableDocument(reparsed).blocks;
  assert.deepEqual(
    blocks.map(describe),
    [
      "heading:Converter Control",
      "paragraph:The converter regulates the DC-link voltage.",
      "paragraph:Added paragraph.",
      "equation:i* = P* / Vrms",
      "equation:E = mc^2",
      "paragraph:The current reference follows the active power command.",
    ],
  );
  assert.equal(markdown.includes("## Limits"), false);
  assert.equal(markdown.includes("Added paragraph."), true);
  assert.equal(markdown.includes("E = mc^2"), true);
});

test("heading, paragraph, and equation updates survive reparse", () => {
  let document = parse(SOURCE);
  document = updateHeading(document, [0], "Grid Converter");
  document = updateParagraphInlineContent(document, [1], [
    { kind: "text", text: "The converter regulates the " },
    { kind: "strong", children: [{ kind: "text", text: "DC-link" }] },
    { kind: "text", text: " voltage." },
  ]);
  document = updateEquation(document, [2], "E = mc^2");

  const markdown = serialize(document);
  assert.equal(serialize(parse(markdown)), markdown);
  assert.equal(markdown.includes("# Grid Converter"), true);
  assert.equal(markdown.includes("**DC-link**"), true);
  assert.equal(markdown.includes("E = mc^2"), true);

  const blocks = getEditableDocument(parse(markdown)).blocks;
  assert.equal(blocks[0]?.block === "heading" && blocks[0].text, "Grid Converter");
  assert.equal(blocks[2]?.block === "equation" && blocks[2].latex, "E = mc^2");
});

test("insert shifts later NodePaths", () => {
  const document = parse(SOURCE);
  const before = getEditableDocument(document).blocks.find((block) => block.block === "equation");
  assert.deepEqual(before?.path, [2]);
  const after = getEditableDocument(insertParagraph(document, 1, "Added.")).blocks.find(
    (block) => block.block === "equation",
  );
  assert.deepEqual(after?.path, [3]);
});

test("an empty paragraph does not survive canonical reload", () => {
  const markdown = serialize(insertParagraph(parse(SOURCE), 2, ""));
  const blocks = getEditableDocument(parse(markdown)).blocks;
  assert.equal(
    blocks.some((block) => block.block === "paragraph" && block.text.length === 0),
    false,
  );
  assert.notEqual(serialize(parse(markdown)), markdown);
});

test("a single-space paragraph survives as a non-empty text node", () => {
  const markdown = serialize(insertParagraph(parse(SOURCE), 2, " "));
  assert.equal(serialize(parse(markdown)), markdown);
  assert.equal(markdown.includes("&#x20;"), true);
  const inserted = getEditableDocument(parse(markdown)).blocks[2];
  assert.equal(inserted?.block, "paragraph");
  if (inserted?.block !== "paragraph") return;
  assert.equal(inserted.text, " ");
});

test("empty equation latex is rejected", () => {
  const document = parse(SOURCE);
  assert.throws(() => insertEquation(document, 2, ""), /non-empty/);
  assert.throws(() => insertEquation(document, 2, "   "), /non-empty/);
  assert.throws(() => updateEquation(document, [2], ""), /non-empty/);
});

test("an empty heading survives canonical reload", () => {
  const markdown = serialize(insertHeading(parse(SOURCE), 1, ""));
  assert.equal(serialize(parse(markdown)), markdown);
  const inserted = getEditableDocument(parse(markdown)).blocks[1];
  assert.equal(inserted?.block, "heading");
  if (inserted?.block !== "heading") return;
  assert.equal(inserted.text, "");
});

test("updateEquation preserves an existing label", () => {
  const technical = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");
  const document = parse(technical);
  const equation = getEditableDocument(document).blocks.find((block) => block.block === "equation");
  assert.equal(equation?.block, "equation");
  if (equation?.block !== "equation") return;
  assert.equal(equation.label, "eq-current");

  const markdown = serialize(updateEquation(document, equation.path, "E = mc^2"));
  assert.equal(serialize(parse(markdown)), markdown);
  assert.equal(markdown.includes("eq-current"), true);
  assert.equal(markdown.includes("E = mc^2"), true);
  const updated = getEditableDocument(parse(markdown)).blocks.find((block) => block.block === "equation");
  assert.equal(updated?.block === "equation" && updated.label, "eq-current");
  assert.equal(updated?.block === "equation" && updated.latex, "E = mc^2");
});

function describe(block: EditableBlock): string {
  if (block.block === "heading" || block.block === "paragraph") return `${block.block}:${block.text}`;
  if (block.block === "equation") return `${block.block}:${block.latex}`;
  return block.block;
}
