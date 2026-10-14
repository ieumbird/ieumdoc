import assert from "node:assert/strict";
import test from "node:test";
import { enumerateTargetsTransform, ReferenceState } from "myst-transforms";
import { VFile } from "vfile";
import { parseDocument } from "yaml";
import { validateNumbering } from "myst-frontmatter";
import { headingNumbers, blockTargets, targetNumbers } from "../src/numbering.ts";
import { updateHeadingNumbering, getHeadingNumbering } from "../src/myst/heading-numbering.ts";
import { getEditableDocument, insertEquation, moveBlock, parse, removeBlock, serialize, type MystDocument, type MystNode } from "./core-internal.ts";

const numbers = (document: MystDocument) => targetNumbers(getEditableDocument(document).blocks.map(blockTargets));

test("native target numbers agree with MyST and follow insertions, moves and removals", () => {
  const document = parse("$$\na\n$$ (eq-a)\n\n:::{figure} ./a.png\n:label: fig-a\n:::\n\n:::{figure} ./b.png\n:::\n\n$$\nb\n$$\n");
  assert.deepEqual(numbers(document), [{ equation: 1 }, { figure: 1 }, { figure: 2 }, { equation: 2 }]);
  const tree = structuredClone(document);
  enumerateTargetsTransform(tree as never, { state: new ReferenceState("document.md", { vfile: new VFile() }) });
  const enumerators: string[] = [];
  const visit = (node: MystNode) => {
    if (node.enumerator !== undefined) enumerators.push(String(node.enumerator));
    node.children?.forEach(visit);
  };
  visit(tree);
  assert.deepEqual(enumerators, ["1", "1", "2", "2"]);
  assert.deepEqual(numbers(insertEquation(document, 0, "x")), [{ equation: 1 }, { equation: 2 }, { figure: 1 }, { figure: 2 }, { equation: 3 }]);
  assert.deepEqual(numbers(moveBlock(document, 2, 1)), [{ equation: 1 }, { figure: 1 }, { figure: 2 }, { equation: 2 }]);
  assert.deepEqual(numbers(removeBlock(document, 0)), [{ figure: 1 }, { figure: 2 }, { equation: 1 }]);
  const table = parse(":::{table} Values\n:label: tbl-a\n| a |\n| - |\n| 1 |\n:::\n");
  assert.deepEqual(numbers(table), [{ table: 1 }]);
});

test("native heading policy matches MyST without writing numbers into heading text", () => {
  const source = "---\nieumdoc: 1\n# Native document\n---\n\n# Title\n\n## First\n\n### Detail\n\n## Second\n";
  const document = parse(source);
  const before = structuredClone(document);
  const next = updateHeadingNumbering(document, true);
  const markdown = serialize(next);
  assert.match(markdown, /ieumdoc: 1/);
  assert.match(markdown, /## First/);
  assert.doesNotMatch(markdown, /## 1/);
  assert.deepEqual(document, before);
  const read = getEditableDocument(next);
  assert.deepEqual(headingNumbers(read.blocks, read.headingNumbering), [undefined, "1", "1.1", "2"]);
  const tree = structuredClone(next);
  const metadata = parseDocument(String(tree.children[0].value)).toJS();
  metadata.numbering = validateNumbering(metadata.numbering, { property: "numbering", messages: {} });
  enumerateTargetsTransform(tree as never, { state: new ReferenceState("document.md", { frontmatter: metadata, vfile: new VFile() }) });
  assert.deepEqual(tree.children.slice(1).map(node => node.enumerator), headingNumbers(read.blocks, read.headingNumbering));
  const moved = moveBlock(next, 4, 2);
  assert.deepEqual(headingNumbers(getEditableDocument(moved).blocks, getHeadingNumbering(moved)), [undefined, "1", "2", "2.1"]);
  assert.equal(getHeadingNumbering(updateHeadingNumbering(next, false)), undefined);
  assert.equal(serialize(parse(markdown)), markdown);
});
