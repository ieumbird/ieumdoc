import { readFileSync, writeFileSync } from "node:fs";
import {
  getEditableDocument,
  inspectDocument,
  insertParagraph,
  moveBlock,
  parse,
  removeBlock,
  replaceText,
  serialize,
  updateNodeTextAtPath,
  validateStructure,
  type Document,
  type EditableBlock,
  type EditableDocument,
  type NodePath,
} from "@ieumdoc/core";

type CommandSpec = {
  name: string;
  summary: string;
  usage: string;
  details: string[];
};

const PATH_NOTE = [
  "Paths identify nodes in the current document snapshot.",
  "Structural edits may change them.",
];

const COMMANDS: CommandSpec[] = [
  {
    name: "check",
    summary: "Validate a document",
    usage: "ieumdoc check <file>",
    details: ["Validate a document."],
  },
  {
    name: "inspect",
    summary: "Inspect semantic blocks and editable targets",
    usage: "ieumdoc inspect <file>",
    details: ["Inspect semantic blocks and editable targets.", "", ...PATH_NOTE],
  },
  {
    name: "format",
    summary: "Canonically format a document",
    usage: "ieumdoc format <file>",
    details: ["Canonically format a document."],
  },
  {
    name: "replace-text",
    summary: "Replace text through Core",
    usage: "ieumdoc replace-text <file> --from <text> --to <text>",
    details: ["Replace text through Core."],
  },
  {
    name: "insert-block",
    summary: "Insert a Paragraph block at a top-level index",
    usage: "ieumdoc insert-block <file> --at <index> --text <text>",
    details: [
      "Insert a Paragraph block at a top-level index.",
      "",
      "The current implementation inserts a Paragraph block only.",
    ],
  },
  {
    name: "remove-block",
    summary: "Remove a top-level block",
    usage: "ieumdoc remove-block <file> --at <index>",
    details: ["Remove a top-level block."],
  },
  {
    name: "move-block",
    summary: "Move a top-level block",
    usage: "ieumdoc move-block <file> --from <index> --to <index>",
    details: ["Move a top-level block."],
  },
  {
    name: "update-node-text",
    summary: "Update text at a NodePath through Core",
    usage: "ieumdoc update-node-text <file> --path <indexes> --from <text> --to <text>",
    details: [
      "Update text at a Core NodePath.",
      "",
      "Use:",
      "  ieumdoc inspect <file>",
      "",
      "to discover paths and editable targets.",
      "",
      ...PATH_NOTE,
    ],
  },
];

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (!command) {
    process.stderr.write(topLevelHelp());
    return 2;
  }
  if (command === "-h" || command === "--help") {
    process.stdout.write(topLevelHelp());
    return 0;
  }
  if (command === "help") {
    if (rest.length === 0) {
      process.stdout.write(topLevelHelp());
      return 0;
    }
    if (rest.length === 1 && findCommand(rest[0])) {
      process.stdout.write(commandHelp(rest[0]));
      return 0;
    }
    process.stderr.write(topLevelHelp());
    return 2;
  }

  const spec = findCommand(command);
  if (!spec) {
    process.stderr.write(`unknown command: ${command}\n\n${topLevelHelp()}`);
    return 2;
  }
  if (rest.includes("-h") || rest.includes("--help")) {
    process.stdout.write(commandHelp(command));
    return 0;
  }
  const [file, ...flags] = rest;
  if (!file) {
    process.stderr.write(commandHelp(command));
    return 2;
  }

  switch (command) {
    case "check": {
      const document = parse(readFile(file));
      validateStructure(document);
      process.stdout.write(`${summarize(document)}\n`);
      return 0;
    }
    case "inspect": {
      process.stdout.write(inspectFile(file));
      return 0;
    }
    case "format": {
      save(file, parse(readFile(file)));
      return 0;
    }
    case "replace-text": {
      save(file, replaceText(parse(readFile(file)), flag(flags, "--from"), flag(flags, "--to")));
      return 0;
    }
    case "insert-block": {
      save(file, insertParagraph(parse(readFile(file)), intFlag(flags, "--at"), flag(flags, "--text")));
      return 0;
    }
    case "remove-block": {
      save(file, removeBlock(parse(readFile(file)), intFlag(flags, "--at")));
      return 0;
    }
    case "move-block": {
      save(file, moveBlock(parse(readFile(file)), intFlag(flags, "--from"), intFlag(flags, "--to")));
      return 0;
    }
    case "update-node-text": {
      save(
        file,
        updateNodeTextAtPath(
          parse(readFile(file)),
          pathFlag(flags),
          flag(flags, "--from"),
          flag(flags, "--to"),
        ),
      );
      return 0;
    }
    default:
      process.stderr.write(topLevelHelp());
      return 2;
  }
}

