import assert from "node:assert/strict";
import test from "node:test";
import { containerChildrenTransform, enumerateTargetsTransform, liftMystDirectivesAndRolesTransform, ReferenceState } from "myst-transforms";
import { mystParse } from "myst-parser";
import { VFile } from "vfile";
import { parseDocument } from "yaml";
import { validateNumbering } from "myst-frontmatter";
import { headingNumbers, blockTargets, targetNumbers, captionNumberText, referenceNumberText } from "../src/numbering.ts";
import { updateHeadingNumbering, getHeadingNumbering } from "../src/myst/heading-numbering.ts";
import { getEditableDocument, insertEquation, moveBlock, parse, removeBlock, serialize, type MystDocument, type MystNode } from "./core-internal.ts";

const numbers = (document: MystDocument) => targetNumbers(getEditableDocument(document).blocks.map(blockTargets));

test("all tables keep official numbers through canonical directives and caption/label edits", async () => {
  const core = await import("../src/index.ts");
  const grids = ["|  |  |\n| --- | --- |\n|  |  |", "| Header | Only |\n| --- | --- |",
    "| Left | Center | Right |\n| :--- | :---: | ---: |\n| **a** | b | $x$ |"];
  const source = `---\nieumdoc: 1\n---\n\n${grids[0]}\n\n:::{table}\n\n${grids[1]}\n:::\n\n${grids[2]}\n\n:::{table} Last\n:name: last\n\n${grids[1]}\n:::\n\nSee {numref}\`last\`.\n`;
  let document = core.parse(source);
  const expected = [{ table: 1 }, { table: 2 }, { table: 3 }, { table: 4 }, {}];
  const read = () => core.getEditableDocument(document);
  assert.deepEqual(targetNumbers(read().blocks.map(blockTargets)), expected);
  const original = read().blocks;
  const saved = core.serialize(document);
  assert.equal(saved.match(/:::?\{table\}/g)?.length, 4);
  assert.equal(core.serialize(core.parse(saved)), saved);
  assert.deepEqual(core.getEditableDocument(core.parse(saved)).blocks, original);
  const file = new VFile();
  const tree = mystParse(saved, { vfile: file });
  liftMystDirectivesAndRolesTransform(tree);
  containerChildrenTransform(tree, file);
  enumerateTargetsTransform(tree as never, { state: new ReferenceState("tables.md", { vfile: file }) });
  assert.deepEqual(file.messages, []);
  assert.deepEqual(tree.children.filter(node => node.kind === "table").map(node => node.enumerator), ["1", "2", "3", "4"]);
  for (const caption of ["Filled", ""]) {
    document = core.updateTableCaption(document, [2], caption);
    assert.deepEqual(targetNumbers(read().blocks.map(blockTargets)), expected);
  }
  document = core.updateLabel(document, [2], "temporary");
  document = core.updateLabel(document, [2], "");
  assert.deepEqual(targetNumbers(read().blocks.map(blockTargets)), expected);
  assert.deepEqual(read().blocks, original);
  assert.equal(core.serialize(document), saved);
});

test("caption numbers preserve legacy defaults and share authored reference templates", () => {
  for (const kind of ["figure", "table"] as const) {
    const legacy = kind === "figure" ? "Figure 1" : "Table 1";
    assert.equal(captionNumberText(kind, 1), legacy);
    assert.equal(captionNumberText(kind, 1, null), legacy);
    assert.equal(captionNumberText(kind, 1, { equation: "식 (%s)" }), legacy);
    for (const template of [kind === "figure" ? "그림 %s" : "표 %s", "Item %s of %s / {number} / {subEnumerator}", "Custom\u00a0%s:"]) {
      assert.equal(captionNumberText(kind, 3, { [kind]: template }), referenceNumberText(kind, 3, { [kind]: template }));
    }
  }
});

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


