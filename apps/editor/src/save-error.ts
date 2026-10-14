import type { TiptapJSON } from "./tiptap-inline.ts";
import { isSessionPlaceholder } from "./tiptap-edits.ts";
import { SaveContentError } from "../shared/save-error.ts";
import type { SupportedEdits } from "../shared/document-protocol.ts";
import type { EditableDocument, WriteIssue } from "@ieumdoc/core";
import { TABLE_CELL_SOURCE_ATTR } from "./tiptap-projection.ts";

export function writeIssueMessage(issue: WriteIssue, document: EditableDocument): string {
  const index = issue.path?.length ? document.blocks.findIndex(block => block.path[0] === issue.path![0]) : -1;
  const location = index >= 0 ? `Block ${index + 1} (${document.blocks[index].block})` : "Document";
  return `${location}${issue.line ? `, source line ${issue.line}` : ""}: ${issue.reason} ${issue.action}`;
}

/** Resolve Host snapshot locators against the submitted document, never later user input. */
export function saveErrorMessage(error: unknown, submitted?: TiptapJSON, edits?: SupportedEdits): string {
  if (!(error instanceof SaveContentError)) return error instanceof Error ? error.message : String(error);
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
  const scope = block ? `Block ${block.index + 1} (${block.type})${cell ? `, row ${cell.row + 1}, column ${cell.column + 1}` : ""}`
    : error.phase === "file" ? "File access/write" : error.phase === "transport" ? "Save result unconfirmed"
      : error.phase === "request" ? "Host request" : error.phase === "revision" ? "External change" : "Document";
  return `${scope}${error.line ? `, source line ${error.line}` : ""}: ${error.reason} ${error.action}`;
}
