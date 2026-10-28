import { nativeSource } from "./helpers/document.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getSchema } from "@tiptap/core";
import { history, redo, undo } from "@tiptap/pm/history";
import { deleteSelection } from "@tiptap/pm/commands";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { moveSection, parse, removeSection, serialize } from "@ieumdoc/core";
import {
  BLOCK_COMMAND_META,
  BLOCK_COMMANDS,
  filterInsertCommands,
  formattableSelection,
  INSERT_COMMANDS,
  slashQueryAt,
  insertEquationAfter,
  insertFigureAfter,
} from "../src/block-commands.ts";
import { declaredDeletions, editorDocumentJSON, editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import {
  assertSupportedDocumentChange,
  appliedDocument,
  collectSupportedEdits,
  isNewBlockPath,
  toTiptapDocument,
  type TiptapJSON,
} from "../src/tiptap-document.ts";
import { commitDocumentSave, documentRevision } from "../server/document-api.ts";
import { loadEditableDocument } from "./helpers/document.ts";
import { saveEdits } from "../server/document-replay.ts";
import { citationCommandItems, CITATION_COMMAND } from "../src/citation.tsx";
import { endnoteCommandItems } from "../src/endnotes.ts";
import { referenceCommandItems } from "../src/cross-reference.tsx";
import { i18n } from "../src/i18n.ts";

const editorRoot = fileURLToPath(new URL("..", import.meta.url));
const schema = getSchema(editorExtensions());
const DELETE_COMMAND = BLOCK_COMMANDS.find(command => command.id === "delete")!;
const noop = () => {};
const text = (value: string): TiptapJSON[] => [{ type: "text", text: value }];

test("Citation slash aliases select the citation form before block commands in either UI language", async () => {
  const language = i18n.language;
  try {
    for (const locale of ["en", "ko"]) {
      await i18n.changeLanguage(locale);
      for (const query of ["Citation", "cite", "인용"]) {
        const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text(`/${query}`)));
        const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, query.length + 2) });
        const slash = slashQueryAt(state);
        assert.ok(slash);
        // DocumentEditor's menu preserves this group order; Enter selects the first item.
        const items = [
          ...(slash.blockCommands ? filterInsertCommands(slash.query) : []),
          ...(slash.endnote ? endnoteCommandItems(slash.query) : []),
          ...referenceCommandItems(doc, slash.query),
          ...citationCommandItems(undefined, slash.query),
        ];
        assert.equal(items[0]?.id, CITATION_COMMAND, `${locale}: /${query}`);
        assert.ok(!items.some(item => item.id === "quote"), `${locale}: /${query} must not offer Quote`);
      }
      for (const query of ["quote", "blockquote", "인용문"]) {
        assert.equal(filterInsertCommands(query)[0]?.id, "quote", `${locale}: /${query}`);
      }
    }
  } finally {
    await i18n.changeLanguage(language);
  }
});

function docOf(markdown: string): ProseMirrorNode {
  return schema.nodeFromJSON(toTiptapDocument(loadEditableDocument(markdown)));
}

function indexOf(doc: ProseMirrorNode, sourcePath: string): number {
  return doc.content.content.findIndex(node => node.attrs.sourcePath === sourcePath);
}

function positionOf(doc: ProseMirrorNode, sourcePath: string): number {
  let pos = 0;
  for (let index = 0; index < indexOf(doc, sourcePath); index++) pos += doc.child(index).nodeSize;
  return pos;
}

test("insert command adds one new paragraph after the target and reuses an empty paragraph", () => {
  const state = EditorState.create({ schema, doc: docOf(nativeSource("AB\n\n# Heading")) });
  const inserted = INSERT_COMMANDS[0].run(state, 0);
  assert.equal(inserted.getMeta(BLOCK_COMMAND_META), true);
  const next = state.apply(inserted);
  assert.deepEqual(next.doc.content.content.map(node => node.type.name), ["paragraph", "paragraph", "heading"]);
  assert.ok(isNewBlockPath(String(next.doc.child(1).attrs.sourcePath)));
  assert.equal(next.selection.$from.index(0), 1);

  const reused = INSERT_COMMANDS[0].run(next, 1);
  assert.equal(reused.docChanged, false);
  assert.equal(reused.selection.$from.index(0), 1);
});