test("reference templates use MyST defaults, accept shorthand, and coexist losslessly with heading settings", async () => {
  const core = await import("../src/index.ts");
  const source = "---\nieumdoc: 1 # marker\nbibliography: [refs.bib] # resources\nnumbering:\n  headings: true # sections\n  title: false\n  figure: 'Illustration %s' # shorthand\n  equation: { template: 'Formula {number}' }\n---\n\n## Section\n\nText.\n";
  const document = core.parse(source);
  const original = core.serialize(document);
  const templates = core.getEditableDocument(document).referenceTemplates;
  assert.deepEqual(templates, { figure: "Illustration %s", equation: "Formula {number}" });
  assert.deepEqual(["figure", "table", "equation"].map(kind => core.referenceNumberText(kind as "figure" | "table" | "equation", 1)), ["Figure\u00a01", "Table\u00a01", "(1)"]);
  assert.equal(core.referenceNumberText("equation", 2, templates), "Formula 2");
  const korean = { figure: "그림 %s", table: "표 %s", equation: "식 (%s)" };
  const next = core.updateReferenceTemplates(document, korean);
  assert.equal(core.serialize(document), original);
  const saved = core.serialize(core.updateHeadingNumbering(next, false));
  for (const retained of ["# marker", "# resources", "# sections", "title: false", "headings: false"]) assert.ok(saved.includes(retained), retained);
  assert.deepEqual(parseDocument(saved.split("---")[1]).toJS().bibliography, ["refs.bib"]);
  assert.equal(parseDocument(saved.split("---")[1]).getIn(["numbering", "figure", "template"]), korean.figure);
  assert.deepEqual(core.getEditableDocument(core.parse(saved)).referenceTemplates, korean);
  assert.equal(core.serialize(core.parse(saved)), saved);
  const partial = core.updateReferenceTemplates(next, { figure: null });
  assert.deepEqual(core.getEditableDocument(partial).referenceTemplates, { table: korean.table, equation: korean.equation });
  const reset = core.updateReferenceTemplates(partial, { table: null, equation: null });
  assert.equal(core.getEditableDocument(reset).referenceTemplates, undefined);
  assert.ok(core.getEditableDocument(reset).headingNumbering);
  const empty = core.updateReferenceTemplates(core.createDocument(), { figure: null });
  assert.doesNotMatch(core.serialize(empty), /numbering:/);
  const only = core.updateReferenceTemplates(core.createDocument(), { figure: "Fig. %s" });
  assert.doesNotMatch(core.serialize(core.updateReferenceTemplates(only, { figure: null })), /numbering:/);
  assert.equal(core.referenceNumberText("figure", 3, { figure: "%s / {number} / {subEnumerator}" }), "3 / 3 / 3");
});

test("reference templates refuse invalid values and unknown numbering settings without changing the source", async () => {
  const core = await import("../src/index.ts");
  const document = core.createDocument();
  const original = core.serialize(document);
  for (const templates of [{ figure: "" }, { table: " \t" }, { equation: "Equation" }, { equation: 1 }, { figure: true }, { figure: undefined }, { heading: "%s" }, { figure: "%s {name}" }, [], null]) {
    assert.throws(() => core.updateReferenceTemplates(document, templates as never), /template/);
    assert.equal(core.serialize(document), original);
  }
  for (const numbering of ["other: '%s'", "figure: { template: '%s', start: 2 }", "figure: { template: '' }", "figure: true", "table: { template: 'Table' }", "headings: true\n  start: 2", "title: true"]) {
    assert.throws(() => core.parse(`---\nieumdoc: 1\nnumbering:\n  ${numbering}\n---\n`), /Numbering/);
  }
});


test("reference template updates retain comments on mappings, scalars and shorthand", async () => {
  const core = await import("../src/index.ts");
  for (const figure of [
    "figure: { template: 'Figure %s' } # keep this explanation",
    "figure: # kind explanation\n    # template explanation\n    template: 'Figure %s' # value explanation",
  ]) {
    const source = `---\nieumdoc: 1\nnumbering:\n  ${figure}\n---\n\nText.\n`;
    const document = core.parse(source);
    const original = core.serialize(document);
    assert.equal(core.serialize(core.updateReferenceTemplates(document, {figure: "Figure %s"})), original);
    const changed = core.serialize(core.updateReferenceTemplates(document, {figure: "Illustration %s"}));
    const comments = source.match(/#[^\n]*/g) ?? [];
    for (const comment of comments) assert.ok(changed.includes(comment), comment);
    assert.equal(core.getEditableDocument(core.parse(changed)).referenceTemplates?.figure, "Illustration %s");
    assert.equal(core.serialize(document), original);
  }
  const shorthand = core.parse("---\nieumdoc: 1\nnumbering:\n  figure: 'Figure %s' # shorthand explanation\n---\n");
  const changed = core.serialize(core.updateReferenceTemplates(shorthand, {figure: "Illustration %s"}));
  assert.ok(changed.includes("# shorthand explanation"));
  assert.ok(parseDocument(changed.split("---")[1]).hasIn(["numbering", "figure", "template"]));
});

test("default reference text matches MyST no-break spaces exactly without authoring settings", async () => {
  const core = await import("../src/index.ts");
  assert.equal(core.referenceNumberText("figure", 1), "Figure\u00a01");
  assert.equal(core.referenceNumberText("table", 1), "Table\u00a01");
  assert.doesNotMatch(core.serialize(core.createDocument()), /numbering:/);
});
