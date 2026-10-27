// Optional Windows shell integration only. All document commands remain in packages/cli.
import * as fs from "node:fs/promises";
import path from "node:path";
import type { CliIntegrationState } from "../../editor/shared/desktop-bridge.ts";

export type RegistryPath = { value: string; kind: "String" | "ExpandString" | null };
export type PathSnapshot = { user: RegistryPath; machine: string; inherited: string };
export interface EnvironmentPort {
  read(): Promise<PathSnapshot>;
  /** Compare-and-set the unexpanded value and kind; notify Explorer after a successful change. */
  write(previous: RegistryPath, next: RegistryPath): Promise<void>;
  expand(value: string): string;
}

const OWNER = "io.github.ieumbird.ieumdoc.cli/v1";
const MARKER = `rem ${OWNER}`;
export const CLI_SHIM = ["@echo off", MARKER, "setlocal DisableDelayedExpansion",
  'set "ELECTRON_RUN_AS_NODE=1"',
  '"%~dp0app\\IeumDoc.exe" "%~dp0app\\resources\\cli\\cli.mjs" %*',
  "exit /b %errorlevel%", ""].join("\r\n");
type Ownership = { owner: typeof OWNER; executable: string };

function normalized(value: string, expand: EnvironmentPort["expand"]): string {
  return path.win32.normalize(expand(value.trim().replace(/^"(.*)"$/, "$1"))).replace(/[\\/]+$/, "").toLowerCase();
}

/** Preserve every unrelated character, empty segment and entry order. */
export function editUserPath(raw: string, bin: string, enabled: boolean, expand: EnvironmentPort["expand"]): string {
  const same = (entry: string) => normalized(entry, expand) === normalized(bin, expand);
  const entries = raw.split(";");
  if (enabled) return entries.some(same) ? raw : raw + (raw ? ";" : "") + bin;
  return entries.filter(entry => !same(entry)).join(";");
}

