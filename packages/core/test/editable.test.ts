import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getEditableDocument, parse } from "./core-internal.ts";

const source = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");

test("technical document exposes an editor read model", () => {
  const editable = getEditableDocument(parse(source));
  const kinds = editable.blocks.map((block) => block.block);

  assert.equal(kinds.includes("heading"), true);
  assert.equal(
    editable.blocks.every((block) => block.block !== "heading" || block.editable),
    true,
  );
  assert.equal(kinds.includes("paragraph"), true);
  assert.equal(kinds.includes("admonition"), true);
  assert.equal(kinds.includes("figure"), true);
  assert.equal(kinds.includes("table"), true);
  assert.equal(kinds.includes("equation"), true);

  const paragraph = editable.blocks.find(
    (block) =>
      block.block === "paragraph" &&
      block.text === "The current reference is calculated from the active power command.",
  );
  assert.equal(paragraph?.block, "paragraph");
  if (paragraph?.block !== "paragraph") return;
  assert.equal(paragraph.editable, true);
  assert.deepEqual(paragraph.path, [8]);

  const formatted = editable.blocks.find(
    (block) =>
      block.block === "paragraph" &&
      block.text === "The converter regulates the DC-link voltage and phase current.",
  );
  assert.equal(formatted?.block, "paragraph");
  if (formatted?.block !== "paragraph") return;
  assert.equal(formatted.editable, true);
  assert.equal(formatted.content.some((item) => item.kind === "strong"), true);
  assert.equal(formatted.content.some((item) => item.kind === "emphasis"), true);

  const figure = editable.blocks.find((block) => block.block === "figure");
  assert.equal(figure?.block, "figure");
  if (figure?.block !== "figure") return;
  assert.equal(figure.label, "fig-control");
  assert.equal(figure.imageUrl, "./diagram.svg");
  assert.equal(figure.caption.text, "Control block diagram of the grid-connected converter.");
  assert.equal(figure.caption.editable, true);
  assert.deepEqual(figure.caption.path, [6, 1]);

  const table = editable.blocks.find((block) => block.block === "table");
  assert.equal(table?.block, "table");
  if (table?.block !== "table") return;
  assert.equal(table.rows.length, 3);
  assert.equal(table.rows[1]?.cells[1]?.text, "AC");
  assert.equal(table.rows[1]?.cells[1]?.editable, true);
  assert.deepEqual(table.rows[1]?.cells[1]?.path, [12, 1, 1]);

  const warning = editable.blocks.find((block) => block.block === "admonition");
  assert.equal(warning?.block, "admonition");
  if (warning?.block !== "admonition") return;
  assert.equal(warning.variant, "warning");

  const equation = editable.blocks.find((block) => block.block === "equation");
  assert.equal(equation?.block, "equation");
  if (equation?.block !== "equation") return;
  assert.equal(equation.label, "eq-current");
  assert.equal(equation.latex.includes("P^{"), true);
});

test("heading with inline marks stays read-only", () => {
  const heading = getEditableDocument(parse("# Plain **bold** title\n")).blocks[0];
  assert.equal(heading?.block, "heading");
  if (heading?.block !== "heading") return;
  assert.equal(heading.editable, false);
  assert.equal(heading.text, "Plain bold title");
  assert.equal(heading.level, 1);
});

test("formatted caption and table cell stay read-only", () => {
  const formattedCaption = getEditableDocument(
    parse("# Title\n\n:::{figure} ./diagram.svg\n**bold caption**\n:::\n"),
  ).blocks.find((block) => block.block === "figure");
  assert.equal(formattedCaption?.block, "figure");
  if (formattedCaption?.block !== "figure") return;
  assert.equal(formattedCaption.caption.editable, false);

  const formattedCell = getEditableDocument(parse("| A |\n| --- |\n| *x* |\n")).blocks.find(
    (block) => block.block === "table",
  );
  assert.equal(formattedCell?.block, "table");
  if (formattedCell?.block !== "table") return;
  assert.equal(formattedCell.rows[1]?.cells[0]?.editable, false);
  assert.equal(formattedCell.rows[1]?.cells[0]?.text, "x");
});
