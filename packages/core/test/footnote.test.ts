import assert from "node:assert/strict";
import test from "node:test";
import { writeIssueOf } from "@ieumdoc/core";
import {
  canonicalWriteError, endnotesInPlace, footnoteNumbers, getEditableDocument, insertFootnote,
  insertFootnoteDefinition, insertQuote, nextFootnoteLabel, parse, removeBlock, serialize,
  updateFootnoteDefinition, updateParagraphInlineContent, type InlineContent,
  unresolvedReferences,
} from "./core-internal.ts";

const SOURCE = "# Title\n\nText with **a note[^n]** and more[^Long-1].\n\n[^n]: First note.\n\nAnother paragraph.\n\n[^Long-1]: A longer note.\n";
const PLACED = "# Title\n\nText with **a note[^n]** and more[^Long-1].\n\nAnother paragraph.\n\n[^n]: First note.\n\n[^Long-1]: A longer note.\n";

test("undefined footnote-shaped source warns without changing text or blocking canonical writes", () => {
  const source = String.raw`Loss [^loss] and **[^loss]**, \[^loss], \\[^even], \\\[^odd], &#91;^entity].` + "\n";
  const document = parse(source);
  const before = JSON.stringify(document);
  assert.deepEqual(unresolvedReferences(document), [
    { footnote: true, label: "loss", path: [0], line: 1 },
    { footnote: true, label: "loss", path: [0], line: 1 },
    { footnote: true, label: "even", path: [0], line: 1 },
  ]);
  assert.equal(JSON.stringify(document), before, "diagnosis does not change the tree");
  assert.equal(canonicalWriteError(document), undefined);
  const canonical = serialize(document);
  assert.ok(canonical.includes(String.raw`Loss \[^loss]`));
  assert.deepEqual(unresolvedReferences(parse(canonical)), [], "canonical literal text silences the warning");
  assert.equal(serialize(parse(canonical)), canonical);
  const edited = insertQuote(document, 1, [{ kind: "text", text: "Unrelated edit." }]);
  assert.deepEqual(unresolvedReferences(edited), [], "operation clones carry no original-source evidence, even for unchanged text");
  const literal = updateParagraphInlineContent(parse("Plain.\n"), [0], [{ kind: "text", text: "[^literal]" }]);
  assert.deepEqual(unresolvedReferences(literal), [], "typed Core text is literal, not source syntax");
});

test("footnote source diagnostics use exact labels and body block/container locations", () => {
  const source = [
    "---\nieumdoc: 1\n---", "# Title [^heading]", "A[^ok] and [^OK], [^미주], [^two words], [^].",
    "> First line\n> **[^quote]**", "- [^item]", "| A | B |\n| - | - |\n| \\[^cell] | [^cell] |",
    ":::{note}\nText [^note]\n:::", ":::{figure}\nCaption [^caption]\n:::",
    ":::{table} Caption [^table-caption]\n| A |\n| - |\n| a |\n:::", "[^ok]: Defined.",
  ].join("\n\n") + "\n";
  const expected = [
    { label: "heading", path: [1], line: 5 },
    { label: "OK", path: [2], line: 7 },
    { label: "미주", path: [2], line: 7 },
    { label: "quote", path: [3], line: 9 },
    { label: "item", path: [4], line: 12 },
    { label: "cell", path: [5], line: 16 },
    { label: "note", path: [6], line: 19 },
    { label: "caption", path: [7], line: 23 },
    { label: "table-caption", path: [8], line: 26 },
  ].map(item => ({ footnote: true, ...item }));
  for (const ending of ["\n", "\r\n"]) {
    assert.deepEqual(unresolvedReferences(parse("\uFEFF" + source.replaceAll("\n", ending))), expected);
  }
  assert.deepEqual(unresolvedReferences(parse("[^ok]: Defined.\n\nLoss [^loss] and [^ok].\n")),
    [{ footnote: true, label: "loss", path: [0], line: 3 }], "locations use the parsed body order, not source definition placement");
});

test("footnote source diagnostics exclude non-text syntax and defined labels", () => {
  const source = [
    "`[^inline]` and $[^math]$, {math}`[^role]`, {eq}`eq-known`, {sup}`\\[^escaped]`.",
    "[^link](https://example.com/[^url] \"[^title]\") and ![[^alt]](./image.png).",
    "```text\n[^fenced]\n```", "    [^indented]", "$$\n[^display]\n$$ (eq-known)",
    ":::{math}\n[^directive-math]\n:::", ":::{code} text\n[^directive-code]\n:::",
    ":::{figure} ./[^image-url].png\n:alt: [^image-alt]\nCaption.\n:::",
    "A[^ok] and [^tab\tlabel] and \\[^unused].", "[^ok]: Definition [^inside].", "[^tab\tlabel]: Tab label.",
    "[^unused]: Unreferenced definitions still have their existing write error.",
  ].join("\n\n") + "\n";
  assert.deepEqual(unresolvedReferences(parse(source)), []);
  assert.match(canonicalWriteError(parse(source)) ?? "", /has no reference/);
});

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
  for (const operation of [() => serialize(incomplete),
    () => insertFootnoteDefinition(document, 1, "n", [{kind: "text", text: "Duplicate."}])]) {
    assert.throws(operation, error => { assert.equal(writeIssueOf(error).code, "invalid-footnote"); return true; });
  }
  assert.doesNotThrow(() => insertQuote(incomplete, 2, [{ kind: "text", text: "Quoted." }]));
  for (const label of ["", "two words", "a]b"]) {
    for (const operation of [
      () => updateParagraphInlineContent(document, [1], [{ kind: "footnote", label }]),
      () => insertFootnoteDefinition(document, 1, label, [{ kind: "text", text: "Note." }]),
    ]) assert.throws(operation, error => {
      assert.match(writeIssueOf(error).reason, /footnote label/);
      assert.equal(writeIssueOf(error).code, "invalid-label");
      return true;
    });
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
