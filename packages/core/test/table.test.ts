import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getEditableDocument,
  insertTable,
  insertTableColumn,
  insertTableRow,
  parse,
  removeBlock,
  serialize,
  updateTableCell,
  type InlineContent,
  type MystDocument,
} from "./core-internal.ts";

const technical = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");
const TABLE = 12;

function cells(document: MystDocument, index: number) {
  const block = getEditableDocument(document).blocks[index];
  assert.equal(block?.block, "table");
  return block.block === "table" ? block.rows.map((row) => row.cells.map(({ text, header, editable }) => ({ text, header, editable }))) : [];
}

test("cells of supported inline content and empty cells are editable; other cells stay read-only", () => {
  assert.deepEqual(cells(parse(technical), TABLE), [
    [{ text: "Port", header: true, editable: true }, { text: "Type", header: true, editable: true }],
    [{ text: "U", header: false, editable: true }, { text: "AC", header: false, editable: true }],
    [{ text: "P", header: false, editable: true }, { text: "DC", header: false, editable: true }],
  ]);
  const mixed = parse("| A | B | C | D | E |\n| --- | --- | --- | --- | --- |\n|  | **b** | $x$ | [l](u) | {ref}`intro` |\n");
  assert.deepEqual(cells(mixed, 0)[1].map((cell) => cell.editable), [true, true, true, true, false]);
  const block = getEditableDocument(mixed).blocks[0];
  assert.deepEqual(block.block === "table" && block.rows[1].cells.map((cell) => cell.content), [
    [], [{ kind: "strong", children: [{ kind: "text", text: "b" }] }], [{ kind: "math", value: "x" }],
    [{ kind: "link", url: "u", children: [{ kind: "text", text: "l" }] }], [],
  ]);
});

test("updateTableCell and insertTable keep inline content through canonical Markdown", () => {
  const formatted: InlineContent[] = [
    { kind: "strong", children: [{ kind: "text", text: "AC" }] }, { kind: "text", text: " at " }, { kind: "math", value: "x_1" },
    { kind: "text", text: " " }, { kind: "code", value: "a_b" }, { kind: "text", text: " " },
    { kind: "link", url: "https://a.example", children: [{ kind: "text", text: "spec" }] },
    { kind: "text", text: " " }, { kind: "reference", role: "eq", label: "eq-current" },
  ];
  const edited = updateTableCell(parse(technical), [TABLE, 1, 1], formatted);
  const inserted = insertTable(parse(""), 0, [["Port", [{ kind: "emphasis", children: [{ kind: "text", text: "Type" }] }]], ["U", formatted]]);
  for (const [document, index] of [[edited, TABLE], [inserted, 0]] as const) {
    const markdown = serialize(document);
    assert.equal(serialize(parse(markdown)), markdown);
    const block = getEditableDocument(parse(markdown)).blocks[index];
    assert.equal(block.block, "table");
    if (block.block !== "table") continue;
    assert.equal(block.rows[1].cells[1].editable, true);
    assert.deepEqual(block.rows[1].cells[1].content, formatted);
  }
  // Plain text replaces a formatted cell, clearing its marks.
  const plain = updateTableCell(edited, [TABLE, 1, 1], "AC");
  assert.deepEqual(cells(plain, TABLE)[1][1], { text: "AC", header: false, editable: true });
  assert.match(serialize(plain), /\| U +\| AC +\|/);
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
  // Empty inline content clears a cell like empty text.
  assert.equal(serialize(updateTableCell(filled, [0, 1, 0], [{ kind: "text", text: "" }])), markdown);
});

test("updateTableCell fails closed without mutating the document", () => {
  const document = parse(technical);
  const before = structuredClone(document);
  const rejected: [number[], string | InlineContent[], RegExp][] = [
    [[TABLE, 1, 1], "A\nB", /line breaks/],
    [[TABLE, 1, 1], [{ kind: "text", text: "A" }, { kind: "break" }, { kind: "text", text: "B" }], /line breaks/],
    [[TABLE, 1, 1], [{ kind: "strong", children: [{ kind: "text", text: "AC " }] }], /whitespace/],
    [[TABLE, 1, 1], " AC", /whitespace/],
    [[TABLE, 1, 1], "AC ", /whitespace/],
    // `$x$` would reparse as inline math, not the text that was typed.
    [[TABLE, 1, 1], "cost $x$", /table cell text cannot be preserved through canonical round-trip/],
    // The writer does not escape a pipe inside inline code or math, so it would end the cell.
    [[TABLE, 1, 1], [{ kind: "code", value: "a|b" }], /table cell text cannot be preserved through canonical round-trip/],
    [[TABLE, 1], "x", /requires a top-level table cell path/],
    [[2, 0, 0], "x", /not editable/],
    [[TABLE, 9, 0], "x", /out of range/],
  ];
  for (const [path, text, reason] of rejected) {
    assert.throws(() => updateTableCell(document, path, text), reason, `${path} ${JSON.stringify(text)}`);
  }
  assert.deepEqual(document, before);
  const readonlyCell = parse("| A |\n| --- |\n| {ref}`b` |\n");
  assert.throws(() => updateTableCell(readonlyCell, [0, 1, 0], "b"), /not editable/);
  // Table directives are not Markdown tables and stay read-only.
  const directive = parse(":::{list-table}\n* - a\n:::\n");
  assert.equal(getEditableDocument(directive).blocks[0]?.block, "unsupported");
  assert.throws(() => updateTableCell(directive, [0, 0, 0], "b"), /not editable/);
});

