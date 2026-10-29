import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

// Dependency patch verification for #11; intentionally outside the default Core suite.
test("patched smartquotes handles the upstream pathological input in a bounded child process", () => {
  // A child timeout can stop a synchronous parser regression; node:test's timeout cannot.
  // This is a generous hang guard, not a machine-specific performance benchmark.
  // Core parse no longer runs smartquotes, but the patched dependency is still installed:
  // exercise it through MyST's default tokenizer, and Core parse on the same input.
  const coreUrl = new URL("./core-internal.ts", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { createTokenizer } from 'myst-parser';
    import { parse, getEditableDocument } from ${JSON.stringify(coreUrl)};
    const input = '"'.repeat(160000);
    const inline = createTokenizer().parse(input, {}).find((token) => token.type === 'inline');
    assert.equal(inline.children.map((token) => token.content).join(''), '“”'.repeat(80000));
    const block = getEditableDocument(parse(input)).blocks[0];
    assert.equal(block.block, 'paragraph');
    assert.equal(block.text, input);
  `], { cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 10000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});
