import { nativeSource } from "./helpers/document.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { startHttpHost } from "../server/http-host.ts";
import { drawioAction } from "../shared/drawio-protocol.ts";

const diagram = (label: string) => `<svg xmlns="http://www.w3.org/2000/svg" content="&lt;mxfile&gt;&lt;diagram&gt;${label}&lt;/diagram&gt;&lt;/mxfile&gt;"><text>${label}</text></svg>`;

test("Draw.io diagrams are created in assets/, replaced only at their revision and stay inside the Root", async t => {
  const { a, outside, send } = await fixture(t, true);
  const documentPath = path.join(a, "document.md");
  const info = await (await send("/api/drawio")).json();
  assert.deepEqual(info, { available: true, libraries: [{ title: "custom", url: "/drawio-libraries/custom.xml" }] });
  const created = await send("/api/drawio", "POST", { documentPath, svg: diagram("A") });
  assert.equal(created.status, 200);
  const { path: relative, revision } = await created.json();
  assert.match(relative, /^\.\/assets\/diagram-[0-9a-f]{8}\.drawio\.svg$/);
  assert.equal(fs.readFileSync(path.join(a, relative), "utf8"), diagram("A"));
  const read = await (await send(`/api/drawio?${new URLSearchParams({ documentPath, path: relative })}`)).json();
  assert.deepEqual(read, { svg: diagram("A"), revision });
  assert.equal((await send("/api/drawio", "POST", { documentPath, path: relative, revision, svg: diagram("B") })).status, 200);
  assert.equal((await send("/api/drawio", "POST", { documentPath, path: relative, revision, svg: diagram("C") })).status, 409);
  assert.equal(fs.readFileSync(path.join(a, relative), "utf8"), diagram("B"));
  assert.equal((await send("/api/drawio", "POST", { documentPath, svg: "<svg xmlns=\"http://www.w3.org/2000/svg\"/>" })).status, 400);
  assert.equal((await send("/api/drawio", "POST", { documentPath, path: "./image.png", revision, svg: diagram("D") })).status, 400);
  assert.ok([400, 403].includes((await send("/api/drawio", "POST", { documentPath, path: "./../문서 A-other/x.drawio.svg", revision, svg: diagram("D") })).status));
  assert.equal((await send("/api/drawio", "POST", { documentPath: path.join(outside, "document.md"), svg: diagram("E") })).status, 403);
  assert.equal(fs.existsSync(path.join(outside, "assets")), false);
});

test("the local Draw.io webapp and libraries are same-origin frameable with a no-network CSP; the Editor is not", async t => {
  const { send } = await fixture(t, true);
  const page = await send("/drawio/?embed=1");
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(page.headers.get("content-security-policy")!, /connect-src 'self'/);
  assert.equal((await send("/drawio-libraries/custom.xml")).headers.get("content-type"), "application/xml; charset=utf-8");
  assert.equal((await send("/drawio/../editor/index.html")).status, 404);
  assert.equal((await send("/drawio-libraries/..%2Fsecret.xml")).status, 404);
  const editor = await send("/");
  assert.equal(editor.headers.get("x-frame-options"), "DENY");
  assert.match(editor.headers.get("content-security-policy")!, /frame-src 'self'/);
  const { send: plain } = await fixture(t, false);
  assert.equal((await (await plain("/api/drawio")).json()).available, false);
  assert.equal((await plain("/drawio/")).status, 404);
});

test("the Figure popup offers Create for an empty Figure and Edit only for .drawio.svg images", () => {
  assert.equal(drawioAction("", true), "create");
  assert.equal(drawioAction("  ", true), "create");
  assert.equal(drawioAction("./assets/a.drawio.svg", true), "edit");
  assert.equal(drawioAction("./assets/A.DRAWIO.SVG?v=2#x", true), "edit");
  assert.equal(drawioAction("./image.png", true), undefined);
  assert.equal(drawioAction("./plain.svg", true), undefined);
  assert.equal(drawioAction("", false), undefined);
  assert.equal(drawioAction("./assets/a.drawio.svg", false), undefined);
});

async function fixture(t: TestContext, drawio: boolean) {
  const base = fs.mkdtempSync(path.join(tmpdir(), "ieumdoc-drawio-"));
  const a = path.join(base, "문서 A"), outside = path.join(base, "문서 A-other");
  const editorDir = path.join(base, "editor"), webappDir = path.join(base, "webapp"), librariesDir = path.join(base, "libraries");
  for (const dir of [a, outside, editorDir, webappDir, librariesDir]) fs.mkdirSync(dir);
  for (const dir of [a, outside]) fs.writeFileSync(path.join(dir, "document.md"), nativeSource("# Title\n"));
  fs.writeFileSync(path.join(a, "image.png"), "png");
  fs.writeFileSync(path.join(editorDir, "index.html"), "<!doctype html><title>Editor</title>");
  fs.writeFileSync(path.join(webappDir, "index.html"), "<!doctype html><title>Draw.io</title>");
  fs.writeFileSync(path.join(librariesDir, "custom.xml"), "<mxlibrary>[]</mxlibrary>");
  fs.writeFileSync(path.join(base, "secret.xml"), "secret");
  const host = await startHttpHost({ editorDir, roots: [a], port: 0, drawio: drawio ? { webappDir, librariesDir } : undefined });
  const address = host.server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await host.close(); fs.rmSync(base, { recursive: true, force: true }); });
  const send = (route: string, method = "GET", body?: unknown) => fetch(url + route, {
    method, headers: { Origin: url, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { a, outside, send };
}