const texts = (document: MystDocument, index: number) => cells(document, index).map((row) => row.map((cell) => cell.text));

test("insertTable writes a header row and body rows of plain text through canonical Markdown", () => {
  const document = parse("# Title\n\nText.\n");
  const next = insertTable(document, 1, [["Port", "Type"], ["U", "AC"], ["", "a | b"]]);
  const markdown = serialize(next);
  assert.equal(markdown, String.raw`# Title

| Port | Type   |
| ---- | ------ |
| U    | AC     |
|      | a \| b |

Text.
`);
  assert.equal(serialize(parse(markdown)), markdown);
  assert.deepEqual(texts(parse(markdown), 1), [["Port", "Type"], ["U", "AC"], ["", "a | b"]]);
  assert.deepEqual(cells(parse(markdown), 1).map((row) => row.map((cell) => cell.header)), [[true, true], [false, false], [false, false]]);
  // A header-only table and an empty table are Markdown tables too.
  assert.deepEqual(texts(parse(serialize(insertTable(document, 0, [["A"]]))), 0), [["A"]]);
  assert.deepEqual(texts(parse(serialize(insertTable(document, 2, [["", ""], ["", ""]]))), 2), [["", ""], ["", ""]]);
});

test("insertTableRow adds an empty body row below the header or any body row", () => {
  const document = parse("| A | B |\n| --- | --- |\n| x | y |\n");
  const markdown = serialize(insertTableRow(insertTableRow(document, [0], 1), [0], 3));
  assert.equal(markdown, "| A | B |\n| - | - |\n|   |   |\n| x | y |\n|   |   |\n");
  assert.equal(serialize(parse(markdown)), markdown);
  assert.deepEqual(texts(parse(markdown), 0), [["A", "B"], ["", ""], ["x", "y"], ["", ""]]);
  // A new row's cells are editable, so they can be filled right away.
  assert.deepEqual(texts(updateTableCell(parse(markdown), [0, 1, 1], "z"), 0)[1], ["", "z"]);
});

test("insertTableColumn adds an empty column, header cell included, at any position", () => {
  const document = parse("| A | B |\n| --- | --- |\n| x | **y** |\n");
  const first = insertTableColumn(document, [0], 0);
  const last = insertTableColumn(first, [0], 3);
  const markdown = serialize(last);
  assert.equal(markdown, "|   | A | B     |   |\n| - | - | ----- | - |\n|   | x | **y** |   |\n");
  assert.equal(serialize(parse(markdown)), markdown);
  assert.deepEqual(cells(parse(markdown), 0), [
    [{ text: "", header: true, editable: true }, { text: "A", header: true, editable: true }, { text: "B", header: true, editable: true }, { text: "", header: true, editable: true }],
    [{ text: "", header: false, editable: true }, { text: "x", header: false, editable: true }, { text: "y", header: false, editable: true }, { text: "", header: false, editable: true }],
  ]);
});

test("table insertion fails closed without mutating the document", () => {
  const document = parse(technical);
  const before = structuredClone(document);
  const rejected: [() => unknown, RegExp][] = [
    [() => insertTable(document, 0, [["A"]], []), /alignment/],
    [() => insertTable(document, 0, [["A"]], ["invalid" as "left"]), /alignment/],
    [() => insertTable(document, 0, []), /header row with at least one cell/],
    [() => insertTable(document, 0, [[]]), /header row with at least one cell/],
    [() => insertTable(document, 0, [["A", "B"], ["x"]]), /same number of cells/],
    [() => insertTable(document, 0, [["A"], ["x\ny"]]), /line breaks/],
    [() => insertTable(document, 0, [[" A"]]), /whitespace/],
    [() => insertTable(document, 0, [["cost $x$"]]), /table cannot be preserved through canonical round-trip/],
    [() => insertTable(document, 99, [["A"]]), /index out of range/],
    [() => insertTableRow(document, [TABLE], 0), /from 1 to 3/],
    [() => insertTableRow(document, [TABLE], 4), /from 1 to 3/],
    [() => insertTableRow(document, [TABLE], 1.5), /from 1 to 3/],
    [() => insertTableColumn(document, [TABLE], -1), /from 0 to 2/],
    [() => insertTableColumn(document, [TABLE], 3), /from 0 to 2/],
    [() => insertTableRow(document, [0], 1), /requires a table at \[0\]/],
    [() => insertTableColumn(document, [TABLE, 0], 0), /top-level table path/],
  ];
  for (const [run, reason] of rejected) assert.throws(run, reason);
  assert.deepEqual(document, before);
});

test("aligned tables retain column semantics across cell edits and row/column insertion", () => {
  let document = insertTable(parse(""), 0, [["L", "C", "R", "None"], ["a", "b", "c", "d"]], ["left", "center", "right", null]);
  document = updateTableCell(document, [0, 1, 1], "changed");
  document = insertTableRow(document, [0], 1);
  document = insertTableColumn(document, [0], 2);
  const markdown = serialize(document);
  const block = getEditableDocument(parse(markdown)).blocks[0];
  assert.equal(block.block, "table");
  if (block.block !== "table") return;
  for (const row of block.rows) assert.deepEqual(row.cells.map(cell => cell.align), ["left", "center", undefined, "right", undefined]);
  assert.equal(block.rows[2].cells[1].text, "changed");
  assert.equal(serialize(parse(markdown)), markdown);
});