test("body heading commands offer H2-H6 and place the caret inside the heading", () => {
  const state = EditorState.create({ schema, doc: docOf(nativeSource("AB")) });
  const commands = INSERT_COMMANDS.filter(command => command.id.startsWith("heading-"));
  assert.ok(!commands.some(command => command.id === "heading-1"));
  for (const level of [2, 3, 4, 5, 6]) assert.ok(commands.some(command => command.id === `heading-${level}`));
  assert.deepEqual(filterInsertCommands("h1"), []);
  assert.deepEqual(filterInsertCommands("제목 1"), []);
  assert.deepEqual(filterInsertCommands("h2").map(command => command.id), ["heading-2"]);
  assert.ok(!filterInsertCommands("heading").some(command => command.id === "heading-1"));
  const next = state.apply(commands.find(command => command.id === "heading-2")!.run(state, 0));
  assert.deepEqual(next.doc.content.content.map(node => node.type.name), ["paragraph", "heading"]);
  assert.equal(next.doc.child(1).attrs.level, 2);
  assert.equal(next.selection.$from.parent.type.name, "heading");
  assert.equal(next.selection.$from.parentOffset, 0);
});

test("body block menus omit H1 while the document title keeps its own menu", () => {
  for (const markdown of ["# Title\n\nParagraph\n\n## Section\n\n# Existing body H1", "(title)=\n\n# Title\n\nParagraph\n\n## Section\n\n# Existing body H1"]) {
    const state = EditorState.create({ schema, doc: docOf(nativeSource(markdown)) });
    state.doc.forEach((node, _, index) => {
      if (!["paragraph", "heading"].includes(node.type.name)) return;
      const commands = BLOCK_COMMANDS.filter(command => !command.applies || command.applies(state, index));
      assert.equal(commands.some(command => command.id === "heading-level-1"), node.textContent === "Title", node.textContent);
      for (const level of [2, 3, 4, 5, 6]) assert.ok(commands.some(command => command.id === `heading-level-${level}`));
      if (node.type.name === "heading") assert.ok(commands.some(command => command.id === "paragraph"));
    });
  }
});

test("shared insert commands include structural blocks and select their new atoms", () => {
  const state = EditorState.create({ schema, doc: docOf(nativeSource("AB")) });
  for (const label of ["Paragraph", "Bulleted list", "Numbered list", "Note", "Warning", "Quote", "Divider", "Code block", "Equation", "Figure", "Table"]) {
    assert.ok(INSERT_COMMANDS.some(command => command.label === label), label);
  }
  // The menu lists each group once under its heading, so a group's commands are consecutive.
  const groups = INSERT_COMMANDS.map(command => command.group);
  assert.deepEqual(groups.filter((group, index) => group !== groups[index - 1]), ["Text", "Lists", "Blocks", "Technical"]);
  // All body heading levels are discoverable without a search query.
  assert.deepEqual(filterInsertCommands("").filter(command => command.id.startsWith("heading-")).map(command => command.id),
    ["heading-2", "heading-3", "heading-4", "heading-5", "heading-6"]);
  assert.deepEqual(filterInsertCommands("h5").map(command => command.id), ["heading-5"]);
  assert.deepEqual(filterInsertCommands("h2").map(command => command.id), ["heading-2"]);
  assert.deepEqual(filterInsertCommands("latex").map(command => command.id), ["equation"]);
  const next = state.apply(insertEquationAfter(state, 0));
  assert.deepEqual(next.doc.content.content.map(node => node.type.name), ["paragraph", "equation"]);
  assert.ok(isNewBlockPath(String(next.doc.child(1).attrs.sourcePath)));
  assert.equal(next.doc.child(1).attrs.latex, "");
  assert.equal(next.selection instanceof NodeSelection, true);
  assert.equal(next.selection.from, positionOf(next.doc, String(next.doc.child(1).attrs.sourcePath)));
});

