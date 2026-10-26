import { FilePreviewDialog } from "./FilePreviewDialog.tsx";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { ChevronRight, Ellipsis, File, Image as ImageIcon, FileText, FileX, Folder, FolderOpen, FolderPlus, PanelLeftClose, PanelLeftOpen, Plus, RotateCw, Settings, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
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
  /** Recently opened folders, offered without an opened folder so one click lists one again. */
  recent?: string[];
  onOpenRecent?(folder: string): void;
  /** Opens New in an opened folder; it shows and lets the user choose the destination folder. Names the button. */
  onNew?(root: string, button: HTMLButtonElement): void;
  /** Opens New folder, which likewise shows and chooses where the folder is created. */
  onNewFolder?(root: string, button: HTMLButtonElement): void;
  /** The opened folders, in order, each a tree of the folders listed so far. */
  folders?: FolderTreeState[];
  onToggleFolder?(root: string, path: string): void;
  onToggleSection?(root: string): void;
  onOpenDocument?(path: string): void;
  onCloseFolder?(root: string): void;
  onRefreshFolder?(root: string): void;
  /** The Desktop app's Settings; the browser Editor has none. Names the control focus returns to. */
  onSettings?(returnFocus: HTMLElement): void;
  display: Omit<DisplaySettingsProps, "documentPath">;
};

