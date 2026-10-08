import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalWriteError, footnoteNumbers, getEditableDocument, insertFootnote, insertFootnoteDefinition, insertHeading, insertParagraph, insertQuote,
  moveBlock, nextFootnoteLabel, parse, removeBlock, replaceBlockSource, serialize, updateFootnoteDefinition, updateParagraphInlineContent,
  type EditableBlock, type InlineContent,
} from "@ieumdoc/core";

// Definitions written mid-document, a mixed-case label, a multi-paragraph definition and a
// reference inside a definition.
const SOURCE = [
  "# Title",
  "",
  "Text with **a note[^n]** and more[^Long-1].",
  "",
  "[^n]: The note, see[^inner].",
  "",
  "Another paragraph.",
  "",
  "[^Long-1]: A longer note",
  "    with a second line.",
  "",
  "    Second paragraph.",
  "",
  "[^inner]: Inner.",
  "",
  "Tail.",
  "",
].join("\n");

const footnoteBlock = (blocks: EditableBlock[], label: string) =>
  blocks.find((block) => block.block === "footnote" && block.label === label)!;

test("footnote references are editable inline content and definitions stay where they are written", () => {
  const document = parse(SOURCE);
  assert.equal(serialize(document), SOURCE);
  const blocks = getEditableDocument(document).blocks;
  const paragraph = blocks[1];
  assert.equal(paragraph.block === "paragraph" && paragraph.editable, true);
  assert.deepEqual(paragraph.block === "paragraph" && paragraph.content, [
    { kind: "text", text: "Text with " },
    { kind: "strong", children: [{ kind: "text", text: "a note" }, { kind: "footnote", label: "n" }] },
    { kind: "text", text: " and more" },
    { kind: "footnote", label: "Long-1" },
    { kind: "text", text: "." },
  ]);
  assert.equal(paragraph.block === "paragraph" && paragraph.text, "Text with a note[^n] and more[^Long-1].");
  assert.deepEqual(blocks.map((block) => block.block === "footnote" ? block.label : block.block),
    ["heading", "paragraph", "n", "paragraph", "Long-1", "inner", "paragraph"]);

  const content = paragraph.block === "paragraph" ? paragraph.content : [];
  const edited = updateParagraphInlineContent(document, [1], [{ kind: "text", text: "Edited. " }, ...content]);
  assert.equal(serialize(edited), SOURCE.replace("Text with", "Edited. Text with"));
});

test("a footnote definition shows its own source and the references it holds", () => {
  const blocks = getEditableDocument(parse(SOURCE)).blocks;
  assert.deepEqual(footnoteBlock(blocks, "n").original, { kind: "footnoteDefinition (footnoteReference)", text: "[^n]: The note, see[^inner].", line: 5 });
  assert.deepEqual(footnoteBlock(blocks, "n").footnotes, ["inner"]);
  assert.deepEqual(footnoteBlock(blocks, "Long-1").original, {
    kind: "footnoteDefinition",
    text: "[^Long-1]: A longer note\n    with a second line.\n\n    Second paragraph.",
    line: 9,
  });
});

test("footnotes are numbered in the order their first reference is read", () => {
  const blocks = getEditableDocument(parse(SOURCE)).blocks;
  const references = blocks.flatMap((block) => block.footnotes ??
    ("content" in block && Array.isArray(block.content) ? labels(block.content) : []));
  assert.deepEqual([...footnoteNumbers(references)], [["n", 1], ["Long-1", 2], ["inner", 3]]);
});

test("blocks move and insert around definitions, which keep their place", () => {
  const document = parse(SOURCE);
  const moved = moveBlock(document, 1, 6);
  assert.equal(serialize(moved), SOURCE.replace("Text with **a note[^n]** and more[^Long-1].\n\n", "").replace("Tail.\n", "Tail.\n\nText with **a note[^n]** and more[^Long-1].\n"));
  const inserted = insertHeading(insertParagraph(document, 7, "End."), 7, 2, "Notes");
  assert.equal(serialize(inserted), `${SOURCE}\n## Notes\n\nEnd.\n`);
});

