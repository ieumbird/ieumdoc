import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { parse, serialize, type InlineContent } from "@ieumdoc/core";
import { applyBlockShortcut, type BlockShortcut } from "../src/markdown-input-rules.ts";
import { changeHeadingLevel, headingToParagraph, paragraphToHeading, paragraphToHeadingRejection } from "../src/block-commands.ts";
import { editorDocumentJSON, editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { joinRichProse } from "../src/document-interaction.ts";
import { collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { documentRevision, loadEditableDocument, saveDocumentFile, saveEdits } from "../server/document-api.ts";

const source = "# Structural blocks\n\n## Existing heading\n\nKeep this paragraph.\n";
const warningBody: InlineContent[] = [{ kind: "text", text: "Check current limit." }];

test("both boundary delete keys join heading and rich prose without losing inline semantics", () => {
  const markdown = "## Heading\n\n**Bold** and $x$.\n";
  const editable = loadEditableDocument(markdown);
  const baseline = toTiptapDocument(editable);
  const schema = getSchema(editorExtensions());
  const doc = schema.nodeFromJSON(baseline);
  for (const backward of [true, false]) {
    const state = EditorState.create({schema, doc,
      selection: TextSelection.create(doc, doc.child(0).nodeSize + (backward ? 1 : -1)),
      plugins: [structureGuardPlugin(baseline, () => assert.fail("representable join was rejected"))]});
    const tr = joinRichProse(state, backward);
    assert.ok(tr);
    const joined = state.applyTransaction(tr).state;
    const saved = saveEdits(markdown, collectSupportedEdits(editable, editorDocumentJSON(joined)));
    assert.equal(saved.markdown, "Heading**Bold** and {math}`x`.\n");
    assert.equal(saved.document.blocks[0].block, "paragraph");
  }
});

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

test("Paragraph and Heading conversions survive Tiptap collection, Host file save and reload", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-convert-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, source);
  try {
    const editable = loadEditableDocument(source);
    const baseline = toTiptapDocument(editable);
    const schema = getSchema(editorExtensions());
    let state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline),
      plugins: [structureGuardPlugin(baseline, () => assert.fail("representable conversion was rejected"))] });
    state = state.applyTransaction(paragraphToHeading(state, 2, 3)).state;
    state = state.applyTransaction(headingToParagraph(state, 1)).state;

    const saved = saveFile(file, source, collectSupportedEdits(editable, editorDocumentJSON(state)));
    assert.equal(readFileSync(file, "utf8"), saved.markdown);
    assert.deepEqual(loadEditableDocument(saved.markdown).blocks.map((block) =>
      block.block === "heading" ? [block.block, block.level, block.text] : [block.block, "text" in block && block.text]), [
      ["heading", 1, "Structural blocks"], ["paragraph", "Existing heading"], ["heading", 3, "Keep this paragraph."],
    ]);

    const rich = editorState("Keep **this** paragraph.\n").state;
    assert.ok(paragraphToHeadingRejection(rich, 0));
    assert.throws(() => paragraphToHeading(rich, 0, 2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Markdown block shortcuts replace the typed prefix and save as the equivalent Core blocks", () => {
  const markdown = "# Title\n\nFirst item **bold**\n\nSecond\n\nsnippet\n\nKeep.\n\nRich **text**\n";
  const editable = loadEditableDocument(markdown);
  const baseline = toTiptapDocument(editable);
  const schema = getSchema(editorExtensions());
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline),
    plugins: [structureGuardPlugin(baseline, () => assert.fail("representable shortcut was rejected"))] });
  const typed = (index: number, prefix: string, shortcut: BlockShortcut) => {
    let start = 1;
    for (let i = 0; i < index; i++) start += state.doc.child(i).nodeSize;
    state = state.applyTransaction(state.tr.insertText(prefix, start)).state;
    const tr = state.tr;
    const applied = applyBlockShortcut(tr, start, start + prefix.length, shortcut);
    if (applied) state = state.applyTransaction(tr).state;
    return applied;
  };
  assert.ok(typed(1, "-", { block: "list", ordered: false }));
  assert.ok(typed(2, "3.", { block: "list", ordered: true, start: 3 }));
  assert.ok(typed(3, "```js", { block: "code", language: "js" }));
  assert.ok(typed(4, "##", { block: "heading", level: 2 }));
  // Headings hold unmarked text only; the typed prefix stays as text.
  assert.equal(typed(5, "##", { block: "heading", level: 2 }), false);
  assert.equal(state.doc.child(5).type.name, "paragraph");

  const saved = saveEdits(markdown, collectSupportedEdits(editable, editorDocumentJSON(state)));
  const blocks = saved.document.blocks;
  assert.deepEqual(blocks.map(block => block.block), ["heading", "list", "list", "code", "heading", "paragraph"]);
  assert.deepEqual(blocks[1]?.block === "list" && blocks[1].items.map(item => item.content), [
    [{ kind: "text", text: "First item " }, { kind: "strong", children: [{ kind: "text", text: "bold" }] }],
  ]);
  assert.deepEqual(blocks[2]?.block === "list" && [blocks[2].ordered, blocks[2].start], [true, 3]);
  assert.deepEqual(blocks[3]?.block === "code" && [blocks[3].language, blocks[3].code], ["js", "snippet"]);
  assert.deepEqual(blocks[4]?.block === "heading" && [blocks[4].level, blocks[4].text], [2, "Keep."]);
  assert.equal(blocks[5]?.block === "paragraph" && blocks[5].text, "##Rich text");

  // Block shortcuts apply to top-level paragraphs only, not to paragraphs inside list items.
  const inList = state.doc.child(1).firstChild!.firstChild!;
  assert.equal(inList.type.name, "paragraph");
  assert.equal(applyBlockShortcut(state.tr, state.doc.child(0).nodeSize + 3, state.doc.child(0).nodeSize + 3,
    { block: "heading", level: 2 }), false);
});
