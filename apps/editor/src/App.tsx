import { useEffect, useRef, useState } from "react";
import type { EditableBlock, EditableDocument, FigureContent } from "@ieumdoc/core";
import { DocumentEditor, type DocumentEditorHandle } from "./DocumentEditor.tsx";
import { createOutlineStore, type OutlineItem } from "./outline.ts";
import { readDocumentWidth, readRecentFolders, rememberRecentFolder, writeDocumentWidth, type DocumentWidth } from "./preferences.ts";
import { DocumentPanel } from "./shell/DocumentPanel.tsx";
import { MessageArea } from "./shell/MessageArea.tsx";
import { NewDialog, type NewDestination } from "./shell/NewDialog.tsx";
import { FolderDialog } from "./shell/FolderDialog.tsx";
import { OpenDialog } from "./shell/OpenDialog.tsx";
import { Sidebar } from "./shell/Sidebar.tsx";
import { folderChain, knownFolders, useFolderTree, type FolderTreeState } from "./shell/folder-tree.ts";
import { splitDocumentPath, unquotePath } from "./shell/document-path.ts";
import { TopBar, type DocumentView } from "./shell/TopBar.tsx";
import { collectSupportedEdits, isSessionPlaceholder, type AppliedBlockSources, type TiptapJSON } from "./tiptap-document.ts";
import type {
  BlockSourceRequest,
  BlockSourceResponse,
  DocumentFileResponse,
  SaveResponse,
  SourceResponse,
  DocumentErrorResponse,
  FolderBrowseResponse,
  FolderPlace,
  FolderPlacesResponse,
  FolderResponse,
  OrderItem,
  SupportedEdits,
  SessionSaveRequest,
} from "../shared/document-protocol.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

// Below the docking width of styles.css the Document panel starts closed and overlays the
// document; at and above it the panel docks. Independent of the narrow sidebar (64rem).
const PANEL_OVERLAY_LAYOUT = "(width < 80rem)";

const WRITE_BLOCKED_SAVE_HINT = "IeumDoc cannot save this document. See the message below the top bar.";

/** Shown for the whole session of a document Core cannot write as canonical Markdown. */
function writeBlockedMessage(reason: string): string {
  return `Read-only: IeumDoc cannot save this document safely. ${reason} Open Source to inspect or copy the original Markdown. Repair the file in an external editor or with the CLI, then Reload to check it again.`;
}

