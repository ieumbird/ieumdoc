/**
 * What the Desktop Host (apps/desktop) exposes to the Editor through its preload script, as
 * `window.ieumdocDesktop`. The browser Editor has no bridge; Desktop-only UI appears only with it.
 * Nothing here reads or writes documents: those keep the Host requests every interface uses.
 */

/** Stable receives only full releases; Beta receives Beta and full releases. */
export type ReleaseChannel = "stable" | "beta";

export const RELEASE_CHANNELS: readonly ReleaseChannel[] = ["stable", "beta"];

/** An update the channel offers: newer than the installed version. */
export type OfferedUpdate = {
  version: string;
  /** A Beta (semver prerelease) version. */
  prerelease: boolean;
};

/**
 * Where updating stands. Every phase comes from the updater's own results and events;
 * progress is the updater's download progress.
 */
export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  /** The repository has published no full release; Beta checks remain available. */
  | { phase: "no-stable-release" }
  /** Nothing newer in the channel. `latest` is the channel's newest version when it is known. */
  | { phase: "up-to-date"; latest?: string }
  | ({ phase: "available" } & OfferedUpdate)
  | ({ phase: "downloading"; percent: number; transferred: number; total: number } & OfferedUpdate)
  /** Downloaded and verified (checksum, and the publisher signature when the build requires it). */
  | ({ phase: "downloaded" } & OfferedUpdate)
  /** The Editor allowed the restart; the window is closing for the installer. */
  | ({ phase: "installing" } & OfferedUpdate)
  | { phase: "error"; message: string; during: "check" | "download" | "install"; update?: OfferedUpdate };

export type DesktopInfo = {
  version: string;
  channel: ReleaseChannel;
  /** False in a development run, which has no installed update configuration. */
  updatesSupported: boolean;
  update: UpdateState;
  /** The last viewed offered version. */
  seenUpdate: string | null;
};

/** The Editor's answer when an update asks to restart: never yes with unsaved work. */
export type RestartCheck = { ok: true } | { ok: false; reason: string };

export type CliIntegrationState = {
  status: "off" | "installed" | "broken";
  /** A foreign PATH command or file; never overwritten. */
  conflict?: string;
  /** Integration is available only in a packaged Windows application. */
  unsupported?: boolean;
};

export type DesktopBridge = {
  /** The shared Host deletes through the operating system trash. */
  readonly fileDeletion: "trash";
  /** OS folder action capability; only Host-listed roots can be synchronized. */
  setOpenedFolders(roots: string[]): Promise<void>;
  openFolderInExplorer(folder: string): Promise<void>;
  /** Main chooses and creates the app's log directory; no renderer-supplied path. */
  openLogFolder(): Promise<void>;
  /** In-memory native appearance only; preference persistence stays in renderer localStorage. */
  setTheme(theme: "system" | "light" | "dark"): Promise<boolean>;
  /** Opaque sRGB #rrggbb canvas and caption roles; also marks the initial appearance ready to show. */
  setWindowBackground(color: string, overlay: { color: string; symbolColor: string }): Promise<void>;
  info(): Promise<DesktopInfo>;
  cliIntegration(): Promise<CliIntegrationState>;
  setCliIntegration(enabled: boolean): Promise<CliIntegrationState>;
  setChannel(channel: ReleaseChannel): Promise<DesktopInfo>;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  /** Asks the Editor (onRestartCheck) and restarts to install only if it agrees; otherwise why not. */
  installUpdate(): Promise<RestartCheck>;
  /** Record that the user viewed this offered version in About & updates. */
  markUpdateSeen(version: string): Promise<void>;
  /** Opens the GitHub release page of a version, or the releases list, in the system browser. */
  openReleaseNotes(version?: string): Promise<void>;
  onUpdateState(listener: (state: UpdateState) => void): () => void;
  /** The Editor's restart check. It answers from current state, synchronously. */
  onRestartCheck(check: () => RestartCheck): () => void;
};

declare global {
  interface Window {
    ieumdocDesktop?: DesktopBridge;
  }
}
