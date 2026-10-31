import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createDoclingHost } from "../server/docling.ts";
import { RootAccess } from "../server/file-access.ts";
import { handleDocumentRequest } from "../server/document-api.ts";
import { listenForFetch } from "../../../test/helpers/fetch-server.ts";
import { fakeDoclingServer } from "./helpers/docling-server.ts";
import { buildDoclingWorker } from "../../../packages/cli/scripts/build-docling-worker.ts";
import { INCOMPLETE } from "../server/plugin-output.ts";

test("shared Host persists device settings, checks the real HTTP service and safely completes, fails and cancels conversion", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "ieumdoc-docling-host-"));
  const allowed = path.join(root, "allowed"); mkdirSync(allowed);
  const settings = path.join(root, "settings", "docling.json");
  await buildDoclingWorker(path.join(root, "worker"));
  const access = new RootAccess([allowed]), docling = createDoclingHost(access, settings, { directory: path.join(root, "plugins"), manifest: path.join(root, "worker", "manifest.json") });
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
  writeFileSync(path.join(existing, INCOMPLETE), "a previous interrupted publication");
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
