import { useEffect, useReducer, useRef, useState } from "react";
import type { FolderEntry, FolderResponse } from "../../shared/document-protocol.ts";
import { readCollapsedFolderSections, readOpenFolders, writeCollapsedFolderSections, writeOpenFolders } from "../preferences.ts";

// The sidebar's view of the folders the user opened: one tree of one-level Host listings per
// folder, loaded when a folder is expanded. Opened roots and collapsed sections are remembered
// (preferences.ts); listings and subfolder expansion are never stored, watched or scanned.

export type FolderTreeState = {
  /** The chosen folder; every listed folder is inside it. */
  root: string;
  /** Remembered independently of the subfolders' page-only expansion. */
  sectionExpanded: boolean;
  /** Loaded listings by folder path. A collapsed folder keeps its listing. */
  nodes: ReadonlyMap<string, FolderResponse>;
  expanded: ReadonlySet<string>;
  /** The newest request per folder; an older answer never replaces it. */
  pending: ReadonlyMap<string, number>;
};

export type FolderTreeAction =
  | { type: "openRoot"; listing: FolderResponse; sectionExpanded?: boolean }
  | { type: "closeRoot" }
  | { type: "setSectionExpanded"; expanded: boolean }
  | { type: "expand"; path: string }
  | { type: "collapse"; path: string }
  | { type: "loadStart"; root: string; path: string; request: number }
  | { type: "loadSuccess"; root: string; path: string; request: number; listing: FolderResponse }
  | { type: "loadFailure"; root: string; path: string; request: number; preserveExpansion?: boolean };

export function folderTreeReducer(state: FolderTreeState | null, action: FolderTreeAction): FolderTreeState | null {
  if (action.type === "openRoot") {
    return { root: action.listing.root, sectionExpanded: action.sectionExpanded ?? true, nodes: new Map([[action.listing.path, action.listing]]), expanded: new Set(), pending: new Map() };
  }
  if (!state || action.type === "closeRoot") return null;
  switch (action.type) {
    case "setSectionExpanded":
      return state.sectionExpanded === action.expanded ? state : { ...state, sectionExpanded: action.expanded };
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
      if (action.preserveExpansion) return { ...state, pending };
      const expanded = new Set(state.expanded);
      expanded.delete(action.path);
      return { ...state, pending, expanded };
    }
  }
}

/** Every tree action except opening and closing names the opened folder it belongs to. */
export type FolderTreesAction =
  | { type: "openRoot"; listing: FolderResponse; sectionExpanded?: boolean }
  | { type: "closeRoot"; root: string }
  | (Exclude<FolderTreeAction, { type: "openRoot" | "closeRoot" }> & { root: string });

/** Non-overlapping roots. A wider root takes the first absorbed section's place. */
export function folderTreesReducer(trees: readonly FolderTreeState[], action: FolderTreesAction): FolderTreeState[] {
  if (action.type === "openRoot") {
    const { listing } = action;
    const parent = trees.find(tree => containsFolder(tree.root, listing.root));
    if (parent) return trees.map(tree => tree === parent
      ? { ...tree, nodes: new Map(tree.nodes).set(listing.path, { ...listing, root: tree.root }) } : tree);
    const absorbed = trees.filter(tree => containsFolder(listing.root, tree.root));
    const next = folderTreeReducer(null, action)!;
    const nodes = new Map(next.nodes);
    const expanded = new Set(next.expanded);
    for (const tree of absorbed) {
      for (const [path, node] of tree.nodes) nodes.set(path, { ...node, root: listing.root });
      for (const path of tree.expanded) expanded.add(path);
      for (const path of folderChain(listing.root, tree.root)) if (path !== listing.root) expanded.add(path);
      if (tree.sectionExpanded) expanded.add(tree.root);
    }
    const merged = { ...next, nodes, expanded };
    if (!absorbed.length) return [...trees, merged];
    return trees.flatMap(tree => tree === absorbed[0] ? [merged] : absorbed.includes(tree) ? [] : [tree]);
  }
  if (action.type === "closeRoot") return trees.filter(tree => tree.root !== action.root);
  return trees.map(tree => tree.root === action.root ? folderTreeReducer(tree, action) ?? tree : tree);
}

