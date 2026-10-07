import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { history, undo } from "@tiptap/pm/history";
import { EditorState, Plugin, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { editorExtensions, structureGuardPlugin } from "../src/editor-schema.tsx";
import { imageAssetsPlugin } from "../src/image-assets.ts";
import { collectSupportedEdits, toTiptapDocument } from "../src/tiptap-document.ts";
import { loadEditableDocument, saveEdits } from "../server/document-api.ts";
import { createImageAsset, handleAssetRequest, rollbackImageAsset } from "../server/asset-api.ts";
import { resolveMediaPath } from "../server/document-api.ts";

// A complete 1x1 PNG, rather than a filename/signature-only pseudo image.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64");
const key = randomBytes(32);
function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ieumdoc-asset-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const doc = path.join(root, "document.md");
  fs.writeFileSync(doc, "# Images\n\nKeep this text.\n");
  return { root, doc, assets: path.join(root, "assets") };
}

test("PNG assets have portable paths, unique names, and request-scoped rollback", t => {
  const { root, doc, assets } = fixture(t);
  const first = createImageAsset(doc, "image/png", PNG, key);
  const second = createImageAsset(doc, "image/png", PNG, key);
  assert.match(first.path, /^\.\/assets\/image-[a-f0-9-]+\.png$/);
  assert.notEqual(first.path, second.path);
  assert.deepEqual(fs.readFileSync(path.resolve(root, first.path)), PNG);
  assert.equal(resolveMediaPath(first.path, doc), path.resolve(root, first.path));
  assert.equal(resolveMediaPath("./assets/../document.md", doc), doc); // Existing normalized in-bound media remains supported.
  const moved = path.join(root, "relocated");
  fs.mkdirSync(moved); fs.mkdirSync(path.join(moved, "assets"));
  fs.copyFileSync(doc, path.join(moved, "document.md"));
  fs.copyFileSync(path.resolve(root, first.path), path.join(moved, first.path));
  assert.deepEqual(fs.readFileSync(resolveMediaPath(first.path, path.join(moved, "document.md"))), PNG);
  rollbackImageAsset({ documentPath: doc, ...first }, key);
  assert.deepEqual(fs.readdirSync(assets), [path.basename(second.path)]);
  // Retry is safe; it does not remove the second request's file.
  rollbackImageAsset({ documentPath: doc, ...first }, key);
  assert.equal(fs.readFileSync(doc, "utf8"), "# Images\n\nKeep this text.\n");
});

test("invalid MIME, empty, truncated, fake and oversized images create no assets", t => {
  const { doc, assets } = fixture(t);
  for (const [mime, bytes] of [
    ["image/svg+xml", PNG], ["image/jpeg", PNG], ["image/png;bad=1", PNG],
    ["image/png", Buffer.alloc(0)], ["image/png", PNG.subarray(0, 32)],
    ["image/png", Buffer.from("not an image")], ["image/png", Buffer.alloc(10 * 1024 * 1024 + 1)],
  ] as const) {
    assert.throws(() => createImageAsset(doc, mime, bytes, key));
    assert.equal(fs.existsSync(assets), false);
  }
});

test("a publication collision never overwrites the existing file and retries safely", t => {
  const { root, doc, assets } = fixture(t);
  const original = fs.linkSync;
  let collided = "";
  t.mock.method(fs, "linkSync", (temporary: fs.PathLike, destination: fs.PathLike) => {
    if (!collided) {
      collided = String(destination);
      fs.writeFileSync(destination, "pre-existing");
    }
    return original(temporary, destination);
  });
  const created = createImageAsset(doc, "image/png", PNG, key);
  assert.equal(fs.readFileSync(collided, "utf8"), "pre-existing");
  assert.notEqual(path.resolve(root, created.path), collided);
  assert.equal(fs.readdirSync(assets).some(name => name.endsWith(".tmp")), false);
  rollbackImageAsset({ documentPath: doc, ...created }, key);
  assert.deepEqual(fs.readdirSync(assets), [path.basename(collided)]);
});