test("Equation slash insertion replaces a transient empty paragraph", () => {
  const initial = EditorState.create({ schema, doc: docOf(nativeSource("AB")) });
  const withEmptyParagraph = initial.apply(INSERT_COMMANDS[0].run(initial, 0));
  const typed = withEmptyParagraph.apply(withEmptyParagraph.tr.insertText("/h2"));
  const slash = slashQueryAt(typed);
  assert.ok(slash);
  const next = typed.apply(insertEquationAfter(typed, slash.index, slash));
  assert.deepEqual(next.doc.content.content.map(node => node.type.name), ["paragraph", "equation"]);
  assert.equal(next.doc.child(1).attrs.sourcePath.startsWith("new:"), true);
  assert.equal(next.selection instanceof NodeSelection, true);
});

test("Figure insertion places the caret in the caption of a new unlabeled editable Figure", () => {
  const state = EditorState.create({ schema, doc: docOf(nativeSource("AB")) });
  assert.deepEqual(filterInsertCommands("fig").map(command => command.id), ["figure"]);
  assert.deepEqual(filterInsertCommands("image").map(command => command.id), ["figure"]);
  const next = state.apply(insertFigureAfter(state, 0));
  assert.deepEqual(next.doc.content.content.map(node => node.type.name), ["paragraph", "figure"]);
  const figure = next.doc.child(1);
  assert.ok(isNewBlockPath(String(figure.attrs.sourcePath)));
  assert.deepEqual(
    [figure.attrs.label, figure.attrs.imageUrl, figure.attrs.imageAlt],
    ["", "", ""],
  );
  assert.equal(next.selection instanceof TextSelection && next.selection.empty, true);
  assert.equal(next.selection.from, positionOf(next.doc, String(figure.attrs.sourcePath)) + 1);
});

test("Figure slash insertion replaces a transient empty paragraph but not a persistent one", () => {
  const initial = EditorState.create({ schema, doc: docOf(nativeSource("AB")) });
  const withEmptyParagraph = initial.apply(INSERT_COMMANDS[0].run(initial, 0));
  const typed = withEmptyParagraph.apply(withEmptyParagraph.tr.insertText("/figure"));
  const slash = slashQueryAt(typed);
  assert.ok(slash);
  const next = typed.apply(insertFigureAfter(typed, slash.index, slash));
  assert.deepEqual(next.doc.content.content.map(node => node.type.name), ["paragraph", "figure"]);
  assert.equal(next.doc.child(0).textContent, "AB");
  assert.equal(String(next.doc.child(1).attrs.sourcePath).startsWith("new:"), true);

  // An emptied persistent paragraph is never converted into a Figure.
  const persistent = initial.apply(initial.tr.delete(1, 3));
  const inserted = persistent.apply(insertFigureAfter(persistent, 0));
  assert.deepEqual(inserted.doc.content.content.map(node => node.type.name), ["paragraph", "figure"]);
  assert.equal(inserted.doc.child(0).attrs.sourcePath, "1");
});

test("heading slash insertion replaces an otherwise-empty paragraph", () => {
  const initial = EditorState.create({ schema, doc: docOf(nativeSource("AB")) });
  const withEmptyParagraph = initial.apply(INSERT_COMMANDS[0].run(initial, 0));
  const typed = withEmptyParagraph.apply(withEmptyParagraph.tr.insertText("/h3"));
  const slash = slashQueryAt(typed);
  assert.ok(slash);
  const command = INSERT_COMMANDS.find(item => item.id === "heading-3")!;
  const next = typed.apply(command.run(typed, slash.index, slash));
  assert.deepEqual(next.doc.content.content.map(node => node.type.name), ["paragraph", "heading"]);
  assert.equal(next.doc.child(1).attrs.level, 3);
  assert.equal(next.doc.child(1).content.size, 0);
  assert.equal(next.selection.$from.parent.type.name, "heading");
});

