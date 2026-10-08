import assert from "node:assert/strict";
import test from "node:test";
import type { FolderEntry, FolderResponse } from "../shared/document-protocol.ts";
import { folderChain, folderTreeReducer, knownFolders, treeKey, visibleTreeItems, type FolderTreeState } from "../src/shell/folder-tree.ts";

const ROOT = "/r";
const folder = (path: string): FolderEntry => ({ name: path.split("/").pop()!, kind: "folder", path });
const doc = (path: string): FolderEntry => ({ name: path.split("/").pop()!, kind: "document", path });
const listing = (path: string, entries: FolderEntry[]): FolderResponse => ({ root: ROOT, path, entries });

function opened(): FolderTreeState {
  return folderTreeReducer(null, { type: "openRoot", listing: listing(ROOT, [folder("/r/a"), folder("/r/b"), doc("/r/z.md")]) })!;
}

test("expanded, loaded folders show their entries right after them; collapsing keeps what was listed", () => {
  let state = opened();
  state = folderTreeReducer(state, { type: "expand", path: "/r/a" })!;
  // Expanded but not listed yet: nothing to show below it.
  assert.deepEqual(visibleTreeItems(state).map(item => item.entry.path), ["/r/a", "/r/b", "/r/z.md"]);
  state = folderTreeReducer(state, { type: "loadStart", root: ROOT, path: "/r/a", request: 1 })!;
  state = folderTreeReducer(state, { type: "loadSuccess", root: ROOT, path: "/r/a", request: 1, listing: listing("/r/a", [doc("/r/a/x.md")]) })!;
  const items = visibleTreeItems(state);
  assert.deepEqual(items.map(item => [item.entry.path, item.depth, item.position, item.size]), [
    ["/r/a", 0, 1, 3], ["/r/a/x.md", 1, 1, 1], ["/r/b", 0, 2, 3], ["/r/z.md", 0, 3, 3],
  ]);
  state = folderTreeReducer(state, { type: "collapse", path: "/r/a" })!;
  assert.deepEqual(visibleTreeItems(state).map(item => item.entry.path), ["/r/a", "/r/b", "/r/z.md"]);
  assert.ok(state.nodes.has("/r/a"));
});

test("a late answer never replaces a newer one or reopens what was collapsed", () => {
  let state = opened();
  // Expand A, collapse it, expand B; A's answer arrives last.
  state = folderTreeReducer(state, { type: "expand", path: "/r/a" })!;
  state = folderTreeReducer(state, { type: "loadStart", root: ROOT, path: "/r/a", request: 1 })!;
  state = folderTreeReducer(state, { type: "collapse", path: "/r/a" })!;
  state = folderTreeReducer(state, { type: "expand", path: "/r/b" })!;
  state = folderTreeReducer(state, { type: "loadStart", root: ROOT, path: "/r/b", request: 2 })!;
  state = folderTreeReducer(state, { type: "loadSuccess", root: ROOT, path: "/r/b", request: 2, listing: listing("/r/b", [doc("/r/b/y.md")]) })!;
  const before = visibleTreeItems(state).map(item => item.entry.path);
  state = folderTreeReducer(state, { type: "loadSuccess", root: ROOT, path: "/r/a", request: 1, listing: listing("/r/a", [doc("/r/a/x.md")]) })!;
  assert.deepEqual(visibleTreeItems(state).map(item => item.entry.path), before);
  assert.equal(state.expanded.has("/r/a"), false);

  // Two requests for one folder: the older answer, arriving second, is ignored.
  state = folderTreeReducer(state, { type: "loadStart", root: ROOT, path: "/r/b", request: 3 })!;
  state = folderTreeReducer(state, { type: "loadStart", root: ROOT, path: "/r/b", request: 4 })!;
  state = folderTreeReducer(state, { type: "loadSuccess", root: ROOT, path: "/r/b", request: 4, listing: listing("/r/b", [doc("/r/b/y.md"), doc("/r/b/new.md")]) })!;
  state = folderTreeReducer(state, { type: "loadSuccess", root: ROOT, path: "/r/b", request: 3, listing: listing("/r/b", [doc("/r/b/y.md")]) })!;
  assert.deepEqual(state.nodes.get("/r/b")?.entries.map(entry => entry.name), ["y.md", "new.md"]);

  // An answer for a folder chosen earlier changes nothing.
  const other = { ...state, root: "/other" };
  assert.equal(folderTreeReducer(other, { type: "loadSuccess", root: ROOT, path: "/r/b", request: 4, listing: listing("/r/b", []) }), other);
  assert.equal(folderTreeReducer(state, { type: "closeRoot" }), null);
});

