import { ListOrdered, RotateCcw } from "lucide-react";
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
};

/**
 * Document identity and its state on the left, so status changes never move the controls.
 * On the right: the document setting, the view, then file actions. Only Save with unsaved
 * changes takes the accent; every other control is a quiet ghost button.
 */
export function TopBar({
  documentPath, status, unsaved = false, writable = true, view, viewDisabled, sourceHint, onViewChange, saveDisabled, saveHint,
  onSave, onReload, reloadDisabled, headingNumbering, onToggleHeadingNumbering, numberingDisabled,
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
  const saveVariant = unsaved ? "default" : "outline";
  const saveButton = (
    <Button
      type="button"
      variant={saveVariant}
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
          <Button type="button" size="icon-sm" variant="ghost" className="top-bar-toggle" aria-label="Number headings"
            title="Number headings (H2–H6; H1 stays a title)" aria-pressed={headingNumbering} disabled={numberingDisabled} onClick={onToggleHeadingNumbering}>
            <ListOrdered aria-hidden="true" />
          </Button>
        ) : null}
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
        {onReload ? (
          <Button type="button" size="sm" variant="ghost" onClick={onReload} disabled={reloadDisabled} title="Reload the file from disk">
            <RotateCcw aria-hidden="true" />
            Reload
          </Button>
        ) : null}
        {saveHint ? (
          <Tooltip>
            <TooltipTrigger render={saveButton}>Save</TooltipTrigger>
            <TooltipContent>{saveHint}</TooltipContent>
          </Tooltip>
        ) : (
          <Button type="button" variant={saveVariant} onClick={onSave} disabled={saveDisabled} data-testid="save"
            title={`Save (${SAVE_SHORTCUT_LABEL})`} aria-keyshortcuts="Control+S Meta+S">
            Save
          </Button>
        )}
      </div>
    </header>
  );
}
