import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button.tsx";
import type { AiConversation, AiStatus } from "../ai.ts";

export function AiChat({ status, conversation, roots, onSettings, onOpen }:
  { status: AiStatus | null; conversation: AiConversation; roots: string[]; onSettings(): void; onOpen(file: string): void }) {
  const { root, setRoot, output, setOutput, question, setQuestion } = conversation;
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [conversation.messages.length, conversation.busy]);
  const selected = roots.includes(root) ? root : roots[0] ?? "";
  return <section className="ai-chat" id="panel-ai-chat" role="tabpanel" aria-labelledby="tab-ai-chat" data-testid="ai-chat">
    <div className="ai-scope">
      <label>참고 폴더<select aria-label="참고 폴더" value={selected} disabled={conversation.busy} onChange={event => setRoot(event.target.value)}>
        {!roots.length ? <option value="">폴더를 열어주세요</option> : roots.map(item => <option key={item} value={item}>{item}</option>)}
      </select></label>
      <label title="참고 폴더 안의 하위 폴더 이름입니다. 없으면 새로 만듭니다.">출력 폴더<input aria-label="출력 폴더" placeholder="reports" value={output} disabled={conversation.busy} onChange={event => setOutput(event.target.value)} /></label>
      <p>열린 폴더의 저장된 문서를 참고합니다. 이 Codex 버전은 shell 읽기를 해당 폴더로 제한하지 못합니다.</p>
      <Button variant="ghost" size="sm" onClick={onSettings}>Codex 상태</Button>
      <Button variant="ghost" size="sm" disabled={conversation.busy || !conversation.messages.length} onClick={() => { if (window.confirm("대화 내용을 모두 지울까요? 만든 보고서 파일은 지워지지 않습니다.")) conversation.clear(); }}>대화 지우기</Button>
    </div>
    <div ref={log} className="ai-messages" role="log" aria-label="AI 대화" data-testid="ai-messages">
      {!conversation.messages.length ? <p className="ai-empty">문서에 대해 묻거나, 보고서가 필요하면 "보고서로 만들어줘"처럼 요청하세요. 탭을 바꿔도 대화는 유지됩니다.</p> : null}
      {conversation.messages.map((message, index) => <article className={`ai-message ai-message--${message.role}`} key={index}>
        <strong>{message.role === "user" ? "나" : message.role === "assistant" ? "AI" : "Host"}</strong><p>{message.text}</p>
        {message.report ? <Button variant="secondary" size="sm" onClick={() => onOpen(message.report!)}>검증된 보고서 열기</Button> : null}
      </article>)}
      {conversation.busy ? <p className="ai-activity" role="status">{conversation.activity || "요청을 처리하고 있습니다…"}</p> : null}
    </div>
    <form className="ai-compose" onSubmit={event => { event.preventDefault(); if (!question.trim()) return; void conversation.send(selected, output.trim() || "reports", question.trim()); setQuestion(""); }}>
      <textarea aria-label="AI 요청" placeholder="핵심 수치 표, 수식, Mermaid 그림을 넣어 요약 보고서를 만들어줘." value={question} onChange={event => setQuestion(event.target.value)} disabled={conversation.busy} />
      <div>{conversation.busy ? <Button type="button" variant="secondary" onClick={() => void conversation.stop()}>중지</Button>
        : <Button type="submit" disabled={!selected || !question.trim() || !status?.loggedIn || !status.modelAvailable}>보내기</Button>}</div>
    </form>
  </section>;
}
