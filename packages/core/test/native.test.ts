import * as core from "@ieumdoc/core";
import type { MystDocument } from "../src/myst/tree.ts";
import { semanticFingerprint } from "../src/myst/fingerprint.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { mystParse } from "myst-parser";
import {
  createDocument, parse, serialize, getEditableDocument, NativeDocumentError, canonicalWriteIssue, hasNativeMarker,
  insertHeading, insertParagraph, insertFigure, updateHeadingNumbering, removeBlock,
  updateHeadingInlineContent, updateHeadingLevel, insertFootnote, updateParagraphInlineContent, moveBlock,
  insertTarget, moveSection, removeSection, updateNodeTextAtPath, updateTableCell, mergeParagraphWithPrevious,
} from "@ieumdoc/core";

const native = (body: string) => `---\nieumdoc: 1\n---\n\n${body}`;

test("literal @ text opens, edits and writes safely for both IeumDoc and default MyST", () => {
  for (const input of ["Contact @kim for details.", "Contact \\@kim for details.", "@param value",
    "(@kim), @a and @username", "한글 @kim", "Hi\n@kim", "a@b.com", "https://example.com/@kim"]) {
    const document = parse(native(input + "\n"));
    const paragraph = getEditableDocument(document).blocks[0];
    assert(paragraph.block === "paragraph");
    assert.equal(paragraph.text, input.replaceAll("\\@", "@"));
    const markdown = serialize(document);
    assert.deepEqual(getEditableDocument(parse(markdown)), getEditableDocument(document));
    assert.equal(serialize(parse(markdown)), markdown);
    assert.doesNotMatch(JSON.stringify(mystParse(markdown)), /"type":"cite(?:Group)?"/);
    if (input === "a@b.com" || input.startsWith("https:")) assert.equal(markdown, native(input + "\n"));
    else assert.match(markdown, /\\@/);
  }
  const document = insertParagraph(createDocument(), 1, "Contact @kim for details.");
  assert.equal(serialize(document), native("Contact \\@kim for details.\n"));
  const edited = updateParagraphInlineContent(document, [1], [
    { kind: "strong", children: [{ kind: "text", text: "@param" }] },
    { kind: "text", text: " [@key, p. 3] a@b.com" },
  ]);
  assert.deepEqual(getEditableDocument(parse(serialize(edited))), getEditableDocument(edited));
  assert.doesNotMatch(JSON.stringify(mystParse(serialize(edited))), /"type":"cite(?:Group)?"/);
  for (const source of ["[@kim](https://example.com)", "[**@kim**](https://example.com)",
    "Text[^a].\n\n[^a]: Literal @param", ":::{figure} ./x.png\n\nCaption @kim\n:::"]) {
    const document = parse(native(source + "\n"));
    const markdown = serialize(document);
    assert.deepEqual(getEditableDocument(parse(markdown)), getEditableDocument(document));
    assert.doesNotMatch(JSON.stringify(mystParse(markdown)), /"type":"cite(?:Group)?"/);
    if (source.startsWith("[")) assert.equal(markdown, native(source + "\n"));
  }
});

test("bracket citation shorthand refuses with literal guidance without changing literal @", () => {
  for (const body of ["[@key]", "[@key, p. 3]", "[@a; @b]", "[see @key, p. 3]",
    "**[@key]**", "- [@key]", "| A |\n|---|\n| [@key] |",
    "Text[^a].\n\n[^a]: [@key]", ":::{note}\n[@key]\n:::"]) {
    assert.throws(() => parse(native(body + "\n")), error => {
      assert(error instanceof NativeDocumentError);
      assert.equal(error.code, "native-content");
      assert.match(error.message, /citation shorthand/);
      assert.match(error.location.action, /escape/);
      return true;
    }, body);
  }
  // Code or math inside the brackets does not stop default MyST from reading a citation.
  for (const body of ["See [`@param`] for details.", "See [$@key$] here."]) {
    assert.match(JSON.stringify(mystParse(body)), /"type":"cite"/, body);
    assert.throws(() => parse(native(body + "\n")), /citation shorthand/, body);
  }
  for (const body of ["\\[@key]", "[\\@key]", "`[@key]`", "$[@key]$", "See \\[`@param`] here.",
    "[@key](https://example.com)", "```text\n[@key]\n```"]) {
    assert.doesNotThrow(() => parse(native(body + "\n")), body);
  }
});