test("heading slash insertion from an empty split sibling passes the structure guard", () => {
  const markdown = nativeSource("Original paragraph");
  const baseline = toTiptapDocument(loadEditableDocument(markdown));
  const split = structuredClone(baseline);
  split.content!.push({ type: "paragraph", attrs: { sourcePath: "new:split:end" } });
  const doc = schema.nodeFromJSON(split);
  let rejected = 0;
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, doc.child(0).nodeSize + 1),
    plugins: [structureGuardPlugin(baseline, () => rejected++)],
  });
  state = state.apply(state.tr.insertText("/h2"));
  const slash = slashQueryAt(state);
  assert.ok(slash);
  const command = INSERT_COMMANDS.find(item => item.id === "heading-2")!;
  state = state.apply(command.run(state, slash.index, slash));
  assert.equal(rejected, 0);
  assert.deepEqual(state.doc.content.content.map(node => node.type.name), ["paragraph", "heading"]);
  assert.equal(state.doc.child(0).attrs.sourcePath, "1");
  assert.equal(state.doc.child(1).attrs.sourcePath, "new:split:end");
  assert.equal(state.doc.child(1).attrs.level, 2);
});

test("Equation slash insertion from an empty split sibling passes the structure guard", () => {
  const markdown = nativeSource("Original paragraph");
  const baseline = toTiptapDocument(loadEditableDocument(markdown));
  const split = structuredClone(baseline);
  split.content!.push({ type: "paragraph", attrs: { sourcePath: "new:split:end" } });
  const doc = schema.nodeFromJSON(split);
  let rejected = 0;
  let state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, doc.child(0).nodeSize + 1),
    plugins: [structureGuardPlugin(baseline, () => rejected++)],
  });
  state = state.apply(state.tr.insertText("/equation"));
  const slash = slashQueryAt(state);
  assert.ok(slash);
  state = state.apply(insertEquationAfter(state, slash.index, slash));
  assert.equal(rejected, 0);
  assert.deepEqual(state.doc.content.content.map(node => node.type.name), ["paragraph", "equation"]);
  assert.equal(state.doc.child(0).attrs.sourcePath, "1");
  assert.equal(state.doc.child(1).attrs.sourcePath, "new:split:end");
  assert.equal(state.doc.child(1).attrs.latex, "");
});

test("slash command removes its query and shares the insert command list", () => {
  let state = EditorState.create({ schema, doc: docOf(nativeSource("AB")), selection: TextSelection.create(docOf(nativeSource("AB")), 3) });
  state = state.apply(state.tr.insertText(" /par"));
  const slash = slashQueryAt(state);
  assert.ok(slash);
  assert.deepEqual({ query: slash.query, index: slash.index }, { query: "par", index: 0 });
  assert.deepEqual(filterInsertCommands("par").map(command => command.id), ["paragraph"]);
  assert.deepEqual(filterInsertCommands("zzz"), []);
  assert.deepEqual(filterInsertCommands(""), INSERT_COMMANDS);
  const next = state.apply(INSERT_COMMANDS[0].run(state, slash.index, slash));
  assert.equal(next.doc.child(0).textContent, "AB ");
  assert.equal(next.doc.childCount, 2);

  const empty = EditorState.create({ schema, doc: docOf(nativeSource("AB")) });
  const emptyNext = empty.apply(INSERT_COMMANDS[0].run(empty, 0));
  const typed = emptyNext.apply(emptyNext.tr.insertText("/"));
  const emptySlash = slashQueryAt(typed)!;
  const reused = typed.apply(INSERT_COMMANDS[0].run(typed, emptySlash.index, emptySlash));
  assert.equal(reused.doc.childCount, 2);
  assert.equal(reused.doc.child(1).content.size, 0);

  const inWord = docOf(nativeSource("a/b"));
  assert.equal(slashQueryAt(EditorState.create({ schema, doc: inWord, selection: TextSelection.create(inWord, 3) })), null);
});

