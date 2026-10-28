// SPIKE: `/api/ai/*` Host routes over one Codex app-server. Enabled only by `ieumdoc serve --ai`.
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RootAccess } from "../file-access.ts";
import { readRequestBody } from "../request-body.ts";
import { AI_MODEL, AI_MODEL_LABEL, CodexAppServer } from "./codex-app-server.ts";

const MAX_AI_BODY = 4 * 1024 * 1024;
const MAX_DOCUMENT_CHARS = 200_000;

export type AiStatus = {
  enabled: true;
  installed: boolean;
  version: string | null;
  loggedIn: boolean;
  authMethod: "chatgpt" | "apiKey" | "other" | null;
  model: string;
  modelLabel: string;
  modelAvailable: boolean | null;
  problem?: string;
};

const DEVELOPER_INSTRUCTIONS = [
  "You are the IeumDoc document assistant. The working directory is the user's opened document folder (MyST Markdown files).",
  "Answer questions about the current document and, when useful, other documents in this folder. Read files as needed; never modify files.",
  "Answer in the language of the question. Be concise.",
  "Cite every source you use as a Markdown link whose target is the document path relative to the working directory,",
  "optionally followed by '#' and the exact heading text of the cited section, e.g. [Intro](notes/report.md#Introduction).",
  "Use the heading text exactly as written in the file (without the leading #'s). Do not use absolute paths or URLs for citations.",
].join("\n");

type Turn = { threadId: string; turnId: string | null };

export class AiHost {
  private readonly threads = new Map<string, string>();
  private readonly running = new Map<string, Turn>();
  private models: Promise<string[]> | null = null;

  constructor(private readonly access: RootAccess, readonly codex = new CodexAppServer()) {
    codex.on("exit", () => { this.threads.clear(); this.running.clear(); this.models = null; });
  }

  private modelIds(): Promise<string[]> {
    if (!this.models) {
      this.models = (async () => {
        const ids: string[] = [];
        let cursor: string | null = null;
        do {
          const page: { data: { id: string; model: string }[]; nextCursor: string | null } =
            await this.codex.request("model/list", { includeHidden: true, cursor });
          for (const model of page.data) ids.push(model.id, model.model);
          cursor = page.nextCursor;
        } while (cursor);
        return ids;
      })();
      this.models.catch(() => { this.models = null; });
    }
    return this.models;
  }

  async status(): Promise<AiStatus> {
    const base: AiStatus = { enabled: true, installed: false, version: null, loggedIn: false, authMethod: null,
      model: AI_MODEL, modelLabel: AI_MODEL_LABEL, modelAvailable: null };
    const version = await this.codex.version();
    if (!version) return base;
    const status: AiStatus = { ...base, installed: true, version };
    try {
      const { account } = await this.codex.request<{ account: { type: string } | null }>("account/read", {});
      status.loggedIn = Boolean(account);
      status.authMethod = !account ? null : account.type === "chatgpt" ? "chatgpt" : account.type === "apiKey" ? "apiKey" : "other";
      if (status.loggedIn) {
        this.models = null; // Re-read on every status check; login may have changed.
        status.modelAvailable = (await this.modelIds()).includes(AI_MODEL);
      }
    } catch (error) {
      status.problem = error instanceof Error ? error.message : String(error);
    }
    return status;
  }

  private async thread(session: string, cwd: string): Promise<string> {
    const key = `${session}\0${cwd}`;
    const existing = this.threads.get(key);
    if (existing) return existing;
    const { thread } = await this.codex.request<{ thread: { id: string } }>("thread/start", {
      model: AI_MODEL, cwd, sandbox: "read-only", approvalPolicy: "never", developerInstructions: DEVELOPER_INSTRUCTIONS, ephemeral: true,
    });
    this.threads.set(key, thread.id);
    return thread.id;
  }

