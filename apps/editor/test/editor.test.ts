import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getEditableDocument,
  getNode,
  parse,
  serialize,
  type InlineContent,
  type NodePath,
} from "@ieumdoc/core";
import {
  collectEdits,
  collectParagraphEdits,
  editableParagraphs,
  editableTextTargets,
} from "../src/edits.ts";
import { fromTiptapContent, toTiptapContent } from "../src/tiptap-inline.ts";
import {
  clearParagraphError,
  firstParagraphError,
  recordParagraphError,
  type ParagraphErrors,
} from "../src/App.tsx";
import { loadEditableDocument, saveEdits } from "../server/document-api.ts";
import { mergeParagraphEdits } from "../src/edits.ts";
import { concatInlineContent, splitInlineContent } from "../src/inline-edit.ts";

const editorRoot = fileURLToPath(new URL("..", import.meta.url));
const fixture = fileURLToPath(
  new URL("../../../packages/core/test/fixtures/technical-document.md", import.meta.url),
);

const FORMATTED_PARAGRAPH = "The converter regulates the DC-link voltage and phase current.";
const PARAGRAPH_FROM = "The current reference is calculated from the active power command.";
const PARAGRAPH_TO = "The current reference follows the active power command.";
const CAPTION_FROM = "Control block diagram of the grid-connected converter.";
const CAPTION_TO = "Control block diagram of the grid-tied converter.";
const CELL_FROM = "AC";
const CELL_TO = "AC-side";

const source = readFileSync(fixture, "utf8");

