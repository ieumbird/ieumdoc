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
    fs.writeFileSync(path.join(copy, "diagram.svg"), "edited diagram");
    const first = firstDocument([], dir, dir);
    assert.ok(first.samples);
    assert.equal(fs.readFileSync(path.join(copy, ".ieumdoc-sample"), "utf8"), "IeumDoc managed sample 1\n");
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

function sampleFixture(run: (fixture: { dir: string; copy: string; source: string; valid: string; warning: (message: string) => void; warnings: string[] }) => void): void {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "ieumdoc-sample-safety-"));
  try {
    fs.cpSync(fileURLToPath(new URL("../../editor/samples", import.meta.url)), path.join(dir, "sample"), { recursive: true });
    const valid = path.join(dir, "document.md");
    fs.writeFileSync(valid, "---\nieumdoc: 1\n---\n\n# My document\n");
    const warnings: string[] = [];
    run({ dir, source: path.join(dir, "sample"), copy: path.join(dir, "sample-native-v1"), valid, warnings, warning: message => warnings.push(message) });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function snapshot(folder: string): [string, string][] {
  return fs.readdirSync(folder, { recursive: true, encoding: "utf8" }).sort().map(name => {
    const file = path.join(folder, name);
    return [name, fs.statSync(file).isDirectory() ? "directory" : fs.readFileSync(file).toString("base64")];
  });
}

test("unowned, incomplete legacy and mixed sample folders are preserved and reported as conflicts", () => {
  for (const layout of ["personal", "incomplete-legacy", "mixed-legacy", "mixed-owned", "wrong-type", "unmarked-v2"]) sampleFixture(({dir,copy,source,valid,warning,warnings}) => {
    if (["mixed-owned", "wrong-type", "unmarked-v2"].includes(layout)) {
      assert.ok(firstDocument([], dir, dir, warning).samples);
      fs.writeFileSync(path.join(source, "version"), "new version");
      if (layout === "mixed-owned") fs.writeFileSync(path.join(copy, "personal.md"), "personal work");
      if (layout === "wrong-type") {
        fs.unlinkSync(path.join(copy, "ko/converter-control.md"));
        fs.mkdirSync(path.join(copy, "ko/converter-control.md"));
      }
      if (layout === "unmarked-v2") fs.unlinkSync(path.join(copy, ".ieumdoc-sample"));
    } else {
      fs.mkdirSync(copy);
      fs.writeFileSync(path.join(copy, layout === "personal" ? "personal.md" : "technical-document.md"), "personal work");
      if (layout === "mixed-legacy") {
        fs.writeFileSync(path.join(copy, "diagram.svg"), "diagram");
        fs.mkdirSync(path.join(copy, "personal-folder"));
      }
    }
    const before = snapshot(copy);
    assert.deepEqual(firstDocument([valid], dir, dir, warning), {document:valid,sampleProblem:"conflict"}, layout);
    assert.deepEqual(snapshot(copy), before, layout);
    assert.ok(warnings.at(-1)?.includes(copy));
    assert.ok(warnings.at(-1)?.includes("Sample documents unavailable"));
    assert.deepEqual(fs.readdirSync(dir).sort(), ["document.md","sample","sample-native-v1"], "no staging or backup leftovers");
  });
});

test("destination, ancestor and owned nested junctions stay intact without touching their targets", () => {
  for (const location of ["destination", "ancestor", "nested"]) sampleFixture(({dir,copy,source,valid,warning}) => {
    // Every destructive fixture is under this test's OS temporary root, outside the repository.
    const outside = path.join(dir, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "personal.md"), "outside personal work");
    let userData = dir;
    let link = copy;
    if (location === "ancestor") {
      userData = path.join(dir, "linked-parent"); link = userData;
      fs.mkdirSync(path.join(outside, "sample-native-v1"));
      fs.writeFileSync(path.join(outside, "sample-native-v1", "technical-document.md"), "edited legacy");
      fs.writeFileSync(path.join(outside, "sample-native-v1", "diagram.svg"), "diagram");
    }
    if (location === "nested") {
      assert.ok(firstDocument([], dir, dir, warning).samples);
      link = path.join(copy, "ko", "assets");
      fs.rmSync(link, {recursive:true});
      fs.writeFileSync(path.join(source, "version"), "next version");
    }
    fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    const before = snapshot(outside);
    assert.deepEqual(firstDocument([valid], userData, dir, warning), {document:valid,sampleProblem:"conflict"});
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true, "the junction itself is preserved");
    assert.deepEqual(snapshot(outside), before, "the external target is preserved");
  });
});

test("failed sample copies leave argument documents usable, old edits intact and no partial offer", () => {
  for (const existing of [false,true]) sampleFixture(({dir,copy,source,valid,warning,warnings}) => {
    if (existing) {
      const initial = firstDocument([], dir, dir, warning);
      assert.ok(initial.samples);
      fs.writeFileSync(initial.samples.ko, "edited sample");
      fs.writeFileSync(path.join(source, "version"), "next version");
    }
    const before = existing ? snapshot(copy) : undefined;
    fs.unlinkSync(path.join(source, "en/references.bib"));
    assert.deepEqual(firstDocument([valid], dir, dir, warning), {document:valid,sampleProblem:"unavailable"});
    assert.deepEqual(firstDocument([], dir, dir, warning), {sampleProblem:"unavailable"}, "empty startup also continues without advertising partial paths");
    assert.ok(warnings.at(-1)?.includes("references.bib"));
    if (before) assert.deepEqual(snapshot(copy), before);
    else assert.equal(fs.existsSync(copy), false);
    assert.deepEqual(fs.readdirSync(dir).sort(), existing ? ["document.md","sample","sample-native-v1"] : ["document.md","sample"], "incomplete staging folders are cleaned");
  });
});

test("failed staged installation restores the old sample and never advertises the failed version", (t) => sampleFixture(({dir,copy,source,valid,warning}) => {
  assert.ok(firstDocument([], dir, dir, warning).samples);
  const before = snapshot(copy);
  fs.writeFileSync(path.join(source, "version"), "next version");
  const rename = fs.renameSync;
  const mocked = t.mock.method(fs, "renameSync", (...[from, to]: Parameters<typeof fs.renameSync>) => {
    if (String(from).includes(".ieumdoc-sample-stage-") && !String(from).endsWith("-previous") && to === copy) throw new Error("injected installation failure");
    return rename(from,to);
  });
  syncBuiltinESMExports();
  try {
    assert.deepEqual(firstDocument([valid], dir, dir, warning), {document:valid,sampleProblem:"unavailable"});
    assert.deepEqual(snapshot(copy), before);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["document.md","sample","sample-native-v1"]);
  } finally { mocked.mock.restore(); syncBuiltinESMExports(); }
}));