export function App() {
  const editorRef = useRef<DocumentEditorHandle>(null);
  const newFileButton = useRef<HTMLButtonElement>(null);
  const [document, setDocument] = useState<EditableDocument | null>(null);
  const [sourceRevision, setSourceRevision] = useState("");
  const sessionBase = useRef<SessionSaveRequest["base"]>(undefined);
  const [openedPath, setOpenedPath] = useState("");
  const [headingNumbering, setHeadingNumbering] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [panelOverlay, setPanelOverlay] = useState(() => globalThis.matchMedia?.(PANEL_OVERLAY_LAYOUT).matches ?? false);
  // Page state only: open when docked, closed (and overlaying when opened) below the docking width.
  const [panelOpen, setPanelOpen] = useState(!panelOverlay);
  const outlineToggle = useRef<HTMLButtonElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const [documentWidth, setDocumentWidth] = useState<DocumentWidth>(readDocumentWidth);
  const [openDialog, setOpenDialog] = useState(false);
  const [folderDialog, setFolderDialog] = useState(false);
  const [recentFolders, setRecentFolders] = useState(readRecentFolders);
  const [newDialog, setNewDialog] = useState(false);
  const [newDirectory, setNewDirectory] = useState("");
  const [reloadDialog, setReloadDialog] = useState(false);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // The folder the user chose for this page session, as a lazily listed tree; never stored or watched.
  const folderTree = useFolderTree(requestFolder, setError);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [equationDraftActive, setEquationDraftActive] = useState(false);
  const [figureDraftActive, setFigureDraftActive] = useState(false);
  const [assetPending, setAssetPending] = useState(false);
  const [documentDirty, setDocumentDirty] = useState(false);
  // Outline changes on scrolling re-render the outline only, never the App and its editor.
  const outlineStore = useRef(createOutlineStore()).current;
  // Unwritable snapshots are read-only. Reload checks the repaired file through Core;
  // writable sessions are validated again on every Save/Source request.
  const [writeError, setWriteError] = useState("");
  const saveHint = writeError ? WRITE_BLOCKED_SAVE_HINT : undefined;
  const draftNotice = equationDraftActive || figureDraftActive
    ? "Save and Source include applied content only. Block property drafts remain unsaved until Apply."
    : "";
  const [view, setView] = useState<DocumentView>("visual");
  const [sourceMarkdown, setSourceMarkdown] = useState("");
  const [sourcePending, setSourcePending] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  // The overlaid Document panel starts below the sticky header, whose height changes when the
  // TopBar wraps or a message appears; it never covers Save, Reload or the Outline toggle.
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const observer = new ResizeObserver(() => shell.current?.style.setProperty("--app-header-height", `${element.offsetHeight}px`));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Crossing the docking width starts the panel in that layout's default.
  useEffect(() => {
    const query = matchMedia(PANEL_OVERLAY_LAYOUT);
    const change = () => {
      setPanelOverlay(query.matches);
      setPanelOpen(!query.matches);
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  // A pending Source preview belongs to the open document, so it blocks document switches too.
  const busy = status === "Loading…" || status === "Opening…" || status === "Creating…" || status === "Saving…" ||
    sourcePending || assetPending;
  const switching = status === "Loading…" || status === "Opening…" || status === "Creating…";

  /** Resolves to an error message for a requested path, or "" on success. */
  async function load(requestedPath?: string): Promise<string> {
    setError("");
    setNotice("");
    setStatus(requestedPath ? "Opening…" : "Loading…");
    try {
      const next = await requestDocument("GET", requestedPath);
      setDocument(next.document);
      sessionBase.current = next.source === undefined ? undefined : { source: next.source };
      setWriteError(next.writeError);
      setSourceRevision(next.revision);
      setOpenedPath(next.path);
      setEditorGeneration((value) => value + 1);
      setEquationDraftActive(false);
      setFigureDraftActive(false);
      setView("visual");
      setStatus("Ready");
      return "";
    } catch (cause) {
      const message = messageOf(cause);
      if (!requestedPath) setError(message);
      setStatus(requestedPath ? "Open failed" : "Load failed");
      return message;
    }
  }

  async function openFile(path: string): Promise<string> {
    const requestedPath = unquotePath(path);
    if (!requestedPath) return "Enter a Markdown file path.";
    if (!requestedPath.toLowerCase().endsWith(".md")) return "Only .md files can be opened.";
    if (busy) return "Wait for the current operation to finish.";
    if (editorRef.current?.hasUnsavedChanges()) {
      return "Save or discard the current changes before opening another file.";
    }
    return load(requestedPath);
  }

  /** Lists the folder the user chose; it becomes the sidebar folder on success. */
  async function openFolder(path: string): Promise<string> {
    const root = unquotePath(path);
    if (!root) return "Enter a folder path.";
    try {
      const listed = await requestFolder(root);
      folderTree.open(listed, openedPath);
      setRecentFolders(rememberRecentFolder(listed.root, recentFolders));
      return "";
    } catch (cause) {
      return messageOf(cause);
    }
  }

  async function openFolderDocument(path: string): Promise<void> {
    if (path === openedPath) return;
    const message = await openFile(path);
    if (message) setError(message);
  }

  // Opening or creating a document lists its folders again; there is no watch.
  useEffect(() => {
    if (openedPath) folderTree.reveal(openedPath);
  }, [openedPath]);

  async function save(): Promise<void> {
    if (!document || !editorRef.current || !openedPath || busy) return;
    if (writeError) return;
    setError("");
    setNotice("");
    setStatus("Saving…");
    let submitted: TiptapJSON | undefined;
    let payload: SupportedEdits | undefined;
    try {
      submitted = editorRef.current.beginSave();
      payload = collectSupportedEdits(document, submitted);
      const next = await requestDocument("POST", openedPath, { revision: sourceRevision, base: sessionBase.current, ...payload });
      setWriteError(next.writeError);
      setSourceRevision(next.revision);
      if (sessionBase.current) sessionBase.current.savedEdits = payload;
      editorRef.current?.finishSave(true);
      const hasPendingUserState = editorRef.current?.hasUnsavedChanges() ?? false;
      setStatus(hasPendingUserState ? "Saved; newer edits pending" : "Saved");
    } catch (cause) {
      editorRef.current?.finishSave();
      setError(saveErrorMessage(cause, submitted, payload));
      setStatus(cause instanceof SaveConflictError ? "Save conflict" : "Save failed");
    }
  }

  /**
   * Shows the canonical Markdown the current editor state would save as. The Host runs
   * the Save request through Core without writing; any failure keeps the Visual view.
   */
  async function showSource(): Promise<void> {
    if (!document || !editorRef.current || !openedPath || busy) return;
    if (writeError) {
      setSourceMarkdown(sessionBase.current?.source ?? "");
      setView("source");
      return;
    }
    setError("");
    setSourcePending(true);
    try {
      const payload = collectSupportedEdits(document, editorRef.current.getDocument());
      setSourceMarkdown(await requestSource(openedPath, { revision: sourceRevision, base: sessionBase.current, ...payload }));
      setView("source");
    } catch (cause) {
      setError(`Source view unavailable: ${messageOf(cause)}`);
    } finally {
      setSourcePending(false);
    }
  }

  async function createFile(path: string): Promise<string> {
    const requestedPath = path.trim();
    if (!requestedPath) return "Enter a Markdown file path.";
    if (!requestedPath.toLowerCase().endsWith(".md")) return "Only .md files can be created.";
    if (busy) return "Wait for the current operation to finish.";
    if (editorRef.current?.hasUnsavedChanges()) {
      return "Save or discard the current changes before creating another file.";
    }
    setError("");
    setNotice("");
    setStatus("Creating…");
    try {
      const next = await requestDocument("PUT", requestedPath, { path: requestedPath });
      setDocument(next.document);
      sessionBase.current = next.source === undefined ? undefined : { source: next.source };
      setWriteError(next.writeError);
      setSourceRevision(next.revision);
      setOpenedPath(next.path);
      setEditorGeneration((value) => value + 1);
      setEquationDraftActive(false);
      setFigureDraftActive(false);
      setView("visual");
      setStatus("Ready");
      return "";
    } catch (cause) {
      const message = messageOf(cause);
      setError(message);
      setStatus("Create failed");
      return message;
    }
  }

  // Ctrl/Cmd+S is the Save button: same path, same messages. The browser's own page save
  // never applies. Modal dialogs cover the Save button, so the shortcut waits for them too.
  const saveShortcut = useRef<(event: KeyboardEvent) => void>(() => {});
  saveShortcut.current = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey ||
        (event.key.toLowerCase() !== "s" && event.code !== "KeyS")) return;
    event.preventDefault();
    if (openDialog || folderDialog || newDialog || reloadDialog) return;
    void save();
  };
  useEffect(() => {
    // Capture, so inputs inside node views (Equation, Figure, code language) cannot swallow it.
    const listener = (event: KeyboardEvent) => saveShortcut.current(event);
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!editorRef.current?.hasUnsavedChanges() && !busy) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [busy]);

  /** Outline navigation always lands in the Visual view, where the heading is. */
  function revealHeading(item: OutlineItem): void {
    if (view === "visual") {
      editorRef.current?.revealHeading(item);
      return;
    }
    setView("visual");
    requestAnimationFrame(() => editorRef.current?.revealHeading(item));
  }

  function toggleDocumentWidth(): void {
    const next = documentWidth === "wide" ? "standard" : "wide";
    setDocumentWidth(next);
    writeDocumentWidth(next);
  }

  async function reload(): Promise<void> {
    if (busy || !openedPath) return;
    if (editorRef.current?.hasUnsavedChanges()) {
      setReloadDialog(true);
      return;
    }
    await reloadFromDisk();
  }

  async function reloadFromDisk(): Promise<void> {
    // Keep a modal boundary during the read, so newly typed input cannot race a reload.
    setReloadDialog(true);
    const message = await load(openedPath);
    setReloadDialog(false);
    if (message) setError(message);
  }

  return (
    <div ref={shell} className={`app-shell${sidebarOpen ? "" : " app-shell--collapsed"}${panelOpen ? "" : " app-shell--panel-closed"}${documentWidth === "wide" ? " app-shell--wide" : ""}`}>
      <Sidebar
        newButtonRef={newFileButton}
        open={sidebarOpen}
        documentPath={openedPath}
        onToggle={() => setSidebarOpen((value) => !value)}
        onOpen={() => setOpenDialog(true)}
        onOpenFolder={() => setFolderDialog(true)}
        onNew={() => {
          if (!folderTree.state) return;
          // New starts in the open document's folder when it is inside the chosen one.
          setNewDirectory(folderChain(folderTree.state.root, openedPath).at(-1) ?? folderTree.state.root);
          setNewDialog(true);
        }}
        folder={folderTree.state ?? undefined}
        onToggleFolder={folderTree.toggle}
        onOpenDocument={(path) => void openFolderDocument(path)}
        onCloseFolder={folderTree.close}
      />
      <div className="app-main">
        <div className="app-header" ref={header}>
          <TopBar
            documentPath={openedPath}
            status={assetPending ? "Adding image…" : status}
            unsaved={documentDirty || equationDraftActive || figureDraftActive}
            writable={!writeError}
            view={view}
            viewDisabled={!document || busy}
            onViewChange={(next) => (next === "source" ? void showSource() : setView("visual"))}
            saveDisabled={!document || busy ||
              Boolean(writeError)}
            saveHint={saveHint}
            headingNumbering={headingNumbering}
            onToggleHeadingNumbering={() => editorRef.current?.toggleHeadingNumbering()}
            numberingDisabled={!document || busy || Boolean(writeError) || view !== "visual"}
            onSave={() => void save()}
            onReload={() => void reload()}
            reloadDisabled={!document || busy}
            wide={documentWidth === "wide"}
            onToggleWide={toggleDocumentWidth}
            outline={panelOpen}
            onToggleOutline={() => setPanelOpen((value) => !value)}
            outlineToggleRef={outlineToggle}
          />
          <MessageArea
            error={error}
            notice={notice}
            draftNotice={draftNotice}
            warning={writeError ? writeBlockedMessage(writeError) : ""}
            onDismissError={() => setError("")}
            onNoticeExpired={() => setNotice("")}
          />
        </div>
        <main className="document-column" onMouseDown={(event) => {
          // The empty area below the document places the caret at its end.
          if (event.button === 0 && event.target === event.currentTarget && view === "visual" &&
            editorRef.current?.focusEnd(event.clientY)) event.preventDefault();
        }}>
          {view === "source" ? (
            <article className="document source-view" data-testid="source-view" aria-label="Markdown source">
              {writeError ? <p className="block-kind">Original Markdown · read-only</p> : null}
              <pre className="source-view-text">{sourceMarkdown}</pre>
            </article>
          ) : null}
          {/* Hidden, not unmounted, in Source: the one editor state and its history stay intact. */}
          {document ? (
            <div hidden={view === "source"}>
              <DocumentEditor
                key={editorGeneration}
                ref={editorRef}
                document={document}
                readOnly={Boolean(writeError)}
                documentPath={openedPath}
                onEquationDraftChange={setEquationDraftActive}
                onFigureDraftChange={setFigureDraftActive}
                onAssetPendingChange={setAssetPending}
                onAssetError={setError}
                onDirtyChange={setDocumentDirty}
                onHeadingNumberingChange={setHeadingNumbering}
                onOutlineChange={outlineStore.set}
                validateFigure={validateFigure}
                applyBlockSource={(path, source, applied) => applyBlockSource(sessionBase.current?.source ?? "", path, source, applied)}
                onStructuralReject={(reason) =>
                  setNotice(reason ?? "This change cannot preserve the supported document structure. Your document is unchanged.")
                }
              />
            </div>
          ) : null}
        </main>
      </div>
      {panelOpen ? (
        <DocumentPanel
          overlay={panelOverlay}
          outline={document ? outlineStore : undefined}
          onSelectHeading={revealHeading}
          onClose={() => {
            setPanelOpen(false);
            // The panel's own controls go away; its toggle keeps the focus.
            outlineToggle.current?.focus();
          }}
        />
      ) : null}
      <OpenDialog
        open={openDialog}
        initialPath={openedPath}
        busy={busy}
        onOpen={openFile}
        onClose={() => { if (!switching) setOpenDialog(false); }}
      />
      <FolderDialog
        open={folderDialog}
        initialPath={folderTree.state?.root ?? splitDocumentPath(openedPath).directory}
        recent={recentFolders}
        browse={browseHostFolder}
        places={folderPlaces}
        onOpen={openFolder}
        onClose={() => setFolderDialog(false)}
      />
      <NewDialog
        open={newDialog}
        destinations={folderTree.state ? newDestinations(folderTree.state) : []}
        directory={newDirectory}
        busy={busy}
        onCreate={createFile}
        createdFocusTarget={() => editorRef.current?.getFocusTarget() ?? null}
        returnFocus={newFileButton}
        onClose={() => { if (!switching) setNewDialog(false); }}
      />
      <Dialog open={reloadDialog} onOpenChange={(open) => { if (!switching) setReloadDialog(open); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{switching ? "Reloading…" : "Discard local changes?"}</DialogTitle>
            <DialogDescription>Reload replaces your unsaved changes and unapplied drafts with the file on disk. Keep editing to preserve them. Source lets you copy applied content first.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="sm" disabled={switching} onClick={() => setReloadDialog(false)}>Keep editing</Button>
            <Button size="sm" disabled={switching} onClick={() => void reloadFromDisk()}>Discard and reload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Client view model normalizes the Host's null writeability verdict to an empty UI message. */
type DocumentResponse = Omit<SaveResponse, "writeError"> & {
  source?: DocumentFileResponse["source"];
  writeError: string;
};

class SaveContentError extends Error {
  constructor(message: string, readonly target?: OrderItem) { super(message); }
}

function saveErrorMessage(error: unknown, submitted?: TiptapJSON, edits?: SupportedEdits): string {
  if (!(error instanceof SaveContentError) || !error.target || !submitted) return messageOf(error);
  const target = error.target;
  const nodes = submitted.content ?? [];
  const node = "path" in target
    ? nodes.find(node => String(node.attrs?.sourcePath).split(";").includes(target.path.join(",")))
    : nodes.filter(node => !isSessionPlaceholder(node))[edits?.order?.findIndex(item => "insert" in item && item.insert === target.insert) ?? -1];
  return node ? `Block ${nodes.indexOf(node) + 1} (${node.type}): ${error.message}` : error.message;
}

class SaveConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveConflictError";
  }
}

async function requestDocument(
  method: "GET" | "POST" | "PUT",
  filePath?: string,
  body?: SessionSaveRequest | { path: string },
): Promise<DocumentResponse> {
  const query = method === "GET" && filePath ? `?path=${encodeURIComponent(filePath)}` : "";
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/document${query}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify({ path: filePath, ...body }) : undefined,
  });
  const payload = (await response.json()) as Partial<DocumentFileResponse> & Partial<DocumentErrorResponse>;
  if (response.status === 409) {
    throw new SaveConflictError(payload.error ?? "Document changed outside the editor. Reload before saving.");
  }
  if (!response.ok || !payload.document || typeof payload.revision !== "string" || typeof payload.path !== "string") {
    throw new SaveContentError(payload.error ?? `request failed (${response.status})`, payload.target);
  }
  return {
    path: payload.path,
    document: payload.document,
    revision: payload.revision,
    source: payload.source,
    writeError: typeof payload.writeError === "string" ? payload.writeError : "",
  };
}

/** Folders New can create in, named from the chosen folder down: `docs`, `docs\guides`. */
function newDestinations(tree: FolderTreeState): NewDestination[] {
  const separator = tree.root.includes("\\") ? "\\" : "/";
  const name = splitDocumentPath(tree.root).name || tree.root;
  const prefix = tree.root.endsWith(separator) ? tree.root : tree.root + separator;
  const base = name.endsWith(separator) ? name : name + separator;
  return knownFolders(tree).map(path => ({ path, label: path === tree.root ? name : base + path.slice(prefix.length) }));
}

/** Asks the Host for one level of a folder inside the folder the user chose. */
async function requestFolder(root: string, path?: string): Promise<FolderResponse> {
  const query = new URLSearchParams({ root, ...(path ? { path } : {}) });
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/folder?${query}`);
  const payload = (await response.json()) as Partial<FolderResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || !Array.isArray(payload.entries)) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload as FolderResponse;
}

/** Asks the Host for one level of any folder while choosing which folder to open. */
async function browseHostFolder(path: string): Promise<FolderBrowseResponse> {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/folder-browse?${new URLSearchParams({ path })}`);
  const payload = (await response.json()) as Partial<FolderBrowseResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || !Array.isArray(payload.entries) || !Array.isArray(payload.crumbs)) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload as FolderBrowseResponse;
}

