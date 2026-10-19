import type { Ref } from "react";
import { Copy, Ellipsis, LoaderCircle, PanelLeftOpen, PanelRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { splitDocumentPath } from "./document-path.ts";

export type DocumentView = "visual" | "source";

const SAVE_SHORTCUT_LABEL = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘S" : "Ctrl+S";

type TopBarProps = {
  /** At phone widths the closed sidebar has no rail; the TopBar opens it. */
  onOpenSidebar?(): void;
  openSidebarRef?: Ref<HTMLButtonElement>;
  documentPath: string;
  /** The folders holding the document, shown before its name; the tab row already names it. */
  location?: string[];
  status: string;
  unsaved?: boolean;
  view: DocumentView;
  /** Both views unavailable, e.g. no document or an operation in flight. */
  viewDisabled?: boolean;
  onViewChange(view: DocumentView): void;
  saveDisabled: boolean;
  onSave(): void;
  onReload?(): void;
  reloadDisabled?: boolean;
  /** Copies the document's full path, for use in other tools. */
  onCopyPath?(): void;
  fileActionsRef?: Ref<HTMLButtonElement>;
  /** Whether the outline panel is shown. */
  outline?: boolean;
  onToggleOutline?(): void;
  outlineToggleRef?: Ref<HTMLButtonElement>;
};

/**
 * Document identity and its state on the left, so status changes never move the controls.
 * The identity is the document's location: its folders, then its name, which the tab below repeats.
 * On the right: Visual/Source and Outline, then Save and the File actions menu. Only Save with unsaved
 * changes takes the accent. Spaced groups separate view and file actions; Visual/Source is a
 * segmented control and Outline a pressed toggle, so the blue marker belongs to tabs alone.
 */
export function TopBar({
  onOpenSidebar, openSidebarRef, documentPath, location = [], status, unsaved = false, view, viewDisabled, onViewChange, saveDisabled,
  onSave, onReload, reloadDisabled, onCopyPath, fileActionsRef,
  outline, onToggleOutline, outlineToggleRef,
}: TopBarProps) {
  const { name } = splitDocumentPath(documentPath);
  const idle = status === "Ready" || status === "Saved" || status === "Saved; newer edits pending";
  const displayStatus = idle
    ? (unsaved ? "Unsaved changes" : status === "Ready" ? "" : "Saved")
    : status;
  const sourceProps = {
    type: "button" as const,
    variant: "ghost" as const,
    size: "sm" as const,
    className: "view-toggle-option",
    "aria-pressed": view === "source",
    onClick: () => onViewChange("source"),
    disabled: viewDisabled,
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
  return (
    <header className="top-bar">
      <div className="top-bar-identity">
        {onOpenSidebar ? (
          <Button ref={openSidebarRef} type="button" size="icon-sm" variant="ghost" className="top-bar-sidebar"
            aria-label="Expand sidebar" title="Show sidebar" aria-expanded={false} onClick={onOpenSidebar}>
            <PanelLeftOpen aria-hidden="true" />
          </Button>
        ) : null}
        <p className="document-path" title={documentPath || undefined}>
          {documentPath ? location.map((folder, index) => (
            <span className="document-path-folder" key={index}>{folder}<span className="document-path-separator" aria-hidden="true">/</span></span>
          )) : null}
          <span className={documentPath ? "document-path-name" : undefined} data-testid="current-file" title={documentPath || undefined}>
            {documentPath ? name : "No file opened"}
          </span>
        </p>
        <p className="status" data-testid="status" data-operation={status} role="status">
          {displayStatus}
        </p>
      </div>
      <div className="top-bar-actions">
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
            <Button {...sourceProps}>Source</Button>
          </div>
          {onToggleOutline ? (
            <Button ref={outlineToggleRef} type="button" size="icon-sm" variant="ghost" className="top-bar-toggle" aria-label="Outline"
              title="Outline" aria-pressed={outline} onClick={onToggleOutline}>
              <PanelRight aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <div className="top-bar-group" role="group" aria-label="File actions">
            <Button type="button" variant={saveVariant} className="top-bar-save" data-save-state={saveState}
              aria-busy={saving || undefined} onClick={onSave} disabled={saveDisabled} data-testid="save"
              title={`Save (${SAVE_SHORTCUT_LABEL})`} aria-keyshortcuts="Control+S Meta+S">
              {saveLabel}
            </Button>
          {onReload ? (
            <DropdownMenu>
              <DropdownMenuTrigger ref={fileActionsRef}
                render={<Button type="button" size="icon-sm" variant="ghost" aria-label="File actions" title="File actions" disabled={reloadDisabled} />}>
                <Ellipsis aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onReload} disabled={reloadDisabled}>
                  <RotateCcw aria-hidden="true" />Reload
                </DropdownMenuItem>
                {onCopyPath ? (
                  <DropdownMenuItem onClick={onCopyPath} disabled={!documentPath}>
                    <Copy aria-hidden="true" />Copy path
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
