import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RecoveryDiff, RecoveryDiffReply } from "../recovery-diff.ts";
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

export default function RecoveryCompare({ record }: { record: RecoveryRecord }) {
  useTranslation();
  const [result, setResult] = useState<Comparison>();
  const [diff, setDiff] = useState<RecoveryDiff>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [current, setCurrent] = useState(0);
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    let worker: Worker | undefined;
    let computationTimeout: ReturnType<typeof setTimeout> | undefined;
    const stopWorker = () => { worker?.terminate(); worker = undefined; clearTimeout(computationTimeout); };
    const budgetError = () => i18n.t("Comparison is too large. Use the plaintext recovery copy.");
    setResult(undefined); setDiff(undefined); setError(""); setCurrent(0);
    const timeout = setTimeout(() => controller.abort(), 15000);
    void compare(record, controller.signal).then(value => {
      clearTimeout(timeout);
      if (!live) return;
      setResult(value);
      // A request-owned worker keeps even a single expensive library call off the UI thread.
      worker = new Worker(new URL("../recovery-diff.worker.ts", import.meta.url), { type: "module" });
      computationTimeout = setTimeout(() => { stopWorker(); if (live) setError(budgetError()); }, 2000);
      worker.onmessage = (event: MessageEvent<RecoveryDiffReply>) => {
        stopWorker();
        if (!live) return;
        if ("diff" in event.data) setDiff(event.data.diff);
        else setError(event.data.error === "budget" ? budgetError() : i18n.t("Comparison calculation failed."));
      };
      worker.onerror = () => { stopWorker(); if (live) setError(i18n.t("Comparison calculation failed.")); };
      worker.postMessage({ before: value.before, after: value.after });
    }).catch(cause => { if (live) setError(controller.signal.aborted ? i18n.t("Comparison request timed out.") : String(cause.message ?? cause)); })
      .finally(() => clearTimeout(timeout));
    return () => { live = false; clearTimeout(timeout); controller.abort(); stopWorker(); };
  }, [record, attempt]);
  function move(direction: number) {
    if (!diff?.count) return;
    const next = current === 0 ? (direction > 0 ? 1 : diff.count) : (current - 1 + direction + diff.count) % diff.count + 1;
    setCurrent(next);
    const target = region.current?.querySelector<HTMLElement>(`[data-change-start="${next}"]`);
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "nearest" });
  }
  return <section className="recovery-comparison" aria-label={i18n.t("Recovery comparison")}>
    <p>{i18n.t("Current disk file → content Save would write. Canonical formatting changes are included.")}</p>
    {!diff && !error ? <p role="status">{result ? i18n.t("Calculating differences…") : i18n.t("Loading comparison…")}</p> : null}
    {error ? <p role="alert">{i18n.t("Comparison unavailable: {{reason}}", { reason: error })}</p> : null}
    {error ? <Button size="sm" variant="secondary" onClick={() => setAttempt(attempt + 1)}>{i18n.t("Retry comparison")}</Button> : null}
    {result?.changed ? <p role="status">{i18n.t("The file changed after this record. Comparing with the current disk file.")}</p> : null}
    {result?.missing ? <p role="status">{i18n.t("File missing. All recovered content is shown as added.")}</p> : null}
    {result?.fallback ? <p role="status">{i18n.t("Plaintext comparison instead of Save preview: {{reason}}", { reason: result.fallback })}</p> : null}
    {diff ? <>
      {diff.wordsOmitted ? <p role="status">{i18n.t("Word highlighting omitted to keep comparison responsive.")}</p> : null}
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
