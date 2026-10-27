import { nativeSource } from "./helpers/document.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { history, undo, redo } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { AllSelection, EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { parse, serialize } from "@ieumdoc/core";
import { BLOCK_COMMANDS } from "../src/block-commands.ts";
import { editorDocumentJSON, editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { endnoteEditingKey, endnoteEditingPlugin, endnoteLabel, endnoteNumber, endnotesPlugin } from "../src/endnotes.ts";
import { assertSupportedDocumentChange, collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { loadEditableDocument } from "./helpers/document.ts";
import { saveEdits } from "../server/document-replay.ts";

const schema = getSchema(editorExtensions());

// Definitions retain their own labels and snapshot paths.
const source = nativeSource("# Notes\n\nA claim[^a] and another[^b].\n\n[^a]: Short note.\n\n[^b]: First paragraph.\n");

/** The engine state of a Core snapshot with history, the structure guard and endnote placement, as the Editor runs them. */
function engine(markdown: string, canOrder?: () => boolean): EditorState {
  const baseline = toTiptapDocument(loadEditableDocument(markdown));
  return EditorState.create({ schema, doc: schema.nodeFromJSON(baseline),
    plugins: [history(), structureGuardPlugin(baseline, () => assert.fail("a supported edit was rejected")), endnotesPlugin(canOrder)] });
}

const labels = (doc: ProseMirrorNode) => {
  const found: string[] = [];
  doc.forEach(block => found.push(endnoteLabel(block) ?? block.type.name));
  return found;
};

function blockPos(doc: ProseMirrorNode, index: number): number {
  let pos = 0;
  for (let at = 0; at < index; at++) pos += doc.child(at).nodeSize;
  return pos;
}

const run = (state: EditorState, command: (state: EditorState, dispatch: (tr: Transaction) => void) => boolean) => {
  let next = state;
  assert.ok(command(state, tr => { next = state.apply(tr); }));
  return next;
};

test("read-only definitions reject destination changes, including mark steps, while editing and block deletion remain undoable", () => {
  const projection = toTiptapDocument(loadEditableDocument(source));
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(projection), plugins: [history(), endnoteEditingPlugin(), endnotesPlugin()] });
  const body = blockPos(state.doc, 1) + 2;
  const note = blockPos(state.doc, 2) + 1;
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, body)));
  const pasted = state.apply(state.tr.insertText("external", note + 2).setMeta("uiEvent", "paste"));
  assert.ok(pasted.doc.eq(state.doc), "a transaction aimed at a different read-only block must be refused");
  const formatted = state.apply(state.tr.addMark(note, note + 2, schema.marks.bold.create()));
  assert.ok(formatted.doc.eq(state.doc), "a mark step with no positional map must be refused");

  const all = state.apply(state.tr.setSelection(new AllSelection(state.doc)));
  assert.ok(all.apply(all.tr.insertText("external", note + 2).setMeta("uiEvent", "drop")).doc.eq(state.doc), "AllSelection must not permit a targeted drop");
  assert.ok(all.apply(all.tr.insertText("external", note + 2).setMeta("uiEvent", "paste")).doc.eq(state.doc), "AllSelection must not permit a targeted paste");
  assert.ok(all.apply(all.tr.addMark(note, note + 2, schema.marks.bold.create())).doc.eq(state.doc), "AllSelection must not permit a targeted mark");
  assert.ok(all.apply(all.tr.delete(note - 1, note - 1 + state.doc.child(2).nodeSize)).doc.eq(state.doc), "AllSelection must not permit a targeted definition deletion");
  const cleared = all.apply(all.tr.deleteSelection());
  assert.ok(!cleared.doc.eq(state.doc), "whole-document deletion remains allowed");
  assert.ok(run(cleared, undo).doc.eq(state.doc), "Undo restores a whole-document deletion");
  const replaced = all.apply(all.tr.insertText("replacement"));
  assert.equal(replaced.doc.textContent, "replacement", "whole-document typing remains allowed");
  assert.ok(run(replaced, undo).doc.eq(state.doc), "Undo restores a whole-document replacement");
  const wholePaste = all.apply(all.tr.insertText("pasted").setMeta("uiEvent", "paste"));
  assert.equal(wholePaste.doc.textContent, "pasted", "a paste replacing the selected whole document remains allowed");
  assert.ok(run(wholePaste, undo).doc.eq(state.doc), "Undo restores a whole-document paste");
  assert.ok(all.apply(all.tr.insertText("drop").setMeta("uiEvent", "drop")).doc.eq(state.doc), "a drop must not use the whole-document exception");

  // Chromium composition normalizes whole selection to the first/last content positions;
  // its fitted replace consumes the final block boundary as well.
  const size = state.doc.content.size;
  const normalized = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, size - 1)));
  const composition = () => normalized.tr.replaceRangeWith(1, size, schema.text("ㅎ")).setMeta("composition", 1);
  const composed = normalized.apply(composition());
  assert.equal(composed.doc.textContent, "ㅎ", "a fitted full-content composition must replace the document");
  assert.ok(run(composed, undo).doc.eq(state.doc), "Undo restores the document after full-content composition");
  for (const uiEvent of ["drop", "paste"]) {
    assert.ok(normalized.apply(composition().setMeta("uiEvent", uiEvent)).doc.eq(state.doc), `${uiEvent} must not use the composition exception`);
    assert.ok(normalized.apply(normalized.tr.insertText("external", note + 2).setMeta("composition", 1).setMeta("uiEvent", uiEvent)).doc.eq(state.doc), `${uiEvent} into one note must be refused`);
  }
  assert.ok(normalized.apply(normalized.tr.insertText("almost", 1, size - 1).setMeta("composition", 1)).doc.eq(state.doc), "a step that does not consume the final boundary is not a whole-document replacement");
  assert.ok(normalized.apply(normalized.tr.replaceRangeWith(1, size, schema.text("not composition"))).doc.eq(state.doc), "a normalized text selection alone does not grant a whole-document exception");
  const nearlyAll = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, size - 2)));
  assert.ok(nearlyAll.apply(nearlyAll.tr.replaceRangeWith(1, size, schema.text("almost")).setMeta("composition", 1)).doc.eq(state.doc), "a partial selection must not authorize replacing the entire document");

  const active = state.apply(state.tr.setSelection(TextSelection.create(state.doc, note)).setMeta(endnoteEditingKey, "a"));
  const edited = active.apply(active.tr.insertText("Edit ", note));
  assert.equal(edited.doc.child(2).textContent, "Edit Short note.");
  assert.ok(run(edited, undo).doc.eq(state.doc), "Undo keeps its normal behavior");
  assert.ok(run(run(edited, undo), redo).doc.eq(edited.doc), "Redo restores the definition edit");

  const deletion = BLOCK_COMMANDS.find(command => command.id === "delete")!;
  const deleted = state.apply(deletion.run(state, 2));
  assert.deepEqual(labels(deleted.doc), ["heading", "paragraph", "b"]);
  assert.ok(run(deleted, undo).doc.eq(state.doc), "explicit block deletion remains undoable");
});

