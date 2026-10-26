import { COMMAND_CENTER_SHORTCUT, SAVE_SHORTCUT } from "../shortcuts.ts";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { operationText, type Operation } from "../operation.ts";
import type { Ref } from "react";
import { Copy, Ellipsis, LoaderCircle, PanelLeftOpen, PanelRight, RotateCcw, Search, SlidersHorizontal, StretchHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { splitDocumentPath } from "./document-path.ts";

export type DocumentView = "visual" | "source";

type TopBarProps = {
  /** At phone widths the closed sidebar has no rail; the TopBar opens it. */
  onOpenSidebar?(): void;
  openSidebarRef?: Ref<HTMLButtonElement>;
  onOpenCommandCenter?(): void;
  documentPath: string;
  onDocumentSettings?(): void;
  documentSettingsRef?: Ref<HTMLButtonElement>;
  documentSettingsDisabled?: boolean;
  documentSettingsHint?: string;
  wide?: boolean;
  onToggleWide?(): void;
  /** The folders holding the document, shown before its name; the tab row already names it. */
  location?: string[];
  status: Operation;
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
 * The centered document/location button opens the command center. Status has its own left cell,
 * so an unsaved/saved notice never moves the center or actions.
 * Document settings stays in the document area. On the right: Visual/Source, Wide document and
 * Outline, then Save and File actions. Only Save with unsaved changes takes the accent.
 * Spaced groups separate view and file actions; Visual/Source is segmented and width/Outline
 * are pressed toggles.
 */
export function TopBar({
  onOpenSidebar, openSidebarRef, onOpenCommandCenter, documentPath, onDocumentSettings, documentSettingsRef, documentSettingsDisabled, documentSettingsHint, wide, onToggleWide,
  location = [], status, unsaved = false, view, viewDisabled, onViewChange, saveDisabled,
  onSave, onReload, reloadDisabled, onCopyPath, fileActionsRef,
  outline, onToggleOutline, outlineToggleRef,
}: TopBarProps) {
  useTranslation();
  const { name } = splitDocumentPath(documentPath);
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
  };
  const saving = status === "saving";
  const saveState = saving ? "saving" : unsaved ? "unsaved" : "clean";
  const saveVariant = saveState === "unsaved" ? "default" : "ghost";
  const saveLabel = (
    <>{i18n.t("Save")}{saving ? <LoaderCircle aria-hidden="true" className="top-bar-save-spinner motion-safe:animate-spin" /> : null}
    </>
  );
  return (
    <header className="top-bar">
      <div className="top-bar-identity">
        {onOpenSidebar ? (
          <Button ref={openSidebarRef} type="button" size="icon-sm" variant="ghost" className="top-bar-sidebar"
            aria-label={i18n.t("Expand sidebar")} title={i18n.t("Show sidebar")} aria-expanded={false} onClick={onOpenSidebar}>
            <PanelLeftOpen aria-hidden="true" />
          </Button>
        ) : null}
        {onDocumentSettings ? <Button ref={documentSettingsRef} type="button" variant="ghost" size="sm" className="top-bar-document-settings"
          aria-haspopup="dialog" disabled={documentSettingsDisabled} title={documentSettingsHint}
          onClick={onDocumentSettings}><SlidersHorizontal aria-hidden="true" />{i18n.t("Document settings")}</Button> : null}
        <p className="status" data-testid="status" data-operation={status} role="status">
          {displayStatus}
        </p>
      </div>
      <Button type="button" variant="outline" className="command-center-trigger"
        aria-label={i18n.t("Command center")} title={i18n.t("Command center ({{shortcut}})", { shortcut: COMMAND_CENTER_SHORTCUT.label })}
        aria-haspopup="dialog" aria-keyshortcuts={COMMAND_CENTER_SHORTCUT.aria} onClick={onOpenCommandCenter}
        onMouseDown={event => { if (event.button === 0) event.preventDefault(); }}>
        <Search aria-hidden="true" />
        <span className="document-path" title={documentPath || undefined}>
          {documentPath ? location.map((folder, index) => (
            <span className="document-path-folder" key={index}>{folder}<span className="document-path-separator" aria-hidden="true">/</span></span>
          )) : null}
          <span className={documentPath ? "document-path-name" : undefined} data-testid="current-file" title={documentPath || undefined}>
            {documentPath ? name : i18n.t("No file opened")}
          </span>
        </span>
        <kbd aria-hidden="true">{COMMAND_CENTER_SHORTCUT.label}</kbd>
      </Button>
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
            >{i18n.t("Visual")}</Button>
            <Button {...sourceProps}>{i18n.t("Source")}</Button>
          </div>
          {onToggleWide ? <Button type="button" size="icon-sm" variant="ghost" className="top-bar-toggle"
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
            <Button type="button" variant={saveVariant} className="top-bar-save" data-save-state={saveState}
              aria-busy={saving || undefined} onClick={onSave} disabled={saveDisabled} data-testid="save"
              title={i18n.t("Save ({{shortcut}})", { shortcut: SAVE_SHORTCUT.label })} aria-keyshortcuts={SAVE_SHORTCUT.aria}>
              {saveLabel}
            </Button>
          {onReload ? (
            <DropdownMenu>
              <DropdownMenuTrigger ref={fileActionsRef}
                render={<Button type="button" size="icon-sm" variant="ghost" aria-label={i18n.t("File actions")} title={i18n.t("File actions")} disabled={reloadDisabled} />}>
                <Ellipsis aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onReload} disabled={reloadDisabled}>
                  <RotateCcw aria-hidden="true" />{i18n.t("Reload")}</DropdownMenuItem>
                {onCopyPath ? (
                  <DropdownMenuItem onClick={onCopyPath} disabled={!documentPath}>
                    <Copy aria-hidden="true" />{i18n.t("Copy path")}</DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
