import { useEffect, useRef, useState } from "react";
import { DocumentEditor } from "./DocumentEditor.tsx";
import { useDocumentSession, type DocumentSession } from "./useDocumentSession.ts";
import { messageOf } from "./document-session.ts";
import { readDocumentWidth, readRecentFolders, rememberRecentFolder, visibleRecentFolders, writeDocumentWidth, type DocumentWidth } from "./preferences.ts";
import { DocumentPanel } from "./shell/DocumentPanel.tsx";
import { DocumentStart } from "./shell/DocumentStart.tsx";
import { MessageArea } from "./shell/MessageArea.tsx";
import { NewDialog, type NewDestination } from "./shell/NewDialog.tsx";
import { FolderDialog } from "./shell/FolderDialog.tsx";
import { SettingsDialog } from "./shell/SettingsDialog.tsx";
import { UnsavedChangesDialog } from "./shell/UnsavedChangesDialog.tsx";
import { Sidebar } from "./shell/Sidebar.tsx";
import { folderChain, knownFolders, useFolderTree, type FolderTreeState } from "./shell/folder-tree.ts";
import { childPath, splitDocumentPath, unquotePath } from "./shell/document-path.ts";
import { TopBar } from "./shell/TopBar.tsx";
import type {
  DocumentErrorResponse,
  DocumentStartResponse,
  FolderBrowseResponse,
  FolderCreateRequest,
  FolderCreateResponse,
  FolderPlace,
  FolderPlacesResponse,
  FolderResponse,
} from "../shared/document-protocol.ts";
import type { DesktopInfo, RestartCheck } from "../shared/desktop-bridge.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

// Below the docking width of styles.css the Document panel starts closed and overlays the
// document; at and above it the panel docks. Independent of the narrow sidebar (64rem).
const PANEL_OVERLAY_LAYOUT = "(width < 80rem)";

type SessionContinuation = { kind: "open"; path: string } | { kind: "new"; directory: string };

/** The Desktop app's bridge; the browser Editor has none and shows no Desktop UI. */
const desktop = typeof window === "undefined" ? undefined : window.ieumdocDesktop;

