import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getSchema } from "@tiptap/core";
import { history, redo, undo } from "@tiptap/pm/history";
import { EditorState } from "@tiptap/pm/state";
import { parse, serialize, type EditableDocument } from "@ieumdoc/core";
import { insertFigureAfter } from "../src/block-commands.ts";
import { remapSavedRanges } from "../src/DocumentEditor.tsx";
import { editorExtensions, isUnappliedFigureDraft, structureGuardPlugin } from "../src/editor-schema.tsx";
import {
  assertSupportedDocumentChange,
  collectSupportedEdits,
  toTiptapDocument,
  type TiptapJSON,
} from "../src/tiptap-document.ts";
import {
  commitDocumentSave,
  documentRevision,
  loadEditableDocument,
  saveEdits,
  validateFigureRequest,
} from "../server/document-api.ts";

const editorRoot = fileURLToPath(new URL("..", import.meta.url));
const source = readFileSync(
  fileURLToPath(new URL("../../../packages/core/test/fixtures/technical-document.md", import.meta.url)),
  "utf8",
);
const FIGURE = "6";
const ORIGINAL = {
  imageUrl: "./diagram.svg",
  imageAlt: "Control block diagram",
  caption: "Control block diagram of the grid-connected converter.",
};
const CHANGED = {
  imageUrl: "./diagram-v2.svg",
  imageAlt: "Updated block diagram",
  caption: "Updated converter control diagram.",
};

function clone(value: TiptapJSON): TiptapJSON {
  return JSON.parse(JSON.stringify(value)) as TiptapJSON;
}

function blockAt(doc: TiptapJSON, sourcePath: string): TiptapJSON {
  const block = doc.content?.find((node) => node.attrs?.sourcePath === sourcePath);
  assert.ok(block, sourcePath);
  return block;
}

function figureOf(document: EditableDocument, index: number) {
  const block = document.blocks[index];
  assert.equal(block?.block, "figure");
  if (block?.block !== "figure") throw new Error("not a figure");
  return { label: block.label, imageUrl: block.imageUrl, imageAlt: block.imageAlt, caption: block.caption.text };
}

test("Figure projection carries editable properties and a display-only label", () => {
  const figure = blockAt(toTiptapDocument(loadEditableDocument(source)), FIGURE);
  assert.deepEqual(figure.attrs, { sourcePath: FIGURE, label: "fig-control", ...ORIGINAL, editable: true });
  const readonly = toTiptapDocument(loadEditableDocument(":::{figure} ./a.png\n**bold caption**\n:::\n"));
  assert.equal(readonly.content?.[0]?.attrs?.editable, false);
});

test("image, alt text and caption are the only editable Figure attributes", () => {
  const baseline = toTiptapDocument(loadEditableDocument(source));
  const changed = clone(baseline);
  Object.assign(blockAt(changed, FIGURE).attrs!, CHANGED);
  assert.doesNotThrow(() => assertSupportedDocumentChange(baseline, changed));
  assert.deepEqual(collectSupportedEdits(loadEditableDocument(source), changed).figures, [
    { path: [6], from: ORIGINAL, to: CHANGED },
  ]);

  for (const [key, value] of [["label", "fig-other"], ["editable", false], ["sourcePath", "new:x"]] as const) {
    const identity = clone(baseline);
    blockAt(identity, FIGURE).attrs![key] = value;
    assert.throws(() => assertSupportedDocumentChange(baseline, identity), /figure identity|must be editable and unlabeled/);
  }

  const readonlySource = ":::{figure} ./a.png\n**bold caption**\n:::\n";
  const readonly = toTiptapDocument(loadEditableDocument(readonlySource));
  const flattened = clone(readonly);
  flattened.content![0].attrs!.caption = "flattened";
  assert.throws(() => assertSupportedDocumentChange(readonly, flattened), /read-only block changed/);
});

