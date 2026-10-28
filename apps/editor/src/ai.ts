// SPIKE: Editor side of the `/api/ai/*` Host routes (`ieumdoc serve --ai`).
import type { EditableDocument } from "@ieumdoc/core";
import type { ProposalHunk } from "./ai-review.ts";
export type AiStatus = { enabled: false } | {
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

export type AiEvent =
  | { type: "started"; model: string }
  | { type: "delta"; itemId: string; text: string }
  | { type: "message"; itemId: string; text: string }
  | { type: "activity"; text: string }
  | { type: "error"; message: string }
  | { type: "proposal"; proposal: AiProposal }
  | { type: "done"; status: string; error: string | null };

/** An AI edit proposal for a saved document; nothing is written until accepted hunks are applied. */
export type AiProposal = {
  id: string; path: string; revision: string; summary: string; hunks: ProposalHunk[];
  before: string[]; after: string[]; original: EditableDocument; proposed: EditableDocument; elapsedMs: number; model: string;
};

const base = () => `${import.meta.env?.BASE_URL ?? "/"}api/ai/`;

export async function readAiStatus(): Promise<AiStatus> {
  try {
    const response = await fetch(`${base()}status`);
    if (!response.ok) return { enabled: false };
    return await response.json() as AiStatus;
  } catch { return { enabled: false }; }
}

/** Parses an NDJSON response body into events as lines arrive. */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<AiEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let index: number;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) yield JSON.parse(line) as AiEvent;
    }
    if (done) return;
  }
}

export type AiTurnRequest = { session: string; root: string; path: string; question: string; documentText: string; selection: string };

export type AiEditRequest = { session: string; root: string; path: string; revision: string; request: string; selection: string };

export async function* askAi(request: AiTurnRequest | AiEditRequest, signal: AbortSignal): AsyncGenerator<AiEvent> {
  const response = await fetch(`${base()}${"request" in request ? "edit" : "turn"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal });
  if (!response.ok || !response.body) {
    const error = await response.json().catch(() => ({})) as { error?: string };
    yield { type: "error", message: error.error ?? `HTTP ${response.status}` };
    return;
  }
  yield* readEvents(response.body);
}

export async function interruptAi(session: string): Promise<void> {
  await fetch(`${base()}interrupt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session }) }).catch(() => {});
}

export type AnswerPart = { text: string } | { text: string; target: string; path: string; anchor: string };

/** Splits an answer into text and Markdown links. Relative document links become citations. */
export function answerParts(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  const link = /\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  let last = 0;
  for (let match; (match = link.exec(answer));) {
    if (match.index > last) parts.push({ text: answer.slice(last, match.index) });
    const target = match[2]!.trim();
    const relative = !/^[a-z][a-z0-9+.-]*:|^\/|^\\/i.test(target);
    const [file = "", anchor = ""] = target.split("#", 2);
    parts.push(relative && /\.md$/i.test(file) ? { text: match[1]!, target, path: safeDecode(file), anchor: safeDecode(anchor) } : { text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < answer.length) parts.push({ text: answer.slice(last) });
  return parts;
}

function safeDecode(value: string): string { try { return decodeURIComponent(value); } catch { return value; } }

/** Joins a root folder and a relative document path with the root's separator. */
export function joinDocumentPath(root: string, relative: string): string {
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  const parts = relative.split(/[\\/]+/).filter(part => part && part !== ".");
  return [root.replace(/[\\/]+$/, ""), ...parts].join(separator);
}

/** Applies the accepted hunks (none discards the proposal); a changed file answers 409 and nothing is written. */
export async function applyProposal(id: string, accepted: number[]): Promise<{ revision: string; written: boolean }> {
  const response = await fetch(`${base()}apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, accepted }) });
  const body = await response.json() as { revision: string; written: boolean; error?: string };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}
