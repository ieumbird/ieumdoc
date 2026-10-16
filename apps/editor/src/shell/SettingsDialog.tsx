import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import type { DesktopBridge, DesktopInfo, OfferedUpdate, ReleaseChannel, UpdateState } from "../../shared/desktop-bridge.ts";
import { Notice } from "../ui/primitives.tsx";

const CHANNELS: { value: ReleaseChannel; label: string; hint: string }[] = [
  { value: "stable", label: "Stable", hint: "Tested releases." },
  { value: "beta", label: "Beta", hint: "New features earlier, and every Stable release." },
];

const kind = (update: OfferedUpdate) => (update.prerelease ? "Beta" : "Stable");

/** What updating is doing, in one sentence. Every phase comes from the Desktop updater. */
export function updateStatusText(info: DesktopInfo): string {
  const state: UpdateState = info.update;
  const channel = info.channel === "beta" ? "Beta" : "Stable";
  switch (state.phase) {
    case "idle":
      return info.updatesSupported ? "IeumDoc checks for updates automatically." : "Updates run in the installed app.";
    case "checking":
      return "Checking for updates…";
    case "no-stable-release":
      return "No Stable release has been published yet.";
    case "up-to-date":
      return state.latest && state.latest !== info.version
        ? `You have ${info.version}. The newest ${channel} release is ${state.latest}; IeumDoc updates when a newer ${channel} release is published.`
        : "IeumDoc is up to date.";
    case "available":
      return `IeumDoc ${state.version} (${kind(state)}) is available. You have ${info.version}.`;
    case "downloading":
      return `Downloading IeumDoc ${state.version}… ${Math.floor(state.percent)}%`;
    case "downloaded":
      return `IeumDoc ${state.version} is downloaded and verified. Restart to install it.`;
    case "installing":
      return `Restarting to install IeumDoc ${state.version}…`;
    case "error":
      return state.during === "check" ? `Could not check for updates: ${state.message}`
        : state.during === "download" ? `Could not download the update: ${state.message}`
        : `Could not install the update: ${state.message}`;
  }
}

type SettingsDialogProps = {
  open: boolean;
  desktop?: DesktopBridge;
  recoveryCount?: number;
  recoveryProblem?: string;
  onClearRecovery?(): Promise<void>;
  info: DesktopInfo | null;
  onInfo(info: DesktopInfo): void;
  /** Restart to install; resolves to why not, or "" when the app is restarting. */
  onInstall(): Promise<string>;
  /** The control that opened Settings, which gets focus back when it closes. */
  returnFocus?: RefObject<HTMLElement | null>;
  onClose(): void;
};

/** Shared local recovery settings; About and update controls require the Desktop bridge. */
export function SettingsDialog({ open, desktop, info, onInfo, onInstall, returnFocus, onClose, recoveryCount = 0, recoveryProblem: storageProblem, onClearRecovery }: SettingsDialogProps) {
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [recoveryProblem, setRecoveryProblem] = useState("");
  const [problem, setProblem] = useState("");
  const state = info?.update;
  const offered = state && "version" in state ? state : state?.phase === "error" ? state.update : undefined;
  const busy = state?.phase === "downloading" || state?.phase === "installing";
  const run = (action: () => Promise<unknown>) => {
    setProblem("");
    void action().catch((error: unknown) => setProblem(error instanceof Error ? error.message : String(error)));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setProblem(""); onClose(); } }}>
      <DialogContent className="settings-dialog" data-testid="settings-dialog" finalFocus={() => returnFocus?.current ?? true}>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Local recovery and application information.</DialogDescription>
        </DialogHeader>
        <section className="settings-section" aria-labelledby="settings-recovery">
          <h3 id="settings-recovery" className="settings-heading">Local recovery</h3>
          <p className="settings-status">Applied edits are recorded on this device in this browser or app profile. Records are separate from your original files and are not shared with other devices or browsers.</p>
          <p className="settings-status">Records expire 10 days after the last recording, at the next startup or cleanup. Closing a window keeps them. A clean Save, a tab's Don't save, a successful Reload, or Delete record removes that session's record.</p>
          <p className="settings-status">Unapplied property drafts, Undo history, selection, pending requests and image files are not backed up. Recording may fail; changes after the last record may be lost. Saving the original and recording recovery are separate operations.</p>
          <p className="settings-status">{storageProblem || `${recoveryCount} local recovery ${recoveryCount === 1 ? "record" : "records"}.`}</p>
          {clearConfirm ? <div className="grid gap-3">
            <p className="settings-status">Delete all local records? Scheduled recordings are cancelled too. Only the next applied edit starts recording again, including edits in other open windows. Your open work and original files stay unchanged.</p>
            <div className="settings-actions">
              <Button size="sm" variant="secondary" disabled={clearing} onClick={() => setClearConfirm(false)}>Cancel</Button>
              <Button size="sm" variant="destructive" disabled={clearing} onClick={() => {
                setClearing(true); setRecoveryProblem("");
                void onClearRecovery?.().then(() => setClearConfirm(false)).catch(error => setRecoveryProblem(String(error))).finally(() => setClearing(false));
              }}>Delete all records</Button>
            </div>
          </div> : <Button size="sm" variant="secondary" onClick={() => setClearConfirm(true)}>Clear all recovery records…</Button>}
          {recoveryProblem ? <p role="alert">{recoveryProblem}</p> : null}
        </section>
        {info && desktop ? (
          <section className="settings-section" aria-labelledby="settings-about">
            <h3 id="settings-about" className="settings-heading">About</h3>
            <dl className="settings-facts">
              <dt>Version</dt>
              <dd data-testid="app-version">{info.version}</dd>
            </dl>
            <fieldset className="settings-channel" disabled={busy}>
              <legend>Release channel</legend>
              {CHANNELS.map((channel) => (
                <label key={channel.value} className="settings-choice">
                  <input
                    type="radio"
                    name="release-channel"
                    value={channel.value}
                    checked={info.channel === channel.value}
                    onChange={() => run(async () => onInfo(await desktop.setChannel(channel.value)))}
                  />
                  <span className="settings-choice-label">{channel.label}</span>
                  <span className="settings-choice-hint">{channel.hint}</span>
                </label>
              ))}
            </fieldset>
            <p className="settings-status" role="status" data-testid="update-status" data-phase={state?.phase}>{updateStatusText(info)}</p>
            {state?.phase === "downloading" ? (
              <progress className="settings-progress" max={100} value={state.percent} aria-label="Update download" />
            ) : null}
            {problem ? <Notice tone="error" data-testid="update-problem">{problem}</Notice> : null}
            <div className="settings-actions">
              {state?.phase === "available" || (state?.phase === "error" && state.during === "download") ? (
                <Button size="sm" onClick={() => run(() => desktop.downloadUpdate())}>Download update</Button>
              ) : state?.phase === "downloaded" ? (
                <Button size="sm" onClick={() => run(async () => { const reason = await onInstall(); if (reason) setProblem(reason); })}>Restart to update</Button>
              ) : (
                <Button size="sm" variant="secondary" disabled={!info.updatesSupported || state?.phase === "checking" || busy}
                  onClick={() => run(() => desktop.checkForUpdates())}>Check for updates</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => run(() => desktop.openReleaseNotes(offered?.version))}>Release notes</Button>
            </div>
          </section>
        ) : desktop ? <p className="settings-status">Loading…</p> : null}
      </DialogContent>
    </Dialog>
  );
}
