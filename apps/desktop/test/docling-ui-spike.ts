// Branch-only measurement entry: pnpm browser:test docling-ui. No packaged app, Edge or install.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { _electron, chromium, expect, type BrowserContext, type ElectronApplication, type Page } from "@playwright/test";
import { openPath, waitForEditorFocus } from "../../editor/test/browser/navigation.ts";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const scratch = path.join(repo, "tmp/docling-ui-spike"); mkdirSync(scratch, { recursive: true });
const runRoot = mkdtempSync(path.join(scratch, "run-"));
const require = createRequire(import.meta.url);
const hash = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const bundle = path.join(repo, "tmp/docling-module");
assert.ok(existsSync(path.join(bundle, "ui.mjs")), "Build the module first.");
const manifest = JSON.parse(readFileSync(path.join(bundle, "manifest.json"), "utf8"));
const fixture = path.join(repo, "packages/docling/test/fixtures/synthetic");
const comparisonFolder = path.join(runRoot, "comparison"); cpSync(fixture, comparisonFolder, { recursive: true });
const documentFile = path.join(runRoot, "ordinary.md");
writeFileSync(documentFile, "---\nieumdoc: 1\n---\n\nOrdinary document survives plugin changes.\n");
const sourcesBefore = { json: hash(path.join(fixture, "document.json")), pdf: hash(path.join(fixture, "source.pdf")) };
const evidence: Record<string, any> = { startedAt: new Date().toISOString(), platform: process.platform, node: process.version,
  base: "3d4cb6e139313ab458f841f5c1514dadc3e21470", scope: "UI only; real development Electron, built serve, Vite; committed synthetic comparison, no REST conversion",
  hosts: [], boundary: {}, checks: {}, ownedPids: [], attempts: runRoot };

