import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getEditableDocument,
  parse,
  serialize,
  updateParagraphInlineContent,
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
    return { ...item, children: replacePlainText(item.children, from, to) };
  });
}
