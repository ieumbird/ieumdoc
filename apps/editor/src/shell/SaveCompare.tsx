import { useCallback, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { RecoveryPreviewResponse, SaveRequest } from "../../shared/document-protocol.ts";
import { SaveContentError } from "../../shared/save-error.ts";
import { SaveDisplayError } from "../save-error.ts";
import type { TiptapJSON } from "../tiptap-document.ts";
import { i18n } from "../i18n.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import SourceCompare, { type Comparison } from "./SourceCompare.tsx";

export type SaveComparison = { path: string; revision: string; request?: SaveRequest; submitted?: TiptapJSON; failure?: Error };

export default function SaveCompare({ comparison, returnFocus, onClose }: {
  comparison: SaveComparison; returnFocus: RefObject<HTMLElement | null>; onClose(): void;
}) {
  useTranslation();
  const load = useCallback(async (signal: AbortSignal): Promise<Comparison> => {
    const response = await fetch(`${import.meta.env.BASE_URL}api/document-source?recovery=1`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: comparison.path, save: comparison.request }), signal,
    });
    const result: RecoveryPreviewResponse = await response.json();
    if (!response.ok || result.disk === undefined) throw new Error(result.error ?? `HTTP ${response.status}`);
    if (!comparison.failure && result.markdown === undefined && !result.error) throw new Error("The Host did not return a Save preview.");
    const failure = comparison.failure ?? (result.error ? new SaveDisplayError([
      new SaveContentError(result.error, result.failure?.target, result.failure),
    ], comparison.submitted, comparison.request) : undefined);
    return { before: result.disk?.source ?? "", after: result.markdown ?? "", failure,
      changed: Boolean(result.disk && result.disk.revision !== comparison.revision), missing: result.disk === null };
  }, [comparison]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="recovery-prompt-comparing" finalFocus={returnFocus} data-testid="save-comparison">
      <DialogHeader>
        <DialogTitle>{i18n.t("Changes before saving")}</DialogTitle>
        <DialogDescription render={<div />} className="grid gap-3 [overflow-wrap:anywhere]">
          <p>{comparison.path}</p>
          <p>{i18n.t("Read-only preview of applied content. Unapplied drafts are excluded. Close to keep editing.")}</p>
        </DialogDescription>
      </DialogHeader>
      <SourceCompare load={load} />
      <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>{i18n.t("Close")}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
