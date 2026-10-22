// The `ieumdoc://app` handler with the real Host handlers: Editor files, document requests and
// Save go through the same code as the development server; paths cannot leave their folders.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { CONTENT_SECURITY_POLICY, createProtocolHandler, ORIGIN } from "../src/host-protocol.ts";

const root = mkdtempSync(path.join(os.tmpdir(), "ieumdoc-protocol-"));
after(() => rmSync(root, { recursive: true, force: true }));
const editorDir = path.join(root, "editor");
mkdirSync(path.join(editorDir, "assets"), { recursive: true });
writeFileSync(path.join(editorDir, "index.html"), "<!doctype html><title>IeumDoc</title>");
writeFileSync(path.join(editorDir, "assets", "app.js"), "export {};");
writeFileSync(path.join(root, "secret.txt"), "outside");
const documents = path.join(root, "documents");
mkdirSync(documents);
const initial = path.join(documents, "first.md");
writeFileSync(initial, "---\nieumdoc: 1\n---\n\n# First\n\nAlpha.\n");
writeFileSync(path.join(documents, "diagram.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
const handle = createProtocolHandler(editorDir, { document: initial });
const get = (pathname: string) => handle(new Request(`${ORIGIN}${pathname}`));

test("folder preview reuses shared validation and SVG isolation without a startup document", async () => {
  const start = createProtocolHandler(editorDir, { sample: initial });
  const route = `${ORIGIN}/api/file-preview?${new URLSearchParams({ root: documents, path: path.join(documents, "diagram.svg") })}`;
  for (const method of ["GET", "HEAD"]) {
    const result = await start(new Request(route, { method }));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("content-type"), "image/svg+xml");
    assert.match(result.headers.get("content-security-policy")!, /^sandbox;.*script-src 'none'/);
    assert.equal(result.headers.get("x-content-type-options"), "nosniff");
    assert.equal(result.headers.get("cache-control"), "no-store");
    if (method === "HEAD") assert.equal(await result.text(), "");
  }
});

test("serves the Editor build with the content security policy", async () => {
  const page = await get("/index.html");
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(page.headers.get("content-security-policy"), CONTENT_SECURITY_POLICY);
  assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'(;|$)/);
  assert.equal((await get("/")).status, 200);
  assert.equal((await get("/assets/app.js")).headers.get("content-type"), "text/javascript; charset=utf-8");
});

test("nothing outside the Editor build is served, including through encoded paths and symlinks", async () => {
  for (const pathname of ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt", "/%00", "/missing.js", "/assets"]) {
    assert.equal((await get(pathname)).status, 404, pathname);
  }
  let linked = false;
  try {
    symlinkSync(path.join(root, "secret.txt"), path.join(editorDir, "link.txt"));
    linked = true;
  } catch {
    // Creating symlinks needs Developer Mode or elevation on Windows.
  }
  if (linked) assert.equal((await get("/link.txt")).status, 404);
  assert.equal((await handle(new Request("ieumdoc://other/index.html"))).status, 404);
  assert.equal((await handle(new Request(`${ORIGIN}/index.html`, { method: "POST", body: "x" }))).status, 405);
});

test("the first document request opens the initial document through the Host handler", async () => {
  assert.equal((await get("/api/document?%ED%A0%80=x")).status, 400);
  const response = await get("/api/document");
  assert.equal(response.status, 200);
  const loaded = await response.json() as { path: string; source: string; revision: string };
  assert.equal(loaded.path, initial);
  assert.equal(loaded.source, "---\nieumdoc: 1\n---\n\n# First\n\nAlpha.\n");
  const media = await get(`/document/diagram.svg?path=${encodeURIComponent(initial)}`);
  assert.equal(media.status, 200);
  assert.equal(media.headers.get("content-type"), "image/svg+xml");
  assert.equal((await get(`/document/..%2f..%2fsecret.txt?path=${encodeURIComponent(initial)}`)).status, 400);
});

test("started without a document, the first request opens none and offers the sample", async () => {
  const sample = path.join(documents, "sample.md");
  const start = createProtocolHandler(editorDir, { sample });
  const response = await start(new Request(`${ORIGIN}/api/document`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-security-policy"), CONTENT_SECURITY_POLICY);
  assert.deepEqual(await response.json(), { start: true, sample });
  const named = await start(new Request(`${ORIGIN}/api/document?path=${encodeURIComponent(initial)}`));
  assert.equal(((await named.json()) as { path: string }).path, initial);
});

test("Save goes through the Host's session checks and Core", async () => {
  const loaded = await (await get("/api/document")).json() as { path: string; source: string; revision: string };
  const save = (body: unknown) => handle(new Request(`${ORIGIN}/api/document`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const edit = { path: [2], content: [{ kind: "text", text: "Alpha, saved from Desktop." }] };
  const saved = await save({ path: initial, revision: loaded.revision, base: { source: loaded.source }, paragraphs: [edit] });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal(readFileSync(initial, "utf8"), "---\nieumdoc: 1\n---\n\n# First\n\nAlpha, saved from Desktop.\n");
  // The disk revision no longer matches: the existing conflict check answers, and the file stays.
  const stale = await save({ path: initial, revision: loaded.revision, base: { source: loaded.source }, paragraphs: [edit] });
  assert.equal(stale.status, 409);
  assert.equal(readFileSync(initial, "utf8"), "---\nieumdoc: 1\n---\n\n# First\n\nAlpha, saved from Desktop.\n");
  assert.equal((await save({ path: initial })).status, 400);
});
