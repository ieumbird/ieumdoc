import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalWriteError, getEditableDocument, insertFootnote, insertParagraph, moveSection, parse, removeSection, serialize,
  updateParagraphInlineContent,
  reconcileEndnotes, removeFootnote, removeBlock, planFootnotePaste, footnoteDefinitionsMarkdown,
} from "./core-internal.ts";

// Endnotes v4: canonical Markdown writes every footnote definition after the body, in the order
// of the first reference to it, whatever placement the source or the tree had.

const SCATTERED = [
  "# Document", "",
  "## Section A", "",
  "First claim[^b] and another[^a].", "",
  "[^a]: Second note.", "",
  "## Section B", "",
  "Another paragraph[^b].", "",
  "[^b]: First note.", "",
].join("\n");

const PLACED = [
  "# Document", "",
  "## Section A", "",
  "First claim[^b] and another[^a].", "",
  "## Section B", "",
  "Another paragraph[^b].", "",
  "[^b]: First note.", "",
  "[^a]: Second note.", "",
].join("\n");

const kinds = (markdown: string) => getEditableDocument(parse(markdown)).blocks.map(block => block.block === "footnote" ? `[^${block.label}]` : block.block);

test("canonical write moves definitions after the body in first-reference order, and repeats as is", () => {
  const document = parse(SCATTERED);
  assert.equal(serialize(document), PLACED);
  assert.equal(serialize(parse(PLACED)), PLACED);
  // The tree read from either source is the same: body as written, then the endnotes.
  assert.deepEqual(kinds(SCATTERED), ["heading", "heading", "paragraph", "heading", "paragraph", "[^b]", "[^a]"]);
  assert.deepEqual(getEditableDocument(parse(SCATTERED)), getEditableDocument(parse(PLACED)));
});


test("changing reference order in the body moves the definitions on write", () => {
  const document = parse(PLACED);
  const paragraph = getEditableDocument(document).blocks[2];
  assert.equal(paragraph.block, "paragraph");
  const swapped = updateParagraphInlineContent(document, [2], [
    { kind: "text", text: "First claim" }, { kind: "footnote", label: "a" },
    { kind: "text", text: " and another" }, { kind: "footnote", label: "b" }, { kind: "text", text: "." },
  ]);
  assert.equal(serialize(swapped), PLACED.replace("First claim[^b] and another[^a].", "First claim[^a] and another[^b].")
    .replace("[^b]: First note.\n\n[^a]: Second note.\n", "[^a]: Second note.\n\n[^b]: First note.\n"));
});

test("a new footnote takes its place among the endnotes, and blocks inserted at the end stay in the body", () => {
  const inserted = insertFootnote(parse(PLACED), [2], 0, [{ kind: "text", text: "Newest." }]);
  assert.match(serialize(inserted), /Another paragraph\[\^b\]\.\n\n\[\^1\]: Newest\.\n\n\[\^b\]: First note\.\n\n\[\^a\]: Second note\.\n$/);
  const document = parse(PLACED);
  const appended = insertParagraph(document, getEditableDocument(document).blocks.length, "Appended.");
  assert.match(serialize(appended), /Another paragraph\[\^b\]\.\n\nAppended\.\n\n\[\^b\]: First note\./);
});

