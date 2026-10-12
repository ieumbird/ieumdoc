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
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { _electron as electron } from "@playwright/test";
import { RELEASE_REPOSITORY } from "../../src/update-policy.ts";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repo = path.resolve(desktop, "../..");
const work = path.join(repo, "tmp", "desktop-update");
const HOST = "127.0.0.1:47320";
const BETA = process.env.IEUMDOC_TEST_UPDATE_CHANNEL === "beta";
const [OLD, NEW] = BETA ? ["0.0.1-beta.1", "0.0.1-beta.2"] : ["0.0.1", "0.0.2"];
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
  const uninstall = powershell("Get-ChildItem HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall -ErrorAction SilentlyContinue | " +
    "ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -like 'IeumDoc*' } | ForEach-Object { $_.UninstallString }");
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

test("installs per user, then updates from Settings only after the open document is saved", { timeout: 15 * 60_000 }, async () => {
  assert.equal(installedEntry(), "", "IeumDoc is already installed for this user; uninstall it before this test");
  for (const folder of [appData, updaterCache, defaultInstall]) assert.equal(existsSync(folder), false, `${folder} exists; this test would change it`);
  rmSync(work, { recursive: true, force: true });
  const oldBuild = packageVersion(OLD);
  const newBuild = packageVersion(NEW);
  const install = path.join(work, "install");
  const documents = path.join(work, "documents");
  mkdirSync(documents, { recursive: true });
  const documentFile = path.join(documents, "update.md");
  writeFileSync(documentFile, "# Update\n\nAlpha.\n");
  const requests: string[] = [];
  const server = releases(newBuild, requests);
  await new Promise<void>((resolve) => server.listen(47320, "127.0.0.1", resolve));
  let installedAt = "";
  try {
    // Per-user and silent: no administrator rights and no wizard.
    const started = Date.now();
    const setup = spawnSync(path.join(oldBuild, `IeumDoc-Setup-${OLD}.exe`), ["/S", `/D=${install}`], { stdio: "ignore" });
    assert.equal(setup.status, 0, "the installer failed");
    installedAt = installedEntry();
    assert.ok(installedAt, "the installer registered no uninstall entry");
    const exe = path.join(installedAt, "IeumDoc.exe");
    assert.equal(existsSync(exe), true);
    console.log(`installed ${OLD} in ${Date.now() - started} ms at ${installedAt}`);

    let app = await electron.launch({ executablePath: exe, args: [documentFile], timeout: 60_000 });
    let page = await app.firstWindow();
    page.on("dialog", () => {});
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({ state: "attached", timeout: 30_000 });
    const phase = () => page.getByTestId("update-status").getAttribute("data-phase");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    assert.equal(await page.getByTestId("app-version").innerText(), OLD);
    assert.equal(await page.getByRole("radio", { name: BETA ? /^Beta/ : /^Stable/ }).isChecked(), true, "first install uses its own channel");
    await page.getByRole("button", { name: "Check for updates" }).click();
    await page.getByRole("button", { name: "Download update" }).waitFor({ timeout: 30_000 });
    assert.match(await page.getByTestId("update-status").innerText(), new RegExp(`IeumDoc ${NEW.replaceAll(".", "\\.")} \\(${BETA ? "Beta" : "Stable"}\\) is available`));
    assert.ok(requests.some((url) => url.endsWith(`/${CHANNEL_FILE}`)), "the installed channel fetched its update metadata");
    assert.equal(requests.some((url) => url.endsWith(".exe")), false, "finding the update downloaded nothing");
    await page.getByRole("button", { name: "Download update" }).click();
    await page.getByRole("button", { name: "Restart to update" }).waitFor({ timeout: 120_000 });
    assert.equal(await phase(), "downloaded");
    assert.ok(requests.some((url) => url.endsWith(`IeumDoc-Setup-${NEW}.exe`)), "the installer was downloaded from the release");

    // Normal quit with a downloaded update is not consent to install. Restart the old app,
    // then explicitly download again (the updater may reuse its checksum-verified cache).
    await app.close();
    const versionAfterQuit = powershell(`(Get-Item -LiteralPath '${exe.replaceAll("'", "''")}').VersionInfo.FileVersion`);
    assert.equal(versionAfterQuit, OLD, "normal quit did not update the installed app");
    app = await electron.launch({ executablePath: exe, args: [documentFile], timeout: 60_000 });
    page = await app.firstWindow();
    page.on("dialog", () => {});
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({ state: "attached" });
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
    await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({ state: "attached" });

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
    assert.equal(readFileSync(documentFile, "utf8"), "# Update\n\nAlpha. Saved before the update.\n");
  } finally {
    server.close();
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
    for (const folder of [appData, updaterCache]) rmSync(folder, { recursive: true, force: true });
  }
  assert.equal(installedEntry(), "", "the uninstaller left its entry");
});
