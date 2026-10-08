import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getEditableDocument,
  insertParagraph,
  parse,
  serialize,
  updateParagraphInlineContent,
  updateNodeTextAtPath,
  type InlineContent,
} from "./core-internal.ts";

const source = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");

test("paragraph insertion accepts rich inline semantics without a lossy text intermediate", () => {
  const content: InlineContent[] = [
    { kind: "strong", children: [{ kind: "text", text: "Voltage" }] },
    { kind: "text", text: " " }, { kind: "math", value: "V_{dc}" },
    { kind: "text", text: " at " },
    { kind: "link", url: "https://example.com", children: [{ kind: "text", text: "source" }] },
  ];
  const original = parse("# Title\n");
  const inserted = insertParagraph(original, 1, content);
  const saved = serialize(inserted);
  const block = getEditableDocument(parse(saved)).blocks[1];
  assert.ok(block.block === "paragraph");
  assert.deepEqual(block.content, content);
  assert.equal(serialize(original), "# Title\n");
  assert.throws(() => insertParagraph(original, 1, [{ kind: "math", value: "" }]), /math/);
});

test("strikethrough is editable inline content written as the {del} role", () => {
  const paragraph = getEditableDocument(parse("A {del}`gone **bold**` text.\n")).blocks[0];
  assert.ok(paragraph.block === "paragraph" && paragraph.editable);
  assert.deepEqual(paragraph.content[1], { kind: "delete", children: [
    { kind: "text", text: "gone " }, { kind: "strong", children: [{ kind: "text", text: "bold" }] },
  ] });

  const content: InlineContent[] = [
    { kind: "emphasis", children: [{ kind: "text", text: "Old " }, { kind: "delete", children: [{ kind: "text", text: "value" }] }] },
    { kind: "text", text: " " }, { kind: "delete", children: [{ kind: "math", value: "x" }] },
  ];
  const saved = serialize(insertParagraph(parse("# Title\n"), 1, content));
  assert.ok(saved.includes("{del}`value`"), saved);
  const block = getEditableDocument(parse(saved)).blocks[1];
  assert.ok(block.block === "paragraph");
  assert.deepEqual(block.content, content);
});

test("subscript and superscript are editable inline content written as the {sub} and {sup} roles", () => {
  const paragraph = getEditableDocument(parse("H{sub}`2`O and x{sup}`*n*+1`.\n")).blocks[0];
  assert.ok(paragraph.block === "paragraph" && paragraph.editable);
  assert.deepEqual(paragraph.content, [
    { kind: "text", text: "H" }, { kind: "subscript", children: [{ kind: "text", text: "2" }] },
    { kind: "text", text: "O and x" },
    { kind: "superscript", children: [{ kind: "emphasis", children: [{ kind: "text", text: "n" }] }, { kind: "text", text: "+1" }] },
    { kind: "text", text: "." },
  ]);

  const content: InlineContent[] = [
    { kind: "text", text: "m" }, { kind: "superscript", children: [{ kind: "text", text: "2" }] },
    { kind: "text", text: " " },
    { kind: "link", url: "https://example.com", children: [{ kind: "text", text: "Acme" }, { kind: "superscript", children: [{ kind: "text", text: "TM" }] }] },
    { kind: "text", text: " " }, { kind: "strong", children: [{ kind: "subscript", children: [{ kind: "math", value: "x" }] }] },
  ];
  const saved = serialize(insertParagraph(parse("# Title\n"), 1, content));
  assert.ok(saved.includes("m{sup}`2`"), saved);
  const block = getEditableDocument(parse(saved)).blocks[1];
  assert.ok(block.block === "paragraph");
  assert.deepEqual(block.content, content);
});

test("subscript and superscript never nest and hold no references, footnotes or role options", () => {
  const nested: InlineContent[] = [{ kind: "subscript", children: [{ kind: "strong", children: [{ kind: "superscript", children: [{ kind: "text", text: "x" }] }] }] }];
  assert.throws(() => insertParagraph(parse("# Title\n"), 1, nested), /cannot be nested/);
  for (const inner of [{ kind: "footnote", label: "n" }, { kind: "reference", role: "eq", label: "eq-a" }] as InlineContent[]) {
    assert.throws(() => insertParagraph(parse("# Title\n"), 1, [{ kind: "superscript", children: [inner] }]), /references or footnotes/);
  }

  // Written that way they stay read-only with their source, never flattened.
  const document = parse("{sub}``a{sup}`b` ``\n\nA{sup}`[^n]`\n\n{sub class=\"x\"}`k`\n\n[^n]: Note.\n");
  const paragraphs = getEditableDocument(document).blocks.filter((block) => block.block === "paragraph");
  assert.equal(paragraphs.length, 3);
  assert.ok(paragraphs.every((block) => !block.editable));
});

