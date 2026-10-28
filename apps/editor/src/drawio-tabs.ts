// SPIKE: Draw.io diagrams open as tabs beside the document tabs. The App renders them; Figures open,
// update and refresh through this store, so a diagram tab outlives the popup that opened it.
import { useSyncExternalStore } from "react";

export type DiagramTab = {
  id: string;
  /** The document whose Figure opened this tab; the diagram path is relative to it. */
  documentPath: string;
  /** `./…drawio.svg`, or undefined until the first save of a new diagram. */
  path?: string;
  dirty: boolean;
};

let tabs: readonly DiagramTab[] = [];
let next = 0;
const listeners = new Set<() => void>();
/** The new-diagram Figure that waits for the first save to put the file in its image. */
const creators = new Map<string, (path: string) => boolean>();
/** Mounted Figures showing a diagram, refreshed when it is saved. */
const viewers = new Map<string, Set<() => void>>();
let activate: (id: string) => void = () => {};

const key = (documentPath: string, path: string) => `${documentPath}\n${path}`;
function set(value: readonly DiagramTab[]): void {
  tabs = value;
  for (const listener of listeners) listener();
}

export const diagramTabs = (): readonly DiagramTab[] => tabs;
export function subscribeDiagramTabs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function useDiagramTabs(): readonly DiagramTab[] {
  return useSyncExternalStore(subscribeDiagramTabs, diagramTabs, diagramTabs);
}
/** The App activates tabs; the store only asks. */
export function setDiagramActivator(value: (id: string) => void): void { activate = value; }

/** Opens the diagram's tab, or focuses the one already open for the same file. */
export function openDiagramTab(documentPath: string, path?: string, onCreated?: (path: string) => boolean): string {
  const existing = path ? tabs.find(tab => tab.documentPath === documentPath && tab.path === path) : undefined;
  if (existing) {
    activate(existing.id);
    return existing.id;
  }
  const id = `diagram-${++next}`;
  if (!path && onCreated) creators.set(id, onCreated);
  set([...tabs, { id, documentPath, path, dirty: false }]);
  activate(id);
  return id;
}

/**
 * A save wrote `path`. A new diagram puts it in the Figure that created it (false when that Figure
 * is gone, so the file is saved but not placed); every Figure showing the file reloads it.
 */
export function diagramSaved(id: string, path: string): { placed: boolean } {
  const tab = tabs.find(item => item.id === id);
  if (!tab) return { placed: false };
  let placed = true;
  if (!tab.path) {
    placed = creators.get(id)?.(path) ?? false;
    creators.delete(id);
  }
  set(tabs.map(item => item.id === id ? { ...item, path, dirty: false } : item));
  for (const refresh of viewers.get(key(tab.documentPath, path)) ?? []) refresh();
  return { placed };
}

export function setDiagramDirty(id: string, dirty: boolean): void {
  if (tabs.find(tab => tab.id === id)?.dirty === dirty) return;
  set(tabs.map(tab => tab.id === id ? { ...tab, dirty } : tab));
}

export function removeDiagramTab(id: string): void {
  creators.delete(id);
  set(tabs.filter(tab => tab.id !== id));
}

/** A Figure showing `path` reloads its image after the diagram is saved. */
export function watchDiagram(documentPath: string, path: string, refresh: () => void): () => void {
  const watching = viewers.get(key(documentPath, path)) ?? new Set();
  viewers.set(key(documentPath, path), watching);
  watching.add(refresh);
  return () => {
    watching.delete(refresh);
    if (!watching.size) viewers.delete(key(documentPath, path));
  };
}

/** The tab's file name, or New diagram before the first save. */
export function diagramTabName(tab: DiagramTab, untitled: string): string {
  return tab.path?.split("/").pop() || untitled;
}

/** The document path a diagram's file resolves against: its folder joined with `./assets/x`. */
export function diagramFilePath(tab: DiagramTab): string {
  if (!tab.path) return "";
  const slash = Math.max(tab.documentPath.lastIndexOf("/"), tab.documentPath.lastIndexOf("\\"));
  return `${tab.documentPath.slice(0, slash + 1)}${tab.path.replace(/^\.\//, "")}`;
}