test("explicit citation roles preserve kind, exact keys and groups through canonical writes", () => {
  for (const role of ["cite", "cite:t", "cite:p"]) {
    for (const keys of ["KeyA", "KeyA; 한글:key"]) {
      const document = parse(native(`{${role}}\`${keys}\`\n`));
      const block = getEditableDocument(document).blocks[0];
      assert(block.block === "paragraph");
      const canonicalRole = role === "cite" && keys.includes(";") ? "cite:t" : role;
      assert.deepEqual(block.content, [{ kind: "citation", role: canonicalRole, keys: keys.split("; ") }]);
      const markdown = serialize(document);
      assert.equal(markdown, native(`{${canonicalRole}}\`${keys.replace("; ", ",")}\`\n`));
      assert.deepEqual(getEditableDocument(parse(markdown)), getEditableDocument(document));
      assert.equal(serialize(parse(markdown)), markdown);
    }
  }
  for (const body of ["{cite:p}`{see}Key{p. 3}`", "{cite:author}`Key`", "{cite:year}`Key`",
    "{cite:p}`see [@Key, p. 3]`", "[{cite}`Key`](./url)"]) {
    assert.throws(() => parse(native(body)), Error, body);
  }
});

test("bibliography declarations validate shape without reading resources and keep original spelling", () => {
  const source = "---\nieumdoc: 1\n# Shared bibliography\nbibliography:\n  - ../refs.bib\n  - ./자료/standards.bib\nnumbering:\n  headings: true\n  title: false\n---\n\nBody.\n";
  const document = parse(source);
  assert.equal(serialize(document), source);
  assert.equal(serialize(updateParagraphInlineContent(document, [1], [{ kind: "text", text: "Edited." }])), source.replace("Body.", "Edited."));
  for (const value of ["refs.bib", "[]", "null", "[null]", "[1]", "[{title: Book}]", "[refs.bib, refs.bib]",
    "[refs.bib, ./refs.bib]", "[a/../refs.bib, refs.bib]", "['']", "[' refs.bib']", "[/refs.bib]",
    "['C:/refs.bib']", "['C:refs.bib']", "['\\\\server\\refs.bib']", "['refs\\a.bib']", "['https://host/refs.bib']",
    "['*.bib']", "['ref?.bib']", "['[ab].bib']", "['{a,b}.bib']", "['@(a|b).bib']", "['+(a|b).bib']", "['refs.json']", "['refs.bib/']"]) {
    assert.throws(() => parse(`---\nieumdoc: 1\nbibliography: ${value}\n---\n`), error => {
      assert(error instanceof NativeDocumentError);
      assert.equal(error.code, "native-metadata");
      return true;
    }, value);
  }
  assert.throws(() => parse("---\nieumdoc: 1\nbibliography: [a.bib]\nbibliography: [b.bib]\n---\n"), /Invalid native frontmatter/);
});

test("native admission checks the marker and the complete YAML contract before writing", () => {
  for (const source of ["", "# Title\n", "---\nieumdoc: '1'\n---\n", "---\nieumdoc: 2\n---\n",
    "---\nieumdoc: 1\nieumdoc: 1\n---\n", "---\nieumdoc: [\n---\n", "---\n- ieumdoc: 1\n---\n",
    "---\nieumdoc: 1\ntitle: Title\n---\n", "---\nieumdoc: 1\nnumbering: true\n---\n",
    "---\nieumdoc: 1\nnumbering:\n  headings: true\n  heading_1: 3\n---\n",
    "---\nieumdoc: 1\nnumbering:\n  title: true\n---\n", "---\nieumdoc: 1\n"]) {
    assert.throws(() => parse(source), NativeDocumentError, source);
  }
  const marked = native("# Title\n");
  assert.equal(serialize(parse(`\uFEFF${marked.replaceAll("\n", "\r\n")}`)), marked);
});

