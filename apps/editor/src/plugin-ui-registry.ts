import { PLUGIN_UI, type UiRegistration } from "@document-plugins/api/config";
import type { UiContributions, UiHost, UiModule } from "@document-plugins/api/ui";

export type ActiveUi = UiRegistration & { contributions?: UiContributions; error?: string };
export function contributionNotices(plugin: ActiveUi | undefined, kind: string, data: unknown) {
  try {
    const notices = plugin?.contributions?.tabs.find(tab => tab.id === kind)?.notices?.(data) ?? [];
    if (!Array.isArray(notices) || notices.some(notice => !notice || typeof notice.id !== "string" || typeof notice.message !== "string" || !["error", "warning"].includes(notice.severity))) throw Error("Invalid plugin notices.");
    return notices;
  }
  catch (error) { return [{ id: "notice-error", severity: "error" as const, message: `${plugin?.id}: ${String(error)}` }]; }
}
export function checkUiCompatibility(registration: UiRegistration, reactVersion: string) {
  if (registration.ui.api !== PLUGIN_UI.api || registration.ui.reactMajor !== PLUGIN_UI.reactMajor ||
      Number(reactVersion.split(".")[0]) !== registration.ui.reactMajor || registration.ui.script !== PLUGIN_UI.script ||
      (registration.ui.style !== undefined && registration.ui.style !== PLUGIN_UI.style)) throw new Error("Incompatible UI Host API / React major.");
}
function checkContributions(value: UiContributions) {
  if (!value || typeof value.dispose !== "function") throw new Error("Invalid UI activation.");
  for (const [type, items] of [["commands", value.commands], ["sidebar", value.sidebar], ["tabs", value.tabs]] as const) {
    if (!Array.isArray(items)) throw new Error(`Invalid UI ${type}.`);
    const ids = new Set<string>();
    for (const item of items) {
      if (!item || !/^[a-z][a-z0-9-]*$/u.test(item.id) || ids.has(item.id) || typeof item.label !== "string" ||
        (type === "tabs" ? typeof (item as UiContributions["tabs"][number]).open !== "function" || !(item as UiContributions["tabs"][number]).View
          : typeof (item as UiContributions["commands"][number]).run !== "function")) throw new Error(`Invalid UI ${type} contribution.`);
      if ("keywords" in item && item.keywords !== undefined && (!Array.isArray(item.keywords) || item.keywords.some(word => typeof word !== "string"))) throw new Error("Invalid UI command keywords.");
      if ("className" in item && item.className !== undefined && typeof item.className !== "string") throw new Error("Invalid UI tab class name.");
      ids.add(item.id);
    }
  }
}
type Loaded = { module: UiModule; release(): void };
type Entry = { state: ActiveUi; controller: AbortController; loaded?: Loaded; alive: boolean };
/** Pending loads cannot revive detached registrations. One plugin changing never
 * remounts another. ESM module memory remains owned by the browser realm. */
export class UiRegistry {
  private entries = new Map<string, Entry>();
  private closed = false;
  constructor(private reactVersion: string, private publish: (states: ActiveUi[]) => void,
    private load: (registration: UiRegistration, signal: AbortSignal) => Promise<Loaded>,
    private host: (registration: UiRegistration, guard: () => void, signal: AbortSignal) => UiHost,
    private report: (error: unknown) => void) {}
  private emit() { this.publish([...this.entries.values()].map(entry => entry.state)); }
  private dispose(entry: Entry) {
    try { entry.state.contributions?.dispose(); } catch (error) { this.report(error); }
    entry.loaded?.release();
  }
  reconcile(registrations: UiRegistration[]) {
    if (this.closed) return;
    const removed: Entry[] = [], added: Entry[] = [];
    for (const [id, entry] of this.entries) {
      const next = registrations.find(registration => registration.id === id);
      if (!next || next.revision !== entry.state.revision || JSON.stringify(next.ui) !== JSON.stringify(entry.state.ui)) {
        entry.alive = false; entry.controller.abort(); this.entries.delete(id); removed.push(entry);
      }
    }
    for (const registration of registrations) if (!this.entries.has(registration.id)) {
      const entry: Entry = { state: registration, controller: new AbortController(), alive: true };
      this.entries.set(registration.id, entry); added.push(entry);
    }
    if (!removed.length && !added.length) return;
    this.emit(); // Caller commits unmount before resource disposal.
    for (const entry of removed) this.dispose(entry);
    for (const entry of added) void this.activate(entry);
  }
  private async activate(entry: Entry) {
    let contributions: UiContributions | undefined;
    try {
      checkUiCompatibility(entry.state, this.reactVersion);
      const loaded = await this.load(entry.state, entry.controller.signal);
      if (!entry.alive) { loaded.release(); return; }
      entry.loaded = loaded;
      const guard = () => { if (!entry.alive) throw new Error("Plugin is disabled."); };
      contributions = loaded.module.activate(this.host(entry.state, guard, entry.controller.signal));
      checkContributions(contributions);
      entry.state = { ...entry.state, contributions };
    } catch (error) {
      try { contributions?.dispose?.(); } catch (error) { this.report(error); }
      entry.loaded?.release(); entry.loaded = undefined;
      if (!entry.alive) return;
      entry.state = { ...entry.state, error: String(error) };
    }
    if (entry.alive) this.emit();
  }
  close() {
    this.closed = true;
    for (const entry of this.entries.values()) { entry.alive = false; entry.controller.abort(); }
    const entries = [...this.entries.values()]; this.entries.clear();
    // Parent unmount finishes child cleanup before activation resources go away.
    queueMicrotask(() => { for (const entry of entries) this.dispose(entry); });
  }
}
