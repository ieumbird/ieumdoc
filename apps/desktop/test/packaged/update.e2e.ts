// Install and update for real on Windows: two test builds whose update host is a local stand-in for
// GitHub Releases, the per-user NSIS installer run silently, and the update the user asks for in
// Settings: download, the Editor refusing the restart with unsaved work, then installing after Save
// and starting the new version. Nothing is published; only the update host differs from a release.
//   pnpm --filter @ieumdoc/desktop test:update
//   IEUMDOC_TEST_UPDATE_CHANNEL=beta pnpm --filter @ieumdoc/desktop test:update
// It installs IeumDoc for the current user and uninstalls it afterwards. It refuses to run if
// IeumDoc is already installed or has user data on this machine.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { _electron as electron } from "@playwright/test";
import { RELEASE_REPOSITORY } from "../../src/update-policy.ts";
import { readUpdateInfo } from "../../scripts/verify-release.ts";
import { readPreferences, writePreferences } from "../../src/preferences.ts";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repo = path.resolve(desktop, "../..");
const work = path.join(repo, "tmp", "desktop-update");
const HOST = "127.0.0.1:47320";
const LIVE = process.argv.includes("--github");
const BETA = LIVE || process.env.IEUMDOC_TEST_UPDATE_CHANNEL === "beta";
const [OLD, NEW] = BETA ? ["0.0.1-beta.4", "0.1.0-beta.1"] : ["0.0.1", "0.0.2"];
// The public beta.3 predates native documents (#232) and edits leading frontmatter as a body block.
const NATIVE_PREFIX = LIVE && OLD === "0.0.1-beta.3" ? "" : "---\nieumdoc: 1\n---\n\n";
const CHANNEL_FILE = BETA ? "beta.yml" : "latest.yml";
const { owner, repo: name } = RELEASE_REPOSITORY;
const appData = path.join(process.env.APPDATA!, "IeumDoc");
const updaterCache = path.join(process.env.LOCALAPPDATA!, "ieumdoc-updater");
const defaultInstall = path.join(process.env.LOCALAPPDATA!, "Programs", "IeumDoc");

function powershell(script: string): string {
  return execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).trim();
}

/** The folder of the per-user installation, from its uninstall entry (which has no InstallLocation), or "". */
function installedEntry(): string {
  const uninstall = powershell("$key = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall'; " +
    "if (Test-Path -LiteralPath $key) { Get-ChildItem -LiteralPath $key -ErrorAction Stop | " +
    "ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction Stop } | Where-Object { $_.DisplayName -like 'IeumDoc*' } | ForEach-Object { $_.UninstallString } }");
  const match = /^"(.+)\\Uninstall IeumDoc\.exe"/.exec(uninstall);
  return match ? match[1]! : uninstall;
}

/** Package one test build and keep its installer and metadata. */
function packageVersion(version: string): string {
  const out = path.join(work, `v${version}`);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  execFileSync("pnpm --filter @ieumdoc/desktop package", { cwd: repo, shell: process.env.ComSpec ?? "cmd.exe", stdio: "ignore",
    env: { ...process.env, IEUMDOC_TEST_VERSION: version, IEUMDOC_TEST_UPDATE_HOST: HOST, IEUMDOC_RELEASE: "", IEUMDOC_REQUIRE_SIGNED_UPDATES: "" } });
  for (const file of [`IeumDoc-Setup-${version}.exe`, `IeumDoc-Setup-${version}.exe.blockmap`, CHANNEL_FILE]) {
    copyFileSync(path.join(desktop, "release", file), path.join(out, file));
  }
  return out;
}

