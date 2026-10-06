import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { history, undo } from "@tiptap/pm/history";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import {
  addTableColumnRight,
  addTableRowBelow,
  alignTableColumn,
  BLOCK_COMMANDS,
  filterInsertCommands,
  insertParagraphAfter,
  insertTableAfter,
  moveTableColumn,
  moveTableRow,
  removeTableColumn,
  removeTableRow,
} from "../src/block-commands.ts";
import { editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import {
  assertSupportedDocumentChange,
  collectSupportedEdits,
  toTiptapDocument,
  type TiptapJSON,
} from "../src/tiptap-document.ts";
import { loadEditableDocument, saveEdits } from "../server/document-api.ts";

const text = (value: string) => [{ kind: "text" as const, text: value }];
const mixed = "Intro.\n\n| Name | Note |\n| --- | --- |\n| U | {sub}`bold` |\n| P |  |\n";
const TABLE = 1;

function editorState(source: string) {
  const document = loadEditableDocument(source);
  const baseline = toTiptapDocument(document);
  const schema = getSchema(editorExtensions());
  const rejected: string[] = [];
  const state = EditorState.create({
    schema,
    doc: schema.nodeFromJSON(baseline),
    plugins: [history(), structureGuardPlugin(baseline, () => rejected.push("rejected"))],
  });
  return { document, state, rejected };
}

/** Apply like the view does: a transaction the structure guard filters out changes nothing. */
function apply(state: EditorState, tr: Transaction): EditorState {
  return state.applyTransaction(tr).state;
}

function grid(state: EditorState, index = TABLE): string[][] {
  const rows: string[][] = [];
  state.doc.child(index).forEach(row => {
    const cells: string[] = [];
    row.forEach(cell => cells.push(cell.type.name === "readonlyTableCell" ? `(${cell.attrs.text})` : cell.textContent));
    rows.push(cells);
  });
  return rows;
}

function caretIn(state: EditorState, row: number, column: number, index = TABLE): EditorState {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
  const table = state.doc.child(index);
  let at = pos + 1;
  for (let i = 0; i < row; i++) at += table.child(i).nodeSize;
  at += 1;
  for (let i = 0; i < column; i++) at += table.child(row).child(i).nodeSize;
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, at + 1)));
}

const cellOf = (state: EditorState) => ({ row: state.selection.$from.index(1), column: state.selection.$from.index(2) });

test("Table is an insert command; row and column commands are offered for tables only", () => {
  assert.deepEqual(filterInsertCommands("tab").map(command => command.id), ["table"]);
  const { state } = editorState(mixed);
  const listed = (index: number) => BLOCK_COMMANDS.filter(command => command.applies?.(state, index) ?? true).map(command => command.label);
  assert.deepEqual(listed(TABLE), ["Add row below", "Add column right", "Move row up", "Move row down", "Move column left", "Move column right",
    "Align column left", "Align column center", "Align column right", "Clear column alignment", "Delete row", "Delete column", "Delete"]);
  assert.ok(listed(0).includes("Delete"));
  assert.ok(!listed(0).some(label => label.includes("row") || label.includes("column")));
  // Row and column commands act on the caret's cell; the header row neither moves nor is removed.
  const enabled = (current: EditorState) => BLOCK_COMMANDS.filter(command => (command.applies?.(current, TABLE) ?? true) && command.enabled(current, TABLE)).map(command => command.id);
  assert.deepEqual(enabled(state), ["table-row", "table-column", "delete"]);
  assert.deepEqual(enabled(caretIn(state, 0, 0)), ["table-row", "table-column", "table-column-right", "table-align-left", "table-align-center",
    "table-align-right", "table-column-delete", "delete"]);
  assert.deepEqual(enabled(caretIn(state, 2, 1)).filter(id => id.startsWith("table-row") || id.startsWith("table-column-")),
    ["table-row", "table-row-up", "table-column-left", "table-row-delete", "table-column-delete"]);
});

