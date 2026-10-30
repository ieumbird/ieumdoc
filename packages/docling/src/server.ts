import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkDoclingServer, convertDoclingPdf, doclingServerUrl, DoclingPdfError } from "./pdf.ts";
import { DEFAULT_DOCLING_SERVER, type ConversionJob } from "./server-types.ts";

/** One transient conversion per Host. No persisted jobs, resume, queue or background service. */
export class DoclingHost {
  private job?: ConversionJob;
  private controller?: AbortController;
  private running?: Promise<void>;
  private settingsFile: string;
  private resolve: (file: string, create?: boolean) => string;
  constructor(settingsFile: string, resolve: (file: string, create?: boolean) => string) {
    this.settingsFile = settingsFile; this.resolve = resolve;
  }

  settings(): { server: string } {
    if (!existsSync(this.settingsFile)) return { server: DEFAULT_DOCLING_SERVER };
    const settings = JSON.parse(readFileSync(this.settingsFile, "utf8"));
    return { server: doclingServerUrl(settings.server).href.replace(/\/$/u, "") };
  }
  configure(value: unknown) {
    if (typeof value !== "string") throw new Error("Server address is required.");
    const settings = { server: doclingServerUrl(value.trim()).href.replace(/\/$/u, "") };
    mkdirSync(path.dirname(this.settingsFile), { recursive: true });
    const temporary = `${this.settingsFile}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(settings) + "\n", { flag: "wx" });
      renameSync(temporary, this.settingsFile);
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    return settings;
  }
  async check() {
    return checkDoclingServer(this.settings().server);
  }
  current(): ConversionJob | null { return this.job ? structuredClone(this.job) : null; }
  start(value: unknown): ConversionJob {
    if (this.job?.state === "running") throw new Error("A Docling conversion is already running on this Host.");
    if (typeof value !== "string" || !path.isAbsolute(value) || path.extname(value).toLowerCase() !== ".pdf") throw new Error("Choose a PDF file on the Host.");
    const input = this.resolve(value);
    if (!statSync(input).isFile()) throw new Error("Choose a PDF file on the Host.");
    const stem = path.join(path.dirname(input), `${path.basename(input, path.extname(input))}.docling`);
    let output = stem;
    for (let number = 2; ; number++) {
      output = this.resolve(output, true);
      try { lstatSync(output); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") break; throw error; }
      output = `${stem}-${number}`;
    }
    const server = this.settings().server;
    const controller = new AbortController(); this.controller = controller;
    const job: ConversionJob = { id: randomUUID(), input, output, startedAt: Date.now(), state: "running", progress: { phase: "checking" } };
    this.job = job;
    this.running = convertDoclingPdf(input, output, { server, signal: controller.signal,
      onProgress: progress => { job.progress = progress; },
      beforePublish: () => { this.resolve(input); this.resolve(output, true); },
    }).then(() => { job.state = "success"; }, error => {
      job.state = controller.signal.aborted ? "cancelled" : "error";
      job.error = error instanceof Error ? error.message : String(error);
      job.failure = error instanceof DoclingPdfError ? error.failure : { code: "output" };
    });
    return structuredClone(job);
  }
  async cancel(id: unknown): Promise<ConversionJob> {
    if (!this.job || id !== this.job.id) throw new Error("This Docling conversion is no longer available.");
    if (this.job.state === "running") { this.controller?.abort(); await this.running; }
    return structuredClone(this.job);
  }
  async close() { if (this.job?.state === "running") await this.cancel(this.job.id); }
}
