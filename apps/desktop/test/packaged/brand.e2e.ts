// Kept separate from normal packaged tests: the CI driver rebuilds using only brand.ts.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { _electron as electron, expect, type ElectronApplication } from "@playwright/test";
import { brand } from "../../../../brand.ts";
import { PLUGIN_UI } from "@litzio/plugin-api/config";
import { packageConfiguration } from "../../scripts/package.ts";
import { readUpdateInfo } from "../../scripts/verify-release.ts";
import { fakeDoclingServer } from "../../../editor/test/helpers/docling-server.ts";
import { verifyPackagedWorker } from "../../../../test/helpers/plugin-conversion.ts";
import { windowsCommand } from "../windows-command.ts";

const repo = path.resolve(import.meta.dirname, "../../../..");
const work = path.join(repo, "tmp/brand-build"), release = path.join(repo, "apps/desktop/release");
const official: { brand: typeof brand; config: ReturnType<typeof packageConfiguration>; pluginHashes: Record<string, string>; iconHash: string } = JSON.parse(readFileSync(path.join(work, "official.json"), "utf8"));
const version = JSON.parse(readFileSync(path.join(repo, "apps/desktop/package.json"), "utf8")).version as string;

test("one brand setting produces independently installed identities and the unchanged official worker/UI API", {
  skip: process.platform !== "win32" || process.env.CI !== "true", timeout: 180_000,
}, async () => {
  const config = packageConfiguration(version, false);
  assert.notEqual(config.appId, official.config.appId);
  const updater = readUpdateInfo(readFileSync(path.join(release, "win-unpacked/resources/app-update.yml"), "utf8"));
  assert.equal(updater.owner, brand.updates.repository.owner);
  assert.equal(updater.repo, brand.updates.repository.repo);
  assert.equal(updater.channel, brand.updates.channels.beta);
  assert.equal(updater.updaterCacheDirName, `${brand.appName}-updater`);
  assert.ok(existsSync(path.join(release, `${brand.updates.channels.beta}.yml`)));
  assert.deepEqual(readFileSync(path.join(repo, "apps/desktop/build/app/icon.ico")), readFileSync(path.join(repo, brand.icons.ico)));
  assert.notEqual(createHash("sha256").update(readFileSync(path.join(repo, brand.icons.ico))).digest("hex"), official.iconHash);
  const cliManifest = JSON.parse(readFileSync(path.join(repo, "apps/desktop/build/cli/package.json"), "utf8"));
  assert.deepEqual(cliManifest.bin, { [brand.cliCommand]: "cli.mjs" });
  const brands = [official.brand, brand];
  const installs = brands.map(value => path.join(process.env.LOCALAPPDATA!, "Programs", value.appName));
  const data = brands.map(value => path.join(process.env.APPDATA!, value.folders.desktopData));
  for (const folder of [...installs, ...data]) assert.equal(existsSync(folder), false, `CI account already contains ${folder}`);
  const apps: ElectronApplication[] = [], installed: number[] = [];
  const shared = path.join(os.homedir(), brand.folders.shared);
  assert.equal(existsSync(shared), false, "alternate shared plugin folder must be new");
  const updaterCache = path.join(process.env.LOCALAPPDATA!, `${brand.appName}-updater`);
  assert.equal(existsSync(updaterCache), false, "alternate updater cache must be new");
  const fake = await fakeDoclingServer();
  try {
    for (let index = 0; index < brands.length; index++) {
      const value = brands[index]!;
      const installer = index === 0 ? path.join(work, "official-setup.exe") : path.join(release, `${value.executableName}-Setup-${version}.exe`);
      const setup = spawnSync(installer, ["/S"], { timeout: 60_000, encoding: "utf8", windowsHide: true });
      assert.ifError(setup.error); assert.equal(setup.status, 0, setup.stderr); installed.push(index);
      const exe = path.join(installs[index]!, `${value.executableName}.exe`);
      assert.ok(existsSync(exe), "installer must use its configured default folder");
      const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined && !["LITZIO_PLUGINS_DIR", "LITZIO_DOCLING_SETTINGS_FILE"].includes(entry[0])));
      const app = await electron.launch({ executablePath: exe, args: ["--lang=en-US"], env, timeout: 45_000 });
      apps.push(app);
      assert.equal((await app.evaluate(({ app }) => app.getPath("userData"))).toLowerCase(), data[index]!.toLowerCase());
      const page = await app.firstWindow();
      await page.getByTestId("document-start").waitFor();
      assert.equal(new URL(page.url()).protocol, `${value.protocol}:`);
      await expect(page).toHaveTitle(value.name.en);
      const help = spawnSync(exe, ["resources/cli/cli.mjs", "help"], { cwd: installs[index], env: { ...env, ELECTRON_RUN_AS_NODE: "1" }, encoding: "utf8", timeout: 20_000 });
      assert.equal(help.status, 0, help.stderr); assert.ok(help.stdout.includes(`${value.cliCommand} <command>`)); assert.ok(help.stdout.includes(`${value.name.en} CLI`));
      const integration = await page.evaluate(() => window.litzioDesktop!.setCliIntegration(true));
      assert.equal(integration.status, "installed", integration.conflict);
      const bin = path.join(process.env.LOCALAPPDATA!, value.folders.cli, "bin");
      const shim = path.join(bin, `${value.cliCommand}.cmd`);
      assert.ok(existsSync(shim));
      assert.equal(JSON.parse(readFileSync(path.join(bin, "owner.json"), "utf8")).owner, `${value.appId}.cli/v1`);
      const cli = spawnSync(process.env.ComSpec ?? "cmd.exe", windowsCommand(shim, ["--version"]), { windowsVerbatimArguments: true, windowsHide: true, encoding: "utf8", timeout: 20_000 });
      assert.equal(cli.status, 0, cli.stderr); assert.ok(cli.stdout.startsWith(`${value.cliCommand} ${version} (desktop, `));
      if (index === 0) continue;
      const icon = await page.locator(".document-start-mark").getAttribute("src");
      assert.ok(icon);
      const png = await page.evaluate(async url => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), icon);
      assert.deepEqual(Buffer.from(png), readFileSync(path.join(repo, value.icons.png)), "Editor must load the configured PNG as well as Desktop's ICO");
      const favicon = await page.locator('link[rel="icon"]').getAttribute("href");
      assert.ok(favicon);
      const smallPng = await page.evaluate(async url => Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer())), favicon);
      assert.deepEqual(Buffer.from(smallPng), readFileSync(path.join(repo, value.icons.smallPng)), "Favicon must load the configured small PNG");
      // Both installed apps remain alive: neither the single-instance lock nor origin/data collide.
      assert.equal(apps[0]!.process().exitCode, null);
      await page.evaluate(prefix => { localStorage.setItem(`${prefix}.uiLanguage`, "ko"); localStorage.setItem(`${prefix}.theme`, "dark"); }, value.storagePrefix);
      await page.reload();
      await expect(page.getByTestId("document-start").locator(".document-start-product")).toHaveText(value.name.ko);
      await expect(page).toHaveTitle(value.name.ko);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(640, 900));
      await page.screenshot({ path: path.join(work, "alternate-640-ko-dark.png") });
      await page.evaluate(prefix => localStorage.setItem(`${prefix}.uiLanguage`, "en"), value.storagePrefix);
      await page.reload();
      const manifest = JSON.parse(readFileSync(path.join(installs[index]!, "resources/cli/docling-worker/manifest.json"), "utf8"));
      for (const [file, hash] of Object.entries(official.pluginHashes)) {
        assert.equal(createHash("sha256").update(readFileSync(path.join(installs[index]!, "resources/cli/docling-worker", file))).digest("hex"), hash, `official plugin bytes changed with branding: ${file}`);
      }
      assert.equal(manifest.workerApi, 1);
      assert.equal(manifest.ui.api, PLUGIN_UI.api); assert.equal(manifest.ui.reactMajor, PLUGIN_UI.reactMajor);
      const output = await verifyPackagedWorker(async (endpoint, method = "GET", body) => {
        const response = await page.evaluate(async ({ endpoint, method, body }) => {
          const response = await fetch(`/api/${endpoint}`, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
          return { status: response.status, text: await response.text() };
        }, { endpoint, method, body });
        return new Response(response.text, { status: response.status });
      }, work, fake.url);
      assert.ok(existsSync(path.join(shared, value.folders.plugins)));
      await page.getByRole("button", { name: "Docling comparison", exact: true }).click();
      await page.getByTestId("folder-path").fill(output);
      await page.getByTestId("folder-open").click();
      const view = page.locator(".docling-tab[data-active=true]");
      await expect(view.locator(".docling-source img").first()).toBeVisible();
      await expect(view.locator(".ProseMirror")).toBeVisible();
      writeFileSync(path.join(work, "proof.json"), JSON.stringify({ official: official.brand, alternate: value, config, updater, cliManifest, simultaneousInstalledApps: apps.length, officialWorkerAndUi: true }, null, 2));
    }
  } finally {
    try {
      const closed = await Promise.allSettled(apps.map(async app => {
        const child = app.process();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([app.close(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Brand app did not close")), 15_000); })]);
        } finally {
          clearTimeout(timer);
          if (child.pid && child.exitCode === null && child.signalCode === null) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
        }
      }));
      for (const result of closed) if (result.status === "rejected") throw result.reason;
    }
    finally {
      await fake.close();
      for (const index of installed.reverse()) {
        const uninstaller = path.join(work, `uninstall-${index}.exe`);
        copyFileSync(path.join(installs[index]!, `Uninstall ${brands[index]!.executableName}.exe`), uninstaller);
        const result = spawnSync(uninstaller, ["/S", "/currentuser", `_?=${installs[index]}`], { timeout: 60_000, encoding: "utf8", windowsHide: true });
        assert.ifError(result.error); assert.equal(result.status, 0, result.stderr);
        assert.equal(existsSync(path.join(installs[index]!, `${brands[index]!.executableName}.exe`)), false);
        assert.equal(existsSync(path.join(process.env.LOCALAPPDATA!, brands[index]!.folders.cli, "bin", `${brands[index]!.cliCommand}.cmd`)), false);
        rmSync(data[index]!, { recursive: true, force: true });
      }
      rmSync(shared, { recursive: true, force: true });
      // The updater initializes this even without downloading; the fresh-path guard above
      // proves ownership so the following lifecycle regressions can keep their clean-user guard.
      rmSync(updaterCache, { recursive: true, force: true });
    }
  }
});
