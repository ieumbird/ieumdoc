import assert from "node:assert/strict";
import test from "node:test";
import { getEditableDocument, parse, replaceBlockSource, serialize } from "@ieumdoc/core";

const SOURCE = "# Title\n\n![logo](./logo.png)\n\n(intro)=\n\n## Intro\n\nBody text.\n";

test("block source replaces one read-only block and reloads as authored content", () => {
  const document = parse(SOURCE);
  const next = replaceBlockSource(document, 1, "The **logo** is $x$.");
  const block = getEditableDocument(next).blocks[1];
  assert.equal(block.block, "paragraph");
  assert.equal(block.block === "paragraph" && block.editable, true);
  assert.equal(block.original, undefined);
  const markdown = serialize(next);
  assert.equal(markdown, SOURCE.replace("![logo](./logo.png)", "The **logo** is $x$."));
  assert.deepEqual(getEditableDocument(parse(markdown)).blocks, getEditableDocument(next).blocks);
  assert.equal(serialize(document), SOURCE);
});

test("block source that stays read-only projects the applied source without an opened-file line", () => {
  const source = SOURCE.replace("Body text.", "![body](./body.png)");
  const document = replaceBlockSource(parse(source), 1, "![new logo](./new.png)\n");
  const blocks = getEditableDocument(document).blocks;
  assert.deepEqual(blocks[1].original, { kind: "Markdown image", text: "![new logo](./new.png)" });
  assert.deepEqual(blocks[4].original, { kind: "Markdown image", text: "![body](./body.png)", line: 9 });
  const again = replaceBlockSource(document, 1, "![third](./third.png)");
  assert.deepEqual(getEditableDocument(again).blocks[1].original, { kind: "Markdown image", text: "![third](./third.png)" });
  assert.equal(serialize(again), source.replace("![logo](./logo.png)", "![third](./third.png)"));
});

test("block source is rejected unless it is one complete block the document can keep", () => {
  const document = parse(SOURCE);
  const rejected: [number, string, RegExp][] = [
    [1, "", /exactly one block; it parses as 0/],
    [1, "One.\n\nTwo.", /exactly one block; it parses as 2/],
    [1, "```python\nprint(1)", /not closed/],
    [1, ":::{note}\nBody", /not closed/],
    [1, "(intro)=", /label "intro" already names another target/],
    [1, "---\ntitle: Moved\n---", /front matter must be closed and remain at the start/],
    [5, "Body", /index out of range/],
  ];
  for (const [index, source, reason] of rejected) {
    assert.throws(() => replaceBlockSource(document, index, source), reason, source);
  }
  assert.equal(serialize(document), SOURCE);
  // A block may keep its own label.
  assert.equal(serialize(replaceBlockSource(document, 2, "(intro)=")), SOURCE);
});
