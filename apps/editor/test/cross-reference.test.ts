import { nativeSource } from "./helpers/document.ts";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState, NodeSelection } from "@tiptap/pm/state";
import { addSectionLabel, isResolved, newSectionLabel, referenceCommandItems, referenceOfCommand, referenceTargets, referenceDisplay, referencesBrokenByDeletion } from "../src/cross-reference.tsx";
import { editorDocumentJSON, editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { collectSupportedEdits, freshBlockPath, normalizeEngineDocument, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { fromTiptapContent } from "../src/tiptap-inline.ts";
import { loadDocumentFile, previewDocumentFile, saveDocumentFile } from "../server/document-api.ts";
import { loadEditableDocument } from "./helpers/document.ts";
import { saveEdits } from "../server/document-replay.ts";
import { saveErrorMessage } from "../src/save-error.ts";
import { citationReport, parse, serialize, sameInlineContent, type CitationContent } from "@ieumdoc/core";
import { citationNumbers } from "../src/citation.tsx";
import { toTiptapContent } from "../src/tiptap-inline.ts";
import { i18n } from "../src/i18n.ts";

const source = nativeSource([
  "# Refs",
  "See {eq}`eq-a` and **{numref}`fig-a`** or [details](#eq-a) with $x$.",
  "See {eq}`missing` here.",
  "```{math}\n:label: eq-a\na\n```",
  ":::{figure} ./d.svg\n:name: fig-a\n:::",
].join("\n\n") + "\n");
const REFERENCES = "2";

test("fixed numbers cross the real editor schema and Core save replay without loss", () => {
  const source = nativeSource(":::{figure} ./a.png\n:name: fig\n:enumerator: 17\n\nCaption.\n:::\n\n:::{table}\n:name: tbl\n:enumerator: A.3\n\n| A |\n| --- |\n| 1 |\n:::\n\n```{math}\n:label: eq\n:enumerator: 4-2\n\nx=1\n```\n\n:::{figure}\n:name: diagram\n:enumerator: B.2\n\n```{mermaid}\ngraph TD; A-->B\n```\n:::\n\nSee {numref}`fig` and {eq}`eq`.\n");
  const schema = getSchema(editorExtensions());
  const snapshot = loadEditableDocument(source);
  const projected = toTiptapDocument(snapshot);
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(projected) });
  assert.deepEqual(referenceTargets(state.doc).map(target => target.number), ["17", "A.3", "4-2", "B.2"]);
  const next = state.doc.toJSON() as TiptapJSON;
  next.content![0].attrs!.imageAlt = "Edited alt";
  next.content![1].attrs!.label = "tbl-new";
  next.content![1].content!.at(-1)!.content = [{ type: "text", text: "Edited caption" }];
  next.content![2].attrs!.latex = "x=2";
  const edits = collectSupportedEdits(snapshot, next);
  const saved = saveEdits(source, edits).markdown;
  const reopened = loadEditableDocument(saved);
  assert.deepEqual(reopened.blocks.flatMap(block => "enumerator" in block ? [block.enumerator] : []), ["17", "A.3", "4-2", "B.2"]);
  assert.equal(saveEdits(saved, collectSupportedEdits(reopened, schema.nodeFromJSON(toTiptapDocument(reopened)).toJSON() as TiptapJSON)).markdown, saved);
  for (const enumerator of ["17", "A.3", "4-2", "B.2"]) {
    const rejected: string[] = [];
    let moved = EditorState.create({ schema, doc: schema.nodeFromJSON(projected), plugins: [structureGuardPlugin(projected, () => rejected.push("rejected"))] });
    let position = -1;
    moved.doc.forEach((node, pos) => { if (node.attrs.enumerator === enumerator) position = pos; });
    assert.notEqual(position, -1);
    const original = moved.doc.nodeAt(position)!;
    moved = moved.applyTransaction(moved.tr.setSelection(NodeSelection.create(moved.doc, position)).deleteSelection()).state;
    // The internal clipboard's freshSlice keeps attrs and assigns a new locator on paste/drop.
    const pasted = original.type.create({ ...original.attrs, sourcePath: freshBlockPath() }, original.content, original.marks);
    moved = moved.applyTransaction(moved.tr.insert(moved.doc.content.size, pasted)).state;
    assert.deepEqual(rejected, []);
    const movedEdits = collectSupportedEdits(snapshot, editorDocumentJSON(moved));
    const movedSaved = saveEdits(source, movedEdits).markdown;
    const movedRead = loadEditableDocument(movedSaved);
    const last = movedRead.blocks.at(-1)!;
    assert.equal("enumerator" in last && last.enumerator, enumerator, `new-locator Save/Reload lost ${enumerator}`);
    assert.equal(saveEdits(movedSaved, collectSupportedEdits(movedRead, schema.nodeFromJSON(toTiptapDocument(movedRead)).toJSON() as TiptapJSON)).markdown, movedSaved);
  }
  // Engine-created duplicates receive fresh locators through normalization too.
  const copySource = source.replace(":name: tbl\n", "");
  const copySnapshot = loadEditableDocument(copySource);
  const copyBaseline = toTiptapDocument(copySnapshot);
  const copied = clone(copyBaseline);
  copied.content!.push(clone(copied.content![1]));
  const normalized = normalizeEngineDocument(copyBaseline, copied);
  assert.notEqual(normalized.content!.at(-1)!.attrs!.sourcePath, copyBaseline.content![1].attrs!.sourcePath);
  const copySaved = saveEdits(copySource, collectSupportedEdits(copySnapshot, normalized)).markdown;
  assert.deepEqual(loadEditableDocument(copySaved).blocks.filter(block => block.block === "table").map(block => block.enumerator), ["A.3", "A.3"]);
  // Property edits use the same real schema/guard, then Core's setting/clearing operation.
  const edited = EditorState.create({ schema, doc: schema.nodeFromJSON(projected), plugins: [structureGuardPlugin(projected, () => assert.fail("number edit rejected"))] });
  const changed = edited.applyTransaction(edited.tr.setNodeMarkup(0, undefined, { ...edited.doc.firstChild!.attrs, enumerator: "A.7" })).state;
  const changedEdits = collectSupportedEdits(snapshot, editorDocumentJSON(changed));
  assert.deepEqual(changedEdits.enumerators, [{ path: snapshot.blocks[0].path, from: "17", to: "A.7" }]);
  const numberedSource = saveEdits(source, changedEdits).markdown;
  assert.equal(referenceTargets(schema.nodeFromJSON(toTiptapDocument(loadEditableDocument(numberedSource))))[0].number, "A.7");
  const cleared = changed.applyTransaction(changed.tr.setNodeMarkup(0, undefined, { ...changed.doc.firstChild!.attrs, enumerator: null })).state;
  const clearedEdits = collectSupportedEdits(snapshot, editorDocumentJSON(cleared));
  assert.deepEqual(clearedEdits.enumerators, [{ path: snapshot.blocks[0].path, from: "17", to: "" }]);
  const clearedBlock = loadEditableDocument(saveEdits(source, clearedEdits).markdown).blocks[0];
  assert.equal("enumerator" in clearedBlock ? clearedBlock.enumerator : undefined, undefined);
  const emptySource = nativeSource("$$\n$$\n");
  const emptySnapshot = loadEditableDocument(emptySource);
  const empty = schema.nodeFromJSON(toTiptapDocument(emptySnapshot));
  const emptyState = EditorState.create({ schema, doc: empty });
  let emptyPosition = -1;
  empty.forEach((node, pos) => { if (node.type.name === "equation") emptyPosition = pos; });
  const emptyFixed = emptyState.apply(emptyState.tr.setNodeMarkup(emptyPosition, undefined, { ...empty.lastChild!.attrs, enumerator: "E.1" }));
  assert.throws(() => saveEdits(emptySource, collectSupportedEdits(emptySnapshot, editorDocumentJSON(emptyFixed))), (error: unknown) => {
    assert.equal((error as { code: string }).code, "fixed-number-unrepresentable");
    assert.match(saveErrorMessage(error), /content|clear/i);
    return true;
  });
  assert.throws(() => saveEdits(source, { enumerators: [{ path: snapshot.blocks[0].path, from: "wrong", to: "9" }] }), /does not match/);
});

