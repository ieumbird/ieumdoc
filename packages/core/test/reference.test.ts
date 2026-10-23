import assert from "node:assert/strict";
import test from "node:test";
import { canonicalWriteError, getEditableDocument, parse, serialize, unresolvedReferences, type MystNode } from "./core-internal.ts";

test("literal link/image references and unmatched code warn without changing semantic or canonical output", () => {
  for (const [source, diagnostic] of [
    ["[details][missing]", { syntax: "reference-link", label: "missing" }],
    ["[missing][]", { syntax: "reference-link", label: "missing" }],
    ["![alt][missing]", { syntax: "reference-image", label: "missing" }],
    ["![missing][]", { syntax: "reference-image", label: "missing" }],
    ["[**details**][Two words]", { syntax: "reference-link", label: "Two words" }],
    [String.raw`[a\]b][missing]`, { syntax: "reference-link", label: "missing" }],
    ["[details][missing]\n[label]: https://example.com", { syntax: "reference-link", label: "missing" }],
    ["``tick with ` inside", { syntax: "inline-code" }],
    ["`tick without end.", { syntax: "inline-code" }],
  ] as const) {
    const document = parse(`See ${source}\n`);
    const before = JSON.stringify(document);
    const model = getEditableDocument(document);
    const canonical = serialize(document);
    const expected = [{ ...diagnostic,
      source: diagnostic.syntax === "inline-code" ? source.match(/^`+/)![0] : source.split("\n")[0], path: [0], line: 1 }];
    assert.deepEqual(unresolvedReferences(document), expected, source);
    assert.deepEqual(unresolvedReferences(document), expected, "repeated diagnosis uses the same parse evidence");
    assert.equal(JSON.stringify(document), before);
    assert.deepEqual(getEditableDocument(document), model);
    assert.equal(canonicalWriteError(document), undefined);
    assert.equal(serialize(document), canonical);
    assert.deepEqual(unresolvedReferences(parse(canonical)), [], canonical);
    assert.equal(serialize(parse(canonical)), canonical);
  }
});

test("literal syntax diagnostics exclude prose, escapes, resolved syntax and non-text content", () => {
  for (const source of [
    "Prose [1], [sic], [label], ![label], [] and [text] [label].",
    "It costs $5.", "$ and %", "Math $x^2 without end.", "a`", "a `` b", "The ` character.",
    "\\[text][missing] !\\[alt][missing] \\[label][] !\\[label][] \\`tick and \\$x",
    "&#91;text][missing] &#96;tick",
    "[ok][ KNOWN  label ] ![ok][known label]\n\n[Known label]: https://example.com",
    "[Known][] ![Known][]\n\n[known]: https://example.com",
    "`[text][missing]` and `` `tick `` and `closed\nacross lines`.",
    "$[text][missing] `tick$ and $$[text][missing] `tick$$.",
    "[ok](https://example.com/[text][missing] \"`title\") ![`alt [a][b]](image.png)",
    "<https://example.com/[text][missing]/`tick> and https://example.com/[text][missing]",
    "https://example.com/`tick and www.example.com/[text][missing] and https://example.com/[^missing]",
    "```text\n[text][missing] `tick\n```", "    [text][missing] `tick",
    ":::{math}\n[text][missing] `tick\n:::", ":::{code} text\n[text][missing] `tick\n:::",
    "{math}`[text][missing]` and {math}`` `tick ``",
    ":::{figure} ./[text][missing].png\n:alt: [text][missing] `tick\nCaption.\n:::",
    "Text[^ok]\n\n[^ok]: [text][missing] `tick",
  ]) assert.deepEqual(unresolvedReferences(parse(source)), [], source);
});

test("URL exclusions preserve surrounding diagnostics across link-label lookahead", () => {
  const document = parse("[before][missing] https://example.org/[a][b] [between][missing] " +
    "https://example.net/[^hidden] [after][missing]");
  assert.deepEqual(unresolvedReferences(document), ["before", "between", "after"].map(text => ({
    syntax: "reference-link", label: "missing", source: `[${text}][missing]`, path: [0], line: 1,
  })));
  // The failed outer label scans ahead over the URL and footnote, then rewinds.
  assert.deepEqual(unresolvedReferences(parse(
    "[outer https://example.org/[a][b] [^missing]] https://example.net/[a][b] [tail][missing]")), [
    { footnote: true, label: "missing", path: [0], line: 1 },
    { syntax: "reference-link", label: "missing", source: "[tail][missing]", path: [0], line: 1 },
  ]);
});

test("valid link display text excludes nested reference shapes while standalone text still warns", () => {
  for (const [literal, syntax, label] of [
    ["[details][missing]", "reference-link", "missing"],
    ["[missing][]", "reference-link", "missing"],
    ["![alt][missing]", "reference-image", "missing"],
    ["![missing][]", "reference-image", "missing"],
  ] as const) {
    for (const destination of ["(https://example.com)", "[def]"]) {
      const link = `[Read **${literal}**]${destination}`;
      const definitions = "\n\n[def]: https://example.com\n";
      assert.deepEqual(unresolvedReferences(parse(link + definitions)), [], link);
      assert.deepEqual(unresolvedReferences(parse(`${link}\n\n${literal}${definitions}`)), [
        { syntax, label, source: literal, path: [1], line: 3 },
      ], "leaving a valid link restores ordinary reference diagnostics");
    }
  }
  for (const source of [
    "[Read [details][missing]](https://example.com)",
    "[Read [x][missing]][def]\n\n[def]: https://example.com",
  ]) assert.deepEqual(unresolvedReferences(parse(source)), [], source);
});

test("link display text retains meaningful code and existing footnote diagnostics", () => {
  for (const destination of ["(https://example.com)", "[def]"]) {
    const definitions = "\n\n[def]: https://example.com\n";
    assert.deepEqual(unresolvedReferences(parse(`[Read \`tick]${destination}${definitions}`)), [
      { syntax: "inline-code", source: "`", path: [0], line: 1 },
    ]);
    assert.deepEqual(unresolvedReferences(parse(`[Read \`tick\`]${destination}${definitions}`)), []);
    assert.deepEqual(unresolvedReferences(parse(`[Read [^missing]]${destination}${definitions}`)), [
      { footnote: true, label: "missing", path: [0], line: 1 },
    ]);
  }
});

test("literal syntax respects backslash parity and exact backtick run lengths", () => {
  assert.deepEqual(unresolvedReferences(parse("\\\\[a][b] and \\\\`tick")), [
    { syntax: "reference-link", label: "b", source: "[a][b]", path: [0], line: 1 },
    { syntax: "inline-code", source: "`", path: [0], line: 1 },
  ]);
  assert.deepEqual(unresolvedReferences(parse("\\\\\\[a][b] and \\\\\\`tick")), []);
  assert.deepEqual(unresolvedReferences(parse("`tick``")), [
    { syntax: "inline-code", source: "`", path: [0], line: 1 },
  ]);
});

test("shared literal diagnostics retain body/container locations and source order", () => {
  const source = [
    "---\nieumdoc: 1\n---", "# Heading [h][missing]", "> First line\n> `tick",
    "- ![alt][missing]", "| A |\n| - |\n| [cell][] |", ":::{note}\n[note][]\n:::",
    ":::{figure}\n[caption][]\n:::", "Loss [^loss] and [details][missing] and `tick",
  ].join("\n\n") + "\n";
  const expected = [
    { syntax: "reference-link", label: "missing", source: "[h][missing]", path: [1], line: 5 },
    { syntax: "inline-code", source: "`", path: [2], line: 7 },
    { syntax: "reference-image", label: "missing", source: "![alt][missing]", path: [3], line: 10 },
    { syntax: "reference-link", label: "cell", source: "[cell][]", path: [4], line: 14 },
    { syntax: "reference-link", label: "note", source: "[note][]", path: [5], line: 17 },
    { syntax: "reference-link", label: "caption", source: "[caption][]", path: [6], line: 21 },
    { footnote: true, label: "loss", path: [7], line: 24 },
    { syntax: "reference-link", label: "missing", source: "[details][missing]", path: [7], line: 24 },
    { syntax: "inline-code", source: "`", path: [7], line: 24 },
  ];
  for (const ending of ["\n", "\r\n"]) {
    assert.deepEqual(unresolvedReferences(parse("\uFEFF" + source.replaceAll("\n", ending))), expected);
  }
});

// Issue #12: semantic references are written as their MyST role, so they parse
// back as `crossReference`. Ordinary `[text](#target)` links are never promoted.
const source = [
  "(sec-intro)=",
  "## Introduction",
  "",
  "See {eq}`eq-current`, {numref}`fig-control`, {numref}`Figure %s <fig-control>`,",
  "{ref}`sec-intro`, {ref}`the introduction <sec-intro>` and {ref}`missing-target`.",
  "",
  "Links: [](#eq-current) and [details](#eq-current).",
  "",
].join("\n");

const canonical = [
  "(sec-intro)=",
  "",
  "## Introduction",
  "",
  "See {eq}`eq-current`, {numref}`fig-control`, {numref}`Figure %s <fig-control>`,",
  "{ref}`sec-intro`, {ref}`the introduction <sec-intro>` and {ref}`missing-target`.",
  "",
  "Links: [](#eq-current) and [details](#eq-current).",
  "",
].join("\n");

const expectedReferences = [
  { type: "crossReference", kind: "eq", identifier: "eq-current", label: "eq-current", text: null },
  { type: "crossReference", kind: "numref", identifier: "fig-control", label: "fig-control", text: null },
  { type: "crossReference", kind: "numref", identifier: "fig-control", label: "fig-control", text: "Figure %s" },
  { type: "crossReference", kind: "ref", identifier: "sec-intro", label: "sec-intro", text: null },
  { type: "crossReference", kind: "ref", identifier: "sec-intro", label: "sec-intro", text: "the introduction" },
  // Core does not resolve targets; an unknown target is preserved as written.
  { type: "crossReference", kind: "ref", identifier: "missing-target", label: "missing-target", text: null },
  { type: "link", url: "#eq-current", text: "" },
  { type: "link", url: "#eq-current", text: "details" },
];

test("semantic references survive parse → canonical serialize → parse", () => {
  const original = parse(source);
  const output = serialize(original);
  const reparsed = parse(output);

  assert.equal(output, canonical);
  assert.deepEqual(references(original), expectedReferences);
  assert.deepEqual(references(reparsed), expectedReferences);
  assert.deepEqual(reparsed.children.slice(0, 2).map((node) => [node.type, node.label ?? null]),
    [["mystTarget", "sec-intro"], ["heading", null]]);
});

test("canonical reference output is deterministic and idempotent", () => {
  const first = serialize(parse(source));
  assert.equal(serialize(parse(source)), first);
  assert.equal(serialize(parse(first)), first);
});

test("ordinary fragment links and semantic references stay distinct", () => {
  const link = parse(serialize(parse("[](#eq-current)\n"))).children[0].children?.[0];
  const reference = parse(serialize(parse("{eq}`eq-current`\n"))).children[0].children?.[0];
  assert.equal(link?.type, "link");
  assert.equal(reference?.type, "crossReference");
  assert.notEqual(serialize(parse("[](#eq-current)\n")), serialize(parse("{eq}`eq-current`\n")));
});

test("reference preparation leaves unrelated leaf nodes untouched", () => {
  // {doc} and {download} parse to links without a children key.
  const doc = parse("{doc}`other`\n");
  assert.equal(doc.children[0].children?.[0].children, undefined);
  assert.equal(serialize(doc), "[](other)\n");
  // {download} marks its link `static`; `[](./file.zip)` would reparse as an ordinary
  // link, so the global serializer guard rejects it instead of dropping the distinction.
  const download = parse("{download}`./file.zip`\n");
  assert.equal(download.children[0].children?.[0].children, undefined);
  assert.throws(() => serialize(download), /cannot be preserved in canonical Markdown: .*link: static true/);
});

test("references that cannot be preserved fail closed instead of becoming links", () => {
  // {term} parses to a crossReference without a supported role kind.
  assert.throws(() => serialize(parse("See {term}`glossary`.\n")), /cannot be preserved/);
  assert.throws(() => serialize(parse("See {eq}`  spaced  `.\n")), /cannot round-trip/);
  const formatted = paragraph({
    type: "crossReference", kind: "ref", identifier: "sec-intro", label: "sec-intro",
    children: [{ type: "strong", children: [{ type: "text", value: "bold" }] }],
  });
  assert.throws(() => serialize(formatted), /cannot be preserved/);
  const mismatched = paragraph({ type: "crossReference", kind: "eq", identifier: "other", label: "eq-current" });
  assert.throws(() => serialize(mismatched), /cannot round-trip/);
  const resolved = paragraph({ type: "crossReference", kind: "eq", identifier: "x", label: "x", urlSource: "#x" });
  assert.throws(() => serialize(resolved), /cannot be preserved/);
});

function paragraph(reference: MystNode) {
  return { type: "root" as const, children: [{ type: "paragraph", children: [reference] }] };
}

function references(node: MystNode, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (node.type === "crossReference") {
    found.push({
      type: node.type, kind: node.kind, identifier: node.identifier, label: node.label,
      text: node.children?.[0]?.value ?? null,
    });
  } else if (node.type === "link") {
    found.push({ type: node.type, url: node.url, text: (node.children ?? []).map((child) => child.value).join("") });
  }
  for (const child of node.children ?? []) references(child, found);
  return found;
}
