// The Desktop bridge in the sandboxed page: typed calls to the main process, nothing else.
// No Node.js API or document content is exposed. OS folder actions are validated in main.
import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge, RestartCheck, UpdateState } from "../../editor/shared/desktop-bridge.ts";

let restartCheck: (() => RestartCheck) | null = null;

ipcRenderer.on("desktop:restart-check", (_event, id: number) => {
  let answer: RestartCheck;
  try {
    answer = restartCheck ? restartCheck() : { ok: false, reason: "The editor is not ready to restart." };
  } catch {
    answer = { ok: false, reason: "IeumDoc could not confirm that your work is saved." };
  }
  ipcRenderer.send("desktop:restart-check-result", id, answer);
});

const bridge: DesktopBridge = {
  fileDeletion: "trash",
  setOpenedFolders: roots => ipcRenderer.invoke("desktop:opened-folders", roots),
  openFolderInExplorer: folder => ipcRenderer.invoke("desktop:open-folder", folder),
  setTheme: (theme) => ipcRenderer.invoke("desktop:set-theme", theme),
  setWindowBackground: (color, overlay) => ipcRenderer.invoke("desktop:set-window-background", color, overlay),
  info: () => ipcRenderer.invoke("desktop:info"),
  cliIntegration: () => ipcRenderer.invoke("desktop:cli-state"),
  setCliIntegration: (enabled) => ipcRenderer.invoke("desktop:cli-set", enabled),
  setChannel: (channel) => ipcRenderer.invoke("desktop:set-channel", channel),
  checkForUpdates: () => ipcRenderer.invoke("desktop:check"),
  downloadUpdate: () => ipcRenderer.invoke("desktop:download"),
  installUpdate: () => ipcRenderer.invoke("desktop:install"),
  markUpdateSeen: (version) => ipcRenderer.invoke("desktop:seen-update", version),
  openReleaseNotes: (version) => ipcRenderer.invoke("desktop:release-notes", version),
  onUpdateState(listener) {
    const handler = (_event: unknown, state: UpdateState) => listener(state);
    ipcRenderer.on("desktop:update-state", handler);
    return () => { ipcRenderer.removeListener("desktop:update-state", handler); };
  },
  onRestartCheck(check) {
    restartCheck = check;
    return () => { if (restartCheck === check) restartCheck = null; };
  },
};

contextBridge.exposeInMainWorld("ieumdocDesktop", bridge);