/** Host-resolved paths compare literally, including case (#372); require a separator boundary. */
export function containsFolder(root: string, path: string): boolean {
  return root === path || folderChain(root, path).length > 0;
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
  const [trees, reduce] = useReducer(folderTreesReducer, []);
  const latest = useRef(trees);
  latest.current = trees;
  // Async Open completions can share a render. Resolve their containment against every prior action.
  const dispatch = (action: FolderTreesAction) => {
    latest.current = folderTreesReducer(latest.current, action);
    reduce(action);
  };
  const requests = useRef(0);
  const roots = trees.map(tree => tree.root);
  // Compare path values in the effect dependencies, independently of tree listing/expansion state.
  const serializedRoots = JSON.stringify(roots);
  const serializedCollapsed = JSON.stringify(trees.filter(tree => !tree.sectionExpanded).map(tree => tree.root));
  const [restored, setRestored] = useState(false);
  const [rememberVersion, rememberFolders] = useReducer(version => version + 1, 0);
  const [sectionVersion, rememberSections] = useReducer(version => version + 1, 0);
  const userChangedRoots = useRef(new Set<string>());

  // Restoration alone never rewrites preferences, including paths the Host no longer lists.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = readOpenFolders();
      const collapsed = new Set(readCollapsedFolderSections());
      for (const root of saved) {
        if (cancelled) return;
        try {
          const listing = await request(root);
          // A user's Open/Close of this Host path takes precedence over its older restoration.
          if (!cancelled && !userChangedRoots.current.has(listing.root)) {
            dispatch({ type: "openRoot", listing, sectionExpanded: !collapsed.has(listing.root) });
            loadMissingBranches();
          }
        } catch { /* Moved, removed or refused folders are left out quietly. */ }
      }
      if (!cancelled) setRestored(true);
    })();
    return () => { cancelled = true; };
  }, []);

  // Every explicit Open/Close remembers the current list, even after another browser tab wrote it.
  // Tree-only changes do not write. During restoration, user changes wait for all remembered paths.
  useEffect(() => {
    if (!restored || rememberVersion === 0) return;
    writeOpenFolders(JSON.parse(serializedRoots) as string[]);
  }, [serializedRoots, restored, rememberVersion]);

  // Like #370, every explicit action writes the current reduced state, even if this tab wrote
  // the same value before another tab changed storage. No last-written-value cache. Defer user
  // writes until every restored root has settled; restoration/child listing alone never writes.
  useEffect(() => {
    if (!restored || sectionVersion === 0) return;
    writeCollapsedFolderSections(JSON.parse(serializedCollapsed) as string[]);
  }, [serializedCollapsed, restored, sectionVersion]);

  const load = (root: string, path: string, preserveExpansion = false) => {
    const id = ++requests.current;
    dispatch({ type: "loadStart", root, path, request: id });
    request(root, path).then(
      listing => dispatch({ type: "loadSuccess", root, path, request: id, listing }),
      (cause: unknown) => {
        dispatch({ type: "loadFailure", root, path, request: id, preserveExpansion });
        if (latest.current.some(tree => tree.root === root)) onError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };

  // Absorption transfers loaded children; only missing intermediate folders need new listings.
  const loadMissingBranches = () => {
    for (const tree of latest.current) for (const path of tree.expanded) {
      if (!tree.nodes.has(path) && !tree.pending.has(path)) load(tree.root, path);
    }
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
    restored,
    /** The outermost opened folder containing a path, if any. */
    rootOf: (itemPath: string) => containingRoot(roots, itemPath),
    /** Adds a folder (or relists one already open), opened down to the open document when it is inside. */
    open(listing: FolderResponse, documentPath: string) {
      const parent = latest.current.find(tree => containsFolder(tree.root, listing.root));
      if (!restored) userChangedRoots.current.add(listing.root);
      dispatch({ type: "openRoot", listing });
      rememberFolders();
      rememberSections();
      if (parent && parent.root !== listing.root) {
        dispatch({ type: "setSectionExpanded", root: parent.root, expanded: true });
        dispatch({ type: "expand", root: parent.root, path: listing.root });
        show(parent.root, listing.root, true);
      } else show(listing.root, documentPath, false);
      loadMissingBranches();
      return parent && parent.root !== listing.root ? parent.root : undefined;
    },
    close(root: string) {
      if (!restored) userChangedRoots.current.add(root);
      dispatch({ type: "closeRoot", root });
      rememberFolders();
      rememberSections();
    },
    /** Hiding a section keeps its listings and subfolder expansion, without Host requests. */
    toggleSection(root: string) {
      const tree = trees.find(item => item.root === root);
      if (tree) {
        dispatch({ type: "setSectionExpanded", root, expanded: !tree.sectionExpanded });
        rememberSections();
      }
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
     * Startup tab restoration passes false to retain remembered section visibility without writing it.
     */
    reveal(itemPath: string, expandSections = true) {
      let contained = false;
      for (const root of roots) {
        if (expandSections && folderChain(root, itemPath).length > 0) {
          dispatch({ type: "setSectionExpanded", root, expanded: true });
          contained = true;
        }
        show(root, itemPath, true);
      }
      if (contained) rememberSections();
    },
    /** Re-read only reachable, already loaded listings, retaining all disclosure state. */
    refreshRoot(root: string) {
      const tree = latest.current.find(item => item.root === root);
      if (tree) for (const path of knownFolders(tree)) if (tree.nodes.has(path)) load(root, path, true);
    },
    /** Refresh loaded parents of a file/folder created by IeumDoc, without discovering children. */
    refreshParents(itemPath: string) {
      for (const tree of latest.current) for (const path of folderChain(tree.root, itemPath)) {
        if (tree.nodes.has(path)) load(tree.root, path, true);
      }
    },
    /** Lists a folder the trees already know again, without expanding anything. */
    refresh(path: string) {
      for (const tree of latest.current) if (tree.nodes.has(path)) load(tree.root, path, true);
    },
  };
}
