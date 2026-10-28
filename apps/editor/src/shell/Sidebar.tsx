import { ContextMenu, type ContextMenuAction } from "@/components/ui/context-menu.tsx";
import { FileActionDialog, type FileAction, type FileActionHandler } from "./FileActionDialog.tsx";
import { FilePreviewDialog } from "./FilePreviewDialog.tsx";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject, type Ref } from "react";
import { Sparkles, Pencil, Trash2, ChevronRight, Ellipsis, File, Files as FilesIcon, Image as ImageIcon, FileText, FileX, Folder, FolderOpen, FolderPlus, PanelLeftClose, Plus, RotateCw, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { splitDocumentPath } from "./document-path.ts";
import { treeKey, visibleTreeItems, type FolderTreeState, type TreeItem } from "./folder-tree.ts";

type SidebarProps = {
  onFileAction: FileActionHandler;
  fileActionsDisabled: boolean;
  isFileDirty(path: string): boolean;
  open: boolean;
  documentPath: string;
  onToggle(): void;
  toggleRef?: RefObject<HTMLButtonElement | null>;
  /** Names the control the folder dialog returns focus to. */
  onOpenFolder(returnFocus: HTMLElement | null): void;
  onNewDocument?(returnFocus: HTMLElement): void;
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
  onRevealFolder?(path: string): void;
  /** Spike-only chat entry shares the expanded/icon-only navigation pattern. */
  onAi?(): void;
  aiActive?: boolean;
  aiBusy?: boolean;
  aiDisabled?: boolean;
  aiRef?: Ref<HTMLButtonElement>;
  /** App Settings, separate from document settings. Names the control focus returns to. */
  updateVersion?: string;
  onSettings?(returnFocus: HTMLElement): void;
};

/** File navigation stays mounted when collapsed. Outline remains independent on the right. */
export function Sidebar({
  onFileAction, fileActionsDisabled, isFileDirty, open, documentPath, onToggle, toggleRef, onOpenFolder, onNewDocument, recent = [], onOpenRecent, onNew, onNewFolder,
  folders = [], onToggleFolder, onToggleSection, onOpenDocument, onCloseFolder, onRefreshFolder, onRevealFolder, onSettings, updateVersion, onAi, aiActive, aiBusy, aiDisabled, aiRef,
}: SidebarProps) {
  useTranslation();
  return (
    <nav className={`sidebar${open ? "" : " sidebar--collapsed"}`} aria-label={i18n.t("Application")} data-testid="sidebar">
      <div className="sidebar-header">
        {open ? <span className="product">{i18n.t("Files")}</span> : null}
        <div className="sidebar-header-actions">
          <Button
            ref={toggleRef}
            className="sidebar-collapse"
            variant="ghost"
            size="icon-sm"
            aria-label={open ? i18n.t("Collapse sidebar") : i18n.t("Expand sidebar")}
            title={open ? i18n.t("Collapse sidebar") : i18n.t("Expand sidebar")}
            aria-expanded={open}
            aria-controls="sidebar-files"
            onClick={onToggle}
          >
            {open ? <PanelLeftClose /> : <FilesIcon />}
          </Button>
        </div>
      </div>
      {onAi ? <div className="sidebar-ai-entry">
        <Button ref={aiRef} className={open ? "w-full min-w-0 justify-start" : undefined}
          size={open ? "sm" : "icon-sm"} variant="ghost" aria-label={i18n.t("AI chat")}
          title={i18n.t("AI chat")} aria-pressed={!!aiActive} aria-busy={!!aiBusy} disabled={aiDisabled} onClick={onAi} data-testid="ai-toggle">
          <Sparkles aria-hidden="true" />{open ? i18n.t("AI chat") : null}
        </Button>
      </div> : null}
      {/* Keep the tree mounted: collapse retains scroll and keyboard position. */}
      <div id="sidebar-files" className="sidebar-content" hidden={!open}>
        {folders.length > 0 ? folders.map(tree => (
          <FolderTree
            key={tree.root}
            onFileAction={onFileAction} fileActionsDisabled={fileActionsDisabled} isFileDirty={isFileDirty}
            tree={tree}
            documentPath={documentPath}
            onToggleFolder={path => onToggleFolder?.(tree.root, path)}
            onToggleSection={() => onToggleSection?.(tree.root)}
            onOpenDocument={path => onOpenDocument?.(path)}
            onNew={button => onNew?.(tree.root, button)}
            onNewFolder={button => onNewFolder?.(tree.root, button)}
            onOpenFolder={onOpenFolder}
            onRevealFolder={onRevealFolder}
            onRefresh={() => onRefreshFolder?.(tree.root)}
            onClose={() => onCloseFolder?.(tree.root)}
          />
        )) : (
          <section className="sidebar-empty" aria-label={i18n.t("Files")} data-testid="sidebar-empty">
            <p className="sidebar-empty-text">{i18n.t("Open a folder to browse its files and create documents.")}</p>
            <Button type="button" size="sm" variant="ghost" className="w-full justify-start"
              aria-label={i18n.t("Open folder…")} title={i18n.t("Open folder…")}
              onClick={event => onOpenFolder(event.currentTarget)}>
              <FolderOpen aria-hidden="true" />{i18n.t("Open folder…")}</Button>
            {onNewDocument ? <Button type="button" size="sm" variant="ghost" className="w-full justify-start"
              onClick={event => onNewDocument(event.currentTarget)}>
              <Plus aria-hidden="true" />{i18n.t("New document…")}</Button> : null}
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
      {onSettings ? (
        <div className="sidebar-footer">
          <SettingsEntry iconOnly={!open} onOpen={onSettings} updateVersion={updateVersion} />
        </div>
      ) : null}
    </nav>
  );
}

/** One Settings entry for both sidebar states, including its focus-return target. */
function SettingsEntry({ iconOnly, onOpen, updateVersion }: { updateVersion?: string; iconOnly: boolean; onOpen(returnFocus: HTMLElement): void }) {
  return <Button className={iconOnly ? undefined : "min-w-0 justify-start"}
    size={iconOnly ? "icon-sm" : "sm"} variant="ghost"
    aria-label={updateVersion ? i18n.t("Settings, new version available") : i18n.t("Settings")}
    title={updateVersion ? i18n.t("New version {{version}} available", { version: updateVersion }) : i18n.t("Settings")}
    onClick={event => onOpen(event.currentTarget)}>
    <span className="settings-entry-icon"><Settings aria-hidden="true" />
      {updateVersion ? <span className="settings-update-dot" data-testid="settings-update-dot" aria-hidden="true" /> : null}
    </span>{iconOnly ? null : i18n.t("Settings")}
  </Button>;
}

type FolderTreeProps = {
  onFileAction: FileActionHandler;
  fileActionsDisabled: boolean;
  isFileDirty(path: string): boolean;
  tree: FolderTreeState;
  documentPath: string;
  onToggleFolder(path: string): void;
  onToggleSection(): void;
  onOpenDocument(path: string): void;
  onNew(button: HTMLButtonElement): void;
  onNewFolder(button: HTMLButtonElement): void;
  onOpenFolder(returnFocus: HTMLElement | null): void;
  onRevealFolder?(path: string): void;
  onRefresh(): void;
  onClose(): void;
};

/** One opened folder as a tree: folders expand in place, documents open. */
function FolderTree({ onFileAction, fileActionsDisabled, isFileDirty, tree, documentPath, onToggleFolder, onToggleSection, onOpenDocument, onNew, onNewFolder, onOpenFolder, onRevealFolder, onRefresh, onClose }: FolderTreeProps) {
  useTranslation();
  const treeId = useId();
  const section = useRef<HTMLElement>(null);
  const moreActions = useRef<HTMLButtonElement>(null);
  const [fileAction, setFileAction] = useState<{ action: FileAction; item: TreeItem }>();
  const actionReturn = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<string | null>(null);
  // Host paths are resolved, so only a filesystem root ends in a separator; it shows as itself.
  const name = (path: string) => splitDocumentPath(path).name || path;
  const folderName = name(tree.root);
  const toggleName = i18n.t(tree.sectionExpanded ? "Collapse folder {{name}}" : "Expand folder {{name}}", { name: folderName });
  const items = visibleTreeItems(tree);
  const rows = useRef(new Map<string, HTMLLIElement>());
  useLayoutEffect(() => {
    if (pendingFocus.current && !fileAction) {
      const target = rows.current.get(pendingFocus.current);
      if (target) { actionReturn.current = target; target.focus(); pendingFocus.current = null; }
    }
  }, [tree, fileAction]);
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
    if (event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
    const index = items.findIndex(item => item.entry.path === focused);
    const result = treeKey(items, index, event.key, tree.expanded);
    if (!result) return;
    event.preventDefault();
    if ("focus" in result) rows.current.get(result.focus)?.focus();
    else if ("expand" in result || "collapse" in result) activate(items[index]!);
    else activate(result.activate);
  };

  return (
    <section ref={section} className="sidebar-folder" aria-label={folderName} data-testid="folder" data-root={tree.root}>
      <div className="sidebar-folder-header">
        <p className="sidebar-folder-name" title={tree.root}>
          <span className="sidebar-tree-chevron">
            <Button type="button" variant="ghost" size="icon-xs" className="sidebar-folder-toggle"
              aria-label={toggleName} title={toggleName} aria-expanded={tree.sectionExpanded} aria-controls={treeId}
              onClick={onToggleSection}><ChevronRight aria-hidden="true" /></Button>
          </span>
          <span className="sidebar-tree-name">{folderName}</span>
        </p>
        <div className="sidebar-folder-actions">
          <Button variant="ghost" size="icon-xs" aria-label={i18n.t("New document…")} title={i18n.t("New document…")} onClick={event => onNew(event.currentTarget)}>
            <Plus />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger ref={moreActions} render={<Button variant="ghost" size="icon-xs" aria-label={i18n.t("More actions")} />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { if (moreActions.current) onNewFolder(moreActions.current); }}>
                <FolderPlus aria-hidden="true" />{i18n.t("New folder…")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOpenFolder(moreActions.current)}>
                <FolderOpen aria-hidden="true" />{i18n.t("Open folder…")}</DropdownMenuItem>
              {onRevealFolder ? <DropdownMenuItem onClick={() => onRevealFolder(tree.root)}>
                <FolderOpen aria-hidden="true" />{i18n.t("Open in File Explorer")}</DropdownMenuItem> : null}
              <DropdownMenuItem onClick={onRefresh}>
                <RotateCw aria-hidden="true" />{i18n.t("Refresh")}</DropdownMenuItem>
              <DropdownMenuItem onClick={onClose}>
                <X aria-hidden="true" />{i18n.t("Close folder")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ul id={treeId} className="sidebar-tree" role="tree" aria-label={folderName} hidden={!tree.sectionExpanded} onKeyDown={keyDown}>
        {items.map(item => {
          const { entry } = item;
          const folder = entry.kind === "folder";
          const expanded = folder && tree.expanded.has(entry.path);
          // A file without the native marker still opens, to explain why IeumDoc refuses it.
          const foreign = entry.kind === "document" && entry.native === false;
          const description = foreign ? i18n.t("Not an IeumDoc document") : entry.kind === "image" ? i18n.t("Read-only image preview") : entry.kind === "file" ? i18n.t("This file cannot be edited in IeumDoc.") : undefined;
          const Icon = foreign ? FileX : entry.kind === "image" ? ImageIcon : entry.kind === "file" ? File : FileText;
          const row = (
            <li
              key={entry.path}
              ref={row => { if (row) rows.current.set(entry.path, row); else rows.current.delete(entry.path); }}
              role="treeitem"
              className={`sidebar-tree-item${folder && onRevealFolder ? " sidebar-tree-item--actions" : ""}`}
              data-foreign={foreign || undefined}
              style={{ "--tree-depth": item.depth + 1 } as CSSProperties}
              tabIndex={entry.path === tabStop ? 0 : -1}
              title={description ? `${entry.path}\n${description}` : entry.path}
              aria-description={description}
              aria-label={folder ? entry.name : undefined}
              aria-level={item.depth + 1}
              aria-posinset={item.position}
              aria-setsize={item.size}
              aria-expanded={folder ? expanded : undefined}
              aria-current={!folder && entry.path === documentPath ? "page" : undefined}
              onFocus={() => setFocused(entry.path)}
              onClick={() => activate(item)}
            >
              {folder ? <span className="sidebar-tree-chevron" aria-hidden="true"><ChevronRight /></span>
                : <Icon className="sidebar-tree-icon" aria-hidden="true" />}
              <span className="sidebar-tree-name">{entry.name}</span>
              {folder && onRevealFolder ? <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={i18n.t("More actions for {{name}}", { name: entry.name })} />}
                  onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}><Ellipsis /></DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                  <DropdownMenuItem onClick={() => onRevealFolder(entry.path)}>
                    <FolderOpen aria-hidden="true" />{i18n.t("Open in File Explorer")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu> : null}
            </li>
          );
          if (folder) return row;
          const choose = (action: FileAction) => {
            actionReturn.current = rows.current.get(entry.path) ?? null;
            setFileAction({ action, item });
          };
          const actions: ContextMenuAction[] = [
            { id: "rename", label: i18n.t("Rename…"), icon: <Pencil aria-hidden="true" />, run: () => choose("rename") },
            { id: "delete", label: i18n.t("Delete file…"), icon: <Trash2 aria-hidden="true" />, danger: true, run: () => choose("delete") },
          ];
          return <ContextMenu key={entry.path} trigger={row} actions={actions} disabled={fileActionsDisabled} />;
        })}
      </ul>
      {fileAction ? <FileActionDialog action={fileAction.action} entry={fileAction.item.entry}
        trash={window.ieumdocDesktop?.fileDeletion === "trash"} dirty={isFileDirty(fileAction.item.entry.path)}
        returnFocus={actionReturn} onClose={() => setFileAction(undefined)} onExecute={async name => {
          const index = items.findIndex(item => item.entry.path === fileAction.item.entry.path);
          const next = await onFileAction(fileAction.action, tree.root, fileAction.item.entry, name);
          const focus = fileAction.action === "rename" ? next : (items[index + 1] ?? items[index - 1])?.entry.path;
          actionReturn.current = focus ? rows.current.get(focus) ?? null : section.current?.querySelector<HTMLButtonElement>(".sidebar-folder-toggle") ?? null;
          pendingFocus.current = focus ?? null;
        }} /> : null}
      {preview ? <FilePreviewDialog key={preview.entry.path} entry={preview.entry} root={tree.root}
        returnFocus={previewReturn} onClose={() => setPreview(undefined)} /> : null}
      {tree.nodes.get(tree.root)?.entries.length === 0 ? <p className="sidebar-folder-empty" hidden={!tree.sectionExpanded}>{i18n.t("No files or folders")}</p> : null}
    </section>
  );
}
