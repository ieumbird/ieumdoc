// The packaged Windows app (release/win-unpacked, or IEUMDOC_DESKTOP_EXE for an installed copy)
// under Playwright: the Editor and Host behind ieumdoc://app with real files, no Vite and no TCP port.
//   pnpm --filter @ieumdoc/desktop package && pnpm --filter @ieumdoc/desktop test:packaged
// Files live in the repository's ignored tmp/desktop-e2e; each test uses its own fixed profile there.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { _electron as electron, expect, type ElectronApplication, type Page } from "@playwright/test";
import { openDocument, reloadDocument } from "../../../editor/test/browser/navigation.ts";
import { recoveryRecords, resetRecovery } from "../../../editor/test/browser/recovery-records.ts";
import { processTree } from "./process-tree.ts";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repo = path.resolve(desktop, "../..");
const exe = process.env.IEUMDOC_DESKTOP_EXE ?? path.join(desktop, "release", "win-unpacked", "IeumDoc.exe");
const work = path.join(repo, "tmp", "desktop-e2e");
const resetProfiles = new Set<string>();
if (process.platform !== "win32") throw new Error("The packaged app tests run on Windows.");
if (!existsSync(exe)) throw new Error(`Package the app first: ${exe} is missing.`);

/** Preserve Chromium's profile across runs; reset only the app's own test state. */
function profile(name: string): string {
  const folder = path.join(work, "profiles", name);
  resetProfiles.add(folder);
  mkdirSync(folder, { recursive: true });
  for (const file of ["preferences.json", "logs/desktop.log", "logs/desktop.log.old", "sample-native-v1/technical-document.md", "sample-native-v1/diagram.svg"]) {
    rmSync(path.join(folder, file), { force: true });
  }
  return folder;
}

/** A writable copy of the technical document with its figure. */
function documentFolder(name: string): { folder: string; file: string } {
  const folder = path.join(work, "documents", name);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, "doc.md");
  copyFileSync(path.join(repo, "apps/editor/document/technical-document.md"), file);
  copyFileSync(path.join(repo, "apps/editor/document/diagram.svg"), path.join(folder, "diagram.svg"));
  return { folder, file };
}

async function launch(userData: string, args: string[] = []): Promise<{ app: ElectronApplication; page: Page; requests: string[] }> {
  const app = await electron.launch({ executablePath: exe, args: ["--lang=en-US", `--user-data-dir=${userData}`, ...args], timeout: 60_000 });
  const page = await app.firstWindow();
  // The app, not Playwright, answers beforeunload (will-prevent-unload); a listener stops Playwright's auto-dismiss.
  page.on("dialog", () => {});
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await ready(page);
  // Reset once per test, never on its restart. Prior successful close tests intentionally
  // leave records; those must not open a recovery modal in the next suite invocation.
  if (resetProfiles.has(userData)) {
    await resetRecovery(page);
    resetProfiles.delete(userData);
  }
  return { app, page, requests };
}

const ready = (page: Page) => page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: "attached", timeout: 30_000 });
const saved = (page: Page) => page.waitForFunction(() => document.querySelector('[data-testid="status"]')?.textContent === "Saved", null, { timeout: 15_000 });
const figuresLoaded = (page: Page) => page.waitForFunction(() => {
  const images = [...document.querySelectorAll<HTMLImageElement>('[data-testid="figure-image"]')];
  return images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0);
}, null, { timeout: 15_000 }).then(() => true, () => false);

async function openFile(page: Page, file: string): Promise<void> {
  await openDocument(page, file);
  await ready(page);
  await page.getByRole("dialog").waitFor({ state: "detached" });
}

async function typeAtStart(page: Page, text: string): Promise<void> {
  await page.locator(".ProseMirror p").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.type(text);
}

/** The close question's answer, given in the main process instead of a native dialog. */
const answerClose = (app: ElectronApplication, button: 0 | 1) =>
  app.evaluate(({ dialog }, answer) => { dialog.showMessageBoxSync = (() => answer) as typeof dialog.showMessageBoxSync; }, button);

