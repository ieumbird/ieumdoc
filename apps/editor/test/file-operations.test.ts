import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { deleteFile, renameFile, ReferencedImageError } from "../server/file-operations.ts";
import { RootAccess } from "../server/file-access.ts";
import { nativeSource } from "./helpers/document.ts";

test("file operations constrain roots, symlinks, regular files, names and extension; publish without overwrite", async t => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ieumdoc-file-ops-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, "root"); fs.mkdirSync(root);
  const file = path.join(root, "문서.md"); fs.writeFileSync(file, "original");
  const outside = path.join(base, "outside.md"); fs.writeFileSync(outside, "outside");
  const request = { root, path: file };
  const access = new RootAccess([root]);
  for (const name of ["", " ", "../escape", "dir/file", "dir\\file", "CON", "con.txt", "COM¹", "LPT9", "a:b", "bad?", "end.", " end", "end ", "bad\0", "bad\ud800", ".hidden"]) {
    assert.throws(() => renameFile({ ...request, name }, access), Error, name);
    assert.equal(fs.readFileSync(file, "utf8"), "original");
  }
  await assert.rejects(deleteFile({ root, path: outside }));
  await assert.rejects(deleteFile({ root, path: root }));
  await assert.rejects(deleteFile({ root: base, path: outside }, access));
  const directory = path.join(root, "directory"); fs.mkdirSync(directory);
  assert.throws(() => renameFile({ root, path: directory, name: "new" }));
  const link = path.join(root, "linked");
  fs.symlinkSync(directory, link, process.platform === "win32" ? "junction" : "dir");
  fs.writeFileSync(path.join(directory, "inside.md"), "inside");
  await assert.rejects(deleteFile({ root, path: path.join(link, "inside.md") }));
  await assert.rejects(deleteFile({ root: link, path: path.join(link, "inside.md") }));
  fs.writeFileSync(path.join(root, "exists.md"), "keep");
  assert.throws(() => renameFile({ ...request, name: "exists" }), /already exists/);
  assert.equal(fs.readFileSync(path.join(root, "exists.md"), "utf8"), "keep");
  fs.linkSync(file, path.join(root, "same-inode.md"));
  assert.throws(() => renameFile({ ...request, name: "same-inode" }), /already exists/);
  let renamed = renameFile({ ...request, name: "새이름A😀" }, access);
  assert.equal(renamed.path, path.join(root, "새이름A😀.md"));
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.readFileSync(renamed.path, "utf8"), "original");
  renamed = renameFile({ root, path: renamed.path, name: "새이름a😀" }, access);
  assert.equal(path.basename(renamed.path), "새이름a😀.md");
  assert.ok(fs.readdirSync(root).includes("새이름a😀.md"), "case-only rename updates the actual directory entry");
  let trashed = "";
  await deleteFile({ root, path: renamed.path }, access, async target => { trashed = target; });
  assert.equal(trashed, renamed.path, "Desktop receives only the validated file");
  assert.equal(fs.existsSync(renamed.path), true, "trash adapter owns deletion, no unlink fallback");
  await assert.rejects(deleteFile({ root, path: renamed.path }, access, async () => { throw new Error("trash failure"); }), /trash failure/);
  assert.equal(fs.existsSync(renamed.path), true);
  await deleteFile({ root, path: renamed.path }, access);
  assert.equal(fs.existsSync(renamed.path), false);
});

test("image rename checks admitted Figure read models recursively plus applied unsaved snapshots", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ieumdoc-image-rename-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const folder = path.join(root, "nested"); fs.mkdirSync(folder);
  const image = path.join(folder, "그림.svg"); fs.writeFileSync(image, "<svg/>");
  const reference = (url: string) => nativeSource(`# Images\n\n:::{figure} ${url}\n:alt: Figure\n\nCaption.\n:::\n`);
  const doc = path.join(root, "ref.md"); fs.writeFileSync(doc, reference("./nested/그림.svg"));
  const nested = path.join(folder, "nested.md"); fs.writeFileSync(nested, reference("그림.svg"));
  const foreign = path.join(root, "foreign.md"); fs.writeFileSync(foreign, "![image](nested/그림.svg)");
  const hidden = path.join(root, ".hidden.md"); fs.writeFileSync(hidden, reference("./nested/그림.svg"));
  const before = fs.readFileSync(doc);
  assert.throws(() => renameFile({ root, path: image, name: "new" }), error => {
    assert.ok(error instanceof ReferencedImageError);
    assert.deepEqual(new Set(error.references), new Set(["ref.md", ".hidden.md", path.join("nested", "nested.md")]));
    return true;
  });
  assert.deepEqual(fs.readFileSync(doc), before, "no reference rewriting");
  fs.writeFileSync(doc, nativeSource("# Empty\n")); fs.unlinkSync(nested); fs.unlinkSync(hidden);
  assert.throws(() => renameFile({ root, path: image, name: "new", openDocuments: [{ path: doc, source: reference("./nested/그림.svg") }] }), ReferencedImageError);
  const result = renameFile({ root, path: image, name: "new" });
  assert.equal(result.path, path.join(folder, "new.svg"));
  assert.equal(fs.readFileSync(result.path, "utf8"), "<svg/>");
});
