import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import type { InlineContent } from "@ieumdoc/core";
import { editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { documentRevision, loadEditableDocument, saveDocumentFile, saveEdits } from "../server/document-api.ts";

const body = "Before **bold** and *italic*, [manual](https://a.example), $x$\\\nnext.";
const source = `# Title\n\n:::{warning}\n${body}\n:::\n\nOutside paragraph.\n`;

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
  assert.equal(admonition.attrs.editable, true);
  const range = textRange(state.doc, "Before");
  const next = state.apply(state.tr.insertText("After", range.from, range.to));
  assert.equal(rejected(), 0);
  const edits = collectSupportedEdits(loadEditableDocument(source), next.doc.toJSON() as TiptapJSON);
  assert.deepEqual(edits.admonitions, [{ path: [1], content: [
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
  assert.equal(saved.markdown, [
    "# Title",
    "",
    ":::{warning}",
    "After **bold** and *italic*, [manual](https://a.example), {math}`x`\\",
    "next.",
    ":::",
    "",
    "Outside paragraph.",
    "",
  ].join("\n"));
  const reloaded = loadEditableDocument(saved.markdown).blocks;
  assert.equal(reloaded[1]?.block, "admonition");
  if (reloaded[1]?.block !== "admonition") return;
  assert.equal(reloaded[1].variant, "warning");
  assert.equal(reloaded[1].editable, true);
  assert.deepEqual(reloaded[1].content, edits.admonitions?.[0]?.content);
  assert.equal(reloaded[2]?.block, "paragraph");
  if (reloaded[2]?.block === "paragraph") assert.equal(reloaded[2].text, "Outside paragraph.");
});

test("unsupported admonitions remain read-only and a failed edit never writes the file", () => {
  const unsupported = [
    ":::{admonition} Title\nBody\n:::\n",
    ":::{note}\n:class: custom\nBody\n:::\n",
    ":::{note}\nOne\n\nTwo\n:::\n",
    ":::{tip}\nBody\n:::\n",
  ];
  for (const markdown of unsupported) {
    const block = loadEditableDocument(markdown).blocks[0];
    assert.equal(block?.block, "admonition");
    if (block?.block !== "admonition") continue;
    assert.equal(block.editable, false, markdown);
    assert.throws(() => saveEdits(markdown, {
      admonitions: [{ path: block.path, content: [{ kind: "text", text: "Changed." }] }],
    }), /admonition edit is not allowed/);
  }

  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-admonition-"));
  const file = path.join(dir, "warning.md");
  writeFileSync(file, source);
  try {
    const revision = documentRevision(source);
    const invalid: InlineContent[] = [{ kind: "math", value: "`x" }];
    assert.throws(() => saveDocumentFile(file, { revision, admonitions: [{ path: [1], content: invalid }] }), /cannot round-trip/);
    assert.equal(readFileSync(file, "utf8"), source);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