test("a new table has a header row and two body rows of three columns, and saves through Core insertTable", () => {
  let { document, state, rejected } = editorState(mixed);
  state = apply(state, insertTableAfter(state, 0));
  assert.equal(rejected.length, 0);
  assert.equal(state.doc.child(1).type.name, "table");
  assert.deepEqual(grid(state, 1), [["", "", ""], ["", "", ""], ["", "", ""]]);
  const headers: boolean[][] = [];
  state.doc.child(1).forEach(row => { const flags: boolean[] = []; row.forEach(cell => flags.push(cell.attrs.header)); headers.push(flags); });
  assert.deepEqual(headers, [[true, true, true], [false, false, false], [false, false, false]]);
  assert.deepEqual(cellOf(state), { row: 0, column: 0 });
  assert.equal(state.selection.$from.index(0), 1);

  // An empty table is not saved, like an empty paragraph.
  assert.throws(() => collectSupportedEdits(document, state.doc.toJSON() as TiptapJSON), /empty table cannot be saved/);
  state = apply(state, state.tr.insertText("Port"));
  state = apply(state, caretIn(state, 1, 0, 1).tr.insertText("U"));
  const edits = collectSupportedEdits(document, state.doc.toJSON() as TiptapJSON);
  assert.deepEqual(edits.inserts, [{ block: "table", rows: [[text("Port"), [], []], [text("U"), [], []], [[], [], []]] }]);
  const saved = saveEdits(mixed, edits);
  assert.equal(saved.markdown, "Intro.\n\n| Port |   |   |\n| ---- | - | - |\n| U    |   |   |\n|      |   |   |\n\n| Name | Note        |\n| ---- | ----------- |\n| U    | {sub}`bold` |\n| P    |             |\n");
  assert.equal(saved.document.blocks[1]?.block, "table");
});

test("a table inserted from a transient empty paragraph replaces it", () => {
  let { state, rejected } = editorState(mixed);
  state = apply(state, insertParagraphAfter(state, 0));
  const blocks = state.doc.childCount;
  state = apply(state, insertTableAfter(state, 1));
  assert.equal(rejected.length, 0);
  assert.equal(state.doc.childCount, blocks);
  assert.equal(state.doc.child(1).type.name, "table");
});

test("rows and columns are added next to the caret's cell, or at the end, and save through Core", () => {
  let { document, state, rejected } = editorState(mixed);
  // Row below the caret's row, with the caret moving into it.
  state = caretIn(state, 1, 0);
  state = apply(state, addTableRowBelow(state, TABLE));
  assert.deepEqual(grid(state), [["Name", "Note"], ["U", "(bold)"], ["", ""], ["P", ""]]);
  assert.deepEqual(cellOf(state), { row: 2, column: 0 });
  state = apply(state, state.tr.insertText("I"));
  // Column right of the caret's column; the header cell is a header.
  state = apply(state, addTableColumnRight(state, TABLE));
  assert.deepEqual(grid(state), [["Name", "", "Note"], ["U", "", "(bold)"], ["I", "", ""], ["P", "", ""]]);
  assert.deepEqual(cellOf(state), { row: 2, column: 1 });
  assert.equal(state.doc.child(TABLE).child(0).child(1).attrs.header, true);
  state = apply(state, state.tr.insertText("x"));
  // Without a caret in the table: after the last row / column.
  const outside = (current: EditorState) => current.apply(current.tr.setSelection(TextSelection.create(current.doc, 1)));
  state = apply(outside(state), addTableRowBelow(outside(state), TABLE));
  assert.deepEqual(cellOf(state), { row: 4, column: 0 });
  state = apply(outside(state), addTableColumnRight(outside(state), TABLE));
  assert.deepEqual(cellOf(state), { row: 0, column: 3 });
  assert.deepEqual(grid(state), [["Name", "", "Note", ""], ["U", "", "(bold)", ""], ["I", "x", "", ""], ["P", "", "", ""], ["", "", "", ""]]);
  // A snapshot cell edited in the same session keeps its snapshot path.
  state = apply(caretIn(state, 3, 0), caretIn(state, 3, 0).tr.insertText("Q"));
  assert.equal(rejected.length, 0);

  const edits = collectSupportedEdits(document, state.doc.toJSON() as TiptapJSON);
  assert.deepEqual(edits.cells, [{ path: [TABLE, 2, 0], content: text("QP") }]);
  assert.deepEqual(edits.tables, [{
    path: [TABLE],
    rows: [0, 1, null, 2, null],
    columns: [0, null, 1, null],
    cells: [{ row: 2, column: 0, content: text("I") }, { row: 2, column: 1, content: text("x") }],
  }]);
  const saved = saveEdits(mixed, edits);
  assert.equal(saved.markdown, "Intro.\n\n| Name |   | Note        |   |\n| ---- | - | ----------- | - |\n| U    |   | {sub}`bold` |   |\n| I    | x |             |   |\n| QP   |   |             |   |\n|      |   |             |   |\n");
  const table = saved.document.blocks[TABLE];
  assert.ok(table?.block === "table");
  assert.deepEqual(table.rows.map(row => row.cells.map(cell => cell.editable)), [
    [true, true, true, true], [true, true, false, true], [true, true, true, true], [true, true, true, true], [true, true, true, true],
  ]);
});

