import { i18n } from "./i18n.ts";
import { splitDocumentPath } from "./shell/document-path.ts";

/** Paths here have already been normalized by the Host. Never guess filesystem identity. */
export function openedTab<T extends { path: string }>(tabs: readonly T[], path: string): T | undefined {
  return tabs.find(tab => tab.path === path);
}

export function activeAfterClose<T extends { id: string }>(tabs: readonly T[], active: string | null, closing: string): string | null {
  if (closing !== active) return active;
  const index = tabs.findIndex(tab => tab.id === closing);
  return tabs[index + 1]?.id ?? tabs[index - 1]?.id ?? null;
}

/** Each tab's filename and, for files with the same name, the shortest parent folder suffix that distinguishes it. */
export function tabLabels(tabs: readonly { path: string }[]): { name: string; folder?: string }[] {
  const parts = tabs.map(tab => splitDocumentPath(tab.path));
  return parts.map(({ name, directory }) => {
    const same = parts.filter(part => part.name === name);
    if (same.length === 1) return { name };
    const folders = directory.replace(/[\\/]$/, "").split(/[\\/]/);
    // Use the shortest parent suffix that distinguishes even sibling folders with the same name.
    for (let count = 1; count <= folders.length; count++) {
      const suffix = folders.slice(-count).join("/");
      if (same.filter(part => part.directory.replace(/[\\/]$/, "").split(/[\\/]/).slice(-count).join("/") === suffix).length === 1) {
        return { name, folder: suffix };
      }
    }
    return { name, folder: directory };
  });
}

/** Accessible tab names: the filename, then its distinguishing folder. */
export function tabNames(tabs: readonly { path: string }[]): string[] {
  return tabLabels(tabs).map(({ name, folder }) => folder ? `${name} — ${folder}` : name);
}

export function allTabsPendingWork(tabs: Iterable<{ pendingWork(): string | null }>, opening: boolean): string | null {
  if (opening) return i18n.t("IeumDoc is still opening a document. Try again in a moment.");
  for (const tab of tabs) {
    const reason = tab.pendingWork();
    if (reason) return reason;
  }
  return null;
}
