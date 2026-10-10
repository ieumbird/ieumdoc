import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ArrowUp, ChevronRight, FileText, Folder, HardDrive, House } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import type { FolderBrowseResponse, FolderPlace } from "../../shared/document-protocol.ts";
import { splitDocumentPath, unquotePath } from "./document-path.ts";

type FolderDialogProps = {
  open: boolean;
  /** Where browsing starts, usually the open document's folder. */
  initialPath: string;
  recent: string[];
  browse(path: string): Promise<FolderBrowseResponse>;
  places(): Promise<FolderPlace[]>;
  /** Resolves to an error message, or "" once the folder is open. */
  onOpen(path: string): Promise<string>;
  /** The control that opened the dialog, which gets focus back when it closes. */
  returnFocus?: RefObject<HTMLElement | null>;
  onClose(): void;
};

type Listing = { directory: string; result?: FolderBrowseResponse; error?: string };

const PLACE_ICONS = { home: House, documents: FileText, drive: HardDrive };

const endsWithSeparator = (value: string) => /[\\/]$/.test(value);
const separatorOf = (value: string) => (value.includes("\\") ? "\\" : "/");
/** A folder path ready to list its contents: it ends with its separator. */
const inside = (folder: string) => (endsWithSeparator(folder) ? folder : folder + separatorOf(folder));
const folderName = (folder: string) => splitDocumentPath(folder.replace(/(?<=.)[\\/]+$/, "")).name || folder;

/**
 * Choose a folder on the Host without leaving IeumDoc. The path field is the single source:
 * the list shows the folder up to its last separator, filtered by what follows it; Open opens
 * exactly the typed path. Moving into a folder never opens it.
 */