test("adding a row or column is one undo step and leaves nothing to save once undone", () => {
  let { document, state } = editorState(mixed);
  const before = state.doc;
  state = apply(state, addTableRowBelow(caretIn(state, 1, 0), TABLE));
  state = apply(state, addTableColumnRight(state, TABLE));
  undo(state, tr => { state = state.apply(tr); });
  undo(state, tr => { state = state.apply(tr); });
  assert.ok(state.doc.eq(before));
  assert.equal(collectSupportedEdits(document, state.doc.toJSON() as TiptapJSON).tables, undefined);
});

test("rows and columns are added, removed and moved only whole, and the header row stays first", () => {
  const baseline = toTiptapDocument(loadEditableDocument(mixed));
  // An added cell has no snapshot position.
  const added = (header = false) => ({ type: "tableCell", attrs: { header }, content: [] });
  const tableOf = (projection: TiptapJSON) => projection.content![TABLE];
  const changes: [string, (table: TiptapJSON) => void][] = [
    ["row above the header", (table) => { table.content!.unshift({ type: "tableRow", content: [added(true), added(true)] }); }],
    ["header row moved down", (table) => { table.content!.push(table.content!.shift()!); }],
    ["cells swapped in one row only", (table) => { table.content![2].content!.reverse(); }],
    ["duplicated snapshot row", (table) => { table.content!.push(structuredClone(table.content![2])); }],
    ["single added cell", (table) => { table.content![1].content!.push(added()); }],
    ["added body cell marked header", (table) => { table.content!.push({ type: "tableRow", content: [added(true), added()] }); }],
    ["added header cell not marked header", (table) => { table.content!.forEach(row => row.content!.push(added())); }],
    ["one cell realigned", (table) => { table.content![2].content![0].attrs!.align = "right"; }],
  ];
  for (const [name, change] of changes) {
    const next = structuredClone(baseline);
    change(tableOf(next));
    assert.throws(() => assertSupportedDocumentChange(baseline, next), Error, name);
  }
  const accepted: [string, (table: TiptapJSON) => void][] = [
    ["added column", (table) => { table.content!.forEach((row, index) => row.content!.push(added(index === 0))); }],
    ["removed row", (table) => { table.content!.pop(); }],
    ["moved body rows", (table) => { table.content!.push(table.content!.splice(1, 1)[0]); }],
    ["moved columns", (table) => { table.content!.forEach(row => row.content!.reverse()); }],
    ["realigned column", (table) => { table.content!.forEach(row => { row.content![1].attrs!.align = "center"; }); }],
  ];
  for (const [name, change] of accepted) {
    const next = structuredClone(baseline);
    change(tableOf(next));
    assert.doesNotThrow(() => assertSupportedDocumentChange(baseline, next), name);
  }
});

