import { Button } from "@/components/ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { splitDocumentPath } from "./document-path.ts";

export type DocumentView = "visual" | "source";

type TopBarProps = {
  documentPath: string;
  status: string;
  unsaved?: boolean;
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
};

/** Document identity on the left; document state and document-level actions on the right. */
export function TopBar({
  documentPath, status, unsaved = false, view, viewDisabled, sourceHint, onViewChange, saveDisabled, saveHint, onSave,
}: TopBarProps) {
  const { name } = splitDocumentPath(documentPath);
  const idle = status === "Ready" || status === "Saved" || status === "Saved; newer edits pending";
  const displayStatus = idle ? (unsaved ? "Unsaved changes" : status === "Ready" ? "" : "Saved") : status;
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
  const saveButton = (
    <Button
      type="button"
      onClick={onSave}
      disabled={saveDisabled}
      focusableWhenDisabled={Boolean(saveHint)}
      data-testid="save"
    />
  );
  return (
    <header className="top-bar">
      <p className="document-path" data-testid="current-file" title={documentPath || undefined}>
        {documentPath ? (
          <span className="document-path-name">{name}</span>
        ) : (
          "No file opened"
        )}
      </p>
      <div className="top-bar-actions">
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
        <p className="status" data-testid="status" data-operation={status} role="status">
          {displayStatus}
        </p>
        {saveHint ? (
          <Tooltip>
            <TooltipTrigger render={saveButton}>Save</TooltipTrigger>
            <TooltipContent>{saveHint}</TooltipContent>
          </Tooltip>
        ) : (
          <Button type="button" onClick={onSave} disabled={saveDisabled} data-testid="save">
            Save
          </Button>
        )}
      </div>
    </header>
  );
}
