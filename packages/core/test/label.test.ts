import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getEditableDocument,
  insertEquation,
  insertFigure,
  labelError,
  parse,
  serialize,
  updateEquationLatex,
  updateLabel,
  unresolvedReferences,
  type MystDocument,
} from "./core-internal.ts";

const source = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");
const EQUATION = 9;
const FIGURE = 6;

function block(document: MystDocument, index: number) {
  return getEditableDocument(document).blocks[index];
}

/** Every block except `index` keeps its canonical form. */
function assertOthersUnchanged(before: MystDocument, after: MystDocument, index: number): void {
  const blocks = (document: MystDocument) =>
    document.children.map((node) => serialize({ type: "root", children: [node] }));
  const was = blocks(before);
  const is = blocks(after);
  assert.equal(is.length, was.length);
  is.forEach((markdown, position) => {
    if (position !== index) assert.equal(markdown, was[position], `block ${position}`);
  });
}

test("Equation labels can be added, changed and removed; LaTeX is kept", () => {
  const document = parse("Intro.\n\n```{math}\nx + 1\n```\n");
  const added = updateLabel(document, [1], "eq-sum");
  assert.equal(serialize(added), "Intro.\n\n```{math}\n:label: eq-sum\n\nx + 1\n```\n");
  assert.deepEqual(block(parse(serialize(added)), 1), { block: "equation", path: [1], latex: "x + 1", label: "eq-sum" });

  const changed = updateLabel(added, [1], "Eq-Total");
  assert.equal(serialize(changed), "Intro.\n\n```{math}\n:label: Eq-Total\n\nx + 1\n```\n");
  const removed = updateLabel(changed, [1], "");
  assert.equal(serialize(removed), "Intro.\n\n```{math}\nx + 1\n```\n");
  assert.equal(serialize(updateEquationLatex(changed, [1], "x + 1", "y")), "Intro.\n\n```{math}\n:label: Eq-Total\n\ny\n```\n");
});

test("Figure labels can be added, changed and removed; image, alt and caption are kept", () => {
  const document = insertFigure(parse("Intro.\n"), 1, { imageUrl: "./d.svg", imageAlt: "Alt", caption: "Cap." });
  const added = updateLabel(document, [1], "fig-d");
  assert.equal(serialize(added), "Intro.\n\n:::{figure} ./d.svg\n:name: fig-d\n:alt: Alt\n\nCap.\n:::\n");
  const reloaded = block(parse(serialize(added)), 1);
  assert.ok(reloaded.block === "figure");
  assert.deepEqual([reloaded.label, reloaded.imageUrl, reloaded.imageAlt, reloaded.caption.text, reloaded.editable],
    ["fig-d", "./d.svg", "Alt", "Cap.", true]);
  const removed = updateLabel(updateLabel(added, [1], "fig-e"), [1], "");
  assert.equal(serialize(removed), serialize(document));
});

