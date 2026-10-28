import type { TiptapJSON } from "./tiptap-inline.ts";
import { i18n, type MessageKey } from "./i18n.ts";
import { isSessionPlaceholder } from "./tiptap-edits.ts";
import { SaveContentError } from "../shared/save-error.ts";
import type { SupportedEdits } from "../shared/document-protocol.ts";
import { TABLE_CELL_SOURCE_ATTR } from "./tiptap-projection.ts";

/** Retain the submitted snapshot so changing UI language can reformat a visible failure. */
export class SaveDisplayError extends Error {
  constructor(readonly failures: readonly unknown[], readonly submitted?: TiptapJSON, readonly edits?: SupportedEdits) { super(); }
  override get message(): string { return this.failures.map(error => saveErrorMessage(error, this.submitted, this.edits)).join("\n"); }
  get summary(): string { return this.failures.map(error => error instanceof SaveContentError
    ? `${saveErrorScope(error, this.submitted, this.edits)}: ${saveErrorGuidance(error)}` : error instanceof Error ? error.message : String(error)).join("\n"); }
  get details(): string { return this.failures.map(error => error instanceof SaveContentError
    ? `${error.reason} ${error.action}` : error instanceof Error ? error.message : String(error)).join("\n"); }
  get locations(): SaveErrorLocation[] { return this.failures.flatMap(error => {
    const location = error instanceof SaveContentError ? saveErrorLocation(error, this.submitted, this.edits) : undefined;
    return location ? [location] : [];
  }); }
}

export type SaveErrorLocation = { index: number; type: string; cell?: { row: number; column: number } };

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
  return block ? { ...block, ...(cell ? { cell } : {}) } : undefined;
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

function saveErrorGuidance(error: SaveContentError): string {
  return i18n.t(error.phase === "revision" ? "Keep your edits; the file changed outside IeumDoc. Copy applied content from Source before deciding whether to Reload."
    : error.phase === "transport" ? "Keep your edits and check the connection and disk version. The save result is unconfirmed."
    : error.phase === "file" ? "Keep your edits and check the file path and write permissions."
    : "Keep your edits and review the reported location and technical details before saving again.");
}

export function saveErrorMessage(error: unknown, submitted?: TiptapJSON, edits?: SupportedEdits): string {
  if (!(error instanceof SaveContentError)) return error instanceof Error ? error.message : String(error);
  // Core/Host retain the authoritative diagnostic. UI guidance is selected by structured phase,
  // never by parsing English reasons or duplicating document validation rules.
  const guidance = i18n.resolvedLanguage === "ko" ? saveErrorGuidance(error) + "\n" + i18n.t("Technical details") + ": " : "";
  return `${saveErrorScope(error, submitted, edits)}: ${guidance}${error.reason} ${error.action}`;
}
