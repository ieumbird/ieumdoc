import { nativeSource } from "./helpers/document.ts";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { liftListItem, sinkListItem, splitListItem } from "@tiptap/pm/schema-list";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { parse, serialize, type InlineContent } from "@ieumdoc/core";
import { deleteBlock, insertListAfter } from "../src/block-commands.ts";
import { editorDocumentJSON, editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { appliedDocument, collectSupportedEdits, toTiptapDocument } from "../src/tiptap-document.ts";
import { documentRevision, saveDocumentFile } from "../server/document-api.ts";
import { loadEditableDocument } from "./helpers/document.ts";

const text = (value: string): InlineContent[] => [{ kind: "text", text: value }];

function editorState(markdown: string) {
  const editable = loadEditableDocument(markdown);
  const baseline = toTiptapDocument(editable);
  const schema = getSchema(editorExtensions());
  const state = EditorState.create({
    schema,
    doc: schema.nodeFromJSON(baseline),
    plugins: [structureGuardPlugin(baseline, () => assert.fail("a representable list edit was rejected"))],
  });
  return { editable, state };
}

/** Run a ProseMirror command the way a key binding does. */
function run(state: EditorState, command: (state: EditorState, dispatch: (tr: Transaction) => void) => boolean): EditorState {
  let next = state;
  assert.equal(command(state, (tr) => { next = state.apply(tr); }), true);
  return next;
}

function caretAfter(state: EditorState, value: string): EditorState {
  let position: number | undefined;
  state.doc.descendants((node, pos) => {
    if (position === undefined && node.isText && node.text!.includes(value)) position = pos + node.text!.indexOf(value) + value.length;
  });
  assert.ok(position !== undefined, value);
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, position)));
}

function saveFile(dir: string, markdown: string, state: EditorState, editable: ReturnType<typeof loadEditableDocument>): string {
  const file = path.join(dir, "document.md");
  writeFileSync(file, markdown);
  saveDocumentFile(file, { revision: documentRevision(markdown), ...collectSupportedEdits(editable, editorDocumentJSON(state)) });
  return readFileSync(file, "utf8");
}

test("deleting the paragraph between lists preserves both lists through Host Save and reopen", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-adjacent-lists-"));
  const markdown = nativeSource("1. First\n\nSeparator\n\n7. Second\n");
  try {
    const { editable, state } = editorState(markdown);
    const deleted = state.applyTransaction(deleteBlock(state, 1)).state;
    assert.deepEqual(deleted.doc.content.content.map(node => node.type.name), ["orderedList", "orderedList"]);
    const disk = saveFile(dir, markdown, deleted, editable);
    assert.deepEqual(loadEditableDocument(disk).blocks, [
      { block: "list", path: [1], ordered: true, start: 1, items: [{ content: text("First") }] },
      { block: "list", path: [2], ordered: true, start: 7, items: [{ content: text("Second") }] },
    ]);
    assert.equal(serialize(parse(disk)), disk);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("list item split, indent, outdent and kind change save as the edited list and reload editable", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-list-"));
  const markdown = nativeSource("# Steps\n\n- Wire\n- Power\n- Close\n\nDone.\n");
  try {
    let { editable, state } = editorState(markdown);
    // Enter after "Wire", type, then Tab nests the new item below "Wire".
    state = run(caretAfter(state, "Wire"), splitListItem(state.schema.nodes.listItem));
    state = state.apply(state.tr.insertText("Check **x**"));
    state = run(state, sinkListItem(state.schema.nodes.listItem));
    // Shift-Tab on the last item of the top-level list lifts it out as a paragraph.
    state = run(caretAfter(state, "Close"), liftListItem(state.schema.nodes.listItem));
    // Bullets become numbers at the same list.
    const list = state.doc.child(1);
    state = state.apply(state.tr.setNodeMarkup(state.doc.child(0).nodeSize, state.schema.nodes.orderedList, { ...list.attrs, start: 1 }));

    const edits = collectSupportedEdits(editable, editorDocumentJSON(state));
    assert.deepEqual(edits.lists, [{
      path: [2],
      list: { ordered: true, start: 1, items: [
        { content: text("Wire"), list: { ordered: false, items: [{ content: text("Check **x**") }] } },
        { content: text("Power") },
      ] },
    }]);
    const disk = saveFile(dir, markdown, state, editable);
    assert.equal(disk, nativeSource("# Steps\n\n1.  Wire\n\n    *   Check \\*\\*x\\*\\*\n2.  Power\n\nClose\n\nDone.\n"));
    assert.equal(serialize(parse(disk)), disk);
    assert.deepEqual(loadEditableDocument(disk).blocks.map((block) => block.block), ["heading", "list", "paragraph", "paragraph"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("new lists and empty items save from insertion", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-new-list-"));
  const markdown = nativeSource("Intro.\n");
  try {
    const { editable, state } = editorState(markdown);
    const inserted = state.apply(insertListAfter(state, 0, true));
    assert.deepEqual(inserted.doc.content.content.map((node) => node.type.name), ["paragraph", "orderedList"]);
    assert.notDeepEqual(appliedDocument(editorDocumentJSON(inserted)), appliedDocument(editorDocumentJSON(state)));
    assert.deepEqual(collectSupportedEdits(editable, editorDocumentJSON(inserted)).inserts, [
      { block: "list", list: { ordered: true, start: 1, items: [{ content: [] }] } },
    ]);
    assert.equal(saveFile(dir, markdown, inserted, editable), nativeSource("Intro.\n\n1.\n"));

    const written = inserted.apply(inserted.tr.insertText("First"));
    assert.deepEqual(collectSupportedEdits(editable, editorDocumentJSON(written)).inserts, [
      { block: "list", list: { ordered: true, start: 1, items: [{ content: text("First") }] } },
    ]);
    assert.equal(saveFile(dir, markdown, written, editable), nativeSource("Intro.\n\n1.  First\n"));

    const withEmptyItem = run(written, splitListItem(written.schema.nodes.listItem));
    assert.equal(saveFile(dir, markdown, withEmptyItem, editable), nativeSource("Intro.\n\n1.  First\n2.\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
