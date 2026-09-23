import assert from "node:assert/strict";
import test from "node:test";
import { writeMd } from "myst-to-md";
import { VFile } from "vfile";
import { parse, serialize, type MystDocument, type MystNode } from "./core-internal.ts";
import { semanticDifference, semanticFingerprint } from "../src/myst/fingerprint.ts";

// Core canonical serialization never returns Markdown that loses document semantics.

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
    // Task list checkboxes are dropped, leaving plain bullets.
    ["- [ ] task\n- [x] done\n", "[x]", /listItem: checked false became \(absent\)/],
  ];
  for (const [source, lost, reason] of cases) {
    const raw = rawMyst(source);
    assert.deepEqual(raw.messages, [], source);
    assert.equal(raw.markdown.includes(lost), false, source);
    assert.throws(() => serialize(parse(source)), reason, source);
  }
});

test("Layer 2 rejects semantic attributes that canonical Markdown would add", () => {
  // The `{image}` directive defaults `align` to center; a Markdown image has no alignment.
  assert.match(rawMyst("![alt](./x.png)\n").markdown, /^```\{image\}/);
  assert.throws(() => serialize(parse("![alt](./x.png)\n")), /image: align \(absent\) became "center"/);
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

test("legitimate canonicalizations are normalized explicitly", () => {
  // csv-table and table directives are written as list-table; cells gain a paragraph wrapper.
  for (const source of [
    ":::{csv-table} Cap\n:header: a, b\n1,2\n:::\n",
    ":::{table} Cap\n:label: tbl-y\n| a | b |\n|---|---|\n| 1 | 2 |\n:::\n",
  ]) {
    assert.match(serialize(parse(source)), /^:::\{list-table\} Cap\n/);
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
