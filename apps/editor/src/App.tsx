import { SaveContentError } from "../shared/save-error.ts";
import { saveErrorMessage } from "./save-error.ts";
import { useEffect, useRef, useState } from "react";
import type { EditableBlock, EditableDocument, FigureContent } from "@ieumdoc/core";
import { DocumentEditor, type DocumentEditorHandle } from "./DocumentEditor.tsx";
import type { ImageChoice, ImageChooser } from "./editor-schema.tsx";
import { chooseHostImage, rollbackAsset } from "./image-assets.ts";
import { createOutlineStore, type OutlineItem } from "./outline.ts";
import { readDocumentWidth, readRecentFolders, rememberRecentFolder, visibleRecentFolders, writeDocumentWidth, type DocumentWidth } from "./preferences.ts";
import { DocumentPanel } from "./shell/DocumentPanel.tsx";
import { DocumentStart } from "./shell/DocumentStart.tsx";
import { MessageArea } from "./shell/MessageArea.tsx";
import { NewDialog, type NewDestination } from "./shell/NewDialog.tsx";
import { FolderDialog } from "./shell/FolderDialog.tsx";
import { SettingsDialog } from "./shell/SettingsDialog.tsx";
import { Sidebar } from "./shell/Sidebar.tsx";
import { folderChain, knownFolders, useFolderTree, type FolderTreeState } from "./shell/folder-tree.ts";
import { childPath, splitDocumentPath, unquotePath } from "./shell/document-path.ts";
import { TopBar, type DocumentView } from "./shell/TopBar.tsx";
import { collectSupportedEdits, type TiptapJSON } from "./tiptap-document.ts";
import type {
  DocumentFileResponse,
  SaveResponse,
  SourceResponse,
  DocumentErrorResponse,
  DocumentStartResponse,
  FolderBrowseResponse,
  FolderCreateRequest,
  FolderCreateResponse,
  FolderPlace,
  FolderPlacesResponse,
  FolderResponse,
  SupportedEdits,
  SaveRequest,
} from "../shared/document-protocol.ts";
import type { DesktopInfo, RestartCheck } from "../shared/desktop-bridge.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

// Below the docking width of styles.css the Document panel starts closed and overlays the
// document; at and above it the panel docks. Independent of the narrow sidebar (64rem).
const PANEL_OVERLAY_LAYOUT = "(width < 80rem)";


/** The Desktop app's bridge; the browser Editor has none and shows no Desktop UI. */
const desktop = typeof window === "undefined" ? undefined : window.ieumdocDesktop;

/** Shown until the first Save of a source whose endnote definitions canonical write moves. */
const ENDNOTES_MOVE_NOTICE = "Save moves this file's endnote definitions after the body, in the order of their first reference, keeping each label and text. Source shows the Markdown Save writes.";

