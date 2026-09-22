import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getSchema } from "@tiptap/core";
import { deleteSelection, joinBackward, splitBlock } from "@tiptap/pm/commands";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import {
  getEditableDocument,
  getNode,
  insertParagraph,
  parse,
  serialize,
  type Document,
  type DocumentNode,
  type InlineContent,
} from "@ieumdoc/core";
import { editorExtensions } from "../src/editor-schema.tsx";
import { fromTiptapContent, toTiptapContent, type TiptapJSON } from "../src/tiptap-inline.ts";
import {
  assertSupportedDocumentChange,
  collectSupportedEdits,
  isSupportedDocumentChange,
  toTiptapDocument,
} from "../src/tiptap-document.ts";
import {
  commitDocumentSave,
  documentRevision,
  DocumentConflictError,
  loadEditableDocument,
  saveCurrentDocument,
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
      "readonlyTable",
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
  const table = projection.content?.find((block) => block.type === "readonlyTable");
  const rows = JSON.parse(String(table?.attrs?.rows ?? "[]")) as { text: string }[][];
  assert.equal(rows.length, 3);
  assert.equal(rows[1]?.[1]?.text, "AC");
});

test("projected technical document round-trips through the Tiptap schema without semantic edits", () => {
  const editable = loadEditableDocument(source);
  const projection = toTiptapDocument(editable);
  const normalized = normalizedDocument(projection);
  assert.equal(isSupportedDocumentChange(projection, normalized), true);
  assert.deepEqual(collectSupportedEdits(editable, normalized), { headings: [], paragraphs: [] });
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
  assert.deepEqual(fromTiptapContent(tiptap), original);
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

  assert.deepEqual(content, [
    { kind: "text", text: "plain" },
    { kind: "strong", children: [{ kind: "text", text: "bold" }] },
    { kind: "emphasis", children: [{ kind: "text", text: "italic" }] },
    {
      kind: "strong",
      children: [{ kind: "emphasis", children: [{ kind: "text", text: "both" }] }],
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
        content: [{ type: "paragraph", content: [{ type: "hardBreak" }] }],
      }),
    /unsupported Tiptap node "hardBreak"/,
  );
});

