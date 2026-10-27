import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { deleteFile, renameFile, ReferencedImageError, ImageRenameError } from "../server/file-operations.ts";
import { RootAccess } from "../server/file-access.ts";
import { nativeSource } from "./helpers/document.ts";
import { getEditableDocument, parse } from "@ieumdoc/core";

test("referenced image rename updates every admitted document and reports skipped files", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ieumdoc-references-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "nested"));
  const image = path.join(root, "nested", "old.svg"); fs.writeFileSync(image, "<svg/>");
  const docs = [path.join(root, "a.md"), path.join(root, "nested", "b.md")];
  for (const [index, doc] of docs.entries()) fs.writeFileSync(doc, nativeSource(`:::{figure} ${index ? "old.svg" : "./nested/old.svg"}\n:name: fig\n:alt: Keep\n\n**Caption**.\n:::\n`));
  fs.writeFileSync(path.join(root, "foreign.md"), "# Not native");
  const result = renameFile({ root, path: image, name: "new" });
  assert.equal(fs.existsSync(image), false);
  for (const [index, doc] of docs.entries()) {
    const figure = getEditableDocument(parse(fs.readFileSync(doc, "utf8"))).blocks.find(block => block.block === "figure");
    assert.ok(figure?.block === "figure");
    assert.equal(figure.imageUrl, index ? "./new.svg" : "./nested/new.svg");
    assert.equal(figure.label, "fig"); assert.equal(figure.imageAlt, "Keep");
  }
  assert.deepEqual(result.updatedDocuments, docs);
  assert.deepEqual(result.skippedDocuments, ["foreign.md"]);
});

test("image rename detects references through differently cased file aliases by identity", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ieumdoc-image-case-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const image = path.join(root, "diagram.svg"), alias = path.join(root, "DIAGRAM.svg");
  fs.writeFileSync(image, "<svg/>");
  // Windows resolves this spelling directly. Case-sensitive systems exercise the same
  // identity contract through a hard link, rather than pretending names compare alike.
  if (!fs.existsSync(alias)) fs.linkSync(image, alias);
  const original = fs.statSync(image), referenced = fs.statSync(alias);
  assert.equal(original.dev, referenced.dev); assert.equal(original.ino, referenced.ino);
  fs.writeFileSync(path.join(root, "ref.md"), nativeSource("# Reference\n\n:::{figure} ./DIAGRAM.svg\n:alt: Image\n\nCaption.\n:::\n"));
  assert.throws(() => renameFile({ root, path: image, name: "renamed", openDocuments: [{ path: path.join(root, "ref.md") }] }), ReferencedImageError);
  assert.equal(fs.readFileSync(image, "utf8"), "<svg/>");
  assert.equal(fs.existsSync(path.join(root, "renamed.svg")), false);
  if (fs.readdirSync(root).includes("DIAGRAM.svg")) {
    // Case-sensitive filesystems may hold two distinct files with these spellings.
    // Lowercasing names would wrongly reject this unreferenced file's rename.
    fs.unlinkSync(alias); fs.writeFileSync(alias, "<svg>different file</svg>");
    assert.equal(renameFile({ root, path: image, name: "renamed" }).path, path.join(root, "renamed.svg"));
    assert.equal(fs.readFileSync(alias, "utf8"), "<svg>different file</svg>");
  } else {
    renameFile({ root, path: image, name: "renamed" });
    assert.match(fs.readFileSync(path.join(root, "ref.md"), "utf8"), /\.\/renamed.svg/);
  }
});

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
  assert.throws(() => renameFile({ root, path: image, name: "new", openDocuments: [doc, nested, hidden].map(path => ({ path })) }), error => {
    assert.ok(error instanceof ReferencedImageError);
    assert.deepEqual(new Set(error.references), new Set(["ref.md", ".hidden.md", path.join("nested", "nested.md")]));
    return true;
  });
  assert.deepEqual(fs.readFileSync(doc), before, "dirty refusal keeps all files unchanged");
  fs.writeFileSync(doc, nativeSource("# Empty\n")); fs.unlinkSync(nested); fs.unlinkSync(hidden);
  assert.throws(() => renameFile({ root, path: image, name: "new", openDocuments: [{ path: doc, source: reference("./nested/그림.svg") }] }), ReferencedImageError);
  const result = renameFile({ root, path: image, name: "new" });
  assert.equal(result.path, path.join(folder, "new.svg"));
  assert.equal(fs.readFileSync(result.path, "utf8"), "<svg/>");
});

