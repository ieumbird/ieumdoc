import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  insertBlock,
  moveBlock,
  parse,
  removeBlock,
  replaceText,
  serialize,
  validate,
} from "@ieumdoc/core";

const cliRoot = fileURLToPath(new URL("..", import.meta.url));
const fixture = fileURLToPath(
  new URL("../../core/test/fixtures/document.md", import.meta.url),
);

const FROM = "The converter regulates voltage.";
const TO = "The converter regulates voltage and current.";
const INSERTED = "Added by CLI.";

test("CLI can check and modify a real file through Core", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-"));
  const file = path.join(dir, "document.md");
  copyFileSync(fixture, file);
  const original = readFileSync(file, "utf8");

  try {
    const checked = run(["check", file]);
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /^valid\n/);
    assert.match(checked.stdout, /admonition:note/);

    assert.equal(run(["replace-text", file, "--from", FROM, "--to", TO]).status, 0);
    assert.equal(run(["insert-block", file, "--at", "1", "--text", INSERTED]).status, 0);
    assert.equal(run(["move-block", file, "--from", "3", "--to", "1"]).status, 0);
    assert.equal(run(["remove-block", file, "--at", "4"]).status, 0);
    assert.equal(run(["format", file]).status, 0);

    const after = run(["check", file]);
    assert.equal(after.status, 0, after.stderr);
    assert.match(after.stdout, /^valid\n/);

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

function corePipeline(source: string): string {
  let document = replaceText(parse(source), FROM, TO);
  document = insertBlock(document, 1, {
    type: "paragraph",
    children: [{ type: "text", value: INSERTED }],
  });
  document = moveBlock(document, 3, 1);
  document = removeBlock(document, 4);
  validate(document);
  return serialize(document);
}

function run(args: string[]) {
  const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));
  const cli = path.join(cliRoot, "src", "cli.ts");
  return spawnSync(process.execPath, [tsxCli, cli, ...args], {
    encoding: "utf8",
  });
}
