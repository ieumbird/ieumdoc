// Execute main's actual wiring with in-memory Electron/filesystem ports. Never launch the app.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { transformSync } from "esbuild";
import { ExplorerFolders } from "../src/explorer.ts";

const main = new URL("../src/main.ts", import.meta.url);
const source = transformSync(readFileSync(main, "utf8"), {
  loader: "ts", format: "cjs", define: { "import.meta.url": JSON.stringify(main.href), __IEUMDOC_REQUIRE_SIGNED_UPDATES__: "false" },
}).code;

async function start(options: { startupError?: boolean; logError?: boolean; loadError?: boolean; lock?: boolean } = {}) {
  const logs: string[] = [], errors: unknown[][] = [], alerts: string[] = [];
  const timers = new Map<number, { run: () => void; ms: number }>();
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  let timerId = 0, exits = 0, quits = 0;
  class Window extends EventEmitter {
    visible = false; minimized = false; shows = 0; focused = false; destroyed = false;
    background = ""; overlay: unknown;
    webContents = Object.assign(new EventEmitter(), {
      mainFrame: { url: "ieumdoc://app/index.html" }, setWindowOpenHandler() {}, send() {},
    });
    constructor(_options: unknown) { super(); windows.push(this); }
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    isMinimized() { return this.minimized; }
    restore() { this.minimized = false; }
    focus() { this.focused = true; }
    show() { this.visible = true; this.shows++; }
    setBackgroundColor(color: string) { this.background = color; }
    setTitleBarOverlay(overlay: unknown) { this.overlay = overlay; }
    loadURL() { return options.loadError ? Promise.reject(new Error("load rejected")) : Promise.resolve(); }
  }
  const windows: Window[] = [];
  const app = Object.assign(new EventEmitter(), {
    isPackaged: false, requestSingleInstanceLock: () => options.lock !== false,
    quit: () => quits++, exit: (code: number) => { assert.equal(code, 1); exits++; },
    whenReady: () => Promise.resolve(), getPath: () => "/fake-user-data", getVersion: () => "0.0.2-beta.2",
  });
  const require = createRequire(import.meta.url);
  const dependencies: Record<string, unknown> = {
    "electron": {
      app, BrowserWindow: Window, dialog: { showErrorBox: (_title: string, message: string) => alerts.push(message) },
      ipcMain: { handle: (name: string, handler: (event: unknown, ...args: unknown[]) => unknown) => handlers.set(name, handler), on() {} },
      Menu: { setApplicationMenu() {} }, nativeTheme: {}, protocol: { registerSchemesAsPrivileged() {}, handle() {} },
      session: { defaultSession: { setPermissionRequestHandler() { if (options.startupError) throw new Error("permission setup failed"); }, setPermissionCheckHandler() {} } }, shell: {},
    },
    "node:fs": {
      mkdirSync() { if (options.logError) throw new Error("log directory denied"); },
      appendFileSync: (_file: string, message: string) => logs.push(message), existsSync: () => false,
    },
    "electron-updater": { autoUpdater: {} }, "js-yaml": {},
    "./host-protocol.ts": { ORIGIN: "ieumdoc://app", SCHEME: "ieumdoc", createProtocolHandler() {} },
    "./explorer.ts": { ExplorerFolders },
    "./first-document.ts": { firstDocument() {} },
    "./preferences.ts": { readPreferences: () => ({ channel: "beta", postponed: null }) },
    "./updates.ts": { UpdateController: class { channel = "beta"; state = { phase: "idle" }; start() {} stop() {} } },
    "./update-policy.ts": {}, "./signatures.ts": {}, "./github-provider.ts": {}, "./cli-integration.ts": {}, "./windows-environment.ts": {},
  };
  runInNewContext(source, {
    require: (name: string) => name in dependencies ? dependencies[name] : require(name),
    process: { argv: [], platform: "win32", env: {}, resourcesPath: "/fake-resources" },
    console: { error: (...args: unknown[]) => errors.push(args) },
    setTimeout: (run: () => void, ms: number) => { timers.set(++timerId, { run, ms }); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  await setImmediate();
  const window = windows[0]!;
  const appearance = (color: unknown = "#ffffff", overlay: unknown = { color: "#f6f7f9", symbolColor: "#20242c" }, trusted = true) =>
    handlers.get("desktop:set-window-background")!({ sender: window.webContents, senderFrame: trusted ? window.webContents.mainFrame : {} }, color, overlay);
  const timeout = (ms = 5_000) => {
    const pending = [...timers.entries()].find(([, timer]) => timer.ms === ms);
    assert.ok(pending, `a ${ms}ms recovery timer must exist`);
    const [id, { run }] = pending;
    timers.delete(id);
    run();
  };
  return { app, window, logs, errors, alerts, timers, appearance, timeout, exits: () => exits, quits: () => quits };
}

test("startup waits for paint and appearance in either order; later updates never reveal a hidden window", async () => {
  for (const paintFirst of [true, false]) {
    const h = await start();
    if (paintFirst) h.window.emit("ready-to-show"); else h.appearance();
    assert.equal(h.window.visible, false);
    if (paintFirst) h.appearance(); else h.window.emit("ready-to-show");
    assert.equal(h.window.visible, true);
    assert.equal(h.window.background, "#ffffff");
    assert.equal(h.timers.size, 0);
    h.window.visible = false;
    h.appearance("#123456");
    assert.equal(h.window.visible, false);
  }
});

test("startup deadline reveals once without first paint; late signals cannot reveal again", async t => {
  for (const appearanceFirst of [false, true]) {
    await t.test(`appearance ${appearanceFirst ? "received" : "missing"}`, async () => {
      const h = await start();
      if (appearanceFirst) h.appearance();
      assert.equal(h.window.shows, 0);
      h.timeout(15_000);
      assert.equal(h.window.shows, 1);
      assert.equal(h.timers.size, 0);
      assert.match(h.logs.join(""), /startup timed out after 15000ms/);
      h.window.visible = false;
      h.window.emit("ready-to-show");
      h.appearance();
      assert.equal(h.window.shows, 1);
      assert.equal(h.window.visible, false);
      assert.equal(h.timers.size, 0);
    });
  }
});

test("first paint does not extend the absolute startup deadline", async () => {
  const h = await start();
  const deadline = [...h.timers.entries()].find(([, timer]) => timer.ms === 15_000);
  assert.ok(deadline, "the deadline starts before first paint");
  h.window.emit("ready-to-show");
  assert.equal(h.timers.get(deadline[0]), deadline[1], "first paint must not replace or restart the deadline");
  h.timeout(15_000);
  assert.equal(h.window.shows, 1);
  assert.equal(h.timers.size, 0, "the fallback also cancels the cosmetic appearance wait");
});

test("missing or rejected appearance shows the window once and records why, without weakening IPC validation", async () => {
  const missing = await start();
  missing.window.emit("ready-to-show");
  missing.timeout();
  assert.equal(missing.window.shows, 1);
  assert.equal(missing.timers.size, 0, "the appearance fallback also cancels the absolute deadline");
  assert.match(missing.logs.join(""), /appearance timed out/);
  missing.window.visible = false;
  missing.appearance();
  assert.equal(missing.window.shows, 1);
  for (const [color, overlay] of [["#fff", { color: "#f6f7f9", symbolColor: "#20242c" }],
    ["#ffffff", { color: "red", symbolColor: "#20242c" }], ["#ffffff", { color: "#f6f7f9", symbolColor: null }], ["#ffffff", null]]) {
    const h = await start();
    assert.throws(() => h.appearance(color, overlay), /Invalid window appearance/);
    assert.equal(h.window.shows, 1);
    assert.equal(h.window.background, "");
    h.window.emit("ready-to-show");
    assert.equal(h.timers.size, 0);
    assert.match(h.logs.join(""), /window appearance failed/);
  }
  const foreign = await start();
  assert.throws(() => foreign.appearance("#ffffff", undefined, false), /Untrusted sender/);
  assert.equal(foreign.window.shows, 0);
});

test("renderer startup failures notify and reveal before paint; subframe failures are ignored", async () => {
  for (const kind of ["did-fail-load", "render-process-gone", "load-rejection"]) {
    const h = await start({ loadError: kind === "load-rejection" });
    if (kind === "did-fail-load") {
      h.window.webContents.emit(kind, {}, -105, "missing resource", "ieumdoc://app/frame", false);
      assert.equal(h.window.shows, 0);
      h.window.webContents.emit(kind, {}, -105, "missing page", "ieumdoc://app/index.html", true);
    } else if (kind === "render-process-gone") h.window.webContents.emit(kind, {}, { reason: "crashed", exitCode: 1 });
    assert.equal(h.window.shows, 1, kind);
    assert.equal(h.alerts.length, 1, kind);
    assert.match(h.logs.join(""), /renderer (load failed|exited)/);
    h.window.webContents.emit("render-process-gone", {}, { reason: "crashed", exitCode: 1 });
    assert.equal(h.alerts.length, 1, "the startup failure is consumed once");
  }
});

test("close cancels both timers; second launch reveals, restores and focuses the existing window", async () => {
  const h = await start();
  h.window.minimized = true;
  h.app.emit("second-instance");
  assert.equal(h.window.visible, true);
  assert.equal(h.window.minimized, false);
  assert.equal(h.window.focused, true);
  assert.equal(h.timers.size, 0);
  h.window.visible = false;
  h.window.emit("ready-to-show");
  h.appearance();
  assert.equal(h.window.shows, 1, "late signals after second launch must not reveal again");
  assert.equal(h.timers.size, 0);
  h.app.emit("second-instance");
  assert.equal(h.window.shows, 2, "also reveal after the startup gate was consumed");
  for (const paintFirst of [false, true]) {
    const closed = await start();
    if (paintFirst) closed.window.emit("ready-to-show");
    closed.window.destroyed = true;
    closed.window.emit("closed");
    assert.equal(closed.timers.size, 0);
  }
});

test("startup exceptions are logged, reported and exit; logging failure remains observable on stderr", async () => {
  const h = await start({ startupError: true });
  assert.match(h.logs.join(""), /starting 0.0.2-beta.2[\s\S]*startup failed: Error: permission setup failed/);
  assert.match(h.alerts[0]!, /permission setup failed/);
  assert.equal(h.exits(), 1);
  const denied = await start({ logError: true, startupError: true });
  assert.ok(denied.errors.some(args => args.join(" ").includes("log directory denied")));
  assert.equal(denied.exits(), 1);
  const second = await start({ lock: false });
  assert.equal(second.quits(), 1);
  assert.equal(second.logs.length, 0, "a secondary process exits before startup/log creation");
});
