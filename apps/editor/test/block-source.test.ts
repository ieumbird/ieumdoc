import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { closeHistory, history, redo, undo } from "@tiptap/pm/history";
import { EditorState, type Transaction } from "@tiptap/pm/state";
import { blockSourceTransaction, editorDocumentJSON, editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { collectSupportedEdits, toTiptapDocument } from "../src/tiptap-document.ts";
import { applyBlockSource, saveEdits } from "../server/document-replay.ts";
import { loadEditableDocument } from "./helpers/document.ts";

const markdown = "# Title\n\n![logo](./logo.png)\n\nBody.\n";

test("an applied block source is one undoable step that Save replays before the block's later edits", () => {
  const editable = loadEditableDocument(markdown);
  const baseline = toTiptapDocument(editable);
  const schema = getSchema(editorExtensions());
  let rejected = 0;
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline),
    plugins: [history(), structureGuardPlugin(baseline, () => rejected++)] });
  const dispatch = (tr: Transaction) => { state = state.apply(tr); };

  const { block } = applyBlockSource({ base: markdown, path: [1], source: "The logo." });
  assert.equal(block.block === "paragraph" && block.editable, true);
  const from = state.doc.child(0).nodeSize;
  dispatch(blockSourceTransaction(state, from, "1", "The logo.", block));
  dispatch(closeHistory(state.tr));
  const applied = editorDocumentJSON(state);
  // The replaced block is an ordinary editable paragraph at the same locator.
  dispatch(state.tr.insertText(" Updated", from + state.doc.child(1).nodeSize - 1));
  assert.equal(rejected, 0);
  const edits = collectSupportedEdits(editable, editorDocumentJSON(state));
  assert.deepEqual(edits.sources, [{ path: [1], source: "The logo." }]);
  assert.deepEqual(edits.paragraphs, [{ path: [1], content: [{ kind: "text", text: "The logo. Updated" }] }]);
  assert.equal(saveEdits(markdown, edits).markdown, "# Title\n\nThe logo. Updated\n\nBody.\n");

  undo(state, dispatch);
  assert.deepEqual(editorDocumentJSON(state), applied);
  undo(state, dispatch);
  assert.deepEqual(editorDocumentJSON(state).content, editorDocumentJSON(EditorState.create({ schema, doc: schema.nodeFromJSON(baseline) })).content);
  assert.equal(collectSupportedEdits(editable, editorDocumentJSON(state)).sources, undefined);
  redo(state, dispatch);
  assert.deepEqual(editorDocumentJSON(state), applied);
  assert.equal(rejected, 0);
});

test("the Host applies block source only to read-only snapshot blocks and reports Core's reason", () => {
  assert.throws(() => applyBlockSource({ base: markdown, path: [2], source: "Other." }), /block source edit is not allowed at \[2\]/);
  assert.throws(() => applyBlockSource({ base: markdown, path: [1], source: "```\ncode" }), /not closed/);
  assert.throws(() => saveEdits(markdown, { sources: [{ path: [0], source: "# Other" }] }), /block source edit is not allowed at \[0\]/);
  // The session's other applied sources come first: a label they take is not free.
  const labeled = "![a](./a.png)\n\n# Title\n\n![logo](./logo.png)\n";
  assert.throws(() => applyBlockSource({ base: labeled, path: [2], source: "(b)=", sources: [{ path: [0], source: "(b)=" }] }),
    /label "b" already names another target/);
});
