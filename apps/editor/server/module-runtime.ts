/** Branch-only experiment: trusted Docling worker, disk authority, no daemon or session store. */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { DoclingHost } from "@ieumdoc/docling/server";
import type { ConversionJob } from "@ieumdoc/docling/server-types";

export const modulesDirectory = () => path.resolve(process.env.IEUMDOC_MODULES_DIR ?? path.join(os.homedir(), ".ieumdoc", "modules"));
type Manifest = { id: "docling"; version: string; hostApiVersion: 1; entrypoint: string; permissions: string[];
  ui?: { hostApiVersion: number; entrypoint: string; stylesheet: string } };
type Registration = { manifest: Manifest; directory: string; enabled: boolean; sha256: string; uiHashes?: { script: string; style: string } };
type Run = ConversionJob & { ownerPid: number; hostId: string; fingerprint: string; moduleVersion: string; stage: string; workerPid?: number; readyMs?: number; elapsedMs?: number };
const permissions = ["read-input", "write-staging", "network-docling"];
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const read = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8"));
function atomic(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { flag: "wx" }); renameSync(temp, file); }
  finally { rmSync(temp, { force: true }); }
}
function manifestAt(file: string): Manifest {
  const value = read<Manifest>(file);
  if (value.id !== "docling" || typeof value.version !== "string" || !/^[a-zA-Z0-9.+-]{1,80}$/u.test(value.version) || value.hostApiVersion !== 1
    || !/^[a-zA-Z0-9_-]+\.cjs$/u.test(value.entrypoint) || !Array.isArray(value.permissions)
    || value.permissions.length !== permissions.length || permissions.some(p => !value.permissions.includes(p))) {
    throw new Error("Unsupported Docling manifest (Host API 1, bundled CJS worker and exact requested permissions required).");
  }
  if (value.ui && (!Number.isSafeInteger(value.ui.hostApiVersion) || value.ui.hostApiVersion < 1
    || !/^[a-zA-Z0-9_-]+\.mjs$/u.test(value.ui.entrypoint) || !/^[a-zA-Z0-9_-]+\.css$/u.test(value.ui.stylesheet))) {
    throw new Error("Unsupported Docling UI manifest (versioned bundled ESM and stylesheet required).");
  }
  return value;
}
/** One command surface, also used by the running Desktop/HTTP transports. No implicit install. */
export function moduleCommand(action: string, manifestFile?: string, root = modulesDirectory()) {
  mkdirSync(root, { recursive: true });
  const registry = path.join(root, "registry.json");
  if (action === "list") return existsSync(registry) ? read<Registration>(registry) : null;
  const lock = path.join(root, "registry.lock");
  // Short synchronous critical section; a crashed owner leaves a visible lock for manual inspection.
  try { mkdirSync(lock); } catch { throw new Error("Module registry is busy or has an abandoned registry.lock; inspect its owner before removal."); }
  try {
    writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, at: Date.now() }));
    if (action === "register") {
      if (!manifestFile) throw new Error("A manifest path is required.");
      const source = realpathSync(manifestFile), manifest = manifestAt(source);
      const entry = path.join(path.dirname(source), manifest.entrypoint);
      if (!statSync(entry).isFile()) throw new Error("Worker entrypoint must be a file.");
      const directory = path.join(root, "docling", randomUUID());
      mkdirSync(directory, { recursive: true });
      cpSync(entry, path.join(directory, manifest.entrypoint), { errorOnExist: true });
      atomic(path.join(directory, "manifest.json"), manifest);
      const registration: Registration = { manifest, directory, enabled: true, sha256: digest(readFileSync(path.join(directory, manifest.entrypoint))) };
      if (manifest.ui) {
        for (const file of [manifest.ui.entrypoint, manifest.ui.stylesheet]) {
          cpSync(path.join(path.dirname(source), file), path.join(directory, file), { errorOnExist: true });
        }
        registration.uiHashes = { script: digest(readFileSync(path.join(directory, manifest.ui.entrypoint))),
          style: digest(readFileSync(path.join(directory, manifest.ui.stylesheet))) };
      }
      atomic(registry, registration); return registration;
    }
    if (action !== "disable" && action !== "enable") throw new Error("Use module register <manifest>, enable, disable or list.");
    const registration = read<Registration>(registry);
    registration.enabled = action === "enable"; atomic(registry, registration); return registration;
  } finally { rmSync(lock, { recursive: true, force: true }); }
}

