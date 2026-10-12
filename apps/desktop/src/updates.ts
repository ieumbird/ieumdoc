// Update checks, downloads and the install hand-off, around electron-updater's own results and events.
import type { OfferedUpdate, ReleaseChannel, UpdateState } from "../../editor/shared/desktop-bridge.ts";
import { CHECK_INTERVAL_MS, configureUpdater, FIRST_CHECK_DELAY_MS, offerFor, RETRY_INTERVAL_MS, type UpdaterSettings } from "./update-policy.ts";

type DownloadProgress = { percent: number; transferred: number; total: number };

/** The part of electron-updater's AppUpdater this app uses. */
export type UpdaterPort = UpdaterSettings & {
  checkForUpdates(): Promise<{ isUpdateAvailable?: boolean; updateInfo: { version: string } } | null>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
  on(event: "download-progress", listener: (progress: DownloadProgress) => void): unknown;
  on(event: "update-downloaded", listener: (info: { version: string }) => void): unknown;
};

export type UpdateControllerOptions = {
  installed: string;
  channel: ReleaseChannel;
  /** Why updates cannot run in this build, e.g. a development run; checking then does nothing. */
  unsupported?: string;
  emit(state: UpdateState): void;
  saveChannel(channel: ReleaseChannel): void;
  /** Also verify cache reuse, where electron-updater 6.x skips the fresh-download signature hook. */
  verifyDownloaded?(files: unknown): Promise<void>;
  timers?: { set(run: () => void, ms: number): unknown; clear(handle: unknown): void };
  log?(message: string): void;
};

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error)).split("\n")[0]!;

export class UpdateController {
  state: UpdateState = { phase: "idle" };
  channel: ReleaseChannel;
  /** Changes with the channel; results that started under another channel are dropped. */
  private generation = 0;
  private checking: Promise<void> | null = null;
  private recheck = false;
  private timer: unknown = null;
  private readonly timers: NonNullable<UpdateControllerOptions["timers"]>;
  private downloadedVersion: string | null = null;

  constructor(private readonly updater: UpdaterPort, private readonly options: UpdateControllerOptions) {
    this.channel = options.channel;
    this.timers = options.timers ?? { set: (run, ms) => setTimeout(run, ms), clear: (handle) => clearTimeout(handle as NodeJS.Timeout) };
    configureUpdater(updater, this.channel);
    updater.on("download-progress", (progress) => {
      if (this.state.phase !== "downloading") return;
      this.set({ ...this.offered()!, phase: "downloading", percent: progress.percent, transferred: progress.transferred, total: progress.total });
    });
    updater.on("update-downloaded", (info) => { this.downloadedVersion = info.version; });
  }

  get supported(): boolean {
    return this.options.unsupported === undefined;
  }

  /** Check soon after launch, then periodically; a failed check retries sooner. */
  start(): void {
    if (!this.supported) return;
    this.schedule(FIRST_CHECK_DELAY_MS);
  }

  stop(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }

  async setChannel(channel: ReleaseChannel): Promise<void> {
    if (this.state.phase === "downloading" || this.state.phase === "installing") {
      throw new Error("The release channel can change after the current update finishes.");
    }
    if (channel === this.channel) return;
    this.options.saveChannel(channel);
    this.channel = channel;
    this.generation++;
    configureUpdater(this.updater, channel);
    // An update the new channel would not offer is no longer offered, even if downloaded.
    const offered = this.offered();
    if (offered && !offerFor(this.options.installed, channel, offered.version)) this.set({ phase: "idle" });
    await this.check();
  }

  /** One check at a time. A check requested meanwhile, e.g. after a channel change, runs after it. */
  check(): Promise<void> {
    if (!this.supported) {
      this.set({ phase: "error", message: this.options.unsupported!, during: "check" });
      return Promise.resolve();
    }
    if (this.checking) {
      this.recheck = true;
      return this.checking;
    }
    this.checking = this.runCheck().finally(() => {
      this.checking = null;
      if (this.recheck) {
        this.recheck = false;
        void this.check();
      }
    });
    return this.checking;
  }

  private async runCheck(): Promise<void> {
    const phase = this.state.phase;
    // A download in progress or a downloaded update stays; nothing newer replaces it mid-way.
    if (phase === "downloading" || phase === "downloaded" || phase === "installing") return;
    const generation = this.generation;
    this.set({ phase: "checking" });
    try {
      const result = await this.updater.checkForUpdates();
      if (generation !== this.generation) return;
      const latest = result?.updateInfo.version;
      const offered = result?.isUpdateAvailable && latest ? offerFor(this.options.installed, this.channel, latest) : null;
      this.set(offered ? { phase: "available", ...offered } : { phase: "up-to-date", ...(latest ? { latest } : {}) });
      this.schedule(CHECK_INTERVAL_MS);
    } catch (error) {
      if (generation !== this.generation) return;
      this.options.log?.(`update check failed: ${messageOf(error)}`);
      this.set({ phase: "error", message: messageOf(error), during: "check" });
      this.schedule(RETRY_INTERVAL_MS);
    }
  }

  /** Download the offered update after the user asked for it; progress is the updater's. */
  async download(): Promise<void> {
    const offered = this.offered();
    if (!offered || (this.state.phase !== "available" && !(this.state.phase === "error" && this.state.during === "download"))) return;
    const generation = this.generation;
    this.downloadedVersion = null;
    this.set({ phase: "downloading", ...offered, percent: 0, transferred: 0, total: 0 });
    try {
      const files = await this.updater.downloadUpdate();
      await this.options.verifyDownloaded?.(files);
      if (generation !== this.generation) return;
      if (this.downloadedVersion !== offered.version) throw new Error(`The downloaded update is not version ${offered.version}.`);
      this.set({ phase: "downloaded", ...offered });
    } catch (error) {
      this.options.log?.(`update download failed: ${messageOf(error)}`);
      this.set({ phase: "error", message: messageOf(error), during: "download", update: offered });
    }
  }

  /** Mark the downloaded update as installing; false unless one is downloaded. */
  beginInstall(): OfferedUpdate | null {
    if (this.state.phase !== "downloaded") return null;
    const offered = this.offered()!;
    this.set({ phase: "installing", ...offered });
    return offered;
  }

  /** The Editor or the window refused the restart: the update stays downloaded. */
  cancelInstall(): void {
    if (this.state.phase === "installing") this.set({ ...this.offered()!, phase: "downloaded" });
  }

  /** Every window has closed: run the installer silently and start the new version afterwards. */
  finishInstall(): void {
    if (this.state.phase !== "installing") return;
    this.updater.quitAndInstall(true, true);
  }

  private offered(): OfferedUpdate | null {
    const state = this.state;
    if (state.phase === "error") return state.update ?? null;
    return "version" in state ? { version: state.version, prerelease: state.prerelease } : null;
  }

  private set(state: UpdateState): void {
    this.state = state;
    this.options.emit(state);
  }

  private schedule(ms: number): void {
    if (!this.supported) return;
    this.stop();
    this.timer = this.timers.set(() => { this.timer = null; void this.check(); }, ms);
  }
}