test("partial write and publication failures clean only this request's temp file", t => {
  const { doc, assets } = fixture(t);
  const original = fs.writeFileSync;
  const write = t.mock.method(fs, "writeFileSync", (file: fs.PathOrFileDescriptor, bytes: string | NodeJS.ArrayBufferView, options?: fs.WriteFileOptions) => {
    original(file, bytes instanceof Buffer ? bytes.subarray(0, 8) : bytes, options);
    throw new Error("injected disk failure");
  });
  assert.throws(() => createImageAsset(doc, "image/png", PNG, key), /disk failure/);
  assert.deepEqual(fs.readdirSync(assets), []);
  write.mock.restore();
  t.mock.method(fs, "linkSync", () => { throw new Error("injected publication failure"); });
  assert.throws(() => createImageAsset(doc, "image/png", PNG, key), /publication failure/);
  assert.deepEqual(fs.readdirSync(assets), []);
});

test("directory replacement during a write never deletes an unowned replacement file", t => {
  const { root, doc, assets } = fixture(t);
  const original = fs.closeSync;
  let replacement = "";
  t.mock.method(fs, "closeSync", (fd: number) => {
    original(fd);
    if (replacement) return;
    const name = fs.readdirSync(assets)[0];
    fs.renameSync(assets, path.join(root, "moved-assets"));
    fs.mkdirSync(assets);
    replacement = path.join(assets, name);
    fs.writeFileSync(replacement, "unowned replacement");
  });
  assert.throws(() => createImageAsset(doc, "image/png", PNG, key), /directory|cleanup|changed/);
  assert.equal(fs.readFileSync(replacement, "utf8"), "unowned replacement");
});

test("creation never signs a rollback receipt for a file replaced after publication", t => {
  const { root, doc, assets } = fixture(t);
  const original = fs.unlinkSync;
  let replacement = "";
  t.mock.method(fs, "unlinkSync", (target: fs.PathLike) => {
    original(target);
    if (String(target).endsWith(".tmp") && !replacement) {
      replacement = path.join(assets, fs.readdirSync(assets).find(name => name.endsWith(".png"))!);
      fs.renameSync(replacement, path.join(root, "original.png"));
      fs.writeFileSync(replacement, "other actor's file");
    }
  });
  assert.throws(() => createImageAsset(doc, "image/png", PNG, key), /changed|ownership/);
  assert.equal(fs.readFileSync(replacement, "utf8"), "other actor's file");
});

test("failed publication validation retains a user's in-place edit to the published file", t => {
  const { doc, assets } = fixture(t);
  const original = fs.unlinkSync;
  let changed = "";
  t.mock.method(fs, "unlinkSync", (target: fs.PathLike) => {
    original(target);
    if (String(target).endsWith(".tmp") && !changed) {
      changed = path.join(assets, fs.readdirSync(assets).find(name => name.endsWith(".png"))!);
      fs.writeFileSync(changed, "user edited the same inode");
    }
  });
  assert.throws(() => createImageAsset(doc, "image/png", PNG, key), /changed|cleanup/);
  assert.equal(fs.readFileSync(changed, "utf8"), "user edited the same inode");
});

test("rollback refuses traversal, forged receipts and files modified after creation", t => {
  const { root, doc } = fixture(t);
  const created = createImageAsset(doc, "image/png", PNG, key);
  for (const assetPath of ["../outside.png", "/outside.png", "C:\\outside.png", "./assets/../document.md", "./assets/%2e%2e/document.md", "./assets/%252e%252e/document.md", "./assets/image\0.png"]) {
    assert.throws(() => rollbackImageAsset({ documentPath: doc, path: assetPath, rollbackToken: created.rollbackToken }, key));
  }
  assert.throws(() => rollbackImageAsset({ documentPath: doc, ...created, rollbackToken: "forged" }, key));
  fs.writeFileSync(path.resolve(root, created.path), "user replaced content");
  assert.throws(() => rollbackImageAsset({ documentPath: doc, ...created }, key), /changed|match/);
  assert.equal(fs.readFileSync(path.resolve(root, created.path), "utf8"), "user replaced content");
});

test("rollback refuses a replacement made between its stat and content read", t => {
  const { root, doc } = fixture(t);
  const created = createImageAsset(doc, "image/png", PNG, key);
  const file = path.resolve(root, created.path);
  const original = fs.lstatSync;
  let swapped = false;
  t.mock.method(fs, "lstatSync", (target: fs.PathLike) => {
    const stat = original(target);
    if (String(target) === file && !swapped) {
      swapped = true;
      fs.renameSync(file, file + ".original");
      fs.writeFileSync(file, PNG); // Same bytes, different inode.
    }
    return stat;
  });
  assert.throws(() => rollbackImageAsset({ documentPath: doc, ...created }, key), /changed|match|ownership/);
  assert.deepEqual(fs.readFileSync(file), PNG);
});

