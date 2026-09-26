import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { history, undo, redo } from "@tiptap/pm/history";
import { mapSavedRanges, reorderBlock, type SavedRange } from "../src/block-reorder.ts";
import { getSchema } from "@tiptap/core";
import { deleteSelection, joinBackward, splitBlock } from "@tiptap/pm/commands";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import {
  canonicalWriteError,
  getEditableDocument,
  inspectDocument,
  insertParagraph,
  moveBlock,
  parse,
  removeBlock,
  serialize,
  type Document,
  type InlineContent,
} from "@ieumdoc/core";
import { editorExtensions, isUnappliedEquationDraft, resolveFigureSource } from "../src/editor-schema.tsx";
import { renderEquation } from "../src/equation-render.ts";
import { remapSavedRanges } from "../src/DocumentEditor.tsx";
import { fromTiptapContent, toTiptapContent, type TiptapJSON } from "../src/tiptap-inline.ts";
import {
  assertSupportedDocumentChange,
  collectSupportedEdits,
  isSupportedDocumentChange,
  toTiptapDocument,
} from "../src/tiptap-document.ts";
import {
  commitDocumentSave,
  createDocumentFile,
  documentRevision,
  DocumentConflictError,
  handleDocumentRequest,
  loadDocumentFile,
  loadEditableDocument,
  previewDocumentFile,
  resolveMediaPath,
  resolveDocumentPath,
  saveCurrentDocument,
  saveDocumentFile,
  saveEdits,
} from "../server/document-api.ts";

const editorRoot = fileURLToPath(new URL("..", import.meta.url));
const fixture = fileURLToPath(
  new URL("../../../packages/core/test/fixtures/technical-document.md", import.meta.url),
);

const FORMATTED_PARAGRAPH = "The converter regulates the DC-link voltage and phase current.";
const PARAGRAPH_FROM = "The current reference is calculated from the active power command.";
const PARAGRAPH_TO = "The current reference follows the active power command.";
const HEADING_FROM = "Converter Control";
const HEADING_TO = "Converter Controls";

const PRESERVED_INDEXES = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12];

const source = readFileSync(fixture, "utf8");

test("Editor uses the Core read model", () => {
  const document = loadEditableDocument(source);
  assert.deepEqual(document, getEditableDocument(parse(source)));
  assert.equal(
    document.blocks.some((block) => block.block === "paragraph" && block.editable && block.text === PARAGRAPH_FROM),
    true,
  );
  assert.equal(
    document.blocks.some((block) => block.block === "heading" && block.editable && block.text === HEADING_FROM),
    true,
  );
});

test("one Tiptap editor owns the document", () => {
  const files = listSourceFiles(path.join(editorRoot, "src"));
  const owners = files.filter((file) => /\buseEditor\s*\(/.test(readFileSync(file, "utf8")));
  assert.deepEqual(
    owners.map((file) => path.basename(file)),
    ["DocumentEditor.tsx"],
  );
});

test("technical document projects to one typed Tiptap document", () => {
  const projection = toTiptapDocument(loadEditableDocument(source));
  assert.deepEqual(
    (projection.content ?? []).map((block) => block.type),
    [
      "heading",
      "paragraph",
      "readonlyParagraph",
      "heading",
      "admonition",
      "heading",
      "figure",
      "heading",
      "paragraph",
      "equation",
      "readonlyParagraph",
      "heading",
      "table",
    ],
  );
  const figure = projection.content?.find((block) => block.type === "figure");
  assert.equal(figure?.attrs?.label, "fig-control");
  assert.equal(figure?.attrs?.imageUrl, "./diagram.svg");
  assert.equal(figure?.attrs?.imageAlt, "Control block diagram");
  assert.equal(figure?.attrs?.caption, "Control block diagram of the grid-connected converter.");
  const equation = projection.content?.find((block) => block.type === "equation");
  assert.equal(equation?.attrs?.label, "eq-current");
  assert.equal(String(equation?.attrs?.latex ?? "").includes("P^{"), true);
  const admonition = projection.content?.find((block) => block.type === "admonition");
  assert.equal(admonition?.attrs?.variant, "warning");
  const table = projection.content?.find((block) => block.type === "table");
  const rows = table?.content ?? [];
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0]?.content?.map((cell) => [cell.type, cell.attrs?.header]), [["tableCell", true], ["tableCell", true]]);
  assert.deepEqual(rows[1]?.content?.[1], { type: "tableCell", attrs: { header: false }, content: [{ type: "text", text: "AC" }] });
});

test("projected technical document round-trips through the Tiptap schema without semantic edits", () => {
  const editable = loadEditableDocument(source);
  const projection = toTiptapDocument(editable);
  const normalized = normalizedDocument(projection);
  assert.equal(isSupportedDocumentChange(projection, normalized), true);
  assert.deepEqual(collectSupportedEdits(editable, normalized), { headings: [], paragraphs: [] });
});

test("Equation LaTeX and label are the editable Equation attributes", () => {
  const baseline = toTiptapDocument(loadEditableDocument(source));
  const changed = clone(baseline);
  const equation = blockAt(changed, "9");
  equation.attrs!.latex = `${String(equation.attrs!.latex)} + 1`;
  assert.doesNotThrow(() => assertSupportedDocumentChange(baseline, changed));
  const edits = collectSupportedEdits(loadEditableDocument(source), changed);
  assert.deepEqual(edits.equations, [{ path: [9], from: String(baseline.content?.find(block => block.attrs?.sourcePath === "9")?.attrs?.latex), to: `${String(equation.attrs!.latex)}` }]);

  // The label is an authored target name, collected separately from the LaTeX.
  const labelChanged = clone(baseline);
  blockAt(labelChanged, "9").attrs!.label = "other";
  assert.doesNotThrow(() => assertSupportedDocumentChange(baseline, labelChanged));
  const labelEdits = collectSupportedEdits(loadEditableDocument(source), labelChanged);
  assert.deepEqual(labelEdits.labels, [{ path: [9], from: "eq-current", to: "other" }]);
  assert.equal(labelEdits.equations, undefined);
  const identity = clone(baseline);
  blockAt(identity, "9").attrs!.sourcePath = "new:x";
  assert.throws(() => assertSupportedDocumentChange(baseline, identity));
  const nonString = clone(baseline);
  blockAt(nonString, "9").attrs!.label = 1;
  assert.throws(() => assertSupportedDocumentChange(baseline, nonString), /label must be a string/);
});

test("Equation renderer displays valid LaTeX and fails closed on invalid input", () => {
  const latex = "x^2 + 1";
  const rendered = renderEquation(latex);
  assert.equal(rendered.error, undefined);
  assert.match(rendered.html ?? "", /katex/);

  const invalid = "\\notARealKaTeXCommand";
  const failed = renderEquation(invalid);
  assert.equal(failed.html, undefined);
  assert.match(failed.error ?? "", /notARealKaTeXCommand|KaTeX/i);
  assert.equal(invalid, "\\notARealKaTeXCommand");
});

test("an open Equation draft blocks saving only when it differs from the applied LaTeX", () => {
  assert.equal(isUnappliedEquationDraft(false, "x + 1", "x"), false);
  assert.equal(isUnappliedEquationDraft(true, "x", "x"), false);
  assert.equal(isUnappliedEquationDraft(true, "x + 1", "x"), true);
  assert.equal(isUnappliedEquationDraft(true, "", "x"), true);
  assert.equal(isUnappliedEquationDraft(true, "", "", "new:equation"), true);
  assert.equal(isUnappliedEquationDraft(false, "", "", "new:equation"), false);
});

test("top Save is guarded and Equation draft reporting is wired before persistence", () => {
  const app = readFileSync(path.join(editorRoot, "src", "App.tsx"), "utf8");
  const guard = app.indexOf("if (equationDraftActive) return;");
  const begin = app.indexOf("beginSave()");
  const post = app.indexOf('requestDocument("POST"');
  assert.ok(guard >= 0);
  assert.ok(begin > guard);
  assert.ok(post > guard);
  assert.match(app, /Apply or Cancel the Equation edit before saving\./);

  const documentEditor = readFileSync(path.join(editorRoot, "src", "DocumentEditor.tsx"), "utf8");
  assert.match(documentEditor, /onEquationDraftChange/);
  assert.match(documentEditor, /activeEquationDrafts\.current\.size > 0/);
  assert.match(documentEditor, /createEditorExtensions\(\(\) => baseline\.current, onStructuralReject, reportEquationDraft, documentPath, reportFigureDraft, validateFigure\)/);
  assert.match(documentEditor, /hasUnappliedEquationDraft\(\)/);

  const schema = readFileSync(path.join(editorRoot, "src", "editor-schema.tsx"), "utf8");
  assert.match(schema, /onDraftChange\?\.\(sourcePath, hasUnappliedDraft\)/);
  assert.match(schema, /return \(\) => onDraftChange\?\.\(sourcePath, false\)/);
  assert.match(schema, /isUnappliedEquationDraft\(editing, draft, latex, sourcePath\)/);
});

test("a pending Source preview blocks Open and New, so it cannot land on another document", () => {
  const app = readFileSync(path.join(editorRoot, "src", "App.tsx"), "utf8");
  const busy = app.slice(app.indexOf("const busy ="), app.indexOf(";", app.indexOf("const busy =")));
  assert.match(busy, /sourcePending/);
  for (const name of ["openFile", "createFile"]) {
    const start = app.indexOf(`async function ${name}(`);
    assert.match(app.slice(start, app.indexOf("\n  }\n", start)), /if \(busy\) return "Wait for the current operation to finish\."/);
  }
  assert.match(app, /<OpenDialog[\s\S]*?busy=\{busy\}/);
  assert.match(app, /<NewDialog[\s\S]*?busy=\{busy\}/);
});

