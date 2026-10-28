// SPIKE: a minimal client for `codex app-server` (stdio, newline-delimited JSON-RPC without "jsonrpc").
import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { StringDecoder } from "node:string_decoder";

/** The only model IeumDoc AI uses. Passed explicitly on every turn; there is no fallback. */
export const AI_MODEL = "gpt-6-luna";
export const AI_MODEL_LABEL = "GPT Luna";

export type RpcMessage = { id?: number | string; method?: string; params?: any; result?: any; error?: { code?: number; message: string } };

/** Splits a byte stream into JSON messages, one per line. Invalid lines are reported, not thrown. */
export class LineDecoder {
  private buffer = "";
  // Chunk boundaries can split a multi-byte UTF-8 character.
  private readonly text = new StringDecoder("utf8");
  constructor(private readonly onMessage: (message: RpcMessage) => void, private readonly onInvalid: (line: string) => void = () => {}) {}
  push(chunk: string | Buffer): void {
    this.buffer += typeof chunk === "string" ? chunk : this.text.write(chunk);
    let index: number;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      let message: RpcMessage;
      try { message = JSON.parse(line); } catch { this.onInvalid(line); continue; }
      this.onMessage(message);
    }
  }
}

export const encodeMessage = (message: RpcMessage): string => `${JSON.stringify(message)}\n`;

export type Transport = {
  stdin: { write(data: string): unknown; end(): unknown };
  stdout: NodeJS.EventEmitter;
  stderr?: NodeJS.EventEmitter;
  on(event: "exit", listener: (code: number | null) => void): unknown;
  kill(): unknown;
};

export type CodexClientOptions = {
  bin?: string;
  /** Test hook: start a fake app-server instead of spawning Codex. */
  start?: () => Transport;
};

const APPROVAL_REQUESTS = new Set(["item/commandExecution/requestApproval", "item/fileChange/requestApproval",
  "item/permissions/requestApproval", "applyPatchApproval", "execCommandApproval"]);

/** One lazily started app-server process, reused for every request. */
export class CodexAppServer extends EventEmitter {
  private process: Transport | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 0;
  private readonly pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  readonly bin: string;

  constructor(private readonly options: CodexClientOptions = {}) {
    super();
    this.bin = options.bin ?? process.env.IEUMDOC_CODEX_BIN ?? "codex";
  }

  /** `codex --version`, or null when the CLI is not installed. */
  version(): Promise<string | null> {
    return new Promise(resolve => execFile(this.bin, ["--version"], { timeout: 10_000 }, (error, stdout) => {
      resolve(error ? null : stdout.trim().replace(/^codex-cli\s+/, ""));
    }));
  }

  private startProcess(): Transport {
    if (this.options.start) return this.options.start();
    return spawn(this.bin, ["app-server"], { stdio: ["pipe", "pipe", "pipe"] }) as ChildProcessWithoutNullStreams;
  }

  /** Starts and initializes the app-server once. */
  connect(): Promise<void> {
    if (this.ready) return this.ready;
    const child = this.startProcess();
    this.process = child;
    const decoder = new LineDecoder(message => this.dispatch(message));
    child.stdout.on("data", (chunk: Buffer) => decoder.push(chunk));
    child.stderr?.on("data", () => { /* Codex logs; ignored in the spike. */ });
    (child as unknown as EventEmitter).on("error", (error: Error) => this.reset(error));
    child.on("exit", code => this.reset(new Error(`Codex app-server exited (${code ?? "signal"}).`)));
    this.ready = this.call("initialize", { clientInfo: { name: "ieumdoc", title: "IeumDoc", version: "0.0.0" } })
      .then(() => { this.notify("initialized"); });
    this.ready.catch(() => { this.ready = null; });
    return this.ready;
  }

  private reset(error: Error): void {
    if (!this.process) return;
    this.process = null;
    this.ready = null;
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
    this.emit("exit", error);
  }

  private dispatch(message: RpcMessage): void {
    if (message.id !== undefined && message.method) {
      // Server → client request. Read-only + approvalPolicy "never" should not ask; decline if it does.
      const result = APPROVAL_REQUESTS.has(message.method) ? { decision: "decline" } : undefined;
      this.write(result ? { id: message.id, result } : { id: message.id, error: { code: -32601, message: "Not supported by IeumDoc." } });
      return;
    }
    if (message.id !== undefined) {
      const waiter = this.pending.get(Number(message.id));
      if (!waiter) return;
      this.pending.delete(Number(message.id));
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
      return;
    }
    if (message.method) this.emit("notification", message.method, message.params ?? {});
  }

  private write(message: RpcMessage): void {
    this.process?.stdin.write(encodeMessage(message));
  }

  private call<T = any>(method: string, params: unknown): Promise<T> {
    if (!this.process) return Promise.reject(new Error("Codex app-server is not running."));
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ id, method, params });
    });
  }

  notify(method: string, params?: unknown): void {
    this.write(params === undefined ? { method } : { method, params });
  }

  async request<T = any>(method: string, params: unknown): Promise<T> {
    await this.connect();
    return this.call<T>(method, params);
  }

  close(): void {
    const child = this.process;
    this.reset(new Error("Codex app-server was stopped."));
    try { child?.stdin.end(); child?.kill(); } catch { /* already gone */ }
  }
}
