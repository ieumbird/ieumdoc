import type { WriteIssueCode } from "@ieumdoc/core";
import type { TiptapJSON } from "./tiptap-inline.ts";
import { i18n, type MessageKey } from "./i18n.ts";
import { isSessionPlaceholder } from "./tiptap-edits.ts";
import { SaveContentError } from "../shared/save-error.ts";
import type { SupportedEdits } from "../shared/document-protocol.ts";
import { TABLE_CELL_SOURCE_ATTR } from "./tiptap-projection.ts";

const diagnosticGuidance = {
  "native-marker": "Invalid marker → Open an IeumDoc document or create one.",
  "native-metadata": "Unsupported settings → Check document frontmatter.",
  "native-content": "Unsupported content or nesting → Remove or replace it.",
  "invalid-structure": "Invalid structure → Keep edits and report technical details.",
  "invalid-operation": "Edit cannot be applied → Keep edits and review technical details.",
  "unsupported-content": "Unsupported content or formatting → Remove or replace it.",
  "empty-content": "Required text is empty → Enter text or delete the block.",
  "round-trip-mismatch": "Content would change on Save → Simplify or replace it.",
  "serialization-failed": "Save conversion failed → Keep edits and report technical details.",
  "invalid-unicode": "Invalid character → Delete and re-enter the affected text.",
  "invalid-label": "Label cannot be saved → Change it; for an empty equation, add content or remove its label.",
  "label-conflict": "Label already in use → Choose a different label.",
  "invalid-reference": "Reference cannot be preserved → Change its label or use plain text.",
  "invalid-footnote": "Endnote mismatch → Keep one non-empty definition per referenced label.",
  "line-break": "Line breaks are unsupported here → Remove the line breaks.",
  "table-cell-whitespace": "Cell starts or ends with whitespace → Trim this cell.",
  "table-shape": "Inconsistent table → Use table controls to match cell counts and column alignment.",
  "invalid-figure": "Invalid Figure → Check image, alt text, Mermaid source and caption in Edit.",
  "fixed-number-unrepresentable": "Fixed number cannot be saved → Enter equation content or clear the fixed number.",
} satisfies Record<WriteIssueCode, MessageKey>;

const diagnosticBadges = {
  "native-marker": "Invalid marker → Open native file",
  "native-metadata": "Invalid settings → Review settings",
  "native-content": "Unsupported content → Replace",
  "invalid-structure": "Invalid structure → Report details",
  "invalid-operation": "Edit refused → Review details",
  "unsupported-content": "Unsupported formatting → Replace",
  "empty-content": "Empty text → Enter text or delete",
  "round-trip-mismatch": "Cannot preserve content → Replace",
  "serialization-failed": "Conversion failed → Report details",
  "invalid-unicode": "Invalid character → Re-enter text",
  "invalid-label": "Invalid label → Change label",
  "label-conflict": "Duplicate label → Use another",
  "invalid-reference": "Invalid reference → Change label",
  "invalid-footnote": "Endnote mismatch → Check definitions",
  "line-break": "Line break → Remove break",
  "table-cell-whitespace": "Cell whitespace → Trim cell",
  "table-shape": "Invalid table → Check columns",
  "invalid-figure": "Invalid Figure → Check properties",
  "fixed-number-unrepresentable": "Fixed number cannot be saved → Add content or clear number",
} satisfies Record<WriteIssueCode, MessageKey>;

function emptyEndnote(code?: string, blockType?: string): boolean {
  return code === "empty-content" && blockType === "footnoteDefinition";
}

function diagnostic(code?: string, blockType?: string): MessageKey | undefined {
  if (emptyEndnote(code, blockType)) return "Endnote text is empty → Enter text or remove its references and definition together.";
  return code && Object.hasOwn(diagnosticGuidance, code) ? diagnosticGuidance[code as WriteIssueCode] : undefined;
}

export function saveErrorBadge(code?: string, blockType?: string): string {
  if (emptyEndnote(code, blockType)) return i18n.t("Cannot save") + ": " + i18n.t("Empty endnote → Enter text or remove references + definition");
  const guidance = diagnostic(code);
  return i18n.t("Cannot save") + (guidance ? ": " + i18n.t(diagnosticBadges[code as WriteIssueCode]) : "");
}

/** Retain the submitted snapshot so changing UI language can reformat a visible failure. */
export class SaveDisplayError extends Error {
  constructor(readonly failures: readonly unknown[], readonly submitted?: TiptapJSON, readonly edits?: SupportedEdits) { super(); }
  override get message(): string { return this.failures.map(error => saveErrorMessage(error, this.submitted, this.edits)).join("\n"); }
  get summary(): string { return this.failures.map(error => error instanceof SaveContentError
    ? `${saveErrorScope(error, this.submitted, this.edits)}: ${saveErrorGuidance(error, saveErrorLocation(error, this.submitted, this.edits)?.type)}` : error instanceof Error ? error.message : String(error)).join("\n"); }
  get details(): string { return this.failures.map(error => error instanceof SaveContentError
    ? `${error.reason} ${error.action}` : error instanceof Error ? error.message : String(error)).join("\n"); }
  get locations(): SaveErrorLocation[] { return this.failures.flatMap(error => {
    const location = error instanceof SaveContentError ? saveErrorLocation(error, this.submitted, this.edits) : undefined;
    return location ? [location] : [];
  }); }
}

