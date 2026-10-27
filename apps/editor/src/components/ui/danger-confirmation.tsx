import { useRef, type ReactNode, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog.tsx";

/** Named destructive actions always begin on Cancel and return to the surviving target. */
export function DangerConfirmation({ title, description, action, pending, error, returnFocus, onConfirm, onClose }: {
  title: string; description: ReactNode; action: string; pending: boolean; error: string;
  returnFocus: RefObject<HTMLElement | null>; onConfirm(): void; onClose(): void;
}) {
  const { t } = useTranslation();
  const cancel = useRef<HTMLButtonElement>(null);
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent showCloseButton={false} initialFocus={cancel} finalFocus={() => returnFocus.current ?? true}
      aria-busy={pending || undefined}>
      <DialogHeader><DialogTitle>{title}</DialogTitle>
        <DialogDescription className="[overflow-wrap:anywhere]">{description}</DialogDescription></DialogHeader>
      {error ? <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p> : null}
      <DialogFooter>
        <Button ref={cancel} size="sm" variant="secondary" disabled={pending} onClick={onClose}>{t("Cancel")}</Button>
        <Button size="sm" variant="destructive" disabled={pending} onClick={onConfirm}>{action}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
