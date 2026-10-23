import { nativeSource } from "./helpers/document.ts";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse, serialize, type EditableDocument } from "@ieumdoc/core";
import { collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { loadDocumentFile, previewDocumentFile, saveDocumentFile } from "../server/document-api.ts";
import { loadEditableDocument } from "./helpers/document.ts";
import { saveEdits } from "../server/document-replay.ts";
import { saveErrorMessage } from "../src/save-error.ts";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import { editorExtensions, editorDocumentJSON, structureGuardPlugin } from "../src/editor-schema.tsx";
import { updateLabelProperties } from "../src/label-rename.ts";
import { updateFigure } from "../src/block-commands.ts";

test("property Apply collects final references once, preserves them through replay and undoes atomically", () => {
  const source = nativeSource("# Rename\n\nSee **{eq}`eq-a`**, {numref}`tbl-a`, {numref}`fig-a`, {ref}`sec-a` and [detail](#eq-a).\n\n" +
    "```{math}\n:label: eq-a\nx\n```\n\n" +
    ":::{figure}\n:name: fig-a\n\nCaption {eq}`eq-a`.\n:::\n\n" +
    ":::{table} **Caption {eq}`eq-a`** and [detail](#eq-a)\n:name: tbl-a\n\n| Head |\n| --- |\n| {eq}`eq-a` |\n:::\n\n" +
    "- Item {eq}`eq-a`\n\n> Quote {eq}`eq-a`.\n\n(sec-a)=\n\n## Section\n\nOther [file](other.md#eq-a).\n");
  const model = loadEditableDocument(source);
  const baseline = toTiptapDocument(model);
  const schema = getSchema(editorExtensions());
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline),
    plugins: [history(), structureGuardPlugin(baseline, reason => assert.fail(JSON.stringify(reason)))] });
  const position = (type: string) => { let result = -1; state.doc.forEach((node, pos) => { if (node.type.name === type) result = pos; }); return result; };
  const dispatch = (tr: Parameters<typeof state.apply>[0]) => { state = state.apply(tr); };
  for (const [type, from] of [["equation", "eq-a"], ["figure", "fig-a"], ["table", "tbl-a"], ["labelTarget", "sec-a"]]) {
    const before = state.doc;
    const pos = position(type);
    const attrs = { label: `${from}-new` };
    const caption = type === "figure" ? state.doc.nodeAt(pos)!.content.append(schema.nodeFromJSON({ type: "paragraph", content: [
      { type: "text", text: " Self " }, { type: "crossReference", attrs: { role: "numref", label: from } },
    ] }).content) : undefined;
    dispatch(type === "figure" ? updateFigure(state, pos, attrs, caption)
      : updateLabelProperties(state, pos, attrs));
    const after = state.doc;
    assert(undo(state, dispatch));
    assert(state.doc.eq(before), `${type} undo must restore labels, references and properties together`);
    assert(redo(state, dispatch));
    assert(state.doc.eq(after));
  }
  const edits = collectSupportedEdits(model, editorDocumentJSON(state));
  const saved = saveEdits(source, edits).markdown;
  assert.match(saved, /\*\*\{eq\}`eq-a-new`\*\*/);
  assert.match(saved, /Caption \{eq\}`eq-a-new`/);
  assert.match(saved, /Self \{numref\}`fig-a-new`/);
  assert.match(saved, /\[detail\]\(#eq-a-new\)/);
  assert.match(saved, /\{numref\}`tbl-a-new`, \{numref\}`fig-a-new`, \{ref\}`sec-a-new`/);
  assert.match(saved, /Item \{eq\}`eq-a-new`/);
  assert.match(saved, /Quote \{eq\}`eq-a-new`/);
  assert.match(saved, /other.md#eq-a/);
  assert(state.doc.eq(schema.nodeFromJSON(toTiptapDocument(loadEditableDocument(saved)))), "Reload must reproduce the applied editor document");
  const beforeConflict = state.doc;
  assert.throws(() => updateLabelProperties(state, position("equation"), { label: "tbl-a-new" }), /already names another target/);
  assert(state.doc.eq(beforeConflict));
  // A later manual reference to the old label must remain as written; Host replay must not
  // infer another rename from the final label delta. A second rename also uses live labels.
  dispatch(updateLabelProperties(state, position("equation"), { label: "eq-final" }));
  let referencePos = -1;
  state.doc.descendants((node, pos) => { if (referencePos < 0 && node.type.name === "crossReference") referencePos = pos; });
  dispatch(state.tr.setNodeMarkup(referencePos, undefined, { role: "eq", label: "eq-a" }));
  const final = saveEdits(source, collectSupportedEdits(model, editorDocumentJSON(state))).markdown;
  assert.match(final, /See \*\*\{eq\}`eq-a`\*\*/);
  assert.match(final, /Caption \{eq\}`eq-final`/);
  dispatch(updateLabelProperties(state, position("equation"), { label: "" }));
  const cleared = saveEdits(source, collectSupportedEdits(model, editorDocumentJSON(state))).markdown;
  assert(!cleared.includes(":label: eq-final"));
  assert.match(cleared, /Caption \{eq\}`eq-final`/);
});

const source = nativeSource(readFileSync(
  fileURLToPath(new URL("../../../packages/core/test/fixtures/technical-document.md", import.meta.url)),
  "utf8",
));
const canonical = serialize(parse(source));
const FIGURE = "7";
const EQUATION = "10";
const LATEX = String.raw`i^{\ast} = \frac{P^{\ast}}{V_{\mathrm{rms}}}`;

/** Explicit label-only payloads: the Host must preserve the caller's final reference content. */
function relabel(labels: Record<string, string>): { editable: EditableDocument; next: TiptapJSON } {
  const editable = loadEditableDocument(source);
  const next = toTiptapDocument(editable);
  for (const node of next.content ?? []) {
    const key = String(node.attrs?.sourcePath);
    if (key in labels) node.attrs = { ...node.attrs, label: labels[key] };
  }
  return { editable, next };
}

function labels(document: EditableDocument) {
  return document.blocks.flatMap((block) =>
    block.block === "equation" ? [["equation", block.label, block.latex]]
    : block.block === "figure" ? [["figure", block.label, block.imageUrl, block.imageAlt, block.caption.text]] : []);
}

test("Host label-only payloads preserve final reference content without another rewrite", () => {
  const { editable, next } = relabel({ [EQUATION]: "eq-reference", [FIGURE]: "fig-diagram" });
  const edits = collectSupportedEdits(editable, next);
  assert.deepEqual(edits.labels, [
    { path: [7], from: "fig-control", to: "fig-diagram" },
    { path: [10], from: "eq-current", to: "eq-reference" },
  ]);
  const saved = saveEdits(source, edits);
  assert.equal(saved.markdown, canonical
    .replace(":name: fig-control\n", ":name: fig-diagram\n")
    .replace(":label: eq-current\n", ":label: eq-reference\n"));
  assert.deepEqual(labels(loadEditableDocument(saved.markdown)), [
    ["figure", "fig-diagram", "./diagram.svg", "Control block diagram", "Control block diagram of the grid-connected converter."],
    ["equation", "eq-reference", LATEX],
  ]);
  // References keep their written target; they are not renamed.
  assert.match(saved.markdown, /See \[Figure\]\(#fig-control\) and \{eq\}`eq-current`\./);

  const removed = saveEdits(source, collectSupportedEdits(...Object.values(relabel({ [EQUATION]: "", [FIGURE]: "" })) as [EditableDocument, TiptapJSON]));
  assert.equal(removed.markdown, canonical.replace(":name: fig-control\n", "").replace(":label: eq-current\n\n", ""));
  assert.deepEqual(labels(loadEditableDocument(removed.markdown)).map((block) => block[1]), ["", ""]);
});

test("labels can move between blocks in one Save, but duplicates are rejected", () => {
  const swapped = relabel({ [EQUATION]: "fig-control", [FIGURE]: "eq-current" });
  const saved = saveEdits(source, collectSupportedEdits(swapped.editable, swapped.next));
  assert.deepEqual(labels(loadEditableDocument(saved.markdown)).map((block) => block[1]), ["eq-current", "fig-control"]);

  const duplicate = relabel({ [EQUATION]: "FIG-Control" });
  assert.throws(() => saveEdits(source, collectSupportedEdits(duplicate.editable, duplicate.next)), /already names another target/);
  const both = relabel({ [EQUATION]: "eq-x", [FIGURE]: "eq-x" });
  assert.throws(() => saveEdits(source, collectSupportedEdits(both.editable, both.next)), /already names another target/);
});

test("new Equation and Figure blocks save their labels", () => {
  const editable = loadEditableDocument(nativeSource("Intro.\n"));
  const next = toTiptapDocument(editable);
  next.content!.push(
    { type: "equation", attrs: { sourcePath: "new:eq", latex: "x", label: "eq-new" } },
    { type: "figure", attrs: { sourcePath: "new:fig", editable: true, label: "fig-new", imageUrl: "./a.svg", imageAlt: "" }, content: [{ type: "text", text: "A." }] },
  );
  const edits = collectSupportedEdits(editable, next);
  assert.deepEqual(edits.inserts, [
    { block: "equation", latex: "x", label: "eq-new" },
    { block: "figure", imageUrl: "./a.svg", imageAlt: "", caption: "A.", label: "fig-new" },
  ]);
  assert.equal(saveEdits(nativeSource("Intro.\n"), edits).markdown,
    nativeSource("Intro.\n\n```{math}\n:label: eq-new\n\nx\n```\n\n:::{figure} ./a.svg\n:name: fig-new\n\nA.\n:::\n"));
  next.content![2].attrs!.label = "EQ-NEW";
  assert.throws(() => saveEdits(nativeSource("Intro.\n"), collectSupportedEdits(editable, next)), /already names another target/);
});

test("Source preview shows unsaved label edits; rejected labels fail closed before any write", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-label-"));
  const file = path.join(dir, "technical-document.md");
  try {
    writeFileSync(file, source);
    const { revision } = loadDocumentFile(file);
    const rename = relabel({ [EQUATION]: "eq-reference" });
    const request = { revision, ...collectSupportedEdits(rename.editable, rename.next) };
    const preview = previewDocumentFile(file, request).markdown;
    assert.match(preview, /:label: eq-reference\n/);
    assert.equal(readFileSync(file, "utf8"), source);
    assert.equal(saveDocumentFile(file, request).markdown, preview);
    assert.equal(readFileSync(file, "utf8"), preview);

    const saved = readFileSync(file, "utf8");
    const current = loadDocumentFile(file);
    const at = (kind: string) => current.document.blocks.find((block) => block.block === kind)!;
    for (const [edit, reason] of [
      [{ path: at("equation").path, from: "eq-reference", to: "fig-control" }, /already names another target/],
      [{ path: at("equation").path, from: "eq-reference", to: "converter-control" }, /including implicit heading IDs/],
      [{ path: at("equation").path, from: "eq-reference", to: "eq<a>" }, /cannot be referenced/],
      [{ path: at("equation").path, from: "eq-reference", to: " eq" }, /leading or trailing spaces/],
      [{ path: at("equation").path, from: "stale", to: "eq-a" }, /label does not match/],
      [{ path: [1], from: "", to: "h" }, /label edit is not allowed/],
    ] as const) {
      const bad = { revision: current.revision, labels: [edit] };
      assert.throws(() => previewDocumentFile(file, bad), reason);
      assert.throws(() => saveDocumentFile(file, bad), error => {
        assert.match(saveErrorMessage(error), reason);
        return true;
      });
      assert.equal(readFileSync(file, "utf8"), saved);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
