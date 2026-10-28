import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  blockTargets,
  canonicalWriteError,
  figureContentError,
  getEditableDocument,
  getNode,
  insertFigure,
  insertFootnoteDefinition,
  moveBlock,
  parse,
  removeBlock,
  serialize,
  targetNumbers,
  updateFigure,
  updateMediaReferences,
  updateLabel,
  validateFigure,
  validateStructure,
  type MystDocument,
  type FigureContent,
  type NodePath,
} from "./core-internal.ts";

const FIGURE_PATH: NodePath = [6];

test("media replacements are simultaneous, exact and preserve Figure properties and other content", () => {
  const original = parse(":::{figure} ./old.svg\n:name: first\n:alt: Keep\n\n**Caption**.\n:::\n\n:::{figure} ./new.svg\n\nSecond.\n:::\n\n:::{figure} ./old.svg\n\nThird.\n:::\n\nLiteral ./old.svg and [link](./old.svg).\n");
  const before = serialize(original);
  const updated = updateMediaReferences(original, [{ from: "./old.svg", to: "./new.svg" }, { from: "./new.svg", to: "./last.svg" }]);
  const figures = getEditableDocument(updated).blocks.filter(block => block.block === "figure");
  assert.deepEqual(figures.map(block => block.imageUrl), ["./new.svg", "./last.svg", "./new.svg"]);
  assert.equal(figures[0].imageAlt, "Keep"); assert.equal(figures[0].label, "first");
  const first = getEditableDocument(original).blocks[0];
  assert.ok(first.block === "figure");
  assert.deepEqual(figures[0].caption, first.caption);
  const output = serialize(updated);
  assert.match(output, /Literal \.\/old.svg and \[link\]\(\.\/old.svg\)/);
  assert.equal(serialize(parse(output)), output);
  assert.equal(serialize(original), before);
  assert.equal(serialize(updateMediaReferences(original, [{ from: "old.svg", to: "other.svg" }])), before);
  for (const replacements of [[{ from: "", to: "new.svg" }], [{ from: "./old.svg", to: "" }], [{ from: "./old.svg", to: "bad\npath" }], [{ from: "a", to: "b" }, { from: "a", to: "c" }]]) {
    assert.throws(() => updateMediaReferences(original, replacements));
    assert.equal(serialize(original), before);
  }
  const incomplete = updateFigure(original, [0], { caption: [{ kind: "footnote", label: "missing" }] });
  assert.throws(() => updateMediaReferences(incomplete, [{ from: "./old.svg", to: "new.svg" }]), /definition/);
});
const source = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");

test("Figure caption endnotes can be edited before their definitions are supplied", () => {
  const document = parse(":::{figure}\n\nCaption.\n:::\n");
  const before = serialize(document);
  const caption = [{ kind: "text", text: "Caption." }, { kind: "footnote", label: "new" }] as const;
  const updated = updateFigure(document, [0], { caption: [...caption] });
  assert.match(canonicalWriteError(updated) ?? "", /has no definition/);
  assert.throws(() => serialize(updated), /has no definition/);
  const complete = insertFootnoteDefinition(updated, 1, "new", [{ kind: "text", text: "Note." }]);
  const markdown = serialize(complete);
  const figure = getEditableDocument(parse(markdown)).blocks[0];
  assert.ok(figure.block === "figure");
  assert.deepEqual(figure.caption.content, caption);
  assert.equal(serialize(parse(markdown)), markdown);
  assert.equal(serialize(document), before);
});

