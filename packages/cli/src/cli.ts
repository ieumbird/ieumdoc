import fs, { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalWriteError,
  bodyEndIndex,
  createDocument,
  NativeDocumentError,
  writeIssueOf,
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
  insertTarget,
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
  insertFootnote,
  endnotesInPlace,
  updateFootnoteDefinition,
  convertBlock,
  updateHeadingInlineContent,
  updateEquationLatex,
  updateFigure,
  updateLabel,
  updateTableCell,
  updateTableCaption,
  updateHeadingNumbering,
  headingNumbers,
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
import { assertUnicode, commitFile, decodeUtf8, preflightFileCommit, textRevision } from "@ieumdoc/file-commit";
import { resolveMediaPath } from "../../../apps/editor/server/document-path.ts";
import { figureMediaPath } from "../../../apps/editor/shared/figure-media-path.ts";

const HELP_GROUPS = [
  "Create and inspect",
  "Check",
  "Edit — batch",
  "Edit — insert blocks",
  "Edit — text and content",
  "Edit — structure",
  "Edit — tables",
  "Edit — labels, footnotes and numbering",
  "Format",
  "Serve",
] as const;

type CommandSpec = {
  name: string;
  group: (typeof HELP_GROUPS)[number]; // Display-only top-level help grouping.
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

const BODY_INDEX_NOTE = "Block 0 is the document metadata; body blocks start at 1 (also the first index in a path).";
const PATH_NOTE = [
  "Paths identify nodes in the current document snapshot.",
  "Structural edits may change them.",
];

const REVISION_NOTE = [
  "Use --if-revision with the revision from ieumdoc inspect <file> --format json.",
  "Revision must be 64 lowercase hexadecimal characters; a mismatch refuses the edit (exit 1).",
  "Successful writes do not print a new revision for single edits.",
  "Before each subsequent edit, run inspect again to get the new revision and paths.",
];
const DRY_RUN_NOTE = [
  "--dry-run runs the same edits and canonical write checks without committing or creating temporary files.",
  "Text prints the result revision, check summary (warnings on stderr), then --- markdown --- and canonical Markdown.",
  "--dry-run --format json prints dryRun, revision, markdown and the same diagnostic fields as check; batches add applied.",
  "Original literal-syntax warnings also print on stderr; JSON previews keep their Core entries in originalWarnings (or []).",
  "Failures keep the usual stderr messages and exit 1, including in JSON mode.",
  "Shared read-only checks cover current revision and file permissions; directory writes, disk space and rename locks may still fail on write.",
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
  "Without an image (no --image, or an empty one) the Figure is pending: it has no content yet.",
  "Caption and label are optional. Alt text needs an image. An empty --alt or --caption removes that property.",
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
    name: "apply-batch",
    group: "Edit — batch",
    summary: "Apply document edits in order with one atomic file commit",
    usage: "ieumdoc apply-batch <file> --operations <json-file> [--if-revision <revision>] [--dry-run] [--format <text|json>]",
    details: [
      "--operations is a non-empty JSON array of { command, ...options }; stdin (-) is not supported.",
      "Use existing flag names without -- as keys. Scalar options accept string, number or boolean only.",
      "JSON options (content, caption-content, cells, list, and insert-table align) accept objects/arrays",
      "directly or existing JSON strings. Required, unknown and mutually exclusive options follow single edits.",
      "JSON options accept objects, arrays or strings only; null option values are rejected.",
      "All document edit commands, including format, are allowed; create, check, inspect, serve,",
      "apply-batch and per-operation if-revision, dry-run and format options are forbidden.",
      "Top-level insertions accept at: \"end\", resolved by Core before endnotes on each step's snapshot.",
      "Table row/column positions, removal positions and move destinations remain numeric.",
      "insert-equation accepts label; insert-table accepts caption or caption-content and label, as in single edits.",
      "Paths and indexes use the preceding step's canonical, reparsed snapshot; no automatic tracking.",
      BODY_INDEX_NOTE,
      "Each step applies Core, validates and canonically serializes, then parses again for the next step.",
      "--if-revision checks the original once, before Core operations (64 lowercase hexadecimal characters).",
      "Without --dry-run, only the final result is committed, against the original revision. Any failure exits 1 without writing.",
      "Step errors: operation <1-based index> (<command>): <original error>; nothing was written.",
      "Only step input/options, Core, validation, serialization and reparsing errors have that prefix.",
      "Batch-wide errors (original read/parse, revision and commit) keep single-command messages without a prefix.",
      "Without --dry-run, JSON success: {\"ok\":true,\"command\":\"apply-batch\",\"applied\":N,\"revision\":\"<result revision>\"}.",
      "Without --dry-run, text success prints nothing. Run inspect again for paths before a later request.",
      ...DRY_RUN_NOTE,
    ],
  },
  {
    name: "create",
    group: "Create and inspect",
    summary: "Create an empty IeumDoc native document",
    usage: "ieumdoc create <file>",
    details: ["Create a new .md file in an existing directory. Existing files are never overwritten."],
  },
  {
    name: "serve",
    group: "Serve",
    summary: "Serve the production Editor inside explicitly allowed folders",
    usage: "ieumdoc serve --root <folder> [--root <folder> ...] [--port <port>] [--host <IP>] [--public-origin <origin>]",
    details: [
      "At least one existing --root is required. Roots are server filesystem access boundaries,",
      "not a workspace or an initial folder selection. Use Open Folder to choose a root or subfolder.",
      "Defaults: --host 127.0.0.1 --port 5180. Requires the production Editor build.",
      "For an access-controlled reverse proxy, set --public-origin to its exact http(s) origin.",
      "Non-loopback binding requires --public-origin and restricted upstream access. No built-in authentication.",
      "Serve at the site root (/); subpath hosting is not supported. Ctrl+C stops the server.",
    ],
  },
  {
    name: "insert-hard-break",
    group: "Edit — text and content",
    summary: "Insert a hard break within a supported Paragraph",
    usage: "ieumdoc insert-hard-break <file> --path <indexes> --offset <number>",
    details: ["Insert a line break without creating a new paragraph.", ...OFFSET_NOTE, ...PARAGRAPH_PATH_NOTE],
  },
  {
    name: "split-paragraph",
    group: "Edit — structure",
    summary: "Split a top-level Paragraph",
    usage: "ieumdoc split-paragraph <file> --path <indexes> --offset <number>",
    details: ["Split a supported top-level paragraph; both sides must be non-empty.", ...OFFSET_NOTE, ...PARAGRAPH_PATH_NOTE],
  },
  {
    name: "merge-paragraph",
    group: "Edit — structure",
    summary: "Merge a Paragraph with the previous Paragraph",
    usage: "ieumdoc merge-paragraph <file> --path <indexes>",
    details: ["Merge the current top-level paragraph with the immediately previous paragraph.",
      "Both paragraphs must have supported inline content. No automatic space is inserted.", ...PARAGRAPH_PATH_NOTE],
  },
  {
    name: "check",
    group: "Check",
    summary: "Validate a document",
    usage: "ieumdoc check <file> [--format <text|json>]",
    details: [
      "Validate a document: its structure, and whether IeumDoc can rewrite it as canonical",
      "Markdown without losing semantics (the same check format and Editor Save use).",
      "Exits 1 when it cannot.",
      "References ({eq}, {numref}, {ref}, and links such as [](#label) whose URL starts with #)",
      "that name no target in this document, as MyST resolves them (including the implicit IDs",
      "of unlabeled headings), are reported as warnings with their block and line; they do not",
      "fail the check. JSON: references.unresolved, with role or link.",
      "MyST inherited-property lookup failures are also warnings, with a reason in text and JSON.",
      "Pending Figures (no content yet) are reported as readiness warnings with their block and",
      "label (JSON: readiness.pendingFigures). They do not fail the check or stop Save and format.",
      "Document-relative Figure images that are not regular files or cannot be checked warn with block, label and source",
      "(JSON: readiness.missingImageFigures). URLs and absolute paths are skipped, as are paths",
      "the Host refuses (including escapes outside the document directory). No image decoding is done.",
      "Missing-image warnings do not fail the check or change writes.",
      "Footnote definitions not written after the body in first-reference order are reported as a",
      "note: format and Editor Save write them there (JSON: endnotes.inPlace).",
      "Output format is text by default; JSON is available with --format json.",
    ],
  },
  {
    name: "inspect",
    group: "Create and inspect",
    summary: "Inspect semantic blocks and editable targets",
    usage: "ieumdoc inspect <file> [--format <text|json>]",
    details: [
      "Inspect semantic blocks and editable targets.",
      "JSON includes revision: the SHA-256 of the original UTF-8 text read for this inspect.",
      ...REVISION_NOTE,
      "",
      "Editability fields describe the current semantic projection.",
      "numbers= (JSON: numbers) gives the computed number of a block's first equation, figure or",
      "captioned table, as MyST numbers them; numbers are never written to the document.",
      "Other Core commands may support additional text operations.",
      "",
      ...PATH_NOTE,
      "Metadata is not listed. " + BODY_INDEX_NOTE,
    ],
  },
  {
    name: "format",
    group: "Format",
    summary: "Canonically format a document",
    usage: "ieumdoc format <file>",
    details: ["Canonically format a document. Footnote definitions are written after the body, in the",
      "order of the first reference to each (endnotes), as every IeumDoc write does."],
  },
  {
    name: "replace-text",
    group: "Edit — text and content",
    summary: "Replace text in the first matching paragraph or heading",
    usage: "ieumdoc replace-text <file> --from <text> --to <text>",
    details: ["Select only the first matching paragraph or heading by rendered text, not throughout the document.",
      "Replace all matches within that block's individual text nodes.",
      "Matches crossing formatting/text-node boundaries may be left unchanged, still exiting 0 (e.g. a**bc**d, --from abc).",
      "Use update-node-text instead when you know the path; it also substitutes within individual text nodes.",
      "For formatted content, replace the whole block with structured --content: update-heading or update-quote.",
      "For a paragraph in apply-batch, insert-block --content for the new paragraph first, then remove-block on the old one.",
      "Each intermediate step must be writable (e.g. keep footnote references); check first with --dry-run."],
  },
  {
    name: "insert-block",
    group: "Edit — insert blocks",
    summary: "Insert a Paragraph block at a top-level index",
    usage: "ieumdoc insert-block <file> --at <index|end> (--text <text> | --content <json>)",
    details: [
      "Insert a Paragraph block at a top-level index.",
      "Use --text for plain text or --content for Core InlineContent JSON (marks, math, links and references).",
      "",
      "The current implementation inserts a Paragraph block only.",
    ],
  },
  {
    name: "insert-heading",
    group: "Edit — insert blocks",
    summary: "Insert a Heading block at a top-level index",
    usage: "ieumdoc insert-heading <file> --at <index|end> --level <1-6> (--text <text> | --content <json>)",
    details: [
      "Insert a Heading block at a top-level index.",
      "Heading levels 1 through 6 are supported. --content is Core InlineContent JSON without line breaks.",
    ],
  },
  {
    name: "update-heading",
    group: "Edit — text and content",
    summary: "Replace the text of a Heading, keeping its level",
    usage: "ieumdoc update-heading <file> --path <index> (--text <text> | --content <json>)",
    details: [
      "Replace the entire inline content of one editable top-level Heading, keeping its level.",
      "--content is Core InlineContent JSON (marks, links, inline math and references); headings cannot hold line breaks.",
      "Headings require supported native inline content.",
      "Use update-node-text instead when substituting text at a known path.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-admonition",
    group: "Edit — insert blocks",
    summary: "Insert a simple admonition of a standard MyST kind",
    usage: "ieumdoc insert-admonition <file> --at <index|end> --variant <kind> --text <text>",
    details: [
      "Insert a top-level admonition through Core.",
      ADMONITION_KIND_NOTE,
      "The body must contain non-empty text.",
    ],
  },
  {
    name: "update-admonition-variant",
    group: "Edit — text and content",
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
    group: "Edit — insert blocks",
    summary: "Insert a Quote at a top-level index",
    usage: "ieumdoc insert-quote <file> --at <index|end> (--text <text> | --content <json>)",
    details: [
      "Insert a top-level block quote holding one paragraph.",
      "Use --text for plain text or --content for Core InlineContent JSON. The quote must contain non-empty text.",
    ],
  },
  {
    name: "update-quote",
    group: "Edit — text and content",
    summary: "Replace the text of a Quote",
    usage: "ieumdoc update-quote <file> --path <index> (--text <text> | --content <json>)",
    details: [
      "Replace the entire paragraph content of one editable top-level Quote.",
      "Quotes contain one paragraph of supported native inline content.",
      "Use update-node-text instead when substituting text at a known path.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-footnote",
    group: "Edit — labels, footnotes and numbering",
    summary: "Insert a footnote reference and its definition",
    usage: "ieumdoc insert-footnote <file> --path <indexes> --offset <number> (--text <text> | --content <json>)",
    details: [
      "Insert a footnote reference at --offset in one editable top-level Paragraph, Heading, Quote or",
      "simple admonition, or a table cell (--path table,row,cell), and its definition at the end of the",
      "document. The label is the next unused number; shown numbers follow reference order.",
      "--text or --content is the definition.",
      "Offset is measured in UTF-16 code units over rendered content; inline math and footnotes count as one.",
      "Offset may be 0 or the content length.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "update-footnote",
    group: "Edit — labels, footnotes and numbering",
    summary: "Replace the text of a footnote definition",
    usage: "ieumdoc update-footnote <file> --path <index> (--text <text> | --content <json>)",
    details: [
      "Replace the paragraph of one editable footnote definition, keeping its label.",
      "Definitions contain one paragraph without footnote references.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-divider",
    group: "Edit — insert blocks",
    summary: "Insert a divider (thematic break) at a top-level index",
    usage: "ieumdoc insert-divider <file> --at <index|end>",
    details: ["Insert a top-level divider, written as a Markdown thematic break."],
  },
  {
    name: "update-heading-level",
    group: "Edit — structure",
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
    group: "Edit — structure",
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
    group: "Edit — insert blocks",
    summary: "Insert an Equation block at a top-level index",
    usage: "ieumdoc insert-equation <file> --at <index|end> --latex <latex> [--label <label>]",
    details: [
      "Insert an Equation block at a top-level index.",
      "The Equation LaTeX source must be non-empty.",
      "--label sets the label in the same write, under update-label's validation and duplicate rules.",
    ],
  },
  {
    name: "insert-figure",
    group: "Edit — insert blocks",
    summary: "Insert a Figure block at a top-level index",
    usage: "ieumdoc insert-figure <file> --at <index|end> [--image <url>] [--alt <text>] [--caption <text> | --caption-content <json>] [--label <label>]",
    details: [
      "Insert a Figure block at a top-level index.",
      ...FIGURE_NOTE,
      "--label sets the new Figure's label in the same write, under update-label's rules.",
      "Connect an image to a pending Figure later with update-figure --image.",
    ],
  },
  {
    name: "update-figure",
    group: "Edit — text and content",
    summary: "Update a Figure's image, alt text, or caption through Core",
    usage: "ieumdoc update-figure <file> --path <indexes> [--image <url>] [--alt <text>] [--caption <text> | --caption-content <json>]",
    details: [
      "Update one top-level Figure through Core. Omitted properties are unchanged.",
      ...FIGURE_NOTE,
      "The Figure label is preserved; change it with update-label.",
      "--image \"\" removes the image; the caption and label stay. Remove its alt text with --alt \"\".",
      ...PATH_NOTE,
    ],
  },
  {
    name: "remove-block",
    group: "Edit — structure",
    summary: "Remove a top-level block",
    usage: "ieumdoc remove-block <file> --at <index>",
    details: ["Remove one top-level block only. Removing a heading does not remove its section content.",
      "Use remove-section instead when removing a heading with its content and subsections."],
  },
  {
    name: "move-block",
    group: "Edit — structure",
    summary: "Move a top-level block",
    usage: "ieumdoc move-block <file> --from <index> --to <index>",
    details: ["Move one top-level block only; moving a heading does not move its section content.",
      "Use move-section instead when moving a heading with its content and subsections.",
      "Footnote definitions are written after the body in first-reference",
      "order wherever they are moved; move a reference to change their order."],
  },
  {
    name: "move-section",
    group: "Edit — structure",
    summary: "Move a heading's section",
    usage: "ieumdoc move-section <file> --from <heading index> --to <index>",
    details: [
      "Move the section a top-level heading opens: its label targets, content and deeper sections.",
      "--to is the start of another section or the block count (the end). Heading levels are kept.",
      "Footnote definitions (endnotes) are in no section and stay after the body.",
      "inspect shows each heading's section as [start,end).",
      "Use move-block instead when moving just one top-level block.",
    ],
  },
  {
    name: "remove-section",
    group: "Edit — structure",
    summary: "Remove a heading's section",
    usage: "ieumdoc remove-section <file> --at <heading index>",
    details: ["Remove the section a top-level heading opens: its label targets, content and deeper sections.",
      "Footnote definitions (endnotes) are kept. Removing the last reference to one is refused without writing.",
      "Use remove-block instead when removing just one top-level block."],
  },
  {
    name: "insert-table",
    group: "Edit — tables",
    summary: "Insert a Markdown table at a top-level index",
    usage: "ieumdoc insert-table <file> --at <index|end> --cells <json> [--align <json>] [--caption <text> | --caption-content <json>] [--label <label>]",
    details: [
      "Insert a Markdown table at a top-level index.",
      "--cells is a JSON array of rows, each an array of cells; the first row is the header row.",
      "A cell is its text or Core InlineContent JSON. Every row needs the same number of cells. Cells may be empty.",
      "--align is an optional JSON array of left, center, right or null, one per column.",
      "Cell content must be one line without leading or trailing whitespace.",
      "--caption is single-line text; --caption-content is Core InlineContent JSON. They are mutually exclusive.",
      "--label follows update-label's validation and duplicate rules; a caption is not required for a label.",
      "Insertion, caption and label are applied in one write; any failure leaves the original unchanged.",
      "Example: --cells '[[\"Port\",\"Type\"],[\"U\",\"AC\"]]'",
    ],
  },
  {
    name: "insert-list",
    group: "Edit — insert blocks",
    summary: "Insert a bullet or numbered list at a top-level index",
    usage: "ieumdoc insert-list <file> --at <index|end> --list <json>",
    details: [
      "Insert a bullet or numbered list, optionally with nested lists, at a top-level index.",
      ...LIST_NOTE,
    ],
  },
  {
    name: "update-list",
    group: "Edit — text and content",
    summary: "Replace the content of an editable list through Core",
    usage: "ieumdoc update-list <file> --path <index> --list <json>",
    details: [
      "Replace the kind, numbering, items and nesting of one editable top-level list.",
      ...LIST_NOTE,
      "inspect --format json shows an editable list's current content in the same shape.",
      "Task lists and items with several paragraphs or other blocks are not native content.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-code-block",
    group: "Edit — insert blocks",
    summary: "Insert a fenced code block at a top-level index",
    usage: "ieumdoc insert-code-block <file> --at <index|end> --code <text> [--language <name>]",
    details: [
      "Insert a fenced code block at a top-level index. The code is kept exactly, including blank lines and indentation.",
      ...CODE_NOTE,
    ],
  },
  {
    name: "update-code-block",
    group: "Edit — text and content",
    summary: "Replace the language or code of a code block through Core",
    usage: "ieumdoc update-code-block <file> --path <index> [--language <name>] [--code <text>]",
    details: [
      "Update one editable top-level code block. Omitted properties are unchanged.",
      ...CODE_NOTE,
      "Code blocks with captions, labels or other directive options are not native content.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-table-row",
    group: "Edit — tables",
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
    group: "Edit — tables",
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
    group: "Edit — tables",
    summary: "Remove a body row from a Markdown table",
    usage: "ieumdoc remove-table-row <file> --path <table> --at <row>",
    details: [
      "Remove a body row from a top-level Markdown table.",
      "Row 0 is the header row and cannot be removed, so --at is from 1 to the last row.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "remove-table-column",
    group: "Edit — tables",
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
    group: "Edit — tables",
    summary: "Move a body row within a Markdown table",
    usage: "ieumdoc move-table-row <file> --path <table> --from <row> --to <row>",
    details: [
      "Move a body row of a top-level Markdown table. Row 0 is the header row and stays first.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "move-table-column",
    group: "Edit — tables",
    summary: "Move a column within a Markdown table",
    usage: "ieumdoc move-table-column <file> --path <table> --from <column> --to <column>",
    details: [
      "Move a column, header cell and alignment included, within a top-level Markdown table.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "update-table-alignment",
    group: "Edit — tables",
    summary: "Set or clear the alignment of a Markdown table column",
    usage: "ieumdoc update-table-alignment <file> --path <table> --column <column> --align <left|center|right|none>",
    details: [
      "Set the alignment of one column of a top-level Markdown table, or clear it with none.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "update-heading-numbering",
    group: "Edit — labels, footnotes and numbering",
    summary: "Enable or disable document heading numbers through Core",
    usage: "ieumdoc update-heading-numbering <file> --enabled <true|false>",
    details: ["H1 remains a title; H2-H6 are numbered automatically. Only numbering settings are written, never heading text."],
  },
  {
    name: "update-table-caption",
    group: "Edit — tables",
    summary: "Set or remove a table caption through Core",
    usage: "ieumdoc update-table-caption <file> --path <table> (--text <text> | --content <json>)",
    details: ["Set a single-line caption; empty text removes it. A caption or label makes a numbered table directive."],
  },
  {
    name: "update-table-cell",
    group: "Edit — tables",
    summary: "Replace the content of a Markdown table cell through Core",
    usage: "ieumdoc update-table-cell <file> --path <table,row,cell> (--text <text> | --content <json>)",
    details: [
      "Replace the whole content of one cell in a top-level Markdown table. Use an empty --text to clear it.",
      "--content is Core InlineContent JSON (marks, links, inline math and references) without line breaks.",
      "The content must be one line without leading or trailing whitespace. Cells require supported native inline content.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "update-node-text",
    group: "Edit — text and content",
    summary: "Update text at a NodePath through Core",
    usage: "ieumdoc update-node-text <file> --path <indexes> --from <text> --to <text>",
    details: [
      "Substitute text at a known Core NodePath.",
      "Use update-heading or update-quote instead when replacing the entire heading or quote content.",
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
    group: "Edit — text and content",
    summary: "Update Equation LaTeX through Core",
    usage: "ieumdoc update-equation-latex <file> --path <indexes> --from <latex> --to <latex>",
    details: [
      "Update one Equation's LaTeX source through Core.",
      "The label and document structure must remain unchanged.",
      ...PATH_NOTE,
    ],
  },
  {
    name: "insert-target",
    group: "Edit — labels, footnotes and numbering",
    summary: "Label the next block, typically a section heading, with a (label)= target",
    usage: "ieumdoc insert-target <file> --at <index|end> --label <label>",
    details: [
      "Insert a (label)= target at a top-level index. Before a heading, {ref}`label` references name that section.",
      "A section label uses 1-100 ASCII letters, digits or | @ < > * . / _ - + : characters and must not name another target.",
      "Rename a target with update-label and remove it with remove-block.",
    ],
  },
  {
    name: "update-label",
    group: "Edit — labels, footnotes and numbering",
    summary: "Set, change, or remove an Equation, Figure, Table or target label through Core",
    usage: "ieumdoc update-label <file> --path <index> --label <label> [--update-references <true|false>]",
    details: [
      "Set the label (reference target name) of one top-level Equation, Figure or Table. Use an empty --label to remove it.",
      "A (label)= target can be renamed but not emptied; remove it with remove-block.",
      "The label must be one line without leading or trailing spaces, be referenceable, and not name another target in the document.",
      "References stay untouched by default (or with --update-references false).",
      "--update-references true renames an existing non-empty label and its resolved same-document role/fragment references atomically.",
      "Only labeled Equations, Figures, Tables and section targets immediately before headings support this opt-in.",
      "Conflicts (including implicit heading IDs), ambiguous targets or reference notation that cannot preserve meaning are refused without writing.",
      "apply-batch accepts the same option as \"update-references\": true or false.",
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
  const ifRevision = optionalFlag(flags, "--if-revision");
  const dryRun = flags.includes("--dry-run");

  /** Apply one Core operation and write the result only over the file as it was read. */
  function edit(path: string, change: (document: Document) => Document): number {
    // Both checks use the source the change was made to, never a later read.
    const source = readFile(path);
    const revision = textRevision(source);
    if (ifRevision !== undefined && ifRevision !== revision) {
      throw new Error("revision mismatch; run inspect again; nothing was written");
    }
    const original = parse(source);
    const references = unresolvedReferences(original);
    return finishEdit(path, serializeChange(original, change), revision, { command }, dryRun, format, references);
  }

  if (command === "apply-batch") {
    const { markdown, revision, applied, references } = applyBatch(file, flag(flags, "--operations"), ifRevision);
    return finishEdit(file, markdown, revision, { command, applied }, dryRun, format, references);
  }
  if (isEditCommand(command)) {
    return edit(file, changeFor(command, flags));
  }

  switch (command) {
    case "create": {
      if (path.extname(file).toLowerCase() !== ".md") throw new Error("document path must point to a .md file");
      writeFileSync(file, serialize(createDocument()), { encoding: "utf8", flag: "wx" });
      return 0;
    }
    case "check": {
      return checkDocument(parse(readFile(file)), file, format);
    }
    case "inspect": {
      process.stdout.write(format === "json" ? inspectFileJson(file) : inspectFile(file));
      return 0;
    }
    default:
      process.stderr.write(topLevelHelp());
      return 2;
  }
}

type EditResult = { command: string; applied?: number };
type Preview = EditResult & { dryRun: true; revision: string; markdown: string;
  originalWarnings: ReturnType<typeof unresolvedReferences> };

/** The only edit write boundary. Preview never enters file-commit's mutation path. */
function finishEdit(file: string, markdown: string, revision: string, result: EditResult,
  dryRun: boolean, format: OutputFormat, references: ReturnType<typeof unresolvedReferences>): number {
  if (dryRun) {
    const resultRevision = textRevision(markdown);
    const document = parse(markdown);
    preflightFileCommit(file, markdown, revision);
    const status = checkDocument(document, file, format, { ...result, dryRun: true, revision: resultRevision, markdown,
      originalWarnings: references.filter(reference => "footnote" in reference || "syntax" in reference) });
    if (status === 0) warnLiteralSyntax(references);
    return status;
  }
  commitFile(file, markdown, revision);
  warnLiteralSyntax(references);
  if (result.command === "apply-batch" && format === "json") {
    process.stdout.write(`${JSON.stringify({ ok: true, ...result, revision: textRevision(markdown) })}\n`);
  }
  return 0;
}

/** Shared check diagnostics and presentation for files and canonical edit previews. */
function checkDocument(document: Document, file: string, format: OutputFormat, preview?: Preview): number {
  validateStructure(document);
  const writeError = canonicalWriteError(document);
  const unresolved = unresolvedReferences(document);
  // Publish readiness, apart from writeability: a pending Figure is saved, not finished.
  const blocks = getEditableDocument(document).blocks;
  const pendingFigures = blocks.flatMap(block =>
    block.block === "figure" && block.contentKind === "none" ? [{ path: block.path, label: block.label }] : []);
  const missingImageFigures = blocks.flatMap(block => {
    if (block.block !== "figure" || block.contentKind !== "image") return [];
    const source = block.imageUrl;
    const mediaPath = figureMediaPath(source);
    if (mediaPath === undefined) return [];
    let resolved: string;
    try { resolved = resolveMediaPath(mediaPath, file); }
    catch { return []; } // Host-refused paths are outside this existence check's scope.
    try { if (fs.statSync(resolved).isFile()) return []; }
    catch { /* A stat failure cannot establish a regular file; warn without claiming absence. */ }
    return [{ path: block.path, label: block.label, source }];
  });
  const endnotes = { inPlace: endnotesInPlace(document) };
  if (format === "json") {
    process.stdout.write(`${JSON.stringify({
      ok: writeError === undefined,
      command: "check",
      ...preview,
      validation: { valid: true },
      writeability: writeError === undefined ? { writable: true } : { writable: false, error: writeError },
      references: { unresolved },
      readiness: { pendingFigures, missingImageFigures },
      endnotes,
    })}\n`);
  } else {
    if (preview) process.stdout.write(`dry run; nothing was written\nrevision: ${preview.revision}\n`);
    process.stdout.write(`${summarize(document)}\n`);
    if (writeError === undefined) process.stdout.write("writeability ok\n");
    else process.stderr.write(`writeability failed: ${writeError}\n`);
    for (const reference of unresolved) {
      process.stderr.write(`warning: ${referenceWarning(reference)}\n`);
    }
    for (const { path, label } of pendingFigures) {
      process.stderr.write(`warning: Figure${label ? ` ${quote(label)}` : ""} (block ${path[0]}) has no content yet\n`);
    }
    for (const { path, label, source } of missingImageFigures) {
      process.stderr.write(`warning: Figure${label ? ` ${quote(label)}` : ""} (block ${path[0]}) image ${quote(source)} is not a file or could not be checked\n`);
    }
    if (!endnotes.inPlace) process.stderr.write("note: format and Save move footnote definitions after the body, in first-reference order\n");
    if (preview) process.stdout.write(`--- markdown ---\n${preview.markdown}`);
  }
  return writeError === undefined ? 0 : 1;
}

type Change = (document: Document) => Document;

/** Share flag interpretation and Core operations between single edits and batch steps. */
function changeFor(command: string, flags: string[]): Change {
  switch (command) {
    case "insert-hard-break":
    case "split-paragraph": {
      const operation = command === "insert-hard-break" ? insertHardBreak : splitParagraph;
      return (document) => operation(document, pathFlag(flags), intFlag(flags, "--offset"));
    }
    case "merge-paragraph": {
      return (document) => mergeParagraphWithPrevious(document, pathFlag(flags));
    }
    case "format": {
      return (document) => document;
    }
    case "replace-text": {
      return (document) => replaceText(document, flag(flags, "--from"), flag(flags, "--to"));
    }
    case "insert-block": {
      const text = optionalFlag(flags, "--text");
      const content = optionalFlag(flags, "--content");
      if ((text === undefined) === (content === undefined)) throw new Error("insert-block requires exactly one of --text or --content");
      return (document) => insertParagraph(document, insertionIndex(document, flags), text ?? jsonFlag<InlineContent[]>(flags, "--content"));
    }
    case "insert-heading": {
      return (document) => insertHeading(
        document,
        insertionIndex(document, flags),
        intFlag(flags, "--level"),
        textOrContent(flags),
      );
    }
    case "update-heading": {
      return (document) => updateHeadingInlineContent(document, pathFlag(flags), textOrContent(flags));
    }
    case "insert-admonition": {
      return (document) => insertAdmonition(document, insertionIndex(document, flags), variantFlag(flags), [
        { kind: "text", text: flag(flags, "--text") },
      ]);
    }
    case "insert-quote": {
      return (document) => insertQuote(document, insertionIndex(document, flags), textOrContent(flags));
    }
    case "update-quote": {
      return (document) => updateQuoteInlineContent(document, pathFlag(flags), textOrContent(flags));
    }
    case "insert-footnote": {
      return (document) => insertFootnote(document, pathFlag(flags), intFlag(flags, "--offset"), textOrContent(flags));
    }
    case "update-footnote": {
      return (document) => updateFootnoteDefinition(document, pathFlag(flags), textOrContent(flags));
    }
    case "insert-divider": {
      return (document) => insertDivider(document, insertionIndex(document, flags));
    }
    case "update-admonition-variant": {
      return (document) => updateAdmonitionVariant(document, pathFlag(flags), variantFlag(flags));
    }
    case "update-heading-level": {
      return (document) => updateHeadingLevel(
        document,
        pathFlag(flags),
        intFlag(flags, "--from"),
        intFlag(flags, "--to"),
      );
    }
    case "convert-block": {
      const to = flag(flags, "--to");
      if (to !== "paragraph" && to !== "heading") throw new Error("--to must be paragraph or heading");
      if ((to === "heading") !== flags.includes("--level")) {
        throw new Error("--level is required with --to heading and not allowed with --to paragraph");
      }
      return (document) => convertBlock(document, pathFlag(flags),
        to === "heading" ? { block: "heading", level: intFlag(flags, "--level") } : { block: "paragraph" });
    }
    case "insert-equation": {
      return (document) => {
        const at = insertionIndex(document, flags);
        const inserted = insertEquation(document, at, flag(flags, "--latex"));
        const label = optionalFlag(flags, "--label");
        return label !== undefined ? updateLabel(inserted, [at], label) : inserted;
      };
    }
    case "insert-figure": {
      const position = flag(flags, "--at") === "end" ? "end" : intFlag(flags, "--at");
      const label = optionalFlag(flags, "--label") ?? "";
      // One Core-backed edit and one file replacement, also when it sets the label.
      return (document) => {
        const at = position === "end" ? bodyEndIndex(document) : position;
        const inserted = insertFigure(document, at, {
          imageUrl: optionalFlag(flags, "--image") ?? "",
          imageAlt: optionalFlag(flags, "--alt") ?? "",
          caption: captionInput(flags) ?? "",
        });
        return label.length > 0 ? updateLabel(inserted, [at], label) : inserted;
      };
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
      return (document) => updateFigure(document, pathFlag(flags), changes);
    }
    case "insert-table": {
      return (document) => {
        const at = insertionIndex(document, flags);
        let inserted = insertTable(document, at, jsonFlag(flags, "--cells"), optionalFlag(flags, "--align") === undefined ? undefined : jsonFlag(flags, "--align"));
        const caption = captionInput(flags);
        if (caption !== undefined) inserted = updateTableCaption(inserted, [at], caption);
        const label = optionalFlag(flags, "--label");
        return label !== undefined ? updateLabel(inserted, [at], label) : inserted;
      };
    }
    case "insert-list": {
      return (document) => insertList(document, insertionIndex(document, flags), jsonFlag<ListContent>(flags, "--list"));
    }
    case "update-list": {
      return (document) => updateList(document, pathFlag(flags), jsonFlag<ListContent>(flags, "--list"));
    }
    case "insert-code-block": {
      return (document) => insertCodeBlock(document, insertionIndex(document, flags), {
        language: optionalFlag(flags, "--language") ?? "",
        code: flag(flags, "--code"),
      });
    }
    case "update-code-block": {
      const changes = { language: optionalFlag(flags, "--language"), code: optionalFlag(flags, "--code") };
      if (changes.language === undefined && changes.code === undefined) {
        throw new Error("update-code-block requires --language or --code");
      }
      return (document) => updateCodeBlock(document, pathFlag(flags), changes);
    }
    case "insert-table-row": {
      return (document) => insertTableRow(document, pathFlag(flags), intFlag(flags, "--at"));
    }
    case "insert-table-column": {
      return (document) => insertTableColumn(document, pathFlag(flags), intFlag(flags, "--at"));
    }
    case "remove-table-row": {
      return (document) => removeTableRow(document, pathFlag(flags), intFlag(flags, "--at"));
    }
    case "remove-table-column": {
      return (document) => removeTableColumn(document, pathFlag(flags), intFlag(flags, "--at"));
    }
    case "move-table-row": {
      return (document) => moveTableRow(document, pathFlag(flags), intFlag(flags, "--from"), intFlag(flags, "--to"));
    }
    case "move-table-column": {
      return (document) => moveTableColumn(document, pathFlag(flags), intFlag(flags, "--from"), intFlag(flags, "--to"));
    }
    case "update-table-alignment": {
      const align = flag(flags, "--align");
      if (!["left", "center", "right", "none"].includes(align)) throw new Error("--align must be left, center, right or none");
      return (document) => updateTableColumnAlignment(document, pathFlag(flags), intFlag(flags, "--column"),
        align === "none" ? null : align as "left" | "center" | "right");
    }
    case "update-heading-numbering": {
      const enabled = flag(flags, "--enabled");
      if (enabled !== "true" && enabled !== "false") throw new Error("--enabled must be true or false");
      return (document) => updateHeadingNumbering(document, enabled === "true");
    }
    case "update-table-caption": {
      return (document) => updateTableCaption(document, pathFlag(flags), textOrContent(flags));
    }
    case "update-table-cell": {
      return (document) => updateTableCell(document, pathFlag(flags), textOrContent(flags));
    }
    case "insert-target": {
      return (document) => insertTarget(document, insertionIndex(document, flags), flag(flags, "--label"));
    }
    case "remove-block": {
      return (document) => removeBlock(document, intFlag(flags, "--at"));
    }
    case "move-section": {
      return (document) => moveSection(document, intFlag(flags, "--from"), intFlag(flags, "--to"));
    }
    case "remove-section": {
      return (document) => removeSection(document, intFlag(flags, "--at"));
    }
    case "move-block": {
      return (document) => moveBlock(document, intFlag(flags, "--from"), intFlag(flags, "--to"));
    }
    case "update-node-text": {
      return (document) => updateNodeTextAtPath(
        document,
        pathFlag(flags),
        flag(flags, "--from"),
        flag(flags, "--to"),
      );
    }
    case "update-equation-latex": {
      return (document) => updateEquationLatex(
        document,
        pathFlag(flags),
        flag(flags, "--from"),
        flag(flags, "--to"),
      );
    }
    case "update-label": {
      const updateReferences = optionalFlag(flags, "--update-references");
      if (updateReferences !== undefined && updateReferences !== "true" && updateReferences !== "false") {
        throw new Error("--update-references must be true or false");
      }
      return (document) => updateLabel(document, pathFlag(flags), flag(flags, "--label"),
        { updateReferences: updateReferences === "true" });
    }
    default:
      throw new Error(`not a document edit command: ${command}`);
  }
}

function serializeChange(document: Document, change: Change): string {
  const changed = change(document);
  validateStructure(changed);
  return serialize(changed);
}

/** Report original-source intent after a successful commit or preview; operation clones have no evidence. */
function warnLiteralSyntax(references: ReturnType<typeof unresolvedReferences>): void {
  for (const reference of references) {
    if ("footnote" in reference || "syntax" in reference) {
      process.stderr.write(`warning: ${referenceWarning(reference, true)}\n`);
    }
  }
}

function referenceWarning(reference: ReturnType<typeof unresolvedReferences>[number], written = false): string {
  const { path, line } = reference;
  const at = line === undefined ? `block ${path[0]}` : `block ${path[0]}, line ${line}`;
  if ("syntax" in reference) {
    const kind = reference.syntax === "inline-code" ? "inline code"
      : reference.syntax === "reference-image" ? "reference image" : "reference link";
    const reason = reference.syntax === "inline-code" ? "has no closing backtick run" : "has no definition";
    const suffix = written ? "; written as literal text"
      : reference.syntax === "inline-code" ? "; parsed as literal text" : " in this document";
    return `${kind} ${quote(reference.source)} (${at}) ${reason}${suffix}`;
  }
  if ("footnote" in reference) {
    const suffix = written ? `; written as literal \\[^${reference.label}]` : " in this document";
    return `footnote [^${reference.label}] (${at}) has no definition${suffix}`;
  }
  const source = "role" in reference ? `{${reference.role}}\`${reference.label}\`` : `link ${reference.link}`;
  return `${source} (${at}) ${reference.reason ?? "names no target in this document"}`;
}

/** Adapt JSON options to the existing CLI flag parser, without interpreting document semantics. */
function batchChange(operation: unknown): Change {
  if (operation === null || typeof operation !== "object" || Array.isArray(operation)) {
    throw new Error("operation must be an object with a command");
  }
  const { command, ...options } = operation as Record<string, unknown>;
  if (typeof command !== "string") throw new Error("command must be a string");
  if (!findCommand(command) || !isEditCommand(command)) {
    throw new Error(`not a document edit command: ${command}`);
  }
  const tokens: string[] = [];
  for (const [key, value] of Object.entries(options)) {
    const name = `--${key}`;
    if (!COMMAND_OPTIONS[command].includes(name)) throw new Error(`unknown option: ${name}`);
    const json = ["content", "caption-content", "cells", "list"].includes(key)
      || (command === "insert-table" && key === "align");
    if (json ? value === null || !["object", "string"].includes(typeof value)
      : !["string", "number", "boolean"].includes(typeof value)) {
      throw new Error(`${name} must be ${json ? "an object, array or string" : "a string, number or boolean"}`);
    }
    tokens.push(name, json && typeof value !== "string" ? JSON.stringify(value) : String(value));
  }
  return changeFor(command, parseCommandArgs(command, ["batch-document", ...tokens]).flags);
}

function applyBatch(file: string, operationsFile: string, ifRevision: string | undefined) {
  if (operationsFile === "-") throw new Error("--operations requires a JSON file; stdin is not supported");
  const operations: unknown = JSON.parse(readFile(operationsFile));
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("--operations must be a non-empty JSON array");
  }
  const source = readFile(file);
  const revision = textRevision(source);
  if (ifRevision !== undefined && ifRevision !== revision) {
    throw new Error("revision mismatch; run inspect again; nothing was written");
  }
  let document = parse(source);
  const references = unresolvedReferences(document);
  let result = source;
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index];
    try {
      result = serializeChange(document, batchChange(operation));
      // Single CLI calls reparse canonical output: endnotes and locators can move here.
      document = parse(result);
    } catch (error) {
      const command = operation !== null && typeof operation === "object" && "command" in operation
        && typeof operation.command === "string" ? operation.command : "<unknown>";
      throw new Error(`operation ${index + 1} (${command}): ${error instanceof Error ? error.message : String(error)}; nothing was written`);
    }
  }
  return { markdown: result, revision, applied: operations.length, references };
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
    "Start here:",
    "  Before editing, use ieumdoc inspect <file> --format json for current paths and revision.",
    "  One edit: choose a command below. Multiple edits: use apply-batch.",
    "  Use --if-revision to guard edits and --dry-run to preview them.",
    "  Batch paths use each preceding step's result; they are not tracked automatically.",
    "  Details: ieumdoc help <command>",
    "",
    "Commands:",
    ...HELP_GROUPS.flatMap((group) => [
      `  ${group}:`,
      ...COMMANDS.filter((command) => command.group === group)
        .map((command) => `    ${command.name.padEnd(width)}  ${command.summary}`),
      "",
    ]),
    "",
  ];
  return lines.join("\n");
}

function commandHelp(name: string): string {
  const spec = findCommand(name);
  if (!spec) return topLevelHelp();
  const editing = isEditCommand(name);
  const addressed = /--(?:at|path|from) <(?:index|heading index|table)/.test(spec.usage);
  return ["Usage:", `  ${spec.usage}${editing ? " [--if-revision <revision>] [--dry-run [--format <text|json>]]" : ""}`, "", ...spec.details,
    ...(spec.usage.includes("--at <index|end>") ? ["",
      "--at end inserts at the body end before endnote definitions, or after the last body block.",
      "For an empty native document this is index 1. Core resolves the position on the current snapshot.",
      "apply-batch accepts the same position as \"at\": \"end\"."] : []),
    ...(editing && addressed ? ["", BODY_INDEX_NOTE] : []),
    ...(editing ? ["", ...REVISION_NOTE, ...DRY_RUN_NOTE] : []), ""].join("\n");
}

const COMMAND_OPTIONS: Record<string, readonly string[]> = {
  "apply-batch": ["--operations", "--if-revision", "--dry-run", "--format"],
  "insert-hard-break": ["--path", "--offset"],
  "split-paragraph": ["--path", "--offset"],
  "merge-paragraph": ["--path"],
  create: [],
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
  "insert-footnote": ["--path", "--offset", "--text", "--content"],
  "update-footnote": ["--path", "--text", "--content"],
  "insert-divider": ["--at"],
  "update-heading-level": ["--path", "--from", "--to"],
  "convert-block": ["--path", "--to", "--level"],
  "insert-equation": ["--at", "--latex", "--label"],
  "insert-figure": ["--at", "--image", "--alt", "--caption", "--caption-content", "--label"],
  "update-figure": ["--path", "--image", "--alt", "--caption", "--caption-content"],
  "insert-table": ["--at", "--cells", "--align", "--caption", "--caption-content", "--label"],
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
  "update-heading-numbering": ["--enabled"],
  "update-table-caption": ["--path", "--text", "--content"],
  "update-table-cell": ["--path", "--text", "--content"],
  "remove-block": ["--at"],
  "insert-target": ["--at", "--label"],
  "move-block": ["--from", "--to"],
  "move-section": ["--from", "--to"],
  "remove-section": ["--at"],
  "update-node-text": ["--path", "--from", "--to"],
  "update-equation-latex": ["--path", "--from", "--to"],
  "update-label": ["--path", "--label", "--update-references"],
};

function isEditCommand(command: string): boolean {
  return Object.hasOwn(COMMAND_OPTIONS, command) && !["create", "check", "inspect", "apply-batch"].includes(command);
}

function parseCommandArgs(command: string, args: string[]): ParsedArgs {
  const [file, ...tokens] = args;
  if (!file || file.startsWith("-")) {
    throw new Error(`unexpected argument: ${file ?? "<missing file>"}`);
  }

  const allowed = [...(COMMAND_OPTIONS[command] ?? []), ...(isEditCommand(command)
    ? ["--if-revision", "--dry-run", ...(tokens.includes("--dry-run") ? ["--format"] : [])] : [])];
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
    if (token === "--dry-run") continue;

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
      if (token === "--if-revision" && (value.length !== 64 || !/^[0-9a-f]{64}$/.test(value))) {
        throw new Error("--if-revision must be 64 lowercase hexadecimal characters");
      }
      flags.push(value);
    }
    index += 1;
  }

  // Validate every filesystem input before any command can perform I/O.
  for (const input of [file, ...(command === "apply-batch" ? [flag(flags, "--operations")] : [])]) {
    assertUnicode(input);
  }
  return { file, flags, format };
}

function inspectFile(file: string): string {
  const editable = getEditableDocument(parse(readFile(file)));
  return `${formatInspect(editable)}\n`;
}

function inspectFileJson(file: string): string {
  const source = readFile(file);
  const editable = getEditableDocument(parse(source));
  return `${JSON.stringify({
    ok: true,
    command: "inspect",
    revision: textRevision(source),
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

/** Convert Core's displayed section offsets to snapshot locators used by CLI operations. */
function snapshotSection(document: EditableDocument, index: number) {
  const range = sectionRange(document.blocks.map(sectionMarker), index);
  return { start: document.blocks[range.start].path[0],
    end: document.blocks[range.end]?.path[0] ?? (document.blocks.at(-1)?.path[0] ?? 0) + 1 };
}

function machineNodes(document: EditableDocument): MachineNode[] {
  const markers = document.blocks.map(sectionMarker);
  const numbers = targetNumbers(document.blocks.map(blockTargets));
  const headings = headingNumbers(document.blocks, document.headingNumbering);
  return document.blocks.flatMap((block, index) => {
    const [first, ...rest] = machineBlock(block);
    return [{
      ...first,
      ...(headings[index] ? { headingNumber: headings[index] } : {}),
      ...(typeof markers[index] === "number" ? { section: snapshotSection(document, index) } : {}),
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
        contentKind: block.contentKind,
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
  if (block.block === "footnote") {
    return [{ ...base, label: block.label, editable: block.editable, text: block.text }];
  }
  if (block.block === "divider") {
    return [base];
  }
  if (block.block === "code") {
    return [{ ...base, language: block.language, code: block.code }];
  }
  if (block.block === "target") {
    return [{ ...base, label: block.label }];
  }
  if (block.block === "list") {
    return [{ ...base, ordered: block.ordered, ...(block.start !== undefined ? { start: block.start } : {}), items: block.items }];
  }
  throw new Error("Unknown native block");
}

function formatInspect(document: EditableDocument): string {
  const markers = document.blocks.map(sectionMarker);
  const numbers = targetNumbers(document.blocks.map(blockTargets));
  // A heading's section is its half-open top-level block range [start,end). Numbers are the
  // computed numbers of the block's first equation, figure or table; they are never written.
  return document.blocks.flatMap((block, index) => {
    const [first, ...rest] = formatBlock(block);
    const section = typeof markers[index] === "number" ? snapshotSection(document, index) : undefined;
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
      `${path} figure figureEditable=${block.editable} label=${quote(block.label)} image=${quote(block.imageUrl)} alt=${quote(block.imageAlt)} content=${block.contentKind}`,
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
  if (block.block === "footnote") {
    return [`${path} footnote label=${quote(block.label)} inlineEditable=${block.editable} text=${quote(block.text)}`];
  }
  if (block.block === "divider") {
    return [`${path} divider`];
  }
  if (block.block === "code") {
    return [`${path} code language=${quote(block.language)} code=${quote(block.code)}`];
  }
  if (block.block === "target") {
    return [`${path} target label=${quote(block.label)}`];
  }
  throw new Error("Unknown native block");
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
    : item.kind === "footnote" ? `[^${item.label}]` : inlineText(item.children))).join("");
}

function formatPath(path: NodePath): string {
  return path.join(",");
}

function quote(value: string): string {
  return JSON.stringify(value);
}

function readFile(path: string): string {
  return decodeUtf8(readFileSync(path));
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

function insertionIndex(document: Document, args: string[]): number {
  return flag(args, "--at") === "end" ? bodyEndIndex(document) : intFlag(args, "--at");
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

function reportError(args: string[], error: unknown): number {
  if (args[0] === "check" && args.includes("--format") && args[args.indexOf("--format") + 1] === "json") {
    process.stdout.write(`${JSON.stringify({ ok: false, command: "check", validation: { valid: false },
      error: { ...writeIssueOf(error), ...(error instanceof NativeDocumentError ? { code: error.code } : {}) } })}\n`);
  } else process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  return 1;
}

/** Run a synchronous command with the same output and error status as the executable. */
export function runCli(args: string[]): number {
  try {
    return main(args);
  } catch (error) {
    return reportError(args, error);
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === "serve" && !isCommandHelpRequest(args.slice(1))) {
      const { serve } = await import("./serve.ts");
      // Source checkout runs use an explicit Editor build; the distributable carries it beside cli.mjs.
      const editorDir = fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "../../../apps/editor/dist/" : "./editor/", import.meta.url));
      await serve(args.slice(1), editorDir);
    } else process.exitCode = runCli(args);
  } catch (error) {
    process.exitCode = reportError(args, error);
  }
}
