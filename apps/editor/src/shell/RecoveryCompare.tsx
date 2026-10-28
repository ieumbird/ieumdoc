import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { diffLines, diffWordsWithSpace } from "diff";
import { Button } from "@/components/ui/button.tsx";
import { i18n } from "../i18n.ts";
import { prepareRecovery } from "../recovery-restore.ts";
import { recoveryText, type RecoveryRecord } from "../recovery-storage.ts";
import { collectSupportedEdits, toTiptapDocument } from "../tiptap-document.ts";
import type { RecoveryPreviewResponse, SaveRequest } from "../../shared/document-protocol.ts";

type Comparison = { before: string; after: string; fallback: string; changed: boolean; missing: boolean };

async function compare(record: RecoveryRecord, signal: AbortSignal): Promise<Comparison> {
  let save: SaveRequest | undefined;
  let fallback = "";
  try {
    const snapshot = prepareRecovery(record);
    save = { path: record.path, revision: snapshot.file.revision,
      base: { source: snapshot.file.source, savedEdits: snapshot.savedEdits },
      ...collectSupportedEdits(snapshot.file.document, snapshot.editor.editorDocument) };
  } catch (error) { fallback = error instanceof Error ? error.message : String(error); }
  const response = await fetch(`${import.meta.env.BASE_URL}api/document-source?recovery=1`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: record.path, save }), signal,
  });
  const result: RecoveryPreviewResponse = await response.json();
  if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
  if (result.disk === undefined) throw new Error(result.error ?? `HTTP ${response.status}`);
  fallback ||= result.error ?? "";
  let before = result.disk?.source ?? "";
  let after = result.markdown ?? record.recoveryText;
  if (fallback) {
    if (result.disk) {
      if (!result.disk.document) throw new Error(result.disk.error);
      const editorDocument = toTiptapDocument(result.disk.document);
      // Identical salvage traversal to newly recorded recovery copies; no Markdown conversion.
      before = recoveryText({ ...record.snapshot, editor: { editorDocument, savedDocument: editorDocument } });
    }
    after = record.recoveryText;
  }
  const acknowledged = record.snapshot?.file?.revision;
  return { before, after, fallback, changed: Boolean(result.disk && acknowledged && result.disk.revision !== acknowledged), missing: result.disk === null };
}

// Line endings remain part of the library comparison, including CRLF and missing final LF.
const lines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
function changes(before: string, after: string) {
  let oldLine = 1, newLine = 1, count = 0;
  const parts = diffLines(before, after, { timeout: 1000 });
  if (!parts) throw new Error(i18n.t("Comparison is too large. Use the plaintext recovery copy."));
  return { groups: parts.map((part, index) => {
    const changed = Boolean(part.added || part.removed);
    const start = changed && (index === 0 || !(parts[index - 1].added || parts[index - 1].removed));
    if (start) count++;
    const peer = part.removed && parts[index + 1]?.added ? parts[index + 1]
      : part.added && parts[index - 1]?.removed ? parts[index - 1] : undefined;
    const peerLines = peer ? lines(peer.value) : [];
    const rows = lines(part.value).map((line, n) => {
      const old = part.added ? undefined : oldLine++;
      const next = part.removed ? undefined : newLine++;
      const words = peerLines[n] === undefined ? undefined : diffWordsWithSpace(
        part.removed ? line : peerLines[n], part.removed ? peerLines[n] : line, { timeout: 100 });
      return { line, old, next, words: words?.filter(word => part.removed ? !word.added : !word.removed) };
    });
    return { rows, kind: part.added ? "added" : part.removed ? "removed" : "same", change: changed ? count : 0, start };
  }), count };
}

