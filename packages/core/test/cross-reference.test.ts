import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLabel } from "myst-common";
import {
  getEditableDocument,
  getNode,
  inlineContentLength,
  insertHardBreak,
  labelKey,
  mergeParagraphWithPrevious,
  parse,
  serialize,
  splitParagraph,
  updateAdmonitionInlineContent,
  updateParagraphInlineContent,
  type InlineContent,
  type MystDocument,
} from "./core-internal.ts";

const text = (value: string): InlineContent => ({ kind: "text", text: value });
const ref = (role: "eq" | "numref", label: string): InlineContent => ({ kind: "reference", role, label });
const strong = (children: InlineContent[]): InlineContent => ({ kind: "strong", children });
const emphasis = (children: InlineContent[]): InlineContent => ({ kind: "emphasis", children });

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

test("paragraphs with {eq} and {numref} references are editable inline content", () => {
  assert.deepEqual(paragraph(parse("See {eq}`eq-current` and {numref}`fig-control`.\n")), {
    block: "paragraph",
    path: [0],
    text: "See {eq}`eq-current` and {numref}`fig-control`.",
    content: [text("See "), ref("eq", "eq-current"), text(" and "), ref("numref", "fig-control"), text(".")],
    editable: true,
  });
  // The written label is kept as written; MyST resolves it case-insensitively.
  assert.deepEqual(paragraph(parse("{eq}`EQ-A`\n"))?.content, [ref("eq", "EQ-A")]);
  assert.deepEqual(paragraph(parse("See **{eq}`eq-a`** and *{numref}`fig-a`*.\n"))?.content,
    [text("See "), strong([ref("eq", "eq-a")]), text(" and "), emphasis([ref("numref", "fig-a")]), text(".")]);
});

test("references outside the v1 subset stay read-only", () => {
  for (const source of [
    "See {numref}`Figure %s <fig-a>`.", // custom display text
    "See {eq}`Eq <eq-a>`.",
    "See {ref}`sec-a`.", // heading targets are not authored in v1
    "See [{eq}`eq-a`](https://x.example).", // a reference inside a link
    "See [](#eq-a).", // an empty-text fragment link stays what it was
    "See {term}`x`.",
  ]) {
    assert.equal(paragraph(parse(`${source}\n`))?.editable, false, source);
  }
});

test("references can be inserted, retargeted and removed around ordinary text", () => {
  const plain = "See the equation and the figure.\n";
  assert.equal(write(plain, [text("See "), ref("eq", "eq-a"), text(" and "), ref("numref", "fig-a"), text(".")]),
    "See {eq}`eq-a` and {numref}`fig-a`.\n");
  const linked = "See {eq}`eq-a` here.\n";
  assert.equal(write(linked, [text("See "), ref("eq", "eq-b"), text(" here.")]), "See {eq}`eq-b` here.\n");
  assert.equal(write(linked, [text("See "), ref("numref", "fig-a"), text(" here.")]), "See {numref}`fig-a` here.\n");
  assert.equal(write(linked, [text("See eq-a here.")]), "See eq-a here.\n");
  assert.equal(write(linked, [text("Now see "), ref("eq", "eq-a"), text(" there.")]), "Now see {eq}`eq-a` there.\n");
  // A reference alone is a persistent paragraph.
  assert.equal(write(linked, [ref("eq", "eq-a")]), "{eq}`eq-a`\n");
});

test("references coexist with bold, italic, ordinary links, inline math and hard breaks", () => {
  const content: InlineContent[] = [
    strong([text("Bold "), ref("eq", "eq-a")]),
    text(" "),
    emphasis([ref("numref", "fig-a")]),
    text(" and "),
    { kind: "link", url: "#eq-a", children: [text("details")] },
    text(" with "),
    { kind: "math", value: "x" },
    { kind: "break" },
    ref("eq", "eq-b"),
  ];
  const markdown = write("Plain.\n", content);
  assert.equal(markdown, "**Bold {eq}`eq-a`** *{numref}`fig-a`* and [details](#eq-a) with {math}`x`\\\n{eq}`eq-b`\n");
  // The ordinary fragment link and the semantic reference never convert into each other.
  const reparsed = parse(markdown);
  assert.equal(getNode(reparsed, [0, 4]).type, "link");
  assert.equal(getNode(reparsed, [0, 0, 1]).type, "crossReference");
});

test("a reference is one offset unit for split, merge and hard break", () => {
  const document = parse("A {eq}`eq-a`, B\n");
  assert.equal(inlineContentLength(paragraph(document)!.content), 6);
  const split = splitParagraph(document, [0], 3);
  assert.equal(serialize(split), "A {eq}`eq-a`\n\n, B\n");
  assert.equal(serialize(mergeParagraphWithPrevious(split, [1])), "A {eq}`eq-a`, B\n");
  assert.equal(serialize(insertHardBreak(document, [0], 3)), "A {eq}`eq-a`\\\n, B\n");
});

test("a simple admonition body with a reference is editable like a paragraph", () => {
  const document = parse(":::{note}\nSee {eq}`eq-a`.\n:::\n");
  const block = getEditableDocument(document).blocks[0];
  assert.ok(block.block === "admonition");
  assert.equal(block.editable, true);
  assert.deepEqual(block.content, [text("See "), ref("eq", "eq-a"), text(".")]);
  const next = updateAdmonitionInlineContent(document, [0], [text("See "), ref("numref", "fig-a"), text(" now.")]);
  assert.equal(serialize(next), ":::{note}\nSee {numref}`fig-a` now.\n:::\n");
});

test("unresolved references are kept as written and do not block saving", () => {
  assert.equal(write("Plain.\n", [text("See "), ref("eq", "missing"), text(".")]), "See {eq}`missing`.\n");
});

test("reference labels that cannot be written or read back fail closed", () => {
  for (const label of ["", " eq", "eq\nb", "eq<a>", "\"\""]) {
    assert.throws(() => updateParagraphInlineContent(parse("Plain.\n"), [0], [ref("eq", label)]), Error, JSON.stringify(label));
  }
  assert.throws(() => updateParagraphInlineContent(parse("Plain.\n"), [0],
    [{ kind: "reference", role: "ref", label: "sec-a" } as never]), /reference role/);
  assert.throws(() => updateParagraphInlineContent(parse("Plain.\n"), [0],
    [{ kind: "link", url: "u", children: [ref("eq", "eq-a")] }]), /links cannot contain references/);
});

test("labelKey matches the identifier MyST resolves references with", () => {
  for (const label of ["eq-a", "EQ-A", "Eq  Current", "a\"b", "‘quoted’", " lead", "trail ", "식-1", "a\tb", "a`b"]) {
    assert.equal(labelKey(label), normalizeLabel(label)?.identifier ?? "", JSON.stringify(label));
  }
  assert.equal(labelKey(""), "");
});