test("rollback restores a different inode replaced after validation instead of deleting it", t => {
  const { root, doc, assets } = fixture(t);
  const created = createImageAsset(doc, "image/png", PNG, key);
  const file = path.resolve(root, created.path);
  const original = fs.renameSync;
  let swapped = false;
  t.mock.method(fs, "renameSync", (from: fs.PathLike, to: fs.PathLike) => {
    if (String(from) === file && !swapped) {
      swapped = true;
      original(file, file + ".original");
      fs.writeFileSync(file, "other actor's file");
    }
    original(from, to);
  });
  assert.throws(() => rollbackImageAsset({ documentPath: doc, ...created }, key), /changed/);
  assert.equal(fs.readFileSync(file, "utf8"), "other actor's file");
  assert.equal(fs.readdirSync(assets).some(name => name.endsWith(".tmp")), false);
});

test("rollback quarantines into a fresh name instead of replacing a placeholder", t => {
  // Windows refuses to replace a just-created file while a scanner holds it (#111).
  const { root, doc } = fixture(t);
  const created = createImageAsset(doc, "image/png", PNG, key);
  const original = fs.renameSync;
  const replaced: boolean[] = [];
  t.mock.method(fs, "renameSync", (from: fs.PathLike, to: fs.PathLike) => { replaced.push(fs.existsSync(to)); original(from, to); });
  rollbackImageAsset({ documentPath: doc, ...created }, key);
  assert.deepEqual(replaced, [false]);
  assert.equal(fs.existsSync(path.resolve(root, created.path)), false);
});

test("rollback does not adopt a quarantine file replaced just after byte validation", t => {
  const { root, doc, assets } = fixture(t);
  const created = createImageAsset(doc, "image/png", PNG, key);
  const original = fs.closeSync;
  let swapped = false;
  t.mock.method(fs, "closeSync", (fd: number) => {
    original(fd);
    const name = fs.readdirSync(assets).find(name => name.startsWith(".rollback-") && fs.statSync(path.join(assets, name)).size > 0);
    if (name && !swapped) {
      swapped = true;
      const quarantine = path.join(assets, name);
      fs.renameSync(quarantine, path.join(root, "original.png"));
      fs.writeFileSync(quarantine, "other actor's file");
    }
  });
  assert.throws(() => rollbackImageAsset({ documentPath: doc, ...created }, key), /changed|ownership/);
  assert.equal(fs.readFileSync(path.resolve(root, created.path), "utf8"), "other actor's file");
});

test("asset and media symlink escapes are rejected", t => {
  const { root, doc, assets } = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ieumdoc-asset-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, "outside.png"), PNG);
  // Windows junctions do not require developer-mode symlink permission.
  fs.symlinkSync(outside, assets, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => createImageAsset(doc, "image/png", PNG, key), /symlink|directory/);
  assert.throws(() => resolveMediaPath("./assets/outside.png", doc), /escape/);
  fs.unlinkSync(assets);
  fs.mkdirSync(assets);
  const created = createImageAsset(doc, "image/png", PNG, key);
  fs.renameSync(assets, path.join(root, "original-assets"));
  fs.symlinkSync(outside, assets, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => rollbackImageAsset({ documentPath: doc, ...created }, key), /symlink|directory|match/);
  assert.deepEqual(fs.readdirSync(outside), ["outside.png"]);
});

test("media paths reject cross-platform absolute and encoded traversal paths", t => {
  const { doc } = fixture(t);
  for (const assetPath of ["../outside.png", "%2e%2e/outside.png", "%252e%252e/outside.png", "C:\\outside.png", "C:/outside.png", "\\\\server\\image.png", "/outside.png", "image%00.png"]) {
    assert.throws(() => resolveMediaPath(assetPath, doc));
  }
});

test("binary Host endpoint ignores filename injection and bounds chunked uploads before writing", async t => {
  const { doc, assets } = fixture(t);
  const server = createServer((req, res) => { void handleAssetRequest(req, res, key); });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>(done => { server.close(() => done()); server.closeAllConnections(); }));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  const url = `${origin}/api/asset?path=${encodeURIComponent(doc)}&filename=../../injected.svg`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "image/png" }, body: PNG });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.match(created.path, /^\.\/assets\/image-[a-f0-9-]+\.png$/);
  assert.deepEqual(fs.readdirSync(assets), [path.basename(created.path)]);
  const deleted = await fetch(`${origin}/api/asset`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentPath: doc, ...created }) });
  assert.equal(deleted.status, 204);
  const status = await new Promise<number>(resolve => {
    const req = httpRequest(url, { method: "POST", headers: { "Content-Type": "image/png", "Transfer-Encoding": "chunked" } }, res => {
      res.resume(); res.on("end", () => resolve(res.statusCode!));
    });
    req.end(Buffer.alloc(10 * 1024 * 1024 + 1));
  });
  assert.equal(status, 413);
  assert.deepEqual(fs.readdirSync(assets), []);
});

