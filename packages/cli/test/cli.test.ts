import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  getEditableDocument,
  inspectDocument,
  insertParagraph,
  insertHardBreak,
  splitParagraph,
  mergeParagraphWithPrevious,
  moveBlock,
  parse,
  removeBlock,
  replaceText,
  serialize,
  validateStructure,
  citationReport,
  updateLabel,
  numberingReport,
} from "@ieumdoc/core";
import { textRevision } from "@ieumdoc/file-commit";
import { runCli } from "../src/cli.ts";
import { versionText } from "../src/version.ts";
import { listenForFetch } from "../../../test/helpers/fetch-server.ts";

const cliRoot = fileURLToPath(new URL("..", import.meta.url));
const nativeSource = (body: string): string => `---\nieumdoc: 1\n---\n\n${body}`;
const fixtures = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-native-fixtures-"));

test("docling convert delegates whole-document conversion and refuses overwrite and range options", () => {
  const input = fileURLToPath(new URL("../../docling/test/fixtures/synthetic/document.json", import.meta.url));
  const before = readFileSync(input);
  const output = path.join(fixtures, "docling-bundle");
  const converted = run(["docling", "convert", input, "--output", output]);
  assert.equal(converted.status, 0, converted.stderr);
  assert.equal(JSON.parse(converted.stdout).output, output);
  assert.ok(fs.existsSync(path.join(output, "document.md")));
  const map = readFileSync(path.join(output, "document.docling-map.json"));
  assert.deepEqual(readFileSync(input), before);
  assert.equal(run(["docling", "convert", input, "--output", output]).status, 1);
  assert.deepEqual(readFileSync(path.join(output, "document.docling-map.json")), map);
  const refused = path.join(fixtures, "docling-refused");
  assert.equal(run(["docling", "convert", input, "--output", refused, "--chapter", "7"]).status, 1);
  assert.equal(fs.existsSync(refused), false);
  assert.match(run(["help", "docling"]).stdout, /DoclingDocument 1\.10\.0/);
});

test("docling convert-pdf executable accepts server flag/environment and reports module results", async () => {
  const server = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/version") res.end('{"docling-serve":"1.32.0"}');
    else if (req.url === "/ready") res.end('{}');
    else if (req.url === "/openapi.json") res.end('{"info":{"version":"1.32.0"}}');
    else if (req.url === "/v1/convert/file/async") {
      for await (const _ of req) { /* consume uploaded PDF */ }
      res.end('{"task_id":"cli-job","task_status":"success"}');
    } else if (req.url === "/v1/result/cli-job") res.end(JSON.stringify({ status: "success", document: {
      json_content: { schema_name: "DoclingDocument", version: "1.10.0", name: "CLI", body: { self_ref: "#/body", children: [] } },
    } }));
    else { res.statusCode = 404; res.end('{}'); }
  });
  await listenForFetch(server);
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const input = path.join(fixtures, "rest.pdf"); writeFileSync(input, "%PDF-1.7\nfixture");
  async function execute(args: string[], envServer: string) {
    const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../src/cli.ts", import.meta.url)), ...args], {
      cwd: cliRoot, env: { ...process.env, IEUMDOC_DOCLING_SERVER: envServer }, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", c => { stdout += c; }); child.stderr.on("data", c => { stderr += c; });
    const status = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    return { status, stdout, stderr };
  }
  try {
    for (const explicit of [true, false]) {
      const output = path.join(fixtures, explicit ? "rest-explicit" : "rest-env");
      const result = await execute(["docling", "convert-pdf", input, "--output", output, ...(explicit ? ["--server", url] : [])], explicit ? "http://127.0.0.1:1" : url);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).taskId, "cli-job");
      assert.equal(JSON.parse(readFileSync(path.join(output, "conversion-record.json"), "utf8")).server.url, url + "/");
      assert.ok(fs.existsSync(path.join(output, "document.md")));
    }
    for (const flags of [["--timeout", "NaN"], ["--image-export-mode", "referenced"], ["--server", url, "--server", url]]) {
      const result = await execute(["docling", "convert-pdf", input, "--output", path.join(fixtures, "rest-refused"), ...flags], url);
      assert.equal(result.status, 1);
      assert.equal(fs.existsSync(path.join(fixtures, "rest-refused")), false);
    }
    const missing = await execute(["docling", "convert-pdf", input, "--output", path.join(fixtures, "rest-refused")], "");
    assert.equal(missing.status, 1); assert.match(missing.stderr, /requires.*--server/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});
after(() => rmSync(fixtures, { recursive: true, force: true }));
const fixture = path.join(fixtures, "document.md");
const technicalFixture = path.join(fixtures, "technical-document.md");
for (const [name, target] of [["document.md", fixture], ["technical-document.md", technicalFixture]]) {
  writeFileSync(target, nativeSource(readFileSync(fileURLToPath(new URL(`../../core/test/fixtures/${name}`, import.meta.url)), "utf8")));
}

const FROM = "The converter regulates voltage.";
const TO = "The converter regulates voltage and current.";
const INSERTED = "Added by CLI.";

test("fixed-number CLI edits share revision/dry-run/batch writes and expose nonblocking Core warnings", () => {
  const file = path.join(fixtures, "fixed-numbers.md");
  const operations = path.join(fixtures, "fixed-numbers.json");
  const source = nativeSource(":::{figure}\n:name: fig\n:::\n\n:::{figure}\n:::\n\n| A |\n| --- |\n\nSee {numref}`fig`.\n");
  writeFileSync(file, source);
  const args = ["update-enumerator", file, "--path", "1", "--enumerator", "A.3"];
  const preview = run([...args, "--dry-run", "--format", "json"]);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(readFileSync(file, "utf8"), source);
  assert.equal(JSON.parse(preview.stdout).numbering.mode, "fixed");
  assert.equal(run([...args, "--if-revision", textRevision(source)]).status, 0);
  const saved = readFileSync(file, "utf8");
  assert.match(saved, /:enumerator: A\.3/);
  assert.equal(run([...args, "--if-revision", textRevision(source)]).status, 1);
  assert.equal(run(["update-enumerator", file, "--path", "4", "--enumerator", "17"]).status, 1);
  assert.equal(readFileSync(file, "utf8"), saved);
  writeFileSync(operations, JSON.stringify([{ command: "update-enumerator", path: 2, enumerator: "A.3" }, { command: "update-enumerator", path: 3, enumerator: "17" }]));
  const batch = run(["apply-batch", file, "--operations", operations]);
  assert.equal(batch.status, 0, batch.stderr);
  const inspected = run(["inspect", file, "--format", "json"]);
  assert.equal(inspected.status, 0, inspected.stderr);
  const model = JSON.parse(inspected.stdout);
  const figure = model.nodes.find((node: { type: string }) => node.type === "figure");
  assert.equal(figure.enumerator, "A.3");
  assert.deepEqual(figure.numbers, { figure: "A.3" });
  assert.equal(figure.referenceText, "Figure\u00a0A.3");
  const checked = run(["check", file, "--format", "json"]);
  assert.equal(checked.status, 0, checked.stderr);
  assert.deepEqual(JSON.parse(checked.stdout).numbering, model.numbering);
  assert.deepEqual(model.numbering.diagnostics.map((d: { code: string }) => d.code), ["numbering-duplicate", "numbering-duplicate"]);
  assert.match(run(["check", file]).stdout, /warning: numbering-duplicate/);
  assert.match(run(["inspect", file]).stdout, /enumerator="A\.3"/);
  const clear = run(["update-enumerator", file, "--path", "1", "--enumerator", ""]);
  assert.equal(clear.status, 0, clear.stderr);
  assert.ok(JSON.parse(run(["check", file, "--format", "json"]).stdout).numbering.diagnostics.some((d: { code: string }) => d.code === "numbering-missing"));
  const emptyFile = path.join(fixtures, "fixed-empty-guidance.md");
  const emptySource = nativeSource("$$\n$$\n");
  writeFileSync(emptyFile, emptySource);
  const number = { command: "update-enumerator", path: 1, enumerator: "A.3" };
  const fill = { command: "update-equation-latex", path: 1, from: "", to: "x=1" };
  writeFileSync(operations, JSON.stringify([number, fill]));
  const refused = run(["apply-batch", emptyFile, "--operations", operations]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /Enter equation content before setting the fixed number; in a batch, reorder those operations/);
  assert.equal(readFileSync(emptyFile, "utf8"), emptySource);
  writeFileSync(operations, JSON.stringify([fill, number]));
  const reordered = run(["apply-batch", emptyFile, "--operations", operations]);
  assert.equal(reordered.status, 0, reordered.stderr);
  assert.match(readFileSync(emptyFile, "utf8"), /:enumerator: A\.3/);
});

test("update-media-references supports dry-run, batch, revision conflict and failure without writes", () => {
  const file = path.join(fixtures, "media-references.md"), batchFile = path.join(fixtures, "media-batch.md"), operations = path.join(fixtures, "media-operations.json");
  const source = nativeSource(":::{figure} ./old.svg\n:alt: Keep\n\nCaption.\n:::\n");
  writeFileSync(file, source); writeFileSync(batchFile, source);
  const args = ["update-media-references", file, "--from", "./old.svg", "--to", "./new.svg"];
  const preview = run([...args, "--dry-run", "--format", "json"]);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(readFileSync(file, "utf8"), source);
  const revision = textRevision(source);
  const edited = run([...args, "--if-revision", revision]);
  assert.equal(edited.status, 0, edited.stderr);
  const output = readFileSync(file, "utf8");
  assert.match(output, /\.\/new.svg/);
  assert.match(output, /:alt: Keep/);
  assert.equal(run([...args, "--if-revision", revision]).status, 1);
  assert.equal(readFileSync(file, "utf8"), output);
  assert.equal(run(["update-media-references", file, "--from", "./new.svg", "--to", "bad\npath"]).status, 1);
  assert.equal(readFileSync(file, "utf8"), output);
  writeFileSync(operations, JSON.stringify([{ command: "update-media-references", from: "./old.svg", to: "./new.svg" }]));
  const batch = run(["apply-batch", batchFile, "--operations", operations]);
  assert.equal(batch.status, 0, batch.stderr);
  assert.equal(readFileSync(batchFile, "utf8"), output);
});