test("sections hold no endnotes: removing or moving one keeps every definition with its references", () => {
  const document = parse(PLACED);
  // 0 # Document · 1 ## A · 2 claims · 3 ## B · 4 another · 5 [^b] · 6 [^a]
  assert.match(serialize(moveSection(document, 3, 1)), /^# Document\n\n## Section B\n\nAnother paragraph\[\^b\]\.\n\n## Section A\n\nFirst claim\[\^b\] and another\[\^a\]\.\n\n\[\^b\]: First note\.\n\n\[\^a\]: Second note\.\n$/);
  // Section B holds a reference to [^b], which Section A also references: its definition stays.
  assert.equal(serialize(removeSection(document, 3)), "# Document\n\n## Section A\n\nFirst claim[^b] and another[^a].\n\n[^b]: First note.\n\n[^a]: Second note.\n");
  assert.equal(serialize(removeSection(document, 1)), "# Document\n\n## Section B\n\nAnother paragraph[^b].\n\n[^b]: First note.\n");
  assert.match(canonicalWriteError(removeSection(document, 1, { deferEndnotes: true })) ?? "", /\[\^a\] has no reference/, "a batch keeps the definition until completion");
});

test("completed edits reconcile global references, while intermediate moves retain definitions", () => {
  const document = parse("Body[^a].\n\n- List[^a].\n\n| Key |\n| --- |\n| Cell[^a]. |\n\n:::{figure}\n\nCaption[^a].\n:::\n\n[^a]: Shared.\n");
  let next = updateParagraphInlineContent(document, [0], [{ kind: "text", text: "Body." }]);
  next = reconcileEndnotes(document, next);
  assert.match(serialize(next), /\[\^a\]: Shared\./, "nested references keep the definition alive");
  const note = next.children.findIndex(node => node.type === "footnoteDefinition");
  const removed = removeFootnote(next, [note]);
  const markdown = serialize(removed);
  assert.ok(!markdown.includes("[^a]"), "definition deletion removes references in every surface");
  assert.match(markdown, /List\./);
  assert.match(markdown, /Cell\./);
  assert.match(markdown, /Caption\./);
  assert.equal(serialize(parse(markdown)), markdown);
  const single = parse("From[^a].\n\nTo.\n\n[^a]: Keep **rich** $x$.\n");
  const intermediate = updateParagraphInlineContent(single, [0], [{ kind: "text", text: "From." }]);
  assert.match(canonicalWriteError(intermediate) ?? "", /no reference/);
  const moved = updateParagraphInlineContent(intermediate, [1], [{ kind: "text", text: "To." }, { kind: "footnote", label: "a" }]);
  assert.match(serialize(reconcileEndnotes(single, moved)), /\[\^a\]: Keep \*\*rich\*\* \$x\$/);
  assert.equal(serialize(reconcileEndnotes(single, intermediate)), "From.\n\nTo.\n");
  assert.equal(serialize(reconcileEndnotes(single, removeBlock(single, 2))), "From.\n\nTo.\n");
  for (const body of ["[^a]", "**[^a]**", "- [^a]", "> [^a]", ":::{note}\n[^a]\n:::",
    "| Key |\n| --- |\n| [^a] |", ":::{figure}\n\n[^a]\n:::", ":::{table} [^a]\n\n| Key |\n| --- |\n| Cell |\n:::"]) {
    const only = parse(`${body}\n\n[^a]: Note.\n`);
    const removed = removeFootnote(only, [only.children.findIndex(node => node.type === "footnoteDefinition")]);
    const written = serialize(removed);
    assert.ok(!written.includes("[^a]"));
    assert.equal(serialize(parse(written)), written);
  }
});

test("clipboard definitions use Core equality, unused labels and canonical Markdown", () => {
  const note = { label: "a", content: [{ kind: "text" as const, text: "Same." }] };
  assert.deepEqual(planFootnotePaste(["a"], [note], [note]), { labels: [{ from: "a", to: "a" }], definitions: [] });
  const incoming = { label: "a", content: [{ kind: "strong" as const, children: [{ kind: "text" as const, text: "Other." }] }] };
  assert.deepEqual(planFootnotePaste(["a", "1"], [note], [incoming]), { labels: [{ from: "a", to: "2" }], definitions: [{ ...incoming, label: "2" }] });
  assert.deepEqual(planFootnotePaste([], [], [incoming]).definitions, [incoming]);
  assert.equal(footnoteDefinitionsMarkdown([incoming]), "[^a]: **Other.**\n");
  assert.throws(() => footnoteDefinitionsMarkdown([{ label: "a", content: [] }]), /non-empty/);
});

test("documents MyST would drop or reread are still refused, naming the footnote", () => {
  for (const [source, reason] of [
    ["A[^a].\n\n[^orphan]: Lost.\n\nB.\n\n[^a]: Kept.\n", /\[\^orphan\] has no reference/],
    ["A[^a].\n\n[^a]: First.\n\nB.\n\n[^a]: Second.\n", /\[\^a\] is defined more than once/],
  ] as const) {
    assert.match(canonicalWriteError(parse(source)) ?? "", reason);
    assert.throws(() => serialize(parse(source)), reason);
  }
});
