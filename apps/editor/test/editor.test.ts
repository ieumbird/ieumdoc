import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getEditableDocument, parse, serialize, type EditableDocument } from "@ieumdoc/core";
import { EquationNode } from "../src/EquationNode.ts";
import { fromTiptapDocument, toTiptapDocument } from "../src/single-editor-adapter.ts";
import { loadEditableDocument, saveEditorDocument } from "../server/document-api.ts";

const editorRoot = fileURLToPath(new URL("..", import.meta.url));
const fixture = fileURLToPath(new URL("../document/technical-document.md", import.meta.url));
const source = readFileSync(fixture, "utf8");

test("the representative fixture is Heading, Paragraph, Equation, Paragraph", () => {
  const document = loadEditableDocument(source);
  assert.deepEqual(document.blocks.map((block) => block.block), [
    "heading",
    "paragraph",
    "equation",
    "paragraph",
  ]);
  const [heading, firstParagraph, equation, secondParagraph] = document.blocks;
  assert.equal(heading?.block, "heading");
  assert.equal(firstParagraph?.block, "paragraph");
  assert.equal(equation?.block, "equation");
  assert.equal(secondParagraph?.block, "paragraph");
  if (heading?.block !== "heading" || firstParagraph?.block !== "paragraph" || equation?.block !== "equation" || secondParagraph?.block !== "paragraph") return;
  assert.equal(heading.text, "Converter Control");
  assert.equal(firstParagraph.text, "The converter regulates the DC-link voltage.");
  assert.equal(equation.latex, "i* = P* / Vrms");
  assert.equal(secondParagraph.text, "The current reference follows the active power command.");
});

test("Heading, Paragraph, and Equation round-trip through the editor-neutral adapter", () => {
  const original = loadEditableDocument(source);
  const tiptap = toTiptapDocument(original);

  assert.equal(tiptap.type, "doc");
  assert.deepEqual(tiptap.content?.map((node) => node.type), [
    "heading",
    "paragraph",
    "equation",
    "paragraph",
  ]);
  assert.deepEqual(fromTiptapDocument(tiptap), original);
});

test("block insertion and deletion stay semantic instead of exposing Tiptap JSON to Core", () => {
  const original = loadEditableDocument(source);
  const edited = fromTiptapDocument({
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Converter Control" }] },
      { type: "paragraph", content: [{ type: "text", text: "Inserted paragraph" }] },
      { type: "equation", attrs: { latex: "i* = P* / Vrms", label: "" } },
      { type: "paragraph", content: [{ type: "text", text: "The current reference follows the active power command." }] },
    ],
  });
  assert.notDeepEqual(edited, original);

  const saved = saveEditorDocument(source, edited);
  const reparsed = parse(saved.markdown);
  assert.deepEqual(getEditableDocument(reparsed).blocks.map((block) => block.block), [
    "heading",
    "paragraph",
    "equation",
    "paragraph",
  ]);
  assert.equal(saved.markdown.includes("Inserted paragraph"), true);
  assert.equal(serialize(reparsed), saved.markdown);
});

test("unsupported existing blocks are rejected by this intentionally narrow spike adapter", () => {
  const technical = readFileSync(
    fileURLToPath(new URL("../../../packages/core/test/fixtures/technical-document.md", import.meta.url)),
    "utf8",
  );
  assert.throws(() => toTiptapDocument(loadEditableDocument(technical)), /does not support|read-only paragraph/);
});

test("Equation is a real atomic typed node and not a styled paragraph", () => {
  assert.equal(EquationNode.name, "equation");
  assert.equal(EquationNode.config.group, "block");
  assert.equal(EquationNode.config.atom, true);
  assert.equal(EquationNode.config.selectable, true);
  const sourceText = readFileSync(path.join(editorRoot, "src", "EquationNode.ts"), "utf8");
  assert.equal(sourceText.includes('name: "equation"'), true);
  assert.equal(sourceText.includes('data-equation'), true);
  assert.equal(sourceText.includes('name: "paragraph"'), false);
});

test("the spike has one editor instance and leaves keyboard behavior to Tiptap", () => {
  const sourceText = readFileSync(path.join(editorRoot, "src", "SingleDocumentEditor.tsx"), "utf8");
  assert.equal((sourceText.match(/useEditor\(/g) ?? []).length, 1);
  assert.equal(sourceText.includes("handleKeyDown"), false);
  assert.equal(sourceText.includes("deleteRange"), true);
  assert.equal(sourceText.includes("insertContentAt"), true);
});

test("Core and the save bridge stay free of Tiptap and ProseMirror imports", () => {
  const coreRoot = fileURLToPath(new URL("../../../packages/core/src", import.meta.url));
  for (const file of [
    path.join(coreRoot, "operations.ts"),
    path.join(coreRoot, "editable.ts"),
    path.join(editorRoot, "server", "document-api.ts"),
  ]) {
    const sourceText = readFileSync(file, "utf8");
    assert.equal(/from\s+["']@tiptap\//.test(sourceText), false, file);
    assert.equal(/from\s+["']prosemirror-/.test(sourceText), false, file);
  }
});

test("the semantic save bridge validates and reloads the canonical Markdown", () => {
  const edited: EditableDocument = {
    blocks: [
      { block: "heading", path: [0], level: 1, text: "Converter Control" },
      {
        block: "paragraph",
        path: [1],
        text: "Bold voltage",
        content: [{ kind: "strong", children: [{ kind: "text", text: "Bold voltage" }] }],
        editable: true,
      },
      { block: "equation", path: [2], latex: "i* = P* / Vrms", label: "" },
      { block: "paragraph", path: [3], text: "After reload", content: [{ kind: "text", text: "After reload" }], editable: true },
    ],
  };
  const saved = saveEditorDocument(source, edited);
  const reloaded = loadEditableDocument(saved.markdown);
  assert.equal(reloaded.blocks[1]?.block, "paragraph");
  if (reloaded.blocks[1]?.block !== "paragraph") return;
  assert.equal(reloaded.blocks[1].text, "Bold voltage");
  assert.equal(serialize(parse(saved.markdown)), saved.markdown);
});
