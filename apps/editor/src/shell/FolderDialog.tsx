import { useMessageState } from "../ui-message.ts";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { ArrowUp, ChevronRight, FileText, Folder, FolderPlus, HardDrive, House, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import type { FolderBrowseResponse, FolderEntry, FolderPlace } from "../../shared/document-protocol.ts";
import { childPath, splitDocumentPath, unquotePath } from "./document-path.ts";

type FolderDialogProps = {
  open: boolean;
  /** An image picker lists images beside the folders, and Open chooses an image file. */
  choose?: "folder" | "image";
  /** Where browsing starts, usually the open document's folder. */
  initialPath: string;
  recent: string[];
  restricted?: boolean;
  browse(path: string): Promise<FolderBrowseResponse>;
  places(): Promise<FolderPlace[]>;
  /** Resolves to an error message, or "" once the folder is open or the image chosen. */
  onOpen(path: string): Promise<string>;
  /** Creates a folder inside `parent`; resolves to an error message, or "" once it exists. Absent, there is no New folder. */
  onCreateFolder?(parent: string, name: string): Promise<string>;
  /** The control that opened the dialog, which gets focus back when it closes. */
  returnFocus?: RefObject<HTMLElement | null>;
  onClose(): void;
};

type Listing = { directory: string; result?: FolderBrowseResponse; error?: string };

const PLACE_ICONS = { home: House, documents: FileText, drive: HardDrive, root: Folder };

const endsWithSeparator = (value: string) => /[\\/]$/.test(value);
const separatorOf = (value: string) => (value.includes("\\") ? "\\" : "/");
/** A folder path ready to list its contents: it ends with its separator. */
const inside = (folder: string) => (endsWithSeparator(folder) ? folder : folder + separatorOf(folder));
const folderName = (folder: string) => splitDocumentPath(folder.replace(/(?<=.)[\\/]+$/, "")).name || folder;

/**
 * Choose a folder, or an image, on the Host without leaving IeumDoc. The path field is the single
 * source: the list shows the folder up to its last separator, filtered by typed text after it; Open
 * opens exactly the typed path. Moving into a folder never opens it.
 */
export function FolderDialog({ open, choose = "folder", initialPath, recent, restricted, browse, places, onOpen, onCreateFolder, returnFocus, onClose }: FolderDialogProps) {
  useTranslation();
  const [input, setInput] = useState("");
  const [pathFromClick, setPathFromClick] = useState(false);
  const [listing, setListing] = useState<Listing>({ directory: "" });
  const [highlight, setHighlight] = useState(-1);
  const [placeList, setPlaceList] = useState<FolderPlace[]>([]);
  const [error, setError] = useMessageState("");
  const [pending, setPending] = useState(false);
  // New folder: a name row for the listed folder. Creating it moves there; it opens nothing.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useMessageState("");
  const [createPending, setCreatePending] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const newFolderButton = useRef<HTMLButtonElement>(null);

  const path = unquotePath(input);
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const directory = cut < 0 ? "" : path.slice(0, cut + 1);
  const partial = path.slice(cut + 1).toLowerCase();
  const result = listing.directory === directory ? listing.result : undefined;
  const image = choose === "image";
  // Choosing an image needs an image the listing shows; a typed folder is a place to look.
  const named = partial ? result?.entries.find(entry => entry.name.toLowerCase() === partial) : undefined;
  const ready = image ? named?.kind === "image" : Boolean(path);
  const options = result?.entries.filter(entry => (entry.kind === "folder" || (image && entry.kind === "image")) && (pathFromClick || entry.name.toLowerCase().startsWith(partial))) ?? [];
  const activeIndex = highlight < 0 && pathFromClick ? options.findIndex(entry => entry.path === path) : highlight;
  const files = result?.entries.filter(entry => entry.kind === (image ? "image" : "document")).length ?? 0;
  const crumbs = result?.crumbs ?? [];
  const parent = crumbs.at(-2);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setInput(initialPath ? inside(initialPath) : "");
    setPathFromClick(false);
    setError("");
    setHighlight(-1);
    setCreating(false);
    setNewName("");
    setCreateError("");
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
    setPathFromClick(false);
    setHighlight(-1);
    setError("");
    field.current?.focus();
  };

  // A clicked image fills the path without filtering its siblings; a folder is entered.
  const enter = (entry: FolderEntry, fromClick = false) => {
    if (entry.kind === "folder") return go(entry.path);
    if (pending) return;
    setInput(entry.path);
    setPathFromClick(fromClick);
    setHighlight(-1);
    setError("");
    field.current?.focus();
  };

  const cancelCreate = () => {
    setCreating(false);
    setNewName("");
    setCreateError("");
    newFolderButton.current?.focus();
  };

  const createFolder = async (event: FormEvent) => {
    event.preventDefault();
    if (!result || createPending || !onCreateFolder) return;
    const name = newName.trim();
    if (!name || name === "." || name === ".." || /[\\/]/.test(name)) {
      setCreateError({ key: "Enter a folder name without a directory path." });
      return;
    }
    setCreatePending(true);
    const message = await onCreateFolder(result.path, name);
    setCreatePending(false);
    setCreateError(message);
    if (message) return;
    setCreating(false);
    setNewName("");
    go(childPath(result.path, name));
  };

  const submit = async () => {
    if (!ready || pending) return;
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
      if (options.length === 0) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlight(activeIndex < 0 ? (step > 0 ? 0 : options.length - 1) : (activeIndex + step + options.length) % options.length);
    } else if ((event.key === "Tab" && !event.shiftKey) || (event.key === "ArrowRight" && atEnd)) {
      // Complete into the highlighted (or only, or first) match.
      const match = options[Math.max(activeIndex, 0)];
      if (!match || (event.key === "Tab" && !partial && highlight < 0)) return;
      event.preventDefault();
      enter(match);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (image && named?.kind === "folder") go(named.path);
      else void submit();
    } else if (event.key === "Backspace" && atEnd && endsWithSeparator(path) && parent) {
      event.preventDefault();
      go(parent.path);
    }
  };

  const target = folderName(path);
  const meta = !directory ? image ? i18n.t("Type an image path or choose a starting place.") : i18n.t("Type a folder path or choose a starting place.")
    : listing.directory === directory && listing.error ? listing.error
    : !result ? i18n.t("Reading…")
    : [options.length === 0 ? (partial ? (image ? i18n.t("No matching folders or images") : i18n.t("No matching folders")) : i18n.t("No sub-folders")) : "",
      partial ? "" : i18n.t(image ? "imagesHere" : "filesHere", { count: files })].filter(Boolean).join(" · ");
  const pathLabel = image ? i18n.t("Image path") : i18n.t("Folder path");
  return (
    <Dialog open={open} onOpenChange={(next, details) => {
      if (next || pending) return;
      // Escape leaves the name row first, then the dialog.
      if (creating && details.reason === "escape-key") cancelCreate();
      else onClose();
    }}>
      <DialogContent className="folder-picker sm:max-w-[var(--layout-folder-picker-width)]" showCloseButton={!pending}
        finalFocus={() => returnFocus?.current ?? true}>
        <DialogHeader>
          <DialogTitle>{image ? i18n.t("Choose image") : i18n.t("Open folder")}</DialogTitle>
          <DialogDescription>{image
            ? (restricted ? i18n.t("Choose an image on the server for this Figure.") : i18n.t("Choose an image for this Figure."))
            : (restricted ? i18n.t("Choose an allowed folder on the server to list in the sidebar.") : i18n.t("Choose a folder to list in the sidebar."))}</DialogDescription>
        </DialogHeader>
        <div className="form-field">
          <label className="form-label" htmlFor="folder-path">{pathLabel}</label>
          <div className="folder-picker-field">
            {image ? <ImageIcon aria-hidden="true" /> : <Folder aria-hidden="true" />}
            <input
              ref={field}
              id="folder-path"
              data-testid="folder-path"
              className="folder-picker-input"
              role="combobox"
              aria-label={pathLabel}
              aria-describedby={error ? "open-folder-error" : undefined}
              aria-expanded={options.length > 0}
              aria-controls="folder-picker-list"
              aria-activedescendant={activeIndex >= 0 ? `folder-option-${activeIndex}` : undefined}
              aria-autocomplete="list"
              value={input}
              onChange={event => { setInput(event.target.value); setPathFromClick(false); setHighlight(-1); setError(""); }}
              onKeyDown={keyDown}
              placeholder={pathLabel}
              spellCheck={false}
              autoComplete="off"
              disabled={pending}
              autoFocus
            />
          </div>
        </div>
        <div className="folder-picker-location">
          <nav aria-label={i18n.t("Folder location")} className="folder-picker-crumbs">
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
          <div className="folder-picker-location-actions">
            <Button type="button" variant="outline" size="sm" disabled={!parent || pending} onClick={() => parent && go(parent.path)}>
              <ArrowUp aria-hidden="true" />{i18n.t("Up")}</Button>
            {onCreateFolder ? (
              <Button ref={newFolderButton} type="button" variant="outline" size="sm" title={result ? i18n.t("New folder in {{path}}", { path: result.path }) : undefined}
                disabled={!result || pending} onClick={() => { setCreating(true); setCreateError(""); }}>
                <FolderPlus aria-hidden="true" />{i18n.t("New folder")}</Button>
            ) : null}
          </div>
        </div>
        {creating ? (
          <form className="folder-picker-new" onSubmit={event => void createFolder(event)}>
            <Input
              data-testid="new-folder-name"
              aria-label={i18n.t("New folder name")}
              aria-invalid={createError ? true : undefined}
              aria-describedby={createError ? "new-folder-error" : undefined}
              className="text-foreground"
              value={newName}
              onChange={event => { setNewName(event.target.value); setCreateError(""); }}
              placeholder={i18n.t("New folder name")}
              spellCheck={false}
              autoComplete="off"
              disabled={createPending}
              autoFocus
            />
            <Button type="submit" size="sm" disabled={!result || createPending || !newName.trim()}>{i18n.t("Create")}</Button>
            <Button type="button" variant="ghost" size="sm" aria-label={i18n.t("Cancel new folder")} disabled={createPending} onClick={cancelCreate}>{i18n.t("Cancel")}</Button>
            {createError ? <p id="new-folder-error" className="text-sm text-destructive" role="alert" data-testid="new-error">{createError}</p> : null}
          </form>
        ) : null}
        <ul ref={list} id="folder-picker-list" className="folder-picker-list" role="listbox" aria-label={image ? i18n.t("Folders and images") : i18n.t("Folders")}>
          {options.map((entry, index) => (
            <li
              key={entry.path}
              id={`folder-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className="folder-picker-option"
              title={entry.path}
              onMouseDown={event => event.preventDefault()}
              onClick={() => enter(entry, true)}
            >
              {entry.kind === "folder" ? <Folder aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
              <span>{entry.name}</span>
              {entry.kind === "folder" ? <ChevronRight aria-hidden="true" /> : null}
            </li>
          ))}
        </ul>
        <p className="folder-picker-meta" data-testid="folder-picker-meta">{meta}</p>
        {recent.length > 0 ? (
          <section className="folder-picker-section" aria-label={i18n.t("Recent folders")}>
            <p className="folder-picker-label">{i18n.t("Recent")}</p>
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
          <section className="folder-picker-section" aria-label={i18n.t("Start from")}>
            <p className="folder-picker-label">{i18n.t("Start")}</p>
            <div className="folder-picker-places">
              {placeList.map(place => {
                const Icon = PLACE_ICONS[place.kind];
                return (
                  <Button key={place.path} type="button" variant="outline" size="sm" title={place.path} disabled={pending} onClick={() => go(place.path)}>
                    <Icon aria-hidden="true" />
                    {place.kind === "home" ? i18n.t("Home") : place.kind === "documents" ? i18n.t("Documents") : place.name}
                  </Button>
                );
              })}
            </div>
          </section>
        ) : null}
        {error ? <p id="open-folder-error" className="text-sm text-destructive" role="alert" data-testid="open-error">{error}</p> : null}
        <div className="folder-picker-footer">
          <p>{image ? i18n.t("Images outside the document's folder are copied into its assets folder.") : i18n.t("Documents open and save in their original location.")}</p>
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={onClose}>{i18n.t("Cancel")}</Button>
          <Button type="button" size="sm" data-testid="folder-open" title={path} disabled={!ready || pending} onClick={() => void submit()}>
            <span>{ready ? `${image ? i18n.t("Use") : i18n.t("Open")} “${target}”` : image ? i18n.t("Use") : i18n.t("Open")}</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
