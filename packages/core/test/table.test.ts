import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getEditableDocument, parse, removeBlock, serialize, updateTableCell, type MystDocument } from "./core-internal.ts";

const technical = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");
const TABLE = 12;

function cells(document: MystDocument, index: number) {
  const block = getEditableDocument(document).blocks[index];
  assert.equal(block?.block, "table");
  return block.block === "table" ? block.rows.map((row) => row.cells.map(({ text, header, editable }) => ({ text, header, editable }))) : [];
}

test("plain-text and empty cells of a Markdown table are editable; other cells stay read-only", () => {
  assert.deepEqual(cells(parse(technical), TABLE), [
    [{ text: "Port", header: true, editable: true }, { text: "Type", header: true, editable: true }],
    [{ text: "U", header: false, editable: true }, { text: "AC", header: false, editable: true }],
    [{ text: "P", header: false, editable: true }, { text: "DC", header: false, editable: true }],
  ]);
  const mixed = parse("| A | B | C | D |\n| --- | --- | --- | --- |\n|  | **b** | $x$ | [l](u) |\n");
  assert.deepEqual(cells(mixed, 0)[1].map((cell) => cell.editable), [true, false, false, false]);
});

test("updateTableCell writes header and body cell text through canonical Markdown", () => {
  const original = parse(technical);
  const header = updateTableCell(original, [TABLE, 0, 0], "Port name");
  const edited = updateTableCell(header, [TABLE, 1, 1], "AC-side");
  const markdown = serialize(edited);
  assert.match(markdown, /\| Port name \| Type +\|\n\| -+ \| -+ \|\n\| U +\| AC-side \|\n\| P +\| DC +\|\n$/);
  assert.equal(serialize(parse(markdown)), markdown);
  assert.deepEqual(cells(parse(markdown), TABLE).map((row) => row.map((cell) => cell.text)),
    [["Port name", "Type"], ["U", "AC-side"], ["P", "DC"]]);
  assert.deepEqual(cells(parse(markdown), TABLE)[0].map((cell) => cell.header), [true, true]);
  // Everything outside the table is written exactly as before.
  assert.equal(serialize(removeBlock(parse(markdown), TABLE)), serialize(removeBlock(original, TABLE)));
});

test("cells can be cleared and filled, and Markdown syntax is kept as literal text", () => {
  const document = parse("| A | B |\n| --- | --- |\n| x |  |\n");
  const filled = updateTableCell(document, [0, 1, 1], "a | b *c* `d`");
  const cleared = updateTableCell(filled, [0, 1, 0], "");
  const markdown = serialize(cleared);
  assert.deepEqual(cells(parse(markdown), 0)[1], [
    { text: "", header: false, editable: true },
    { text: "a | b *c* `d`", header: false, editable: true },
  ]);
  assert.equal(serialize(parse(markdown)), markdown);
});

test("updateTableCell fails closed without mutating the document", () => {
  const document = parse(technical);
  const before = structuredClone(document);
  const rejected: [number[], string, RegExp][] = [
    [[TABLE, 1, 1], "A\nB", /line breaks/],
    [[TABLE, 1, 1], " AC", /whitespace/],
    [[TABLE, 1, 1], "AC ", /whitespace/],
    // `$x$` would reparse as inline math, not the text that was typed.
    [[TABLE, 1, 1], "cost $x$", /table cell text cannot be preserved through canonical round-trip/],
    [[TABLE, 1], "x", /requires a top-level table cell path/],
    [[2, 0, 0], "x", /not editable/],
    [[TABLE, 9, 0], "x", /out of range/],
  ];
  for (const [path, text, reason] of rejected) {
    assert.throws(() => updateTableCell(document, path, text), reason, `${path} ${JSON.stringify(text)}`);
  }
  assert.deepEqual(document, before);
  const readonlyCell = parse("| A |\n| --- |\n| **b** |\n");
  assert.throws(() => updateTableCell(readonlyCell, [0, 1, 0], "b"), /not editable/);
  // Table directives are not Markdown tables and stay read-only.
  const directive = parse(":::{list-table}\n* - a\n:::\n");
  assert.equal(getEditableDocument(directive).blocks[0]?.block, "unsupported");
  assert.throws(() => updateTableCell(directive, [0, 0, 0], "b"), /not editable/);
});