test("deletion notices distinguish a remaining fragment link from a relabel or removal of both link and target", () => {
  const schema = getSchema(editorExtensions());
  const projection = toTiptapDocument(loadEditableDocument(nativeSource("See [details](#EQ-A).\n\n```{math}\n:label: eq-a\na=b\n```\n")));
  const before = schema.nodeFromJSON(projection);
  const relabeled = clone(projection);
  relabeled.content!.at(-1)!.attrs!.label = "eq-b";
  assert.deepEqual(referencesBrokenByDeletion(before, schema.nodeFromJSON(relabeled)), []);
  const removed = clone(projection);
  removed.content!.pop();
  assert.ok(referencesBrokenByDeletion(before, schema.nodeFromJSON(removed)).some(target => target.label === "eq-a"));
  removed.content![0].content = [{ type: "text", text: "No reference remains." }];
  assert.deepEqual(referencesBrokenByDeletion(before, schema.nodeFromJSON(removed)), []);
});

test("missing reference chips identify the broken reference without guessing its target kind", async () => {
  try {
    for (const language of ["en", "ko"]) {
      await i18n.changeLanguage(language);
      for (const role of ["eq", "numref", "ref"] as const) {
        assert.equal(referenceDisplay([], role, "gone").text, language === "ko" ? "깨진 참조: gone" : "Unresolved reference: gone");
      }
    }
  } finally {
    await i18n.changeLanguage("en");
  }
  assert.equal(referenceDisplay([{ role: "numref", label: "table", kind: "table", number: 1 }], "numref", "table").text, "Table\u00a01");
  assert.equal(referenceDisplay([{ role: "numref", label: "figure", number: 1 }], "numref", "figure").text, "Figure\u00a01");
  assert.equal(referenceDisplay([{ role: "eq", label: "equation", number: 1 }], "eq", "equation").text, "(1)");
});

