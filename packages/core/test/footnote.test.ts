import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalWriteError, footnoteNumbers, getEditableDocument, insertHeading, insertParagraph, moveBlock, parse, removeBlock,
  replaceBlockSource, serialize, updateParagraphInlineContent, type EditableBlock, type InlineContent,
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
  blocks.find((block) => block.block === "unsupported" && block.footnote === label)!;

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
  assert.deepEqual(blocks.map((block) => block.block === "unsupported" ? block.footnote : block.block),
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

function labels(content: InlineContent[]): string[] {
  return content.flatMap((item) => item.kind === "footnote" ? [item.label] : "children" in item ? labels(item.children) : []);
}
