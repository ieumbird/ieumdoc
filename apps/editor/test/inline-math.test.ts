import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import type { InlineContent } from "@ieumdoc/core";
import { editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { collectSupportedEdits, toTiptapDocument, type TiptapJSON } from "../src/tiptap-document.ts";
import { documentRevision, loadEditableDocument, saveDocumentFile, saveEdits } from "../server/document-api.ts";

const source = [
  "The current is $i_d$ and the voltage is **$v_{dc}$**.",
  "",
  "See {eq}`eq-a` and [the $x$ page](https://a.example).",
  "",
  "```{math}",
  ":label: eq-a",
  "x",
  "```",
  "",
].join("\n");

function editorState(markdown: string) {
  const baseline = toTiptapDocument(loadEditableDocument(markdown));
  const schema = getSchema(editorExtensions());
  let rejected = 0;
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(baseline), plugins: [structureGuardPlugin(baseline, () => rejected++)] });
  return { state, rejected: () => rejected };
}

/** Apply a transaction through the structure guard and return the saved Markdown. */
function edit(markdown: string, change: (state: EditorState) => EditorState["tr"]): string {
  const { state, rejected } = editorState(markdown);
  const next = state.apply(change(state));
  assert.equal(rejected(), 0);
  return saveEdits(markdown, collectSupportedEdits(loadEditableDocument(markdown), next.doc.toJSON() as TiptapJSON)).markdown;
}

function mathAt(doc: ProseMirrorNode, value: string): number {
  let found = -1;
  doc.descendants((node, position) => {
    if (found < 0 && node.type.name === "inlineMath" && node.attrs.value === value) found = position;
  });
  assert.ok(found >= 0, value);
  return found;
}

function textRange(doc: ProseMirrorNode, needle: string): { from: number; to: number } {
  let found: { from: number; to: number } | undefined;
  doc.descendants((node, position) => {
    const index = node.isText ? node.text!.indexOf(needle) : -1;
    if (!found && index >= 0) found = { from: position + index, to: position + index + needle.length };
  });
  assert.ok(found, needle);
  return found;
}

test("inline math projects to atomic inline nodes carrying marks", () => {
  const projection = toTiptapDocument(loadEditableDocument(source));
  const first = projection.content![0];
  assert.equal(first.type, "paragraph");
  assert.deepEqual(first.content?.filter((node) => node.type === "inlineMath"), [
    { type: "inlineMath", attrs: { value: "i_d" } },
    { type: "inlineMath", attrs: { value: "v_{dc}" }, marks: [{ type: "bold" }] },
  ]);
  // The cross-reference paragraph stays read-only; the display equation stays a block.
  assert.deepEqual(projection.content!.map((node) => node.type), ["paragraph", "readonlyParagraph", "equation"]);
  const schema = getSchema(editorExtensions());
  const node = schema.nodeFromJSON(projection);
  assert.deepEqual(schema.nodeFromJSON(node.toJSON()).toJSON(), node.toJSON());
});

test("unchanged inline math paragraphs send no edit", () => {
  for (const markdown of [source, "Role {math}`x` and $y$ and [**$z$**](u).\n"]) {
    const { state } = editorState(markdown);
    assert.deepEqual(collectSupportedEdits(loadEditableDocument(markdown), state.doc.toJSON() as TiptapJSON).paragraphs, [], markdown);
  }
});

test("inline math source can be changed, created from text and removed back to text", () => {
  const changed = edit(source, (state) => state.tr.setNodeAttribute(mathAt(state.doc, "i_d"), "value", "i_q"));
  assert.match(changed, /^The current is \{math\}`i_q` and the voltage is \*\*\{math\}`v_\{dc\}`\*\*\.$/m);

  const created = edit("The voltage v_{dc} is high.\n", (state) => {
    const { from, to } = textRange(state.doc, "v_{dc}");
    return state.tr.replaceWith(from, to, state.schema.nodes.inlineMath.create({ value: "v_{dc}" }));
  });
  assert.equal(created, "The voltage {math}`v_{dc}` is high.\n");

  const removed = edit(source, (state) => {
    const position = mathAt(state.doc, "v_{dc}");
    const node = state.doc.nodeAt(position)!;
    return state.tr.replaceWith(position, position + node.nodeSize, state.schema.text("v_dc", node.marks));
  });
  assert.match(removed, /^The current is \{math\}`i_d` and the voltage is \*\*v\\_dc\*\*\.$/m);

  // Everything else in the document is written as before.
  const rest = (markdown: string) => markdown.slice(markdown.indexOf("See {eq}"));
  assert.equal(rest(changed), rest(saveEdits(source, {}).markdown));
});

test("inline math keeps its meaning with bold, italic and links", () => {
  const saved = edit("Plain text here.\n", (state) => {
    const { from, to } = textRange(state.doc, "text");
    const marks = [state.schema.marks.italic.create(), state.schema.marks.link.create({ href: "https://a.example" })];
    return state.tr.replaceWith(from, to, state.schema.nodes.inlineMath.create({ value: "x^2" }, null, marks));
  });
  // Equal runs: the adapter's tie-break (bold, italic, link) puts italic outermost.
  assert.equal(saved, "Plain *[{math}`x^2`](https://a.example)* here.\n");
});

test("Host rejects inline math Core cannot preserve without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-inline-math-"));
  const file = path.join(dir, "math.md");
  const markdown = "See $x$.\n";
  writeFileSync(file, markdown);
  try {
    const revision = documentRevision(markdown);
    const content = (value: string): InlineContent[] => [{ kind: "text", text: "See " }, { kind: "math", value }, { kind: "text", text: "." }];
    for (const [value, reason] of [["`x", /cannot round-trip/], ["a\nb", /single-line/]] as const) {
      assert.throws(() => saveDocumentFile(file, { revision, paragraphs: [{ path: [0], content: content(value) }] }), reason);
      assert.equal(readFileSync(file, "utf8"), markdown);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