test("Figure validity is enforced before Save and by the Core write path", () => {
  const editable = loadEditableDocument(source);
  for (const [change, message] of [
    [{ imageUrl: "" }, /image URL is required/],
    [{ imageUrl: "./a.svg " }, /image URL cannot contain/],
    [{ imageAlt: " alt" }, /alt text cannot contain/],
  ] as const) {
    const next = toTiptapDocument(editable);
    Object.assign(blockAt(next, FIGURE).attrs!, change);
    assert.throws(() => collectSupportedEdits(editable, next), message);
  }
  let writes = 0;
  for (const to of [{ ...CHANGED, imageUrl: "" }, { ...CHANGED, caption: "cost $5 and $x$" }]) {
    assert.throws(() => commitDocumentSave(() => source, () => writes++, {
      revision: documentRevision(source),
      figures: [{ path: [6], from: ORIGINAL, to }],
    }));
  }
  // Stale, partial, non-Figure and read-only targets never write.
  for (const figures of [
    [{ path: [6], from: { ...ORIGINAL, caption: "stale" }, to: CHANGED }],
    [{ path: [6], from: ORIGINAL, to: { imageUrl: "./x.svg" } as never }],
    [{ path: [0], from: ORIGINAL, to: CHANGED }],
  ]) {
    assert.throws(() => commitDocumentSave(() => source, () => writes++, { revision: documentRevision(source), figures }));
  }
  const readonlySource = ":::{figure} ./a.png\n**bold caption**\n:::\n";
  assert.throws(() => commitDocumentSave(() => readonlySource, () => writes++, {
    revision: documentRevision(readonlySource),
    figures: [{ path: [0], from: { imageUrl: "./a.png", imageAlt: "", caption: "bold caption" }, to: CHANGED }],
  }), /figure edit is not allowed/);
  assert.equal(writes, 0);
});

test("Figure edit survives Apply projection, reorder, Save and reload with its label", () => {
  const editable = loadEditableDocument(source);
  const projection = toTiptapDocument(editable);
  Object.assign(blockAt(projection, FIGURE).attrs!, CHANGED);
  projection.content!.unshift(projection.content!.splice(6, 1)[0]);
  const edits = collectSupportedEdits(editable, projection);
  assert.deepEqual(edits.figures, [{ path: [6], from: ORIGINAL, to: CHANGED }]);
  assert.ok(edits.order);
  const saved = saveEdits(source, edits);
  assert.deepEqual(figureOf(saved.document, 0), { label: "fig-control", ...CHANGED });
  assert.match(saved.markdown, /^:::\{figure\} \.\/diagram-v2\.svg\n:name: fig-control\n:alt: Updated block diagram\n\nUpdated converter control diagram\.\n:::\n/);
  assert.equal(serialize(parse(saved.markdown)), saved.markdown);
  assert.deepEqual(figureOf(loadEditableDocument(saved.markdown), 0), { label: "fig-control", ...CHANGED });

  // Clearing optional properties keeps the Figure and its label.
  const cleared = toTiptapDocument(editable);
  Object.assign(blockAt(cleared, FIGURE).attrs!, { imageAlt: "", caption: "" });
  const clearedSave = saveEdits(source, collectSupportedEdits(editable, cleared));
  assert.deepEqual(figureOf(clearedSave.document, 6), { label: "fig-control", imageUrl: ORIGINAL.imageUrl, imageAlt: "", caption: "" });
});

