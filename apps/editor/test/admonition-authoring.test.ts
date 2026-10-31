import { nativeSource } from "./helpers/document.ts";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import type { InlineContent } from "@litzio/core";
import { changeAdmonitionVariant } from "../src/block-commands.ts";
import { editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { documentRevision, saveDocumentFile } from "../server/document-api.ts";
import { loadEditableDocument } from "./helpers/document.ts";
import { saveEdits } from "../server/document-replay.ts";

const body = "Before **bold** and *italic*, [manual](https://a.example), $x$\\\nnext.";
const source = nativeSource(`# Title\n\n:::{warning}\n${body}\n:::\n\nOutside paragraph.\n`);

function editorState(markdown: string) {
  const baseline = toTiptapDocument(loadEditableDocument(markdown));
  const schema = getSchema(editorExtensions());
  let rejected = 0;
  const state = EditorState.create({
    schema,
    doc: schema.nodeFromJSON(baseline),
    plugins: [structureGuardPlugin(baseline, () => rejected++)],
  });
  return { state, rejected: () => rejected };
}

function textRange(doc: EditorState["doc"], needle: string): { from: number; to: number } {
  let found: { from: number; to: number } | undefined;
  doc.descendants((node, position) => {
    const index = node.isText ? node.text!.indexOf(needle) : -1;
    if (!found && index >= 0) found = { from: position + index, to: position + index + needle.length };
  });
  assert.ok(found, needle);
  return found;
}

test("admonition body edits pass through Core and preserve inline semantics on reload", () => {
  const { state, rejected } = editorState(source);
  assert.equal(rejected(), 0);
  const admonition = state.doc.child(1);
  assert.equal(admonition.type.name, "admonition");
  assert.equal(admonition.attrs.variant, "warning");

  const range = textRange(state.doc, "Before");
  const next = state.apply(state.tr.insertText("After", range.from, range.to));
  assert.equal(rejected(), 0);
  const edits = collectSupportedEdits(loadEditableDocument(source), next.doc.toJSON() as TiptapJSON);
  assert.deepEqual(edits.admonitions, [{ path: [2], content: [
    { kind: "text", text: "After " },
    { kind: "strong", children: [{ kind: "text", text: "bold" }] },
    { kind: "text", text: " and " },
    { kind: "emphasis", children: [{ kind: "text", text: "italic" }] },
    { kind: "text", text: ", " },
    { kind: "link", url: "https://a.example", children: [{ kind: "text", text: "manual" }] },
    { kind: "text", text: ", " },
    { kind: "math", value: "x" },
    { kind: "break" },
    { kind: "text", text: "next." },
  ] }]);

  const saved = saveEdits(source, edits);
  assert.equal(saved.markdown, nativeSource([
    "# Title",
    "",
    ":::{warning}",
    "After **bold** and *italic*, [manual](https://a.example), $x$\\",
    "next.",
    ":::",
    "",
    "Outside paragraph.",
    "",
  ].join("\n")));
  const reloaded = loadEditableDocument(saved.markdown).blocks;
  assert.equal(reloaded[1]?.block, "admonition");
  if (reloaded[1]?.block !== "admonition") return;
  assert.equal(reloaded[1].variant, "warning");
  assert.equal(reloaded[1].editable, true);
  assert.deepEqual(reloaded[1].content, edits.admonitions?.[0]?.content);
  assert.equal(reloaded[2]?.block, "paragraph");
  if (reloaded[2]?.block === "paragraph") assert.equal(reloaded[2].text, "Outside paragraph.");
});

test("an admonition kind change and a body edit save together and keep the inline body", () => {
  const { state, rejected } = editorState(source);
  const range = textRange(state.doc, "Before");
  const changed = state.apply(changeAdmonitionVariant(state, 1, "danger"));
  const edited = changed.apply(changed.tr.insertText("Now", range.from, range.to));
  assert.equal(rejected(), 0);
  const edits = collectSupportedEdits(loadEditableDocument(source), edited.doc.toJSON() as TiptapJSON);
  assert.equal(edits.admonitions?.[0]?.variant, "danger");
  const saved = saveEdits(source, edits);
  assert.ok(saved.markdown.includes(":::{danger}\nNow **bold** and *italic*"), saved.markdown);
  const savedBlock = loadEditableDocument(saved.markdown).blocks[1];
  assert.equal(savedBlock?.block === "admonition" && savedBlock.editable, true);
});