test("slash opens on supported inline surfaces with only valid command kinds", () => {
  for (const [source, parent, blocks, endnote] of [
    ["- /", "paragraph", false, true],
    ["/", "paragraph", true, true],
    ["- Outer\n  - /", "paragraph", false, true],
    ["> /", "quote", false, true],
    [":::{note}\n/\n:::", "admonition", false, true],
    ["Body[^n].\n\n[^n]: /", "footnoteDefinition", false, false],
    ["| / |\n| --- |\n| Cell |", "tableCell", false, true],
    [":::{figure}\n\n/\n:::", "figure", false, true],
    ["# /", "heading", false, true],
  ] as const) {
    const doc = docOf(nativeSource(source));
    let position: number | undefined;
    doc.descendants((node, pos) => {
      if (node.type.name === parent && node.textContent === "/") position = pos + 2;
    });
    assert.ok(position, source);
    const slash = slashQueryAt(EditorState.create({ schema, doc, selection: TextSelection.create(doc, position) }));
    assert.ok(slash, source);
    assert.equal(doc.textBetween(slash.from, slash.to), "/", source);
    assert.equal(slash.blockCommands, blocks, source);
    assert.equal(slash.endnote, endnote, source);
  }
  const code = docOf(nativeSource("```\n/\n```"));
  assert.equal(slashQueryAt(EditorState.create({ schema, doc: code, selection: TextSelection.create(code, 2) })), null);
});

test("slash keeps display prefix and number together, while ordinary queries still end at whitespace", () => {
  for (const query of ["Figure ", "Figure 2", "(3)", "Table 12"]) {
    const text = `See /${query}`;
    const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text(text)));
    const state = EditorState.create({ schema, doc, selection: TextSelection.create(doc, text.length + 1) });
    const slash = slashQueryAt(state);
    assert.ok(slash, query);
    assert.equal(slash.query, query);
    assert.equal(doc.textBetween(slash.from, slash.to), `/${query}`);
  }
  for (const query of ["그림 ", "그림 2", "식 (3)", "식 (", "식 (3"]) {
    const text = `See /${query}`;
    const doc = schema.nodes.doc.create({referenceTemplates: {figure: "그림 %s", equation: "식 (%s)"}}, schema.nodes.paragraph.create(null, schema.text(text)));
    const state = EditorState.create({schema, doc, selection: TextSelection.create(doc, text.length + 1)});
    assert.equal(slashQueryAt(state)?.query, query);
  }
  for (const template of ["Illustration %s of %s", "Illustration {number} of {subEnumerator}"]) {
    // Keep the menu open at every intermediate keystroke, including the repeated number.
    for (let length = 1; length <= "Illustration 1 of 1".length; length++) {
      const query = "Illustration 1 of 1".slice(0, length);
      const text = `See /${query}`;
      const doc = schema.nodes.doc.create({referenceTemplates: {figure: template}}, schema.nodes.paragraph.create(null, schema.text(text)));
      const state = EditorState.create({schema, doc, selection: TextSelection.create(doc, text.length + 1)});
      assert.equal(slashQueryAt(state)?.query, query, query);
    }
  }
  for (const text of ["/paragraph ", "/Fig. 2 more", "/Table data", "a/Fig. 2"]) {
    const doc = schema.nodes.doc.create(null, schema.nodes.paragraph.create(null, schema.text(text)));
    assert.equal(slashQueryAt(EditorState.create({ schema, doc, selection: TextSelection.create(doc, text.length + 1) })), null, text);
  }
});