test("citation atoms round-trip through the engine and Save, including groups, captions and metadata", () => {
  const source = "---\nieumdoc: 1\nbibliography: [../missing.bib]\n---\n\n" +
    "# Citation document\n\nBefore **{cite}`Key`** and {cite:t}`Key` or {cite:p}`Other,Key`.\n\n" +
    ":::{figure}\n\nFigure {cite}`Figure`\n:::\n\n" +
    ":::{table} Caption {cite}`Caption`\n\n| Name |\n| --- |\n| {cite}`Cell` |\n:::\n\n" +
    "- List {cite}`List`\n\nEnd[^n].\n\n[^n]: Endnote {cite}`Endnote`.\n";
  const model = loadEditableDocument(source);
  const projection = toTiptapDocument(model);
  const schema = getSchema(editorExtensions());
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(projection), plugins: [structureGuardPlugin(projection, reason => assert.fail(JSON.stringify(reason)))] });
  assert.deepEqual([...citationNumbers(state.doc)], [...new Map(citationReport(parse(source)).citations.flatMap(c => c.keys.map((key, i) => [key, c.numbers[i]] as const)))]);
  const paragraph = state.doc.child(1);
  assert.deepEqual(fromTiptapContent({ type: "doc", content: [paragraph.toJSON()] }), model.blocks[1].block === "paragraph" ? model.blocks[1].content : []);
  const start = state.doc.child(0).nodeSize + 1;
  state = state.apply(state.tr.insertText("Edited ", start));
  const saved = saveEdits(source, collectSupportedEdits(model, editorDocumentJSON(state))).markdown;
  assert.deepEqual(citationReport(parse(saved)), citationReport(parse(source)));
  assert.match(saved, /Edited Before/);
  assert.equal(serialize(parse(saved)), saved);
  assert.deepEqual(citationNumbers(schema.nodeFromJSON(toTiptapDocument(loadEditableDocument(saved)))), citationNumbers(state.doc));
});

