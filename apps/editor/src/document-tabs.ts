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

/** Navigation only. Sessions remain keyed by document id under one stable React parent. */
export type EditorGroup = { id: number; tabs: string[]; active: string | null };
export type EditorGroups = { groups: EditorGroup[]; focused: number };
export const initialEditorGroups: EditorGroups = { groups: [{ id: 0, tabs: [], active: null }], focused: 0 };
export type GroupAction =
  | { type: "reset"; tabs: string[]; active: string | null }
  | { type: "select"; id: string }
  | { type: "open"; id: string; group?: number }
  | { type: "close"; id: string }
  | { type: "merge" };

export function editorGroups(state: EditorGroups, action: GroupAction): EditorGroups {
  if (action.type === "reset") return { groups: [{ id: 0, tabs: action.tabs, active: action.active }], focused: 0 };
  if (action.type === "merge") {
    if (state.groups.length === 1) return state;
    return { groups: [{ id: state.groups[0]!.id, tabs: state.groups.flatMap(group => group.tabs),
      active: state.groups.find(group => group.id === state.focused)!.active }], focused: state.groups[0]!.id };
  }
  const owner = state.groups.find(group => group.tabs.includes(action.id));
  if (action.type === "select") {
    if (!owner || owner.id === state.focused && owner.active === action.id) return state;
    return { groups: state.groups.map(group => group === owner ? { ...group, active: action.id } : group), focused: owner.id };
  }
  const target = action.type === "open" ? action.group ?? state.focused : undefined;
  if (action.type === "open" && owner?.id === target) return editorGroups(state, { type: "select", id: action.id });
  let groups = state.groups.map(group => {
    if (group === owner) {
      const active = activeAfterClose(group.tabs.map(id => ({ id })), group.active, action.id);
      return { ...group, tabs: group.tabs.filter(id => id !== action.id), active };
    }
    return group;
  });
  if (action.type === "open") {
    if (!groups.some(group => group.id === target)) {
      // Only the two stable group ids are allowed. A caller cannot create a third column.
      if (groups.length >= 2 || target !== 0 && target !== 1) return state;
      groups = [...groups, { id: target, tabs: [], active: null }];
    }
    groups = groups.map(group => group.id === target ? { ...group, tabs: [...group.tabs, action.id], active: action.id } : group);
  }
  groups = groups.filter(group => group.tabs.length);
  if (!groups.length) return initialEditorGroups;
  const focused = target ?? state.focused;
  return { groups, focused: groups.some(group => group.id === focused) ? focused : groups[0]!.id };
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
  if (opening) return i18n.t("{{product}} is still opening a document. Try again in a moment.");
  for (const tab of tabs) {
    const reason = tab.pendingWork();
    if (reason) return reason;
  }
  return null;
}