/** Only registered immutable UI assets, never arbitrary installation-folder paths. */
export function moduleUi(asset?: string | null, revision?: string | null, root = modulesDirectory()) {
  const registration = moduleCommand("list", undefined, root);
  if (!registration?.enabled || !registration.manifest.ui || !registration.uiHashes) {
    if (asset) throw new Error("Docling module is disabled or has no UI bundle.");
    return { enabled: false } as const;
  }
  const ui = registration.manifest.ui;
  const key = digest(JSON.stringify([registration.directory, ui, registration.uiHashes]));
  if (!asset) return { enabled: true, hostApiVersion: ui.hostApiVersion, revision: key } as const;
  if (revision !== key || !["script", "style"].includes(asset)) throw new Error("UI registration changed or asset is invalid.");
  if (ui.hostApiVersion !== 1) throw new Error(`Unsupported UI Host API ${ui.hostApiVersion}; expected 1.`);
  const content = readFileSync(path.join(registration.directory, asset === "script" ? ui.entrypoint : ui.stylesheet));
  if (digest(content) !== registration.uiHashes[asset as "script" | "style"]) throw new Error("Registered UI bundle changed; register again after inspection.");
  return { content, contentType: asset === "script" ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8" } as const;
}
const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}

export class ModuleDoclingHost extends DoclingHost {
  private readonly root = modulesDirectory();
  private readonly hostId = randomUUID();
  private readonly active = new Map<string, { child: ChildProcess; done: Promise<void>; stop(reason: string): void }>();
  private latest?: string;
  private closing = false;
  constructor(settings: string, private readonly resolveFile: (file: string, create?: boolean) => string) {
    super(settings, resolveFile);
  }
  module(action: string, file?: string) { return moduleCommand(action, file ? this.resolveFile(file) : undefined, this.root); }
  private runFile(id: string) { return path.join(this.root, "runs", id, "run.json"); }
  private load(id: string): Run {
    if (!validId(id)) throw new Error("A request UUID is required.");
    const run = read<Run>(this.runFile(id));
    this.resolveFile(run.input); this.resolveFile(run.output, true);
    // Other live Hosts' runs stay running. A restart never resubmits an accepted request.
    if (run.state === "running" && (!alive(run.ownerPid) || run.hostId === this.hostId && !this.active.has(id))) {
      run.state = "uncertain"; run.error = "Host exited before recording a result. Inspect the server task and output; never automatically rerun.";
      atomic(this.runFile(id), run);
      // The worker's stdin death path exits; leave private staging for explicit inspection.
    }
    return run;
  }
  override current(id?: string): Run | null {
    if (id || this.latest) return this.load(id ?? this.latest!);
    const runs = path.join(this.root, "runs");
    if (!existsSync(runs)) return null;
    const visible: Run[] = [];
    for (const entry of readdirSync(runs)) {
      if (!validId(entry)) continue;
      try { visible.push(this.load(entry)); } catch { /* Another Root's run or incomplete admission stays private and cannot re-execute. */ }
    }
    return visible.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
  }
  override start(value: unknown, requestId?: unknown): Run {
    if (this.closing) throw new Error("Host is closing.");
    if (!validId(requestId)) throw new Error("A request UUID is required.");
    if (typeof value !== "string" || !path.isAbsolute(value) || path.extname(value).toLowerCase() !== ".pdf") throw new Error("Choose a PDF file on the Host.");
    const input = this.resolveFile(value);
    if (!statSync(input).isFile()) throw new Error("Choose a PDF file on the Host.");
    const server = this.settings().server;
    const sourceHash = digest(readFileSync(input));
    const fingerprint = digest(JSON.stringify({ module: "docling", input, sourceHash, server }));
    const timeoutMs = Number(process.env.IEUMDOC_MODULE_TIMEOUT_MS ?? 1_800_000);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) throw new Error("Invalid worker deadline.");
    const directory = path.dirname(this.runFile(requestId));
    if (existsSync(directory)) {
      const existing = this.load(requestId);
      if (existing.fingerprint !== fingerprint) throw new Error("Request ID conflicts with a different input or server.");
      this.latest = requestId; return existing;
    }
    const registered = moduleCommand("list", undefined, this.root);
    if (!registered?.enabled) throw new Error("Docling module is not registered or is disabled.");
    const manifest = manifestAt(path.join(registered.directory, "manifest.json"));
    const entry = path.join(registered.directory, manifest.entrypoint);
    if (digest(readFileSync(entry)) !== registered.sha256) throw new Error("Registered worker changed; register it again after inspection.");
    if (this.active.size) throw new Error("A Docling conversion is already running on this Host.");
    const stem = path.join(path.dirname(input), `${path.basename(input, path.extname(input))}.docling`);
    let output = stem;
    for (let n = 2; existsSync(this.resolveFile(output, true)); n++) output = `${stem}-${n}`;
    const stage = path.join(path.dirname(output), `.ieumdoc-module-${requestId}`);
    const run: Run = { id: requestId, input, output, stage, fingerprint, moduleVersion: manifest.version,
      ownerPid: process.pid, hostId: this.hostId, startedAt: Date.now(), state: "running", progress: { phase: "checking" } };
    mkdirSync(path.dirname(directory), { recursive: true });
    try { mkdirSync(directory); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = this.load(requestId);
      if (existing.fingerprint !== fingerprint) throw new Error("Request ID conflict.");
      this.latest = requestId; return existing;
    }
    atomic(this.runFile(requestId), run); // Durable admission precedes process creation.
    this.latest = requestId;
    let child: ChildProcess;
    try {
      mkdirSync(stage);
      child = spawn(process.execPath, [entry], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", TEMP: stage, TMP: stage, TMPDIR: stage } });
    } catch (error) {
      run.state = "error"; run.error = String(error); atomic(this.runFile(requestId), run);
      rmSync(stage, { recursive: true, force: true }); return run;
    }
    run.workerPid = child.pid;
    let completed = false, stopped = "", workerFailure: { error?: string; failure?: Run["failure"] } | undefined;
    const stop = (reason: string) => { stopped ||= reason; child.kill(); };
    const timer = setTimeout(() => stop("timeout"), timeoutMs);
    // Drain errors without retaining potentially huge or private worker diagnostics.
    child.stderr!.resume();
    const lines = createInterface({ input: child.stdout! });
    lines.on("line", line => {
      try {
        const event = JSON.parse(line);
        if (event.type === "ready") run.readyMs = Date.now() - run.startedAt;
        else if (event.type === "progress") run.progress = event.progress;
        else if (event.type === "done") completed = true;
        else if (event.type === "failure") workerFailure = event;
        atomic(this.runFile(requestId), run);
      } catch { stop("invalid worker message or ledger write failure"); }
    });
    child.stdin!.on("error", () => stop("worker input failed"));
    child.on("error", error => { workerFailure = { error: error.message }; });
    const done = new Promise<void>(resolve => child.once("close", code => {
      clearTimeout(timer); lines.close();
      try {
        if (stopped || code !== 0 || !completed) throw new Error(stopped || workerFailure?.error || `Worker exited ${code} without a complete result.`);
        this.resolveFile(input); this.resolveFile(output, true);
        if (digest(readFileSync(input)) !== sourceHash) throw new Error("Source PDF changed during conversion.");
        if (existsSync(output)) throw new Error("Output exists; refusing publication.");
        renameSync(path.join(stage, "bundle"), output); // Same-volume, whole-directory publication after exit.
        run.state = "success";
      } catch (error) {
        run.state = stopped === "cancelled" || stopped === "Host closing" ? "cancelled" : "error";
        run.error = `${error instanceof Error ? error.message : error}; local worker stopped, server task may continue.`;
        run.failure = stopped === "timeout" ? { code: "timeout", taskId: run.progress.taskId } : workerFailure?.failure ?? { code: "output", taskId: run.progress.taskId };
      } finally {
        run.elapsedMs = Date.now() - run.startedAt;
        try { atomic(this.runFile(requestId), run); }
        catch { /* Disk failure cannot be reported as success: the last durable state remains running/uncertain. */ }
        try { rmSync(stage, { recursive: true, force: true }); }
        catch (error) { console.error("Could not clean module staging:", String(error)); }
        finally { this.active.delete(requestId); resolve(); }
      }
    }));
    this.active.set(requestId, { child, done, stop });
    try { atomic(this.runFile(requestId), run); }
    catch { stop("ledger write failed before dispatch"); return structuredClone(run); }
    child.stdin!.write(JSON.stringify({ input, output: path.join(stage, "bundle"), server, timeoutMs }) + "\n");
    return structuredClone(run);
  }
  override async cancel(id: unknown): Promise<Run> {
    if (!validId(id)) throw new Error("A request UUID is required.");
    this.load(id);
    const active = this.active.get(id);
    if (active) { active.stop("cancelled"); await active.done; }
    else if (this.load(id).state === "running") throw new Error("This request belongs to another live Host; cancel there.");
    return this.load(id);
  }
  override async close() {
    this.closing = true;
    const active = [...this.active.values()];
    active.forEach(run => run.stop("Host closing"));
    await Promise.all(active.map(run => run.done));
  }
}