test("Editor uses the Core read model", () => {
  const document = loadEditableDocument(source);
  const fromCore = getEditableDocument(parse(source));
  assert.deepEqual(document, fromCore);

  const texts = editableTextTargets(document);
  const paragraphs = editableParagraphs(document);
  assert.equal(
    paragraphs.some((target) => target.text === PARAGRAPH_FROM),
    true,
  );
  assert.equal(
    texts.some((target) => target.text === CAPTION_FROM),
    true,
  );
  assert.equal(
    texts.some((target) => target.text === CELL_FROM),
    true,
  );
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
  const roundTrip = fromTiptapContent(tiptap);
  assert.deepEqual(roundTrip, original);
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

test("paragraph errors stay isolated when another paragraph is edited", () => {
  let errors: ParagraphErrors = {};
  errors = recordParagraphError(errors, [1], new Error("paragraph A is invalid"));
  errors = clearParagraphError(errors, [8]);

  assert.deepEqual(errors, { "1": "paragraph A is invalid" });
  assert.equal(firstParagraphError(errors), "paragraph A is invalid");
});

test("same paragraph recovery clears only its own error", () => {
  let errors: ParagraphErrors = {};
  errors = recordParagraphError(errors, [1], new Error("paragraph A is invalid"));
  errors = clearParagraphError(errors, [1]);

  assert.deepEqual(errors, {});
  assert.equal(firstParagraphError(errors), "");
});

test("multiple paragraph errors keep Save blocked until all recover", () => {
  let errors: ParagraphErrors = {};
  errors = recordParagraphError(errors, [1], new Error("paragraph A is invalid"));
  errors = recordParagraphError(errors, [8], new Error("paragraph B is invalid"));
  errors = clearParagraphError(errors, [1]);

  assert.deepEqual(errors, { "8": "paragraph B is invalid" });
  assert.equal(firstParagraphError(errors), "paragraph B is invalid");

  errors = clearParagraphError(errors, [8]);
  assert.equal(firstParagraphError(errors), "");
});

test("paragraph errors block Save before the POST request", () => {
  const app = readFileSync(path.join(editorRoot, "src", "App.tsx"), "utf8");
  const guard = app.indexOf("if (Object.keys(paragraphErrors).length > 0) {");
  const post = app.indexOf('requestDocument("POST"');
  assert.ok(guard >= 0);
  assert.ok(post > guard);
  assert.equal(app.includes('setStatus("Save failed")'), true);
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

test("formatted paragraph is an editable target", () => {
  const document = loadEditableDocument(source);
  const formatted = document.blocks.find(
    (block) => block.block === "paragraph" && block.text === FORMATTED_PARAGRAPH,
  );
  assert.equal(formatted?.block, "paragraph");
  if (formatted?.block !== "paragraph") return;
  assert.equal(formatted.editable, true);
  assert.equal(
    editableParagraphs(document).some((target) => target.text === FORMATTED_PARAGRAPH),
    true,
  );
});

test("unsupported paragraph stays read-only", () => {
  const document = loadEditableDocument(source);
  const xref = document.blocks.find(
    (block) => block.block === "paragraph" && block.text.includes("fig-control"),
  );
  assert.equal(xref?.block, "paragraph");
  if (xref?.block !== "paragraph") return;
  assert.equal(xref.editable, false);
  assert.equal(
    editableParagraphs(document).some((target) => target.text.includes("fig-control")),
    false,
  );
});

test("read-only content is not a contentEditable target", () => {
  const view = readFileSync(path.join(editorRoot, "src", "DocumentView.tsx"), "utf8");
  const editable = readFileSync(path.join(editorRoot, "src", "EditableText.tsx"), "utf8");
  assert.equal(editable.includes("contentEditable"), true);
  assert.equal(view.includes("contentEditable"), false);
  assert.equal(view.includes("block.editable"), true);
  assert.equal(view.includes("block.caption.editable"), true);
  assert.equal(view.includes("cell.editable"), true);
});

test("paragraph edits are saved through Core operations", () => {
  const saved = saveParagraph(PARAGRAPH_FROM, [{ kind: "text", text: PARAGRAPH_TO }]);
  assert.equal(saved.markdown.includes(PARAGRAPH_TO), true);
  assert.equal(saved.markdown.includes(PARAGRAPH_FROM), false);
  assert.equal(saved.markdown.includes(":::{warning}"), true);
});

test("rich paragraph saves through updateParagraphInlineContent", () => {
  const api = readFileSync(path.join(editorRoot, "server", "document-api.ts"), "utf8");
  assert.equal(api.includes("updateParagraphInlineContent"), true);
  assert.equal(api.includes("updateNodeTextAtPath"), true);

  const document = loadEditableDocument(source);
  const formatted = editableParagraphs(document).find((target) => target.text === FORMATTED_PARAGRAPH);
  assert.ok(formatted);
  const content = formatted.content.map((item) =>
    item.kind === "text" ? { ...item, text: item.text.replaceAll("regulates", "controls") } : item,
  );
  const saved = saveEdits(source, [], [{ path: formatted.path, content }]);
  assert.equal(
    saved.markdown.includes("The converter controls the **DC-link voltage** and *phase current*."),
    true,
  );
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
});

test("figure caption edits keep figure label and image", () => {
  const saved = saveWith({ [CAPTION_FROM]: CAPTION_TO });
  const figure = getNode(parse(saved.markdown), [6]);
  assert.equal(figure.kind, "figure");
  assert.equal(figure.label ?? figure.identifier, "fig-control");
  assert.equal(getNode(parse(saved.markdown), [6, 0]).url, "./diagram.svg");
  assert.equal(saved.markdown.includes(CAPTION_TO), true);
  assert.equal(saved.markdown.includes("fig-control"), true);
  assert.equal(saved.markdown.includes("./diagram.svg"), true);
});

test("table cell edits keep table structure", () => {
  const saved = saveWith({ [CELL_FROM]: CELL_TO });
  const table = getNode(parse(saved.markdown), [12]);
  assert.equal(table.type, "table");
  assert.equal(table.children?.length, 3);
  assert.equal(saved.markdown.includes("AC-side"), true);
  assert.equal(saved.markdown.includes("| Port | Type |") || saved.markdown.includes("Port"), true);
  const reparsed = parse(saved.markdown);
  assert.equal(textAt(reparsed, [12, 0, 0]), "Port");
  assert.equal(textAt(reparsed, [12, 1, 0]), "U");
  assert.equal(textAt(reparsed, [12, 1, 1]), "AC-side");
  assert.equal(textAt(reparsed, [12, 2, 1]), "DC");
});

test("saved document can be parsed again", () => {
  const saved = saveAll();
  const reparsed = parse(saved.markdown);
  assert.equal(reparsed.type, "root");
  const editable = getEditableDocument(reparsed);
  assert.equal(
    editable.blocks.some(
      (block) => block.block === "paragraph" && block.text === PARAGRAPH_TO,
    ),
    true,
  );
  assert.equal(
    editable.blocks.some(
      (block) => block.block === "figure" && block.caption.text === CAPTION_TO,
    ),
    true,
  );
});

test("canonical second serialization is stable", () => {
  const saved = saveAll();
  const second = serialize(parse(saved.markdown));
  assert.equal(saved.markdown, second);
});

const PER_BLOCK = [
  "# Converter Control",
  "",
  "The converter regulates the DC-link voltage.",
  "",
  "```{math}",
  "i* = P* / Vrms",
  "```",
  "",
  "The current reference follows the active power command.",
  "",
].join("\n");

test("cursor split keeps marks on both sides of a paragraph", () => {
  const content: InlineContent[] = [
    { kind: "text", text: "The converter regulates the " },
    { kind: "strong", children: [{ kind: "text", text: "DC-link" }] },
    { kind: "text", text: " voltage." },
  ];
  const split = splitInlineContent(content, "The converter regulates the DC".length);
  assert.deepEqual(split.before, [
    { kind: "text", text: "The converter regulates the " },
    { kind: "strong", children: [{ kind: "text", text: "DC" }] },
  ]);
  assert.deepEqual(split.after, [
    { kind: "strong", children: [{ kind: "text", text: "-link" }] },
    { kind: "text", text: " voltage." },
  ]);
  assert.deepEqual(concatInlineContent(split.before, split.after), [
    { kind: "text", text: "The converter regulates the " },
    { kind: "strong", children: [{ kind: "text", text: "DC" }] },
    { kind: "strong", children: [{ kind: "text", text: "-link" }] },
    { kind: "text", text: " voltage." },
  ]);
});

test("structural insert applies older paragraph paths before shifting them", () => {
  const document = loadEditableDocument(PER_BLOCK);
  const paragraph = editableParagraphs(document).find((item) => item.text.startsWith("The converter regulates"));
  assert.ok(paragraph);
  const merged = mergeParagraphEdits(
    document,
    { [paragraph.path.join(",")]: [{ kind: "text", text: "Edited paragraph." }] },
    [],
  );
  const saved = saveEdits(PER_BLOCK, [], merged, {
    insert: { index: 2, block: "heading", text: "Inserted", level: 2 },
  });
  assert.equal(serialize(parse(saved.markdown)), saved.markdown);
  const blocks = saved.document.blocks.map((block) =>
    block.block === "heading" || block.block === "paragraph"
      ? `${block.block}:${block.text}`
      : block.block === "equation"
        ? `${block.block}:${block.latex}`
        : block.block,
  );
  assert.deepEqual(blocks, [
    "heading:Converter Control",
    "paragraph:Edited paragraph.",
    "heading:Inserted",
    "equation:i* = P* / Vrms",
    "paragraph:The current reference follows the active power command.",
  ]);
});

test("insert paragraph, heading, and equation then delete round-trips", () => {
  let saved = saveEdits(PER_BLOCK, [], [], { insert: { index: 2, block: "paragraph", text: "Added paragraph." } });
  saved = saveEdits(saved.markdown, [], [], { insert: { index: 4, block: "equation", latex: "E = mc^2" } });
  saved = saveEdits(saved.markdown, [], [], { insert: { index: 1, block: "heading", text: "", level: 2 } });
  const equation = saved.document.blocks.find((block) => block.block === "equation" && block.latex === "i* = P* / Vrms");
  assert.ok(equation);
  saved = saveEdits(saved.markdown, [], [], {
    equations: [{ path: equation.path, latex: "P / V" }],
    remove: saved.document.blocks.findIndex((block) => block.block === "paragraph" && block.text === "Added paragraph."),
  });
  assert.equal(serialize(parse(saved.markdown)), saved.markdown);
  assert.equal(saved.markdown.includes("Added paragraph."), false);
  assert.equal(saved.markdown.includes("E = mc^2"), true);
  assert.equal(saved.markdown.includes("P / V"), true);
  assert.equal(
    saved.document.blocks.some((block) => block.block === "heading" && block.text.length === 0),
    true,
  );
});

test("saved file matches the Core write path", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-editor-"));
  const file = path.join(dir, "technical-document.md");
  try {
    const saved = saveAll();
    writeFileSync(file, saved.markdown);
    assert.equal(readFileSync(file, "utf8"), saved.markdown);
    assert.equal(serialize(parse(readFileSync(file, "utf8"))), saved.markdown);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function saveWith(replacements: Record<string, string>) {
  const document = loadEditableDocument(source);
  const drafts: Record<string, string> = {};
  for (const [from, to] of Object.entries(replacements)) {
    drafts[textPathOf(document, from)] = to;
  }
  return saveEdits(source, collectEdits(document, drafts));
}

function saveParagraph(from: string, content: InlineContent[]) {
  const document = loadEditableDocument(source);
  const target = editableParagraphs(document).find((item) => item.text === from);
  assert.ok(target, `missing editable paragraph: ${from}`);
  return saveEdits(source, [], collectParagraphEdits(document, { [target.path.join(",")]: content }));
}

function saveAll() {
  const document = loadEditableDocument(source);
  const paragraph = editableParagraphs(document).find((item) => item.text === PARAGRAPH_FROM);
  assert.ok(paragraph);
  const textDrafts = {
    [textPathOf(document, CAPTION_FROM)]: CAPTION_TO,
    [textPathOf(document, CELL_FROM)]: CELL_TO,
  };
  return saveEdits(source, collectEdits(document, textDrafts), [
    { path: paragraph.path, content: [{ kind: "text", text: PARAGRAPH_TO }] },
  ]);
}

function textPathOf(document: ReturnType<typeof loadEditableDocument>, text: string): string {
  const target = editableTextTargets(document).find((item) => item.text === text);
  assert.ok(target, `missing editable text target: ${text}`);
  return target.path.join(",");
}

function textAt(document: ReturnType<typeof parse>, path: NodePath): string {
  const node = getNode(document, path);
  const value = typeof node.value === "string" ? node.value : "";
  if (value) return value;
  return (node.children ?? []).map((child) => (typeof child.value === "string" ? child.value : "")).join("");
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
