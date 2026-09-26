import assert from "node:assert/strict";
import test from "node:test";
import { SemanticLossError } from "../src/myst/serialize.ts";
import {
  getEditableDocument,
  getNode,
  insertFigure,
  insertHeading,
  insertParagraph,
  parse,
  replaceText,
  serialize,
  updateAdmonitionInlineContent,
  updateFigure,
  updateNodeTextAtPath,
  updateParagraphInlineContent,
  updateTableCell,
  type InlineContent,
  type MystDocument,
} from "./core-internal.ts";

// Parse boundary safety contract. The canonical-write guard compares a parsed Document
// with its reparsed canonical Markdown, so it cannot see what parsing itself changes.
// These tests pin what the parse boundary must keep (the user's text), drop (a byte
// order mark) and refuse to write (front matter it cannot round-trip).

const APOSTROPHE = "Don't panic.";
const QUOTED = 'The state is "READY".';

/** Canonical Markdown, its reparse and a stable second serialization. */
function persisted(document: MystDocument): { markdown: string; reparsed: MystDocument } {
  const markdown = serialize(document);
  const reparsed = parse(markdown);
  assert.equal(serialize(reparsed), markdown);
  return { markdown, reparsed };
}

function texts(document: MystDocument): string[] {
  return getEditableDocument(document).blocks.map((block) =>
    block.block === "figure" ? block.caption.text
      : block.block === "table" ? block.rows.flatMap((row) => row.cells.map((cell) => cell.text)).join("|")
      : "text" in block ? block.text : "");
}

test("straight quotes in source are the user's text, not typographic quotes", () => {
  const source = `${APOSTROPHE}\n\n${QUOTED}\n`;
  const document = parse(source);
  assert.deepEqual(texts(document), [APOSTROPHE, QUOTED]);
  const { markdown, reparsed } = persisted(document);
  assert.equal(markdown, source);
  assert.deepEqual(texts(reparsed), [APOSTROPHE, QUOTED]);
  // Typographic quotes already in a document stay as written too.
  assert.equal(serialize(parse("“Curly” and don’t.\n")), "“Curly” and don’t.\n");
});

test("straight quotes typed through Core operations persist on every text surface", () => {
  const source = [
    "# Title",
    "Body.",
    ":::{note}\nNote body.\n:::",
    "| Key | Value |\n| --- | --- |\n| state | idle |",
    ":::{figure} ./a.png\n:label: fig-a\n\nCaption.\n:::",
  ].join("\n\n") + "\n";
  const text = (value: string): InlineContent => ({ kind: "text", text: value });
  let document = parse(source);
  document = updateNodeTextAtPath(document, [0], "Title", "User's guide");
  document = updateParagraphInlineContent(document, [1], [
    text(`${APOSTROPHE} `),
    { kind: "strong", children: [text("It's \"on\"")] },
    text(" and "),
    { kind: "emphasis", children: [text("'single'")] },
    text(" see "),
    { kind: "link", url: "https://example.org", children: [text('the "spec"')] },
    text("."),
  ]);
  document = updateAdmonitionInlineContent(document, [2], [text(QUOTED)]);
  document = updateTableCell(document, [3, 1, 1], "\"READY\"");
  document = updateFigure(document, [4], { caption: "The system's \"view\"" });
  document = insertHeading(document, 5, 2, "What's \"new\"");
  document = insertParagraph(document, 6, APOSTROPHE);
  document = replaceText(document, APOSTROPHE, QUOTED);

  const expected = [
    "User's guide",
    `${QUOTED} It's "on" and 'single' see the "spec".`,
    QUOTED,
    'Key|Value|state|"READY"',
    'The system\'s "view"',
    'What\'s "new"',
    APOSTROPHE,
  ];
  assert.deepEqual(texts(document), expected);
  const { markdown, reparsed } = persisted(document);
  assert.deepEqual(texts(reparsed), expected);
  assert.equal(/[“”‘’]/.test(markdown), false, markdown);
  assert.equal(getNode(reparsed, [4]).label, "fig-a");

  // A new Figure with a quoted caption is written as typed.
  const figure = insertFigure(parse(""), 0, { imageUrl: "./a.png", imageAlt: "It's", caption: QUOTED });
  assert.deepEqual(texts(persisted(figure).reparsed), [QUOTED]);
});

test("a leading UTF-8 byte order mark is not document content", () => {
  const plain = "# Heading\n\nBody.\n";
  const document = parse(`\uFEFF${plain}`);
  assert.equal(getNode(document, [0]).type, "heading");
  assert.equal(getNode(document, [0]).depth, 1);
  assert.deepEqual(getEditableDocument(document), getEditableDocument(parse(plain)));
  const { markdown } = persisted(document);
  assert.equal(markdown, plain);
  // Only the encoding signature at the very start is dropped; U+FEFF inside text is content.
  assert.equal(texts(parse("a\uFEFFb\n"))[0], "a\uFEFFb");
});

test("front matter fails canonical write instead of being rewritten as a code block", () => {
  for (const source of [
    "---\ntitle: Example\n---\n\n# Heading\n",
    "\uFEFF---\ntitle: Example\n---\n\n# Heading\n",
    // MyST's front matter rule closes an unterminated block at the end of the document.
    "---\n\n# Heading\n\nBody.\n",
  ]) {
    const document = parse(source);
    // Reading still works; only writing is refused.
    assert.equal(getEditableDocument(document).blocks[0].block, "unsupported", source);
    assert.throws(() => serialize(document), (error: unknown) =>
      error instanceof SemanticLossError && /front matter/.test(error.message), source);
  }
  // Edits elsewhere cannot write it either.
  const edited = updateNodeTextAtPath(parse("---\ntitle: Example\n---\n\n# Heading\n"), [1], "Heading", "Changed");
  assert.throws(() => serialize(edited), /front matter/);
});

test("front matter detection follows the parser, not a leading-dash heuristic", () => {
  // Not front matter: each canonical write succeeds and reloads unchanged.
  for (const source of [
    "Title\n---\n\nBody.\n",
    "```yaml\ntitle: Example\n```\n\n# Heading\n",
    "Before.\n\n---\n\nAfter.\n",
    "* item\n",
    "-- a note\n",
  ]) {
    const document = parse(source);
    const { reparsed } = persisted(document);
    assert.deepEqual(getEditableDocument(reparsed), getEditableDocument(document), source);
  }
  // A leading thematic break is not front matter. Canonical Markdown writes it as `---`,
  // which reloads as front matter, so the write fails for that reason, not this one.
  for (const source of ["***\n\nBody.\n", " ---\n\nBody.\n"]) {
    assert.equal(getNode(parse(source), [0]).type, "thematicBreak", source);
    assert.throws(() => serialize(parse(source)), (error: unknown) =>
      error instanceof SemanticLossError && !/front matter/.test(error.message) &&
      /thematicBreak became code/.test(error.message), source);
  }
});
