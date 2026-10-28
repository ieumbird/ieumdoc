// IeumDoc Desktop: one window with the Editor, the local Host behind `ieumdoc://app`, preferences
// and updates. Documents are read and written only through the existing Host handlers.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, protocol, session, shell, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import electronUpdater from "electron-updater";
import { load as loadYaml } from "js-yaml";
import type { DesktopInfo, RestartCheck } from "../../editor/shared/desktop-bridge.ts";
import { createProtocolHandler, ORIGIN, SCHEME } from "./host-protocol.ts";
import { firstDocument } from "./first-document.ts";
import { readPreferences, writePreferences, type Preferences } from "./preferences.ts";
import { parseChannel, releaseNotesUrl, RELEASE_REPOSITORY, RESTART_CHECK_TIMEOUT_MS } from "./update-policy.ts";
import { UpdateController, type UpdaterPort } from "./updates.ts";
import { verifyUpdateSignature } from "./signatures.ts";
import { IeumGitHubProvider } from "./github-provider.ts";
import { CliIntegration } from "./cli-integration.ts";
import { windowsEnvironment } from "./windows-environment.ts";

/** Set by the release build: an update must carry the publisher signature the installed app names. */
declare const __IEUMDOC_REQUIRE_SIGNED_UPDATES__: boolean;

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const preferencesFile = () => path.join(app.getPath("userData"), "preferences.json");
let window: BrowserWindow | null = null;
let readyToShow = false;
let appearanceReady = false;
let startupPending = false;
let appearanceTimer: ReturnType<typeof setTimeout> | undefined;
let startupTimer: ReturnType<typeof setTimeout> | undefined;
// Local CSS/IPC normally finishes before mounting. Bound the cosmetic wait after first paint.
const APPEARANCE_TIMEOUT_MS = 5_000;
// Allow ten seconds for first paint plus the cosmetic wait, even if paint never arrives.
const STARTUP_TIMEOUT_MS = 15_000;

function showStartupWindow(reason?: string): void {
  if (!startupPending || !window || window.isDestroyed()) return;
  startupPending = false;
  clearTimeout(appearanceTimer);
  clearTimeout(startupTimer);
  if (reason) log(`window startup fallback: ${reason}`);
  window.show();
  log("window shown");
}

function showWhenReady(): void {
  // Consume the startup gate: a later OS/theme update must not reveal a hidden window.
  if (readyToShow && appearanceReady) showStartupWindow();
}
let preferences: Preferences;
let updates: UpdateController;
let cliIntegration: CliIntegration | undefined;
/** Set after the Editor agreed to restart for an update; the installer starts once the window closed. */
let installing = false;

function log(message: string): void {
  try {
    const directory = path.join(app.getPath("userData"), "logs");
    const file = path.join(directory, "desktop.log");
    mkdirSync(directory, { recursive: true });
    if (existsSync(file) && statSync(file).size > 1_000_000) renameSync(file, `${file}.old`);
    appendFileSync(file, `${new Date().toISOString()} ${message}\n`);
  } catch (error) {
    // Logging never stops the app, but a missing file must not erase its diagnostic too.
    console.error("Could not write Desktop log:", error, message);
  }
}

/** Why this build does not update itself, or undefined when it can. */
function updatesUnsupported(updater: typeof electronUpdater.autoUpdater): string | undefined {
  if (!app.isPackaged) return "Updates run in the installed app.";
  const config = path.join(process.resourcesPath, "app-update.yml");
  if (!existsSync(config)) return "This build has no update configuration.";
  try {
    const parsed = loadYaml(readFileSync(config, "utf8")) as Record<string, unknown> | null;
    if (!parsed || Array.isArray(parsed) || parsed.provider !== "github" || parsed.owner !== RELEASE_REPOSITORY.owner || parsed.repo !== RELEASE_REPOSITORY.repo) {
      return "This build has an invalid update configuration.";
    }
    if (__IEUMDOC_REQUIRE_SIGNED_UPDATES__) {
      const names = typeof parsed?.publisherName === "string" ? [parsed.publisherName] : parsed?.publisherName;
      if (!Array.isArray(names) || !names.length || !names.every((name) => typeof name === "string" && name.trim())) {
        return "This build cannot verify who published an update, so it does not update itself.";
      }
    }
    updater.setFeedURL({ ...parsed, provider: "custom", updateProvider: IeumGitHubProvider });
  } catch {
    return "This build has an invalid update configuration.";
  }
  return undefined;
}

