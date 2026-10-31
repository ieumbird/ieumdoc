import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkDoclingServer, doclingServerUrl } from "./pdf.ts";
import { DEFAULT_DOCLING_SERVER, type ConversionJob } from "./server-types.ts";

export type ConversionRequest = { job: ConversionJob; server: string; beforePublish(): void };
export interface ConversionExecutor {
  start(request: ConversionRequest): Promise<ConversionJob>;
  current(id: string): ConversionJob | null;
  cancel(id: string): Promise<ConversionJob>;
  close(): Promise<void>;
}

/** Existing UI/settings facade. Execution and durable receipts belong to Host. */
export class DoclingHost {
  private job?: ConversionJob;
  private admitting = false;
  private settingsFile: string;
  private resolve: (file: string, create?: boolean) => string;
  constructor(settingsFile: string, resolve: (file: string, create?: boolean) => string, private executor: ConversionExecutor) {
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
  current(id?: string): ConversionJob | null {
    const job = (id || this.job?.id) ? this.executor.current(id ?? this.job!.id) : null;
    if (id && job) { this.resolve(job.input, true); this.resolve(path.dirname(job.output)); }
    return job;
  }
  async start(value: unknown, id = randomUUID()): Promise<ConversionJob> {
    if (this.admitting || (this.current()?.state === "running" && id !== this.job?.id)) throw new Error("A Docling conversion is already running on this Host.");
    if (typeof value !== "string" || !path.isAbsolute(value) || path.extname(value).toLowerCase() !== ".pdf") throw new Error("Choose a PDF file on the Host.");
    const input = this.resolve(value);
    if (!statSync(input).isFile()) throw new Error("Choose a PDF file on the Host.");
    const stem = path.join(path.dirname(input), `${path.basename(input, path.extname(input))}.docling`);
    let output = stem;
    for (let number = 2; ; number++) {
      // Occupied names include a crash's marked, unpublished result. Do not
      // enter/follow them; choose another sibling and validate only that target.
      this.resolve(path.dirname(output));
      try { lstatSync(output); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { output = this.resolve(output, true); break; } throw error; }
      output = `${stem}-${number}`;
    }
    const server = this.settings().server;
    const job: ConversionJob = { id, input, output, startedAt: Date.now(), state: "running", progress: { phase: "checking" } };
    this.admitting = true;
    try {
      this.job = await this.executor.start({ job, server,
        beforePublish: () => { this.resolve(input); this.resolve(path.dirname(output)); },
      });
      return structuredClone(this.job);
    } finally { this.admitting = false; }
  }

  async cancel(id: unknown): Promise<ConversionJob> {
    if (!this.job || id !== this.job.id) throw new Error("This Docling conversion is no longer available.");
    this.job = await this.executor.cancel(this.job.id);
    return structuredClone(this.job);
  }
  async close() { await this.executor.close(); }
}
