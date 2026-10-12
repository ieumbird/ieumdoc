/** Display split only; the full path stays the document address. */
export function splitDocumentPath(documentPath: string): { directory: string; name: string } {
  const index = Math.max(documentPath.lastIndexOf("/"), documentPath.lastIndexOf("\\"));
  return { directory: documentPath.slice(0, index + 1), name: documentPath.slice(index + 1) };
}

/** A typed or pasted path without surrounding space or the quotes Explorer's "Copy as path" adds. */
export function unquotePath(value: string): string {
  const trimmed = value.trim();
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1).trim() : trimmed;
}

/** One name appended to a Host folder path; the Host still resolves and validates the address. */
export function childPath(directory: string, name: string): string {
  const separator = directory.includes("\\") ? "\\" : "/";
  return directory + (/[\/]$/.test(directory) ? "" : separator) + name;
}
