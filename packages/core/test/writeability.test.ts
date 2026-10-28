import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// Imported by package name, exactly as CLI and Editor Host consume it.
import {
  canonicalWriteError,
  canonicalWriteIssue,
  parse,
  removeBlock,
  serialize,
  updateParagraphInlineContent,
  type Document,
} from "./core-internal.ts";

// Canonical writeability preflight: whether the official write path (serialize) can
// write a Document without losing semantics, asked before anything is written.

const technical = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");

const WRITABLE: [string, string][] = [
  ["paragraph", "# Title\n\nA plain paragraph.\n"],
  ["technical fixture with Equation, Figure and references", technical],
  ["straight quotes", "Don't panic.\n\nThe state is \"READY\".\n"],
  ["byte order mark", "\uFEFF# Heading\n\nBody.\n"],
  ["front matter", "---\ntitle: Example\n---\n\n# Heading\n"],
  ["aligned table", "| a | b |\n|:--|--:|\n| 1 | 2 |\n"],
];

const NOT_WRITABLE: [string, string, RegExp][] = [
  ["unclosed front matter", "---\ntitle: Example\n", /front matter/],
  ["{kbd} role", "Press {kbd}`Ctrl` now.\n", /keyboard/],
  // Reference roles Core cannot write back fail before myst-to-md runs, as a structured Core diagnostic.
  ["{term} reference", "See {term}`glossary term`.\n", /cannot be preserved through canonical Markdown/],
];

/** The write path's own verdict: serialize's error message, or undefined when it writes. */
function serializeError(document: Document): string | undefined {
  try {
    serialize(document);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

test("writable documents pass the canonical writeability preflight", () => {
  for (const [name, source] of WRITABLE) {
    assert.equal(canonicalWriteError(parse(source)), undefined, name);
  }
});

test("documents the canonical writer cannot preserve report why, without writing", () => {
  for (const [name, source, reason] of NOT_WRITABLE) {
    const error = canonicalWriteError(parse(source));
    assert.equal(typeof error, "string", name);
    assert.match(error!, reason, name);
    assert.doesNotMatch(error!, /\n\s+at /, `${name}: no stack trace`);
  }
});

test("canonical write issues preserve block locations for writer diagnostics, references and semantic loss", () => {
  for (const [source, reason, path] of [
    ["# Title\n\nPress {kbd}`Ctrl` now.\n", /keyboard/, [1]],
    ["# Title\n\nSee {term}`glossary term`.\n", /cross-reference/, [1]],
    ["# Title\n\n:::{figure}\n![a](./a.png)\n![b](./b.png)\n:::\n", /container/, [1]],
  ] as const) {
    const document = parse(source);
    const before = structuredClone(document);
    const issue = canonicalWriteIssue(document);
    assert.ok(issue);
    assert.match(issue.reason, reason);
    assert.deepEqual(issue.path, path);
    assert.ok(issue.action);
    assert.equal(issue.reason, canonicalWriteError(document));
    assert.deepEqual(document, before);
  }
  const missing = updateParagraphInlineContent(parse("# Title\n\nBody.\n"), [1], [{ kind: "footnote", label: "lost" }]);
  const issue = canonicalWriteIssue(missing);
  assert.match(issue?.reason ?? "", /no definition/);
  assert.deepEqual(issue?.path, [1]);
});

test("preflight and serialize give the same verdict and reason on every fixture", () => {
  for (const [name, source] of [...WRITABLE, ...NOT_WRITABLE]) {
    const document = parse(source);
    assert.equal(canonicalWriteError(document), serializeError(document), name);
  }
});

test("preflight never changes the document", () => {
  for (const [name, source] of [...WRITABLE, ...NOT_WRITABLE]) {
    const document = parse(source);
    const before = structuredClone(document);
    canonicalWriteError(document);
    assert.deepEqual(document, before, name);
  }
});

test("preflight follows the current snapshot through Core operations", () => {
  const edited = updateParagraphInlineContent(parse("# Title\n\nBody.\n"), [1], [{ kind: "text", text: "It's fine." }]);
  assert.equal(canonicalWriteError(edited), undefined);
  const frontMatter = parse("---\ntitle: Example\n---\n\n# Heading\n\nBody.\n");
  const unrelatedEdit = updateParagraphInlineContent(frontMatter, [2], [{ kind: "text", text: "Changed." }]);
  assert.equal(canonicalWriteError(unrelatedEdit), undefined);
  // Body removal keeps metadata writable. Internal fragments can still remove unsupported body blocks.
  assert.equal(canonicalWriteError(removeBlock(frontMatter, 2)), undefined);
  const blocked = parse("Press {kbd}`Ctrl` now.\n\nBody.\n");
  assert.match(canonicalWriteError(blocked) ?? "", /keyboard/);
  assert.equal(canonicalWriteError(removeBlock(blocked, 0)), undefined);
});


test("Core refusals expose stable codes through operation and cause wrappers", async () => {
  const core = await import("@ieumdoc/core");
  const native = (body: string) => core.parse(`---\nieumdoc: 1\n---\n\n${body}`);
  const document = native("# Title\n\nBody.\n\n| H |\n|---|\n| Cell |\n");
  const cases: [string, () => unknown][] = [
    ["native-marker", () => core.parse("# Title\n")],
    ["native-metadata", () => core.parse("---\nieumdoc: 1\nunknown: true\n---\n")],
    ["native-content", () => native("<div>HTML</div>\n")],
    ["invalid-structure", () => core.validateStructure({} as never)],
    ["invalid-operation", () => core.removeBlock(document, 0)],
    ["invalid-operation", () => core.moveBlock(document, 1, 2)],
    ["unsupported-content", () => core.updateParagraphInlineContent(document, [2], [{ kind: "unknown" }] as never)],
    ["empty-content", () => core.updateHeadingInlineContent(document, [1], [])],
    ["round-trip-mismatch", () => core.updateTableCell(document, [3, 1, 0], [{ kind: "math", value: "`v$" }])],
    ["invalid-unicode", () => native("Bad\uD800\n")],
    ["invalid-label", () => core.insertTarget(document, 2, "bad\nlabel")],
    ["label-conflict", () => core.insertTarget(core.insertTarget(document, 2, "target"), 3, "target")],
    ["invalid-reference", () => core.updateParagraphInlineContent(document, [2], [{ kind: "reference", role: "eq", label: "" }])],
    ["invalid-footnote", () => core.insertFootnoteDefinition(document, 2, "bad label", [{kind:"text", text:"Note"}])],
    ["invalid-footnote", () => core.serialize(core.updateParagraphInlineContent(document, [2], [{ kind: "footnote", label: "missing" }]))],
    ["line-break", () => core.updateTableCell(document, [3, 1, 0], "a\nb")],
    ["table-cell-whitespace", () => core.updateTableCell(document, [3, 1, 0], " padded ")],
    ["table-shape", () => core.insertTable(document, 2, [["A", "B"], ["C"]])],
    ["invalid-figure", () => core.insertFigure(document, 2, { imageUrl: "", imageAlt: "alt", caption: "" })],
  ];
  for (const [code, apply] of cases) {
    assert.throws(apply, error => {
      const issue = core.writeIssueOf(error);
      assert.equal(issue.code, code, issue.reason);
      assert.equal(core.writeIssueOf(new Error("operation wrapper", { cause: error })).code, code);
      assert.ok(issue.reason && issue.action);
      return true;
    });
  }
  // Unknown failures stay unclassified, even if their prose resembles a known diagnostic.
  assert.equal(core.writeIssueOf(new Error("empty heading cannot be saved")).code, undefined);
});
