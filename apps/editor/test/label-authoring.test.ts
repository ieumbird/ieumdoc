import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse, serialize, type EditableDocument } from "@ieumdoc/core";
import { collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import {
  loadDocumentFile,
  loadEditableDocument,
  previewDocumentFile,
  saveDocumentFile,
  saveEdits,
} from "../server/document-api.ts";

const source = readFileSync(
  fileURLToPath(new URL("../../../packages/core/test/fixtures/technical-document.md", import.meta.url)),
  "utf8",
);
const canonical = serialize(parse(source));
const FIGURE = "6";
const EQUATION = "9";
const LATEX = String.raw`i^{\ast} = \frac{P^{\ast}}{V_{\mathrm{rms}}}`;

/** Label edits made in the editor document, as the Editor would submit them. */
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

test("Equation and Figure labels change through Save; content and every other line are kept", () => {
  const { editable, next } = relabel({ [EQUATION]: "eq-reference", [FIGURE]: "fig-diagram" });
  const edits = collectSupportedEdits(editable, next);
  assert.deepEqual(edits.labels, [
    { path: [6], from: "fig-control", to: "fig-diagram" },
    { path: [9], from: "eq-current", to: "eq-reference" },
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
  assert.match(saved.markdown, /See \[\]\(#fig-control\) and \{eq\}`eq-current`\./);

  const removed = saveEdits(source, collectSupportedEdits(...Object.values(relabel({ [EQUATION]: "", [FIGURE]: "" })) as [EditableDocument, TiptapJSON]));
  assert.equal(removed.markdown, canonical.replace(":name: fig-control\n", "").replace(":label: eq-current\n\n", ""));
  assert.deepEqual(labels(removed.document).map((block) => block[1]), ["", ""]);
});

test("labels can move between blocks in one Save, but duplicates are rejected", () => {
  const swapped = relabel({ [EQUATION]: "fig-control", [FIGURE]: "eq-current" });
  const saved = saveEdits(source, collectSupportedEdits(swapped.editable, swapped.next));
  assert.deepEqual(labels(saved.document).map((block) => block[1]), ["eq-current", "fig-control"]);

  const duplicate = relabel({ [EQUATION]: "FIG-Control" });
  assert.throws(() => saveEdits(source, collectSupportedEdits(duplicate.editable, duplicate.next)), /already names another target/);
  const both = relabel({ [EQUATION]: "eq-x", [FIGURE]: "eq-x" });
  assert.throws(() => saveEdits(source, collectSupportedEdits(both.editable, both.next)), /already names another target/);
});

test("new Equation and Figure blocks save their labels", () => {
  const editable = loadEditableDocument("Intro.\n");
  const next = toTiptapDocument(editable);
  next.content!.push(
    { type: "equation", attrs: { sourcePath: "new:eq", latex: "x", label: "eq-new" } },
    { type: "figure", attrs: { sourcePath: "new:fig", editable: true, label: "fig-new", imageUrl: "./a.svg", imageAlt: "", caption: "A." } },
  );
  const edits = collectSupportedEdits(editable, next);
  assert.deepEqual(edits.inserts, [
    { block: "equation", latex: "x", label: "eq-new" },
    { block: "figure", imageUrl: "./a.svg", imageAlt: "", caption: "A.", label: "fig-new" },
  ]);
  assert.equal(saveEdits("Intro.\n", edits).markdown,
    "Intro.\n\n```{math}\n:label: eq-new\n\nx\n```\n\n:::{figure} ./a.svg\n:name: fig-new\n\nA.\n:::\n");
  next.content![2].attrs!.label = "EQ-NEW";
  assert.throws(() => saveEdits("Intro.\n", collectSupportedEdits(editable, next)), /already names another target/);
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
      [{ path: at("equation").path, from: "eq-reference", to: "eq<a>" }, /cannot be referenced/],
      [{ path: at("equation").path, from: "eq-reference", to: " eq" }, /leading or trailing spaces/],
      [{ path: at("equation").path, from: "stale", to: "eq-a" }, /label does not match/],
      [{ path: [0], from: "", to: "h" }, /label edit is not allowed/],
    ] as const) {
      const bad = { revision: current.revision, labels: [edit] };
      assert.throws(() => previewDocumentFile(file, bad), reason);
      assert.throws(() => saveDocumentFile(file, bad), reason);
      assert.equal(readFileSync(file, "utf8"), saved);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a read-only Figure keeps its label", () => {
  const readonlySource = ":::{figure} ./a.png\n:name: fig-a\n\n**bold caption**\n:::\n";
  const editable = loadEditableDocument(readonlySource);
  const next = toTiptapDocument(editable);
  next.content![0].attrs!.label = "fig-b";
  assert.throws(() => collectSupportedEdits(editable, next), /read-only block changed/);
  assert.throws(() => saveEdits(readonlySource, { labels: [{ path: [0], from: "fig-a", to: "fig-b" }] }), /label edit is not allowed/);
});
