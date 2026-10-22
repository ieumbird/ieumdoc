import { UiError } from "./ui-message.ts";
import { useMessageState } from "./ui-message.ts";
import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import { type Operation } from "./operation.ts";
import { newRecoveryId, recoveryStorage, type RecoveryRecord } from "./recovery-storage.ts";
import { prepareRecovery } from "./recovery-restore.ts";
import { RecoveryList, RecoveryPrompt } from "./shell/Recovery.tsx";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import type { DocumentEditorHandle } from "./DocumentEditor.tsx";
import { DocumentTab } from "./DocumentTab.tsx";
import { DocumentTabs } from "./shell/DocumentTabs.tsx";
import { activeAfterClose, allTabsPendingWork, openedTab } from "./document-tabs.ts";
import { type DocumentSession, type DocumentSessionSnapshot } from "./useDocumentSession.ts";
import { messageOf, NativeOpenError, requestDocument } from "./document-session.ts";
import { readDocumentWidth, readOpenFolders, readRecentFolders, rememberRecentFolder, visibleRecentFolders, writeDocumentWidth, writeOpenFolders, type DocumentWidth } from "./preferences.ts";
import { DocumentPanel } from "./shell/DocumentPanel.tsx";
import { DocumentStart } from "./shell/DocumentStart.tsx";
import productMark from "../../desktop/assets/icon.svg?url";
import { MessageArea } from "./shell/MessageArea.tsx";
import { NewDialog, type NewDestination } from "./shell/NewDialog.tsx";
import { FolderDialog } from "./shell/FolderDialog.tsx";
import { SettingsDialog } from "./shell/SettingsDialog.tsx";
import { UnsavedChangesDialog } from "./shell/UnsavedChangesDialog.tsx";
import { Sidebar } from "./shell/Sidebar.tsx";
import { folderChain, knownFolders, useFolderTrees, type FolderTreeState } from "./shell/folder-tree.ts";
import { childPath, documentLocation, splitDocumentPath, unquotePath } from "./shell/document-path.ts";
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
// At phone widths the sidebar is either closed, leaving the document the whole width (the TopBar
// opens it), or open over the whole screen; it never leaves the document a sliver of width (#321).
const SIDEBAR_OVERLAY_LAYOUT = "(width < 40rem)";

type Tab = { id: string; path: string; file: DocumentFileResponse; recoveryId: string; restored?: DocumentSessionSnapshot };

/** The Desktop app's bridge; the browser Editor has none and shows no Desktop UI. */
const desktop = typeof window === "undefined" ? undefined : window.ieumdocDesktop;

