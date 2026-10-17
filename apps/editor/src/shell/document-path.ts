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

/**
 * The folders that hold a document, for display: from the chosen sidebar folder down when the
 * document is inside it (`docs`, `guides`), otherwise only its own folder.
 */
export function documentLocation(documentPath: string, root?: string): string[] {
  const { directory } = splitDocumentPath(documentPath);
  if (!directory) return [];
  const trim = (path: string) => path.replace(/[\\/]+$/, "");
  const folder = trim(directory);
  const base = root ? trim(root) : "";
  if (base && (folder === base || folder.startsWith(base + "\\") || folder.startsWith(base + "/"))) {
    const rootName = splitDocumentPath(base).name || root!;
    return [rootName, ...folder.slice(base.length).split(/[\\/]/).filter(Boolean)];
  }
  return [splitDocumentPath(folder).name || directory];
}
