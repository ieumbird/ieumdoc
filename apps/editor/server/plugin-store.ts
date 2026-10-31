import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ConversionJob } from "@litzio/docling/server-types";
import { PLUGIN_UI, type UiManifest, type UiRegistration } from "@litzio/plugin-api/config";

export type WorkerManifest = { id: string; version: string; workerApi?: 1; entry?: "worker.cjs"; ui?: UiManifest };
export type Installation = WorkerManifest & { directory: string; sha256: string; revision: string; uiHashes?: Record<string, string>; enabled: boolean };
export type Receipt = { job: ConversionJob; fingerprint: string; owner: string; installation: Installation; staging?: string;
  status: "running" | "success" | "error" | "cancelled" | "uncertain" };
export const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
function workerManifest(value: unknown): WorkerManifest {
  const manifest = value as WorkerManifest;
  if (!manifest || typeof manifest.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/u.test(manifest.id) ||
      typeof manifest.version !== "string" || !/^[\w.+-]{1,128}$/u.test(manifest.version) ||
      (manifest.entry !== undefined || manifest.workerApi !== undefined ? manifest.workerApi !== 1 || manifest.entry !== "worker.cjs" : !manifest.ui)) {
    throw new Error("Invalid worker manifest or incompatible worker Host API (expected 1).");
  }
  if (manifest.ui !== undefined && (!manifest.ui || manifest.ui.api !== PLUGIN_UI.api || manifest.ui.reactMajor !== PLUGIN_UI.reactMajor ||
      manifest.ui.script !== PLUGIN_UI.script || (manifest.ui.style !== undefined && manifest.ui.style !== PLUGIN_UI.style))) {
    throw new Error("Invalid UI manifest or incompatible UI Host API / React major.");
  }
  return { id: manifest.id, version: manifest.version, workerApi: manifest.workerApi, entry: manifest.entry,
    ...(manifest.ui ? { ui: { api: manifest.ui.api, reactMajor: manifest.ui.reactMajor, script: manifest.ui.script, ...(manifest.ui.style ? { style: manifest.ui.style } : {}) } } : {}) };
}
export function requestUuid(value: unknown): string {
  if (typeof value !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(value)) throw new Error("A request UUID is required.");
  return value.toLowerCase();
}

/** Only registration and request receipts are durable. SQLite's OS locks release
 * on crash; ownership never depends on a PID, clock, heartbeat or stale timeout.
 * Use a local per-user filesystem, not a network share. */
