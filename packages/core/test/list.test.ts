import assert from "node:assert/strict";
import test from "node:test";
import * as core from "@ieumdoc/core";
import {
  getEditableDocument,
  insertList,
  parse,
  serialize,
  updateList,
  type InlineContent,
  type ListContent,
} from "./core-internal.ts";

const text = (value: string): InlineContent[] => [{ kind: "text", text: value }];

const inlineOnlyItems: { source: string; content: InlineContent[]; definitions?: string }[] = [
  { source: "{cite}`Alpha`", content: [{ kind: "citation", role: "cite", keys: ["Alpha"] }] },
  { source: "{cite:t}`Alpha`", content: [{ kind: "citation", role: "cite:t", keys: ["Alpha"] }] },
  { source: "{cite:p}`Alpha`", content: [{ kind: "citation", role: "cite:p", keys: ["Alpha"] }] },
  { source: "{cite:p}`Alpha,Beta`", content: [{ kind: "citation", role: "cite:p", keys: ["Alpha", "Beta"] }] },
  { source: "**{cite:p}`Alpha`**", content: [{ kind: "strong", children: [{ kind: "citation", role: "cite:p", keys: ["Alpha"] }] }] },
  { source: "[^note]", content: [{ kind: "footnote", label: "note" }], definitions: "\n[^note]: Note.\n" },
];

test("native lists admit citation-only and footnote-only items, including nested lists", () => {
  for (const { source, content, definitions = "" } of inlineOnlyItems) {
    const document = core.parse(`---\nieumdoc: 1\n---\n\n- ${source}\n  - ${source}\n${definitions}`);
    const list: ListContent = { ordered: false, items: [{ content, list: { ordered: false, items: [{ content }] } }] };
    assert.deepEqual(core.getEditableDocument(document).blocks[0], { block: "list", path: [1], ...list });
    const markdown = core.serialize(core.updateList(document, [1], list));
    assert.deepEqual(core.getEditableDocument(core.parse(markdown)), core.getEditableDocument(document));
    assert.equal(core.serialize(core.parse(markdown)), markdown);
  }
});

test("removing list text preserves the remaining citation or footnote through native Save and reopen", () => {
  for (const { source, content, definitions = "" } of inlineOnlyItems) {
    const document = core.parse(`---\nieumdoc: 1\n---\n\n- X${source}\n${definitions}`);
    const list: ListContent = { ordered: false, items: [{ content }] };
    const markdown = core.serialize(core.updateList(document, [1], list));
    const reparsed = core.parse(markdown);
    assert.deepEqual(core.getEditableDocument(reparsed).blocks[0], { block: "list", path: [1], ...list });
    assert.equal(core.serialize(reparsed), markdown);
  }
});

test("list operations allow new endnote references before definitions are supplied", () => {
  const document = core.parse("---\nieumdoc: 1\n---\n\n- Original.\n\nAfter.\n");
  const original = core.serialize(document);
  const list: ListContent = { ordered: false, items: [
    { content: [{ kind: "citation", role: "cite:p", keys: ["Alpha"] }] },
    { content: text("Outer"), list: { ordered: false, items: [{ content: [{ kind: "footnote", label: "new" }] }] } },
  ] };
  for (const insert of [false, true]) {
    const updated = insert ? core.insertList(document, 3, list) : core.updateList(document, [1], list);
    assert.match(core.canonicalWriteError(updated) ?? "", /has no definition/);
    assert.throws(() => core.serialize(updated), /has no definition/);
    const complete = core.insertFootnoteDefinition(updated, insert ? 4 : 3, "new", text("Note."));
    const markdown = core.serialize(complete);
    const reopened = core.parse(markdown);
    const block = core.getEditableDocument(reopened).blocks.find(block => block.path[0] === (insert ? 3 : 1));
    assert.deepEqual(block, { block: "list", path: [insert ? 3 : 1], ...list });
    assert.equal(core.serialize(reopened), markdown);
    assert.equal(core.serialize(document), original);
  }
});

const nestedList: ListContent = {
  ordered: false,
  items: [
    {
      content: [
        { kind: "text", text: "Check " },
        { kind: "strong", children: text("limits") },
        { kind: "text", text: " for " },
        { kind: "math", value: "I_{max}" },
        { kind: "text", text: " in " },
        { kind: "link", url: "https://example.com/manual", children: text("the manual") },
      ],
      list: { ordered: true, start: 1, items: [{ content: text("Measure") }, { content: text("Compare") }] },
    },
    { content: text("Record the result") },
  ],
};

test("Markdown bullet and numbered lists project as editable List v1 content", () => {
  const blocks = getEditableDocument(parse("- A *b*\n\n  3. inner\n- C\n\n7. seven\n8. eight\n")).blocks;

  assert.deepEqual(blocks, [
    {
      block: "list", path: [0], ordered: false, items: [
        {
          content: [{ kind: "text", text: "A " }, { kind: "emphasis", children: text("b") }],
          list: { ordered: true, start: 3, items: [{ content: text("inner") }] },
        },
        { content: text("C") },
      ],
    },
    { block: "list", path: [1], ordered: true, start: 7, items: [{ content: text("seven") }, { content: text("eight") }] },
  ]);
});