/** A close regression must fail and clean up its own process, rather than hang on a native prompt. */
async function closeApp(app: ElectronApplication): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([app.close(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("The test app did not close within 15 seconds")), 15_000);
    })]);
  } catch (error) {
    const child = app.process();
    if (child.pid && child.exitCode === null) execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

test("started without a document, it opens none; the sample opens with its figure from ieumdoc://app when chosen", async () => {
  const userData = profile("sample");
  const oldSample = path.join(userData, "sample", "technical-document.md");
  mkdirSync(path.dirname(oldSample), { recursive: true });
  writeFileSync(oldSample, "User-modified legacy sample.\n");
  const { app, page, requests } = await launch(userData);
  try {
    assert.equal(page.url(), "ieumdoc://app/index.html");
    assert.deepEqual(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getMinimumSize()), [640, 480], "native minimum size follows ADR-0010");
    const expectedVersion = process.env.IEUMDOC_TEST_VERSION ?? JSON.parse(readFileSync(path.join(desktop, "package.json"), "utf8")).version;
    assert.equal(await page.evaluate(async () => (await window.ieumdocDesktop!.info()).version), expectedVersion, "the packaged version matches its source");
    await page.getByTestId("document-start").waitFor();
    await expect(page).toHaveTitle("IeumDoc");
    await expect.poll(() => page.evaluate(() => (navigator as Navigator & { windowControlsOverlay: { visible: boolean } }).windowControlsOverlay.visible),
      { message: "native caption buttons are exposed through Window Controls Overlay" }).toBe(true);
    assert.equal(await page.getByRole("button", { name: "Open file…", exact: true }).count(), 0);
    assert.equal(await page.getByTestId("current-file").innerText(), "No file opened");
    assert.equal(await page.locator(".ProseMirror").count(), 0, "nothing opens until the user chooses");
    await page.getByRole("button", { name: "Open sample document", exact: true }).click();
    await page.locator(".ProseMirror h1").first().waitFor();
    await expect(page).toHaveTitle("technical-document.md — IeumDoc");
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getTitle()),
      { message: "native taskbar title follows the active file" }).toBe("technical-document.md — IeumDoc");
    for (const width of [1440, 640]) {
      await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]!.setContentSize(width, 900), width);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
      const geometry = await page.evaluate(() => {
        const overlay = (navigator as Navigator & { windowControlsOverlay: { getTitlebarAreaRect(): DOMRect } }).windowControlsOverlay.getTitlebarAreaRect();
        const controls = [...document.querySelectorAll<HTMLElement>('.top-bar button, .sidebar-header button')];
        return { reserved: innerWidth - overlay.right, height: overlay.height,
          blocked: controls.filter(element => {
            const r = element.getBoundingClientRect();
            return r.width && (r.right > innerWidth || (r.top < overlay.bottom && r.right > overlay.right) || getComputedStyle(element).getPropertyValue('app-region') !== 'no-drag');
          }).map(element => element.getAttribute('aria-label') || element.textContent) };
      });
      assert.ok(geometry.reserved > 0 && geometry.height === 40, JSON.stringify(geometry));
      assert.deepEqual(geometry.blocked, [], "controls clear native caption buttons at each supported width");
    }
    assert.match(await page.getByTestId("current-file").getAttribute("title") ?? "", /[\\/]sample-native-v1[\\/]technical-document\.md$/);
    assert.equal(await page.locator(".ProseMirror h1").first().innerText(), "Converter Control");
    assert.equal(await figuresLoaded(page), true);
    assert.equal(readFileSync(oldSample, "utf8"), "User-modified legacy sample.\n", "native sample never overwrites old user copies");
    assert.equal(await page.evaluate(() => typeof (globalThis as { process?: unknown }).process), "undefined", "the page has no Node.js");
    const foreign = requests.filter((url) => !/^(ieumdoc:\/\/app\/|data:|blob:)/.test(url));
    assert.deepEqual(foreign, [], "every request stays inside the app");
  } finally {
    await closeApp(app);
  }
});

