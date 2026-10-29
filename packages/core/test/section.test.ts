import assert from "node:assert/strict";
import test from "node:test";
import { sectionBoundaries, sectionMarker, sectionRange, titleHeading, type SectionMarker } from "../src/section.ts";
import { getEditableDocument, insertParagraph, insertTarget, moveBlock, moveSection, parse, removeBlock, removeSection, serialize } from "./core-internal.ts";

// 0 Preamble · 1 # One · 2 Intro · 3 (sec-a)= · 4 ## A · 5 Body A · 6 ### A.1 · 7 Deep · 8 ## B · 9 Body B · 10 # Two · 11 End
const source = "Preamble.\n\n# One\n\nIntro.\n\n(sec-a)=\n## A\n\nBody A.\n\n### A.1\n\nDeep *x*.\n\n## B\n\nBody B.\n\n# Two\n\nEnd.\n";
const texts = (markdown: string) => getEditableDocument(parse(markdown)).blocks.map(block => "text" in block ? block.text : block.block);

test("a section runs from its heading's label targets to the next heading of the same or a higher level", () => {
  const markers: SectionMarker[] = [null, 1, null, "target", 2, null, 3, null, 2, null, 1, null];
  assert.deepEqual(sectionRange(markers, 1), { start: 1, end: 10 });
  // A heading's own targets open its section; deeper sections are part of it.
  assert.deepEqual(sectionRange(markers, 4), { start: 3, end: 8 });
  // The next heading's targets belong to the next section.
  assert.deepEqual(sectionRange([1, null, "target", "target", 1], 0), { start: 0, end: 2 });
  assert.deepEqual(sectionRange(markers, 6), { start: 6, end: 8 });
  assert.deepEqual(sectionRange(markers, 10), { start: 10, end: 12 });
  assert.throws(() => sectionRange(markers, 0), /not a heading/);
});

test("endnotes are in no section: the last section ends with the body, and the body end is a boundary", () => {
  const markers: SectionMarker[] = [1, null, 2, null, "endnote", "endnote"];
  assert.deepEqual(sectionRange(markers, 0), { start: 0, end: 4 });
  assert.deepEqual(sectionRange(markers, 2), { start: 2, end: 4 });
  assert.deepEqual(sectionBoundaries(markers), [0, 2, 4, 6]);
  assert.equal(sectionMarker({ block: "footnote" }), "endnote");
  // A definition still inside the body is not section content, but does not end the section.
  // (Level-2 headings: a leading level-1 heading would be the document title, which stays first.)
  const inBody = moveBlock(parse("## A\n\nOne[^n].\n\n### B\n\nTwo[^n].\n\n[^n]: Note.\n"), 4, 2);
  assert.equal(serialize(removeSection(inBody, 3)), "## A\n\nOne[^n].\n\n[^n]: Note.\n");
  assert.equal(serialize(moveSection(inBody, 3, 0)), "### B\n\nTwo[^n].\n\n## A\n\nOne[^n].\n\n[^n]: Note.\n");
  assert.equal(serialize(removeSection(removeSection(inBody, 3), 0)), "\n");
});

test("moveSection moves a heading with its targets, content and subsections", () => {
  const document = parse(source);
  // Section A (targets, A.1 included) moves after B, to the start of section Two.
  const after = serialize(moveSection(document, 4, 10));
  assert.equal(after, "Preamble.\n\n# One\n\nIntro.\n\n## B\n\nBody B.\n\n(sec-a)=\n\n## A\n\nBody A.\n\n### A.1\n\nDeep *x*.\n\n# Two\n\nEnd.\n");
  assert.equal(serialize(parse(after)), after);
  // Section Two moves before One; the document end and section starts are the only targets.
  assert.deepEqual(texts(serialize(moveSection(document, 10, 1))).slice(0, 3), ["Preamble.", "Two", "End."]);
  assert.deepEqual(texts(serialize(moveSection(document, 1, 12))).slice(0, 3), ["Preamble.", "Two", "End."]);
  // Moving to its own start or end changes nothing.
  assert.equal(serialize(moveSection(document, 4, 3)), serialize(document));
  assert.equal(serialize(moveSection(document, 4, 8)), serialize(document));
});

test("a leading level-1 heading, after only its label targets, is the document title", () => {
  assert.equal(titleHeading([1, null, 2]), 0);
  assert.equal(titleHeading([null, "target", "target", 1, null], 1), 3);
  for (const markers of [[null, 1], [2, 1], ["target", null, 1], [], ["endnote"]] as SectionMarker[][]) {
    assert.equal(titleHeading(markers), undefined, JSON.stringify(markers));
  }
});

test("the document title stays first: it does not move and nothing else goes before it", () => {
  // 0 # Title · 1 Intro · 2 ## S · 3 Body
  const document = parse("# Title\n\nIntro.\n\n## S\n\nBody.\n");
  const before = structuredClone(document);
  for (const refused of [() => moveBlock(document, 0, 2), () => moveBlock(document, 1, 0), () => moveSection(document, 0, 4),
    () => moveSection(document, 2, 0), () => insertParagraph(document, 0, "Above.")]) {
    assert.throws(refused, /document title stays first/);
  }
  assert.deepEqual(document, before);
  // Its own label target may go before it; blocks move and insert after it; it can still be removed.
  assert.equal(serialize(insertTarget(document, 0, "top")), "(top)=\n\n# Title\n\nIntro.\n\n## S\n\nBody.\n");
  assert.throws(() => moveBlock(insertTarget(document, 0, "top"), 0, 2), /document title stays first/);
  assert.equal(serialize(moveBlock(document, 3, 1)), "# Title\n\nBody.\n\nIntro.\n\n## S\n");
  assert.equal(serialize(insertParagraph(removeBlock(document, 0), 0, "Lead.")), "Lead.\n\nIntro.\n\n## S\n\nBody.\n");
  // Without a leading level-1 heading there is no title, so a heading may move to the top and become it.
  const untitled = parse("Lead.\n\n# Later\n");
  assert.equal(serialize(moveBlock(untitled, 1, 0)), "# Later\n\nLead.\n");
});

test("removeSection removes a heading with its targets, content and subsections", () => {
  const removed = serialize(removeSection(parse(source), 4));
  assert.equal(removed, "Preamble.\n\n# One\n\nIntro.\n\n## B\n\nBody B.\n\n# Two\n\nEnd.\n");
});

test("section operations fail closed without mutating the document", () => {
  const document = parse(source);
  const before = structuredClone(document);
  const rejected: [() => unknown, RegExp][] = [
    [() => moveSection(document, 0, 10), /not a heading/],
    [() => moveSection(document, 4, 6), /cannot move into itself/],
    [() => moveSection(document, 4, 2), /start of a section or the end of the document/],
    [() => moveSection(document, 4, 13), /start of a section or the end of the document/],
    [() => removeSection(document, 5), /not a heading/],
  ];
  for (const [run, reason] of rejected) assert.throws(run, reason);
  assert.deepEqual(document, before);
});