function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find((command) => command.name === name);
}

function topLevelHelp(): string {
  const width = Math.max(...COMMANDS.map((command) => command.name.length));
  const lines = [
    "IeumDoc CLI",
    "",
    "Usage:",
    "  ieumdoc <command> [options]",
    "",
    "Commands:",
    ...COMMANDS.map((command) => `  ${command.name.padEnd(width)}  ${command.summary}`),
    "",
    "Run:",
    "  ieumdoc help <command>",
    "",
  ];
  return lines.join("\n");
}

function commandHelp(name: string): string {
  const spec = findCommand(name);
  if (!spec) return topLevelHelp();
  return ["Usage:", `  ${spec.usage}`, "", ...spec.details, ""].join("\n");
}

function inspectFile(file: string): string {
  const editable = getEditableDocument(parse(readFile(file)));
  return `${formatInspect(editable)}\n`;
}

function formatInspect(document: EditableDocument): string {
  return document.blocks.flatMap(formatBlock).join("\n");
}

function formatBlock(block: EditableBlock): string[] {
  const path = formatPath(block.path);
  if (block.block === "heading") {
    return [`${path} heading level=${block.level} editable=${block.editable} text=${quote(block.text)}`];
  }
  if (block.block === "paragraph") {
    return [`${path} paragraph editable=${block.editable} text=${quote(block.text)}`];
  }
  if (block.block === "admonition") {
    return [`${path} admonition variant=${quote(block.variant)} readonly=true text=${quote(block.text)}`];
  }
  if (block.block === "figure") {
    const captionPath = formatPath(block.caption.path);
    return [
      `${path} figure label=${quote(block.label)} readonly=true`,
      `  ${captionPath} caption editable=${block.caption.editable} text=${quote(block.caption.text)}`,
    ];
  }
  if (block.block === "equation") {
    return [`${path} equation label=${quote(block.label)} readonly=true latex=${quote(block.latex)}`];
  }
  if (block.block === "table") {
    const cells = block.rows.flatMap((row) =>
      row.cells.map(
        (cell) =>
          `  ${formatPath(cell.path)} cell header=${cell.header} editable=${cell.editable} text=${quote(cell.text)}`,
      ),
    );
    return [`${path} table readonly=true`, ...cells];
  }
  return [`${path} unsupported readonly=true text=${quote(block.text)}`];
}

function formatPath(path: NodePath): string {
  return path.join(",");
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function readFile(path: string): string {
  return readFileSync(path, "utf8");
}

function save(path: string, document: Document): void {
  validateStructure(document);
  writeFileSync(path, serialize(document));
}

function summarize(document: Document): string {
  const lines = ["structure valid"];
  for (const block of inspectDocument(document)) {
    const kind = block.kind ? `:${block.kind}` : "";
    lines.push(`${block.index} ${block.type}${kind}`);
  }
  return lines.join("\n");
}

function flag(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (index < 0 || value === undefined || value.startsWith("--")) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

function intFlag(args: string[], name: string): number {
  const raw = flag(args, name);
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

function pathFlag(args: string[]): NodePath {
  const raw = flag(args, "--path");
  const path = raw.split(",").map((part) => Number(part.trim()));
  if (path.length === 0 || path.some((index) => !Number.isInteger(index) || index < 0)) {
    throw new Error("--path must be comma-separated non-negative integers");
  }
  return path;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
