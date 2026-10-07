import { useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowUp, FilePlus2, FileText, Folder, FolderOpen, FolderTree, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import type { FolderResponse } from "../../shared/document-protocol.ts";
import type { OutlineItem, OutlineStore } from "../outline.ts";
import { splitDocumentPath } from "./document-path.ts";

type SidebarProps = {
  open: boolean;
  documentPath: string;
  /** Headings of the open document and the index of the section being read. */
  outline?: OutlineStore;
  onSelectHeading?(item: OutlineItem): void;
  onToggle(): void;
  onOpen(): void;
  onNew(directory?: string): void;
  /** The folder the user chose, listed one level at a time. */
  folder?: FolderResponse;
  onOpenFolder?(): void;
  onBrowseFolder?(path: string): void;
  onOpenDocument?(path: string): void;
  onCloseFolder?(): void;
};

/** App-level entry points, the folder the user chose and the open document's outline. */
export function Sidebar({
  open, documentPath, outline, onSelectHeading, onToggle, onOpen, onNew,
  folder, onOpenFolder, onBrowseFolder, onOpenDocument, onCloseFolder,
}: SidebarProps) {
  const { name } = splitDocumentPath(documentPath);
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
      {open ? (
        <>
          <div className="sidebar-actions">
            <Button className="min-w-0 justify-start" size="sm" variant="ghost" onClick={onOpen}>
              <FolderOpen aria-hidden="true" />
              Open…
            </Button>
            <Button className="min-w-0 justify-start" size="sm" variant="ghost" onClick={() => onOpenFolder?.()}>
              <FolderTree aria-hidden="true" />
              Open folder…
            </Button>
            <Button className="min-w-0 justify-start" size="sm" variant="ghost" onClick={() => onNew()}>
              <FilePlus2 aria-hidden="true" />
              New
            </Button>
          </div>
          {documentPath ? (
            <ul className="sidebar-documents" aria-label="Open documents">
              <li className="sidebar-document" aria-current="page" title={documentPath}>
                <FileText className="sidebar-document-icon" aria-hidden="true" />
                <span className="sidebar-document-name">{name}</span>
              </li>
            </ul>
          ) : null}
          {folder ? (
            <FolderList
              folder={folder}
              documentPath={documentPath}
              onBrowse={path => onBrowseFolder?.(path)}
              onOpenDocument={path => onOpenDocument?.(path)}
              onNew={() => onNew(folder.path)}
              onClose={() => onCloseFolder?.()}
            />
          ) : null}
          {documentPath && outline ? <Outline outline={outline} onSelect={item => onSelectHeading?.(item)} /> : null}
        </>
      ) : null}
    </nav>
  );
}

type FolderListProps = {
  folder: FolderResponse;
  documentPath: string;
  onBrowse(path: string): void;
  onOpenDocument(path: string): void;
  onNew(): void;
  onClose(): void;
};

/** One level of the chosen folder: Up while below it, then sub-folders and Markdown files. */
function FolderList({ folder, documentPath, onBrowse, onOpenDocument, onNew, onClose }: FolderListProps) {
  // Host paths are resolved, so only a filesystem root ends in a separator; it shows as itself.
  const name = (path: string) => splitDocumentPath(path).name || path;
  return (
    <section className="sidebar-folder" aria-labelledby="sidebar-folder-label" data-testid="folder">
      <div className="sidebar-folder-header">
        <p className="sidebar-section-label" id="sidebar-folder-label" title={folder.path}>{name(folder.path)}</p>
        <div className="sidebar-folder-actions">
          <Button variant="ghost" size="icon-xs" aria-label="New file in folder" title={`New file in ${folder.path}`} onClick={onNew}>
            <Plus />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Close folder" onClick={onClose}>
            <X />
          </Button>
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
      {folder.entries.length === 0 ? <p className="sidebar-outline-empty">No folders or Markdown files</p> : null}
    </section>
  );
}

function Outline({ outline: store, onSelect }: { outline: OutlineStore; onSelect(item: OutlineItem): void }) {
  const outline = useSyncExternalStore(store.subscribe, store.get);
  // Arrow keys, Home and End move between headings; Enter or Space goes to one.
  const move = (event: KeyboardEvent<HTMLOListElement>) => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    const next = event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1
      : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : undefined;
    if (next === undefined || index < 0) return;
    event.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
  };
  return (
    <section className="sidebar-outline" aria-labelledby="sidebar-outline-label" data-testid="outline">
      <p className="sidebar-section-label" id="sidebar-outline-label">Outline</p>
      {outline.items.length === 0 ? <p className="sidebar-outline-empty">No headings</p> : (
        <ol className="sidebar-outline-list" onKeyDown={move}>
          {outline.items.map((item, index) => (
            <li key={`${item.index}:${item.pos}`}>
              <button
                type="button"
                className="sidebar-outline-item"
                style={{ "--outline-depth": item.level - 1 } as CSSProperties}
                aria-current={index === outline.current ? "location" : undefined}
                title={item.text || undefined}
                onClick={() => onSelect(item)}
                onKeyDown={event => {
                  // Activate on keydown and consume the key: focus moves into the editor, which
                  // must not also receive this Enter or Space as typing.
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onSelect(item);
                }}
              >
                {item.text || <span className="sidebar-outline-untitled">Untitled heading</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
