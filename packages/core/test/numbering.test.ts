import assert from "node:assert/strict";
import test from "node:test";
import { containerChildrenTransform, enumerateTargetsTransform, liftMystDirectivesAndRolesTransform, ReferenceState, resolveReferencesTransform } from "myst-transforms";
import { mystParse } from "myst-parser";
import { VFile } from "vfile";
import { parseDocument } from "yaml";
import { validateNumbering } from "myst-frontmatter";
import { headingNumbers, sectionReferenceText, blockTargets, targetNumbers, captionNumberText, referenceNumberText } from "../src/numbering.ts";
import { updateHeadingNumbering, getHeadingNumbering } from "../src/myst/heading-numbering.ts";
import { getEditableDocument, insertEquation, moveBlock, parse, removeBlock, serialize, type MystDocument, type MystNode } from "./core-internal.ts";

const numbers = (document: MystDocument) => targetNumbers(getEditableDocument(document).blocks.map(blockTargets));

test("fixed enumerators survive canonical writing, edits, moves and MyST target resolution", async () => {
  const core = await import("../src/index.ts");
  const source = "---\nlitzio: 1\n---\n\n:::{figure} ./image.png\n:name: fig\n:enumerator: 17\n:alt: Image\n\nCaption with $x$ and {eq}`eq`.\n:::\n\n:::{table} Values\n:name: tbl\n:enumerator: A.3\n\n| A | B |\n| :--- | ---: |\n| $x$ | `a` |\n:::\n\n```{math}\n:label: eq\n:enumerator: 4-2\n\nx=1\n```\n\n:::{figure}\n:name: diagram\n:enumerator: A.3\n\n```{mermaid}\ngraph TD; A-->B\n```\n\nDiagram with $x$ and {eq}`eq`.\n:::\n\n:::{figure}\n:enumerator: 5\n:::\n\nSee {numref}`fig`, {numref}`tbl`, {eq}`eq` and {numref}`diagram`.\n";
  const document = core.parse(source);
  const saved = core.serialize(document);
  assert.equal(core.serialize(core.parse(saved)), saved);
  const read = (doc: import("../src/index.ts").Document) => core.getEditableDocument(doc).blocks;
  assert.deepEqual(read(core.parse(saved)).map(block => "enumerator" in block ? block.enumerator : undefined), ["17", "A.3", "4-2", "A.3", "5", undefined]);
  assert.deepEqual(core.numberingReport(read(document)).diagnostics, []);
  assert.deepEqual(core.targetNumbers(read(document).map(core.blockTargets)), [{ figure: "17" }, { table: "A.3" }, { equation: "4-2" }, { figure: "A.3" }, { figure: "5" }, {}]);
  assert.deepEqual(core.unresolvedReferences(document), []);
  let edited = core.updateTableCaption(document, [2], "Changed");
  edited = core.updateLabel(edited, [2], "renamed", { updateReferences: true });
  edited = core.updateEquationLatex(edited, [3], "x=1", "x=2");
  edited = core.updateFigure(edited, [1], { imageAlt: "New alt" });
  edited = core.moveBlock(edited, 1, 4);
  assert.deepEqual(read(core.parse(core.serialize(edited))).flatMap(block => "enumerator" in block ? [block.enumerator] : []), ["A.3", "4-2", "A.3", "17", "5"]);
  assert.equal(core.serialize(document), saved);
  const file = new VFile();
  const tree = mystParse(saved, { vfile: file });
  liftMystDirectivesAndRolesTransform(tree);
  containerChildrenTransform(tree, file);
  const state = new ReferenceState("fixed.md", { vfile: file });
  enumerateTargetsTransform(tree as never, { state });
  // Pending Figures are an accepted Core authoring state; MyST's container validator
  // diagnoses that one empty container while still enumerating it.
  assert.deepEqual(file.messages.map(message => message.ruleId), ["container-children-valid"]);
  assert.deepEqual(tree.children.filter(node => node.kind === "figure" || node.kind === "table" || node.type === "math").map(node => node.enumerator), ["17", "A.3", "4-2", "A.3", "5"]);
  resolveReferencesTransform(tree as never, file, { state });
  const paragraph = tree.children.at(-1)!;
  const referenceText = (node: MystNode): string => node.type === "text" ? String(node.value) : (node.children ?? []).map(referenceText).join("");
  assert.equal(referenceText(paragraph as MystNode), "See Figure\u00a017, Table\u00a0A.3, (4-2) and Figure\u00a0A.3.");
  assert.equal(core.referenceNumberText("figure", "A$&.3", { figure: "Figure %s / {number}" }), "Figure A$&.3 / A$&.3");
});

