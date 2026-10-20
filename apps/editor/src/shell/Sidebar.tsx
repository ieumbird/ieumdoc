import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { ChevronRight, Ellipsis, FileText, FileX, Folder, FolderOpen, FolderPlus, PanelLeftClose, PanelLeftOpen, Plus, Settings, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { splitDocumentPath } from "./document-path.ts";
import { treeKey, visibleTreeItems, type FolderTreeState, type TreeItem } from "./folder-tree.ts";
import { DisplaySettings, type DisplaySettingsProps } from "./DisplaySettings.tsx";

type SidebarProps = {
  open: boolean;
  documentPath: string;
  onToggle(): void;
  toggleRef?: RefObject<HTMLButtonElement | null>;
  /** Set where the open sidebar covers the document: Escape inside it closes it. */
  onDismiss?(): void;
  /** Names the control the folder dialog returns focus to. */
  onOpenFolder(returnFocus: HTMLElement | null): void;
  /** Recently opened folders, offered without a chosen folder so one click lists one again. */
  recent?: string[];
  onOpenRecent?(folder: string): void;
  /** Opens New, which shows and lets the user choose the destination folder. */
  onNew?(): void;
  newButtonRef?: RefObject<HTMLButtonElement | null>;
  /** Opens New folder, which likewise shows and chooses where the folder is created. */
  onNewFolder?(): void;
  newFolderButtonRef?: RefObject<HTMLButtonElement | null>;
  /** The folder the user chose, as a tree of the folders listed so far. */
  folder?: FolderTreeState;
  onToggleFolder?(path: string): void;
  onOpenDocument?(path: string): void;
  onCloseFolder?(): void;
  /** The Desktop app's Settings; the browser Editor has none. Names the control focus returns to. */
  onSettings?(returnFocus: HTMLElement): void;
  display: Omit<DisplaySettingsProps, "documentPath">;
};

/** One sidebar switches between Files and Display. Outline remains independent on the right. */
export function Sidebar({
  open, documentPath, onToggle, toggleRef, onDismiss, onOpenFolder, recent = [], onOpenRecent, onNew, newButtonRef, onNewFolder, newFolderButtonRef,
  folder, onToggleFolder, onOpenDocument, onCloseFolder, onSettings, display,
}: SidebarProps) {
  useTranslation();
  const [tool, setTool] = useState<"files" | "display">("files");
  const displayButton = useRef<HTMLButtonElement>(null);
  const selectTool = (next: typeof tool) => {
    setTool(next);
    if (!open) onToggle();
  };
  return (
    <nav className={`sidebar${open ? "" : " sidebar--collapsed"}`} aria-label={i18n.t("Application")} data-testid="sidebar"
      onKeyDown={event => {
        // Display's own Escape returns to its button first (it prevents the default).
        // Portaled menus and dialogs bubble through React; they keep their own Escape.
        if (event.key !== "Escape" || event.defaultPrevented || !open || !onDismiss ||
          !event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault();
        onDismiss();
      }}>
      <div className="sidebar-header">
        {open ? <span className="product">IeumDoc</span> : null}
        <Button
          ref={toggleRef}
          variant="ghost"
          size="icon-sm"
          aria-label={open ? i18n.t("Collapse sidebar") : i18n.t("Expand sidebar")}
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
      </div>
      <div className="sidebar-tools" role="group" aria-label={i18n.t("Sidebar tools")}>
        <Button type="button" size={open ? "sm" : "icon-sm"} variant="ghost" className="sidebar-tool"
          aria-label={i18n.t("Files")} title={open ? undefined : i18n.t("Files")} aria-pressed={tool === "files"}
          aria-expanded={open && tool === "files"} aria-controls="sidebar-files" onClick={() => selectTool("files")}>
          <FileText aria-hidden="true" />{open ? i18n.t("Files") : null}
        </Button>
        <Button ref={displayButton} type="button" size={open ? "sm" : "icon-sm"} variant="ghost" className="sidebar-tool"
          aria-label={i18n.t("Display")} title={open ? undefined : i18n.t("Display")} aria-pressed={tool === "display"}
          aria-expanded={open && tool === "display"} aria-controls="sidebar-display" onClick={() => selectTool("display")}>
          <SlidersHorizontal aria-hidden="true" />{open ? i18n.t("Display") : null}
        </Button>
      </div>
      {/* Keep the tree mounted: tool switches and collapse retain scroll and keyboard position. */}
      <div id="sidebar-files" className="sidebar-content" hidden={!open || tool !== "files"}>
        {folder ? (
          <FolderTree
            newButtonRef={newButtonRef}
            newFolderButtonRef={newFolderButtonRef}
            tree={folder}
            documentPath={documentPath}
            onToggleFolder={path => onToggleFolder?.(path)}
            onOpenDocument={path => onOpenDocument?.(path)}
            onNew={() => onNew?.()}
            onNewFolder={() => onNewFolder?.()}
            onOpenFolder={onOpenFolder}
            onClose={() => onCloseFolder?.()}
          />
        ) : (
          <section className="sidebar-empty" aria-label={i18n.t("Files")} data-testid="sidebar-empty">
            <p className="sidebar-empty-text">{i18n.t("Open a folder to browse and create its Markdown files.")}</p>
            <Button className="min-w-0 justify-start" size="sm" variant="outline" onClick={event => onOpenFolder(event.currentTarget)}>
              <FolderOpen aria-hidden="true" />{i18n.t("Open folder…")}</Button>
            {recent.length > 0 && onOpenRecent ? (
              <section className="sidebar-recent" aria-labelledby="sidebar-recent-label">
                <p className="sidebar-recent-label" id="sidebar-recent-label">{i18n.t("Recent")}</p>
                <ul>
                  {recent.map(folder => (
                    <li key={folder}>
                      <button type="button" className="sidebar-tree-item sidebar-recent-folder" title={folder} onClick={() => onOpenRecent(folder)}>
                        <Folder className="sidebar-tree-icon" aria-hidden="true" />
                        <span className="sidebar-tree-name">{splitDocumentPath(folder.replace(/[\\/]+$/, "")).name || folder}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        )}
      </div>
      <div id="sidebar-display" className="sidebar-content" hidden={!open || tool !== "display"}
        onKeyDown={event => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          displayButton.current?.focus();
        }}>
        <DisplaySettings documentPath={documentPath} {...display} />
      </div>
      {onSettings ? (
        <div className="sidebar-footer">
          {open ? (
            <Button className="min-w-0 justify-start" size="sm" variant="ghost" onClick={event => onSettings(event.currentTarget)}>
              <Settings aria-hidden="true" />{i18n.t("Settings")}</Button>
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label={i18n.t("Settings")} title={i18n.t("Settings")} onClick={event => onSettings(event.currentTarget)}>
              <Settings />
            </Button>
          )}
        </div>
      ) : null}
    </nav>
  );
}

type FolderTreeProps = {
  tree: FolderTreeState;
  documentPath: string;
  onToggleFolder(path: string): void;
  onOpenDocument(path: string): void;
  onNew(): void;
  newButtonRef?: RefObject<HTMLButtonElement | null>;
  onNewFolder(): void;
  newFolderButtonRef?: RefObject<HTMLButtonElement | null>;
  onOpenFolder(returnFocus: HTMLElement | null): void;
  onClose(): void;
};

/** The chosen folder as a tree: folders expand in place, documents open. */
function FolderTree({ tree, documentPath, onToggleFolder, onOpenDocument, onNew, newButtonRef, onNewFolder, newFolderButtonRef, onOpenFolder, onClose }: FolderTreeProps) {
  useTranslation();
  // Host paths are resolved, so only a filesystem root ends in a separator; it shows as itself.
  const name = (path: string) => splitDocumentPath(path).name || path;
  const folderName = name(tree.root);
  const firstWord = folderName.match(/^\s*\S+/)?.[0] ?? folderName;
  const items = visibleTreeItems(tree);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const [focused, setFocused] = useState<string>();
  // The menu item that opens a dialog goes away; the dialog returns focus to `⋯`.
  const more = useRef<HTMLButtonElement>(null);
  // One tab stop: the item last focused, else the open document, else the first item.
  const tabStop = [focused, documentPath].find(path => items.some(item => item.entry.path === path)) ?? items[0]?.entry.path;

  const activate = (item: TreeItem) => {
    if (item.entry.kind === "folder") onToggleFolder(item.entry.path);
    else onOpenDocument(item.entry.path);
  };
  const keyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const index = items.findIndex(item => item.entry.path === focused);
    const result = treeKey(items, index, event.key, tree.expanded);
    if (!result) return;
    event.preventDefault();
    if ("focus" in result) rows.current.get(result.focus)?.focus();
    else if ("expand" in result || "collapse" in result) activate(items[index]!);
    else activate(result.activate);
  };

  return (
    <section className="sidebar-folder" aria-labelledby="sidebar-folder-label" data-testid="folder">
      <div className="sidebar-folder-header">
        {/* Float actions before the name so later lines can use the full text width. */}
        <div className="sidebar-folder-actions">
          <Button ref={newButtonRef} variant="ghost" size="icon-xs" aria-label={i18n.t("New file in folder")} title={i18n.t("New file…")} onClick={onNew}>
            <Plus />
          </Button>
          <Button ref={newFolderButtonRef} variant="ghost" size="icon-xs" aria-label={i18n.t("New folder")} title={i18n.t("New folder…")} onClick={onNewFolder}>
            <FolderPlus />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger ref={more} render={<Button variant="ghost" size="icon-xs" aria-label={i18n.t("More actions")} />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onOpenFolder(more.current)}>
                <FolderOpen aria-hidden="true" />{i18n.t("Open folder…")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onClose}>
                <X aria-hidden="true" />{i18n.t("Close folder")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="sidebar-folder-name" id="sidebar-folder-label" title={tree.root}>
          <span><span className="sidebar-folder-first-word"><FolderOpen aria-hidden="true" />{firstWord}</span>{folderName.slice(firstWord.length)}</span>
        </p>
      </div>
      <ul className="sidebar-tree" role="tree" aria-labelledby="sidebar-folder-label" onKeyDown={keyDown}>
        {items.map(item => {
          const { entry } = item;
          const folder = entry.kind === "folder";
          const expanded = folder && tree.expanded.has(entry.path);
          // A file without the native marker still opens, to explain why IeumDoc refuses it.
          const foreign = !folder && entry.native === false;
          const Icon = foreign ? FileX : !folder ? FileText : expanded ? FolderOpen : Folder;
          return (
            <li
              key={entry.path}
              ref={row => { if (row) rows.current.set(entry.path, row); else rows.current.delete(entry.path); }}
              role="treeitem"
              className="sidebar-tree-item"
              data-foreign={foreign || undefined}
              style={{ "--tree-depth": item.depth } as CSSProperties}
              tabIndex={entry.path === tabStop ? 0 : -1}
              title={foreign ? `${entry.path}\n${i18n.t("Not an IeumDoc document")}` : entry.path}
              aria-description={foreign ? i18n.t("Not an IeumDoc document") : undefined}
              aria-level={item.depth + 1}
              aria-posinset={item.position}
              aria-setsize={item.size}
              aria-expanded={folder ? expanded : undefined}
              aria-current={!folder && entry.path === documentPath ? "page" : undefined}
              onFocus={() => setFocused(entry.path)}
              onClick={() => activate(item)}
            >
              <span className="sidebar-tree-chevron" aria-hidden="true">{folder ? <ChevronRight /> : null}</span>
              <Icon className="sidebar-tree-icon" aria-hidden="true" />
              <span className="sidebar-tree-name">{entry.name}</span>
            </li>
          );
        })}
      </ul>
      {tree.nodes.get(tree.root)?.entries.length === 0 ? <p className="sidebar-folder-empty">{i18n.t("No folders or Markdown files")}</p> : null}
    </section>
  );
}
