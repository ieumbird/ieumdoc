import { fork, type ChildProcess } from "node:child_process";
import { createReadStream } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { ConversionJob, ConversionFailure, PdfProgress } from "@ieumdoc/docling/server-types";
import type { ConversionExecutor, ConversionRequest } from "@ieumdoc/docling/server";
import { digest, PluginStore, requestUuid, type Receipt } from "./plugin-store.ts";
import { INCOMPLETE } from "./plugin-output.ts";

async function fileHash(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
type Execution = { child?: ChildProcess; stopped?: "cancelled" | "timeout"; done: Promise<void> };

/** Worker handles are Host-local. Only registration/receipts are shared. */
export class PluginRuntime implements ConversionExecutor {
  readonly store: PluginStore;
  private active = new Map<string, Execution>();
  private closed = false;
  private fault?: Error;
  private closing?: Promise<void>;
  constructor(directory: string, private bundledManifest: string, private timeoutMs = 1_800_000) {
    this.store = new PluginStore(directory);
  }
  ensureBundled() {
    // Seed the first-party worker once; explicit unregistration remains durable.
    if (!this.store.list().some(item => item.id === "docling")) this.store.register(this.bundledManifest, true);
  }
  current(id: string): ConversionJob | null {
    if (this.fault) throw this.fault;
    return this.store.get(id)?.job ?? null;
  }
  async start(request: ConversionRequest): Promise<ConversionJob> {
    if (this.closed) throw new Error("The plugin runtime is closing.");
    if (this.fault) throw this.fault;
    request.job.id = requestUuid(request.job.id);
    this.ensureBundled();
    const sourceHash = await fileHash(request.job.input);
    if (this.closed) throw new Error("The plugin runtime is closing.");
    const fingerprint = digest(JSON.stringify({ input: request.job.input, sourceHash, server: request.server }));
    const { receipt, fresh } = this.store.admit(request.job, fingerprint);
    if (fresh) {
      const execution: Execution = { done: Promise.resolve() };
      this.active.set(receipt.job.id, execution);
      execution.done = this.execute(receipt, request, sourceHash, execution).finally(() => this.active.delete(receipt.job.id));
      // A cleanup/storage failure is surfaced by the receipt read or close/cancel;
      // it must never become an unhandled rejection in the Host process.
      void execution.done.catch(error => { this.fault = error instanceof Error ? error : new Error(String(error)); });
    }
    return this.current(receipt.job.id)!;
  }
  private async execute(receipt: Receipt, request: ConversionRequest, sourceHash: string, execution: Execution): Promise<void> {
    const { job, installation } = receipt;
    let staging: string | undefined, outputOwned = false;
    const timer = setTimeout(() => { execution.stopped = "timeout"; execution.child?.kill(); }, this.timeoutMs);
    const stopped = () => { if (this.closed || execution.stopped) throw new Error(execution.stopped ?? "The plugin runtime is closing."); };
    try {
      if (!installation.entry || installation.workerApi !== 1) throw new Error("Plugin has no compatible worker.");
      const entry = path.join(installation.directory, installation.entry);
      if (digest(await readFile(entry)) !== installation.sha256) throw new Error("Installed worker hash mismatch.");
      staging = await mkdtemp(path.join(path.dirname(job.output), ".ieumdoc-plugin-"));
      receipt.staging = staging;
      this.store.update(receipt);
      await mkdir(path.join(staging, "temp"));
      stopped();
      await new Promise<void>((resolve, reject) => {
        let complete = false, failure: Error | undefined;
        const child = fork(entry, [], { execPath: process.execPath, execArgv: [], windowsHide: true,
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", TMPDIR: path.join(staging!, "temp"), TEMP: path.join(staging!, "temp"), TMP: path.join(staging!, "temp") },
        });
        execution.child = child;
        child.on("error", error => { failure = error; child.kill(); });
        child.on("message", (message: any) => {
          try {
            if (message?.type === "progress" && ["checking", "uploading", "pending", "started", "downloading", "writing"].includes(message.progress?.phase)) {
              job.progress = { phase: message.progress.phase, ...(typeof message.progress.taskId === "string" ? { taskId: message.progress.taskId } : {}) } as PdfProgress;
              this.store.update(receipt);
            } else if (message?.type === "complete") complete = true;
            else if (message?.type === "failure") {
              failure = new Error(typeof message.message === "string" ? message.message : "Worker conversion failed.");
              job.failure = message.failure as ConversionFailure;
            }
          } catch (error) { failure = error instanceof Error ? error : new Error(String(error)); child.kill(); }
        });
        child.once("close", (code, signal) => complete && code === 0 && !execution.stopped ? resolve()
          : reject(failure ?? new Error(`Docling worker stopped (${signal ?? code}). The server task may continue.`)));
        child.send({ input: job.input, output: path.join(staging!, "bundle"), server: request.server }, error => { if (error) { failure = error; child.kill(); } });
      });
      stopped();
      request.beforePublish();
      if (await fileHash(job.input) !== sourceHash) throw new Error("Source PDF changed during conversion.");
      // A nonempty marker reserves the name exclusively on Windows AND POSIX.
      // Host paths reject it until every complete worker output is copied. No
      // rename-over-empty-directory race, and a crash leaves it fail-closed.
      await mkdir(job.output); outputOwned = true;
      await writeFile(path.join(job.output, INCOMPLETE), job.id, { flag: "wx" });
      const bundle = path.join(staging, "bundle");
      for (const name of await readdir(bundle)) await cp(path.join(bundle, name), path.join(job.output, name), { recursive: true, force: false, errorOnExist: true });
      stopped();
      request.beforePublish();
      await rm(path.join(job.output, INCOMPLETE));
      job.state = "success"; receipt.status = "success";
    } catch (error) {
      if (outputOwned) await rm(job.output, { recursive: true, force: true });
      job.state = execution.stopped === "cancelled" ? "cancelled" : "error";
      receipt.status = job.state;
      job.error = execution.stopped === "cancelled" ? "Cancelled; only IeumDoc waiting stopped. The server task may continue."
        : execution.stopped === "timeout" ? "Docling worker timed out. The server task may continue."
        : error instanceof Error ? error.message : String(error);
      job.failure ??= { code: execution.stopped === "timeout" ? "timeout" : "output", taskId: job.progress.taskId };
    } finally {
      clearTimeout(timer);
      try { if (staging) await rm(staging, { recursive: true, force: true }); }
      catch (error) {
        job.state = "error"; receipt.status = "error";
        job.error = `Worker staging cleanup failed: ${error instanceof Error ? error.message : String(error)}`;
        job.failure = { code: "output", taskId: job.progress.taskId };
      }
      this.store.update(receipt);
    }
  }
  async cancel(id: string): Promise<ConversionJob> {
    const execution = this.active.get(id);
    const receipt = this.store.get(id);
    if (!receipt) throw new Error("This Docling conversion is no longer available.");
    if (receipt.status === "running" && !execution) throw new Error("Only the Host owning this conversion can stop waiting.");
    if (execution) { execution.stopped = "cancelled"; execution.child?.kill(); await execution.done; }
    return this.current(id)!;
  }
  close(): Promise<void> {
    return this.closing ??= this.shutdown();
  }
  private async shutdown() {
    this.closed = true;
    const executions = [...this.active.values()];
    for (const execution of executions) { execution.stopped = "cancelled"; execution.child?.kill(); }
    try {
      const outcomes = await Promise.allSettled(executions.map(execution => execution.done));
      const failed = outcomes.find(outcome => outcome.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      if (this.fault) throw this.fault;
    } finally { this.store.close(); }
  }
}
