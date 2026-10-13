import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalWriteError, getEditableDocument, insertFootnote, insertParagraph, moveSection, parse, removeSection, serialize,
  updateParagraphInlineContent,
} from "@ieumdoc/core";

// Endnotes v4: canonical Markdown writes every footnote definition after the body, in the order
// of the first reference to it, whatever placement the source or the tree had.

const SCATTERED = [
  "# Document", "",
  "## Section A", "",
  "First claim[^b] and another[^a].", "",
  "[^a]: Second note.", "",
  "## Section B", "",
  "Another paragraph[^b].", "",
  "[^b]: First note.", "",
].join("\n");

const PLACED = [
  "# Document", "",
  "## Section A", "",
  "First claim[^b] and another[^a].", "",
  "## Section B", "",
  "Another paragraph[^b].", "",
  "[^b]: First note.", "",
  "[^a]: Second note.", "",
].join("\n");

const kinds = (markdown: string) => getEditableDocument(parse(markdown)).blocks.map(block => block.block === "footnote" ? `[^${block.label}]` : block.block);

test("canonical write moves definitions after the body in first-reference order, and repeats as is", () => {
  const document = parse(SCATTERED);
  assert.equal(serialize(document), PLACED);
  assert.equal(serialize(parse(PLACED)), PLACED);
  // The tree read from either source is the same: body as written, then the endnotes.
  assert.deepEqual(kinds(SCATTERED), ["heading", "heading", "paragraph", "heading", "paragraph", "[^b]", "[^a]"]);
  assert.deepEqual(getEditableDocument(parse(SCATTERED)), getEditableDocument(parse(PLACED)));
});

test("rich, read-only and nested definitions keep labels and content; order is deterministic", () => {
  const source = [
    "Intro[^n] then[^Long-1].", "",
    "[^inner]: Inner.", "",
    "[^n]: The note, see[^inner].", "",
    "Middle with **bold**[^n] again.", "",
    "[^Long-1]: A longer note", "    with a second line.", "", "    Second paragraph.", "",
    "Tail.", "",
  ].join("\n");
  const markdown = serialize(parse(source));
  assert.equal(markdown, [
    "Intro[^n] then[^Long-1].", "",
    "Middle with **bold**[^n] again.", "",
    "Tail.", "",
    "[^n]: The note, see[^inner].", "",
    "[^Long-1]: A longer note", "    with a second line.", "", "    Second paragraph.", "",
    "[^inner]: Inner.", "",
  ].join("\n"));
  assert.equal(serialize(parse(markdown)), markdown);
  const blocks = getEditableDocument(parse(source)).blocks;
  const longNote = blocks.find(block => block.block === "footnote" && block.label === "Long-1")!;
  // A read-only definition still shows its own written lines.
  assert.deepEqual(longNote.original, { kind: "footnoteDefinition", text: "[^Long-1]: A longer note\n    with a second line.\n\n    Second paragraph.", line: 9 });
});

test("changing reference order in the body moves the definitions on write", () => {
  const document = parse(PLACED);
  const paragraph = getEditableDocument(document).blocks[2];
  assert.equal(paragraph.block, "paragraph");
  const swapped = updateParagraphInlineContent(document, [2], [
    { kind: "text", text: "First claim" }, { kind: "footnote", label: "a" },
    { kind: "text", text: " and another" }, { kind: "footnote", label: "b" }, { kind: "text", text: "." },
  ]);
  assert.equal(serialize(swapped), PLACED.replace("First claim[^b] and another[^a].", "First claim[^a] and another[^b].")
    .replace("[^b]: First note.\n\n[^a]: Second note.\n", "[^a]: Second note.\n\n[^b]: First note.\n"));
});

test("a new footnote takes its place among the endnotes, and blocks inserted at the end stay in the body", () => {
  const inserted = insertFootnote(parse(PLACED), [2], 0, [{ kind: "text", text: "Newest." }]);
  assert.match(serialize(inserted), /Another paragraph\[\^b\]\.\n\n\[\^1\]: Newest\.\n\n\[\^b\]: First note\.\n\n\[\^a\]: Second note\.\n$/);
  const document = parse(PLACED);
  const appended = insertParagraph(document, getEditableDocument(document).blocks.length, "Appended.");
  assert.match(serialize(appended), /Another paragraph\[\^b\]\.\n\nAppended\.\n\n\[\^b\]: First note\./);
});

test("sections hold no endnotes: removing or moving one keeps every definition with its references", () => {
  const document = parse(PLACED);
  // 0 # Document · 1 ## A · 2 claims · 3 ## B · 4 another · 5 [^b] · 6 [^a]
  assert.match(serialize(moveSection(document, 3, 1)), /^# Document\n\n## Section B\n\nAnother paragraph\[\^b\]\.\n\n## Section A\n\nFirst claim\[\^b\] and another\[\^a\]\.\n\n\[\^b\]: First note\.\n\n\[\^a\]: Second note\.\n$/);
  // Section B holds a reference to [^b], which Section A also references: its definition stays.
  assert.equal(serialize(removeSection(document, 3)), "# Document\n\n## Section A\n\nFirst claim[^b] and another[^a].\n\n[^b]: First note.\n\n[^a]: Second note.\n");
  // Removing Section A would leave [^a] with no reference; the operation says so before writing.
  assert.throws(() => removeSection(document, 1), /\[\^a\]/);
});

test("documents MyST would drop or reread are still refused, naming the footnote", () => {
  for (const [source, reason] of [
    ["A[^a].\n\n[^orphan]: Lost.\n\nB.\n\n[^a]: Kept.\n", /\[\^orphan\] has no reference/],
    ["A[^a].\n\n[^a]: First.\n\nB.\n\n[^a]: Second.\n", /\[\^a\] is defined more than once/],
  ] as const) {
    assert.match(canonicalWriteError(parse(source)) ?? "", reason);
    assert.throws(() => serialize(parse(source)), reason);
  }
});
