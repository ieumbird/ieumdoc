/**
 * User display and navigation preferences. They belong to this browser, never to a document: nothing here is
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

const RECENT_FOLDERS_KEY = "ieumdoc.recentFolders";
const RECENT_FOLDER_LIMIT = 5;

/** Folders opened in this browser, newest first. */
export function readRecentFolders(): string[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(RECENT_FOLDERS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, RECENT_FOLDER_LIMIT) : [];
  } catch {
    return [];
  }
}

/** Puts a folder first in the recent list; returns the new list. */
export function rememberRecentFolder(folder: string, previous = readRecentFolders()): string[] {
  const recent = [folder, ...previous.filter(item => item !== folder)].slice(0, RECENT_FOLDER_LIMIT);
  try {
    globalThis.localStorage?.setItem(RECENT_FOLDERS_KEY, JSON.stringify(recent));
  } catch {
    // Storage can be disabled; the list then lasts for this page only.
  }
  return recent;
}