async function exists(file: string): Promise<boolean> {
  try { await fs.access(file); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function entry(file: string) {
  try { return await fs.lstat(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export class CliIntegration {
  readonly bin: string;
  readonly shim: string;
  readonly record: string;
  readonly junction: string;
  private busy = false;
  constructor(readonly executable: string, localAppData: string, readonly environment: EnvironmentPort) {
    this.bin = path.join(localAppData, "IeumDoc", "bin");
    this.shim = path.join(this.bin, "ieumdoc.cmd");
    this.record = path.join(this.bin, "owner.json");
    this.junction = path.join(this.bin, "app");
  }

  private async ownership(): Promise<Ownership | null> {
    const stat = await entry(this.record);
    if (!stat) return null;
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("CLI ownership file belongs to another program.");
    let data: Ownership;
    try { data = JSON.parse(await fs.readFile(this.record, "utf8")); }
    catch { throw new Error("CLI ownership file is unrecognized; it was not changed."); }
    if (data?.owner !== OWNER || typeof data.executable !== "string" || !path.isAbsolute(data.executable)) {
      throw new Error("CLI ownership file is unrecognized; it was not changed.");
    }
    return data;
  }

  private async ownFiles(owner: Ownership | null): Promise<void> {
    const shim = await entry(this.shim);
    if (shim && (!owner || !shim.isFile() || shim.isSymbolicLink() ||
      !(await fs.readFile(this.shim, "utf8")).startsWith(`@echo off\r\n${MARKER}\r\n`))) {
      throw new Error(`Another file already uses ${this.shim}; it was not changed.`);
    }
    const junction = await entry(this.junction);
    if (junction && (!owner || !junction.isSymbolicLink() ||
      normalized(await fs.readlink(this.junction), value => value) !== normalized(path.dirname(owner.executable), value => value))) {
      throw new Error(`Another file already uses ${this.junction}; it was not changed.`);
    }
  }

  private async conflict(snapshot: PathSnapshot): Promise<string | undefined> {
    const directories = new Set([snapshot.machine, snapshot.user.value, snapshot.inherited, this.bin].flatMap(value => value.split(";")));
    for (const raw of directories) {
      if (!raw.trim()) continue;
      const ownBin = normalized(raw, this.environment.expand) === normalized(this.bin, this.environment.expand);
      const folder = this.environment.expand(raw.trim().replace(/^"(.*)"$/, "$1"));
      // Include PowerShell scripts and extensionless npm shims as well as cmd.exe's usual PATHEXT.
      for (const extension of new Set(["", ".ps1", ".com", ".exe", ".bat", ".cmd",
        ...(process.env.PATHEXT ?? "").toLowerCase().split(";").filter(value => /^\.[a-z0-9]+$/.test(value))])) {
        if (ownBin && extension === ".cmd") continue; // ownFiles checks the reserved shim itself.
        const candidate = path.join(folder, `ieumdoc${extension}`);
        if (await entry(candidate)) return candidate;
      }
    }
    return undefined;
  }

  async state(): Promise<CliIntegrationState> {
    const snapshot = await this.environment.read();
    let owner: Ownership | null;
    try { owner = await this.ownership(); await this.ownFiles(owner); }
    catch (error) { return { status: "broken", conflict: (error as Error).message }; }
    const conflict = await this.conflict(snapshot);
    const registered = editUserPath(snapshot.user.value, this.bin, false, this.environment.expand) !== snapshot.user.value;
    if (!owner) return { status: registered ? "broken" : "off", ...(conflict ? { conflict } : {}) };
    const valid = registered && await exists(owner.executable) &&
      normalized(owner.executable, value => value) === normalized(this.executable, value => value) &&
      await exists(path.join(this.junction, "resources", "cli", "cli.mjs")) &&
      await exists(this.shim) && await fs.readFile(this.shim, "utf8") === CLI_SHIM;
    return { status: valid ? "installed" : "broken", ...(conflict ? { conflict } : {}) };
  }

  async setEnabled(enabled: boolean, uninstall = false): Promise<CliIntegrationState> {
    if (this.busy) throw new Error("A CLI integration change is already in progress.");
    this.busy = true;
    try {
      const owner = await this.ownership();
      // A different installed copy must not remove the current registration during uninstall.
      if (uninstall && (!owner || normalized(owner.executable, value => value) !== normalized(this.executable, value => value))) {
        return { status: "off" };
      }
      await this.ownFiles(owner);
      const snapshot = await this.environment.read();
      if (enabled) {
        const collision = await this.conflict(snapshot);
        if (collision) throw new Error(`Another ieumdoc command is on PATH: ${collision}`);
        if (!await exists(this.executable) || !await exists(path.join(path.dirname(this.executable), "resources", "cli", "cli.mjs"))) {
          throw new Error("CLI integration requires the installed IeumDoc app and its CLI bundle.");
        }
        await fs.mkdir(this.bin, { recursive: true });
        // Claim the record before creating other files, so a partial failure remains repairable.
        if (await entry(this.junction)) await fs.unlink(this.junction);
        await fs.writeFile(this.record, JSON.stringify({ owner: OWNER, executable: this.executable }), { flag: owner ? "w" : "wx" });
        await fs.symlink(path.dirname(this.executable), this.junction, "junction");
        await fs.writeFile(this.shim, CLI_SHIM, { flag: await entry(this.shim) ? "w" : "wx" });
      }
      const value = editUserPath(snapshot.user.value, this.bin, enabled, this.environment.expand);
      if (value !== snapshot.user.value) await this.environment.write(snapshot.user, { value, kind: snapshot.user.kind ?? "ExpandString" });
      if (!enabled && owner) {
        // Remove only these individual owned entries, never recursively delete a user directory.
        if (await entry(this.shim)) await fs.unlink(this.shim);
        if (await entry(this.junction)) await fs.unlink(this.junction);
        await fs.unlink(this.record);
      }
      return this.state();
    } finally { this.busy = false; }
  }
}