test("a .md argument opens; edits save to disk and reopen", async () => {
  const { file } = documentFolder("argument");
  const userData = profile("argument");
  let { app, page } = await launch(userData, [file]);
  try {
    assert.equal(await page.getByTestId("current-file").getAttribute("title"), file);
    assert.equal(await figuresLoaded(page), true);
    await typeAtStart(page, "DESKTOP ");
    await page.keyboard.press("Control+S");
    await saved(page);
    assert.match(readFileSync(file, "utf8"), /DESKTOP /);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    for (const theme of ["dark", "light", "system", "dark"] as const) {
      await page.getByTestId("theme").selectOption(theme);
      await expect.poll(() => app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe(theme);
      const dark = await app.evaluate(({ nativeTheme }) => nativeTheme.shouldUseDarkColors);
      await expect(page.locator("html")).toHaveAttribute("data-theme", dark ? "dark" : "light");
      const background = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--id-color-canvas").trim());
      await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBackgroundColor().toLowerCase())).toBe(background);
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), dark ? "dark" : "light");
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.hide());
    await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return window.ieumdocDesktop!.setWindowBackground(style.getPropertyValue("--id-color-canvas").trim(), {
        color: style.getPropertyValue("--id-color-surface-subtle").trim(), symbolColor: style.getPropertyValue("--id-color-text").trim(),
      });
    });
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible()), false, "later appearance updates must not show a hidden window");
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.show());
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(() => localStorage.getItem("ieumdoc.theme")), "dark");
    const preferencesFile = path.join(userData, "preferences.json");
    assert.ok(!existsSync(preferencesFile) || !readFileSync(preferencesFile, "utf8").includes('"theme"'), "the Host must not persist appearance");
  } finally {
    await closeApp(app);
  }
  ({ app, page } = await launch(userData, [file]));
  try {
    assert.match(await page.locator(".ProseMirror").innerText(), /DESKTOP /);
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark", "saved appearance is ready when the Editor mounts");
    assert.equal(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource), "dark");
  } finally {
    await closeApp(app);
  }
});

