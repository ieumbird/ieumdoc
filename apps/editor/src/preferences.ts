/**
 * User display and navigation preferences. They belong to this browser, never to a document: nothing here is
 * written to Markdown or sent to the Host. Their visual values live in `styles/tokens.css`.
 */
export type DocumentWidth = "standard" | "wide";

export const THEMES = ["system", "light", "dark"] as const;
export type ThemePreference = typeof THEMES[number];
export const THEME_KEY = "ieumdoc.theme";

export function readTheme(): ThemePreference {
  try {
    const saved = globalThis.localStorage?.getItem(THEME_KEY);
    return THEMES.find(theme => theme === saved) ?? "system";
  } catch { return "system"; }
}

export function writeTheme(theme: ThemePreference): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(THEME_KEY, theme);
    return true;
  } catch { return false; }
}

export const ACCENT_COLORS = ["blue", "violet", "plum", "teal", "green", "graphite"] as const;
export type AccentColor = typeof ACCENT_COLORS[number];
export const ACCENT_COLOR_KEY = "ieumdoc.accentColor";

export function readAccentColor(): AccentColor {
  try {
    const saved = globalThis.localStorage?.getItem(ACCENT_COLOR_KEY);
    return ACCENT_COLORS.find(color => color === saved) ?? "blue";
  } catch { return "blue"; }
}

/** The live choice still applies when preference persistence is unavailable. */
export function writeAccentColor(color: AccentColor): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(ACCENT_COLOR_KEY, color);
    return true;
  } catch { return false; }
}

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

const COLLAPSED_FOLDER_SECTIONS_KEY = "ieumdoc.collapsedFolderSections";

/** Collapsed opened roots only, in the same browser/origin boundary as openFolders. */
export function readCollapsedFolderSections(): string[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(COLLAPSED_FOLDER_SECTIONS_KEY) ?? "[]");
    return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))] : [];
  } catch { return []; }
}

export function writeCollapsedFolderSections(roots: readonly string[]): void {
  try { globalThis.localStorage?.setItem(COLLAPSED_FOLDER_SECTIONS_KEY, JSON.stringify(roots)); }
  catch { /* Disabled storage leaves section visibility usable for this page. */ }
}

const OPEN_TABS_KEY = "ieumdoc.openTabs";
export type OpenTabsPreference = { paths: string[]; activePath: string | null };

/** null means no usable preference; an empty list deliberately starts without a document. */
export function readOpenTabs(): OpenTabsPreference | null {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(OPEN_TABS_KEY) ?? "null") as OpenTabsPreference | null;
    if (!value || !Array.isArray(value.paths)) return null;
    const paths = [...new Set(value.paths.filter((item): item is string => typeof item === "string" && item.length > 0))];
    return { paths, activePath: typeof value.activePath === "string" && paths.includes(value.activePath) ? value.activePath : null };
  } catch { return null; }
}

/** Navigation only: never content, editor snapshots, or Host authorization. */
export function writeOpenTabs(tabs: OpenTabsPreference): void {
  try { globalThis.localStorage?.setItem(OPEN_TABS_KEY, JSON.stringify(tabs)); }
  catch { /* Disabled storage leaves the current page's tabs usable. */ }
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
