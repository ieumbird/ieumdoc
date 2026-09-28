import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { liftListItem, sinkListItem, splitListItem } from "@tiptap/pm/schema-list";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { parse, serialize, type InlineContent } from "@ieumdoc/core";
import { insertListAfter } from "../src/block-commands.ts";
import { editorDocumentJSON, editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { appliedDocument, collectSupportedEdits, toTiptapDocument } from "../src/tiptap-document.ts";
import { documentRevision, loadEditableDocument, saveDocumentFile } from "../server/document-api.ts";

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

test("list item split, indent, outdent and kind change save as the edited list and reload editable", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-list-"));
  const markdown = "# Steps\n\n- Wire\n- Power\n- Close\n\nDone.\n";
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
      path: [1],
      list: { ordered: true, start: 1, items: [
        { content: text("Wire"), list: { ordered: false, items: [{ content: text("Check **x**") }] } },
        { content: text("Power") },
      ] },
    }]);
    const disk = saveFile(dir, markdown, state, editable);
    assert.equal(disk, "# Steps\n\n1.  Wire\n\n    *   Check \\*\\*x\\*\\*\n2.  Power\n\nClose\n\nDone.\n");
    assert.equal(serialize(parse(disk)), disk);
    assert.deepEqual(loadEditableDocument(disk).blocks.map((block) => block.block), ["heading", "list", "paragraph", "paragraph"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a new list saves once written; an unwritten one is session space and an empty item blocks Save", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-new-list-"));
  const markdown = "Intro.\n";
  try {
    const { editable, state } = editorState(markdown);
    const inserted = state.apply(insertListAfter(state, 0, true));
    assert.deepEqual(inserted.doc.content.content.map((node) => node.type.name), ["paragraph", "orderedList"]);
    assert.deepEqual(appliedDocument(editorDocumentJSON(inserted)), appliedDocument(editorDocumentJSON(state)));
    assert.equal(collectSupportedEdits(editable, editorDocumentJSON(inserted)).inserts, undefined);

    const written = inserted.apply(inserted.tr.insertText("First"));
    assert.deepEqual(collectSupportedEdits(editable, editorDocumentJSON(written)).inserts, [
      { block: "list", list: { ordered: true, start: 1, items: [{ content: text("First") }] } },
    ]);
    assert.equal(saveFile(dir, markdown, written, editable), "Intro.\n\n1.  First\n");

    const withEmptyItem = run(written, splitListItem(written.schema.nodes.listItem));
    assert.throws(() => collectSupportedEdits(editable, editorDocumentJSON(withEmptyItem)), /Block 2 \(orderedList\): empty list item/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("lists outside List v1 stay read-only editor blocks", () => {
  const { state } = editorState("- [ ] task\n\n1. ok\n");
  assert.deepEqual(state.doc.content.content.map((node) => node.type.name), ["unsupportedBlock", "orderedList"]);
});