test("a save response keeps an Equation draft pending and avoids an editor remount", () => {
  const app = readFileSync(path.join(editorRoot, "src", "App.tsx"), "utf8");
  const saveStart = app.indexOf("async function save()");
  const saveEnd = app.indexOf("async function createFile", saveStart);
  const saveFn = app.slice(saveStart, saveEnd);
  assert.match(saveFn, /hasPendingEquationDraft/);
  assert.match(saveFn, /hasPendingUserState = hasPendingDocumentEdits \|\| hasPendingEquationDraft/);
  assert.match(saveFn, /finishSave\(hasPendingUserState \? next\.document : undefined\)/);
  assert.match(saveFn, /if \(!hasPendingUserState\) setEditorGeneration/);
});

test("Core InlineContent converts to and from Tiptap content", () => {
  const original: InlineContent[] = [
    { kind: "text", text: "The converter regulates the " },
    { kind: "strong", children: [{ kind: "text", text: "DC-link voltage" }] },
    { kind: "text", text: " and " },
    { kind: "emphasis", children: [{ kind: "text", text: "phase current" }] },
    {
      kind: "strong",
      children: [{ kind: "emphasis", children: [{ kind: "text", text: "with both marks" }] }],
    },
    { kind: "text", text: "." },
  ];
  const tiptap = toTiptapContent(original);
  assert.equal(tiptap.type, "doc");
  assert.equal(tiptap.content?.[0]?.type, "paragraph");
  // Flat marks are regrouped with the longest-covering mark outermost; the rendered
  // text and mark coverage are the same, and the Tiptap form is stable.
  assert.deepEqual(fromTiptapContent(tiptap), [
    { kind: "text", text: "The converter regulates the " },
    { kind: "strong", children: [{ kind: "text", text: "DC-link voltage" }] },
    { kind: "text", text: " and " },
    {
      kind: "emphasis",
      children: [
        { kind: "text", text: "phase current" },
        { kind: "strong", children: [{ kind: "text", text: "with both marks" }] },
      ],
    },
    { kind: "text", text: "." },
  ]);
  assert.deepEqual(toTiptapContent(fromTiptapContent(tiptap)), tiptap);

  const linked: InlineContent[] = [
    { kind: "text", text: "See " },
    { kind: "link", url: "https://openai.com", title: "Home", children: [{ kind: "text", text: "OpenAI" }] },
    { kind: "strong", children: [{ kind: "text", text: " a " }, { kind: "link", url: "u", children: [{ kind: "text", text: "b" }] }] },
    { kind: "link", url: "v", children: [{ kind: "strong", children: [{ kind: "text", text: "c" }] }, { kind: "text", text: " d" }] },
  ];
  assert.deepEqual(fromTiptapContent(toTiptapContent(linked)), linked);
});

test("Tiptap adapter accepts plain, bold, italic, and combined marks", () => {
  const content = fromTiptapContent({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "plain" },
          { type: "text", text: "bold", marks: [{ type: "bold" }] },
          { type: "text", text: "italic", marks: [{ type: "italic" }] },
          {
            type: "text",
            text: "both",
            marks: [{ type: "bold" }, { type: "italic" }],
          },
        ],
      },
    ],
  });

  // Italic covers "italic" and "both", so it is the outer mark of that run.
  assert.deepEqual(content, [
    { kind: "text", text: "plain" },
    { kind: "strong", children: [{ kind: "text", text: "bold" }] },
    {
      kind: "emphasis",
      children: [{ kind: "text", text: "italic" }, { kind: "strong", children: [{ kind: "text", text: "both" }] }],
    },
  ]);
  assert.deepEqual(fromTiptapContent({ type: "doc", content: [{ type: "paragraph" }] }), []);
});

test("Tiptap adapter rejects multiple paragraphs and unsupported nodes", () => {
  assert.throws(
    () =>
      fromTiptapContent({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "A" }] },
          { type: "paragraph", content: [{ type: "text", text: "B" }] },
        ],
      }),
    /exactly one paragraph/,
  );
  assert.throws(
    () => fromTiptapContent({ type: "doc", content: [{ type: "heading" }] }),
    /expected paragraph/,
  );
  assert.throws(
    () =>
      fromTiptapContent({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "image" }] }],
      }),
    /unsupported Tiptap node "image"/,
  );
});

test("Tiptap adapter rejects unsupported marks", () => {
  // `link` is supported but must carry a URL.
  assert.throws(() => fromTiptapContent({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link" }] }] }],
  }), /link at paragraph child 0 requires a URL/);
  for (const mark of ["underline", "strike", "code", "unknown"]) {
    assert.throws(
      () =>
        fromTiptapContent({
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "unsupported", marks: [{ type: mark }] }] },
          ],
        }),
      new RegExp(`unsupported Tiptap mark "${mark}"`),
    );
  }
});

test("document adapter rejects unknown blocks, inlines, and marks", () => {
  const baseline = toTiptapDocument(loadEditableDocument(source));
  const unknownBlock = clone(baseline);
  const first = unknownBlock.content?.[0];
  assert.ok(first);
  first.type = "blockquote";
  assert.throws(() => assertSupportedDocumentChange(baseline, unknownBlock), /unsupported Tiptap block "blockquote"/);

  const unknownInline = clone(baseline);
  const paragraph = blockAt(unknownInline, "8");
  paragraph.content = [{ type: "image" }];
  assert.throws(() => assertSupportedDocumentChange(baseline, unknownInline), /unsupported Tiptap node "image"/);

  const unknownMark = clone(baseline);
  blockAt(unknownMark, "8").content = [{ type: "text", text: "unsupported", marks: [{ type: "underline" }] }];
  assert.throws(() => assertSupportedDocumentChange(baseline, unknownMark), /unsupported Tiptap mark "underline"/);
});

test("document adapter accepts reorder but rejects readonly mutation, insertion, and deletion", () => {
  const baseline = toTiptapDocument(loadEditableDocument(source));

  const mutated = clone(baseline);
  const equation = blockAt(mutated, "9");
  assert.ok(equation.attrs);
  equation.attrs.latex = "changed";
    assert.doesNotThrow(() => assertSupportedDocumentChange(baseline, mutated));

  const readonlyParagraph = clone(baseline);
  const reference = blockAt(readonlyParagraph, "2");
  assert.ok(reference.attrs);
  reference.attrs.text = "flattened";
  assert.throws(() => assertSupportedDocumentChange(baseline, readonlyParagraph), /read-only block changed/);

  const reordered = clone(baseline);
  const content = reordered.content ?? [];
  const swapped = content[0];
  content[0] = content[1];
  content[1] = swapped;
  assert.doesNotThrow(() => assertSupportedDocumentChange(baseline, reordered));
  assert.ok(collectSupportedEdits(loadEditableDocument(source), reordered).order);

  const inserted = clone(baseline);
  inserted.content = [...(inserted.content ?? []), { type: "paragraph", attrs: { sourcePath: "99" } }];
  assert.throws(() => assertSupportedDocumentChange(baseline, inserted), /block insertion/);

  const deleted = clone(baseline);
  deleted.content = (deleted.content ?? []).slice(0, -1);
  assert.throws(() => assertSupportedDocumentChange(baseline, deleted), /block deletion is not allowed/);
});

test("paragraph split stays in its original snapshot group", () => {
  const baseline = toTiptapDocument(loadEditableDocument(source));
  const split = clone(baseline);
  const content = split.content ?? [];
  const index = content.findIndex((block) => block.attrs?.sourcePath === "8");
  const paragraph = content[index];
  assert.ok(paragraph);
  content.splice(index + 1, 0, {
    type: "paragraph",
    attrs: { sourcePath: "8" },
    content: [{ type: "text", text: "tail" }],
  });
  assert.doesNotThrow(() => assertSupportedDocumentChange(baseline, split));

  const { doc, schema } = schemaDocument();
  const paragraphPos = positionOf(doc, "paragraph", "8");
  const state = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, paragraphPos + 1),
  });
  const dispatched = dispatchOf(splitBlock, state);
  assert.equal(dispatched.applied, true);
  assert.equal(isSupportedDocumentChange(baseline, dispatched.transaction?.doc.toJSON() as TiptapJSON), false);
});

test("an empty split sibling becomes a new heading insertion without converting the paragraph", () => {
  const markdown = "Original paragraph\n";
  const editable = loadEditableDocument(markdown);
  const split = toTiptapDocument(editable);
  split.content!.push({ type: "paragraph", attrs: { sourcePath: "new:split:end" } });
  assert.equal(split.content![0].attrs?.sourcePath, "0");
  assert.equal(split.content![1].attrs?.sourcePath, "new:split:end");
  assert.doesNotThrow(() => assertSupportedDocumentChange(toTiptapDocument(editable), split));

  const heading = clone(split);
  heading.content![1] = {
    type: "heading",
    attrs: { sourcePath: "new:split:end", level: 2 },
    content: [{ type: "text", text: "Inserted heading" }],
  };
  assert.doesNotThrow(() => assertSupportedDocumentChange(toTiptapDocument(editable), heading));
  const edits = collectSupportedEdits(editable, heading);
  assert.deepEqual(edits.inserts, [{ block: "heading", level: 2, text: "Inserted heading" }]);
  const saved = saveEdits(markdown, edits);
  assert.deepEqual(saved.document.blocks.map((block) => block.block), ["paragraph", "heading"]);
  assert.deepEqual(saved.document.blocks[1], {
    block: "heading",
    path: [1],
    level: 2,
    text: "Inserted heading",
    editable: true,
  });
  assert.equal(serialize(parse(saved.markdown)), saved.markdown);

  const conversion = clone(toTiptapDocument(editable));
  conversion.content![0] = {
    type: "heading",
    attrs: { sourcePath: "0", level: 2 },
    content: [{ type: "text", text: "Not a conversion" }],
  };
  assert.throws(() => assertSupportedDocumentChange(toTiptapDocument(editable), conversion), /top-level block type changed/);
});