/** Asks the Host where choosing a folder can start. */
async function folderPlaces(): Promise<FolderPlace[]> {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/folder-places`);
  const payload = (await response.json()) as Partial<FolderPlacesResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || !Array.isArray(payload.places)) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload.places;
}

/** Asks the Host for the canonical Markdown a Save request would write. */
async function requestSource(filePath: string, body: SessionSaveRequest): Promise<string> {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/document-source`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: filePath, ...body }),
  });
  const payload = (await response.json()) as Partial<SourceResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || typeof payload.markdown !== "string") {
    throw new Error(payload.error ?? `request failed (${response.status})`);
  }
  return payload.markdown;
}

/** Asks the Host to run Core's persistent Figure validation of an Apply: properties and label. */
async function validateFigure(figure: FigureContent, label: string): Promise<string | undefined> {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/figure-validation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...figure, label }),
  });
  const payload = (await response.json()) as { error?: string | null };
  if (!response.ok) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload.error ?? undefined;
}

/** Asks the Host to apply a block source through Core on the session's opening snapshot. */
async function applyBlockSource(base: string, path: string, source: string, applied: AppliedBlockSources): Promise<EditableBlock> {
  const request: BlockSourceRequest = {
    base,
    path: path.split(",").map(Number),
    source,
    sources: Object.entries(applied).filter(([key]) => key !== path).map(([key, edit]) => ({ path: key.split(",").map(Number), source: edit.source })),
  };
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/block-source`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = (await response.json()) as Partial<BlockSourceResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || !payload.block) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload.block;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