test("citation adapter rejects malformed atoms and retains permitted marks", () => {
  const citation: CitationContent = { kind: "citation", role: "cite:p", keys: ["Key", "key"] };
  const content = [{ kind: "delete" as const, children: [{ kind: "strong" as const, children: [citation] }] }];
  const schema = getSchema(editorExtensions());
  const json = schema.nodeFromJSON(toTiptapContent(content)).toJSON();
  assert(sameInlineContent(fromTiptapContent(json), content));
  for (const node of [
    { type: "citation", attrs: { role: "cite:year", keys: ["Key"] } },
    { type: "citation", attrs: { role: "cite", keys: [] } },
    { type: "citation", attrs: { role: "cite", keys: "Key" } },
    { type: "citation", attrs: { role: "cite", keys: ["Key"] }, marks: [{ type: "link", attrs: { href: "./x" } }] },
    { type: "citation", attrs: { role: "cite", keys: ["Key"] }, marks: [{ type: "superscript" }] },
  ]) assert.throws(() => fromTiptapContent({ type: "doc", content: [{ type: "paragraph", content: [node] }] }), /citation/);
});

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
  assert.equal(blockAt(projection, "3").type, "paragraph");
  const schema = getSchema(editorExtensions());
  const node = schema.nodeFromJSON(projection);
  assert.deepEqual(schema.nodeFromJSON(node.toJSON()).toJSON(), node.toJSON());
  // An unchanged document sends no edit.
  assert.deepEqual(collectSupportedEdits(loadEditableDocument(source), projection).paragraphs, []);
});

