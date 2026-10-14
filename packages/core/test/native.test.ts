import assert from "node:assert/strict";
import test from "node:test";
import {
  createDocument, parse, serialize, getEditableDocument, NativeDocumentError, canonicalWriteIssue,
  insertHeading, insertParagraph, insertFigure, updateHeadingNumbering, removeBlock,
  updateHeadingInlineContent, updateHeadingLevel, insertFootnote, updateParagraphInlineContent, moveBlock,
} from "@ieumdoc/core";

const native = (body: string) => `---\nieumdoc: 1\n---\n\n${body}`;

test("native admission checks the marker and the complete YAML contract before writing", () => {
  for (const source of ["", "# Title\n", "---\nieumdoc: '1'\n---\n", "---\nieumdoc: 2\n---\n",
    "---\nieumdoc: 1\nieumdoc: 1\n---\n", "---\nieumdoc: [\n---\n", "---\n- ieumdoc: 1\n---\n",
    "---\nieumdoc: 1\ntitle: Title\n---\n", "---\nieumdoc: 1\nnumbering: true\n---\n",
    "---\nieumdoc: 1\nnumbering:\n  headings: true\n  heading_1: 3\n---\n",
    "---\nieumdoc: 1\nnumbering:\n  title: true\n---\n", "---\nieumdoc: 1\n"]) {
    assert.throws(() => parse(source), NativeDocumentError, source);
  }
  const marked = native("# Title\n");
  assert.equal(serialize(parse(`\uFEFF${marked.replaceAll("\n", "\r\n")}`)), marked);
});

test("native admission rejects unsupported structure instead of projecting partial documents", () => {
  for (const body of ["![ordinary](./x.png)\n", "Text ![inline](./x.png).\n", "- [ ] task\n",
    "> One.\n>\n> Two.\n", ":::{note}\n# Nested\n:::\n", "Text {kbd}`Ctrl`.\n",
    "## See {ref}`Custom <target>`\n", "[a](./same)[b](./same)\n", "| A |\n|---|\n| ![x](./x.png) |\n",
    "Text[^a].\n\n[^a]: One.\n\n    Two.\n", ":::{figure} ./x.png\n:width: 100px\n:::\n",
    "```{math}\n:enumerated: false\nx\n```\n"]) {
    assert.throws(() => parse(native(body)), NativeDocumentError, body);
  }
});

test("native supported semantics accept alternative spellings and preserve snapshot paths", () => {
  const body = "Title\n=====\n\nA **bold** [link](./x) and $y$.\n\n- item\n  - nested\n\n> Quote.\n\n---\n\n:::{note}\nNote.\n:::\n\n```ts\nconst n = 1;\n```\n\n| A | B |\n|:--|--:|\n| x | y |\n\nSee[^a] and {ref}`later`.\n\n[^a]: A note.\n";
  const document = parse(native(body));
  const blocks = getEditableDocument(document).blocks;
  assert.deepEqual(blocks[0].path, [1]);
  assert.equal(blocks[0].block, "heading");
  const markdown = serialize(document);
  assert.match(markdown, /# Title/);
  assert.equal(serialize(parse(markdown)), markdown);
  assert.deepEqual(getEditableDocument(parse(markdown)), getEditableDocument(document));
});

test("creation and authoring retain the marker, including empty Figures and unresolved references", () => {
  const empty = createDocument();
  assert.deepEqual(getEditableDocument(empty).blocks, []);
  let document = insertHeading(empty, 1, 1, "Title");
  document = insertParagraph(document, 2, "Body.");
  document = insertFigure(document, 3, { imageUrl: "", imageAlt: "", caption: "" });
  document = updateHeadingInlineContent(document, [1], [{ kind: "text", text: "Updated title" }]);
  document = updateHeadingLevel(document, [1], 1, 2);
  document = insertFootnote(document, [2], 5, [{ kind: "text", text: "Note." }]);
  const heading = getEditableDocument(document).blocks[0];
  assert.equal(heading.block, "heading");
  assert(heading.block === "heading");
  assert.equal(heading.text, "Updated title");
  assert.equal(heading.level, 2);
  document = updateHeadingNumbering(document, true);
  const orphan = updateParagraphInlineContent(document, [2], [{ kind: "text", text: "Body." }]);
  assert.throws(() => serialize(moveBlock(orphan, 2, 1)), /has no reference/);
  const source = serialize(document);
  assert.match(source, /^---\nieumdoc: 1\nnumbering:\n  headings: true\n  title: false\n---/);
  assert.equal(serialize(parse(source)), source);
  assert.equal(canonicalWriteIssue(document), undefined);
  assert.throws(() => serialize(removeBlock(document, 0)), NativeDocumentError);
  assert.match(canonicalWriteIssue(removeBlock(document, 0))?.reason ?? "", /frontmatter/);
});
