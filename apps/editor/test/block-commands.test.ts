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
import { parse, serialize } from "@ieumdoc/core";
import {
  BLOCK_COMMAND_META,
  BLOCK_COMMANDS,
  filterInsertCommands,
  formattableSelection,
  INSERT_COMMANDS,
  slashQueryAt,
} from "../src/block-commands.ts";
import { declaredDeletions, differsFromBaseline, editorDocumentJSON, editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import {
  assertSupportedDocumentChange,
  collectSupportedEdits,
  isNewBlockPath,
  toTiptapDocument,
  type TiptapJSON,
} from "../src/tiptap-document.ts";
import { commitDocumentSave, documentRevision, loadEditableDocument, saveEdits } from "../server/document-api.ts";

const editorRoot = fileURLToPath(new URL("..", import.meta.url));
const schema = getSchema(editorExtensions());
const noop = () => {};
const text = (value: string): TiptapJSON[] => [{ type: "text", text: value }];

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
  const state = EditorState.create({ schema, doc: docOf("AB\n\n# Heading") });
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

test("heading commands insert H1-H3 and place the caret inside the heading", () => {
  const state = EditorState.create({ schema, doc: docOf("AB") });
  const commands = INSERT_COMMANDS.filter(command => command.id.startsWith("heading-"));
  assert.deepEqual(commands.map(command => command.label), ["Heading 1", "Heading 2", "Heading 3"]);
  assert.deepEqual(filterInsertCommands("h2").map(command => command.id), ["heading-2"]);
  assert.deepEqual(filterInsertCommands("heading").map(command => command.id), ["heading-1", "heading-2", "heading-3"]);
  const next = state.apply(commands[1].run(state, 0));
  assert.deepEqual(next.doc.content.content.map(node => node.type.name), ["paragraph", "heading"]);
  assert.equal(next.doc.child(1).attrs.level, 2);
  assert.equal(next.selection.$from.parent.type.name, "heading");
  assert.equal(next.selection.$from.parentOffset, 0);
});

test("heading slash insertion replaces an otherwise-empty paragraph", () => {
  const initial = EditorState.create({ schema, doc: docOf("AB") });
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

test("slash command removes its query and shares the insert command list", () => {
  let state = EditorState.create({ schema, doc: docOf("AB"), selection: TextSelection.create(docOf("AB"), 3) });
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

  const empty = EditorState.create({ schema, doc: docOf("AB") });
  const emptyNext = empty.apply(INSERT_COMMANDS[0].run(empty, 0));
  const typed = emptyNext.apply(emptyNext.tr.insertText("/"));
  const emptySlash = slashQueryAt(typed)!;
  const reused = typed.apply(INSERT_COMMANDS[0].run(typed, emptySlash.index, emptySlash));
  assert.equal(reused.doc.childCount, 2);
  assert.equal(reused.doc.child(1).content.size, 0);

  const inWord = docOf("a/b");
  assert.equal(slashQueryAt(EditorState.create({ schema, doc: inWord, selection: TextSelection.create(inWord, 3) })), null);
  const heading = docOf("# /");
  assert.equal(slashQueryAt(EditorState.create({ schema, doc: heading, selection: TextSelection.create(heading, 2) })), null);
});

test("selection formatting is offered only for a text selection inside one paragraph", () => {
  const doc = docOf("# Title\n\nAB\n\nCD");
  const at = (from: number, to: number) =>
    formattableSelection(EditorState.create({ schema, doc, selection: TextSelection.create(doc, from, to) }));
  const paragraph = positionOf(doc, "1");
  assert.deepEqual(at(paragraph + 1, paragraph + 3), { from: paragraph + 1, to: paragraph + 3 });
  assert.equal(at(paragraph + 1, paragraph + 1), null);
  assert.equal(at(2, 4), null);
  assert.equal(at(paragraph + 1, positionOf(doc, "2") + 2), null);
});

test("delete command declares the removed snapshot blocks and keeps one block", () => {
  const markdown = "AB\n\n# Heading\n\n$$\nx\n$$";
  const baseline = toTiptapDocument(loadEditableDocument(markdown));
  const state = EditorState.create({ schema, doc: docOf(markdown), plugins: [history(), structureGuardPlugin(baseline, noop)] });
  assert.equal(BLOCK_COMMANDS[0].enabled(state, 2), true);
  let next = state.apply(BLOCK_COMMANDS[0].run(state, 2));
  assert.deepEqual(declaredDeletions(next), ["2"]);
  // Deleting never rebuilds the top node, so NodeView state survives.
  assert.deepEqual(next.doc.attrs, state.doc.attrs);
  // Undo restores the block; the declaration stays harmless and redo reuses it.
  assert.equal(undo(next, tr => { next = next.apply(tr); }), true);
  assert.equal(next.doc.childCount, 3);
  assert.deepEqual(declaredDeletions(next), ["2"]);
  assert.equal(redo(next, tr => { next = next.apply(tr); }), true);
  const json = editorDocumentJSON(next);
  assert.doesNotThrow(() => assertSupportedDocumentChange(toTiptapDocument(loadEditableDocument(markdown)), json));
  assert.deepEqual(collectSupportedEdits(loadEditableDocument(markdown), json).deletes, [[2]]);

  // Undeclared loss of the same block is still rejected.
  const lost = structuredClone(json);
  lost.attrs = { deletedPaths: [] };
  assert.throws(() => assertSupportedDocumentChange(toTiptapDocument(loadEditableDocument(markdown)), lost), /block deletion is not allowed/);

  const single = EditorState.create({ schema, doc: docOf("A") });
  assert.equal(BLOCK_COMMANDS[0].enabled(single, 0), false);
  assert.throws(() => BLOCK_COMMANDS[0].run(single, 0), /invalid block deletion/);
});

test("structure guard admits insert and delete only from block commands", () => {
  const markdown = "AB\n\n# Heading\n\n$$\nx\n$$";
  const doc = docOf(markdown);
  const baseline = toTiptapDocument(loadEditableDocument(markdown));
  let rejected = 0;
  const guard = structureGuardPlugin(baseline, () => rejected++);
  const state = EditorState.create({ schema, doc, plugins: [history(), guard] });
  const accepted = (tr: Transaction) => state.applyTransaction(tr).state !== state;
  assert.equal(accepted(BLOCK_COMMANDS[0].run(state, 2)), true);
  assert.equal(accepted(INSERT_COMMANDS[0].run(state, 0)), true);
  assert.equal(rejected, 0);

  const selected = EditorState.create({ schema, doc, selection: NodeSelection.create(doc, positionOf(doc, "2")), plugins: [guard] });
  let removed: Transaction | undefined;
  deleteSelection(selected, tr => { removed = tr; });
  assert.ok(removed);
  assert.equal(selected.applyTransaction(removed).state, selected);
  const pasted = state.tr.insert(0, schema.nodes.paragraph.create({ sourcePath: "new:pasted" }, schema.text("X")));
  assert.equal(accepted(pasted), false);
  assert.equal(rejected, 2);
});

test("inserted and deleted blocks save through Core insertParagraph and removeBlock", () => {
  const markdown = "AB\n\n# Heading\n\nCD\n\n$$\nx\n$$";
  const editable = loadEditableDocument(markdown);
  const next = toTiptapDocument(editable);
  next.attrs = { deletedPaths: ["1", "3"] };
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
  assert.deepEqual(edits.deletes, [[1], [3]]);
  assert.equal(edits.inserts?.length, 2);
  assert.deepEqual(edits.order, [{ path: [0], part: 0 }, { insert: 0 }, { path: [2], part: 0 }, { insert: 1 }]);
  const saved = saveEdits(markdown, edits);
  assert.equal(saved.markdown, "AB\n\n**New**\\\nline\n\nCD\n\nTail\n");
  assert.equal(serialize(parse(saved.markdown)), saved.markdown);
  const withoutPaths = (nodes: TiptapJSON[]) => nodes.map(node => ({ ...node, attrs: { ...node.attrs, sourcePath: "" } }));
  assert.deepEqual(withoutPaths(toTiptapDocument(saved.document).content!), withoutPaths(next.content!));
});

test("new paragraphs and headings split, merge, and reject empty saves", () => {
  const markdown = "AB\n\nCD";
  const editable = loadEditableDocument(markdown);
  const merged = toTiptapDocument(editable);
  merged.content = [{ type: "paragraph", attrs: { sourcePath: "0;new:1" }, content: text("ABnew") }, merged.content![1]];
  const mergedEdits = collectSupportedEdits(editable, merged);
  assert.deepEqual(mergedEdits.paragraphs.map(edit => edit.path), [[0]]);
  assert.equal(mergedEdits.inserts, undefined);
  assert.equal(saveEdits(markdown, mergedEdits).markdown, "ABnew\n\nCD\n");

  const split = toTiptapDocument(editable);
  split.content!.push(
    { type: "paragraph", attrs: { sourcePath: "new:2" }, content: text("E") },
    { type: "paragraph", attrs: { sourcePath: "new:2" }, content: text("F") },
  );
  assert.equal(saveEdits(markdown, collectSupportedEdits(editable, split)).markdown, "AB\n\nCD\n\nE\n\nF\n");

  const empty = toTiptapDocument(editable);
  empty.content!.push({ type: "paragraph", attrs: { sourcePath: "new:3" } });
  assert.throws(() => collectSupportedEdits(editable, empty), /empty paragraph cannot be saved/);

  const heading = toTiptapDocument(editable);
  heading.content!.push({ type: "heading", attrs: { sourcePath: "new:4", level: 1 }, content: text("H") });
  assert.doesNotThrow(() => assertSupportedDocumentChange(toTiptapDocument(editable), heading));
  assert.deepEqual(collectSupportedEdits(editable, heading).inserts, [{ block: "heading", level: 1, text: "H" }]);
});

test("invalid inserts and deletes never invoke the writer", () => {
  const markdown = "A\n\n# Heading\n\nB";
  const revision = documentRevision(markdown);
  const paragraph = [{ kind: "text" as const, text: "X" }];
  const all = [{ path: [0], part: 0 }, { path: [1], part: 0 }, { path: [2], part: 0 }];
  const requests = [
    { deletes: [[1]] },
    { inserts: [{ block: "paragraph" as const, content: paragraph }] },
    { deletes: [[7]], order: all },
    { deletes: [[1], [1]], order: [all[0], all[2]] },
    { deletes: [[0]], paragraphs: [{ path: [0], content: paragraph }], order: [all[1], all[2]] },
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

test("a freshly loaded document with headings has no unsaved changes", () => {
  const baseline = toTiptapDocument(loadEditableDocument("# Heading\n\nAB"));
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline) });
  // Projection and engine JSON order heading attributes differently.
  assert.notEqual(JSON.stringify(state.doc.toJSON()), JSON.stringify(baseline));
  assert.equal(differsFromBaseline(state, baseline), false);
  assert.equal(differsFromBaseline(state.apply(state.tr.insertText("X", 1)), baseline), true);
});

test("editor shell keeps application UI out of the document editor", () => {
  const app = readFileSync(path.join(editorRoot, "src", "App.tsx"), "utf8");
  assert.doesNotMatch(app, /file-picker|format-bar|equation-draft-notice/);
  assert.match(app, /<Sidebar[\s\S]*<TopBar[\s\S]*<MessageArea[\s\S]*<main className="document-column">[\s\S]*<OpenDialog/);
  const documentEditor = readFileSync(path.join(editorRoot, "src", "DocumentEditor.tsx"), "utf8");
  assert.doesNotMatch(documentEditor, /format-bar|toggleBold|toggleItalic/);
  // `+` and `/` open the same menu component over the same insert commands.
  assert.equal(documentEditor.match(/<CommandMenu/g)?.length, 3);
  assert.match(documentEditor, /items=\{INSERT_COMMANDS\}/);
  assert.match(documentEditor, /filterInsertCommands\(slash\.query\)/);
  assert.equal(documentEditor.match(/runInsert\(/g)?.length, 3);
  const schemaSource = readFileSync(path.join(editorRoot, "src", "editor-schema.tsx"), "utf8");
  assert.match(schemaSource, /data-testid="equation-draft-status"/);
  assert.match(schemaSource, /data-testid="figure-properties"/);
});