export function App() {
  const editorRef = useRef<DocumentEditorHandle>(null);
  const newFileButton = useRef<HTMLButtonElement>(null);
  const newFolderButton = useRef<HTMLButtonElement>(null);
  // Open folder… returns focus to the control that opened it.
  const dialogReturnFocus = useRef<HTMLElement | null>(null);
  const [document, setDocument] = useState<EditableDocument | null>(null);
  // Set when the Host opened no document at start; cleared once one opens.
  const [start, setStart] = useState<DocumentStartResponse | null>(null);
  const [sourceRevision, setSourceRevision] = useState("");
  const sessionBase = useRef<SaveRequest["base"] | undefined>(undefined);
  const [openedPath, setOpenedPath] = useState("");
  const [headingNumbering, setHeadingNumbering] = useState(false);
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
  // A Figure's Choose… opens the image picker; its promise settles when the picker closes.
  const [imageChoice, setImageChoice] = useState<{ documentPath: string; resolve(choice?: ImageChoice): void } | null>(null);
  const imageReturnFocus = useRef<HTMLElement | null>(null);
  const chooseImage = useRef<ImageChooser>((documentPath, returnFocus) => new Promise(resolve => {
    imageReturnFocus.current = returnFocus.current;
    setImageChoice({ documentPath, resolve });
  })).current;
  const [recentFolders, setRecentFolders] = useState(readRecentFolders);
  const [allowedRoots, setAllowedRoots] = useState<string[] | undefined>(undefined);
  const visibleRecent = visibleRecentFolders(recentFolders, allowedRoots);
  const [newDialog, setNewDialog] = useState(false);
  const [newDirectory, setNewDirectory] = useState("");
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [reloadDialog, setReloadDialog] = useState(false);
  const [openRefusal, setOpenRefusal] = useState<{ path: string; reason: string; action: string } | null>(null);
  const openRefusalReturnFocus = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // The folder the user chose for this page session, as a lazily listed tree; never stored or watched.
  const folderTree = useFolderTree(requestFolder, setError);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [draftActive, setDraftActive] = useState(false);
  const [assetPending, setAssetPending] = useState(false);
  const [documentDirty, setDocumentDirty] = useState(false);
  // Outline changes on scrolling re-render the outline only, never the App and its editor.
  const outlineStore = useRef(createOutlineStore()).current;
  // The opened source writes endnote definitions elsewhere than canonical write puts them; the
  // first Save moves them. Opening never writes and does not make the document dirty.
  const [endnotesMove, setEndnotesMove] = useState(false);
  const draftNotice = draftActive
    ? "Save and Source include applied content only. Block property drafts remain unsaved until Apply."
    : "";
  const [view, setView] = useState<DocumentView>("visual");
  const [sourceMarkdown, setSourceMarkdown] = useState("");
  const [sourcePending, setSourcePending] = useState(false);
  const [desktopInfo, setDesktopInfo] = useState<DesktopInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsReturnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void load();
  }, []);

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

  // A pending Source preview belongs to the open document, so it blocks document switches too.
  const busy = status === "Loading…" || status === "Opening…" || status === "Creating…" || status === "Saving…" ||
    sourcePending || assetPending;
  // A close can arrive after the rendered status changed but before passive effects ran.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const switching = status === "Loading…" || status === "Opening…" || status === "Creating…";

  /** Resolves to an error message, "" on success, or null for an Open refusal shown in the dialog. */
  async function load(requestedPath?: string, openReturnFocus?: HTMLElement | null): Promise<string | null> {
    setError("");
    setNotice("");
    setStatus(requestedPath ? "Opening…" : "Loading…");
    try {
      const next = await requestDocument("GET", requestedPath);
      if ("start" in next) {
        setAllowedRoots(next.allowedRoots);
        setStart(next);
        setStatus("Ready");
        return "";
      }
      setStart(null);
      setDocument(next.document);
      sessionBase.current = { source: next.source };
      setEndnotesMove(!next.endnotesInPlace);
      setSourceRevision(next.revision);
      setOpenedPath(next.path);
      setEditorGeneration((value) => value + 1);
      setDraftActive(false);
      setView("visual");
      setStatus("Ready");
      return "";
    } catch (cause) {
      const message = messageOf(cause);
      if (!requestedPath) setError(message);
      setStatus(requestedPath ? "Open failed" : "Load failed");
      // Only explicit Open uses the Alert. Startup and Reload keep their existing errors.
      if (requestedPath && openReturnFocus !== undefined && cause instanceof NativeOpenError) {
        openRefusalReturnFocus.current = openReturnFocus;
        setOpenRefusal({ path: requestedPath, reason: cause.reason, action: cause.action });
        return null;
      }
      return message;
    }
  }

  async function openFile(path: string): Promise<string | null> {
    const requestedPath = unquotePath(path);
    if (!requestedPath) return "Enter a Markdown file path.";
    if (!requestedPath.toLowerCase().endsWith(".md")) return "Only .md files can be opened.";
    if (busy) return "Wait for the current operation to finish.";
    if (editorRef.current?.hasUnsavedChanges()) {
      return "Save or discard the current changes before opening another file.";
    }
    return load(requestedPath, globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null);
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

  async function save(): Promise<void> {
    if (!document || !editorRef.current || !openedPath || !sessionBase.current || busy) return;
    setError("");
    setNotice("");
    setStatus("Saving…");
    let submitted: TiptapJSON | undefined;
    let payload: SupportedEdits | undefined;
    try {
      submitted = editorRef.current.beginSave();
      payload = collectSupportedEdits(document, submitted);
      const next = await requestSave({ path: openedPath, revision: sourceRevision, base: sessionBase.current, ...payload });
      setSourceRevision(next.revision);
      setEndnotesMove(false);
      if (sessionBase.current) sessionBase.current.savedEdits = payload;
      editorRef.current?.finishSave(true);
      const hasPendingUserState = editorRef.current?.hasUnsavedChanges() ?? false;
      setStatus(hasPendingUserState ? "Saved; newer edits pending" : "Saved");
    } catch (cause) {
      editorRef.current?.finishSave();
      const failure = cause instanceof SaveContentError ? cause
        : new SaveContentError(messageOf(cause), undefined, { phase: "collect", cause });
      setError(saveErrorMessage(failure, submitted, payload));
      setStatus(cause instanceof SaveConflictError ? "Save conflict" : "Save failed");
    }
  }

  /**
   * Shows the canonical Markdown the current editor state would save as. The Host runs
   * the Save request through Core without writing; any failure keeps the Visual view.
   */
  async function showSource(): Promise<void> {
    if (!document || !editorRef.current || !openedPath || !sessionBase.current || busy) return;
    setError("");
    setSourcePending(true);
    try {
      const payload = collectSupportedEdits(document, editorRef.current.getDocument());
      setSourceMarkdown(await requestSource({ path: openedPath, revision: sourceRevision, base: sessionBase.current, ...payload }));
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
      const next = await requestDocument("PUT", requestedPath);
      setStart(null);
      setDocument(next.document);
      sessionBase.current = { source: next.source };
      setEndnotesMove(!next.endnotesInPlace);
      setSourceRevision(next.revision);
      setOpenedPath(next.path);
      setEditorGeneration((value) => value + 1);
      setDraftActive(false);
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
    if (folderDialog || newDialog || newFolderDialog || reloadDialog || openRefusal) return;
    void save();
  };
  useEffect(() => {
    // Capture, so inputs inside node views (Equation, Figure, code language) cannot swallow it.
    const listener = (event: KeyboardEvent) => saveShortcut.current(event);
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  /**
   * Work an update restart would lose or interrupt, as the Desktop app asks before installing:
   * the same state that guards closing the page, with the reason to show.
   */
  function pendingWork(): string | null {
    // The start has no document, so nothing can be lost unless one is opening.
    if (!document && start) return switching ? "IeumDoc is still working on the document. Try again in a moment." : null;
    if (!document || !editorRef.current) return "The editor is not ready to restart.";
    if (status === "Saving…") return "A save is in progress. Restart to update after it finishes.";
    if (assetPending) return "An image is still being added. Restart to update after it finishes.";
    if (sourcePending || switching) return "IeumDoc is still working on the document. Try again in a moment.";
    if (editorRef.current?.hasUnsavedChanges()) {
      return draftActive ? "Apply or Cancel the open edits and save your changes, then restart to update."
        : "Save your changes, then restart to update.";
    }
    return null;
  }
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
        onNew={() => {
          if (!folderTree.state) return;
          // New starts in the open document's folder when it is inside the chosen one.
          setNewDirectory(folderChain(folderTree.state.root, openedPath).at(-1) ?? folderTree.state.root);
          setNewDialog(true);
        }}
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
            documentNotice={endnotesMove ? ENDNOTES_MOVE_NOTICE : ""}
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
              onOpenSample={(sample) => void openFile(sample).then((message) => {
                if (message) setError(message);
                else if (message === "") setNotice("This is the sample document, a copy in IeumDoc's app data.");
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
                onDraftChange={setDraftActive}
                onAssetPendingChange={setAssetPending}
                onAssetError={setError}
                onDirtyChange={setDocumentDirty}
                onHeadingNumberingChange={setHeadingNumbering}
                onOutlineChange={outlineStore.set}
                validateFigure={validateFigure}
                chooseImage={chooseImage}
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
        onOpen={async (source) => {
          if (!imageChoice) return "";
          const { documentPath, resolve } = imageChoice;
          try {
            const { path, rollbackToken } = await chooseHostImage(documentPath, source);
            // A copy no Figure ends up using is removed; a linked image is never touched.
            const discard = rollbackToken === undefined ? undefined : () => void rollbackAsset({ path, rollbackToken }, documentPath).catch((cause: unknown) =>
              setError(`The unused copied image remains at ${path}: ${cause instanceof Error ? cause.message : String(cause)}`));
            resolve({ path, ...(discard ? { discard } : {}) });
            return "";
          } catch (cause) {
            return cause instanceof Error ? cause.message : String(cause);
          }
        }}
        returnFocus={imageReturnFocus}
        onClose={() => {
          imageChoice?.resolve(undefined);
          setImageChoice(null);
        }}
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

type DocumentResponse = DocumentFileResponse;

/** The Host's Core admission failure, identified by code rather than message text. */
class NativeOpenError extends Error {
  constructor(readonly reason: string, readonly action: string) {
    super(reason);
    this.name = "NativeOpenError";
  }
}

class SaveConflictError extends SaveContentError {
  constructor(message: string) {
    super(message, undefined, { phase: "revision", action: "Copy applied content from Source, or Reload only when you are ready to discard local changes." });
    this.name = "SaveConflictError";
  }
}

function requestDocument(method: "PUT", filePath: string): Promise<DocumentResponse>;
function requestDocument(method: "GET", filePath?: string): Promise<DocumentResponse | DocumentStartResponse>;
async function requestDocument(
  method: "GET" | "PUT",
  filePath?: string,
): Promise<DocumentResponse | DocumentStartResponse> {
  const body = method === "PUT" ? { path: filePath } : undefined;
  const query = method === "GET" && filePath ? `?path=${encodeURIComponent(filePath)}` : "";
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/document${query}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as Partial<DocumentFileResponse> & Partial<DocumentErrorResponse> & Partial<DocumentStartResponse>;
  if (response.status === 409) {
    throw new SaveConflictError(payload.error ?? "Document changed outside the editor. Reload before saving.");
  }
  // Only the first request, which names no document, may start without one.
  if (response.ok && method === "GET" && !filePath && payload.start === true) {
    return { start: true, ...(typeof payload.sample === "string" ? { sample: payload.sample } : {}),
      ...(Array.isArray(payload.allowedRoots) && payload.allowedRoots.every(root => typeof root === "string") ? { allowedRoots: payload.allowedRoots } : {}) };
  }
  if (!response.ok || !payload.document || typeof payload.source !== "string" || typeof payload.revision !== "string" || typeof payload.path !== "string") {
    if (!response.ok && method === "GET" && payload.code?.startsWith("native-")) {
      throw new NativeOpenError(payload.issue?.reason ?? payload.error ?? "Unsupported IeumDoc document.", payload.issue?.action ?? "");
    }
    throw new SaveContentError(payload.error ?? `request failed (${response.status})`, payload.target);
  }
  return {
    path: payload.path,
    document: payload.document,
    revision: payload.revision,
    source: payload.source,
    endnotesInPlace: payload.endnotesInPlace !== false,
  };
}

async function requestSave(body: SaveRequest): Promise<SaveResponse> {
  let response: Response;
  let payload: Partial<SaveResponse> & Partial<DocumentErrorResponse>;
  try {
    response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/document`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    payload = await response.json();
  } catch (cause) {
    throw new SaveContentError("The Host response could not be received or read. The file may already have been saved.", undefined, {
      cause, phase: "transport", action: "Keep your edits. Check the connection to the Host and the disk version before deciding whether to save again or Reload.",
    });
  }
  if (response.status === 409) {
    throw new SaveConflictError(payload?.error ?? "Document changed outside the editor.");
  }
  if (!response.ok) {
    throw new SaveContentError(payload?.error ?? `request failed (${response.status})`, payload?.target ?? payload?.failure?.target, {
      phase: "request", action: "The Host rejected this request. Keep your edits and report this error if the reason does not identify a correction.", ...payload?.failure,
    });
  }
  if (!payload || typeof payload.revision !== "string") {
    throw new SaveContentError("The Host did not return a valid Save acknowledgement. The file may already have been saved.", undefined, {
      phase: "transport", action: "Keep your edits and check the disk version before saving again or Reloading.",
    });
  }
  return { revision: payload.revision };
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

/** Asks the Host for the canonical Markdown a Save request would write. */
async function requestSource(body: SaveRequest): Promise<string> {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/document-source`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
