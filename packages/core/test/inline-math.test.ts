import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getEditableDocument,
  getNode,
  insertHardBreak,
  parse,
  serialize,
  splitParagraph,
  updateParagraphInlineContent,
  type InlineContent,
  type MystDocument,
} from "./core-internal.ts";

const text = (value: string): InlineContent => ({ kind: "text", text: value });
const math = (value: string): InlineContent => ({ kind: "math", value });

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

test("paragraphs with inline math are editable inline content", () => {
  assert.deepEqual(paragraph(parse("The current is $i_d$ and the voltage is **$v_{dc}$**.\n")), {
    block: "paragraph",
    path: [0],
    text: "The current is $i_d$ and the voltage is $v_{dc}$.",
    content: [
      text("The current is "), math("i_d"), text(" and the voltage is "),
      { kind: "strong", children: [math("v_{dc}")] }, text("."),
    ],
    editable: true,
  });
  assert.deepEqual(paragraph(parse("Role {math}`x^2` here.\n"))?.content, [text("Role "), math("x^2"), text(" here.")]);
  assert.deepEqual(paragraph(parse("[link $x$ text](https://a.example) and *$y$*\\\nend\n"))?.content, [
    { kind: "link", url: "https://a.example", children: [text("link "), math("x"), text(" text")] },
    text(" and "),
    { kind: "emphasis", children: [math("y")] },
    { kind: "break" },
    text("end"),
  ]);
});

test("inline math is written in its canonical role form", () => {
  // `$...$` and {math} both parse to inline math; the canonical form is the role.
  assert.equal(serialize(parse("The current is $i_d$ and **$v_{dc}$**.\n")),
    "The current is {math}`i_d` and **{math}`v_{dc}`**.\n");
});

test("inline math source can be changed, created and removed", () => {
  const source = "The current is $i_d$.\n";
  assert.equal(write(source, [text("The current is "), math("i_q"), text(".")]), "The current is {math}`i_q`.\n");
  assert.equal(write("Voltage v_dc here.\n", [text("Voltage "), math("v_{dc}"), text(" here.")]),
    "Voltage {math}`v_{dc}` here.\n");
  assert.equal(write(source, [text("The current is i_d.")]), "The current is i\\_d.\n");
  // Sources with backticks, dollars and braces are kept literally.
  assert.equal(write(source, [text("A "), math("a`b $c$ {d}")]), "A {math}``a`b $c$ {d}``\n");
  assert.equal(write(source, [math("x")]), "{math}`x`\n");
});

test("inline math keeps its meaning with bold, italic, links and breaks", () => {
  const source = "Plain.\n";
  assert.equal(write(source, [{ kind: "strong", children: [text("bold "), math("x")] }, text(" and "),
    { kind: "emphasis", children: [math("y")] }]), "**bold {math}`x`** and *{math}`y`*\n");
  assert.equal(write(source, [{ kind: "link", url: "u", children: [text("see "), math("z")] }]), "[see {math}`z`](u)\n");
  assert.equal(write(source, [math("a"), { kind: "break" }, math("b")]), "{math}`a`\\\n{math}`b`\n");
});

test("inline math counts as one offset for split and hard break", () => {
  const source = "Let $x$, then y.\n";
  // Offsets: "Let " = 4, math = 1, ", then y." = 9; offset 5 is right after the math.
  assert.equal(serialize(insertHardBreak(parse(source), [0], 5)), "Let {math}`x`\\\n, then y.\n");
  assert.equal(serialize(splitParagraph(parse(source), [0], 5)), "Let {math}`x`\n\n, then y.\n");
  assert.throws(() => splitParagraph(parse(source), [0], 14), /offset/);
});

test("display equations and cross-references are unchanged", () => {
  const document = parse(readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8"));
  const index = getEditableDocument(document).blocks.findIndex((block) =>
    block.block === "paragraph" && block.text === "The current reference is calculated from the active power command.");
  const markdown = serialize(updateParagraphInlineContent(document, [index],
    [text("The current reference "), math("i^{\\ast}"), text(" is calculated from the active power command.")]));
  const reparsed = parse(markdown);
  assert.equal(getNode(reparsed, [index + 1]).type, "math");
  assert.equal(getNode(reparsed, [index + 1]).label, "eq-current");
  assert.equal(getNode(reparsed, [2, 3]).type, "crossReference");
  assert.equal(paragraph(reparsed, 2)?.editable, false);
});

test("inline math that cannot be preserved is rejected before any change", () => {
  const document = parse("See $x$.\n");
  const before = structuredClone(document);
  const rejected: [InlineContent[], RegExp][] = [
    [[math("")], /non-empty single-line/],
    [[math("a\nb")], /non-empty single-line/],
    // A leading or trailing backtick cannot be written in the role form.
    [[text("A "), math("`x")], /cannot round-trip/],
    [[text("A "), math("x`")], /cannot round-trip/],
  ];
  for (const [content, reason] of rejected) {
    assert.throws(() => updateParagraphInlineContent(document, [0], content), reason, JSON.stringify(content));
  }
  assert.deepEqual(document, before);
});