test("citation single edits, batch, check/inspect and format use the same Core report and never rewrite bibliography inputs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-citations-"));
  try {
    const file = path.join(dir, "paper.md"), batchFile = path.join(dir, "batch.md"), operationsFile = path.join(dir, "operations.json");
    const bib = path.join(dir, "refs.bib"), bibBytes = "% No entries. This external bibliography must never be rewritten.\r\n";
    writeFileSync(bib, bibBytes);
    const source = nativeSource("A claim.\n");
    writeFileSync(file, source); writeFileSync(batchFile, source);
    const operations = [
      { command: "update-bibliography", paths: ["./refs.bib", "../missing.bib"] },
      { command: "insert-citation", path: 1, offset: 1, role: "cite", keys: ["Key", "Other"] },
      { command: "update-citation", path: 1, offset: 1, role: "cite:p", keys: ["Other", "Key"] },
      { command: "insert-citation", path: 1, offset: 0, role: "cite:t", keys: ["Key"] },
      { command: "remove-citation", path: 1, offset: 0 },
    ];
    for (const { command, ...options } of operations) {
      const args = Object.entries(options).flatMap(([key, value]) => [`--${key}`, Array.isArray(value) ? JSON.stringify(value) : String(value)]);
      const result = run([command, file, ...args]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "");
    }
    writeFileSync(operationsFile, JSON.stringify(operations));
    const preview = run(["apply-batch", batchFile, "--operations", operationsFile, "--dry-run", "--format", "json"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(readFileSync(batchFile, "utf8"), source);
    const result = run(["apply-batch", batchFile, "--operations", operationsFile]);
    assert.equal(result.status, 0, result.stderr);
    const final = readFileSync(file, "utf8");
    assert.equal(readFileSync(batchFile, "utf8"), final);
    const expected = citationReport(parse(final), [{ source: "./refs.bib", status: "ok", text: bibBytes }, { source: "../missing.bib", status: "error", code: "bibliography-unreadable" }]);
    assert.deepEqual(JSON.parse(preview.stdout).citations, expected);
    for (const command of ["check", "inspect"]) {
      const json = run([command, file, "--format", "json"]);
      assert.equal(json.status, 0, json.stderr);
      assert.deepEqual(JSON.parse(json.stdout).citations, expected);
      const text = run([command, file]);
      assert.match(text.stdout, /bibliography "\.\/refs\.bib"/);
      assert.match(text.stdout, /keys=\["Other","Key"\] text="\[1\], \[2\]"/);
      assert.match(text.stdout, /citation readiness: evaluated; complete: false/);
    }
    assert.equal(run(["format", file]).status, 0);
    assert.equal(readFileSync(file, "utf8"), final);
    assert.equal(readFileSync(bib, "utf8"), bibBytes);

    for (const args of [
      ["insert-citation", file, "--path", "1", "--offset", "0", "--role", "cite:year", "--keys", '["Key"]'],
      ["insert-citation", file, "--path", "1", "--offset", "0", "--role", "cite", "--keys", '[]'],
      ["insert-citation", file, "--path", "1", "--offset", "0", "--role", "cite", "--keys", '["Key"]', "--suffix", "p. 3"],
      ["remove-citation", file, "--path", "1", "--offset", "0"],
      ["update-bibliography", file, "--paths", '["/refs.bib"]'],
    ]) {
      assert.equal(run(args).status, 1, args.join(" "));
      assert.equal(readFileSync(file, "utf8"), final);
    }
    writeFileSync(operationsFile, JSON.stringify([{ command: "update-bibliography", paths: [] },
      { command: "update-citation", path: 1, offset: 0, role: "cite", keys: ["Key"] }]));
    const failed = run(["apply-batch", file, "--operations", operationsFile]);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /operation 2 \(update-citation\).*nothing was written/);
    assert.equal(readFileSync(file, "utf8"), final);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI rejects malformed paths before I/O and accepts valid Unicode names", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-path-unicode-"));
  try {
    const valid = path.join(dir, "한글😀�.md");
    assert.equal(run(["create", valid]).status, 0);
    assert.equal(run(["check", valid]).status, 0);
    const original = readFileSync(valid);
    const mocks = (["readFileSync", "writeFileSync", "existsSync", "statSync", "realpathSync", "openSync"] as const)
      .map(name => t.mock.method(fs, name, () => { throw new Error(`unexpected ${name}`); }));
    syncBuiltinESMExports();
    try {
      for (const args of [
        ["check", path.join(dir, "X\uD800Y.md")],
        ["create", path.join(dir, "C\uDC00D.md")],
        ["apply-batch", valid, "--operations", path.join(dir, "ops\uD800.json")],
      ]) {
        const result = run(args);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Invalid Unicode: unpaired surrogate/);
        assert.equal(result.stdout, "");
      }
      for (const mock of mocks) assert.equal(mock.mock.callCount(), 0);
    } finally { for (const mock of mocks) mock.mock.restore(); syncBuiltinESMExports(); }
    assert.deepEqual(readFileSync(valid), original);
    assert.deepEqual(readdirSync(dir), [path.basename(valid)]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI refuses invalid UTF-8 documents/operation files and escaped surrogates without changing disk bytes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-unicode-"));
  const file = path.join(dir, "document.md");
  const operations = path.join(dir, "ops.json");
  const original = Buffer.from(nativeSource("한글 😀 �\n"));
  try {
    const malformed = Buffer.concat([original, Buffer.from([0xff])]);
    writeFileSync(file, malformed);
    const format = run(["format", file]);
    assert.equal(format.status, 1);
    assert.match(format.stderr, /Invalid UTF-8/);
    assert.deepEqual(readFileSync(file), malformed);
    writeFileSync(file, original);
    const malformedJson = Buffer.concat([Buffer.from('[{"command":"insert-block","at":1,"text":"A'), Buffer.from([0xff]), Buffer.from('B"}]')]);
    for (const input of [malformedJson, Buffer.from(JSON.stringify([{ command: "insert-block", at: 1, text: "A\uD800B" }]))]) {
      writeFileSync(operations, input);
      const result = run(["apply-batch", file, "--operations", operations, "--format", "json"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Invalid (UTF-8|Unicode)/);
      assert.equal(result.stdout, "");
      assert.deepEqual(run(["apply-batch", file, "--operations", operations, "--format", "json", "--dry-run"]), result);
      assert.deepEqual(readFileSync(file), original);
    }
    assert.deepEqual(readdirSync(dir).sort(), ["document.md", "ops.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("serve help explains the boundary and invalid invocation never starts a listener", () => {
  const help = run(["serve", "--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--root.*--root/);
  assert.match(help.stdout, /127\.0\.0\.1/);
  for (const args of [[], ["--port", "0"], ["--port", "1.5"], ["--port", "5180", "--port", "5181"], ["--unknown", "x"], ["--root"]]) {
    const result = runProcess(["serve", ...args]);
    assert.notEqual(result.status, 0, args.join(" "));
    assert.doesNotMatch(result.stdout, /IeumDoc HTTP:/);
  }
});

test("insert-block accepts Core inline JSON and rejects ambiguous input without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-inline-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("# Title\n"));
  try {
    const content = JSON.stringify([{ kind: "strong", children: [{ kind: "text", text: "Value" }] },
      { kind: "text", text: " " }, { kind: "math", value: "x" }]);
    const args = ["insert-block", file, "--at", "2", "--content", content];
    const ambiguous = run([...args, "--text", "conflict"]);
    assert.notEqual(ambiguous.status, 0);
    assert.match(ambiguous.stderr, /exactly one/);
    assert.equal(readFileSync(file, "utf8"), nativeSource("# Title\n"));
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(file, "utf8"), nativeSource("# Title\n\n**Value** $x$\n"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI writes and dry runs report the same preflight conflict and keep externally changed bytes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-changed-"));
  const file = path.join(dir, "document.md");
  const external = Buffer.from(nativeSource("# Edited elsewhere\r\n\r\nKept exactly ✓\r\n"), "utf8");
  writeFileSync(file, nativeSource("# Title\n"));
  try {
    const args = ["insert-block", file, "--at", "2", "--text", INSERTED];
    const operations = path.join(dir, "operations.json");
    writeFileSync(operations, JSON.stringify([{ command: "insert-block", at: 2, text: INSERTED }]));
    for (const invocation of [args, ["apply-batch", file, "--operations", operations, "--format", "json"]]
      .flatMap(args => [args, [...args, "--dry-run"]])) {
      writeFileSync(file, nativeSource("# Title\n"));
      const inspected = run(["inspect", file, "--format", "json"]);
      assert.equal(inspected.status, 0, inspected.stderr);
      const changed = runProcess([...invocation, "--if-revision", JSON.parse(inspected.stdout).revision], ["--import", pathToFileURL(path.join(cliRoot, "test", "replace-after-read.ts")).href], {
        ...process.env, IEUMDOC_TEST_REPLACE_AFTER_READ: file, IEUMDOC_TEST_REPLACEMENT: external.toString("base64"),
      });
      assert.equal(changed.status, 1, changed.stderr);
      assert.equal(changed.stdout, "");
      assert.equal(changed.stderr, `${file} changed after it was read; nothing was written\n`);
      assert.deepEqual(readFileSync(file), external);
      assert.deepEqual(readdirSync(dir).sort(), ["document.md", "operations.json"]);
    }

    const saved = run(args);
    assert.equal(saved.status, 0, saved.stderr);
    assert.equal(readFileSync(file, "utf8"), serialize(insertParagraph(parse(external.toString("utf8")), 2, INSERTED)));
    assert.deepEqual(readdirSync(dir).sort(), ["document.md", "operations.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("dry runs expose the canonical result and check diagnostics without any filesystem mutation", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-dry-run-"));
  const file = path.join(dir, "document.md");
  const operations = path.join(dir, "operations.json");
  const original = Buffer.from(nativeSource("# Report\r\n\r\nSee [missing](#missing). ✓\r\n"));
  try {
    writeFileSync(operations, JSON.stringify([
      { command: "insert-block", at: "end", text: "Preview" },
      { command: "insert-figure", at: "end", label: "pending" },
    ]));
    for (const invocation of [
      ["apply-batch", file, "--operations", operations],
      ["insert-figure", file, "--at", "end", "--label", "pending"],
      ["format", file],
    ]) {
      writeFileSync(file, original);
      const args = [...invocation, "--if-revision", textRevision(original.toString("utf8"))];
      // Catch transient writes too: a final directory listing alone would miss a cleaned-up sibling.
      const mutations = ["writeFileSync", "renameSync", "chmodSync", "rmSync"] as const;
      const mocks = mutations.map(name => t.mock.method(fs, name, () => { throw new Error(`unexpected ${name}`); }));
      let json;
      let text;
      try {
        json = run([...args, "--format", "json", "--dry-run"]);
        text = run([...args, "--dry-run"]);
        for (const mock of mocks) assert.equal(mock.mock.callCount(), 0);
      } finally { for (const mock of mocks) mock.mock.restore(); }
      assert.equal(json.status, 0, json.stderr);
      assert.equal(json.stderr, "");
      assert.equal(text.status, 0, text.stderr);
      assert.deepEqual(readFileSync(file), original);
      assert.deepEqual(readdirSync(dir).sort(), ["document.md", "operations.json"]);
      const { command, dryRun, revision, markdown, applied, originalWarnings, ...diagnostics } = JSON.parse(json.stdout);
      assert.equal(command, invocation[0]);
      assert.equal(dryRun, true);
      assert.deepEqual(originalWarnings, []);
      assert.equal(typeof markdown, "string");
      assert.equal(revision, textRevision(markdown));
      assert.equal(applied, command === "apply-batch" ? 2 : undefined);
      assert.equal(run(args).status, 0);
      assert.equal(readFileSync(file, "utf8"), markdown, "preview is exactly what the real run writes");
      const { command: checkCommand, ...checked } = JSON.parse(run(["check", file, "--format", "json"]).stdout);
      assert.equal(checkCommand, "check");
      assert.deepEqual(diagnostics, checked);
      assert.notDeepEqual(checked.references.unresolved, [], "check warnings remain visible");
      if (command !== "format") assert.notDeepEqual(checked.readiness.pendingFigures, []);
      const checkText = run(["check", file]);
      assert.equal(text.stdout, `dry run; nothing was written\nrevision: ${revision}\n${checkText.stdout}--- markdown ---\n${markdown}`);
      assert.equal(text.stderr, checkText.stderr);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("single dry runs preserve failure messages and reject unsupported or ambiguous preview options", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-dry-failure-"));
  const file = path.join(dir, "document.md");
  const original = Buffer.from(nativeSource("Original.\r\n"));
  try {
    writeFileSync(file, original);
    for (const args of [
      ["format", file, "--if-revision", "0".repeat(64)],
      ["update-heading", file, "--path", "999", "--text", "Missing"],
      ["insert-block", file, "--at", "end", "--text", "A\n\nB"],
    ]) {
      const real = run(args);
      assert.equal(real.status, 1, real.stderr);
      for (const format of ["text", "json"]) {
        assert.deepEqual(run([...args, "--dry-run", "--format", format]), real);
      }
    }
    for (const args of [
      ["format", file, "--dry-run", "--dry-run"],
      ["format", file, "--dry-run", "true"],
      ["format", file, "--dry-run", "--format", "yaml"],
      ...["create", "check", "inspect"].map(command => [command, file, "--dry-run"]),
    ]) assert.equal(run(args).status, 1, args.join(" "));
    assert.deepEqual(readFileSync(file), original);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("apply-batch matches sequential file bytes across canonical endnote and path changes and reports the committed revision", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-batch-"));
  const file = path.join(dir, "batch.md");
  const single = path.join(dir, "single.md");
  const operationsFile = path.join(dir, "operations.json");
  const source = nativeSource("# Report\r\n\r\n## Method\r\n\r\nClaim[^a].\r\n\r\n[^a]: Evidence.\r\n\r\n## Results\r\n\r\nMeasured values.\r\n");
  const content = [{ kind: "strong", children: [{ kind: "text", text: "Draft" }] }];
  const operations = [
    { command: "insert-heading", at: 2, level: 2, content },
    // First write places the endnote last: Results is now path 5, not the original path 6.
    { command: "update-heading", path: "5", text: "Verified results" },
    { command: "move-block", from: 5, to: 2 },
    { command: "remove-block", at: 3 },
  ];
  try {
    writeFileSync(file, source);
    writeFileSync(single, source);
    writeFileSync(operationsFile, JSON.stringify(operations));
    for (const args of [
      ["insert-heading", "--at", "2", "--level", "2", "--content", JSON.stringify(content)],
      ["update-heading", "--path", "5", "--text", "Verified results"],
      ["move-block", "--from", "5", "--to", "2"],
      ["remove-block", "--at", "3"],
    ]) {
      const result = run([args[0], single, ...args.slice(1)]);
      assert.deepEqual(result, { status: 0, stdout: "", stderr: "" });
    }
    const result = run(["apply-batch", file, "--operations", operationsFile,
      "--if-revision", textRevision(source), "--format", "json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const saved = readFileSync(file);
    assert.deepEqual(saved, readFileSync(single));
    assert.match(saved.toString("utf8"), /# Report\n\n## Verified results\n\n## Method/);
    assert.equal(result.stdout, `${JSON.stringify({ ok: true, command: "apply-batch", applied: operations.length,
      revision: textRevision(saved.toString("utf8")) })}\n`);
    writeFileSync(operationsFile, JSON.stringify([{ command: "format" }]));
    assert.deepEqual(run(["apply-batch", file, "--operations", operationsFile]), { status: 0, stdout: "", stderr: "" });
    assert.deepEqual(readFileSync(file), saved);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("apply-batch stdin matches file bytes and output, including UTF-8 BOM and dry run", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-batch-stdin-"));
  const file = path.join(dir, "document.md");
  const operationsFile = path.join(dir, "operations.json");
  const original = Buffer.from(nativeSource("# Report\r\n\r\nOriginal.\r\n"));
  const input = JSON.stringify([
    { command: "insert-heading", at: "end", level: 2, text: "한글 😀 �" },
    { command: "insert-block", at: "end", text: "파이프 입력" },
  ]);
  try {
    writeFileSync(operationsFile, input);
    for (const dryRun of [false, true]) {
      const flags = ["--if-revision", textRevision(original.toString("utf8")), "--format", "json",
        ...(dryRun ? ["--dry-run"] : [])];
      writeFileSync(file, original);
      const expected = run(["apply-batch", file, "--operations", operationsFile, ...flags]);
      assert.equal(expected.status, 0, expected.stderr);
      const saved = readFileSync(file);
      if (dryRun) assert.deepEqual(saved, original);
      else assert.match(saved.toString("utf8"), /한글 😀 �\n\n파이프 입력/);
      for (const stdin of [input, "\uFEFF" + input]) {
        writeFileSync(file, original);
        const result = runProcess(["apply-batch", file, "--operations", "-", ...flags], [], undefined, stdin);
        assert.ifError(result.error);
        assert.deepEqual({ status: result.status, stdout: result.stdout, stderr: result.stderr }, expected);
        assert.deepEqual(readFileSync(file), saved);
      }
    }
    // BOM tolerance belongs to stdin only; a file still follows JSON.parse's BOM refusal.
    writeFileSync(operationsFile, "\uFEFF" + input);
    assert.equal(run(["apply-batch", file, "--operations", operationsFile]).status, 1);
    assert.deepEqual(readFileSync(file), original);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("apply-batch stdin refuses malformed input and stale revisions without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-batch-stdin-failure-"));
  const file = path.join(dir, "document.md");
  const original = Buffer.from(nativeSource("# Report\r\n\r\nOriginal ✓\r\n"));
  const valid = JSON.stringify([{ command: "insert-block", at: "end", text: "Added" }]);
  try {
    writeFileSync(file, original);
    for (const { input, flags = [], message } of [
      { input: Buffer.from([0xff]), message: /Invalid UTF-8/ },
      { input: "", message: /Unexpected end of JSON input/ },
      { input: "[{", message: /JSON/ },
      { input: "\uFEFF\uFEFF" + valid, message: /JSON/ },
      { input: "[]", message: /non-empty JSON array/ },
      { input: JSON.stringify([{ command: "insert-block", at: "end", text: "Added" },
        { command: "remove-block", at: 999 }]), message: /operation 2 .*nothing was written/ },
      { input: valid, flags: ["--if-revision", "0".repeat(64)], message: /revision mismatch/ },
    ]) {
      for (const dryRun of [false, true]) {
        const result = runProcess(["apply-batch", file, "--operations", "-", "--format", "json",
          ...flags, ...(dryRun ? ["--dry-run"] : [])], [], undefined, input);
        assert.ifError(result.error);
        assert.equal(result.status, 1);
        assert.equal(result.stdout, "");
        assert.match(result.stderr, message);
        assert.deepEqual(readFileSync(file), original);
      }
    }
    assert.deepEqual(readdirSync(dir), ["document.md"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("apply-batch preserves original bytes for step errors, invalid input and stale revisions", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-batch-failure-"));
  const file = path.join(dir, "document.md");
  const operationsFile = path.join(dir, "operations.json");
  const original = Buffer.from(nativeSource("# Report\r\n\r\nOriginal ✓\r\n"));
  const first = { command: "insert-heading", at: 2, level: 2, text: "Draft" };
  try {
    writeFileSync(file, original);
    for (const [operations, message] of [
      [[first, { command: "update-heading", path: "999", text: "Missing" }], /^operation 2 \(update-heading\): /],
      [[first, { command: "insert-heading", at: 3, text: "Missing level" }], /^operation 2 \(insert-heading\): missing --level/],
      [[first, { command: "insert-block", at: 3, text: "A\n\nB" }], /^operation 2 \(insert-block\): .*round-trip/],
      [[first, { command: "format", "if-revision": textRevision(original.toString("utf8")) }], /^operation 2 \(format\): unknown option: --if-revision/],
      ...["dry-run", "format"].map(option => [
        [{ command: "format", [option]: true }], new RegExp(`^operation 1 \\(format\\): unknown option: --${option}`),
      ]),
      [[{ command: "format", typo: true }], /^operation 1 \(format\): unknown option: --typo/],
      ...["create", "check", "inspect", "serve", "apply-batch"].map(command => [
        [{ command }], new RegExp(`^operation 1 \\(${command}\\): not a document edit command: ${command}`),
      ]),
      [[first, null], /^operation 2 \(<unknown>\): operation must be an object/],
      [[first, { command: { toString: null } }], /^operation 2 \(<unknown>\): command must be a string/],
      [[first, { command: "insert-figure", at: 2, label: null }], /^operation 2 \(insert-figure\): --label must be a string, number or boolean/],
      [[], /non-empty JSON array/],
      [{ command: "format" }, /non-empty JSON array/],
    ] as [unknown, RegExp][]) {
      writeFileSync(operationsFile, JSON.stringify(operations));
      const failed = run(["apply-batch", file, "--operations", operationsFile, "--format", "json"]);
      assert.equal(failed.status, 1, failed.stderr);
      assert.equal(failed.stdout, "");
      assert.deepEqual(run(["apply-batch", file, "--operations", operationsFile, "--format", "json", "--dry-run"]), failed);
      assert.match(failed.stderr, message);
      if (Array.isArray(operations) && operations.length > 0) assert.match(failed.stderr, /; nothing was written\n$/);
      else assert.doesNotMatch(failed.stderr, /^operation /);
      assert.deepEqual(readFileSync(file), original);
    }
    writeFileSync(operationsFile, "[{");
    const malformed = run(["apply-batch", file, "--operations", operationsFile]);
    assert.equal(malformed.status, 1);
    assert.notEqual(malformed.stderr, "");
    assert.deepEqual(run(["apply-batch", file, "--operations", operationsFile, "--dry-run"]), malformed);
    assert.doesNotMatch(malformed.stderr, /^operation /);
    writeFileSync(operationsFile, JSON.stringify([{ command: "update-heading", path: "999", text: "Invalid path" }]));
    const stale = run(["apply-batch", file, "--operations", operationsFile, "--if-revision", "0".repeat(64)]);
    assert.equal(stale.status, 1);
    assert.equal(stale.stderr, "revision mismatch; run inspect again; nothing was written\n");
    assert.deepEqual(run(["apply-batch", file, "--operations", operationsFile, "--if-revision", "0".repeat(64), "--dry-run"]), stale);
    assert.deepEqual(readFileSync(file), original);
    const invalid = path.join(dir, "invalid.md");
    for (const source of [undefined, "# Missing native marker\n"]) {
      if (source !== undefined) writeFileSync(invalid, source);
      const batch = run(["apply-batch", invalid, "--operations", operationsFile]);
      assert.equal(batch.status, 1);
      assert.equal(batch.stderr, run(["format", invalid]).stderr);
      assert.deepEqual(run(["apply-batch", invalid, "--operations", operationsFile, "--dry-run"]), batch);
      assert.doesNotMatch(batch.stderr, /^operation /);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI can check and modify a real file through Core", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-"));
  const file = path.join(dir, "document.md");
  copyFileSync(fixture, file);
  const original = readFileSync(file, "utf8");

  try {
    const checked = run(["check", file]);
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /^structure valid\n/);
    const expectedLines = inspectDocument(parse(original)).map((block) => {
      const kind = block.kind ? `:${block.kind}` : "";
      return `${block.index} ${block.type}${kind}`;
    });
    for (const line of expectedLines) {
      assert.equal(checked.stdout.includes(line), true);
    }

    assert.equal(run(["replace-text", file, "--from", FROM, "--to", TO]).status, 0);
    assert.equal(run(["insert-block", file, "--at", "2", "--text", INSERTED]).status, 0);
    assert.equal(run(["move-block", file, "--from", "4", "--to", "2"]).status, 0);
    assert.equal(run(["remove-block", file, "--at", "5"]).status, 0);
    assert.equal(run(["format", file]).status, 0);

    const after = run(["check", file]);
    assert.equal(after.status, 0, after.stderr);
    assert.match(after.stdout, /^structure valid\n/);

    const saved = readFileSync(file, "utf8");
    const expected = corePipeline(original);
    assert.equal(saved, expected);
    assert.equal(serialize(parse(saved)), saved);
    assert.equal(original.includes(FROM), true);
    assert.equal(saved.includes(TO), true);
    assert.equal(saved.includes(INSERTED), true);
    assert.equal(saved.includes("phase current"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--version prints one build identity line and rejects every combination before document I/O", () => {
  assert.equal(versionText({ version: "0.0.0", desktop: false, commit: "123456abcdef" }), "ieumdoc 0.0.0 (123456abcdef)\n");
  assert.equal(versionText({ version: "0.1.0-beta.1", desktop: true, commit: "123456abcdef" }), "ieumdoc 0.1.0-beta.1 (desktop, 123456abcdef)\n");
  assert.equal(versionText({ version: "0.0.0", desktop: false, commit: "unknown" }), "ieumdoc 0.0.0 (unknown)\n");
  const version = run(["--version"]);
  assert.equal(version.status, 0);
  assert.equal(version.stdout, "ieumdoc development (unknown)\n");
  assert.equal(version.stderr, "");
  for (const args of [["--version", "check"], ["--version", "--help"], ["--help", "--version"],
    ["help", "--version"], ["--version", "--version"], ["check", "missing.md", "--version"], ["serve", "--version"]]) {
    const result = runProcess(args);
    assert.equal(result.status, 1, args.join(" "));
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /--version must be used alone/);
  }
});

test("ieumdoc help exits successfully", () => {
  for (const args of [[], ["help"], ["--help"], ["-h"]] as const) {
    const result = runProcess([...args]);
    if (args.length === 0) {
      assert.equal(result.status, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /IeumDoc CLI/);
    } else {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, "");
      assert.match(result.stdout, /IeumDoc CLI/);
    }
    const help = args.length === 0 ? result.stderr : result.stdout;
    const expectedGroups: Record<string, string[]> = {
      "Create and inspect": ["create", "inspect", "docling"],
      "Check": ["check"],
      "Edit — batch": ["apply-batch"],
      "Edit — insert blocks": ["insert-block", "insert-heading", "insert-admonition", "insert-quote", "insert-divider", "insert-equation", "insert-figure", "insert-list", "insert-code-block"],
      "Edit — text and content": ["insert-hard-break", "replace-text", "update-heading", "update-admonition-variant", "update-quote", "update-figure", "update-media-references", "update-list", "update-code-block", "update-node-text", "update-equation-latex"],
      "Edit — structure": ["split-paragraph", "merge-paragraph", "update-heading-level", "convert-block", "remove-block", "move-block", "move-section", "remove-section"],
      "Edit — tables": ["insert-table", "insert-table-row", "insert-table-column", "remove-table-row", "remove-table-column", "move-table-row", "move-table-column", "update-table-alignment", "update-table-caption", "update-table-cell"],
      "Edit — labels, footnotes and numbering": ["insert-citation", "insert-footnote", "insert-target", "remove-citation", "remove-footnote", "update-bibliography", "update-citation", "update-enumerator", "update-footnote", "update-heading-numbering", "update-label", "update-reference-templates", "update-title"],
      "Format": ["format"],
      "Serve": ["module", "serve"],
    };
    const expectedCommands = Object.values(expectedGroups).flat();
    const listed: string[] = [];
    let currentGroup = "";
    const actualGroups: Record<string, string[]> = {};
    const commandsStart = help.indexOf("Commands:");
    assert.notEqual(commandsStart, -1);
    for (const line of help.slice(commandsStart + "Commands:".length).split("\n")) {
      const row = line.trim();
      if (!row) continue;
      if (row.endsWith(":")) {
        const heading = row.slice(0, -1);
        assert.equal(Object.hasOwn(actualGroups, heading), false, `duplicate group: ${heading}`);
        currentGroup = heading;
        actualGroups[currentGroup] = [];
      } else {
        const command = row.split(/\s+/)[0];
        assert.ok(currentGroup, `ungrouped command: ${command}`);
        listed.push(command);
        actualGroups[currentGroup].push(command);
      }
    }
    assert.deepEqual(Object.keys(actualGroups).sort(), Object.keys(expectedGroups).sort());
    for (const group of Object.keys(expectedGroups)) {
      assert.deepEqual(actualGroups[group]?.sort(), expectedGroups[group].sort(), group);
    }
    assert.equal(new Set(listed).size, listed.length, "every command appears exactly once");
    assert.deepEqual(listed.sort(), expectedCommands.sort(), "all expected commands remain visible");
    const guidance = help.replace(/\s+/g, " ");
    assert.ok(help.indexOf("Start here:") < help.indexOf("Commands:"));
    assert.match(guidance, /inspect <file> --format json.*current paths and revision/);
    assert.match(guidance, /One edit:.*command below.*Multiple edits:.*apply-batch/);
    assert.match(guidance, /--if-revision.*--dry-run/);
    assert.match(guidance, /Batch paths.*preceding step's result.*not tracked automatically/);
    assert.match(help, /ieumdoc help <command>/);
  }
});

test("command help is available from help and --help", () => {
  const fromHelp = run(["help", "check"]);
  const fromFlag = run(["check", "--help"]);
  const fromShort = run(["check", "-h"]);
  assert.equal(fromHelp.status, 0, fromHelp.stderr);
  assert.equal(fromFlag.status, 0, fromFlag.stderr);
  assert.equal(fromShort.status, 0, fromShort.stderr);
  assert.equal(fromHelp.stdout, fromFlag.stdout);
  assert.equal(fromHelp.stdout, fromShort.stdout);
  assert.match(fromHelp.stdout, /ieumdoc check <file>/);
  assert.match(fromHelp.stdout, /optional error\.code from Core/);
  assert.match(fromHelp.stdout, /unclassified errors may omit the code/);

  const update = run(["help", "update-node-text"]);
  assert.equal(update.status, 0, update.stderr);
  assert.match(update.stdout, /ieumdoc update-node-text <file> --path <indexes> --from <text> --to <text>/);
  assert.match(update.stdout, /ieumdoc inspect <file>/);
  assert.match(update.stdout, /current document snapshot/);
  assert.equal(run(["update-node-text", "--help"]).stdout, update.stdout);

  const guidance: Record<string, RegExp[]> = {
    "replace-text": [/first matching paragraph or heading.*rendered text/, /not throughout the document/,
      /all matches.*individual text nodes/, /crossing formatting\/text-node boundaries.*unchanged.*exiting 0/,
      /Use update-node-text instead when/, /it also substitutes within individual text nodes/,
      /whole block.*structured --content.*update-heading or update-quote/,
      /paragraph.*apply-batch.*insert-block --content.*first.*then remove-block/i,
      /Intermediate steps.*ordinary write checks.*footnote cleanup.*batch completion.*--dry-run/],
    "update-heading": [/entire.*content.*Heading/i, /Use update-node-text instead when/],
    "update-quote": [/entire.*content.*Quote/i, /Use update-node-text instead when/],
    "update-node-text": [/Substitute text at a known Core NodePath/, /Use update-heading or update-quote instead when replacing the entire/],
    "move-block": [/one top-level block only/, /Use move-section instead when.*heading with its content and subsections/],
    "remove-block": [/one top-level block only/, /Use remove-section instead when.*heading with its content and subsections/],
    "move-section": [/heading.*content and (?:deeper sections|subsections)/i, /Use move-block instead when.*one top-level block/],
    "remove-section": [/heading.*content and (?:deeper sections|subsections)/i, /Use remove-block instead when.*one top-level block/],
  };
  for (const [command, patterns] of Object.entries(guidance)) {
    const help = run(["help", command]);
    assert.equal(help.status, 0, help.stderr);
    for (const pattern of patterns) assert.match(help.stdout.replace(/\s+/g, " "), pattern, command);
    assert.equal(run([command, "--help"]).stdout, help.stdout);
  }

  const equation = run(["help", "update-equation-latex"]);
  assert.equal(equation.status, 0, equation.stderr);
  assert.match(equation.stdout, /ieumdoc update-equation-latex <file>/);
  assert.equal(run(["update-equation-latex", "--help"]).stdout, equation.stdout);

  const insert = run(["help", "insert-block"]);
  assert.match(insert.stdout, /The current implementation inserts a Paragraph block only/);
  for (const command of ["insert-block", "move-block", "remove-block", "update-node-text", "move-section", "remove-section", "apply-batch"]) {
    assert.match(run(["help", command]).stdout, /body blocks start at 1/);
  }
  assert.equal(run(["insert-block", "-h"]).stdout, insert.stdout);

  for (const command of ["format", "update-heading", "insert-block"]) {
    const help = run(["help", command]);
    assert.match(help.stdout, /\[--if-revision <revision>\]/);
    assert.match(help.stdout, /run inspect again.*new revision and paths/);
    assert.match(help.stdout, /do not print a new revision/);
    assert.match(help.stdout, /--dry-run/);
    assert.match(help.stdout, /canonical Markdown/);
  }
  assert.match(run(["help", "inspect"]).stdout, /revision.*original UTF-8 text/);
  assert.match(run(["help", "inspect"]).stdout, /Metadata is not listed. Block 0 is the document metadata; body blocks start at 1/);
  assert.doesNotMatch(run(["help", "create"]).stdout, /--if-revision/);
  const batch = run(["help", "apply-batch"]);
  assert.equal(batch.status, 0);
  assert.equal(run(["apply-batch", "--help"]).stdout, batch.stdout);
  assert.match(batch.stdout, /preceding step's canonical placement snapshot; no automatic tracking/);
  assert.match(batch.stdout, /Footnote cleanup waits for the completed batch/);
  assert.match(batch.stdout, /operation <1-based index>/);
  assert.match(batch.stdout, /objects\/arrays/);
  assert.match(batch.stdout, /stdin with -/);
  assert.match(batch.stdout, /cat operations.json \| ieumdoc apply-batch document.md --operations -/);
});

test("CLI insert-heading persists a Core heading", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-heading-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("Intro\n"));
  try {
    const result = run(["insert-heading", file, "--at", "2", "--level", "2", "--text", "Details"]);
    assert.equal(result.status, 0, result.stderr);
    const saved = readFileSync(file, "utf8");
    const blocks = getEditableDocument(parse(saved)).blocks;
    assert.deepEqual(blocks.map((block) => block.block), ["paragraph", "heading"]);
    assert.deepEqual(blocks[1], {
      block: "heading",
      path: [2],
      level: 2,
      text: "Details",
      content: [{ kind: "text", text: "Details" }],
      editable: true,
    });
    assert.equal(saved, serialize(parse(saved)));
    assert.equal(run(["insert-heading", file, "--at", "1", "--level", "7", "--text", "Invalid"]).status, 1);
    assert.equal(readFileSync(file, "utf8"), saved);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI inserts admonitions, changes their kind and rejects unsafe requests without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-admonition-authoring-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("Intro paragraph.\n\n## Stable heading\n\nKeep this paragraph.\n"));
  try {
    const warning = run([
      "insert-admonition", file, "--at", "2", "--variant", "warning", "--text", "Check current limit.",
    ]);
    assert.equal(warning.status, 0, warning.stderr);
    const note = run([
      "insert-admonition", file, "--at", "3", "--variant", "note", "--text", "Confirm the result.",
    ]);
    assert.equal(note.status, 0, note.stderr);

    const saved = readFileSync(file, "utf8");
    assert.equal(saved, nativeSource([
      "Intro paragraph.",
      "",
      ":::{warning}",
      "Check current limit.",
      ":::",
      "",
      ":::{note}",
      "Confirm the result.",
      ":::",
      "",
      "## Stable heading",
      "",
      "Keep this paragraph.",
      "",
    ].join("\n")));
    const blocks = getEditableDocument(parse(saved)).blocks;
    assert.deepEqual(blocks.filter((block) => block.block === "admonition").map((block) =>
      block.block === "admonition" ? [block.variant, block.content] : []), [
      ["warning", [{ kind: "text", text: "Check current limit." }]],
      ["note", [{ kind: "text", text: "Confirm the result." }]],
    ]);
    assert.equal(serialize(parse(saved)), saved);
    const checked = run(["check", file]);
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /^structure valid\n/);

    const changed = run(["update-admonition-variant", file, "--path", "2", "--variant", "caution"]);
    assert.equal(changed.status, 0, changed.stderr);
    assert.equal(readFileSync(file, "utf8"), saved.replace(":::{warning}", ":::{caution}"));

    const unchanged = readFileSync(file);
    for (const args of [
      ["insert-admonition", file, "--at", "2", "--variant", "admonition", "--text", "Invalid variant."],
      ["insert-admonition", file, "--at", "100", "--variant", "note", "--text", "Invalid index."],
      ["update-admonition-variant", file, "--path", "2", "--variant", "caution"],
      ["update-admonition-variant", file, "--path", "1", "--variant", "tip"],
    ]) {
      const failed = run(args);
      assert.equal(failed.status, 1, `${args.join(" ")}\n${failed.stderr}`);
      assert.deepEqual(readFileSync(file), unchanged, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI inserts and edits quotes and dividers in a real file and rejects unsafe requests without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-quote-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("# Title\n\nAfter.\n"));
  try {
    for (const args of [
      ["insert-quote", file, "--at", "2", "--text", "Quoted."],
      ["insert-divider", file, "--at", "3"],
      ["update-quote", file, "--path", "2", "--content", JSON.stringify([{ kind: "delete", children: [{ kind: "text", text: "Old" }] }, { kind: "text", text: " new." }])],
    ]) {
      const result = run(args);
      assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
    }
    const saved = readFileSync(file, "utf8");
    const blocks = getEditableDocument(parse(saved)).blocks;
    assert.deepEqual(blocks.map((block) => block.block), ["heading", "quote", "divider", "paragraph"]);
    assert.deepEqual(blocks[1]?.block === "quote" && blocks[1].content,
      [{ kind: "delete", children: [{ kind: "text", text: "Old" }] }, { kind: "text", text: " new." }]);
    assert.match(run(["inspect", file]).stdout, /^2 quote inlineEditable=true .*\n3 divider$/m);

    const unchanged = readFileSync(file);
    for (const args of [
      ["insert-quote", file, "--at", "2", "--text", "Both", "--content", "[]"],
      ["update-quote", file, "--path", "4", "--text", "Not a quote."],
      ["insert-divider", file, "--at", "10"],
    ]) {
      const failed = run(args);
      assert.equal(failed.status, 1, `${args.join(" ")}\n${failed.stderr}`);
      assert.deepEqual(readFileSync(file), unchanged, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI inserts footnotes and edits their definitions in a real file and rejects unsafe requests without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-footnote-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("# Title\n\nA claim.\n"));
  try {
    for (const args of [
      ["insert-footnote", file, "--path", "2", "--offset", "7", "--text", "Source."],
      ["update-footnote", file, "--path", "3", "--content", JSON.stringify([{ kind: "text", text: "See " }, { kind: "math", value: "x" }, { kind: "text", text: "." }])],
    ]) {
      const result = run(args);
      assert.equal(result.status, 0, `${args.join(" ")}\n${result.stderr}`);
    }
    assert.equal(readFileSync(file, "utf8"), nativeSource("# Title\n\nA claim[^1].\n\n[^1]: See $x$.\n"));
    assert.match(run(["inspect", file]).stdout, /^3 footnote label="1" inlineEditable=true text="See \$x\$\."$/m);

    const unchanged = readFileSync(file);
    for (const args of [
      ["insert-footnote", file, "--path", "2", "--offset", "99", "--text", "x"],
      ["insert-footnote", file, "--path", "3", "--offset", "0", "--text", "x"],
      ["insert-footnote", file, "--path", "2", "--offset", "0", "--text", " "],
      ["update-footnote", file, "--path", "2", "--text", "Not a definition."],
      ["update-footnote", file, "--path", "3", "--content", JSON.stringify([{ kind: "footnote", label: "1" }])],
    ]) {
      const failed = run(args);
      assert.equal(failed.status, 1, `${args.join(" ")}\n${failed.stderr}`);
      assert.deepEqual(readFileSync(file), unchanged, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI writes endnotes after the body as Core and Editor Save do, and leaves refused documents intact", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-endnotes-"));
  const file = path.join(dir, "document.md");
  const scattered = nativeSource("# Document\n\n## Section A\n\nFirst claim[^b] and another[^a].\n\n[^a]: Second note.\n\n" +
    "## Section B\n\nAnother paragraph[^b].\n\n[^b]: First note.\n");
  const placed = nativeSource("# Document\n\n## Section A\n\nFirst claim[^b] and another[^a].\n\n## Section B\n\nAnother paragraph[^b].\n\n" +
    "[^b]: First note.\n\n[^a]: Second note.\n");
  try {
    writeFileSync(file, scattered);
    const checked = run(["check", file]);
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stderr, /^note: format and Save move footnote definitions after the body/m);
    assert.deepEqual(JSON.parse(run(["check", file, "--format", "json"]).stdout).endnotes, { inPlace: false });
    // check only reads; format writes what Core's canonical write gives, and again gives the same.
    assert.equal(readFileSync(file, "utf8"), scattered);
    assert.equal(run(["format", file]).status, 0);
    assert.equal(readFileSync(file, "utf8"), placed);
    assert.equal(serialize(parse(scattered)), placed);
    assert.equal(run(["format", file]).status, 0);
    assert.equal(readFileSync(file, "utf8"), placed);
    assert.deepEqual(JSON.parse(run(["check", file, "--format", "json"]).stdout).endnotes, { inPlace: true });

    // Sections hold no endnotes: 0 # Document, 1 ## A, 2 claims, 3 ## B, 4 another, 5 [^b], 6 [^a].
    assert.equal(run(["move-section", file, "--from", "2", "--to", "8"]).status, 0);
    const moved = nativeSource("# Document\n\n## Section B\n\nAnother paragraph[^b].\n\n## Section A\n\nFirst claim[^b] and another[^a].\n\n" +
      "[^b]: First note.\n\n[^a]: Second note.\n");
    assert.equal(readFileSync(file, "utf8"), moved);
    const orphaning = run(["remove-section", file, "--at", "4"]);
    assert.equal(orphaning.status, 0, orphaning.stderr);
    assert.equal(readFileSync(file, "utf8"), nativeSource("# Document\n\n## Section B\n\nAnother paragraph[^b].\n\n[^b]: First note.\n"));
    writeFileSync(file, moved);
    assert.equal(run(["remove-section", file, "--at", "2"]).status, 0);
    assert.equal(readFileSync(file, "utf8"), nativeSource("# Document\n\n## Section A\n\nFirst claim[^b] and another[^a].\n\n[^b]: First note.\n\n[^a]: Second note.\n"));

    const invalid = nativeSource("Claim[^a].\n\n[^orphan]: Preserve me.\n\nBody.\n\n[^a]: Kept.\n");
    writeFileSync(file, invalid);
    assert.equal(run(["format", file]).status, 1);
    assert.equal(readFileSync(file, "utf8"), invalid);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI footnote deletion and batch completion retain definitions across a temporary last-reference removal", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-endnote-lifecycle-"));
  const file = path.join(dir, "document.md"), operations = path.join(dir, "operations.json");
  const original = nativeSource("## From[^a]\n\n## To\n\n[^a]: **Keep** $x$.\n");
  try {
    writeFileSync(file, original);
    writeFileSync(operations, JSON.stringify([
      { command: "update-heading", path: "1", text: "From" },
      { command: "update-heading", path: "2", content: [{ kind: "text", text: "To" }, { kind: "footnote", label: "a" }] },
    ]));
    const moved = run(["apply-batch", file, "--operations", operations]);
    assert.equal(moved.status, 0, moved.stderr);
    assert.equal(readFileSync(file, "utf8"), nativeSource("## From\n\n## To[^a]\n\n[^a]: **Keep** $x$.\n"));
    const preserved = readFileSync(file);
    assert.equal(run(["remove-footnote", file, "--path", "1"]).status, 1);
    assert.deepEqual(readFileSync(file), preserved);
    const removed = run(["remove-footnote", file, "--path", "3"]);
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(readFileSync(file, "utf8"), nativeSource("## From\n\n## To\n"));
    writeFileSync(file, original);
    const last = run(["update-heading", file, "--path", "1", "--text", "From"]);
    assert.equal(last.status, 0, last.stderr);
    assert.equal(readFileSync(file, "utf8"), nativeSource("## From\n\n## To\n"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI writes formatted headings and rejects line breaks without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-heading-content-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("## See {ref}`intro`\n\nIntro.\n"));
  try {
    const bold = JSON.stringify([{ kind: "text", text: "Limits of " }, { kind: "strong", children: [{ kind: "text", text: "current" }] }]);
    const inserted = run(["insert-heading", file, "--at", "3", "--level", "2", "--content", bold]);
    assert.equal(inserted.status, 0, inserted.stderr);
    const updated = run(["update-heading", file, "--path", "3", "--content",
      JSON.stringify([{ kind: "emphasis", children: [{ kind: "text", text: "Revised" }] }, { kind: "text", text: " limits" }])]);
    assert.equal(updated.status, 0, updated.stderr);
    assert.match(readFileSync(file, "utf8"), /^## \*Revised\* limits$/m);

    const unchanged = readFileSync(file);
    for (const args of [
      ["update-heading", file, "--path", "3", "--content", JSON.stringify([{ kind: "text", text: "A" }, { kind: "break" }])],
      ["update-heading", file, "--path", "3", "--text", "A", "--content", "[]"],
    ]) {
      const failed = run(args);
      assert.equal(failed.status, 1, `${args.join(" ")}\n${failed.stderr}`);
      assert.deepEqual(readFileSync(file), unchanged, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI updates a real H2 file to H5 and rejects unsafe heading requests without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-heading-level-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("Intro paragraph.\n\n## Stable heading\n\nKeep this paragraph.\n"));
  try {
    const result = run(["update-heading-level", file, "--path", "2", "--from", "2", "--to", "5"]);
    assert.equal(result.status, 0, result.stderr);
    const saved = readFileSync(file, "utf8");
    assert.equal(saved, nativeSource("Intro paragraph.\n\n##### Stable heading\n\nKeep this paragraph.\n"));
    const blocks = getEditableDocument(parse(saved)).blocks;
    assert.deepEqual(blocks.map((block) => block.block), ["paragraph", "heading", "paragraph"]);
    assert.deepEqual(blocks[1], {
      block: "heading", path: [2], level: 5, text: "Stable heading", content: [{ kind: "text", text: "Stable heading" }], editable: true,
    });
    assert.deepEqual(blocks[2], {
      block: "paragraph", path: [3], text: "Keep this paragraph.",
      content: [{ kind: "text", text: "Keep this paragraph." }], editable: true,
    });
    assert.equal(serialize(parse(saved)), saved);
    const checked = run(["check", file]);
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /^structure valid\n/);

    const unchanged = readFileSync(file);
    for (const args of [
      ["update-heading-level", file, "--path", "2", "--from", "2", "--to", "0"],
      ["update-heading-level", file, "--path", "2", "--from", "2", "--to", "7"],
      ["update-heading-level", file, "--path", "2", "--from", "2", "--to", "4"],
      ["update-heading-level", file, "--path", "1", "--from", "1", "--to", "4"],
    ]) {
      const failed = run(args);
      assert.equal(failed.status, 1, `${args.join(" ")}\n${failed.stderr}`);
      assert.deepEqual(readFileSync(file), unchanged, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI converts a Paragraph to a Heading and back, rejecting invalid requests without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-convert-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("# Title\n\nPromote **this** text.\n\nFirst\\\nsecond.\n"));
  try {
    const promoted = run(["convert-block", file, "--path", "2", "--to", "heading", "--level", "2"]);
    assert.equal(promoted.status, 0, promoted.stderr);
    const heading = getEditableDocument(parse(readFileSync(file, "utf8"))).blocks[1];
    assert.equal(heading?.block === "heading" && heading.level, 2);

    const demoted = run(["convert-block", file, "--path", "2", "--to", "paragraph"]);
    assert.equal(demoted.status, 0, demoted.stderr);
    const saved = readFileSync(file, "utf8");
    assert.equal(saved, nativeSource("# Title\n\nPromote **this** text.\n\nFirst\\\nsecond.\n"));

    const unchanged = readFileSync(file);
    for (const args of [
      ["convert-block", file, "--path", "3", "--to", "heading", "--level", "2"],
      ["convert-block", file, "--path", "2", "--to", "heading"],
      ["convert-block", file, "--path", "1", "--to", "paragraph", "--level", "2"],
      ["convert-block", file, "--path", "1", "--to", "list"],
    ]) {
      const failed = run(args);
      assert.equal(failed.status, 1, `${args.join(" ")}\n${failed.stderr}`);
      assert.deepEqual(readFileSync(file), unchanged, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI insert-equation persists a Core equation", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-equation-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("Intro\n"));
  try {
    const result = run(["insert-equation", file, "--at", "2", "--latex", "x^2 + 1"]);
    assert.equal(result.status, 0, result.stderr);
    const saved = readFileSync(file, "utf8");
    const blocks = getEditableDocument(parse(saved)).blocks;
    assert.deepEqual(blocks.map((block) => block.block), ["paragraph", "equation"]);
    assert.deepEqual(blocks[1], {
      block: "equation",
      path: [2],
      latex: "x^2 + 1",
      label: "",
    });
    assert.equal(saved, serialize(parse(saved)));
    assert.equal(run(["insert-equation", file, "--at", "1", "--latex", ""]).status, 0);
    assert.equal(readFileSync(file, "utf8"), nativeSource("$$\n$$\n\nIntro\n\n```{math}\nx^2 + 1\n```\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI inserts equation labels and table captions/labels with one file write, preserving bytes on refusal", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-insert-properties-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("Intro\n"));
  const writes = t.mock.method(fs, "writeFileSync");
  const replacements = t.mock.method(fs, "renameSync");
  try {
    for (const args of [
      ["insert-equation", "--at", "2", "--latex", "x^2 + 1", "--label", "eq-new"],
      ["insert-table", "--at", "3", "--cells", '[["A"],["1"]]', "--caption", "Values", "--label", "tab-new"],
    ]) {
      writes.mock.resetCalls();
      replacements.mock.resetCalls();
      assert.deepEqual(run([args[0], file, ...args.slice(1)]), { status: 0, stdout: "", stderr: "" });
      assert.equal(writes.mock.callCount(), 1);
      assert.equal(replacements.mock.callCount(), 1);
    }
    const saved = readFileSync(file);
    const blocks = getEditableDocument(parse(saved.toString("utf8"))).blocks;
    assert.ok(blocks[1].block === "equation" && blocks[1].label === "eq-new" && blocks[1].latex === "x^2 + 1");
    assert.ok(blocks[2].block === "table" && blocks[2].label === "tab-new");
    assert.deepEqual(blocks[2].block === "table" && blocks[2].caption, [{ kind: "text", text: "Values" }]);
    for (const args of [
      ["insert-equation", "--at", "1", "--latex", "y", "--label"],
      ["insert-table", "--at", "1", "--cells", '[["B"]]', "--caption", "Other", "--label"],
    ]) {
      for (const label of [" bad-label", "EQ-NEW", "tab-new"]) {
        writes.mock.resetCalls();
        replacements.mock.resetCalls();
        const result = run([args[0], file, ...args.slice(1), label]);
        assert.equal(result.status, 1, result.stderr);
        assert.equal(writes.mock.callCount(), 0);
        assert.equal(replacements.mock.callCount(), 0);
        assert.deepEqual(readFileSync(file), saved);
      }
    }
    // Label-only tables retain the existing Core contract.
    const labelOnly = run(["insert-table", file, "--at", "1", "--cells", '[["B"]]', "--label", "tab-only"]);
    assert.equal(labelOnly.status, 0, labelOnly.stderr);
  } finally {
    writes.mock.restore();
    replacements.mock.restore();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI top-level insertions accept end before endnotes, and batches resolve it on each snapshot", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-insert-end-"));
  const file = path.join(dir, "document.md");
  const operationsFile = path.join(dir, "operations.json");
  const original = nativeSource("Claim[^a].\n\n[^a]: Evidence.\n");
  try {
    for (const args of [
      ["insert-block", "--text", "Appended."],
      ["insert-heading", "--level", "2", "--text", "Appendix"],
      ["insert-admonition", "--variant", "note", "--text", "Note."],
      ["insert-quote", "--text", "Quoted."],
      ["insert-divider"],
      ["insert-equation", "--latex", "x", "--label", "eq-last"],
      ["insert-figure", "--label", "fig-last"],
      ["insert-table", "--cells", '[["A"]]', "--caption", "Last", "--label", "tab-last"],
      ["insert-list", "--list", '{"ordered":false,"items":[{"content":[{"kind":"text","text":"Item"}]}]}'],
      ["insert-code-block", "--code", "code"],
      ["insert-target", "--label", "last"],
    ]) {
      writeFileSync(file, original);
      const result = run([args[0], file, "--at", "end", ...args.slice(1)]);
      assert.equal(result.status, 0, `${args[0]}: ${result.stderr}`);
      const blocks = getEditableDocument(parse(readFileSync(file, "utf8"))).blocks;
      assert.deepEqual(blocks.map(block => block.path), [[1], [2], [3]]);
      assert.equal(blocks[2].block, "footnote");
    }
    const caption = [{ kind: "strong", children: [{ kind: "text", text: "Rich" }] }];
    const operations = [
      { command: "insert-equation", at: "end", latex: "z", label: "eq-batch" },
      { command: "insert-table", at: "end", cells: [["A"]], "caption-content": caption, label: "tab-batch" },
    ];
    writeFileSync(file, original);
    writeFileSync(operationsFile, JSON.stringify(operations));
    const result = run(["apply-batch", file, "--operations", operationsFile]);
    assert.deepEqual(result, { status: 0, stdout: "", stderr: "" });
    const blocks = getEditableDocument(parse(readFileSync(file, "utf8"))).blocks;
    assert.deepEqual(blocks.map(block => block.block), ["paragraph", "equation", "table", "footnote"]);
    assert.ok(blocks[1].block === "equation" && blocks[1].label === "eq-batch");
    assert.ok(blocks[2].block === "table" && blocks[2].label === "tab-batch");
    assert.deepEqual(blocks[2].block === "table" && blocks[2].caption, caption);
    const saved = readFileSync(file);
    for (const args of [
      ["insert-table-row", "--path", "3", "--at", "end"],
      ["insert-table-column", "--path", "3", "--at", "end"],
      ["move-block", "--from", "1", "--to", "end"],
      ["insert-table", "--at", "end", "--cells", '[["A"]]', "--caption", "Plain", "--caption-content", "[]"],
    ]) {
      assert.equal(run([args[0], file, ...args.slice(1)]).status, 1);
      assert.deepEqual(readFileSync(file), saved);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI insert-figure persists a Core Figure", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-figure-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("Intro\n"));
  try {
    const result = run(["insert-figure", file, "--at", "2", "--image", "./plot.svg", "--alt", "Plot", "--caption", "Measured plot."]);
    assert.equal(result.status, 0, result.stderr);
    const saved = readFileSync(file, "utf8");
    assert.equal(saved, nativeSource("Intro\n\n:::{figure} ./plot.svg\n:alt: Plot\n\nMeasured plot.\n:::\n"));
    const figure = getEditableDocument(parse(saved)).blocks[1];
    assert.equal(figure?.block, "figure");
    if (figure?.block !== "figure") return;
    assert.deepEqual(
      [figure.editable, figure.label, figure.imageUrl, figure.imageAlt, figure.caption.text],
      [true, "", "./plot.svg", "Plot", "Measured plot."],
    );
    const richCaption = [{ kind: "strong", children: [{ kind: "text", text: "Bold" }] }];
    assert.equal(run(["insert-figure", file, "--at", "3", "--image", "./plot.svg", "--caption-content", JSON.stringify(richCaption)]).status, 0);
    assert.match(readFileSync(file, "utf8"), /\*\*Bold\*\*/);
    assert.equal(run(["insert-figure", file, "--at", "1", "--image", "./only.svg"]).status, 0);
    const minimal = readFileSync(file, "utf8");
    assert.match(minimal, /^---\nieumdoc: 1\n---\n\n:::\{figure\} \.\/only\.svg\n:::\n/);
    // Invalid under the pending Figure contract too: alt text without an image.
    for (const args of [
      ["insert-figure", file, "--at", "1", "--image", " ./a.svg"],
      ["insert-figure", file, "--at", "1", "--image", "./a.svg", "--caption", "% comment"],
      ["insert-figure", file, "--at", "10", "--image", "./a.svg"],
      ["insert-figure", file, "--at", "1", "--alt", "missing image"],
    ]) {
      assert.equal(run(args).status, 1, args.join(" "));
      assert.equal(readFileSync(file, "utf8"), minimal, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("check warns per missing relative Figure image and dry runs check the result beside the target file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-missing-images-"));
  const file = path.join(dir, "document.md");
  const sources = ["./missing.png", "missing.png", "present.png", "./present.png",
    "한글%20.png", "100%.png", "한글.png", "absent%20.png",
    "https://example.org/image.png", "data:image/png;base64,AAAA", "//host/image.png",
    "/image.png", "C:/image.png", "C:\\image.png", "C:image.png", "\\\\host\\image.png",
    "../outside.png", "%2e%2e/outside.png", "./%2Foutside.png", "sub/../present.png", "assets"];
  const source = nativeSource(sources.map((source, index) =>
    `:::{figure} ${source}\n${index === 0 ? ":label: fig-missing\n" : ""}\nCaption\n:::\n`).join("\n"));
  try {
    for (const name of ["present.png", "한글%20.png", "100%.png", "한글.png"]) {
      writeFileSync(path.join(dir, name), "existence only; not decoded");
    }
    fs.mkdirSync(path.join(dir, "assets"));
    writeFileSync(file, source);
    const expected = [
      { path: [1], label: "fig-missing", source: "./missing.png" },
      { path: [2], label: "", source: "missing.png" },
      { path: [8], label: "", source: "absent%20.png" },
      { path: [21], label: "", source: "assets" },
    ];
    const text = run(["check", file]);
    assert.equal(text.status, 0, text.stderr);
    assert.equal(text.stderr, 'warning: Figure "fig-missing" (block 1) image "./missing.png" is not a file or could not be checked\n'
      + 'warning: Figure (block 2) image "missing.png" is not a file or could not be checked\n'
      + 'warning: Figure (block 8) image "absent%20.png" is not a file or could not be checked\n'
      + 'warning: Figure (block 21) image "assets" is not a file or could not be checked\n');
    const checked = run(["check", file, "--format", "json"]);
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(checked.stderr, "");
    const result = JSON.parse(checked.stdout);
    assert.equal(result.ok, true);
    assert.deepEqual(result.writeability, { writable: true });
    assert.deepEqual(result.readiness, { pendingFigures: [], missingImageFigures: expected });

    // A changed image exists only in the preview, and resolves beside the target, not cwd.
    const args = ["update-figure", file, "--path", "1", "--image", "present.png", "--dry-run"];
    const preview = run([...args, "--format", "json"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.deepEqual(JSON.parse(preview.stdout).readiness.missingImageFigures, expected.slice(1));
    assert.equal(run(args).stderr, text.stderr.split("\n").slice(1).join("\n"));
    assert.equal(readFileSync(file, "utf8"), source);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("check follows directory links, warning for the directory but accepting a linked regular file", t => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-image-links-"));
  const file = path.join(dir, "document.md");
  const assets = path.join(dir, "assets");
  try {
    fs.mkdirSync(assets);
    writeFileSync(path.join(assets, "present.png"), "file");
    try { fs.symlinkSync(assets, path.join(dir, "linked"), process.platform === "win32" ? "junction" : "dir"); }
    catch (error) {
      if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        return t.skip("directory symlinks/junctions need extra permission here");
      }
      throw error;
    }
    const source = nativeSource(":::{figure} linked\n:::\n\n:::{figure} linked/present.png\n:::\n");
    writeFileSync(file, source);
    const result = run(["check", file, "--format", "json"]);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).readiness.missingImageFigures,
      [{ path: [1], label: "", source: "linked" }]);
    assert.equal(readFileSync(file, "utf8"), source);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("check warns honestly when an image stat fails without failing or writing", t => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-image-stat-"));
  const file = path.join(dir, "document.md");
  const source = nativeSource(":::{figure} present.png\n:::\n");
  try {
    writeFileSync(file, source);
    writeFileSync(path.join(dir, "present.png"), "file");
    const stat = t.mock.method(fs, "statSync", () => { throw Object.assign(new Error("denied"), { code: "EACCES" }); });
    try {
      const text = run(["check", file]);
      assert.equal(text.status, 0, text.stderr);
      assert.equal(text.stderr, 'warning: Figure (block 1) image "present.png" is not a file or could not be checked\n');
      const json = run(["check", file, "--format", "json"]);
      assert.equal(json.status, 0, json.stderr);
      const result = JSON.parse(json.stdout);
      assert.equal(result.ok, true);
      assert.deepEqual(result.writeability, { writable: true });
      assert.deepEqual(result.readiness.missingImageFigures, [{ path: [1], label: "", source: "present.png" }]);
      assert.equal(readFileSync(file, "utf8"), source);
    } finally { stat.mock.restore(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI insert-figure makes a pending Figure in one write; update-figure connects and removes its image", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-pending-figure-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("Intro\n\nThe controller structure is shown in [Figure](#fig-pfc-control).\n"));
  const pending = ":::{figure}\n:name: fig-pfc-control\n\nPFC Current Control Architecture\n:::\n";
  const document = (figure: string) => nativeSource(`Intro\n\n${figure}\nThe controller structure is shown in [Figure](#fig-pfc-control).\n`);
  try {
    const inserted = run(["insert-figure", file, "--at", "2", "--label", "fig-pfc-control", "--caption", "PFC Current Control Architecture"]);
    assert.equal(inserted.status, 0, inserted.stderr);
    assert.equal(readFileSync(file, "utf8"), document(pending));

    // Inspect tells a pending Figure from an image Figure; check warns but stays writable and exits 0.
    assert.match(run(["inspect", file]).stdout, /^2 figure figureEditable=true label="fig-pfc-control" image="" alt="" content=none numbers=figure:1$/m);
    const figure = JSON.parse(run(["inspect", file, "--format", "json"]).stdout).nodes.find((node: { type: string }) => node.type === "figure");
    assert.equal(figure.contentKind, "none");
    const checked = run(["check", file, "--format", "json"]);
    assert.equal(checked.status, 0, checked.stderr);
    const result = JSON.parse(checked.stdout);
    assert.deepEqual([result.ok, result.writeability, result.readiness], [true, { writable: true }, { pendingFigures: [{ path: [2], label: "fig-pfc-control" }], missingImageFigures: [] }]);
    const textCheck = run(["check", file]);
    assert.equal(textCheck.status, 0, textCheck.stderr);
    assert.match(textCheck.stdout, /writeability ok/);
    assert.match(textCheck.stderr, /^warning: Figure "fig-pfc-control" \(block 2\) has no content yet$/m);

    // A label alone is one command, and a rejected label leaves the file as it was.
    const before = readFileSync(file, "utf8");
    for (const args of [
      ["insert-figure", file, "--at", "1", "--label", "FIG-PFC-Control"],
      ["insert-figure", file, "--at", "1", "--label", " fig-a"],
    ]) {
      assert.equal(run(args).status, 1, args.join(" "));
      assert.equal(readFileSync(file, "utf8"), before, args.join(" "));
    }
    assert.equal(run(["insert-figure", file, "--at", "1", "--label", "fig-only"]).status, 0);
    assert.equal(readFileSync(file, "utf8"), nativeSource(`:::{figure}\n:name: fig-only\n:::\n\n${before.slice(nativeSource("").length)}`));
    writeFileSync(file, before);
    // With no image, caption or label it is an empty place, saved and reported like any pending Figure.
    assert.equal(run(["insert-figure", file, "--at", "1"]).status, 0);
    assert.equal(readFileSync(file, "utf8"), nativeSource(`:::{figure}\n:::\n\n${before.slice(nativeSource("").length)}`));
    const emptyCheck = run(["check", file]);
    assert.equal(emptyCheck.status, 0, emptyCheck.stderr);
    assert.match(emptyCheck.stderr, /^warning: Figure \(block 1\) has no content yet$/m);
    writeFileSync(file, before);

    // Connecting an image keeps the place, caption, label and the reference.
    writeFileSync(path.join(dir, "pfc-control.svg"), "image");
    assert.equal(run(["update-figure", file, "--path", "2", "--image", "./pfc-control.svg", "--alt", "PFC current control diagram"]).status, 0);
    const connected = document(":::{figure} ./pfc-control.svg\n:name: fig-pfc-control\n:alt: PFC current control diagram\n\nPFC Current Control Architecture\n:::\n");
    assert.equal(readFileSync(file, "utf8"), connected);
    assert.deepEqual(JSON.parse(run(["check", file, "--format", "json"]).stdout).readiness, { pendingFigures: [], missingImageFigures: [] });
    // Removing the image needs its alt text removed too; then it is the pending Figure again.
    const altKept = run(["update-figure", file, "--path", "2", "--image", ""]);
    assert.equal(altKept.status, 1);
    assert.match(altKept.stderr, /without an image cannot have alt text/);
    assert.equal(readFileSync(file, "utf8"), connected);
    assert.equal(run(["update-figure", file, "--path", "2", "--image", "", "--alt", ""]).status, 0);
    assert.equal(readFileSync(file, "utf8"), document(pending));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI update-label sets, changes and removes labels through Core and rejects duplicates without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-update-label-"));
  const file = path.join(dir, "technical-document.md");
  copyFileSync(technicalFixture, file);
  try {
    const blocks = getEditableDocument(parse(readFileSync(file, "utf8"))).blocks;
    const equation = blocks.find((block) => block.block === "equation")!.path.join(",");
    const figure = blocks.find((block) => block.block === "figure")!.path.join(",");
    const labels = () => getEditableDocument(parse(readFileSync(file, "utf8"))).blocks
      .flatMap((block) => block.block === "equation" || block.block === "figure" ? [block.label] : []);
    assert.equal(run(["update-label", file, "--path", equation, "--label", "eq-reference"]).status, 0);
    assert.equal(run(["update-label", file, "--path", figure, "--label", ""]).status, 0);
    assert.deepEqual(labels(), ["", "eq-reference"]);
    const saved = readFileSync(file, "utf8");
    assert.equal(serialize(parse(saved)), saved);
    assert.match(saved, /```\{math\}\n:label: eq-reference\n\ni\^/);
    // References are not renamed.
    assert.match(saved, /\{eq\}`eq-current`/);

    const before = readFileSync(file);
    const duplicate = run(["update-label", file, "--path", figure, "--label", "EQ-Reference"]);
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /already names another target/);
    assert.notEqual(run(["update-label", file, "--path", "1", "--label", "h"]).status, 0);
    assert.deepEqual(readFileSync(file), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI opt-in label rename shares Core, strict boolean options and atomic batch refusal", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-rename-label-"));
  const file = path.join(dir, "document.md");
  const operations = path.join(dir, "operations.json");
  const source = "\uFEFF" + nativeSource("```{math}\n:label: old\nx\n```\n\n{eq}`old` and [keep](#old).\n\n# Taken\n").replaceAll("\n", "\r\n");
  const original = Buffer.from(source);
  const args = ["update-label", file, "--path", "1", "--label", "new"];
  try {
    const help = run(["help", "update-label"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--update-references <true\|false>/);
    assert.match(help.stdout, /"update-references": true or false/);
    for (const option of [[], ["--update-references", "false"], ["--update-references", "true"]]) {
      writeFileSync(file, original);
      const result = run([...args, ...option]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(file, "utf8"), serialize(updateLabel(parse(source), [1], "new",
        { updateReferences: option.at(-1) === "true" })));
    }
    for (const [option, reason] of [
      [["--update-references"], /missing --update-references/],
      [["--update-references", "yes"], /must be true or false/],
      [["--update-references", "true", "--update-references", "false"], /duplicate option/],
    ] as const) {
      writeFileSync(file, original);
      const result = run([...args, ...option]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, reason);
      assert.deepEqual(readFileSync(file), original);
    }
    writeFileSync(file, original);
    const refused = run(["update-label", file, "--path", "1", "--label", "taken", "--update-references", "true"]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /already names another target/);
    assert.deepEqual(readFileSync(file), original);

    const step = (label: string, opt: boolean | string | number = true) =>
      ({ command: "update-label", path: 1, label, "update-references": opt });
    for (const opt of [true, false]) {
      writeFileSync(file, original);
      writeFileSync(operations, JSON.stringify([step("mid", opt), step("new", opt)]));
      const result = run(["apply-batch", file, "--operations", operations, "--format", "json"]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).applied, 2);
      const mid = updateLabel(parse(source), [1], "mid", { updateReferences: opt });
      assert.equal(readFileSync(file, "utf8"), serialize(updateLabel(mid, [1], "new", { updateReferences: opt })));
    }
    for (const [steps, reason] of [
      [[step("mid"), step("taken")], /operation 2 \(update-label\).*already names another target/],
      [[step("new", "yes")], /must be true or false/],
      [[step("new", 1)], /must be true or false/],
    ] as const) {
      writeFileSync(file, original);
      writeFileSync(operations, JSON.stringify(steps));
      const result = run(["apply-batch", file, "--operations", operations]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, reason);
      assert.deepEqual(readFileSync(file), original);
    }
    assert.deepEqual(readdirSync(dir).sort(), ["document.md", "operations.json"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI update-figure changes Figure properties through Core and preserves the label", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-update-figure-"));
  const file = path.join(dir, "technical-document.md");
  copyFileSync(technicalFixture, file);
  try {
    const figurePath = getEditableDocument(parse(readFileSync(file, "utf8"))).blocks
      .find((block) => block.block === "figure")!.path.join(",");
    const result = run(["update-figure", file, "--path", figurePath, "--image", "./diagram-v2.svg", "--alt", "New alt", "--caption", "New caption."]);
    assert.equal(result.status, 0, result.stderr);
    const saved = readFileSync(file, "utf8");
    assert.equal(serialize(parse(saved)), saved);
    const figure = getEditableDocument(parse(saved)).blocks.find((block) => block.block === "figure");
    assert.equal(figure?.block, "figure");
    if (figure?.block !== "figure") return;
    assert.deepEqual(
      [figure.label, figure.imageUrl, figure.imageAlt, figure.caption.text],
      ["fig-control", "./diagram-v2.svg", "New alt", "New caption."],
    );
    assert.equal(saved.includes("See [Figure](#fig-control)"), true);

    assert.equal(run(["update-figure", file, "--path", figurePath, "--caption", "Only caption."]).status, 0);
    const partial = getEditableDocument(parse(readFileSync(file, "utf8"))).blocks.find((block) => block.block === "figure");
    assert.equal(partial?.block === "figure" && partial.imageUrl, "./diagram-v2.svg");
    assert.equal(partial?.block === "figure" && partial.caption.text, "Only caption.");

    const caption = [{ kind: "strong", children: [{ kind: "text", text: "Rich caption" }] }];
    const rich = run(["update-figure", file, "--path", figurePath, "--caption-content", JSON.stringify(caption)]);
    assert.equal(rich.status, 0, rich.stderr);
    const richFigure = getEditableDocument(parse(readFileSync(file, "utf8"))).blocks.find(block => block.block === "figure");
    assert.deepEqual(richFigure?.block === "figure" && richFigure.caption.content, caption);
    assert.equal(richFigure?.block === "figure" && richFigure.label, "fig-control");
    assert.equal(run(["update-figure", file, "--path", figurePath, "--alt", "New alt"]).status, 0);
    assert.match(readFileSync(file, "utf8"), /\*\*Rich caption\*\*/);

    const before = readFileSync(file);
    for (const args of [
      ["update-figure", file, "--path", "1", "--caption", "not a figure"],
      ["update-figure", file, "--path", "100", "--caption", "out of range"],
      ["update-figure", file, "--path", figurePath],
      ["update-figure", file, "--path", figurePath, "--image", ""],
      ["update-figure", file, "--path", figurePath, "--alt", "line\nbreak"],
      ["update-figure", file, "--path", figurePath, "--caption", "% comment"],
      ["update-figure", file, "--path", figurePath, "--caption", "text", "--caption-content", "[]"],
      ["update-figure", file, "--path", figurePath, "--caption-content", "{}"],
      ["update-figure", file, "--path", figurePath, "--caption-content", "[{\"kind\":\"unknown\"}]"],
      ["update-figure", file, "--path", figurePath, "--label", "fig-other"],
    ]) {
      assert.equal(run(args).status, 1, args.join(" "));
      assert.deepEqual(readFileSync(file), before, args.join(" "));
    }
    assert.match(run(["help", "update-figure"]).stdout, /label is preserved/);
    assert.match(run(["inspect", file]).stdout, / figure figureEditable=true label="fig-control" image="\.\/diagram-v2\.svg" alt="New alt"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unknown command exits 2", () => {
  const result = runProcess(["no-such-command"]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /unknown command: no-such-command/);
  assert.equal(runProcess(["help", "no-such-command"]).status, 2);
});

test("inspect prints Core editable targets", () => {
  const source = readFileSync(technicalFixture, "utf8");
  const before = source;
  const result = run(["inspect", technicalFixture]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(technicalFixture, "utf8"), before);
  const editable = getEditableDocument(parse(source));
  const lines = result.stdout.trimEnd().split("\n");

  for (const block of editable.blocks) {
    const path = block.path.join(",");
    const line = lines.find((item) => item === `${path} ${block.block}` || item.startsWith(`${path} ${block.block} `));
    assert.ok(line, `${path} ${block.block}`);
    if (block.block === "heading") {
      assert.equal(line?.includes(`level=${block.level}`), true);
      assert.equal(line?.includes(`textEditable=${block.editable}`), true);
      assert.equal(line?.includes(`text=${JSON.stringify(block.text)}`), true);
    }
    if (block.block === "paragraph") {
      assert.equal(line?.includes(`inlineEditable=${block.editable}`), true);
      assert.equal(line?.includes(`text=${JSON.stringify(block.text)}`), true);
    }
    if (block.block === "admonition") {
      assert.equal(line?.includes(`variant=${JSON.stringify(block.variant)}`), true);
      assert.equal(line?.includes("readonly="), false);
    }
    if (block.block === "figure") {
      assert.equal(line?.includes(`label=${JSON.stringify(block.label)}`), true);
      assert.equal(line?.includes("readonly="), false);
      const caption = lines.find((item) => item.startsWith(`  ${block.caption.path.join(",")} caption `));
      assert.ok(caption);
      assert.equal(caption?.includes(`textEditable=${block.caption.editable}`), true);
      assert.equal(caption?.includes(`text=${JSON.stringify(block.caption.text)}`), true);
    }
    if (block.block === "equation") {
      assert.equal(line?.includes(`label=${JSON.stringify(block.label)}`), true);
      assert.equal(line?.includes(`latex=${JSON.stringify(block.latex)}`), true);
      assert.equal(line?.includes("readonly="), false);
    }
    if (block.block === "table") {
      assert.equal(line?.includes("readonly="), false);
      for (const row of block.rows) {
        for (const cell of row.cells) {
          const cellLine = lines.find((item) => item.startsWith(`  ${cell.path.join(",")} cell `));
          assert.ok(cellLine, cell.path.join(","));
          assert.equal(cellLine?.includes(`header=${cell.header}`), true);
          assert.equal(cellLine?.includes(`textEditable=${cell.editable}`), true);
          assert.equal(cellLine?.includes(`text=${JSON.stringify(cell.text)}`), true);
        }
      }
    }
  }
  assert.equal(result.stdout.includes("readonly="), false);

  const listDocument = getEditableDocument(parse(readFileSync(fixture, "utf8")));
  const list = listDocument.blocks.find((block) => block.block === "list");
  assert.equal(list?.block, "list");
  if (list?.block === "list") {
    const listed = run(["inspect", fixture]);
    assert.equal(listed.status, 0, listed.stderr);
    assert.equal(
      listed.stdout.includes(`${list.path.join(",")} list\n  - text="DC-link voltage controller"\n  - text="AC current controller"\n  - text="PLL"\n`),
      true,
    );
  }

  const quoteDir = mkdtempSync(path.join(tmpdir(), "ieumdoc-inspect-"));
  const quoteFile = path.join(quoteDir, "quoted.md");
  try {
    writeFileSync(quoteFile, nativeSource('Paragraph "quoted" text and a \\\\ slash.\n'));
    const quoted = run(["inspect", quoteFile]);
    assert.equal(quoted.status, 0, quoted.stderr);
    const quotedDocument = getEditableDocument(parse(readFileSync(quoteFile, "utf8")));
    const quotedParagraph = quotedDocument.blocks[0];
    assert.equal(quotedParagraph?.block, "paragraph");
    if (quotedParagraph?.block === "paragraph") {
      assert.equal(
        quoted.stdout,
        `title: absent\n1 paragraph inlineEditable=${quotedParagraph.editable} text=${JSON.stringify(quotedParagraph.text)}\nnumbering: automatic\n`,
      );
      assert.equal(quoted.stdout.includes("\n\n"), false);
    }
  } finally {
    rmSync(quoteDir, { recursive: true, force: true });
  }


});

test("inspect and check expose stable machine-readable Core results", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-machine-contract-"));
  const file = path.join(dir, "technical-document.md");
  copyFileSync(technicalFixture, file);
  writeFileSync(path.join(dir, "diagram.svg"), "image");
  const before = readFileSync(file);

  try {
    const textInspect = run(["inspect", file]);
    const explicitTextInspect = run(["inspect", file, "--format", "text"]);
    assert.equal(textInspect.status, 0, textInspect.stderr);
    assert.equal(explicitTextInspect.status, 0, explicitTextInspect.stderr);
    assert.equal(explicitTextInspect.stdout, textInspect.stdout);

    const inspected = run(["inspect", file, "--format", "json"]);
    assert.equal(inspected.status, 0, inspected.stderr);
    const inspectResult = JSON.parse(inspected.stdout) as {
      ok: boolean;
      command: string;
      revision: string;
      nodes: Array<{ path: number[]; type: string; level?: number; editable?: boolean; text?: string }>;
    };
    assert.equal(inspectResult.ok, true);
    assert.equal(inspectResult.command, "inspect");
    assert.equal(inspectResult.revision, textRevision(before.toString("utf8")));
    assert.ok(inspectResult.nodes.length > 0);
    const heading = inspectResult.nodes.find((node) => node.type === "heading");
    assert.ok(heading);
    assert.equal(heading.level, 1);
    assert.equal(typeof heading.editable, "boolean");
    assert.equal(typeof heading.text, "string");
    const paragraph = inspectResult.nodes.find((node) => node.type === "paragraph");
    assert.ok(paragraph);
    assert.ok(Array.isArray(paragraph.path));
    assert.equal(typeof paragraph.editable, "boolean");
    assert.equal(typeof paragraph.text, "string");
    // Computed target numbers, as MyST numbers them; they are never written.
    const numbered = inspectResult.nodes.flatMap((node) => "numbers" in node ? [[node.type, node.numbers]] : []);
    assert.deepEqual(numbered, [["figure", { figure: 1 }], ["equation", { equation: 1 }], ["table", { table: 1 }]]);
    assert.match(textInspect.stdout, /^7 figure .* numbers=figure:1$/m);

    const checked = run(["check", file, "--format", "json"]);
    assert.equal(checked.status, 0, checked.stderr);
    assert.deepEqual(JSON.parse(checked.stdout), {
      ok: true,
      command: "check",
      validation: { valid: true },
      writeability: { writable: true },
      references: { unresolved: [] },
      numbering: numberingReport(getEditableDocument(parse(before.toString("utf8"))).blocks),
      readiness: { pendingFigures: [], missingImageFigures: [] },
      endnotes: { inPlace: true },
      citations: { bibliography: [], citations: [], readiness: { status: "evaluated", complete: true, diagnostics: [] }, references: [], entries: [] },
    });
    const textCheck = run(["check", file]);
    const explicitTextCheck = run(["check", file, "--format", "text"]);
    assert.equal(textCheck.status, 0, textCheck.stderr);
    assert.equal(explicitTextCheck.status, 0, explicitTextCheck.stderr);
    assert.equal(explicitTextCheck.stdout, textCheck.stdout);
    assert.deepEqual(readFileSync(file), before);

    // The preload changes the disk after the first read: nodes and revision still
    // describe that single original read, never a later version of the file.
    const external = nativeSource("## Edited elsewhere\n");
    const snapshot = runProcess(["inspect", file, "--format", "json"],
      ["--import", pathToFileURL(path.join(cliRoot, "test", "replace-after-read.ts")).href], {
        ...process.env, IEUMDOC_TEST_REPLACE_AFTER_READ: file,
        IEUMDOC_TEST_REPLACEMENT: Buffer.from(external).toString("base64"),
      });
    assert.equal(snapshot.status, 0, snapshot.stderr);
    assert.deepEqual(JSON.parse(snapshot.stdout), inspectResult);
    assert.equal(readFileSync(file, "utf8"), external);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI rejects unknown, duplicate, and unnecessary arguments without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-strict-options-"));
  const file = path.join(dir, "document.md");
  copyFileSync(fixture, file);
  const before = readFileSync(file);

  try {
    for (const args of [
      ["inspect", file, "--json"],
      ["check", file, "--unknown"],
      ["inspect", file, "--format", "yaml"],
      ["check", file, "--format", "json", "--format", "text"],
      ["check", file, "extra"],
      ["create", file, "--if-revision", textRevision(before.toString("utf8"))],
      ["inspect", file, "--if-revision", textRevision(before.toString("utf8"))],
      ["check", file, "--if-revision", textRevision(before.toString("utf8"))],
      ["format", file, "--if-revision"],
      ["format", file, "--if-revision", "a".repeat(64), "--if-revision", "b".repeat(64)],
    ]) {
      const result = run(args);
      assert.notEqual(result.status, 0, args.join(" "));
      assert.deepEqual(readFileSync(file), before, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI rejects empty NodePath segments in single and batch writes while accepting spaced nested paths", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-node-path-"));
  const file = path.join(dir, "table.md");
  const operations = path.join(dir, "operations.json");
  const original = Buffer.from(nativeSource("| A | B |\n| --- | --- |\n| C | D |\n"));
  writeFileSync(file, original);
  try {
    for (const locator of ["1,,0", "1, ,0", ",1,0", "1,0,", "", " "]) {
      const single = run(["update-table-cell", file, "--path", locator, "--text", "Changed"]);
      assert.equal(single.status, 1, locator);
      assert.match(single.stderr, /--path must be comma-separated non-negative integers/);
      assert.deepEqual(readFileSync(file), original, locator);

      writeFileSync(operations, JSON.stringify([
        { command: "update-table-cell", path: "1,0,0", text: "Earlier change" },
        { command: "update-table-cell", path: locator, text: "Changed" },
      ]));
      const batch = run(["apply-batch", file, "--operations", operations]);
      assert.equal(batch.status, 1, locator);
      assert.match(batch.stderr, /operation 2 \(update-table-cell\): --path must be comma-separated non-negative integers; nothing was written/);
      assert.deepEqual(readFileSync(file), original, locator);
    }

    const single = run(["update-table-cell", file, "--path", " 1 , 0 , 0 ", "--text", "Single"]);
    assert.equal(single.status, 0, single.stderr);
    writeFileSync(operations, JSON.stringify([
      { command: "update-table-cell", path: " 1 , 1 , 0 ", text: "Batch" },
    ]));
    const batch = run(["apply-batch", file, "--operations", operations]);
    assert.equal(batch.status, 0, batch.stderr);
    const table = getEditableDocument(parse(readFileSync(file, "utf8"))).blocks[0];
    assert.equal(table.block, "table");
    if (table.block === "table") {
      assert.deepEqual(table.rows.map(row => row.cells.map(cell => cell.text)), [["Single", "B"], ["Batch", "D"]]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI accepts an inspect revision for edits and format without printing a new revision", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-revision-"));
  const file = path.join(dir, "document.md");
  const original = "\uFEFF" + nativeSource("## Target\r\n\r\nBody.\r\n");
  writeFileSync(file, original);
  try {
    const inspected = run(["inspect", file, "--format", "json"]);
    assert.equal(inspected.status, 0, inspected.stderr);
    const snapshot = JSON.parse(inspected.stdout);
    assert.equal(snapshot.revision, textRevision(original));
    assert.notEqual(snapshot.revision, textRevision(serialize(parse(original))));
    const heading = snapshot.nodes.find((node: { type: string }) => node.type === "heading");
    assert.ok(heading);
    const updated = run(["update-heading", file, "--path", heading.path.join(","), "--text", "Changed",
      "--if-revision", snapshot.revision]);
    assert.equal(updated.status, 0, updated.stderr);
    assert.equal(updated.stdout, "");
    assert.equal(readFileSync(file, "utf8"), nativeSource("## Changed\n\nBody.\n"));

    // Refresh the revision for the next write, even when the path stayed the same.
    const refreshed = run(["inspect", file, "--format", "json"]);
    assert.equal(refreshed.status, 0, refreshed.stderr);
    assert.notEqual(JSON.parse(refreshed.stdout).revision, snapshot.revision);
    const formatted = run(["format", file, "--if-revision", JSON.parse(refreshed.stdout).revision]);
    assert.equal(formatted.status, 0, formatted.stderr);
    assert.equal(formatted.stdout, "");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI refuses a stale inspect revision when structural edits retarget a valid path", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-stale-path-"));
  const file = path.join(dir, "document.md");
  const original = nativeSource("## Before\n\n## Target\n\n## After\n");
  try {
    for (const args of [
      ["insert-heading", file, "--at", "1", "--level", "2", "--text", "Inserted"],
      ["remove-block", file, "--at", "1"],
      ["move-block", file, "--from", "3", "--to", "1"],
    ]) {
      writeFileSync(file, original);
      const inspected = run(["inspect", file, "--format", "json"]);
      assert.equal(inspected.status, 0, inspected.stderr);
      const snapshot = JSON.parse(inspected.stdout);
      const target = snapshot.nodes.find((node: { text?: string }) => node.text === "Target");
      assert.ok(target);
      const external = run(args);
      assert.equal(external.status, 0, external.stderr);
      const before = readFileSync(file);
      const retargeted = getEditableDocument(parse(before.toString("utf8"))).blocks
        .find(block => block.path.join(",") === target.path.join(","));
      assert.equal(retargeted?.block, "heading");
      assert.ok(retargeted && "text" in retargeted && retargeted.text !== target.text);
      const failed = run(["update-heading", file, "--path", target.path.join(","), "--text", "Wrong target",
        "--if-revision", snapshot.revision]);
      assert.equal(failed.status, 1, failed.stderr);
      assert.equal(failed.stderr, "revision mismatch; run inspect again; nothing was written\n");
      assert.equal(failed.stdout, "");
      assert.deepEqual(readFileSync(file), before);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI rejects malformed revision arguments without changing file bytes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-invalid-revision-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("## Target\r\n"));
  const before = readFileSync(file);
  try {
    for (const revision of ["", "a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64), "a".repeat(64) + "\n"]) {
      const failed = run(["format", file, "--if-revision", revision]);
      assert.equal(failed.status, 1, failed.stderr);
      assert.equal(failed.stderr, "--if-revision must be 64 lowercase hexadecimal characters\n");
      assert.deepEqual(readFileSync(file), before);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI updates Equation LaTeX through Core without partial writes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-equation-"));
  const file = path.join(dir, "technical-document.md");
  copyFileSync(technicalFixture, file);
  try {
    const original = readFileSync(file, "utf8");
    const equation = getEditableDocument(parse(original)).blocks.find((block) => block.block === "equation");
    assert.equal(equation?.block, "equation");
    if (equation?.block !== "equation") return;
    const next = "i^{\\ast} = \\frac{P^{\\ast}}{V_{\\mathrm{rms}}} + 1";
    const result = run(["update-equation-latex", file, "--path", equation.path.join(","), "--from", equation.latex, "--to", next]);
    assert.equal(result.status, 0, result.stderr);
    const saved = readFileSync(file, "utf8");
    assert.equal(saved.includes(next), true);
    assert.equal(serialize(parse(saved)), saved);
    const beforeFailure = readFileSync(file);
    const failed = run(["update-equation-latex", file, "--path", equation.path.join(","), "--from", "stale", "--to", "bad"]);
    assert.equal(failed.status, 1);
    assert.deepEqual(readFileSync(file), beforeFailure);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("inspect does not call an admonition readonly when update-node-text can change it", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-admonition-"));
  const file = path.join(dir, "technical-document.md");
  copyFileSync(technicalFixture, file);
  try {
    const admonition = getEditableDocument(parse(readFileSync(file, "utf8"))).blocks.find(
      (block) => block.block === "admonition",
    );
    assert.equal(admonition?.block, "admonition");
    if (admonition?.block !== "admonition") return;
    const inspected = run(["inspect", file]);
    assert.equal(inspected.status, 0, inspected.stderr);
    const line = inspected.stdout.split("\n").find((item) => item.startsWith(`${admonition.path.join(",")} admonition `));
    assert.ok(line);
    assert.equal(line?.includes("readonly="), false);
    const next = "Calibrated before operation.";
    const updated = run([
      "update-node-text",
      file,
      "--path",
      admonition.path.join(","),
      "--from",
      admonition.text,
      "--to",
      next,
    ]);
    assert.equal(updated.status, 0, updated.stderr);
    const checked = run(["check", file]);
    assert.equal(checked.status, 0, checked.stderr);
    const saved = readFileSync(file, "utf8");
    assert.equal(saved.includes(next), true);
    assert.equal(saved.includes(admonition.text), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI source does not interpret MyST AST", () => {
  const source = readFileSync(path.join(cliRoot, "src", "cli.ts"), "utf8");
  assert.equal(source.includes("getEditableDocument"), true);
  assert.equal(/from\s+["']myst-/.test(source), false);
  assert.equal(source.includes("document.children"), false);
  assert.equal(source.includes("GenericNode"), false);
});

function corePipeline(source: string): string {
  let document = replaceText(parse(source), FROM, TO);
  document = insertParagraph(document, 2, INSERTED);
  document = moveBlock(document, 4, 2);
  document = removeBlock(document, 5);
  validateStructure(document);
  return serialize(document);
}

test("insert-target and update-label label a section that {ref} references name", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-target-"));
  const file = path.join(dir, "document.md");
  const original = nativeSource("# Title\n\n## Intro\n\nSee {ref}`intro`.\n");
  writeFileSync(file, original);
  try {
    for (const args of [["insert-target", file, "--at", "2", "--label", "개요"], ["update-label", file, "--path", "3", "--label", "intro"]]) {
      assert.notEqual(run(args).status, 0, args.join(" "));
      assert.equal(readFileSync(file, "utf8"), original);
    }
    assert.equal(run(["insert-target", file, "--at", "2", "--label", "sec-intro"]).status, 0);
    assert.equal(run(["update-label", file, "--path", "2", "--label", "intro"]).status, 0);
    assert.equal(readFileSync(file, "utf8"), nativeSource("# Title\n\n(intro)=\n\n## Intro\n\nSee {ref}`intro`.\n"));
    const nodes = JSON.parse(run(["inspect", file, "--format", "json"]).stdout).nodes;
    assert.deepEqual(nodes[1], { path: [2], type: "target", label: "intro" });
    assert.equal(nodes[3].editable, true);
    const checked = run(["check", file]);
    assert.equal(checked.status, 0, checked.stderr);
    assert.equal(checked.stderr, "");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Tests in this file run serially; capture only during the synchronous invocation.
function run(args: string[]) {
  const stdoutWrite = process.stdout.write;
  const stderrWrite = process.stderr.write;
  let stdout = "";
  let stderr = "";
  try {
    process.stdout.write = (chunk) => { stdout += chunk; return true; };
    process.stderr.write = (chunk) => { stderr += chunk; return true; };
    const status = runCli(args);
    return { status, stdout, stderr };
  } finally {
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

// Keep process exit delivery, serve, and Node preload/env isolation on the executable path.
function runProcess(args: string[], nodeArgs: string[] = [], env?: NodeJS.ProcessEnv, input?: string | Buffer) {
  const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));
  const cli = path.join(cliRoot, "src", "cli.ts");
  return spawnSync(process.execPath, [tsxCli, ...nodeArgs, cli, ...args], {
    encoding: "utf8",
    env,
    input,
  });
}

test("CLI format keeps semantic references distinct from fragment links", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-references-"));
  const file = path.join(dir, "technical-document.md");
  const unsupported = path.join(dir, "term.md");
  copyFileSync(technicalFixture, file);
  writeFileSync(unsupported, nativeSource("See {term}`glossary`.\n"));
  try {
    for (let i = 0; i < 2; i++) assert.equal(run(["format", file]).status, 0);
    const saved = readFileSync(file, "utf8");
    // CLI writes exactly Core's canonical form: the {eq} role stays a role and the
    // `[](#...)` fragment links stay links (Core's regression pins their semantics).
    assert.equal(saved, serialize(parse(readFileSync(technicalFixture, "utf8"))));
    assert.match(saved, /^See \[Figure\]\(#fig-control\) and \{eq\}`eq-current`\.$/m);
    assert.match(saved, /^The rated current follows from \[Equation\]\(#eq-current\)\.$/m);

    const failed = run(["format", unsupported]);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /Unsupported native content/);
    assert.equal(readFileSync(unsupported, "utf8"), nativeSource("See {term}`glossary`.\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI updates Markdown table cells through Core and rejects unsupported text", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-table-"));
  const file = path.join(dir, "technical-document.md");
  copyFileSync(technicalFixture, file);
  try {
    for (const [cell, text] of [["13,0,0", "Port name"], ["13,1,1", "AC-side"], ["13,2,1", ""]]) {
      const result = run(["update-table-cell", file, "--path", cell, "--text", text]);
      assert.equal(result.status, 0, result.stderr);
    }
    const bold = [{ kind: "strong", children: [{ kind: "text", text: "P" }] }];
    const formatted = run(["update-table-cell", file, "--path", "13,2,0", "--content", JSON.stringify(bold)]);
    assert.equal(formatted.status, 0, formatted.stderr);
    const saved = readFileSync(file, "utf8");
    assert.match(saved, /\| Port name \| Type +\|\n\| -+ \| -+ \|\n\| U +\| AC-side \|\n\| \*\*P\*\* +\| +\|\n:::\n$/);
    assert.equal(serialize(parse(saved)), saved);
    const table = getEditableDocument(parse(saved)).blocks[12];
    assert.equal(table?.block, "table");
    if (table?.block === "table") {
      assert.deepEqual(table.rows.map((row) => row.cells.map((item) => item.text)), [["Port name", "Type"], ["U", "AC-side"], ["P", ""]]);
      assert.deepEqual(table.rows[2].cells[0].content, bold);
    }
    for (const args of [
      ["--path", "13,1,1", "--text", " padded"],
      ["--path", "13,1,1", "--text", "x", "--content", JSON.stringify(bold)],
      ["--path", "3,0,0", "--text", "x"],
      ["--path", "13,1", "--text", "x"],
    ]) {
      const result = run(["update-table-cell", file, ...args]);
      assert.equal(result.status, 1, args.join(" "));
      assert.equal(readFileSync(file, "utf8"), saved, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI inserts and updates lists through Core and rejects invalid lists without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-list-"));
  const file = path.join(dir, "doc.md");
  writeFileSync(file, nativeSource("# Steps\n"));
  const text = (value: string) => [{ kind: "text", text: value }];
  try {
    const inserted = {
      ordered: false,
      items: [
        { content: [{ kind: "strong", children: text("Check") }, { kind: "text", text: " wiring" }], list: { ordered: true, start: 1, style: "lower-roman", delimiter: ")", items: [{ content: text("Input") }] } },
        { content: text("Power on") },
      ],
    };
    const insert = run(["insert-list", file, "--at", "2", "--list", JSON.stringify(inserted)]);
    assert.equal(insert.status, 0, insert.stderr);
    const inspected = run(["inspect", file, "--format", "json"]);
    assert.equal(inspected.status, 0, inspected.stderr);
    const node = (JSON.parse(inspected.stdout) as { nodes: Array<Record<string, unknown>> }).nodes[1];
    assert.deepEqual(node, { path: [2], type: "list", ...inserted });

    // The inspected shape is the update input.
    const updated = { ordered: true, start: 3, style: "lower-alpha", delimiter: ")", items: node.items };
    const update = run(["update-list", file, "--path", "2", "--list", JSON.stringify(updated)]);
    assert.equal(update.status, 0, update.stderr);
    const saved = readFileSync(file, "utf8");
    assert.equal(saved, nativeSource("# Steps\n\n{style=lower-alpha}\n3)  **Check** wiring\n\n    {style=lower-roman}\n    1)  Input\n4)  Power on\n"));
    const after = run(["inspect", file, "--format", "json"]);
    assert.deepEqual(JSON.parse(after.stdout).nodes[1], { path: [2], type: "list", ...updated });
    assert.match(run(["inspect", file]).stdout, /style=lower-alpha delimiter="\)"/);
    assert.match(run(["inspect", file]).stdout, /style=lower-roman/);
    assert.equal(serialize(parse(saved)), saved);

    const valid = JSON.stringify({ ordered: false, items: [{ content: text("x") }] });
    for (const [args, target] of [
      [["update-list", file, "--path", "1", "--list", valid], file],
      [["insert-list", file, "--at", "2", "--list", "{"], file],
      [["insert-list", file, "--at", "2", "--list", JSON.stringify({ ordered: false, items: [] })], file],
    ] as const) {
      const before = readFileSync(target, "utf8");
      const result = run([...args]);
      assert.equal(result.status, 1, args.join(" "));
      assert.equal(readFileSync(target, "utf8"), before, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI inserts and updates code blocks through Core and rejects invalid code without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-code-"));
  const file = path.join(dir, "doc.md");
  writeFileSync(file, nativeSource("# Setup\n"));
  try {
    const insert = run(["insert-code-block", file, "--at", "2", "--language", "python", "--code", "def f():\n\treturn 1\n"]);
    assert.equal(insert.status, 0, insert.stderr);
    const inspected = run(["inspect", file, "--format", "json"]);
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.deepEqual((JSON.parse(inspected.stdout) as { nodes: unknown[] }).nodes[1],
      { path: [2], type: "code", language: "python", code: "def f():\n\treturn 1\n" });

    const update = run(["update-code-block", file, "--path", "2", "--language", "py"]);
    assert.equal(update.status, 0, update.stderr);
    const saved = readFileSync(file, "utf8");
    assert.equal(saved, nativeSource("# Setup\n\n```py\ndef f():\n\treturn 1\n\n```\n"));
    assert.equal(serialize(parse(saved)), saved);
    assert.match(run(["inspect", file]).stdout, /^2 code language="py" code="def f\(\):\\n\\treturn 1\\n"$/m);

    for (const [args, target] of [
      [["update-code-block", file, "--path", "1", "--code", "x"], file],
      [["update-code-block", file, "--path", "2"], file],
      [["insert-code-block", file, "--at", "2", "--language", "two words", "--code", "x"], file],
    ] as const) {
      const before = readFileSync(target, "utf8");
      const result = run([...args]);
      assert.equal(result.status, 1, args.join(" "));
      assert.equal(readFileSync(target, "utf8"), before, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI shows heading sections and moves or removes a section through Core", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-section-"));
  const file = path.join(dir, "doc.md");
  writeFileSync(file, nativeSource("# One\n\n(sec-a)=\n## A\n\nBody A.\n\n### A.1\n\n## B\n\nBody B.\n"));
  try {
    const inspected = run(["inspect", file]);
    assert.equal(inspected.status, 0, inspected.stderr);
    // Section A: its target, heading, body and subsection A.1.
    assert.match(inspected.stdout, /^3 heading level=2 .* section=\[2,6\)$/m);
    const json = JSON.parse(run(["inspect", file, "--format", "json"]).stdout) as { nodes: { path: number[]; section?: unknown }[] };
    assert.deepEqual(json.nodes.find(node => node.path[0] === 3)?.section, { start: 2, end: 6 });
    const before = readFileSync(file, "utf8");
    const into = run(["move-section", file, "--from", "3", "--to", "5"]);
    assert.equal(into.status, 1);
    assert.match(into.stderr, /cannot move into itself/);
    assert.equal(readFileSync(file, "utf8"), before);
    assert.equal(run(["move-section", file, "--from", "3", "--to", "8"]).status, 0);
    assert.equal(readFileSync(file, "utf8"), nativeSource("# One\n\n## B\n\nBody B.\n\n(sec-a)=\n\n## A\n\nBody A.\n\n### A.1\n"));
    assert.equal(run(["remove-section", file, "--at", "5"]).status, 0);
    assert.equal(readFileSync(file, "utf8"), nativeSource("# One\n\n## B\n\nBody B.\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI creates a table, adds, moves and removes rows and columns, and aligns columns through Core, rejecting invalid shapes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-table-insert-"));
  const file = path.join(dir, "doc.md");
  writeFileSync(file, nativeSource("# Ratings\n"));
  try {
    const steps = [
      ["insert-table", file, "--at", "2", "--cells", JSON.stringify([["Port", "Type"], ["U", "AC"]]), "--align", JSON.stringify(["left", "right"])],
      ["insert-table-row", file, "--path", "2", "--at", "2"],
      ["insert-table-column", file, "--path", "2", "--at", "1"],
      ["update-table-cell", file, "--path", "2,2,0", "--text", "P"],
    ];
    for (const args of steps) {
      const result = run(args);
      assert.equal(result.status, 0, `${args[0]}: ${result.stderr}`);
    }
    const saved = readFileSync(file, "utf8");
    assert.equal(saved, nativeSource("# Ratings\n\n:::{table}\n\n| Port |   | Type |\n| :--- | - | ---: |\n| U    |   |   AC |\n| P    |   |      |\n:::\n"));
    assert.equal(serialize(parse(saved)), saved);
    const invalid: [string[], RegExp?][] = [
      [["insert-table", file, "--at", "1", "--cells", "[[\"A\",\"B\"],[\"x\"]]"]],
      [["insert-table", file, "--at", "1", "--cells", "not json"], /--cells must be JSON/],
      [["insert-table", file, "--at", "1", "--cells", "[]"]],
      [["insert-table-row", file, "--path", "2", "--at", "0"], /from 1 to 3/],
      [["insert-table-column", file, "--path", "1", "--at", "0"]],
    ];
    for (const [args, reason] of invalid) {
      const result = run(args);
      assert.equal(result.status, 1, args.join(" "));
      assert.equal(readFileSync(file, "utf8"), saved, args.join(" "));
      if (reason) assert.match(result.stderr, reason);
    }
    // Rows and columns are reordered, removed and realigned through the same Core operations as the Editor.
    for (const args of [
      ["move-table-row", file, "--path", "2", "--from", "2", "--to", "1"],
      ["move-table-column", file, "--path", "2", "--from", "2", "--to", "0"],
      ["remove-table-column", file, "--path", "2", "--at", "2"],
      ["update-table-alignment", file, "--path", "2", "--column", "0", "--align", "none"],
      ["remove-table-row", file, "--path", "2", "--at", "2"],
    ]) {
      const result = run(args);
      assert.equal(result.status, 0, `${args[0]}: ${result.stderr}`);
    }
    const reshaped = readFileSync(file, "utf8");
    assert.equal(reshaped, nativeSource("# Ratings\n\n:::{table}\n\n| Type | Port |\n| ---- | :--- |\n|      | P    |\n:::\n"));
    for (const [args, reason] of [
      [["remove-table-row", file, "--path", "2", "--at", "0"], /from 1 to 1/],
      [["update-table-alignment", file, "--path", "2", "--column", "0", "--align", "justify"], /--align must be/],
    ] as [string[], RegExp][]) {
      const result = run(args);
      assert.equal(result.status, 1, args.join(" "));
      assert.equal(readFileSync(file, "utf8"), reshaped, args.join(" "));
      assert.match(result.stderr, reason);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI paragraph commands keep ordinary links and {eq} references, and retain section references", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-links-"));
  const file = path.join(dir, "links.md");
  writeFileSync(file, nativeSource("Go to [the site](https://a.example) now.\n\nSee {eq}`eq-a`, there.\n\nSee {ref}`sec-a` there.\n"));
  try {
    const inspected = run(["inspect", file]);
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.match(inspected.stdout, /^1 paragraph inlineEditable=true text="Go to the site now\."$/m);
    assert.match(inspected.stdout, /^2 paragraph inlineEditable=true text="See \{eq\}`eq-a`, there\."$/m);
    const split = run(["split-paragraph", file, "--path", "1", "--offset", "8"]);
    assert.equal(split.status, 0, split.stderr);
    // A reference is one offset unit.
    assert.equal(run(["split-paragraph", file, "--path", "3", "--offset", "5"]).status, 0);
    assert.equal(readFileSync(file, "utf8"),
      nativeSource("Go to [th](https://a.example)\n\n[e site](https://a.example) now.\n\nSee {eq}`eq-a`\n\n, there.\n\nSee {ref}`sec-a` there.\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test("CLI writes typed straight quotes as written and formats byte-order-marked files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-input-safety-"));
  try {
    const file = path.join(dir, "quotes.md");
    writeFileSync(file, nativeSource("# Title\n\nHello.\n"));
    for (const args of [
      ["replace-text", file, "--from", "Hello.", "--to", "Don't panic."],
      ["insert-block", file, "--at", "3", "--text", 'The state is "READY".'],
      ["insert-heading", file, "--at", "2", "--level", "2", "--text", "What's new"],
    ]) {
      const result = run(args);
      assert.equal(result.status, 0, result.stderr);
    }
    assert.equal(readFileSync(file, "utf8"), nativeSource("# Title\n\n## What's new\n\nDon't panic.\n\nThe state is \"READY\".\n"));

    const marked = path.join(dir, "bom.md");
    writeFileSync(marked, "\uFEFF" + nativeSource("# Heading\n\nBody.\n"));
    const formatted = run(["format", marked]);
    assert.equal(formatted.status, 0, formatted.stderr);
    assert.equal(readFileSync(marked, "utf8"), nativeSource("# Heading\n\nBody.\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("native create and admission keep existing files intact and report structured errors", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-native-cli-"));
  const file = path.join(dir, "new.md");
  try {
    const created = run(["create", file]);
    assert.equal(created.status, 0, created.stderr);
    const source = readFileSync(file, "utf8");
    assert.deepEqual(getEditableDocument(parse(source)).blocks, []);
    assert.equal(runProcess(["create", file]).status, 1);
    assert.equal(readFileSync(file, "utf8"), source);
    const nested = path.join(dir, "missing", "new.md");
    assert.equal(run(["create", nested]).status, 1);
    assert.deepEqual(readdirSync(dir), ["new.md"]);
    for (const args of [["check", file], ["check", file, "--format", "json"]]) assert.equal(run(args).status, 0);
    const unsupported = "# Older document\r\n\r\nKeep these exact bytes.\r\n";
    writeFileSync(file, unsupported);
    for (const args of [["check", file], ["inspect", file], ["format", file], ["replace-text", file, "--from", "Older", "--to", "Changed"]]) {
      const rejected = run(args);
      assert.equal(rejected.status, 1, args.join(" "));
      assert.match(rejected.stderr, /ieumdoc: 1/);
      assert.equal(readFileSync(file, "utf8"), unsupported);
    }
    const json = run(["check", file, "--format", "json"]);
    assert.equal(json.status, 1);
    const result = JSON.parse(json.stdout);
    assert.equal(result.ok, false);
    assert.deepEqual(result.validation, { valid: false });
    assert.equal(result.error.code, "native-marker");
    assert.equal(result.error.line, 1);
    assert.equal(result.nodes, undefined);
    // A non-native write refusal keeps the same JSON envelope and passes through Core's code.
    const unpreservable = nativeSource("[^unused]: Definition.\n");
    writeFileSync(file, unpreservable);
    const refusal = run(["check", file, "--format", "json"]);
    assert.equal(refusal.status, 1);
    const diagnostic = JSON.parse(refusal.stdout);
    assert.equal(diagnostic.error.code, "invalid-footnote");
    assert.ok(diagnostic.error.reason && diagnostic.error.action);
    assert.equal(readFileSync(file, "utf8"), unpreservable);

  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("single and batch metadata edits report the Core guidance and preserve original bytes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-metadata-"));
  const file = path.join(dir, "empty.md");
  const operationsFile = path.join(dir, "operations.json");
  const message = "block 0 is the document metadata; body blocks start at 1";
  try {
    assert.equal(run(["create", file]).status, 0);
    const original = readFileSync(file);
    assert.deepEqual(run(["insert-block", file, "--at", "0", "--text", "Hello"]),
      { status: 1, stdout: "", stderr: `${message}\n` });
    assert.deepEqual(readFileSync(file), original);
    writeFileSync(operationsFile, JSON.stringify([
      { command: "insert-block", at: 1, text: "Unsaved draft" },
      { command: "insert-heading", at: 0, level: 1, text: "Title" },
    ]));
    assert.deepEqual(run(["apply-batch", file, "--operations", operationsFile]),
      { status: 1, stdout: "", stderr: `operation 2 (insert-heading): ${message}; nothing was written\n` });
    assert.deepEqual(readFileSync(file), original);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("check warns about references a removal left without a target, without failing or writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-check-references-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("# Title\n\nSee {numref}`fig-a` and [the figure](#fig-a).\n\n:::{figure} ./a.png\n:label: fig-a\n:::\n"));
  try {
    const removed = run(["remove-block", file, "--at", "3"]);
    assert.equal(removed.status, 0, removed.stderr);
    const after = readFileSync(file, "utf8");
    assert.match(after, /\[the figure\]\(#fig-a\)/, "the link stays as written");
    const text = run(["check", file]);
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /\nwriteability ok\n$/);
    assert.equal(text.stderr, "warning: {numref}`fig-a` (block 2, line 7) names no target in this document\n" +
      "warning: link #fig-a (block 2, line 7) names no target in this document\n");
    const json = run(["check", file, "--format", "json"]);
    assert.equal(json.status, 0, json.stderr);
    assert.deepEqual(JSON.parse(json.stdout).references, {
      unresolved: [{ role: "numref", label: "fig-a", path: [2], line: 7 }, { link: "#fig-a", label: "fig-a", path: [2], line: 7 }],
    });
    assert.equal(readFileSync(file, "utf8"), after, "check never writes");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});


test("check exposes Core's MyST lookup failure reason in text and JSON without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-check-myst-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, nativeSource("[figure](#toString)\n\n:::{figure} ./a.png\n:name: toString\n\nCaption.\n:::\n"));
  try {
    const original = readFileSync(file);
    const reason = 'MyST target lookup for "toString" hits an inherited Object.prototype property and cannot process references';
    const text = run(["check", file]);
    assert.equal(text.status, 0, text.stderr);
    assert.ok(text.stderr.includes(`warning: link #toString (block 1, line 5) ${reason}\n`));
    const json = run(["check", file, "--format", "json"]);
    assert.equal(json.status, 0, json.stderr);
    const report = JSON.parse(json.stdout);
    assert.equal(report.ok, true);
    assert.deepEqual(report.references.unresolved, [
      { link: "#toString", label: "toString", reason, path: [1], line: 5 },
    ]);
    assert.deepEqual(readFileSync(file), original);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("check and edit previews retain original literal-syntax warnings through literal writes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-check-footnote-"));
  const file = path.join(dir, "document.md");
  const operations = path.join(dir, "operations.json");
  const source = nativeSource("Loss [^loss] here.\n\nSee [details][missing].\n\n![missing][]\n\nCode `tick without end.\n");
  writeFileSync(file, source);
  writeFileSync(operations, JSON.stringify([{ command: "format" }, { command: "format" }]));
  try {
    const text = run(["check", file]);
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /\nwriteability ok\n$/);
    assert.equal(text.stderr, "warning: footnote [^loss] (block 1, line 5) has no definition in this document\n" +
      'warning: reference link "[details][missing]" (block 2, line 7) has no definition in this document\n' +
      'warning: reference image "![missing][]" (block 3, line 9) has no definition in this document\n' +
      'warning: inline code "`" (block 4, line 11) has no closing backtick run; parsed as literal text\n');
    const json = run(["check", file, "--format", "json"]);
    assert.equal(json.status, 0, json.stderr);
    assert.equal(json.stderr, "");
    const report = JSON.parse(json.stdout);
    assert.equal(report.ok, true);
    assert.deepEqual(report.references.unresolved, [
      { footnote: true, label: "loss", path: [1], line: 5 },
      { syntax: "reference-link", label: "missing", source: "[details][missing]", path: [2], line: 7 },
      { syntax: "reference-image", label: "missing", source: "![missing][]", path: [3], line: 9 },
      { syntax: "inline-code", source: "`", path: [4], line: 11 },
    ]);
    assert.equal(readFileSync(file, "utf8"), source, "check never writes");
    const warning = "warning: footnote [^loss] (block 1, line 5) has no definition; written as literal \\[^loss]\n" +
      'warning: reference link "[details][missing]" (block 2, line 7) has no definition; written as literal text\n' +
      'warning: reference image "![missing][]" (block 3, line 9) has no definition; written as literal text\n' +
      'warning: inline code "`" (block 4, line 11) has no closing backtick run; written as literal text\n';
    for (const args of [["format", file], ["insert-block", file, "--at", "1", "--text", "Added."],
      ["apply-batch", file, "--operations", operations]]) {
      writeFileSync(file, source);
      const textPreview = run([...args, "--dry-run"]);
      assert.equal(textPreview.status, 0, textPreview.stderr);
      assert.equal(textPreview.stderr, warning, "report original intent once, including after two canonical batch steps");
      assert.deepEqual(readFileSync(file), Buffer.from(source));
      const jsonPreview = run([...args, "--dry-run", "--format", "json"]);
      assert.equal(jsonPreview.status, 0, jsonPreview.stderr);
      assert.equal(jsonPreview.stderr, warning, "JSON also emits the same original-source stderr warning");
      const preview = JSON.parse(jsonPreview.stdout);
      assert.equal(preview.ok, true);
      assert.deepEqual(preview.originalWarnings, report.references.unresolved, "original Core diagnostics retain their shape and locations");
      assert.deepEqual(preview.references.unresolved, [], "result diagnostics describe the escaped canonical output");
      assert.equal(preview.revision, textRevision(preview.markdown));
      assert.match(textPreview.stdout, /writeability ok\n--- markdown ---\n/);
      assert.ok(textPreview.stdout.endsWith(preview.markdown));
      assert.deepEqual(readFileSync(file), Buffer.from(source));
      const written = run(args);
      assert.equal(written.status, 0, written.stderr);
      assert.equal(written.stdout, "");
      assert.equal(written.stderr, textPreview.stderr);
      assert.deepEqual(readFileSync(file), Buffer.from(preview.markdown));
      assert.equal(run(["check", file]).stderr, "", "escaped literal no longer warns");
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI writes warn once per original footnote occurrence, keeping literal bytes and stdout", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-write-footnote-"));
  const file = path.join(dir, "document.md");
  const operationsFile = path.join(dir, "operations.json");
  const source = nativeSource("Loss [^loss] and [^loss], \\[^literal].\n\nOther.\n");
  const canonicalBody = "Loss \\[^loss] and \\[^loss], \\[^literal].\n\nOther.\n";
  const warning = "warning: footnote [^loss] (block 1, line 5) has no definition; written as literal \\[^loss]\n";
  const operations = [
    { command: "insert-block", at: 1, text: "Added [^new]." },
    { command: "replace-text", from: "Other.", to: "Changed." },
  ];
  writeFileSync(operationsFile, JSON.stringify(operations));
  try {
    const cases = [
      { args: ["format", file], expected: nativeSource(canonicalBody) },
      { args: ["insert-block", file, "--at", "1", "--text", "Added [^new]."],
        expected: nativeSource("Added \\[^new].\n\n" + canonicalBody) },
      ...[false, true].map(json => ({
        args: ["apply-batch", file, "--operations", operationsFile, ...(json ? ["--format", "json"] : [])],
        expected: nativeSource("Added \\[^new].\n\n" + canonicalBody.replace("Other.", "Changed.")),
      })),
    ];
    for (const { args, expected } of cases) {
      writeFileSync(file, source);
      const written = run(args);
      assert.equal(written.status, 0, written.stderr);
      assert.equal(written.stderr, warning + warning, "report original occurrences only, before their block moved");
      assert.equal(written.stdout, args.includes("json")
        ? JSON.stringify({ ok: true, command: "apply-batch", applied: operations.length, revision: textRevision(expected) }) + "\n"
        : "");
      assert.equal(readFileSync(file, "utf8"), expected);
    }
    writeFileSync(file, source);
    const refused = run(["insert-block", file, "--at", "0", "--text", "Added."]);
    assert.equal(refused.status, 1);
    assert.equal(refused.stdout, "");
    assert.doesNotMatch(refused.stderr, /warning:/);
    assert.deepEqual(run(["insert-block", file, "--at", "0", "--text", "Added.", "--dry-run"]), refused);
    assert.equal(readFileSync(file, "utf8"), source);
    writeFileSync(operationsFile, JSON.stringify([operations[0], { command: "remove-block", at: 999 }]));
    const failed = run(["apply-batch", file, "--operations", operationsFile, "--format", "json"]);
    assert.equal(failed.status, 1);
    assert.equal(failed.stdout, "");
    assert.match(failed.stderr, /operation 2 \(remove-block\):.*nothing was written/);
    assert.doesNotMatch(failed.stderr, /warning:/);
    assert.deepEqual(run(["apply-batch", file, "--operations", operationsFile, "--format", "json", "--dry-run"]), failed);
    assert.equal(readFileSync(file, "utf8"), source);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI format and text editing preserve front matter through the Core writer", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-front-matter-"));
  try {
    for (const [name, source] of [
      ["front-matter.md", "---\nieumdoc: 1\n---\n\n# Heading\n"],
      ["bom-front-matter.md", "\uFEFF---\nieumdoc: 1\n---\n\n# Heading\n"],
    ]) {
      const file = path.join(dir, name);
      writeFileSync(file, source);
      for (const args of [["format", file], ["replace-text", file, "--from", "Heading", "--to", "Changed"]]) {
        const result = run(args);
        assert.equal(result.status, 0, `${name} ${args[0]}`);
        assert.equal(readFileSync(file, "utf8"), `---\nieumdoc: 1\n---\n\n# ${args[0] === "format" ? "Heading" : "Changed"}\n`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Core rejects lossy text updates before CLI overwrites a real file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-lossy-"));
  const file = path.join(dir, "document.md");
  try {
    writeFileSync(file, nativeSource("Original.\n"));
    const before = readFileSync(file);
    const result = run(["update-node-text", file, "--path", "1", "--from", "Original.", "--to", "A\n\nB"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /round-trip/);
    assert.deepEqual(readFileSync(file), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("replace-text and insert-block reject lossy text without overwriting file bytes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-canonical-writes-"));
  const file = path.join(dir, "document.md");
  try {
    writeFileSync(file, nativeSource("Original.\r\n"));
    const before = readFileSync(file);
    for (const args of [
      ["replace-text", file, "--from", "Original.", "--to", "A\n\nB"],
      ["insert-block", file, "--at", "2", "--text", "A\n\nB"],
    ]) {
      const result = run(args);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /round-trip/);
      assert.deepEqual(readFileSync(file), before);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("paragraph CLI help discovers the offset and path contracts", () => {
  const top = run(["help"]).stdout;
  for (const command of ["insert-hard-break", "split-paragraph", "merge-paragraph"]) {
    assert.ok(top.includes(command));
    const help = run(["help", command]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /ieumdoc inspect <file>/);
    assert.match(help.stdout, /run inspect again/);
    assert.equal(run([command, "--help"]).stdout, help.stdout);
    if (command !== "merge-paragraph") assert.match(help.stdout, /UTF-16.*\nA hard break and an inline math expression each count as one character position/);
    else assert.match(help.stdout, /No automatic space/);
  }
});

test("real-file paragraph workflow matches Core and remains canonical", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-paragraph-"));
  const file = path.join(dir, "document.md");
  copyFileSync(technicalFixture, file);
  try {
    let expected = parse(readFileSync(file, "utf8"));
    const index = getEditableDocument(expected).blocks.find(b => b.block === "paragraph")!.path[0];
    const execute = (args: string[]) => {
      const result = run(args);
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    assert.ok(execute(["inspect", file]).includes(`${index} paragraph`));
    expected = splitParagraph(expected, [index], 2);
    execute(["split-paragraph", file, "--path", String(index), "--offset", "2"]);
    assert.equal(readFileSync(file, "utf8"), serialize(expected));
    assert.ok(execute(["inspect", file]).includes(`${index + 1} paragraph`));
    execute(["check", file]);
    expected = insertHardBreak(expected, [index + 1], 2);
    execute(["insert-hard-break", file, "--path", String(index + 1), "--offset", "2"]);
    assert.equal(readFileSync(file, "utf8"), serialize(expected));
    assert.ok(execute(["inspect", file]).includes('\\n'));
    execute(["check", file]);
    expected = mergeParagraphWithPrevious(expected, [index + 1]);
    execute(["merge-paragraph", file, "--path", String(index + 1)]);
    assert.equal(readFileSync(file, "utf8"), serialize(expected));
    execute(["inspect", file]);
    execute(["check", file]);
    const saved = readFileSync(file, "utf8");
    for (let i = 0; i < 2; i++) {
      execute(["format", file]);
      assert.equal(readFileSync(file, "utf8"), saved);
    }
    for (const command of ["split-paragraph", "insert-hard-break"]) {
      assert.equal(run([command, file, "--path", String(index), "--offset", "0"]).status, 1);
      assert.equal(readFileSync(file, "utf8"), saved);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test("CLI check and format refuse table source options without changing file bytes", async (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-table-options-"));
  const file = path.join(dir, "document.md");
  try {
    // Core native.test.ts owns the syntax matrix. Here each command must relay
    // a Core admission error and leave the original BOM/CRLF bytes untouched.
    const body = ":::{table} Values\n:align: left\n\n| A | B |\n|---|---|\n| x | y |\n:::\n";
    for (const command of ["check", "format"]) {
      await t.test(command, () => {
        writeFileSync(file, "\uFEFF" + nativeSource(body).replaceAll("\n", "\r\n"));
        const before = readFileSync(file);
        const result = run([command, file]);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, /Unsupported native content/);
        assert.deepEqual(readFileSync(file), before);
      });
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("CLI authors table captions and labels through Core and rejects multiline captions without writing", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-table-caption-"));
  const file = path.join(dir, "table.md");
  writeFileSync(file, nativeSource("| A |\n|---|\n| 1 |\n"));
  const numbers = () => {
    const result = run(["inspect", file, "--format", "json"]);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).nodes.filter((node: { type: string }) => node.type === "table")
      .map((node: { captionNumberText: string }) => node.captionNumberText);
  };
  try {
    assert.deepEqual(numbers(), ["Table 1"]);
    for (const args of [
      ["update-table-caption", file, "--path", "1", "--text", "Values"],
      ["update-label", file, "--path", "1", "--label", "tbl-values"],
    ]) { const result = run(args); assert.equal(result.status, 0, result.stderr); }
    const saved = readFileSync(file, "utf8");
    assert.match(saved, /:::\{table\} Values\n:name: tbl-values/);
    const result = run(["update-table-caption", file, "--path", "1", "--text", "two\nlines"]);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(file, "utf8"), saved);
    for (const args of [
      ["update-table-caption", file, "--path", "1", "--text", ""],
      ["update-label", file, "--path", "1", "--label", ""],
    ]) {
      const changed = run(args);
      assert.equal(changed.status, 0, changed.stderr);
      assert.deepEqual(numbers(), ["Table 1"]);
    }
    assert.match(readFileSync(file, "utf8"), /:::\{table\}\n\n\| A \|/);
    const inserted = run(["insert-table", file, "--at", "end", "--cells", '[[""],[""]]']);
    assert.equal(inserted.status, 0, inserted.stderr);
    assert.deepEqual(numbers(), ["Table 1", "Table 2"]);
    assert.equal(readFileSync(file, "utf8").match(/:::\{table\}/g)?.length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test("CLI heading numbering persists document settings and exposes the computed numbers", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-heading-numbering-"));
  const file = path.join(dir, "headings.md");
  writeFileSync(file, nativeSource("# Title\n\n## First\n\n### Detail\n"));
  try {
    const changed = run(["update-heading-numbering", file, "--enabled", "true"]);
    assert.equal(changed.status, 0, changed.stderr);
    const saved = readFileSync(file, "utf8");
    assert.match(saved, /headings: true/);
    assert.doesNotMatch(saved, /## 1/);
    const inspected = run(["inspect", file, "--format", "json"]);
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.deepEqual(JSON.parse(inspected.stdout).nodes.filter((node: {type:string}) => node.type === "heading").map((node: {headingNumber?: string}) => node.headingNumber), ["1", "1.1", "1.1.1"]);
    assert.deepEqual(JSON.parse(inspected.stdout).nodes.filter((node: {type:string}) => node.type === "heading").map((node: {referenceText?: string}) => node.referenceText), ["§ 1", "§ 1.1", "§ 1.1.1"]);
    const invalid = run(["update-heading-numbering", file, "--enabled", "yes"]);
    assert.notEqual(invalid.status, 0);
    assert.equal(readFileSync(file, "utf8"), saved);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("CLI bibliography roots are explicit and warnings preserve actual Markdown and BibTeX files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-bibliography-"));
  const chapter = path.join(dir, "chapters"); fs.mkdirSync(chapter);
  const file = path.join(chapter, "paper.md"), bibFile = path.join(dir, "refs.bib");
  const bib = Buffer.from("% external source\r\n@article{a,author={Zhang, Wei},title={Study},journal={Journal},year={2024}}\r\n");
  const source = "---\nieumdoc: 1\nbibliography: [../refs.bib]\n---\n\n{cite:p}`a,missing,a`\n";
  writeFileSync(file, source); writeFileSync(bibFile, bib);
  try {
    for (const command of ["check", "inspect", "format"]) {
      const tail = command === "format" ? ["--dry-run"] : [];
      const denied = run([command, file, ...tail, "--format", "json"]);
      assert.equal(denied.status, 0, denied.stderr);
      assert.deepEqual(JSON.parse(denied.stdout).citations.references.map((r: { status: string }) => r.status), ["unverified", "unverified"]);
      const allowed = run([command, file, ...tail, "--bibliography-root", dir, "--format", "json"]);
      assert.equal(allowed.status, 0, allowed.stderr);
      const report = JSON.parse(allowed.stdout).citations;
      assert.deepEqual(report.references.map((r: { status: string }) => r.status), ["complete", "unresolved"]);
      assert.equal(report.readiness.complete, false);
      assert.equal(report.references[0].text, "[1] W. Zhang, “Study,” Journal, 2024.");
      assert.equal(readFileSync(file, "utf8"), source);
      assert.deepEqual(readFileSync(bibFile), bib);
    }
    const changed = run(["replace-text", file, "--from", "a", "--to", "b", "--bibliography-root", dir]);
    // Citation atoms are not rewritten by ordinary text replacement.
    assert.equal(changed.status, 1);
    assert.equal(readFileSync(file, "utf8"), source);
    const formatted = run(["format", file]);
    assert.equal(formatted.status, 0, formatted.stderr);
    assert.match(formatted.stderr, /bibliography-unreadable/);
    const canonical = readFileSync(file, "utf8");
    assert.match(canonical, /\{cite:p\}`a,missing,a`/);
    assert.doesNotMatch(canonical, /Study|References|\[1\]/);
    writeFileSync(bibFile, "@article{a,author={Zhang, Wei},title={Updated},journal={Journal},year={2024}}");
    const refreshed = run(["inspect", file, "--bibliography-root", dir, "--format", "json"]);
    assert.match(JSON.parse(refreshed.stdout).citations.references[0].text, /Updated/);
    const afterExternal = readFileSync(bibFile);
    writeFileSync(bibFile, "@article{broken");
    const invalid = run(["format", file, "--bibliography-root", dir, "--dry-run", "--format", "json"]);
    assert.equal(invalid.status, 0, invalid.stderr);
    assert.ok(JSON.parse(invalid.stdout).citations.readiness.diagnostics.some((d: { code: string }) => d.code === "bibliography-invalid"));
    assert.equal(readFileSync(bibFile, "utf8"), "@article{broken");
    writeFileSync(bibFile, afterExternal);
    assert.equal(run(["insert-block", file, "--at", "end", "--text", "Editable despite unavailable resources."]).status, 0);
    assert.deepEqual(readFileSync(bibFile), afterExternal);
    assert.match(readFileSync(file, "utf8"), /Editable despite unavailable resources/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test("CLI reference templates set partial values, inspect computed text, and reset without rewriting rejected input", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-reference-templates-"));
  const file = path.join(dir, "refs.md");
  writeFileSync(file, nativeSource("```{math}\n:label: eq-a\na\n```\n\n:::{figure} ./a.png\n:label: fig-a\n:::\n\n:::{table} Data\n:label: tbl-a\n| a |\n| - |\n| 1 |\n:::\n"));
  const display = (references: string[], captions: string[]) => {
    const result = run(["inspect", file, "--format", "json"]);
    assert.equal(result.status, 0, result.stderr);
    const nodes = JSON.parse(result.stdout).nodes;
    assert.deepEqual(nodes.filter((node: {referenceText?: string}) => node.referenceText).map((node: {referenceText: string}) => node.referenceText), references);
    assert.deepEqual(nodes.filter((node: {captionNumberText?: string}) => node.captionNumberText).map((node: {captionNumberText: string}) => node.captionNumberText), captions);
  };
  try {
    display(["(1)", "Figure\u00a01", "Table\u00a01"], ["Figure 1", "Table 1"]);
    const changed = run(["update-reference-templates", file, "--figure", "그림 %s", "--table", "표 %s", "--equation", "식 (%s)"]);
    assert.equal(changed.status, 0, changed.stderr);
    display(["식 (1)", "그림 1", "표 1"], ["그림 1", "표 1"]);
    assert.match(readFileSync(file, "utf8"), /template: 그림 %s/);
    const partial = run(["update-reference-templates", file, "--reset", "figure"]);
    assert.equal(partial.status, 0, partial.stderr);
    display(["식 (1)", "Figure\u00a01", "표 1"], ["Figure 1", "표 1"]);
    const saved = readFileSync(file, "utf8");
    for (const args of [["--figure", "no number"], ["--equation", ""], ["--reset", "other"], ["--reset", "all", "--table", "%s"], []]) {
      assert.notEqual(run(["update-reference-templates", file, ...args]).status, 0);
      assert.equal(readFileSync(file, "utf8"), saved);
    }
    const reset = run(["update-reference-templates", file, "--reset", "all"]);
    assert.equal(reset.status, 0, reset.stderr);
    display(["(1)", "Figure\u00a01", "Table\u00a01"], ["Figure 1", "Table 1"]);
    assert.doesNotMatch(readFileSync(file, "utf8"), /numbering:/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("existing CLI inputs persist empty and whitespace-only structures and refuse unrepresentable empty equation labels without writing", () => {
  const file = path.join(fixtures, "empty-structures.md");
  for (const text of ["", " \t"]) {
    writeFileSync(file, nativeSource("Intro.\n"));
    for (const args of [
      ["insert-admonition", file, "--at", "end", "--variant", "note", "--text", text],
      ["insert-quote", file, "--at", "end", "--text", text],
      ["insert-list", file, "--at", "end", "--list", JSON.stringify({ordered: false, items: [{content: text ? [{ kind: "text", text }] : []}]})],
      ["insert-equation", file, "--at", "end", "--latex", "", "--label", "eq-empty"],
      ["format", file],
    ]) {
      const result = run(args);
      assert.equal(result.status, 0, result.stderr);
    }
    const before = readFileSync(file, "utf8");
    assert.deepEqual(getEditableDocument(parse(before)).blocks.map(block => block.block), ["paragraph", "admonition", "quote", "list", "equation"]);
    const failure = run(["update-label", file, "--path", "5", "--label", "A B"]);
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /empty equation.*label/);
    assert.equal(readFileSync(file, "utf8"), before);
  }
});

test("CLI generic text replacement writes normalized structural bodies in single and batch edits", () => {
  const file = path.join(fixtures, "whitespace-replacement.md");
  writeFileSync(file, nativeSource(":::{note}\nBody\n:::\n\n> Body\n\n3. Body\n   * Body\n4. {cite}`Alpha`\n"));
  const result = run(["replace-text", file, "--from", "Body", "--to", " "]);
  assert.equal(result.status, 0, result.stderr);
  const operations = path.join(fixtures, "whitespace-replacement.json");
  writeFileSync(operations, JSON.stringify([
    { command: "update-node-text", path: "2,0", from: "Body", to: "\t" },
    { command: "update-node-text", path: "3", from: "Body", to: " " },
  ]));
  const batch = run(["apply-batch", file, "--operations", operations]);
  assert.equal(batch.status, 0, batch.stderr);
  const saved = readFileSync(file, "utf8");
  assert.equal(saved, serialize(parse(nativeSource(":::{note}\n:::\n\n>\n\n3.\n   *\n4. {cite}`Alpha`\n"))));
  assert.equal(run(["check", file]).status, 0);
  const refused = run(["update-node-text", file, "--path", "99", "--from", "Body", "--to", " "]);
  assert.equal(refused.status, 1);
  assert.equal(readFileSync(file, "utf8"), saved);
});

test("CLI retains whitespace-label link data and refuses unrepresentable formatting without writing", () => {
  const file = path.join(fixtures, "whitespace-links.md");
  const link = { kind: "link", url: "https://example.com/important", title: "Keep destination", children: [{ kind: "text", text: " " }] };
  writeFileSync(file, nativeSource(':::{note}\n[Body](https://example.com/important "Keep destination")\n:::\n\n> [Body](https://example.com/important "Keep destination")\n\n* [Body](https://example.com/important "Keep destination")\n'));
  for (const args of [
    ["replace-text", file, "--from", "Body", "--to", " "],
    ["update-node-text", file, "--path", "2,0,0,0", "--from", "Body", "--to", " "],
    ["update-list", file, "--path", "3", "--list", JSON.stringify({ ordered: false, items: [{ content: [link] }] })],
  ]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
  }
  const saved = readFileSync(file, "utf8");
  assert.deepEqual(getEditableDocument(parse(saved)).blocks.map(block => block.block === "list" ? block.items[0].content : "content" in block ? block.content : undefined), [[link], [link], [link]]);
  assert.equal(run(["check", file]).status, 0);
  const marked = { ...link, children: [{ kind: "strong", children: link.children }] };
  for (const args of [
    ["insert-quote", file, "--at", "end", "--content", JSON.stringify([marked])],
    ["update-quote", file, "--path", "2", "--content", JSON.stringify([marked])],
    ["update-list", file, "--path", "3", "--list", JSON.stringify({ ordered: false, items: [{ content: [marked] }] })],
  ]) {
    const failure = run(args);
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /cannot.*(?:round-trip|preserved)/);
    assert.equal(readFileSync(file, "utf8"), saved);
  }
  const markedSource = nativeSource('> [**Body**](https://example.com/important "Keep destination")\n');
  writeFileSync(file, markedSource);
  for (const args of [
    ["replace-text", file, "--from", "Body", "--to", " "],
    ["update-node-text", file, "--path", "1,0,0,0,0", "--from", "Body", "--to", " "],
  ]) {
    const failure = run(args);
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /cannot.*(?:round-trip|preserved)/);
    assert.equal(readFileSync(file, "utf8"), markedSource);
  }
});


test("Figure Mermaid argument input supports atomic writes, inspect, dry-run and batch with unchanged files on errors", () => {
  const file = path.join(fixtures, "mermaid 한글.md"), batchFile = path.join(fixtures, "mermaid-batch.md");
  const operationsFile = path.join(fixtures, "mermaid-operations.json");
  const source = nativeSource("Intro.\n");
  const diagram = 'graph LR\n  A["한글 ```"] --> B';
  writeFileSync(file, source); writeFileSync(batchFile, source);
  const args = ["insert-figure", file, "--at", "end", "--mermaid", diagram, "--label", "fig-flow", "--caption", "흐름"];
  const preview = run([...args, "--dry-run", "--format", "json"]);
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(readFileSync(file, "utf8"), source);
  assert.equal(run(args).status, 0);
  const inspected = run(["inspect", file, "--format", "json"]);
  assert.equal(inspected.status, 0, inspected.stderr);
  const figure = JSON.parse(inspected.stdout).nodes.find((block: { type: string }) => block.type === "figure");
  assert.equal(figure.contentKind, "mermaid"); assert.equal(figure.mermaidSource, diagram);
  const updated = run(["update-figure", file, "--path", "2", "--mermaid", "graph TD\n  B --> C"]);
  assert.equal(updated.status, 0, updated.stderr);
  const output = readFileSync(file, "utf8");
  const invalid = run(["update-figure", file, "--path", "2", "--mermaid", ""]);
  assert.equal(invalid.status, 1); assert.match(invalid.stderr, /non-empty/);
  assert.equal(readFileSync(file, "utf8"), output);
  writeFileSync(operationsFile, JSON.stringify([
    { command: "insert-figure", at: "end", label: "fig-flow", caption: "흐름" },
    { command: "update-figure", path: 2, mermaid: "graph TD\n  B --> C" },
  ]));
  const batch = run(["apply-batch", batchFile, "--operations", operationsFile]);
  assert.equal(batch.status, 0, batch.stderr);
  assert.equal(readFileSync(batchFile, "utf8"), output);
});

test("CLI title settings support inspect, revision-safe writes, removal, batches and refusal preservation", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-title-"));
  const file = path.join(dir, "chapter.md");
  const operations = path.join(dir, "operations.json");
  const source = nativeSource("(clause)=\n# Power quality\n\n## Detail\n\nSee {ref}`clause`.\n");
  writeFileSync(file, source);
  try {
    assert.equal(JSON.parse(run(["inspect", file, "--format", "json"]).stdout).title, null);
    const changed = run(["update-title", file, "--text", "IEEE 1547 · Chapter 7", "--if-revision", textRevision(source)]);
    assert.equal(changed.status, 0, changed.stderr);
    const saved = readFileSync(file, "utf8");
    assert.equal(JSON.parse(run(["inspect", file, "--format", "json"]).stdout).title, "IEEE 1547 · Chapter 7");
    assert.match(run(["inspect", file]).stdout, /title: "IEEE 1547 · Chapter 7"/);
    assert.deepEqual(getEditableDocument(parse(saved)).blocks, getEditableDocument(parse(source)).blocks);
    for (const flags of [["--text", "**Formatted**"], ["--text", "Two\nlines"], ["--text", "Stale", "--if-revision", textRevision(source)], [], ["--text", "Both", "--remove"]]) {
      assert.notEqual(run(["update-title", file, ...flags]).status, 0);
      assert.equal(readFileSync(file, "utf8"), saved);
    }
    const preview = run(["update-title", file, "--text", "", "--dry-run", "--format", "json"]);
    assert.equal(preview.status, 0, preview.stderr);
    assert.equal(getEditableDocument(parse(JSON.parse(preview.stdout).markdown)).title, "");
    assert.equal(readFileSync(file, "utf8"), saved);
    writeFileSync(operations, JSON.stringify([{ command: "update-title", text: "Batch title" }, { command: "update-title", remove: true }]));
    const batch = run(["apply-batch", file, "--operations", operations]);
    assert.equal(batch.status, 0, batch.stderr);
    assert.equal(getEditableDocument(parse(readFileSync(file, "utf8"))).title, undefined);
    assert.equal(run(["update-title", file, "--text", "Again"]).status, 0);
    assert.equal(run(["update-title", file, "--remove"]).status, 0);
    assert.equal(getEditableDocument(parse(readFileSync(file, "utf8"))).title, undefined);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
