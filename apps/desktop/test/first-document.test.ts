import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { firstDocument } from "../src/first-document.ts";

test("start-up skips malformed paths before I/O and accepts valid Unicode names", (t) => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "ieumdoc-startup-"));
  const valid = path.join(dir, "한글😀�.md");
  fs.writeFileSync(valid, "sentinel");
  const exists = t.mock.method(fs, "existsSync");
  const stat = t.mock.method(fs, "statSync");
  const warning = t.mock.method(console, "error", () => {});
  syncBuiltinESMExports();
  try {
    assert.deepEqual(firstDocument([path.join(dir, "X\uD800Y.md"), valid], dir, dir), { document: valid });
    assert.deepEqual(exists.mock.calls.map(call => call.arguments), [[valid]]);
    assert.deepEqual(stat.mock.calls.map(call => call.arguments), [[valid]]);
    assert.match(String(warning.mock.calls[0].arguments[0]), /Ignoring start-up document: Invalid Unicode: unpaired surrogate/);
    const sampleDir = path.join(dir, "sample-native-v1");
    fs.mkdirSync(sampleDir);
    const sample = path.join(sampleDir, "technical-document.md");
    fs.writeFileSync(sample, "sample");
    exists.mock.resetCalls(); stat.mock.resetCalls();
    assert.deepEqual(firstDocument([path.join(dir, "X\uDC00Y.md")], dir, dir), { sample });
    assert.deepEqual(exists.mock.calls.map(call => call.arguments), [[sample]]);
    assert.equal(stat.mock.callCount(), 0);
  } finally {
    exists.mock.restore(); stat.mock.restore(); warning.mock.restore();
    syncBuiltinESMExports();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
