import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getEditableDocument,
  parse,
  serialize,
  updateParagraphInlineContent,
  updateNodeTextAtPath,
  type InlineContent,
} from "../src/index.ts";

const source = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");

const FORMATTED_TEXT = "The converter regulates the DC-link voltage and phase current.";
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
    if (item.kind === "break") return item;
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
