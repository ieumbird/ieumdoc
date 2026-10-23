import { useEffect, useReducer, useRef, useState } from "react";
import type { FolderEntry, FolderResponse } from "../../shared/document-protocol.ts";
import { readOpenFolders, writeOpenFolders } from "../preferences.ts";

// The sidebar's view of the folders the user opened: one tree of one-level Host listings per
// folder, loaded when a folder is expanded. Only the opened folders' paths are remembered (see
// preferences.ts); listings and expansion are page state, never stored, watched or scanned.

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

/** Every tree action except opening and closing names the opened folder it belongs to. */
export type FolderTreesAction =
  | { type: "openRoot"; listing: FolderResponse }
  | { type: "closeRoot"; root: string }
  | (Exclude<FolderTreeAction, { type: "openRoot" | "closeRoot" }> & { root: string });

/** Opened folders in the order they were opened. Opening one already open relists it in place. */
export function folderTreesReducer(trees: readonly FolderTreeState[], action: FolderTreesAction): FolderTreeState[] {
  if (action.type === "openRoot") {
    const { listing } = action;
    if (!trees.some(tree => tree.root === listing.root)) return [...trees, folderTreeReducer(null, action)!];
    return trees.map(tree => tree.root === listing.root ? { ...tree, nodes: new Map(tree.nodes).set(listing.path, listing) } : tree);
  }
  if (action.type === "closeRoot") return trees.filter(tree => tree.root !== action.root);
  return trees.map(tree => tree.root === action.root ? folderTreeReducer(tree, action) ?? tree : tree);
}

/**
 * The outermost opened folder containing a document or folder; it scopes that item's folder context.
 * A nested opened folder never narrows the context a wider opened folder already gives.
 */
export function containingRoot(roots: readonly string[], itemPath: string): string | undefined {
  return roots.filter(root => folderChain(root, itemPath).length > 0)
    .reduce<string | undefined>((outer, root) => outer === undefined || root.length < outer.length ? root : outer, undefined);
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

/** Every folder the tree knows, in tree order: the chosen folder, then each listed sub-folder. */
export function knownFolders(state: FolderTreeState): string[] {
  const folders: string[] = [];
  const visit = (path: string) => {
    folders.push(path);
    for (const entry of state.nodes.get(path)?.entries ?? []) if (entry.kind === "folder") visit(entry.path);
  };
  visit(state.root);
  return folders;
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

/** Opened folders with their Host requests. `request` lists one level of a folder inside an opened one. */
export function useFolderTrees(request: (root: string, path?: string) => Promise<FolderResponse>, onError: (message: string) => void) {
  const [trees, dispatch] = useReducer(folderTreesReducer, []);
  const latest = useRef(trees);
  latest.current = trees;
  const requests = useRef(0);
  const roots = trees.map(tree => tree.root);
  const [restored, setRestored] = useState(false);
  const [remember, setRemember] = useState(false);
  const rememberedRoots = useRef<readonly string[]>([]);
  const userChangedRoots = useRef(new Set<string>());

  // Restoration alone never rewrites preferences, including paths the Host no longer lists.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = readOpenFolders();
      rememberedRoots.current = saved;
      for (const root of saved) {
        if (cancelled) return;
        try {
          const listing = await request(root);
          // A user's Open/Close of this Host path takes precedence over its older restoration.
          if (!cancelled && !userChangedRoots.current.has(listing.root)) dispatch({ type: "openRoot", listing });
        } catch { /* Moved, removed or refused folders are left out quietly. */ }
      }
      if (!cancelled) setRestored(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Derive remembered paths from the same current state as the Sidebar, never an async caller's
  // render. A user change during restoration waits so pending remembered folders are not lost.
  useEffect(() => {
    if (!restored || !remember) return;
    const next = trees.map(tree => tree.root);
    const previous = rememberedRoots.current;
    if (next.length === previous.length && next.every((root, index) => root === previous[index])) return;
    writeOpenFolders(next);
    rememberedRoots.current = next;
  }, [trees, restored, remember]);

  const load = (root: string, path: string) => {
    const id = ++requests.current;
    dispatch({ type: "loadStart", root, path, request: id });
    request(root, path).then(
      listing => dispatch({ type: "loadSuccess", root, path, request: id, listing }),
      (cause: unknown) => {
        dispatch({ type: "loadFailure", root, path, request: id });
        if (latest.current.some(tree => tree.root === root)) onError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };

  // Expands the folders above a document or folder inside an opened folder and lists them again (the
  // opened folder too unless it was just listed). A document elsewhere changes nothing.
  const show = (root: string, itemPath: string, listRoot: boolean) => {
    for (const folder of folderChain(root, itemPath)) {
      if (folder !== root) dispatch({ type: "expand", root, path: folder });
      if (folder !== root || listRoot) load(root, folder);
    }
  };

  return {
    trees,
    roots,
    /** The outermost opened folder containing a path, if any. */
    rootOf: (itemPath: string) => containingRoot(roots, itemPath),
    /** Adds a folder (or relists one already open), opened down to the open document when it is inside. */
    open(listing: FolderResponse, documentPath: string) {
      if (!restored) userChangedRoots.current.add(listing.root);
      dispatch({ type: "openRoot", listing });
      setRemember(true);
      show(listing.root, documentPath, false);
    },
    close(root: string) {
      if (!restored) userChangedRoots.current.add(root);
      dispatch({ type: "closeRoot", root });
      setRemember(true);
    },
    /** Expanding lists the folder again; collapsing keeps what was listed. */
    toggle(root: string, path: string) {
      const tree = trees.find(item => item.root === root);
      if (!tree) return;
      if (tree.expanded.has(path)) return dispatch({ type: "collapse", root, path });
      dispatch({ type: "expand", root, path });
      load(root, path);
    },
    /**
     * Shows the document just opened or created, or a folder just created, in every opened folder
     * containing it; the folders above it are expanded and listed again, so a new item appears.
     */
    reveal(itemPath: string) {
      for (const root of roots) show(root, itemPath, true);
    },
    /** Lists a folder the trees already know again, without expanding anything. */
    refresh(path: string) {
      for (const tree of trees) if (tree.nodes.has(path)) load(tree.root, path);
    },
  };
}
