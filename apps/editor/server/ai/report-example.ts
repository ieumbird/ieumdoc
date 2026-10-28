// Generic CLI-validated example, not a prewritten answer to the measurement requests.
export const REPORT_OPERATIONS_EXAMPLE = [
  { command: "insert-table", at: "end", label: "example-table", caption: "Example table", cells: [["Item", "Value"], ["A", "1"]] },
  { command: "insert-equation", at: "end", label: "example-equation", latex: "y = x" },
  { command: "insert-figure", at: "end", label: "example-figure", mermaid: "flowchart LR\n  A[Input] --> B[Output]", caption: "Example diagram" },
  { command: "insert-block", at: "end", content: [
    { kind: "text", text: "See " },
    { kind: "reference", role: "numref", label: "example-table" },
    { kind: "text", text: ", " },
    { kind: "reference", role: "eq", label: "example-equation" },
    { kind: "text", text: " and " },
    { kind: "reference", role: "numref", label: "example-figure" },
    { kind: "text", text: "." },
  ] },
];

export const REPORT_STDIN_EXAMPLE = [
  "Generic example only: replace these placeholder labels, content and values with the user's task and source documents.",
  "A real cross-reference is an InlineContent reference node; ordinary words like 'Table 1' or a Markdown link do not count.",
  "In Windows PowerShell, set $OutputEncoding = [System.Text.Encoding]::UTF8 so Korean survives the stdin pipe. Use a literal single-quoted here-string; do not nest JSON in node -e or write an operations file.",
  "$OutputEncoding = [System.Text.Encoding]::UTF8",
  "$ops = @'",
  JSON.stringify(REPORT_OPERATIONS_EXAMPLE, null, 2),
  "'@",
  '$ops | ieumdoc apply-batch "$env:IEUMDOC_AI_TARGET" --operations - --dry-run --format json',
  "After a successful preview, pipe the same $ops again without --dry-run, with --if-revision from inspect. Then run check TARGET --format json.",
  "Use the reference nodes in the example for the actual table, equation and Figure labels in your report; do not replace them with literal numbers.",
].join("\n");