export function App() {
  useTranslation();
  const newFileButton = useRef<HTMLButtonElement>(null);
  const newFolderButton = useRef<HTMLButtonElement>(null);
  // Open folder… returns focus to the control that opened it.
  const dialogReturnFocus = useRef<HTMLElement | null>(null);
  // Retain Host start information when the last tab closes.
  const [start, setStart] = useState<DocumentStartResponse | null>(null);
  const [sidebarOverlay, setSidebarOverlay] = useState(() => globalThis.matchMedia?.(SIDEBAR_OVERLAY_LAYOUT).matches ?? false);
  const [sidebarOpen, setSidebarOpen] = useState(!sidebarOverlay);
  // Full-screen open/close hides the control that was used, so focus moves to the one that remains.
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const openSidebarButton = useRef<HTMLButtonElement>(null);
  const sidebarFocus = useRef<"sidebar" | "top-bar" | null>(null);
  useLayoutEffect(() => {
    const target = sidebarFocus.current === "sidebar" ? sidebarToggle.current : sidebarFocus.current === "top-bar" ? openSidebarButton.current : null;
    sidebarFocus.current = null;
    target?.focus();
  }, [sidebarOpen]);
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
  const [recoveryRecords, setRecoveryRecords] = useState<RecoveryRecord[]>([]);
  const [recoveryProblem, setRecoveryProblem] = useMessageState("");
  const [recoveryReview, setRecoveryReview] = useState<{ record: RecoveryRecord; reason: string } | null>(null);
  const refreshRecovery = useCallback(async () => {
    try {
      const records = await recoveryStorage.list();
      setRecoveryRecords(records);
      setRecoveryProblem("");
      return records;
    } catch (cause) {
      setRecoveryProblem({ key: "Local recovery is unavailable: {{reason}}. Save or copy your work before closing.", values: { reason: messageOf(cause) } });
      return [];
    }
  }, []);
  function reviewRecovery(record: RecoveryRecord): void {
    let reason = "";
    try { prepareRecovery(record); } catch (cause) { reason = messageOf(cause); }
    setRecoveryReview({ record, reason });
  }
  async function offerRecovery(file: DocumentFileResponse): Promise<void> {
    const records = await refreshRecovery();
    const matching = records.find(record => record.path === file.path && !tabs.some(tab => tab.recoveryId === record.id));
    if (matching) reviewRecovery(matching);
  }
  async function deleteRecovery(id?: string): Promise<void> {
    try { await recoveryStorage.delete(id); await refreshRecovery(); }
    catch (cause) { setRecoveryProblem({ key: "Could not delete local recovery: {{reason}}", values: { reason: messageOf(cause) } }); throw cause; }
  }
  async function restoreRecovery(): Promise<void> {
    if (!recoveryReview) return;
    const record = recoveryReview.record;
    const restored = prepareRecovery(record);
    const existing = openedTab(tabs, record.path);
    const owner = existing && sessions.current.get(existing.id);
    if (owner && (owner.busyRef.current || owner.editorRef.current?.hasUnsavedChanges())) {
      throw new UiError({ key: "This document already has open work. Close its tab before restoring a recovery record." });
    }
    const recoveryId = newRecoveryId();
    await recoveryStorage.restore(record, recoveryId);
    const id = `document-${++nextId.current}`;
    setTabs(previous => [...previous.filter(tab => tab.id !== existing?.id), { id, path: record.path, file: restored.file, recoveryId, restored }]);
    setActiveId(id);
    setRecoveryReview(null);
    await refreshRecovery();
  }
  useEffect(() => {
    void refreshRecovery();
    const focused = () => { void refreshRecovery(); };
    window.addEventListener("focus", focused);
    return () => window.removeEventListener("focus", focused);
  }, [refreshRecovery, tabs.length]);
  const nextId = useRef(0);
  const scrollPositions = useRef(new Map<string, number>());
  const previousActive = useRef<string | null>(null);
  const focusAfterClose = useRef(false);
  const [operation, setOperation] = useState<Operation | "">("loading");
  const operationRef = useRef(true);
  const [error, setError] = useMessageState("");
  const [notice, setNotice] = useMessageState("");
  const [openRefusal, setOpenRefusal] = useState<{ path: string; reason: string; action: string; code?: string } | null>(null);
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
    view = "visual", status: sessionStatus = "ready", error: sessionError = "", notice: sessionNotice = "",
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
      const recoveryId = newRecoveryId();
      setTabs(previous => [...previous, { id, path: file.path, file, recoveryId }]);
      setActiveId(id);
    }
  }
  useEffect(() => {
    let current = true;
    void requestDocument("GET").then(next => {
      if (!current) return;
      if ("start" in next) { setStart(next); setAllowedRoots(next.allowedRoots); }
      else { setStart({ start: true }); acceptFile(next); void offerRecovery(next); }
    }).catch(cause => { if (current) setError(cause instanceof Error ? cause : String(cause)); }).finally(() => {
      if (current) { operationRef.current = false; setOperation(""); }
    });
    return () => { current = false; };
  }, []);

  function removeTab(id: string): void {
    const next = activeAfterClose(tabs, activeId, id);
    scrollPositions.current.delete(id);
    void sessions.current.get(id)?.discardRecovery()?.then(deleted => {
      if (!deleted) setError({ key: "The tab closed, but its local recovery record could not be deleted. Review it on the start screen and try Delete record again." });
    });
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
  // The folders the user opened, each a lazily listed tree; only their paths are remembered, never watched.
  const folders = useFolderTrees(requestFolder, setError);
  // Reopen the remembered folders in order. One the Host no longer lists (moved, removed or outside
  // its roots) is left out quietly. Restoring never writes: only the user's Open and Close do.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const root of readOpenFolders()) {
        try {
          const listed = await requestFolder(root);
          if (!cancelled) folders.open(listed, "");
        } catch { /* Left out; see above. */ }
      }
    })();
    return () => { cancelled = true; };
  }, []);
  function closeFolder(root: string): void {
    folders.close(root);
    writeOpenFolders(folders.roots.filter(item => item !== root));
  }
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

  // Likewise, crossing the overlay width starts the sidebar collapsed (narrow) or expanded.
  useEffect(() => {
    const query = matchMedia(SIDEBAR_OVERLAY_LAYOUT);
    const change = () => {
      setSidebarOverlay(query.matches);
      setSidebarOpen(!query.matches);
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  async function openFile(path: string, openedNotice = ""): Promise<string | null> {
    const requestedPath = unquotePath(path);
    if (!requestedPath) return i18n.t("Enter a Markdown file path.");
    if (!requestedPath.toLowerCase().endsWith(".md")) return i18n.t("Only .md files can be opened.");
    if (operationRef.current || busy || continuation) return i18n.t("Wait for the current operation to finish.");
    const existing = openedTab(tabs, requestedPath);
    if (existing) {
      activateTab(existing.id);
      setError("");
      setNotice(openedNotice);
      return "";
    }
    const returnFocus = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null;
    operationRef.current = true;
    setOperation("opening");
    setError("");
    try {
      const next = await requestDocument("GET", requestedPath, folders.rootOf(requestedPath));
      if ("start" in next) throw new UiError({ key: "The Host did not return a document." });
      acceptFile(next);
      void offerRecovery(next);
      setNotice(openedNotice);
      return "";
    } catch (cause) {
      if (cause instanceof NativeOpenError) {
        openRefusalReturnFocus.current = returnFocus;
        setOpenRefusal({ path: requestedPath, reason: cause.reason, action: cause.action, code: cause.code });
        return null;
      }
      return messageOf(cause);
    } finally { operationRef.current = false; setOperation(""); }
  }
  async function createFile(path: string): Promise<string> {
    if (operationRef.current || busy || continuation) return i18n.t("Wait for the current operation to finish.");
    operationRef.current = true;
    setOperation("creating");
    setError("");
    setNotice("");
    try {
      acceptFile(await requestDocument("PUT", path, folders.rootOf(path)));
      // A full-screen sidebar steps aside for the new document, as for an opened one.
      if (sidebarOverlay) setSidebarOpen(false);
      return "";
    } catch (cause) { const message = messageOf(cause); setError(message); return message; }
    finally { operationRef.current = false; setOperation(""); }
  }
  /** New in an opened folder starts at the open document's folder when it is inside, else at the folder. */
  function newDirectoryIn(root: string): string {
    return folderChain(root, openedPath).at(-1) ?? root;
  }
  function newFile(root: string): void {
    if (busy || continuation) { setError({ key: "Wait for the current operation to finish." }); return; }
    setNewDirectory(newDirectoryIn(root));
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
        if (continuation.id !== activeId) setError({ key: "Could not save “{{name}}”. The tab remains open; select it to review the error.", values: { name: splitDocumentPath(owner.openedPath).name } });
        return;
      }
      if (!owner.isCurrent()) return;
      // Save acknowledges its snapshot, not newer applied transactions. Draft loss was explicit.
      if (shouldSave && owner.editorRef.current?.hasDocumentChanges() !== false) {
        owner.setStatus("saved-pending");
        if (continuation.id !== activeId) setNotice({ key: "“{{name}}” stays open because it has newer edits.", values: { name: splitDocumentPath(owner.openedPath).name } });
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
    if (!root) return i18n.t("Enter a folder path.");
    try {
      const listed = await requestFolder(root);
      folders.open(listed, openedPath);
      writeOpenFolders(folders.roots.includes(listed.root) ? folders.roots : [...folders.roots, listed.root]);
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
    if (openedPath) folders.reveal(openedPath);
  }, [openedPath]);

  // Ctrl/Cmd+S is the Save button: same path, same messages. The browser's own page save
  // never applies. Modal dialogs cover the Save button, so the shortcut waits for them too.
  const saveShortcut = useRef<(event: KeyboardEvent) => void>(() => {});
  saveShortcut.current = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey ||
        (event.key.toLowerCase() !== "s" && event.code !== "KeyS")) return;
    event.preventDefault();
    if (globalThis.document.querySelector('[data-slot="dialog-content"]') || folderDialog || newDialog || newFolderDialog || reloadDialog || openRefusal || continuation || recoveryReview || settingsOpen) return;
    void save();
  };
  useEffect(() => {
    // Capture, so inputs inside node views (Equation, Figure, code language) cannot swallow it.
    const listener = (event: KeyboardEvent) => saveShortcut.current(event);
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  const restartCheck = useRef<() => RestartCheck>(() => ({ ok: false, reason: i18n.t("The editor is not ready.") }));
  restartCheck.current = () => {
    const reason = allTabsPendingWork(sessions.current.values(), operationRef.current);
    return reason ? { ok: false, reason } : { ok: true };
  };
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void desktop.info().then((info) => { if (active) setDesktopInfo(info); })
      .catch((cause: unknown) => { if (active) setError({ key: "Desktop settings unavailable: {{reason}}", values: { reason: messageOf(cause) } }); });
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
    void desktop?.postponeUpdate(version).catch((cause: unknown) => setError(cause instanceof Error ? cause : String(cause)));
  }

  const update = desktopInfo?.update;
  const updateNotice = update && (update.phase === "available" || update.phase === "downloaded") && update.version !== desktopInfo?.postponed
    ? update.phase === "available"
      ? { text: i18n.t("IeumDoc {{version}}{{channel}} is available.", { version: update.version, channel: update.prerelease ? i18n.t(" (Beta)") : "" }), action: i18n.t("View"), onAction: () => {
          settingsReturnFocus.current = null;
          setSettingsOpen(true);
        }, onLater: () => postponeUpdate(update.version) }
      : { text: i18n.t("IeumDoc {{version}} is ready to install.", { version: update.version }), action: i18n.t("Restart to update"),
          onAction: () => void installUpdate().then((reason) => { if (reason) setError(reason); })
            .catch((cause: unknown) => setError(cause instanceof Error ? cause : String(cause))), onLater: () => postponeUpdate(update.version) }
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

  /** Browsers expose the Clipboard API only on secure (HTTPS or local) pages; elsewhere, say so. */
  async function copyPath(): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      setError({ key: "Copy path needs clipboard access, which this browser allows only on HTTPS or local pages. The full path is in the filename's tooltip." });
      return;
    }
    try {
      await navigator.clipboard.writeText(openedPath);
      setNotice({ key: "Copied the file path." });
    } catch (cause) {
      setError({ key: "Could not copy the file path: {{reason}}", values: { reason: messageOf(cause) } });
    }
  }

  function toggleDocumentWidth(): void {
    const next = documentWidth === "wide" ? "standard" : "wide";
    setDocumentWidth(next);
    writeDocumentWidth(next);
  }

  return (
    <div ref={shell} className={`app-shell${sidebarOpen ? "" : " app-shell--collapsed"}${sidebarOverlay ? " app-shell--sidebar-overlay" : ""}${panelOpen ? "" : " app-shell--panel-closed"}${documentWidth === "wide" ? " app-shell--wide" : ""}`}>
      <Sidebar
        open={sidebarOpen}
        documentPath={openedPath}
        display={{
          headingNumbering,
          onToggleHeadingNumbering: () => editorRef.current?.toggleHeadingNumbering(),
          numberingDisabled: !document || busy || view !== "visual",
          numberingHint: !document ? i18n.t("Open a document to change numbering.") : busy ? i18n.t("Wait for the current operation to finish.")
            : view !== "visual" ? i18n.t("Switch to Visual to change heading numbering.") : undefined,
          wide: documentWidth === "wide",
          onToggleWide: toggleDocumentWidth,
        }}
        toggleRef={sidebarToggle}
        onToggle={() => {
          if (sidebarOverlay && sidebarOpen) sidebarFocus.current = "top-bar";
          setSidebarOpen((value) => !value);
        }}
        onDismiss={sidebarOverlay ? () => { sidebarFocus.current = "top-bar"; setSidebarOpen(false); } : undefined}
        onOpenFolder={(returnFocus) => {
          dialogReturnFocus.current = returnFocus;
          setFolderDialog(true);
        }}
        recent={visibleRecent}
        onOpenRecent={(folder) => void openFolder(folder).then((message) => { if (message) setError(message); })}
        onNew={(root, button) => {
          newFileButton.current = button;
          newFile(root);
        }}
        onNewFolder={(root, button) => {
          newFolderButton.current = button;
          setNewDirectory(newDirectoryIn(root));
          setNewFolderDialog(true);
        }}
        folders={folders.trees}
        onToggleFolder={folders.toggle}
        onOpenDocument={(path) => {
          // An overlaid sidebar steps aside for the document it opens.
          if (sidebarOverlay) setSidebarOpen(false);
          void openFolderDocument(path);
        }}
        onCloseFolder={closeFolder}
        onSettings={(returnFocus) => {
          settingsReturnFocus.current = returnFocus;
          setSettingsOpen(true);
          void refreshRecovery();
        }}
      />
      <div className="app-main">
        <div className="app-header" ref={header}>
          <TopBar
            onOpenSidebar={sidebarOverlay && !sidebarOpen ? () => { sidebarFocus.current = "sidebar"; setSidebarOpen(true); } : undefined}
            openSidebarRef={openSidebarButton}
            documentPath={openedPath}
            location={documentLocation(openedPath, folders.rootOf(openedPath))}
            status={assetPending ? "adding-image" : status}
            unsaved={documentDirty || draftActive}
            view={view}
            viewDisabled={!document || busy}
            onViewChange={(next) => (next === "source" ? void showSource() : setView("visual"))}
            saveDisabled={!document || busy}
            onSave={() => void save()}
            onReload={() => void reload()}
            reloadDisabled={!document || busy}
            onCopyPath={() => void copyPath()}
            fileActionsRef={fileActionsToggle}
            outline={panelOpen}
            onToggleOutline={() => setPanelOpen((value) => !value)}
            outlineToggleRef={outlineToggle}
          />
          {tabs.length > 0 ? <DocumentTabs tabs={tabs.map(tab => ({ ...tab,
            dirty: Boolean(sessions.current.get(tab.id)?.documentDirty || sessions.current.get(tab.id)?.draftActive),
          }))} active={activeId} disabled={busy || Boolean(continuation)} onActivate={activateTab} onClose={closeTab} /> : null}
          <MessageArea
            warning={recoveryProblem || [...sessions.current.values()].map(owner => owner.recoveryError).find(Boolean) || ""}
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
              mark={productMark}
              recovery={<RecoveryList records={recoveryRecords.filter(record => !tabs.some(tab => tab.recoveryId === record.id))} unavailable={Boolean(recoveryProblem)} onReview={reviewRecovery} />}
              recent={visibleRecent}
              sample={start.sample}
              busy={busy}
              onOpenFolder={(returnFocus) => {
                dialogReturnFocus.current = returnFocus;
                setFolderDialog(true);
              }}
              onOpenRecent={(folder) => void openFolder(folder).then((message) => { if (message) setError(message); })}
              onOpenSample={(sample) => void openFile(sample, i18n.t("This is the sample document, a copy in IeumDoc's app data.")).then((message) => {
                if (message) setError(message);
              })}
            />
          ) : null}
          {tabs.map(tab => <DocumentTab key={tab.id} id={tab.id} file={tab.file} restored={tab.restored} recoveryId={tab.recoveryId} active={tab.id === activeId} report={reportSession} />)}
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
      <SettingsDialog
          open={settingsOpen}
          recoveryCount={recoveryRecords.length}
          recoveryProblem={recoveryProblem}
          onClearRecovery={() => deleteRecovery()}
          desktop={desktop}
          info={desktopInfo}
          onInfo={setDesktopInfo}
          onInstall={installUpdate}
          returnFocus={settingsReturnFocus}
          onClose={() => setSettingsOpen(false)}
        />
      <RecoveryPrompt key={recoveryReview?.record.id ?? "closed"} record={recoveryReview?.record ?? null} reason={recoveryReview?.reason ?? ""}
        onRestore={restoreRecovery} onDelete={async () => { if (recoveryReview) await deleteRecovery(recoveryReview.record.id); setRecoveryReview(null); }}
        onClose={() => setRecoveryReview(null)} />
      <FolderDialog
        open={folderDialog}
        initialPath={folders.rootOf(openedPath) ?? folders.roots.at(-1) ?? splitDocumentPath(openedPath).directory}
        recent={visibleRecent}
        restricted={allowedRoots !== undefined}
        browse={browseHostFolder}
        places={folderPlaces}
        onOpen={openFolder}
        onCreateFolder={async (parent, name) => {
          const message = await createFolder(parent, name);
          // Creating while choosing changes no expansion; an already listed folder shows it.
          if (!message) folders.refresh(parent);
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
        destinations={folders.trees.flatMap(newDestinations)}
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
        destinations={folders.trees.flatMap(newDestinations)}
        directory={newDirectory}
        busy={false}
        onCreate={async (directory, name) => {
          const message = await createFolder(directory, name);
          if (!message) folders.reveal(childPath(directory, name));
          return message;
        }}
        returnFocus={newFolderButton}
        onClose={() => setNewFolderDialog(false)}
      />
      <Dialog open={openRefusal !== null} onOpenChange={(open) => { if (!open) setOpenRefusal(null); }}>
        <DialogContent showCloseButton={false} finalFocus={openRefusalReturnFocus}>
          <DialogHeader>
            <DialogTitle>{i18n.t("Cannot open document")}</DialogTitle>
            <DialogDescription render={<div />} className="grid gap-4 break-words">
              <p>{i18n.t("“{{name}}” is not a supported IeumDoc document.", { name: openRefusal ? splitDocumentPath(openRefusal.path).name : "" })}</p>
              {/* In plain words first; Core's exact reason and action follow as the details. */}
              {openRefusal?.code === "native-marker" ? (
                <p>{i18n.t("IeumDoc edits only documents it created. To edit this text here, create a new document with + in the sidebar and paste it in. The file itself is left as it is.")}</p>
              ) : null}
              <div className="open-refusal-details">
                <p>{i18n.t("Technical details")}</p>
                <p>{openRefusal?.reason}</p>
                <p>{openRefusal?.action}</p>
              </div>
              <p>{document ? i18n.t("Your current document has not changed.") : i18n.t("No document was opened.")}</p>
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
            <DialogTitle>{switching ? i18n.t("Reloading…") : i18n.t("Discard local changes?")}</DialogTitle>
            <DialogDescription>{i18n.t("Reload replaces your unsaved changes and unapplied drafts with the file on disk. Keep editing to preserve them. Source lets you copy applied content first.")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="sm" disabled={switching} onClick={() => setReloadDialog(false)}>{i18n.t("Keep editing")}</Button>
            <Button variant="destructive" size="sm" disabled={switching} onClick={() => void reloadFromDisk()}>{i18n.t("Discard and reload")}</Button>
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
