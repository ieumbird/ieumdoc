import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import type { FolderEntry } from "../../shared/document-protocol.ts";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

/** A transient view only: never enters document/tab, save, draft or image-choice state. */
export function FilePreviewDialog({ entry, root, returnFocus, onClose }: {
  entry: FolderEntry;
  root: string;
  returnFocus: RefObject<HTMLElement | null>;
  onClose(): void;
}) {
  useTranslation();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const image = entry.kind === "image";
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="file-preview" finalFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle className="pr-8 break-words">{entry.name}</DialogTitle>
          <DialogDescription>{i18n.t(image ? "Read-only image preview" : "File information")}</DialogDescription>
        </DialogHeader>
        <p className="break-words text-muted-foreground">{entry.path}</p>
        {image ? <>
          {state === "loading" ? <p role="status">{i18n.t("Loading…")}</p> : null}
          {state === "error" ? <p role="alert">{i18n.t("The image could not be previewed. It may be unavailable, damaged, unsupported, or larger than 10 MiB.")}</p> : null}
          <img className="file-preview-image" hidden={state !== "ready"} alt={entry.name}
            src={`/api/file-preview?${new URLSearchParams({ root, path: entry.path })}`}
            onLoad={() => setState("ready")} onError={() => setState("error")} />
        </> : <p>{i18n.t("This file cannot be edited in IeumDoc.")}</p>}
      </DialogContent>
    </Dialog>
  );
}
