import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalWriteError, endnotesInPlace, footnoteNumbers, getEditableDocument, insertFootnote,
  insertFootnoteDefinition, insertQuote, nextFootnoteLabel, parse, removeBlock, serialize,
  updateFootnoteDefinition, updateParagraphInlineContent, type InlineContent,
} from "./core-internal.ts";

const SOURCE = "# Title\n\nText with **a note[^n]** and more[^Long-1].\n\n[^n]: First note.\n\nAnother paragraph.\n\n[^Long-1]: A longer note.\n";
const PLACED = "# Title\n\nText with **a note[^n]** and more[^Long-1].\n\nAnother paragraph.\n\n[^n]: First note.\n\n[^Long-1]: A longer note.\n";

test("footnote references retain inline semantics and definitions follow the body", () => {
  const document = parse(SOURCE);
  assert.equal(serialize(document), PLACED);
  assert.equal(endnotesInPlace(document), false);
  assert.equal(endnotesInPlace(parse(PLACED)), true);
  const paragraph = getEditableDocument(document).blocks[1];
  assert.equal(paragraph.block, "paragraph");
  if (paragraph.block !== "paragraph") return;
  assert.deepEqual(paragraph.content, [
    { kind: "text", text: "Text with " },
    { kind: "strong", children: [{ kind: "text", text: "a note" }, { kind: "footnote", label: "n" }] },
    { kind: "text", text: " and more" }, { kind: "footnote", label: "Long-1" }, { kind: "text", text: "." },
  ]);
  const edited = updateParagraphInlineContent(document, [1], [{ kind: "text", text: "Edited. " }, ...paragraph.content]);
  assert.equal(serialize(edited), PLACED.replace("Text with", "Edited. Text with"));
  const content: InlineContent[] = [{ kind: "strong", children: [{ kind: "text", text: "First" }] }, { kind: "text", text: " at " }, { kind: "math", value: "x^2" }];
  assert.equal(serialize(updateFootnoteDefinition(document, [3], content)), PLACED.replace("First note.", "**First** at $x^2$"));
  assert.throws(() => updateFootnoteDefinition(document, [3], [{ kind: "footnote", label: "n" }]), /cannot contain footnote references/);
  assert.throws(() => updateFootnoteDefinition(document, [3], []), /non-empty text/);
});

test("footnotes lost by parsing or incomplete operation snapshots cannot be written", () => {
  // A nested caption parse must not change the tokenizer used for later definitions.
  parse(":::{figure}\n\nCaption.\n:::\n\nA[^a].\n\n[^a]: Note.\n");
  for (const [source, reason] of [
    ["A[^a].\n\n[^a]: Kept.\n\n[^orphan]: Never referenced.\n", /has no reference/],
    ["A[^a].\n\n[^a]: First.\n\n[^a]: Second.\n", /defined more than once/],
  ] as const) assert.match(canonicalWriteError(parse(source)) ?? "", reason);
  const document = parse(SOURCE);
  const incomplete = removeBlock(document, 4);
  assert.match(canonicalWriteError(incomplete) ?? "", /has no definition/);
  assert.doesNotThrow(() => insertQuote(incomplete, 2, [{ kind: "text", text: "Quoted." }]));
  for (const label of ["", "two words", "a]b"]) {
    assert.throws(() => updateParagraphInlineContent(document, [1], [{ kind: "footnote", label }]), /footnote label/);
  }
});

test("insertFootnote uses an unused label and places definitions by first reference", () => {
  const document = parse(SOURCE);
  const once = insertFootnote(document, [2], 7, [{ kind: "text", text: "First new." }]);
  assert.equal(serialize(once), PLACED.replace("Another paragraph.", "Another[^1] paragraph.") + "\n[^1]: First new.\n");
  const twice = insertFootnote(once, [1], 0, [{ kind: "text", text: "Second new." }]);
  const blocks = getEditableDocument(parse(serialize(twice))).blocks;
  const references = blocks.flatMap(block => "content" in block && Array.isArray(block.content) ? labels(block.content) : []);
  assert.deepEqual([...footnoteNumbers(references)].map(([label]) => label), ["2", "n", "Long-1", "1"]);
  assert.deepEqual(blocks.flatMap(block => block.block === "footnote" ? [block.label] : []), ["2", "n", "Long-1", "1"]);
  assert.equal(serialize(insertFootnote(parse("# Title\n"), [0], 5, [{ kind: "text", text: "On a heading." }])), "# Title[^1]\n\n[^1]: On a heading.\n");
  assert.match(serialize(insertFootnote(parse("| Key | Value |\n| --- | --- |\n| a | 1 |\n"), [0, 1, 1], 1, [{ kind: "text", text: "In a cell." }])), /1\[\^1\]/);
  assert.throws(() => insertFootnote(document, [3], 0, [{ kind: "text", text: "x" }]), /cannot be inserted/);
  assert.throws(() => insertFootnote(document, [2], 99, [{ kind: "text", text: "x" }]), /offset out of range/);
  assert.throws(() => insertFootnote(document, [2], 0, []), /non-empty text/);
  assert.equal(serialize(document), PLACED);
});

test("a definition is inserted before or after its reference, and the write rule still holds", () => {
  const document = parse("A paragraph.\n");
  const definition = insertFootnoteDefinition(document, 1, "note", [{ kind: "text", text: "Defined first." }]);
  assert.match(canonicalWriteError(definition) ?? "", /\[\^note\] has no reference/);
  const referenced = updateParagraphInlineContent(definition, [0], [{ kind: "text", text: "A paragraph." }, { kind: "footnote", label: "note" }]);
  assert.equal(serialize(referenced), "A paragraph.[^note]\n\n[^note]: Defined first.\n");
  // A definition inserted inside the body is written with the endnotes.
  const early = insertFootnoteDefinition(parse("A[^a].\n\nB.\n\n[^a]: Kept.\n"), 1, "b", [{ kind: "text", text: "Early." }]);
  assert.equal(serialize(updateParagraphInlineContent(early, [0], [{ kind: "text", text: "A" }, { kind: "footnote", label: "b" }, { kind: "footnote", label: "a" }, { kind: "text", text: "." }])),
    "A[^b][^a].\n\nB.\n\n[^b]: Early.\n\n[^a]: Kept.\n");
  assert.throws(() => insertFootnoteDefinition(referenced, 2, "note", [{ kind: "text", text: "Again." }]), /already defined/);
  assert.throws(() => insertFootnoteDefinition(document, 1, "two words", [{ kind: "text", text: "x" }]), /footnote label/);
  assert.equal(nextFootnoteLabel(["1", "2", "a", "04"]), "3");
  assert.equal(nextFootnoteLabel(["2"]), "1");
});

function labels(content: InlineContent[]): string[] {
  return content.flatMap(item => item.kind === "footnote" ? [item.label] : "children" in item ? labels(item.children) : []);
}