/** Opt-in, public read/download only. Both releases must already exist; no publication API calls. */
async function publicBeta(): Promise<string> {
  const folder = path.join(work, `public-${OLD}`);
  mkdirSync(folder, { recursive: true });
  for (const version of [OLD, NEW]) {
    const result = await fetch(`https://api.github.com/repos/${owner}/${name}/releases/tags/v${version}`);
    assert.equal(result.status, 200, `Public v${version} is required; real GitHub update validation remains Pending`);
    const release = await result.json() as { tag_name: string; draft: boolean; prerelease: boolean; assets: { name: string; size: number; digest: string; browser_download_url: string }[] };
    assert.equal(release.tag_name, `v${version}`); assert.equal(release.draft, false); assert.equal(release.prerelease, true);
    const installer = `IeumDoc-Setup-${version}.exe`;
    assert.deepEqual(release.assets.map((asset) => asset.name).sort(), [installer, `${installer}.blockmap`, "beta.yml"].sort());
    const download = async (assetName: string) => {
      const asset = release.assets.find((asset) => asset.name === assetName)!;
      assert.equal(asset.browser_download_url, `https://github.com/${owner}/${name}/releases/download/v${version}/${assetName}`);
      const response = await fetch(asset.browser_download_url); assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length, asset.size);
      assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`, asset.digest);
      return bytes;
    };
    const metadata = readUpdateInfo((await download("beta.yml")).toString("utf8"));
    assert.equal(metadata.version, version); assert.equal(metadata.path, installer);
    assert.ok(Array.isArray(metadata.files) && metadata.files.length === 1);
    const file = metadata.files[0]; assert.equal(file.url, installer); assert.equal(file.sha512, metadata.sha512);
    if (version === OLD) {
      const bytes = await download(installer);
      assert.equal(createHash("sha512").update(bytes).digest("base64"), file.sha512);
      assert.equal(bytes.length, file.size);
      writeFileSync(path.join(folder, installer), bytes);
    }
  }
  return folder;
}

/** GitHub Releases with one published release, the new version. */
function releases(folder: string, requests: string[]): http.Server {
  return http.createServer((request, response) => {
    const url = request.url ?? "";
    requests.push(url);
    if (url === `/${owner}/${name}/releases.atom`) {
      return response.writeHead(200).end(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>` +
        `<link rel="alternate" type="text/html" href="https://github.com/${owner}/${name}/releases/tag/v${NEW}"/><title>v${NEW}</title><content>Test</content></entry></feed>`);
    }
    if (url === `/api/v3/repos/${owner}/${name}/releases/latest`) {
      // The first Beta distribution has no Stable release to fall back to.
      return BETA ? response.writeHead(404).end() : response.writeHead(200).end(JSON.stringify({ tag_name: `v${NEW}` }));
    }
    const asset = new RegExp(`^/${owner}/${name}/releases/download/v${NEW.replaceAll(".", "\\.")}/([^/]+)$`).exec(url);
    const file = asset ? path.join(folder, decodeURIComponent(asset[1]!)) : "";
    if (file && existsSync(file)) return response.writeHead(200).end(readFileSync(file));
    response.writeHead(404).end();
  });
}

/** FileVersion retains Beta identifiers; Windows ProductVersion is numeric and loses them. */
function appProcesses(folder: string): { pid: number; version: string }[] {
  // Windows PowerShell 5.1: no ConvertTo-Json -AsArray, so the array is passed as -InputObject.
  const raw = powershell(`ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -Filter "Name='IeumDoc.exe'" | ` +
    `Where-Object { $_.ExecutablePath -like '${folder}\\*' } | ` +
    `ForEach-Object { @{ pid = $_.ProcessId; version = (Get-Item $_.ExecutablePath).VersionInfo.FileVersion } })`);
  return raw ? [JSON.parse(raw)].flat() : [];
}

function requireCleanUser(): void {
  assert.equal(installedEntry(), "", "IeumDoc is already installed; use a separate Windows test account");
  for (const folder of [appData, updaterCache, defaultInstall]) assert.equal(existsSync(folder), false, `${folder} exists; this test would change it`);
}

