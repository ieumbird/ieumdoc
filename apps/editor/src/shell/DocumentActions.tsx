import { SAVE_SHORTCUT } from "../shortcuts.ts";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { operationText, type Operation } from "../operation.ts";
import { useEffect, useState, type Ref } from "react";
import { ArrowLeftRight, Check, Circle, Copy, Ellipsis, FileDiff, LoaderCircle, PanelRight, PanelRightOpen, RotateCcw, StretchHorizontal, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import type { DocumentView } from "./TopBar.tsx";

type DocumentActionsProps = {
  documentPath: string;
  wide?: boolean;
  onToggleWide?(): void;
  status: Operation;
  unsaved?: boolean;
  view: DocumentView;
  /** Both views unavailable, e.g. no document or an operation in flight. */
  viewDisabled?: boolean;
  onViewChange(view: DocumentView): void;
  saveDisabled: boolean;
  onSave(): void;
  onCompare?(): void;
  compareDisabled?: boolean;
  onReload?(): void;
  reloadDisabled?: boolean;
  /** Copies the document's full path, for use in other tools. */
  onCopyPath?(): void;
  fileActionsRef?: Ref<HTMLButtonElement>;
  /** Whether the outline panel is shown. */
  outline?: boolean;
  onToggleOutline?(): void;
  outlineToggleRef?: Ref<HTMLButtonElement>;
  compact?: boolean;
  onOpenRight?(): void;
  onMove?(): void;
  openRightDisabled?: boolean;
  moveDisabled?: boolean;
};

/** Actions and status of this tab row's active document. */
export function DocumentActions({
  documentPath, wide, onToggleWide, status, unsaved = false, view, viewDisabled, onViewChange, saveDisabled,
  onSave, onCompare, compareDisabled, onReload, reloadDisabled, onCopyPath, fileActionsRef,
  outline, onToggleOutline, outlineToggleRef, compact: groupCompact = false, onOpenRight, onMove, openRightDisabled, moveDisabled,
}: DocumentActionsProps) {
  useTranslation();
  // Outline stays directly reachable, including the overlay's Escape/focus-return path.
  const [narrow, setNarrow] = useState(() => globalThis.matchMedia?.("(max-width: 64rem)").matches ?? false);
  const compact = groupCompact || narrow;
  useEffect(() => {
    const query = matchMedia("(max-width: 64rem)");
    const change = () => setNarrow(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const idle = status === "ready" || status === "saved" || status === "saved-pending";
  const displayStatus = idle
    ? (unsaved ? i18n.t("Unsaved changes") : status === "ready" ? "" : operationText("saved"))
    : operationText(status);
  const sourceProps = {
    type: "button" as const,
    variant: "ghost" as const,
    size: "sm" as const,
    className: "view-toggle-option",
    "aria-pressed": view === "source",
    onClick: () => onViewChange("source"),
    disabled: viewDisabled,
    "data-testid": "view-source",
    "data-segment-label": i18n.t("Source"),
  };
  const saving = status === "saving";
  const saveState = saving ? "saving" : unsaved ? "unsaved" : "clean";
  const saveVariant = saveState === "unsaved" ? "default" : "ghost";
  const saveLabel = (
    <>{i18n.t("Save")}{saving ? <LoaderCircle aria-hidden="true" className="top-bar-save-spinner motion-safe:animate-spin" /> : null}
    </>
  );
  const StatusIcon = idle ? (unsaved ? Circle : Check)
    : status.endsWith("failed") || status === "save-conflict" ? TriangleAlert : LoaderCircle;
  return (
    <div className="top-bar-actions">
      <div className="top-bar-group" role="group" aria-label={i18n.t("View controls")}>
        <div className="view-toggle" role="group" aria-label={i18n.t("Document view")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="view-toggle-option"
            aria-pressed={view === "visual"}
            onClick={() => onViewChange("visual")}
            disabled={viewDisabled}
            data-testid="view-visual"
            data-segment-label={i18n.t("Visual")}
          ><span className="view-toggle-label">{i18n.t("Visual")}</span></Button>
          <Button {...sourceProps}><span className="view-toggle-label">{i18n.t("Source")}</span></Button>
        </div>
        {onToggleWide && !compact ? <Button type="button" size="icon-sm" variant="ghost" className="top-bar-toggle"
          aria-label={i18n.t("Wide document")} aria-pressed={wide} onClick={onToggleWide}
          title={`${i18n.t("Wide document")} — ${i18n.t("Remembered here; never saved in the document.")}`}>
          <StretchHorizontal aria-hidden="true" />
        </Button> : null}
        {onToggleOutline ? (
          <Button ref={outlineToggleRef} type="button" size="icon-sm" variant="ghost" className="top-bar-toggle" aria-label={i18n.t("Outline")}
            title={i18n.t("Outline")} aria-pressed={outline} onClick={onToggleOutline}>
            <PanelRight aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div className="top-bar-group" role="group" aria-label={i18n.t("File actions")}>
        <p className="document-status status" data-testid="status" data-operation={status} role="status" title={displayStatus || undefined}>
          {displayStatus ? <><StatusIcon aria-hidden="true" className={unsaved && idle ? "document-status-dirty" : undefined} /><span className="sr-only">{displayStatus}</span></> : null}
        </p>
          <Button type="button" variant={saveVariant} className="top-bar-save" data-save-state={saveState}
            aria-busy={saving || undefined} onClick={onSave} disabled={saveDisabled} data-testid="save"
            title={i18n.t("Save ({{shortcut}})", { shortcut: SAVE_SHORTCUT.label })} aria-keyshortcuts={SAVE_SHORTCUT.aria}>
            {saveLabel}
          </Button>
        {onReload ? (
          <DropdownMenu>
            <DropdownMenuTrigger ref={fileActionsRef}
              render={<Button type="button" size="icon-sm" variant="ghost" aria-label={i18n.t("File actions")} title={i18n.t("File actions")} disabled={reloadDisabled && !(compact && onToggleWide)} />}>
              <Ellipsis aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {compact && onToggleWide ? <DropdownMenuItem role="menuitemcheckbox" aria-checked={wide} onClick={onToggleWide}>
                <StretchHorizontal aria-hidden="true" />{i18n.t("Wide document")}</DropdownMenuItem> : null}
              {onOpenRight ? <DropdownMenuItem onClick={onOpenRight} disabled={openRightDisabled}>
                <PanelRightOpen aria-hidden="true" />{i18n.t("Open to the right")}</DropdownMenuItem> : null}
              {onMove ? <DropdownMenuItem onClick={onMove} disabled={moveDisabled}>
                <ArrowLeftRight aria-hidden="true" />{i18n.t("Move to other group")}</DropdownMenuItem> : null}
              {onCompare ? <DropdownMenuItem onClick={onCompare} disabled={compareDisabled}>
                <FileDiff aria-hidden="true" />{i18n.t("Changes before saving")}</DropdownMenuItem> : null}
              <DropdownMenuItem onClick={onReload} disabled={reloadDisabled}>
                <RotateCcw aria-hidden="true" />{i18n.t("Reload")}</DropdownMenuItem>
              {onCopyPath ? (
                <DropdownMenuItem onClick={onCopyPath} disabled={!documentPath || reloadDisabled}>
                  <Copy aria-hidden="true" />{i18n.t("Copy path")}</DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}
