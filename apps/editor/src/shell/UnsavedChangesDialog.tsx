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
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onCancel(); }}>
      <DialogContent showCloseButton={false} finalFocus={finalFocus} aria-busy={pending}>
        <DialogHeader>
          <DialogTitle>Save changes?</DialogTitle>
          <DialogDescription render={<div />} className="grid gap-3 break-words">
            <p>Do you want to save changes to “{documentName}” before closing this tab?</p>
            {hasDrafts ? <p>Unapplied property drafts will be lost with both Save and Don't save. Save includes applied content only. Cancel to keep editing.</p> : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" size="sm" disabled={pending} onClick={onCancel} autoFocus>Cancel</Button>
          <Button variant="destructive" size="sm" disabled={pending} onClick={onDiscard}>Don't save</Button>
          <Button size="sm" disabled={pending} onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