test("unwritable Core snapshots and abnormal document locators cannot create assets", t => {
  const { doc, assets } = fixture(t);
  for (const locator of ["", doc + "\0", path.join(path.dirname(doc), "not-markdown.txt")]) {
    assert.throws(() => createImageAsset(locator, "image/png", PNG, key));
    assert.equal(fs.existsSync(assets), false);
  }
  fs.writeFileSync(doc, "# Blocked\n\nPress {kbd}`Ctrl` now.\n");
  assert.throws(() => createImageAsset(doc, "image/png", PNG, key), /read-only/);
  assert.equal(fs.existsSync(assets), false);
});

function imageEditor(doc: string, reject: (reason: string) => void, host: Parameters<typeof imageAssetsPlugin>[0]["host"], extra: Plugin[] = []) {
  const schema = getSchema(editorExtensions());
  const baseline = toTiptapDocument(loadEditableDocument("Alpha.\n\nBeta.\n"));
  let pending = false;
  const plugin = imageAssetsPlugin({ documentPath: doc, reject, host, pending: value => { pending = value; } });
  const view = {
    state: EditorState.create({ schema, doc: schema.nodeFromJSON(baseline), plugins: [history(), plugin, structureGuardPlugin(baseline, reason => reject(reason ?? "Structure rejected")), ...extra] }),
    editable: true,
    hasFocus() { return true; },
    dispatch(this: { state: EditorState }, tr: Parameters<EditorState["apply"]>[0]) { this.state = this.state.applyTransaction(tr).state; },
    focus() {},
    posAtCoords() { return { pos: 2, inside: -1 }; },
  } as unknown as EditorView;
  const lifecycle = plugin.spec.view?.(view);
  const paste = (html = "", file = new File([PNG], "../../injected.svg", { type: "image/png" })) => {
    const event = { clipboardData: { files: [file], getData: () => html }, preventDefault() {} } as unknown as ClipboardEvent;
    return plugin.props.handleDOMEvents!.paste!.call(plugin, view, event);
  };
  const finished = async () => {
    for (let i = 0; i < 100 && pending; i++) await new Promise(resolve => setTimeout(resolve, 2));
    assert.equal(pending, false, "image request finished");
  };
  return { view, plugin, paste, finished, destroy: () => lifecycle?.destroy?.() };
}

test("image paste inserts a Core-backed Figure as one independent Undo event", async t => {
  const { doc, assets } = fixture(t);
  const errors: string[] = [];
  const e = imageEditor(doc, reason => errors.push(reason), {
    create: async file => createImageAsset(doc, file.type, Buffer.from(await file.arrayBuffer()), key),
    rollback: async created => rollbackImageAsset({ documentPath: doc, ...created }, key),
  });
  e.view.dispatch(e.view.state.tr.insertText("typed ", 1));
  assert.equal(e.paste('<p>Text alongside screenshot</p>'), true);
  await e.finished();
  assert.deepEqual(errors, []);
  const figure = e.view.state.doc.child(1);
  assert.equal(figure.type.name, "figure");
  assert.match(figure.attrs.imageUrl, /^\.\/assets\/image-/);
  assert.equal(figure.attrs.imageAlt, "");
  const saved = saveEdits("Alpha.\n\nBeta.\n", collectSupportedEdits(loadEditableDocument("Alpha.\n\nBeta.\n"), e.view.state.doc.toJSON()));
  assert.match(saved.markdown, /:::\{figure\} \.\/assets\/image-/);
  assert.equal(undo(e.view.state, tr => e.view.dispatch(tr)), true);
  assert.equal(e.view.state.doc.childCount, 2);
  assert.equal(e.view.state.doc.firstChild!.textContent, "typed Alpha.");
  // Filesystem Undo/GC is deliberately not tied to engine history.
  assert.equal(fs.readdirSync(assets).length, 1);
});

