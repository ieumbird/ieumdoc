import assert from "node:assert/strict";
import test from "node:test";
import { enumerateTargetsTransform, ReferenceState } from "myst-transforms";
import { VFile } from "vfile";
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