export function App() {
  const newFileButton = useRef<HTMLButtonElement>(null);
  const newFolderButton = useRef<HTMLButtonElement>(null);
  // Open folder… returns focus to the control that opened it.
  const dialogReturnFocus = useRef<HTMLElement | null>(null);
  // Set when the Host opened no document at start; cleared once one opens.
  const [start, setStart] = useState<DocumentStartResponse | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [panelOverlay, setPanelOverlay] = useState(() => globalThis.matchMedia?.(PANEL_OVERLAY_LAYOUT).matches ?? false);
  // Page state only: open when docked, closed (and overlaying when opened) below the docking width.
  const [panelOpen, setPanelOpen] = useState(!panelOverlay);
  const outlineToggle = useRef<HTMLButtonElement>(null);
  const fileActionsToggle = useRef<HTMLButtonElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const [documentWidth, setDocumentWidth] = useState<DocumentWidth>(readDocumentWidth);
  const [folderDialog, setFolderDialog] = useState(false);
  const [recentFolders, setRecentFolders] = useState(readRecentFolders);
  const [allowedRoots, setAllowedRoots] = useState<string[] | undefined>(undefined);
  const visibleRecent = visibleRecentFolders(recentFolders, allowedRoots);
  const [newDialog, setNewDialog] = useState(false);
  const [newDirectory, setNewDirectory] = useState("");
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [continuation, setContinuation] = useState<(SessionContinuation & { session: DocumentSession }) | null>(null);
  const [continuationPending, setContinuationPending] = useState(false);
  const continuationRunning = useRef(false);
  const continuationReturnFocus = useRef<HTMLElement | null>(null);
  const continuationFocus = useRef<"return" | "editor" | "dialog">("return");
  const session = useDocumentSession(start, (next) => {
    setStart(next);
    if (next) setAllowedRoots(next.allowedRoots);
  });
  const {
    editorRef, document, openedPath, headingNumbering, outlineStore, editorGeneration,
    view, setView, sourceMarkdown, status, error, setError, notice, setNotice,
    draftActive, assetPending, documentDirty, busy, switching, busyRef, draftNotice, documentNotice,
    load, createFile, save, showSource, reload, reloadFromDisk, reloadDialog, setReloadDialog,
    pendingWork, revealHeading, openRefusal, setOpenRefusal, openRefusalReturnFocus,
    imageChoice, imageReturnFocus, selectImage, closeImageChoice, editorCallbacks,
  } = session;
  // The folder the user chose for this page session, as a lazily listed tree; never stored or watched.
  const folderTree = useFolderTree(requestFolder, setError);
  const [desktopInfo, setDesktopInfo] = useState<DesktopInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsReturnFocus = useRef<HTMLElement | null>(null);

  // The overlaid Document panel starts below the sticky header, whose height changes when the
  // TopBar wraps or a message appears; it never covers Save, File actions or the Outline toggle.
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

  async function openFile(path: string, openedNotice = ""): Promise<string | null> {
    const requestedPath = unquotePath(path);
    if (!requestedPath) return "Enter a Markdown file path.";
    if (!requestedPath.toLowerCase().endsWith(".md")) return "Only .md files can be opened.";
    if (busy) return "Wait for the current operation to finish.";
    if (editorRef.current?.hasUnsavedChanges()) {
      confirmContinuation({ kind: "open", path: requestedPath });
      return null;
    }
    return load(requestedPath, globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null, openedNotice);
  }

  function confirmContinuation(next: SessionContinuation): void {
    continuationReturnFocus.current = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null;
    continuationFocus.current = "return";
    setContinuation({ ...next, session });
  }

  function newFile(): void {
    if (!folderTree.state) return;
    if (busy) { setError("Wait for the current operation to finish."); return; }
    const directory = folderChain(folderTree.state.root, openedPath).at(-1) ?? folderTree.state.root;
    if (editorRef.current?.hasUnsavedChanges()) {
      confirmContinuation({ kind: "new", directory });
      return;
    }
    setNewDirectory(directory);
    setNewDialog(true);
  }

  async function continueSession(shouldSave: boolean): Promise<void> {
    if (!continuation || continuationRunning.current || busy) return;
    const owner = continuation.session;
    if (!owner.isCurrent()) return;
    continuationRunning.current = true;
    setContinuationPending(true);
    try {
      if (shouldSave && !await owner.save()) return;
      if (!owner.isCurrent()) return;
      // A successful Save acknowledges its snapshot, not later asynchronous transactions.
      // Read the live document comparison; the user already agreed to lose property drafts.
      if (shouldSave && owner.editorRef.current?.hasDocumentChanges() !== false) {
        owner.setStatus("Saved; newer edits pending");
        return;
      }
      if (continuation.kind === "new") {
        continuationFocus.current = "dialog";
        setNewDirectory(continuation.directory);
        setNewDialog(true);
      } else {
        const message = await owner.load(continuation.path, continuationReturnFocus.current);
        if (message && owner.isCurrent()) owner.setError(message);
        continuationFocus.current = message === null ? "dialog" : message ? "return" : "editor";
      }
    } finally {
      setContinuation(null);
      setContinuationPending(false);
      continuationRunning.current = false;
    }
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

  /** Creates a folder; nothing about the open document changes. */
  async function createFolder(parent: string, name: string): Promise<string> {
    try {
      await requestCreateFolder(parent, name);
      return "";
    } catch (cause) {
      return messageOf(cause);
    }
  }

  async function openFolderDocument(path: string): Promise<void> {
    if (path === openedPath) return;
    const message = await openFile(path);
    if (message && session.isCurrent()) setError(message);
  }

  // Opening or creating a document lists its folders again; there is no watch.
  useEffect(() => {
    if (openedPath) folderTree.reveal(openedPath);
  }, [openedPath]);

  // Ctrl/Cmd+S is the Save button: same path, same messages. The browser's own page save
  // never applies. Modal dialogs cover the Save button, so the shortcut waits for them too.
  const saveShortcut = useRef<(event: KeyboardEvent) => void>(() => {});
  saveShortcut.current = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey ||
        (event.key.toLowerCase() !== "s" && event.code !== "KeyS")) return;
    event.preventDefault();
    if (folderDialog || newDialog || newFolderDialog || reloadDialog || openRefusal || continuation) return;
    void save();
  };
  useEffect(() => {
    // Capture, so inputs inside node views (Equation, Figure, code language) cannot swallow it.
    const listener = (event: KeyboardEvent) => saveShortcut.current(event);
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  const restartCheck = useRef<() => RestartCheck>(() => ({ ok: false, reason: "The editor is not ready." }));
  restartCheck.current = () => {
    const reason = pendingWork();
    return reason ? { ok: false, reason } : { ok: true };
  };
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void desktop.info().then((info) => { if (active) setDesktopInfo(info); })
      .catch((cause: unknown) => { if (active) setError(`Desktop settings unavailable: ${messageOf(cause)}`); });
    const stopState = desktop.onUpdateState((update) => setDesktopInfo((info) => info && { ...info, update }));
    const stopCheck = desktop.onRestartCheck(() => restartCheck.current());
    return () => {
      active = false;
      stopState();
      stopCheck();
    };
  }, []);

  /** Resolves to why the app did not restart, or "" when it is restarting to install. */
  async function installUpdate(): Promise<string> {
    if (!desktop) return "";
    const result = await desktop.installUpdate();
    return result.ok ? "" : result.reason;
  }

  function postponeUpdate(version: string): void {
    setDesktopInfo((info) => info && { ...info, postponed: version });
    void desktop?.postponeUpdate(version).catch((cause: unknown) => setError(messageOf(cause)));
  }

  const update = desktopInfo?.update;
  const updateNotice = update && (update.phase === "available" || update.phase === "downloaded") && update.version !== desktopInfo?.postponed
    ? update.phase === "available"
      ? { text: `IeumDoc ${update.version}${update.prerelease ? " (Beta)" : ""} is available.`, action: "View", onAction: () => {
          settingsReturnFocus.current = null;
          setSettingsOpen(true);
        }, onLater: () => postponeUpdate(update.version) }
      : { text: `IeumDoc ${update.version} is ready to install.`, action: "Restart to update",
          onAction: () => void installUpdate().then((reason) => { if (reason) setError(reason); })
            .catch((cause: unknown) => setError(messageOf(cause))), onLater: () => postponeUpdate(update.version) }
    : null;

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!editorRef.current?.hasUnsavedChanges() && !busyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);

  function toggleDocumentWidth(): void {
    const next = documentWidth === "wide" ? "standard" : "wide";
    setDocumentWidth(next);
    writeDocumentWidth(next);
  }

  return (
    <div ref={shell} className={`app-shell${sidebarOpen ? "" : " app-shell--collapsed"}${panelOpen ? "" : " app-shell--panel-closed"}${documentWidth === "wide" ? " app-shell--wide" : ""}`}>
      <Sidebar
        newButtonRef={newFileButton}
        open={sidebarOpen}
        documentPath={openedPath}
        display={{
          headingNumbering,
          onToggleHeadingNumbering: () => editorRef.current?.toggleHeadingNumbering(),
          numberingDisabled: !document || busy || view !== "visual",
          numberingHint: !document ? "Open a document to change numbering." : busy ? "Wait for the current operation to finish."
            : view !== "visual" ? "Switch to Visual to change heading numbering." : undefined,
          wide: documentWidth === "wide",
          onToggleWide: toggleDocumentWidth,
        }}
        onToggle={() => setSidebarOpen((value) => !value)}
        onOpenFolder={(returnFocus) => {
          dialogReturnFocus.current = returnFocus;
          setFolderDialog(true);
        }}
        onNew={newFile}
        newFolderButtonRef={newFolderButton}
        onNewFolder={() => {
          if (!folderTree.state) return;
          setNewDirectory(folderChain(folderTree.state.root, openedPath).at(-1) ?? folderTree.state.root);
          setNewFolderDialog(true);
        }}
        folder={folderTree.state ?? undefined}
        onToggleFolder={folderTree.toggle}
        onOpenDocument={(path) => void openFolderDocument(path)}
        onCloseFolder={folderTree.close}
        onSettings={desktop ? (returnFocus) => {
          settingsReturnFocus.current = returnFocus;
          setSettingsOpen(true);
        } : undefined}
      />
      <div className="app-main">
        <div className="app-header" ref={header}>
          <TopBar
            documentPath={openedPath}
            status={assetPending ? "Adding image…" : status}
            unsaved={documentDirty || draftActive}
            view={view}
            viewDisabled={!document || busy}
            onViewChange={(next) => (next === "source" ? void showSource() : setView("visual"))}
            saveDisabled={!document || busy}
            onSave={() => void save()}
            onReload={() => void reload()}
            reloadDisabled={!document || busy}
            fileActionsRef={fileActionsToggle}
            outline={panelOpen}
            onToggleOutline={() => setPanelOpen((value) => !value)}
            outlineToggleRef={outlineToggle}
          />
          <MessageArea
            error={error}
            notice={notice}
            draftNotice={draftNotice}
            documentNotice={documentNotice}
            update={updateNotice}
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
              <pre className="source-view-text">{sourceMarkdown}</pre>
            </article>
          ) : null}
          {!document && start ? (
            <DocumentStart
              recent={visibleRecent}
              sample={start.sample}
              busy={busy}
              onOpenFolder={(returnFocus) => {
                dialogReturnFocus.current = returnFocus;
                setFolderDialog(true);
              }}
              onOpenRecent={(folder) => void openFolder(folder).then((message) => { if (message) setError(message); })}
              onOpenSample={(sample) => void openFile(sample, "This is the sample document, a copy in IeumDoc's app data.").then((message) => {
                if (message && session.isCurrent()) setError(message);
              })}
            />
          ) : null}
          {/* Hidden, not unmounted, in Source: the one editor state and its history stay intact. */}
          {document ? (
            <div hidden={view === "source"}>
              <DocumentEditor
                key={editorGeneration}
                ref={editorRef}
                document={document}
                documentPath={openedPath}
                {...editorCallbacks}
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
      {desktop ? (
        <SettingsDialog
          open={settingsOpen}
          desktop={desktop}
          info={desktopInfo}
          onInfo={setDesktopInfo}
          onInstall={installUpdate}
          returnFocus={settingsReturnFocus}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      <FolderDialog
        open={folderDialog}
        initialPath={folderTree.state?.root ?? splitDocumentPath(openedPath).directory}
        recent={visibleRecent}
        restricted={allowedRoots !== undefined}
        browse={browseHostFolder}
        places={folderPlaces}
        onOpen={openFolder}
        onCreateFolder={async (parent, name) => {
          const message = await createFolder(parent, name);
          // Creating while choosing changes no expansion; an already listed folder shows it.
          if (!message) folderTree.refresh(parent);
          return message;
        }}
        returnFocus={dialogReturnFocus}
        onClose={() => setFolderDialog(false)}
      />
      <FolderDialog
        open={imageChoice !== null}
        choose="image"
        initialPath={imageChoice ? splitDocumentPath(imageChoice.documentPath).directory : ""}
        recent={visibleRecent}
        restricted={allowedRoots !== undefined}
        browse={browseHostImages}
        places={folderPlaces}
        onOpen={selectImage}
        returnFocus={imageReturnFocus}
        onClose={closeImageChoice}
      />
      <NewDialog
        open={newDialog}
        destinations={folderTree.state ? newDestinations(folderTree.state) : []}
        directory={newDirectory}
        busy={busy}
        onCreate={(directory, name) => createFile(childPath(directory, name))}
        createdFocusTarget={() => editorRef.current?.getFocusTarget() ?? null}
        returnFocus={newFileButton}
        onClose={() => { if (!switching) setNewDialog(false); }}
      />
      <UnsavedChangesDialog
        open={continuation !== null}
        pending={continuationPending}
        documentName={splitDocumentPath(openedPath).name}
        hasDrafts={draftActive}
        finalFocus={() => continuationFocus.current === "dialog" ? false
          : continuationFocus.current === "editor" ? editorRef.current?.getFocusTarget() ?? true
          : continuationReturnFocus.current ?? true}
        onSave={() => void continueSession(true)}
        onDiscard={() => void continueSession(false)}
        onCancel={() => { if (!continuationRunning.current) setContinuation(null); }}
      />
      <NewDialog
        kind="folder"
        open={newFolderDialog}
        destinations={folderTree.state ? newDestinations(folderTree.state) : []}
        directory={newDirectory}
        busy={false}
        onCreate={async (directory, name) => {
          const message = await createFolder(directory, name);
          if (!message) folderTree.reveal(childPath(directory, name));
          return message;
        }}
        returnFocus={newFolderButton}
        onClose={() => setNewFolderDialog(false)}
      />
      <Dialog open={openRefusal !== null} onOpenChange={(open) => { if (!open) setOpenRefusal(null); }}>
        <DialogContent showCloseButton={false} finalFocus={openRefusalReturnFocus}>
          <DialogHeader>
            <DialogTitle>Cannot open document</DialogTitle>
            <DialogDescription render={<div />} className="grid gap-4 break-words">
              <p>“{openRefusal ? splitDocumentPath(openRefusal.path).name : ""}” is not a supported IeumDoc document.</p>
              <p>{openRefusal?.reason}</p>
              <p>{openRefusal?.action}</p>
              <p>{document ? "Your current document has not changed." : "No document was opened."}</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" onClick={() => setOpenRefusal(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={reloadDialog} onOpenChange={(open) => { if (!switching) setReloadDialog(open); }}>
        <DialogContent showCloseButton={false} finalFocus={fileActionsToggle}>
          <DialogHeader>
            <DialogTitle>{switching ? "Reloading…" : "Discard local changes?"}</DialogTitle>
            <DialogDescription>Reload replaces your unsaved changes and unapplied drafts with the file on disk. Keep editing to preserve them. Source lets you copy applied content first.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="sm" disabled={switching} onClick={() => setReloadDialog(false)}>Keep editing</Button>
            <Button variant="destructive" size="sm" disabled={switching} onClick={() => void reloadFromDisk()}>Discard and reload</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
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

/** Asks the Host for one level of any folder while choosing which folder to open, or an image. */
async function browseHostFolder(path: string, files?: "image"): Promise<FolderBrowseResponse> {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/folder-browse?${new URLSearchParams({ path, ...(files ? { files } : {}) })}`);
  const payload = (await response.json()) as Partial<FolderBrowseResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || !Array.isArray(payload.entries) || !Array.isArray(payload.crumbs)) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload as FolderBrowseResponse;
}

const browseHostImages = (path: string) => browseHostFolder(path, "image");

/** Asks the Host to create one folder inside an existing one. */
async function requestCreateFolder(parent: string, name: string): Promise<FolderCreateResponse> {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parent, name } satisfies FolderCreateRequest),
  });
  const payload = (await response.json()) as Partial<FolderCreateResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || typeof payload.path !== "string") throw new Error(payload.error ?? `request failed (${response.status})`);
  return { path: payload.path };
}

/** Asks the Host where choosing a folder can start. */
async function folderPlaces(): Promise<FolderPlace[]> {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/folder-places`);
  const payload = (await response.json()) as Partial<FolderPlacesResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || !Array.isArray(payload.places)) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload.places;
}