/** One sidebar switches between Files and Display. Outline remains independent on the right. */
export function Sidebar({
  open, documentPath, onToggle, toggleRef, onDismiss, onOpenFolder, recent = [], onOpenRecent, onNew, onNewFolder,
  folders = [], onToggleFolder, onToggleSection, onOpenDocument, onCloseFolder, onRefreshFolder, onSettings, display,
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
        <div className="sidebar-header-actions">
          {open ? <Button type="button" variant="ghost" size="icon-sm"
            aria-label={i18n.t("Open folder…")} title={i18n.t("Open folder…")}
            onClick={event => onOpenFolder(event.currentTarget)}>
            <FolderOpen aria-hidden="true" />
          </Button> : null}
          <Button
            ref={toggleRef}
            className="sidebar-collapse"
            variant="ghost"
            size="icon-sm"
            aria-label={open ? i18n.t("Collapse sidebar") : i18n.t("Expand sidebar")}
            aria-expanded={open}
            onClick={onToggle}
          >
            {open ? <PanelLeftClose /> : <PanelLeftOpen />}
          </Button>
        </div>
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
        {folders.length > 0 ? folders.map(tree => (
          <FolderTree
            key={tree.root}
            tree={tree}
            documentPath={documentPath}
            onToggleFolder={path => onToggleFolder?.(tree.root, path)}
            onToggleSection={() => onToggleSection?.(tree.root)}
            onOpenDocument={path => onOpenDocument?.(path)}
            onNew={button => onNew?.(tree.root, button)}
            onNewFolder={button => onNewFolder?.(tree.root, button)}
            onRefresh={() => onRefreshFolder?.(tree.root)}
            onClose={() => onCloseFolder?.(tree.root)}
          />
        )) : (
          <section className="sidebar-empty" aria-label={i18n.t("Files")} data-testid="sidebar-empty">
            <p className="sidebar-empty-text">{i18n.t("Open a folder to browse its files and create documents.")}</p>
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
  onToggleSection(): void;
  onOpenDocument(path: string): void;
  onNew(button: HTMLButtonElement): void;
  onNewFolder(button: HTMLButtonElement): void;
  onRefresh(): void;
  onClose(): void;
};

/** One opened folder as a tree: folders expand in place, documents open. */
function FolderTree({ tree, documentPath, onToggleFolder, onToggleSection, onOpenDocument, onNew, onNewFolder, onRefresh, onClose }: FolderTreeProps) {
  useTranslation();
  const treeId = useId();
  // Host paths are resolved, so only a filesystem root ends in a separator; it shows as itself.
  const name = (path: string) => splitDocumentPath(path).name || path;
  const folderName = name(tree.root);
  const toggleName = i18n.t(tree.sectionExpanded ? "Collapse folder {{name}}" : "Expand folder {{name}}", { name: folderName });
  const firstWord = folderName.match(/^\s*\S+/)?.[0] ?? folderName;
  const items = visibleTreeItems(tree);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const [focused, setFocused] = useState<string>();
  const [preview, setPreview] = useState<TreeItem>();
  const previewReturn = useRef<HTMLElement | null>(null);
  // One tab stop: the item last focused, else the open document, else the first item.
  const tabStop = [focused, documentPath].find(path => items.some(item => item.entry.path === path)) ?? items[0]?.entry.path;

  const activate = (item: TreeItem) => {
    if (item.entry.kind === "folder") onToggleFolder(item.entry.path);
    else if (item.entry.kind === "document") onOpenDocument(item.entry.path);
    else {
      previewReturn.current = rows.current.get(item.entry.path) ?? null;
      setPreview(item);
    }
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
    <section className="sidebar-folder" aria-label={folderName} data-testid="folder" data-root={tree.root}>
      <div className="sidebar-folder-header">
        {/* Float actions before the name so later lines can use the full text width. */}
        <div className="sidebar-folder-actions">
          <Button variant="ghost" size="icon-xs" aria-label={i18n.t("New file in folder")} title={i18n.t("New file…")} onClick={event => onNew(event.currentTarget)}>
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label={i18n.t("New folder")} title={i18n.t("New folder…")} onClick={event => onNewFolder(event.currentTarget)}>
            <FolderPlus />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={i18n.t("More actions")} />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRefresh}>
                <RotateCw aria-hidden="true" />{i18n.t("Refresh")}</DropdownMenuItem>
              <DropdownMenuItem onClick={onClose}>
                <X aria-hidden="true" />{i18n.t("Close folder")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="sidebar-folder-name" title={tree.root}>
          <span><span className="sidebar-folder-first-word">
            <Button type="button" variant="ghost" size="icon-xs" className="sidebar-folder-toggle"
              aria-label={toggleName} title={toggleName} aria-expanded={tree.sectionExpanded} aria-controls={treeId}
              onClick={onToggleSection}><ChevronRight aria-hidden="true" /></Button>
            {firstWord}</span>{folderName.slice(firstWord.length)}</span>
        </p>
      </div>
      <ul id={treeId} className="sidebar-tree" role="tree" aria-label={folderName} hidden={!tree.sectionExpanded} onKeyDown={keyDown}>
        {items.map(item => {
          const { entry } = item;
          const folder = entry.kind === "folder";
          const expanded = folder && tree.expanded.has(entry.path);
          // A file without the native marker still opens, to explain why IeumDoc refuses it.
          const foreign = entry.kind === "document" && entry.native === false;
          const description = foreign ? i18n.t("Not an IeumDoc document") : entry.kind === "image" ? i18n.t("Read-only image preview") : entry.kind === "file" ? i18n.t("This file cannot be edited in IeumDoc.") : undefined;
          const Icon = foreign ? FileX : entry.kind === "image" ? ImageIcon : entry.kind === "file" ? File : !folder ? FileText : expanded ? FolderOpen : Folder;
          return (
            <li
              key={entry.path}
              ref={row => { if (row) rows.current.set(entry.path, row); else rows.current.delete(entry.path); }}
              role="treeitem"
              className="sidebar-tree-item"
              data-foreign={foreign || undefined}
              style={{ "--tree-depth": item.depth } as CSSProperties}
              tabIndex={entry.path === tabStop ? 0 : -1}
              title={description ? `${entry.path}\n${description}` : entry.path}
              aria-description={description}
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
      {preview ? <FilePreviewDialog key={preview.entry.path} entry={preview.entry} root={tree.root}
        returnFocus={previewReturn} onClose={() => setPreview(undefined)} /> : null}
      {tree.nodes.get(tree.root)?.entries.length === 0 ? <p className="sidebar-folder-empty" hidden={!tree.sectionExpanded}>{i18n.t("No files or folders")}</p> : null}
    </section>
  );
}