test("canonical write refuses footnotes MyST would drop or reread, naming the footnote", () => {
  const refused: [string, RegExp][] = [
    ["A[^a].\n\n[^a]: Kept.\n\n[^orphan]: Never referenced.\n", /\[\^orphan\] has no reference/],
    ["A[^a].\n\n[^a]: First.\n\n[^a]: Second.\n", /\[\^a\] is defined more than once/],
  ];
  for (const [source, reason] of refused) assert.match(canonicalWriteError(parse(source)) ?? "", reason, source);

  const document = parse(SOURCE);
  const withoutReference = updateParagraphInlineContent(document, [1], [{ kind: "text", text: "Text more" }, { kind: "footnote", label: "Long-1" }]);
  assert.match(canonicalWriteError(withoutReference) ?? "", /\[\^n\] has no reference/);
  assert.match(canonicalWriteError(removeBlock(document, 4)) ?? "", /reference \[\^Long-1\] has no definition/);
  // Other operations still check their own blocks while the footnotes are incomplete.
  // A reference whose definition a save inserts later does not shift the checked block boundaries.
  assert.doesNotThrow(() => insertQuote(removeBlock(document, 4), 2, [{ kind: "text", text: "Quoted." }]));
  const completed = removeBlock(removeBlock(insertHeading(withoutReference, 7, 2, "Notes"), 5), 2);
  assert.equal(serialize(completed), "# Title\n\nText more[^Long-1]\n\nAnother paragraph.\n\n[^Long-1]: A longer note\n    with a second line.\n\n    Second paragraph.\n\nTail.\n\n## Notes\n");
});

test("footnote labels are kept as MyST reads them", () => {
  const document = parse("A.\n");
  for (const label of ["", "two words", "a]b"]) {
    assert.throws(() => updateParagraphInlineContent(document, [0], [{ kind: "footnote", label }]), /footnote label/, label);
  }
});

test("block source reads footnotes as the document does", () => {
  const document = parse(SOURCE);
  const blocks = getEditableDocument(document).blocks;
  const index = blocks.indexOf(footnoteBlock(blocks, "Long-1"));
  const definition = footnoteBlock(blocks, "Long-1").original!.text;
  assert.equal(serialize(replaceBlockSource(document, index, definition)), SOURCE);
  assert.equal(serialize(replaceBlockSource(document, index, "[^Long-1]: Shorter.")),
    SOURCE.replace("A longer note\n    with a second line.\n\n    Second paragraph.", "Shorter."));
  // A reference in block source names a definition elsewhere in the document.
  const paragraph = getEditableDocument(replaceBlockSource(document, 3, "Another[^inner] paragraph.")).blocks[3];
  assert.deepEqual(paragraph.block === "paragraph" && labels(paragraph.content), ["inner"]);
  assert.throws(() => replaceBlockSource(document, index, "[^Long-1]: One.\n\n[^Long-1]: Two."), /defined more than once/);
  assert.throws(() => replaceBlockSource(document, index, "[^renamed]: Text."), /reference \[\^Long-1\] has no definition/);
});

test("a one-paragraph definition is editable inline content; others stay read-only", () => {
  const document = parse(SOURCE);
  const blocks = getEditableDocument(document).blocks;
  const inner = footnoteBlock(blocks, "inner");
  assert.deepEqual(inner, { block: "footnote", path: [5], label: "inner", text: "Inner.", content: [{ kind: "text", text: "Inner." }], editable: true });
  // One holds a footnote reference, the other two paragraphs.
  for (const label of ["n", "Long-1"]) {
    const block = footnoteBlock(blocks, label);
    assert.equal(block.block === "footnote" && block.editable, false, label);
  }

  const content: InlineContent[] = [
    { kind: "strong", children: [{ kind: "text", text: "Inner" }] }, { kind: "text", text: " at " }, { kind: "math", value: "x^2" },
    { kind: "text", text: ", see " }, { kind: "link", url: "https://example.com", children: [{ kind: "text", text: "the source" }] },
  ];
  const edited = updateFootnoteDefinition(document, [5], content);
  assert.equal(serialize(edited), SOURCE.replace("[^inner]: Inner.", "[^inner]: **Inner** at $x^2$, see [the source](https://example.com)"));
  assert.deepEqual(footnoteBlock(getEditableDocument(parse(serialize(edited))).blocks, "inner"), { ...inner, text: "Inner at $x^2$, see the source", content });

  assert.throws(() => updateFootnoteDefinition(document, [4], content), /footnote edit is not supported/);
  assert.throws(() => updateFootnoteDefinition(document, [5], [{ kind: "text", text: "  " }]), /non-empty text/);
  assert.throws(() => updateFootnoteDefinition(document, [5], [{ kind: "text", text: "See" }, { kind: "footnote", label: "n" }]), /cannot contain footnote references/);
});

