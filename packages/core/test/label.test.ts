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
    assert.match(serialize(next), /See \[\]\(#fig-control\) and \{eq\}`eq-current`\./);
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
  assert.throws(() => updateLabel(parse("Text.\n"), [0], "p"), /requires a top-level Equation or Figure/);
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