function semanticFigure(document: MystDocument, index: number) {
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
function roundTrip(document: MystDocument, index: number) {
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
  assert.match(markdown, /See \[Figure\]\(#fig-control\)/);
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
    // Without an image there is nothing for alt text to describe, and no directive field for it.
    [{ imageUrl: "" }, /without an image cannot have alt text/],
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
  // Literal dollars are escaped and stay caption text.
  const dollars = insertFigure(parse("Intro"), 1, { ...valid, caption: "cost $5 and $x$" });
  assert.match(serialize(dollars), /\ncost \\\$5 and \\\$x\\\$\n/);
  assert.equal(serialize(parse(serialize(dollars))), serialize(dollars));
  // Captions that MyST would reinterpret fail the Core round-trip.
  for (const caption of ["% comment", "+++", ":::"]) {
    assert.throws(() => insertFigure(parse("Intro"), 1, { ...valid, caption }), /canonical round-trip|not canonical/);
    assert.throws(() => updateFigure(parse(source), FIGURE_PATH, { caption }), /canonical round-trip|not canonical/);
  }
});

test("validateFigure is the persistent validity used by insertFigure", () => {
  const valid: FigureContent = { imageUrl: "./a.png", imageAlt: "Alt", caption: "Caption" };
  assert.equal(validateFigure(valid), undefined);
  assert.equal(validateFigure({ ...valid, imageAlt: "", caption: "" }), undefined);
  assert.match(validateFigure({ ...valid, imageUrl: "" }) ?? "", /without an image cannot have alt text/);
  // A pending Figure (no image) is valid with or without a caption or a label.
  const pending: FigureContent = { imageUrl: "", imageAlt: "", caption: "" };
  assert.equal(validateFigure(pending), undefined);
  assert.equal(validateFigure(pending, "fig-pfc-control"), undefined);
  assert.equal(validateFigure({ ...pending, caption: "PFC Current Control Architecture" }), undefined);
  assert.match(validateFigure(pending, " fig") ?? "", /leading or trailing spaces/);
  // Field rules alone accept this caption; only the canonical round-trip rejects it.
  const reinterpreted = { ...valid, caption: "% comment" };
  assert.equal(figureContentError(reinterpreted), undefined);
  assert.match(validateFigure(reinterpreted) ?? "", /canonical round-trip|not canonical/);
  assert.throws(() => insertFigure(parse("Intro"), 1, reinterpreted), /canonical round-trip|not canonical/);
});

const PENDING: FigureContent = { imageUrl: "", imageAlt: "", caption: "PFC Current Control Architecture" };

test("a pending Figure persists its caption and label, and connecting or removing an image keeps them", () => {
  const start = parse("Intro\n\nThe controller structure is shown in [Figure](#fig-pfc-control).\n");
  const pending = updateLabel(insertFigure(start, 1, PENDING), [1], "fig-pfc-control");
  const { markdown, figure, node } = roundTrip(pending, 1);
  assert.equal(markdown, "Intro\n\n:::{figure}\n:name: fig-pfc-control\n\nPFC Current Control Architecture\n:::\n\n" +
    "The controller structure is shown in [Figure](#fig-pfc-control).\n");
  assert.equal(serialize(pending), markdown);
  assert.deepEqual(figure, { editable: true, label: "fig-pfc-control", ...PENDING });
  assert.equal(node.identifier, "fig-pfc-control");
  const block = getEditableDocument(parse(markdown)).blocks[1];
  assert.equal(block?.block === "figure" && block.contentKind, "none");

  const connected = updateFigure(parse(markdown), [1], { imageUrl: "./pfc-control.svg", imageAlt: "PFC current control diagram" });
  const withImage = roundTrip(connected, 1);
  assert.equal(withImage.markdown, "Intro\n\n:::{figure} ./pfc-control.svg\n:name: fig-pfc-control\n:alt: PFC current control diagram\n\n" +
    "PFC Current Control Architecture\n:::\n\nThe controller structure is shown in [Figure](#fig-pfc-control).\n");
  assert.deepEqual([withImage.figure.label, withImage.figure.caption, withImage.node.identifier],
    ["fig-pfc-control", PENDING.caption, "fig-pfc-control"]);
  // Removing the image, and with it the alt text, is the same pending Figure again.
  assert.equal(serialize(updateFigure(parse(withImage.markdown), [1], { imageUrl: "", imageAlt: "" })), markdown);

  // A label alone, or a caption alone, is a Figure a document may keep.
  const labelOnly = updateLabel(insertFigure(parse("Intro"), 1, { ...PENDING, caption: "" }), [1], "fig-pfc-control");
  assert.equal(roundTrip(labelOnly, 1).markdown, "Intro\n\n:::{figure}\n:name: fig-pfc-control\n:::\n");
  assert.equal(canonicalWriteError(labelOnly), undefined);
  const captionOnly = insertFigure(parse("Intro"), 1, PENDING);
  assert.equal(roundTrip(captionOnly, 1).markdown, "Intro\n\n:::{figure}\n\nPFC Current Control Architecture\n:::\n");
  assert.equal(canonicalWriteError(captionOnly), undefined);
  // Supported inline caption content is kept as it is for an image Figure.
  const rich: FigureContent = { ...PENDING, caption: [
    { kind: "strong", children: [{ kind: "text", text: "PFC" }] }, { kind: "text", text: " loop " }, { kind: "math", value: "i_L" },
  ] };
  assert.equal(roundTrip(insertFigure(parse("Intro"), 1, rich), 1).markdown, "Intro\n\n:::{figure}\n\n**PFC** loop $i_L$\n:::\n");
  // A pending Figure is numbered like any Figure: the fixture's Figure after it becomes 2.
  const blocks = getEditableDocument(insertFigure(parse(source), 2, PENDING)).blocks;
  const numbers = targetNumbers(blocks.map(item => blockTargets(item)));
  assert.deepEqual(blocks.flatMap((item, index) => item.block === "figure" ? [numbers[index].figure] : []), [1, 2]);
  // Moving the same pending container keeps its label and caption; removing it
  // removes only that block, leaving surrounding prose/reference source intact.
  const moved = moveBlock(pending, 1, 0);
  assert.deepEqual(roundTrip(moved, 0).figure, figure);
  assert.equal(canonicalWriteError(moved), undefined);
  assert.equal(serialize(removeBlock(moved, 0)), serialize(start));
  assert.throws(() => updateLabel(insertFigure(pending, 2, PENDING), [2], "fig-pfc-control"), /already names another target/);
  assert.equal(serialize(pending), markdown);
});

test("an empty Figure, with no image, caption or label, is a numbered place a document keeps", () => {
  const empty = insertFigure(parse("Intro"), 1, { ...PENDING, caption: "" });
  const { markdown, figure } = roundTrip(empty, 1);
  assert.equal(markdown, "Intro\n\n:::{figure}\n:::\n");
  assert.deepEqual(figure, { editable: true, label: "", imageUrl: "", imageAlt: "", caption: "" });
  assert.equal(canonicalWriteError(empty), undefined);
  // A file holding one stays writable and editable.
  const opened = parse(":::{figure}\n:::\n");
  assert.equal(canonicalWriteError(opened), undefined);
  const block = getEditableDocument(opened).blocks[0];
  assert.deepEqual(block?.block === "figure" && [block.editable, block.contentKind], [true, "none"]);
  // It is numbered like any Figure, and later content fills the same container.
  const blocks = getEditableDocument(insertFigure(parse(source), 2, { ...PENDING, caption: "" })).blocks;
  const numbers = targetNumbers(blocks.map(item => blockTargets(item)));
  assert.deepEqual(blocks.flatMap((item, index) => item.block === "figure" ? [numbers[index].figure] : []), [1, 2]);
  assert.equal(serialize(updateFigure(empty, [1], { imageUrl: "./a.png", caption: "Caption" })),
    "Intro\n\n:::{figure} ./a.png\nCaption\n:::\n");
});


test("updateFigure rejects non-Figure and invalid paths", () => {
  const document = parse(source);
  assert.throws(() => updateFigure(document, [0], { caption: "x" }), /requires a figure/);
  assert.throws(() => updateFigure(document, [99], { caption: "x" }), /out of range/);
  assert.throws(() => updateFigure(document, [6, 1], { caption: "x" }), /requires a figure/);
});


test("Figure captions keep supported inline semantics through updates, inserts and canonical reload", () => {
  const caption: import("./core-internal.ts").InlineContent[] = [
    { kind: "strong", children: [{ kind: "text", text: "Bold" }] }, { kind: "text", text: " " },
    { kind: "emphasis", children: [{ kind: "text", text: "italic" }] }, { kind: "text", text: " " },
    { kind: "delete", children: [{ kind: "text", text: "old" }] }, { kind: "text", text: " " },
    { kind: "link", url: "https://a.example", children: [{ kind: "text", text: "manual" }] },
    { kind: "text", text: " " }, { kind: "code", value: "a_b" }, { kind: "text", text: " " },
    { kind: "math", value: "x_1" }, { kind: "text", text: " " }, { kind: "reference", role: "eq", label: "eq-current" },
  ];
  for (const [document, index] of [
    [updateFigure(parse(source), FIGURE_PATH, { caption }), FIGURE_PATH[0]],
    [insertFigure(parse(source), 1, { imageUrl: "./a.png", imageAlt: "", caption }), 1],
  ] as const) {
    const { markdown } = roundTrip(document, index);
    const block = getEditableDocument(parse(markdown)).blocks[index];
    assert.equal(block.block, "figure");
    if (block.block !== "figure") continue;
    assert.equal(block.editable, true);
    assert.deepEqual(block.caption.content, caption);
    const imageOnly = updateFigure(parse(markdown), [index], { imageAlt: "Changed alt" });
    const preserved = getEditableDocument(imageOnly).blocks[index];
    assert.deepEqual(preserved.block === "figure" && preserved.caption.content, caption);
    const plain = updateFigure(document, [index], { caption: "Plain" });
    const plainBlock = getEditableDocument(plain).blocks[index];
    assert.deepEqual(plainBlock.block === "figure" && plainBlock.caption.content, [{ kind: "text", text: "Plain" }]);
  }
  const original = parse(source);
  const before = serialize(original);
  for (const invalid of [[{ kind: "text", text: "% comment" }], [{ kind: "link", url: "", children: [] }], [{ kind: "unknown" }]]) {
    assert.throws(() => updateFigure(original, FIGURE_PATH, { caption: invalid as never }));
    assert.equal(serialize(original), before);
  }
});


test("Mermaid Figure operations preserve opaque source, caption, identity and mixed Figure numbering", () => {
  const input = parse(":::{figure} ./image.svg\n:name: fig-image\n\nImage\n:::\n\nSee [Flow](#fig-flow) and {numref}`fig-image`.\n");
  const before = serialize(input);
  const source = 'graph LR\n  A["한글 😀 ```"] --> B\n\n  %% ::: and ```` are opaque source';
  const figure: FigureContent = { imageUrl: "", imageAlt: "", caption: [
    { kind: "strong", children: [{ kind: "text", text: "흐름" }] },
    { kind: "text", text: " $5 @literal " }, { kind: "math", value: "x_1" },
  ], mermaidSource: source };
  const inserted = updateLabel(insertFigure(input, 1, figure), [1], "fig-flow");
  const markdown = serialize(inserted);
  const reopened = parse(markdown);
  const block = getEditableDocument(reopened).blocks[1];
  assert.ok(block.block === "figure");
  assert.equal(block.contentKind, "mermaid");
  assert.equal(block.mermaidSource, source);
  assert.equal(block.imageUrl, ""); assert.equal(block.imageAlt, "");
  assert.deepEqual(block.caption.content, figure.caption);
  assert.equal(block.label, "fig-flow");
  assert.equal(serialize(reopened), markdown);
  const blocks = getEditableDocument(reopened).blocks;
  assert.deepEqual(targetNumbers(blocks.map(blockTargets)).map(n => n.figure).filter(n => n !== undefined), [1, 2]);
  assert.equal(serialize(input), before);
  // Core deliberately accepts invalid Mermaid syntax: rendering is an interface concern.
  const changed = updateFigure(reopened, [1], { mermaidSource: "opaque invalid diagram 🐦", caption: "Changed" });
  const projected = getEditableDocument(parse(serialize(changed))).blocks[1];
  assert.ok(projected.block === "figure");
  assert.equal(projected.mermaidSource, "opaque invalid diagram 🐦");
  assert.equal(projected.caption.text, "Changed"); assert.equal(projected.label, "fig-flow");
  const renamed = updateLabel(changed, [1], "fig-renamed", { updateReferences: true });
  assert.match(serialize(renamed), /\[Flow\]\(#fig-renamed\)/);
  // Caption-only edits retain source; unrelated image replacements leave it alone.
  const captionOnly = getEditableDocument(updateFigure(inserted, [1], { caption: "New" })).blocks[1];
  assert.ok(captionOnly.block === "figure"); assert.equal(captionOnly.mermaidSource, source);
  const minimal = insertFigure(parse(""), 0, { ...figure, caption: "" });
  assert.equal(serialize(minimal), ":::{figure}\n\n`````{mermaid}\n" + source + "\n`````\n:::\n");
  assert.match(serialize(updateMediaReferences(inserted, [{ from: "./image.svg", to: "./new.svg" }])), /한글 😀/);
  for (const source of ["", " \n\t"]) {
    assert.throws(() => insertFigure(input, 1, { ...figure, mermaidSource: source }), /non-empty/);
    assert.throws(() => updateFigure(inserted, [1], { mermaidSource: source }), /non-empty/);
  }
  for (const index of [0, 1]) {
    const other = insertFigure(input, index, { imageUrl: "", imageAlt: "", caption: "" });
    assert.throws(() => updateFigure(other, [index], { mermaidSource: "graph LR" }), /existing Mermaid Figure/);
  }
  assert.throws(() => updateFigure(input, [0], { mermaidSource: "graph LR" }), /existing Mermaid Figure/);
  for (const changes of [{ imageUrl: "image.svg" }, { imageAlt: "Alt" }]) {
    assert.throws(() => updateFigure(inserted, [1], changes), /cannot have an image or alt/);
  }
  // MyST trims boundary blank lines. Operations refuse this loss rather than changing source.
  for (const source of ["\ngraph LR", "graph LR\n", "graph LR\r\n  A --> B"]) {
    assert.throws(() => updateFigure(inserted, [1], { mermaidSource: source }), /round-trip/);
  }
  assert.equal(serialize(inserted), markdown);
});
