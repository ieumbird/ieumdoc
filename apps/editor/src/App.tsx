import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { DocumentEditorHandle } from "./DocumentEditor.tsx";
import { DocumentTab } from "./DocumentTab.tsx";
import { DocumentTabs } from "./shell/DocumentTabs.tsx";
import { activeAfterClose, allTabsPendingWork, openedTab } from "./document-tabs.ts";
import { type DocumentSession } from "./useDocumentSession.ts";
import { messageOf, NativeOpenError, requestDocument } from "./document-session.ts";
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
  DocumentFileResponse,
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

type Tab = { id: string; path: string; file: DocumentFileResponse };

/** The Desktop app's bridge; the browser Editor has none and shows no Desktop UI. */
const desktop = typeof window === "undefined" ? undefined : window.ieumdocDesktop;

export function App() {
  const newFileButton = useRef<HTMLButtonElement>(null);
  const newFolderButton = useRef<HTMLButtonElement>(null);
  // Open folder… returns focus to the control that opened it.
  const dialogReturnFocus = useRef<HTMLElement | null>(null);
  // Retain Host start information when the last tab closes.
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
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sessions = useRef(new Map<string, DocumentSession>());
  const [, refreshShell] = useReducer(value => value + 1, 0);
  const reportSession = useCallback((id: string, next: DocumentSession | null) => {
    if (next) sessions.current.set(id, next);
    else sessions.current.delete(id);
    refreshShell();
  }, []);
  const nextId = useRef(0);
  const scrollPositions = useRef(new Map<string, number>());
  const previousActive = useRef<string | null>(null);
  const focusAfterClose = useRef(false);
  const [operation, setOperation] = useState("Loading…");
  const operationRef = useRef(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [openRefusal, setOpenRefusal] = useState<{ path: string; reason: string; action: string } | null>(null);
  const openRefusalReturnFocus = useRef<HTMLElement | null>(null);
  const [continuation, setContinuation] = useState<{ id: string; session: DocumentSession } | null>(null);
  const [continuationPending, setContinuationPending] = useState(false);
  const continuationRunning = useRef(false);
  const continuationReturnFocus = useRef<HTMLElement | null>(null);
  const emptyEditorRef = useRef<DocumentEditorHandle>(null);
  const emptyImageRef = useRef<HTMLElement | null>(null);
  const session = activeId ? sessions.current.get(activeId) : undefined;
  const {
    editorRef = emptyEditorRef, document, openedPath = "", headingNumbering = false, outlineStore,
    view = "visual", status: sessionStatus = "Ready", error: sessionError = "", notice: sessionNotice = "",
    draftActive = false, assetPending = false, documentDirty = false, draftNotice = "", documentNotice = "",
    reloadDialog = false, imageChoice = null, imageReturnFocus = emptyImageRef,
  } = session ?? {};
  const busy = Boolean(operation || session?.busy || continuationPending);
  const switching = Boolean(operation || session?.switching);
  const status = operation || sessionStatus;
  const save = () => session?.save();
  const showSource = () => session?.showSource();
  const setView = (next: "visual" | "source") => session?.setView(next);
  const reload = () => session?.reload();
  const reloadFromDisk = () => session?.reloadFromDisk();
  const setReloadDialog = (open: boolean) => session?.setReloadDialog(open);
  const closeImageChoice = () => session?.closeImageChoice();
  const selectImage = async (source: string) => session ? session.selectImage(source) : "";

  function activateTab(id: string): void {
    if (id === activeId || operationRef.current || session?.busyRef.current || continuation) return;
    if (activeId) scrollPositions.current.set(activeId, window.scrollY);
    setActiveId(id);
    setError("");
    setNotice("");
  }
  useLayoutEffect(() => {
    if (previousActive.current !== activeId) {
      window.scrollTo(0, activeId ? scrollPositions.current.get(activeId) ?? 0 : 0);
      previousActive.current = activeId;
    }
    if (focusAfterClose.current) {
      focusAfterClose.current = false;
      const target = activeId ? globalThis.document.getElementById(`tab-${activeId}`)
        : globalThis.document.querySelector<HTMLElement>('[data-testid="document-start"] button');
      target?.focus({ preventScroll: true });
    }
  }, [activeId, tabs.length]);

  function acceptFile(file: DocumentFileResponse): void {
    const existing = openedTab(tabs, file.path);
    if (activeId) scrollPositions.current.set(activeId, window.scrollY);
    if (existing) setActiveId(existing.id);
    else {
      const id = `document-${++nextId.current}`;
      setTabs(previous => [...previous, { id, path: file.path, file }]);
      setActiveId(id);
    }
  }
  useEffect(() => {
    let current = true;
    void requestDocument("GET").then(next => {
      if (!current) return;
      if ("start" in next) { setStart(next); setAllowedRoots(next.allowedRoots); }
      else { setStart({ start: true }); acceptFile(next); }
    }).catch(cause => { if (current) setError(messageOf(cause)); }).finally(() => {
      if (current) { operationRef.current = false; setOperation(""); }
    });
    return () => { current = false; };
  }, []);

  function removeTab(id: string): void {
    const next = activeAfterClose(tabs, activeId, id);
    scrollPositions.current.delete(id);
    sessions.current.delete(id);
    focusAfterClose.current = true;
    setTabs(previous => previous.filter(tab => tab.id !== id));
    setActiveId(next);
  }
  function closeTab(id: string): void {
    const owner = sessions.current.get(id);
    if (!owner || busy || owner.busyRef.current || continuation) return;
    if (owner.editorRef.current?.hasUnsavedChanges()) {
      continuationReturnFocus.current = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null;
      setContinuation({ id, session: owner });
    } else removeTab(id);
  }
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
    if (operationRef.current || busy || continuation) return "Wait for the current operation to finish.";
    const existing = openedTab(tabs, requestedPath);
    if (existing) {
      activateTab(existing.id);
      setError("");
      setNotice(openedNotice);
      return "";
    }
    const returnFocus = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null;
    operationRef.current = true;
    setOperation("Opening…");
    setError("");
    try {
      const next = await requestDocument("GET", requestedPath);
      if ("start" in next) throw new Error("The Host did not return a document.");
      acceptFile(next);
      setNotice(openedNotice);
      return "";
    } catch (cause) {
      if (cause instanceof NativeOpenError) {
        openRefusalReturnFocus.current = returnFocus;
        setOpenRefusal({ path: requestedPath, reason: cause.reason, action: cause.action });
        return null;
      }
      return messageOf(cause);
    } finally { operationRef.current = false; setOperation(""); }
  }
  async function createFile(path: string): Promise<string> {
    if (operationRef.current || busy || continuation) return "Wait for the current operation to finish.";
    operationRef.current = true;
    setOperation("Creating…");
    setError("");
    setNotice("");
    try {
      acceptFile(await requestDocument("PUT", path));
      return "";
    } catch (cause) { const message = messageOf(cause); setError(message); return message; }
    finally { operationRef.current = false; setOperation(""); }
  }
  function newFile(): void {
    if (!folderTree.state) return;
    if (busy || continuation) { setError("Wait for the current operation to finish."); return; }
    setNewDirectory(folderChain(folderTree.state.root, openedPath).at(-1) ?? folderTree.state.root);
    setNewDialog(true);
  }
  async function continueSession(shouldSave: boolean): Promise<void> {
    if (!continuation || continuationRunning.current || busy) return;
    const owner = sessions.current.get(continuation.id);
    if (!owner || !owner.isCurrent()) return;
    continuationRunning.current = true;
    setContinuationPending(true);
    try {
      if (shouldSave && !await owner.save()) {
        if (continuation.id !== activeId) setError(`Could not save “${splitDocumentPath(owner.openedPath).name}”. The tab remains open; select it to review the error.`);
        return;
      }
      if (!owner.isCurrent()) return;
      // Save acknowledges its snapshot, not newer applied transactions. Draft loss was explicit.
      if (shouldSave && owner.editorRef.current?.hasDocumentChanges() !== false) {
        owner.setStatus("Saved; newer edits pending");
        if (continuation.id !== activeId) setNotice(`“${splitDocumentPath(owner.openedPath).name}” stays open because it has newer edits.`);
        return;
      }
      removeTab(continuation.id);
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
    if (message) setError(message);
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
    const reason = allTabsPendingWork(sessions.current.values(), operationRef.current);
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
      if (!allTabsPendingWork(sessions.current.values(), operationRef.current)) return;
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
          {tabs.length > 0 ? <DocumentTabs tabs={tabs.map(tab => ({ ...tab,
            dirty: Boolean(sessions.current.get(tab.id)?.documentDirty || sessions.current.get(tab.id)?.draftActive),
          }))} active={activeId} disabled={busy || Boolean(continuation)} onActivate={activateTab} onClose={closeTab} /> : null}
          <MessageArea
            error={error || sessionError}
            notice={notice || sessionNotice}
            draftNotice={draftNotice}
            documentNotice={documentNotice}
            update={updateNotice}
            onDismissError={() => { setError(""); session?.setError(""); }}
            onNoticeExpired={() => { setNotice(""); session?.setNotice(""); }}
          />
        </div>
        <main className="document-column" onMouseDown={(event) => {
          // The empty area below the document places the caret at its end.
          if (event.button === 0 && event.target === event.currentTarget && view === "visual" &&
            editorRef.current?.focusEnd(event.clientY)) event.preventDefault();
        }}>
          {tabs.length === 0 && start ? (
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
                if (message) setError(message);
              })}
            />
          ) : null}
          {tabs.map(tab => <DocumentTab key={tab.id} id={tab.id} file={tab.file} active={tab.id === activeId} report={reportSession} />)}
        </main>
      </div>
      {panelOpen ? (
        <DocumentPanel
          overlay={panelOverlay}
          outline={document ? outlineStore : undefined}
          onSelectHeading={item => session?.revealHeading(item)}
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
        documentName={splitDocumentPath(continuation?.session.openedPath ?? "").name}
        hasDrafts={continuation?.session.draftActive ?? false}
        finalFocus={() => continuationReturnFocus.current?.isConnected ? continuationReturnFocus.current
          : (activeId ? globalThis.document.getElementById(`tab-${activeId}`) : globalThis.document.querySelector<HTMLElement>('[data-testid="document-start"] button')) ?? true}
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
