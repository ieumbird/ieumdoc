import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getEditableDocument, parse } from "../src/index.ts";

const source = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");

test("technical document exposes an editor read model", () => {
  const editable = getEditableDocument(parse(source));
  const kinds = editable.blocks.map((block) => block.block);

  assert.equal(kinds.includes("heading"), true);
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

  const figure = editable.blocks.find((block) => block.block === "figure");
  assert.equal(figure?.block, "figure");
  if (figure?.block !== "figure") return;
  assert.equal(figure.label, "fig-control");
  assert.equal(figure.imageUrl, "./diagram.svg");
  assert.equal(figure.caption.text, "Control block diagram of the grid-connected converter.");
  assert.deepEqual(figure.caption.path, [6, 1]);

  const table = editable.blocks.find((block) => block.block === "table");
  assert.equal(table?.block, "table");
  if (table?.block !== "table") return;
  assert.equal(table.rows.length, 3);
  assert.equal(table.rows[1]?.cells[1]?.text, "AC");
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
