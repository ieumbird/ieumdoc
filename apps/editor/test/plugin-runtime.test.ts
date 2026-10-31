import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { fork, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { buildDoclingWorker } from "../../../packages/cli/scripts/build-docling-worker.ts";
import { createProtocolHandler, ORIGIN } from "../../desktop/src/host-protocol.ts";
import { createDoclingHost } from "../server/docling.ts";
import { accessPath, RootAccess } from "../server/file-access.ts";
import { PluginStore } from "../server/plugin-store.ts";
import { INCOMPLETE } from "../server/plugin-output.ts";
import { fakeDoclingServer } from "./helpers/docling-server.ts";
import { handleDocumentRequest } from "../server/document-api.ts";
import { startHttpHost } from "../server/http-host.ts";
import { listenForFetch } from "../../../test/helpers/fetch-server.ts";

const fixture = mkdtempSync(path.join(tmpdir(), "litzio-worker-tests-"));
const bundled = path.join(fixture, "bundled");
before(() => buildDoclingWorker(bundled));
after(() => rmSync(fixture, { recursive: true, force: true }));
async function until<T>(read: () => T | Promise<T>, accept: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 15_000;
  while (true) {
    const result = await read();
    if (accept(result)) return result;
    if (Date.now() >= deadline) throw new Error("Worker condition did not settle.");
    await delay(20);
  }
}
function directory(name: string) { const root = path.join(fixture, name); mkdirSync(root); return root; }
function child(mode: string, root: string, env = process.env) {
  return fork(fileURLToPath(new URL("./helpers/plugin-owner.ts", import.meta.url)), [mode, root], {
    execArgv: ["--import", "tsx"], env, stdio: ["ignore", "ignore", "pipe", "ipc"], windowsHide: true,
  });
}
async function kill(process: ChildProcess) {
  if (process.exitCode !== null || process.signalCode !== null) return;
  const exited = once(process, "exit"); process.kill("SIGKILL"); await exited;
}

test("readable document endpoints do not require listing an ancestor outside the allowed Root", async t => {
  const parent = directory("unlistable-parent"), allowed = path.join(parent, "allowed"); mkdirSync(allowed);
  const document = path.join(allowed, "document.md"), source = "---\nlitzio: 1\n---\n\nReadable without listing its ancestor.\n";
  writeFileSync(document, source);
  const staging = path.join(allowed, ".litzio-plugin-private"); mkdirSync(staging);
  writeFileSync(path.join(staging, "document.md"), source);
  const access = new RootAccess([allowed]);
  const original = fs.readdirSync;
  // Deterministic FILE_LIST_DIRECTORY/EACCES fault: retain real read/stat and
  // child Root access without changing this machine's ACLs or assuming chmod.
  const listing = t.mock.method(fs, "readdirSync", (...args: Parameters<typeof fs.readdirSync>) => {
    if (path.resolve(String(args[0])) === parent) throw Object.assign(new Error("ancestor listing denied"), { code: "EACCES" });
    return original(...args);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => fs.readdirSync(parent), { code: "EACCES" });
    assert.equal(readFileSync(document, "utf8"), source);
    assert.equal(statSync(document).isFile(), true);
    for (const policy of [null, access]) {
      const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, policy); });
      await listenForFetch(server);
      t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
      const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/document?`;
      const response = await fetch(url + new URLSearchParams({ path: document }));
      assert.equal(response.status, 200, `${policy ? "Root" : "local"} must allow the readable document`);
      assert.equal((await response.json()).source, source);
      assert.equal(accessPath(document, policy), document);
      const privateResponse = await fetch(url + new URLSearchParams({ path: path.join(staging, "document.md") }));
      assert.equal(privateResponse.status, 403, "staging remains private without ancestor enumeration");
    }
    assert.throws(() => fs.readdirSync(parent), { code: "EACCES" }, "the ancestor remains unlistable throughout the reads");
  } finally { listing.mock.restore(); syncBuiltinESMExports(); }
});

test("private staging document endpoints reject filesystem aliases without hiding ordinary siblings", async t => {
  const root = directory("private-aliases"), staging = path.join(root, ".litzio-plugin-private");
  mkdirSync(staging);
  const source = "---\nlitzio: 1\n---\n\nPrivate staging text.\n";
  writeFileSync(path.join(staging, "document.md"), source);
  const ordinary = path.join(root, "ordinary"); mkdirSync(ordinary);
  writeFileSync(path.join(ordinary, "document.md"), source);
  const junction = path.join(root, "alias");
  symlinkSync(staging, junction, process.platform === "win32" ? "junction" : "dir");
  const aliases = [staging, junction];
  if (process.platform === "win32") {
    aliases.push(path.join(root, path.basename(staging).toUpperCase()));
    const shortName = spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/c", `for %I in ("${staging}") do @echo %~sI`], { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true });
    assert.equal(shortName.status, 0, shortName.stderr);
    const short = shortName.stdout.trim();
    if (path.basename(short) !== path.basename(staging)) { aliases.push(path.join(root, path.basename(short))); t.diagnostic(`8.3 alias: ${path.basename(short)}`); }
    else t.diagnostic("This filesystem supplies no 8.3 name; case and junction aliases are still exercised.");
  }
  for (const alias of aliases) {
    assert.equal(statSync(alias, { bigint: true }).ino, statSync(staging, { bigint: true }).ino, "the alias must identify the actual private directory");
  }
  for (const access of [null, new RootAccess([root])]) {
    const server = createServer((req, res) => { void handleDocumentRequest(req, res, () => { res.statusCode = 404; res.end(); }, access); });
    await listenForFetch(server);
    t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/document?`;
    for (const alias of aliases) {
      const response = await fetch(url + new URLSearchParams({ path: path.join(alias, "document.md") }));
      assert.equal(response.status, 403, `${access ? "Root" : "local"} must reject ${alias}`);
    }
    const response = await fetch(url + new URLSearchParams({ path: path.join(ordinary, "document.md") }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).source, source, "an unrelated directory sharing the parent remains readable");
  }
});

