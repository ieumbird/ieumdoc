// SPIKE: right-side AI Q&A panel over the local Codex CLI (`ieumdoc serve --ai`).
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, Square, X } from "lucide-react";
import { i18n } from "../i18n.ts";
import { Button } from "@/components/ui/button.tsx";
import { Notice } from "../ui/primitives.tsx";
import { answerParts, askAi, interruptAi, type AiProposal, type AiStatus } from "../ai.ts";

type Mode = "ask" | "edit";
type Entry = { id: number; mode: Mode; question: string; answer: string; activity: string[]; state: "running" | "done" | "stopped" | "failed"; error: string };

type AiPanelProps = {
  overlay: boolean;
  status: AiStatus | null;
  /** Conversation key: one Codex thread per document tab. */
  session: string;
  root: string;
  path: string;
  context(): { text: string; selection: string };
  onOpenCitation(path: string, anchor: string): void;
  /** Edit requests need the saved document: its revision, and whether it has unsaved changes or a review open. */
  edit: { revision(): string; dirty: boolean; reviewing: boolean };
  onProposal(session: string, proposal: AiProposal): void;
  onSettings(): void;
  onClose(): void;
};

let nextEntry = 0;

export function AiPanel({ overlay, status, session, root, path, context, onOpenCitation, edit, onProposal, onSettings, onClose }: AiPanelProps) {
  useTranslation();
  const [conversations, setConversations] = useState<Record<string, Entry[]>>({});
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<Mode>("ask");
  const editBlocked = mode === "edit" && (!path || edit.dirty || edit.reviewing);
  const running = useRef(new Map<string, AbortController>());
  const list = useRef<HTMLDivElement>(null);
  const entries = conversations[session] ?? [];
  const busy = entries.some(entry => entry.state === "running");
  const ready = status?.enabled && status.installed && status.loggedIn && status.modelAvailable !== false;
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [entries]);
  useEffect(() => () => running.current.forEach(controller => controller.abort()), []);

  const update = (key: string, id: number, change: (entry: Entry) => Entry) =>
    setConversations(all => ({ ...all, [key]: (all[key] ?? []).map(entry => entry.id === id ? change(entry) : entry) }));

  const ask = async () => {
    const text = question.trim();
    if (!text || busy || !ready || !root || editBlocked) return;
    const key = session;
    const id = ++nextEntry;
    const controller = new AbortController();
    running.current.set(key, controller);
    setQuestion("");
    setConversations(all => ({ ...all, [key]: [...(all[key] ?? []), { id, mode, question: text, answer: "", activity: [], state: "running", error: "" }] }));
    const { text: documentText, selection } = context();
    // Agent messages arrive as deltas; a completed message replaces its accumulated deltas.
    const messages = new Map<string, string>();
    const answer = () => [...messages.values()].join("\n\n");
    try {
      const request = mode === "edit" ? { session: key, root, path, revision: edit.revision(), request: text, selection }
        : { session: key, root, path, question: text, documentText, selection };
      for await (const event of askAi(request, controller.signal)) {
        if (event.type === "delta") { messages.set(event.itemId, (messages.get(event.itemId) ?? "") + event.text); update(key, id, entry => ({ ...entry, answer: answer() })); }
        else if (event.type === "message") { messages.set(event.itemId, event.text); update(key, id, entry => ({ ...entry, answer: answer() })); }
        else if (event.type === "proposal") {
          const count = event.proposal.hunks.length;
          messages.set("proposal", count ? `${event.proposal.summary}\n\n${i18n.t("{{count}} proposed changes are shown in the document for review.", { count })}`
            : i18n.t("No changes were proposed."));
          update(key, id, entry => ({ ...entry, answer: answer() }));
          if (count) onProposal(key, event.proposal);
        }
        else if (event.type === "activity") update(key, id, entry => ({ ...entry, activity: [...entry.activity, event.text] }));
        else if (event.type === "error") update(key, id, entry => ({ ...entry, state: "failed", error: event.message }));
        else if (event.type === "done") update(key, id, entry => ({ ...entry, state: entry.state === "failed" ? "failed"
          : event.status === "interrupted" ? "stopped" : event.status === "failed" ? "failed" : "done", error: entry.error || (event.error ?? "") }));
      }
    } catch (error) {
      if (!controller.signal.aborted) update(key, id, entry => ({ ...entry, state: "failed", error: String(error) }));
    } finally {
      running.current.delete(key);
      update(key, id, entry => entry.state === "running" ? { ...entry, state: controller.signal.aborted ? "stopped" : "done" } : entry);
    }
  };

  const stop = () => {
    void interruptAi(session);
    running.current.get(session)?.abort();
  };

  return (
    <aside className={`document-panel ai-panel${overlay ? " document-panel--overlay" : ""}`} aria-labelledby="ai-panel-title" data-testid="ai-panel"
      onKeyDown={event => { if (event.key === "Escape" && overlay) { event.preventDefault(); onClose(); } }}>
      <div className="document-panel-header">
        <h2 className="ai-panel-title" id="ai-panel-title">{i18n.t("Ask AI")}</h2>
        <span className="ai-panel-model" title={status?.enabled ? status.model : undefined}>{status?.enabled ? status.modelLabel : ""}</span>
        <Button type="button" size="icon-sm" variant="ghost" aria-label={i18n.t("Close AI panel")} title={i18n.t("Close AI panel")} onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="ai-panel-messages" ref={list} aria-live="polite">
        {!ready ? <Notice tone="info" className="ai-panel-setup">
          <p>{!status?.enabled ? i18n.t("AI is not enabled on this Host. Start it with ieumdoc serve --ai.")
            : !status.installed ? i18n.t("Codex CLI is not installed on the Host.")
            : !status.loggedIn ? i18n.t("Codex is not logged in. Run codex login on the Host.")
            : i18n.t("The {{model}} model is not available to this Codex account.", { model: status.modelLabel })}</p>
          <Button type="button" size="sm" variant="secondary" onClick={onSettings}>{i18n.t("Open AI settings")}</Button>
        </Notice> : entries.length === 0 ? <p className="ai-panel-empty">{i18n.t("Ask about this document or other documents in the opened folder. Select text to ask about it.")}</p> : null}
        {entries.map(entry => <article key={entry.id} className="ai-turn" data-state={entry.state}>
          <p className="ai-question">{entry.mode === "edit" ? <span className="ai-question-mode">{i18n.t("Edit request")}</span> : null}{entry.question}</p>
          {entry.activity.length ? <p className="ai-activity">{i18n.t("Reading files: {{count}}", { count: entry.activity.length })}</p> : null}
          <div className="ai-answer" data-testid="ai-answer">
            {answerParts(entry.answer).map((part, index) => "path" in part
              ? <a key={index} href="#" className="ai-citation" title={part.target}
                  onClick={event => { event.preventDefault(); onOpenCitation(part.path, part.anchor); }}>{part.text}</a>
              : <span key={index}>{part.text.split(/\*\*([^*\n]+)\*\*/).map((text, at) => at % 2 ? <strong key={at}>{text}</strong> : text)}</span>)}
            {entry.state === "running" && !entry.answer ? <span className="ai-thinking">{i18n.t("Thinking…")}</span> : null}
          </div>
          {entry.state === "stopped" ? <p className="ai-activity">{i18n.t("Stopped.")}</p> : null}
          {entry.error ? <Notice tone="error">{entry.error}</Notice> : null}
        </article>)}
      </div>
      <div className="ai-panel-modes" role="radiogroup" aria-label={i18n.t("AI mode")}>
        {(["ask", "edit"] as const).map(value => <button key={value} type="button" role="radio" aria-checked={mode === value}
          className="ai-panel-mode" data-testid={`ai-mode-${value}`} onClick={() => setMode(value)}>
          {value === "ask" ? i18n.t("Question") : i18n.t("Edit request")}</button>)}
      </div>
      {mode === "edit" && ready ? <p className="ai-panel-mode-note" data-testid="ai-edit-note">
        {!path ? i18n.t("Open a document to request edits.")
          : edit.reviewing ? i18n.t("Finish reviewing the current proposal first.")
          : edit.dirty ? i18n.t("This document has unsaved changes. Save it first; AI edits are proposed against the saved file.")
          : i18n.t("AI proposes changes to the saved document. Nothing changes until you accept them.")}</p> : null}
      <form className="ai-panel-form" onSubmit={event => { event.preventDefault(); void ask(); }}>
        <textarea className="ai-panel-input" value={question} rows={3} disabled={!ready} data-testid="ai-question"
          placeholder={mode === "edit" ? i18n.t("Describe the edit…") : i18n.t("Ask a question…")} aria-label={mode === "edit" ? i18n.t("Edit request") : i18n.t("Question")}
          onChange={event => setQuestion(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} />
        {busy ? <Button type="button" size="icon-sm" variant="secondary" aria-label={i18n.t("Stop")} title={i18n.t("Stop")} onClick={stop} data-testid="ai-stop">
          <Square aria-hidden="true" />
        </Button> : <Button type="submit" size="icon-sm" aria-label={i18n.t("Ask")} title={i18n.t("Ask")} disabled={!ready || !question.trim() || !root || editBlocked}>
          <ArrowUp aria-hidden="true" />
        </Button>}
      </form>
    </aside>
  );
}