test("ProseMirror block-boundary and read-only deletions are rejected", () => {
  const baseline = toTiptapDocument(loadEditableDocument(source));
  const { doc, schema } = schemaDocument();

  const paragraphPos = positionOf(doc, "paragraph", "1");
  const atStart = EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, paragraphPos + 1),
  });
  const joined = dispatchOf(joinBackward, atStart);
  if (joined.applied && joined.transaction?.docChanged) {
    assert.equal(isSupportedDocumentChange(baseline, joined.transaction.doc.toJSON() as TiptapJSON), false);
  }

  for (const [type, sourcePath] of [
    ["equation", "9"],
    ["figure", "6"],
  ] as const) {
    const pos = positionOf(doc, type, sourcePath);
    const selected = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, pos),
    });
    const removed = dispatchOf(deleteSelection, selected);
    if (removed.applied && removed.transaction?.docChanged) {
      assert.equal(isSupportedDocumentChange(baseline, removed.transaction.doc.toJSON() as TiptapJSON), false);
    } else {
      assert.equal(removed.transaction?.docChanged ?? false, false);
    }
  }
});

test("formatted paragraph is an editable target", () => {
  const document = loadEditableDocument(source);
  const formatted = document.blocks.find(
    (block) => block.block === "paragraph" && block.text === FORMATTED_PARAGRAPH,
  );
  assert.equal(formatted?.block, "paragraph");
  if (formatted?.block !== "paragraph") return;
  assert.equal(formatted.editable, true);
  const projection = toTiptapDocument(document);
  assert.equal(blockAt(projection, formatted.path.join(",")).type, "paragraph");
});

test("unsupported paragraph stays read-only", () => {
  const document = loadEditableDocument(source);
  const xref = document.blocks.find((block) => block.block === "paragraph" && block.text.includes("fig-control"));
  assert.equal(xref?.block, "paragraph");
  if (xref?.block !== "paragraph") return;
  assert.equal(xref.editable, false);
  assert.equal(blockAt(toTiptapDocument(document), xref.path.join(",")).type, "readonlyParagraph");
});

test("save validates supported edits before POST", () => {
  const app = readFileSync(path.join(editorRoot, "src", "App.tsx"), "utf8");
  const guard = app.indexOf("collectSupportedEdits(");
  const post = app.indexOf('requestDocument("POST"');
  assert.ok(guard >= 0);
  assert.ok(post > guard);
});

