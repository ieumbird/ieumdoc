import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import { createTokenizer } from "myst-parser";
import {
  getEditableDocument, getNode, inspectDocument, parse, serialize, validateStructure,
} from "../src/index.ts";

const inlineSource = '# Inline contract\n\nPlain **strong** and *emphasis* with **nested *marks***.  \nHard break, $x + y$, and [a link](https://example.org "title").\n\n"Quoted" and \'single\' quotes; don\'t change smartquotes.\n';

// Captured from master b290d29 before changing MyST or applying the security patch.
// These outputs are the existing write contract, not snapshots of the new versions.
for (const name of ["document", "technical-document", "inline-contract"]) {
  test(`MyST preserves the baseline canonical and semantic contract: ${name}`, () => {
    const source = name === "inline-contract" ? inlineSource
      : readFileSync(new URL(`./fixtures/${name}.md`, import.meta.url), "utf8");
    const expected = readFileSync(new URL(`./fixtures/${name}.canonical.md`, import.meta.url), "utf8")
      .replaceAll("\r\n", "\n");
    const original = parse(source);
    const before = structuredClone(original);
    const canonical = serialize(original);
    const reparsed = parse(canonical);

    validateStructure(original);
    validateStructure(reparsed);
    assert.equal(canonical, expected);
    assert.deepEqual(original, before, "serialization must not mutate its input");
    assert.deepEqual(getEditableDocument(reparsed), getEditableDocument(original));
    assert.deepEqual(inspectDocument(reparsed), inspectDocument(original));
    assert.equal(serialize(reparsed), canonical);

    if (name === "technical-document") {
      // The existing serializer writes the eq role as an equivalent fragment link.
      // Keep both the original reference target and its canonical write form explicit.
      assert.equal(getNode(original, [2, 3]).type, "crossReference");
      assert.equal(getNode(original, [2, 3]).identifier, "eq-current");
      assert.equal(getNode(reparsed, [2, 3]).type, "link");
      assert.equal(getNode(reparsed, [2, 3]).url, "#eq-current");
      for (const document of [original, reparsed]) {
        assert.equal(getNode(document, [2, 1]).url, "#fig-control");
        assert.equal(getNode(document, [6]).label, "fig-control");
        assert.equal(getNode(document, [6, 0]).url, "./diagram.svg");
        assert.equal(getNode(document, [9]).label, "eq-current");
      }
    }
  });
}

test("MyST security boundary keeps smartquotes on and linkification off", (t) => {
  const tokenizer = createTokenizer();
  assert.equal(tokenizer.options.typographer, true);
  assert.equal(tokenizer.options.linkify, false);

  // Resolve the actual parser dependency, not a separately installed test copy.
  const require = createRequire(import.meta.url);
  const parserRequire = createRequire(require.resolve("myst-parser"));
  const markdownRequire = createRequire(parserRequire.resolve("markdown-it"));
  const LinkifyIt = markdownRequire("linkify-it");
  for (const method of ["match", "test", "pretest", "matchAtStart"]) {
    t.mock.method(LinkifyIt.prototype, method, () => {
      assert.fail(`Core must not reach linkify-it.${method} with default parser options`);
    });
  }
  const document = parse('"Quoted" https://example.org mailto:test@example.org ' + "*".repeat(1000) + "!");
  assert.equal(document.children[0].children?.[0].value?.toString().startsWith("“Quoted”"), true);
});

test("CSV-table parsing treats prototype-like headers as ordinary cells", () => {
  const document = parse(':::{csv-table}\n__proto__,__proto__\nalpha,beta\n:::\n');
  const canonical = serialize(document);
  assert.ok(canonical.includes("alpha"));
  assert.ok(canonical.includes("beta"));
  assert.deepEqual(getEditableDocument(parse(canonical)), getEditableDocument(document));
  assert.equal(serialize(parse(canonical)), canonical);
});

test("Core preserves math source without invoking MyST's legacy KaTeX renderer", (t) => {
  const require = createRequire(import.meta.url);
  const transformRequire = createRequire(require.resolve("myst-transforms"));
  const katex = transformRequire("katex");
  for (const method of ["render", "renderToString"]) {
    t.mock.method(katex, method, () => {
      assert.fail(`Core parse/serialize must not call legacy KaTeX.${method}`);
    });
  }
  const document = parse("Inline $x^2$ and display math:\n\n```{math}\n:label: eq-source\nx^2 + 1\n```\n");
  const canonical = serialize(document);
  assert.ok(canonical.includes("x^2 + 1"));
  assert.deepEqual(getEditableDocument(parse(canonical)), getEditableDocument(document));
});

test("patched smartquotes handles the upstream pathological input in a bounded child process", () => {
  // A child timeout can stop a synchronous parser regression; node:test's timeout cannot.
  // This is a generous hang guard, not a machine-specific performance benchmark.
  const coreUrl = new URL("../src/index.ts", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { parse, getEditableDocument } from ${JSON.stringify(coreUrl)};
    const block = getEditableDocument(parse('"'.repeat(160000))).blocks[0];
    assert.equal(block.block, 'paragraph');
    assert.equal(block.text, '“”'.repeat(80000));
  `], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 10000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});
