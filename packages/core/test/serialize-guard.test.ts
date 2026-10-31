import assert from "node:assert/strict";
import test from "node:test";
import { writeMd } from "myst-to-md";
import { VFile } from "vfile";
import { parse, serialize, type MystDocument, type MystNode } from "./core-internal.ts";
import { semanticDifference, semanticFingerprint } from "../src/myst/fingerprint.ts";

// Core canonical serialization never returns Markdown that loses document semantics.

test("parse and canonical write refuse unpaired surrogates in text and non-body string fields", () => {
  for (const invalid of ["A\uD800B", "A\uDC00B", "\uD800\uD800", "\uDC00\uD800"]) {
    assert.throws(() => parse(invalid), /Invalid Unicode: unpaired surrogate/);
    for (const [source, path, field] of [
      ["Body.\n", [0, 0], "value"],
      ["```python\nprint(1)\n```\n", [0], "value"],
      ["```python\nprint(1)\n```\n", [0], "lang"],
      ["[link](https://example.com \"Title\")\n", [0, 0], "url"],
      ["[link](https://example.com \"Title\")\n", [0, 0], "title"],
      ["---\nlitzio: 1\n---\n\nBody.\n", [0], "value"],
    ] as const) {
      const document = parse(source);
      assert.doesNotThrow(() => serialize(document));
      let node: MystNode = document;
      for (const index of path) node = node.children![index];
      node[field] = invalid;
      assert.throws(() => serialize(document), /Invalid Unicode: unpaired surrogate/, field);
    }
  }
  const valid = "한글 😀 �\n";
  assert.equal(serialize(parse(valid)), valid);
});

/** What myst-to-md alone produces: the output Core used to return unchecked. */
function rawMyst(source: string): { markdown: string; messages: string[] } {
  const file = new VFile();
  writeMd(file, parse(source) as never);
  return { markdown: String(file.result), messages: file.messages.map((message) => message.reason) };
}

test("Layer 1: myst-to-md diagnostics reject partial output", () => {
  // myst-to-md renders the unsupported node as "" and keeps going.
  const source = "Before {kbd}`Ctrl` after\n";
  const raw = rawMyst(source);
  assert.equal(raw.markdown, "Before  after");
  assert.ok(raw.messages.length > 0 && raw.messages.every((reason) => reason === "Unsupported node type: keyboard"));
  assert.throws(() => serialize(parse(source)), /cannot be preserved in canonical Markdown: .*keyboard/);

  for (const [source, reason] of [
    ["{span}`x`\n", /span/],
    ["{chem}`H2O`\n", /chemicalFormula/],
    [":::{div}\nBody\n:::\n", /div/],
    ["```{raw} latex\n\\foo\n```\n", /raw/],
    ["```{code-cell} python\nprint(1)\n```\n", /outputs/],
    [":::{epigraph}\nQuote\n:::\n", /Unknown kind on container node: quote/],
  ] as const) {
    assert.throws(() => serialize(parse(source)), reason);
  }
});

test("Layer 2: losses without any diagnostic are rejected by the semantic fingerprint", () => {
  const cases: [string, string, RegExp][] = [
    // Only the first subfigure is written; the second image disappears.
    [":::{figure}\n![a](./a.png)\n![b](./b.png)\n:::\n", "./b.png", /container > container: container became image/],
    // The embed target argument is dropped and reparses as a directive error.
    ["```{embed} #label\n```\n", "#label", /embed became mystDirectiveError/],
  ];
  for (const [source, lost, reason] of cases) {
    const raw = rawMyst(source);
    assert.deepEqual(raw.messages, [], source);
    assert.equal(raw.markdown.includes(lost), false, source);
    assert.throws(() => serialize(parse(source)), reason, source);
  }
});

