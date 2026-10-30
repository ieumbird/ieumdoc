// SPIKE #657: one in-memory conversation, Codex execution, CLI-only report creation.
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeUtf8, textRevision } from "@ieumdoc/file-commit";
import { RootAccess, inside } from "../file-access.ts";
import { readRequestBody } from "../request-body.ts";
import { AI_MODEL, AI_MODEL_LABEL, CodexAppServer } from "./codex-app-server.ts";
import { CLI_RUNNER } from "./cli-runner.ts";
import { REPORT_STDIN_EXAMPLE } from "./report-example.ts";

type Receipt = { command: string; file?: string; revision?: string; exitCode: number; dryRun?: boolean };
export type RunResult = { path: string; revision: string; elapsedMs: number; commands: number; failures: number; cliCalls: number; cliFailures: number; check: unknown };
type Send = (event: Record<string, unknown>) => void;

function cliEntry(): string {
  const adjacent = path.join(path.dirname(path.resolve(process.argv[1] ?? ".")), "cli.mjs");
  return process.env.IEUMDOC_AI_CLI ?? (existsSync(adjacent) ? adjacent : fileURLToPath(new URL("../../../../packages/cli/dist/cli.mjs", import.meta.url)));
}

export function sandboxPolicy(output: string) {
  // cwd MUST be output too: workspaceWrite implicitly grants cwd write access.
  return { type: "workspaceWrite", writableRoots: [output], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true };
}

export function verifyReport(target: string, receipts: Receipt[], bypass: boolean, access: RootAccess,
  check: (file: string) => Promise<unknown>): Promise<{ path: string; revision: string; check: unknown }> {
  return (async () => {
    if (bypass) throw new Error("CLI bypass: Codex used a file editing tool. The report was not opened.");
    const file = access.resolve(target);
    const writes = receipts.filter(item => item.exitCode === 0 && !item.dryRun && item.file === file && ["create", "apply-batch"].includes(item.command));
    const last = writes.at(-1);
    if (!writes.some(item => item.command === "create") || last?.command !== "apply-batch" || !last.revision) throw new Error("No successful CLI create → apply-batch receipt for this report. The report was not opened.");
    const revision = textRevision(decodeUtf8(readFileSync(file)));
    if (revision !== last.revision) throw new Error("CLI bypass or external change: final CLI revision differs from the file. The report was not opened.");
    const result = await check(file);
    // Do not admit an edit racing the Host's CLI check.
    if (textRevision(decodeUtf8(readFileSync(file))) !== revision) throw new Error("The report changed during Host validation. The report was not opened.");
    return { path: file, revision, check: result };
  })();
}