/** Only the app's own page may call the Desktop bridge. */
function trusted(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return window !== null && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame &&
    (event.senderFrame?.url ?? "").startsWith(`${ORIGIN}/`);
}

function info(): DesktopInfo {
  return { version: app.getVersion(), channel: updates.channel, updatesSupported: updates.supported, update: updates.state, postponed: preferences.postponed };
}

/** Links leave through the system browser, and only as http(s). */
function openExternal(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") void shell.openExternal(parsed.href);
  } catch {
    // Not a URL: ignored.
  }
}

let restartRequest = 0;
const restartAnswers = new Map<number, (check: RestartCheck) => void>();

/** Ask the Editor whether it may restart. No answer, a malformed one or a closed window is a no. */
function askEditorToRestart(target: BrowserWindow): Promise<RestartCheck> {
  const id = ++restartRequest;
  return new Promise((resolve) => {
    const refuse = (reason: string) => finish({ ok: false, reason });
    const timer = setTimeout(() => refuse("IeumDoc could not confirm that your work is saved."), RESTART_CHECK_TIMEOUT_MS);
    const gone = () => refuse("The editor closed before it answered.");
    target.webContents.once("render-process-gone", gone);
    function finish(check: RestartCheck) {
      clearTimeout(timer);
      restartAnswers.delete(id);
      if (!target.isDestroyed()) target.webContents.removeListener("render-process-gone", gone);
      resolve(check);
    }
    restartAnswers.set(id, finish);
    target.webContents.send("desktop:restart-check", id);
  });
}

async function installUpdate(): Promise<RestartCheck> {
  const target = window;
  if (!target || updates.state.phase !== "downloaded") return { ok: false, reason: "No downloaded update is ready to install." };
  if (restartAnswers.size) return { ok: false, reason: "IeumDoc is already checking whether it may restart." };
  // No input reaches the Editor between its answer and the window closing.
  target.setEnabled(false);
  const check = await askEditorToRestart(target);
  const update = check.ok && !target.isDestroyed() ? updates.beginInstall() : null;
  if (!update) {
    if (!target.isDestroyed()) target.setEnabled(true);
    log(`update restart refused: ${check.ok ? "no update" : check.reason}`);
    return check.ok ? { ok: false, reason: "No downloaded update is ready to install." } : check;
  }
  installing = true;
  log(`restarting to install ${update.version}`);
  // The page unloads first; the installer starts only after the window has closed (window-all-closed).
  target.close();
  return { ok: true };
}

