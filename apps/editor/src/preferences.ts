/**
 * User display preferences. They belong to this browser, never to a document: nothing here is
 * written to Markdown or sent to the Host. Their visual values live in `styles/tokens.css`.
 */
export type DocumentWidth = "standard" | "wide";

const DOCUMENT_WIDTH_KEY = "ieumdoc.documentWidth";

export function readDocumentWidth(): DocumentWidth {
  try {
    return globalThis.localStorage?.getItem(DOCUMENT_WIDTH_KEY) === "wide" ? "wide" : "standard";
  } catch {
    return "standard";
  }
}

/** Remembers the preference when storage is available; the current page applies it either way. */
export function writeDocumentWidth(width: DocumentWidth): void {
  try {
    globalThis.localStorage?.setItem(DOCUMENT_WIDTH_KEY, width);
  } catch {
    // Storage can be disabled; the preference then lasts for this page only.
  }
}