test("local recovery survives a packaged app crash and normal close, with real Save/Reload and conflict", async () => {
  const { file } = documentFolder("recovery");
  const original = readFileSync(file, "utf8");
  const userData = profile("recovery");
  const processes: number[] = [];
  let app: ElectronApplication | undefined;
  let page: Page;
  const start = async () => {
    const launched = await launch(userData);
    app = launched.app; page = launched.page;
    const pid = app.process().pid!;
    assert.ok(pid > 0 && !processes.includes(pid), "restart must create a new owned app process");
    processes.push(pid);
    assert.equal(page.url(), "ieumdoc://app/index.html");
    assert.equal(await app.evaluate(({ app }) => app.getPath("userData")), userData);
    assert.equal(await app.evaluate(({ app }) => app.getPath("sessionData")), userData);
  };
  try {
    await start();
    await openFile(page!, file);
    await typeAtStart(page!, "DESKTOP CRASH RECORDED ");
    // One representative pending Figure, inserted through the existing UI.
    await page!.locator(".document-editor p").first().hover();
    await page!.getByRole("button", { name: /Insert block after paragraph block/ }).first().click();
    await page!.getByRole("menuitem", { name: "Paragraph", exact: true }).click();
    await page!.keyboard.type("/figure");
    await page!.getByRole("menuitem", { name: "Figure", exact: true }).click();
    await expect.poll(async () => {
      const records = await recoveryRecords(page!);
      return records.some(r => r.path === file && r.recoveryText.includes("DESKTOP CRASH RECORDED") && JSON.stringify(r.snapshot).includes('"imageUrl":""'));
    }, { timeout: 15_000 }).toBe(true);
    const recorded = await recoveryRecords(page!);
    assert.equal(readFileSync(file, "utf8"), original);
    const stopped = app!.waitForEvent("close");
    execFileSync("taskkill", ["/PID", String(app!.process().pid), "/T", "/F"], { stdio: "ignore" });
    await stopped;
    app = undefined;
    await start();
    assert.deepEqual(await recoveryRecords(page!), recorded);
    await page!.getByRole("button", { name: "Review recovery", exact: true }).waitFor();
    // Opening the matching file must propose recovery, not silently replace it.
    await openDocument(page!, file); await ready(page!);
    await page!.getByTestId("recovery-prompt").waitFor();
    await page!.getByRole("button", { name: "Restore work", exact: true }).click();
    await page!.getByRole("tab", { name: "doc.md, Unsaved changes", exact: true }).waitFor();
    await expect(page!.locator(".document-editor")).toContainText("DESKTOP CRASH RECORDED");
    await expect(page!.locator('[data-block="figure"]')).toHaveCount(2);
    assert.equal(readFileSync(file, "utf8"), original);
    await page!.getByTestId("save").click(); await saved(page!);
    await expect.poll(() => recoveryRecords(page!)).toEqual([]);
    const savedSource = readFileSync(file, "utf8");
    assert.match(savedSource, /DESKTOP CRASH RECORDED/);
    assert.ok(savedSource.includes(":::{figure}\n:::\n"), "the restored pending Figure reaches canonical disk output");
    await reloadDocument(page!); await ready(page!);
    await expect(page!.locator(".document-editor")).toContainText("DESKTOP CRASH RECORDED");
    await expect(page!.locator('[data-block="figure"]')).toHaveCount(2);

    await typeAtStart(page!, "NORMAL CLOSE RECORDED ");
    await expect.poll(async () => (await recoveryRecords(page!)).some(r => r.recoveryText.includes("NORMAL CLOSE RECORDED")), { timeout: 15_000 }).toBe(true);
    const beforeClose = await recoveryRecords(page!);
    // Existing native-dialog seam answers the real beforeunload/main close guard.
    // Assert the offered semantics, rather than merely app.close() or a renderer reload.
    let closeQuestion = "";
    app!.on("console", message => { if (message.text().startsWith("recovery-close:")) closeQuestion = message.text(); });
    await app!.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = ((_window: unknown, options: { buttons: string[] }) => {
        if (options.buttons[0] !== "Close without saving") throw new Error("Wrong close semantics");
        console.log("recovery-close:" + JSON.stringify(options.buttons));
        return 0;
      }) as typeof dialog.showMessageBoxSync;
    });
    const closed = app!.waitForEvent("close");
    await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    await closed;
    app = undefined;
    assert.equal(closeQuestion, 'recovery-close:["Close without saving","Keep editing"]');
    assert.equal(readFileSync(file, "utf8"), savedSource);
    const outside = savedSource + "\nChanged outside before restore.\n";
    writeFileSync(file, outside);
    await start();
    assert.deepEqual(await recoveryRecords(page!), beforeClose);
    await page!.getByRole("button", { name: "Review recovery", exact: true }).click();
    await page!.getByRole("button", { name: "Restore work", exact: true }).click();
    await page!.getByRole("tab", { name: "doc.md, Unsaved changes", exact: true }).waitFor();
    assert.equal(readFileSync(file, "utf8"), outside);
    const response = page!.waitForResponse(r => r.request().method() === "POST" && r.url() === "ieumdoc://app/api/document");
    await page!.getByTestId("save").click();
    assert.equal((await response).status(), 409);
    await page!.getByText("Save conflict", { exact: true }).waitFor();
    await expect(page!.locator(".document-editor")).toContainText("NORMAL CLOSE RECORDED");
    assert.equal(readFileSync(file, "utf8"), outside);
    assert.ok((await recoveryRecords(page!)).some(r => r.recoveryText.includes("NORMAL CLOSE RECORDED")));
    writeFileSync(path.join(work, "recovery-proof.json"), JSON.stringify({ platform: process.platform, exe, userData, origin: "ieumdoc://app", processes, forcedAppRestarts: 1, normalWindowClose: true, nativeDialogAnswerStub: true, committedRecordsSurvived: true, pendingFigure: true, restoreDirty: true, originalUnchangedUntilSave: true, saveReload: true, externalConflict409: true }, null, 2));
  } finally {
    if (app && app.process().exitCode === null && app.process().signalCode === null) {
      await answerClose(app, 0);
      await closeApp(app);
    }
  }
});

