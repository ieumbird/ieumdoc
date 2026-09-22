import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  getEditableDocument,
  inspectDocument,
  insertParagraph,
  moveBlock,
  parse,
  removeBlock,
  replaceText,
  serialize,
  validateStructure,
} from "@ieumdoc/core";

const cliRoot = fileURLToPath(new URL("..", import.meta.url));
const fixture = fileURLToPath(
  new URL("../../core/test/fixtures/document.md", import.meta.url),
);
const technicalFixture = fileURLToPath(
  new URL("../../core/test/fixtures/technical-document.md", import.meta.url),
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
    assert.match(checked.stdout, /^structure valid\n/);
    const expectedLines = inspectDocument(parse(original)).map((block) => {
      const kind = block.kind ? `:${block.kind}` : "";
      return `${block.index} ${block.type}${kind}`;
    });
    for (const line of expectedLines) {
      assert.equal(checked.stdout.includes(line), true);
    }

    assert.equal(run(["replace-text", file, "--from", FROM, "--to", TO]).status, 0);
    assert.equal(run(["insert-block", file, "--at", "1", "--text", INSERTED]).status, 0);
    assert.equal(run(["move-block", file, "--from", "3", "--to", "1"]).status, 0);
    assert.equal(run(["remove-block", file, "--at", "4"]).status, 0);
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

test("ieumdoc help exits successfully", () => {
  for (const args of [[], ["help"], ["--help"], ["-h"]] as const) {
    const result = run([...args]);
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
    for (const name of [
      "check",
      "inspect",
      "format",
      "replace-text",
      "insert-block",
      "remove-block",
      "move-block",
      "update-node-text",
    ]) {
      assert.equal(help.includes(name), true, name);
    }
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

  const update = run(["help", "update-node-text"]);
  assert.equal(update.status, 0, update.stderr);
  assert.match(update.stdout, /ieumdoc update-node-text <file> --path <indexes> --from <text> --to <text>/);
  assert.match(update.stdout, /ieumdoc inspect <file>/);
  assert.match(update.stdout, /current document snapshot/);
  assert.equal(run(["update-node-text", "--help"]).stdout, update.stdout);

  const insert = run(["help", "insert-block"]);
  assert.match(insert.stdout, /The current implementation inserts a Paragraph block only/);
  assert.equal(run(["insert-block", "-h"]).stdout, insert.stdout);
});

test("unknown command exits 2", () => {
  const result = run(["no-such-command"]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /unknown command: no-such-command/);
  assert.equal(run(["help", "no-such-command"]).status, 2);
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
  const unsupported = listDocument.blocks.find((block) => block.block === "unsupported");
  assert.equal(unsupported?.block, "unsupported");
  if (unsupported?.block === "unsupported") {
    const listed = run(["inspect", fixture]);
    assert.equal(listed.status, 0, listed.stderr);
    assert.equal(
      listed.stdout.includes(
        `${unsupported.path.join(",")} unsupported text=${JSON.stringify(unsupported.text)}`,
      ),
      true,
    );
  }

  const quoteDir = mkdtempSync(path.join(tmpdir(), "ieumdoc-inspect-"));
  const quoteFile = path.join(quoteDir, "quoted.md");
  try {
    writeFileSync(quoteFile, 'Paragraph "quoted" text and a \\\\ slash.\n');
    const quoted = run(["inspect", quoteFile]);
    assert.equal(quoted.status, 0, quoted.stderr);
    const quotedDocument = getEditableDocument(parse(readFileSync(quoteFile, "utf8")));
    const quotedParagraph = quotedDocument.blocks[0];
    assert.equal(quotedParagraph?.block, "paragraph");
    if (quotedParagraph?.block === "paragraph") {
      assert.equal(
        quoted.stdout,
        `0 paragraph inlineEditable=${quotedParagraph.editable} text=${JSON.stringify(quotedParagraph.text)}\n`,
      );
      assert.equal(quoted.stdout.includes("\n\n"), false);
    }
  } finally {
    rmSync(quoteDir, { recursive: true, force: true });
  }

  const reference = editable.blocks.find(
    (block) => block.block === "paragraph" && block.text.includes("fig-control"),
  );
  assert.equal(reference?.block, "paragraph");
  if (reference?.block === "paragraph") {
    assert.equal(reference.editable, false);
    assert.equal(
      lines.some((line) => line.startsWith(`${reference.path.join(",")} paragraph `) && line.includes("inlineEditable=false")),
      true,
    );
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
  document = insertParagraph(document, 1, INSERTED);
  document = moveBlock(document, 3, 1);
  document = removeBlock(document, 4);
  validateStructure(document);
  return serialize(document);
}

function run(args: string[]) {
  const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"));
  const cli = path.join(cliRoot, "src", "cli.ts");
  return spawnSync(process.execPath, [tsxCli, cli, ...args], {
    encoding: "utf8",
  });
}
