import { nativeSource } from "./helpers/document.ts";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import type { InlineContent } from "@ieumdoc/core";
import { editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { documentRevision, saveDocumentFile } from "../server/document-api.ts";
import { loadEditableDocument } from "./helpers/document.ts";
import { saveEdits } from "../server/document-replay.ts";

const source = nativeSource("See [OpenAI](https://openai.com) for **bold [docs](https://a.example/docs) text**.\n");
const text = (value: string): InlineContent => ({ kind: "text", text: value });

function editorDoc(markdown: string): { baseline: TiptapJSON; doc: ProseMirrorNode; schema: ReturnType<typeof getSchema> } {
  const baseline = toTiptapDocument(loadEditableDocument(markdown));
  const schema = getSchema(editorExtensions());
  return { baseline, schema, doc: schema.nodeFromJSON(baseline) };
}

/** Apply a transaction through the structure guard and return the saved Markdown. */
function edit(markdown: string, change: (state: EditorState) => EditorState["tr"]): string {
  const { baseline, schema, doc } = editorDoc(markdown);
  let rejected = 0;
  const state = EditorState.create({ schema, doc, plugins: [structureGuardPlugin(baseline, () => rejected++)] });
  const next = state.apply(change(state));
  assert.equal(rejected, 0);
  const edits = collectSupportedEdits(loadEditableDocument(markdown), next.doc.toJSON() as TiptapJSON);
  return saveEdits(markdown, edits).markdown;
}

function range(doc: ProseMirrorNode, needle: string): { from: number; to: number } {
  let found: { from: number; to: number } | undefined;
  doc.descendants((node, position) => {
    if (found || !node.isText) return;
    const index = node.text!.indexOf(needle);
    if (index >= 0) found = { from: position + index, to: position + index + needle.length };
  });
  assert.ok(found, needle);
  return found;
}

test("paragraphs with ordinary links project to editable paragraphs with link marks", () => {
  const paragraph = toTiptapDocument(loadEditableDocument(source)).content![0];
  assert.equal(paragraph.type, "paragraph");
  assert.deepEqual(paragraph.content?.find((node) => node.text === "OpenAI")?.marks,
    [{ type: "link", attrs: { href: "https://openai.com", title: null } }]);
  assert.deepEqual(paragraph.content?.find((node) => node.text === "docs")?.marks,
    [{ type: "bold" }, { type: "link", attrs: { href: "https://a.example/docs", title: null } }]);

});

test("unchanged link paragraphs send no edit, whatever the mark nesting", () => {
  for (const markdown of [source, nativeSource("[**a**](u) and **[b](v)**\n"), nativeSource("[*x* y](u)\n")]) {
    const document = loadEditableDocument(markdown);
    const projection = toTiptapDocument(document);
    const normalized = getSchema(editorExtensions()).nodeFromJSON(projection).toJSON() as TiptapJSON;
    assert.deepEqual(collectSupportedEdits(document, normalized).paragraphs, [], markdown);
  }
});

test("links are added, retargeted, relabeled and removed through editor transactions", () => {
  const added = edit(nativeSource("See OpenAI for details.\n"), (state) => {
    const { from, to } = range(state.doc, "OpenAI");
    return state.tr.addMark(from, to, state.schema.marks.link.create({ href: "https://openai.com" }));
  });
  assert.equal(added, nativeSource("See [OpenAI](https://openai.com) for details.\n"));

  const retargeted = edit(source, (state) => {
    const { from, to } = range(state.doc, "OpenAI");
    return state.tr.addMark(from, to, state.schema.marks.link.create({ href: "https://openai.com/research" }));
  });
  assert.equal(retargeted, nativeSource("See [OpenAI](https://openai.com/research) for **bold [docs](https://a.example/docs) text**.\n"));

  const relabeled = edit(source, (state) => {
    const { from, to } = range(state.doc, "OpenAI");
    const link = state.schema.marks.link.create({ href: "https://openai.com" });
    return state.tr.insertText("the OpenAI site", from, to).addMark(from, from + "the OpenAI site".length, link);
  });
  assert.equal(relabeled, nativeSource("See [the OpenAI site](https://openai.com) for **bold [docs](https://a.example/docs) text**.\n"));

  const removed = edit(source, (state) => {
    const { from, to } = range(state.doc, "docs");
    return state.tr.removeMark(from, to, state.schema.marks.link);
  });
  assert.equal(removed, nativeSource("See [OpenAI](https://openai.com) for **bold docs text**.\n"));
});

test("fragment links stay ordinary links and cross-references stay untouched", () => {
  const markdown = nativeSource("See {eq}`eq-current`.\n\nThe [current](#eq-current) reference.\n");
  const saved = edit(markdown, (state) => {
    const { from } = range(state.doc, " reference.");
    return state.tr.insertText(" updated", from + " reference".length);
  });
  assert.equal(saved, nativeSource("See {eq}`eq-current`.\n\nThe [current](#eq-current) reference updated.\n"));
});

test("Host rejects links Core cannot preserve without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-link-save-"));
  const file = path.join(dir, "links.md");
  const markdown = nativeSource("See OpenAI.\n");
  writeFileSync(file, markdown);
  try {
    const revision = documentRevision(markdown);
    const link = (url: string): InlineContent[] =>
      [text("See "), { kind: "link", url, children: [text("OpenAI")] }, text(".")];
    for (const [url, reason] of [
      ["https://example.com/a b", /no whitespace/],
      ["https://example.com/한글", /cannot round-trip/],
    ] as const) {
      assert.throws(() => saveDocumentFile(file, { revision, paragraphs: [{ path: [1], content: link(url) }] }), reason);
      assert.equal(readFileSync(file, "utf8"), markdown);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
