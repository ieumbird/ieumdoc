import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronRight, Ellipsis, FileText, Folder, FolderOpen, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { splitDocumentPath } from "./document-path.ts";
import { treeKey, visibleTreeItems, type FolderTreeState, type TreeItem } from "./folder-tree.ts";

type SidebarProps = {
  open: boolean;
  documentPath: string;
  onToggle(): void;
  onOpen(): void;
  onOpenFolder(): void;
  /** Opens New, which shows and lets the user choose the destination folder. */
  onNew?(): void;
  /** The folder the user chose, as a tree of the folders listed so far. */
  folder?: FolderTreeState;
  onToggleFolder?(path: string): void;
  onOpenDocument?(path: string): void;
  onCloseFolder?(): void;
};

/** Files: the folder the user chose, or a way to choose one. The outline is in the DocumentPanel. */
export function Sidebar({
  open, documentPath, onToggle, onOpen, onOpenFolder, onNew,
  folder, onToggleFolder, onOpenDocument, onCloseFolder,
}: SidebarProps) {
  return (
    <nav className={`sidebar${open ? "" : " sidebar--collapsed"}`} aria-label="Application" data-testid="sidebar">
      <div className="sidebar-header">
        {open ? <span className="product">IeumDoc</span> : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
      </div>
      {!open ? null : folder ? (
        <FolderTree
          tree={folder}
          documentPath={documentPath}
          onToggleFolder={path => onToggleFolder?.(path)}
          onOpenDocument={path => onOpenDocument?.(path)}
          onNew={() => onNew?.()}
          onOpen={onOpen}
          onOpenFolder={onOpenFolder}
          onClose={() => onCloseFolder?.()}
        />
      ) : (
        <section className="sidebar-empty" aria-label="Files" data-testid="sidebar-empty">
          <p className="sidebar-empty-text">Open a folder to browse and create its Markdown files.</p>
          <Button className="min-w-0 justify-start" size="sm" variant="outline" onClick={onOpenFolder}>
            <FolderOpen aria-hidden="true" />
            Open folder…
          </Button>
          <Button className="min-w-0 justify-start" size="sm" variant="ghost" onClick={onOpen}>
            <FileText aria-hidden="true" />
            Open file…
          </Button>
        </section>
      )}
    </nav>
  );
}

type FolderTreeProps = {
  tree: FolderTreeState;
  documentPath: string;
  onToggleFolder(path: string): void;
  onOpenDocument(path: string): void;
  onNew(): void;
  onOpen(): void;
  onOpenFolder(): void;
  onClose(): void;
};

/** The chosen folder as a tree: folders expand in place, documents open. */
function FolderTree({ tree, documentPath, onToggleFolder, onOpenDocument, onNew, onOpen, onOpenFolder, onClose }: FolderTreeProps) {
  // Host paths are resolved, so only a filesystem root ends in a separator; it shows as itself.
  const name = (path: string) => splitDocumentPath(path).name || path;
  const items = visibleTreeItems(tree);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const [focused, setFocused] = useState<string>();
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
        <p className="sidebar-folder-name" id="sidebar-folder-label" title={tree.root}>
          <FolderOpen aria-hidden="true" />
          <span>{name(tree.root)}</span>
        </p>
        <div className="sidebar-folder-actions">
          <Button variant="ghost" size="icon-xs" aria-label="New file in folder" title="New file…" onClick={onNew}>
            <Plus />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="More actions" />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpen}>
                <FileText aria-hidden="true" />
                Open file…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenFolder}>
                <FolderOpen aria-hidden="true" />
                Open folder…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onClose}>
                <X aria-hidden="true" />
                Close folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ul className="sidebar-tree" role="tree" aria-labelledby="sidebar-folder-label" onKeyDown={keyDown}>
        {items.map(item => {
          const { entry } = item;
          const folder = entry.kind === "folder";
          const expanded = folder && tree.expanded.has(entry.path);
          const Icon = !folder ? FileText : expanded ? FolderOpen : Folder;
          return (
            <li
              key={entry.path}
              ref={row => { if (row) rows.current.set(entry.path, row); else rows.current.delete(entry.path); }}
              role="treeitem"
              className="sidebar-tree-item"
              style={{ "--tree-depth": item.depth } as CSSProperties}
              tabIndex={entry.path === tabStop ? 0 : -1}
              title={entry.path}
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
      {tree.nodes.get(tree.root)?.entries.length === 0 ? <p className="sidebar-folder-empty">No folders or Markdown files</p> : null}
    </section>
  );
}