test("references can be inserted, retargeted and removed, and text around them edited", () => {
  const base = toTiptapDocument(loadEditableDocument(source));
  const inserted = clone(base);
  blockAt(inserted, "3").content = [
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
  // Revisiting the earlier immutable document (as history does) keeps its own numbering.
  assert.deepEqual(referenceTargets(doc), targets);
  assert.equal(isResolved(targets, "eq", "eq-a"), true);
  assert.equal(isResolved(targets, "eq", "EQ-A"), true);
  assert.equal(isResolved(targets, "eq", "missing"), false);
  assert.equal(isResolved(targets, "eq", "fig-a"), false);
  assert.equal(isResolved(targets, "numref", "fig-a"), true);
  // An unsaved label change is reflected at once.
  const relabeled = clone(projection);
  blockAt(relabeled, "4").attrs!.label = "eq-b";
  assert.equal(isResolved(referenceTargets(schema.nodeFromJSON(relabeled)), "eq", "eq-a"), false);
  // Slash items insert a reference to each matching target, then label and reference a heading.
  assert.deepEqual(referenceCommandItems(doc, "fig").map((item) => item.label), ["Figure\u00a01 · fig-a"]);
  // Generic reference searches include unlabeled headings too.
  assert.deepEqual(referenceCommandItems(doc, "ref").map((item) => referenceOfCommand(item.id)),
    [...targets.map(({ role, label }) => ({ role, label })), { heading: 0, title: "" }]);
  // Empty queries still omit unlabeled headings; heading searches still find them.
  assert.equal(referenceCommandItems(doc, "").length, targets.length);
  assert.deepEqual(referenceCommandItems(doc, "heading").map((item) => item.label), ["Section reference: Refs"]);
});

test("reference menu searches captions, displayed numbers and labels without changing target identity or order", async (t) => {
  const schema = getSchema(editorExtensions());
  const projection = toTiptapDocument(loadEditableDocument(nativeSource([
    "(sec-guide)=\n\n## Installation guide",
    "## Other heading",
    "```{math}\n:label: eq-buck\n\na = b\n```",
    ":::{figure}\n:name: fig-first\n:::",
    ":::{figure}\n:name: fig-control\n\nControl **summary** 동작 요약.\n:::",
    ":::{table} Port **summary** 측정 요약\n:name: tbl-data\n\n| Cell |\n| --- |\n| Hidden |\n:::",
  ].join("\n\n"))));
  const doc = schema.nodeFromJSON(projection);
  const items = (query: string) => referenceCommandItems(doc, query);
  const ids = (query: string) => items(query).map(item => item.id);
  const figure = "reference:numref:fig-control";
  const table = "reference:numref:tbl-data";
  await t.test("kind keywords distinguish figures and tables", () => {
    for (const query of ["table", "표"]) assert.deepEqual(ids(query), [table], query);
    for (const query of ["figure", "그림"]) {
      assert.deepEqual(ids(query), ["reference:numref:fig-first", figure], query);
    }
  });
  const labeledTargets = ["reference:ref:sec-guide", "reference:eq:eq-buck", "reference:numref:fig-first", figure, table];
  await t.test("generic reference keywords include every kind and unlabeled headings", () => {
    for (const query of ["ref", "reference", "참조"]) {
      assert.deepEqual(ids(query), [...labeledTargets, "reference:heading:2"], query);
    }
  });
  assert.deepEqual(ids(""), labeledTargets); // Empty slash query still omits unlabeled headings.
  assert.deepEqual(ids("unrelated"), []);
  assert.deepEqual(ids("SuMmArY"), [figure, table]);
  assert.deepEqual(items("동작"), [{ id: figure, label: "Figure\u00a02 · Control summary 동작 요약.", group: "References" }]);
  assert.deepEqual(items("측정"), [{ id: table, label: "Table\u00a01 · Port summary 측정 요약", group: "References" }]);
  for (const query of ["Figure 2", "fIGure", "2", "fig-c"]) assert.ok(ids(query).includes(figure), query);
  for (const query of ["(1)", "eq-b", "Equation"]) {
    assert.deepEqual(items(query).filter(item => item.id.startsWith("reference:eq:")),
      [{ id: "reference:eq:eq-buck", label: "(1) · eq-buck", group: "References" }]);
  }
  assert.deepEqual(ids("Table 1"), [table]);
  assert.deepEqual(ids("1"), ["reference:eq:eq-buck", "reference:numref:fig-first", table]);
  assert.equal(items("fig-first")[0]?.label, "Figure\u00a01 · fig-first");
  assert.deepEqual(referenceOfCommand(items("summary")[0]!.id), { role: "numref", label: "fig-control" });
  assert.deepEqual(ids("guide"), ["reference:ref:sec-guide"]);
  assert.equal(items("guide")[0]?.label, "Section reference: Installation guide");
  assert.deepEqual(ids("other"), ["reference:heading:2"]);
  assert.deepEqual(ids("Hidden"), []); // Table cells are not captions.
  assert.deepEqual(ids("ummary"), []); // Word prefixes, as in existing heading search.

  // Use the complete live caption for search, even beyond the displayed summary.
  const live = schema.nodeFromJSON(projection);
  const index = projection.content!.findIndex(node => node.attrs?.label === "fig-control");
  const caption = `${"😀".repeat(81)} searchable`;
  const updated = live.copy(live.content.replaceChild(index, schema.nodes.figure.create(
    live.child(index).attrs, schema.text(caption))));
  assert.equal(referenceCommandItems(updated, "searchable")[0]?.label, `Figure\u00a02 · ${"😀".repeat(80)}…`);
});

test("reference chip selector stays unchanged by caption edits while menus read the live captions", () => {
  const schema = getSchema(editorExtensions());
  const projection = toTiptapDocument(loadEditableDocument(nativeSource([
    ":::{figure}\n:name: fig-a\n\nOriginal figure.\n:::",
    ":::{table} Original table\n:name: tbl-a\n\n| Value |\n| --- |\n| 1 |\n:::",
  ].join("\n\n"))));
  // Same value as CrossReferenceView's useEditorState selector.
  const selectorValue = (value: TiptapJSON) => JSON.stringify(referenceTargets(schema.nodeFromJSON(value)));
  const before = selectorValue(projection);
  for (const kind of ["figure", "table"]) {
    const edited = clone(projection);
    const block = edited.content!.find(node => node.type === kind)!;
    if (kind === "figure") block.content = [{ type: "text", text: "Updated figure." }];
    else block.content!.at(-1)!.content = [{ type: "text", text: "Updated table" }];
    assert.equal(selectorValue(edited), before, `${kind} caption changed the chip selector`);
    assert.equal(referenceCommandItems(schema.nodeFromJSON(edited), "Updated")[0]?.label,
      kind === "figure" ? "Figure\u00a01 · Updated figure." : "Table\u00a01 · Updated table");
  }
});

test("caption words after Unicode punctuation match without changing menu names", () => {
  const schema = getSchema(editorExtensions());
  const doc = schema.nodeFromJSON(toTiptapDocument(loadEditableDocument(nativeSource([
    ":::{figure}\n:name: fig-ports\n\nPort-summary\n:::",
    ":::{figure}\n:name: fig-interface\n\nPFC/CLLC interface\n:::",
    ":::{table} 전압(측정) 결과\n:name: tbl-voltage\n\n| Value |\n| --- |\n| 1 |\n:::",
  ].join("\n\n")))));
  for (const [query, prefix, id, label] of [
    ["summary", "Port-", "reference:numref:fig-ports", "Figure\u00a01 · Port-summary"],
    ["cllc", "PFC", "reference:numref:fig-interface", "Figure\u00a02 · PFC/CLLC interface"],
    ["측정", "전압(", "reference:numref:tbl-voltage", "Table\u00a01 · 전압(측정) 결과"],
  ] as const) {
    const expected = [{ id, label, group: "References" }];
    assert.deepEqual(referenceCommandItems(doc, query), expected);
    assert.deepEqual(referenceCommandItems(doc, prefix), expected);
  }
});

test("unresolved references save unchanged; Source preview shows unsaved reference edits and matches Save", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-xref-"));
  const file = path.join(dir, "refs.md");
  try {
    writeFileSync(file, source);
    const loaded = loadDocumentFile(file);
    const next = toTiptapDocument(loaded.document);
    blockAt(next, "3").content = [
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


test("a section label and a {ref} to its heading save through Core, and renaming the label saves", () => {
  const markdown = nativeSource("# Title\n\n## Intro\n\nSee the intro.\n\n## 개요\n");
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
  assert.equal(saved, nativeSource("# Title\n\n(sec-intro)=\n\n## Intro\n\nSee the intro.{ref}`sec-intro`\n\n## 개요\n"));

  const reopened = loadEditableDocument(saved);
  const projection = toTiptapDocument(reopened);
  blockAt(projection, "2").attrs!.label = "intro";
  assert.equal(saveEdits(saved, collectSupportedEdits(reopened, projection)).markdown, saved.replace("(sec-intro)=", "(intro)="));
  blockAt(projection, "2").attrs!.label = "";
  assert.throws(() => collectSupportedEdits(reopened, projection), /section label cannot be empty/);
});

test("a new heading destination is created before its same-ID section target during Save", () => {
  const markdown = nativeSource("Keep.\n");
  const editable = loadEditableDocument(markdown);
  const next = toTiptapDocument(editable);
  next.content!.push(
    { type: "labelTarget", attrs: { sourcePath: "new:target", label: "intro" } },
    { type: "heading", attrs: { sourcePath: "new:heading", level: 2 }, content: [{ type: "text", text: "Intro" }] },
  );
  assert.match(saveEdits(markdown, collectSupportedEdits(editable, next)).markdown, /\(intro\)=\n\n## Intro/);
});

test("section insertion preserves the same-heading exception and reports generated-label collisions on Save", () => {
  for (const collision of [false, true]) {
    const markdown = nativeSource(collision ? "## Intro\n\n## sec-intro\n" : "## Intro\n");
    const editable = loadEditableDocument(markdown);
    const schema = getSchema(editorExtensions());
    const baseline = toTiptapDocument(editable);
    let state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline),
      plugins: [structureGuardPlugin(baseline, () => assert.fail("representable insertion rejected"))] });
    state = state.apply(addSectionLabel(state, 0));
    if (!collision) state = state.apply(state.tr.setNodeMarkup(0, undefined, { ...state.doc.child(0).attrs, label: "intro" }));
    const submitted = editorDocumentJSON(state);
    const edits = collectSupportedEdits(editable, submitted);
    if (collision) {
      assert.throws(() => saveEdits(markdown, edits), error => {
        const message = saveErrorMessage(error, submitted, edits);
        assert.match(message, /already names another target \(including implicit heading IDs\)/);
        assert.match(message, /Choose a label/);
        return true;
      });
    } else {
      assert.match(saveEdits(markdown, edits).markdown, /\(intro\)=\n\n## Intro/);
    }
  }
});


test("reference styles derive from template values and editor Save replays authored settings through Core", async () => {
  const { referenceStyle, REFERENCE_STYLES } = await import("../src/reference-style.ts");
  for (const [key, style] of Object.entries(REFERENCE_STYLES)) assert.equal(referenceStyle(style.templates), key);
  assert.equal(referenceStyle({figure: "Figure\u00a0%s"}), "default");
  assert.equal(referenceStyle({figure: "Figure %s"}), "custom");
  assert.equal(referenceStyle({figure: "Illustration %s"}), "custom");
  const opening = loadEditableDocument(source);
  const json = toTiptapDocument(opening);
  const noBreak = getSchema(editorExtensions()).nodeFromJSON({...json, attrs: {referenceTemplates: {figure: "Figure\u00a0%s"}}});
  assert.ok(referenceCommandItems(noBreak, "Figure 1").some(item => item.label.startsWith("Figure\u00a01")));
  const repeated = getSchema(editorExtensions()).nodeFromJSON({...json, attrs: {referenceTemplates: {figure: "Illustration %s of %s"}}});
  assert.ok(referenceCommandItems(repeated, "Illustration 1 of 1").some(item => item.label.startsWith("Illustration 1 of 1")));
  json.attrs = { referenceTemplates: REFERENCE_STYLES.korean.templates };
  const doc = getSchema(editorExtensions()).nodeFromJSON(json);
  assert.equal(referenceDisplay(referenceTargets(doc), "eq", "eq-a").text, "식 (1)");
  assert.ok(referenceCommandItems(doc, "식 (1)").some(item => item.label.startsWith("식 (1)")));
  assert.ok(referenceCommandItems(doc, "그림").some(item => item.label.startsWith("그림 1")));
  assert.ok(referenceCommandItems(doc, "수식").some(item => item.label.startsWith("식 (1)")));
  const saved = saveEdits(source, collectSupportedEdits(opening, doc.toJSON() as TiptapJSON));
  const reopened = loadEditableDocument(saved.markdown);
  assert.equal(referenceStyle(reopened.referenceTemplates), "korean");
  const reset = toTiptapDocument(reopened);
  reset.attrs!.referenceTemplates = null;
  assert.equal(loadEditableDocument(saveEdits(saved.markdown, collectSupportedEdits(reopened, reset)).markdown).referenceTemplates, undefined);
});

test("numbered section references use Core H1-H6 counters after body section changes", async () => {
  const { defaultHeadingNumbering } = await import("@ieumdoc/core/numbering");
  const json = toTiptapDocument(loadEditableDocument(nativeSource("(first)=\n# First\n\n(detail)=\n## Detail\n\n(second)=\n# Second\n")));
  json.attrs = { ...json.attrs, title: "Independent title", headingNumbering: defaultHeadingNumbering(true) };
  const schema = getSchema(editorExtensions());
  const doc = schema.nodeFromJSON(json);
  assert.equal(referenceDisplay(referenceTargets(doc), "ref", "first").text, "§ 1");
  assert.equal(referenceDisplay(referenceTargets(doc), "ref", "detail").text, "§ 1.1");
  assert.equal(referenceDisplay(referenceTargets(doc), "ref", "second").text, "§ 2");
  json.attrs.headingNumbering = null;
  assert.equal(referenceDisplay(referenceTargets(schema.nodeFromJSON(json)), "ref", "detail").text, "§ Detail");
});
