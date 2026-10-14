import { getEditableDocument, parse } from "@ieumdoc/core";

/** Explicitly author a native test document from its body, never used by production admission. */
export function nativeSource(body: string): string {
  return `---\nieumdoc: 1\n---\n\n${body}`;
}

/** Fixture projection only; file loading is tested through loadDocumentFile. */
export function loadEditableDocument(source: string) {
  return getEditableDocument(parse(source));
}
