import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { parse, serialize } from "@ieumdoc/core";
import { insertCodeBlockAfter } from "../src/block-commands.ts";
import { editorDocumentJSON, editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { appliedDocument, collectSupportedEdits, toTiptapDocument } from "../src/tiptap-document.ts";
import { documentRevision, saveDocumentFile } from "../server/document-api.ts";
import { loadEditableDocument } from "./helpers/document.ts";

function editorState(markdown: string) {
  const editable = loadEditableDocument(markdown);
  const baseline = toTiptapDocument(editable);
  const schema = getSchema(editorExtensions());
  const state = EditorState.create({
    schema,
    doc: schema.nodeFromJSON(baseline),
    plugins: [structureGuardPlugin(baseline, () => assert.fail("a representable code edit was rejected"))],
  });
  return { editable, state };
}

function caretAfter(state: EditorState, value: string): EditorState {
  let position: number | undefined;
  state.doc.descendants((node, pos) => {
    if (position === undefined && node.isText && node.text!.includes(value)) position = pos + node.text!.indexOf(value) + value.length;
  });
  assert.ok(position !== undefined, value);
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, position)));
}

function textRange(state: EditorState, needle: string): { from: number; to: number } {
  let found: { from: number; to: number } | undefined;
  state.doc.descendants((node, pos) => {
    const index = node.isText ? node.text!.indexOf(needle) : -1;
    if (!found && index >= 0) found = { from: pos + index, to: pos + index + needle.length };
  });
  assert.ok(found, needle);
  return found;
}

function saveFile(dir: string, markdown: string, state: EditorState, editable: ReturnType<typeof loadEditableDocument>): string {
  const file = path.join(dir, "document.md");
  writeFileSync(file, markdown);
  saveDocumentFile(file, { revision: documentRevision(markdown), ...collectSupportedEdits(editable, editorDocumentJSON(state)) });
  return readFileSync(file, "utf8");
}

test("code block text and language edits save as the edited fence and reload editable", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-code-"));
  const markdown = "# Setup\n\n```sh\nnpm i\n```\n\nDone.\n";
  try {
    let { editable, state } = editorState(markdown);
    assert.equal(state.doc.child(1).type.name, "codeBlock");
    assert.equal(state.doc.child(1).attrs.language, "sh");

    // Blank lines and indentation typed into the block are document content.
    const withCaret = caretAfter(state, "npm i");
    state = withCaret.apply(withCaret.tr.insertText("\n\n  npm test"));
    const blockPos = state.doc.child(0).nodeSize;
    state = state.apply(state.tr.setNodeAttribute(blockPos, "language", "bash"));

    const edits = collectSupportedEdits(editable, editorDocumentJSON(state));
    assert.deepEqual(edits.codes, [{ path: [1], code: { language: "bash", code: "npm i\n\n  npm test" } }]);
    const disk = saveFile(dir, markdown, state, editable);
    assert.equal(disk, "# Setup\n\n```bash\nnpm i\n\n  npm test\n```\n\nDone.\n");
    assert.equal(serialize(parse(disk)), disk);
    const reloaded = loadEditableDocument(disk).blocks;
    assert.deepEqual(reloaded.map((block) => block.block), ["heading", "code", "paragraph"]);
    assert.deepEqual(reloaded[1], { block: "code", path: [1], language: "bash", code: "npm i\n\n  npm test" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a new code block saves once written; an unwritten one is session space", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-new-code-"));
  const markdown = "Intro.\n";
  try {
    const { editable, state } = editorState(markdown);
    const inserted = state.apply(insertCodeBlockAfter(state, 0));
    assert.deepEqual(inserted.doc.content.content.map((node) => node.type.name), ["paragraph", "codeBlock"]);
    assert.equal(inserted.selection.$from.parent.type.name, "codeBlock");
    assert.deepEqual(appliedDocument(editorDocumentJSON(inserted)), appliedDocument(editorDocumentJSON(state)));
    assert.equal(collectSupportedEdits(editable, editorDocumentJSON(inserted)).inserts, undefined);

    let written = inserted.apply(inserted.tr.insertText("const x = 1"));
    const blockPos = written.doc.child(0).nodeSize;
    written = written.apply(written.tr.setNodeAttribute(blockPos, "language", "js"));
    assert.deepEqual(collectSupportedEdits(editable, editorDocumentJSON(written)).inserts, [
      { block: "code", language: "js", code: "const x = 1" },
    ]);
    assert.equal(saveFile(dir, markdown, written, editable), "Intro.\n\n```js\nconst x = 1\n```\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("code blocks outside Code block v1 stay read-only editor blocks", () => {
  const { state } = editorState("```{code-block} js\n:caption: Cap\nx\n```\n\n```js\ny\n```\n");
  assert.deepEqual(state.doc.content.content.map((node) => node.type.name), ["unsupportedBlock", "codeBlock"]);
});

test("inline code applies and removes through Core as canonical Markdown", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-inline-code-"));
  const markdown = "Run npm i now.\n";
  try {
    const { editable, state } = editorState(markdown);
    const { from, to } = textRange(state, "npm i");
    const marked = state.apply(state.tr.addMark(from, to, state.schema.marks.code.create()));
    const edits = collectSupportedEdits(editable, editorDocumentJSON(marked));
    assert.deepEqual(edits.paragraphs, [
      { path: [0], content: [{ kind: "text", text: "Run " }, { kind: "code", value: "npm i" }, { kind: "text", text: " now." }] },
    ]);
    const disk = saveFile(dir, markdown, marked, editable);
    assert.equal(disk, "Run `npm i` now.\n");

    // Removing the mark returns the paragraph to plain text.
    const reopened = editorState(disk);
    const range = textRange(reopened.state, "npm i");
    const unmarked = reopened.state.apply(reopened.state.tr.removeMark(range.from, range.to, reopened.state.schema.marks.code));
    assert.equal(saveFile(dir, disk, unmarked, reopened.editable), markdown);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