test("selection formatting is offered only for a text selection inside one editable inline block", () => {
  const doc = docOf(nativeSource("# Title\n\nAB\n\nCD"));
  const at = (from: number, to: number) =>
    formattableSelection(EditorState.create({ schema, doc, selection: TextSelection.create(doc, from, to) }));
  const paragraph = positionOf(doc, "2");
  assert.deepEqual(at(paragraph + 1, paragraph + 3), { from: paragraph + 1, to: paragraph + 3 });
  assert.equal(at(paragraph + 1, paragraph + 1), null);
  // Headings hold formatted text too.
  assert.deepEqual(at(2, 4), { from: 2, to: 4 });
  assert.equal(at(paragraph + 1, positionOf(doc, "3") + 2), null);
});

test("delete command declares the removed snapshot blocks and keeps one block", () => {
  const markdown = nativeSource("AB\n\n# Heading\n\n$$\nx\n$$");
  const baseline = toTiptapDocument(loadEditableDocument(markdown));
  const state = EditorState.create({ schema, doc: docOf(markdown), plugins: [history(), structureGuardPlugin(baseline, noop)] });
  assert.equal(DELETE_COMMAND.enabled(state, 2), true);
  let next = state.apply(DELETE_COMMAND.run(state, 2));
  assert.deepEqual(declaredDeletions(next), ["3"]);
  // Deleting never rebuilds the top node, so NodeView state survives.
  assert.deepEqual(next.doc.attrs, state.doc.attrs);
  // Undo restores the block; the declaration stays harmless and redo reuses it.
  assert.equal(undo(next, tr => { next = next.apply(tr); }), true);
  assert.equal(next.doc.childCount, 3);
  assert.deepEqual(declaredDeletions(next), ["3"]);
  assert.equal(redo(next, tr => { next = next.apply(tr); }), true);
  const json = editorDocumentJSON(next);
  assert.doesNotThrow(() => assertSupportedDocumentChange(toTiptapDocument(loadEditableDocument(markdown)), json));
  assert.deepEqual(collectSupportedEdits(loadEditableDocument(markdown), json).deletes, [[3]]);

  // Undeclared loss of the same block is still rejected.
  const lost = structuredClone(json);
  lost.attrs = { deletedPaths: [] };
  assert.throws(() => assertSupportedDocumentChange(toTiptapDocument(loadEditableDocument(markdown)), lost), /block deletion is not allowed/);

  const single = EditorState.create({ schema, doc: docOf(nativeSource("A")) });
  assert.equal(DELETE_COMMAND.enabled(single, 0), false);
  assert.throws(() => DELETE_COMMAND.run(single, 0), /invalid block deletion/);
});

test("structure guard admits representable engine insertion and deletion as well as block commands", () => {
  const markdown = nativeSource("AB\n\n# Heading\n\n$$\nx\n$$");
  const doc = docOf(markdown);
  const baseline = toTiptapDocument(loadEditableDocument(markdown));
  let rejected = 0;
  const guard = structureGuardPlugin(baseline, () => rejected++);
  const state = EditorState.create({ schema, doc, plugins: [history(), guard] });
  const accepted = (tr: Transaction) => state.applyTransaction(tr).state !== state;
  assert.equal(accepted(DELETE_COMMAND.run(state, 2)), true);
  assert.equal(accepted(INSERT_COMMANDS[0].run(state, 0)), true);
  assert.equal(rejected, 0);

  const selected = EditorState.create({ schema, doc, selection: NodeSelection.create(doc, positionOf(doc, "3")), plugins: [guard] });
  let removed: Transaction | undefined;
  deleteSelection(selected, tr => { removed = tr; });
  assert.ok(removed);
  const deleted = selected.applyTransaction(removed).state;
  assert.notEqual(deleted, selected);
  assert.equal(saveEdits(markdown, collectSupportedEdits(loadEditableDocument(markdown), editorDocumentJSON(deleted))).markdown, nativeSource("AB\n\n# Heading\n"));
  const pasted = state.tr.insert(0, schema.nodes.paragraph.create({ sourcePath: "new:pasted" }, schema.text("X")));
  assert.equal(accepted(pasted), true);
  assert.equal(rejected, 0);
});

