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
  insertHardBreak,
  splitParagraph,
  mergeParagraphWithPrevious,
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
      "insert-heading",
      "insert-equation",
      "insert-figure",
      "remove-block",
      "move-block",
      "update-node-text",
      "update-equation-latex",
      "update-figure",
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

  const equation = run(["help", "update-equation-latex"]);
  assert.equal(equation.status, 0, equation.stderr);
  assert.match(equation.stdout, /ieumdoc update-equation-latex <file>/);
  assert.equal(run(["update-equation-latex", "--help"]).stdout, equation.stdout);

  const insert = run(["help", "insert-block"]);
  assert.match(insert.stdout, /The current implementation inserts a Paragraph block only/);
  assert.equal(run(["insert-block", "-h"]).stdout, insert.stdout);
});

test("CLI insert-heading persists a Core heading", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-heading-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, "Intro\n");
  try {
    const result = run(["insert-heading", file, "--at", "1", "--level", "2", "--text", "Details"]);
    assert.equal(result.status, 0, result.stderr);
    const saved = readFileSync(file, "utf8");
    const blocks = getEditableDocument(parse(saved)).blocks;
    assert.deepEqual(blocks.map((block) => block.block), ["paragraph", "heading"]);
    assert.deepEqual(blocks[1], {
      block: "heading",
      path: [1],
      level: 2,
      text: "Details",
      editable: true,
    });
    assert.equal(saved, serialize(parse(saved)));
    assert.equal(run(["insert-heading", file, "--at", "0", "--level", "7", "--text", "Invalid"]).status, 1);
    assert.equal(readFileSync(file, "utf8"), saved);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI insert-equation persists a Core equation", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-equation-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, "Intro\n");
  try {
    const result = run(["insert-equation", file, "--at", "1", "--latex", "x^2 + 1"]);
    assert.equal(result.status, 0, result.stderr);
    const saved = readFileSync(file, "utf8");
    const blocks = getEditableDocument(parse(saved)).blocks;
    assert.deepEqual(blocks.map((block) => block.block), ["paragraph", "equation"]);
    assert.deepEqual(blocks[1], {
      block: "equation",
      path: [1],
      latex: "x^2 + 1",
      label: "",
    });
    assert.equal(saved, serialize(parse(saved)));
    assert.equal(run(["insert-equation", file, "--at", "0", "--latex", ""]).status, 1);
    assert.equal(readFileSync(file, "utf8"), saved);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI insert-figure persists a Core Figure", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-cli-figure-"));
  const file = path.join(dir, "document.md");
  writeFileSync(file, "Intro\n");
  try {
    const result = run(["insert-figure", file, "--at", "1", "--image", "./plot.svg", "--alt", "Plot", "--caption", "Measured plot."]);
    assert.equal(result.status, 0, result.stderr);
    const saved = readFileSync(file, "utf8");
    assert.equal(saved, "Intro\n\n:::{figure} ./plot.svg\n:alt: Plot\n\nMeasured plot.\n:::\n");
    const figure = getEditableDocument(parse(saved)).blocks[1];
    assert.equal(figure?.block, "figure");
    if (figure?.block !== "figure") return;
    assert.deepEqual(
      [figure.editable, figure.label, figure.imageUrl, figure.imageAlt, figure.caption.text],
      [true, "", "./plot.svg", "Plot", "Measured plot."],
    );
    assert.equal(run(["insert-figure", file, "--at", "0", "--image", "./only.svg"]).status, 0);
    const minimal = readFileSync(file, "utf8");
    assert.match(minimal, /^:::\{figure\} \.\/only\.svg\n:::\n/);
    for (const args of [
      ["insert-figure", file, "--at", "0", "--image", ""],
      ["insert-figure", file, "--at", "0", "--image", " ./a.svg"],
      ["insert-figure", file, "--at", "0", "--image", "./a.svg", "--caption", "cost $5 and $x$"],
      ["insert-figure", file, "--at", "9", "--image", "./a.svg"],
      ["insert-figure", file, "--at", "0", "--alt", "missing image"],
    ]) {
      assert.equal(run(args).status, 1, args.join(" "));
      assert.equal(readFileSync(file, "utf8"), minimal, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
    assert.equal(saved.includes("See [](#fig-control)"), true);

    assert.equal(run(["update-figure", file, "--path", figurePath, "--caption", "Only caption."]).status, 0);
    const partial = getEditableDocument(parse(readFileSync(file, "utf8"))).blocks.find((block) => block.block === "figure");
    assert.equal(partial?.block === "figure" && partial.imageUrl, "./diagram-v2.svg");
    assert.equal(partial?.block === "figure" && partial.caption.text, "Only caption.");

    const before = readFileSync(file);
    for (const args of [
      ["update-figure", file, "--path", "0", "--caption", "not a figure"],
      ["update-figure", file, "--path", "99", "--caption", "out of range"],
      ["update-figure", file, "--path", figurePath],
      ["update-figure", file, "--path", figurePath, "--image", ""],
      ["update-figure", file, "--path", figurePath, "--alt", "line\nbreak"],
      ["update-figure", file, "--path", figurePath, "--caption", "% comment"],
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

test("inspect and check expose stable machine-readable Core results", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-machine-contract-"));
  const file = path.join(dir, "technical-document.md");
  copyFileSync(technicalFixture, file);
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
      nodes: Array<{ path: number[]; type: string; level?: number; editable?: boolean; text?: string }>;
    };
    assert.equal(inspectResult.ok, true);
    assert.equal(inspectResult.command, "inspect");
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

    const checked = run(["check", file, "--format", "json"]);
    assert.equal(checked.status, 0, checked.stderr);
    assert.deepEqual(JSON.parse(checked.stdout), {
      ok: true,
      command: "check",
      validation: { valid: true },
    });
    const textCheck = run(["check", file]);
    const explicitTextCheck = run(["check", file, "--format", "text"]);
    assert.equal(textCheck.status, 0, textCheck.stderr);
    assert.equal(explicitTextCheck.status, 0, explicitTextCheck.stderr);
    assert.equal(explicitTextCheck.stdout, textCheck.stdout);
    assert.deepEqual(readFileSync(file), before);
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
    ]) {
      const result = run(args);
      assert.notEqual(result.status, 0, args.join(" "));
      assert.deepEqual(readFileSync(file), before, args.join(" "));
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

test("CLI format keeps semantic references distinct from fragment links", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-references-"));
  const file = path.join(dir, "technical-document.md");
  const unsupported = path.join(dir, "term.md");
  copyFileSync(technicalFixture, file);
  writeFileSync(unsupported, "See {term}`glossary`.\n");
  try {
    for (let i = 0; i < 2; i++) assert.equal(run(["format", file]).status, 0);
    const saved = readFileSync(file, "utf8");
    // CLI writes exactly Core's canonical form: the {eq} role stays a role and the
    // `[](#...)` fragment links stay links (Core's regression pins their semantics).
    assert.equal(saved, serialize(parse(readFileSync(technicalFixture, "utf8"))));
    assert.match(saved, /^See \[\]\(#fig-control\) and \{eq\}`eq-current`\.$/m);
    assert.match(saved, /^The rated current follows from \[\]\(#eq-current\)\.$/m);

    const failed = run(["format", unsupported]);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /cannot be preserved/);
    assert.equal(readFileSync(unsupported, "utf8"), "See {term}`glossary`.\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI format fails before writing when canonical Markdown would lose semantics", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-lossy-format-"));
  try {
    for (const [name, source, reason] of [
      // Layer 1: myst-to-md reports the node it cannot render.
      ["keyboard.md", "# Keys\n\nBefore {kbd}`Ctrl` after\n", /cannot be preserved in canonical Markdown: .*keyboard/],
      // Layer 2: the second subfigure is dropped without any diagnostic.
      ["subfigure.md", ":::{figure}\n![a](./a.png)\n![b](./b.png)\n:::\n", /cannot be preserved in canonical Markdown: .*container/],
    ] as const) {
      const file = path.join(dir, name);
      writeFileSync(file, source);
      const before = readFileSync(file);
      const result = run(["format", file]);
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, reason, name);
      assert.deepEqual(readFileSync(file), before, name);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Core rejects lossy text updates before CLI overwrites a real file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-lossy-"));
  const file = path.join(dir, "document.md");
  try {
    writeFileSync(file, "Original.\n");
    const before = readFileSync(file);
    const result = run(["update-node-text", file, "--path", "0", "--from", "Original.", "--to", "A\n\nB"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /round-trip/);
    assert.deepEqual(readFileSync(file), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI move-block rejects a lossy canonical reorder without overwriting the file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-lossy-reorder-"));
  const file = path.join(dir, "document.md");
  try {
    writeFileSync(file, "- A\n\nMiddle\n\n- B");
    const before = readFileSync(file);
    const result = run(["move-block", file, "--from", "2", "--to", "1"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Canonical save changed block boundaries/);
    assert.deepEqual(readFileSync(file), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("replace-text and insert-block reject lossy text without overwriting file bytes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-canonical-writes-"));
  const file = path.join(dir, "document.md");
  try {
    writeFileSync(file, "Original.\r\n");
    const before = readFileSync(file);
    for (const args of [
      ["replace-text", file, "--from", "Original.", "--to", "A\n\nB"],
      ["insert-block", file, "--at", "1", "--text", "A\n\nB"],
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
    if (command !== "merge-paragraph") assert.match(help.stdout, /UTF-16.*\nA hard break counts as one/);
    else assert.match(help.stdout, /No automatic space/);
  }
});

test("real-file paragraph workflow matches Core and remains canonical", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ieumdoc-paragraph-"));
  const file = path.join(dir, "document.md");
  copyFileSync(technicalFixture, file);
  try {
    let expected = parse(readFileSync(file, "utf8"));
    const index = getEditableDocument(expected).blocks.findIndex(b => b.block === "paragraph" && b.editable);
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