test("the native marker is read from leading frontmatter alone, without admitting the document", () => {
  for (const source of [native("# Title\n"), `\uFEFF${native("Body.\n").replaceAll("\n", "\r\n")}`,
    "---\nieumdoc: 1\nnumbering:\n  headings: true\n---\n", native("> One.\n>\n> Two.\n")]) {
    assert.equal(hasNativeMarker(source), true, source);
  }
  for (const source of ["", "# Title\n", "---\nieumdoc: '1'\n---\n", "---\nieumdoc: 2\n---\n", "---\nieumdoc: 1\n",
    "---\n- ieumdoc: 1\n---\n", "# Title\n\n---\nieumdoc: 1\n---\n", "\n---\nieumdoc: 1\n---\n"]) {
    assert.equal(hasNativeMarker(source), false, source);
  }
});
test("native admission rejects unsupported structure instead of projecting partial documents", () => {
  for (const body of ["![ordinary](./x.png)\n", "Text ![inline](./x.png).\n", "- [ ] task\n",
    "> One.\n>\n> Two.\n", ":::{note}\n# Nested\n:::\n", "Text {kbd}`Ctrl`.\n",
    "## See {ref}`Custom <target>`\n", "[a](./same)[b](./same)\n", "| A |\n|---|\n| ![x](./x.png) |\n",
    "Text[^a].\n\n[^a]: One.\n\n    Two.\n", ":::{figure} ./x.png\n:width: 100px\n:::\n",
    "```{math}\n:enumerated: false\nx\n```\n", ":::{figure} ./x.png\n:enumerated: false\n:::\n",
    ":::{table}\n:enumerated: false\n\n| A |\n|---|\n:::\n",
    "```{code-block} python\n:enumerator: 17\n\nprint(1)\n```\n",
    ":::{figure}\n\n```{mermaid}\n:enumerator: 17\n\ngraph LR; A-->B\n```\n:::\n"]) {
    assert.throws(() => parse(native(body)), NativeDocumentError, body);
  }
});

test("native table directives reject source options before the parser can discard them", async (t) => {
  for (const caption of ["", " Values"]) {
    for (const options of [":align: left", ":widths: 1 2", ":unknown: value", "---\nalign: left\n---",
      ...["constructor", "__proto__", "toString", "hasOwnProperty"].flatMap(name => [
        `:${name}: value`, `---\n${name}: value\n---`,
      ])]) {
      await t.test(`${caption || "no caption"}: ${options}`, () => {
        const source = native(`:::{table}${caption}\n${options}\n\n| A | B |\n|---|---|\n| x | y |\n:::\n`);
        assert.throws(() => parse(source), (error) => {
          assert(error instanceof NativeDocumentError);
          assert.equal(error.code, "native-content");
          return true;
        });
      });
    }
    for (const name of ["name", "label"]) {
      const source = native(`:::{table}${caption}\n:${name}: values\n\n| A | B |\n|:---|---:|\n| x | y |\n:::\n`);
      const document = parse(source);
      const saved = serialize(document);
      assert.match(saved, /:name: values/);
      assert.deepEqual(getEditableDocument(parse(saved)), getEditableDocument(document));
      assert.equal(serialize(parse(saved)), saved);
    }
  }
});

test("native tables admit only GFM and the table directive", async (t) => {
  for (const caption of ["", " Values"]) {
    for (const unknown of ["", ":unknown: value\n"]) {
      for (const body of [
        `:::{csv-table}${caption}\n:header: A, B\n${unknown}\n1,2\n:::\n`,
        `:::{list-table}${caption}\n:header-rows: 1\n${unknown}\n* -\n  -\n:::\n`,
      ]) await t.test(body, () => assert.throws(() => parse(native(body)), NativeDocumentError));
    }
    const grid = "| A | B |\n|:---|---:|\n| x | y |\n";
    for (const body of [grid, `:::{table}${caption}\n\n${grid}:::\n`]) {
      const document = parse(native(body));
      const saved = serialize(document);
      assert.deepEqual(getEditableDocument(parse(saved)), getEditableDocument(document));
      assert.equal(serialize(parse(saved)), saved);
    }
  }
});