export class PluginStore {
  private db: DatabaseSync;
  private lease?: DatabaseSync;
  readonly owner = randomUUID();
  constructor(readonly directory: string) {
    mkdirSync(path.join(directory, "owners"), { recursive: true });
    this.db = new DatabaseSync(path.join(directory, "runtime.sqlite"));
    this.db.exec("PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS plugins (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }
  private transaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = action(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  list(): Installation[] { return this.db.prepare("SELECT value FROM plugins ORDER BY id").all().map(row => JSON.parse(row.value as string)); }
  register(manifestFile: string, onlyIfMissing = false, checkPath: (file: string) => void = () => {}): Installation {
    const manifest = workerManifest(JSON.parse(readFileSync(manifestFile, "utf8")));
    const files = new Map<string, Buffer>();
    for (const name of [manifest.entry, manifest.ui?.script, manifest.ui?.style]) if (name) {
      const file = path.join(path.dirname(manifestFile), name); checkPath(file);
      files.set(name, readFileSync(file));
    }
    const sha256 = digest(files.get("worker.cjs") ?? "");
    const uiHashes = manifest.ui ? Object.fromEntries([...files].filter(([name]) => name !== "worker.cjs").map(([name, bytes]) => [name, digest(bytes)])) : undefined;
    const revision = digest(JSON.stringify({ manifest, sha256, uiHashes }));
    const directory = path.join(this.directory, "installed", revision);
    mkdirSync(path.dirname(directory), { recursive: true });
    const temporary = `${directory}.${randomUUID()}.tmp`;
    mkdirSync(temporary);
    try {
      for (const [name, bytes] of files) writeFileSync(path.join(temporary, name), bytes, { flag: "wx" });
      try { renameSync(temporary, directory); }
      catch (error) { if (!existsSync(directory)) throw error; }
      for (const [name, bytes] of files) if (digest(readFileSync(path.join(directory, name))) !== digest(bytes)) throw new Error("Installed plugin hash mismatch.");
    } finally { rmSync(temporary, { recursive: true, force: true }); }
    return this.transaction(() => {
      const existing = this.list().find(item => item.id === manifest.id);
      if (onlyIfMissing && existing) return existing;
      const value: Installation = { ...manifest, directory, sha256, revision, uiHashes, enabled: true };
      this.db.prepare("INSERT OR REPLACE INTO plugins VALUES (?, ?)").run(manifest.id, JSON.stringify(value));
      return value;
    });
  }
  uiList(): UiRegistration[] {
    return this.list().filter(item => item.enabled && item.ui).map(item => ({ id: item.id, revision: item.revision, ui: item.ui! }));
  }
  uiAsset(id: string, revision: string, name: string): Buffer {
    const item = this.list().find(item => item.id === id && item.enabled && item.revision === revision);
    if (!item?.ui || (name !== item.ui.script && name !== item.ui.style) || !item.uiHashes?.[name]) throw new Error("UI plugin asset is unavailable.");
    const bytes = readFileSync(path.join(item.directory, name));
    if (digest(bytes) !== item.uiHashes[name]) throw new Error("Installed UI asset hash mismatch.");
    return bytes;
  }
  unregister(id: string): void {
    this.transaction(() => {
      const item = this.list().find(item => item.id === id);
      if (!item) throw new Error("Worker plugin is not registered.");
      item.enabled = false;
      this.db.prepare("UPDATE plugins SET value=? WHERE id=?").run(JSON.stringify(item), id);
    });
  }
  private holdOwnership(): void {
    if (this.lease) return;
    const lease = new DatabaseSync(path.join(this.directory, "owners", `${this.owner}.sqlite`));
    lease.exec("CREATE TABLE owner (id TEXT); BEGIN IMMEDIATE");
    this.lease = lease;
  }
  private ownerAlive(owner: string): boolean {
    if (owner === this.owner && this.lease) return true;
    const file = path.join(this.directory, "owners", `${requestUuid(owner)}.sqlite`);
    if (!existsSync(file)) return false;
    const probe = new DatabaseSync(file);
    try { probe.exec("BEGIN IMMEDIATE; ROLLBACK"); return false; }
    catch (error) {
      if ((error as { errcode?: number }).errcode === 5) return true; // SQLITE_BUSY
      throw error; // I/O/corruption is not proof of a dead owner.
    } finally { probe.close(); }
  }
  private read(id: string): Receipt | null {
    const row = this.db.prepare("SELECT value FROM requests WHERE id=?").get(id);
    return row ? JSON.parse(row.value as string) : null;
  }
  private save(receipt: Receipt) {
    this.db.prepare("INSERT OR REPLACE INTO requests VALUES (?, ?)").run(receipt.job.id, JSON.stringify(receipt));
  }
  get(id: string): Receipt | null {
    return this.transaction(() => {
      const receipt = this.read(requestUuid(id));
      if (receipt?.status === "running" && !this.ownerAlive(receipt.owner)) {
        receipt.status = "uncertain"; receipt.job.state = "error";
        receipt.job.error = "Conversion outcome is uncertain after Host interruption; it is never automatically retried. The server task may continue.";
        receipt.job.failure = { code: "output", taskId: receipt.job.progress.taskId };
        this.save(receipt);
      }
      return receipt;
    });
  }
  admit(job: ConversionJob, fingerprint: string): { receipt: Receipt; fresh: boolean } {
    this.holdOwnership();
    return this.transaction(() => {
      const existing = this.read(job.id);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new Error("Request UUID conflicts with an admitted conversion.");
        return { receipt: existing, fresh: false };
      }
      const installation = this.list().find(item => item.id === "docling" && item.enabled);
      if (!installation) throw new Error("The Docling worker plugin is not registered.");
      workerManifest(installation);
      if (!installation.entry || !/^[a-f\d]{64}$/u.test(installation.sha256) || !/^[a-f\d]{64}$/u.test(installation.revision) ||
        installation.directory !== path.join(this.directory, "installed", installation.revision)) throw new Error("Invalid installed worker location.");
      const receipt: Receipt = { job, fingerprint, owner: this.owner, installation, status: "running" };
      this.save(receipt);
      return { receipt, fresh: true };
    });
  }
  update(receipt: Receipt) {
    this.transaction(() => {
      const current = this.read(receipt.job.id);
      if (current?.owner !== this.owner || current.status !== "running") throw new Error("Conversion ownership was lost.");
      this.save(receipt);
    });
  }
  close() { this.lease?.close(); this.lease = undefined; this.db.close(); }
}