test("inserted and deleted blocks save through Core insertParagraph and removeBlock", () => {
  const markdown = nativeSource("AB\n\n# Heading\n\nCD\n\n$$\nx\n$$");
  const editable = loadEditableDocument(markdown);
  const next = toTiptapDocument(editable);
  next.attrs = { deletedPaths: ["2", "4"] };
  next.content = [
    next.content![0],
    { type: "paragraph", attrs: { sourcePath: "new:1" }, content: [
      { type: "text", text: "New", marks: [{ type: "bold" }] },
      { type: "hardBreak" },
      { type: "text", text: "line" },
    ] },
    next.content![2],
    { type: "paragraph", attrs: { sourcePath: "new:2" }, content: text("Tail") },
  ];
  const edits = collectSupportedEdits(editable, next);
  assert.deepEqual(edits.deletes, [[2], [4]]);
  assert.equal(edits.inserts?.length, 2);
  assert.deepEqual(edits.order, [{ path: [1], part: 0 }, { insert: 0 }, { path: [3], part: 0 }, { insert: 1 }]);
  const saved = saveEdits(markdown, edits);
  assert.equal(saved.markdown, nativeSource("AB\n\n**New**\\\nline\n\nCD\n\nTail\n"));
  assert.equal(serialize(parse(saved.markdown)), saved.markdown);
  const withoutPaths = (nodes: TiptapJSON[]) => nodes.map(node => ({ ...node, attrs: { ...node.attrs, sourcePath: "" } }));
  assert.deepEqual(withoutPaths(toTiptapDocument(loadEditableDocument(saved.markdown)).content!), withoutPaths(next.content!));
});

test("new paragraphs and headings split and merge while empty editor paragraphs stay transient", () => {
  const markdown = nativeSource("AB\n\nCD");
  const editable = loadEditableDocument(markdown);
  const merged = toTiptapDocument(editable);
  merged.content = [{ type: "paragraph", attrs: { sourcePath: "1;new:1" }, content: text("ABnew") }, merged.content![1]];
  const mergedEdits = collectSupportedEdits(editable, merged);
  assert.deepEqual(mergedEdits.paragraphs.map(edit => edit.path), [[1]]);
  assert.equal(mergedEdits.inserts, undefined);
  assert.equal(saveEdits(markdown, mergedEdits).markdown, nativeSource("ABnew\n\nCD\n"));

  const split = toTiptapDocument(editable);
  split.content!.push(
    { type: "paragraph", attrs: { sourcePath: "new:2" }, content: text("E") },
    { type: "paragraph", attrs: { sourcePath: "new:2" }, content: text("F") },
  );
  assert.equal(saveEdits(markdown, collectSupportedEdits(editable, split)).markdown, nativeSource("AB\n\nCD\n\nE\n\nF\n"));

  const empty = toTiptapDocument(editable);
  empty.content!.push({ type: "paragraph", attrs: { sourcePath: "new:3" } });
  assert.deepEqual(collectSupportedEdits(editable, empty), collectSupportedEdits(editable, toTiptapDocument(editable)));

  const heading = toTiptapDocument(editable);
  heading.content!.push({ type: "heading", attrs: { sourcePath: "new:4", level: 1 }, content: text("H") });
  assert.doesNotThrow(() => assertSupportedDocumentChange(toTiptapDocument(editable), heading));
  assert.deepEqual(collectSupportedEdits(editable, heading).inserts, [{ block: "heading", level: 1, content: [{ kind: "text", text: "H" }] }]);
});

test("invalid inserts and deletes never invoke the writer", () => {
  const markdown = nativeSource("A\n\n# Heading\n\nB");
  const revision = documentRevision(markdown);
  const paragraph = [{ kind: "text" as const, text: "X" }];
  const all = [{ path: [1], part: 0 }, { path: [2], part: 0 }, { path: [3], part: 0 }];
  const requests = [
    { deletes: [[1]] },
    { inserts: [{ block: "paragraph" as const, content: paragraph }] },
    { deletes: [[7]], order: all },
    { deletes: [[1], [1]], order: [all[0], all[2]] },
    { deletes: [[0]], paragraphs: [{ path: [1], content: paragraph }], order: [all[1], all[2]] },
    { inserts: [{ block: "paragraph" as const, content: [] }], order: [...all, { insert: 0 }] },
    { inserts: [{ block: "paragraph" as const, content: paragraph }], order: all },
    { deletes: [[1]], order: all },
  ];
  let writes = 0;
  for (const request of requests) {
    assert.throws(() => commitDocumentSave(() => markdown, () => writes++, { revision, ...request }));
  }
  assert.equal(writes, 0);
});

