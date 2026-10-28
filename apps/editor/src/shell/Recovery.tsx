import { UiError } from "../ui-message.ts";
import { useMessageState } from "../ui-message.ts";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { lazy, Suspense, useRef, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import type { RecoveryRecord } from "../recovery-storage.ts";
import { splitDocumentPath } from "./document-path.ts";
import { recoveryReasonText } from "../recovery-message.ts";

const RecoveryCompare = lazy(() => import("./RecoveryCompare.tsx"));

export function RecoveryList({ records, unavailable = false, onReview }: { records: RecoveryRecord[]; unavailable?: boolean; onReview(record: RecoveryRecord): void }) {
  useTranslation();
  return <section className="document-start-section" aria-labelledby="recovery-title" data-testid="recovery-list">
    <h2 id="recovery-title" className="document-start-label">{i18n.t("Recover unsaved work")}</h2>
    <p className="document-start-text">{unavailable ? i18n.t("Local recovery records could not be read. Open Settings to review storage information.") : records.length ? i18n.t("Local records, newest first. Review a record before restoring or deleting it.") : i18n.t("No local recovery records.")}</p>
    <ul className="recovery-records">{records.map(record => <li key={record.id}>
      <div><strong>{typeof record.path === "string" ? splitDocumentPath(record.path).name : i18n.t("Unknown document")}</strong>
        <p className="document-start-text">{typeof record.path === "string" ? record.path : i18n.t("Unknown path")}</p>
        <p className="document-start-text">{Number.isFinite(record.recordedAt) ? new Date(record.recordedAt).toLocaleString(i18n.resolvedLanguage) : i18n.t("Unknown recording time")}</p></div>
      <Button size="sm" variant="secondary" onClick={() => onReview(record)}>{i18n.t("Review recovery")}</Button>
    </li>)}</ul>
  </section>;
}

export function RecoveryPrompt({ record, reason, onRestore, onDelete, onClose }: {
  record: RecoveryRecord | null; reason: string; onRestore(): Promise<void>; onDelete(): Promise<void>; onClose(): void;
}) {
  useTranslation();
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [comparisonRecord, setComparisonRecord] = useState<RecoveryRecord | null>(null);
  const comparing = record !== null && comparisonRecord === record;
  const deleteButton = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useMessageState("");
  const [problem, setProblem] = useMessageState("");
  const run = async (action: () => Promise<void>) => {
    setPending(true); setProblem("");
    try { await action(); } catch (error) { setProblem(error instanceof Error ? error : String(error)); } finally { setPending(false); }
  };
  return <Dialog open={record !== null} onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent showCloseButton={false} data-testid="recovery-prompt" className={comparing ? "recovery-prompt-comparing" : undefined}>
      <DialogHeader><DialogTitle>{reason ? i18n.t("Recovery cannot be restored") : i18n.t("Restore unsaved work?")}</DialogTitle>
        <DialogDescription render={<div />} className="grid gap-3 [overflow-wrap:anywhere]">
          <p>{typeof record?.path === "string" ? record.path : i18n.t("Unknown path")}</p>
          <p>{reason ? recoveryReasonText(reason) : i18n.t("Restore this local record as unsaved work. Your original file is unchanged; Save still checks for external changes. No automatic merge is performed.")}</p>
          <p>{i18n.t("Only the last recorded applied content is available. Unapplied property drafts and image files are not backed up.")}</p>
        </DialogDescription></DialogHeader>
      <Button variant="secondary" size="sm" aria-expanded={comparing} aria-controls="recovery-comparison" onClick={() => setComparisonRecord(comparing ? null : record)}>{i18n.t("Compare")}</Button>
      {comparing && record ? <div id="recovery-comparison"><Suspense fallback={<p role="status">{i18n.t("Loading comparison…")}</p>}><RecoveryCompare record={record} /></Suspense></div> : null}
      <details><summary>{i18n.t("Plaintext recovery copy")}</summary>
        <p>{i18n.t("Readable text only. This copy does not restore document structure or formatting.")}</p>
        <textarea className="recovery-text" aria-label={i18n.t("Plaintext recovery copy")} readOnly value={typeof record?.recoveryText === "string" ? record.recoveryText : i18n.t("No plaintext was found in this record.")} />
        <Button variant="secondary" size="sm" onClick={() => void run(async () => {
          if (!navigator.clipboard) throw new UiError({ key: "Clipboard access is unavailable. Select the plaintext and copy it manually." });
          await navigator.clipboard.writeText(record?.recoveryText ?? ""); setCopied({ key: "Copied" });
        })}>{copied || i18n.t("Copy text")}</Button>
      </details>
      {problem ? <p role="alert">{problem}</p> : null}
      <DialogFooter>
        <Button variant="secondary" size="sm" disabled={pending} onClick={onClose} autoFocus>{i18n.t("Not now")}</Button>
        <Button variant="destructive" size="sm" disabled={pending} ref={deleteButton} onClick={() => setConfirmDelete(true)}>{i18n.t("Delete record")}</Button>
        <Button size="sm" disabled={pending || Boolean(reason)} onClick={() => void run(onRestore)}>{i18n.t("Restore work")}</Button>
      </DialogFooter>
      <RecoveryDeleteDialog open={confirmDelete} pending={pending} finalFocus={deleteButton}
        onCancel={() => setConfirmDelete(false)} onDelete={() => void run(async () => { try { await onDelete(); } finally { setConfirmDelete(false); } })}
        path={typeof record?.path === "string" ? record.path : i18n.t("Unknown document")} />
    </DialogContent>
  </Dialog>;
}

/** Explicit local-record deletion only; Save/Reload and session cleanup own their existing paths. */
export function RecoveryDeleteDialog({ open, pending, path, finalFocus, onCancel, onDelete }: {
  open: boolean; pending: boolean; path?: string;
  finalFocus: ComponentProps<typeof DialogContent>["finalFocus"];
  onCancel(): void; onDelete(): void;
}) {
  useTranslation();
  return <Dialog open={open} onOpenChange={next => { if (!next && !pending) onCancel(); }}>
    <DialogContent showCloseButton={false} finalFocus={finalFocus} aria-busy={pending}>
      <DialogHeader>
        <DialogTitle>{path === undefined ? i18n.t("Delete all recovery records?") : i18n.t("Delete recovery record?")}</DialogTitle>
        <DialogDescription render={<div />} className="grid gap-3 [overflow-wrap:anywhere]">
          <p>{path === undefined
            ? i18n.t("Delete all local records? Scheduled recordings are cancelled too. Only the next applied edit starts recording again, including edits in other open windows. Your open work and original files stay unchanged.")
            : i18n.t("Delete the local recovery record for {{name}}?", { name: path })}</p>
          <p>{i18n.t("This cannot be undone.")}</p>
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="secondary" size="sm" disabled={pending} onClick={onCancel} autoFocus>{i18n.t("Cancel")}</Button>
        <Button variant="destructive" size="sm" disabled={pending} onClick={onDelete}>{path === undefined ? i18n.t("Delete all records") : i18n.t("Delete record")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
