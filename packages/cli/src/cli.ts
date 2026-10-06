import { readFileSync, writeFileSync } from "node:fs";
import {
  canonicalWriteError,
  getEditableDocument,
  ADMONITION_VARIANTS,
  isAdmonitionVariant,
  inspectDocument,
  insertParagraph,
  insertHeading,
  insertAdmonition,
  insertEquation,
  insertFigure,
  insertTable,
  insertTableRow,
  insertTableColumn,
  moveTableColumn,
  moveTableRow,
  removeTableColumn,
  removeTableRow,
  insertList,
  insertCodeBlock,
  insertHardBreak,
  splitParagraph,
  mergeParagraphWithPrevious,
  moveBlock,
  moveSection,
  parse,
  removeBlock,
  removeSection,
  sectionMarker,
  sectionRange,
  blockTargets,
  targetNumbers,
  replaceText,
  serialize,
  updateNodeTextAtPath,
  updateHeadingLevel,
  updateAdmonitionVariant,
  insertQuote,
  updateQuoteInlineContent,
  insertDivider,
  convertBlock,
  updateHeadingInlineContent,
  updateEquationLatex,
  updateFigure,
  updateLabel,
  updateTableCell,
  updateTableCaption,
  updateTableColumnAlignment,
  updateList,
  updateCodeBlock,
  unresolvedReferences,
  validateStructure,
  type Document,
  type AdmonitionVariant,
  type EditableBlock,
  type EditableDocument,
  type NodePath,
  type InlineContent,
  type ListContent,
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
  "Use --caption for text or --caption-content for Core InlineContent JSON; they are mutually exclusive.",
  "Values that cannot round-trip through canonical Markdown are rejected.",
];
const LIST_NOTE = [
  "--list is Core ListContent JSON: {\"ordered\": boolean, \"start\"?: number, \"items\": [...]}.",
  "Each item is {\"content\": InlineContent[], \"list\"?: ListContent}; the optional list nests below the item.",
  "Numbered lists start at \"start\" (default 1); bullet lists have no start. Every item needs non-empty text.",
  "Example: --list '{\"ordered\":false,\"items\":[{\"content\":[{\"kind\":\"text\",\"text\":\"First\"}]}]}'",
];
const CODE_NOTE = [
  "The language is one word such as python; omit it or pass an empty --language for none.",
  "Code line breaks must be \\n.",
];
const ADMONITION_KIND_NOTE = `Kinds: ${ADMONITION_VARIANTS.join(", ")}.`;
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
      "Exits 1 when it cannot. Asset files are not checked.",
      "References ({eq}, {numref}, {ref}) that name no target in this document are reported",
      "as warnings with their block and line; they do not fail the check.",
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
      "numbers= (JSON: numbers) gives the computed number of a block's first equation, figure or",
      "captioned table, as MyST numbers them; numbers are never written to the document.",
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
    usage: "ieumdoc insert-block <file> --at <index> (--text <text> | --content <json>)",
    details: [
      "Insert a Paragraph block at a top-level index.",
      "Use --text for plain text or --content for Core InlineContent JSON (marks, math, links and references).",
      "",
      "The current implementation inserts a Paragraph block only.",
    ],
  },
  {
    name: "insert-heading",
    summary: "Insert a Heading block at a top-level index",
    usage: "ieumdoc insert-heading <file> --at <index> --level <1-6> (--text <text> | --content <json>)",
    details: [
      "Insert a Heading block at a top-level index.",
      "Heading levels 1 through 6 are supported. --content is Core InlineContent JSON without line breaks.",
    ],
  },
  {
    name: "update-heading",
    summary: "Replace the text of a Heading, keeping its level",
    usage: "ieumdoc update-heading <file> --path <index> (--text <text> | --content <json>)",
    details: [
      "Replace the inline content of one editable top-level Heading.",
      "--content is Core InlineContent JSON (marks, links, inline math and references); headings cannot hold line breaks.",
      "Headings with unsupported inline content are read-only.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-admonition",
    summary: "Insert a simple admonition of a standard MyST kind",
    usage: "ieumdoc insert-admonition <file> --at <index> --variant <kind> --text <text>",
    details: [
      "Insert a top-level admonition through Core.",
      ADMONITION_KIND_NOTE,
      "The body must contain non-empty text.",
    ],
  },
  {
    name: "update-admonition-variant",
    summary: "Change the kind of a simple admonition",
    usage: "ieumdoc update-admonition-variant <file> --path <index> --variant <kind>",
    details: [
      "Change one editable top-level admonition to another kind, keeping its body.",
      ADMONITION_KIND_NOTE,
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-quote",
    summary: "Insert a Quote at a top-level index",
    usage: "ieumdoc insert-quote <file> --at <index> (--text <text> | --content <json>)",
    details: [
      "Insert a top-level block quote holding one paragraph.",
      "Use --text for plain text or --content for Core InlineContent JSON. The quote must contain non-empty text.",
    ],
  },
  {
    name: "update-quote",
    summary: "Replace the text of a Quote",
    usage: "ieumdoc update-quote <file> --path <index> (--text <text> | --content <json>)",
    details: [
      "Replace the paragraph of one editable top-level Quote.",
      "Quotes with several paragraphs or other blocks inside are read-only.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-divider",
    summary: "Insert a divider (thematic break) at a top-level index",
    usage: "ieumdoc insert-divider <file> --at <index>",
    details: ["Insert a top-level divider, written as a Markdown thematic break."],
  },
  {
    name: "update-heading-level",
    summary: "Change an editable Heading's level through Core",
    usage: "ieumdoc update-heading-level <file> --path <index> --from <1-6> --to <1-6>",
    details: [
      "Change one editable top-level Heading from its current level to another level.",
      "The current level must match --from.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "convert-block",
    summary: "Convert a Paragraph or Heading to another text block kind",
    usage: "ieumdoc convert-block <file> --path <index> --to <paragraph|heading> [--level <1-6>]",
    details: [
      "Convert one top-level Paragraph to a Heading, a Heading to a Paragraph,",
      "or a Heading to another level. Inline content is kept.",
      "--level is required with --to heading and not allowed with --to paragraph.",
      "Conversions that cannot keep the content, such as a line break in a heading, are rejected.",
      ...PATH_NOTE,
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
    usage: "ieumdoc insert-figure <file> --at <index> --image <url> [--alt <text>] [--caption <text> | --caption-content <json>]",
    details: [
      "Insert a Figure block at a top-level index.",
      ...FIGURE_NOTE,
      "The new Figure has no label; set one with update-label.",
    ],
  },
  {
    name: "update-figure",
    summary: "Update a Figure's image, alt text, or caption through Core",
    usage: "ieumdoc update-figure <file> --path <indexes> [--image <url>] [--alt <text>] [--caption <text> | --caption-content <json>]",
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
    name: "move-section",
    summary: "Move a heading's section",
    usage: "ieumdoc move-section <file> --from <heading index> --to <index>",
    details: [
      "Move the section a top-level heading opens: its label targets, content and deeper sections.",
      "--to is the start of another section or the block count (the end). Heading levels are kept.",
      "inspect shows each heading's section as [start,end).",
    ],
  },
  {
    name: "remove-section",
    summary: "Remove a heading's section",
    usage: "ieumdoc remove-section <file> --at <heading index>",
    details: ["Remove the section a top-level heading opens: its label targets, content and deeper sections."],
  },
  {
    name: "insert-table",
    summary: "Insert a Markdown table at a top-level index",
    usage: "ieumdoc insert-table <file> --at <index> --cells <json> [--align <json>]",
    details: [
      "Insert a Markdown table at a top-level index.",
      "--cells is a JSON array of rows, each an array of cells; the first row is the header row.",
      "A cell is its text or Core InlineContent JSON. Every row needs the same number of cells. Cells may be empty.",
      "--align is an optional JSON array of left, center, right or null, one per column.",
      "Cell content must be one line without leading or trailing whitespace.",
      "Example: --cells '[[\"Port\",\"Type\"],[\"U\",\"AC\"]]'",
    ],
  },
  {
    name: "insert-list",
    summary: "Insert a bullet or numbered list at a top-level index",
    usage: "ieumdoc insert-list <file> --at <index> --list <json>",
    details: [
      "Insert a bullet or numbered list, optionally with nested lists, at a top-level index.",
      ...LIST_NOTE,
    ],
  },
  {
    name: "update-list",
    summary: "Replace the content of an editable list through Core",
    usage: "ieumdoc update-list <file> --path <index> --list <json>",
    details: [
      "Replace the kind, numbering, items and nesting of one editable top-level list.",
      ...LIST_NOTE,
      "inspect --format json shows an editable list's current content in the same shape.",
      "Task lists and items with several paragraphs or other blocks are read-only.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-code-block",
    summary: "Insert a fenced code block at a top-level index",
    usage: "ieumdoc insert-code-block <file> --at <index> --code <text> [--language <name>]",
    details: [
      "Insert a fenced code block at a top-level index. The code is kept exactly, including blank lines and indentation.",
      ...CODE_NOTE,
    ],
  },
  {
    name: "update-code-block",
    summary: "Replace the language or code of a code block through Core",
    usage: "ieumdoc update-code-block <file> --path <index> [--language <name>] [--code <text>]",
    details: [
      "Update one editable top-level code block. Omitted properties are unchanged.",
      ...CODE_NOTE,
      "Code blocks with captions, labels or other directive options are read-only.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-table-row",
    summary: "Insert an empty row into a Markdown table",
    usage: "ieumdoc insert-table-row <file> --path <table> --at <row>",
    details: [
      "Insert an empty body row into a top-level Markdown table.",
      "Row 0 is the header row, so --at is from 1 to the row count (the end).",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-table-column",
    summary: "Insert an empty column into a Markdown table",
    usage: "ieumdoc insert-table-column <file> --path <table> --at <column>",
    details: [
      "Insert an empty column, header cell included, into a top-level Markdown table.",
      "--at is from 0 to the column count (the end).",
      ...PATH_NOTE,
    ],
  },
  {
    name: "remove-table-row",
    summary: "Remove a body row from a Markdown table",
    usage: "ieumdoc remove-table-row <file> --path <table> --at <row>",
    details: [
      "Remove a body row, read-only cells included, from a top-level Markdown table.",
      "Row 0 is the header row and cannot be removed, so --at is from 1 to the last row.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "remove-table-column",
    summary: "Remove a column from a Markdown table",
    usage: "ieumdoc remove-table-column <file> --path <table> --at <column>",
    details: [
      "Remove a column, header cell included, from a top-level Markdown table.",
      "A table keeps at least one column; use remove-block to remove the whole table.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "move-table-row",
    summary: "Move a body row within a Markdown table",
    usage: "ieumdoc move-table-row <file> --path <table> --from <row> --to <row>",
    details: [
      "Move a body row of a top-level Markdown table. Row 0 is the header row and stays first.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "move-table-column",
    summary: "Move a column within a Markdown table",
    usage: "ieumdoc move-table-column <file> --path <table> --from <column> --to <column>",
    details: [
      "Move a column, header cell and alignment included, within a top-level Markdown table.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "update-table-alignment",
    summary: "Set or clear the alignment of a Markdown table column",
    usage: "ieumdoc update-table-alignment <file> --path <table> --column <column> --align <left|center|right|none>",
    details: [
      "Set the alignment of one column of a top-level Markdown table, or clear it with none.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "update-table-caption",
    summary: "Set or remove a table caption through Core",
    usage: "ieumdoc update-table-caption <file> --path <table> (--text <text> | --content <json>)",
    details: ["Set a single-line caption; empty text removes it. A caption or label makes a numbered table directive."],
  },
  {
    name: "update-table-cell",
    summary: "Replace the content of a Markdown table cell through Core",
    usage: "ieumdoc update-table-cell <file> --path <table,row,cell> (--text <text> | --content <json>)",
    details: [
      "Replace the whole content of one cell in a top-level Markdown table. Use an empty --text to clear it.",
      "--content is Core InlineContent JSON (marks, links, inline math and references) without line breaks.",
      "The content must be one line without leading or trailing whitespace. Cells with unsupported inline content are read-only.",
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
    summary: "Set, change, or remove an Equation, Figure or Table label through Core",
    usage: "ieumdoc update-label <file> --path <index> --label <label>",
    details: [
      "Set the label (reference target name) of one top-level Equation, Figure or Table. Use an empty --label to remove it.",
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
      const unresolved = unresolvedReferences(document);
      if (format === "json") {
        process.stdout.write(`${JSON.stringify({
          ok: writeError === undefined,
          command: "check",
          validation: { valid: true },
          writeability: writeError === undefined ? { writable: true } : { writable: false, error: writeError },
          references: { unresolved },
        })}\n`);
      } else {
        process.stdout.write(`${summarize(document)}\n`);
        if (writeError === undefined) process.stdout.write("writeability ok\n");
        else process.stderr.write(`writeability failed: ${writeError}\n`);
        for (const { role, label, path, line } of unresolved) {
          const at = line === undefined ? `block ${path[0]}` : `block ${path[0]}, line ${line}`;
          process.stderr.write(`warning: {${role}}\`${label}\` (${at}) names no target in this document\n`);
        }
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
      const text = optionalFlag(flags, "--text");
      const content = optionalFlag(flags, "--content");
      if ((text === undefined) === (content === undefined)) throw new Error("insert-block requires exactly one of --text or --content");
      save(file, insertParagraph(parse(readFile(file)), intFlag(flags, "--at"), text ?? jsonFlag<InlineContent[]>(flags, "--content")));
      return 0;
    }
    case "insert-heading": {
      save(file, insertHeading(
        parse(readFile(file)),
        intFlag(flags, "--at"),
        intFlag(flags, "--level"),
        textOrContent(flags),
      ));
      return 0;
    }
    case "update-heading": {
      save(file, updateHeadingInlineContent(parse(readFile(file)), pathFlag(flags), textOrContent(flags)));
      return 0;
    }
    case "insert-admonition": {
      save(file, insertAdmonition(parse(readFile(file)), intFlag(flags, "--at"), variantFlag(flags), [
        { kind: "text", text: flag(flags, "--text") },
      ]));
      return 0;
    }
    case "insert-quote": {
      save(file, insertQuote(parse(readFile(file)), intFlag(flags, "--at"), textOrContent(flags)));
      return 0;
    }
    case "update-quote": {
      save(file, updateQuoteInlineContent(parse(readFile(file)), pathFlag(flags), textOrContent(flags)));
      return 0;
    }
    case "insert-divider": {
      save(file, insertDivider(parse(readFile(file)), intFlag(flags, "--at")));
      return 0;
    }
    case "update-admonition-variant": {
      save(file, updateAdmonitionVariant(parse(readFile(file)), pathFlag(flags), variantFlag(flags)));
      return 0;
    }
    case "update-heading-level": {
      save(file, updateHeadingLevel(
        parse(readFile(file)),
        pathFlag(flags),
        intFlag(flags, "--from"),
        intFlag(flags, "--to"),
      ));
      return 0;
    }
    case "convert-block": {
      const to = flag(flags, "--to");
      if (to !== "paragraph" && to !== "heading") throw new Error("--to must be paragraph or heading");
      if ((to === "heading") !== flags.includes("--level")) {
        throw new Error("--level is required with --to heading and not allowed with --to paragraph");
      }
      save(file, convertBlock(parse(readFile(file)), pathFlag(flags),
        to === "heading" ? { block: "heading", level: intFlag(flags, "--level") } : { block: "paragraph" }));
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
        caption: captionInput(flags) ?? "",
      }));
      return 0;
    }
    case "update-figure": {
      const changes = {
        imageUrl: optionalFlag(flags, "--image"),
        imageAlt: optionalFlag(flags, "--alt"),
        caption: captionInput(flags),
      };
      if (Object.values(changes).every((value) => value === undefined)) {
        throw new Error("update-figure requires --image, --alt, --caption, or --caption-content");
      }
      save(file, updateFigure(parse(readFile(file)), pathFlag(flags), changes));
      return 0;
    }
    case "insert-table": {
      save(file, insertTable(parse(readFile(file)), intFlag(flags, "--at"), jsonFlag(flags, "--cells"), optionalFlag(flags, "--align") === undefined ? undefined : jsonFlag(flags, "--align")));
      return 0;
    }
    case "insert-list": {
      save(file, insertList(parse(readFile(file)), intFlag(flags, "--at"), jsonFlag<ListContent>(flags, "--list")));
      return 0;
    }
    case "update-list": {
      save(file, updateList(parse(readFile(file)), pathFlag(flags), jsonFlag<ListContent>(flags, "--list")));
      return 0;
    }
    case "insert-code-block": {
      save(file, insertCodeBlock(parse(readFile(file)), intFlag(flags, "--at"), {
        language: optionalFlag(flags, "--language") ?? "",
        code: flag(flags, "--code"),
      }));
      return 0;
    }
    case "update-code-block": {
      const changes = { language: optionalFlag(flags, "--language"), code: optionalFlag(flags, "--code") };
      if (changes.language === undefined && changes.code === undefined) {
        throw new Error("update-code-block requires --language or --code");
      }
      save(file, updateCodeBlock(parse(readFile(file)), pathFlag(flags), changes));
      return 0;
    }
    case "insert-table-row": {
      save(file, insertTableRow(parse(readFile(file)), pathFlag(flags), intFlag(flags, "--at")));
      return 0;
    }
    case "insert-table-column": {
      save(file, insertTableColumn(parse(readFile(file)), pathFlag(flags), intFlag(flags, "--at")));
      return 0;
    }
    case "remove-table-row": {
      save(file, removeTableRow(parse(readFile(file)), pathFlag(flags), intFlag(flags, "--at")));
      return 0;
    }
    case "remove-table-column": {
      save(file, removeTableColumn(parse(readFile(file)), pathFlag(flags), intFlag(flags, "--at")));
      return 0;
    }
    case "move-table-row": {
      save(file, moveTableRow(parse(readFile(file)), pathFlag(flags), intFlag(flags, "--from"), intFlag(flags, "--to")));
      return 0;
    }
    case "move-table-column": {
      save(file, moveTableColumn(parse(readFile(file)), pathFlag(flags), intFlag(flags, "--from"), intFlag(flags, "--to")));
      return 0;
    }
    case "update-table-alignment": {
      const align = flag(flags, "--align");
      if (!["left", "center", "right", "none"].includes(align)) throw new Error("--align must be left, center, right or none");
      save(file, updateTableColumnAlignment(parse(readFile(file)), pathFlag(flags), intFlag(flags, "--column"),
        align === "none" ? null : align as "left" | "center" | "right"));
      return 0;
    }
    case "update-table-caption": {
      save(file, updateTableCaption(parse(readFile(file)), pathFlag(flags), textOrContent(flags)));
      return 0;
    }
    case "update-table-cell": {
      save(file, updateTableCell(parse(readFile(file)), pathFlag(flags), textOrContent(flags)));
      return 0;
    }
    case "remove-block": {
      save(file, removeBlock(parse(readFile(file)), intFlag(flags, "--at")));
      return 0;
    }
    case "move-section": {
      save(file, moveSection(parse(readFile(file)), intFlag(flags, "--from"), intFlag(flags, "--to")));
      return 0;
    }
    case "remove-section": {
      save(file, removeSection(parse(readFile(file)), intFlag(flags, "--at")));
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
  "insert-block": ["--at", "--text", "--content"],
  "insert-heading": ["--at", "--level", "--text", "--content"],
  "update-heading": ["--path", "--text", "--content"],
  "insert-admonition": ["--at", "--variant", "--text"],
  "update-admonition-variant": ["--path", "--variant"],
  "insert-quote": ["--at", "--text", "--content"],
  "update-quote": ["--path", "--text", "--content"],
  "insert-divider": ["--at"],
  "update-heading-level": ["--path", "--from", "--to"],
  "convert-block": ["--path", "--to", "--level"],
  "insert-equation": ["--at", "--latex"],
  "insert-figure": ["--at", "--image", "--alt", "--caption", "--caption-content"],
  "update-figure": ["--path", "--image", "--alt", "--caption", "--caption-content"],
  "insert-table": ["--at", "--cells", "--align"],
  "insert-list": ["--at", "--list"],
  "update-list": ["--path", "--list"],
  "insert-code-block": ["--at", "--language", "--code"],
  "update-code-block": ["--path", "--language", "--code"],
  "insert-table-row": ["--path", "--at"],
  "remove-table-row": ["--path", "--at"],
  "remove-table-column": ["--path", "--at"],
  "move-table-row": ["--path", "--from", "--to"],
  "move-table-column": ["--path", "--from", "--to"],
  "update-table-alignment": ["--path", "--column", "--align"],
  "insert-table-column": ["--path", "--at"],
  "update-table-caption": ["--path", "--text", "--content"],
  "update-table-cell": ["--path", "--text", "--content"],
  "remove-block": ["--at"],
  "move-block": ["--from", "--to"],
  "move-section": ["--from", "--to"],
  "remove-section": ["--at"],
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
  const markers = document.blocks.map(sectionMarker);
  const numbers = targetNumbers(document.blocks.map(blockTargets));
  return document.blocks.flatMap((block, index) => {
    const [first, ...rest] = machineBlock(block);
    return [{
      ...first,
      ...(typeof markers[index] === "number" ? { section: sectionRange(markers, index) } : {}),
      ...(Object.keys(numbers[index]).length > 0 ? { numbers: numbers[index] } : {}),
    }, ...rest];
  });
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
      { ...base, ...(block.label ? { label: block.label } : {}), ...(block.caption ? { caption: block.caption } : {}) },
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
  if (block.block === "quote") {
    return [{ ...base, editable: block.editable, text: block.text }];
  }
  if (block.block === "divider") {
    return [base];
  }
  if (block.block === "code") {
    return [{ ...base, language: block.language, code: block.code }];
  }
  if (block.block === "list") {
    return [{ ...base, ordered: block.ordered, ...(block.start !== undefined ? { start: block.start } : {}), items: block.items }];
  }
  return [{ ...base, text: block.text }];
}

function formatInspect(document: EditableDocument): string {
  const markers = document.blocks.map(sectionMarker);
  const numbers = targetNumbers(document.blocks.map(blockTargets));
  // A heading's section is its half-open top-level block range [start,end). Numbers are the
  // computed numbers of the block's first equation, figure or table; they are never written.
  return document.blocks.flatMap((block, index) => {
    const [first, ...rest] = formatBlock(block);
    const section = typeof markers[index] === "number" ? sectionRange(markers, index) : undefined;
    const numbered = Object.entries(numbers[index]).map(([kind, number]) => `${kind}:${number}`).join(",");
    return [`${first}${section ? ` section=[${section.start},${section.end})` : ""}${numbered ? ` numbers=${numbered}` : ""}`, ...rest];
  }).join("\n");
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
  if (block.block === "list") {
    return [`${path} list`, ...formatListItems(block, 1)];
  }
  if (block.block === "quote") {
    return [`${path} quote inlineEditable=${block.editable} text=${quote(block.text)}`];
  }
  if (block.block === "divider") {
    return [`${path} divider`];
  }
  if (block.block === "code") {
    return [`${path} code language=${quote(block.language)} code=${quote(block.code)}`];
  }
  return [`${path} unsupported text=${quote(block.text)}`];
}

function formatListItems(list: ListContent, depth: number): string[] {
  const indent = "  ".repeat(depth);
  return list.items.flatMap((item, index) => [
    `${indent}${list.ordered ? `${(list.start ?? 1) + index}.` : "-"} text=${quote(inlineText(item.content))}`,
    ...(item.list ? formatListItems(item.list, depth + 1) : []),
  ]);
}

function inlineText(content: InlineContent[]): string {
  return content.map((item) => (item.kind === "text" ? item.text : item.kind === "break" ? "\n"
    : item.kind === "math" ? `$${item.value}$` : item.kind === "code" ? `\`${item.value}\`` : item.kind === "reference" ? `{${item.role}}\`${item.label}\``
    : inlineText(item.children))).join("");
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

/** Exactly one of --text (plain) or --content (Core InlineContent JSON). */
function captionInput(args: string[]): string | InlineContent[] | undefined {
  const text = optionalFlag(args, "--caption");
  const content = optionalFlag(args, "--caption-content");
  if (text !== undefined && content !== undefined) throw new Error("--caption and --caption-content are mutually exclusive");
  return content === undefined ? text : jsonFlag<InlineContent[]>(args, "--caption-content");
}

function textOrContent(args: string[]): InlineContent[] {
  const text = optionalFlag(args, "--text");
  const content = optionalFlag(args, "--content");
  if ((text === undefined) === (content === undefined)) throw new Error("exactly one of --text or --content is required");
  return text !== undefined ? [{ kind: "text", text }] : jsonFlag<InlineContent[]>(args, "--content");
}

function variantFlag(args: string[]): AdmonitionVariant {
  const value = flag(args, "--variant");
  if (!isAdmonitionVariant(value)) throw new Error(`--variant must be one of ${ADMONITION_VARIANTS.join(", ")}`);
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

function jsonFlag<T>(args: string[], name: string): T {
  try {
    return JSON.parse(flag(args, name)) as T;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${name} must be JSON`);
    throw error;
  }
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