test("applied state ignores a new empty paragraph but detects subsequent typing", () => {
  const baseline = toTiptapDocument(loadEditableDocument(nativeSource("# Heading\n\nAB")));
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline) });
  const saved = appliedDocument(editorDocumentJSON(state));
  const withSpace = state.apply(state.tr.insert(state.doc.content.size,
    schema.nodes.paragraph.create({ sourcePath: "new:empty" })).setMeta(BLOCK_COMMAND_META, true));
  assert.deepEqual(appliedDocument(editorDocumentJSON(withSpace)), saved);
  const typed = withSpace.apply(withSpace.tr.insertText("X", withSpace.doc.content.size - 1));
  assert.notDeepEqual(appliedDocument(editorDocumentJSON(typed)), saved);
});

test("heading section commands move past sibling sections and delete a section, saving what Core moveSection/removeSection write", () => {
  // 0 # One · 1 (sec-a)= · 2 ## A · 3 read-only paragraph · 4 ### A.1 · 5 ## B · 6 Body B · 7 # Two
  const markdown = nativeSource("# One\n\n(sec-a)=\n## A\n\nRead **this**.\n\n### A.1\n\n## B\n\nBody B.\n\n# Two\n");
  const editable = loadEditableDocument(markdown);
  const baseline = toTiptapDocument(editable);
  let rejected = 0;
  const create = () => EditorState.create({ schema, doc: docOf(markdown), plugins: [history(), structureGuardPlugin(baseline, () => rejected++)] });
  const command = (id: string) => BLOCK_COMMANDS.find(entry => entry.id === id)!;
  const saved = (state: EditorState) => saveEdits(markdown, collectSupportedEdits(editable, editorDocumentJSON(state))).markdown;
  const state = create();
  // Only headings offer section commands; siblings share a level within the same parent.
  assert.equal(command("section-up").applies!(state, 3), false);
  assert.deepEqual(["section-up", "section-down", "section-delete"].map(id => command(id).enabled(state, 2)), [false, true, true]);
  assert.deepEqual(["section-up", "section-down"].map(id => command(id).enabled(state, 4)), [false, false]);
  // One is the title: Two cannot move above it, and the title's own section does not move (#255).
  assert.deepEqual(["section-up", "section-down"].map(id => command(id).enabled(state, 7)), [false, false]);
  assert.deepEqual(["section-up", "section-down"].map(id => command(id).enabled(state, 0)), [false, false]);

  // Section A (its target, read-only paragraph and A.1) moves below B in one undoable transaction.
  let moved = state.apply(command("section-down").run(state, 2));
  assert.deepEqual(moved.doc.content.content.map(node => node.textContent || node.type.name).slice(0, 3), ["One", "B", "Body B."]);
  assert.equal(rejected, 0);
  assert.equal(saved(moved), serialize(moveSection(parse(markdown), 3, 8)));
  assert.equal(undo(moved, tr => { moved = moved.apply(tr); }), true);
  assert.ok(moved.doc.eq(state.doc));

  const deleted = state.apply(command("section-delete").run(state, 2));
  assert.equal(rejected, 0);
  assert.equal(saved(deleted), serialize(removeSection(parse(markdown), 3)));
  // A section spanning the whole document is not deleted: the editor keeps a block.
  const only = EditorState.create({ schema, doc: docOf(nativeSource("# Only\n\nBody.\n")) });
  assert.equal(command("section-delete").enabled(only, 0), false);
});