const FORMATTED_TEXT ="The converter regulates the DC-link voltage and phase current.";
const FORMATTED_INLINE: InlineContent[] = [
  { kind: "text", text: "The converter regulates the " },
  { kind: "strong", children: [{ kind: "text", text: "DC-link voltage" }] },
  { kind: "text", text: " and " },
  { kind: "emphasis", children: [{ kind: "text", text: "phase current" }] },
  { kind: "text", text: "." },
];

test("formatted paragraph projects to editor-neutral inline content", () => {
  const paragraph = formattedParagraph(parse(source));
  assert.equal(paragraph.editable, true);
  assert.deepEqual(paragraph.content, FORMATTED_INLINE);
});

test("paragraph inline write preserves strong and emphasis", () => {
  const document = parse(source);
  const paragraph = formattedParagraph(document);
  const content = replacePlainText(paragraph.content, "regulates", "controls");
  const markdown = serialize(updateParagraphInlineContent(document, paragraph.path, content));
  assert.equal(markdown.includes("The converter controls the **DC-link voltage** and *phase current*."), true);
  assert.equal(markdown.includes("The converter regulates the"), false);
});

test("paragraph inline mutation round-trips through parse and serialize", () => {
  const document = parse(source);
  const paragraph = formattedParagraph(document);
  const expected = replacePlainText(FORMATTED_INLINE, "regulates", "controls");
  const markdown = serialize(updateParagraphInlineContent(document, paragraph.path, expected));
  const reparsed = getEditableDocument(parse(markdown)).blocks.find(
    (block) => block.block === "paragraph" && block.text === "The converter controls the DC-link voltage and phase current.",
  );
  assert.equal(reparsed?.block, "paragraph");
  if (reparsed?.block !== "paragraph") return;
  assert.equal(reparsed.editable, true);
  assert.deepEqual(reparsed.content, expected);
  assert.equal(serialize(parse(markdown)), markdown);
});

test("unsupported inline remains read-only", () => {
  const xref = getEditableDocument(parse(source)).blocks.find(
    (block) => block.block === "paragraph" && block.text.includes("fig-control"),
  );
  assert.equal(xref?.block, "paragraph");
  if (xref?.block !== "paragraph") return;
  assert.equal(xref.editable, false);
  assert.deepEqual(xref.content, []);
});

function formattedParagraph(document: ReturnType<typeof parse>) {
  const paragraph = getEditableDocument(document).blocks.find(
    (block) => block.block === "paragraph" && block.text === FORMATTED_TEXT,
  );
  assert.equal(paragraph?.block, "paragraph");
  if (paragraph?.block !== "paragraph") {
    throw new Error("missing formatted paragraph");
  }
  return paragraph;
}

function replacePlainText(content: InlineContent[], from: string, to: string): InlineContent[] {
  return content.map((item) => {
    if (item.kind === "text") {
      return { kind: "text", text: item.text.replaceAll(from, to) };
    }
    if (!("children" in item)) return item;
    return { ...item, children: replacePlainText(item.children, from, to) };
  });
}

test("Core rejects persistent inline edits that lose text, marks or block shape", () => {
  const document = parse("Original.");
  const before = structuredClone(document);
  for (const content of [
    [{ kind: "strong", children: [{ kind: "text", text: "AB " }] }],
    [{ kind: "emphasis", children: [{ kind: "text", text: " AB" }] }],
    [{ kind: "text", text: "A\n\nB" }],
    [],
  ] as InlineContent[][]) {
    assert.throws(() => updateParagraphInlineContent(document, [0], content), /cannot.*(round-trip|saved)/);
    assert.deepEqual(document, before);
  }
  assert.throws(() => updateNodeTextAtPath(parse("# Original"), [0], "Original", "A\n\nB"), /round-trip/);
  assert.throws(() => updateNodeTextAtPath(document, [0], "Original.", "A\n\nB"), /round-trip/);
});

test("equivalent mark nesting and adjacent text fragments remain supported", () => {
  const expected: InlineContent[] = [
    { kind: "strong", children: [{ kind: "emphasis", children: [{ kind: "text", text: "AB" }] }] },
    { kind: "text", text: " C" }, { kind: "text", text: "D" },
  ];
  const changed = updateParagraphInlineContent(parse("Original."), [0], expected);
  const markdown = serialize(changed);
  assert.equal(markdown, "***AB*** CD\n");
  assert.equal(serialize(parse(markdown)), markdown);
});


test("adjacent equal marks around a break retain their semantic coverage", () => {
  for (const kind of ["strong", "emphasis"] as const) {
    const content: InlineContent[] = [
      { kind, children: [{ kind: "text", text: "A" }] },
      { kind, children: [{ kind: "break" }] },
      { kind, children: [{ kind: "text", text: "B" }] },
    ];
    const changed = updateParagraphInlineContent(parse("Original."), [0], content);
    const markdown = serialize(changed);
    assert.deepEqual(getEditableDocument(parse(markdown)), getEditableDocument(changed));
    assert.equal(serialize(parse(markdown)), markdown);
  }
});
