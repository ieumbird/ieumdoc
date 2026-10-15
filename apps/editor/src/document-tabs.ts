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

export function tabNames(tabs: readonly { path: string }[]): string[] {
  const parts = tabs.map(tab => splitDocumentPath(tab.path));
  return parts.map(({ name, directory }) => {
    const same = parts.filter(part => part.name === name);
    if (same.length === 1) return name;
    const folders = directory.replace(/[\\/]$/, "").split(/[\\/]/);
    // Use the shortest parent suffix that distinguishes even sibling folders with the same name.
    for (let count = 1; count <= folders.length; count++) {
      const suffix = folders.slice(-count).join("/");
      if (same.filter(part => part.directory.replace(/[\\/]$/, "").split(/[\\/]/).slice(-count).join("/") === suffix).length === 1) {
        return `${name} — ${suffix}`;
      }
    }
    return `${name} — ${directory}`;
  });
}

export function allTabsPendingWork(tabs: Iterable<{ pendingWork(): string | null }>, opening: boolean): string | null {
  if (opening) return "IeumDoc is still opening a document. Try again in a moment.";
  for (const tab of tabs) {
    const reason = tab.pendingWork();
    if (reason) return reason;
  }
  return null;
}
