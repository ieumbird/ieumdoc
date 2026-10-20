import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

/** Work-loss confirmation only; the caller owns Save and the action that ends the session. */
export function UnsavedChangesDialog({ open, pending, documentName, hasDrafts, finalFocus, onSave, onDiscard, onCancel }: {
  open: boolean;
  pending: boolean;
  documentName: string;
  hasDrafts: boolean;
  finalFocus: ComponentProps<typeof DialogContent>["finalFocus"];
  onSave(): void;
  onDiscard(): void;
  onCancel(): void;
}) {
  useTranslation();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onCancel(); }}>
      <DialogContent showCloseButton={false} finalFocus={finalFocus} aria-busy={pending}>
        <DialogHeader>
          <DialogTitle>{i18n.t("Save changes?")}</DialogTitle>
          <DialogDescription render={<div />} className="grid gap-3 break-words">
            <p>{i18n.t("Save changes to {{name}} before closing this tab?", { name: documentName })}</p>
            {hasDrafts ? <p>{i18n.t("Unapplied property drafts will be lost with both Save and Don't save. Save includes applied content only. Cancel to keep editing.")}</p> : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" size="sm" disabled={pending} onClick={onCancel} autoFocus>{i18n.t("Cancel")}</Button>
          <Button variant="destructive" size="sm" disabled={pending} onClick={onDiscard}>{i18n.t("Don't save")}</Button>
          <Button size="sm" disabled={pending} onClick={onSave}>{i18n.t("Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