test("public Core inserts a nested list with rich items and stable canonical Markdown", () => {
  const document = parse("Intro.\n\nAfter.\n");
  const markdown = serialize(insertList(document, 1, nestedList));
  const reparsed = parse(markdown);
  const blocks = getEditableDocument(reparsed).blocks;

  assert.deepEqual(blocks.map((block) => block.block), ["paragraph", "list", "paragraph"]);
  assert.deepEqual(blocks[1], { block: "list", path: [1], ...nestedList });
  assert.equal(serialize(reparsed), markdown);
  assert.deepEqual(
    getEditableDocument(parse(serialize(insertList(document, 1, { ordered: true, items: [{ content: text("x") }] })))).blocks[1],
    { block: "list", path: [1], ordered: true, start: 1, items: [{ content: text("x") }] },
  );
});

test("public Core replaces a list's kind, numbering, items and nesting without touching other blocks", () => {
  const document = parse("# Steps\n\n- Old one\n  - Old nested\n- Old two\n\nClosing paragraph.\n");
  const next: ListContent = { ordered: true, start: 4, items: [{ content: text("New") }, { content: text("Items"), list: { ordered: false, items: [{ content: text("deep") }] } }] };
  const markdown = serialize(updateList(document, [1], next));
  const reparsed = parse(markdown);
  const blocks = getEditableDocument(reparsed).blocks;

  assert.deepEqual(blocks[1], { block: "list", path: [1], ...next });
  assert.deepEqual(blocks[0], { block: "heading", path: [0], level: 1, text: "Steps", content: [{ kind: "text", text: "Steps" }], editable: true });
  assert.equal(blocks[2]?.block === "paragraph" && blocks[2].text, "Closing paragraph.");
  assert.equal(serialize(reparsed), markdown);
});

test("public Core rejects invalid list edits without mutating the source", () => {
  const document = parse("Intro.\n\n- a\n");
  const before = serialize(document);
  const item = { content: text("b") };
  const invalid = [
    () => insertList(document, 1, { ordered: false, items: [] }),
    () => insertList(document, 1, { ordered: false, start: 2, items: [item] }),
    () => insertList(document, 1, { ordered: true, start: -1, items: [item] }),
    () => insertList(document, 1, { ordered: false, items: [{ content: text("a\n\nb") }] }),
    () => insertList(document, 5, { ordered: false, items: [item] }),
    () => updateList(document, [1], { ordered: false, items: [{ content: text("b"), list: { ordered: false, items: [] } }] }),
    () => updateList(document, [0], { ordered: false, items: [item] }),
    () => updateList(document, [1, 0], { ordered: false, items: [item] }),
  ];

  for (const operation of invalid) {
    assert.throws(operation);
    assert.equal(serialize(document), before);
  }
  const task = parse("- [ ] task\n");
  assert.throws(() => updateList(task, [0], { ordered: false, items: [item] }), /not editable/);
});

test("native adjacent lists retain boundaries, numbering, nesting and content on canonical reopen", () => {
  const lists: ListContent[] = [
    { ordered: true, start: 0, items: [{ content: text("Zero") }, { content: text("Next") }] },
    { ordered: true, start: 7, items: [{ content: [{ kind: "strong", children: text("Seven") }], list: nestedList }] },
    { ordered: false, items: [{ content: [] }, { content: text("Bullet"), list: nestedList }] },
  ];
  for (const first of lists) for (const second of lists) {
    // Three siblings also exercise switching back to the original marker.
    const expected = [first, second, first];
    let document = core.createDocument();
    for (const [index, list] of expected.entries()) document = core.insertList(document, index + 1, list);
    const markdown = core.serialize(document);
    assert.doesNotMatch(markdown, /<!--/);
    assert.deepEqual(core.getEditableDocument(core.parse(markdown)).blocks,
      expected.map((list, index) => ({ block: "list", path: [index + 1], ...list })));
    assert.equal(core.serialize(document), markdown);
    assert.equal(core.serialize(core.parse(markdown)), markdown);
  }
});

test("canonical writer preserves adjacent list siblings inside a list item without HTML", () => {
  // Multiple nested siblings are outside List v1 admission; the internal writer
  // must still preserve their full semantics rather than introduce HTML nodes.
  for (const markers of [["1.", "7)", "0."], ["*", "-", "*"], ["1.", "*", "7."]]) {
    const document = parse(`* Parent\n\n${markers.map((marker, index) => `  ${marker} Child ${index}`).join("\n\n")}\n`);
    const markdown = serialize(document);
    assert.doesNotMatch(markdown, /<!--/);
    assert.equal(parse(markdown).children[0].children?.[0].children?.filter(node => node.type === "list").length, 3);
    assert.equal(serialize(parse(markdown)), markdown);
    assert.throws(() => core.parse(`---\nieumdoc: 1\n---\n\n${markdown}`), /unsupported|not supported/i);
  }
});
