import { useMessageState } from "../ui-message.ts";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useRef, useState } from "react";
import { ArrowLeft, FileText, Info, Palette, History } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog.tsx";
import type { DesktopBridge, DesktopInfo, OfferedUpdate, ReleaseChannel, UpdateState } from "../../shared/desktop-bridge.ts";
import { RecoveryDeleteDialog } from "./Recovery.tsx";
import { Notice } from "../ui/primitives.tsx";
import { ACCENT_COLORS, readAccentColor, writeAccentColor, writeUiLanguage, THEMES, writeTheme, type AccentColor, type UiLanguage, type ThemePreference } from "../preferences.ts";
import { applyTheme, currentTheme } from "../theme.ts";

const ACCENT_LABELS = { blue: "Blue", violet: "Violet", plum: "Plum", teal: "Teal", green: "Green", graphite: "Graphite" } as const;
const THEME_LABELS = { system: "System", light: "Light", dark: "Dark" } as const;

const CHANNELS: { value: ReleaseChannel; label: string; hint: string }[] = [
  { value: "stable", get label() { return i18n.t("Stable"); }, get hint() { return i18n.t("Tested releases."); } },
  { value: "beta", get label() { return i18n.t("Beta"); }, get hint() { return i18n.t("New features earlier, and every Stable release."); } },
];

const kind = (update: OfferedUpdate) => (update.prerelease ? i18n.t("Beta") : i18n.t("Stable"));

/** What updating is doing, in one sentence. Every phase comes from the Desktop updater. */
export function updateStatusText(info: DesktopInfo): string {
  const state: UpdateState = info.update;
  const channel = info.channel === "beta" ? i18n.t("Beta") : i18n.t("Stable");
  switch (state.phase) {
    case "idle":
      return info.updatesSupported ? i18n.t("IeumDoc checks for updates automatically.") : i18n.t("Updates run in the installed app.");
    case "checking":
      return i18n.t("Checking for updates…");
    case "no-stable-release":
      return i18n.t("No Stable release has been published yet.");
    case "up-to-date":
      return state.latest && state.latest !== info.version
        ? i18n.t("You have {{version}}. The newest {{channel}} release is {{latest}}; IeumDoc updates when a newer {{channel}} release is published.", { version: info.version, channel: channel, latest: state.latest })
        : i18n.t("IeumDoc is up to date.");
    case "available":
      return i18n.t("IeumDoc {{version}} ({{channel}}) is available. You have {{current}}.", { version: state.version, channel: kind(state), current: info.version });
    case "downloading":
      return i18n.t("Downloading IeumDoc {{version}}… {{percent}}%", { version: state.version, percent: Math.floor(state.percent) });
    case "downloaded":
      return i18n.t("IeumDoc {{version}} is downloaded and verified. Restart to install it.", { version: state.version });
    case "installing":
      return i18n.t("Restarting to install IeumDoc {{version}}…", { version: state.version });
    case "error":
      return state.during === "check" ? i18n.t("Could not check for updates: {{reason}}", { reason: state.message })
        : state.during === "download" ? i18n.t("Could not download the update: {{reason}}", { reason: state.message })
        : i18n.t("Could not install the update: {{reason}}", { reason: state.message });
  }
}

export type SettingsCategory = "appearance" | "recovery" | "about";

type SettingsDialogProps = {
  open: boolean;
  category: SettingsCategory;
  onCategoryChange(category: SettingsCategory): void;
  documentName: string;
  unsaved: boolean;
  documentSettingsDisabled: boolean;
  documentSettingsHint: string;
  onDocumentSettings(): void;
  desktop?: DesktopBridge;
  recoveryCount?: number;
  recoveryProblem?: string;
  onClearRecovery?(): Promise<void>;
  info: DesktopInfo | null;
  onInfo(info: DesktopInfo): void;
  /** Restart to install; resolves to why not, or "" when the app is restarting. */
  onInstall(): Promise<string>;
  /** Resolve the opener or its current visible replacement when Settings closes. */
  returnFocus(): HTMLElement | true;
  onClose(): void;
};