// Metafile verifies the transitive runtime graph; source scan additionally includes the type contract.
const meta = JSON.parse(readFileSync(path.join(bundle, "ui-metafile.json"), "utf8"));
const inputs = Object.keys(meta.inputs) as string[];
const external = [...new Set(Object.values(meta.inputs).flatMap((input: any) => input.imports.filter((entry: any) => entry.external).map((entry: any) => entry.path)))];
assert.ok(inputs.every(input => !/(?:apps\/editor|@tiptap|prosemirror|node_modules)/u.test(input.replaceAll("\\", "/"))));
assert.deepEqual(external.sort(), ["react", "react/jsx-runtime"]);
for (const input of [...inputs, "packages/docling/src/ui-plugin-api.ts"]) {
  assert.doesNotMatch(readFileSync(path.join(repo, input), "utf8"), /(?:from\s*|import\s*\(|require\s*\()["'][^"']*(?:apps\/editor|@tiptap|prosemirror)/u);
}
evidence.boundary = { inputs, external, scriptBytes: readFileSync(path.join(bundle, "ui.mjs")).length,
  styleBytes: readFileSync(path.join(bundle, "ui.css")).length, sha256: hash(path.join(bundle, "ui.mjs")), secondReactBundled: false };

function variant(name: string, code: string, apiVersion = 1) {
  const directory = path.join(runRoot, name); mkdirSync(directory);
  cpSync(path.join(bundle, "worker.cjs"), path.join(directory, "worker.cjs"));
  cpSync(path.join(bundle, "ui.css"), path.join(directory, "ui.css"));
  writeFileSync(path.join(directory, "ui.mjs"), code);
  writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({ ...manifest, ui: { ...manifest.ui, hostApiVersion: apiVersion } }));
  return path.join(directory, "manifest.json");
}
const goodCode = readFileSync(path.join(bundle, "ui.mjs"), "utf8");
const goodManifest = variant("good", goodCode);
const renderFault = variant("render-fault", goodCode.replace("return module.exports.activate(host);",
  'const contribution = module.exports.activate(host); contribution.tab.View = () => { throw new Error("injected render fault"); }; return contribution;'));
const importFault = variant("import-fault", 'throw new Error("injected import fault"); export function activate() {}\n');
const wrongApi = variant("wrong-api", 'throw new Error("API mismatch bundle MUST NOT execute"); export function activate() {}\n', 2);
const environment = { ...process.env, IEUMDOC_MODULE_RUNTIME: "1", IEUMDOC_MODULES_DIR: path.join(runRoot, "modules"),
  IEUMDOC_DOCLING_SETTINGS_FILE: path.join(runRoot, "settings.json") } as Record<string, string>;
delete environment.ELECTRON_RUN_AS_NODE;
const children: ChildProcess[] = [];
let desktop: ElectronApplication | undefined, context: BrowserContext | undefined;
const eventually = async <T>(read: () => T | Promise<T>, accepts: (value: T) => boolean, timeout = 20_000): Promise<T> => {
  const start = Date.now();
  for (;;) { const value = await read(); if (accepts(value)) return value; if (Date.now() - start > timeout) throw new Error("Observation deadline: " + JSON.stringify(value)); await delay(25); }
};
async function startNode(args: string[], cwd: string, ready: RegExp, name: string) {
  const child = spawn(process.execPath, args, { cwd, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child); evidence.ownedPids.push(child.pid);
  let log = ""; const record = (chunk: Buffer) => { log += chunk; writeFileSync(path.join(runRoot, `${name}.log`), log); };
  child.stdout!.on("data", record); child.stderr!.on("data", record);
  await eventually(() => { if (child.exitCode !== null) throw new Error(log); return log; }, text => ready.test(text));
  return child;
}
const send = (page: Page, endpoint: string, body?: unknown) => page.evaluate(async ({ endpoint, body }) => {
  const response = await fetch(endpoint, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  return { status: response.status, body: await response.json() };
}, { endpoint, body });
async function commandCenter(page: Page) {
  await page.getByRole("button", { name: /Find documents and commands/ }).click();
  await page.getByRole("combobox").fill("> Docling comparison");
}
async function exercise(page: Page, host: string, openFile: boolean) {
  page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(15_000);
  const record: Record<string, any> = { host, measurements: {}, checks: {} }; evidence.hosts.push(record);
  const errors: string[] = [], assets: string[] = [];
  let navigations = 0;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => { if (request.url().includes("api/docling-module-ui?") && request.url().includes("asset=script")) assets.push(request.url()); });
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
  if (openFile) await openPath(page, documentFile);
  const stage = page.locator(".document-stage");
  await expect(stage).toHaveAttribute("data-plugin-ui-state", "disabled");
  const originTime = await page.evaluate(() => performance.timeOrigin);
  const editor = page.locator('[data-document-tab][data-active="true"] .tiptap[contenteditable="true"]').first();
  await editor.click(); await waitForEditorFocus(page); await page.keyboard.press("Control+End"); await page.keyboard.type(` Retained ${host}.`);
  let ordinaryText = await editor.textContent();
  const editorHandle = await editor.elementHandle(); assert.ok(editorHandle);
  const ordinaryTab = page.locator('[role="tab"][aria-selected="true"][aria-controls^="panel-"]');
  const ordinaryId = await ordinaryTab.getAttribute("id"); assert.ok(ordinaryId);
  await commandCenter(page);
  await expect(page.getByRole("option", { name: "Docling comparison", exact: true })).toHaveCount(0);
  const started = Date.now();
  const registered = await send(page, "/api/docling-module", { action: "register", manifest: goodManifest });
  assert.equal(registered.status, 200, JSON.stringify(registered));
  assert.ok(registered.body.directory.startsWith(environment.IEUMDOC_MODULES_DIR));
  await expect(stage).toHaveAttribute("data-plugin-ui-state", "ready");
  record.measurements.registrationToReadyMs = Date.now() - started;
  record.measurements.importCssActivateMs = Number(await stage.getAttribute("data-plugin-ui-load-ms"));
  const descriptor = await send(page, "/api/docling-module-ui");
  const response = await page.evaluate(async revision => {
    const response = await fetch(`/api/docling-module-ui?asset=script&revision=${revision}`);
    return { status: response.status, mime: response.headers.get("content-type"), csp: response.headers.get("content-security-policy"), cache: response.headers.get("cache-control") };
  }, descriptor.body.revision);
  assert.equal(response.status, 200); assert.match(response.mime!, /javascript/);
  if (host !== "Vite") assert.match(response.csp!, /script-src 'self'/u);
  record.assetResponse = response;
  await page.getByRole("option", { name: "Docling comparison", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Docling comparison", exact: true });
  await expect(picker).toBeVisible();
  await picker.getByTestId("folder-path").fill(comparisonFolder);
  await picker.getByTestId("folder-open").click(); await expect(picker).toBeHidden();
  const tab = page.locator(".docling-tab[data-active=true]");
  await expect(tab.locator(".docling-source img").first()).toBeVisible();
  await expect(tab.locator(".docling-wires path").first()).toBeAttached();
  await expect(tab.getByTestId("comparison-document")).toBeVisible();
  const comparisonId = await tab.getAttribute("id");
  const readingContent = await tab.getByTestId("comparison-document").textContent();
  const region = tab.locator(".docling-region").first(); await region.click(); await expect(region).toHaveAttribute("aria-pressed", "true");
  await expect(tab.locator(".tiptap")).toHaveAttribute("contenteditable", "false");
  record.checks.a = "Native ESM + installed CSS, live command opens picker and contributed read-only view; image, region, wires and Editor reading surface work.";
  await page.screenshot({ path: path.join(runRoot, `${host}-ready.png`) });
  await commandCenter(page);
  const disableAt = Date.now();
  assert.equal((await send(page, "/api/docling-module", { action: "disable" })).status, 200);
  await expect(stage).toHaveAttribute("data-plugin-ui-state", "disabled");
  await expect(page.getByRole("option", { name: "Docling comparison", exact: true })).toHaveCount(0);
  record.measurements.disableToDetachedMs = Date.now() - disableAt;
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(tab.locator('[data-plugin-state="disabled"]')).toBeVisible();
  assert.equal(await tab.getAttribute("id"), comparisonId);
  assert.equal(await tab.locator(".docling-compare").count(), 0);
  assert.equal(await page.locator('link[href*="api/docling-module-ui"]').count(), 0);
  await page.screenshot({ path: path.join(runRoot, `${host}-disabled.png`) });
  const restoreAt = Date.now();
  assert.equal((await send(page, "/api/docling-module", { action: "register", manifest: goodManifest })).status, 200);
  await expect(stage).toHaveAttribute("data-plugin-ui-state", "ready");
  await expect(tab.getByTestId("comparison-document")).toBeVisible();
  assert.equal(await tab.getAttribute("id"), comparisonId);
  assert.equal(await tab.getByTestId("comparison-document").textContent(), readingContent);
  record.measurements.reregisterToViewMs = Date.now() - restoreAt;
  record.checks.b = "Register, disable and register again update an already-open command center and restore the same tab, without navigation.";
  record.checks.f = "Disabled tab keeps id/path/snapshot, unmounts plugin/reading surface and removes CSS. Registration restores read-only content; transient selection/scroll reset.";

  async function ordinaryStillWorks(suffix: string) {
    await page.locator(`[id="${ordinaryId}"]`).click();
    assert.equal(await editorHandle!.evaluate(element => element === document.querySelector('[data-document-tab][data-active="true"] .tiptap[contenteditable="true"]')), true, "Ordinary Editor DOM must stay mounted");
    assert.equal(await editor.textContent(), ordinaryText, "Unsaved ordinary content survives module changes exactly");
    await editor.click(); await waitForEditorFocus(page); await page.keyboard.press("Control+End"); await page.keyboard.type(` ${suffix}.`);
    const next = await editor.textContent(); assert.ok(next?.includes(suffix));
    assert.equal(next!.replace(` ${suffix}.`, ""), ordinaryText, "Typing inserts text without losing existing content");
    ordinaryText = next;
    await page.locator(`[aria-controls="${comparisonId}"]`).click();
  }
  assert.equal((await send(page, "/api/docling-module", { action: "register", manifest: renderFault })).status, 200);
  await expect(tab.getByRole("alert")).toContainText("injected render fault");
  await ordinaryStillWorks("After render exception");
  await page.screenshot({ path: path.join(runRoot, `${host}-render-error.png`) });
  assert.equal((await send(page, "/api/docling-module", { action: "register", manifest: importFault })).status, 200);
  await expect(stage).toHaveAttribute("data-plugin-ui-state", "error");
  await expect(tab.locator('[data-plugin-state="error"]')).toContainText("injected import fault");
  await ordinaryStillWorks("After import exception");
  const missing = await send(page, "/api/docling-module", { action: "register", manifest: goodManifest }); assert.equal(missing.status, 200);
  // Delete this newly installed asset before the next descriptor poll: actual Host read failure.
  rmSync(path.join(missing.body.directory, "ui.mjs"));
  await expect(tab.locator('[data-plugin-state="error"]')).toContainText(/Failed to fetch|Importing a module|module script|dynamically imported/iu);
  await ordinaryStillWorks("After missing bundle");
  record.checks.c = "Render throw, module evaluation throw and missing installed ESM isolate locally; original ordinary Editor DOM, unsaved text and typing survive each.";
  const beforeMismatch = assets.length;
  assert.equal((await send(page, "/api/docling-module", { action: "register", manifest: wrongApi })).status, 200);
  await expect(tab.locator('[data-plugin-state="error"]')).toContainText("UI Host API 2 is incompatible; expected 1.");
  assert.equal(assets.length, beforeMismatch, "Incompatible bundle must never be requested");
  await commandCenter(page); await expect(page.getByRole("option", { name: "Docling comparison", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
  await ordinaryStillWorks("After API refusal");
  record.checks.d = "UI API 2 reason displayed; no script request or poison-code execution; command absent, Editor usable.";
  assert.equal((await send(page, "/api/docling-module", { action: "register", manifest: goodManifest })).status, 200);
  await expect(stage).toHaveAttribute("data-plugin-ui-state", "ready");
  await expect(tab.getByTestId("comparison-document")).toBeVisible();
  await ordinaryStillWorks("After recovery");
  assert.equal(await page.evaluate(() => performance.timeOrigin), originTime); assert.equal(navigations, 0);
  assert.ok(errors.every(error => error.includes("injected render fault")), JSON.stringify(errors));
  record.pageErrors = errors; record.scriptRequests = assets.length; record.mainFrameNavigations = navigations;
  record.checks.e = page.url();
  await send(page, "/api/docling-module", { action: "disable" });
  await expect(stage).toHaveAttribute("data-plugin-ui-state", "disabled");
}

try {
  const startup = Date.now();
  desktop = await _electron.launch({ executablePath: require("electron") as string,
    args: [path.join(repo, "apps/desktop/build/app"), `--user-data-dir=${path.join(scratch, "desktop-profile")}`, documentFile],
    cwd: repo, env: environment, timeout: 30_000 });
  evidence.ownedPids.push(desktop.process().pid!, await desktop.evaluate(() => process.pid));
  const desktopPage = await desktop.firstWindow(); desktopPage.setDefaultTimeout(15_000);
  await desktopPage.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" });
  // Fixed profile retained; only preferences and this origin's test recovery are reset.
  await desktopPage.evaluate(() => { localStorage.clear(); localStorage.setItem("ieumdoc.uiLanguage", "en"); sessionStorage.clear(); indexedDB.deleteDatabase("ieumdoc-recovery"); });
  await desktopPage.reload();
  await desktopPage.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" });
  evidence.desktopStartupWithIsolationReloadMs = Date.now() - startup;
  await exercise(desktopPage, "Desktop", false);

  await startNode([path.join(repo, "packages/cli/dist/cli.mjs"), "serve", "--port", "5284", "--root", runRoot], repo, /IeumDoc HTTP:/u, "serve");
  const profile = path.join(os.tmpdir(), "ieumdoc-browser-profile", createHash("sha256").update(repo).digest("hex").slice(0, 16));
  evidence.chromeProfile = profile;
  context = await chromium.launchPersistentContext(profile, { channel: "chrome", headless: true, viewport: { width: 1440, height: 900 },
    locale: "en-US", extraHTTPHeaders: { Connection: "close" } });
  const browser = await context.browser()!.newBrowserCDPSession();
  const processInfo = await browser.send("SystemInfo.getProcessInfo");
  evidence.ownedPids.push(...processInfo.processInfo.filter((entry: any) => entry.type === "browser").map((entry: any) => entry.id));
  await browser.detach();
  async function isolatedPage(url: string) {
    const page = await context!.newPage();
    await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html>" }), { times: 1 });
    await page.goto(url); await page.evaluate(() => new Promise<void>((resolve, reject) => {
      localStorage.clear(); localStorage.setItem("ieumdoc.uiLanguage", "en"); sessionStorage.clear(); const request = indexedDB.deleteDatabase("ieumdoc-recovery"); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
    }));
    await page.goto(url); await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" }); return page;
  }
  const httpPage = await isolatedPage("http://127.0.0.1:5284"); await exercise(httpPage, "serve", true); await httpPage.close();
  const editorRequire = createRequire(path.join(repo, "apps/editor/package.json"));
  const vite = path.join(path.dirname(editorRequire.resolve("vite/package.json")), "bin/vite.js");
  await startNode([vite, "--port", "5283", "--strictPort"], path.join(repo, "apps/editor"), /127\.0\.0\.1:5283/u, "vite");
  const vitePage = await isolatedPage("http://127.0.0.1:5283"); await exercise(vitePage, "Vite", true); await vitePage.close();
  evidence.sourceHashes = { before: sourcesBefore, after: { json: hash(path.join(fixture, "document.json")), pdf: hash(path.join(fixture, "source.pdf")) } };
  assert.deepEqual(evidence.sourceHashes.before, evidence.sourceHashes.after);
  for (const condition of ["a", "b", "c", "d", "e", "f"]) evidence.checks[condition] = "pass in all three Hosts";
  evidence.checks.g = "pass: esbuild transitive graph + type contract source boundary; React supplied through API, no second instance";
  evidence.result = "pass";
} catch (error) {
  evidence.result = "fail"; evidence.error = error instanceof Error ? error.stack : String(error); process.exitCode = 1;
  for (const [index, page] of [...(desktop?.windows() ?? []), ...(context?.pages() ?? [])].entries()) {
    await page.screenshot({ path: path.join(runRoot, `failure-${index}.png`) }).catch(() => {});
    await page.locator("body").ariaSnapshot().then(snapshot => writeFileSync(path.join(runRoot, `failure-${index}.txt`), snapshot)).catch(() => {});
  }
} finally {
  await context?.close().catch(error => { evidence.chromeCleanupError = String(error); });
  await desktop?.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await desktop?.close().catch(error => { evidence.desktopCleanupError = String(error); });
  for (const child of children.reverse()) {
    if (child.exitCode === null) { const ended = new Promise<void>(resolve => child.once("exit", () => resolve())); child.kill(); await ended; }
  }
  await delay(200);
  evidence.cleanupAlive = [...new Set(evidence.ownedPids as number[])].filter(pid => { try { process.kill(pid, 0); return true; } catch { return false; } });
  evidence.finishedAt = new Date().toISOString();
  writeFileSync(path.join(runRoot, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  writeFileSync(path.join(scratch, "evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
  assert.deepEqual(evidence.cleanupAlive, [], "Every owned Host/browser process must exit.");
}
