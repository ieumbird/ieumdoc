import { readFileSync, writeFileSync } from "node:fs";
import {
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
  type NodePath,
} from "@ieumdoc/core";

const USAGE = `Usage:
  ieumdoc check <file>
  ieumdoc format <file>
  ieumdoc replace-text <file> --from <text> --to <text>
  ieumdoc insert-block <file> --at <index> --text <text>
  ieumdoc remove-block <file> --at <index>
  ieumdoc move-block <file> --from <index> --to <index>
  ieumdoc update-node-text <file> --path <indexes> --from <text> --to <text>
`;

function main(argv: string[]): number {
  const [command, file, ...rest] = argv;
  if (!command || command === "-h" || command === "--help") {
    process.stdout.write(USAGE);
    return command ? 0 : 2;
  }
  if (!file) {
    process.stderr.write(USAGE);
    return 2;
  }

  switch (command) {
    case "check": {
      const document = parse(readFile(file));
      validateStructure(document);
      process.stdout.write(`${summarize(document)}\n`);
      return 0;
    }
    case "format": {
      save(file, parse(readFile(file)));
      return 0;
    }
    case "replace-text": {
      save(file, replaceText(parse(readFile(file)), flag(rest, "--from"), flag(rest, "--to")));
      return 0;
    }
    case "insert-block": {
      save(file, insertParagraph(parse(readFile(file)), intFlag(rest, "--at"), flag(rest, "--text")));
      return 0;
    }
    case "remove-block": {
      save(file, removeBlock(parse(readFile(file)), intFlag(rest, "--at")));
      return 0;
    }
    case "move-block": {
      save(file, moveBlock(parse(readFile(file)), intFlag(rest, "--from"), intFlag(rest, "--to")));
      return 0;
    }
    case "update-node-text": {
      save(
        file,
        updateNodeTextAtPath(
          parse(readFile(file)),
          pathFlag(rest),
          flag(rest, "--from"),
          flag(rest, "--to"),
        ),
      );
      return 0;
    }
    default:
      process.stderr.write(USAGE);
      return 2;
  }
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
