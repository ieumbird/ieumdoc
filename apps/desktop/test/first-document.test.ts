import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { firstDocument } from "../src/first-document.ts";

test("start-up skips malformed paths before I/O and accepts valid Unicode names", (t) => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "ieumdoc-startup-"));
  const valid = path.join(dir, "한글😀�.md");
  fs.writeFileSync(valid, "sentinel");
  const exists = t.mock.method(fs, "existsSync");
  const stat = t.mock.method(fs, "statSync");
  const warning = t.mock.fn<(message: string) => void>();
  syncBuiltinESMExports();
  try {
    const source = fileURLToPath(new URL("../../editor/samples", import.meta.url));
    fs.cpSync(source, path.join(dir, "sample"), { recursive: true });
    const first = firstDocument([path.join(dir, "X\uD800Y.md"), valid], dir, dir, warning);
    assert.equal(first.document, valid);
    assert.ok(first.samples);
    assert.ok(exists.mock.calls.every(call => !String(call.arguments[0]).includes("X\uD800Y")));
    assert.deepEqual(stat.mock.calls.map(call => call.arguments), [[valid]]);
    assert.deepEqual(warning.mock.calls.map(call => call.arguments),
      [["Ignoring start-up document: Invalid Unicode: unpaired surrogate; nothing was written"]]);
    exists.mock.resetCalls(); stat.mock.resetCalls();
    assert.deepEqual(firstDocument([path.join(dir, "X\uDC00Y.md")], dir, dir, warning), { samples: first.samples });
    assert.ok(exists.mock.calls.every(call => !String(call.arguments[0]).includes("X\uDC00Y")));
    assert.equal(stat.mock.callCount(), 0);
    assert.deepEqual(warning.mock.calls.map(call => call.arguments), Array(2).fill(
      ["Ignoring start-up document: Invalid Unicode: unpaired surrogate; nothing was written"]));
  } finally {
    exists.mock.restore(); stat.mock.restore();
    syncBuiltinESMExports();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sample version replaces edited old copies once and preserves same-version edits in both languages", () => {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "ieumdoc-sample-"));
  try {
    fs.cpSync(fileURLToPath(new URL("../../editor/samples", import.meta.url)), path.join(dir, "sample"), { recursive: true });
    const copy = path.join(dir, "sample-native-v1");
    fs.mkdirSync(copy);
    fs.writeFileSync(path.join(copy, "technical-document.md"), "edited old sample");
    const first = firstDocument([], dir, dir);
    assert.ok(first.samples);
    assert.equal(fs.existsSync(path.join(copy, "technical-document.md")), false);
    for (const language of ["ko", "en"] as const) {
      const file: string = first.samples[language];
      const bundled = path.join(dir, "sample", language);
      for (const relative of fs.readdirSync(bundled, { recursive: true, encoding: "utf8" })) {
        const source = path.join(bundled, relative);
        if (fs.statSync(source).isFile()) assert.deepEqual(fs.readFileSync(path.join(path.dirname(file), relative)), fs.readFileSync(source), `copied ${language}/${relative}`);
      }
      fs.writeFileSync(file, `edited ${language}`);
    }
    assert.deepEqual(firstDocument([], dir, dir), first);
    for (const language of ["ko", "en"] as const) assert.equal(fs.readFileSync(first.samples[language], "utf8"), `edited ${language}`);
    fs.writeFileSync(path.join(dir, "sample/version"), "next-version");
    const next = firstDocument([], dir, dir);
    assert.deepEqual(next.samples, first.samples);
    for (const language of ["ko", "en"] as const) assert.equal(fs.readFileSync(first.samples[language], "utf8"), fs.readFileSync(path.join(dir, "sample", language, "converter-control.md"), "utf8"));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