function registerIpc(): void {
  const handle = (channel: string, run: (...args: unknown[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!trusted(event)) throw new Error("Untrusted sender.");
      return run(...args);
    });
  };
  handle("desktop:info", () => info());
  handle("desktop:cli-state", () => cliIntegration?.state() ?? { status: "off", unsupported: true });
  handle("desktop:cli-set", (enabled) => {
    if (typeof enabled !== "boolean") throw new Error("Invalid CLI integration choice.");
    if (!cliIntegration) throw new Error("CLI integration is available in the installed Windows app.");
    return cliIntegration.setEnabled(enabled);
  });
  handle("desktop:set-theme", (value) => {
    if (value !== "system" && value !== "light" && value !== "dark") throw new Error("Unknown theme.");
    nativeTheme.themeSource = value;
    return nativeTheme.shouldUseDarkColors;
  });
  handle("desktop:set-window-background", (color, overlay) => {
    try {
      const colors = overlay as { color?: unknown; symbolColor?: unknown } | null;
      const valid = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
      if (!valid(color) || !valid(colors?.color) || !valid(colors?.symbolColor)) throw new Error("Invalid window appearance.");
      window?.setBackgroundColor(color);
      window?.setTitleBarOverlay({ color: colors.color, symbolColor: colors.symbolColor });
      appearanceReady = true;
      showWhenReady();
    } catch (error) {
      log(`window appearance failed: ${String(error)}`);
      showStartupWindow("window appearance failed");
      throw error;
    }
  });
  handle("desktop:set-channel", async (value) => {
    if (value !== "stable" && value !== "beta") throw new Error("Unknown release channel.");
    await updates.setChannel(parseChannel(value));
    return info();
  });
  handle("desktop:check", () => updates.check());
  handle("desktop:download", () => updates.download());
  handle("desktop:install", () => installUpdate());
  handle("desktop:postpone", (version) => {
    if (typeof version !== "string" || !("version" in updates.state) || updates.state.version !== version) return;
    preferences = { ...preferences, postponed: version };
    writePreferences(preferencesFile(), preferences);
  });
  handle("desktop:release-notes", (version) => openExternal(releaseNotesUrl(typeof version === "string" ? version : undefined)));
  ipcMain.on("desktop:restart-check-result", (event, id: unknown, check: unknown) => {
    if (!trusted(event) || typeof id !== "number") return;
    const record = typeof check === "object" && check !== null ? check as Record<string, unknown> : {};
    const answer: RestartCheck = record.ok === true ? { ok: true }
      : { ok: false, reason: typeof record.reason === "string" && record.reason ? record.reason : "The editor did not allow restarting." };
    restartAnswers.get(id)?.(answer);
  });
}

