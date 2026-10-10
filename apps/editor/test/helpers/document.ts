import { getEditableDocument, parse } from "@ieumdoc/core";

/** Fixture projection only; file loading is tested through loadDocumentFile. */
export function loadEditableDocument(source: string) {
  return getEditableDocument(parse(source));
}