  async turn(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = JSON.parse((await readRequestBody(req, MAX_AI_BODY)).toString("utf8")) as Record<string, unknown>;
    const text = (name: string) => typeof body[name] === "string" ? body[name] as string : "";
    const session = text("session");
    const question = text("question").trim();
    if (!session || !question) return fail(res, 400, "A session and a question are required.");
    let cwd: string;
    let document = "";
    try {
      cwd = this.access.resolve(text("root"));
      if (text("path")) document = path.relative(cwd, this.access.resolve(text("path")));
    } catch (error) { return fail(res, 403, error instanceof Error ? error.message : String(error)); }
    if (this.running.has(session)) return fail(res, 409, "An answer is already in progress for this document.");
    let threadId: string;
    try {
      if (!(await this.modelIds()).includes(AI_MODEL)) {
        return fail(res, 503, `The ${AI_MODEL_LABEL} model (${AI_MODEL}) is not available to this Codex account.`);
      }
      threadId = await this.thread(session, cwd);
    } catch (error) {
      return fail(res, 502, `Codex could not start: ${error instanceof Error ? error.message : String(error)}`);
    }
    const selection = text("selection").trim();
    const prompt = [
      document ? `Current document: ${document.split(path.sep).join("/")}` : "No document is open.",
      selection ? `Selected text in the current document:\n<<<\n${selection}\n>>>` : "",
      text("documentText") ? `Current document text as shown in the editor (may include unsaved edits):\n<<<\n${text("documentText").slice(0, MAX_DOCUMENT_CHARS)}\n>>>` : "",
      `Question:\n${question}`,
    ].filter(Boolean).join("\n\n");

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.flushHeaders();
    const send = (event: object) => { if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`); };
    const current: Turn = { threadId, turnId: null };
    this.running.set(session, current);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.codex.off("notification", listener);
      this.codex.off("exit", exited);
      if (this.running.get(session) === current) this.running.delete(session);
      res.end();
    };
    const listener = (method: string, params: any) => {
      if (params?.threadId !== threadId) return;
      if (method === "turn/started") current.turnId ??= params.turn?.id ?? null;
      else if (method === "item/agentMessage/delta") send({ type: "delta", itemId: params.itemId, text: params.delta });
      else if (method === "item/started" && params.item?.type === "commandExecution") send({ type: "activity", text: String(params.item.command ?? "") });
      else if (method === "item/completed" && params.item?.type === "agentMessage") send({ type: "message", itemId: params.item.id, text: params.item.text });
      else if (method === "error" && !params.willRetry) send({ type: "error", message: params.error?.message ?? "Codex error" });
      else if (method === "turn/completed") {
        send({ type: "done", status: params.turn?.status, error: params.turn?.error?.message ?? null });
        finish();
      }
    };
    const exited = (error: Error) => { send({ type: "error", message: error.message }); finish(); };
    this.codex.on("notification", listener);
    this.codex.on("exit", exited);
    res.on("close", () => { if (!finished) { void this.interrupt(session); finish(); } });
    send({ type: "started", model: AI_MODEL });
    try {
      const { turn } = await this.codex.request<{ turn: { id: string } }>("turn/start", {
        threadId, model: AI_MODEL, input: [{ type: "text", text: prompt, text_elements: [] }],
      });
      current.turnId ??= turn.id;
    } catch (error) {
      send({ type: "error", message: error instanceof Error ? error.message : String(error) });
      finish();
    }
  }

  async interrupt(session: string): Promise<boolean> {
    const turn = this.running.get(session);
    if (!turn?.turnId) return false;
    await this.codex.request("turn/interrupt", { threadId: turn.threadId, turnId: turn.turnId }).catch(() => {});
    return true;
  }

  close(): void { this.codex.close(); }
}

function fail(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: message }));
}

export async function handleAiRequest(req: IncomingMessage, res: ServerResponse, pathname: string, host: AiHost | null): Promise<void> {
  if (!host) {
    if (pathname === "/api/ai/status" && req.method === "GET") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ enabled: false }));
      return;
    }
    return fail(res, 404, "AI is not enabled. Start the Host with `ieumdoc serve --ai`.");
  }
  if (pathname === "/api/ai/status") {
    if (req.method !== "GET") return fail(res, 405, "Method not allowed.");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(await host.status()));
    return;
  }
  if (req.method !== "POST") return fail(res, 405, "Method not allowed.");
  if (pathname === "/api/ai/turn") return host.turn(req, res);
  if (pathname === "/api/ai/interrupt") {
    const body = JSON.parse((await readRequestBody(req, 64 * 1024)).toString("utf8")) as { session?: unknown };
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ interrupted: typeof body.session === "string" && await host.interrupt(body.session) }));
    return;
  }
  return fail(res, 404, "Not found.");
}