test("closing a fresh HTTP Host rejects a first conversion whose body finishes after shutdown starts", async t => {
  const root = directory("late-admission"), plugins = path.join(root, "plugins"), settings = path.join(root, "settings.json");
  const input = path.join(root, "paper.pdf"), id = randomUUID();
  writeFileSync(input, "%PDF-1.7\nlate admission"); writeFileSync(path.join(root, "index.html"), "<!doctype html>");
  const store = new PluginStore(plugins); store.register(path.join(bundled, "manifest.json")); store.close();
  const fake = await fakeDoclingServer(); fake.mode("pending");
  writeFileSync(settings, JSON.stringify({ server: fake.url }));
  const previous = { plugins: process.env.LITZIO_PLUGINS_DIR, settings: process.env.LITZIO_DOCLING_SETTINGS_FILE };
  process.env.LITZIO_PLUGINS_DIR = plugins; process.env.LITZIO_DOCLING_SETTINGS_FILE = settings;
  let host: Awaited<ReturnType<typeof startHttpHost>>;
  try { host = await startHttpHost({ roots: [root], editorDir: root, port: 0 }); }
  finally {
    if (previous.plugins === undefined) delete process.env.LITZIO_PLUGINS_DIR; else process.env.LITZIO_PLUGINS_DIR = previous.plugins;
    if (previous.settings === undefined) delete process.env.LITZIO_DOCLING_SETTINGS_FILE; else process.env.LITZIO_DOCLING_SETTINGS_FILE = previous.settings;
  }
  t.after(async () => { await host.close(); await fake.close(); });
  const receiving = Promise.withResolvers<void>();
  host.server.once("request", req => req.once("data", () => receiving.resolve()));
  const listeningStopped = Promise.withResolvers<void>(), originalClose = host.server.close.bind(host.server);
  host.server.close = ((callback?: (error?: Error) => void) => {
    const result = originalClose(callback); listeningStopped.resolve(); return result;
  }) as typeof host.server.close;
  const body = JSON.stringify({ path: input, id });
  const response = Promise.withResolvers<{ status: number; body: string }>();
  const request = httpRequest(`${host.url}/api/docling-conversion`, { method: "POST", headers: { Origin: host.url, Connection: "close", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, res => {
    let text = ""; res.on("data", chunk => { text += chunk; }); res.on("end", () => response.resolve({ status: res.statusCode!, body: text }));
  });
  request.on("error", response.reject); t.after(() => request.destroy());
  request.write(body.slice(0, 1));
  await receiving.promise;
  const closed = host.close();
  await listeningStopped.promise;
  request.end(body.slice(1));
  const [result] = await Promise.all([response.promise, closed]);
  assert.equal(host.server.listening, false);
  assert.equal(result.status, 400, result.body);
  assert.match(JSON.parse(result.body).error, /clos/);
  assert.equal(fake.submissions(), 0);
  const observer = new PluginStore(plugins);
  try { assert.equal(observer.get(id), null, "shutdown cannot leave an admitted request or ownership lock"); }
  finally { observer.close(); }
});

test("Host close awaits admitted workers and permanently prevents another runtime or worker", async t => {
  const root = directory("close-workers"), fake = await fakeDoclingServer(); fake.mode("pending");
  t.after(() => fake.close());
  for (const phase of ["before-worker", "running-worker"]) {
    const folder = path.join(root, phase), worker = path.join(folder, "worker"); mkdirSync(worker, { recursive: true });
    const input = path.join(folder, "paper.pdf"), pidFile = path.join(folder, "worker.pid"); writeFileSync(input, "%PDF-1.7\nclose");
    writeFileSync(path.join(worker, "worker.cjs"), `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); require(${JSON.stringify(path.join(bundled, "worker.cjs"))});`);
    writeFileSync(path.join(worker, "manifest.json"), JSON.stringify({ id: "docling", version: "close-test", workerApi: 1, entry: "worker.cjs" }));
    const plugins = path.join(folder, "plugins"), host = createDoclingHost(new RootAccess([folder]), path.join(folder, "settings.json"), { directory: plugins, manifest: path.join(worker, "manifest.json") });
    t.after(() => host.close()); host.configure(fake.url);
    const submissions = fake.submissions(), job = await host.start(input);
    if (phase === "running-worker") await until(() => fake.submissions(), count => count === submissions + 1);
    else assert.equal(existsSync(pidFile), false, "the close begins before the admitted worker is created");
    const closing = host.close();
    await assert.rejects(host.start(input), /closing/);
    assert.throws(() => host.plugins(), /closing/);
    await closing;
    if (existsSync(pidFile)) assert.throws(() => process.kill(Number(readFileSync(pidFile, "utf8")), 0), "close must await the actual worker exit");
    assert.equal(fake.submissions(), submissions + (phase === "running-worker" ? 1 : 0));
    const observer = new PluginStore(plugins);
    try {
      const receipt = observer.get(job.id)!;
      assert.equal(receipt.status, "cancelled");
      assert.ok(receipt.staging); assert.equal(existsSync(receipt.staging), false);
      assert.equal(existsSync(job.output), false);
    } finally { observer.close(); }
    await host.close();
  }
});

test("manifest/API validation and crashed registry lock recovery preserve the committed registration", async t => {
  const root = directory("store"), store = new PluginStore(root);
  t.after(() => store.close());
  const manifest = path.join(bundled, "manifest.json");
  const installed = store.register(manifest);
  const incompatible = path.join(root, "bad.json");
  writeFileSync(incompatible, JSON.stringify({ ...installed, workerApi: 2 }));
  assert.throws(() => store.register(incompatible), /incompatible/);
  assert.equal(store.list()[0].sha256, installed.sha256);
  const lock = child("lock", root); t.after(() => kill(lock));
  await once(lock, "message");
  await kill(lock);
  // SQLite rollback and the kernel's released writer lock, without manual stale
  // lock deletion, heartbeat expiry or a PID-liveness guess.
  store.unregister("docling");
  assert.equal(store.list()[0].enabled, false);
  assert.equal(store.register(manifest).enabled, true);
  const db = new DatabaseSync(path.join(root, "runtime.sqlite"));
  db.prepare("UPDATE plugins SET value=? WHERE id='docling'").run(JSON.stringify({ ...installed, workerApi: 2 })); db.close();
  assert.throws(() => store.admit({ id: randomUUID(), input: "input.pdf", output: "output", startedAt: Date.now(), state: "running", progress: { phase: "checking" } }, "input"), /incompatible/,
    "admission revalidates persisted worker API compatibility");
});

test("a new owner session at the identical live PID cannot revive an interrupted request", () => {
  const root = directory("owner-identity"), first = new PluginStore(root);
  first.register(path.join(bundled, "manifest.json"));
  const job = { id: randomUUID(), input: path.join(root, "paper.pdf"), output: path.join(root, "result"), startedAt: Date.now(), state: "running" as const, progress: { phase: "checking" as const } };
  first.admit(job, "same-input");
  first.close();
  // Both Host sessions use this test process's live PID. OS PID reuse cannot
  // change the answer: only the original session's kernel lock proves ownership.
  const second = new PluginStore(root);
  try {
    const newJob = { ...job, id: randomUUID() };
    second.admit(newJob, "other-input");
    assert.equal(second.get(newJob.id)!.status, "running");
    assert.equal(second.get(job.id)!.status, "uncertain");
    assert.equal(second.admit(job, "same-input").fresh, false);
  } finally { second.close(); }
});

test("worker kill during a partial REST download and deadline leave Host alive and results private", async t => {
  const root = directory("faults"), input = path.join(root, "source.pdf");
  const otherStaging = path.join(root, ".litzio-plugin-other-request"); mkdirSync(otherStaging);
  const otherFile = path.join(otherStaging, "document.md"); writeFileSync(otherFile, "another request's retained output");
  writeFileSync(input, "%PDF-1.7\nimmutable"); const original = readFileSync(input);
  const sourceJson = fileURLToPath(new URL("../../../packages/docling/test/fixtures/synthetic/document.json", import.meta.url));
  const jsonBefore = readFileSync(sourceJson);
  const custom = path.join(root, "worker"); mkdirSync(custom);
  const pidFile = path.join(root, "worker.pid");
  writeFileSync(path.join(custom, "worker.cjs"), `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); require(${JSON.stringify(path.join(bundled, "worker.cjs"))});`);
  writeFileSync(path.join(custom, "manifest.json"), JSON.stringify({ id: "docling", version: "fault-test", workerApi: 1, entry: "worker.cjs" }));
  const access = new RootAccess([root]);
  const host = createDoclingHost(access, path.join(root, "settings.json"), { directory: path.join(root, "plugins"), manifest: path.join(custom, "manifest.json") });
  const fake = await fakeDoclingServer(); host.configure(fake.url);
  t.after(async () => { await host.close(); await fake.close(); });
  fake.mode("partial");
  const started = await host.start(input);
  const partial = await until(() => readdirSync(root, { recursive: true }).map(String).find(name => name.endsWith("response.json")), Boolean);
  const partialPath = path.join(root, partial!);
  assert.ok(readFileSync(partialPath).length > 0);
  assert.throws(() => accessPath(partialPath, access), /not published/);
  assert.throws(() => accessPath(partialPath, null), /not published/);
  const alias = path.join(root, "alias"); symlinkSync(path.dirname(partialPath), alias, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => accessPath(path.join(alias, "response.json"), null), /not published/);
  const workerPid = Number(readFileSync(pidFile, "utf8")); process.kill(workerPid, "SIGKILL");
  const failed = await until(() => host.current(), job => !!job && job.state !== "running");
  assert.equal(failed!.state, "error"); assert.equal(existsSync(started.output), false);
  assert.equal((await host.check()).ok, true, "the owning Host still answers requests");
  assert.equal(existsSync(partialPath), false);
  assert.throws(() => process.kill(workerPid, 0));
  fake.mode("pending");
  const collision = await host.start(input);
  mkdirSync(collision.output); writeFileSync(path.join(collision.output, "keep"), "user content");
  fake.mode("success");
  const refused = await until(() => host.current(), job => !!job && job.state !== "running");
  assert.equal(refused!.state, "error");
  assert.equal(readFileSync(path.join(collision.output, "keep"), "utf8"), "user content");
  const timeout = createDoclingHost(access, path.join(root, "settings.json"), { directory: path.join(root, "plugins"), manifest: path.join(custom, "manifest.json"), timeoutMs: 800 });
  t.after(() => timeout.close()); fake.mode("pending");
  const timed = await timeout.start(input);
  const result = await until(() => timeout.current(), job => !!job && job.state !== "running");
  assert.equal(result!.failure!.code, "timeout"); assert.equal(existsSync(timed.output), false);
  assert.throws(() => process.kill(Number(readFileSync(pidFile, "utf8")), 0));
  assert.equal((await timeout.check()).ok, true);
  assert.deepEqual(readFileSync(input), original); assert.deepEqual(readFileSync(sourceJson), jsonBefore);
  // Crash publication leftovers remain unreadable even if their final path is
  // inside an allowed Root. An existing user folder is never overwritten.
  const reserved = path.join(root, "reserved"); mkdirSync(reserved); writeFileSync(path.join(reserved, INCOMPLETE), "interrupted");
  writeFileSync(path.join(reserved, "document.md"), "partial");
  assert.throws(() => accessPath(path.join(reserved, "document.md"), access), /not published/);
  assert.equal(readFileSync(otherFile, "utf8"), "another request's retained output", "kill, timeout and cleanup stay within their own request's staging");
});

test("Desktop registration is used by an independent serve; UUID conflict, disable/drain and restart never replay", async t => {
  const root = directory("shared"), plugins = path.join(root, "plugins"), settings = path.join(root, "settings.json");
  const input = path.join(root, "paper.pdf"); writeFileSync(input, "%PDF-1.7\nshared");
  const workerPids = path.join(root, "worker-pids.txt"), custom = path.join(root, "worker"); mkdirSync(custom);
  writeFileSync(path.join(custom, "worker.cjs"), `require('node:fs').appendFileSync(${JSON.stringify(workerPids)}, process.pid + '\\n'); require(${JSON.stringify(path.join(bundled, "worker.cjs"))});`);
  const manifest = path.join(custom, "manifest.json");
  writeFileSync(manifest, JSON.stringify({ id: "docling", version: "shared-test", workerApi: 1, entry: "worker.cjs" }));
  writeFileSync(path.join(root, "index.html"), "<!doctype html><title>test</title>");
  const previousPlugins = process.env.LITZIO_PLUGINS_DIR, previousSettings = process.env.LITZIO_DOCLING_SETTINGS_FILE;
  process.env.LITZIO_PLUGINS_DIR = plugins; process.env.LITZIO_DOCLING_SETTINGS_FILE = settings;
  const desktop = createProtocolHandler(root, { samples: {} as any });
  if (previousPlugins === undefined) delete process.env.LITZIO_PLUGINS_DIR; else process.env.LITZIO_PLUGINS_DIR = previousPlugins;
  if (previousSettings === undefined) delete process.env.LITZIO_DOCLING_SETTINGS_FILE; else process.env.LITZIO_DOCLING_SETTINGS_FILE = previousSettings;
  const fake = await fakeDoclingServer();
  let serve: ChildProcess | undefined;
  t.after(async () => { await desktop.close(); if (serve) await kill(serve); await fake.close(); });
  const send = (endpoint: string, method = "GET", body?: unknown) => desktop(new Request(`${ORIGIN}/api/${endpoint}`, { method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) }));
  assert.equal((await send("worker-plugins", "POST", { manifest })).status, 200);
  await send("docling-settings", "PUT", { server: fake.url });
  const env = { ...process.env, LITZIO_PLUGINS_DIR: plugins, LITZIO_DOCLING_SETTINGS_FILE: settings };
  serve = child("serve", root, env);
  let { url } = (await once(serve, "message"))[0];
  const http = (endpoint: string, method = "GET", body?: unknown) => fetch(`${url}/api/${endpoint}`, { method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json", Origin: url }, body: JSON.stringify(body) }) });
  const id = randomUUID(); fake.mode("pending");
  const [a, b] = await Promise.all([send("docling-conversion", "POST", { path: input, id }), http("docling-conversion", "POST", { path: input, id })]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const first = await a.json(); assert.equal((await b.json()).output, first.output);
  await until(() => fake.submissions(), count => count === 1);
  const conflicting = path.join(root, "other.pdf"); writeFileSync(conflicting, "%PDF-1.7\nother");
  assert.equal((await http("docling-conversion", "POST", { path: conflicting, id })).status, 400);
  assert.equal((await send("worker-plugins", "DELETE", { id: "docling" })).status, 200);
  assert.equal((await send("docling-conversion", "POST", { path: input, id: randomUUID() })).status, 400);
  assert.equal((await http("docling-conversion", "POST", { path: input, id: randomUUID() })).status, 400);
  fake.mode("success");
  const complete = await until(async () => (await http(`docling-conversion?id=${id}`)).json(), job => job.state !== "running");
  assert.equal(complete.state, "success", complete.error); assert.equal(fake.submissions(), 1);
  assert.ok(existsSync(path.join(complete.output, "document.md")));
  assert.equal((await send("docling-conversion", "POST", { path: input, id })).status, 200, "an admitted UUID stays readable after disable");
  const original = readFileSync(input); writeFileSync(input, "%PDF-1.7\nchanged");
  assert.equal((await http("docling-conversion", "POST", { path: input, id })).status, 400);
  writeFileSync(input, original);
  await send("worker-plugins", "POST", { manifest });
  // Ensure this request belongs to the independent process, then kill the Host.
  fake.mode("pending"); const interrupted = randomUUID();
  assert.equal((await http("docling-conversion", "POST", { path: input, id: interrupted })).status, 200);
  await until(() => fake.submissions(), count => count === 2);
  const interruptedWorker = Number(readFileSync(workerPids, "utf8").trim().split("\n").at(-1));
  await kill(serve);
  await until(() => { try { process.kill(interruptedWorker, 0); return false; } catch { return true; } }, Boolean);
  serve = child("serve", root, env); ({ url } = (await once(serve, "message"))[0]);
  const receipt = await (await http(`docling-conversion?id=${interrupted}`)).json();
  assert.equal(receipt.state, "error"); assert.match(receipt.error, /uncertain/);
  assert.equal((await http("docling-conversion", "POST", { path: input, id: interrupted })).status, 200);
  assert.equal(fake.submissions(), 2, "restart and replay do not submit to the external service");
  const store = new PluginStore(plugins);
  try {
    const retained = store.get(interrupted)!;
    assert.equal(retained.status, "uncertain");
    assert.ok(retained.staging); assert.equal(existsSync(retained.staging), true, "restart retains only this request's recorded staging for inspection");
    assert.throws(() => accessPath(retained.staging!, null), /not published/);
  } finally { store.close(); }
});
