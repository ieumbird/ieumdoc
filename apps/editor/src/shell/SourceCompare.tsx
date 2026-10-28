import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RecoveryDiff, RecoveryDiffReply } from "../recovery-diff.ts";
import { Button } from "@/components/ui/button.tsx";
import { i18n } from "../i18n.ts";

export type Comparison = { before: string; after: string; fallback?: string; changed: boolean; missing: boolean; failure?: Error };

export default function SourceCompare({ load, recovery = false }: { load(signal: AbortSignal): Promise<Comparison>; recovery?: boolean }) {
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
    const budgetError = () => i18n.t(recovery ? "Comparison is too large. Use the plaintext recovery copy." : "Comparison is too large. Narrow the changes and try again.");
    setResult(undefined); setDiff(undefined); setError(""); setCurrent(0);
    const timeout = setTimeout(() => controller.abort(), 15000);
    void load(controller.signal).then(value => {
      clearTimeout(timeout);
      if (!live) return;
      setResult(value);
      if (value.failure) return;
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
  }, [load, attempt]);
  function move(direction: number) {
    if (!diff?.count) return;
    const next = current === 0 ? (direction > 0 ? 1 : diff.count) : (current - 1 + direction + diff.count) % diff.count + 1;
    setCurrent(next);
    const target = region.current?.querySelector<HTMLElement>(`[data-change-start="${next}"]`);
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "nearest" });
  }
  return <section className="recovery-comparison" aria-label={i18n.t(recovery ? "Recovery comparison" : "Changes before saving")}>
    <p>{i18n.t("Current disk file → content Save would write. Canonical formatting changes are included.")}</p>
    {!diff && !error && !result?.failure ? <p role="status">{result ? i18n.t("Calculating differences…") : i18n.t("Loading comparison…")}</p> : null}
    {result?.failure ? <p role="alert">{i18n.t("Save preview unavailable: {{reason}}", { reason: result.failure.message })}</p> : null}
    {error ? <p role="alert">{i18n.t("Comparison unavailable: {{reason}}", { reason: error })}</p> : null}
    {error ? <Button size="sm" variant="secondary" onClick={() => setAttempt(attempt + 1)}>{i18n.t("Retry comparison")}</Button> : null}
    {result?.changed ? <p role="status">{i18n.t(recovery ? "The file changed after this record. Comparing with the current disk file." : "The file changed outside IeumDoc. Comparing with the current disk file; Save will still report a conflict.")}</p> : null}
    <MissingFileNotice result={result} diff={diff} recovery={recovery} />
    {result?.fallback ? <p role="status">{i18n.t("Plaintext comparison instead of Save preview: {{reason}}", { reason: result.fallback })}</p> : null}
    {diff ? <>
      {diff.wordsOmitted ? <p role="status">{i18n.t("Word highlighting omitted to keep comparison responsive.")}</p> : null}
      <div className="recovery-diff-toolbar">
        <span role="status">{i18n.t("{{count}} changes", { count: diff.count })}</span>
        <Button size="sm" variant="secondary" disabled={!diff.count} onClick={() => move(-1)}>{i18n.t("Previous change")}</Button>
        <Button size="sm" variant="secondary" disabled={!diff.count} onClick={() => move(1)}>{i18n.t("Next change")}</Button>
        <span aria-live="polite">{current ? i18n.t("Change {{current}} of {{count}}", { current, count: diff.count }) : ""}</span>
      </div>
      <p>{i18n.t(recovery ? "Line numbers: disk / recovery. − removed, + added. Long lines wrap." : "Line numbers: disk / Save preview. − removed, + added. Long lines wrap.")}</p>
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

/** A missing file is independent of whether the comparison could finish. */
export function MissingFileNotice({ result, diff, recovery = false }: {
  result?: Comparison; diff?: RecoveryDiff; recovery?: boolean;
}) {
  if (!result?.missing) return null;
  return <p role="status">{i18n.t(diff && !result.failure
    ? recovery ? "File missing. All recovered content is shown as added." : "File missing. All content Save would write is shown as added."
    : "File missing.")}</p>;
}
