import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { editorExtensions } from "../src/editor-schema.tsx";
import { currentOutlineItem, documentOutline } from "../src/outline.ts";
import { toTiptapDocument } from "../src/tiptap-document.ts";
import { loadEditableDocument } from "../server/document-api.ts";

test("the outline lists top-level headings in order, read-only headings included", () => {
  const markdown = "# Title\n\nIntro.\n\n## Plain section\n\n### **Formatted** section\n\n> ## Not a top-level heading\n\n## Last\n";
  const schema = getSchema(editorExtensions());
  const doc = schema.nodeFromJSON(toTiptapDocument(loadEditableDocument(markdown)));
  assert.deepEqual(documentOutline(doc).map(item => [item.index, item.level, item.text]), [
    [0, 1, "Title"], [2, 2, "Plain section"], [3, 3, "Formatted section"], [5, 2, "Last"],
  ]);
  for (const item of documentOutline(doc)) assert.equal(doc.nodeAt(item.pos), doc.child(item.index));
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