test("selected Markdown files keep load, save, and revision boundaries", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-open-files-"));
  const fileA = path.join(dir, "a.md");
  const fileB = path.join(dir, "b.md");
  try {
    writeFileSync(fileA, "Document A\n");
    writeFileSync(fileB, "Document B\n");
    const loadedA = loadDocumentFile(fileA);
    const loadedB = loadDocumentFile(fileB);
    assert.equal(loadedA.path, path.resolve(fileA));
    assert.equal(loadedB.path, path.resolve(fileB));
    assert.equal(loadedA.document.blocks[0]?.block, "paragraph");
    assert.equal(loadedB.document.blocks[0]?.block, "paragraph");
    if (loadedA.document.blocks[0]?.block !== "paragraph" || loadedB.document.blocks[0]?.block !== "paragraph") return;
    assert.equal(loadedA.document.blocks[0].text, "Document A");
    assert.equal(loadedB.document.blocks[0].text, "Document B");

    const savedA = saveDocumentFile(fileA, {
      revision: loadedA.revision,
      paragraphs: [{ path: [0], content: [{ kind: "text", text: "Document A changed" }] }],
    });
    assert.equal(readFileSync(fileA, "utf8"), "Document A changed\n");
    assert.equal(readFileSync(fileB, "utf8"), "Document B\n");
    assert.equal(savedA.document.blocks[0]?.block, "paragraph");
    if (savedA.document.blocks[0]?.block !== "paragraph") return;
    assert.equal(savedA.document.blocks[0].text, "Document A changed");

    writeFileSync(fileA, "Document A external\n");
    assert.throws(
      () => saveDocumentFile(fileA, {
        revision: savedA.revision,
        paragraphs: [{ path: [0], content: [{ kind: "text", text: "stale" }] }],
      }),
      DocumentConflictError,
    );
    assert.equal(readFileSync(fileA, "utf8"), "Document A external\n");
    assert.throws(() => resolveDocumentPath(path.join(dir, "not-markdown.txt")), /\.md file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("empty documents project to a transient paragraph without persisting empty content", () => {
  const editable = loadEditableDocument("\n");
  const projection = toTiptapDocument(editable);
  assert.deepEqual(projection.content, [{ type: "paragraph", attrs: { sourcePath: "new:empty" } }]);
  assert.deepEqual(collectSupportedEdits(editable, projection), { headings: [], paragraphs: [] });

  const typed = clone(projection);
  typed.content![0].content = [{ type: "text", text: "Draft" }];
  assert.deepEqual(collectSupportedEdits(editable, typed), {
    headings: [],
    paragraphs: [],
    inserts: [{ block: "paragraph", content: [{ kind: "text", text: "Draft" }] }],
    order: [{ insert: 0 }],
  });
});

test("empty saves skip transient range remapping and keep later inserts representable", () => {
  assert.deepEqual(
    remapSavedRanges([{ start: 0, end: 2, path: "0" }], { blocks: [] }),
    [],
  );
  const editable = loadEditableDocument("\n");
  const projected = toTiptapDocument(editable);
  assert.deepEqual(collectSupportedEdits(editable, projected), { headings: [], paragraphs: [] });
  const typed = clone(projected);
  typed.content![0].content = [{ type: "text", text: "After empty save" }];
  assert.deepEqual(collectSupportedEdits(editable, typed).inserts, [
    { block: "paragraph", content: [{ kind: "text", text: "After empty save" }] },
  ]);
});

test("new heading inserts save and reload through Core semantics", () => {
  const editable = loadEditableDocument("Intro\n");
  const next = toTiptapDocument(editable);
  next.content!.push({
    type: "heading",
    attrs: { sourcePath: "new:heading", level: 2 },
    content: [{ type: "text", text: "Details" }],
  });
  const edits = collectSupportedEdits(editable, next);
  assert.deepEqual(edits.inserts, [{ block: "heading", level: 2, text: "Details" }]);
  const saved = saveEdits("Intro\n", edits);
  assert.equal(saved.markdown, "Intro\n\n## Details\n");
  assert.deepEqual(saved.document.blocks[1], {
    block: "heading",
    path: [1],
    level: 2,
    text: "Details",
    editable: true,
  });
  assert.equal(serialize(parse(saved.markdown)), saved.markdown);

  const empty = toTiptapDocument(editable);
  empty.content!.push({ type: "heading", attrs: { sourcePath: "new:empty-heading", level: 1 } });
  assert.throws(() => collectSupportedEdits(editable, empty), /empty heading cannot be saved/);
  assert.throws(
    () => saveEdits("Intro\n", {
      headings: [],
      paragraphs: [],
      inserts: [{ block: "heading", level: 1, text: "" }],
      order: [{ path: [0], part: 0 }, { insert: 0 }],
    }),
    /empty heading cannot be saved/,
  );
});

test("new Equation inserts save and reload through Core semantics", () => {
  const editable = loadEditableDocument("Intro\n");
  const next = toTiptapDocument(editable);
  next.content!.push({
    type: "equation",
    attrs: { sourcePath: "new:equation", latex: "x^2 + 1", label: "" },
  });
  const edits = collectSupportedEdits(editable, next);
  assert.deepEqual(edits.inserts, [{ block: "equation", latex: "x^2 + 1" }]);
  const saved = saveEdits("Intro\n", edits);
  assert.equal(saved.markdown, "Intro\n\n```{math}\nx^2 + 1\n```\n");
  assert.deepEqual(saved.document.blocks.map(block => block.block), ["paragraph", "equation"]);
  assert.equal(saved.document.blocks[1]?.block, "equation");
  if (saved.document.blocks[1]?.block === "equation") {
    assert.equal(saved.document.blocks[1].latex, "x^2 + 1");
  }
  assert.equal(serialize(parse(saved.markdown)), saved.markdown);

  const empty = toTiptapDocument(editable);
  empty.content!.push({ type: "equation", attrs: { sourcePath: "new:empty-equation", latex: "", label: "" } });
  assert.throws(() => collectSupportedEdits(editable, empty), /empty equation LaTeX/);
  assert.throws(
    () => saveEdits("Intro\n", {
      inserts: [{ block: "equation", latex: "" }],
      order: [{ path: [0], part: 0 }, { insert: 0 }],
    }),
    /empty equation LaTeX/,
  );

  const conversion = clone(toTiptapDocument(editable));
  conversion.content![0] = {
    type: "equation",
    attrs: { sourcePath: "0", latex: "x" },
  };
  assert.throws(() => assertSupportedDocumentChange(toTiptapDocument(editable), conversion), /top-level block type changed/);
});

test("new Equation cancel removes the transient block while persisted Equation cancel remains local", () => {
  const schemaSource = readFileSync(path.join(editorRoot, "src", "editor-schema.tsx"), "utf8");
  assert.match(schemaSource, /isNewBlockPath\(sourcePath\) && latex\.length === 0/);
  assert.match(schemaSource, /deleteNode\(\)/);
  assert.match(schemaSource, /nodes\.paragraph/);
  assert.match(schemaSource, /updateAttributes\(\{ latex: draft, label: labelDraft \}\)/);
});

test("an empty new document can hold a transient heading but cannot save it empty", () => {
  const editable = loadEditableDocument("\n");
  const heading = toTiptapDocument(editable);
  heading.content = [{ type: "heading", attrs: { sourcePath: "new:empty", level: 1 } }];
  assert.throws(() => collectSupportedEdits(editable, heading), /empty heading cannot be saved/);
});

test("new Markdown files use Core's canonical empty document and can be edited and saved", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-new-files-"));
  const file = path.join(dir, "new-document.md");
  try {
    const created = createDocumentFile(file);
    assert.equal(created.path, path.resolve(file));
    assert.equal(readFileSync(file, "utf8"), "\n");
    assert.deepEqual(created.document.blocks, []);
    assert.deepEqual(inspectDocument(parse(readFileSync(file, "utf8"))), []);

    const saved = saveDocumentFile(file, {
      revision: created.revision,
      inserts: [{ block: "paragraph", content: [{ kind: "text", text: "A new document" }] }],
      order: [{ insert: 0 }],
    });
    assert.equal(readFileSync(file, "utf8"), "A new document\n");
    assert.equal(saved.document.blocks[0]?.block, "paragraph");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("new Markdown files reject overwrite, invalid extensions, and missing parent directories", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-new-file-errors-"));
  const existing = path.join(dir, "existing.md");
  try {
    writeFileSync(existing, "Keep this content\n");
    assert.throws(() => createDocumentFile(existing), /file already exists/);
    assert.equal(readFileSync(existing, "utf8"), "Keep this content\n");
    assert.throws(() => createDocumentFile(path.join(dir, "invalid.txt")), /\.md file/);
    assert.throws(() => createDocumentFile(path.join(dir, "missing", "new.md")), /parent directory does not exist/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("file switching is guarded by Editor unsaved state and uses the selected path", () => {
  const app = readFileSync(path.join(editorRoot, "src", "App.tsx"), "utf8");
  assert.match(app, /hasUnsavedChanges\(\)/);
  assert.match(app, /Save or discard the current changes before opening another file\./);
  assert.match(app, /requestDocument\("GET", requestedPath\)/);
  assert.match(app, /requestDocument\("POST", openedPath/);
  assert.match(app, /requestDocument\("PUT", requestedPath/);
  assert.match(app, /Save or discard the current changes before creating another file\./);
  assert.doesNotMatch(app, /technical-document\.md/);

  const documentEditor = readFileSync(path.join(editorRoot, "src", "DocumentEditor.tsx"), "utf8");
  assert.match(documentEditor, /hasUnsavedChanges\(\)/);
  assert.match(documentEditor, /activeEquationDrafts\.current\.size > 0/);

  const api = readFileSync(path.join(editorRoot, "server", "document-api.ts"), "utf8");
  assert.doesNotMatch(api, /DOCUMENT_FILE/);
  assert.match(api, /resolveDocumentPath/);
  assert.match(api, /saveDocumentFile/);
  assert.match(api, /resolveMediaPath/);
});

test("relative figure media follows the opened document directory", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-media-"));
  const aDir = path.join(dir, "a");
  const bDir = path.join(dir, "b");
  const outside = path.join(dir, "outside.svg");
  const fileA = path.join(aDir, "a.md");
  const fileB = path.join(bDir, "b.md");
  try {
    mkdirSync(aDir);
    mkdirSync(bDir);
    writeFileSync(fileA, "A\n");
    writeFileSync(fileB, "B\n");
    writeFileSync(path.join(aDir, "image.svg"), "A image");
    writeFileSync(path.join(bDir, "image.svg"), "B image");
    writeFileSync(outside, "outside");
    assert.equal(readFileSync(resolveMediaPath("image.svg", fileA), "utf8"), "A image");
    assert.equal(readFileSync(resolveMediaPath("image.svg", fileB), "utf8"), "B image");
    assert.throws(() => resolveMediaPath("../outside.svg", fileA), /escapes the document directory/);
    assert.throws(() => resolveMediaPath("..%2Foutside.svg", fileA), /escapes the document directory/);
    assert.equal(
      resolveFigureSource("./image.svg", fileA),
      `/document/image.svg?path=${encodeURIComponent(fileA)}`,
    );
    assert.equal(resolveFigureSource("https://example.com/image.svg", fileA), "https://example.com/image.svg");
    assert.equal(resolveFigureSource("/assets/image.svg", fileA), "/assets/image.svg");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("document revision changes with the source", () => {
  const revision = documentRevision(source);
  assert.equal(documentRevision(source), revision);
  assert.equal(revision.length, 64);
  assert.notEqual(documentRevision(`${source}\n`), revision);
});

test("current revision save returns the hash of the saved markdown", () => {
  const loaded = documentRevision(source);
  const saved = saveCurrentDocument(source, {
    revision: loaded,
    paragraphs: [{ path: [8], content: [{ kind: "text", text: PARAGRAPH_TO }] }],
  });
  assert.notEqual(saved.revision, loaded);
  assert.equal(saved.revision, documentRevision(saved.markdown));
  assert.equal(saved.markdown.includes(PARAGRAPH_TO), true);
  assert.equal(saved.markdown.includes("fig-control"), true);
  assert.equal(saved.markdown.includes("eq-current"), true);
});

test("Host save fails over HTTP before writing when canonical Markdown would lose semantics", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-lossy-save-"));
  const server = createServer((req, res) => {
    void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    for (const [name, source, reason] of [
      // Layer 1: myst-to-md reports the node it cannot render.
      ["keyboard.md", "Editable paragraph.\n\nBefore {kbd}`Ctrl` after\n", /cannot be preserved in canonical Markdown: .*keyboard/],
      // Layer 2: the second subfigure is dropped without any diagnostic.
      ["subfigure.md", "Editable paragraph.\n\n:::{figure}\n![a](./a.png)\n![b](./b.png)\n:::\n", /cannot be preserved in canonical Markdown: .*container/],
    ] as const) {
      const file = path.join(dir, name);
      writeFileSync(file, source);
      const before = readFileSync(file);
      const loaded = loadDocumentFile(file);
      const paragraph = loaded.document.blocks.find((block) => block.block === "paragraph" && block.editable);
      assert.ok(paragraph, name);
      const response = await fetch(`http://127.0.0.1:${port}/api/document`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: file,
          revision: loaded.revision,
          paragraphs: [{ path: paragraph.path, content: [{ kind: "text", text: "Changed paragraph." }] }],
        }),
      });
      assert.equal(response.status, 400, name);
      assert.match(((await response.json()) as { error: string }).error, reason, name);
      assert.deepEqual(readFileSync(file), before, name);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Host reports canonical writeability with every document it opens, creates or saves", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-writeability-"));
  const server = createServer((req, res) => {
    void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const writable = path.join(dir, "writable.md");
    writeFileSync(writable, "# Title\n\nBody.\n");
    const blocked = path.join(dir, "front-matter.md");
    const source = "---\ntitle: Example\n---\n\n# Heading\n\nBody.\n";
    writeFileSync(blocked, source);
    const before = readFileSync(blocked);

    assert.equal(loadDocumentFile(writable).writeError, null);
    // A document IeumDoc cannot write still opens, with its whole read model.
    const opened = loadDocumentFile(blocked);
    assert.deepEqual(opened.document.blocks.map((block) => block.block), ["unsupported", "heading", "paragraph"]);
    assert.match(opened.writeError ?? "", /^Document contains semantic content that cannot be preserved in canonical Markdown: .*front matter/);
    assert.equal(opened.writeError, canonicalWriteError(parse(source)));
    const response = await fetch(`http://127.0.0.1:${port}/api/document?path=${encodeURIComponent(blocked)}`);
    assert.equal(response.status, 200);
    assert.equal(((await response.json()) as { writeError: string | null }).writeError, opened.writeError);

    // Preflight and Save judge the same snapshot the same way; the writer never runs.
    let written = false;
    assert.throws(() => commitDocumentSave(() => source, () => { written = true; }, {
      revision: opened.revision,
      paragraphs: [{ path: [2], content: [{ kind: "text", text: "Changed." }] }],
    }), (error: unknown) => error instanceof Error && error.message === opened.writeError);
    assert.equal(written, false);
    assert.deepEqual(readFileSync(blocked), before);

    assert.equal(createDocumentFile(path.join(dir, "new.md")).writeError, null);
    const saved = await fetch(`http://127.0.0.1:${port}/api/document`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: writable,
        revision: loadDocumentFile(writable).revision,
        paragraphs: [{ path: [1], content: [{ kind: "text", text: "Changed." }] }],
      }),
    });
    assert.equal(saved.status, 200);
    assert.equal(((await saved.json()) as { writeError: string | null }).writeError, null);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an unwritable document keeps Save and Source blocked for its session, and does not trap Open/New", () => {
  const app = readFileSync(path.join(editorRoot, "src", "App.tsx"), "utf8");
  const body = (name: string) => {
    const start = app.indexOf(`async function ${name}(`);
    return app.slice(start, app.indexOf("\n  }\n", start));
  };
  // Every document response sets the writeability state; there is no other source for it.
  for (const name of ["load", "save", "createFile"]) assert.match(body(name), /setWriteError\(next\.writeError\)/, name);
  assert.match(body("save"), /if \(writeError\) return;/);
  assert.match(body("showSource"), /if \(writeError\) return;/);
  // Edits of a document that cannot be saved must not block leaving it.
  for (const name of ["openFile", "createFile"]) {
    assert.match(body(name), /if \(!writeError && editorRef\.current\?\.hasUnsavedChanges\(\)\)/, name);
  }
  assert.match(app, /saveDisabled=\{[^}]*Boolean\(writeError\)/);
});

test("Source preview is the canonical Markdown Save would write, without writing the file", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-source-preview-"));
  const file = path.join(dir, "technical-document.md");
  const server = createServer((req, res) => {
    void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    writeFileSync(file, source);
    const loaded = loadDocumentFile(file);
    const request = {
      revision: loaded.revision,
      paragraphs: [{ path: [8], content: [{ kind: "text" as const, text: PARAGRAPH_TO }] }],
    };
    const preview = previewDocumentFile(file, request);
    assert.equal(readFileSync(file, "utf8"), source);
    assert.equal(preview.markdown.includes(PARAGRAPH_TO), true);

    const { port } = server.address() as AddressInfo;
    const post = (body: unknown) => fetch(`http://127.0.0.1:${port}/api/document-source`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const response = await post({ path: file, ...request });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { markdown: preview.markdown });
    assert.equal(readFileSync(file, "utf8"), source);

    // An unchanged document previews as its canonical form.
    const unchanged = await post({ path: file, revision: loaded.revision });
    assert.equal(((await unchanged.json()) as { markdown: string }).markdown, previewDocumentFile(file, { revision: loaded.revision }).markdown);

    const stale = await post({ path: file, ...request, revision: "stale" });
    assert.equal(stale.status, 409);
    const invalid = await post({ path: file, revision: loaded.revision, paragraphs: [{ path: [8], content: [] }] });
    assert.equal(invalid.status, 400);
    assert.equal(readFileSync(file, "utf8"), source);

    const saved = saveDocumentFile(file, request);
    assert.equal(readFileSync(file, "utf8"), preview.markdown);
    assert.equal(saved.markdown, preview.markdown);
    // After Save and reload, Source equals the saved canonical Markdown.
    const reloaded = loadDocumentFile(file);
    assert.equal(previewDocumentFile(file, { revision: reloaded.revision }).markdown, readFileSync(file, "utf8"));

    const lossy = path.join(dir, "keyboard.md");
    writeFileSync(lossy, "Editable paragraph.\n\nBefore {kbd}`Ctrl` after\n");
    const before = readFileSync(lossy);
    const lossyResponse = await post({ path: lossy, revision: loadDocumentFile(lossy).revision });
    assert.equal(lossyResponse.status, 400);
    assert.match(((await lossyResponse.json()) as { error: string }).error, /cannot be preserved in canonical Markdown/);
    assert.deepEqual(readFileSync(lossy), before);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stale revision save leaves an externally edited file unchanged", () => {
  const loaded = documentRevision(source);
  const external = source.replace(PARAGRAPH_FROM, "Changed outside the editor.");
  assert.notEqual(documentRevision(external), loaded);
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-conflict-"));
  const file = path.join(dir, "technical-document.md");
  try {
    writeFileSync(file, external);
    const before = readFileSync(file);
    assert.throws(
      () =>
        commitDocumentSave(
          () => readFileSync(file, "utf8"),
          (markdown) => writeFileSync(file, markdown),
          {
            revision: loaded,
            paragraphs: [{ path: [8], content: [{ kind: "text", text: PARAGRAPH_TO }] }],
          },
        ),
      DocumentConflictError,
    );
    assert.deepEqual(readFileSync(file), before);
    assert.equal(readFileSync(file, "utf8").includes("Changed outside the editor."), true);
    assert.equal(readFileSync(file, "utf8").includes(PARAGRAPH_TO), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stale revision rejects a shifted paragraph path before the edit is applied", () => {
  const loaded = documentRevision(source);
  const external = serialize(insertParagraph(parse(source), 8, "External paragraph."));
  const stale = {
    revision: loaded,
    paragraphs: [{ path: [8] as const, content: [{ kind: "text" as const, text: "Stale editor text." }] }],
  };
  const unguarded = saveEdits(external, { paragraphs: stale.paragraphs.map((edit) => ({ ...edit })) });
  assert.equal(unguarded.markdown.includes("Stale editor text."), true);
  assert.equal(unguarded.markdown.includes("External paragraph."), false);

  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-structure-conflict-"));
  const file = path.join(dir, "technical-document.md");
  try {
    writeFileSync(file, external);
    const before = readFileSync(file);
    assert.throws(
      () =>
        commitDocumentSave(
          () => readFileSync(file, "utf8"),
          (markdown) => writeFileSync(file, markdown),
          { revision: stale.revision, paragraphs: stale.paragraphs.map((edit) => ({ ...edit })) },
        ),
      DocumentConflictError,
    );
    assert.deepEqual(readFileSync(file), before);
    assert.equal(readFileSync(file, "utf8").includes("External paragraph."), true);
    assert.equal(readFileSync(file, "utf8").includes("Stale editor text."), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a saved revision can save again and the loaded revision cannot", () => {
  const loaded = documentRevision(source);
  const first = saveCurrentDocument(source, {
    revision: loaded,
    headings: [{ path: [0], from: HEADING_FROM, to: HEADING_TO }],
  });
  const second = saveCurrentDocument(first.markdown, {
    revision: first.revision,
    paragraphs: [{ path: [8], content: [{ kind: "text", text: PARAGRAPH_TO }] }],
  });
  assert.notEqual(first.revision, loaded);
  assert.notEqual(second.revision, first.revision);
  assert.equal(second.revision, documentRevision(second.markdown));
  assert.equal(second.markdown.includes(HEADING_TO), true);
  assert.equal(second.markdown.includes(PARAGRAPH_TO), true);
  assert.throws(
    () =>
      saveCurrentDocument(first.markdown, {
        revision: loaded,
        paragraphs: [{ path: [8], content: [{ kind: "text", text: PARAGRAPH_TO }] }],
      }),
    DocumentConflictError,
  );
});

test("save conflict keeps the loaded editor mounted", () => {
  const app = readFileSync(path.join(editorRoot, "src", "App.tsx"), "utf8");
  const saveStart = app.indexOf("async function save()");
  const saveEnd = app.indexOf("async function createFile", saveStart);
  const saveFn = app.slice(saveStart, saveEnd);
  const catchBlock = saveFn.slice(saveFn.indexOf("} catch (cause) {"));
  assert.equal(catchBlock.includes("Save conflict"), true);
  assert.equal(catchBlock.includes("setDocument"), false);
  assert.equal(catchBlock.includes("setSourceRevision"), false);
  assert.equal(catchBlock.includes("setEditorGeneration"), false);
});

test("save does not rebuild the document from Tiptap", () => {
  const files = [
    ...listSourceFiles(path.join(editorRoot, "src")),
    ...listSourceFiles(path.join(editorRoot, "server")),
  ];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.equal(text.includes("replaceEditableBlocks"), false, file);
    assert.equal(/\.children\s*=/.test(text), false, file);
  }
  const api = readFileSync(path.join(editorRoot, "server", "document-api.ts"), "utf8");
  assert.equal(api.includes("updateNodeTextAtPath"), true);
  assert.equal(api.includes("updateParagraphInlineContent"), true);
});

test("paragraph edits are saved through Core operations", () => {
  const saved = saveParagraph(PARAGRAPH_FROM, [{ kind: "text", text: PARAGRAPH_TO }]);
  assert.equal(saved.markdown.includes(PARAGRAPH_TO), true);
  assert.equal(saved.markdown.includes(PARAGRAPH_FROM), false);
  assert.equal(saved.markdown.includes(":::{warning}"), true);
});

test("rich paragraph saves through updateParagraphInlineContent", () => {
  const document = loadEditableDocument(source);
  const formatted = document.blocks.find(
    (block) => block.block === "paragraph" && block.text === FORMATTED_PARAGRAPH,
  );
  assert.equal(formatted?.block, "paragraph");
  if (formatted?.block !== "paragraph") return;
  const content = formatted.content.map((item) =>
    item.kind === "text" ? { ...item, text: item.text.replaceAll("regulates", "controls") } : item,
  );
  const saved = saveEdits(source, { paragraphs: [{ path: formatted.path, content }] });
  assert.equal(
    saved.markdown.includes("The converter controls the **DC-link voltage** and *phase current*."),
    true,
  );
});

test("heading text edits keep the heading level", () => {
  const document = loadEditableDocument(source);
  const heading = document.blocks.find((block) => block.block === "heading" && block.text === HEADING_FROM);
  assert.equal(heading?.block, "heading");
  if (heading?.block !== "heading") return;
  const saved = saveEdits(source, { headings: [{ path: heading.path, from: heading.text, to: HEADING_TO }] });
  const reparsed = parse(saved.markdown);
  const updated = getEditableDocument(reparsed).blocks[heading.path[0]];
  assert.equal(updated?.block, "heading");
  if (updated?.block !== "heading") return;
  assert.equal(updated.level, heading.level);
  assert.equal(updated.text, HEADING_TO);
  assert.equal(getEditableDocument(reparsed).blocks[0]?.block, "heading");
});

test("Equation edit survives Apply projection, reorder, Save and reload", () => {
  const editable = loadEditableDocument(source);
  const projection = toTiptapDocument(editable);
  const equation = blockAt(projection, "9");
  const original = String(equation.attrs?.latex ?? "");
  const changed = `${original} + 1`;
  equation.attrs!.latex = changed;
  projection.content!.unshift(projection.content!.splice(9, 1)[0]);

  const edits = collectSupportedEdits(editable, projection);
  assert.deepEqual(edits.equations, [{ path: [9], from: original, to: changed }]);
  assert.ok(edits.order);
  const saved = saveEdits(source, edits);
  const reloaded = loadEditableDocument(saved.markdown);
  const reloadedEquation = reloaded.blocks.find((block) => block.block === "equation");
  assert.equal(reloadedEquation?.block, "equation");
  if (reloadedEquation?.block !== "equation") return;
  assert.equal(reloadedEquation.latex, changed);
  assert.equal(reloadedEquation.label, "eq-current");
  assert.equal(serialize(parse(saved.markdown)), saved.markdown);

  let written = false;
  assert.throws(
    () => commitDocumentSave(
      () => source,
      () => { written = true; },
      { revision: documentRevision(source), equations: [{ path: [9], from: original, to: "" }] },
    ),
    /empty equation LaTeX/,
  );
  assert.equal(written, false);
});

test("empty paragraph and empty heading saves are rejected", () => {
  const editable = loadEditableDocument(source);
  assert.throws(
    () => saveEdits(source, { paragraphs: [{ path: [8], content: [] }] }),
    /empty paragraph cannot be saved/,
  );
  assert.throws(
    () => saveEdits(source, { headings: [{ path: [0], from: HEADING_FROM, to: "" }] }),
    /empty heading text cannot be saved/,
  );
  const emptied = clone(toTiptapDocument(editable));
  blockAt(emptied, "8").content = [];
  assert.throws(() => collectSupportedEdits(editable, emptied), /empty paragraph cannot be saved/);
});

test("read-only targets and rich headings are rejected by save", () => {
  assert.throws(
    () => saveEdits(source, { paragraphs: [{ path: [2], content: [{ kind: "text", text: "flattened" }] }] }),
    /paragraph edit is not allowed at \[2\]/,
  );
  assert.throws(
    () => saveEdits(source, { headings: [{ path: [6], from: "figure", to: "changed" }] }),
    /heading edit is not allowed at \[6\]/,
  );
  assert.throws(
    () =>
      saveEdits(source, {
        headings: [{ path: [6, 1], from: "Control block diagram of the grid-connected converter.", to: "changed" }],
      }),
    /heading edit is not allowed at \[6,1\]/,
  );

  const richSource = "# Plain **bold** title\n\nBody.\n";
  assert.throws(
    () => saveEdits(richSource, { headings: [{ path: [0], from: "Plain bold title", to: "Changed" }] }),
    /heading edit is not allowed at \[0\]/,
  );
  const saved = saveEdits(richSource, {
    paragraphs: [{ path: [1], content: [{ kind: "text", text: "Changed body." }] }],
  });
  assert.match(saved.markdown, /^# Plain \*\*bold\*\* title$/m);
});

test("supported edits preserve untouched semantics", () => {
  const before = parse(source);
  const editable = getEditableDocument(before);
  const heading = editable.blocks.find((block) => block.block === "heading" && block.text === HEADING_FROM);
  const plain = editable.blocks.find((block) => block.block === "paragraph" && block.text === PARAGRAPH_FROM);
  const rich = editable.blocks.find((block) => block.block === "paragraph" && block.text === FORMATTED_PARAGRAPH);
  assert.equal(heading?.block, "heading");
  assert.equal(plain?.block, "paragraph");
  assert.equal(rich?.block, "paragraph");
  if (heading?.block !== "heading" || plain?.block !== "paragraph" || rich?.block !== "paragraph") return;

  const richContent = rich.content.map((item) =>
    item.kind === "text" ? { ...item, text: item.text.replaceAll("regulates", "controls") } : item,
  );
  const saved = saveEdits(source, {
    headings: [{ path: heading.path, from: heading.text, to: HEADING_TO }],
    paragraphs: [
      { path: rich.path, content: richContent },
      { path: plain.path, content: [{ kind: "text", text: PARAGRAPH_TO }] },
    ],
  });
  // The persisted Markdown is the canonical form with exactly the three edited lines
  // changed: every untouched block, including the {eq} reference and the ordinary
  // `[](#...)` links (issue #12), is written byte-for-byte as before.
  const canonicalMarkdown = serialize(before);
  const expected = canonicalMarkdown
    .replace(`# ${HEADING_FROM}\n`, `# ${HEADING_TO}\n`)
    .replace("The converter regulates the", "The converter controls the")
    .replace(PARAGRAPH_FROM, PARAGRAPH_TO);
  assert.notEqual(expected, canonicalMarkdown);
  assert.equal(saved.markdown, expected);
  assert.match(saved.markdown, /^See \[\]\(#fig-control\) and \{eq\}`eq-current`\.$/m);
  assert.match(saved.markdown, /^The rated current follows from \[\]\(#eq-current\)\.$/m);

  const canonical = parse(canonicalMarkdown);
  const after = parse(saved.markdown);
  assert.deepEqual(inspectDocument(after), inspectDocument(canonical));
  const afterBlocks = getEditableDocument(after).blocks;
  const canonicalBlocks = getEditableDocument(canonical).blocks;
  for (const index of PRESERVED_INDEXES) {
    assert.deepEqual(afterBlocks[index], canonicalBlocks[index], `block ${index}`);
  }

  const updatedHeading = afterBlocks[heading.path[0]];
  const canonicalHeading = canonicalBlocks[heading.path[0]];
  assert.equal(updatedHeading.block, "heading");
  assert.equal(canonicalHeading.block, "heading");
  if (updatedHeading.block === "heading" && canonicalHeading.block === "heading") {
    assert.equal(updatedHeading.level, canonicalHeading.level);
    assert.equal(updatedHeading.text, HEADING_TO);
  }

  const updatedRich = afterBlocks[rich.path[0]];
  assert.equal(updatedRich?.block, "paragraph");
  if (updatedRich?.block === "paragraph") {
    assert.deepEqual(updatedRich.content, richContent);
  }

  // Figure, equation, table and admonition keep their Core semantic projections.
  for (const block of ["figure", "equation", "table", "admonition"]) {
    assert.deepEqual(
      afterBlocks.filter((item) => item.block === block),
      canonicalBlocks.filter((item) => item.block === block),
      block,
    );
  }
});

test("Core source does not import Tiptap or ProseMirror", () => {
  const coreRoot = fileURLToPath(new URL("../../../packages/core", import.meta.url));
  const files = listSourceFiles(path.join(coreRoot, "src"));
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.equal(/from\s+["']@tiptap\//.test(text), false, file);
    assert.equal(/from\s+["']prosemirror-/.test(text), false, file);
  }
  const corePackage = readFileSync(path.join(coreRoot, "package.json"), "utf8");
  assert.equal(corePackage.includes("@tiptap/"), false);
  assert.equal(corePackage.includes("prosemirror"), false);
});

test("Editor source does not import MyST packages or AST", () => {
  const files = [
    ...listSourceFiles(path.join(editorRoot, "src")),
    ...listSourceFiles(path.join(editorRoot, "server")),
    path.join(editorRoot, "vite.config.ts"),
  ];
  assert.ok(files.length > 0);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.equal(/from\s+["']myst-/.test(text), false, file);
    assert.equal(/import\s+["']myst-/.test(text), false, file);
    assert.equal(/\bGenericNode\b/.test(text), false, file);
    assert.equal(/\bGenericParent\b/.test(text), false, file);
    if (file.includes(`${path.sep}src${path.sep}`)) {
      assert.equal(text.includes("document.children"), false, file);
      assert.equal(text.includes("node.children"), false, file);
    }
  }
});

test("saved document can be parsed again", () => {
  const saved = saveSample();
  const reparsed = parse(saved.markdown);
  assert.ok(inspectDocument(reparsed).length > 0);
  const editable = getEditableDocument(reparsed);
  assert.equal(
    editable.blocks.some((block) => block.block === "paragraph" && block.text === PARAGRAPH_TO),
    true,
  );
  assert.equal(
    editable.blocks.some((block) => block.block === "heading" && block.text === HEADING_TO && block.level === 1),
    true,
  );
  assert.equal(
    editable.blocks.some((block) => block.block === "figure" && block.label === "fig-control"),
    true,
  );
});

test("canonical second serialization is stable", () => {
  const saved = saveSample();
  assert.equal(saved.markdown, serialize(parse(saved.markdown)));
});

test("saved file matches the Core write path", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-"));
  const file = path.join(dir, "technical-document.md");
  try {
    const saved = saveSample();
    writeFileSync(file, saved.markdown);
    assert.equal(readFileSync(file, "utf8"), saved.markdown);
    assert.equal(serialize(parse(readFileSync(file, "utf8"))), saved.markdown);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function saveParagraph(from: string, content: InlineContent[]) {
  const document = loadEditableDocument(source);
  const target = document.blocks.find((block) => block.block === "paragraph" && block.editable && block.text === from);
  assert.equal(target?.block, "paragraph");
  if (target?.block !== "paragraph") {
    throw new Error(`missing editable paragraph: ${from}`);
  }
  return saveEdits(source, { paragraphs: [{ path: target.path, content }] });
}

function saveSample() {
  const document = loadEditableDocument(source);
  const heading = document.blocks.find((block) => block.block === "heading" && block.text === HEADING_FROM);
  const paragraph = document.blocks.find((block) => block.block === "paragraph" && block.text === PARAGRAPH_FROM);
  assert.equal(heading?.block, "heading");
  assert.equal(paragraph?.block, "paragraph");
  if (heading?.block !== "heading" || paragraph?.block !== "paragraph") {
    throw new Error("missing sample edit targets");
  }
  return saveEdits(source, {
    headings: [{ path: heading.path, from: heading.text, to: HEADING_TO }],
    paragraphs: [{ path: paragraph.path, content: [{ kind: "text", text: PARAGRAPH_TO }] }],
  });
}

function schemaDocument(): { doc: ProseMirrorNode; schema: ReturnType<typeof getSchema> } {
  const projection = toTiptapDocument(loadEditableDocument(source));
  const schema = getSchema(editorExtensions());
  return { schema, doc: schema.nodeFromJSON(projection) };
}

function normalizedDocument(projection: TiptapJSON): TiptapJSON {
  return schemaDocumentFrom(projection).toJSON() as TiptapJSON;
}

function schemaDocumentFrom(projection: TiptapJSON): ProseMirrorNode {
  return getSchema(editorExtensions()).nodeFromJSON(projection);
}

function positionOf(doc: ProseMirrorNode, type: string, sourcePath: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (node.type.name === type && String(node.attrs.sourcePath) === sourcePath) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found < 0) {
    throw new Error(`missing ${type} ${sourcePath}`);
  }
  return found;
}

function dispatchOf(
  command: (state: EditorState, dispatch?: (transaction: Transaction) => void) => boolean,
  state: EditorState,
): { applied: boolean; transaction: Transaction | null } {
  let transaction: Transaction | null = null;
  const applied = command(state, (next) => {
    transaction = next;
  });
  return { applied, transaction };
}

function blockAt(doc: TiptapJSON, sourcePath: string): TiptapJSON {
  const block = doc.content?.find((item) => String(item.attrs?.sourcePath ?? "") === sourcePath);
  assert.ok(block, `missing projected block ${sourcePath}`);
  return block;
}

function clone(value: TiptapJSON): TiptapJSON {
  return structuredClone(value);
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

test("schema-normalized nested marks survive the complete save and reload path", () => {
  for (const source of ["**A*B*C**", "*A**B**C*", "***AB***"]) {
    const editable = loadEditableDocument(source);
    const projected = normalizedDocument(toTiptapDocument(editable));
    const saved = saveEdits(source, collectSupportedEdits(editable, projected));
    assert.deepEqual(saved.document, loadEditableDocument(saved.markdown));
    const reloaded = normalizedDocument(toTiptapDocument(saved.document));
    assert.deepEqual(reloaded, projected);
    assert.equal(serialize(parse(saved.markdown)), saved.markdown);
  }
});

test("lossy supported edits are rejected before the file write callback", () => {
  for (const content of [
    [{ kind: "strong", children: [{ kind: "text", text: "AB " }] }],
    [{ kind: "text", text: "A\n\nB" }],
  ] as InlineContent[][]) {
    let written = false;
    assert.throws(() => commitDocumentSave(
      () => source,
      () => { written = true; },
      { revision: documentRevision(source), paragraphs: [{ path: [8], content }] },
    ), /round-trip/);
    assert.equal(written, false);
  }
});

test("typed straight quotes save through the Editor adapter and Host and reload as typed", () => {
  const input = "# Title\n\nHello.\n\n| Key | Value |\n| --- | --- |\n| state | idle |\n";
  const editable = loadEditableDocument(input);
  const projected = normalizedDocument(toTiptapDocument(editable));
  const [heading, paragraph, table] = projected.content!;
  heading.content = [{ type: "text", text: "User's guide" }];
  paragraph.content = [
    { type: "text", text: "Don't panic. The state is " },
    { type: "text", text: '"READY"', marks: [{ type: "bold" }] },
    { type: "text", text: "." },
  ];
  table.content![1].content![1].content = [{ type: "text", text: "it's \"on\"" }];
  let written = "";
  const saved = commitDocumentSave(() => input, (markdown) => { written = markdown; },
    { revision: documentRevision(input), ...collectSupportedEdits(editable, projected) });
  assert.equal(written, saved.markdown);
  assert.equal(written, "# User's guide\n\nDon't panic. The state is **\"READY\"**.\n\n| Key   | Value     |\n| ----- | --------- |\n| state | it's \"on\" |\n");
  const reloaded = loadEditableDocument(written);
  assert.deepEqual(reloaded, saved.document);
  assert.deepEqual(normalizedDocument(toTiptapDocument(reloaded)), projected);
});

test("a byte-order-marked file opens with its heading and saves without the mark", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-bom-"));
  try {
    const file = path.join(dir, "bom.md");
    const bytes = "\uFEFF# Heading\n\nBody.\n";
    writeFileSync(file, bytes);
    const loaded = loadDocumentFile(file);
    assert.deepEqual(loaded.document, loadEditableDocument("# Heading\n\nBody.\n"));
    assert.equal(loaded.revision, documentRevision(bytes));
    const saved = saveDocumentFile(file, {
      revision: loaded.revision,
      paragraphs: [{ path: [1], content: [{ kind: "text", text: "Changed." }] }],
    });
    assert.equal(readFileSync(file, "utf8"), "# Heading\n\nChanged.\n");
    assert.equal(saved.revision, documentRevision("# Heading\n\nChanged.\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an Editor save or Source preview never rewrites front matter", () => {
  const input = "---\ntitle: Example\n---\n\n# Heading\n\nBody.\n";
  const editable = loadEditableDocument(input);
  assert.equal(editable.blocks[0].block, "unsupported");
  const projected = normalizedDocument(toTiptapDocument(editable));
  projected.content![2].content = [{ type: "text", text: "Changed." }];
  const request = { revision: documentRevision(input), ...collectSupportedEdits(editable, projected) };
  let written = false;
  assert.throws(() => commitDocumentSave(() => input, () => { written = true; }, request),
    /cannot be preserved in canonical Markdown: .*front matter/);
  assert.equal(written, false);
  assert.throws(() => saveCurrentDocument(input, request), /front matter/);
});

test("hard breaks and marks survive editable projection, save and reload", () => {
  for (const source of ["AB", "**AB**", "*AB*", "***AB***"]) {
    const editable = loadEditableDocument(source);
    const projected = normalizedDocument(toTiptapDocument(editable));
    assert.equal(projected.content?.[0].type, "paragraph");
    const first = projected.content![0].content![0];
    projected.content![0].content = [
      { ...first, text: "A" },
      { type: "hardBreak", ...(first.marks ? { marks: first.marks } : {}) },
      { ...first, text: "B" },
    ];
    const saved = saveEdits(source, collectSupportedEdits(editable, projected));
    assert.deepEqual(normalizedDocument(toTiptapDocument(saved.document)), projected);
    assert.equal(serialize(parse(saved.markdown)), saved.markdown);
    assert.deepEqual(toTiptapContent(fromTiptapContent({type: "doc", content: [{type: "paragraph", content: projected.content![0].content}]})).content?.[0].content, projected.content![0].content);
    const reloaded = loadEditableDocument(saved.markdown);
    assert.equal(toTiptapDocument(reloaded).content?.[0].type, "paragraph");
  }
});

test("break adapter rejects unsupported marks and malformed break content", () => {
  for (const node of [
    { type: "hardBreak", marks: [{ type: "link" }] },
    { type: "hardBreak", content: [{ type: "text", text: "lost" }] },
    { type: "hardBreak", text: "lost" },
  ]) assert.throws(() => fromTiptapContent({type: "doc", content: [{type: "paragraph", content: [node]}]}));
});

test("transient trailing break is editable but fails Core save without writing", () => {
  const source = "AB";
  const editable = loadEditableDocument(source);
  const projected = toTiptapDocument(editable);
  projected.content![0].content!.push({type: "hardBreak"});
  assert.equal(isSupportedDocumentChange(toTiptapDocument(editable), projected), true);
  let written = false;
  assert.throws(() => commitDocumentSave(() => source, () => { written = true; }, {
    revision: documentRevision(source), ...collectSupportedEdits(editable, projected),
  }), /round-trip/);
  assert.equal(written, false);
});


test("paragraph split saves final edited parts through Core and preserves other blocks", () => {
  const cases: InlineContent[][][] = [
    [[{kind: "text", text: "AB+"}], [{kind: "text", text: "+CD"}]],
    ...(["strong", "emphasis"] as const).map(kind => [
      [{kind, children: [{kind: "text" as const, text: "AB+"}]}],
      [{kind, children: [{kind: "text" as const, text: "+CD"}]}],
    ]),
    [
      [{kind: "strong", children: [{kind: "emphasis", children: [{kind: "text", text: "AB+"}]}]}],
      [{kind: "strong", children: [{kind: "emphasis", children: [{kind: "text", text: "+CD"}]}]}],
    ],
    [[{kind: "text", text: "A"}, {kind: "break"}, {kind: "text", text: "B"}], [{kind: "text", text: "CD"}]],
  ];
  for (const parts of cases) {
    const editable = loadEditableDocument(source);
    const projection = toTiptapDocument(editable);
    const original = projection.content![8];
    projection.content!.splice(8, 1, ...parts.map(content => ({...original, content: toTiptapContent(content).content![0].content})));
    const edits = collectSupportedEdits(editable, projection);
    assert.deepEqual(edits.splits, [{path: [8], parts: parts.map(part => fromTiptapContent(toTiptapContent(part)))}]);
    const saved = saveEdits(source, edits);
    assert.deepEqual(normalizedDocument(toTiptapDocument(saved.document)).content!.slice(8,10).map(node => node.content), parts.map(part => toTiptapContent(part).content![0].content));
    // Blocks outside the split keep their canonical Markdown.
    const before = removeBlock(parse(source), 8);
    const after = removeBlock(removeBlock(parse(saved.markdown), 9), 8);
    assert.equal(serialize(after), serialize(before));
    assert.equal(serialize(parse(saved.markdown)), saved.markdown);
  }
});

test("invalid or stale paragraph splits never invoke the file writer", () => {
  const text = (value: string): InlineContent[] => [{kind: "text", text: value}];
  for (const parts of [[[],text("AB")], [text("AB"),[]], [text(" "),text("AB")], [text("AB"),text(" ")]]) {
    let written = false;
    assert.throws(() => commitDocumentSave(() => "AB", () => {written = true;}, {
      revision: documentRevision("AB"), splits: [{path: [0], parts}],
    }));
    assert.equal(written, false);
  }
  let written = false;
  assert.throws(() => commitDocumentSave(() => "Changed", () => {written = true;}, {
    revision: documentRevision("AB"), splits: [{path: [0], parts: [text("A"),text("B")]}],
  }), DocumentConflictError);
  assert.equal(written, false);
  assert.throws(() => saveEdits("# AB", {splits: [{path: [0], parts: [text("A"),text("B")]}]}), /invalid/);
});

test("multiple split targets retain snapshot paths and heading edits", () => {
  const text = (value: string): InlineContent[] => [{kind: "text", text: value}];
  const saved = saveEdits("ABCD\n\n# Title\n\nEFGH", {
    headings: [{path: [1], from: "Title", to: "Edited"}],
    splits: [
      {path: [0], parts: [text("A"),text("B"),text("CD")]},
      {path: [2], parts: [text("EF"),text("GH")]},
    ],
  });
  assert.equal(saved.markdown, "A\n\nB\n\nCD\n\n# Edited\n\nEF\n\nGH\n");
});


test("paragraph merges retain marks, breaks, post-merge edits and surrounding semantics", () => {
  for (const pair of ["AB\n\nCD", "**AB**\n\n*CD*", "***AB***\n\n***CD***", "A\\\nB\n\nC\\\nD"]) {
    const source = "# Before\n\n" + pair + "\n\n$$\nx=1\n$$\n\n[link](url)";
    const editable = loadEditableDocument(source);
    const projection = toTiptapDocument(editable);
    const left = projection.content![1], right = projection.content![2];
    const combined = [...left.content!, ...right.content!, {type: "text", text: "+edited"}];
    projection.content!.splice(1, 2, {...left, attrs: {sourcePath: "1;2"}, content: combined});
    const edits = collectSupportedEdits(editable, projection);
    assert.equal(edits.merges?.length, 1);
    const saved = saveEdits(source, edits);
    const actual = normalizedDocument(toTiptapDocument(saved.document)).content![1].content;
    const expected = normalizedDocument({...projection, content: [projection.content![1]]}).content![0].content;
    assert.deepEqual(actual, expected);
    // Blocks outside the merge keep their canonical Markdown.
    const before = removeBlock(removeBlock(parse(source), 2), 1);
    const after = removeBlock(parse(saved.markdown), 1);
    assert.equal(serialize(after), serialize(before));
    assert.equal(serialize(parse(saved.markdown)), saved.markdown);
  }
});

test("merge and split groups save together without path shifts or implicit spaces", () => {
  const text = (text: string): InlineContent[] => [{kind: "text", text}];
  const saved = saveEdits("AB\n\nCD\n\n# Divider\n\nEFGH", {
    merges: [{paths: [[0],[1]], parts: [text("ABC"),text("D+")]}],
    splits: [{path: [3], parts: [text("EF"),text("GH")]}],
  });
  assert.equal(saved.markdown,"ABC\n\nD+\n\n# Divider\n\nEF\n\nGH\n");
  assert.equal(saveEdits("Hello\n\nWorld", {merges:[{paths:[[0],[1]],parts:[text("HelloWorld")]}]}).markdown,"HelloWorld\n");
});

test("invalid and stale merges do not write", () => {
  const parts: InlineContent[][] = [[{kind:"text",text:"merged"}]];
  for (const source of ["# Heading\n\nAB", "$$\nx=1\n$$\n\nAB", "[](#target)\n\nAB", "AB\n\n# Heading"]) {
    let written = false;
    assert.throws(() => commitDocumentSave(() => source, () => {written = true;}, {
      revision: documentRevision(source), merges: [{paths:[[0],[1]],parts}],
    }));
    assert.equal(written,false);
  }
  for (const paths of [[[0],[2]], [[1],[0]], [[0],[0]], [[0,0],[1]], [[0]]]) {
    assert.throws(() => saveEdits("A\n\nB\n\nC", {merges:[{paths,parts}]}));
  }
  let written = false;
  assert.throws(() => commitDocumentSave(() => "Changed", () => {written = true;}, {
    revision: documentRevision("A\n\nB"), merges:[{paths:[[0],[1]],parts}],
  }), DocumentConflictError);
  assert.equal(written,false);
});

test("merge provenance cannot skip, reorder or consume readonly blocks", () => {
  const baseline = toTiptapDocument(loadEditableDocument("A\n\n# H\n\nB"));
  for (const sourcePath of ["0;2", "0;1;2", "2;0"]) {
    const next = {type:"doc",content:[{type:"paragraph",attrs:{sourcePath},content:[{type:"text",text:"AB"}]}]};
    assert.throws(() => assertSupportedDocumentChange(baseline,next));
  }
});


test("all top-level blocks reorder through Core without changing semantic content", () => {
  const editable = loadEditableDocument(source);
  const projection = toTiptapDocument(editable);
  for (let from = 0; from < editable.blocks.length; from++) {
    const next = clone(projection);
    next.content!.splice(0, 0, next.content!.splice(from, 1)[0]);
    const saved = saveEdits(source, collectSupportedEdits(editable, next));
    assert.equal(saved.markdown, serialize(moveBlock(parse(source), from, 0)));
    assert.equal(serialize(parse(saved.markdown)), saved.markdown);
    assert.deepEqual(toTiptapDocument(saved.document).content!.map(node => ({...node, attrs: {...node.attrs, sourcePath: ""}})),
      next.content!.map(node => ({...node, attrs: {...node.attrs, sourcePath: ""}})));
  }
});

test("reorder and subsequent marked text and break edits survive save and reload", () => {
  const markdown = "# Heading\n\n**AB**\n\n*CD*";
  const editable = loadEditableDocument(markdown);
  const next = toTiptapDocument(editable);
  const paragraph = next.content!.splice(2, 1)[0];
  paragraph.content!.push({type:"hardBreak", marks:[{type:"italic"}]}, {type:"text", text:"extra", marks:[{type:"italic"}]});
  next.content!.unshift(paragraph);
  const saved = saveEdits(markdown, collectSupportedEdits(editable, next));
  assert.deepEqual(saved.document.blocks.map(block => block.block), ["paragraph","heading","paragraph"]);
  const first = saved.document.blocks[0];
  assert.equal(first.block === "paragraph" && first.text, "CD\nextra");
  assert.equal(serialize(parse(saved.markdown)), saved.markdown);
});

test("reorder supports separated split siblings and merging reordered neighbors", () => {
  const text = (value: string) => [{type:"text", text:value}];
  const markdown = "AB\n\n# Middle\n\nCD";
  const editable = loadEditableDocument(markdown);
  const next = toTiptapDocument(editable);
  const first = next.content![0];
  first.content = text("A+");
  next.content!.push({...first, content:text("B+")});
  const saved = saveEdits(markdown, collectSupportedEdits(editable, next));
  assert.equal(saved.markdown, "A+\n\n# Middle\n\nCD\n\nB+\n");
  const merged = toTiptapDocument(editable);
  merged.content = [{type:"paragraph",attrs:{sourcePath:"2;0"},content:text("CDAB!")},merged.content![1]];
  const mergedSave = saveEdits(markdown, collectSupportedEdits(editable, merged));
  assert.equal(mergedSave.markdown, "CDAB!\n\n# Middle\n");
});

test("invalid reorder and stale reorder never invoke the writer", () => {
  const markdown = "A\n\n# Heading\n\nB";
  const orders = [
    [{path:[0],part:0}],
    [{path:[0],part:0},{path:[0],part:0},{path:[2],part:0}],
    [{path:[0],part:0},{path:[1],part:0},{path:[2],part:1}],
    [{path:[0],part:0},{path:[1],part:0},{path:[2,0],part:0}],
  ];
  let writes = 0;
  for (const order of orders) assert.throws(() => commitDocumentSave(() => markdown, () => writes++, {revision:documentRevision(markdown),order}));
  assert.throws(() => commitDocumentSave(() => markdown + " changed", () => writes++, {
    revision:documentRevision(markdown), order:[{path:[2],part:0},{path:[1],part:0},{path:[0],part:0}],
  }), DocumentConflictError);
  assert.equal(writes, 0);
});

test("engine reorder history and pending-save ranges follow moves, edits, undo and redo", () => {
  const schema = getSchema(editorExtensions());
  const doc = schema.nodeFromJSON(toTiptapDocument(loadEditableDocument("AB\n\n# Heading\n\nCD")));
  let state = EditorState.create({schema,doc,plugins:[history()]});
  let ranges: SavedRange[] = [];
  doc.forEach((node,pos,index) => ranges.push({start:pos,end:pos+node.nodeSize,path:String(index)}));
  const initial = structuredClone(ranges);
  const dispatch = (tr: Transaction) => { ranges = mapSavedRanges(ranges,tr); state = state.apply(tr); };
  dispatch(reorderBlock(state, 2, 0));
  assert.equal(state.doc.firstChild!.textContent,"CD");
  assert.equal(ranges.find(range => range.path === "2")!.start,0);
  assert.equal(undo(state,dispatch),true);
  assert.deepEqual([...ranges].sort((a,b)=>a.start-b.start), initial);
  assert.equal(redo(state,dispatch),true);
  dispatch(state.tr.insertText("X",2));
  assert.equal(state.doc.firstChild!.textContent,"CXD");
  assert.equal(ranges.find(range => range.path === "2")!.end,5);
  dispatch(reorderBlock(state, 0, 2));
  assert.equal(state.doc.lastChild!.textContent,"CXD");
  assert.equal(ranges.find(range => range.path === "2")!.end, state.doc.content.size);
});

test("Equation edits participate in editor undo and redo", () => {
  const { doc, schema } = schemaDocument();
  let state = EditorState.create({ schema, doc, plugins: [history()] });
  const position = positionOf(doc, "equation", "9");
  const equation = doc.nodeAt(position);
  assert.ok(equation);
  const original = String(equation?.attrs.latex);
  const changed = `${original} + 1`;
  state = state.apply(state.tr.setNodeMarkup(position, undefined, { ...equation!.attrs, latex: changed }));
  assert.equal(state.doc.nodeAt(position)?.attrs.latex, changed);
  assert.equal(undo(state, (transaction) => { state = state.apply(transaction); }), true);
  assert.equal(state.doc.nodeAt(position)?.attrs.latex, original);
  assert.equal(redo(state, (transaction) => { state = state.apply(transaction); }), true);
  assert.equal(state.doc.nodeAt(position)?.attrs.latex, changed);
});


test("canonical reorder that adds a separator block fails before persistence", () => {
  const markdown = "- A\n\nMiddle\n\n- B";
  let writes = 0;
  assert.throws(() => commitDocumentSave(() => markdown, () => writes++, {
    revision: documentRevision(markdown),
    order: [{path:[0],part:0},{path:[2],part:0},{path:[1],part:0}],
  }), /changed block boundaries/);
  assert.equal(writes, 0);
});