test("fixed-number operations preserve exact strings and report nonblocking missing/duplicate numbers", async () => {
  const core = await import("../src/index.ts");
  let document = core.parse("---\nlitzio: 1\n---\n\n:::{figure}\n:::\n\n| A |\n| --- |\n\n$$\n$$\n\n:::{figure} ./a.png\n:::\n");
  const original = core.serialize(document);
  const report = () => core.numberingReport(core.getEditableDocument(document).blocks);
  assert.equal(report().mode, "automatic");
  document = core.updateEnumerator(document, [1], "17");
  document = core.updateEnumerator(document, [2], "17"); // different kinds have independent namespaces
  document = core.updateEnumerator(document, [4], "17");
  assert.deepEqual(report().diagnostics.map(d => [d.code, d.kind, d.path]), [
    ["numbering-duplicate", "figure", [1]], ["numbering-missing", "equation", [3]], ["numbering-duplicate", "figure", [4]],
  ]);
  assert.equal(core.canonicalWriteIssue(document), undefined);
  document = core.parse(core.serialize(document));
  for (const number of ["A.3", "4-2", "0", "A$&.3", "한글-2"]) {
    document = core.updateEnumerator(document, [1], number);
    const block = core.getEditableDocument(core.parse(core.serialize(document))).blocks[0];
    assert.equal("enumerator" in block && block.enumerator, number);
  }
  for (const invalid of [" ", "A\nB", 17, null]) {
    assert.throws(() => core.updateEnumerator(document, [1], invalid as never), /enumerator/);
  }
  assert.throws(() => core.updateEnumerator(document, [0], "1"), /metadata/);
  assert.throws(() => core.updateEnumerator(document, [2, 0], "1"), /top-level/);
  for (const path of [[1], [2], [4]]) document = core.updateEnumerator(document, path, "");
  assert.equal(report().mode, "automatic");
  assert.deepEqual(report().diagnostics, []);
  assert.equal(core.serialize(document), original);
});

test("empty fixed equations are an intermediate state; only final writes refuse with actionable diagnostics", async () => {
  const core = await import("../src/index.ts");
  const empty = core.insertEquation(core.createDocument(), 1, "");
  const fixedEmpty = core.updateEnumerator(empty, [1], "A.3");
  assert.equal(core.numberingReport(core.getEditableDocument(fixedEmpty).blocks).targets[0].enumerator, "A.3");
  const checkRefusal = (document: import("../src/index.ts").Document) => assert.throws(() => core.serialize(document), error => {
    const issue = core.writeIssueOf(error);
    assert.equal(issue.code, "fixed-number-unrepresentable");
    assert.deepEqual(issue.path, [1]);
    assert.match(issue.action, /Enter equation content or clear the fixed number/);
    return true;
  });
  checkRefusal(fixedEmpty);
  const filled = core.updateEquationLatex(fixedEmpty, [1], "", "x=1");
  const emptied = core.updateEquationLatex(filled, [1], "x=1", "");
  checkRefusal(emptied);
  // Other session operations can proceed while the incomplete equation remains.
  const edited = core.updateReferenceTemplates(core.insertParagraph(emptied, 2, "Continue editing."), { equation: "Eq. %s" });
  checkRefusal(edited);
  assert.equal(core.canonicalWriteIssue(edited)?.code, "fixed-number-unrepresentable");
  assert.match(core.serialize(core.updateEnumerator(edited, [1], "")), /\$\$\n\$\$/);
  assert.match(core.serialize(filled), /:enumerator: A\.3/);
  assert.equal(core.numberingReport(core.getEditableDocument(fixedEmpty).blocks).targets[0].enumerator, "A.3");
  assert.equal(core.canonicalWriteIssue(empty), undefined);
});