test("installs per user, then updates from Settings only after the open document is saved", { timeout: 15 * 60_000 }, async () => {
  requireCleanUser();
  rmSync(work, { recursive: true, force: true });
  const oldBuild = LIVE ? await publicBeta() : packageVersion(OLD);
  const newBuild = LIVE ? "" : packageVersion(NEW);
  const install = path.join(work, "install");
  const documents = path.join(work, "documents");
  mkdirSync(documents, { recursive: true });
  const documentFile = path.join(documents, "update.md");
  writeFileSync(documentFile, `${NATIVE_PREFIX}# Update\n\nAlpha.\n`);
  const requests: string[] = [];
  const server = LIVE ? null : releases(newBuild, requests);
  if (server) await new Promise<void>((resolve) => server.listen(47320, "127.0.0.1", resolve));
  let installedAt = "";
  let ownsData = false;
  try {
    // Per-user and silent: no administrator rights and no wizard.
    const started = Date.now();
    requireCleanUser(); // Downloads/builds can take minutes; recheck before installing.
    const setup = spawnSync(path.join(oldBuild, `IeumDoc-Setup-${OLD}.exe`), ["/S", `/D=${install}`], { stdio: "ignore" });
    assert.equal(setup.status, 0, "the installer failed");
    const registered = installedEntry();
    assert.equal(path.resolve(registered).toLowerCase(), path.resolve(install).toLowerCase(), "the registered installation is not owned by this test");
    installedAt = registered;
    ownsData = true;
    const exe = path.join(installedAt, "IeumDoc.exe");
    assert.equal(existsSync(exe), true);
    console.log(`installed ${OLD} in ${Date.now() - started} ms at ${installedAt}`);
    const prefs = { channel: BETA ? "beta" as const : "stable" as const, postponed: OLD };
    const preferencesFile = path.join(appData, "preferences.json");
    const canary = path.join(appData, "update-test-canary.txt");
    mkdirSync(appData, { recursive: true });
    writeFileSync(canary, "Preserve existing user data.\n");

    let app = await electron.launch({ executablePath: exe, args: ["--lang=en-US", documentFile], timeout: 60_000 });
    let page = await app.firstWindow();
    page.on("dialog", () => {});
    // Public beta.4 uses "Ready"; current builds use the stable lowercase operation ID.
    await page.locator('[data-testid="status"][data-operation="ready" i]').waitFor({ state: "attached", timeout: 30_000 });
    // The installer relaunches without arguments. Persist the test's language for that launch too;
    // public beta.4 is English-only, but shares this origin/profile with the updated app.
    await page.evaluate(() => localStorage.setItem("ieumdoc.uiLanguage", "en"));
    const phase = () => page.getByTestId("update-status").getAttribute("data-phase");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    assert.equal(await page.getByTestId("app-version").innerText(), OLD);
    assert.equal(await page.getByRole("radio", { name: BETA ? /^Beta/ : /^Stable/ }).isChecked(), true, "first install uses its own channel");
    await page.getByRole("button", { name: "Check for updates" }).click();
    await page.getByRole("button", { name: "Download update" }).waitFor({ timeout: 30_000 });
    assert.match(await page.getByTestId("update-status").innerText(), new RegExp(`IeumDoc ${NEW.replaceAll(".", "\\.")} \\(${BETA ? "Beta" : "Stable"}\\) is available`));
    if (!LIVE) {
      assert.ok(requests.some((url) => url.endsWith(`/${CHANNEL_FILE}`)), "the installed channel fetched its update metadata");
      assert.equal(requests.some((url) => url.endsWith(".exe")), false, "finding the update downloaded nothing");
    }
    await page.getByRole("button", { name: "Download update" }).click();
    await page.getByRole("button", { name: "Restart to update" }).waitFor({ timeout: 120_000 });
    assert.equal(await phase(), "downloaded");
    if (!LIVE) assert.ok(requests.some((url) => url.endsWith(`IeumDoc-Setup-${NEW}.exe`)), "the installer was downloaded from the release");

    // Normal quit with a downloaded update is not consent to install. Restart the old app,
    // then explicitly download again (the updater may reuse its checksum-verified cache).
    await app.close();
    const versionAfterQuit = powershell(`(Get-Item -LiteralPath '${exe.replaceAll("'", "''")}').VersionInfo.FileVersion`);
    assert.equal(versionAfterQuit, OLD, "normal quit did not update the installed app");
    writePreferences(preferencesFile, prefs);
    app = await electron.launch({ executablePath: exe, args: ["--lang=en-US", documentFile], timeout: 60_000 });
    page = await app.firstWindow();
    page.on("dialog", () => {});
    await page.locator('[data-testid="status"][data-operation="ready" i]').waitFor({ state: "attached" });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    assert.equal(await page.getByTestId("app-version").innerText(), OLD);
    await page.getByRole("button", { name: "Check for updates" }).click();
    await page.getByRole("button", { name: "Download update" }).click();
    await page.getByRole("button", { name: "Restart to update" }).waitFor({ timeout: 120_000 });

    // A missing IPC answer refuses after the deadline and re-enables the window. Only the
    // test removes/restores the listener; the shipped bridge has no such control.
    await app.evaluate(({ ipcMain }) => {
      (globalThis as unknown as { restartListeners: Function[] }).restartListeners = ipcMain.listeners("desktop:restart-check-result");
      ipcMain.removeAllListeners("desktop:restart-check-result");
    });
    try {
      await page.getByRole("button", { name: "Restart to update" }).click();
      await page.getByTestId("update-problem").waitFor({ timeout: 15_000 });
      assert.match(await page.getByTestId("update-problem").innerText(), /could not confirm that your work is saved/);
      assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isEnabled()), true);
      assert.equal(await phase(), "downloaded");
    } finally {
      await app.evaluate(({ ipcMain }) => {
        const stored = globalThis as unknown as { restartListeners?: ((...args: unknown[]) => void)[] };
        for (const listener of stored.restartListeners ?? []) ipcMain.on("desktop:restart-check-result", listener);
        delete stored.restartListeners;
      });
    }

    // A renderer callback failure is also a refusal, not an implicit permission to install.
    await page.evaluate(() => window.ieumdocDesktop!.onRestartCheck(() => { throw new Error("renderer check failed"); }));
    await page.getByRole("button", { name: "Restart to update" }).click();
    await page.getByTestId("update-problem").waitFor();
    assert.match(await page.getByTestId("update-problem").innerText(), /could not confirm that your work is saved/);
    await page.reload();
    await page.locator('[data-testid="status"][data-operation="ready" i]').waitFor({ state: "attached" });

    // Unsaved work refuses the restart and stays.
    await page.getByText("Alpha.", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Saved before the update.");
    await page.getByTestId("update-notice").getByRole("button", { name: "Restart to update" }).click();
    await page.getByTestId("error").waitFor();
    assert.match(await page.getByTestId("error").innerText(), /Save your changes, then restart to update/);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);

    await page.keyboard.press("Control+S");
    await page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent === "Saved");
    const closed = new Promise<void>((resolve) => app.once("close", () => resolve()));
    await page.getByTestId("update-notice").getByRole("button", { name: "Restart to update" }).click();
    await closed;
    const restarted = Date.now();
    // The installer starts the new version without arguments, so it logs to the default user data.
    const log = path.join(appData, "logs", "desktop.log");
    const shown = () => existsSync(log) && new RegExp(`started ${NEW.replaceAll(".", "\\.")} [^\\n]*\\n[^\\n]*window shown`).test(readFileSync(log, "utf8"));
    while (!shown()) {
      if (Date.now() - restarted > 180_000) throw new Error(`The updated app did not start: ${existsSync(log) ? readFileSync(log, "utf8") : "no log"}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.ok(appProcesses(installedAt).some((process) => process.version === NEW), "the new version is running");
    console.log(`installed ${NEW} and showed its window ${Date.now() - restarted} ms after the restart`);
    assert.equal(readFileSync(documentFile, "utf8"), `${NATIVE_PREFIX}# Update\n\nAlpha. Saved before the update.\n`);
    assert.deepEqual(readPreferences(preferencesFile, NEW), prefs, "saved channel and preferences survived installation");
    assert.equal(readFileSync(canary, "utf8"), "Preserve existing user data.\n");
    assert.ok(readFileSync(log, "utf8").includes(`started ${NEW} (${prefs.channel})`), "the new app loaded the preserved channel");
  } finally {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const process of installedAt ? (() => { try { return appProcesses(installedAt); } catch { return []; } })() : []) {
      spawnSync("taskkill", ["/PID", String(process.pid), "/T", "/F"], { stdio: "ignore" });
    }
    if (installedAt) {
      const uninstall = spawnSync(path.join(installedAt, "Uninstall IeumDoc.exe"), ["/S", "/currentuser"], { stdio: "ignore" });
      // The uninstaller copies itself and returns at once; wait for the entry to go.
      for (let wait = 0; wait < 60 && installedEntry(); wait++) await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log(`uninstall: ${uninstall.status}; entry ${installedEntry() ? "remains" : "removed"}`);
    }
    // This test made these folders (it refused to run when they existed).
    if (ownsData) for (const folder of [appData, updaterCache]) rmSync(folder, { recursive: true, force: true });
  }
  assert.equal(installedEntry(), "", "the uninstaller left its entry");
});