export class AiHost {
  readonly codex: CodexAppServer;
  private readonly shim = mkdtempSync(path.join(tmpdir(), "ieumdoc-ai-cli-"));
  private readonly cli = cliEntry();
  // Store execution aliases cannot be started by the native Windows sandbox. Resolve the
  // system PowerShell instead, in this child's PATH only; the user's PATH is untouched.
  private readonly childPath = [this.shim, ...(process.env.PATH ?? "").split(path.delimiter)
    .filter(entry => process.platform !== "win32" || !/[\\/]WindowsApps(?:[\\/]|$)/i.test(entry))].join(path.delimiter);
  private running: { thread: string; turn: string | null } | null = null;
  private preparing = false;
  private history: string[] = [];
  // SPIKE: model chosen in Settings; kept for this server process only. Default is the owner-confirmed model.
  private selected = AI_MODEL;
  constructor(private readonly access: RootAccess | null, codex?: CodexAppServer, private readonly observe?: Send) {
    writeFileSync(path.join(this.shim, "runner.cjs"), CLI_RUNNER);
    if (process.platform === "win32") writeFileSync(path.join(this.shim, "ieumdoc.cmd"), `@echo off\r\n"${process.execPath}" "${path.join(this.shim, "runner.cjs")}" %*\r\n`);
    else writeFileSync(path.join(this.shim, "ieumdoc"), `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' '${path.join(this.shim, "runner.cjs").replaceAll("'", "'\\''")}' "$@"\n`, { mode: 0o755 });
    // No global PATH, registry, installation or authentication changes.
    this.codex = codex ?? new CodexAppServer({ env: { ...process.env, PATH: this.childPath, IEUMDOC_CLI_ENTRY: this.cli } });
  }
  async status() {
    const version = await this.codex.version();
    const base = { enabled: true, installed: !!version, version, loggedIn: false, authMethod: null as string | null,
      model: null as string | null, selectedModel: this.selected, models: [] as { model: string; displayName: string }[], modelLabel: AI_MODEL_LABEL, modelAvailable: null as boolean | null, cliAvailable: existsSync(this.cli),
      readBoundary: "Codex 0.164.0 has no readableRoots; shell reads are not confined to the opened folder." };
    if (!version) return base;
    try {
      const { account } = await this.codex.request("account/read", {});
      base.loggedIn = !!account; base.authMethod = account?.type ?? null;
      const models: { id: string; model: string; displayName: string }[] = []; let cursor: string | null = null;
      do {
        const page: { data: { id: string; model: string; displayName: string }[]; nextCursor: string | null } = await this.codex.request("model/list", { includeHidden: true, cursor });
        models.push(...page.data); cursor = page.nextCursor;
      } while (cursor);
      base.models = models.map(item => ({ model: item.model, displayName: item.displayName }));
      const chosen = models.find(item => item.model === this.selected);
      base.model = chosen ? chosen.model : null; base.modelLabel = chosen?.displayName ?? this.selected; base.modelAvailable = base.model !== null;
      return base;
    } catch (error) { return { ...base, problem: String(error) }; }
  }
  private check(file: string): Promise<unknown> {
    return new Promise((resolve, reject) => execFile(process.execPath, [this.cli, "check", file, "--format", "json"],
      { windowsHide: true, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) reject(new Error(`Host CLI check failed: ${stderr || error.message}`));
        else { try { resolve(JSON.parse(stdout)); } catch { reject(new Error("Host CLI check returned invalid JSON.")); } }
      }));
  }
  async run(rootValue: string, outputValue: string, question: string, receive: Send): Promise<RunResult | null> {
    const send: Send = event => { receive(event); this.observe?.(event); };
    if (this.running || this.preparing) throw new Error("An AI request is already running.");
    this.preparing = true;
    const started = Date.now();
    let root: string, output: string, target: string, model: string;
    try {
      root = realpathSync(this.access?.resolve(rootValue) ?? rootValue);
      // SPIKE: output may be a subfolder name relative to the reference folder (default "reports"); create it if missing.
      const outputName = outputValue.trim() || "reports";
      const outputPath = path.isAbsolute(outputName) ? (this.access?.resolve(outputName) ?? outputName) : path.resolve(root, outputName);
      if (!inside(root, outputPath) || path.resolve(outputPath) === root) throw new Error("Choose a dedicated output subfolder inside the opened reference folder.");
      if (!existsSync(outputPath)) mkdirSync(outputPath, { recursive: true });
      output = realpathSync(outputPath);
      if (!statSync(root).isDirectory() || !statSync(output).isDirectory()) throw new Error("Select existing reference and output folders.");
      if (!inside(root, output) || root === output) throw new Error("Choose a dedicated output subfolder inside the opened reference folder.");
      if (!existsSync(this.cli)) throw new Error("Build the CLI first: pnpm --filter @ieumdoc/cli build");
      const status = await this.status();
      if (status.authMethod !== "chatgpt") throw new Error("A ChatGPT Codex login is required.");
      if (!status.model) throw new Error(`${this.selected} is unavailable in the Codex model catalog. Choose another model in Settings.`);
      model = status.model;
      target = path.join(output, `report-${randomUUID()}.md`);
      const env = { IEUMDOC_AI_ROOT: root, IEUMDOC_AI_OUTPUT: output, IEUMDOC_AI_TARGET: target,
        IEUMDOC_CLI_ENTRY: this.cli, PATH: this.childPath };
      const effective = await this.codex.request("config/read", { includeLayers: false });
      const disabledMcp = Object.fromEntries(Object.keys(effective.config?.mcp_servers ?? {}).map(name => [`mcp_servers.${name}.enabled`, false]));
      const { thread } = await this.codex.request("thread/start", {
        model, cwd: output, sandbox: "workspace-write", approvalPolicy: "never", ephemeral: true,
        config: { shell_environment_policy: { inherit: "all", set: env }, web_search: "disabled", "agents.enabled": false, "features.apps": false, ...disabledMcp },
        developerInstructions: [
          "You are IeumDoc's report assistant. Answer in the user's language. One conversation; create new reports only, never edit existing documents.",
          `Reference folder: ${root}. Only read documents within this folder. Output folder: ${output}. New report target: ${target}.`,
          "ALL document writes MUST use the ieumdoc command on PATH: create TARGET (never overwrite), pipe operations JSON to apply-batch TARGET --operations - --format json, then check TARGET --format json. Prefer stdin, not operations files.",
          "Do not write Markdown with shell redirection, scripts, apply_patch, file-edit tools or raw Markdown imports.",
          "Use ieumdoc --help and command --help to discover the actual CLI. Prefer inspect FILE --format json for reference documents. Do not read outside the reference folder or use the network.",
          ...(process.platform === "win32" ? ["For exec_command use shell='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' and login=false. The default Microsoft Store pwsh cannot start in this sandbox. Do not change machine configuration or sandbox permissions."] : []),
          "Use apply-batch to group edits; use --dry-run for validation and --if-revision for writes. Recover from CLI errors using the CLI, never bypass them.",
          "Use Core InlineContent JSON for references. Include a labelled numeric table, one relevant equation, one Mermaid figure, captions and references in the body when requested.",
          'InlineContent uses kind (not type). A reference uses label (not target): {"kind":"reference","role":"numref","label":"some-label"}; use role "eq" for an equation. Plain text is {"kind":"text","text":"..."}.',
          REPORT_STDIN_EXAMPLE,
          "If a feature is unavailable, state the CLI gap explicitly. Do not use other tools to emulate missing semantics. Finish with check; Host independently verifies the final write revision and check.",
        ].join("\n"),
      });
      this.running = { thread: thread.id, turn: null };
      this.preparing = false;
    } catch (error) { this.preparing = false; throw error; }
    const current = this.running;
    const receipts: Receipt[] = [];
    let commands = 0, failures = 0, bypass = false, answer = "";
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (error?: Error, result: RunResult | null = null) => {
        if (finished) return; finished = true;
        this.codex.off("notification", listener); this.codex.off("exit", exited);
        this.running = null;
        if (error) reject(error); else resolve(result);
      };
      const listener = (method: string, params: any) => {
        if (params.threadId !== current.thread) return;
        if (method === "turn/started") current.turn = params.turn.id;
        if (method === "item/agentMessage/delta") send({ type: "delta", text: params.delta });
        if (method === "item/started" && params.item.type === "commandExecution") send({ type: "activity", text: params.item.command });
        if (method === "item/completed") {
          const item = params.item;
          if (item.type === "agentMessage") { answer += item.text + "\n"; send({ type: "message", text: item.text }); }
          if (item.type === "fileChange") { bypass = true; send({ type: "error", message: "CLI bypass: file editing tool used." }); }
          if (item.type === "commandExecution") {
            commands++; if (item.exitCode !== 0) failures++;
            for (const line of String(item.aggregatedOutput ?? "").split(/\r?\n/)) {
              if (!line.startsWith("IEUMDOC_RECEIPT ")) continue;
              try { receipts.push(JSON.parse(line.slice(16))); } catch { /* not a receipt */ }
            }
            send({ type: "command", item });
          }
        }
        if (method === "error" && !params.willRetry) send({ type: "error", message: params.error?.message ?? "Codex error" });
        if (method === "turn/completed") {
          this.history.push(`User: ${question}\nAssistant: ${answer}`);
          const metrics = { elapsedMs: Date.now() - started, commands, failures, cliCalls: receipts.length, cliFailures: receipts.filter(r => r.exitCode !== 0).length };
          if (params.turn.status !== "completed") return finish(new Error(`Codex ${params.turn.status}: ${params.turn.error?.message ?? "interrupted"}`));
          void verifyReport(target, receipts, bypass, new RootAccess([output]), file => this.check(file)).then(verified => {
            const result = { ...verified, ...metrics };
            this.history.push(`Host verification passed: ${verified.path} revision=${verified.revision}`);
            send({ type: "report", ...result }); finish(undefined, result);
          }).catch(error => { send({ type: "metrics", ...metrics }); this.history.push(`Host rejected report: ${String(error)}`); finish(error); });
        }
      };
      const exited = (error: Error) => finish(error);
      this.codex.on("notification", listener); this.codex.on("exit", exited);
      send({ type: "started", model, path: target, readBoundary: "Shell reads are not confined to the reference folder on Codex 0.164.0." });
      void this.codex.request("turn/start", { threadId: current.thread, model, cwd: output,
        sandboxPolicy: sandboxPolicy(output), approvalPolicy: "never",
        input: [{ type: "text", text: `${this.history.join("\n\n")}\n\nUser: ${question}` }],
      }).then(({ turn }) => { current.turn ??= turn.id; }).catch(finish);
    });
  }
  async selectModel(model: string) {
    if (this.running || this.preparing) throw new Error("Wait for the current AI request to finish.");
    const status = await this.status();
    if (!status.models.some(item => item.model === model)) throw new Error(`Model ${model} is not in the Codex model catalog.`);
    this.selected = model;
    return this.status();
  }
  async interrupt() {
    if (this.running?.turn) await this.codex.request("turn/interrupt", { threadId: this.running.thread, turnId: this.running.turn });
  }
  close() { this.codex.close(); rmSync(this.shim, { recursive: true, force: true }); }
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(value));
}
export async function handleAiRequest(req: IncomingMessage, res: ServerResponse, pathname: string, host: AiHost | null) {
  if (pathname === "/api/ai/status" && req.method === "GET") return json(res, 200, host ? await host.status() : { enabled: false });
  if (!host) return json(res, 404, { error: "AI is disabled. Start ieumdoc serve --ai." });
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
  if (pathname === "/api/ai/model") {
    const body = JSON.parse((await readRequestBody(req, 4 * 1024)).toString("utf8"));
    if (typeof body.model !== "string" || !body.model.trim()) return json(res, 400, { error: "model is required." });
    try { return json(res, 200, await host.selectModel(body.model.trim())); }
    catch (error) { return json(res, 409, { error: error instanceof Error ? error.message : String(error) }); }
  }
  if (pathname === "/api/ai/interrupt") { await host.interrupt(); return json(res, 200, { ok: true }); }
  if (pathname !== "/api/ai/turn") return json(res, 404, { error: "Not found." });
  const body = JSON.parse((await readRequestBody(req, 64 * 1024)).toString("utf8"));
  if (![body.root, body.output || "reports", body.question].every(value => typeof value === "string" && value.trim())) return json(res, 400, { error: "Reference folder, output folder and request are required." });
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8"); res.flushHeaders();
  const send: Send = event => { if (!res.writableEnded) res.write(JSON.stringify(event) + "\n"); };
  const closed = () => { if (!res.writableEnded) void host.interrupt(); };
  res.on("close", closed);
  try { await host.run(body.root, body.output, body.question, send); send({ type: "done" }); }
  catch (error) { send({ type: "error", message: error instanceof Error ? error.message : String(error) }); }
  finally { res.off("close", closed); res.end(); }
}
