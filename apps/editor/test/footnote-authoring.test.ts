import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { editorExtensions } from "../src/editor-schema.tsx";
import { assertSupportedDocumentChange, collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { loadEditableDocument } from "./helpers/document.ts";
import { saveEdits } from "../server/document-replay.ts";

// One editable definition and one that holds two paragraphs.
const source = "# Notes\n\nA claim[^a] and another[^b].\n\n[^a]: Short note.\n\n[^b]: First paragraph.\n\n    Second paragraph.\n";

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
  assert.equal(saved.document.blocks[4].block === "footnote" && saved.document.blocks[4].editable, true);
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
