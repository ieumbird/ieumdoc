import assert from "node:assert/strict";
import test from "node:test";
import {
  getEditableDocument,
  insertAdmonition,
  parse,
  serialize,
  updateHeadingLevel,
  type InlineContent,
} from "@ieumdoc/core";

const richBody: InlineContent[] = [
  { kind: "text", text: "Read " },
  { kind: "strong", children: [{ kind: "text", text: "the limit" }] },
  { kind: "text", text: ", then " },
  { kind: "emphasis", children: [{ kind: "text", text: "verify" }] },
  { kind: "text", text: " " },
  { kind: "link", url: "https://example.com/manual", children: [{ kind: "text", text: "the manual" }] },
  { kind: "text", text: " and current " },
  { kind: "math", value: "I_{max}" },
  { kind: "text", text: "." },
];

test("public Core inserts Note and Warning with supported inline content and stable Markdown", () => {
  for (const variant of ["note", "warning"] as const) {
    const document = parse("Intro paragraph.\n");
    const markdown = serialize(insertAdmonition(document, 1, variant, richBody));
    const reparsed = parse(markdown);
    const admonition = getEditableDocument(reparsed).blocks[1];

    assert.equal(admonition?.block, "admonition");
    if (admonition?.block !== "admonition") continue;
    assert.equal(admonition.variant, variant);
    assert.deepEqual(admonition.content, richBody);
    assert.equal(serialize(reparsed), markdown);
  }
});

test("public Core rejects invalid admonition inserts without mutating the source", () => {
  const document = parse("Intro paragraph.\n");
  const before = serialize(document);
  const invalid = [
    () => insertAdmonition(document, 1, "note", []),
    () => insertAdmonition(document, 1, "tip" as never, [{ kind: "text", text: "Body." }]),
    () => insertAdmonition(document, -1, "warning", [{ kind: "text", text: "Body." }]),
    () => insertAdmonition(document, 3, "warning", [{ kind: "text", text: "Body." }]),
  ];

  for (const operation of invalid) {
    assert.throws(operation);
    assert.equal(serialize(document), before);
  }
});

test("public Core changes an H2 to H4 without changing its text or surrounding blocks", () => {
  const source = "# Keep title\n\n## Stable heading\n\nUnchanged paragraph.\n";
  const document = parse(source);
  const markdown = serialize(updateHeadingLevel(document, [1], 2, 4));
  const blocks = getEditableDocument(parse(markdown)).blocks;

  assert.deepEqual(blocks.map((block) => block.block), ["heading", "heading", "paragraph"]);
  assert.deepEqual(blocks[0], {
    block: "heading", path: [0], level: 1, text: "Keep title", editable: true,
  });
  assert.deepEqual(blocks[1], {
    block: "heading", path: [1], level: 4, text: "Stable heading", editable: true,
  });
  assert.deepEqual(blocks[2], {
    block: "paragraph", path: [2], text: "Unchanged paragraph.",
    content: [{ kind: "text", text: "Unchanged paragraph." }], editable: true,
  });
  assert.equal(serialize(parse(markdown)), markdown);
});

test("public Core rejects invalid heading changes without mutating the source", () => {
  const source = "# Keep title\n\n## Stable heading\n\nUnchanged paragraph.\n";
  const document = parse(source);
  const readonlyHeading = parse("## **Read-only heading**\n");
  const readonlyBefore = serialize(readonlyHeading);
  const before = serialize(document);
  const invalid = [
    () => updateHeadingLevel(document, [1], 3, 4),
    () => updateHeadingLevel(document, [1], 2, 0),
    () => updateHeadingLevel(document, [1], 2, 7),
    () => updateHeadingLevel(document, [2], 1, 4),
    () => updateHeadingLevel(readonlyHeading, [0], 2, 4),
  ];

  for (const operation of invalid) {
    assert.throws(operation);
    assert.equal(serialize(document), before);
  }
  assert.equal(serialize(readonlyHeading), readonlyBefore);
  assert.deepEqual(getEditableDocument(readonlyHeading).blocks[0], {
    block: "heading", path: [0], level: 2, text: "Read-only heading", editable: false,
    original: { kind: "heading (strong)", line: 1, text: "## **Read-only heading**" },
  });
});
