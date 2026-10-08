import { useReducer, useRef } from "react";
import type { FolderEntry, FolderResponse } from "../../shared/document-protocol.ts";

// The sidebar's view of the folder the user chose: a tree of one-level Host listings, loaded
// when a folder is expanded. Page state only; nothing here is stored, watched or scanned.

export type FolderTreeState = {
  /** The chosen folder; every listed folder is inside it. */
  root: string;
  /** Loaded listings by folder path. A collapsed folder keeps its listing. */
  nodes: ReadonlyMap<string, FolderResponse>;
  expanded: ReadonlySet<string>;
  /** The newest request per folder; an older answer never replaces it. */
  pending: ReadonlyMap<string, number>;
};

export type FolderTreeAction =
  | { type: "openRoot"; listing: FolderResponse }
  | { type: "closeRoot" }
  | { type: "expand"; path: string }
  | { type: "collapse"; path: string }
  | { type: "loadStart"; root: string; path: string; request: number }
  | { type: "loadSuccess"; root: string; path: string; request: number; listing: FolderResponse }
  | { type: "loadFailure"; root: string; path: string; request: number };

export function folderTreeReducer(state: FolderTreeState | null, action: FolderTreeAction): FolderTreeState | null {
  if (action.type === "openRoot") {
    return { root: action.listing.root, nodes: new Map([[action.listing.path, action.listing]]), expanded: new Set(), pending: new Map() };
  }
  if (!state || action.type === "closeRoot") return null;
  switch (action.type) {
    case "expand":
      return state.expanded.has(action.path) ? state : { ...state, expanded: new Set(state.expanded).add(action.path) };
    case "collapse": {
      if (!state.expanded.has(action.path)) return state;
      const expanded = new Set(state.expanded);
      expanded.delete(action.path);
      return { ...state, expanded };
    }
    case "loadStart":
      if (action.root !== state.root) return state;
      return { ...state, pending: new Map(state.pending).set(action.path, action.request) };
    case "loadSuccess":
    case "loadFailure": {
      // An answer for another chosen folder, or older than a newer request, changes nothing.
      if (action.root !== state.root || state.pending.get(action.path) !== action.request) return state;
      const pending = new Map(state.pending);
      pending.delete(action.path);
      if (action.type === "loadSuccess") return { ...state, pending, nodes: new Map(state.nodes).set(action.path, action.listing) };
      const expanded = new Set(state.expanded);
      expanded.delete(action.path);
      return { ...state, pending, expanded };
    }
  }
}

export type TreeItem = {
  entry: FolderEntry;
  /** 0 for the chosen folder's own entries. */
  depth: number;
  parent: string;
  /** 1-based position among its siblings, and their count. */
  position: number;
  size: number;
};

/** Entries in display order: each expanded, loaded folder is followed by its own entries. */
export function visibleTreeItems(state: FolderTreeState): TreeItem[] {
  const items: TreeItem[] = [];
  const visit = (path: string, depth: number) => {
    const listing = state.nodes.get(path);
    listing?.entries.forEach((entry, index) => {
      items.push({ entry, depth, parent: path, position: index + 1, size: listing.entries.length });
      if (entry.kind === "folder" && state.expanded.has(entry.path)) visit(entry.path, depth + 1);
    });
  };
  visit(state.root, 0);
  return items;
}

/**
 * The folders from the chosen folder down to the one containing `documentPath`, chosen folder
 * first; empty when the document is not inside it. Paths are Host-resolved, so they compare as text.
 */
export function folderChain(root: string, documentPath: string): string[] {
  const separator = root.includes("\\") ? "\\" : "/";
  const prefix = root.endsWith(separator) ? root : root + separator;
  if (!documentPath.startsWith(prefix)) return [];
  const chain = [root];
  for (const name of documentPath.slice(prefix.length).split(separator).slice(0, -1)) {
    chain.push(chain.length === 1 ? prefix + name : chain.at(-1) + separator + name);
  }
  return chain;
}

export type TreeKeyResult = { focus: string } | { expand: string } | { collapse: string } | { activate: TreeItem };

/** The tree keyboard contract: arrows, Home and End move; Right/Left expand, collapse or move; Enter and Space activate. */
export function treeKey(items: TreeItem[], index: number, key: string, expanded: ReadonlySet<string>): TreeKeyResult | undefined {
  const item = items[index];
  if (!item) return undefined;
  const folder = item.entry.kind === "folder";
  const open = folder && expanded.has(item.entry.path);
  switch (key) {
    case "ArrowDown": return items[index + 1] && { focus: items[index + 1].entry.path };
    case "ArrowUp": return items[index - 1] && { focus: items[index - 1].entry.path };
    case "Home": return { focus: items[0].entry.path };
    case "End": return { focus: items[items.length - 1].entry.path };
    case "ArrowRight":
      if (!folder) return undefined;
      if (!open) return { expand: item.entry.path };
      return items[index + 1]?.parent === item.entry.path ? { focus: items[index + 1].entry.path } : undefined;
    case "ArrowLeft":
      if (open) return { collapse: item.entry.path };
      return item.depth > 0 ? { focus: item.parent } : undefined;
    case "Enter":
    case " ":
      return { activate: item };
    default:
      return undefined;
  }
}

/** Tree state with its Host requests. `request` lists one level of a folder inside the chosen one. */
export function useFolderTree(request: (root: string, path: string) => Promise<FolderResponse>, onError: (message: string) => void) {
  const [state, dispatch] = useReducer(folderTreeReducer, null);
  const latest = useRef(state);
  latest.current = state;
  const requests = useRef(0);

  const load = (root: string, path: string) => {
    const id = ++requests.current;
    dispatch({ type: "loadStart", root, path, request: id });
    request(root, path).then(
      listing => dispatch({ type: "loadSuccess", root, path, request: id, listing }),
      (cause: unknown) => {
        dispatch({ type: "loadFailure", root, path, request: id });
        if (latest.current?.root === root) onError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };

  // Expands the folders above a document inside the chosen folder and lists them again (the
  // chosen folder too unless it was just listed). A document elsewhere changes nothing.
  const show = (root: string, documentPath: string, listRoot: boolean) => {
    for (const folder of folderChain(root, documentPath)) {
      if (folder !== root) dispatch({ type: "expand", path: folder });
      if (folder !== root || listRoot) load(root, folder);
    }
  };

  return {
    state,
    /** Shows a newly chosen folder, opened down to the open document when it is inside. */
    open(listing: FolderResponse, documentPath: string) {
      dispatch({ type: "openRoot", listing });
      show(listing.root, documentPath, false);
    },
    close: () => dispatch({ type: "closeRoot" }),
    /** Expanding lists the folder again; collapsing keeps what was listed. */
    toggle(path: string) {
      if (!state) return;
      if (state.expanded.has(path)) return dispatch({ type: "collapse", path });
      dispatch({ type: "expand", path });
      load(state.root, path);
    },
    /** Shows the document just opened or created; its folders are listed again, so a new file appears. */
    reveal(documentPath: string) {
      if (state) show(state.root, documentPath, true);
    },
  };
}
