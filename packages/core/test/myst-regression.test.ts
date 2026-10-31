import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createTokenizer } from "myst-parser";
import * as publicCore from "@litzio/core";
import {
  getEditableDocument, getNode, inspectDocument, parse, serialize, validateStructure,
} from "./core-internal.ts";

const inlineSource = '# Inline contract\n\nPlain **strong** and *emphasis* with **nested *marks***.  \nHard break, $x + y$, and [a link](https://example.org "title").\n\n"Quoted" and \'single\' quotes; don\'t change smartquotes.\n';

// Captured from master b290d29 before changing MyST or applying the security patch.
// These outputs are the existing write contract, not snapshots of the new versions.
// Intentional changes since: Canonical Input Safety v1 keeps straight quotes as
// written, so the inline-contract quote line is no longer typographic, and inline
// math is written as `$...$` instead of the `{math}` role. #584 wraps every table
// in a numbered `{table}` directive; the technical-document canonical fixture records it.
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
    // Opening-source locations and spelling are provenance, not semantics.
    assert.deepEqual(getEditableDocument(reparsed).blocks,
      getEditableDocument(original).blocks);
    assert.deepEqual(inspectDocument(reparsed), inspectDocument(original).map(block =>
      block.type === "table" ? { ...block, type: "container", kind: "table" } : block));
    assert.equal(serialize(reparsed), canonical);

    if (name === "technical-document") {
      // Issue #12: the {eq} role stays a semantic reference (formerly written as
      // `[](#eq-current)` and reparsed as a link); `[](#...)` stays an ordinary link.
      for (const document of [original, reparsed]) {
        assert.equal(getNode(document, [2, 3]).type, "crossReference");
        assert.equal(getNode(document, [2, 3]).kind, "eq");
        assert.equal(getNode(document, [2, 3]).identifier, "eq-current");
        assert.equal(getNode(document, [2, 1]).type, "link");
        assert.equal(getNode(document, [2, 1]).url, "#fig-control");
        assert.equal(getNode(document, [10, 1]).type, "link");
        assert.equal(getNode(document, [10, 1]).url, "#eq-current");
        assert.equal(getNode(document, [6]).label, "fig-control");
        assert.equal(getNode(document, [6, 0]).url, "./diagram.svg");
        assert.equal(getNode(document, [9]).label, "eq-current");
      }
    }
  });
}

test("raw MyST parsing keeps typographic quote substitution and automatic linkification off", (t) => {
  const tokenizer = createTokenizer();
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
  assert.equal(document.children[0].children?.[0].value?.toString().startsWith('"Quoted"'), true);
});

const native = (body: string) => `---\nlitzio: 1\n---\n\n${body}\n`;
const parserRequire = createRequire(createRequire(import.meta.url).resolve("myst-parser"));
const markdownRequire = createRequire(parserRequire.resolve("markdown-it"));

test("public admission and reference diagnostics reach the patched URL recognizer", (t) => {
  const LinkifyIt = markdownRequire("linkify-it");
  const match = t.mock.method(LinkifyIt.prototype, "match");
  const input = native("[missing][target] @name " + "mailto:".repeat(128) +
    " https://example.org/path[bracket] mailto:user@example.org");
  const document = publicCore.parse(input);
  assert.ok(match.mock.callCount() > 0, "admission must exercise source diagnostics");
  match.mock.resetCalls();
  const warnings = publicCore.unresolvedReferences(document);
  assert.ok(match.mock.callCount() > 0, "public diagnostics must exercise URL recognition");
  assert.deepEqual(warnings.map(item => item.label), ["target"]);
  const canonical = publicCore.serialize(document);
  assert.equal(publicCore.serialize(publicCore.parse(canonical)), canonical);
  // Exercise the installed recognizer's email grammar, including the RFC boundary.
  // This deterministic check catches an unbounded local-part without a large payload.
  const recognizer = new LinkifyIt();
  assert.equal(recognizer.matchAtStart("mailto:" + "a".repeat(64) + "@example.org")?.schema, "mailto:");
  assert.equal(recognizer.matchAtStart("mailto:" + "a".repeat(65) + "@example.org"), null);
});

