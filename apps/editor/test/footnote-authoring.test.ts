import { nativeSource } from "./helpers/document.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { history, undo, redo } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state";
import { parse, serialize } from "@ieumdoc/core";
import { BLOCK_COMMANDS } from "../src/block-commands.ts";
import { editorDocumentJSON, editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { endnoteLabel, endnoteNumber, endnotesPlugin } from "../src/endnotes.ts";
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

test("a new footnote and an edited definition save through Core in their endnote place", () => {
  const editable = loadEditableDocument(source);
  const next = toTiptapDocument(editable);
  const blocks = next.content!;
  blocks[1].content = [{ type: "footnoteReference", attrs: { label: "1" } }, ...blocks[1].content!];
  blocks[2].content = [{ type: "text", text: "Edited", marks: [{ type: "bold" }] }, { type: "text", text: " note." }];
  blocks.push({ type: "footnoteDefinition", attrs: { sourcePath: "new:footnote", label: "1" }, content: [{ type: "text", text: "New note." }] });
  const saved = saveEdits(source, collectSupportedEdits(editable, next));
  assert.equal(saved.markdown,
    nativeSource("# Notes\n\n[^1]A claim[^a] and another[^b].\n\n[^1]: New note.\n\n[^a]: **Edited** note.\n\n[^b]: First paragraph.\n"));
  const savedBlock = loadEditableDocument(saved.markdown).blocks[2];
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
