import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { loadDocumentFile } from "../server/document-api.ts";
import { MAX_JSON_BYTES, startHttpHost } from "../server/http-host.ts";
import { RootAccess } from "../server/file-access.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");

async function fixture(t: TestContext, external?: string) {
  const base = fs.mkdtempSync(path.join(tmpdir(), "ieumdoc-http-"));
  const a = path.join(base, "문서 A"), b = path.join(base, "documents-B");
  const outside = path.join(base, "문서 A-other"), editorDir = path.join(base, "editor");
  for (const dir of [a, b, outside, editorDir]) fs.mkdirSync(dir);
  for (const dir of [a, b, outside]) {
    fs.writeFileSync(path.join(dir, "document.md"), "# Title\n\nAlpha.\n");
    fs.writeFileSync(path.join(dir, "image.png"), png);
  }
  fs.writeFileSync(path.join(editorDir, "index.html"), "<!doctype html><title>Editor</title>");
  fs.writeFileSync(path.join(editorDir, "app.js"), "export {};");
  const host = await startHttpHost({ editorDir, roots: [a, b], port: 0, publicOrigin: external });
  const address = host.server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await host.close(); fs.rmSync(base, { recursive: true, force: true }); });
  const send = (route: string, method = "GET", body?: unknown, headers?: Record<string, string>) => fetch(url + route, {
    method, headers: { Origin: url, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { base, a, b, outside, editorDir, host, url, send };
}

const documentQuery = (file: string) => `/api/document?${new URLSearchParams({ path: file })}`;
// fetch normalizes/overrides Host; use an actual Node request to test a forged wire header.
const rawStatus = (url: string, headers: Record<string, string>) => new Promise<number>((resolve, reject) => {
  const req = request(url, { headers }, res => { res.resume(); res.on("end", () => resolve(res.statusCode!)); });
  req.on("error", reject); req.end();
});
const saveBody = (file: string, text = "Edited.") => {
  const loaded = loadDocumentFile(file);
  return { path: file, revision: loaded.revision, base: { source: loaded.source },
    paragraphs: [{ path: [1], content: [{ kind: "text", text }] }] };
};

test("HTTP starts with only allowed places and saves both roots through Core and revision checks", async t => {
  const { a, b, send, host, url } = await fixture(t);
  assert.deepEqual(await (await send("/api/document")).json(), { start: true, allowedRoots: [a, b] });
  const places = await (await send("/api/folder-places")).json();
  assert.deepEqual(places.places.map((place: { path: string }) => place.path), [a, b]);
  assert.ok(places.places.every((place: { kind: string }) => place.kind === "root"));
  for (const root of [a, b]) {
    const file = path.join(root, "document.md"), body = saveBody(file);
    const preview = await send("/api/document-source", "POST", body);
    assert.equal(preview.status, 200);
    assert.match((await preview.json()).markdown, /Edited\./);
    assert.match(fs.readFileSync(file, "utf8"), /Alpha/);
    assert.equal((await send("/api/document", "POST", body)).status, 200);
    const reopened = await (await send(documentQuery(file))).json();
    assert.equal(reopened.source, "# Title\n\nEdited.\n");
    assert.equal((await send("/api/document", "POST", body)).status, 409);
    assert.equal(fs.readFileSync(file, "utf8"), reopened.source);
    const created = path.join(root, "new.md");
    assert.equal((await send("/api/document", "PUT", { path: created })).status, 201);
    assert.equal((await send("/api/document", "PUT", { path: created })).status, 400);
    assert.equal((await send("/api/folder", "POST", { parent: root, name: "sub" })).status, 201);
    const listing = await (await send(`/api/folder?${new URLSearchParams({ root })}`)).json();
    assert.ok(listing.entries.some((entry: { path: string }) => entry.path === created));
    const browse = await (await send(`/api/folder-browse?${new URLSearchParams({ path: path.join(root, "sub") })}`)).json();
    assert.deepEqual(browse.crumbs.map((crumb: { path: string }) => crumb.path), [root, path.join(root, "sub")]);
    if (process.platform === "win32") {
      const alternateCase = await (await send(`/api/folder-browse?${new URLSearchParams({ path: root.toUpperCase() })}`)).json();
      assert.equal(alternateCase.crumbs.length, 1, "Different casing must still stop at the allowed root");
    }
  }
  const blocked = path.join(a, "readonly.md"), original = "Press {kbd}`Ctrl` now.\n\n# Heading\n\nBody.\n";
  fs.writeFileSync(blocked, original);
  const loaded = await (await send(documentQuery(blocked))).json();
  assert.match(loaded.writeError, /keyboard/);
  assert.equal((await send("/api/document", "POST", { path: blocked, revision: loaded.revision, base: { source: original } })).status, 400);
  assert.equal(fs.readFileSync(blocked, "utf8"), original);
  await host.close();
  await assert.rejects(fetch(url), /fetch failed/);
});

test("every file endpoint denies outside paths without exposing or modifying the outside folder", async t => {
  const { a, outside, base, send, url } = await fixture(t);
  const outsideFile = path.join(outside, "document.md"), original = fs.readFileSync(outsideFile);
  const body = saveBody(outsideFile);
  const cases: [string, string, unknown?][] = [
    [documentQuery(outsideFile), "GET"],
    [documentQuery(`${a}${path.sep}..${path.sep}${path.basename(outside)}${path.sep}document.md`), "GET"],
    ["/api/document", "PUT", { path: path.join(outside, "new.md") }],
    ["/api/document", "POST", body], ["/api/document-source", "POST", body],
    [`/api/folder?${new URLSearchParams({ root: outside })}`, "GET"],
    [`/api/folder?${new URLSearchParams({ root: a, path: outside })}`, "GET"],
    [`/api/folder-browse?${new URLSearchParams({ path: base })}`, "GET"],
    [`/api/folder-browse?${new URLSearchParams({ path: outside, files: "image" })}`, "GET"],
    ["/api/asset", "POST", { documentPath: path.join(a, "document.md"), source: path.join(outside, "image.png") }],
    ["/api/folder", "POST", { parent: outside, name: "new-folder" }],
    [`/document/image.png?${new URLSearchParams({ path: outsideFile })}`, "GET"],
  ];
  for (const [route, method, requestBody] of cases) {
    const response = await send(route, method, requestBody);
    assert.equal(response.status, 403, `${method} ${route}`);
    assert.ok(!(await response.text()).includes(outside));
  }
  const upload = (file: string) => fetch(`${url}/api/asset?${new URLSearchParams({ path: file })}`, {
    method: "POST", headers: { Origin: url, "Content-Type": "image/png" }, body: png,
  });
  assert.equal((await upload(outsideFile)).status, 403);
  const created = await (await upload(path.join(a, "document.md"))).json();
  assert.equal((await send("/api/asset", "DELETE", { documentPath: outsideFile, ...created })).status, 403);
  assert.equal((await send("/api/asset", "DELETE", { documentPath: path.join(a, "document.md"), ...created })).status, 204);
  const retained = await (await upload(path.join(a, "document.md"))).json();
  fs.renameSync(path.join(a, "assets"), path.join(a, "original-assets"));
  fs.symlinkSync(outside, path.join(a, "assets"), process.platform === "win32" ? "junction" : "dir");
  assert.equal((await upload(path.join(a, "document.md"))).status, 403);
  assert.equal((await send("/api/asset", "DELETE", { documentPath: path.join(a, "document.md"), ...retained })).status, 403);
  assert.equal(fs.existsSync(path.join(a, "original-assets", path.basename(retained.path))), true);
  assert.deepEqual(fs.readFileSync(outsideFile), original);
  assert.deepEqual(fs.readdirSync(outside).sort(), ["document.md", "image.png"]);
});

test("symlink/junction escapes and replaced roots cannot grant file or asset access", async t => {
  const { a, b, outside, send } = await fixture(t);
  const link = path.join(a, "escape");
  fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
  const escaped = path.join(link, "document.md"), outsideBody = saveBody(path.join(outside, "document.md"));
  for (const [route, method, body] of [
    [documentQuery(escaped), "GET"], ["/api/document", "POST", { ...outsideBody, path: escaped }],
    ["/api/document", "PUT", { path: path.join(link, "new.md") }],
    // A missing name behind the link must look the same as an existing one.
    [documentQuery(path.join(link, "missing.md")), "GET"], ["/api/document", "PUT", { path: path.join(link, "missing", "new.md") }],
    [`/api/folder-browse?${new URLSearchParams({ path: link })}`, "GET"],
    ["/api/folder", "POST", { parent: link, name: "new-folder" }],
    [`/document/image.png?${new URLSearchParams({ path: escaped })}`, "GET"],
  ] as [string, string, unknown?][]) assert.equal((await send(route, method, body)).status, 403, route);
  const listing = await (await send(`/api/folder?${new URLSearchParams({ root: a })}`)).json();
  assert.ok(!listing.entries.some((entry: { name: string }) => entry.name === "escape"));
  fs.symlinkSync(b, path.join(a, "other"), process.platform === "win32" ? "junction" : "dir");
  assert.equal((await send(`/document/other/image.png?${new URLSearchParams({ path: path.join(a, "document.md") })}`)).status, 400);
  fs.renameSync(b, b + "-old");
  fs.symlinkSync(outside, b, process.platform === "win32" ? "junction" : "dir");
  assert.equal((await send(documentQuery(path.join(b, "document.md")))).status, 403);
  assert.equal(fs.readFileSync(path.join(outside, "document.md"), "utf8"), "# Title\n\nAlpha.\n");
});

test("root validation handles duplicates/nesting and rejects Windows special locators", async t => {
  const { a, b, base } = await fixture(t);
  fs.mkdirSync(path.join(a, "child"));
  const access = new RootAccess([a, a, b, path.join(a, "child")]);
  assert.deepEqual(access.roots, [a, b, path.join(a, "child")]);
  assert.equal(access.boundary(path.join(a, "child")), path.join(a, "child"));
  assert.throws(() => new RootAccess([]), /--root/);
  assert.throws(() => new RootAccess([path.join(a, "missing")]), /ENOENT/);
  assert.throws(() => new RootAccess([path.join(a, "document.md")]), /directory/);
  for (const value of ["C:relative.md", "\\\\?\\C:\\outside.md", "\\\\.\\C:\\outside.md", "bad\0.md"]) assert.throws(() => access.resolve(value), /Invalid/);
  if (process.platform === "win32") assert.throws(() => access.resolve(path.join(a, "document.md:stream")), /Invalid/);
  // JavaScript case folding equates KELVIN SIGN with "k"; NTFS keeps these sibling folders distinct.
  const book = path.join(base, "book"), alias = path.join(base, "boo\u212A");
  fs.mkdirSync(book);
  const narrow = new RootAccess([book]);
  assert.throws(() => narrow.resolve(path.join(alias, "missing.md")), /outside/, "A missing look-alike is outside too");
  fs.mkdirSync(alias);
  assert.throws(() => narrow.resolve(alias), /outside/);
  assert.throws(() => narrow.resolve(path.join(alias, "new.md"), true), /outside/);
  fs.symlinkSync(book, path.join(alias, "link"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => narrow.resolve(path.join(alias, "link")), /outside/, "The locator must also be inside the root");
  // Both are real roots; the same directory in another case is still one root.
  const both = new RootAccess([book, alias, ...(process.platform === "win32" ? [book.toUpperCase()] : [])]);
  assert.deepEqual(both.roots, [book, alias]);
  assert.equal(both.resolve(path.join(alias, "new.md"), true), path.join(alias, "new.md"));
  assert.equal(both.boundary(alias), alias);
});

test("HTTP rejects foreign/missing origins, forged hosts and malformed requests; media cannot execute scripts", async t => {
  const { a, send, url } = await fixture(t), file = path.join(a, "document.md");
  for (const origin of [undefined, "null", "https://attacker.example"]) {
    const response = await fetch(url + "/api/document", { method: "POST", headers: { "Content-Type": "application/json",
      ...(origin === undefined ? {} : { Origin: origin }) }, body: JSON.stringify(saveBody(file)) });
    assert.equal(response.status, 403);
  }
  assert.equal(await rawStatus(url + "/api/document", { Host: "attacker.example" }), 403);
  assert.equal((await send("/api/document", "GET", undefined, { "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal((await send("/api/document", "POST", {}, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await send("/api/document", "OPTIONS")).status, 405);
  for (const route of ["/%GG", "/%00", "/document/%252e%252e/secret", "/api/document?path=x&path=y"]) assert.equal((await send(route)).status, 400);
  for (const route of ["/missing.js", "/assets/..%2f..%2fsecret", "/api/missing"]) assert.equal((await send(route)).status, 404);
  const html = await send("/");
  assert.equal(html.status, 200);
  assert.match(html.headers.get("content-security-policy")!, /script-src 'self'/);
  assert.equal(html.headers.get("access-control-allow-origin"), null);
  assert.equal((await send("/", "HEAD")).headers.get("content-type"), "text/html; charset=utf-8");
  fs.writeFileSync(path.join(a, "unsafe.svg"), '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/document")</script></svg>');
  const media = await send(`/document/unsafe.svg?${new URLSearchParams({ path: file })}`);
  assert.equal(media.status, 200);
  assert.match(media.headers.get("content-security-policy")!, /^sandbox;.*script-src 'none'/);
  assert.equal(media.headers.get("x-content-type-options"), "nosniff");
  assert.equal(media.headers.get("cache-control"), "no-store");
});

test("body limits count chunked bytes and leave original files and the server usable", async t => {
  const { a, url, send } = await fixture(t);
  const chunked = (route: string, type: string, chunks: Buffer[]) => new Promise<number>((resolve, reject) => {
    const req = request(url + route, { method: "POST", headers: { Origin: url, "Content-Type": type } }, res => {
      res.resume(); res.on("end", () => resolve(res.statusCode!));
    });
    req.on("error", reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
  assert.equal(await chunked("/api/figure-validation", "application/json", [Buffer.alloc(MAX_JSON_BYTES, " "), Buffer.from("{}")]), 413);
  const withinLimit = await chunked("/api/document", "application/json", [Buffer.alloc(MAX_JSON_BYTES - 2, " "), Buffer.from("{}")]);
  assert.equal(withinLimit, 400, "A complete in-limit JSON body reaches ordinary request validation");
  assert.equal(await chunked(`/api/asset?${new URLSearchParams({ path: path.join(a, "document.md") })}`, "image/png", [Buffer.alloc(10 * 1024 * 1024 + 1)]), 413);
  assert.equal((await send("/api/asset", "DELETE", { documentPath: "x", path: "x", rollbackToken: "x".repeat(8192) })).status, 413);
  assert.equal((await fetch(url + "/api/document", { method: "POST", headers: { Origin: url, "Content-Type": "application/json" }, body: "{" })).status, 400);
  await new Promise<void>(resolve => {
    const req = request(url + "/api/document", { method: "POST", headers: { Origin: url, "Content-Type": "application/json", "Content-Length": "1000" } });
    req.on("error", () => resolve()); req.write('{"path":'); req.destroy();
  });
  assert.equal((await send(documentQuery(path.join(a, "document.md")))).status, 200);
  assert.deepEqual(fs.readdirSync(a).sort(), ["document.md", "image.png"]);
});

test("a protected reverse proxy serves HTML, APIs and media; forwarded headers cannot grant access", async t => {
  const proxy = createServer();
  await new Promise<void>(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const address = proxy.address();
  assert.ok(address && typeof address !== "string");
  const external = `http://127.0.0.1:${address.port}`;
  const { a, url, send } = await fixture(t, external);
  t.after(() => new Promise<void>(resolve => { proxy.closeAllConnections(); proxy.close(() => resolve()); }));
  proxy.on("request", (req, res) => {
    if (req.headers.authorization !== "Bearer test-operator") { res.writeHead(401); res.end(); return; }
    const upstream = request(url + req.url, { method: req.method, headers: { ...req.headers, host: new URL(external).host } }, response => {
      res.writeHead(response.statusCode!, response.headers); response.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502); res.end(); }); req.pipe(upstream);
  });
  for (const route of ["/", "/app.js", documentQuery(path.join(a, "document.md")), `/document/image.png?${new URLSearchParams({ path: path.join(a, "document.md") })}`]) {
    assert.equal((await fetch(external + route)).status, 401);
    assert.equal((await fetch(external + route, { headers: { Authorization: "Bearer test-operator" } })).status, 200);
  }
  assert.equal((await fetch(external + "/api/document", { method: "POST", headers: {
    Authorization: "Bearer test-operator", Origin: external, "Content-Type": "application/json",
  }, body: JSON.stringify(saveBody(path.join(a, "document.md"))) })).status, 200);
  assert.equal(await rawStatus(url + "/api/document", { Host: "unapproved.example", "X-Forwarded-Host": new URL(external).host }), 403);
});