test("rejected Figure insertion rolls back its created asset and retains the document", async t => {
  const { doc, assets } = fixture(t);
  const errors: string[] = [];
  const e = imageEditor(doc, reason => errors.push(reason), {
    create: async file => createImageAsset(doc, file.type, Buffer.from(await file.arrayBuffer()), key),
    rollback: async created => rollbackImageAsset({ documentPath: doc, ...created }, key),
  }, [new Plugin({ filterTransaction: tr => !tr.docChanged })]);
  const before = e.view.state.doc.toJSON();
  e.paste(); await e.finished();
  assert.deepEqual(e.view.state.doc.toJSON(), before);
  assert.deepEqual(fs.readdirSync(assets), []);
  assert.match(errors.join(" "), /insert|rejected/i);
});

test("Host failure preserves document; rollback failure reports the remaining path", async t => {
  const { doc } = fixture(t);
  const errors: string[] = [];
  const e = imageEditor(doc, reason => errors.push(reason), {
    create: async () => { throw new Error("disk denied"); }, rollback: async () => { throw new Error("should not rollback"); },
  });
  const before = e.view.state.doc.toJSON();
  e.paste(); await e.finished();
  assert.deepEqual(e.view.state.doc.toJSON(), before);
  assert.match(errors.join(" "), /disk denied/);
  const failed = imageEditor(doc, reason => errors.push(reason), {
    create: async () => ({ path: "./assets/image-created.png", rollbackToken: "receipt" }),
    rollback: async () => { throw new Error("delete denied"); },
  }, [new Plugin({ filterTransaction: tr => !tr.docChanged })]);
  failed.paste(); await failed.finished();
  assert.match(errors.join(" "), /rollback failed.*\.\/assets\/image-created\.png.*delete denied/i);
});

test("pending upload maps its block through typing and leaves the newer caret alone", async t => {
  const { doc } = fixture(t);
  let resolve!: (created: { path: string; rollbackToken: string }) => void;
  const e = imageEditor(doc, () => {}, {
    create: () => new Promise(done => { resolve = done; }), rollback: async () => {},
  });
  e.paste();
  const typing = e.view.state.tr.insertText("before ", 1);
  e.view.dispatch(typing.setSelection(TextSelection.create(typing.doc, 3)));
  resolve({ path: "./assets/image-mapped.png", rollbackToken: "receipt" });
  await e.finished();
  assert.equal(e.view.state.doc.child(1).type.name, "figure");
  assert.equal(e.view.state.selection.from, 3);
  assert.equal(e.view.state.doc.firstChild!.textContent, "before Alpha.");
});

test("upload completion leaves focus in a draft input outside the document", async t => {
  const { doc } = fixture(t);
  let resolve!: (created: { path: string; rollbackToken: string }) => void;
  const e = imageEditor(doc, () => {}, {
    create: () => new Promise(done => { resolve = done; }), rollback: async () => {},
  });
  e.paste();
  e.view.hasFocus = () => false;
  e.view.focus = () => { throw new Error("Upload stole focus"); };
  const caret = e.view.state.selection.from;
  resolve({ path: "./assets/image-focus.png", rollbackToken: "receipt" }); await e.finished();
  assert.equal(e.view.state.selection.from, caret);
  assert.equal(e.view.state.doc.child(1).type.name, "figure");
});

test("destroyed Editor rolls back delayed upload; internal rich and text-only input bypass asset upload", async t => {
  const { doc, assets } = fixture(t);
  let resolve!: () => void;
  const ready = new Promise<void>(done => { resolve = done; });
  const errors: string[] = [];
  const e = imageEditor(doc, reason => errors.push(reason), {
    create: async file => { await ready; return createImageAsset(doc, file.type, Buffer.from(await file.arrayBuffer()), key); },
    rollback: async created => rollbackImageAsset({ documentPath: doc, ...created }, key),
  });
  assert.equal(e.paste('<p data-ieumdoc-type="paragraph">Internal</p>'), false);
  assert.equal(e.plugin.props.handleDOMEvents!.paste!.call(e.plugin, e.view, { clipboardData: { files: [], getData: () => "text" }, preventDefault() {} } as unknown as ClipboardEvent), false);
  e.paste(); e.destroy(); resolve(); await e.finished();
  assert.deepEqual(fs.readdirSync(assets), []);
  assert.equal(e.view.state.doc.childCount, 2);
  assert.match(errors.join(" "), /closed|cancel|insert/i);
});