export type SaveErrorLocation = { index: number; type: string; cell?: { row: number; column: number }; code?: WriteIssueCode };

/** Resolve Host snapshot locators against the submitted document, never later user input. */
export function saveErrorLocation(error: SaveContentError, submitted?: TiptapJSON, edits?: SupportedEdits): SaveErrorLocation | undefined {
  const nodes = submitted?.content ?? [];
  const target = error.target;
  const node = target && ("path" in target
    ? nodes.filter(node => String(node.attrs?.sourcePath).split(";").includes(String(target.path[0])))[target.part]
    : nodes.filter(node => !isSessionPlaceholder(node))[edits?.order?.findIndex(item => "insert" in item && item.insert === target.insert) ?? -1]);
  const block = error.block ?? (node ? { index: nodes.indexOf(node), type: node.type ?? "unknown" } : undefined);
  // Snapshot table cells may have moved since opening. Look up their saved row,column identity.
  let cell = error.cell;
  if (!cell && node && target && "path" in target && target.path.length === 3) {
    node.content?.forEach((row, rowIndex) => row.content?.forEach((value, column) => {
      if (value.attrs?.[TABLE_CELL_SOURCE_ATTR] === target.path.slice(1).join(",")) cell = { row: rowIndex, column };
    }));
  }
  return block ? { ...block, ...(error.code && ["collect", "replay", "serialize"].includes(error.phase) ? { code: error.code } : {}), ...(cell ? { cell } : {}) } : undefined;
}

function blockKind(type: string): string {
  // Names only: validation and technical diagnostics stay with Core/Host.
  if (i18n.resolvedLanguage !== "ko") return type;
  const names: Record<string, MessageKey> = { paragraph: "Paragraph", heading: "Heading", table: "Table", equation: "Equation", figure: "Figure",
    blockquote: "Quote", quote: "Quote", bulletList: "Lists", orderedList: "Numbered list", codeBlock: "Code block",
    footnoteDefinition: "Endnote", footnote: "Endnote", admonition: "Admonition", divider: "Divider", horizontalRule: "Divider", labelTarget: "Section label" };
  return names[type] ? i18n.t(names[type]) : type;
}

function saveErrorScope(error: SaveContentError, submitted?: TiptapJSON, edits?: SupportedEdits): string {
  const block = saveErrorLocation(error, submitted, edits);
  const cell = block?.cell;
  const scope = block ? i18n.t("Block {{number}} ({{kind}})", { number: block.index + 1, kind: blockKind(block.type) }) +
    (cell ? i18n.t(", row {{row}}, column {{column}}", { row: cell.row + 1, column: cell.column + 1 }) : "")
    : i18n.t(error.phase === "file" ? "File access/write" : error.phase === "transport" ? "Save result unconfirmed"
      : error.phase === "request" ? "Host request" : error.phase === "revision" ? "External change" : "Document");
  const position = error.line ? i18n.t(", source line {{line}}", { line: error.line }) : "";
  return scope + position;
}

function saveErrorGuidance(error: SaveContentError, blockType?: string): string {
  const guidance = diagnostic(error.code, blockType);
  if (["collect", "replay", "serialize"].includes(error.phase) && guidance) return i18n.t(guidance);
  return i18n.t(error.phase === "revision" ? "Keep your edits; the file changed outside IeumDoc. Copy applied content from Source before deciding whether to Reload."
    : error.phase === "transport" ? "Keep your edits and check the connection and disk version. The save result is unconfirmed."
    : error.phase === "file" ? "Keep your edits and check the file path and write permissions."
    : "Keep your edits and review the reported location and technical details before saving again.");
}

export function saveErrorMessage(error: unknown, submitted?: TiptapJSON, edits?: SupportedEdits): string {
  if (!(error instanceof SaveContentError)) return error instanceof Error ? error.message : String(error);
  // Core/Host retain the authoritative diagnostic. UI guidance is selected by structured phase,
  // never by parsing English reasons or duplicating document validation rules.
  const guidance = i18n.resolvedLanguage === "ko" ? saveErrorGuidance(error, saveErrorLocation(error, submitted, edits)?.type) + "\n" + i18n.t("Technical details") + ": " : "";
  return `${saveErrorScope(error, submitted, edits)}: ${guidance}${error.reason} ${error.action}`;
}