test("new Figure inserts save and reload through Core semantics", () => {
  const editable = loadEditableDocument("Intro\n");
  const next = toTiptapDocument(editable);
  const figure = { imageUrl: "./plot.svg", imageAlt: "Plot", caption: "Measured plot." };
  next.content!.push({ type: "figure", attrs: { sourcePath: "new:figure", label: "", editable: true, ...figure } });
  const edits = collectSupportedEdits(editable, next);
  assert.deepEqual(edits.inserts, [{ block: "figure", ...figure }]);
  const saved = saveEdits("Intro\n", edits);
  assert.equal(saved.markdown, "Intro\n\n:::{figure} ./plot.svg\n:alt: Plot\n\nMeasured plot.\n:::\n");
  assert.deepEqual(figureOf(saved.document, 1), { label: "", ...figure });
  assert.deepEqual(figureOf(loadEditableDocument(saved.markdown), 1), { label: "", ...figure });
  // The saved snapshot re-addresses the transient locator.
  assert.deepEqual(remapSavedRanges([{ start: 7, end: 8, path: "1" }], saved.document), [{ start: 7, end: 8, path: "1" }]);

  // An unapplied transient Figure is representable in the editor but cannot be saved.
  const empty = toTiptapDocument(editable);
  empty.content!.push({ type: "figure", attrs: { sourcePath: "new:empty-figure", label: "", editable: true, imageUrl: "", imageAlt: "", caption: "" } });
  assert.doesNotThrow(() => assertSupportedDocumentChange(toTiptapDocument(editable), empty));
  assert.throws(() => collectSupportedEdits(editable, empty), /image URL is required/);
  assert.throws(() => saveEdits("Intro\n", {
    inserts: [{ block: "figure", imageUrl: "", imageAlt: "", caption: "" }],
    order: [{ path: [0], part: 0 }, { insert: 0 }],
  }), /image URL is required/);

  // New Figures cannot carry a label, and persistent blocks cannot become Figures.
  const labeled = toTiptapDocument(editable);
  labeled.content!.push({ type: "figure", attrs: { sourcePath: "new:labeled", label: "fig-x", editable: true, ...figure } });
  assert.throws(() => assertSupportedDocumentChange(toTiptapDocument(editable), labeled), /unlabeled/);
  const conversion = toTiptapDocument(editable);
  conversion.content![0] = { type: "figure", attrs: { sourcePath: "0", label: "", editable: true, ...figure } };
  assert.throws(() => assertSupportedDocumentChange(toTiptapDocument(editable), conversion), /top-level block type changed/);
});

test("Figure delete and reorder keep other blocks and Core semantics", () => {
  const editable = loadEditableDocument(source);
  const deleted = toTiptapDocument(editable);
  deleted.content = deleted.content!.filter((node) => node.attrs?.sourcePath !== FIGURE);
  deleted.attrs = { deletedPaths: [FIGURE] };
  const edits = collectSupportedEdits(editable, deleted);
  assert.deepEqual(edits.deletes, [[6]]);
  const saved = saveEdits(source, edits);
  assert.equal(saved.document.blocks.some((block) => block.block === "figure"), false);
  assert.equal(saved.document.blocks.length, editable.blocks.length - 1);

  const inserted = toTiptapDocument(editable);
  const figure = { imageUrl: "./plot.svg", imageAlt: "", caption: "Plot." };
  inserted.content!.splice(1, 0, { type: "figure", attrs: { sourcePath: "new:figure", label: "", editable: true, ...figure } });
  const withInsert = saveEdits(source, collectSupportedEdits(editable, inserted));
  assert.deepEqual(figureOf(withInsert.document, 1), { label: "", ...figure });
  assert.deepEqual(figureOf(withInsert.document, 7), { label: "fig-control", ...ORIGINAL });
});

