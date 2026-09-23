import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  figureContentError,
  getEditableDocument,
  getNode,
  insertFigure,
  parse,
  serialize,
  updateFigure,
  validateFigure,
  validateStructure,
  type Document,
  type FigureContent,
  type NodePath,
} from "../src/index.ts";

const FIGURE_PATH: NodePath = [6];
const source = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");

function semanticFigure(document: Document, index: number) {
  const block = getEditableDocument(document).blocks[index];
  assert.equal(block?.block, "figure");
  if (block?.block !== "figure") throw new Error("not a figure");
  return {
    editable: block.editable,
    label: block.label,
    imageUrl: block.imageUrl,
    imageAlt: block.imageAlt,
    caption: block.caption.text,
  };
}

/** serialize → parse → semantic Figure, plus a deterministic second serialization. */
function roundTrip(document: Document, index: number) {
  validateStructure(document);
  const markdown = serialize(document);
  const reparsed = parse(markdown);
  assert.equal(serialize(reparsed), markdown);
  return { markdown, figure: semanticFigure(reparsed, index), node: getNode(reparsed, [index]) };
}

test("existing Figure is editable in the v1 projection", () => {
  assert.deepEqual(semanticFigure(parse(source), FIGURE_PATH[0]), {
    editable: true,
    label: "fig-control",
    imageUrl: "./diagram.svg",
    imageAlt: "Control block diagram",
    caption: "Control block diagram of the grid-connected converter.",
  });
});