for (const cleanupFailure of ["once", "rollback", "external", "twice"] as const) {
  test(`post-replacement cleanup failure (${cleanupFailure}) rolls back or reports the changed document`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ieumdoc-rename-cleanup-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const image = path.join(root, "old.svg"), destination = path.join(root, "new.svg");
    const a = path.join(root, "a.md"), b = path.join(root, "b.md");
    const original = nativeSource(":::{figure} ./old.svg\n\nCaption.\n:::\n");
    fs.writeFileSync(image, "<svg/>"); fs.writeFileSync(a, original); fs.writeFileSync(b, original);
    const rename = fs.renameSync, rm = fs.rmSync;
    let replacements = 0, cleanupErrors = 0;
    t.mock.method(fs, "renameSync", (from: fs.PathLike, to: fs.PathLike) => {
      if (to === a && replacements && cleanupFailure === "rollback") throw new Error("rollback replacement failed");
      rename(from, to);
      if (to === a) replacements++;
    });
    t.mock.method(fs, "rmSync", (target: fs.PathLike, options?: fs.RmOptions) => {
      if (path.basename(String(target)).startsWith(".a.md.") && replacements > cleanupErrors &&
          (cleanupErrors === 0 || cleanupFailure === "twice")) {
        cleanupErrors++;
        if (cleanupFailure === "external") fs.writeFileSync(a, "External content after replacement");
        throw Object.assign(new Error("post-replacement cleanup denied"), { code: "EACCES" });
      }
      return rm(target, options);
    });
    try {
      const incomplete = cleanupFailure === "rollback" || cleanupFailure === "external";
      assert.throws(() => renameFile({ root, path: image, name: "new" }), error => {
        assert.ok(error instanceof ImageRenameError);
        assert.match(error.message, /post-replacement cleanup denied/);
        assert.deepEqual(error.updatedDocuments, incomplete ? [a] : []);
        assert.match(error.message, incomplete ? /Rollback incomplete/ : /rolled back/);
        if (cleanupFailure === "twice") assert.match(error.message, /Cleanup errors after verified content restoration/);
        return true;
      });
      assert.equal(cleanupErrors, cleanupFailure === "twice" ? 2 : 1);
      if (cleanupFailure === "rollback") assert.match(fs.readFileSync(a, "utf8"), /\.\/new.svg/);
      else assert.equal(fs.readFileSync(a, "utf8"), cleanupFailure === "external" ? "External content after replacement" : original);
      assert.equal(fs.readFileSync(b, "utf8"), original, "later documents were never attempted");
      assert.equal(fs.readFileSync(image, "utf8"), "<svg/>");
      assert.equal(fs.existsSync(destination), incomplete, "keep the new image while any changed document cannot be restored");
      assert.equal(fs.readdirSync(root).some(name => name.endsWith(".tmp")), false);
    } finally { t.mock.restoreAll(); }
  });
}

for (const failure of ["preflight", "publication", "document", "unlink", "rollback", "conflict", "case-only"] as const) {
  test(`image rename ${failure} failure preserves originals or reports incomplete rollback`, t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ieumdoc-rename-failure-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const name = failure === "case-only" ? "OLD" : "new";
    const image = path.join(root, "old.svg"), destination = path.join(root, name + ".svg");
    const a = path.join(root, "a.md"), b = path.join(root, "b.md");
    const original = nativeSource(":::{figure} ./old.svg\n\nCaption.\n:::\n");
    fs.writeFileSync(image, "<svg/>"); fs.writeFileSync(a, original); fs.writeFileSync(b, original);
    fs.writeFileSync(path.join(root, "unreadable.md"), Buffer.from([0xff]));
    const rename = fs.renameSync, link = fs.linkSync, unlink = fs.unlinkSync, access = fs.accessSync;
    if (failure === "preflight") t.mock.method(fs, "accessSync", (target: fs.PathLike, mode?: number) => {
      if (target === b && mode === fs.constants.W_OK) throw new Error("preflight denied");
      return access(target, mode);
    });
    if (failure === "publication" || failure === "conflict") t.mock.method(fs, "linkSync", (from: fs.PathLike, to: fs.PathLike) => {
      if (failure === "publication") throw new Error("publication failed");
      fs.writeFileSync(b, "External content");
      return link(from, to);
    });
    if (failure === "document" || failure === "rollback" || failure === "case-only") t.mock.method(fs, "renameSync", (from: fs.PathLike, to: fs.PathLike) => {
      if (to === b || (failure === "rollback" && to === a && fs.readFileSync(from, "utf8") === original)) throw new Error("replacement failed");
      return rename(from, to);
    });
    if (failure === "unlink") t.mock.method(fs, "unlinkSync", (target: fs.PathLike) => {
      if (target === image) throw new Error("unlink failed");
      return unlink(target);
    });
    try {
      if (failure === "preflight") assert.throws(() => renameFile({ root, path: image, name, openDocuments: [{ path:b }] }), ReferencedImageError,
        "dirty-document save guidance precedes write preflight");
      assert.throws(() => renameFile({ root, path: image, name }), error => {
        assert.ok(error instanceof Error);
        if (failure === "rollback") {
          assert.ok(error instanceof ImageRenameError);
          assert.match(error.message, /Rollback incomplete/);
          assert.ok(error.message.includes(a) && error.message.includes(image) && error.message.includes(destination));
          assert.deepEqual(error.updatedDocuments, [a]);
          assert.deepEqual(error.skippedDocuments, ["unreadable.md"]);
        } else if (["document", "unlink", "conflict"].includes(failure)) assert.match(error.message, /rolled back/);
        return true;
      });
      assert.equal(fs.readFileSync(image, "utf8"), "<svg/>");
      assert.equal(fs.readdirSync(root).includes(path.basename(destination)), failure === "rollback");
      assert.equal(fs.readFileSync(b, "utf8"), failure === "conflict" ? "External content" : original);
      if (failure === "rollback") assert.match(fs.readFileSync(a, "utf8"), /\.\/new.svg/);
      else assert.equal(fs.readFileSync(a, "utf8"), original);
      assert.equal(fs.readdirSync(root).some(name => name.endsWith(".tmp")), false);
    } finally { t.mock.restoreAll(); }
  });
}
