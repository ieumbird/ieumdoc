import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMONITION_VARIANTS,
  getEditableDocument,
  insertAdmonition,
  updateAdmonitionVariant,
  insertQuote,
  updateQuoteInlineContent,
  insertDivider,
  parse,
  serialize,
  updateHeadingLevel,
  updateHeadingInlineContent,
  insertHeading,
  convertBlock,
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

test("public Core inserts every standard admonition kind with supported inline content and stable Markdown", () => {
  for (const variant of ADMONITION_VARIANTS) {
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
    () => insertAdmonition(document, 1, "admonition" as never, [{ kind: "text", text: "Body." }]),
    () => insertAdmonition(document, -1, "warning", [{ kind: "text", text: "Body." }]),
    () => insertAdmonition(document, 3, "warning", [{ kind: "text", text: "Body." }]),
  ];

  for (const operation of invalid) {
    assert.throws(operation);
    assert.equal(serialize(document), before);
  }
});

test("public Core changes an admonition's kind and keeps its body, rejecting unsupported changes", () => {
  const document = parse(":::{warning}\nRead **the limit**.\n:::\n\n:::{note}\nOne\n\nTwo\n:::\n");
  const before = getEditableDocument(document).blocks[0];
  const changed = getEditableDocument(parse(serialize(updateAdmonitionVariant(document, [0], "tip")))).blocks[0];
  assert.equal(changed?.block === "admonition" && changed.variant, "tip");
  assert.deepEqual(changed?.block === "admonition" && changed.content, before?.block === "admonition" && before.content);

  const unchanged = serialize(document);
  for (const operation of [
    () => updateAdmonitionVariant(document, [0], "warning"),
    () => updateAdmonitionVariant(document, [0], "admonition" as never),
    () => updateAdmonitionVariant(document, [1], "tip"),
  ]) {
    assert.throws(operation);
    assert.equal(serialize(document), unchanged);
  }
});

