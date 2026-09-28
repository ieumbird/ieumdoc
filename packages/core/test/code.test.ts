import assert from "node:assert/strict";
import test from "node:test";
import {
  getEditableDocument,
  insertCodeBlock,
  insertParagraph,
  parse,
  serialize,
  splitParagraph,
  updateCodeBlock,
  type CodeBlockContent,
  type InlineContent,
} from "@ieumdoc/core";

test("fenced and indented code project as editable Code block v1 content", () => {
  const blocks = getEditableDocument(parse("```python\nprint(1)\n```\n\n    indented\n    code\n")).blocks;

  assert.deepEqual(blocks, [
    { block: "code", path: [0], language: "python", code: "print(1)" },
    { block: "code", path: [1], language: "", code: "indented\ncode" },
  ]);
});

test("code-like content outside Code block v1 stays read-only", () => {
  for (const source of [
    "```{code-block} python\n:caption: Setup\nprint(1)\n```\n",
    "---\ntitle: Front matter\n---\n\nBody.\n",
  ]) {
    assert.equal(getEditableDocument(parse(source)).blocks[0]?.block, "unsupported", source);
  }
});

test("public Core inserts and replaces code blocks, keeping whitespace, blank lines and backticks", () => {
  const document = parse("Intro.\n\nAfter.\n");
  const code: CodeBlockContent = { language: "python", code: "\ndef f():\n\treturn \"```\"\n\n" };
  const markdown = serialize(insertCodeBlock(document, 1, code));
  const reparsed = parse(markdown);
  const blocks = getEditableDocument(reparsed).blocks;

  assert.deepEqual(blocks.map((block) => block.block), ["paragraph", "code", "paragraph"]);
  assert.deepEqual(blocks[1], { block: "code", path: [1], ...code });
  assert.equal(serialize(reparsed), markdown);

  const changed = serialize(updateCodeBlock(reparsed, [1], { language: "", code: "plain" }));
  assert.deepEqual(getEditableDocument(parse(changed)).blocks[1], { block: "code", path: [1], language: "", code: "plain" });
  assert.equal(changed, "Intro.\n\n```\nplain\n```\n\nAfter.\n");
  // Omitted properties are unchanged.
  assert.equal(serialize(updateCodeBlock(parse(changed), [1], { language: "text" })), "Intro.\n\n```text\nplain\n```\n\nAfter.\n");
});

test("public Core rejects invalid code block edits without mutating the source", () => {
  const document = parse("Intro.\n\n```js\nx\n```\n");
  const before = serialize(document);
  const code = { language: "js", code: "y" };
  const invalid = [
    () => insertCodeBlock(document, 1, { language: "two words", code: "x" }),
    () => insertCodeBlock(document, 1, { language: "{math}", code: "x" }),
    () => insertCodeBlock(document, 1, { language: "js", code: "a\r\nb" }),
    () => insertCodeBlock(document, 9, code),
    () => updateCodeBlock(document, [0], code),
    () => updateCodeBlock(document, [1, 0], code),
  ];
  for (const operation of invalid) {
    assert.throws(operation);
    assert.equal(serialize(document), before);
  }
  const captioned = parse("```{code-block} js\n:caption: Cap\nx\n```\n");
  assert.throws(() => updateCodeBlock(captioned, [0], code), /not editable/);
});

test("inline code is paragraph content, alone or inside marks and links, and round-trips", () => {
  const content: InlineContent[] = [
    { kind: "text", text: "Run " },
    { kind: "code", value: "a`b" },
    { kind: "text", text: " then " },
    { kind: "strong", children: [{ kind: "code", value: " spaced " }] },
    { kind: "text", text: " per " },
    { kind: "link", url: "https://example.com", children: [{ kind: "code", value: "docs" }] },
  ];
  const markdown = serialize(insertParagraph(parse("# T\n"), 1, content));
  const paragraph = getEditableDocument(parse(markdown)).blocks[1];

  assert.equal(paragraph?.block === "paragraph" && paragraph.editable, true);
  assert.deepEqual(paragraph?.block === "paragraph" && paragraph.content, content);
  assert.equal(serialize(parse(markdown)), markdown);
  assert.throws(() => insertParagraph(parse("# T\n"), 1, [{ kind: "code", value: "a\nb" }]), /inline code/);
  assert.throws(() => insertParagraph(parse("# T\n"), 1, [{ kind: "code", value: "" }]), /inline code/);
});

test("inline code counts its characters for paragraph offsets and adjacent spans merge", () => {
  const split = splitParagraph(parse("Call `render()` now.\n"), [0], 9);
  assert.deepEqual(getEditableDocument(split).blocks.map((block) => block.block === "paragraph" && block.content), [
    [{ kind: "text", text: "Call " }, { kind: "code", value: "rend" }],
    [{ kind: "code", value: "er()" }, { kind: "text", text: " now." }],
  ]);

  const merged = getEditableDocument(insertParagraph(parse("# T\n"), 1, [{ kind: "code", value: "a" }, { kind: "code", value: "b" }])).blocks[1];
  assert.deepEqual(merged?.block === "paragraph" && merged.content, [{ kind: "code", value: "ab" }]);
});