test("insertFootnote adds a reference and a definition at the document end, labelled with the next unused number", () => {
  const document = parse(SOURCE);
  const once = insertFootnote(document, [3], 7, [{ kind: "text", text: "First new." }]);
  assert.equal(serialize(once), SOURCE.replace("Another paragraph.", "Another[^1] paragraph.") + "\n[^1]: First new.\n");
  // Labels are numbers no footnote uses; shown numbers follow reference order, so the new footnote before them is 1.
  const twice = insertFootnote(once, [1], 0, [{ kind: "text", text: "Second new." }]);
  assert.match(serialize(twice), /^# Title\n\n\[\^2\]Text with/);
  assert.match(serialize(twice), /\[\^1\]: First new\.\n\n\[\^2\]: Second new\.\n$/);
  const blocks = getEditableDocument(parse(serialize(twice))).blocks;
  const references = blocks.flatMap((block) => block.footnotes ?? ("content" in block && Array.isArray(block.content) ? labels(block.content) : []));
  assert.deepEqual([...footnoteNumbers(references)].map(([label]) => label), ["2", "n", "Long-1", "inner", "1"]);

  assert.equal(serialize(insertFootnote(parse("# Title\n"), [0], 5, [{ kind: "text", text: "On a heading." }])),
    "# Title[^1]\n\n[^1]: On a heading.\n");
  assert.equal(serialize(insertFootnote(parse("| Key | Value |\n| --- | --- |\n| a | 1 |\n"), [0, 1, 1], 1, [{ kind: "text", text: "In a cell." }])),
    "| Key | Value |\n| --- | ----- |\n| a   | 1[^1] |\n\n[^1]: In a cell.\n");
  assert.throws(() => insertFootnote(document, [4], 0, [{ kind: "text", text: "x" }]), /cannot be inserted/);
  assert.throws(() => insertFootnote(document, [3], 99, [{ kind: "text", text: "x" }]), /offset out of range/);
  assert.throws(() => insertFootnote(document, [3], 0, []), /non-empty text/);
  assert.equal(serialize(document), SOURCE);
});

test("a definition is inserted before or after its reference, and the write rule still holds", () => {
  const document = parse("A paragraph.\n");
  const definition = insertFootnoteDefinition(document, 1, "note", [{ kind: "text", text: "Defined first." }]);
  assert.match(canonicalWriteError(definition) ?? "", /\[\^note\] has no reference/);
  const referenced = updateParagraphInlineContent(definition, [0], [{ kind: "text", text: "A paragraph." }, { kind: "footnote", label: "note" }]);
  assert.equal(serialize(referenced), "A paragraph.[^note]\n\n[^note]: Defined first.\n");
  assert.throws(() => insertFootnoteDefinition(referenced, 2, "note", [{ kind: "text", text: "Again." }]), /already defined/);
  assert.throws(() => insertFootnoteDefinition(document, 1, "two words", [{ kind: "text", text: "x" }]), /footnote label/);
  assert.equal(nextFootnoteLabel(["1", "2", "a", "04"]), "3");
  assert.equal(nextFootnoteLabel(["2"]), "1");
});

function labels(content: InlineContent[]): string[] {
  return content.flatMap((item) => item.kind === "footnote" ? [item.label] : "children" in item ? labels(item.children) : []);
}
