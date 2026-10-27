import { nativeSource } from "./helpers/document.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { editorExtensions } from "../src/editor-schema.tsx";
import { currentOutlineItem, documentOutline, documentTargets } from "../src/outline.ts";
import { defaultHeadingNumbering } from "@ieumdoc/core/numbering";
import { collectSupportedEdits, type TiptapJSON, toTiptapDocument } from "../src/tiptap-document.ts";
import { saveEdits } from "../server/document-replay.ts";
import { loadEditableDocument } from "./helpers/document.ts";

test("the outline lists top-level headings in order", () => {
  const markdown = nativeSource("# Title\n\nIntro.\n\n## Plain section\n\n### **Formatted** section\n\n> Quoted paragraph\n\n## Last\n");
  const schema = getSchema(editorExtensions());
  const doc = schema.nodeFromJSON(toTiptapDocument(loadEditableDocument(markdown)));
  assert.deepEqual(documentOutline(doc).map(item => [item.index, item.level, item.text]), [
    [0, 1, "Title"], [2, 2, "Plain section"], [3, 3, "Formatted section"], [5, 2, "Last"],
  ]);
  for (const item of documentOutline(doc)) assert.equal(doc.nodeAt(item.pos), doc.child(item.index));
  const numbered = toTiptapDocument(loadEditableDocument(markdown));
  numbered.attrs = { headingNumbering: defaultHeadingNumbering(true)! };
  assert.deepEqual(documentOutline(schema.nodeFromJSON(numbered)).map(item => [item.number, item.text]), [
    [undefined, "Title"], ["1", "1 Plain section"], ["1.1", "1.1 Formatted section"], ["2", "2 Last"],
  ]);
});

test("the section being read is the last heading above the reading line", () => {
  assert.equal(currentOutlineItem([], 200), -1);
  // Above all headings, the first one is current.
  assert.equal(currentOutlineItem([300, 900], 200), 0);
  assert.equal(currentOutlineItem([-500, 150, 900], 200), 1);
  assert.equal(currentOutlineItem([-900, -400, -100], 200), 2);
  // At the end of the page, a last heading still low in the view is current.
  assert.equal(currentOutlineItem([-900, -400, 500], 200, 720), 2);
  assert.equal(currentOutlineItem([-900, -400, 800], 200, 720), 1);
});


test("heading numbering follows the single document state and saves as Core metadata", () => {
  const source = nativeSource("# Title\n\n## First\n\n### Detail\n");
  const opening = loadEditableDocument(source);
  const schema = getSchema(editorExtensions());
  const json = toTiptapDocument(opening);
  json.attrs = { headingNumbering: defaultHeadingNumbering(true)! };
  const doc = schema.nodeFromJSON(json);
  assert.deepEqual(documentOutline(doc).map(item => item.text), ["Title", "1 First", "1.1 Detail"]);
  const edits = collectSupportedEdits(opening, doc.toJSON() as TiptapJSON);
  assert.equal(edits.headingNumbering, true);
  const saved = saveEdits(source, edits);
  assert.match(saved.markdown, /headings: true/);
  assert.deepEqual(collectSupportedEdits(loadEditableDocument(saved.markdown), toTiptapDocument(loadEditableDocument(saved.markdown))), { headings: [], paragraphs: [] });
  const without = toTiptapDocument(loadEditableDocument(saved.markdown));
  without.attrs!.headingNumbering = null;
  assert.equal(collectSupportedEdits(loadEditableDocument(saved.markdown), without).headingNumbering, false);

});


test("navigation targets use the current native captions and Core caption numbering/templates", () => {
  const source = nativeSource("# Title\n\n:::{table} **Results**\n| A | B |\n| --- | --- |\n| 1 | 2 |\n:::\n\n:::{figure} diagram.svg\n:alt: Diagram\n\nFlow **chart**.\n:::\n\n:::{table}\n| A | B |\n| --- | --- |\n| 3 | 4 |\n:::\n\n:::{figure} diagram.svg\n:alt: Empty caption\n:::\n");
  const schema = getSchema(editorExtensions());
  const json = toTiptapDocument(loadEditableDocument(source));
  const doc = schema.nodeFromJSON(json);
  assert.deepEqual(documentTargets(doc, "table").map(item => item.text), ["Table 1: Results", "Table 2"]);
  assert.deepEqual(documentTargets(doc, "figure").map(item => item.text), ["Figure 1: Flow chart.", "Figure 2"]);
  for (const kind of ["table", "figure"] as const) {
    for (const item of documentTargets(doc, kind)) assert.equal(doc.nodeAt(item.pos), doc.child(item.index));
  }
  json.attrs = { ...json.attrs, referenceTemplates: { table: "표 %s", figure: "그림 %s" } };
  assert.deepEqual(documentTargets(schema.nodeFromJSON(json), "table").map(item => item.text), ["표 1: Results", "표 2"]);
  assert.deepEqual(documentTargets(schema.nodeFromJSON(json), "figure").map(item => item.text), ["그림 1: Flow chart.", "그림 2"]);
});