test("Tiptap adapter rejects unsupported marks", () => {
  for (const mark of ["link", "underline", "strike", "code", "unknown"]) {
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
  paragraph.content = [{ type: "hardBreak" }];
  assert.throws(() => assertSupportedDocumentChange(baseline, unknownInline), /unsupported Tiptap node "hardBreak"/);

  const unknownMark = clone(baseline);
  blockAt(unknownMark, "8").content = [{ type: "text", text: "unsupported", marks: [{ type: "link" }] }];
  assert.throws(() => assertSupportedDocumentChange(baseline, unknownMark), /unsupported Tiptap mark "link"/);
});

test("document adapter rejects readonly mutation, reorder, insertion, and deletion", () => {
  const baseline = toTiptapDocument(loadEditableDocument(source));

  const mutated = clone(baseline);
  const equation = blockAt(mutated, "9");
  assert.ok(equation.attrs);
  equation.attrs.latex = "changed";
  assert.throws(() => assertSupportedDocumentChange(baseline, mutated), /read-only block changed/);

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
  assert.throws(() => assertSupportedDocumentChange(baseline, reordered), /top-level reorder is not allowed/);

  const inserted = clone(baseline);
  inserted.content = [...(inserted.content ?? []), { type: "paragraph", attrs: { sourcePath: "99" } }];
  assert.throws(() => assertSupportedDocumentChange(baseline, inserted), /block insertion is not allowed/);

  const deleted = clone(baseline);
  deleted.content = (deleted.content ?? []).slice(0, -1);
  assert.throws(() => assertSupportedDocumentChange(baseline, deleted), /block deletion is not allowed/);
});

test("paragraph split is rejected", () => {
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
  assert.throws(() => assertSupportedDocumentChange(baseline, split), /block insertion is not allowed/);

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
  const saveEnd = app.indexOf("return (", saveStart);
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
  const updated = getNode(reparsed, heading.path);
  assert.equal(updated.type, "heading");
  assert.equal(updated.depth, heading.level);
  assert.equal(textOf(updated), HEADING_TO);
  assert.equal(getEditableDocument(reparsed).blocks[0]?.block, "heading");
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
  assert.equal(getNode(parse(saved.markdown), [0]).children?.some((child) => child.type === "strong"), true);
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
  const canonical = parse(serialize(before));
  const after = parse(saved.markdown);

  assert.deepEqual(topLevelTypes(after), topLevelTypes(canonical));
  for (const index of PRESERVED_INDEXES) {
    assert.deepEqual(strip(after.children?.[index]), strip(canonical.children?.[index]), `block ${index}`);
  }

  const updatedHeading = getNode(after, heading.path);
  assert.equal(updatedHeading.type, "heading");
  assert.equal(updatedHeading.depth, getNode(canonical, heading.path).depth);
  assert.equal(textOf(updatedHeading), HEADING_TO);

  const updatedRich = getEditableDocument(after).blocks.find(
    (block) => block.block === "paragraph" && block.path[0] === rich.path[0],
  );
  assert.equal(updatedRich?.block, "paragraph");
  if (updatedRich?.block === "paragraph") {
    assert.deepEqual(updatedRich.content, richContent);
  }

  assert.deepEqual(figureSemantic(after), figureSemantic(canonical));
  assert.deepEqual(equationSemantic(after), equationSemantic(canonical));
  assert.deepEqual(tableSemantic(after), tableSemantic(canonical));
  assert.deepEqual(admonitionSemantic(after), admonitionSemantic(canonical));
  assert.deepEqual(referenceSemantic(after), referenceSemantic(canonical));
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
  assert.equal(reparsed.type, "root");
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

function topLevelTypes(document: Document): string[] {
  return (document.children ?? []).map((node) => node.type);
}

function figureSemantic(document: Document) {
  const figure = getNode(document, [6]);
  const image = getNode(document, [6, 0]);
  const caption = getNode(document, [6, 1]);
  return {
    type: figure.type,
    kind: figure.kind ?? null,
    label: figure.label ?? null,
    identifier: figure.identifier ?? null,
    image: { type: image.type, url: image.url ?? null, alt: image.alt ?? null },
    caption: { type: caption.type, text: textOf(caption) },
  };
}

function equationSemantic(document: Document) {
  const math = getNode(document, [9]);
  return {
    type: math.type,
    value: math.value ?? null,
    label: math.label ?? null,
    identifier: math.identifier ?? null,
  };
}

function tableSemantic(document: Document) {
  const table = getNode(document, [12]);
  return {
    type: table.type,
    rows: (table.children ?? []).map((row) => ({
      type: row.type,
      cells: (row.children ?? []).map((cell) => ({ type: cell.type, text: textOf(cell) })),
    })),
  };
}

function admonitionSemantic(document: Document) {
  const admonition = getNode(document, [4]);
  return {
    type: admonition.type,
    kind: admonition.kind ?? null,
    text: textOf(admonition),
  };
}

function referenceSemantic(document: Document): ReferenceSnapshot[] {
  const references: ReferenceSnapshot[] = [];
  collectReferences(document, references);
  return references;
}

type ReferenceSnapshot = {
  type: string;
  url: string | null;
  identifier: string | null;
  label: string | null;
  kind: string | null;
};

function collectReferences(node: DocumentNode, references: ReferenceSnapshot[]): void {
  if (node.type === "link" || node.type === "crossReference") {
    references.push({
      type: node.type,
      url: typeof node.url === "string" ? node.url : null,
      identifier: typeof node.identifier === "string" ? node.identifier : null,
      label: typeof node.label === "string" ? node.label : null,
      kind: typeof node.kind === "string" ? node.kind : null,
    });
  }
  for (const child of node.children ?? []) collectReferences(child, references);
}

function textOf(node: DocumentNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map((child) => textOf(child)).join("");
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => strip(item));
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "position") continue;
    output[key] = strip(child);
  }
  return output;
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