test("an open Figure draft blocks saving until applied or canceled", () => {
  assert.equal(isUnappliedFigureDraft(false, CHANGED, ORIGINAL), false);
  assert.equal(isUnappliedFigureDraft(true, ORIGINAL, ORIGINAL, "6"), false);
  assert.equal(isUnappliedFigureDraft(true, { ...ORIGINAL, caption: "x" }, ORIGINAL, "6"), true);
  const empty = { imageUrl: "", imageAlt: "", caption: "" };
  // A new Figure stays a draft until a valid image URL is applied, even with no typed change.
  assert.equal(isUnappliedFigureDraft(true, empty, empty, "new:figure"), true);
  assert.equal(isUnappliedFigureDraft(false, empty, empty, "new:figure"), false);
  assert.equal(isUnappliedFigureDraft(true, CHANGED, CHANGED, "new:figure"), false);

  const app = readFileSync(path.join(editorRoot, "src", "App.tsx"), "utf8");
  const guard = app.indexOf("if (figureDraftActive) return;");
  assert.ok(guard >= 0 && guard < app.indexOf("beginSave()"));
  assert.match(app, /Apply or Cancel the Figure edit before saving\./);
  assert.match(app, /hasPendingUserState = hasPendingDocumentEdits \|\| hasPendingEquationDraft \|\| hasPendingFigureDraft/);
  const documentEditor = readFileSync(path.join(editorRoot, "src", "DocumentEditor.tsx"), "utf8");
  assert.match(documentEditor, /activeFigureDrafts\.current\.size > 0/);
  const schemaSource = readFileSync(path.join(editorRoot, "src", "editor-schema.tsx"), "utf8");
  // Cancel removes only a never-applied transient Figure; Apply writes the validated draft.
  assert.match(schemaSource, /const neverApplied = isNewBlockPath\(sourcePath\) && applied\.imageUrl\.length === 0;/);
  assert.match(schemaSource, /if \(neverApplied\) removeUnappliedBlock\(view, getPos, node, deleteNode\);/);
  // Apply commits only after Core's persistent validation through the Host accepts the value.
  assert.match(schemaSource, /message = await validateFigure!\(candidate\);[\s\S]*if \(message\) \{\s*setError\(message\);\s*return;\s*\}\s*updateAttributes\(candidate\);/);
  assert.match(app, /fetch\("\/api\/figure-validation"/);
  assert.match(app, /validateFigure=\{validateFigure\}/);
});

test("the Host Figure validation endpoint returns Core's persistent validation", () => {
  assert.equal(validateFigureRequest(CHANGED), undefined);
  assert.match(validateFigureRequest({ ...CHANGED, caption: "cost $5 and $x$" }) ?? "", /canonical round-trip|not canonical/);
  assert.match(validateFigureRequest({ ...CHANGED, imageUrl: "" }) ?? "", /image URL is required/);
  assert.throws(() => validateFigureRequest({ imageUrl: "./a.svg" } as never), /must be strings/);
  // The same value is rejected by the Save path, so Apply and Save agree.
  assert.throws(() => saveEdits(source, {
    figures: [{ path: [6], from: ORIGINAL, to: { ...CHANGED, caption: "cost $5 and $x$" } }],
  }), /canonical round-trip|not canonical/);
});

test("Figure Apply participates in the structure guard and undo/redo", () => {
  const schema = getSchema(editorExtensions());
  const baseline = toTiptapDocument(loadEditableDocument(source));
  let rejected = 0;
  let state = EditorState.create({
    schema,
    doc: schema.nodeFromJSON(baseline),
    plugins: [history(), structureGuardPlugin(baseline, () => rejected++)],
  });
  let position = -1;
  state.doc.forEach((node, pos) => { if (node.attrs.sourcePath === FIGURE) position = pos; });
  const figure = state.doc.nodeAt(position)!;
  state = state.apply(state.tr.setNodeMarkup(position, undefined, { ...figure.attrs, ...CHANGED }));
  assert.equal(state.doc.nodeAt(position)?.attrs.caption, CHANGED.caption);
  const labelTr = state.tr.setNodeMarkup(position, undefined, { ...state.doc.nodeAt(position)!.attrs, label: "fig-x" });
  assert.equal(state.apply(labelTr).doc, state.doc);
  assert.equal(rejected, 1);
  assert.equal(undo(state, (transaction) => { state = state.apply(transaction); }), true);
  assert.equal(state.doc.nodeAt(position)?.attrs.imageUrl, ORIGINAL.imageUrl);
  assert.equal(redo(state, (transaction) => { state = state.apply(transaction); }), true);
  assert.equal(state.doc.nodeAt(position)?.attrs.imageUrl, CHANGED.imageUrl);

  // A newly inserted Figure passes the guard as an explicit block command.
  const inserted = state.apply(insertFigureAfter(state, 0));
  assert.equal(inserted.doc.child(1).type.name, "figure");
  assert.equal(rejected, 1);
});
