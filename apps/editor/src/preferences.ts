/**
 * User display and navigation preferences. They belong to this browser, never to a document: nothing here is
 * written to Markdown or sent to the Host. Their visual values live in `styles/tokens.css`.
 */
export type DocumentWidth = "standard" | "wide";

export type UiLanguage = "ko" | "en";
export const UI_LANGUAGE_KEY = "ieumdoc.uiLanguage";

export function readUiLanguage(): UiLanguage {
  try {
    const saved = globalThis.localStorage?.getItem(UI_LANGUAGE_KEY);
    if (saved === "ko" || saved === "en") return saved;
  } catch { /* A disabled preference store does not prevent opening the Editor. */ }
  const preferred = globalThis.navigator?.languages?.[0] || globalThis.navigator?.language || "en";
  return /^ko(?:-|$)/i.test(preferred) ? "ko" : "en";
}

/** The live choice still applies when preference persistence is unavailable. */
export function writeUiLanguage(language: UiLanguage): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(UI_LANGUAGE_KEY, language);
    return true;
  } catch { return false; }
}

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

/** Display filtering only; the Host still authorizes each filesystem request. */
export function visibleRecentFolders(recent: string[], roots?: readonly string[]): string[] {
  if (!roots) return recent;
  const normalize = (value: string) => {
    const windows = /^[a-z]:[\\/]|^\\\\/i.test(value);
    const normalized = value.replaceAll("\\", "/").replace(/\/+$/, "");
    return windows ? normalized.toLowerCase() : normalized;
  };
  return recent.filter(folder => !folder.replaceAll("\\", "/").split("/").some(part => part === ".." || part === ".") &&
    roots.some(root => normalize(folder) === normalize(root) || normalize(folder).startsWith(`${normalize(root)}/`)));
}

/** Folders opened in this browser, newest first. */
export function readRecentFolders(): string[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(RECENT_FOLDERS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, RECENT_FOLDER_LIMIT) : [];
  } catch {
    return [];
  }
}

const OPEN_FOLDERS_KEY = "ieumdoc.openFolders";

/**
 * The sidebar's opened folders, in order, for this browser and Host origin. Only paths are stored;
 * each is listed again through the Host on start, which still authorizes it.
 */
export function readOpenFolders(): string[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(OPEN_FOLDERS_KEY) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))] : [];
  } catch {
    return [];
  }
}

export function writeOpenFolders(folders: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(OPEN_FOLDERS_KEY, JSON.stringify(folders));
  } catch {
    // Storage can be disabled; the folders then stay open for this page only.
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
