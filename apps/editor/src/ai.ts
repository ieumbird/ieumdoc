import { useRef, useState } from "react";

export type AiStatus = { enabled: boolean; installed?: boolean; version?: string | null; loggedIn?: boolean; authMethod?: string | null;
  model?: string | null; modelLabel?: string; modelAvailable?: boolean | null; cliAvailable?: boolean; readBoundary?: string; problem?: string };
export type AiMessage = { role: "user" | "assistant" | "host"; text: string; report?: string };
export async function readAiStatus(): Promise<AiStatus> {
  try { const response = await fetch("/api/ai/status"); if (!response.ok) return { enabled: false }; return await response.json(); }
  catch { return { enabled: false }; }
}

// App owns this state. Switching tabs, closing the panel or opening Settings cannot reset it.
export function useAiConversation(onReport: (file: string) => Promise<unknown>) {
  const report = useRef(onReport);
  report.current = onReport;
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState("");
  const [root, setRoot] = useState("");
  const [output, setOutput] = useState("");
  const [question, setQuestion] = useState("");
  const running = useRef(false);
  const append = (message: AiMessage) => setMessages(all => [...all, message]);
  const send = async (root: string, output: string, question: string) => {
    if (running.current) return;
    running.current = true; setBusy(true); setActivity(""); append({ role: "user", text: question });
    let streamed = "";
    try {
      const response = await fetch("/api/ai/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root, output, question }) });
      if (!response.ok || !response.body) throw new Error(await response.text());
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === "delta") { streamed += event.text; setActivity(streamed); }
          if (event.type === "activity") setActivity(event.text);
          if (event.type === "message") { append({ role: "assistant", text: event.text }); streamed = ""; setActivity(""); }
          if (event.type === "error") append({ role: "host", text: event.message });
          if (event.type === "report") {
            append({ role: "host", text: `검증 통과 · ${(event.elapsedMs / 1000).toFixed(1)}초 · 명령 ${event.commands}회 · 실패 ${event.failures}회`, report: event.path });
            await report.current(event.path);
          }
        }
      }
    } catch (error) { append({ role: "host", text: String(error) }); }
    finally { setBusy(false); setActivity(""); running.current = false; }
  };
  const stop = async () => { await fetch("/api/ai/interrupt", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); };
  return { messages, busy, activity, send, stop, root, setRoot, output, setOutput, question, setQuestion };
}
export type AiConversation = ReturnType<typeof useAiConversation>;