test("ordinary images keep their absent alignment instead of gaining directive defaults", () => {
  // The `{image}` directive defaults `align` to center; a Markdown image has no alignment.
  assert.match(rawMyst("![alt](./x.png)\n").markdown, /^```\{image\}/);
  assert.equal(serialize(parse("![alt](./x.png)\n")), "![alt](./x.png)\n");
});

test("supported documents serialize unchanged, deterministically and idempotently", () => {
  for (const source of [
    "# Title\n\n## Section\n\nPlain **strong** and *emphasis* with ***both***.\\\nHard break.\n",
    "Inline $x$ and [a link](https://example.org \"title\") and [](#target).\n",
    "```{math}\n:label: eq-a\nx^2\n```\n\n$$\ny\n$$ (eq-b)\n",
    ":::{figure} ./a.png\n:label: fig-a\n:alt: Alt\n\nCaption\n:::\n",
    "| a | b |\n| --- | --- |\n| 1 | 2 |\n",
    ":::{note}\nBody\n:::\n\n:::{admonition} Title\n:class: tip\nBody\n:::\n",
    "*   one\n*   two\n\n1. first\n2. second\n",
    "(sec-a)=\n\n## A\n\nSee {eq}`eq-a`, {numref}`Figure %s <fig-a>` and {ref}`sec-a`.\n",
  ]) {
    const canonical = serialize(parse(source));
    assert.equal(serialize(parse(source)), canonical);
    assert.equal(serialize(parse(canonical)), canonical);
  }
});

test("canonical Markdown uses LF for LF, CRLF and mixed input and remains idempotent", () => {
  for (const source of [
    "# Title\n\nParagraph.\n",
    "# Title\r\n\r\nParagraph.\r\n",
    "# Title\r\n\nParagraph.\r",
    "# Title\r\rParagraph.\r\n\n",
  ]) {
    const output = serialize(parse(source));
    assert.equal(output.includes("\r"), false);
    assert.equal(output, "# Title\n\nParagraph.\n");
    assert.equal(serialize(parse(output)), output);
  }
});

test("canonical LF output keeps preserved front matter and its meaningful trailing lines", () => {
  const source = "---\r\ntitle: Example\nabstract: |+\r\n  Keep trailing lines.\r\n\r\n---\r\n\nBody.\r\n";
  const output = serialize(parse(source));
  assert.equal(output.includes("\r"), false);
  assert.equal(output, "---\ntitle: Example\nabstract: |+\n  Keep trailing lines.\n\n---\n\nBody.\n");
  assert.equal(serialize(parse(output)), output);
});

test("legitimate canonicalizations are normalized explicitly", () => {
  const grid = "| a | b |\n| :--- | ---: |\n| 1 | 2 |\n";
  const plain = semanticFingerprint(parse(grid));
  assert.deepEqual(semanticFingerprint(parse(`:::{table}\n\n${grid}:::\n`)), plain);
  // Only the empty directive wrapper is representational. Authored content and
  // unknown fields still participate in the full semantic-loss guard.
  for (const changed of [
    `:::{table} Caption\n\n${grid}:::\n`,
    `:::{table}\n:name: tbl-a\n\n${grid}:::\n`,
    grid.replace("1 | 2", "1 | 3"), grid.replace(":---", "---"),
    grid.replace("| 1 | 2 |\n", ""), grid.replaceAll("| b |", "| b | c |").replace("---: |", "---: | --- |"),
  ]) assert.notEqual(semanticDifference(plain, semanticFingerprint(parse(changed))), undefined);
  const unknown = parse(`:::{table}\n\n${grid}:::\n`);
  unknown.children[0].unexpected = true;
  assert.notEqual(semanticDifference(plain, semanticFingerprint(unknown)), undefined);
  assert.throws(() => serialize(unknown), /cannot be preserved/);
  // csv-table and table directives are written as list-table; cells gain a paragraph wrapper.
  for (const source of [
    ":::{csv-table} Cap\n:header: a, b\n1,2\n:::\n",
    ":::{table} Cap\n:label: tbl-y\n| a | b |\n|---|---|\n| 1 | 2 |\n:::\n",
  ]) {
    const markdown = serialize(parse(source));
    assert.match(markdown, /^:::\{table\} Cap\n/);
    assert.equal(serialize(parse(markdown)), markdown);
  }
  // Equivalent mark nesting and text fragmentation carry the same meaning.
  const nested = (outer: string, inner: string): MystDocument => ({
    type: "root",
    children: [{ type: "paragraph", children: [{ type: outer, children: [{ type: inner, children: [
      { type: "text", value: "A" }, { type: "text", value: "B" },
    ] }] }] }],
  });
  assert.equal(semanticDifference(semanticFingerprint(nested("strong", "emphasis")),
    semanticFingerprint(nested("emphasis", "strong"))), undefined);
  assert.equal(serialize(nested("strong", "emphasis")), "***AB***\n");
});

test("the semantic fingerprint detects mutations that keep the node type", () => {
  const document = parse([
    "# Title",
    "",
    "![alt](./a.png \"t\") and [link](https://a.example) and {eq}`Eq <eq-a>`.",
    "",
    "```{math}\n:label: eq-a\nx^2\n```",
    "",
    ":::{note}\n:class: tip\nBody\n:::",
    "",
    "| a | b |\n| --- | --- |\n| 1 | 2 |",
    "",
  ].join("\n"));
  const mutations: [string, (document: MystDocument) => void, RegExp][] = [
    ["image url", (d) => { node(d, [1, 0]).url = "./b.png"; }, /image: url/],
    ["image alt", (d) => { node(d, [1, 0]).alt = "other"; }, /image: alt/],
    ["image title", (d) => { node(d, [1, 0]).title = "other"; }, /image: title/],
    ["link url", (d) => { node(d, [1, 2]).url = "https://b.example"; }, /link: url/],
    ["reference identifier", (d) => { node(d, [1, 4]).identifier = "eq-b"; }, /crossReference: identifier/],
    ["reference text", (d) => { node(d, [1, 4, 0]).value = "Other"; }, /crossReference > text: value/],
    ["heading depth", (d) => { node(d, [0]).depth = 3; }, /heading: depth/],
    ["math value", (d) => { node(d, [2]).value = "y"; }, /math: value/],
    ["directive option", (d) => { node(d, [3]).class = "warning"; }, /admonition: class/],
    ["table cell order", (d) => { node(d, [4, 1]).children?.reverse(); }, /tableCell > text: value/],
    ["dropped child", (d) => { node(d, [4]).children?.pop(); }, /tableRow was dropped/],
  ];
  const expected = semanticFingerprint(document);
  for (const [name, mutate, reason] of mutations) {
    const changed = structuredClone(document);
    mutate(changed);
    assert.match(semanticDifference(expected, semanticFingerprint(changed)) ?? "", reason, name);
  }
  // Source locations are the only ignored fields.
  const moved = structuredClone(document);
  moved.children[0].position = { start: { line: 9, column: 1 }, end: { line: 9, column: 8 } };
  assert.equal(semanticDifference(expected, semanticFingerprint(moved)), undefined);
});

function node(document: MystDocument, path: number[]): MystNode {
  return path.reduce<MystNode>((current, index) => current.children![index], document);
}

test("writer rejects relocated metadata and unrepresentable cell alignment", () => {
  const metadata = parse("---\ntitle: Example\n---\n\nBody.\n");
  metadata.children.reverse();
  assert.throws(() => serialize(metadata), /front matter.*start/);
  const table = parse("| L | R |\n|:--|--:|\n| a | b |\n");
  node(table, [0, 1, 0]).align = "right";
  assert.throws(() => serialize(table), /align/);

});