test("pasting an image writes an asset; Open folder lists the folder and New creates a file", async () => {
  const { folder, file } = documentFolder("assets");
  const { app, page } = await launch(profile("assets"));
  try {
    await openFile(page, file);
    await page.locator(".ProseMirror p").first().click();
    await page.locator(".document-editor").evaluate(async (element) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 8;
      canvas.getContext("2d")!.fillRect(0, 0, 8, 8);
      const png = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), "image/png"));
      const data = new DataTransfer();
      data.items.add(new File([png], "paste.png", { type: "image/png" }));
      element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="figure-image"]').length >= 2, null, { timeout: 15_000 });
    assert.equal(await figuresLoaded(page), true);
    assert.equal(readdirSync(path.join(folder, "assets")).filter((name) => name.endsWith(".png")).length, 1);
    await page.keyboard.press("Control+S");
    await saved(page);
    assert.match(readFileSync(file, "utf8"), /\.\/assets\/image-[^)]+\.png/);

    await page.getByTestId("sidebar").getByRole("button", { name: "Open folder…", exact: true }).click();
    await page.getByTestId("folder-path").fill(folder);
    await page.getByTestId("folder-open").click();
    await page.getByTestId("folder").getByRole("treeitem", { name: "doc.md" }).waitFor();
    await page.getByRole("button", { name: "New document…", exact: true }).click();
    await page.getByTestId("new-file-name").fill("created");
    await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
    await ready(page);
    assert.equal(existsSync(path.join(folder, "created.md")), true);
    assert.equal(await page.getByTestId("current-file").getAttribute("title"), path.join(folder, "created.md"));
  } finally {
    await closeApp(app);
  }
});

test("a file changed outside IeumDoc is a Save conflict and is not overwritten", async () => {
  const { file } = documentFolder("conflict");
  const { app, page } = await launch(profile("conflict"), [file]);
  try {
    await typeAtStart(page, "MINE ");
    const outside = `${readFileSync(file, "utf8")}\nChanged outside.\n`;
    writeFileSync(file, outside);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText("Save conflict", { exact: true }).waitFor({ timeout: 15_000 });
    assert.equal(readFileSync(file, "utf8"), outside);
    assert.match(await page.locator(".ProseMirror").innerText(), /MINE /);
  } finally {
    await answerClose(app, 0);
    await closeApp(app);
  }
});

test("closing with unsaved changes asks; Keep editing keeps the window and the edit", async () => {
  const { file } = documentFolder("close");
  const { app, page } = await launch(profile("close"), [file]);
  try {
    await typeAtStart(page, "UNSAVED ");
    await answerClose(app, 1);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close());
    await page.waitForTimeout(1000);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.match(await page.locator(".ProseMirror").innerText(), /UNSAVED /);
    assert.doesNotMatch(readFileSync(file, "utf8"), /UNSAVED /);
  } finally {
    await answerClose(app, 0);
    await closeApp(app);
  }
});

