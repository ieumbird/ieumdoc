import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getSchema } from "@tiptap/core";
import { closeHistory, history, redo, undo } from "@tiptap/pm/history";
import { EditorState } from "@tiptap/pm/state";
import { parse, serialize, type FigureContent, type EditableDocument } from "@ieumdoc/core";
import { deleteBlock, insertFigureAfter } from "../src/block-commands.ts";
import { editorDocumentJSON, editorExtensions, isUnappliedFigureDraft, structureGuardPlugin } from "../src/editor-schema.tsx";
import {
  appliedDocument,
  assertSupportedDocumentChange,
  collectSupportedEdits,
  isSessionPlaceholder,
  toTiptapDocument,
  paragraphContent,
  type TiptapJSON,
} from "../src/tiptap-document.ts";
import { commitDocumentSave, documentRevision } from "../server/document-api.ts";
import { loadEditableDocument } from "./helpers/document.ts";
import { saveEdits, validateFigureRequest } from "../server/document-replay.ts";

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

function setFigure(node: TiptapJSON, figure: FigureContent): TiptapJSON {
  const { caption, ...attrs } = figure;
  node.attrs = { ...node.attrs, ...attrs };
  node.content = paragraphContent(typeof caption === "string" ? (caption ? [{ kind: "text", text: caption }] : []) : caption);
  return node;
}

function figureOf(document: EditableDocument, index: number) {
  const block = document.blocks[index];
  assert.equal(block?.block, "figure");
  if (block?.block !== "figure") throw new Error("not a figure");
  return { label: block.label, imageUrl: block.imageUrl, imageAlt: block.imageAlt, caption: block.caption.text };
}

test("Figure projection carries editable properties and its label", () => {
  const figure = blockAt(toTiptapDocument(loadEditableDocument(source)), FIGURE);
  assert.deepEqual(figure.attrs, { sourcePath: FIGURE, label: "fig-control", imageUrl: ORIGINAL.imageUrl, imageAlt: ORIGINAL.imageAlt, editable: true });
  assert.deepEqual(figure.content, [{ type: "text", text: ORIGINAL.caption }]);
  const readonly = toTiptapDocument(loadEditableDocument(":::{figure} ./a.png\n{u}`V`\n:::\n"));
  assert.equal(readonly.content?.[0]?.attrs?.editable, false);
});

test("image, alt text, caption and label are the editable Figure attributes", () => {
  const baseline = toTiptapDocument(loadEditableDocument(source));
  const changed = clone(baseline);
  setFigure(blockAt(changed, FIGURE), CHANGED);
  assert.doesNotThrow(() => assertSupportedDocumentChange(baseline, changed));
  assert.deepEqual(collectSupportedEdits(loadEditableDocument(source), changed).figures, [
    { path: [6], from: ORIGINAL, to: CHANGED },
  ]);

  const relabeled = clone(baseline);
  blockAt(relabeled, FIGURE).attrs!.label = "fig-other";
  assert.doesNotThrow(() => assertSupportedDocumentChange(baseline, relabeled));
  assert.deepEqual(collectSupportedEdits(loadEditableDocument(source), relabeled).labels, [
    { path: [6], from: "fig-control", to: "fig-other" },
  ]);
  for (const [key, value] of [["editable", false], ["sourcePath", "new:x"]] as const) {
    const identity = clone(baseline);
    blockAt(identity, FIGURE).attrs![key] = value;
    assert.throws(() => assertSupportedDocumentChange(baseline, identity), /figure identity|block deletion is not allowed/);
  }

  const readonlySource = ":::{figure} ./a.png\n{u}`V`\n:::\n";
  const readonly = toTiptapDocument(loadEditableDocument(readonlySource));
  const flattened = clone(readonly);
  flattened.content![0].attrs!.caption = "flattened";
  assert.throws(() => assertSupportedDocumentChange(readonly, flattened), /read-only block changed/);
});

