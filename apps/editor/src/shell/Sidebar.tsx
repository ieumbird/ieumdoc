import { ArrowUp, Ellipsis, FileText, Folder, FolderOpen, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import type { FolderResponse } from "../../shared/document-protocol.ts";
import { splitDocumentPath } from "./document-path.ts";

type SidebarProps = {
  open: boolean;
  documentPath: string;
  onToggle(): void;
  onOpen(): void;
  onOpenFolder(): void;
  /** Creates a document in the displayed folder. */
  onNew?(directory: string): void;
  /** The folder the user chose, listed one level at a time. */
  folder?: FolderResponse;
  onBrowseFolder?(path: string): void;
  onOpenDocument?(path: string): void;
  onCloseFolder?(): void;
};

/** Files: the folder the user chose, or a way to choose one. The outline is in the DocumentPanel. */
export function Sidebar({
  open, documentPath, onToggle, onOpen, onOpenFolder, onNew,
  folder, onBrowseFolder, onOpenDocument, onCloseFolder,
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
        <FolderList
          folder={folder}
          documentPath={documentPath}
          onBrowse={path => onBrowseFolder?.(path)}
          onOpenDocument={path => onOpenDocument?.(path)}
          onNew={() => onNew?.(folder.path)}
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

type FolderListProps = {
  folder: FolderResponse;
  documentPath: string;
  onBrowse(path: string): void;
  onOpenDocument(path: string): void;
  onNew(): void;
  onOpen(): void;
  onOpenFolder(): void;
  onClose(): void;
};

/** One level of the chosen folder: Up while below it, then sub-folders and Markdown files. */
function FolderList({ folder, documentPath, onBrowse, onOpenDocument, onNew, onOpen, onOpenFolder, onClose }: FolderListProps) {
  // Host paths are resolved, so only a filesystem root ends in a separator; it shows as itself.
  const name = (path: string) => splitDocumentPath(path).name || path;
  return (
    <section className="sidebar-folder" aria-labelledby="sidebar-folder-label" data-testid="folder">
      <div className="sidebar-folder-header">
        {/* The displayed folder, which is the chosen folder or one browsed inside it. */}
        <p className="sidebar-folder-name" id="sidebar-folder-label" title={folder.path}>
          <FolderOpen aria-hidden="true" />
          <span>{name(folder.path)}</span>
        </p>
        <div className="sidebar-folder-actions">
          <Button variant="ghost" size="icon-xs" aria-label="New file in folder" title={`New file in ${folder.path}`} onClick={onNew}>
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
      <ul className="sidebar-folder-list">
        {folder.parent ? (
          <li>
            <button
              type="button"
              className="sidebar-folder-item"
              title={folder.parent}
              aria-label={`Up to ${name(folder.parent)}`}
              onClick={() => onBrowse(folder.parent!)}
            >
              <ArrowUp aria-hidden="true" />
              <span>{name(folder.parent)}</span>
            </button>
          </li>
        ) : null}
        {folder.entries.map(entry => (
          <li key={entry.path}>
            <button
              type="button"
              className="sidebar-folder-item"
              title={entry.path}
              aria-current={entry.kind === "document" && entry.path === documentPath ? "page" : undefined}
              onClick={() => (entry.kind === "folder" ? onBrowse(entry.path) : onOpenDocument(entry.path))}
            >
              {entry.kind === "folder" ? <Folder aria-hidden="true" /> : <FileText aria-hidden="true" />}
              <span>{entry.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {folder.entries.length === 0 ? <p className="sidebar-folder-empty">No folders or Markdown files</p> : null}
    </section>
  );
}