test("public Core changes an H2 to H4 without changing its text or surrounding blocks", () => {
  const source = "# Keep title\n\n## Stable heading\n\nUnchanged paragraph.\n";
  const document = parse(source);
  const markdown = serialize(updateHeadingLevel(document, [1], 2, 4));
  const blocks = getEditableDocument(parse(markdown)).blocks;

  assert.deepEqual(blocks.map((block) => block.block), ["heading", "heading", "paragraph"]);
  assert.deepEqual(blocks[0], {
    block: "heading", path: [0], level: 1, text: "Keep title", content: [{ kind: "text", text: "Keep title" }], editable: true,
  });
  assert.deepEqual(blocks[1], {
    block: "heading", path: [1], level: 4, text: "Stable heading", content: [{ kind: "text", text: "Stable heading" }], editable: true,
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
  const readonlyHeading = parse("## See {ref}`Intro <intro>`\n");
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
  const readonly = getEditableDocument(readonlyHeading).blocks[0];
  assert.deepEqual(readonly?.block === "heading" && [readonly.editable, readonly.content, readonly.original?.text],
    [false, [], "## See {ref}`Intro <intro>`"]);
});

test("public Core converts a paragraph to a heading and back without losing inline content", () => {
  const source = "# Title\n\nRead **the limit** and $I_{max}$.\n\nUnchanged paragraph.\n";
  const document = parse(source);
  const paragraph = getEditableDocument(document).blocks[1];
  assert.equal(paragraph?.block, "paragraph");
  if (paragraph?.block !== "paragraph") return;

  const reparsed = parse(serialize(convertBlock(document, [1], { block: "heading", level: 2 })));
  const heading = getEditableDocument(reparsed).blocks[1];
  assert.equal(heading?.block, "heading");
  assert.equal(heading?.block === "heading" && heading.level, 2);

  const level3 = convertBlock(reparsed, [1], { block: "heading", level: 3 });
  const back = serialize(convertBlock(level3, [1], { block: "paragraph" }));
  const blocks = getEditableDocument(parse(back)).blocks;
  assert.deepEqual(blocks.map((block) => block.block), ["heading", "paragraph", "paragraph"]);
  assert.deepEqual(blocks[1]?.block === "paragraph" && blocks[1].content, paragraph.content);
  assert.equal(serialize(parse(back)), back);
});

test("public Core rejects block conversions that cannot keep the block's meaning", () => {
  const document = parse("# Title\n\nFirst line\\\nsecond line.\n\n- item\n\nPlain text.\n");
  const before = serialize(document);
  const invalid = [
    () => convertBlock(document, [1], { block: "heading", level: 2 }),
    () => convertBlock(document, [2], { block: "heading", level: 2 }),
    () => convertBlock(document, [3], { block: "paragraph" }),
    () => convertBlock(document, [3], { block: "heading", level: 7 }),
    () => convertBlock(document, [0, 0], { block: "paragraph" }),
  ];

  for (const operation of invalid) {
    assert.throws(operation);
    assert.equal(serialize(document), before);
  }
});

test("public Core inserts and edits one-paragraph quotes and dividers with stable Markdown", () => {
  const body: InlineContent[] = [
    { kind: "text", text: "Measure " }, { kind: "strong", children: [{ kind: "text", text: "twice" }] }, { kind: "break" },
    { kind: "delete", children: [{ kind: "text", text: "cut once" }] },
  ];
  const inserted = insertDivider(insertQuote(parse("# Title\n\nAfter.\n"), 1, body), 2);
  const markdown = serialize(inserted);
  const blocks = getEditableDocument(parse(markdown)).blocks;
  assert.deepEqual(blocks.map((block) => block.block), ["heading", "quote", "divider", "paragraph"]);
  assert.deepEqual(blocks[1]?.block === "quote" && [blocks[1].editable, blocks[1].content], [true, body]);
  assert.equal(serialize(parse(markdown)), markdown);

  const edited = updateQuoteInlineContent(parse(markdown), [1], [{ kind: "text", text: "Edited." }]);
  const quote = getEditableDocument(parse(serialize(edited))).blocks[1];
  assert.deepEqual(quote?.block === "quote" && quote.content, [{ kind: "text", text: "Edited." }]);
});

test("quotes with several paragraphs stay read-only and invalid quote writes change nothing", () => {
  const document = parse("> One.\n>\n> Two.\n\nPlain.\n");
  const quote = getEditableDocument(document).blocks[0];
  assert.deepEqual(quote?.block === "quote" && [quote.editable, quote.text], [false, "One.Two."]);
  const before = serialize(document);
  for (const operation of [
    () => updateQuoteInlineContent(document, [0], [{ kind: "text", text: "Flattened." }]),
    () => updateQuoteInlineContent(document, [1], [{ kind: "text", text: "Not a quote." }]),
    () => insertQuote(document, 2, [{ kind: "text", text: "  " }]),
    () => insertDivider(document, 9),
  ]) {
    assert.throws(operation);
    assert.equal(serialize(document), before);
  }
});

test("public Core writes formatted headings and rejects line breaks or read-only targets", () => {
  const rich: InlineContent[] = [
    { kind: "text", text: "Limits of " }, { kind: "strong", children: [{ kind: "text", text: "phase" }] },
    { kind: "text", text: " current " }, { kind: "math", value: "I_{max}" },
  ];
  const inserted = insertHeading(parse("Intro.\n"), 1, 2, rich);
  const heading = getEditableDocument(parse(serialize(inserted))).blocks[1];
  assert.deepEqual(heading?.block === "heading" && [heading.level, heading.editable, heading.content], [2, true, rich]);

  const edited: InlineContent[] = [{ kind: "emphasis", children: [{ kind: "text", text: "Revised" }] }, { kind: "text", text: " limits" }];
  const updated = getEditableDocument(parse(serialize(updateHeadingInlineContent(inserted, [1], edited)))).blocks[1];
  assert.deepEqual(updated?.block === "heading" && [updated.level, updated.content], [2, edited]);

  const document = parse("## See {ref}`Intro <intro>`\n\nIntro.\n\n## Plain\n");
  const before = serialize(document);
  for (const operation of [
    () => updateHeadingInlineContent(document, [0], [{ kind: "text", text: "Flattened" }]),
    () => updateHeadingInlineContent(document, [1], [{ kind: "text", text: "Not a heading" }]),
    () => updateHeadingInlineContent(document, [2], [{ kind: "text", text: "A" }, { kind: "break" }, { kind: "text", text: "B" }]),
    () => updateHeadingInlineContent(document, [2], []),
    () => insertHeading(document, 1, 2, [{ kind: "break" }]),
  ]) {
    assert.throws(operation);
    assert.equal(serialize(document), before);
  }
});
