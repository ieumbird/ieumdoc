import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createDoclingHost } from "../server/docling.ts";
import { moduleCommand, moduleUi } from "../server/module-runtime.ts";
import { RootAccess } from "../server/file-access.ts";
import { handleDocumentRequest } from "../server/document-api.ts";
import { listenForFetch } from "../../../test/helpers/fetch-server.ts";
import { fakeDoclingServer } from "./helpers/docling-server.ts";

test("module registration validates the manifest before enabling a private bundled copy and persists disable", t => {
  const root = mkdtempSync(path.join(tmpdir(), "ieumdoc-manifest-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const modules = path.join(root, "modules"), manifest = path.join(root, "manifest.json"), entry = path.join(root, "worker.cjs");
  writeFileSync(entry, "// trusted fixture worker\n");
  const valid = { id: "docling", version: "0.0.0-spike", hostApiVersion: 1, entrypoint: "worker.cjs",
    permissions: ["read-input", "write-staging", "network-docling"] };
  for (const changed of [{ hostApiVersion: 2 }, { version: undefined }, { entrypoint: "../escape.cjs" }, { permissions: ["read-input"] }]) {
    writeFileSync(manifest, JSON.stringify({ ...valid, ...changed }));
    assert.throws(() => moduleCommand("register", manifest, modules), /Unsupported Docling manifest/u);
    assert.equal(moduleCommand("list", undefined, modules), null);
  }
  writeFileSync(manifest, JSON.stringify(valid));
  const registered = moduleCommand("register", manifest, modules)!;
  assert.equal(registered.enabled, true);
  assert.notEqual(registered.directory, root);
  writeFileSync(entry, "// source changed after registration\n");
  assert.equal(readFileSync(path.join(registered.directory, "worker.cjs"), "utf8"), "// trusted fixture worker\n");
  moduleCommand("disable", undefined, modules);
  assert.equal(moduleCommand("list", undefined, modules)!.enabled, false);
  moduleCommand("enable", undefined, modules);
  assert.equal(moduleCommand("list", undefined, modules)!.enabled, true);
  const ui = { hostApiVersion: 1, entrypoint: "ui.mjs", stylesheet: "ui.css" };
  writeFileSync(path.join(root, "ui.mjs"), "export const activate = () => {};\n");
  writeFileSync(path.join(root, "ui.css"), ".docling-compare {}\n");
  writeFileSync(manifest, JSON.stringify({ ...valid, ui: { ...ui, entrypoint: "../outside.mjs" } }));
  assert.throws(() => moduleCommand("register", manifest, modules), /Unsupported Docling UI manifest/u);
  writeFileSync(manifest, JSON.stringify({ ...valid, ui }));
  const installed = moduleCommand("register", manifest, modules)!;
  const descriptor = moduleUi(null, null, modules);
  assert.equal(descriptor.enabled, true);
  const revision = "revision" in descriptor ? descriptor.revision : "";
  assert.ok("content" in moduleUi("script", revision, modules));
  assert.throws(() => moduleUi("script", "stale-registration", modules), /registration changed/u);
  assert.throws(() => moduleUi("../worker.cjs", revision, modules), /asset is invalid/u);
  writeFileSync(path.join(installed.directory, "ui.mjs"), "// tampered\n");
  assert.throws(() => moduleUi("script", revision, modules), /bundle changed/u);
  moduleCommand("disable", undefined, modules);
  assert.deepEqual(moduleUi(null, null, modules), { enabled: false });
  assert.throws(() => moduleUi("style", revision, modules), /disabled/u);
  writeFileSync(manifest, JSON.stringify({ ...valid, ui: { ...ui, hostApiVersion: 2 } }));
  moduleCommand("register", manifest, modules);
  const incompatible = moduleUi(null, null, modules);
  assert.equal(incompatible.hostApiVersion, 2);
  assert.throws(() => moduleUi("script", incompatible.revision, modules), /Unsupported UI Host API 2/u);
});

test("shared Host persists device settings, checks the real HTTP service and safely completes, fails and cancels conversion", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ieumdoc-docling-host-"));
  const allowed = path.join(root, "allowed"); mkdirSync(allowed);
  const settings = path.join(root, "settings", "docling.json");
  const access = new RootAccess([allowed]), docling = createDoclingHost(access, settings);
  const fake = await fakeDoclingServer();
  const host = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, access, 4096, undefined, undefined, docling); });
  await listenForFetch(host);
  const origin = `http://127.0.0.1:${(host.address() as { port: number }).port}`;
  t.after(async () => { await docling.close(); await fake.close(); host.closeAllConnections(); await new Promise<void>(resolve => host.close(() => resolve())); rmSync(root, { recursive: true, force: true }); });
  const send = (endpoint: string, method = "GET", body?: unknown) => fetch(`${origin}/api/docling-${endpoint}`, { method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  assert.equal((await (await send("settings")).json()).server, "http://127.0.0.1:8001");
  assert.equal((await send("settings", "PUT", { server: "file:///secret" })).status, 400);
  assert.equal(existsSync(settings), false);
  assert.equal((await send("settings", "PUT", { server: fake.url })).status, 200);
  assert.equal(createDoclingHost(access, settings).settings().server, fake.url, "configuration survives a new Host instance");
  let report = await (await send("check", "POST", {})).json();
  assert.equal(report.ok, true); assert.equal(report.responding, true); assert.equal(report.ready, true); assert.equal(report.compatible, true);
  assert.equal(report.openapiMatches, false, "same version with changed spec is visible and permitted");
  for (const [mode, code] of [["version", "version"], ["not-ready", "not-ready"]] as const) {
    fake.mode(mode); report = await (await send("check", "POST", {})).json();
    assert.equal(report.ok, false); assert.equal(report.code, code); assert.ok(report.message);
  }
  await send("settings", "PUT", { server: "http://127.0.0.1:1" });
  assert.equal((await (await send("check", "POST", {})).json()).code, "unreachable");
  await send("settings", "PUT", { server: fake.url });
  const input = path.join(allowed, "paper.pdf"), outside = path.join(root, "private.pdf");
  writeFileSync(input, "%PDF-1.7\nfixture"); writeFileSync(outside, "%PDF-1.7\nprivate");
  assert.equal((await send("conversion", "POST", { path: outside })).status, 403);
  assert.equal(fake.submissions(), 0);
  const existing = path.join(allowed, "paper.docling"); mkdirSync(existing); writeFileSync(path.join(existing, "keep"), "keep");
  const wait = async () => {
    for (let i = 0; i < 200; i++) { const job = docling.current()!; if (job.state !== "running") return job; await delay(25); }
    throw new Error("Host conversion did not finish");
  };
  fake.mode("success");
  let job = await (await send("conversion", "POST", { path: input })).json();
  assert.equal(job.state, "running"); assert.equal(job.output, path.join(allowed, "paper.docling-2"));
  assert.equal((await send("conversion", "POST", { path: input })).status, 400, "one active task per Host");
  job = await wait(); assert.equal(job.state, "success", job.error);
  assert.equal(readFileSync(path.join(existing, "keep"), "utf8"), "keep");
  const comparison = await fetch(`${origin}/api/docling-compare?${new URLSearchParams({ path: path.join(job.output, "document.md") })}`);
  assert.equal(comparison.status, 200); assert.equal((await comparison.json()).stale, false);
  fake.mode("failure");
  await send("conversion", "POST", { path: input }); job = await wait();
  assert.equal(job.state, "error"); assert.match(job.error, /Fixture conversion failed/); assert.equal(existsSync(job.output), false);
  assert.equal(job.failure.code, "server");
  for (const [mode, code] of [["model-missing", "model-missing"], ["redacted", "server"]] as const) {
    fake.mode(mode); await send("conversion", "POST", { path: input }); job = await wait();
    assert.equal(job.state, "error"); assert.equal(job.failure.code, code); assert.ok(job.failure.taskId);
    assert.equal(existsSync(job.output), false);
  }
  fake.mode("pending");
  job = await (await send("conversion", "POST", { path: input })).json();
  for (let i = 0; i < 200 && !docling.current()!.progress.taskId; i++) await delay(10);
  assert.ok(docling.current()!.progress.taskId);
  job = await (await send("conversion", "DELETE", { id: job.id })).json();
  assert.equal(job.state, "cancelled"); assert.match(job.error, /server task may continue/); assert.equal(existsSync(job.output), false);
  assert.equal(fake.requests.some(request => /cancel|DELETE/.test(request)), false, "the server has no cancellation call");
  assert.equal((await send("conversion", "DELETE", { id: "old" })).status, 400);
  assert.equal((await send("settings", "DELETE", {})).status, 405);
});
