import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { BIBLIOGRAPHY_LIMITS } from "@ieumdoc/core";
import { requestBibliography } from "../src/document-session.ts";
import { readBibliographySources } from "../server/bibliography.ts";
import { RootAccess } from "../server/file-access.ts";

function fixture(t: TestContext) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ieumdoc-bibliography-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, "root"), chapter = path.join(root, "chapters"), outside = path.join(base, "outside");
  fs.mkdirSync(chapter, { recursive: true }); fs.mkdirSync(outside);
  const document = path.join(chapter, "paper.md");
  fs.writeFileSync(document, "---\nieumdoc: 1\n---\n\nText.\n");
  const bib = "@misc{key,title={Title},year={2024},url={https://example.org}}";
  fs.writeFileSync(path.join(root, "refs.bib"), bib);
  fs.writeFileSync(path.join(outside, "refs.bib"), bib);
  return { base, root, chapter, outside, document, bib };
}

test("bibliography local default, explicit common folder and fixed HTTP Root union remain distinct", t => {
  const { root, document, outside, bib } = fixture(t);
  assert.equal(readBibliographySources(document, ["../refs.bib"])[0].status, "error");
  const local = readBibliographySources(document, ["../refs.bib"], null, root)[0];
  assert.equal(local.status, "ok");
  assert.equal(local.status === "ok" && local.text, bib);
  assert.equal(readBibliographySources(document, ["../../outside/refs.bib"], null, root)[0].status, "error");
  const http = new RootAccess([root, outside]);
  assert.equal(readBibliographySources(document, ["../../outside/refs.bib"], http, path.dirname(document))[0].status, "ok");
  assert.equal(readBibliographySources(document, ["../refs.bib"], new RootAccess([root]), outside)[0].status, "ok");
  assert.equal(readBibliographySources(document, ["../../outside/refs.bib"], new RootAccess([root]), outside)[0].status, "error");
  assert.equal(readBibliographySources(document, ["../refs.bib"], null, outside)[0].status, "error", "document must also be inside the boundary");
});

test("bibliography rejects junction escapes, replaced Roots, directories, invalid UTF-8 and absolute declarations", t => {
  const { root, chapter, outside, document } = fixture(t);
  fs.symlinkSync(outside, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
  assert.equal(readBibliographySources(document, ["../linked/refs.bib"], null, root)[0].status, "error");
  fs.writeFileSync(path.join(chapter, "invalid.bib"), Buffer.from([0xff, 0xfe]));
  assert.deepEqual(readBibliographySources(document, ["invalid.bib"])[0], { source: "invalid.bib", status: "error", code: "bibliography-invalid" });
  fs.mkdirSync(path.join(chapter, "directory.bib"));
  assert.equal(readBibliographySources(document, ["directory.bib"])[0].status, "error");
  assert.equal(readBibliographySources(document, [path.join(outside, "refs.bib")], null, root)[0].status, "error");
  const pinned = new RootAccess([root]);
  fs.renameSync(root, root + "-old"); fs.mkdirSync(root);
  fs.mkdirSync(chapter); fs.writeFileSync(document, "replacement"); fs.writeFileSync(path.join(root, "refs.bib"), "replacement");
  assert.equal(readBibliographySources(document, ["../refs.bib"], pinned)[0].status, "error");
});

test("bibliography reads enforce exact per-file, aggregate-byte and file-count bounds", t => {
  const { chapter, document } = fixture(t);
  const exact = "%" + "a".repeat(BIBLIOGRAPHY_LIMITS.fileBytes - 1);
  const paths = Array.from({ length: BIBLIOGRAPHY_LIMITS.files + 1 }, (_, i) => `${i}.bib`);
  for (const name of paths) fs.writeFileSync(path.join(chapter, name), exact);
  assert.equal(readBibliographySources(document, ["0.bib"])[0].status, "ok");
  fs.appendFileSync(path.join(chapter, "0.bib"), "x");
  assert.deepEqual(readBibliographySources(document, ["0.bib"])[0], { source: "0.bib", status: "error", code: "bibliography-limit" });
  const total = readBibliographySources(document, paths.slice(1, 6));
  assert.deepEqual(total.map(s => s.status), ["ok", "ok", "ok", "ok", "error"]);
  for (const name of paths) fs.writeFileSync(path.join(chapter, name), "");
  const files = readBibliographySources(document, paths);
  assert.equal(files[15].status, "ok");
  assert.deepEqual(files[16], { source: "16.bib", status: "error", code: "bibliography-limit" });
});

test("bibliography detects mutation and path replacement during the bounded descriptor read", t => {
  const { root, document } = fixture(t);
  const target = path.join(root, "refs.bib");
  const originalRead = fs.readSync;
  let changed = false;
  t.mock.method(fs, "readSync", (...args: Parameters<typeof fs.readSync>) => {
    const count = Reflect.apply(originalRead, fs, args);
    if (!changed) { changed = true; fs.appendFileSync(target, "\n% external change\n"); }
    return count;
  });
  assert.deepEqual(readBibliographySources(document, ["../refs.bib"], null, root)[0], { source: "../refs.bib", status: "error", code: "bibliography-changed" });
  t.mock.restoreAll(); changed = false;
  t.mock.method(fs, "readSync", (...args: Parameters<typeof fs.readSync>) => {
    const count = Reflect.apply(originalRead, fs, args);
    if (!changed) { changed = true; fs.renameSync(target, target + ".old"); fs.copyFileSync(target + ".old", target); }
    return count;
  });
  assert.deepEqual(readBibliographySources(document, ["../refs.bib"], null, root)[0], { source: "../refs.bib", status: "error", code: "bibliography-changed" });
});

// The browser covers successful Save refresh. Guard failed/stale reads without undoing a Save.
test("bibliography refresh uses only the saved document revision and degrades failed reads to unverified sources", async t => {
  const failed = [{ source: "refs.bib", status: "error", code: "bibliography-unreadable" }];
  const fetch = t.mock.method(globalThis, "fetch", async (url: string) => {
    const query = new URL(url, "http://localhost");
    assert.equal(query.pathname, "/api/bibliography");
    assert.deepEqual([...query.searchParams], [["path", "paper.md"], ["revision", "saved-revision"], ["root", "allowed-folder"]]);
    return Response.json({ revision: "different-revision", sources: [{ source: "refs.bib", status: "ok", text: "stale" }] });
  });
  assert.deepEqual(await requestBibliography("paper.md", "saved-revision", ["refs.bib"], "allowed-folder"), failed);
  fetch.mock.mockImplementation(async () => { throw new Error("connection lost"); });
  assert.deepEqual(await requestBibliography("paper.md", "saved-revision", ["refs.bib"]), failed);
  const calls = fetch.mock.calls.length;
  assert.deepEqual(await requestBibliography("paper.md", "saved-revision", []), []);
  assert.equal(fetch.mock.calls.length, calls, "disconnecting the last file clears the snapshot without a read");
});