test("relabeling the technical document changes only that block and keeps references as written", () => {
  const document = parse(source);
  for (const [index, label] of [[EQUATION, "eq-reference"], [FIGURE, "fig-diagram"]] as const) {
    const next = updateLabel(document, [index], label);
    assertOthersUnchanged(document, next, index);
    assert.equal((block(parse(serialize(next)), index) as { label: string }).label, label);
    // References are not renamed: they keep their written target.
    assert.match(serialize(next), /See \[Figure\]\(#fig-control\) and \{eq\}`eq-current`\./);
  }
  // `$$ ... $$ (label)` math records a derived anchor; relabeling it is still lossless.
  const dollar = updateLabel(parse("$$x$$ (eq-a)\n"), [0], "eq-b");
  assert.equal(serialize(dollar), "```{math}\n:label: eq-b\n\nx\n```\n");
});

test("a label must not name another reference target in the document, compared as MyST identifiers", () => {
  const document = parse([
    "(sec-intro)=",
    "# Intro",
    "```{math}\n:label: eq-a\na\n```",
    "```{math}\nb\n```",
    ":::{figure} ./d.svg\n:name: fig-a\n:::",
  ].join("\n\n") + "\n");
  for (const label of ["eq-a", "EQ-A", "fig-a", "sec-intro", "Sec-Intro"]) {
    assert.throws(() => updateLabel(document, [3], label), /already names another target/, label);
  }
  assert.throws(() => updateLabel(document, [4], "eq-a"), /already names another target/);
  // Keeping or re-casing a block's own label is not a duplicate.
  assert.equal(serialize(updateLabel(document, [2], "eq-a")), serialize(document));
  assert.match(serialize(updateLabel(document, [2], "EQ-A")), /:label: EQ-A/);
  // References and ordinary links are not targets.
  assert.match(serialize(updateLabel(parse("See {eq}`eq-x` and [x](#eq-y).\n\n```{math}\nb\n```\n"), [1], "eq-x")), /:label: eq-x/);
});

test("labels that cannot be written, referenced or reloaded exactly fail closed", () => {
  const document = parse("```{math}\nx\n```\n\n:::{figure} ./d.svg\n:::\n");
  for (const [label, reason] of [
    [" eq-a", /leading or trailing spaces/],
    ["eq-a ", /leading or trailing spaces/],
    ["eq\na", /line breaks/],
    ["\"\"", /does not name a reference target/],
    ["eq<a>", /cannot be referenced/],
  ] as const) {
    for (const index of [0, 1]) assert.throws(() => updateLabel(document, [index], label), reason, `${label} at ${index}`);
  }
  assert.throws(() => updateLabel(parse("Text.\n"), [0], "p"), /requires a top-level Equation, Figure, Table or target/);
  assert.throws(() => updateLabel(parse("- ```{math}\n  x\n  ```\n"), [0, 0, 0], "eq"), /top-level/);
  assert.equal(labelError("eq:1"), undefined);
  assert.equal(labelError("식-1"), undefined);
  // MyST can write and reference a backtick label (the role is fenced with more backticks).
  assert.match(serialize(updateLabel(document, [0], "eq`a")), /:label: eq`a/);
});

test("new Equation and Figure blocks can be labeled", () => {
  const withEquation = updateLabel(insertEquation(parse("Intro.\n"), 1, "x"), [1], "eq-new");
  const withFigure = updateLabel(insertFigure(withEquation, 2, { imageUrl: "./d.svg", imageAlt: "", caption: "" }), [2], "fig-new");
  assert.equal(serialize(withFigure), "Intro.\n\n```{math}\n:label: eq-new\n\nx\n```\n\n:::{figure} ./d.svg\n:name: fig-new\n:::\n");
});

const updateReferences = { updateReferences: true };

test("opt-in rename follows MyST resolution for all four target kinds and preserves display content", () => {
  for (const target of [
    "```{math}\n:label: old\nx\n```",
    ":::{figure} ./d.svg\n:name: old\n:alt: Alt\n\nCaption {ref}`old`.\n:::",
    ":::{table} Caption {ref}`old`\n:name: old\n\n| A |\n| - |\n| B {eq}`old` and [self](#old) |\n:::",
    "(old)=\n# Section",
  ]) {
    // Role kind does not filter target identity in Core's existing lookup.
    const document = parse(`${target}\n\n` + [
      "{eq}`OLD`, {numref}`Figure %s <Old>`, {ref}`display <old>` and {ref}`old`.",
      "[**Keep** *display*](#OLD \"Title\") and [defined][anchor].",
      "Unrelated old, `old`, `{ref}` and {ref}`missing`; [other](#missing).",
      "[external](https://example.com/#old), [document](other.md#old), [relative](old).",
      "",
      "[anchor]: #old",
      "",
      "```text\n{eq}`old` [code](#old)\n```",
      "",
    ].join("\n"));
    const original = structuredClone(document);
    const next = updateLabel(document, [0], "new", updateReferences);
    const markdown = serialize(next);
    assert.deepEqual(document, original);
    assert.match(markdown, /\{eq\}`new`, \{numref\}`Figure %s <new>`, \{ref\}`display <new>` and \{ref\}`new`/);
    assert.match(markdown, /\[\*\*Keep\*\* \*display\*\]\(#new "Title"\)/);
    assert.match(markdown, /\[defined\]\(#new\)/);
    assert.match(markdown, /Unrelated old, `old`, `\{ref\}` and \{ref\}`missing`; \[other\]\(#missing\)/);
    assert.match(markdown, /https:\/\/example.com\/#old/);
    assert.match(markdown, /other.md#old/);
    assert.match(markdown, /\[relative\]\(old\)/);
    assert.match(markdown, /```text\n\{eq\}`old` \[code\]\(#old\)\n```/);
    const missing = (doc: MystDocument) => unresolvedReferences(doc).map(({ label }) => label);
    assert.deepEqual(missing(next), ["missing", "missing"]);
    const reloaded = parse(markdown);
    assert.deepEqual(missing(reloaded), missing(next));
    assert.equal(serialize(reloaded), markdown);
    assert.equal(serialize({ type: "root", children: [reloaded.children[0]] }),
      serialize({ type: "root", children: [next.children[0]] }));
  }
});

test("opt-in rename preserves unrelated inherited-property references as unresolved", () => {
  const document = parse("```{math}\n:label: old\nx\n```\n\n{eq}`old`, {ref}`constructor` and {ref}`__proto__`.\n");
  const original = structuredClone(document);
  const next = updateLabel(document, [0], "new", updateReferences);
  const markdown = serialize(next);
  assert.deepEqual(document, original);
  assert.equal(markdown, "```{math}\n:label: new\n\nx\n```\n\n{eq}`new`, {ref}`constructor` and {ref}`__proto__`.\n");
  assert.deepEqual(unresolvedReferences(parse(markdown)).map(({ label }) => label), ["constructor", "__proto__"]);
  assert.equal(serialize(parse(markdown)), markdown);
});

test("opt-in rename visits nested references and uses normalized labels without decoding fragments", () => {
  const document = parse([
    "```{math}\n:label: Old Label\nx\n```",
    "## Implicit Heading!",
    "- **{eq}`OLD LABEL`** and [keep](#Old%20Label).",
    "> [quote](<#OLD LABEL>) and [heading](#implicit-heading)",
    "| A |\n| - |\n| {ref}`Old Label` |",
    ":::{figure} ./image.svg\n\n{ref}`Old Label`\n:::",
    ":::{note}\n{ref}`Old Label`\n:::",
  ].join("\n\n") + "\n");
  const next = updateLabel(document, [0], "새 Label", updateReferences);
  const markdown = serialize(next);
  assert.match(markdown, /\*\*\{eq\}`새 Label`\*\*/);
  assert.match(markdown, /\[quote\]\(#OLD%20LABEL\)/);
  assert.match(markdown, /\[keep\]\(#Old%20Label\)/);
  assert.match(markdown, /\[heading\]\(#implicit-heading\)/);
  assert.equal((markdown.match(/\{ref\}`새 Label`/g) ?? []).length, 3);
  assert.deepEqual(unresolvedReferences(next).map(({ label }) => label), ["Old%20Label", "OLD%20LABEL"]);
  assert.equal(serialize(parse(markdown)), markdown);
});

test("opt-in rename refuses conflicts, ambiguous targets, invalid labels and incidental resolution changes", () => {
  const equation = "```{math}\n:label: old\nx\n```\n";
  for (const [source, label, reason] of [
    [equation + "\n# Taken!\n", "taken", /already names another target.*implicit heading/],
    [equation + "\n(taken)=\n# Labeled\n", "TAKEN", /already names another target/],
    [equation + "\n```{math}\n:label: OLD\ny\n```\n", "new", /ambiguous target/],
    [equation + "\n# Old\n", "new", /ambiguous target/],
    [equation + "\n{ref}`new`\n", "new", /previously unresolved reference/],
    [equation, " new", /leading or trailing spaces/],
    [equation, "\"\"", /does not name a reference target/],
    [equation, "eq<a>", /cannot be referenced/],
    [equation + "\n[keep](#old)\n", "new label", /cannot be rewritten while preserving meaning/],
    [equation, "", /non-empty/],
    ["```{math}\nx\n```\n", "new", /existing non-empty label/],
    ["(old)=\nParagraph.\n", "new", /section target immediately before a heading/],
    ["(old)=\n# Section\n", "한글", /section label uses/],
    ["(alias)=\n" + equation, "new", /section target immediately before a heading/],
  ] as const) {
    const document = parse(source);
    const original = structuredClone(document);
    assert.throws(() => updateLabel(document, [0], label, updateReferences), reason, source + label);
    assert.deepEqual(document, original);
  }
  // Reversed shadowing and labels overridden by an adjacent target are also ambiguous.
  for (const [source, index] of [["# Old\n\n" + equation, 1], ["(alias)=\n" + equation, 1]] as const) {
    assert.throws(() => updateLabel(parse(source), [index], "new", updateReferences), /ambiguous target/);
  }
});

test("unsupported reference notation fails closed before a rename can repair it", () => {
  const source = "```{math}\n:label: old\nx\n```\n\n{eq}`old`\n";
  for (const alter of [
    (reference: Record<string, unknown>) => { reference.kind = "term"; },
    (reference: Record<string, unknown>) => { reference.label = " old "; },
    (reference: Record<string, unknown>) => { reference.children = [{ type: "strong", children: [{ type: "text", value: "keep" }] }]; },
    (reference: Record<string, unknown>) => { reference.identifier = "different"; },
  ]) {
    const document = parse(source);
    alter(document.children[1].children![0]);
    const original = structuredClone(document);
    assert.throws(() => updateLabel(document, [0], "new", updateReferences), /cannot (be preserved|round-trip)/);
    assert.deepEqual(document, original);
  }
});

test("section rename keeps its heading and implicit ID rule; false preserves the default", () => {
  const document = parse("(old)=\n# Heading\n\n{ref}`old` and [unresolved](#heading).\n");
  const next = updateLabel(document, [0], "new", updateReferences);
  assert.match(serialize(next), /\(new\)=\n\n# Heading\n\n\{ref\}`new` and \[unresolved\]\(#heading\)/);
  assert.deepEqual(unresolvedReferences(next).map(({ label }) => label), ["heading"]);
  assert.equal(serialize(updateLabel(document, [0], "new", { updateReferences: false })),
    serialize(updateLabel(document, [0], "new")));
  // Re-casing the selected target remains a rename, without inventing a collision.
  assert.match(serialize(updateLabel(document, [0], "OLD", updateReferences)), /\{ref\}`OLD`/);
});