test("all tables keep official numbers through canonical directives and caption/label edits", async () => {
  const core = await import("../src/index.ts");
  const grids = ["|  |  |\n| --- | --- |\n|  |  |", "| Header | Only |\n| --- | --- |",
    "| Left | Center | Right |\n| :--- | :---: | ---: |\n| **a** | b | $x$ |"];
  const source = `---\nlitzio: 1\n---\n\n${grids[0]}\n\n:::{table}\n\n${grids[1]}\n:::\n\n${grids[2]}\n\n:::{table} Last\n:name: last\n\n${grids[1]}\n:::\n\nSee {numref}\`last\`.\n`;
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

test("native H1 body numbering preserves stored levels independently of MyST output policy", () => {
  const source = "---\nlitzio: 1\n# Native document\n---\n\n# Title\n\n## First\n\n### Detail\n\n## Second\n";
  const document = parse(source);
  const before = structuredClone(document);
  const next = updateHeadingNumbering(document, true);
  const markdown = serialize(next);
  assert.match(markdown, /litzio: 1/);
  assert.match(markdown, /## First/);
  assert.doesNotMatch(markdown, /## 1/);
  assert.deepEqual(document, before);
  const read = getEditableDocument(next);
  assert.deepEqual(headingNumbers(read.blocks, read.headingNumbering), ["1", "1.1", "1.1.1", "1.2"]);
  const tree = structuredClone(next);
  const metadata = parseDocument(String(tree.children[0].value)).toJS();
  metadata.numbering = validateNumbering(metadata.numbering, { property: "numbering", messages: {} });
  enumerateTargetsTransform(tree as never, { state: new ReferenceState("document.md", { frontmatter: metadata, vfile: new VFile() }) });
  // Raw MyST numbering with title:false excludes H1; Native does not use that output transform.
  assert.deepEqual(tree.children.slice(1).map(node => node.enumerator), [undefined, "1", "1.1", "2"]);
  const moved = moveBlock(next, 4, 2);
  assert.deepEqual(headingNumbers(getEditableDocument(moved).blocks, getHeadingNumbering(moved)), ["1", "1.1", "1.2", "1.2.1"]);
  assert.equal(sectionReferenceText("Title", headingNumbers(read.blocks, read.headingNumbering)[0]), "§ 1");
  assert.equal(sectionReferenceText("Title"), "§ Title");
  assert.deepEqual(headingNumbers([1, 2, 3, 4, 5, 6, 1].map(level => ({ block: "heading", level })), read.headingNumbering), ["1", "1.1", "1.1.1", "1.1.1.1", "1.1.1.1.1", "1.1.1.1.1.1", "2"]);
  assert.equal(getHeadingNumbering(updateHeadingNumbering(next, false)), undefined);
  assert.equal(serialize(parse(markdown)), markdown);
});


test("reference templates use MyST defaults, accept shorthand, and coexist losslessly with heading settings", async () => {
  const core = await import("../src/index.ts");
  const source = "---\nlitzio: 1 # marker\nbibliography: [refs.bib] # resources\nnumbering:\n  headings: true # sections\n  title: false\n  figure: 'Illustration %s' # shorthand\n  equation: { template: 'Formula {number}' }\n---\n\n## Section\n\nText.\n";
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
    assert.throws(() => core.parse(`---\nlitzio: 1\nnumbering:\n  ${numbering}\n---\n`), /Numbering/);
  }
});


test("reference template updates retain comments on mappings, scalars and shorthand", async () => {
  const core = await import("../src/index.ts");
  for (const figure of [
    "figure: { template: 'Figure %s' } # keep this explanation",
    "figure: # kind explanation\n    # template explanation\n    template: 'Figure %s' # value explanation",
  ]) {
    const source = `---\nlitzio: 1\nnumbering:\n  ${figure}\n---\n\nText.\n`;
    const document = core.parse(source);
    const original = core.serialize(document);
    assert.equal(core.serialize(core.updateReferenceTemplates(document, {figure: "Figure %s"})), original);
    const changed = core.serialize(core.updateReferenceTemplates(document, {figure: "Illustration %s"}));
    const comments = source.match(/#[^\n]*/g) ?? [];
    for (const comment of comments) assert.ok(changed.includes(comment), comment);
    assert.equal(core.getEditableDocument(core.parse(changed)).referenceTemplates?.figure, "Illustration %s");
    assert.equal(core.serialize(document), original);
  }
  const shorthand = core.parse("---\nlitzio: 1\nnumbering:\n  figure: 'Figure %s' # shorthand explanation\n---\n");
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