test("public URL scans do not rescan tails for repeated fuzzy emails and links", (t) => {
  const LinkifyIt = markdownRequire("linkify-it");
  const match = LinkifyIt.prototype.match;
  const exec = RegExp.prototype.exec;
  const observed = new WeakSet<RegExp>();
  const scans: { input: number; work: number; matches: number }[] = [];
  let work = 0;
  t.mock.method(RegExp.prototype, "exec", function (this: RegExp, input: string) {
    const start = this.global ? this.lastIndex : 0;
    const result = exec.call(this, input);
    if (observed.has(this)) work += result ? result.index + result[0].length - start : input.length - start;
    return result;
  });
  t.mock.method(LinkifyIt.prototype, "match", function (this: { re: Record<string, unknown> }, input: string) {
    for (const re of Object.values(this.re)) if (re instanceof RegExp) observed.add(re);
    const before = work;
    const result = match.call(this, input);
    scans.push({ input: input.length, work: work - before, matches: result?.length ?? 0 });
    return result;
  });
  // Small inputs and consumed search spans, not wall-clock timing or huge payloads.
  for (const repeated of ["a@b.com\n", "a.com "]) {
    const input = native("[missing][target] " + repeated.repeat(128) + " @name");
    scans.length = 0;
    const document = publicCore.parse(input);
    assert.ok(scans.length > 0);
    const admissionScans = scans.length;
    assert.deepEqual(publicCore.unresolvedReferences(document).map(item => item.label), ["target"]);
    assert.ok(scans.length > admissionScans);
    for (const scan of scans) {
      assert.equal(scan.matches, 128, "every fuzzy URL must still be recognized");
      assert.ok(scan.work <= scan.input * 8,
        `${repeated.trim()}: ${scan.work} searched characters for ${scan.input} input characters`);
    }
    const canonical = publicCore.serialize(document);
    assert.equal(publicCore.serialize(publicCore.parse(canonical)), canonical);
  }
});

test("public parsing bounds repeated unterminated inline HTML scans", (t) => {
  const { HTML_TAG_RE } = markdownRequire("./lib/common/html_re");
  const exec = RegExp.prototype.exec;
  const indexOf = String.prototype.indexOf;
  let scanned = 0;
  t.mock.method(HTML_TAG_RE, "exec", function (this: RegExp, input: string) {
    scanned += input.length;
    return exec.call(this, input);
  });
  t.mock.method(String.prototype, "indexOf", function (this: string, needle: string, start = 0) {
    if (["-->", "?>", ">", "]]>"].includes(needle) && this.startsWith("x ")) {
      scanned += this.length - start;
    }
    return indexOf.call(this, needle, start);
  });
  for (const opener of ["<!--", "<?x", "<!A ", "<![CDATA["]) {
    // Brackets retain source evidence; @ also exercises admission's citation scan.
    const input = native("x " + opener.repeat(128) + " [missing][target] @name");
    scanned = 0;
    const document = publicCore.parse(input);
    assert.deepEqual(publicCore.unresolvedReferences(document).map(item => item.label), ["target"]);
    assert.ok(scanned <= input.length * 8, `${opener}: repeated suffix scans (${scanned})`);
    const canonical = publicCore.serialize(document);
    assert.equal(publicCore.serialize(publicCore.parse(canonical)), canonical);
  }
});

test("HTML security mitigation preserves native refusal and literal canonical text", () => {
  for (const html of ["<b>bold</b>", "<!-- comment -->", "<?pi?>", "<!DOCTYPE html>", "<![CDATA[data]]>",
    "<!-- unterminated <?pi?>", "<?unterminated <!-- comment -->", "<![CDATA[unterminated <!DOCTYPE html>"]) {
    assert.throws(() => publicCore.parse(native("x " + html)), publicCore.NativeDocumentError, html);
  }
  for (const literal of ["`<b>text</b>`", "\\<b>text\\</b>", "<!-->", "<!--->", "<!A>"]) {
    const document = publicCore.parse(native("x " + literal));
    const canonical = publicCore.serialize(document);
    assert.deepEqual(publicCore.getEditableDocument(publicCore.parse(canonical)), publicCore.getEditableDocument(document));
    assert.equal(publicCore.serialize(publicCore.parse(canonical)), canonical);
  }
});

test("CSV-table parsing treats prototype-like headers as ordinary cells", () => {
  const document = parse(':::{csv-table}\n__proto__,__proto__\nalpha,beta\n:::\n');
  const canonical = serialize(document);
  assert.ok(canonical.includes("alpha"));
  assert.ok(canonical.includes("beta"));
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