test("Figure validity is enforced before Save and by the Core write path", () => {
  const editable = loadEditableDocument(source);
  for (const [change, message] of [
    // Removing an image that has alt text: a pending Figure has nothing for alt text to describe.
    [{ imageUrl: "" }, /without an image cannot have alt text/],
    [{ imageUrl: "./a.svg " }, /image URL cannot contain/],
    [{ imageAlt: " alt" }, /alt text cannot contain/],
  ] as const) {
    const next = toTiptapDocument(editable);
    Object.assign(blockAt(next, FIGURE).attrs!, change);
    assert.throws(() => collectSupportedEdits(editable, next), message);
  }
  let writes = 0;
  for (const to of [{ ...CHANGED, imageUrl: "" }, { ...CHANGED, caption: "% comment" }]) {
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
  const readonlySource = ":::{figure} ./a.png\n{u}`V`\n:::\n";
  assert.throws(() => commitDocumentSave(() => readonlySource, () => writes++, {
    revision: documentRevision(readonlySource),
    figures: [{ path: [0], from: { imageUrl: "./a.png", imageAlt: "", caption: "V" }, to: CHANGED }],
  }), /figure edit is not allowed/);
  assert.equal(writes, 0);
});

test("Figure edit survives Apply projection, reorder, Save and reload with its label", () => {
  const editable = loadEditableDocument(source);
  const projection = toTiptapDocument(editable);
  setFigure(blockAt(projection, FIGURE), CHANGED);
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
  setFigure(blockAt(cleared, FIGURE), { ...ORIGINAL, imageAlt: "", caption: "" });
  const clearedSave = saveEdits(source, collectSupportedEdits(editable, cleared));
  assert.deepEqual(figureOf(clearedSave.document, 6), { label: "fig-control", imageUrl: ORIGINAL.imageUrl, imageAlt: "", caption: "" });
});

test("new Figure inserts save and reload through Core semantics", () => {
  const editable = loadEditableDocument("Intro\n");
  const next = toTiptapDocument(editable);
  const figure = { imageUrl: "./plot.svg", imageAlt: "Plot", caption: "Measured plot." };
  next.content!.push(setFigure({ type: "figure", attrs: { sourcePath: "new:figure", label: "", editable: true } }, figure));
  const edits = collectSupportedEdits(editable, next);
  assert.deepEqual(edits.inserts, [{ block: "figure", ...figure }]);
  const saved = saveEdits("Intro\n", edits);
  assert.equal(saved.markdown, "Intro\n\n:::{figure} ./plot.svg\n:alt: Plot\n\nMeasured plot.\n:::\n");
  assert.deepEqual(figureOf(saved.document, 1), { label: "", ...figure });
  assert.deepEqual(figureOf(loadEditableDocument(saved.markdown), 1), { label: "", ...figure });

  // An unapplied transient Figure (as the insert command makes it) remains in the session, outside the applied save.
  const empty = toTiptapDocument(editable);
  empty.content!.push({ type: "figure", attrs: { sourcePath: "new:empty-figure", label: "", editable: true, imageUrl: "", imageAlt: "", caption: "", applied: false } });
  assert.doesNotThrow(() => assertSupportedDocumentChange(toTiptapDocument(editable), empty));
  assert.deepEqual(collectSupportedEdits(editable, empty), collectSupportedEdits(editable, toTiptapDocument(editable)));
  assert.throws(() => saveEdits("Intro\n", {
    inserts: [{ block: "figure", imageUrl: "", imageAlt: "", caption: "" }],
    order: [{ path: [0], part: 0 }, { insert: 0 }],
  }), /needs an image, a caption or a label/);

  // A new Figure can carry a label; persistent blocks cannot become Figures.
  const labeled = toTiptapDocument(editable);
  labeled.content!.push(setFigure({ type: "figure", attrs: { sourcePath: "new:labeled", label: "fig-x", editable: true } }, figure));
  const labeledEdits = collectSupportedEdits(editable, labeled);
  assert.deepEqual(labeledEdits.inserts, [{ block: "figure", ...figure, label: "fig-x" }]);
  assert.match(saveEdits("Intro\n", labeledEdits).markdown, /:::\{figure\} \.\/plot\.svg\n:name: fig-x\n/);
  const conversion = toTiptapDocument(editable);
  conversion.content![0] = setFigure({ type: "figure", attrs: { sourcePath: "0", label: "", editable: true } }, figure);
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
  inserted.content!.splice(1, 0, setFigure({ type: "figure", attrs: { sourcePath: "new:figure", label: "", editable: true } }, figure));
  const withInsert = saveEdits(source, collectSupportedEdits(editable, inserted));
  assert.deepEqual(figureOf(withInsert.document, 1), { label: "", ...figure });
  assert.deepEqual(figureOf(withInsert.document, 7), { label: "fig-control", ...ORIGINAL });
});

test("Figure draft state distinguishes applied content from unapplied input", () => {
  assert.equal(isUnappliedFigureDraft(false, CHANGED, ORIGINAL), false);
  assert.equal(isUnappliedFigureDraft(true, ORIGINAL, ORIGINAL), false);
  assert.equal(isUnappliedFigureDraft(true, { ...ORIGINAL, caption: "x" }, ORIGINAL), true);
  const empty = { imageUrl: "", imageAlt: "", caption: "" };
  // A new Figure stays a draft until its form is applied, even with no typed change.
  assert.equal(isUnappliedFigureDraft(true, empty, empty, false), true);
  assert.equal(isUnappliedFigureDraft(false, empty, empty, false), false);
  assert.equal(isUnappliedFigureDraft(true, CHANGED, CHANGED, false), true);
  // An applied pending Figure has no image and is not a draft.
  assert.equal(isUnappliedFigureDraft(true, { ...empty, caption: "Caption" }, { ...empty, caption: "Caption" }, true), false);

  const app = readFileSync(path.join(editorRoot, "src", "App.tsx"), "utf8");
  const documentEditor = readFileSync(path.join(editorRoot, "src", "DocumentEditor.tsx"), "utf8");
  assert.match(documentEditor, /activeFigureDrafts\.current\.size > 0/);
  const schemaSource = readFileSync(path.join(editorRoot, "src", "editor-schema.tsx"), "utf8");
  // Cancel removes only a never-applied transient Figure; Apply writes the validated draft.
  assert.match(schemaSource, /const neverApplied = node\.attrs\.applied === false;/);
  assert.match(schemaSource, /if \(neverApplied\) removeUnappliedBlock\(view, getPos, node, deleteNode\);/);
  // Apply commits only after Core's persistent validation through the Host accepts the value.
  assert.match(schemaSource, /message = await validateFigure!\(candidate, nextLabel\);[\s\S]*if \(message\) \{\s*setError\(message\);\s*return;\s*\}[\s\S]*label: nextLabel, applied: true \}[\s\S]*view\.dispatch\(closeHistory\(view\.state\.tr\.replaceWith/);
  assert.match(app, /fetch\(`\$\{import\.meta\.env\?\.BASE_URL \?\? "\/"\}api\/figure-validation`/);
  assert.match(app, /validateFigure=\{validateFigure\}/);
});

test("the Host Figure validation endpoint returns Core's persistent validation", () => {
  assert.equal(validateFigureRequest(CHANGED), undefined);
  assert.match(validateFigureRequest({ ...CHANGED, caption: "% comment" }) ?? "", /canonical round-trip|not canonical/);
  assert.match(validateFigureRequest({ ...CHANGED, imageUrl: "" }) ?? "", /without an image cannot have alt text/);
  // A pending Figure Apply is valid with a label, a caption, or both, and only then.
  const pending = { imageUrl: "", imageAlt: "", caption: "" };
  assert.match(validateFigureRequest(pending) ?? "", /needs an image, a caption or a label/);
  assert.equal(validateFigureRequest({ ...pending, label: "fig-pfc-control" }), undefined);
  assert.equal(validateFigureRequest({ ...pending, caption: "PFC Current Control Architecture" }), undefined);
  assert.match(validateFigureRequest({ ...pending, label: "fig pfc " }) ?? "", /leading or trailing spaces/);
  assert.throws(() => validateFigureRequest({ ...pending, label: 1 } as never), /label must be a string/);
  assert.throws(() => validateFigureRequest({ imageUrl: "./a.svg" } as never), /must be strings/);
  // The same value is rejected by the Save path, so Apply and Save agree.
  assert.throws(() => saveEdits(source, {
    figures: [{ path: [6], from: ORIGINAL, to: { ...CHANGED, caption: "% comment" } }],
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
  const changed = schema.nodeFromJSON(setFigure(figure.toJSON() as TiptapJSON, CHANGED));
  state = state.apply(state.tr.replaceWith(position, position + figure.nodeSize, changed));
  assert.equal(state.doc.nodeAt(position)?.textContent, CHANGED.caption);
  const identityTr = state.tr.setNodeMarkup(position, undefined, { ...state.doc.nodeAt(position)!.attrs, editable: false });
  assert.equal(state.apply(identityTr).doc, state.doc);
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

const DRAFT_SOURCE = "Intro\n\nThe controller structure is shown in [](#fig-pfc-control).\n";
const PENDING_MARKDOWN = "Intro\n\n:::{figure}\n:name: fig-pfc-control\n\nPFC Current Control Architecture\n:::\n\n" +
  "The controller structure is shown in [](#fig-pfc-control).\n";

function editorState(markdown: string) {
  const schema = getSchema(editorExtensions());
  const baseline = toTiptapDocument(loadEditableDocument(markdown));
  let rejected = 0;
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline), plugins: [history(), structureGuardPlugin(baseline, () => rejected++)] });
  return { state, rejected: () => rejected };
}

function figurePosition(state: EditorState): number {
  let position = -1;
  state.doc.forEach((node, pos) => { if (node.type.name === "figure") position = pos; });
  assert.notEqual(position, -1);
  return position;
}

/** The transaction Figure Apply dispatches: the validated values and the applied session state. */
function applyFigure(state: EditorState, figure: FigureContent, label: string): EditorState {
  const position = figurePosition(state);
  const node = state.doc.nodeAt(position)!;
  const { caption, ...attributes } = figure;
  const content = state.schema.nodeFromJSON({ type: "figure", content: paragraphContent(typeof caption === "string" && caption ? [{ kind: "text", text: caption }] : []) }).content;
  return state.apply(closeHistory(state.tr.replaceWith(position, position + node.nodeSize, node.type.create({ ...node.attrs, ...attributes, label, applied: true }, content))));
}

const step = (state: EditorState, command: typeof undo) => {
  let next = state;
  assert.equal(command(state, transaction => { next = state.apply(transaction); }), true);
  return next;
};

test("an applied pending Figure is saved; the transient Figure before Apply is not, through undo and redo", () => {
  const editable = loadEditableDocument(DRAFT_SOURCE);
  let { state } = editorState(DRAFT_SOURCE);
  const opening = editorDocumentJSON(state);
  state = state.apply(insertFigureAfter(state, 0));
  const transient = state.doc.nodeAt(figurePosition(state))!.toJSON() as TiptapJSON;
  assert.equal(transient.attrs?.applied, false);
  assert.equal(isSessionPlaceholder(transient), true);
  const nothing = collectSupportedEdits(editable, editorDocumentJSON(state));
  assert.equal(nothing.inserts, undefined);
  // Dirty comparison reads the same rule: the transient Figure leaves the applied document unchanged.
  assert.deepEqual(appliedDocument(editorDocumentJSON(state)).content, appliedDocument(opening).content);

  const pending = { imageUrl: "", imageAlt: "", caption: "PFC Current Control Architecture" };
  state = applyFigure(state, pending, "fig-pfc-control");
  const edits = collectSupportedEdits(editable, editorDocumentJSON(state));
  assert.deepEqual(edits.inserts, [{ block: "figure", ...pending, label: "fig-pfc-control" }]);
  const saved = saveEdits(DRAFT_SOURCE, edits);
  assert.equal(saved.markdown, PENDING_MARKDOWN);
  const reloaded = figureOf(loadEditableDocument(saved.markdown), 1);
  assert.deepEqual(reloaded, { label: "fig-pfc-control", ...pending });

  // Undo returns the transient Figure and an empty payload; redo the applied one and the same payload.
  state = step(state, undo);
  assert.equal(state.doc.nodeAt(figurePosition(state))!.attrs.applied, false);
  assert.equal(collectSupportedEdits(editable, editorDocumentJSON(state)).inserts, undefined);
  state = step(state, redo);
  assert.deepEqual(collectSupportedEdits(editable, editorDocumentJSON(state)), edits);

  // A label alone, or a caption alone, is an Apply that saves.
  for (const [figure, label, markdown] of [
    [{ ...pending, caption: "" }, "fig-pfc-control", "Intro\n\n:::{figure}\n:name: fig-pfc-control\n:::\n\nThe controller structure is shown in [](#fig-pfc-control).\n"],
    [pending, "", "Intro\n\n:::{figure}\n\nPFC Current Control Architecture\n:::\n\nThe controller structure is shown in [](#fig-pfc-control).\n"],
  ] as const) {
    let single = editorState(DRAFT_SOURCE).state;
    single = applyFigure(single.apply(insertFigureAfter(single, 0)), figure, label);
    assert.equal(saveEdits(DRAFT_SOURCE, collectSupportedEdits(editable, editorDocumentJSON(single))).markdown, markdown);
  }
});

test("a reopened pending Figure connects and removes an image, and its deletion undoes", () => {
  const editable = loadEditableDocument(PENDING_MARKDOWN);
  const figure = toTiptapDocument(editable).content![1];
  assert.deepEqual([figure.attrs?.imageUrl, figure.attrs?.label, figure.attrs?.editable], ["", "fig-pfc-control", true]);
  assert.equal(isSessionPlaceholder(figure), false);
  const opened = editorState(PENDING_MARKDOWN);
  let state = opened.state;
  const position = figurePosition(state);
  const connect = (current: EditorState, imageUrl: string, imageAlt: string) =>
    current.apply(current.tr.setNodeMarkup(position, undefined, { ...current.doc.nodeAt(position)!.attrs, imageUrl, imageAlt }));
  state = connect(state, "./pfc-control.svg", "PFC current control diagram");
  const connected = saveEdits(PENDING_MARKDOWN, collectSupportedEdits(editable, editorDocumentJSON(state)));
  assert.equal(connected.markdown, "Intro\n\n:::{figure} ./pfc-control.svg\n:name: fig-pfc-control\n:alt: PFC current control diagram\n\n" +
    "PFC Current Control Architecture\n:::\n\nThe controller structure is shown in [](#fig-pfc-control).\n");
  const imageEditable = loadEditableDocument(connected.markdown);
  let removed = editorState(connected.markdown).state;
  removed = connect(removed, "", "");
  assert.equal(saveEdits(connected.markdown, collectSupportedEdits(imageEditable, editorDocumentJSON(removed))).markdown, PENDING_MARKDOWN);

  state = state.apply(deleteBlock(state, 1));
  assert.equal(saveEdits(PENDING_MARKDOWN, collectSupportedEdits(editable, editorDocumentJSON(state))).markdown,
    "Intro\n\nThe controller structure is shown in [](#fig-pfc-control).\n");
  state = step(state, undo);
  const restored = state.doc.nodeAt(position)!;
  assert.deepEqual([restored.attrs.label, restored.attrs.imageUrl, restored.textContent], ["fig-pfc-control", "./pfc-control.svg", "PFC Current Control Architecture"]);
  assert.equal(opened.rejected(), 0);
  // Host replay clears changed labels before reassigning them in one Save. A
  // temporary empty label-only Figure must not block a valid atomic label swap.
  const labelOnlySource = ":::{figure}\n:name: fig-a\n:::\n\n:::{figure}\n:name: fig-b\n:::\n";
  const swapped = saveEdits(labelOnlySource, { labels: [
    { path: [0], from: "fig-a", to: "fig-b" }, { path: [1], from: "fig-b", to: "fig-a" },
  ] });
  assert.equal(swapped.markdown, ":::{figure}\n:name: fig-b\n:::\n\n:::{figure}\n:name: fig-a\n:::\n");
  assert.throws(() => saveEdits(labelOnlySource, { labels: [{ path: [0], from: "fig-a", to: "" }] }), /needs an image, a caption or a label/);
});

test("a Figure inserted with an image file is applied at once and saved", () => {
  const editable = loadEditableDocument("Intro\n");
  let { state } = editorState("Intro\n");
  state = state.apply(insertFigureAfter(state, 0, undefined, { imageUrl: "./pasted.png", imageAlt: "" }));
  const node = state.doc.nodeAt(figurePosition(state))!.toJSON() as TiptapJSON;
  assert.equal(node.attrs?.applied, true);
  assert.equal(isSessionPlaceholder(node), false);
  assert.equal(saveEdits("Intro\n", collectSupportedEdits(editable, editorDocumentJSON(state))).markdown, "Intro\n\n:::{figure} ./pasted.png\n:::\n");
});
