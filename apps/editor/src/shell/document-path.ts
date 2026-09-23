/** Display split only; the full path stays the document address. */
export function splitDocumentPath(documentPath: string): { directory: string; name: string } {
  const index = Math.max(documentPath.lastIndexOf("/"), documentPath.lastIndexOf("\\"));
  return { directory: documentPath.slice(0, index + 1), name: documentPath.slice(index + 1) };
}
