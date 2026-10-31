// Explicit branch-only experiment: pnpm browser:test docling-runtime
// Uses development Electron, the built CLI serve command and the existing converter.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { _electron, type ElectronApplication } from "@playwright/test";
import { fakeDoclingServer } from "../../editor/test/helpers/docling-server.ts";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const userModules = path.join(os.homedir(), ".ieumdoc", "modules");
const scratch = path.join(repo, "tmp", "docling-runtime-spike");
mkdirSync(scratch, { recursive: true });
const runRoot = mkdtempSync(path.join(scratch, "run-"));
const evidence: Record<string, any> = { startedAt: new Date().toISOString(), platform: process.platform,
  node: process.version, scope: "development Electron + built CLI; fake REST, real worker/converter/Core", measurements: [], checks: {} };
const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const source = path.join(repo, "packages/docling/test/fixtures/synthetic");
const before = { pdf: hash(path.join(source, "source.pdf")), json: hash(path.join(source, "document.json")) };
const pdf = path.join(runRoot, "source.pdf"), document = path.join(runRoot, "editor.md");
cpSync(path.join(source, "source.pdf"), pdf);
writeFileSync(document, "---\nieumdoc: 1\n---\n\nBefore runtime spike.\n");
const manifest = path.join(repo, "tmp/docling-module/manifest.json");
assert.ok(existsSync(manifest), "Build the worker first: pnpm exec tsx scripts/build-docling-module.ts");
const originalRegistry = existsSync(path.join(userModules, "registry.json")) ? readFileSync(path.join(userModules, "registry.json"), "utf8") : undefined;
if (originalRegistry) {
  const previous = JSON.parse(originalRegistry);
  assert.ok(!previous.enabled && previous.manifest.version === "0.0.0-spike" && previous.sha256 === hash(path.join(path.dirname(manifest), "worker.cjs")),
    "Only an empty registry or the disabled identical worker from this experiment can be reused.");
}
const fake = await fakeDoclingServer();
const environment: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), IEUMDOC_MODULE_RUNTIME: "1", IEUMDOC_MODULES_DIR: userModules,
  IEUMDOC_MODULE_TIMEOUT_MS: "15000", IEUMDOC_DOCLING_SETTINGS_FILE: path.join(runRoot, "settings.json") };