test("a failed listing collapses its folder; a stale failure does not", () => {
  let state = opened();
  state = folderTreeReducer(state, { type: "expand", path: "/r/a" })!;
  state = folderTreeReducer(state, { type: "loadStart", root: ROOT, path: "/r/a", request: 1 })!;
  state = folderTreeReducer(state, { type: "loadStart", root: ROOT, path: "/r/a", request: 2 })!;
  assert.equal(folderTreeReducer(state, { type: "loadFailure", root: ROOT, path: "/r/a", request: 1 }), state);
  state = folderTreeReducer(state, { type: "loadFailure", root: ROOT, path: "/r/a", request: 2 })!;
  assert.equal(state.expanded.has("/r/a"), false);
});

test("known folders are the chosen folder and every listed sub-folder, in tree order, expanded or not", () => {
  let state = opened();
  state = folderTreeReducer(state, { type: "loadStart", root: ROOT, path: "/r/a", request: 1 })!;
  state = folderTreeReducer(state, { type: "loadSuccess", root: ROOT, path: "/r/a", request: 1, listing: listing("/r/a", [folder("/r/a/deep"), doc("/r/a/x.md")]) })!;
  assert.equal(state.expanded.has("/r/a"), false);
  assert.deepEqual(knownFolders(state), ["/r", "/r/a", "/r/a/deep", "/r/b"]);
});

test("the folders above a document are found only inside the chosen folder", () => {
  assert.deepEqual(folderChain("/r", "/r/docs/design/current.md"), ["/r", "/r/docs", "/r/docs/design"]);
  assert.deepEqual(folderChain("/r", "/r/top.md"), ["/r"]);
  assert.deepEqual(folderChain(String.raw`C:\r`, String.raw`C:\r\docs\a.md`), [String.raw`C:\r`, String.raw`C:\r\docs`]);
  // A filesystem root ends in its separator.
  assert.deepEqual(folderChain("C:\\", String.raw`C:\docs\a.md`), ["C:\\", String.raw`C:\docs`]);
  // Outside, or a sibling sharing the prefix: nothing is invented.
  assert.deepEqual(folderChain("/r", "/elsewhere/a.md"), []);
  assert.deepEqual(folderChain("/r", "/rx/a.md"), []);
  assert.deepEqual(folderChain("/r", ""), []);
});

test("tree keys move through visible items, expand, collapse and return to the parent", () => {
  let state = opened();
  state = folderTreeReducer(state, { type: "expand", path: "/r/a" })!;
  state = folderTreeReducer(state, { type: "loadStart", root: ROOT, path: "/r/a", request: 1 })!;
  state = folderTreeReducer(state, { type: "loadSuccess", root: ROOT, path: "/r/a", request: 1, listing: listing("/r/a", [doc("/r/a/x.md")]) })!;
  const items = visibleTreeItems(state); // a, a/x.md, b, z.md
  const key = (index: number, name: string) => treeKey(items, index, name, state.expanded);
  assert.deepEqual(key(0, "ArrowDown"), { focus: "/r/a/x.md" });
  assert.deepEqual(key(1, "ArrowUp"), { focus: "/r/a" });
  assert.equal(key(3, "ArrowDown"), undefined);
  assert.deepEqual(key(2, "Home"), { focus: "/r/a" });
  assert.deepEqual(key(0, "End"), { focus: "/r/z.md" });
  // Right: a collapsed folder expands; an expanded one moves to its first child; a document does nothing.
  assert.deepEqual(key(2, "ArrowRight"), { expand: "/r/b" });
  assert.deepEqual(key(0, "ArrowRight"), { focus: "/r/a/x.md" });
  assert.equal(key(3, "ArrowRight"), undefined);
  // Left: an expanded folder collapses; a child returns to its parent; a top-level item stays.
  assert.deepEqual(key(0, "ArrowLeft"), { collapse: "/r/a" });
  assert.deepEqual(key(1, "ArrowLeft"), { focus: "/r/a" });
  assert.equal(key(3, "ArrowLeft"), undefined);
  assert.deepEqual(key(1, "Enter"), { activate: items[1] });
  assert.deepEqual(key(0, " "), { activate: items[0] });
});
