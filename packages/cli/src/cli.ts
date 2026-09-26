import { readFileSync, writeFileSync } from "node:fs";
import {
  canonicalWriteError,
  getEditableDocument,
  inspectDocument,
  insertParagraph,
  insertHeading,
  insertEquation,
  insertFigure,
  insertHardBreak,
  splitParagraph,
  mergeParagraphWithPrevious,
  moveBlock,
  parse,
  removeBlock,
  replaceText,
  serialize,
  updateNodeTextAtPath,
  updateEquationLatex,
  updateFigure,
  updateLabel,
  updateTableCell,
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

type OutputFormat = "text" | "json";

type ParsedArgs = {
  file: string;
  flags: string[];
  format: OutputFormat;
};

const PATH_NOTE = [
  "Paths identify nodes in the current document snapshot.",
  "Structural edits may change them.",
];

const PARAGRAPH_PATH_NOTE = [
  "Use ieumdoc inspect <file> to find a NodePath in the current snapshot.",
  "Structural edits may change paths; run inspect again after editing.",
];
const OFFSET_NOTE = [
  "Offset is measured in UTF-16 code units over rendered paragraph content.",
  "A hard break and an inline math expression each count as one character position.",
  "Offset must be strictly inside the paragraph (0 < offset < length).",
  "Edits that cannot preserve paragraph semantics in canonical Markdown are rejected.",
];
const FIGURE_NOTE = [
  "The image URL is required. An empty --alt or --caption removes that property.",
  "The caption is plain text. Values that cannot round-trip through canonical Markdown are rejected.",
];
const COMMANDS: CommandSpec[] = [
  {
    name: "insert-hard-break",
    summary: "Insert a hard break within a supported Paragraph",
    usage: "ieumdoc insert-hard-break <file> --path <indexes> --offset <number>",
    details: ["Insert a line break without creating a new paragraph.", ...OFFSET_NOTE, ...PARAGRAPH_PATH_NOTE],
  },
  {
    name: "split-paragraph",
    summary: "Split a top-level Paragraph",
    usage: "ieumdoc split-paragraph <file> --path <indexes> --offset <number>",
    details: ["Split a supported top-level paragraph; both sides must be non-empty.", ...OFFSET_NOTE, ...PARAGRAPH_PATH_NOTE],
  },
  {
    name: "merge-paragraph",
    summary: "Merge a Paragraph with the previous Paragraph",
    usage: "ieumdoc merge-paragraph <file> --path <indexes>",
    details: ["Merge the current top-level paragraph with the immediately previous paragraph.",
      "Both paragraphs must have supported inline content. No automatic space is inserted.", ...PARAGRAPH_PATH_NOTE],
  },
  {
    name: "check",
    summary: "Validate a document",
    usage: "ieumdoc check <file> [--format <text|json>]",
    details: [
      "Validate a document: its structure, and whether IeumDoc can rewrite it as canonical",
      "Markdown without losing semantics (the same check format and Editor Save use).",
      "Exits 1 when it cannot. Asset files and reference targets are not checked.",
      "Output format is text by default; JSON is available with --format json.",
    ],
  },
  {
    name: "inspect",
    summary: "Inspect semantic blocks and editable targets",
    usage: "ieumdoc inspect <file> [--format <text|json>]",
    details: [
      "Inspect semantic blocks and editable targets.",
      "",
      "Editability fields describe the current semantic projection.",
      "Other Core commands may support additional text operations.",
      "",
      ...PATH_NOTE,
    ],
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
    name: "insert-heading",
    summary: "Insert a Heading block at a top-level index",
    usage: "ieumdoc insert-heading <file> --at <index> --level <1-6> --text <text>",
    details: [
      "Insert a Heading block at a top-level index.",
      "Heading levels 1 through 6 are supported.",
    ],
  },
  {
    name: "insert-equation",
    summary: "Insert an Equation block at a top-level index",
    usage: "ieumdoc insert-equation <file> --at <index> --latex <latex>",
    details: [
      "Insert an Equation block at a top-level index.",
      "The Equation LaTeX source must be non-empty.",
    ],
  },
  {
    name: "insert-figure",
    summary: "Insert a Figure block at a top-level index",
    usage: "ieumdoc insert-figure <file> --at <index> --image <url> [--alt <text>] [--caption <text>]",
    details: [
      "Insert a Figure block at a top-level index.",
      ...FIGURE_NOTE,
      "The new Figure has no label; set one with update-label.",
    ],
  },
  {
    name: "update-figure",
    summary: "Update a Figure's image, alt text, or caption through Core",
    usage: "ieumdoc update-figure <file> --path <indexes> [--image <url>] [--alt <text>] [--caption <text>]",
    details: [
      "Update one top-level Figure through Core. Omitted properties are unchanged.",
      ...FIGURE_NOTE,
      "The Figure label is preserved; change it with update-label.",
      ...PATH_NOTE,
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
    name: "update-table-cell",
    summary: "Replace the text of a Markdown table cell through Core",
    usage: "ieumdoc update-table-cell <file> --path <table,row,cell> --text <text>",
    details: [
      "Replace the whole text of one cell in a top-level Markdown table. Use an empty --text to clear it.",
      "Only empty or plain-text cells are editable; the text must be one line without leading or trailing whitespace.",
      ...PATH_NOTE,
    ],
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
  {
    name: "update-equation-latex",
    summary: "Update Equation LaTeX through Core",
    usage: "ieumdoc update-equation-latex <file> --path <indexes> --from <latex> --to <latex>",
    details: [
      "Update one Equation's LaTeX source through Core.",
      "The label and document structure must remain unchanged.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "update-label",
    summary: "Set, change, or remove an Equation or Figure label through Core",
    usage: "ieumdoc update-label <file> --path <index> --label <label>",
    details: [
      "Set the label (reference target name) of one top-level Equation or Figure. Use an empty --label to remove it.",
      "The label must be one line without leading or trailing spaces, be referenceable, and not name another target in the document.",
      "References to the old label are not renamed.",
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
  if (isCommandHelpRequest(rest)) {
    process.stdout.write(commandHelp(command));
    return 0;
  }
  if (!rest[0]) {
    process.stderr.write(commandHelp(command));
    return 2;
  }
  const { file, flags, format } = parseCommandArgs(command, rest);

  switch (command) {
    case "insert-hard-break":
    case "split-paragraph": {
      const operation = command === "insert-hard-break" ? insertHardBreak : splitParagraph;
      save(file, operation(parse(readFile(file)), pathFlag(flags), intFlag(flags, "--offset")));
      return 0;
    }
    case "merge-paragraph": {
      save(file, mergeParagraphWithPrevious(parse(readFile(file)), pathFlag(flags)));
      return 0;
    }
    case "check": {
      const document = parse(readFile(file));
      validateStructure(document);
      const writeError = canonicalWriteError(document);
      if (format === "json") {
        process.stdout.write(`${JSON.stringify({
          ok: writeError === undefined,
          command: "check",
          validation: { valid: true },
          writeability: writeError === undefined ? { writable: true } : { writable: false, error: writeError },
        })}\n`);
      } else {
        process.stdout.write(`${summarize(document)}\n`);
        if (writeError === undefined) process.stdout.write("writeability ok\n");
        else process.stderr.write(`writeability failed: ${writeError}\n`);
      }
      return writeError === undefined ? 0 : 1;
    }
    case "inspect": {
      process.stdout.write(format === "json" ? inspectFileJson(file) : inspectFile(file));
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
    case "insert-heading": {
      save(file, insertHeading(
        parse(readFile(file)),
        intFlag(flags, "--at"),
        intFlag(flags, "--level"),
        flag(flags, "--text"),
      ));
      return 0;
    }
    case "insert-equation": {
      save(file, insertEquation(
        parse(readFile(file)),
        intFlag(flags, "--at"),
        flag(flags, "--latex"),
      ));
      return 0;
    }
    case "insert-figure": {
      save(file, insertFigure(parse(readFile(file)), intFlag(flags, "--at"), {
        imageUrl: flag(flags, "--image"),
        imageAlt: optionalFlag(flags, "--alt") ?? "",
        caption: optionalFlag(flags, "--caption") ?? "",
      }));
      return 0;
    }
    case "update-figure": {
      const changes = {
        imageUrl: optionalFlag(flags, "--image"),
        imageAlt: optionalFlag(flags, "--alt"),
        caption: optionalFlag(flags, "--caption"),
      };
      if (Object.values(changes).every((value) => value === undefined)) {
        throw new Error("update-figure requires --image, --alt, or --caption");
      }
      save(file, updateFigure(parse(readFile(file)), pathFlag(flags), changes));
      return 0;
    }
    case "update-table-cell": {
      save(file, updateTableCell(parse(readFile(file)), pathFlag(flags), flag(flags, "--text")));
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
    case "update-equation-latex": {
      save(
        file,
        updateEquationLatex(
          parse(readFile(file)),
          pathFlag(flags),
          flag(flags, "--from"),
          flag(flags, "--to"),
        ),
      );
      return 0;
    }
    case "update-label": {
      save(file, updateLabel(parse(readFile(file)), pathFlag(flags), flag(flags, "--label")));
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

function isCommandHelpRequest(args: string[]): boolean {
  if (args.length === 1) return args[0] === "-h" || args[0] === "--help";
  return args.length === 2 && !args[0].startsWith("-") && (args[1] === "-h" || args[1] === "--help");
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

const COMMAND_OPTIONS: Record<string, readonly string[]> = {
  "insert-hard-break": ["--path", "--offset"],
  "split-paragraph": ["--path", "--offset"],
  "merge-paragraph": ["--path"],
  check: ["--format"],
  inspect: ["--format"],
  format: [],
  "replace-text": ["--from", "--to"],
  "insert-block": ["--at", "--text"],
  "insert-heading": ["--at", "--level", "--text"],
  "insert-equation": ["--at", "--latex"],
  "insert-figure": ["--at", "--image", "--alt", "--caption"],
  "update-figure": ["--path", "--image", "--alt", "--caption"],
  "update-table-cell": ["--path", "--text"],
  "remove-block": ["--at"],
  "move-block": ["--from", "--to"],
  "update-node-text": ["--path", "--from", "--to"],
  "update-equation-latex": ["--path", "--from", "--to"],
  "update-label": ["--path", "--label"],
};

function parseCommandArgs(command: string, args: string[]): ParsedArgs {
  const [file, ...tokens] = args;
  if (!file || file.startsWith("-")) {
    throw new Error(`unexpected argument: ${file ?? "<missing file>"}`);
  }

  const allowed = COMMAND_OPTIONS[command] ?? [];
  const seen = new Set<string>();
  const flags: string[] = [];
  let format: OutputFormat = "text";

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      throw new Error(`unexpected argument: ${token}`);
    }
    if (!allowed.includes(token)) {
      throw new Error(`unknown option: ${token}`);
    }
    if (seen.has(token)) {
      throw new Error(`duplicate option: ${token}`);
    }
    seen.add(token);
    flags.push(token);

    const value = tokens[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing ${token}`);
    }
    if (token === "--format") {
      if (value !== "text" && value !== "json") {
        throw new Error(`--format must be text or json`);
      }
      format = value;
    } else {
      flags.push(value);
    }
    index += 1;
  }

  return { file, flags, format };
}

function inspectFile(file: string): string {
  const editable = getEditableDocument(parse(readFile(file)));
  return `${formatInspect(editable)}\n`;
}

function inspectFileJson(file: string): string {
  const editable = getEditableDocument(parse(readFile(file)));
  return `${JSON.stringify({
    ok: true,
    command: "inspect",
    nodes: machineNodes(editable),
  })}\n`;
}

type MachineNode = {
  path: number[];
  type: string;
  editable?: boolean;
  text?: string;
  [key: string]: unknown;
};

function machineNodes(document: EditableDocument): MachineNode[] {
  return document.blocks.flatMap(machineBlock);
}

function machineBlock(block: EditableBlock): MachineNode[] {
  const base = { path: [...block.path], type: block.block };
  if (block.block === "heading") {
    return [{ ...base, level: block.level, editable: block.editable, text: block.text }];
  }
  if (block.block === "paragraph") {
    return [{ ...base, editable: block.editable, text: block.text }];
  }
  if (block.block === "admonition") {
    return [{ ...base, variant: block.variant, text: block.text }];
  }
  if (block.block === "figure") {
    return [
      {
        ...base,
        editable: block.editable,
        label: block.label,
        imageUrl: block.imageUrl,
        imageAlt: block.imageAlt,
      },
      {
        path: [...block.caption.path],
        type: "caption",
        editable: block.caption.editable,
        text: block.caption.text,
      },
    ];
  }
  if (block.block === "equation") {
    return [{ ...base, label: block.label, latex: block.latex }];
  }
  if (block.block === "table") {
    return [
      base,
      ...block.rows.flatMap((row) =>
        row.cells.map((cell) => ({
          path: [...cell.path],
          type: "cell",
          header: cell.header,
          editable: cell.editable,
          text: cell.text,
        })),
      ),
    ];
  }
  return [{ ...base, text: block.text }];
}

function formatInspect(document: EditableDocument): string {
  return document.blocks.flatMap(formatBlock).join("\n");
}

function formatBlock(block: EditableBlock): string[] {
  const path = formatPath(block.path);
  if (block.block === "heading") {
    return [`${path} heading level=${block.level} textEditable=${block.editable} text=${quote(block.text)}`];
  }
  if (block.block === "paragraph") {
    return [`${path} paragraph inlineEditable=${block.editable} text=${quote(block.text)}`];
  }
  if (block.block === "admonition") {
    return [`${path} admonition variant=${quote(block.variant)} text=${quote(block.text)}`];
  }
  if (block.block === "figure") {
    const captionPath = formatPath(block.caption.path);
    return [
      `${path} figure figureEditable=${block.editable} label=${quote(block.label)} image=${quote(block.imageUrl)} alt=${quote(block.imageAlt)}`,
      `  ${captionPath} caption textEditable=${block.caption.editable} text=${quote(block.caption.text)}`,
    ];
  }
  if (block.block === "equation") {
    return [`${path} equation label=${quote(block.label)} latex=${quote(block.latex)}`];
  }
  if (block.block === "table") {
    const cells = block.rows.flatMap((row) =>
      row.cells.map(
        (cell) =>
          `  ${formatPath(cell.path)} cell header=${cell.header} textEditable=${cell.editable} text=${quote(cell.text)}`,
      ),
    );
    return [`${path} table`, ...cells];
  }
  return [`${path} unsupported text=${quote(block.text)}`];
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

function optionalFlag(args: string[], name: string): string | undefined {
  return args.includes(name) ? flag(args, name) : undefined;
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
