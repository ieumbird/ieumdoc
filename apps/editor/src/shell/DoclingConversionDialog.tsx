import { useEffect, useState, type RefObject } from "react";
import { doclingFailureMessage, type ConversionJob, type PdfProgress } from "@ieumdoc/docling/server-types";
import { i18n, type MessageKey } from "../i18n.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

const phases: Record<PdfProgress["phase"], MessageKey> = {
  checking: "Checking the Docling server…", uploading: "Uploading PDF…", pending: "Waiting in the Docling queue…",
  started: "Docling is processing the PDF…", downloading: "Downloading the Docling result…", writing: "Creating the source bundle and IeumDoc document…",
};
export function DoclingConversionDialog({ open, input, job, pending, problem, returnFocus, onStart, onCancel, onClose }: {
  open: boolean; input: string; job: ConversionJob | null; pending: boolean; problem: string;
  returnFocus: RefObject<HTMLElement | null>; onStart(): void; onCancel(): void; onClose(): void;
}) {
  const [now, setNow] = useState(Date.now());
  const current = job?.input === input ? job : null;
  const running = current?.state === "running";
  useEffect(() => {
    if (!running || !open) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running, open]);
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent finalFocus={returnFocus} data-testid="docling-conversion">
      <DialogHeader>
        <DialogTitle>{i18n.t("Convert with Docling")}</DialogTitle>
        <DialogDescription>{i18n.t("Creates a source bundle and IeumDoc document, then opens Docling comparison.")}</DialogDescription>
      </DialogHeader>
      <p className="[overflow-wrap:anywhere]">{input}</p>
      <p>{i18n.t("Results go beside the PDF in a new name.docling folder. Existing names get -2, -3, and so on; existing folders are never overwritten.")}</p>
      {current ? <div role="status" aria-live="polite" className="[overflow-wrap:anywhere]">
        <p>{i18n.t(current.state === "running" ? phases[current.progress.phase] : current.state === "cancelled" ? "IeumDoc waiting stopped. The server task may continue." : current.state === "success" ? "Conversion complete." : "Docling conversion failed.")}</p>
        <p>{i18n.t("Elapsed: {{seconds}} s", { seconds: Math.max(0, Math.floor((now - current.startedAt) / 1000)) })}</p>
        {current.progress.taskId ? <p>{i18n.t("Server task")}: {current.progress.taskId}</p> : null}
        <p>{i18n.t("Result folder")}: {current.output}</p>
        {current.state === "error" ? <p>{i18n.t(doclingFailureMessage(current.failure) as MessageKey)}</p> : null}
      </div> : null}
      {problem ? <p role="alert">{problem}</p> : null}
      <p>{i18n.t("Stopping cancels only IeumDoc requests and waiting. It does not cancel the Docling server task.")}</p>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>{i18n.t(running ? "Keep in background" : "Close")}</Button>
        {running ? <Button disabled={pending} variant="secondary" onClick={onCancel}>{i18n.t("Stop waiting")}</Button>
          : <Button disabled={pending || !input} onClick={onStart}>{i18n.t(current ? "Convert again" : "Start conversion")}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