/** Shared local recovery settings; About and update controls require the Desktop bridge. */
export function SettingsDialog({ open, category, onCategoryChange, documentName, unsaved, documentSettingsDisabled, documentSettingsHint, onDocumentSettings, desktop, info, onInfo, onInstall, returnFocus, onClose, recoveryCount = 0, recoveryProblem: storageProblem, onClearRecovery }: SettingsDialogProps) {
  useTranslation();
  const backButton = useRef<HTMLButtonElement>(null);
  const connectDocumentSettings = useRef(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const clearButton = useRef<HTMLButtonElement>(null);
  const [clearing, setClearing] = useState(false);
  const [recoveryProblem, setRecoveryProblem] = useMessageState("");
  const [problem, setProblem] = useMessageState("");
  const [languageProblem, setLanguageProblem] = useState(false);
  const [accent, setAccent] = useState(readAccentColor);
  const [accentProblem, setAccentProblem] = useState(false);
  const [theme, setTheme] = useState(currentTheme);
  const [themeProblem, setThemeProblem] = useState(false);
  const state = info?.update;
  const offered = state && "version" in state ? state : state?.phase === "error" ? state.update : undefined;
  const busy = state?.phase === "downloading" || state?.phase === "installing";
  const run = (action: () => Promise<unknown>) => {
    setProblem("");
    void action().catch((error: unknown) => setProblem(error instanceof Error ? error.message : String(error)));
  };
  const close = () => { setProblem(""); onClose(); };
  const categories = [
    { id: "appearance", label: i18n.t("Appearance & language"), icon: Palette },
    { id: "recovery", label: i18n.t("Saving & recovery"), icon: History },
    ...(desktop ? [{ id: "about" as const, label: i18n.t("About & updates"), icon: Info }] : []),
  ] as const;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}
      onOpenChangeComplete={next => {
        if (!next && connectDocumentSettings.current) {
          connectDocumentSettings.current = false;
          onDocumentSettings();
        }
      }}>
      <DialogContent className="settings-screen" data-testid="settings-dialog" showCloseButton={false}
        initialFocus={backButton} finalFocus={() => connectDocumentSettings.current ? false : returnFocus()}>
        <header className="settings-topbar">
          <Button ref={backButton} data-testid="settings-back" variant="ghost" size="sm" onClick={close}>
            <ArrowLeft aria-hidden="true" />{i18n.t(documentName ? "Back to document" : "Back to start")}
          </Button>
          {documentName ? <span className="settings-document" title={documentName}>
            <FileText aria-hidden="true" /><span className="settings-document-name">{documentName}</span>
            {unsaved ? <span role="img" aria-label={i18n.t("Unsaved changes")}>●</span> : null}
          </span> : null}
        </header>
        <DialogDescription className="sr-only">{i18n.t("Appearance, local recovery and application information.")}</DialogDescription>
        <div className="settings-body">
          <aside className="settings-navigation">
            <DialogTitle>{i18n.t("Settings")}</DialogTitle>
            <nav aria-label={i18n.t("Settings categories")}>
              {categories.map(({ id, label, icon: Icon }) => <Button key={id} variant="ghost"
                aria-current={category === id ? "page" : undefined} onClick={() => onCategoryChange(id)}>
                <Icon aria-hidden="true" />{label}
              </Button>)}
            </nav>
            <div className="settings-document-note">
              <p>{i18n.t("Heading numbers, reference style and bibliography are saved in each document.")}</p>
              {documentName ? <Button variant="ghost" className="settings-document-link" disabled={documentSettingsDisabled}
                title={documentSettingsHint || undefined} onClick={() => {
                  connectDocumentSettings.current = true;
                  close();
                }}>{i18n.t("Open document settings")}</Button> : null}
            </div>
          </aside>
          <main className="settings-content" aria-labelledby={`settings-category-${category}`}>
            <div className="settings-content-inner">
              <header className="settings-category-header">
                <h2 id={`settings-category-${category}`}>{categories.find(item => item.id === category)?.label}</h2>
                <p>{category === "appearance" ? i18n.t("How IeumDoc looks on this device.")
                  : category === "recovery" ? i18n.t("Local recovery keeps applied edits on this device.")
                  : i18n.t("Version and how IeumDoc Desktop receives updates.")}</p>
              </header>
              {category === "appearance" ? <>
                <section className="settings-section" aria-labelledby="settings-theme">
                  <div className="settings-label">
                    <h3 id="settings-theme" className="settings-heading">{i18n.t("Theme")}</h3>
                    <p>{i18n.t("System follows your device’s appearance.")}</p>
                  </div>
                  <select className="form-select h-[var(--size-control)] w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring" aria-labelledby="settings-theme" data-testid="theme"
                    value={theme} onChange={event => {
                      const choice = event.target.value as ThemePreference;
                      void applyTheme(choice);
                      setTheme(choice);
                      setThemeProblem(!writeTheme(choice));
                    }}>
                    {THEMES.map(value => <option key={value} value={value}>{i18n.t(THEME_LABELS[value])}</option>)}
                  </select>
                  {themeProblem ? <p role="alert">{i18n.t("Theme could not be saved. This choice applies until you close this page.")}</p> : null}
                </section>
                <section className="settings-section" aria-labelledby="settings-language">
                  <div className="settings-label">
                    <h3 id="settings-language" className="settings-heading">{i18n.t("Display language")}</h3>
                    <p>{i18n.t("Remembered here; never saved in the document.")}</p>
                  </div>
                  <select className="form-select h-[var(--size-control)] w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring" aria-labelledby="settings-language" data-testid="ui-language"
                    value={i18n.resolvedLanguage} onChange={event => {
                      const language = event.target.value as UiLanguage;
                      void i18n.changeLanguage(language);
                      setLanguageProblem(!writeUiLanguage(language));
                    }}>
                    <option value="ko" lang="ko">한국어</option>
                    <option value="en" lang="en">English</option>
                  </select>
                  {languageProblem ? <p role="alert">{i18n.t("Language preference could not be saved. This choice applies until you close this page.")}</p> : null}
                </section>
                <section className="settings-section" aria-labelledby="settings-accent">
                  <div className="settings-label">
                    <h3 id="settings-accent" className="settings-heading">{i18n.t("Accent color")}</h3>
                    <p>{i18n.t("Remembered here; never saved in the document.")}</p>
                  </div>
                  <select className="form-select h-[var(--size-control)] w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring" aria-labelledby="settings-accent" data-testid="accent-color"
                    value={accent} onChange={event => {
                      const color = event.target.value as AccentColor;
                      document.documentElement.dataset.accent = color;
                      setAccent(color);
                      setAccentProblem(!writeAccentColor(color));
                    }}>
                    {ACCENT_COLORS.map(color => <option key={color} value={color}>{i18n.t(ACCENT_LABELS[color])}</option>)}
                  </select>
                  {accentProblem ? <p role="alert">{i18n.t("Accent color could not be saved. This choice applies until you close this page.")}</p> : null}
                </section>
              </> : null}
              {category === "recovery" ? <section className="settings-group" aria-labelledby="settings-recovery">
                <h3 id="settings-recovery" className="settings-group-heading">{i18n.t("Local recovery")}</h3>
                <div className="settings-section">
                  <div className="settings-label">
                    <h4 className="settings-heading">{i18n.t("Recovery records")}</h4>
                    <p className="settings-status">{storageProblem || i18n.t("recoveryCount", { count: recoveryCount })}</p>
                    <p>{i18n.t("Applied edits are recorded on this device in this browser or app profile. Records are separate from your original files and are not shared with other devices or browsers.")}</p>
                  </div>
                  <Button ref={clearButton} size="sm" variant="secondary" onClick={() => setClearConfirm(true)}>{i18n.t("Clear all recovery records…")}</Button>
                </div>
                <div className="settings-section settings-section--stacked">
                  <h4 className="settings-heading">{i18n.t("What is kept")}</h4>
                  <ul className="settings-recovery-details">
                    <li>{i18n.t("Records expire 10 days after the last recording, at the next startup or cleanup. Closing a window keeps them. A clean Save, a tab's Don't save, a successful Reload, or Delete record removes that session's record.")}</li>
                    <li>{i18n.t("Unapplied property drafts, Undo history, selection, pending requests and image files are not backed up. Recording may fail; changes after the last record may be lost. Saving the original and recording recovery are separate operations.")}</li>
                  </ul>
                </div>
                <RecoveryDeleteDialog open={clearConfirm} pending={clearing} finalFocus={clearButton}
                  onCancel={() => setClearConfirm(false)} onDelete={() => {
                    setClearing(true); setRecoveryProblem("");
                    void onClearRecovery?.().then(() => setClearConfirm(false)).catch(error => setRecoveryProblem(String(error))).finally(() => { setClearConfirm(false); setClearing(false); });
                  }} />
                {recoveryProblem ? <p role="alert">{recoveryProblem}</p> : null}
              </section> : null}
              {category === "about" && info && desktop ? (
                <section className="settings-group" aria-labelledby="settings-about">
                  <h3 id="settings-about" className="settings-group-heading">{i18n.t("About")}</h3>
                  <dl className="settings-facts settings-section">
                    <dt>{i18n.t("Version")}</dt>
                    <dd data-testid="app-version">{info.version}</dd>
                  </dl>
                  <h3 className="settings-group-heading">{i18n.t("Updates")}</h3>
                  <div className="settings-section settings-section--stacked">
                    <fieldset className="settings-channel" disabled={busy}>
                      <legend>{i18n.t("Release channel")}</legend>
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
                  </div>
                  <div className="settings-section">
                    <div className="settings-label">
                      <h4 className="settings-heading">{i18n.t("Updates")}</h4>
                      <p className="settings-status" role="status" data-testid="update-status" data-phase={state?.phase}>{updateStatusText(info)}</p>
                    </div>
                    <div className="settings-actions">
                      {state?.phase === "available" || (state?.phase === "error" && state.during === "download") ? (
                        <Button size="sm" onClick={() => run(() => desktop.downloadUpdate())}>{i18n.t("Download update")}</Button>
                      ) : state?.phase === "downloaded" ? (
                        <Button size="sm" onClick={() => run(async () => { const reason = await onInstall(); if (reason) setProblem(reason); })}>{i18n.t("Restart to update")}</Button>
                      ) : (
                        <Button size="sm" variant="secondary" disabled={!info.updatesSupported || state?.phase === "checking" || busy}
                          onClick={() => run(() => desktop.checkForUpdates())}>{i18n.t("Check for updates")}</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => run(() => desktop.openReleaseNotes(offered?.version))}>{i18n.t("Release notes")}</Button>
                    </div>
                    {state?.phase === "downloading" ? (
                      <progress className="settings-progress" max={100} value={state.percent} aria-label={i18n.t("Update download")} />
                    ) : null}
                    {problem ? <Notice tone="error" data-testid="update-problem">{problem}</Notice> : null}
                  </div>
                </section>
              ) : category === "about" && desktop ? <p className="settings-status">{i18n.t("Loading…")}</p> : null}
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
