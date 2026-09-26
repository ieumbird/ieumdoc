import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parse, serialize } from "@ieumdoc/core";
import { prepareBrowserFixtures, REPOSITORY_ROOT, SCRATCH_DIRS, SOURCE_DIRS } from "./browser/fixtures.ts";

const testDir = path.join(REPOSITORY_ROOT, "apps", "editor", "test");
const documentDir = path.join(REPOSITORY_ROOT, "apps", "editor", "document");
const fixtureDir = path.join(testDir, "browser", "fixtures");

/** Every file under `dir`, by relative path. */
function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(readdirSync(dir, { recursive: true, encoding: "utf8" }).sort()
    .filter((name) => statSync(path.join(dir, name)).isFile())
    .map((name) => [name.replaceAll("\\", "/"), readFileSync(path.join(dir, name), "latin1")]));
}

function withTmp(run: (tmp: string) => void): void {
  const tmp = mkdtempSync(path.join(tmpdir(), "ieumdoc-browser-fixtures-"));
  try {
    run(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test("every scratch directory a browser scenario opens is prepared", () => {
  const scenarios = readdirSync(testDir).filter((name) => name.endsWith(".browser.js"));
  const prepared = Object.values(SCRATCH_DIRS).flatMap((dir) => dir.scenarios);
  for (const scenario of scenarios) {
    const source = readFileSync(path.join(testDir, scenario), "utf8");
    const dirs = [...source.matchAll(/'tmp', '([a-z-]+)'/g)].map((match) => match[1]);
    for (const dir of dirs) {
      assert.ok(dir in SCRATCH_DIRS, `${scenario} opens tmp/${dir}`);
      assert.ok(SCRATCH_DIRS[dir].scenarios.includes(scenario.replace(".browser.js", "")), `${scenario} is listed under tmp/${dir}`);
    }
  }
  for (const name of prepared) assert.ok(scenarios.includes(`${name}.browser.js`), name);
});

test("prepared scratch files start as copies of their sources, with the derived assets", () => withTmp((tmp) => {
  prepareBrowserFixtures(tmp);
  const technical = readFileSync(path.join(documentDir, "technical-document.md"));
  for (const dir of ["reference-save-reload", "figure-authoring", "table-cell-editing", "source-view", "label-authoring"]) {
    assert.deepEqual(readFileSync(path.join(tmp, dir, "technical-document.md")), technical, dir);
    assert.ok(existsSync(path.join(tmp, dir, "diagram.svg")), dir);
  }
  for (const [dir, name] of [
    ["admonition-authoring", "authoring.md"],
    ["inline-math", "math.md"],
    ["inline-math", "split.md"],
    ["link-authoring", "links.md"],
    ["cross-reference", "refs.md"],
    ["table-cell-editing", "mixed-table.md"],
    ["source-view", "keyboard.md"],
    ["quote-save-reload", "quotes.md"],
    ["writeability-preflight", "front-matter.md"],
    ["writeability-preflight", "writable.md"],
  ]) {
    assert.deepEqual(readFileSync(path.join(tmp, dir, name)), readFileSync(path.join(fixtureDir, name)), `${dir}/${name}`);
  }
  assert.ok(existsSync(path.join(tmp, "cross-reference", "diagram.svg")));
  const v2 = readFileSync(path.join(tmp, "figure-authoring", "diagram-v2.svg"), "utf8");
  assert.match(v2, /<svg data-variant="v2" /);
  assert.notEqual(v2, readFileSync(path.join(documentDir, "diagram.svg"), "utf8"));
  assert.equal(readFileSync(path.join(tmp, "source-view", "expected.md"), "utf8"),
    serialize(parse(technical.toString("utf8"))));
  // The fixtures are what the scenarios' freshness checks expect.
  assert.ok(readFileSync(path.join(tmp, "admonition-authoring", "authoring.md"), "utf8").startsWith("# Admonition authoring"));
  assert.ok(readFileSync(path.join(tmp, "inline-math", "split.md"), "utf8").startsWith("The current $i_d$, then more."));
}));

test("preparing again restores modified scratch files and removes leftovers, and nothing else", () => withTmp((tmp) => {
  const unrelated = path.join(tmp, "unrelated.txt");
  writeFileSync(unrelated, "keep");
  prepareBrowserFixtures(tmp);
  const fresh = snapshot(tmp);
  writeFileSync(path.join(tmp, "inline-math", "split.md"), "changed by a test\n");
  writeFileSync(path.join(tmp, "source-view", "created-during-preview.md"), "leftover\n");
  rmSync(path.join(tmp, "figure-authoring", "diagram-v2.svg"));
  prepareBrowserFixtures(tmp);
  assert.deepEqual(snapshot(tmp), fresh);
  assert.equal(readFileSync(unrelated, "utf8"), "keep");
}));

test("preparing only reads the committed sources", () => withTmp((tmp) => {
  const before = SOURCE_DIRS.map(snapshot);
  prepareBrowserFixtures(tmp);
  prepareBrowserFixtures(tmp);
  assert.deepEqual(SOURCE_DIRS.map(snapshot), before);
}));