test("rows and columns move and are removed at the caret, columns are realigned, and Core saves the same grid", () => {
  let { document, state, rejected } = editorState(mixed);
  const before = state.doc;
  state = apply(state, moveTableRow(caretIn(state, 2, 0), TABLE, -1));
  assert.deepEqual(grid(state), [["Name", "Note"], ["P", ""], ["U", "(bold)"]]);
  assert.deepEqual(cellOf(state), { row: 1, column: 0 });
  state = apply(state, moveTableColumn(state, TABLE, 1));
  assert.deepEqual(grid(state), [["Note", "Name"], ["", "P"], ["(bold)", "U"]]);
  assert.deepEqual(cellOf(state), { row: 1, column: 1 });
  state = apply(state, alignTableColumn(state, TABLE, "center"));
  state = apply(state, removeTableRow(state, TABLE));
  assert.deepEqual(grid(state), [["Note", "Name"], ["(bold)", "U"]]);
  assert.deepEqual(rejected, []);
  // The read-only cell moved with its row and column; its source is unchanged.
  let edits = collectSupportedEdits(document, state.doc.toJSON() as TiptapJSON);
  assert.deepEqual(edits.tables, [{ path: [TABLE], rows: [0, 1], columns: [1, 0], align: [null, "center"], cells: [] }]);
  assert.equal(saveEdits(mixed, edits).markdown, "Intro.\n\n| Note        | Name |\n| ----------- | :--: |\n| {sub}`bold` |   U  |\n");
  // Removing a column takes its cells, read-only ones included.
  state = apply(state, removeTableColumn(caretIn(state, 0, 0), TABLE));
  edits = collectSupportedEdits(document, state.doc.toJSON() as TiptapJSON);
  assert.equal(saveEdits(mixed, edits).markdown, "Intro.\n\n| Name |\n| :--: |\n|   U  |\n");
  // Each command is one undo step.
  for (let step = 0; step < 5; step++) undo(state, tr => { state = state.apply(tr); });
  assert.ok(state.doc.eq(before));
});

test("Host rejects table edits that do not match the snapshot table", () => {
  const rejected: [unknown, RegExp][] = [
    [{ path: [0], rows: [0, null], columns: [0] }, /table edit is not allowed/],
    [{ path: [TABLE], rows: [0, 1, 2], columns: [0, 0], cells: [] }, /table edit is not allowed/],
    [{ path: [TABLE], rows: [1, 0, 2], columns: [0, 1], cells: [] }, /table edit is not allowed/],
    [{ path: [TABLE], rows: [null, 0, 1, 2], columns: [0, 1], cells: [] }, /table edit is not allowed/],
    [{ path: [TABLE], rows: [0, 1, 2], columns: [], cells: [] }, /table edit is not allowed/],
    [{ path: [TABLE], rows: [0, 1, 2], columns: [0, 1], align: ["justify", null], cells: [] }, /table edit is not allowed/],
    [{ path: [TABLE], rows: [0, 1, 2, null], columns: [0, 1], cells: [{ row: 1, column: 0, content: text("x") }] }, /was not added/],
  ];
  for (const [table, reason] of rejected) {
    assert.throws(() => saveEdits(mixed, { tables: [table as never] }), reason);
  }
});
test("aligned table insertion keeps the displayed grid consistent with Core Save", () => {
  const source = "Intro.\n\n| L | R |\n|:--|--:|\n| a | b |\n";
  let { document, state, rejected } = editorState(source);
  state = apply(state, addTableRowBelow(caretIn(state, 1, 0), TABLE));
  state = apply(state, addTableColumnRight(state, TABLE));
  assert.deepEqual(rejected, []);
  const projected = state.doc.toJSON() as TiptapJSON;
  const table = projected.content![TABLE];
  for (const row of table.content!) assert.deepEqual(row.content!.map(cell => cell.attrs?.align), ["left", "", "right"]);
  const saved = saveEdits(source, collectSupportedEdits(document, projected)).document.blocks[TABLE];
  assert.ok(saved.block === "table");
  for (const row of saved.rows) assert.deepEqual(row.cells.map(cell => cell.align ?? ""), ["left", "", "right"]);
  // Alignment belongs to a column: one cell cannot silently claim its own.
  table.content![2].content![0].attrs!.align = "center";
  assert.throws(() => collectSupportedEdits(document, projected), /uniform within each column/);
});


test("caption and label edits and newly captioned tables save through Core in the same session", () => {
  const source = "| A |\n|---|\n| 1 |\n";
  const document = loadEditableDocument(source);
  const next = toTiptapDocument(document);
  next.content![0].attrs!.caption = text("Values");
  next.content![0].attrs!.label = "tbl-values";
  const edits = collectSupportedEdits(document, next);
  const saved = saveEdits(source, edits);
  assert.match(saved.markdown, /:::\{table\} Values\n:name: tbl-values/);
  assert.deepEqual(collectSupportedEdits(saved.document, toTiptapDocument(saved.document)), { headings: [], paragraphs: [] });
  const inserted = saveEdits("", { order: [{ insert: 0 }], inserts: [{ block: "table", rows: [[text("A")], [text("1")]], caption: text("New"), label: "tbl-new" }] });
  assert.match(inserted.markdown, /:::\{table\} New\n:name: tbl-new/);
});
