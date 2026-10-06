import assert from "node:assert/strict";
import test from "node:test";
import { enumerateTargetsTransform, ReferenceState } from "myst-transforms";
import { VFile } from "vfile";
import { headingNumbers } from "../src/numbering.ts";
import { updateHeadingNumbering } from "../src/myst/heading-numbering.ts";
import { getHeadingNumbering } from "../src/myst/heading-numbering.ts";
import { validateNumbering } from "myst-frontmatter";
import { parseDocument } from "yaml";
import { serialize } from "./core-internal.ts";
import { blockTargets, targetNumbers } from "../src/numbering.ts";
import { getEditableDocument, insertEquation, moveBlock, parse, removeBlock, type MystDocument, type MystNode } from "./core-internal.ts";

const source = [
  "# Intro",
  "$$\na\n$$",
  "$$\nb\n$$ (eq-b)",
  "```{math}\n:label: eq-c\n:enumerated: false\nc\n```",
  ":::{figure} ./a.png\nNo label\n:::",
  ":::{figure} ./b.png\n:label: fig-b\nB\n:::",
  ":::{note}\n$$\nnested\n$$\n:::",
  ":::{table} Values\n:label: tbl-a\n| a |\n| - |\n| 1 |\n:::",
  "| plain |\n| - |\n| 1 |",
].join("\n\n") + "\n";

const numbers = (document: MystDocument) => targetNumbers(getEditableDocument(document).blocks.map(blockTargets));

test("target numbers are the ones MyST gives display equations, figures and captioned tables", () => {
  const document = parse(source);
  assert.deepEqual(numbers(document), [
    {}, { equation: 1 }, { equation: 2 }, {}, { figure: 1 }, { figure: 2 }, { equation: 3 }, { table: 1 }, {},
  ]);
  const tree = structuredClone(document);
  enumerateTargetsTransform(tree as never, { state: new ReferenceState("document.md", { vfile: new VFile() }) });
  const enumerators: string[] = [];
  const visit = (node: MystNode) => {
    if (node.enumerator !== undefined) enumerators.push(`${node.type}:${String(node.kind ?? "")}=${String(node.enumerator)}`);
    node.children?.forEach(visit);
  };
  visit(tree);
  assert.deepEqual(enumerators, [
    "math:=1", "math:=2", "container:figure=1", "container:figure=2", "math:=3", "container:table=1",
  ]);
});

test("the read model records numbered targets only where a block differs from its kind's default", () => {
  const blocks = getEditableDocument(parse(source)).blocks;
  assert.deepEqual(blocks.flatMap((block, index) => block.numbered ? [[index, block.numbered]] : []), [
    [3, {}], [6, { equation: 1 }],
  ]);
});

test("numbers follow insertions, moves and removals without being written", () => {
  const document = parse("$$\na\n$$ (eq-a)\n\n:::{figure} ./a.png\n:label: fig-a\n:::\n\n:::{figure} ./b.png\n:::\n\n$$\nb\n$$\n");
  assert.deepEqual(numbers(document), [{ equation: 1 }, { figure: 1 }, { figure: 2 }, { equation: 2 }]);
  assert.deepEqual(numbers(insertEquation(document, 0, "x")), [{ equation: 1 }, { equation: 2 }, { figure: 1 }, { figure: 2 }, { equation: 3 }]);
  assert.deepEqual(numbers(moveBlock(document, 2, 1)), [{ equation: 1 }, { figure: 1 }, { figure: 2 }, { equation: 2 }]);
  assert.deepEqual(numbers(removeBlock(document, 0)), [{ figure: 1 }, { figure: 2 }, { equation: 1 }]);
});


test("heading numbering matches MyST and preserves metadata without inserting numbers in heading text", () => {
  const source = "---\n# Keep this comment\ntitle: My document\nnumbering:\n  figure: false # retained\n---\n\n# Title\n\n## First\n\n### Detail\n\n## Second\n";
  const document = parse(source);
  const before = structuredClone(document);
  const next = updateHeadingNumbering(document, true);
  const markdown = serialize(next);
  assert.match(markdown, /# Keep this comment/);
  assert.match(markdown, /figure: false # retained/);
  assert.match(markdown, /## First/);
  assert.doesNotMatch(markdown, /## 1/);
  assert.deepEqual(document, before);
  const read = getEditableDocument(next);
  assert.deepEqual(headingNumbers(read.blocks, read.headingNumbering), [undefined, undefined, "1", "1.1", "2"]);
  const tree = structuredClone(next);
  const metadata = parseDocument(String(tree.children[0].value)).toJS();
  metadata.numbering = validateNumbering(metadata.numbering, {property:"numbering", messages:{}});
  enumerateTargetsTransform(tree as never, {state: new ReferenceState("document.md", {frontmatter: metadata, vfile: new VFile()})});
  assert.deepEqual(tree.children.map(node => node.type === "heading" ? node.enumerator : undefined), headingNumbers(read.blocks, read.headingNumbering));
  const moved = moveBlock(next, 4, 2);
  assert.deepEqual(headingNumbers(getEditableDocument(moved).blocks, getHeadingNumbering(moved)), [undefined, undefined, "1", "2", "2.1"]);
  assert.equal(getHeadingNumbering(updateHeadingNumbering(next, false)), undefined);
  assert.equal(serialize(parse(markdown)), markdown);
  assert.throws(() => updateHeadingNumbering(parse("---\nnumbering: [bad]\n---\n\n# Title\n"), true), /numbering must/);
  // Existing level starts and skipped depths use the upstream counter projection.
  for (const settings of [
    "headings: true\n  heading_1: 3",
    "headings: true\n  heading_2: false",
    "headings: true\n  enumerator: 'S.%s'",
  ]) {
    const document = parse(`---\nnumbering:\n  ${settings}\n---\n\n# Title\n\n## First\n\n### Detail\n\n## Next\n`);
    const read = getEditableDocument(document);
    const tree = structuredClone(document);
    const raw = parseDocument(String(tree.children[0].value)).toJS();
    raw.numbering = validateNumbering(raw.numbering, {property:"numbering", messages:{}});
    enumerateTargetsTransform(tree as never, {state: new ReferenceState("document.md", {frontmatter: raw, vfile: new VFile()})});
    assert.deepEqual(headingNumbers(read.blocks, read.headingNumbering), tree.children.map(node => node.type === "heading" ? node.enumerator : undefined));
  }
  // Boolean numbering retains its effect on non-heading objects when expanded.
  const expanded = serialize(updateHeadingNumbering(parse("---\nnumbering: false\n---\n\n## Section\n"), true));
  assert.match(expanded, /all: false/);
  // A nested read-only heading is omitted from the editable outline but still consumes a number.
  const nested = updateHeadingNumbering(parse("# Title\n\n## First\n\n> ## Quoted\n\n## Last\n"), true);
  const nestedRead = getEditableDocument(nested);
  const nestedTree = structuredClone(nested);
  const nestedMetadata = parseDocument(String(nestedTree.children[0].value)).toJS();
  nestedMetadata.numbering = validateNumbering(nestedMetadata.numbering, {property:"numbering", messages:{}});
  enumerateTargetsTransform(nestedTree as never, {state: new ReferenceState("document.md", {frontmatter:nestedMetadata, vfile:new VFile()})});
  assert.deepEqual(headingNumbers(nestedRead.blocks, nestedRead.headingNumbering), nestedTree.children.map(node => node.type === "heading" ? node.enumerator : undefined));
  assert.equal(headingNumbers(nestedRead.blocks, nestedRead.headingNumbering).at(-1), "3");
});
