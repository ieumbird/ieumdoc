import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { BLOCK_COMMANDS } from "../src/block-commands.ts";
import { editorExtensions } from "../src/editor-schema.tsx";
import { assertSupportedDocumentChange, collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { loadEditableDocument } from "./helpers/document.ts";
import { saveEdits } from "../server/document-replay.ts";

// One editable definition and one that holds two paragraphs.
const source = "# Notes\n\nA claim[^a] and another[^b].\n\n[^a]: Short note.\n\n[^b]: First paragraph.\n\n    Second paragraph.\n";

test("source collection becomes available again when body edits change endnote order", () => {
  const projection = toTiptapDocument(loadEditableDocument(source));
  const schema = getSchema(editorExtensions());
  const command = BLOCK_COMMANDS.find(command => command.id === "collect-endnotes")!;
  const state = (document: TiptapJSON) => EditorState.create({ schema, doc: schema.nodeFromJSON(document) });
  assert.equal(command.enabled(state(projection), 2), false);
  projection.content![1].content = [{ type: "text", text: "Changed" }, { type: "footnoteReference", attrs: { label: "b" } },
    { type: "footnoteReference", attrs: { label: "a" } }];
  [projection.content![2], projection.content![3]] = [projection.content![3], projection.content![2]];
  assert.equal(command.enabled(state(projection), 2), true);
  const changed = state(projection);
  assert.equal(command.enabled(changed.apply(command.run(changed, 2)), 2), false);
});

test("endnote projection and ordinary edits preserve original source anchors; conversion is explicit", () => {
  const scattered = "# Notes\n\nClaim[^b] and second[^a].\n\n[^a]: Short note.\n\nBody resumes.\n\n[^b]: First paragraph.\n\n    Second paragraph.\n\nTail.\n";
  const editable = loadEditableDocument(scattered);
  const projection = toTiptapDocument(editable);
  assert.deepEqual(projection.content!.map(node => node.attrs?.sourcePath), ["0", "1", "3", "5", "4", "2"]);
  assert.equal(saveEdits(scattered, collectSupportedEdits(editable, projection)).markdown, scattered);
  const edited = structuredClone(projection);
  edited.content![2].content!.push({ type: "text", text: " Edited." });
  assert.equal(saveEdits(scattered, collectSupportedEdits(editable, edited)).markdown, scattered.replace("Body resumes.", "Body resumes. Edited."));
  edited.content!.splice(3, 0, { type: "paragraph", attrs: { sourcePath: "new:body" }, content: [{ type: "text", text: "New body." }] });
  assert.equal(saveEdits(scattered, collectSupportedEdits(editable, edited)).markdown,
    scattered.replace("Body resumes.", "Body resumes. Edited.\n\nNew body."));
  edited.attrs = { ...edited.attrs, collectEndnotes: true };
  const converted = saveEdits(scattered, collectSupportedEdits(editable, edited)).markdown;
  assert.equal(converted, "# Notes\n\nClaim[^b] and second[^a].\n\nBody resumes. Edited.\n\nNew body.\n\nTail.\n\n[^b]: First paragraph.\n\n    Second paragraph.\n\n[^a]: Short note.\n");
});

test("editable definitions project to footnote definition blocks; others stay read-only", () => {
  const blocks = toTiptapDocument(loadEditableDocument(source)).content!;
  assert.deepEqual(blocks[2], { type: "footnoteDefinition", attrs: { sourcePath: "2", label: "a" }, content: [{ type: "text", text: "Short note." }] });
  assert.equal(blocks[3].type, "unsupportedBlock");
  assert.equal(blocks[3].attrs?.footnote, "b");
  // A definition holds no footnote reference.
  const schema = getSchema(editorExtensions());
  assert.throws(() => schema.nodeFromJSON({ type: "footnoteDefinition", attrs: { label: "a" },
    content: [{ type: "footnoteReference", attrs: { label: "b" } }] }).check());
});

test("a new footnote and an edited definition save through Core in place and at the end", () => {
  const editable = loadEditableDocument(source);
  const next = toTiptapDocument(editable);
  const blocks = next.content!;
  blocks[1].content = [...blocks[1].content!, { type: "text", text: " More" }, { type: "footnoteReference", attrs: { label: "1" } }, { type: "text", text: "." }];
  blocks[2].content = [{ type: "text", text: "Edited", marks: [{ type: "bold" }] }, { type: "text", text: " note." }];
  blocks.push({ type: "footnoteDefinition", attrs: { sourcePath: "new:footnote", label: "1" }, content: [{ type: "text", text: "New note." }] });
  const saved = saveEdits(source, collectSupportedEdits(editable, next));
  assert.equal(saved.markdown,
    "# Notes\n\nA claim[^a] and another[^b]. More[^1].\n\n[^a]: **Edited** note.\n\n[^b]: First paragraph.\n\n    Second paragraph.\n\n[^1]: New note.\n");
  const savedBlock = loadEditableDocument(saved.markdown).blocks[4];
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
