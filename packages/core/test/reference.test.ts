import assert from "node:assert/strict";
import test from "node:test";
import { parse, serialize, type DocumentNode } from "../src/index.ts";

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
  for (const [source, expected] of [["{doc}`other`\n", "[](other)\n"], ["{download}`./file.zip`\n", "[](./file.zip)\n"]]) {
    const document = parse(source);
    assert.equal(document.children[0].children?.[0].children, undefined);
    assert.equal(serialize(document), expected);
  }
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

function paragraph(reference: DocumentNode) {
  return { type: "root" as const, children: [{ type: "paragraph", children: [reference] }] };
}

function references(node: DocumentNode, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
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
