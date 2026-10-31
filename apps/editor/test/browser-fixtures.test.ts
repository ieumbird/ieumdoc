import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parse, serialize, getEditableDocument, validateStructure, unresolvedReferences, citationReport, type InlineContent, type ListContent } from "@litzio/core";
import { prepareBrowserFixtures, REPOSITORY_ROOT, SCRATCH_DIRS, SOURCE_DIRS } from "./browser/fixtures.ts";
import { HTTP_SCENARIOS, selectBrowserScenarios, STABLE_SCENARIOS } from "./browser/scenarios.ts";
import { classifyConsoleErrors } from "./browser/console-errors.ts";

test("fault injection permits only its expected network failures and caught plugin render error", () => {
  const message = "Failed to load resource: net::ERR_FAILED @ http://127.0.0.1:5173/api/docling-conversion";
  const rejected = "Failed to load resource: the server responded with a status of 400 (Bad Request) @ http://127.0.0.1:5173/api/docling-conversion";
  const injected = [message, message, message, message, rejected];
  assert.deepEqual(classifyConsoleErrors("docling-server", injected).unexpected, []);
  assert.deepEqual(classifyConsoleErrors("docling-server", injected).missing, []);
  assert.equal(classifyConsoleErrors("docling-server", []).missing.length, 2);
  assert.deepEqual(classifyConsoleErrors("docling-live", [message]).unexpected, [message]);
  const unrelated = message.replace("/api/docling-conversion", "/api/document");
  assert.deepEqual(classifyConsoleErrors("docling-server", [unrelated]).unexpected, [unrelated]);
  assert.deepEqual(classifyConsoleErrors("plugin-ui", ["Error: PLUGIN_UI_RENDER_FIXTURE"]).unexpected, []);
  const uncaught = "Uncaught page error: PLUGIN_UI_RENDER_FIXTURE";
  assert.deepEqual(classifyConsoleErrors("plugin-ui", [uncaught]).unexpected, [uncaught]);
});

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
  const tmp = mkdtempSync(path.join(tmpdir(), "litzio-browser-fixtures-"));
  try {
    run(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test("every scratch directory a browser scenario opens is prepared", () => {
  const scenarios = readdirSync(testDir).filter((name) => name.endsWith(".browser.js"));
  assert.deepEqual([...STABLE_SCENARIOS, ...HTTP_SCENARIOS].sort(), scenarios.map(name => name.replace(".browser.js", "")).sort(),
    "Vite and production HTTP suites cover every browser scenario exactly once");
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

test("browser shards cover the full stable suite once, with balanced nonempty groups", () => {
  for (const count of [1, 2, 3, 4]) {
    const groups = Array.from({ length: count }, (_, index) => selectBrowserScenarios([`--shard=${index + 1}/${count}`]).scenarios);
    assert.deepEqual(groups.flat().sort(), [...STABLE_SCENARIOS].sort(), "no missing or duplicate scenarios");
    const lengths = groups.map(group => group.length);
    assert.ok(Math.min(...lengths) > 0);
    assert.ok(Math.max(...lengths) - Math.min(...lengths) <= 1);
  }
});

test("invalid or ambiguous browser shards cannot silently run an incomplete suite", () => {
  for (const shard of ["--shard", "--shard=", "--shard=0/2", "--shard=1/0", "--shard=-1/2", "--shard=3/2",
    "--shard=1.5/2", "--shard=1/2/3", "--shard=1/9007199254740992", `--shard=1/${STABLE_SCENARIOS.length + 1}`]) {
    assert.throws(() => selectBrowserScenarios([shard]), /shard/i, shard);
  }
  for (const args of [["--shard=1/2", "--shard=2/2"], ["--shard=1/2", "source-view"], ["--shard=1/2", "--screenshots"]]) {
    assert.throws(() => selectBrowserScenarios(args), /shard/i);
  }
});

test("unsharded browser selection retains the full suite, named runs and visual review", () => {
  assert.deepEqual(selectBrowserScenarios([]), { scenarios: STABLE_SCENARIOS, screenshots: false });
  assert.deepEqual(selectBrowserScenarios(["source-view", "folder-navigation"]),
    { scenarios: ["source-view", "folder-navigation"], screenshots: false });
  assert.deepEqual(selectBrowserScenarios(["folder-navigation", "--screenshots"]),
    { scenarios: ["folder-navigation"], screenshots: true });
  assert.deepEqual(selectBrowserScenarios(["desktop-updates", "--screenshots"]),
    { scenarios: ["desktop-updates"], screenshots: true });
  assert.deepEqual(selectBrowserScenarios(["open-files", "--screenshots"]),
    { scenarios: ["open-files"], screenshots: true });
  assert.deepEqual(selectBrowserScenarios(["footnotes", "--screenshots"]),
    { scenarios: ["footnotes"], screenshots: true });
  assert.deepEqual(selectBrowserScenarios(["source-view", "--screenshots"]),
    { scenarios: ["source-view"], screenshots: true });
  assert.throws(() => selectBrowserScenarios(["--screenshots"]), /Use:/);
});

test("prepared scratch files start as copies of their sources, with the derived assets", () => withTmp((tmp) => {
  prepareBrowserFixtures(tmp);
  const technical = readFileSync(path.join(documentDir, "technical-document.md"));
  for (const dir of ["reference-save-reload", "block-move", "figure-authoring", "table-cell-editing", "source-view", "label-authoring"]) {
    assert.deepEqual(readFileSync(path.join(tmp, dir, "technical-document.md")), technical, dir);
    assert.ok(existsSync(path.join(tmp, dir, "diagram.svg")), dir);
  }
  for (const [dir, name] of [
    ["admonition-authoring", "authoring.md"],
    ["structural-block-authoring", "structural-block-authoring.md"],
    ["inline-math", "math.md"],
    ["inline-math", "split.md"],
    ["link-authoring", "links.md"],
    ["cross-reference", "refs.md"],
    ["table-cell-editing", "mixed-table.md"],
    ["source-view", "writable.md"],
    ["quote-save-reload", "quotes.md"],
    ["writeability-preflight", "writable.md"],
    ["writeability-preflight", "blocked-markdown.md"],
    ["table-authoring", "tables.md"],
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
  assert.ok(readFileSync(path.join(tmp, "admonition-authoring", "authoring.md"), "utf8").replaceAll("\r\n", "\n").startsWith("---\nlitzio: 1\n---\n\n# Admonition authoring"));
  assert.ok(readFileSync(path.join(tmp, "structural-block-authoring", "structural-block-authoring.md"), "utf8").replaceAll("\r\n", "\n").startsWith("---\nlitzio: 1\n---\n\n# Structural authoring"));
  assert.ok(readFileSync(path.join(tmp, "inline-math", "split.md"), "utf8").replaceAll("\r\n", "\n").startsWith("---\nlitzio: 1\n---\n\nThe current $i_d$, then more."));
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

test("localized sample folders retain the supported feature set and canonical Core model", () => {
  const structures: string[][] = [];
  for (const language of ["ko", "en"]) {
    const dir = path.join(REPOSITORY_ROOT, "apps/editor/samples", language);
    const source = readFileSync(path.join(dir, "converter-control.md"), "utf8");
    const document = parse(source);
    assert.doesNotThrow(() => validateStructure(document));
    assert.deepEqual(unresolvedReferences(document), []);
    assert.equal(serialize(document), source, "sample is already canonical");
    const model = getEditableDocument(document);
    assert.deepEqual(getEditableDocument(parse(serialize(document))), model);
    assert.deepEqual(model.headingNumbering?.enabled, [true, true, true, true, true, true]);
    assert.ok(model.referenceTemplates?.figure && model.referenceTemplates.table && model.referenceTemplates.equation);
    structures.push(model.blocks.map(block => block.block));
    const inline: InlineContent[] = [];
    const visit = (content: InlineContent[]) => { for (const item of content) { inline.push(item); if ("children" in item) visit(item.children); } };
    const lists: ListContent[] = [];
    const visitList = (list: ListContent) => { lists.push(list); for (const item of list.items) { visit(item.content); if (item.list) visitList(item.list); } };
    for (const block of model.blocks) {
      if ("content" in block && Array.isArray(block.content)) visit(block.content);
      if (block.block === "list") visitList(block);
      if (block.block === "figure") visit(block.caption.content);
      if (block.block === "table") { if (block.caption) visit(block.caption); for (const row of block.rows) for (const cell of row.cells) visit(cell.content); }
    }
    for (const kind of ["strong", "emphasis", "link", "code", "math", "footnote", "citation"]) assert.ok(inline.some(item => item.kind === kind), kind);
    assert.ok(lists.some(list => list.ordered) && lists.some(list => !list.ordered));
    assert.ok(lists.some(list => list.items.some(item => item.list)), "nested list");
    for (const kind of ["code", "quote", "admonition", "footnote"]) assert.ok(model.blocks.some(block => block.block === kind), kind);
    assert.ok(model.blocks.some(block => block.block === "target" && inline.some(item => item.kind === "reference" && item.role === "ref" && item.label === block.label)), "section reference");
    for (const kind of ["table", "equation", "figure"] as const) {
      const targets = model.blocks.filter(block => block.block === kind && "label" in block);
      assert.ok(targets.length);
      for (const block of targets) {
        assert.ok("label" in block && block.label && inline.some(item => item.kind === "reference" && item.label === block.label), `labeled, referenced ${kind}`);
        if (block.block === "table") assert.ok(block.caption?.length);
        if (block.block === "figure") assert.ok(block.caption.content.length);
      }
    }
    assert.ok(model.blocks.some(block => block.block === "figure" && block.contentKind === "mermaid" && block.mermaidSource));
    const images = model.blocks.filter(block => block.block === "figure" && block.contentKind === "image");
    assert.ok(images.length);
    for (const block of images) if (block.block === "figure") {
      assert.ok(block.imageUrl.startsWith("./assets/"));
      assert.ok(existsSync(path.join(dir, block.imageUrl)));
    }
    const report = citationReport(document, [{ source: "./references.bib", status: "ok", text: readFileSync(path.join(dir, "references.bib"), "utf8") }]);
    assert.equal(report.readiness.complete, true);
    assert.ok(report.references?.length);
  }
  assert.deepEqual(structures[0], structures[1], "both languages offer the same document structure");
});