export default function RecoveryCompare({ record }: { record: RecoveryRecord }) {
  useTranslation();
  const [result, setResult] = useState<Comparison>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [current, setCurrent] = useState(0);
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setResult(undefined); setError(""); setCurrent(0);
    const timeout = setTimeout(() => controller.abort(), 15000);
    void compare(record, controller.signal).then(value => { if (live) setResult(value); })
      .catch(cause => { if (live) setError(controller.signal.aborted ? i18n.t("Comparison request timed out.") : String(cause.message ?? cause)); })
      .finally(() => clearTimeout(timeout));
    return () => { live = false; clearTimeout(timeout); controller.abort(); };
  }, [record, attempt]);
  const diff = useMemo(() => {
    if (!result) return;
    try { return { ...changes(result.before, result.after), error: "" }; }
    catch (cause) { return { groups: [], count: 0, error: String((cause as Error).message) }; }
  }, [result]);
  function move(direction: number) {
    if (!diff?.count) return;
    const next = current === 0 ? (direction > 0 ? 1 : diff.count) : (current - 1 + direction + diff.count) % diff.count + 1;
    setCurrent(next);
    const target = region.current?.querySelector<HTMLElement>(`[data-change-start="${next}"]`);
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "nearest" });
  }
  return <section className="recovery-comparison" aria-label={i18n.t("Recovery comparison")}>
    <p>{i18n.t("Current disk file → content Save would write. Canonical formatting changes are included.")}</p>
    {!result && !error ? <p role="status">{i18n.t("Loading comparison…")}</p> : null}
    {error || diff?.error ? <p role="alert">{i18n.t("Comparison unavailable: {{reason}}", { reason: error || diff?.error || "" })}</p> : null}
    {error ? <Button size="sm" variant="secondary" onClick={() => setAttempt(attempt + 1)}>{i18n.t("Retry comparison")}</Button> : null}
    {result?.changed ? <p role="status">{i18n.t("The file changed after this record. Comparing with the current disk file.")}</p> : null}
    {result?.missing ? <p role="status">{i18n.t("File missing. All recovered content is shown as added.")}</p> : null}
    {result?.fallback ? <p role="status">{i18n.t("Plaintext comparison instead of Save preview: {{reason}}", { reason: result.fallback })}</p> : null}
    {diff && !diff.error ? <>
      <div className="recovery-diff-toolbar">
        <span role="status">{i18n.t("{{count}} changes", { count: diff.count })}</span>
        <Button size="sm" variant="secondary" disabled={!diff.count} onClick={() => move(-1)}>{i18n.t("Previous change")}</Button>
        <Button size="sm" variant="secondary" disabled={!diff.count} onClick={() => move(1)}>{i18n.t("Next change")}</Button>
        <span aria-live="polite">{current ? i18n.t("Change {{current}} of {{count}}", { current, count: diff.count }) : ""}</span>
      </div>
      <p>{i18n.t("Line numbers: disk / recovery. − removed, + added. Long lines wrap.")}</p>
      <div className="recovery-diff" ref={region} tabIndex={0} role="region" aria-label={i18n.t("Source differences")}>
        {diff.groups.map((group, g) => <div key={g} data-kind={group.kind} data-change-start={group.start ? group.change : undefined}
          data-current={group.change > 0 && group.change === current} tabIndex={group.start ? -1 : undefined}
          aria-label={group.start ? i18n.t("Change {{current}} of {{count}}", { current: group.change, count: diff.count }) : undefined}>
          {group.rows.map((row, r) => <div className="recovery-diff-line" key={r}>
            <span className="recovery-diff-number">{row.old ?? ""}</span><span className="recovery-diff-number">{row.next ?? ""}</span>
            <span>{group.kind === "added" ? "+" : group.kind === "removed" ? "−" : " "}</span>
            <code>{row.words ? row.words.map((word, w) => word.added || word.removed ? <mark key={w}>{word.value.replace(/\r?\n$/, "")}</mark> : word.value.replace(/\r?\n$/, "")) : row.line.replace(/\r?\n$/, "")}
              {!row.line.endsWith("\n") ? <span className="recovery-eof"> {i18n.t("(no final newline)")}</span> : row.line.endsWith("\r\n") ? <span className="recovery-eof"> CRLF</span> : null}
            </code>
          </div>)}
        </div>)}
      </div>
    </> : null}
  </section>;
}
