import assert from "node:assert/strict";
import test from "node:test";
import { sectionRange, type SectionMarker } from "../src/section.ts";
import { getEditableDocument, moveSection, parse, removeSection, serialize } from "./core-internal.ts";

// 0 Preamble · 1 # One · 2 Intro · 3 (sec-a)= · 4 ## A · 5 Body A · 6 ### A.1 · 7 Deep · 8 ## B · 9 Body B · 10 # Two · 11 End
const source = "Preamble.\n\n# One\n\nIntro.\n\n(sec-a)=\n## A\n\nBody A.\n\n### A.1\n\nDeep {u}`x`.\n\n## B\n\nBody B.\n\n# Two\n\nEnd.\n";
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

test("moveSection moves a heading with its targets, content and subsections, keeping read-only blocks verbatim", () => {
  const document = parse(source);
  // Section A (targets, A.1 included) moves after B, to the start of section Two.
  const after = serialize(moveSection(document, 4, 10));
  assert.equal(after, "Preamble.\n\n# One\n\nIntro.\n\n## B\n\nBody B.\n\n(sec-a)=\n\n## A\n\nBody A.\n\n### A.1\n\nDeep {u}`x`.\n\n# Two\n\nEnd.\n");
  assert.equal(serialize(parse(after)), after);
  // Section Two moves before One; the document end and section starts are the only targets.
  assert.deepEqual(texts(serialize(moveSection(document, 10, 1))).slice(0, 3), ["Preamble.", "Two", "End."]);
  assert.deepEqual(texts(serialize(moveSection(document, 1, 12))).slice(0, 3), ["Preamble.", "Two", "End."]);
  // Moving to its own start or end changes nothing.
  assert.equal(serialize(moveSection(document, 4, 3)), serialize(document));
  assert.equal(serialize(moveSection(document, 4, 8)), serialize(document));
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
