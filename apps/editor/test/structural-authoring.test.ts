import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { parse, serialize, type InlineContent } from "@ieumdoc/core";
import { changeHeadingLevel } from "../src/block-commands.ts";
import { editorExtensions } from "../src/editor-schema.tsx";
import { collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { documentRevision, loadEditableDocument, saveDocumentFile } from "../server/document-api.ts";

const source = "# Structural blocks\n\n## Existing heading\n\nKeep this paragraph.\n";
const warningBody: InlineContent[] = [{ kind: "text", text: "Check current limit." }];

function editorState(markdown: string) {
  const editable = loadEditableDocument(markdown);
  const projection = toTiptapDocument(editable);
  const schema = getSchema(editorExtensions());
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(projection) });
  return { editable, state };
}

function saveFile(file: string, markdown: string, edits: ReturnType<typeof collectSupportedEdits>) {
  return saveDocumentFile(file, { revision: documentRevision(markdown), ...edits });
}

test("new Warning survives Tiptap collection, Host file save and reload", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-structural-warning-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, source);
  try {
    const { editable, state } = editorState(source);
    const warning = state.schema.nodeFromJSON({
      type: "admonition",
      attrs: { sourcePath: "new:warning", variant: "warning", text: "", editable: true },
      content: [{ type: "text", text: "Check current limit." }],
    });
    const insertAt = state.doc.child(0).nodeSize + state.doc.child(1).nodeSize;
    const changed = state.apply(state.tr.insert(insertAt, warning));
    const edits = collectSupportedEdits(editable, changed.doc.toJSON() as TiptapJSON);
    assert.deepEqual(edits.inserts, [{ block: "admonition", variant: "warning", content: warningBody }]);
    assert.ok(edits.order?.some((item) => "insert" in item));

    const saved = saveFile(file, source, edits);
    const disk = readFileSync(file, "utf8");
    assert.equal(disk, saved.markdown);
    assert.equal(disk, [
      "# Structural blocks",
      "",
      "## Existing heading",
      "",
      ":::{warning}",
      "Check current limit.",
      ":::",
      "",
      "Keep this paragraph.",
      "",
    ].join("\n"));
    assert.equal(serialize(parse(disk)), disk);
    const reloaded = loadEditableDocument(disk).blocks;
    const admonition = reloaded.find((block) => block.block === "admonition");
    assert.equal(admonition?.block, "admonition");
    if (admonition?.block !== "admonition") return;
    assert.equal(admonition.variant, "warning");
    assert.deepEqual(admonition.content, warningBody);
    assert.deepEqual(reloaded.filter((block) => block.block === "heading").map((block) =>
      block.block === "heading" ? [block.level, block.text] : []), [
      [1, "Structural blocks"], [2, "Existing heading"],
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Heading level edits survive Tiptap collection, Host file save and reload", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-heading-level-"));
  const levelOnlyFile = path.join(dir, "level-only.md");
  const textAndLevelFile = path.join(dir, "text-and-level.md");
  writeFileSync(levelOnlyFile, source);
  writeFileSync(textAndLevelFile, source);
  try {
    const { editable, state } = editorState(source);
    const levelOnly = state.apply(changeHeadingLevel(state, 1, 4));
    const levelEdits = collectSupportedEdits(editable, levelOnly.doc.toJSON() as TiptapJSON);
    assert.deepEqual(levelEdits.headingLevels, [{ path: [1], from: 2, to: 4 }]);
    assert.deepEqual(levelEdits.headings, []);
    saveFile(levelOnlyFile, source, levelEdits);
    const levelDisk = readFileSync(levelOnlyFile, "utf8");
    assert.equal(levelDisk, "# Structural blocks\n\n#### Existing heading\n\nKeep this paragraph.\n");
    const levelReload = loadEditableDocument(levelDisk).blocks;
    assert.deepEqual(levelReload.map((block) => block.block), ["heading", "heading", "paragraph"]);
    assert.deepEqual(levelReload[1], {
      block: "heading", path: [1], level: 4, text: "Existing heading", editable: true,
    });
    assert.equal(levelReload[2]?.block === "paragraph" && levelReload[2].text, "Keep this paragraph.");

    const levelAndText = state.apply(changeHeadingLevel(state, 1, 5));
    let textRange: { from: number; to: number } | undefined;
    levelAndText.doc.descendants((node, position) => {
      if (textRange || !node.isText) return;
      const index = node.text!.indexOf("Existing heading");
      if (index >= 0) textRange = { from: position + index, to: position + index + "Existing heading".length };
    });
    assert.ok(textRange);
    const renamed = levelAndText.apply(levelAndText.tr.insertText("Renamed heading", textRange!.from, textRange!.to));
    const combinedEdits = collectSupportedEdits(editable, renamed.doc.toJSON() as TiptapJSON);
    assert.deepEqual(combinedEdits.headingLevels, [{ path: [1], from: 2, to: 5 }]);
    assert.deepEqual(combinedEdits.headings, [{ path: [1], from: "Existing heading", to: "Renamed heading" }]);
    saveFile(textAndLevelFile, source, combinedEdits);
    const combinedDisk = readFileSync(textAndLevelFile, "utf8");
    const combinedReload = loadEditableDocument(combinedDisk).blocks;
    assert.deepEqual(combinedReload[1], {
      block: "heading", path: [1], level: 5, text: "Renamed heading", editable: true,
    });
    assert.equal(combinedReload[2]?.block === "paragraph" && combinedReload[2].text, "Keep this paragraph.");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
