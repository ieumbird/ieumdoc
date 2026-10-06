import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { addSectionLabel, isResolved, newSectionLabel, referenceCommandItems, referenceOfCommand, referenceTargets } from "../src/cross-reference.tsx";
import { editorDocumentJSON, editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { fromTiptapContent } from "../src/tiptap-inline.ts";
import {
  loadDocumentFile,
  loadEditableDocument,
  previewDocumentFile,
  saveDocumentFile,
  saveEdits,
} from "../server/document-api.ts";

const source = [
  "# Refs",
  "See {eq}`eq-a` and **{numref}`fig-a`** or [details](#eq-a) with $x$.",
  "See {eq}`missing` here.",
  "```{math}\n:label: eq-a\na\n```",
  ":::{figure} ./d.svg\n:name: fig-a\n:::",
].join("\n\n") + "\n";
const REFERENCES = "1";

function clone(value: TiptapJSON): TiptapJSON {
  return JSON.parse(JSON.stringify(value)) as TiptapJSON;
}

function blockAt(doc: TiptapJSON, sourcePath: string): TiptapJSON {
  const block = doc.content?.find((node) => node.attrs?.sourcePath === sourcePath);
  assert.ok(block, sourcePath);
  return block;
}

/** Save an editor document through the Host's Core path and return the Markdown. */
function save(next: TiptapJSON): string {
  return saveEdits(source, collectSupportedEdits(loadEditableDocument(source), next)).markdown;
}

test("paragraphs with {eq} and {numref} references project to editable paragraphs", () => {
  const projection = toTiptapDocument(loadEditableDocument(source));
  const paragraph = blockAt(projection, REFERENCES);
  assert.equal(paragraph.type, "paragraph");
  assert.deepEqual(paragraph.content?.filter((node) => node.type === "crossReference"), [
    { type: "crossReference", attrs: { role: "eq", label: "eq-a" } },
    { type: "crossReference", attrs: { role: "numref", label: "fig-a" }, marks: [{ type: "bold" }] },
  ]);
  // The ordinary fragment link stays a link mark on text.
  assert.deepEqual(paragraph.content?.find((node) => node.text === "details")?.marks,
    [{ type: "link", attrs: { href: "#eq-a", title: null } }]);
  assert.equal(blockAt(projection, "2").type, "paragraph");
  const schema = getSchema(editorExtensions());
  const node = schema.nodeFromJSON(projection);
  assert.deepEqual(schema.nodeFromJSON(node.toJSON()).toJSON(), node.toJSON());
  // An unchanged document sends no edit.
  assert.deepEqual(collectSupportedEdits(loadEditableDocument(source), projection).paragraphs, []);
});

test("references can be inserted, retargeted and removed, and text around them edited", () => {
  const base = toTiptapDocument(loadEditableDocument(source));
  const inserted = clone(base);
  blockAt(inserted, "2").content = [
    { type: "text", text: "See " },
    { type: "crossReference", attrs: { role: "numref", label: "fig-a" } },
    { type: "text", text: " and " },
    { type: "crossReference", attrs: { role: "eq", label: "eq-a" }, marks: [{ type: "italic" }] },
    { type: "text", text: " here." },
  ];
  assert.match(save(inserted), /^See \{numref\}`fig-a` and \*\{eq\}`eq-a`\* here\.$/m);

  const retargeted = clone(base);
  blockAt(retargeted, REFERENCES).content![1] = { type: "crossReference", attrs: { role: "numref", label: "fig-a" } };
  assert.match(save(retargeted), /^See \{numref\}`fig-a` and \*\*\{numref\}`fig-a`\*\* or \[details\]\(#eq-a\) with \$x\$\.$/m);

  const removed = clone(base);
  blockAt(removed, REFERENCES).content![1] = { type: "text", text: "eq-a" };
  assert.match(save(removed), /^See eq-a and \*\*\{numref\}`fig-a`\*\* or \[details\]\(#eq-a\) with \$x\$\.$/m);

  const surrounding = clone(base);
  blockAt(surrounding, REFERENCES).content![0] = { type: "text", text: "Compare " };
  const markdown = save(surrounding);
  assert.match(markdown, /^Compare \{eq\}`eq-a` and \*\*\{numref\}`fig-a`\*\* or \[details\]\(#eq-a\) with \$x\$\.$/m);
// Other blocks and labels are unchanged.
  assert.match(markdown, /```\{math\}\n:label: eq-a\n\na\n```/);
  assert.match(markdown, /:::\{figure\} \.\/d\.svg\n:name: fig-a\n:::/);
  assert.match(markdown, /^See \{eq\}`missing` here\.$/m);
});

test("ordinary fragment links and semantic references never convert into each other", () => {
  const base = toTiptapDocument(loadEditableDocument(source));
  const edited = clone(base);
  blockAt(edited, REFERENCES).content!.push({ type: "text", text: "!" });
  const reloaded = toTiptapDocument(loadEditableDocument(save(edited)));
  const paragraph = blockAt(reloaded, REFERENCES).content!;
  assert.deepEqual(paragraph.filter((node) => node.type === "crossReference").map((node) => node.attrs?.label), ["eq-a", "fig-a"]);
  assert.deepEqual(paragraph.find((node) => node.text === "details")?.marks,
    [{ type: "link", attrs: { href: "#eq-a", title: null } }]);
  // A reference can never carry a link mark.
  assert.throws(() => fromTiptapContent({ type: "doc", content: [{ type: "paragraph", content: [
    { type: "crossReference", attrs: { role: "eq", label: "eq-a" }, marks: [{ type: "link", attrs: { href: "#eq-a" } }] },
  ] }] }), /cannot be inside a link/);
  assert.throws(() => fromTiptapContent({ type: "doc", content: [{ type: "paragraph", content: [
    { type: "crossReference", attrs: { role: "cite", label: "sec-a" } },
  ] }] }), /eq, numref or ref role/);
});

test("targets come from applied Equation and Figure labels; resolution follows MyST label keys", () => {
  const schema = getSchema(editorExtensions());
  const projection = toTiptapDocument(loadEditableDocument(source));
  const doc = schema.nodeFromJSON(projection);
  const targets = referenceTargets(doc);
  assert.deepEqual(targets, [{ role: "eq", label: "eq-a", number: 1 }, { role: "numref", label: "fig-a", number: 1 }]);
  // Numbers follow the engine document: an Equation added before is counted at once.
  const added = clone(projection);
  added.content!.unshift({ type: "equation", attrs: { sourcePath: "new:engine:1", latex: "x", label: "" } });
  assert.equal(referenceTargets(schema.nodeFromJSON(added))[0]?.number, 2);
  assert.equal(isResolved(targets, "eq", "eq-a"), true);
  assert.equal(isResolved(targets, "eq", "EQ-A"), true);
  assert.equal(isResolved(targets, "eq", "missing"), false);
  assert.equal(isResolved(targets, "eq", "fig-a"), false);
  assert.equal(isResolved(targets, "numref", "fig-a"), true);
  // An unsaved label change is reflected at once.
  const relabeled = clone(projection);
  blockAt(relabeled, "3").attrs!.label = "eq-b";
  assert.equal(isResolved(referenceTargets(schema.nodeFromJSON(relabeled)), "eq", "eq-a"), false);
  // Slash items insert a reference to each matching target, then label and reference a heading.
  assert.deepEqual(referenceCommandItems(doc, "fig").map((item) => item.label), ["Figure reference: fig-a"]);
  // "ref" also matches the heading "Refs".
  assert.deepEqual(referenceCommandItems(doc, "ref").map((item) => referenceOfCommand(item.id)),
    [...targets.map(({ role, label }) => ({ role, label })), { heading: 0, title: "" }]);
  // Unlabeled headings are listed only for a search that names sections or their words.
  assert.equal(referenceCommandItems(doc, "").length, targets.length);
  assert.deepEqual(referenceCommandItems(doc, "heading").map((item) => item.label), ["Section reference: Refs"]);
});

test("unresolved references save unchanged; Source preview shows unsaved reference edits and matches Save", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-xref-"));
  const file = path.join(dir, "refs.md");
  try {
    writeFileSync(file, source);
    const loaded = loadDocumentFile(file);
    const next = toTiptapDocument(loaded.document);
    blockAt(next, "2").content = [
      { type: "text", text: "See " },
      { type: "crossReference", attrs: { role: "eq", label: "missing" } },
      { type: "text", text: " and " },
      { type: "crossReference", attrs: { role: "numref", label: "fig-a" } },
      { type: "text", text: " here." },
    ];
    const request = { revision: loaded.revision, ...collectSupportedEdits(loaded.document, next) };
    const preview = previewDocumentFile(file, request).markdown;
    assert.match(preview, /^See \{eq\}`missing` and \{numref\}`fig-a` here\.$/m);
    assert.equal(readFileSync(file, "utf8"), source);
    assert.equal(saveDocumentFile(file, request).markdown, preview);
    assert.equal(readFileSync(file, "utf8"), preview);
    const reloaded = loadDocumentFile(file).document.blocks[2];
    assert.ok(reloaded.block === "paragraph");
    assert.deepEqual(reloaded.content.filter((item) => item.kind === "reference"),
      [{ kind: "reference", role: "eq", label: "missing" }, { kind: "reference", role: "numref", label: "fig-a" }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("references outside the v1 subset keep their paragraph read-only", () => {
  for (const markdown of ["See {numref}`Figure %s <fig-a>`.", "See {ref}`Section A <sec-a>`.", "[{eq}`eq-a`](https://x.example)"]) {
    assert.equal(toTiptapDocument(loadEditableDocument(`${markdown}\n`)).content![0].type, "readonlyParagraph", markdown);
  }
});

test("a section label and a {ref} to its heading save through Core, and renaming the label saves", () => {
  const markdown = "# Title\n\n## Intro\n\nSee the intro.\n\n## 개요\n";
  const editable = loadEditableDocument(markdown);
  const baseline = toTiptapDocument(editable);
  const schema = getSchema(editorExtensions());
  let rejected = 0;
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline), plugins: [structureGuardPlugin(baseline, () => rejected++)] });
  // MyST reads only ASCII target labels: a heading without an ASCII slug gets a numbered one.
  assert.equal(newSectionLabel(state.doc, 1), "sec-intro");
  assert.equal(newSectionLabel(state.doc, 3), "sec-1");
  state = state.apply(addSectionLabel(state, 1));
  assert.equal(newSectionLabel(state.doc, 2), "sec-intro-2");
  const paragraph = state.doc.child(3);
  let at = 0;
  for (let index = 0; index < 3; index++) at += state.doc.child(index).nodeSize;
  state = state.apply(state.tr.insert(at + paragraph.nodeSize - 1, schema.nodes.crossReference.create({ role: "ref", label: "sec-intro" })));
  assert.deepEqual(referenceTargets(state.doc), [{ role: "ref", label: "sec-intro", title: "Intro" }]);
  assert.equal(rejected, 0);
  const saved = saveEdits(markdown, collectSupportedEdits(editable, editorDocumentJSON(state))).markdown;
  assert.equal(saved, "# Title\n\n(sec-intro)=\n\n## Intro\n\nSee the intro.{ref}`sec-intro`\n\n## 개요\n");

  const reopened = loadEditableDocument(saved);
  const projection = toTiptapDocument(reopened);
  blockAt(projection, "1").attrs!.label = "intro";
  assert.equal(saveEdits(saved, collectSupportedEdits(reopened, projection)).markdown, saved.replace("(sec-intro)=", "(intro)="));
  blockAt(projection, "1").attrs!.label = "";
  assert.throws(() => collectSupportedEdits(reopened, projection), /section label cannot be empty/);
});
