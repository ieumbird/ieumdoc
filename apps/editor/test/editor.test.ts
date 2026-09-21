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
  type NodePath,
} from "@ieumdoc/core";
import { collectEdits, editableTargets } from "../src/edits.ts";
import { loadEditableDocument, saveEdits } from "../server/document-api.ts";

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

  const targets = editableTargets(document);
  assert.equal(
    targets.some((target) => target.text === PARAGRAPH_FROM),
    true,
  );
  assert.equal(
    targets.some((target) => target.text === CAPTION_FROM),
    true,
  );
  assert.equal(
    targets.some((target) => target.text === CELL_FROM),
    true,
  );

  const drafts = {
    [pathOf(document, PARAGRAPH_FROM)]: PARAGRAPH_TO,
  };
  const edits = collectEdits(document, drafts);
  assert.equal(edits.length, 1);
  assert.deepEqual(edits[0]?.from, PARAGRAPH_FROM);
  assert.deepEqual(edits[0]?.to, PARAGRAPH_TO);
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

test("formatted content is not included in editable targets", () => {
  const document = loadEditableDocument(source);
  const formatted = document.blocks.find(
    (block) => block.block === "paragraph" && block.text === FORMATTED_PARAGRAPH,
  );
  assert.equal(formatted?.block, "paragraph");
  if (formatted?.block !== "paragraph") return;
  assert.equal(formatted.editable, false);
  assert.equal(
    editableTargets(document).some((target) => target.text === FORMATTED_PARAGRAPH),
    false,
  );
  assert.equal(
    editableTargets(document).some((target) => target.text === PARAGRAPH_FROM),
    true,
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
  const saved = saveWith({ [PARAGRAPH_FROM]: PARAGRAPH_TO });
  assert.equal(saved.markdown.includes(PARAGRAPH_TO), true);
  assert.equal(saved.markdown.includes(PARAGRAPH_FROM), false);
  assert.equal(saved.markdown.includes(":::{warning}"), true);
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
    drafts[pathOf(document, from)] = to;
  }
  return saveEdits(source, collectEdits(document, drafts));
}

function saveAll() {
  return saveWith({
    [PARAGRAPH_FROM]: PARAGRAPH_TO,
    [CAPTION_FROM]: CAPTION_TO,
    [CELL_FROM]: CELL_TO,
  });
}

function pathOf(document: ReturnType<typeof loadEditableDocument>, text: string): string {
  const target = editableTargets(document).find((item) => item.text === text);
  assert.ok(target, `missing editable target: ${text}`);
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
