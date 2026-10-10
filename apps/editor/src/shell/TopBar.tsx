import type { Ref } from "react";
import { ListOrdered, LoaderCircle, PanelRight, RotateCcw, UnfoldHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { splitDocumentPath } from "./document-path.ts";

export type DocumentView = "visual" | "source";

const SAVE_SHORTCUT_LABEL = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘S" : "Ctrl+S";

type TopBarProps = {
  documentPath: string;
  headingNumbering?: boolean;
  onToggleHeadingNumbering?(): void;
  numberingDisabled?: boolean;
  status: string;
  unsaved?: boolean;
  /** False when IeumDoc cannot write the open document as canonical Markdown. */
  writable?: boolean;
  view: DocumentView;
  /** Both views unavailable, e.g. no document or an operation in flight. */
  viewDisabled?: boolean;
  /** Why Source is unavailable; Source is disabled while set. */
  sourceHint?: string;
  onViewChange(view: DocumentView): void;
  saveDisabled: boolean;
  /** Why Save is unavailable, when the reason is not obvious from the status. */
  saveHint?: string;
  onSave(): void;
  onReload?(): void;
  reloadDisabled?: boolean;
  /** The Wide document display preference. */
  wide?: boolean;
  onToggleWide?(): void;
  /** Whether the outline panel is shown. */
  outline?: boolean;
  onToggleOutline?(): void;
  outlineToggleRef?: Ref<HTMLButtonElement>;
};

/**
 * Document identity and its state on the left, so status changes never move the controls.
 * On the right: the document setting, the view (mode, width, then the outline panel), then file actions. Only Save with unsaved
 * changes takes the accent. Spaced groups separate settings, view and file actions; the active view
 * tab and on toggles carry the current-item marker, independent of keyboard focus.
 */
export function TopBar({
  documentPath, status, unsaved = false, writable = true, view, viewDisabled, sourceHint, onViewChange, saveDisabled, saveHint,
  onSave, onReload, reloadDisabled, headingNumbering, onToggleHeadingNumbering, numberingDisabled, wide, onToggleWide,
  outline, onToggleOutline, outlineToggleRef,
}: TopBarProps) {
  const { name } = splitDocumentPath(documentPath);
  const idle = status === "Ready" || status === "Saved" || status === "Saved; newer edits pending";
  const displayStatus = idle
    ? (!writable ? "Cannot save" : unsaved ? "Unsaved changes" : status === "Ready" ? "" : "Saved")
    : status;
  const sourceProps = {
    type: "button" as const,
    variant: "ghost" as const,
    size: "sm" as const,
    className: "view-toggle-option",
    "aria-pressed": view === "source",
    onClick: () => onViewChange("source"),
    disabled: viewDisabled || Boolean(sourceHint),
    "data-testid": "view-source",
  };
  const saving = status === "Saving…";
  const saveState = saving ? "saving" : unsaved ? "unsaved" : "clean";
  const saveVariant = saveState === "unsaved" ? "default" : "ghost";
  const saveLabel = (
    <>
      Save
      {saving ? <LoaderCircle aria-hidden="true" className="top-bar-save-spinner motion-safe:animate-spin" /> : null}
    </>
  );
  const saveButton = (
    <Button
      type="button"
      variant={saveVariant}
      className="top-bar-save"
      data-save-state={saveState}
      aria-busy={saving || undefined}
      onClick={onSave}
      disabled={saveDisabled}
      focusableWhenDisabled={Boolean(saveHint)}
      data-testid="save"
    />
  );
  return (
    <header className="top-bar">
      <div className="top-bar-identity">
        <p className="document-path" data-testid="current-file" title={documentPath || undefined}>
          {documentPath ? (
            <span className="document-path-name">{name}</span>
          ) : (
            "No file opened"
          )}
        </p>
        <p className="status" data-testid="status" data-operation={status} role="status">
          {displayStatus}
        </p>
      </div>
      <div className="top-bar-actions">
        {onToggleHeadingNumbering ? (
          <div className="top-bar-group" role="group" aria-label="Document settings">
            <Button type="button" size="icon-sm" variant="ghost" className="top-bar-toggle" aria-label="Number headings"
              title="Number headings (H2–H6; H1 stays a title)" aria-pressed={headingNumbering} disabled={numberingDisabled} onClick={onToggleHeadingNumbering}>
              <ListOrdered aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        <div className="top-bar-group" role="group" aria-label="View controls">
          <div className="view-toggle" role="group" aria-label="Document view">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="view-toggle-option"
              aria-pressed={view === "visual"}
              onClick={() => onViewChange("visual")}
              disabled={viewDisabled}
              data-testid="view-visual"
            >
              Visual
            </Button>
            {sourceHint ? (
              <Tooltip>
                <TooltipTrigger render={<Button {...sourceProps} focusableWhenDisabled />}>Source</TooltipTrigger>
                <TooltipContent>{sourceHint}</TooltipContent>
              </Tooltip>
            ) : (
              <Button {...sourceProps}>Source</Button>
            )}
          </div>
          {onToggleWide ? (
            <Button type="button" size="icon-sm" variant="ghost" className="top-bar-toggle" aria-label="Wide document"
              title="Wide document (this browser only)" aria-pressed={wide} onClick={onToggleWide}>
              <UnfoldHorizontal aria-hidden="true" />
            </Button>
          ) : null}
          {onToggleOutline ? (
            <Button ref={outlineToggleRef} type="button" size="icon-sm" variant="ghost" className="top-bar-toggle" aria-label="Outline"
              title="Outline" aria-pressed={outline} onClick={onToggleOutline}>
              <PanelRight aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <div className="top-bar-group" role="group" aria-label="File actions">
          {onReload ? (
            <Button type="button" size="sm" variant="ghost" onClick={onReload} disabled={reloadDisabled} title="Reload the file from disk">
              <RotateCcw aria-hidden="true" />
              Reload
            </Button>
          ) : null}
          {saveHint ? (
            <Tooltip>
              <TooltipTrigger render={saveButton}>{saveLabel}</TooltipTrigger>
              <TooltipContent>{saveHint}</TooltipContent>
            </Tooltip>
          ) : (
            <Button type="button" variant={saveVariant} className="top-bar-save" data-save-state={saveState}
              aria-busy={saving || undefined} onClick={onSave} disabled={saveDisabled} data-testid="save"
              title={`Save (${SAVE_SHORTCUT_LABEL})`} aria-keyshortcuts="Control+S Meta+S">
              {saveLabel}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
