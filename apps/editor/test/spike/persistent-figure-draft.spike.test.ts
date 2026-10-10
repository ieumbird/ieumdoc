// SPIKE: Editor state transitions for a persistent Figure draft, against the spike Core.
// Not part of the Editor suite: `pnpm --filter @ieumdoc/editor exec tsx --test test/spike/persistent-figure-draft.spike.test.ts`.
import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { history, redo, undo } from "@tiptap/pm/history";
import { EditorState } from "@tiptap/pm/state";
import { deleteBlock } from "../../src/block-commands.ts";
import { editorDocumentJSON, editorExtensions, isUnappliedFigureDraft, structureGuardPlugin } from "../../src/editor-schema.tsx";
import { collectSupportedEdits, isSessionPlaceholder, toTiptapDocument, paragraphContent, type TiptapJSON } from "../../src/tiptap-document.ts";
import { loadEditableDocument, saveEdits } from "../../server/document-api.ts";

const SAVED = "# Converter\n\n:::{figure}\n:name: fig-pfc-control\n\nPFC control loop.\n:::\n\nSee {numref}`fig-pfc-control`.\n";
const figureNode = (doc: TiptapJSON) => doc.content!.find(node => node.type === "figure")!;

test("E1 a pending Figure reopened from disk is an ordinary editable Figure, not a session placeholder", () => {
  const doc = toTiptapDocument(loadEditableDocument(SAVED));
  const figure = figureNode(doc);
  assert.deepEqual([figure.attrs?.imageUrl, figure.attrs?.label, figure.attrs?.editable, figure.attrs?.sourcePath], ["", "fig-pfc-control", true, "1"]);
  assert.equal(isSessionPlaceholder(figure), false);
  // Opening its form is not an unsaved draft: only new blocks treat an empty URL as never applied.
  const applied = { imageUrl: "", imageAlt: "", caption: [{ kind: "text" as const, text: "PFC control loop." }] };
  assert.equal(isUnappliedFigureDraft(true, applied, applied, "1"), false);
});

test("E2 connecting an image in the Editor saves as a Figure update that keeps the label and position", () => {
  const editable = loadEditableDocument(SAVED);
  const next = toTiptapDocument(editable);
  const figure = figureNode(next);
  figure.attrs = { ...figure.attrs, imageUrl: "./pfc-control.svg", imageAlt: "PFC block diagram" };
  const edits = collectSupportedEdits(editable, next);
  assert.equal(edits.figures?.length, 1);
  const { markdown } = saveEdits(SAVED, edits);
  assert.equal(markdown, "# Converter\n\n:::{figure} ./pfc-control.svg\n:name: fig-pfc-control\n:alt: PFC block diagram\n\nPFC control loop.\n:::\n\nSee {numref}`fig-pfc-control`.\n");
});

test("E3 undo/redo of connecting content, and deleting the pending Figure, use the ordinary engine history", () => {
  const schema = getSchema(editorExtensions());
  const baseline = toTiptapDocument(loadEditableDocument(SAVED));
  let rejected = 0;
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline), plugins: [history(), structureGuardPlugin(baseline, () => rejected++)] });
  let position = -1;
  state.doc.forEach((node, pos) => { if (node.type.name === "figure") position = pos; });
  state = state.apply(state.tr.setNodeMarkup(position, undefined, { ...state.doc.nodeAt(position)!.attrs, imageUrl: "./pfc.svg" }));
  assert.equal(undo(state, tr => { state = state.apply(tr); }), true);
  assert.equal(state.doc.nodeAt(position)?.attrs.imageUrl, "");
  assert.equal(redo(state, tr => { state = state.apply(tr); }), true);
  assert.equal(state.doc.nodeAt(position)?.attrs.imageUrl, "./pfc.svg");
  // The Editor's own delete command records the deleted snapshot path for Save.
  state = state.apply(deleteBlock(state, 1));
  assert.equal(rejected, 0);
  const editable = loadEditableDocument(SAVED);
  const { markdown } = saveEdits(SAVED, collectSupportedEdits(editable, editorDocumentJSON(state)));
  assert.equal(markdown, "# Converter\n\nSee {numref}`fig-pfc-control`.\n");
  assert.equal(undo(state, tr => { state = state.apply(tr); }), true);
  assert.equal(state.doc.nodeAt(position)?.attrs.label, "fig-pfc-control");
});

test("E4 GAP: a new Figure applied with a label and caption but no content is still a session placeholder and is not saved", () => {
  const editable = loadEditableDocument("Intro.\n");
  const next = toTiptapDocument(editable);
  const draft: TiptapJSON = { type: "figure", attrs: { sourcePath: "new:draft", label: "fig-pfc-control", editable: true, imageUrl: "", imageAlt: "" },
    content: paragraphContent([{ kind: "text", text: "PFC control loop." }]) };
  next.content!.push(draft);
  assert.equal(isSessionPlaceholder(draft), true);
  // The applied label and caption are silently outside Save: the Editor needs an explicit applied marker.
  assert.deepEqual(collectSupportedEdits(editable, next), collectSupportedEdits(editable, toTiptapDocument(editable)));
});
