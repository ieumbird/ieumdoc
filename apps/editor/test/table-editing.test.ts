import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getSchema } from "@tiptap/core";
import { history, undo } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { splitBlock } from "@tiptap/pm/commands";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import {
  assertSupportedDocumentChange,
  collectSupportedEdits,
  toTiptapDocument,
  type TiptapJSON,
} from "../src/tiptap-document.ts";
import { documentRevision, loadEditableDocument, saveDocumentFile, saveEdits } from "../server/document-api.ts";

const fixture = fileURLToPath(new URL("../../../packages/core/test/fixtures/technical-document.md", import.meta.url));
const source = readFileSync(fixture, "utf8");
const TABLE = 12;
const mixed = "| Name | Note |\n| --- | --- |\n| U | **bold** |\n| P |  |\n";

function tableOf(projection: TiptapJSON): TiptapJSON {
  return projection.content!.find((block) => block.type === "table")!;
}

function setCell(projection: TiptapJSON, row: number, cell: number, text: string): TiptapJSON {
  const next = structuredClone(projection);
  tableOf(next).content![row].content![cell].content = text ? [{ type: "text", text }] : [];
  return next;
}

test("editable, empty and read-only cells round-trip through the single Tiptap schema", () => {
  const projection = toTiptapDocument(loadEditableDocument(mixed));
  const rows = tableOf(projection).content!;
  assert.deepEqual(rows.map((row) => row.content!.map((cell) => cell.type)), [
    ["tableCell", "tableCell"],
    ["tableCell", "readonlyTableCell"],
    ["tableCell", "tableCell"],
  ]);
  assert.deepEqual(rows[1].content![1].attrs, { header: false, text: "bold" });
  assert.deepEqual(rows[2].content![1], { type: "tableCell", attrs: { header: false }, content: [] });
  const schema = getSchema(editorExtensions());
  assert.deepEqual(schema.nodeFromJSON(projection).toJSON(), schema.nodeFromJSON(schema.nodeFromJSON(projection).toJSON()).toJSON());
  assert.ok(schema.nodeFromJSON(projection).eq(schema.nodeFromJSON(projection)));
});

test("changed header and body cells become Core cell edits; unchanged tables send none", () => {
  const document = loadEditableDocument(source);
  const projection = toTiptapDocument(document);
  assert.equal(collectSupportedEdits(document, projection).cells, undefined);
  const edited = setCell(setCell(projection, 0, 0, "Port name"), 1, 1, "AC-side");
  assert.deepEqual(collectSupportedEdits(document, edited).cells, [
    { path: [TABLE, 0, 0], from: "Port", to: "Port name" },
    { path: [TABLE, 1, 1], from: "AC", to: "AC-side" },
  ]);
});

test("table structure, read-only cells and marks cannot change", () => {
  const baseline = toTiptapDocument(loadEditableDocument(mixed));
  const changes: [string, (table: TiptapJSON) => void][] = [
    ["added row", (table) => { table.content!.push(structuredClone(table.content![2])); }],
    ["removed cell", (table) => { table.content![2].content!.pop(); }],
    ["read-only text", (table) => { table.content![1].content![1].attrs!.text = "other"; }],
    ["cell kind", (table) => { table.content![1].content![1] = { type: "tableCell", attrs: { header: false }, content: [] }; }],
    ["header flag", (table) => { table.content![2].content![0].attrs!.header = true; }],
    ["mark", (table) => { table.content![1].content![0].content = [{ type: "text", text: "U", marks: [{ type: "bold" }] }]; }],
  ];
  for (const [name, change] of changes) {
    const next = structuredClone(baseline);
    change(tableOf(next));
    assert.throws(() => assertSupportedDocumentChange(baseline, next), Error, name);
  }
});

test("typing in a cell is allowed and undoable; Enter cannot change the table", () => {
  const baseline = toTiptapDocument(loadEditableDocument(mixed));
  const schema = getSchema(editorExtensions());
  const doc = schema.nodeFromJSON(baseline);
  let rejected = 0;
  let state = EditorState.create({ schema, doc, plugins: [history(), structureGuardPlugin(baseline, () => rejected++)] });
  const cell = cellPosition(doc, 1, 0);
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cell + 2)));
  state = state.apply(state.tr.insertText("-typed"));
  assert.equal(cellText(state.doc, 1, 0), "U-typed");
  assert.equal(rejected, 0);

  // Enter cannot split a cell: the command does not apply, or the guard rejects it.
  let split = state;
  const applied = splitBlock(state, (transaction) => { split = state.apply(transaction); });
  assert.ok(split.doc.eq(state.doc));
  assert.equal(rejected, applied ? 1 : 0);

  let undone = state;
  undo(state, (transaction) => { undone = state.apply(transaction); });
  assert.equal(cellText(undone.doc, 1, 0), "U");
});

test("Host Save writes edited header and body cells and keeps everything else", () => {
  const saved = saveEdits(source, {
    cells: [
      { path: [TABLE, 0, 0], from: "Port", to: "Port name" },
      { path: [TABLE, 2, 1], from: "DC", to: "" },
    ],
  });
  assert.match(saved.markdown, /\| Port name \| Type +\|\n\| -+ \| -+ \|\n\| U +\| AC +\|\n\| P +\| +\|\n$/);
  // Everything before the table (the rest of the document) is the unchanged canonical form.
  const beforeTable = (markdown: string) => markdown.slice(0, markdown.indexOf("| Port"));
  assert.ok(beforeTable(saved.markdown).includes("{eq}`eq-current`"));
  assert.equal(beforeTable(saved.markdown), beforeTable(saveEdits(source, {}).markdown));
  const table = saved.document.blocks[TABLE];
  assert.equal(table?.block, "table");
  if (table?.block === "table") {
    assert.deepEqual(table.rows.map((row) => row.cells.map((cell) => [cell.text, cell.header, cell.editable])), [
      [["Port name", true, true], ["Type", true, true]],
      [["U", false, true], ["AC", false, true]],
      [["P", false, true], ["", false, true]],
    ]);
  }
});

test("Host rejects stale, read-only and unpreservable cell edits without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-table-save-"));
  const file = path.join(dir, "table.md");
  writeFileSync(file, mixed);
  try {
    const revision = documentRevision(mixed);
    const rejected: [unknown, RegExp][] = [
      [{ path: [0, 1, 0], from: "stale", to: "x" }, /does not match/],
      [{ path: [0, 1, 1], from: "bold", to: "x" }, /not allowed/],
      [{ path: [0, 1], from: "U", to: "x" }, /not allowed/],
      [{ path: [0, 1, 0], from: "U", to: "cost $x$" }, /table cell text cannot be preserved/],
      [{ path: [0, 1, 0], from: "U", to: "U " }, /whitespace/],
    ];
    for (const [cell, reason] of rejected) {
      assert.throws(() => saveDocumentFile(file, { revision, cells: [cell as never] }), reason);
      assert.equal(readFileSync(file, "utf8"), mixed);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function cellPosition(doc: ProseMirrorNode, row: number, cell: number): number {
  let found = -1;
  doc.descendants((node, position) => {
    if (node.type.name !== "table") return true;
    const offset = position + 1;
    node.forEach((tableRow, rowOffset, rowIndex) => {
      if (rowIndex !== row) return;
      tableRow.forEach((_, cellOffset, cellIndex) => {
        if (cellIndex === cell) found = offset + rowOffset + 1 + cellOffset;
      });
    });
    return false;
  });
  return found;
}

function cellText(doc: ProseMirrorNode, row: number, cell: number): string {
  return doc.nodeAt(cellPosition(doc, row, cell))?.textContent ?? "";
}