test("updateFigure changes image URL, alt text and caption and preserves the label", () => {
  const document = parse(source);
  const changed = updateFigure(document, FIGURE_PATH, {
    imageUrl: "./diagram-v2.svg",
    imageAlt: "Updated block diagram",
    caption: "Updated converter control diagram.",
  });
  const { markdown, figure, node } = roundTrip(changed, FIGURE_PATH[0]);
  assert.deepEqual(figure, {
    editable: true,
    label: "fig-control",
    imageUrl: "./diagram-v2.svg",
    imageAlt: "Updated block diagram",
    caption: "Updated converter control diagram.",
  });
  assert.equal(node.type, "container");
  assert.equal(node.kind, "figure");
  assert.equal(node.identifier, "fig-control");
  assert.match(markdown, /:::\{figure\} \.\/diagram-v2\.svg\n:name: fig-control\n:alt: Updated block diagram\n\nUpdated converter control diagram\.\n:::/);
  // The input snapshot is not mutated and other blocks are untouched.
  assert.equal(semanticFigure(document, FIGURE_PATH[0]).imageUrl, "./diagram.svg");
  assert.equal(getEditableDocument(changed).blocks.length, getEditableDocument(document).blocks.length);
  assert.match(markdown, /See \[\]\(#fig-control\)/);
});

test("updateFigure updates each property independently", () => {
  const document = parse(source);
  const original = semanticFigure(document, FIGURE_PATH[0]);
  for (const [key, value] of [
    ["imageUrl", "./other.svg"],
    ["imageAlt", "Other alt"],
    ["caption", "Other caption."],
  ] as const) {
    const { figure } = roundTrip(updateFigure(document, FIGURE_PATH, { [key]: value }), FIGURE_PATH[0]);
    assert.deepEqual(figure, { ...original, [key]: value });
  }
});

test("empty alt text and caption remove those optional parts", () => {
  const changed = updateFigure(parse(source), FIGURE_PATH, { imageAlt: "", caption: "" });
  const { markdown, figure } = roundTrip(changed, FIGURE_PATH[0]);
  assert.deepEqual(figure, {
    editable: true,
    label: "fig-control",
    imageUrl: "./diagram.svg",
    imageAlt: "",
    caption: "",
  });
  assert.match(markdown, /:::\{figure\} \.\/diagram\.svg\n:name: fig-control\n:::/);
  // A caption can be added back to a figure without one.
  const restored = roundTrip(updateFigure(changed, FIGURE_PATH, { caption: "Back." }), FIGURE_PATH[0]);
  assert.equal(restored.figure.caption, "Back.");
});

test("insertFigure creates a canonical unlabeled Figure", () => {
  const figure: FigureContent = { imageUrl: "./new figure.svg", imageAlt: "New alt", caption: "A *literal* caption." };
  const changed = insertFigure(parse("Intro"), 1, figure);
  const { markdown, figure: projected, node } = roundTrip(changed, 1);
  assert.equal(markdown, "Intro\n\n:::{figure} ./new figure.svg\n:alt: New alt\n\nA \\*literal\\* caption.\n:::\n");
  assert.deepEqual(projected, { editable: true, label: "", ...figure });
  assert.equal(node.label, undefined);
  assert.equal(node.identifier, undefined);

  const minimal = roundTrip(insertFigure(parse("Intro"), 0, { imageUrl: "./a.png", imageAlt: "", caption: "" }), 0);
  assert.equal(minimal.markdown, ":::{figure} ./a.png\n:::\n\nIntro\n");
  assert.deepEqual(minimal.figure, { editable: true, label: "", imageUrl: "./a.png", imageAlt: "", caption: "" });
});

test("Figure validity rules reject values that canonical MyST cannot persist", () => {
  const valid: FigureContent = { imageUrl: "./a.png", imageAlt: "Alt", caption: "Caption" };
  assert.equal(figureContentError(valid), undefined);
  const invalid: [Partial<FigureContent>, RegExp][] = [
    [{ imageUrl: "" }, /image URL is required/],
    [{ imageUrl: " ./a.png" }, /image URL cannot contain/],
    [{ imageUrl: "./a.png " }, /image URL cannot contain/],
    [{ imageUrl: "./a\n.png" }, /image URL cannot contain/],
    [{ imageAlt: " Alt" }, /alt text cannot contain/],
    [{ imageAlt: "A\nB" }, /alt text cannot contain/],
  ];
  for (const [change, message] of invalid) {
    assert.match(figureContentError({ ...valid, ...change }) ?? "", message);
    assert.throws(() => insertFigure(parse("Intro"), 1, { ...valid, ...change }), message);
    assert.throws(() => updateFigure(parse(source), FIGURE_PATH, change), message);
  }
  // Captions that MyST would reinterpret fail the Core round-trip.
  for (const caption of ["cost $5 and $x$", "% comment", "+++", ":::"]) {
    assert.throws(() => insertFigure(parse("Intro"), 1, { ...valid, caption }), /canonical round-trip|not canonical/);
    assert.throws(() => updateFigure(parse(source), FIGURE_PATH, { caption }), /canonical round-trip|not canonical/);
  }
});

test("validateFigure is the persistent validity used by insertFigure", () => {
  const valid: FigureContent = { imageUrl: "./a.png", imageAlt: "Alt", caption: "Caption" };
  assert.equal(validateFigure(valid), undefined);
  assert.equal(validateFigure({ ...valid, imageAlt: "", caption: "" }), undefined);
  assert.match(validateFigure({ ...valid, imageUrl: "" }) ?? "", /image URL is required/);
  // Field rules alone accept this caption; only the canonical round-trip rejects it.
  const reinterpreted = { ...valid, caption: "cost $5 and $x$" };
  assert.equal(figureContentError(reinterpreted), undefined);
  assert.match(validateFigure(reinterpreted) ?? "", /canonical round-trip|not canonical/);
  assert.throws(() => insertFigure(parse("Intro"), 1, reinterpreted), /canonical round-trip|not canonical/);
});

test("updateFigure rejects non-Figure and invalid paths", () => {
  const document = parse(source);
  assert.throws(() => updateFigure(document, [0], { caption: "x" }), /requires a figure/);
  assert.throws(() => updateFigure(document, [99], { caption: "x" }), /out of range/);
  assert.throws(() => updateFigure(document, [6, 1], { caption: "x" }), /requires a figure/);
});

test("updateFigure fails closed for unsupported Figure structures", () => {
  for (const markdown of [
    ":::{figure} ./a.png\n**bold caption**\n:::\n",
    ":::{figure} ./a.png\nCaption\n\nLegend paragraph\n:::\n",
    ":::{figure} ./a.png\n% comment\n:::\n",
  ]) {
    const document = parse(markdown);
    const block = getEditableDocument(document).blocks[0];
    assert.equal(block?.block === "figure" && block.editable, false, markdown);
    assert.throws(() => updateFigure(document, [0], { imageAlt: "x" }), /not editable/);
  }
});
