import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import type { RecoveryRecord } from "../recovery-storage.ts";
import { splitDocumentPath } from "./document-path.ts";

export function RecoveryList({ records, unavailable = false, onReview }: { records: RecoveryRecord[]; unavailable?: boolean; onReview(record: RecoveryRecord): void }) {
  return <section className="document-start-section" aria-labelledby="recovery-title" data-testid="recovery-list">
    <h2 id="recovery-title" className="document-start-label">Recover unsaved work</h2>
    <p className="document-start-text">{unavailable ? "Local recovery records could not be read. Open Settings to review storage information." : records.length ? "Local records, newest first. Review a record before restoring or deleting it." : "No local recovery records."}</p>
    <ul className="recovery-records">{records.map(record => <li key={record.id}>
      <div><strong>{typeof record.path === "string" ? splitDocumentPath(record.path).name : "Unknown document"}</strong>
        <p className="document-start-text">{typeof record.path === "string" ? record.path : "Unknown path"}</p>
        <p className="document-start-text">{Number.isFinite(record.recordedAt) ? new Date(record.recordedAt).toLocaleString() : "Unknown recording time"}</p></div>
      <Button size="sm" variant="secondary" onClick={() => onReview(record)}>Review recovery</Button>
    </li>)}</ul>
  </section>;
}

export function RecoveryPrompt({ record, reason, onRestore, onDelete, onClose }: {
  record: RecoveryRecord | null; reason: string; onRestore(): Promise<void>; onDelete(): Promise<void>; onClose(): void;
}) {
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState("");
  const [problem, setProblem] = useState("");
  const run = async (action: () => Promise<void>) => {
    setPending(true); setProblem("");
    try { await action(); } catch (error) { setProblem(String(error)); } finally { setPending(false); }
  };
  return <Dialog open={record !== null} onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent showCloseButton={false} data-testid="recovery-prompt">
      <DialogHeader><DialogTitle>{reason ? "Recovery cannot be restored" : "Restore unsaved work?"}</DialogTitle>
        <DialogDescription render={<div />} className="grid gap-3 break-words">
          <p>{typeof record?.path === "string" ? record.path : "Unknown path"}</p>
          <p>{reason || "Restore this local record as unsaved work. Your original file is unchanged; Save still checks for external changes. No automatic merge is performed."}</p>
          <p>Only the last recorded applied content is available. Unapplied property drafts and image files are not backed up.</p>
        </DialogDescription></DialogHeader>
      <details><summary>Plaintext recovery copy</summary>
        <p>Text and applied properties. Document formatting is not preserved.</p>
        <textarea className="recovery-text" aria-label="Plaintext recovery copy" readOnly value={typeof record?.recoveryText === "string" ? record.recoveryText : "No plaintext was found in this record."} />
        <Button variant="secondary" size="sm" onClick={() => void run(async () => {
          if (!navigator.clipboard) throw new Error("Clipboard access is unavailable. Select the plaintext and copy it manually.");
          await navigator.clipboard.writeText(record?.recoveryText ?? ""); setCopied("Copied");
        })}>{copied || "Copy text"}</Button>
      </details>
      {problem ? <p role="alert">{problem}</p> : null}
      <DialogFooter>
        <Button variant="secondary" size="sm" disabled={pending} onClick={onClose} autoFocus>Not now</Button>
        <Button variant="destructive" size="sm" disabled={pending} onClick={() => void run(onDelete)}>Delete record</Button>
        <Button size="sm" disabled={pending || Boolean(reason)} onClick={() => void run(onRestore)}>Restore work</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
