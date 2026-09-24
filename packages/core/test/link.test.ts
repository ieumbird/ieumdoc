import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getEditableDocument,
  getNode,
  insertHardBreak,
  mergeParagraphWithPrevious,
  parse,
  serialize,
  splitParagraph,
  updateParagraphInlineContent,
  type InlineContent,
  type MystDocument,
} from "./core-internal.ts";

const text = (value: string): InlineContent => ({ kind: "text", text: value });
const link = (url: string, children: InlineContent[], title?: string): InlineContent =>
  ({ kind: "link", url, ...(title !== undefined ? { title } : {}), children });

function paragraph(document: MystDocument, index = 0) {
  const block = getEditableDocument(document).blocks[index];
  assert.equal(block?.block, "paragraph");
  return block?.block === "paragraph" ? block : undefined;
}

function write(source: string, content: InlineContent[]): string {
  const markdown = serialize(updateParagraphInlineContent(parse(source), [0], content));
  assert.equal(serialize(parse(markdown)), markdown);
  assert.deepEqual(paragraph(parse(markdown))?.content, content);
  return markdown;
}

test("paragraphs with ordinary links are editable inline content", () => {
  assert.deepEqual(paragraph(parse("See [OpenAI](https://openai.com) for details.\n")), {
    block: "paragraph",
    path: [0],
    text: "See OpenAI for details.",
    content: [text("See "), link("https://openai.com", [text("OpenAI")]), text(" for details.")],
    editable: true,
  });
  assert.deepEqual(paragraph(parse("[t](https://a.example \"Title\")\n"))?.content,
    [link("https://a.example", [text("t")], "Title")]);
  assert.deepEqual(paragraph(parse("[details](#eq-current)\n"))?.content, [link("#eq-current", [text("details")])]);
  assert.deepEqual(paragraph(parse("<https://auto.example>\n"))?.content,
    [link("https://auto.example", [text("https://auto.example")])]);
  assert.deepEqual(paragraph(parse("**a [b](u) c** and [**d**](v)\n"))?.content, [
    { kind: "strong", children: [text("a "), link("u", [text("b")]), text(" c")] },
    text(" and "),
    link("v", [{ kind: "strong", children: [text("d")] }]),
  ]);
});

test("cross-references and unsupported link forms stay read-only", () => {
  for (const source of [
    "See {eq}`eq-current` here.",
    "See [](#eq-current) here.",
    "[a `code` link](u)",
    "[![img](i.png)](u)",
    "{download}`./file.zip` text",
  ]) {
    assert.equal(paragraph(parse(`${source}\n`))?.editable, false, source);
  }
});

test("links can be added, retargeted, retitled, relabeled and removed", () => {
  const source = "See OpenAI for details.\n";
  assert.equal(write(source, [text("See "), link("https://openai.com", [text("OpenAI")]), text(" for details.")]),
    "See [OpenAI](https://openai.com) for details.\n");
  const linked = "See [OpenAI](https://openai.com) for details.\n";
  assert.equal(write(linked, [text("See "), link("https://openai.com/research", [text("OpenAI")], "Research"), text(" for details.")]),
    "See [OpenAI](https://openai.com/research \"Research\") for details.\n");
  assert.equal(write(linked, [text("See "), link("https://openai.com", [text("the OpenAI site")]), text(" for details.")]),
    "See [the OpenAI site](https://openai.com) for details.\n");
  assert.equal(write(linked, [text("See OpenAI for details.")]), "See OpenAI for details.\n");
});

test("bold, italic, breaks and adjacent links keep their meaning", () => {
  const source = "Plain.\n";
  assert.equal(write(source, [{ kind: "strong", children: [text("a "), link("u", [text("b")]), text(" c")] }]),
    "**a [b](u) c**\n");
  assert.equal(write(source, [link("u", [{ kind: "emphasis", children: [text("inner")] }, text(" text")])]),
    "[*inner* text](u)\n");
  assert.equal(write(source, [link("u", [text("a"), { kind: "break" }, text("b")])]), "[a\\\nb](u)\n");
  // Two adjacent links to the same target stay two links.
  assert.equal(write(source, [link("x", [text("a")]), link("x", [text("b")])]), "[a](x)[b](x)\n");
});

test("ordinary fragment links stay links next to semantic references", () => {
  const document = parse(readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8"));
  const index = getEditableDocument(document).blocks.findIndex((block) =>
    block.block === "paragraph" && block.text === "The current reference is calculated from the active power command.");
  const content = [text("The current reference is "), link("#eq-current", [text("calculated")]), text(" from the active power command.")];
  const markdown = serialize(updateParagraphInlineContent(document, [index], content));
  assert.match(markdown, /^The current reference is \[calculated\]\(#eq-current\) from the active power command\.$/m);
  const reparsed = parse(markdown);
  assert.equal(getNode(reparsed, [index, 1]).type, "link");
  assert.equal(getNode(reparsed, [2, 3]).type, "crossReference");
  assert.equal(getNode(reparsed, [2, 3]).kind, "eq");
});

test("split, hard break and merge keep links as links", () => {
  const source = "Go to [the site](https://a.example) now.\n";
  const split = splitParagraph(parse(source), [0], 8);
  assert.equal(serialize(split), "Go to [th](https://a.example)\n\n[e site](https://a.example) now.\n");
  const broken = insertHardBreak(parse(source), [0], 8);
  assert.equal(serialize(broken), "Go to [th\\\ne site](https://a.example) now.\n");
  const merged = mergeParagraphWithPrevious(parse("[a](x)\n\n[b](x)\n"), [1]);
  assert.equal(serialize(merged), "[a](x)[b](x)\n");
});

test("links that cannot be preserved are rejected before any change", () => {
  const document = parse("See OpenAI.\n");
  const before = structuredClone(document);
  const rejected: [InlineContent[], RegExp][] = [
    [[link("", [text("x")])], /URL must be non-empty/],
    [[link("a b", [text("x")])], /no whitespace/],
    [[link("u", [])], /link text cannot be empty/],
    [[link("u", [link("v", [text("x")])])], /cannot contain links/],
    [[link("u", [text("x")], "a\nb")], /single-line/],
    // The parser percent-encodes this URL, so it would not come back as written.
    [[link("https://example.com/한글", [text("x")])], /cannot round-trip/],
  ];
  for (const [content, reason] of rejected) {
    assert.throws(() => updateParagraphInlineContent(document, [0], content), reason, JSON.stringify(content));
  }
  assert.deepEqual(document, before);
});