test("native supported semantics accept alternative spellings and preserve snapshot paths", () => {
  const body = "Title\n=====\n\nA **bold** [link](./x) and $y$.\n\n- item\n  - nested\n\n> Quote.\n\n---\n\n:::{note}\nNote.\n:::\n\n```ts\nconst n = 1;\n```\n\n| A | B |\n|:--|--:|\n| x | y |\n\nSee[^a] and {ref}`later`.\n\n[^a]: A note.\n";
  const document = parse(native(body));
  const blocks = getEditableDocument(document).blocks;
  assert.deepEqual(blocks[0].path, [1]);
  assert.equal(blocks[0].block, "heading");
  const markdown = serialize(document);
  assert.match(markdown, /# Title/);
  assert.equal(serialize(parse(markdown)), markdown);
  assert.deepEqual(getEditableDocument(parse(markdown)), getEditableDocument(document));
});

test("creation and authoring retain the marker, including empty Figures and unresolved references", () => {
  const empty = createDocument();
  assert.deepEqual(getEditableDocument(empty).blocks, []);
  let document = insertHeading(empty, 1, 1, "Title");
  document = insertParagraph(document, 2, "Body.");
  document = insertFigure(document, 3, { imageUrl: "", imageAlt: "", caption: "" });
  document = updateHeadingInlineContent(document, [1], [{ kind: "text", text: "Updated title" }]);
  document = updateHeadingLevel(document, [1], 1, 2);
  document = insertFootnote(document, [2], 5, [{ kind: "text", text: "Note." }]);
  const heading = getEditableDocument(document).blocks[0];
  assert.equal(heading.block, "heading");
  assert(heading.block === "heading");
  assert.equal(heading.text, "Updated title");
  assert.equal(heading.level, 2);
  document = updateHeadingNumbering(document, true);
  const orphan = updateParagraphInlineContent(document, [2], [{ kind: "text", text: "Body." }]);
  assert.throws(() => serialize(moveBlock(orphan, 2, 1)), /has no reference/);
  const source = serialize(document);
  assert.match(source, /^---\nieumdoc: 1\nnumbering:\n  headings: true\n  title: false\n---/);
  assert.equal(serialize(parse(source)), source);
  assert.equal(canonicalWriteIssue(document), undefined);
  assert.throws(() => removeBlock(document, 0), /block 0 is the document metadata; body blocks start at 1/);
});

test("body operations reject metadata indices and paths before mutation or round-trip checks", () => {
  const empty = createDocument();
  const document = parse(native("# Title\n\nBody.\n"));
  const message = "block 0 is the document metadata; body blocks start at 1";
  for (const operation of [
    () => insertParagraph(empty, 0, "Hello"),
    () => insertHeading(empty, 0, 1, "Title"),
    () => insertTarget(document, 0, "intro"),
    () => moveBlock(document, 0, 1),
    () => moveBlock(document, 1, 0),
    () => mergeParagraphWithPrevious(document, [0]),
    () => updateNodeTextAtPath(document, [0], "1", "2"),
    () => updateNodeTextAtPath(document, [0, 0], "1", "2"),
    () => updateTableCell(document, [0, 0, 0], "Cell"),
    () => insertFootnote(document, [0], 0, [{ kind: "text", text: "Note" }]),
    () => moveSection(document, 0, 3),
    () => moveSection(document, 1, 0),
    () => removeSection(document, 0),
  ]) assert.throws(operation, { message });
  assert.throws(() => mergeParagraphWithPrevious(parse(native("Body.\n")), [1]), /merge requires a previous paragraph/);
  assert.equal(serialize(document), native("# Title\n\nBody.\n"));
});

const filledText = [{ kind: "text" as const, text: "Filled" }];
function assertStableEmpty(document: ReturnType<typeof core.createDocument>) {
  const source = core.serialize(document);
  const reopened = core.parse(source);
  assert.deepEqual(semanticFingerprint(reopened as unknown as MystDocument), semanticFingerprint(document as unknown as MystDocument));
  assert.deepEqual(core.getEditableDocument(reopened), core.getEditableDocument(document));
  assert.equal(core.serialize(reopened), source);
  return source;
}
test("empty and whitespace-only structural elements insert, fill, clear and reopen without losing structure", () => {
  const emptyContents: core.InlineContent[][] = [
    [], [{ kind: "text", text: " " }], [{ kind: "text", text: "\t\r\n\u00a0\u2003\ufeff" }],
    [{ kind: "break" }], [{ kind: "break" }, { kind: "text", text: " " }, { kind: "break" }],
    ...(["strong", "emphasis", "delete", "subscript", "superscript"] as const).map(kind =>
      [{ kind, children: [{ kind: "text" as const, text: " \t " }] }]),
    [{ kind: "strong", children: [{ kind: "emphasis", children: [{ kind: "break" }, { kind: "text", text: " " }] }] }],
  ];
  for (const content of emptyContents) {
    for (const variant of core.ADMONITION_VARIANTS) {
      const empty = core.insertAdmonition(core.createDocument(), 1, variant, []);
      assert.equal(assertStableEmpty(core.insertAdmonition(core.createDocument(), 1, variant, content)), assertStableEmpty(empty));
      assert.match(assertStableEmpty(empty), new RegExp(":::\\{" + variant + "\\}\\n:::"));
      const filled = core.updateAdmonitionInlineContent(empty, [1], filledText);
      assertStableEmpty(filled);
      assert.equal(assertStableEmpty(core.updateAdmonitionInlineContent(filled, [1], content)), assertStableEmpty(empty));
    }
    const quote = core.insertQuote(core.createDocument(), 1, []);
    assert.equal(assertStableEmpty(core.insertQuote(core.createDocument(), 1, content)), assertStableEmpty(quote));
    assert.match(assertStableEmpty(quote), />\n$/);
    assert.equal(assertStableEmpty(core.updateQuoteInlineContent(core.updateQuoteInlineContent(quote, [1], filledText), [1], content)), assertStableEmpty(quote));
    for (const ordered of [false, true]) {
      const list = { ordered, ...(ordered ? { start: 3 } : {}), items: [
        { content: [] }, { content: [], list: { ordered: false, items: [{ content: [] }] } },
      ] };
      const empty = core.insertList(core.createDocument(), 1, list);
      const whitespaceList = { ...list, items: [
        { content }, { content, list: { ordered: false, items: [{ content }] } },
      ] };
      assert.equal(assertStableEmpty(core.insertList(core.createDocument(), 1, whitespaceList)), assertStableEmpty(empty));
      assertStableEmpty(empty);
      const filled = core.updateList(empty, [1], { ...list, items: [{ content: filledText }] });
      assertStableEmpty(filled);
      assert.equal(assertStableEmpty(core.updateList(filled, [1], whitespaceList)), assertStableEmpty(empty));
    }
  }
});

test("structural whitespace normalization preserves visible text and semantic-only inline content", () => {
  const document = core.parse(native("After[^note].\n\n[^note]: Note.\n"));
  const original = core.serialize(document);
  const contents: core.InlineContent[][] = [
    [{ kind: "text", text: "Keep   spacing" }],
    ...[" ", "\t", "\n"].map(text => [{ kind: "link" as const, url: "https://example.com/important", title: "Keep destination", children: [{ kind: "text" as const, text }] }]),
    [{ kind: "link", url: "https://example.com/important", children: [{ kind: "break" }] }],
    [{ kind: "math", value: "x" }], [{ kind: "code", value: "x" }],
    [{ kind: "reference", role: "eq", label: "eq-pending" }], [{ kind: "footnote", label: "note" }],
    ...(["cite", "cite:t", "cite:p"] as const).map(role => [{ kind: "citation" as const, role, keys: ["Alpha"] }]),
    [{ kind: "strong", children: [{ kind: "citation", role: "cite:p", keys: ["Alpha"] }] }],
  ];
  for (const content of contents) {
    const note = core.insertAdmonition(document, 1, "note", content);
    const quote = core.insertQuote(document, 1, content);
    const list = { ordered: false, items: [{ content, list: { ordered: true, start: 3, items: [{ content }] } }] };
    const insertedList = core.insertList(document, 1, list);
    for (const next of [note, core.updateAdmonitionInlineContent(note, [1], content),
      quote, core.updateQuoteInlineContent(quote, [1], content)]) {
      assertStableEmpty(next);
      const block = core.getEditableDocument(next).blocks[0];
      assert(block.block === "admonition" || block.block === "quote");
      assert.deepEqual(block.content, content);
    }
    for (const next of [insertedList, core.updateList(insertedList, [1], list)]) {
      assertStableEmpty(next);
      assert.deepEqual(core.getEditableDocument(next).blocks[0], { block: "list", path: [1], ...list });
    }
    assert.equal(core.serialize(document), original);
  }
});

test("generic text replacements retain whitespace-label links and their destination data", () => {
  const link = '[Body](https://example.com/important "Keep destination")';
  for (const body of [`:::{note}\n${link}\n:::\n`, `> ${link}\n`, `3. Parent\n   * ${link}\n`]) {
    const document = core.parse(native(body));
    const original = core.serialize(document);
    const expected = core.serialize(core.parse(native(body.replace("Body", " "))));
    for (const run of [() => core.replaceText(document, "Body", " "),
      () => core.updateNodeTextAtPath(document, [1], "Body", " ")]) {
      assert.equal(assertStableEmpty(run()), expected);
      assert.equal(core.serialize(document), original);
    }
  }
});

test("unrepresentable whitespace-label link formatting fails closed with corrective guidance", () => {
  const content: core.InlineContent[] = [{ kind: "link", url: "https://example.com/important", title: "Keep destination",
    children: [{ kind: "strong", children: [{ kind: "text", text: " " }] }] }];
  const document = core.parse(native(':::{note}\n[**Body**](https://example.com/important "Keep destination")\n:::\n\n> [**Body**](https://example.com/important "Keep destination")\n\n* [**Body**](https://example.com/important "Keep destination")\n'));
  const original = core.serialize(document);
  for (const run of [
    () => core.insertAdmonition(document, 4, "note", content),
    () => core.updateAdmonitionInlineContent(document, [1], content),
    () => core.insertQuote(document, 4, content),
    () => core.updateQuoteInlineContent(document, [2], content),
    () => core.insertList(document, 1, { ordered: false, items: [{ content }] }),
    () => core.updateList(document, [3], { ordered: false, items: [{ content }] }),
    () => core.replaceText(document, "Body", " "),
    () => core.updateNodeTextAtPath(document, [2, 0, 0, 0, 0], "Body", " "),
  ]) {
    assert.throws(() => core.serialize(run()), error => {
      const issue = core.writeIssueOf(error);
      assert.match(issue.reason, /cannot.*(?:round-trip|preserved)/);
      assert.match(issue.action, /simplify or replace/);
      return true;
    });
    assert.equal(core.serialize(document), original);
  }
});

test("generic text replacements normalize only supported structural bodies, including nested list items", () => {
  const cases = [
    { body: ":::{note}\n**Body**\n:::\n", empty: ":::{note}\n:::\n", paths: [[1], [1, 0], [1, 0, 0, 0]] },
    { body: "> Body\n", empty: ">\n", paths: [[1], [1, 0], [1, 0, 0]] },
    { body: "3. Body\n   * Keep\n   * Body\n4. {cite}`Alpha`\n", empty: "3.\n   * Keep\n   *\n4. {cite}`Alpha`\n", paths: [[1]] },
  ];
  for (const { body, empty, paths } of cases) {
    const document = core.parse(native(body));
    const original = core.serialize(document);
    const expected = core.serialize(core.parse(native(empty)));
    for (const whitespace of ["", " ", "\t\n", "\u00a0"]) {
      for (const path of paths) {
        const edited = core.updateNodeTextAtPath(document, path, "Body", whitespace);
        assert.equal(assertStableEmpty(edited), expected);
      }
      let edited = document;
      // replaceText changes the first matching paragraph; update-node-text can address a whole list.
      for (let index = 0; index < (body.startsWith("3.") ? 2 : 1); index++) {
        edited = core.replaceText(edited, "Body", whitespace);
      }
      assert.equal(assertStableEmpty(edited), expected);
      assert.equal(core.serialize(document), original);
    }
  }
  for (const body of ["## Body\n", "A[^note].\n\n[^note]: Body\n"]) {
    const document = core.parse(native(body));
    const original = core.serialize(document);
    const path = body.startsWith("##") ? [1] : [2];
    for (const whitespace of ["", " "]) {
      for (const run of [() => core.replaceText(document, "Body", whitespace),
        () => core.updateNodeTextAtPath(document, path, "Body", whitespace)]) {
        if (whitespace === "") assert.throws(() => core.serialize(run()));
        else {
          const edited = run();
          assertStableEmpty(edited);
          const block = core.getEditableDocument(edited).blocks.find(block => block.path[0] === path[0]);
          assert(block && "content" in block);
          assert.deepEqual(block.content, [{ kind: "text", text: " " }]);
        }
        assert.equal(core.serialize(document), original);
      }
    }
  }
});
test("empty labeled equations retain identity and numbering through notation changes", () => {
  for (const label of ["", "eq-empty", "식-A"]) {
    let empty = core.insertEquation(core.createDocument(), 1, "");
    if (label) empty = core.updateLabel(empty, [1], label);
    assert.match(assertStableEmpty(empty), /\$\$\n\$\$/);
    assert.deepEqual(core.targetNumbers(core.getEditableDocument(core.insertEquation(empty, 2, "y")).blocks.map(core.blockTargets)), [{ equation: 1 }, { equation: 2 }]);
    if (label) assertStableEmpty(core.updateLabel(core.parse(assertStableEmpty(empty)), [1], "renamed"));
    const filled = core.updateEquationLatex(core.parse(assertStableEmpty(empty)), [1], "", "x^2");
    assert.match(assertStableEmpty(filled), /```\{math\}/);
    assert.equal(assertStableEmpty(core.updateEquationLatex(filled, [1], "x^2", "")), assertStableEmpty(empty));
  }
});

test("unrepresentable empty equation labels fail with an action and preserve the original", () => {
  for (const label of ["A B", "a)b", "a$b"]) {
    const original = core.updateLabel(core.insertEquation(core.createDocument(), 1, "x"), [1], label);
    const before = core.serialize(original);
    assert.throws(() => core.updateEquationLatex(original, [1], "x", ""), error => {
      const issue = core.writeIssueOf(error);
      assert.match(issue.reason, /empty equation.*label/);
      assert.match(issue.action, /Enter equation content, remove the label/);
      assert.deepEqual(issue.path, [1]);
      return true;
    });
    assert.equal(core.serialize(original), before);
  }
});


test("native Mermaid Figures admit only a single option-free non-empty diagram and keep the fingerprint", () => {
  const body = (source: string, extra = "") => `:::{figure}\n:label: fig-flow\n\n\`\`\`\`{mermaid}\n${source}\n\`\`\`\`\n${extra}\n신호 흐름\n:::\n`;
  for (const source of ["graph LR\n  A --> B", 'graph LR\n  A["``` 유니코드 😀"] --> B', "graph LR\n\n  %% :::\n  A --> B"]) {
    const document = parse(native(body(source)));
    const block = getEditableDocument(document).blocks[0];
    assert.ok(block.block === "figure");
    assert.equal(block.contentKind, "mermaid"); assert.equal(block.mermaidSource, source);
    const markdown = serialize(document);
    const reopened = parse(markdown);
    assert.deepEqual(semanticFingerprint(document as unknown as MystDocument), semanticFingerprint(reopened as unknown as MystDocument));
    assert.equal(serialize(reopened), markdown);
    assert.deepEqual(core.unresolvedReferences(parse(native(body(source) + "\nSee [Flow](#fig-flow) and {numref}`fig-flow`.\n"))), []);
  }
  for (const source of ["", " \n\t", ":label: inner\ngraph LR", ":class: wide\ngraph LR", ":unknown: value\ngraph LR",
    ":constructor: value\ngraph LR", "---\nclass: wide\n---\ngraph LR", "---\nunknown: value\n---\ngraph LR"]) {
    assert.throws(() => parse(native(body(source))), /Unsupported native content/);
  }
  for (const extra of ["\n![other](./other.svg)\n", "\nExtra paragraph.\n\n", "\n```{mermaid}\ngraph TD\n```\n"]) {
    assert.throws(() => parse(native(body("graph LR", extra))), /Unsupported native content/);
  }
  // Standalone diagram directives remain outside the native boundary.
  assert.throws(() => parse(native("```{mermaid}\ngraph LR\n```\n")), /Unsupported native content/);
});