test("the release channel persists across restarts; an update check never blocks editing", async () => {
  const userData = profile("settings");
  const version = process.env.IEUMDOC_TEST_VERSION ?? JSON.parse(readFileSync(path.join(desktop, "package.json"), "utf8")).version as string;
  const initialChannel = version.includes("-beta.") ? "beta" : "stable";
  const selectedChannel = initialChannel === "beta" ? "stable" : "beta";
  const channelName = (channel: string) => channel === "beta" ? /^Beta/ : /^Stable/;
  const { file } = documentFolder("settings");
  let { app, page } = await launch(userData, [file]);
  try {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const dialog = page.getByTestId("settings-dialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "About & updates", exact: true }).click();
    assert.equal(await page.getByTestId("app-version").innerText(), version);
    assert.equal(await page.getByRole("radio", { name: channelName(initialChannel) }).isChecked(), true, "first launch uses the installed version's channel");
    // The choice shows once the Desktop app has saved it.
    await page.getByRole("radio", { name: channelName(selectedChannel) }).click();
    await page.waitForFunction((channel) => document.querySelector<HTMLInputElement>(`input[value="${channel}"]`)?.checked, selectedChannel);
    // GitHub answers for real: this repository has no release yet, or the machine may be offline.
    await page.getByRole("button", { name: "Check for updates" }).click();
    await page.waitForFunction(() => ["error", "up-to-date", "available", "no-stable-release"].includes(document.querySelector('[data-testid="update-status"]')?.getAttribute("data-phase") ?? ""), null, { timeout: 30_000 });
    console.log(`update check: ${await page.getByTestId("update-status").innerText()}`);
    await page.keyboard.press("Escape");
    await typeAtStart(page, "STILL EDITING ");
    assert.match(await page.locator(".ProseMirror").innerText(), /STILL EDITING /);
  } finally {
    await answerClose(app, 0);
    await closeApp(app);
  }
  assert.deepEqual(JSON.parse(readFileSync(path.join(userData, "preferences.json"), "utf8")), { channel: selectedChannel, postponed: null });
  ({ app, page } = await launch(userData));
  try {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByTestId("settings-dialog").waitFor();
    await page.getByRole("button", { name: "About & updates", exact: true }).click();
    assert.equal(await page.getByRole("radio", { name: channelName(selectedChannel) }).isChecked(), true, "the user's choice survives a restart instead of reverting to the build's default");
  } finally {
    await closeApp(app);
  }
});

test("a damaged update configuration leaves the Editor and Settings usable", {
  skip: Boolean(process.env.IEUMDOC_DESKTOP_EXE) && "Fault injection is confined to the generated package",
}, async () => {
  // Only mutate this task's generated package, never an IEUMDOC_DESKTOP_EXE user installation.
  const generated = path.join(desktop, "release", "win-unpacked", "IeumDoc.exe");
  assert.equal(path.resolve(exe), generated, "configuration fault injection requires the generated test package");
  const config = path.join(path.dirname(exe), "resources", "app-update.yml");
  const original = readFileSync(config);
  let app: ElectronApplication | undefined;
  try {
    writeFileSync(config, "provider: [broken");
    const launched = await launch(profile("invalid-updates"));
    app = launched.app;
    const { page } = launched;
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "About & updates", exact: true }).click();
    assert.equal(await page.getByTestId("app-version").isVisible(), true);
    assert.equal(await page.evaluate(async () => (await window.ieumdocDesktop!.info()).updatesSupported), false);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByTestId("document-start").isVisible(), true);
  } finally {
    if (app) await closeApp(app);
    writeFileSync(config, original);
  }
});

test("started directly, the app opens no TCP port; start time and memory are measured", async () => {
  const userData = profile("direct");
  const log = path.join(userData, "logs", "desktop.log");
  const started = Date.now();
  const child = spawn(exe, ["--lang=en-US", `--user-data-dir=${userData}`], { stdio: "ignore" });
  try {
    while (!(existsSync(log) && readFileSync(log, "utf8").includes("window shown"))) {
      if (Date.now() - started > 30_000) throw new Error("The window did not show within 30 seconds");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const shown = Date.now() - started;
    const initial = await processTree(child, exe);
    assert.deepEqual(initial.listening, []);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const tree = await processTree(child, exe, initial.identities);
    console.log(`direct start identities: ${JSON.stringify(tree.identities)}`);
    console.log(`direct start: window shown after ${shown} ms; ${tree.processes} processes; ${tree.workingSetMb} MB working set; listening: ${JSON.stringify(tree.listening)}`);
    assert.deepEqual(tree.listening, []);
  } finally {
    execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
});