test("an opened document shows Core's order; unchanged Save writes the canonical Markdown Core and the CLI write", () => {
  const scattered = nativeSource("# Notes\n\nClaim[^b] and second[^a].\n\n[^a]: Short note.\n\nBody resumes.\n\n[^b]: First paragraph.\n\nTail.\n");
  const placed = nativeSource("# Notes\n\nClaim[^b] and second[^a].\n\nBody resumes.\n\nTail.\n\n[^b]: First paragraph.\n\n[^a]: Short note.\n");
  const editable = loadEditableDocument(scattered);
  const projection = toTiptapDocument(editable);
  // No display reordering and no source-placement state: Core's snapshot is already in this order.
  assert.deepEqual(projection.content!.map(node => node.attrs?.sourcePath), ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(projection.content!.map(node => node.attrs?.label ?? node.attrs?.footnote ?? node.type),
    ["heading", "paragraph", "paragraph", "paragraph", "b", "a"]);
  assert.equal(projection.attrs, undefined);
  const edits = collectSupportedEdits(editable, projection);
  assert.deepEqual(edits, { headings: [], paragraphs: [] });
  assert.equal(saveEdits(scattered, edits).markdown, placed);
  assert.equal(serialize(parse(scattered)), placed);
  assert.equal(saveEdits(placed, collectSupportedEdits(loadEditableDocument(placed), toTiptapDocument(loadEditableDocument(placed)))).markdown, placed);
  // The document the CLI test formats: Editor Save writes the same bytes as `ieumdoc format`.
  const sections = nativeSource("# Document\n\n## Section A\n\nFirst claim[^b] and another[^a].\n\n[^a]: Second note.\n\n## Section B\n\nAnother paragraph[^b].\n\n[^b]: First note.\n");
  assert.equal(saveEdits(sections, collectSupportedEdits(loadEditableDocument(sections), toTiptapDocument(loadEditableDocument(sections)))).markdown,
    nativeSource("# Document\n\n## Section A\n\nFirst claim[^b] and another[^a].\n\n## Section B\n\nAnother paragraph[^b].\n\n[^b]: First note.\n\n[^a]: Second note.\n"));
});

test("changing reference order moves the endnotes in one undoable step, and Save writes them in that order", () => {
  const state = engine(source);
  assert.deepEqual(labels(state.doc), ["heading", "paragraph", "a", "b"]);
  const paragraph = state.doc.child(1);
  const swapped = state.apply(state.tr.replaceWith(blockPos(state.doc, 1) + 1, blockPos(state.doc, 1) + 1 + paragraph.content.size, [
    schema.text("Now"), schema.nodes.footnoteReference.create({ label: "b" }), schema.text(" then"),
    schema.nodes.footnoteReference.create({ label: "a" }), schema.text("."),
  ]));
  assert.deepEqual(labels(swapped.doc), ["heading", "paragraph", "b", "a"]);
  assert.equal(endnoteNumber(swapped.doc, "b"), 1);
  // Edit the editable definition too: its snapshot path is still its own.
  const definition = blockPos(swapped.doc, 3) + swapped.doc.child(3).nodeSize - 1;
  const edited = swapped.apply(swapped.tr.insertText(" Edited.", definition));
  assert.equal(saveEdits(source, collectSupportedEdits(loadEditableDocument(source), editorDocumentJSON(edited))).markdown,
    nativeSource("# Notes\n\nNow[^b] then[^a].\n\n[^b]: First paragraph.\n\n[^a]: Short note. Edited.\n"));
  // The placement shares the reference edit's history event.
  const undone = run(run(edited, undo), undo);
  assert.deepEqual(labels(undone.doc), ["heading", "paragraph", "a", "b"]);
  assert.equal(undone.doc.child(1).textContent, "A claim and another.");
  assert.deepEqual(labels(run(undone, redo).doc), ["heading", "paragraph", "b", "a"]);
});

test("a block added after the endnotes joins the body, with the caret, and saves before them", () => {
  const state = engine(source);
  const end = state.doc.content.size;
  const tr = state.tr.insert(end, schema.nodes.paragraph.create({ sourcePath: "new:end" }, schema.text("Appended.")));
  const next = state.apply(tr.setSelection(TextSelection.create(tr.doc, end + 1)));
  assert.deepEqual(labels(next.doc), ["heading", "paragraph", "paragraph", "a", "b"]);
  assert.equal(next.selection.$from.parent.textContent, "Appended.");
  assert.equal(saveEdits(source, collectSupportedEdits(loadEditableDocument(source), editorDocumentJSON(next))).markdown,
    nativeSource("# Notes\n\nA claim[^a] and another[^b].\n\nAppended.\n\n[^a]: Short note.\n\n[^b]: First paragraph.\n"));
  // A document without endnotes is left as edited.
  const plain = engine(nativeSource("# Plain\n\nText.\n"));
  const typed = plain.apply(plain.tr.insertText("More ", blockPos(plain.doc, 1) + 1));
  assert.equal(typed.doc.child(1).textContent, "More Text.");
});

test("placement waits while a draft is open and resumes when it closes", () => {
  let drafting = true;
  const state = engine(source, () => !drafting);
  const end = state.doc.content.size;
  const waiting = state.apply(state.tr.insert(end, schema.nodes.paragraph.create({ sourcePath: "new:end" }, schema.text("Later."))));
  assert.deepEqual(labels(waiting.doc), ["heading", "paragraph", "a", "b", "paragraph"]);
  drafting = false;
  assert.deepEqual(labels(waiting.apply(waiting.tr.setMeta("endnoteDraftClosed", true)).doc), ["heading", "paragraph", "paragraph", "a", "b"]);
});

test("sections hold no endnotes: deleting keeps them, refuses an orphan, and moving leaves them after the body", () => {
  const placed = nativeSource("# Doc\n\n## A\n\nFirst[^b] and[^a].\n\n## B\n\nAnother[^b].\n\n[^b]: First note.\n\n[^a]: Second note.\n");
  const command = (id: string) => BLOCK_COMMANDS.find(command => command.id === id)!;
  const state = engine(placed);
  // 0 # Doc · 1 ## A · 2 First · 3 ## B · 4 Another · 5 [^b] · 6 [^a]
  assert.equal(command("section-delete").rejection!(state, 3), undefined);
  const deleted = state.apply(command("section-delete").run(state, 3));
  assert.deepEqual(labels(deleted.doc), ["heading", "heading", "paragraph", "b", "a"]);
  // Section A holds the only reference to [^a], endnote 2; deleting the last section kept the endnotes.
  assert.match(command("section-delete").rejection!(state, 1) ?? "", /last reference to endnote 2\b/);
  assert.match(command("section-delete").rejection!(deleted, 1) ?? "", /endnote 1, 2\b/);
  const moved = state.apply(command("section-down").run(state, 1));
  assert.deepEqual(labels(moved.doc), ["heading", "heading", "paragraph", "heading", "paragraph", "b", "a"]);
  assert.equal(moved.doc.child(1).textContent, "B");
  assert.equal(command("section-down").enabled(moved, 3), false);
  assert.equal(saveEdits(placed, collectSupportedEdits(loadEditableDocument(placed), editorDocumentJSON(deleted))).markdown,
    nativeSource("# Doc\n\n## A\n\nFirst[^b] and[^a].\n\n[^b]: First note.\n\n[^a]: Second note.\n"));
});

test("definitions project to labeled footnote definition blocks", () => {
  const blocks = toTiptapDocument(loadEditableDocument(source)).content!;
  assert.deepEqual(blocks[2], { type: "footnoteDefinition", attrs: { sourcePath: "3", label: "a" }, content: [{ type: "text", text: "Short note." }] });
  assert.equal(blocks[3].type, "footnoteDefinition");
  assert.equal(blocks[3].attrs?.label, "b");
  // A definition holds no footnote reference.
  assert.throws(() => schema.nodeFromJSON({ type: "footnoteDefinition", attrs: { label: "a" },
    content: [{ type: "footnoteReference", attrs: { label: "b" } }] }).check());
});

test("a new footnote, code edit and edited definition save through Core in their endnote place", () => {
  const withCode = source + "\n```js\nOld.\n```\n";
  const editable = loadEditableDocument(withCode);
  const next = toTiptapDocument(editable);
  const blocks = next.content!;
  blocks[1].content = [{ type: "footnoteReference", attrs: { label: "1" } }, ...blocks[1].content!];
  const definition = blocks.find(block => block.type === "footnoteDefinition" && block.attrs?.label === "a")!;
  definition.content = [{ type: "text", text: "Edited", marks: [{ type: "bold" }] }, { type: "text", text: " note." }];
  const code = blocks.find(block => block.type === "codeBlock")!;
  code.content = [{ type: "text", text: "Edited." }];
  blocks.push({ type: "footnoteDefinition", attrs: { sourcePath: "new:footnote", label: "1" }, content: [{ type: "text", text: "New note." }] });
  const saved = saveEdits(withCode, collectSupportedEdits(editable, next));
  assert.equal(saved.markdown,
    nativeSource("# Notes\n\n[^1]A claim[^a] and another[^b].\n\n```js\nEdited.\n```\n\n[^1]: New note.\n\n[^a]: **Edited** note.\n\n[^b]: First paragraph.\n"));
  const savedBlock = loadEditableDocument(saved.markdown).blocks[3];
  assert.equal(savedBlock.block === "footnote" && savedBlock.editable, true);
});

test("an empty definition and a changed label are refused before Save", () => {
  const editable = loadEditableDocument(source);
  const baseline = toTiptapDocument(editable);
  const empty = structuredClone(baseline);
  empty.content![1].content!.push({ type: "footnoteReference", attrs: { label: "1" } });
  empty.content!.push({ type: "footnoteDefinition", attrs: { sourcePath: "new:footnote", label: "1" } });
  assert.throws(() => collectSupportedEdits(editable, empty), /footnote definition cannot be empty/);
  const renamed: TiptapJSON = structuredClone(baseline);
  renamed.content![2].attrs = { ...renamed.content![2].attrs, label: "z" };
  assert.throws(() => assertSupportedDocumentChange(baseline, renamed), /footnote label cannot change/);
});