export function FolderDialog({ open, initialPath, recent, browse, places, onOpen, returnFocus, onClose }: FolderDialogProps) {
  const [input, setInput] = useState("");
  const [listing, setListing] = useState<Listing>({ directory: "" });
  const [highlight, setHighlight] = useState(-1);
  const [placeList, setPlaceList] = useState<FolderPlace[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const path = unquotePath(input);
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const directory = cut < 0 ? "" : path.slice(0, cut + 1);
  const partial = path.slice(cut + 1).toLowerCase();
  const result = listing.directory === directory ? listing.result : undefined;
  const folders = result?.entries.filter(entry => entry.kind === "folder" && entry.name.toLowerCase().startsWith(partial)) ?? [];
  const documents = result?.entries.filter(entry => entry.kind === "document").length ?? 0;
  const crumbs = result?.crumbs ?? [];
  const parent = crumbs.at(-2);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setInput(initialPath ? inside(initialPath) : "");
    setError("");
    setHighlight(-1);
    void places().then(
      next => { if (active) setPlaceList(next); },
      () => { if (active) setPlaceList([]); },
    );
    return () => { active = false; };
  }, [open, initialPath, places]);

  // The listing follows the folder part of the path; a slower earlier answer never replaces it.
  useEffect(() => {
    if (!open || !directory) {
      setListing({ directory: "" });
      return;
    }
    let active = true;
    setListing({ directory });
    browse(directory).then(
      next => { if (active) setListing({ directory, result: next }); },
      (cause: unknown) => { if (active) setListing({ directory, error: cause instanceof Error ? cause.message : String(cause) }); },
    );
    return () => { active = false; };
  }, [open, directory, browse]);

  useEffect(() => {
    if (highlight >= 0) list.current?.children[highlight]?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const go = (folder: string) => {
    if (pending) return;
    setInput(inside(folder));
    setHighlight(-1);
    setError("");
    field.current?.focus();
  };

  const submit = async () => {
    if (!path || pending) return;
    setPending(true);
    const message = await onOpen(path);
    setPending(false);
    setError(message);
    if (!message) onClose();
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (pending || event.nativeEvent.isComposing) return;
    const atEnd = event.currentTarget.selectionStart === input.length && event.currentTarget.selectionEnd === input.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (folders.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight(index => (index < 0 ? (step > 0 ? 0 : folders.length - 1) : (index + step + folders.length) % folders.length));
    } else if ((event.key === "Tab" && !event.shiftKey) || (event.key === "ArrowRight" && atEnd)) {
      // Complete into the highlighted (or only, or first) match.
      const match = folders[Math.max(highlight, 0)];
      if (!match || (event.key === "Tab" && !partial && highlight < 0)) return;
      event.preventDefault();
      go(match.path);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Backspace" && atEnd && endsWithSeparator(path) && parent) {
      event.preventDefault();
      go(parent.path);
    }
  };

  const target = folderName(path);
  const meta = !directory ? "Type a folder path or choose a starting place."
    : listing.directory === directory && listing.error ? listing.error
    : !result ? "Reading…"
    : [folders.length === 0 ? (partial ? "No matching folders" : "No sub-folders") : "",
      partial ? "" : `${documents} Markdown ${documents === 1 ? "file" : "files"} here`].filter(Boolean).join(" · ");
  return (
    <Dialog open={open} onOpenChange={next => { if (!next && !pending) onClose(); }}>
      <DialogContent className="folder-picker sm:max-w-[var(--layout-folder-picker-width)]" showCloseButton={!pending}
        finalFocus={() => returnFocus?.current ?? true}>
        <DialogHeader>
          <DialogTitle>Open folder</DialogTitle>
          <DialogDescription>Choose a folder to list in the sidebar.</DialogDescription>
        </DialogHeader>
        <div className="form-field">
          <label className="form-label" htmlFor="folder-path">Folder path</label>
          <div className="folder-picker-field">
            <Folder aria-hidden="true" />
            <input
              ref={field}
              id="folder-path"
              data-testid="folder-path"
              className="folder-picker-input"
              role="combobox"
              aria-label="Folder path"
              aria-describedby={error ? "open-folder-error" : undefined}
              aria-expanded={folders.length > 0}
              aria-controls="folder-picker-list"
              aria-activedescendant={highlight >= 0 ? `folder-option-${highlight}` : undefined}
              aria-autocomplete="list"
              value={input}
              onChange={event => { setInput(event.target.value); setHighlight(-1); setError(""); }}
              onKeyDown={keyDown}
              placeholder="Folder path"
              spellCheck={false}
              autoComplete="off"
              disabled={pending}
              autoFocus
            />
          </div>
        </div>
        <div className="folder-picker-location">
          <nav aria-label="Folder location" className="folder-picker-crumbs">
            {crumbs.map((crumb, index) => (
              <span key={crumb.path}>
                {index > 0 ? <span className="folder-picker-crumb-separator" aria-hidden="true">/</span> : null}
                <button type="button" className="folder-picker-crumb" title={crumb.path}
                  aria-current={index === crumbs.length - 1 ? "location" : undefined} onClick={() => go(crumb.path)}>
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
          <Button type="button" variant="outline" size="sm" disabled={!parent || pending} onClick={() => parent && go(parent.path)}>
            <ArrowUp aria-hidden="true" />
            Up
          </Button>
        </div>
        <ul ref={list} id="folder-picker-list" className="folder-picker-list" role="listbox" aria-label="Folders">
          {folders.map((entry, index) => (
            <li
              key={entry.path}
              id={`folder-option-${index}`}
              role="option"
              aria-selected={index === highlight}
              className="folder-picker-option"
              title={entry.path}
              onMouseDown={event => event.preventDefault()}
              onClick={() => go(entry.path)}
            >
              <Folder aria-hidden="true" />
              <span>{entry.name}</span>
              <ChevronRight aria-hidden="true" />
            </li>
          ))}
        </ul>
        <p className="folder-picker-meta" data-testid="folder-picker-meta">{meta}</p>
        {recent.length > 0 ? (
          <section className="folder-picker-section" aria-label="Recent folders">
            <p className="folder-picker-label">Recent</p>
            <ul className="folder-picker-recent">
              {recent.map(folder => (
                <li key={folder}>
                  <button type="button" className="folder-picker-option" title={folder}
                    disabled={pending} onClick={() => go(folder)}>
                    <Folder aria-hidden="true" />
                    <span>{folder}</span>
                    <ChevronRight aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {placeList.length > 0 ? (
          <section className="folder-picker-section" aria-label="Start from">
            <p className="folder-picker-label">Start</p>
            <div className="folder-picker-places">
              {placeList.map(place => {
                const Icon = PLACE_ICONS[place.kind];
                return (
                  <Button key={place.path} type="button" variant="outline" size="sm" title={place.path} disabled={pending} onClick={() => go(place.path)}>
                    <Icon aria-hidden="true" />
                    {place.name}
                  </Button>
                );
              })}
            </div>
          </section>
        ) : null}
        {error ? <p id="open-folder-error" className="text-sm text-destructive" role="alert" data-testid="open-error">{error}</p> : null}
        <div className="folder-picker-footer">
          <p>Documents open and save in their original location.</p>
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button type="button" size="sm" data-testid="folder-open" title={path} disabled={!path || pending} onClick={() => void submit()}>
            <span>{path ? `Open “${target}”` : "Open"}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