delete environment.ELECTRON_RUN_AS_NODE;
let desktop: ElectronApplication | undefined, serve: ChildProcess | undefined;
const ownedPids: number[] = [];
const workerPids = new Set<number>();
const require = createRequire(import.meta.url);
const electronPath = require("electron") as string;
type Reply = { status: number; body: any };
type Send = (endpoint: string, method?: string, body?: unknown) => Promise<Reply>;
const eventually = async <T>(read: () => T | Promise<T>, accepts: (value: T) => boolean, timeout = 20_000): Promise<T> => {
  const start = Date.now();
  for (;;) { const value = await read(); if (accepts(value)) return value; if (Date.now() - start > timeout) throw new Error("Observation deadline exceeded: " + JSON.stringify(value)); await delay(20); }
};
const awaitJob = (send: Send, id: string) => eventually(async () => (await send(`/api/docling-conversion?id=${id}`)).body, job => job?.state && job.state !== "running");
async function startServe(timeout = "15000") {
  const child = spawn(process.execPath, [path.join(repo, "packages/cli/dist/cli.mjs"), "serve", "--port", "5283", "--root", runRoot, "--root", path.dirname(manifest)],
    { cwd: repo, windowsHide: true, env: { ...environment, IEUMDOC_MODULE_TIMEOUT_MS: timeout }, stdio: ["ignore", "pipe", "pipe"] });
  ownedPids.push(child.pid!); serve = child;
  let output = ""; child.stdout!.on("data", chunk => { output += chunk; }); child.stderr!.on("data", chunk => { output += chunk; });
  await eventually(() => { if (child.exitCode !== null) throw new Error(output); return output; }, text => text.includes("IeumDoc HTTP:"));
  return (async (endpoint: string, method = "GET", body?: unknown): Promise<Reply> => {
    const response = await fetch(`http://127.0.0.1:5283${endpoint}`, { method, headers: { Origin: "http://127.0.0.1:5283", ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text(); return { status: response.status, body: text ? JSON.parse(text) : null };
  }) satisfies Send;
}
async function stopServe() {
  if (!serve || serve.exitCode !== null) return;
  const child = serve;
  const stopped = new Promise<void>(resolve => child.once("exit", () => resolve()));
  child.kill(); await stopped; serve = undefined;
}
async function runSuccess(send: Send, host: string) {
  fake.mode("success");
  const id = randomUUID(), accepted = await send("/api/docling-conversion", "POST", { path: pdf, id });
  assert.equal(accepted.status, 200, JSON.stringify(accepted));
  workerPids.add(accepted.body.workerPid);
  const run = await awaitJob(send, id);
  assert.equal(run.state, "success", JSON.stringify(run));
  const comparison = await send(`/api/docling-compare?${new URLSearchParams({ path: path.join(run.output, "document.md") })}`);
  assert.equal(comparison.status, 200); assert.equal(comparison.body.stale, false);
  assert.ok(readFileSync(path.join(run.output, "document.md"), "utf8").includes("Converted PDF content."));
  evidence.measurements.push({ host, id, readyMs: run.readyMs, elapsedMs: run.elapsedMs, workerPid: run.workerPid });
  return run;
}
function findPartial(stage: string): string | undefined {
  if (!existsSync(stage)) return;
  for (const name of readdirSync(stage, { recursive: true, encoding: "utf8" })) {
    const candidate = path.join(stage, name);
    try { if (name.endsWith("response.json") && statSync(candidate).size > 0) return candidate; } catch { /* Worker can still be creating it. */ }
  }
}
try {
  const desktopStarted = Date.now();
  desktop = await _electron.launch({ executablePath: electronPath,
    args: [path.join(repo, "apps/desktop/build/app"), `--user-data-dir=${path.join(scratch, "desktop-profile")}`, document],
    cwd: repo, env: environment, timeout: 30_000 });
  ownedPids.push(desktop.process().pid!);
  const mainPid = await desktop.evaluate(() => process.pid); ownedPids.push(mainPid);
  const page = await desktop.firstWindow();
  page.setDefaultTimeout(15_000);
  await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" });
  evidence.desktopReadyMs = Date.now() - desktopStarted;
  assert.match(page.url(), /^ieumdoc:\/\/app\//u);
  const sendDesktop: Send = (endpoint, method = "GET", body) => page.evaluate(async ({ endpoint, method, body }) => {
    const response = await fetch(endpoint, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const text = await response.text(); return { status: response.status, body: text ? JSON.parse(text) : null };
  }, { endpoint, method, body });
  assert.ok(!(await sendDesktop("/api/docling-module")).body?.enabled);
  assert.equal((await sendDesktop("/api/docling-module", "POST", { action: "register", manifest })).status, 200);
  assert.equal((await sendDesktop("/api/docling-settings", "PUT", { server: fake.url })).status, 200);
  const desktopRun = await runSuccess(sendDesktop, "Desktop in-process");
  evidence.checks.a = { result: "pass", evidence: "Development Desktop worker performed full REST→Core conversion and shared comparison read (synthetic service, no real OCR)." };

  let sendHttp = await startServe();
  const registry = await sendHttp("/api/docling-module");
  assert.equal(registry.body.enabled, true);
  assert.ok(registry.body.directory.startsWith(userModules));
  const httpRun = await runSuccess(sendHttp, "CLI serve");
  evidence.checks.h = { result: "pass", evidence: "Desktop registered in default ~/.ieumdoc/modules; independently started built ieumdoc serve read that registration and converted without registering." };

  // The ledger is shared even while both Hosts are alive; repeats never submit.
  const count = fake.submissions();
  const duplicates = await Promise.all([sendDesktop("/api/docling-conversion", "POST", { path: pdf, id: httpRun.id }), sendHttp("/api/docling-conversion", "POST", { path: pdf, id: httpRun.id })]);
  duplicates.forEach(reply => { assert.equal(reply.status, 200); assert.equal(reply.body.id, httpRun.id); });
  assert.equal(fake.submissions(), count);
  const otherPdf = path.join(runRoot, "other.pdf"); cpSync(pdf, otherPdf);
  assert.notEqual((await sendHttp("/api/docling-conversion", "POST", { path: otherPdf, id: httpRun.id })).status, 200);
  fake.mode("pending");
  const contestedId = randomUUID(), beforeContested = fake.submissions();
  const contested = await Promise.all([sendDesktop("/api/docling-conversion", "POST", { path: pdf, id: contestedId }), sendHttp("/api/docling-conversion", "POST", { path: pdf, id: contestedId })]);
  const admitted = contested.find(reply => reply.status === 200)!; assert.ok(admitted); workerPids.add(admitted.body.workerPid);
  const owner = admitted.body.ownerPid === mainPid ? sendDesktop : sendHttp;
  await eventually(() => fake.submissions(), total => total === beforeContested + 1);
  assert.equal((await owner(`/api/docling-conversion?id=${contestedId}`)).body.state, "running");
  await owner("/api/docling-conversion", "DELETE", { id: contestedId });
  assert.equal(fake.submissions(), beforeContested + 1);
  evidence.checks.e = { result: "pass", evidence: "Same UUID submitted concurrently through both live Hosts returned one run; external submission count did not increase." };

  for (const [host, send] of [["Desktop", sendDesktop], ["HTTP", sendHttp]] as const) {
    fake.mode("download-pending");
    const id = randomUUID(), accepted = await send("/api/docling-conversion", "POST", { path: pdf, id });
    assert.equal(accepted.status, 200, JSON.stringify(accepted)); workerPids.add(accepted.body.workerPid);
    const partial = await eventually(() => findPartial(accepted.body.stage), Boolean);
    const partialBytes = statSync(partial!).size;
    assert.equal(existsSync(accepted.body.output), false);
    const privateRead = await send(`/api/file-preview?${new URLSearchParams({ root: accepted.body.stage, path: partial! })}`);
    assert.equal(privateRead.status, 403);
    process.kill(accepted.body.workerPid, "SIGKILL");
    const killed = await awaitJob(send, id);
    assert.equal(killed.state, "error"); assert.equal(existsSync(killed.output), false); assert.equal(existsSync(killed.stage), false);
    assert.equal((await send("/api/docling-settings")).status, 200);
    evidence.measurements.push({ host, injection: "kill during partial REST download", elapsedMs: killed.elapsedMs, partialBytes });
    if (host === "Desktop") {
      const editor = page.locator('.tiptap[contenteditable="true"]').first();
      await editor.click(); await page.keyboard.press("Control+End"); await page.keyboard.type(" Editor survived worker death.");
      assert.match(await editor.textContent() ?? "", /Editor survived worker death/u);
    }
  }
  evidence.checks.d = { result: "pass", evidence: "Killed real converter in both Hosts after response.json had nonempty partial bytes. Final folder absent, staging route returned 403, staging removed after worker exit." };

  // Disable drains accepted requests; both transports reread disk for new IDs.
  fake.mode("pending");
  const draining = await sendDesktop("/api/docling-conversion", "POST", { path: pdf, id: randomUUID() });
  workerPids.add(draining.body.workerPid);
  await eventually(async () => (await sendDesktop(`/api/docling-conversion?id=${draining.body.id}`)).body, run => !!run.progress.taskId);
  await sendDesktop("/api/docling-module", "POST", { action: "disable" });
  assert.notEqual((await sendDesktop("/api/docling-conversion", "POST", { path: pdf, id: randomUUID() })).status, 200);
  assert.notEqual((await sendHttp("/api/docling-conversion", "POST", { path: pdf, id: randomUUID() })).status, 200);
  fake.mode("success"); assert.equal((await awaitJob(sendDesktop, draining.body.id)).state, "success");
  await sendDesktop("/api/docling-module", "POST", { action: "enable" });
  evidence.checks.f = { result: "pass", evidence: "Desktop disabled the shared registration. New UUIDs refused by both live Hosts; already accepted Desktop conversion drained to success." };

  // Give Desktop a short deadline without rebuilding or changing the shared registry.
  await desktop.evaluate(async () => { process.env.IEUMDOC_MODULE_TIMEOUT_MS = "350"; });
  fake.mode("pending");
  const timedDesktop = await sendDesktop("/api/docling-conversion", "POST", { path: pdf, id: randomUUID() });
  workerPids.add(timedDesktop.body.workerPid);
  const timeoutDesktop = await awaitJob(sendDesktop, timedDesktop.body.id);
  assert.equal(timeoutDesktop.failure.code, "timeout"); assert.equal(existsSync(timeoutDesktop.output), false);
  const editor = page.locator('.tiptap[contenteditable="true"]').first();
  await editor.click(); await page.keyboard.type(" Timeout survived.");
  assert.match(await editor.textContent() ?? "", /Timeout survived/u);
  await desktop.evaluate(async () => { process.env.IEUMDOC_MODULE_TIMEOUT_MS = "15000"; });
  await stopServe(); sendHttp = await startServe("350");
  const timedHttp = await sendHttp("/api/docling-conversion", "POST", { path: pdf, id: randomUUID() });
  workerPids.add(timedHttp.body.workerPid);
  const timeoutHttp = await awaitJob(sendHttp, timedHttp.body.id);
  assert.equal(timeoutHttp.failure.code, "timeout"); assert.equal(existsSync(timeoutHttp.output), false);
  assert.equal((await sendHttp("/api/docling-settings")).status, 200);
  evidence.measurements.push({ host: "Desktop", injection: "350ms deadline", elapsedMs: timeoutDesktop.elapsedMs }, { host: "HTTP", injection: "350ms deadline", elapsedMs: timeoutHttp.elapsedMs });
  evidence.checks.b = { result: "pass", evidence: "Force-kill and 350ms deadline left both Hosts responding; actual Desktop contenteditable accepted text after both failures." };
  await stopServe(); sendHttp = await startServe();

  // Real Host process termination/restart, not a newly allocated class in one PID.
  fake.mode("pending");
  const interrupted = await sendHttp("/api/docling-conversion", "POST", { path: pdf, id: randomUUID() });
  workerPids.add(interrupted.body.workerPid);
  await eventually(async () => (await sendHttp(`/api/docling-conversion?id=${interrupted.body.id}`)).body, run => !!run.progress.taskId);
  const submissionsBeforeRestart = fake.submissions();
  await stopServe(); sendHttp = await startServe();
  const uncertain = await sendHttp(`/api/docling-conversion?id=${interrupted.body.id}`);
  assert.equal(uncertain.body.state, "uncertain");
  const repeated = await sendHttp("/api/docling-conversion", "POST", { path: pdf, id: interrupted.body.id });
  assert.equal(repeated.body.state, "uncertain"); assert.equal(fake.submissions(), submissionsBeforeRestart);
  evidence.restart = { state: uncertain.body.state, noReplay: true, requestId: interrupted.body.id };
  evidence.checks.g = { result: "pass", evidence: "Real development Electron at ieumdoc://app and independently spawned built cli.mjs serve both converted, isolated kills/timeouts and read comparison; HTTP restart retained uncertain without replay." };
  assert.equal(hash(pdf), before.pdf); assert.deepEqual({ pdf: hash(path.join(source, "source.pdf")), json: hash(path.join(source, "document.json")) }, before);
  evidence.checks.c = { result: "pass", evidence: "SHA-256 of input PDF and committed source PDF/JSON unchanged after the combined scenarios.", sha256: before };
  evidence.success = true;
} catch (error) {
  evidence.success = false; evidence.error = error instanceof Error ? error.stack : String(error);
  throw error;
} finally {
  writeFileSync(path.join(runRoot, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  // This test deliberately leaves an unsaved scratch edit. Exit this owned test app
  // directly rather than waiting indefinitely on its work-loss confirmation.
  await desktop?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await desktop?.close().catch(error => { evidence.desktopCleanupError = String(error); });
  await stopServe(); await fake.close();
  // Preserve the explicit disabled installation and receipts for review; do not delete user state.
  const registryFile = path.join(userModules, "registry.json");
  if (existsSync(registryFile)) {
    const registry = JSON.parse(readFileSync(registryFile, "utf8")); registry.enabled = false;
    writeFileSync(registryFile, JSON.stringify(registry, null, 2) + "\n");
  }
  await delay(200);
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  evidence.cleanup = { ownedPids, workerPids: [...workerPids], alive: [...ownedPids, ...workerPids].filter(alive) };
  evidence.finishedAt = new Date().toISOString();
  writeFileSync(path.join(runRoot, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  writeFileSync(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
  assert.deepEqual(evidence.cleanup.alive, [], "All experiment-owned processes must exit.");
}
