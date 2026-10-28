import type { NodePath } from "./document.ts";

/** Write refusal information, independent of an editor, transport or filesystem. */
export type WriteIssueCode = "native-marker" | "native-metadata" | "native-content"
  | "invalid-structure" | "invalid-operation" | "unsupported-content" | "empty-content"
  | "round-trip-mismatch" | "serialization-failed" | "invalid-unicode"
  | "invalid-label" | "label-conflict" | "invalid-reference" | "invalid-footnote"
  | "line-break" | "table-cell-whitespace" | "table-shape" | "invalid-figure";
export type WriteIssue = { code?: WriteIssueCode; reason: string; action: string; path?: NodePath; line?: number };

export class DocumentWriteError extends Error {
  constructor(message: string, readonly location: Omit<WriteIssue, "reason">, options?: ErrorOptions) {
    super(message, options);
  }
}

/** Codes are assigned at the failing check, never inferred from diagnostic prose. */
export class DocumentDiagnosticError extends DocumentWriteError {
  constructor(code: WriteIssueCode, message: string, options?: ErrorOptions) {
    super(message, { code, action: "Review the affected content. If the reason does not identify a correction, report this error." }, options);
  }
}

/** Preserve metadata through operation wrappers without interpreting error strings. */
export function writeIssueOf(error: unknown): WriteIssue {
  const reason = error instanceof Error ? error.message : String(error);
  const seen = new Set<unknown>();
  for (let cause = error; cause instanceof Error && !seen.has(cause); cause = cause.cause) {
    seen.add(cause);
    if (cause instanceof DocumentWriteError) return { reason, ...cause.location };
  }
  return { reason, action: "Review the affected content. If the reason does not identify a correction, report this error." };
}