function createWindow(): void {
  readyToShow = false;
  appearanceReady = false;
  startupPending = true;
  const created = new BrowserWindow({
    width: 1400, height: 900, minWidth: 640, minHeight: 480, title: "IeumDoc", show: false,
    titleBarStyle: "hidden", titleBarOverlay: { height: 40 },
    icon: path.join(appRoot, "icon.ico"),
    webPreferences: {
      preload: path.join(appRoot, "preload.cjs"),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  window = created;
  startupTimer = setTimeout(() => showStartupWindow("startup timed out after 15000ms"), STARTUP_TIMEOUT_MS);
  created.once("ready-to-show", () => {
    readyToShow = true;
    showWhenReady();
    if (startupPending) appearanceTimer = setTimeout(() => showStartupWindow("appearance timed out after 5000ms"), APPEARANCE_TIMEOUT_MS);
  });
  const failed = (reason: string) => {
    if (!startupPending) return;
    showStartupWindow(reason);
    dialog.showErrorBox("IeumDoc", `The editor could not start.\n${reason}`);
  };
  created.webContents.on("did-fail-load", (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame) failed(`renderer load failed (${code}): ${description}`);
  });
  created.webContents.on("render-process-gone", (_event, details) => failed(`renderer exited: ${details.reason} (${details.exitCode})`));
  // The Editor's beforeunload asks before losing work; Electron needs the question shown here.
  created.webContents.on("will-prevent-unload", (event) => {
    if (installing) {
      // Work appeared after the Editor allowed the restart: keep the window and the update.
      installing = false;
      updates.cancelInstall();
      created.setEnabled(true);
      return;
    }
    const leave = dialog.showMessageBoxSync(created, {
      type: "warning", buttons: ["Close without saving", "Keep editing"], defaultId: 1, cancelId: 1, noLink: true,
      title: "IeumDoc", message: "Open documents have unsaved changes or work in progress.", detail: "Close without saving the original files. Local recovery keeps only the last successfully recorded applied edits; unapplied drafts and later changes may be lost. Keep editing to finish and save each document first.",
    }) === 0;
    if (leave) event.preventDefault();
  });
  created.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  created.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) event.preventDefault();
  });
  created.on("closed", () => {
    clearTimeout(appearanceTimer);
    clearTimeout(startupTimer);
    startupPending = false;
    if (window === created) window = null;
  });
  void created.loadURL(`${ORIGIN}/index.html`).catch(error => failed(`renderer load failed: ${String(error)}`));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // No application menu: its Reload and DevTools shortcuts are not part of the Editor.
  Menu.setApplicationMenu(null);
  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    if (!window.isVisible()) {
      if (startupPending) showStartupWindow("second instance requested the hidden window");
      else window.show();
    }
    window.focus();
  });
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });
  app.whenReady().then(() => {
    log(`starting ${app.getVersion()}`);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    preferences = readPreferences(preferencesFile(), app.getVersion());
    const cliRoot = path.join(app.isPackaged ? process.resourcesPath : path.dirname(appRoot), "cli");
    protocol.handle(SCHEME, createProtocolHandler(path.join(cliRoot, "editor"), firstDocument(process.argv.slice(app.isPackaged ? 1 : 2), app.getPath("userData"), appRoot, log), file => shell.trashItem(file)));
    if (app.isPackaged && process.platform === "win32" && process.env.LOCALAPPDATA) {
      cliIntegration = new CliIntegration(process.execPath, process.env.LOCALAPPDATA, windowsEnvironment());
    }
    const { autoUpdater } = electronUpdater;
    if (__IEUMDOC_REQUIRE_SIGNED_UPDATES__ && autoUpdater instanceof electronUpdater.NsisUpdater) {
      autoUpdater.verifyUpdateCodeSignature = verifyUpdateSignature;
    }
    autoUpdater.logger = { info: (m: unknown) => log(`updater: ${String(m)}`), warn: (m: unknown) => log(`updater warning: ${String(m)}`),
      error: (m: unknown) => log(`updater error: ${String(m)}`), debug: () => {} };
    const unsupported = updatesUnsupported(autoUpdater);
    updates = new UpdateController(autoUpdater as unknown as UpdaterPort, {
      installed: app.getVersion(),
      channel: preferences.channel,
      ...(unsupported ? { unsupported } : {}),
      emit: (state) => { if (window && !window.isDestroyed()) window.webContents.send("desktop:update-state", state); },
      saveChannel: (channel) => {
        const next = { ...preferences, channel };
        writePreferences(preferencesFile(), next);
        preferences = next;
      },
      ...(__IEUMDOC_REQUIRE_SIGNED_UPDATES__ ? { verifyDownloaded: async (files: unknown) => {
        if (!Array.isArray(files) || files.length !== 1 || typeof files[0] !== "string") throw new Error("No verified installer was downloaded.");
        const config = loadYaml(readFileSync(path.join(process.resourcesPath, "app-update.yml"), "utf8")) as { publisherName?: unknown };
        const names = typeof config.publisherName === "string" ? [config.publisherName] : config.publisherName;
        if (!Array.isArray(names) || !names.length || !names.every((name) => typeof name === "string" && name.trim())) throw new Error("No update publisher is configured.");
        const problem = await verifyUpdateSignature(names, files[0]);
        if (problem) throw new Error(problem);
      } } : {}),
      log,
    });
    registerIpc();
    log(`started ${app.getVersion()} (${preferences.channel}); ${unsupported ?? "updates on"}`);
    createWindow();
    updates.start();
  }).catch(error => {
    log(`startup failed: ${String(error)}`);
    try {
      dialog.showErrorBox("IeumDoc", `IeumDoc could not start.\n${String(error)}`);
    } finally {
      app.exit(1);
    }
  });
  app.on("window-all-closed", () => {
    updates?.stop();
    // Only the restart the Editor allowed installs an update; quitting the app never does.
    if (installing) {
      updates.finishInstall();
      // quitAndInstall quits after starting the installer; if it could not, the saved work is safe
      // and the app still ends rather than staying without a window.
      setTimeout(() => app.quit(), 5_000);
    } else {
      app.quit();
    }
  });
}
