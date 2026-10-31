import { useDoclingConversion } from "@litzio/docling/server-ui";
import { doclingFailureMessage } from "@litzio/docling/server-types";
import { DoclingConversionDialog } from "./shell/DoclingConversionDialog.tsx";
import { COMMAND_CENTER_SHORTCUT, EDITOR_SHORTCUTS, SAVE_SHORTCUT, isMac } from "./shortcuts.ts";
import { usePluginUi } from "./plugin-ui.tsx";
import { contributionNotices } from "./plugin-ui-registry.ts";
import { PluginTab, type ContributedTab } from "./PluginTab.tsx";
import type { UiHost } from "@litzio/plugin-api/ui";
import { NotificationProvider, NotificationSource } from "./components/ui/notification-center.tsx";
import { UiError } from "./ui-message.ts";
import { useMessageState } from "./ui-message.ts";
import { useTranslation } from "react-i18next";
import { i18n, type MessageKey } from "./i18n.ts";
import { type Operation } from "./operation.ts";
import { newRecoveryId, recoveryStorage, type RecoveryRecord } from "./recovery-storage.ts";
import { prepareRecovery } from "./recovery-restore.ts";
import type { SaveComparison } from "./shell/SaveCompare.tsx";
import { SaveDisplayError } from "./save-error.ts";
import { SaveContentError } from "../shared/save-error.ts";
import { RecoveryList, RecoveryPrompt } from "./shell/Recovery.tsx";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { DocumentEditorHandle } from "./DocumentEditor.tsx";
import { DocumentTab, type EditorSession, type SessionSnapshot } from "./DocumentTab.tsx";
import { documentScrollContainer, scrollDocumentFromShell } from "./document-scroll.ts";
import { DocumentTabs } from "./shell/DocumentTabs.tsx";
import { editorGroups, initialEditorGroups, allTabsPendingWork, openedTab, tabLabels, tabNames } from "./document-tabs.ts";
import { messageOf, NativeOpenError, requestDocument } from "./document-session.ts";
import { THEME_LABELS, THEMES, writeTheme, type ThemePreference, readDocumentWidth, readOpenTabs, readRecentFolders, rememberRecentFolder, visibleRecentFolders, writeDocumentWidth, writeOpenTabs, type DocumentWidth } from "./preferences.ts";
import { applyTheme, currentTheme } from "./theme.ts";
import { DocumentPanel } from "./shell/DocumentPanel.tsx";
import { DocumentStart } from "./shell/DocumentStart.tsx";
import productMark from "../../desktop/assets/icon.svg?url";
import { MessageArea } from "./shell/MessageArea.tsx";
import { NewDialog, type NewDestination } from "./shell/NewDialog.tsx";
import { FolderDialog } from "./shell/FolderDialog.tsx";
import { SettingsDialog, type SettingsCategory } from "./shell/SettingsDialog.tsx";
import { UnsavedChangesDialog } from "./shell/UnsavedChangesDialog.tsx";
import type { FileActionHandler } from "./shell/FileActionDialog.tsx";
import type { ImageRenamer } from "./image-rename.ts";
import { Sidebar } from "./shell/Sidebar.tsx";
import { folderChain, knownFolders, useFolderTrees, type FolderTreeState } from "./shell/folder-tree.ts";
import { childPath, documentLocation, splitDocumentPath, unquotePath } from "./shell/document-path.ts";
import { DocumentActions } from "./shell/DocumentActions.tsx";
import { TopBar } from "./shell/TopBar.tsx";
import appIcon from "../../desktop/assets/icon.svg";
import { CommandCenter } from "./shell/CommandCenter.tsx";
import { KeyboardShortcutsDialog } from "./shell/KeyboardShortcutsDialog.tsx";
import type { CommandCenterItem } from "./shell/command-center.ts";
import { Monitor, Bookmark, Quote, Columns3, Copy, FileDiff, FileText, FileX, FolderOpen, Keyboard, PanelLeft, PanelRight, PanelRightOpen, ArrowLeftRight, RotateCcw, RotateCw, Save, Settings2, SlidersHorizontal, SquareCode, StretchHorizontal } from "lucide-react";
import type {
  DocumentErrorResponse,
  EditorFileResponse,
  DocumentStartResponse,
  FolderBrowseResponse,
  FolderCreateRequest,
  FolderCreateResponse,
  FolderEntry,
  FolderPlace,
  FolderPlacesResponse,
  FolderResponse,
} from "../shared/document-protocol.ts";
import type { DesktopInfo, RestartCheck } from "../shared/desktop-bridge.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";

const SaveCompare = lazy(() => import("./shell/SaveCompare.tsx"));

// Below the docking width of styles.css the Document panel starts closed and overlays the
// document; at and above it the panel docks. Independent of the narrow sidebar (64rem).
const PANEL_OVERLAY_LAYOUT = "(width < 89rem)";
// 640px supported viewport - 200px narrow Explorer; two groups plus their boundary.
const SPLIT_MIN_WIDTH = 440 * 2 + 1;
type Tab = { id: string; path: string; file: EditorFileResponse; recoveryId: string; restored?: SessionSnapshot };

/** The Desktop app's bridge; the browser Editor has none and shows no Desktop UI. */
const desktop = typeof window === "undefined" ? undefined : window.litzioDesktop;

export function App() {
  return <NotificationProvider><EditorApp /></NotificationProvider>;
}

function EditorApp() {
  useTranslation();
  const newFileButton = useRef<HTMLElement | null>(null);
  const newFolderButton = useRef<HTMLButtonElement>(null);
  // Open folder… returns focus to the control that opened it.
  const dialogReturnFocus = useRef<HTMLElement | null>(null);
  // Retain Host start information when the last tab closes.
  const [start, setStart] = useState<DocumentStartResponse | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarToggle = useRef<HTMLButtonElement>(null);
  const sidebarFocus = useRef<"sidebar" | null>(null);
  useLayoutEffect(() => {
    const target = sidebarFocus.current === "sidebar" ? sidebarToggle.current : null;
    sidebarFocus.current = null;
    target?.focus();
  }, [sidebarOpen]);
  const [panelOverlay, setPanelOverlay] = useState(() => globalThis.matchMedia?.(PANEL_OVERLAY_LAYOUT).matches ?? false);
  // Page state only: open when docked, closed (and overlaying when opened) below the docking width.
  const [panelOpen, setPanelOpen] = useState(!panelOverlay);
  // Only explicit docked choices survive layout changes; overlays always start closed.
  const dockedPanelOpen = useRef<boolean | undefined>(undefined);
  const choosePanelOpen = (open: boolean) => {
    if (!panelOverlay) dockedPanelOpen.current = open;
    setPanelOpen(open);
  };
  const outlineToggle = useRef<HTMLButtonElement>(null);
  const fileActionsToggle = useRef<HTMLButtonElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const titlebar = useRef<HTMLDivElement>(null);
  const [documentWidth, setDocumentWidth] = useState<DocumentWidth>(readDocumentWidth);
  const [folderDialog, setFolderDialog] = useState(false);
  const [newAfterFolder, setNewAfterFolder] = useState(false);
  const folderNewReady = useRef(false);
  const [saveComparison, setSaveComparison] = useState<SaveComparison | null>(null);
  const saveComparisonReturnFocus = useRef<HTMLElement | null>(null);
  const [theme, setTheme] = useState(currentTheme);
  const [themeProblem, setThemeProblem] = useState(false);
  const changeTheme = (choice: ThemePreference) => {
    void applyTheme(choice);
    setTheme(choice);
    setThemeProblem(!writeTheme(choice));
  };
  const [commandQuery, setCommandQuery] = useState<string | null>(null);
  const commandReturnFocus = useRef<HTMLElement | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>("appearance");
  const shortcutsReturnFocus = useRef<HTMLElement | null>(null);
  const [commandFileFocus, setCommandFileFocus] = useState<string | null>(null);
  const [folderFocus, setFolderFocus] = useState<string | null>(null);
  const pendingFolderFocus = useRef<string | null>(null);
  // Keep the handoff through finalFocus as well as onClosed: the dialog may call them in either
  // order. Reset only for the next picker, so a late default return cannot steal the tree focus.
  useEffect(() => { if (folderDialog) pendingFolderFocus.current = null; }, [folderDialog]);
  const [recentFolders, setRecentFolders] = useState(readRecentFolders);
  const recentFoldersRef = useRef(recentFolders);
  const [allowedRoots, setAllowedRoots] = useState<string[] | undefined>(undefined);
  const visibleRecent = visibleRecentFolders(recentFolders, allowedRoots);
  const [newDialog, setNewDialog] = useState(false);
  const [newDirectory, setNewDirectory] = useState("");
  const [newFolderDialog, setNewFolderDialog] = useState(false);
  const [fileOperationPending, setFileOperationPending] = useState(false);
  const [figureRenamePending, setFigureRenamePending] = useState(false);
  const renameImageRef = useRef<ImageRenamer | undefined>(undefined);
  const renameImage = useCallback<ImageRenamer>((...args) => renameImageRef.current!(...args), []);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [pluginTabs, setPluginTabs] = useState<ContributedTab[]>([]);
  const [pluginPicker, setPluginPicker] = useState<Parameters<UiHost["pickFolder"]>[0] | null>(null);
  const [pluginActionProblem, setPluginActionProblem] = useState("");
  const converter = useDoclingConversion(import.meta.env.BASE_URL);
  const [conversionOpen, setConversionOpen] = useState(false);
  const [pdfPicker, setPdfPicker] = useState(false);
  const [conversionPath, setConversionPath] = useState("");
  const conversionReturn = useRef<HTMLElement | null>(null);
  const finishedConversion = useRef("");
  const conversionAttempt = useRef(0);
  const currentConversionId = useRef(converter.job?.id); currentConversionId.current = converter.job?.id;
  const [conversionNotice, setConversionNotice] = useState<{ id: string; message: string } | null>(null);

  const compareReturn = useRef<HTMLElement | null>(null);
  const ui = usePluginUi({
    pickFolder: (options, focus) => { compareReturn.current = focus; setPluginPicker(options); },
    openTab: openPluginTab,
    showPdfConversion: focus => {
      conversionReturn.current = focus;
      if (converter.job?.state === "running") { setConversionPath(converter.job.input); setConversionOpen(true); }
      else { setConversionPath(""); setPdfPicker(true); }
    },
  });
  const currentPlugins = useRef(ui.plugins); currentPlugins.current = ui.plugins;
  useEffect(() => {
    const job = converter.job;
    if (!job) return;
    if (job.state === "running") { setConversionNotice(null); return; }
    if (finishedConversion.current === job.id) return;
    const doclingUi = ui.plugins.find(plugin => plugin.id === "docling");
    if (job.state === "success" && ((!ui.observed && !ui.problem) || (doclingUi && !doclingUi.contributions && !doclingUi.error))) return;
    finishedConversion.current = job.id;
    if (job.state === "success") {
      const attempt = conversionAttempt.current;
      const current = () => attempt === conversionAttempt.current && currentConversionId.current === job.id;
      void openComparison(job.output, current).then(problem => {
        if (!current()) return;
        if (problem) setConversionNotice({ id: job.id, message: problem });
        else { setConversionOpen(false); setConversionNotice(null); }
      });
    } else if (job.state === "error") setConversionNotice({ id: job.id, message: `${i18n.t(doclingFailureMessage(job.failure) as MessageKey)}${job.failure?.taskId ? ` (${i18n.t("Server task")}: ${job.failure.taskId})` : ""}` });
  }, [converter.job?.id, converter.job?.state, ui.plugins, ui.observed, ui.problem]);
  const pluginActions = (surface: "commands" | "sidebar") => ui.plugins.flatMap(plugin =>
    (plugin.contributions?.[surface] ?? []).map(action => ({ ...action, id: `${plugin.id}/${action.id}`,
      run: (focus: HTMLElement | null) => {
        try { void Promise.resolve(action.run(focus)).catch(error => setPluginActionProblem(String(error))); }
        catch (error) { setPluginActionProblem(String(error)); }
      },
    })));
  const [navigation, navigate] = useReducer(editorGroups, initialEditorGroups);
  const focusedGroup = navigation.groups.find(group => group.id === navigation.focused)!;
  const activeId = focusedGroup.active;
  const pluginTab = pluginTabs.find(tab => tab.id === activeId);
  const pluginTabLabels = tabLabels(pluginTabs);
  const allTabs = [...tabs, ...pluginTabs.map((tab, index) => ({ ...tab,
    title: `${pluginTabLabels[index]!.folder ?? documentLocation(tab.path)[0]} · ${i18n.t(tab.label as MessageKey)}` }))];
  const split = navigation.groups.length === 2;
  const [canSplit, setCanSplit] = useState(false);
  const splitAvailable = useRef(false);
  const [tabsRestored, setTabsRestored] = useState(false);
  const [rememberVersion, rememberTabs] = useReducer(version => version + 1, 0);
  const serializedTabs = JSON.stringify({ paths: navigation.groups.flatMap(group => group.tabs).flatMap(id => {
    const tab = tabs.find(tab => tab.id === id); return tab ? [tab.path] : [];
  }), activePath: tabs.find(tab => tab.id === activeId)?.path ?? null });
  // Like folder memory, explicit actions remember the live list, even after another tab wrote it.
  // Session reports, Save and restoration alone never write navigation preferences.
  useEffect(() => {
    if (tabsRestored && rememberVersion > 0) writeOpenTabs(JSON.parse(serializedTabs));
  }, [serializedTabs, tabsRestored, rememberVersion]);
  const sessions = useRef(new Map<string, EditorSession>());
  const [, refreshShell] = useReducer(value => value + 1, 0);
  const reportSession = useCallback((id: string, next: EditorSession | null) => {
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
      return null;
    }
  }, []);
  function reviewRecovery(record: RecoveryRecord): void {
    let reason = "";
    try { prepareRecovery(record); } catch (cause) { reason = messageOf(cause); }
    setRecoveryReview({ record, reason });
  }
  async function offerRecovery(file: EditorFileResponse): Promise<void> {
    const records = await refreshRecovery();
    const matching = records?.find(record => record.path === file.path && !tabs.some(tab => tab.recoveryId === record.id));
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
    if (existing) navigate({ type: "close", id: existing.id });
    navigate({ type: "open", id });
    rememberTabs();
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
  const focusAfterClose = useRef(false);
  const [operation, setOperation] = useState<Operation | "">("loading");
  const operationRef = useRef(true);
  const [error, setError, errorCause] = useMessageState("");
  // Restore folder context before opening tabs, including their bibliography resources.
  const folders = useFolderTrees(requestFolder, setError);
  const openedFolderPaths = folders.trees.map(tree => tree.root);
  useEffect(() => {
    if (desktop?.setOpenedFolders) void desktop.setOpenedFolders(openedFolderPaths).catch(cause => setError(messageOf(cause)));
  }, [JSON.stringify(openedFolderPaths)]);

  const foldersRef = useRef(folders);
  foldersRef.current = folders;
  // Tab reporting rerenders the shell; keep this memoized tab prop stable and read live trees.
  const onAssetChange = useCallback((documentPath: string, assetPath: string) => {
    const { directory } = splitDocumentPath(documentPath);
    const separator = documentPath.includes("\\") ? "\\" : "/";
    foldersRef.current.refreshParents(directory + assetPath.replace(/^\.\//, "").replaceAll("/", separator));
  }, []);
  const [notice, setNotice, noticeCause] = useMessageState("");
  const [openRefusal, setOpenRefusal] = useState<{ path: string; reason: string; action: string; code?: string } | null>(null);
  const openRefusalReturnFocus = useRef<HTMLElement | null>(null);
  const [continuation, setContinuation] = useState<{ id: string; session: EditorSession } | null>(null);
  const [continuationPending, setContinuationPending] = useState(false);
  const continuationRunning = useRef(false);
  const continuationReturnFocus = useRef<HTMLElement | null>(null);
  const emptyEditorRef = useRef<DocumentEditorHandle>(null);
  const emptyImageRef = useRef<HTMLElement | null>(null);
  const session = activeId ? sessions.current.get(activeId) : undefined;
  const nativeSession = session?.kind === "native" ? session : undefined;
  // A fresh editor action replaces an older shell notice such as Copy path.
  useLayoutEffect(() => { if (nativeSession?.noticeAction) setNotice(""); }, [nativeSession?.noticeAction]);
  const {
    editorRef = emptyEditorRef, document, outlineStore, view = "visual",
    imageChoice = null, imageReturnFocus = emptyImageRef,
  } = nativeSession ?? {};
  const { openedPath = "", draftActive = false, documentDirty = false, reloadDialog = false } = session ?? {};
  const busy = Boolean(operation || fileOperationPending || session?.busy || continuationPending);
  const switching = Boolean(operation || session?.switching);
  function compareBeforeSave(returnFocus: HTMLElement | null, owner = session): void {
    if (!owner || owner.kind !== "native" || operationRef.current || owner.busy || !(owner.documentDirty || owner.draftActive)) return;
    saveComparisonReturnFocus.current = returnFocus;
    const submitted = owner.editorRef.current?.getDocument();
    try { setSaveComparison({ path: owner.openedPath, revision: owner.acknowledgedRevision, submitted, request: owner.savePreviewRequest() }); }
    catch (cause) {
      const failure = cause instanceof SaveContentError ? cause : new SaveContentError(messageOf(cause), undefined, { phase: "collect", cause });
      setSaveComparison({ path: owner.openedPath, revision: owner.acknowledgedRevision, submitted, failure: new SaveDisplayError([failure], submitted) });
    }
  }
  const save = () => session?.save();
  const showSource = () => nativeSession?.showSource();
  const setView = (next: "read" | "visual" | "source") => nativeSession?.setView(next);
  const reload = () => session?.reload();
  const reloadFromDisk = () => session?.reloadFromDisk();
  const setReloadDialog = (open: boolean) => session?.setReloadDialog(open);
  const closeImageChoice = () => nativeSession?.closeImageChoice();
  const selectImage = async (source: string) => nativeSession ? nativeSession.selectImage(source) : "";

  useEffect(() => {
    globalThis.document.title = openedPath ? `${splitDocumentPath(openedPath).name} — IeumDoc` : "IeumDoc";
  }, [openedPath]);

  useEffect(() => {
    if (!commandFileFocus) return;
    if (openRefusal || recoveryReview) { setCommandFileFocus(null); return; }
    if (busy || session?.openedPath !== commandFileFocus) return;
    // Tiptap's EditorContent reattaches its DOM during Strict Mode's mount replay. Focus after
    // that commit, before the next input event; a later tab/modal change cancels this handoff.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const target = session.editorRef.current?.getFocusTarget();
      if (!target) return;
      target.focus({ preventScroll: true });
      setCommandFileFocus(null);
    });
    return () => { cancelled = true; };
  }, [commandFileFocus, busy, session, openRefusal, recoveryReview]);

  function activateTab(id: string, explicit = true): void {
    const group = navigation.groups.find(group => group.tabs.includes(id));
    if (!group || explicit && (operationRef.current || continuation)) return;
    // Actual focus always follows a visible document, even while Open/Save is pending.
    // Switching a group's hidden tab still waits for that group's current operation.
    if (group.active !== id && (!explicit || group.active && sessions.current.get(group.active)?.busyRef.current)) return;
    if (explicit || id !== activeId) rememberTabs();
    if (id === activeId) return;
    navigate({ type: "select", id });
    setError("");
    setNotice("");
  }
  // DocumentTab reports session changes to the shell. Keep its callback prop stable so
  // that report alone cannot cause another memoized tab render/report cycle.
  const activateTabRef = useRef(activateTab);
  activateTabRef.current = activateTab;
  const focusDocument = useCallback((id: string) => activateTabRef.current(id, false), []);
  const revealDocument = useCallback((id: string) => activateTabRef.current(id), []);
  useLayoutEffect(() => {
    if (focusAfterClose.current) {
      focusAfterClose.current = false;
      const target = activeId ? globalThis.document.getElementById(`tab-${activeId}`)
        : globalThis.document.querySelector<HTMLElement>('[data-testid="document-start"] button');
      target?.focus({ preventScroll: true });
    }
  }, [activeId, tabs.length, navigation]);

  function placeTab(id: string, group = navigation.focused): void {
    navigate({ type: "open", id, group });
    rememberTabs();
  }
  const rightGroup = navigation.groups[1]?.id ?? 1 - navigation.groups[0]!.id;
  function moveTab(id: string, right = false): void {
    if (operationRef.current || continuation || !canSplit || sessions.current.get(id)?.busyRef.current) return;
    const owner = navigation.groups.find(group => group.tabs.includes(id));
    const target = right ? rightGroup : navigation.groups.find(group => group !== owner)?.id;
    if (target === undefined) return;
    focusAfterClose.current = true;
    placeTab(id, target);
  }

  useLayoutEffect(() => {
    const area = main.current;
    if (!area) return;
    const measure = () => {
      const available = area.getBoundingClientRect().width >= SPLIT_MIN_WIDTH;
      splitAvailable.current = available;
      setCanSplit(available);
      if (!available) navigate({ type: "merge" });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    measure();
    return () => observer.disconnect();
  }, [split]);

  function acceptFile(file: EditorFileResponse, group = navigation.focused): void {
    const existing = openedTab(tabs, file.path);
    const target = splitAvailable.current ? group : navigation.focused;
    if (existing) placeTab(existing.id, target);
    else {
      const id = `document-${++nextId.current}`;
      const recoveryId = newRecoveryId();
      setTabs(previous => [...previous, { id, path: file.path, file, recoveryId }]);
      placeTab(id, target);
    }
  }
  useEffect(() => {
    // Only remembered tabs need restored folder context. Without them, retain the existing
    // usable start/default document while folder restoration continues independently.
    if (tabsRestored || !folders.restored && readOpenTabs()?.paths.length) return;
    let current = true;
    void (async () => {
      const path = new URLSearchParams(window.location.search).get("path")?.trim() || undefined;
      const saved = readOpenTabs();
      // Keep Host metadata and Desktop launch-file precedence. A browser default that
      // will not be used is optional; its failure cannot block the higher-priority route.
      let first: EditorFileResponse | DocumentStartResponse;
      try { first = await requestDocument("GET"); }
      catch (cause) {
        if (!path && (desktop || !saved)) throw cause;
        first = { start: true };
      }
      if (!current) return;
      const next = path ? await requestDocument("GET", path, folders.rootOf(path)) : first;
      if (!current) return;
      const records = await refreshRecovery();
      if (!current) return;
      const initialTabs: Tab[] = [];
      const add = (file: EditorFileResponse) => {
        if (!openedTab(initialTabs, file.path)) initialTabs.push({ id: `document-${++nextId.current}`, path: file.path, file, recoveryId: newRecoveryId() });
      };
      // Explicit URL/ Desktop launch documents win over navigation memory. The Vite default
      // is only a fallback when no preference exists; an empty preference keeps the start screen.
      const explicit = Boolean(path || desktop && !("start" in next));
      let activePath: string | null = null;
      let recovery: RecoveryRecord | undefined;
      if (explicit || !saved) {
        if (!("start" in next)) {
          add(next);
          activePath = next.path;
          recovery = records?.find(record => record.path === next.path);
        }
      } else if (records) {
        for (const remembered of saved.paths) {
          if (!current) return;
          // Even malformed/unsupported recovery records retain their existing review flow.
          if (records.some(record => record.path === remembered)) continue;
          try {
            const file = await requestDocument("GET", remembered, folders.rootOf(remembered));
            if (!current) return;
            if (!("start" in file) && !records.some(record => record.path === file.path)) add(file);
          } catch { /* Missing, refused and non-native documents are quietly left out. */ }
        }
        activePath = saved.activePath;
        recovery = records.find(record => saved.paths.includes(record.path));
      }
      if (!current) return;
      setStart("start" in first ? first : { start: true, samples: first.samples, sampleProblem: first.sampleProblem });
      if ("start" in first) setAllowedRoots(first.allowedRoots);
      setTabs(initialTabs);
      navigate({ type: "reset", tabs: initialTabs.map(tab => tab.id), active: openedTab(initialTabs, activePath ?? "")?.id ?? initialTabs[0]?.id ?? null });
      // With no clean tabs, the existing start-screen list already offers every record.
      // If clean tabs hide that list, surface the newest matching record in its usual dialog.
      if (recovery && (explicit || !saved || initialTabs.length > 0)) reviewRecovery(recovery);
    })().catch(cause => { if (current) setError(cause instanceof Error ? cause : String(cause)); }).finally(() => {
      if (current) { operationRef.current = false; setOperation(""); setTabsRestored(true); }
    });
    return () => { current = false; };
  }, [folders.restored]);

  function removeTab(id: string): void {
    void sessions.current.get(id)?.discardRecovery()?.then(deleted => {
      if (!deleted) setError({ key: "The tab closed, but its local recovery record could not be deleted. Review it on the start screen and try Delete record again." });
    });
    sessions.current.delete(id);
    focusAfterClose.current = true;
    setTabs(previous => previous.filter(tab => tab.id !== id));
    navigate({ type: "close", id });
    rememberTabs();
  }
  const fileAction = async (action: Parameters<FileActionHandler>[0], chosenRoot: string, entry: FolderEntry, name?: string, figure?: { documentPath: string; imageUrl: string }) => {
    if (operationRef.current || [...sessions.current.values()].some(owner => owner.busyRef.current)) throw new Error(i18n.t("Wait for the current file operation to finish."));
    operationRef.current = true; setFileOperationPending(true);
    if (figure) setFigureRenamePending(true);
    const formSession = figure && [...sessions.current.values()].filter(owner => owner.kind === "native").find(owner => owner.openedPath === figure.documentPath);
    const tab = tabs.find(tab => tab.path === entry.path);
    const owner = tab && sessions.current.get(tab.id);
    owner?.suspendRecovery();
    let completed = false;
    try {
      if (figure && !formSession) throw new Error("Editor is not ready");
      const interrupted = (cause: unknown): never => {
        if (figure) throw new Error(i18n.t("The image rename response was interrupted. Files may have changed. Keep your edits and check the files before Reloading."));
        throw cause;
      };
      const root = figure ? chosenRoot : folders.trees.map(tree => tree.root).filter(root => folderChain(root, entry.path).length > 0).sort((a, b) => a.length - b.length)[0] ?? chosenRoot;
      const openDocuments = [];
      if (action === "rename" && entry.kind === "image") {
        for (const current of sessions.current.values()) {
          if (current.kind !== "native" || current.openedPath === figure?.documentPath) continue;
          if (folderChain(root, current.openedPath).length && current.editorRef.current?.hasUnsavedChanges()) {
            try {
              openDocuments.push({ path: current.openedPath,
                ...(current.editorRef.current.hasDocumentChanges() ? { source: await current.appliedSource() } : {}) });
            } catch (cause) {
              throw new Error(`${i18n.t("Save these documents before renaming the image: {{documents}}", { documents: splitDocumentPath(current.openedPath).name })}\n${messageOf(cause)}`);
            }
          }
        }
      }
      const response = await fetch(`${import.meta.env.BASE_URL}api/file`, {
        method: action === "delete" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root, path: entry.path, ...(action === "rename" ? { name, openDocuments } : {}),
          ...(figure && formSession ? { figureDocument: { path: figure.documentPath, imageUrl: figure.imageUrl,
            historicalSources: formSession.imageRenameSources(),
            revision: formSession.imageRenameRevision(), source: await formSession.appliedSource() } } : {}) }),
      }).catch(interrupted);
      const result = await response.json().catch(interrupted);
      if (response.ok && formSession && result.figureDocument) formSession.acceptImageRename(result.figureDocument);
      if (Array.isArray(result.references)) throw new Error(i18n.t("Save these documents before renaming the image: {{documents}}", { documents: result.references.join(", ") }));
      // The rename dialog remains modal throughout the request and reloads. No tab can
      // accept new input between the dirty check and installing the new disk checkpoint.
      const reloadErrors: string[] = [];
      for (const current of sessions.current.values()) {
        if (current.openedPath === figure?.documentPath && response.ok) continue;
        if (!result.updatedDocuments?.includes(current.openedPath)) continue;
        const message = await current.load(current.openedPath);
        if (message) reloadErrors.push(`${splitDocumentPath(current.openedPath).name}: ${message}`);
      }
      if (reloadErrors.length) setError({ key: "The files changed, but these tabs could not be reloaded: {{documents}}", values: { documents: reloadErrors.join(", ") } });
      if (result.skippedDocuments?.length) setNotice({ key: "Skipped unreadable or non-IeumDoc documents: {{documents}}", values: { documents: result.skippedDocuments.join(", ") } });
      if (!response.ok || typeof result.path !== "string") { folders.refreshParents(entry.path); throw new Error(result.error ?? `File operation failed (${response.status})`); }
      completed = true;
      try { await recoveryStorage.changePath(entry.path, action === "rename" ? result.path : null); }
      catch { setError({ key: "The file changed, but local recovery could not be updated. Review local recovery in Settings." }); }
      if (action === "rename") {
        owner?.relocate(result.path);
        setTabs(previous => previous.map(tab => {
          if (tab.path !== entry.path) return tab;
          const restored = tab.restored && structuredClone(tab.restored);
          if (restored) restored.file.path = result.path;
          return { ...tab, path: result.path, file: { ...tab.file, path: result.path }, ...(restored ? { restored } : {}) };
        }));
      } else if (tab) {
        sessions.current.delete(tab.id);
        setTabs(previous => previous.filter(item => item.id !== tab.id));
        navigate({ type: "close", id: tab.id });
      }
      rememberTabs();
      folders.refreshParents(entry.path);
      await refreshRecovery();
      return result.path;
    } finally {
      if (!completed) owner?.resumeRecovery();
      operationRef.current = false; setFileOperationPending(false); setFigureRenamePending(false);
    }
  };
  renameImageRef.current = async (documentPath, imageUrl, name) => {
    const { directory } = splitDocumentPath(documentPath);
    const separator = documentPath.includes("\\") ? "\\" : "/";
    const path = directory + imageUrl.replace(/^\.\//, "").replaceAll("/", separator);
    const root = folders.rootOf(documentPath) ?? directory.replace(/[\\/]$/, "");
    const renamed = await fileAction("rename", root, { path, name: imageUrl.split("/").pop()!, kind: "image" }, name, { documentPath, imageUrl });
    return `./${renamed.slice(directory.length).replaceAll("\\", "/")}`;
  };
  function closeTab(id: string): void {
    if (pluginTabs.some(tab => tab.id === id)) {
      if (busy || continuation) return;
      setPluginTabs(previous => previous.filter(tab => tab.id !== id));
      navigate({ type: "close", id }); focusAfterClose.current = true; return;
    }
    const owner = sessions.current.get(id);
    if (!owner || busy || owner.busyRef.current || continuation) return;
    if (owner.editorRef.current?.hasUnsavedChanges()) {
      continuationReturnFocus.current = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null;
      setContinuation({ id, session: owner });
    } else removeTab(id);
  }
  const [desktopInfo, setDesktopInfo] = useState<DesktopInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsReturnFocus = useRef<HTMLElement | null>(null);

  // Resolve when an overlay closes: a viewport change can replace its original opener.
  function shellReturnFocus(preferred: HTMLElement | null): HTMLElement | true {
    return preferred?.isConnected && preferred.getClientRects().length ? preferred
      : sidebarToggle.current ?? true;
  }

  // The overlaid Document panel starts below the sticky header, whose height changes when
  // a message appears; it never covers Save, File actions or the Outline toggle.
  useEffect(() => {
    const element = header.current;
    const title = titlebar.current;
    if (!element || !title) return;
    const observer = new ResizeObserver(() => {
      shell.current?.style.setProperty("--app-titlebar-height", `${title.offsetHeight}px`);
      shell.current?.style.setProperty("--app-header-height", `${title.offsetHeight + element.offsetHeight}px`);
    });
    observer.observe(element);
    observer.observe(title);
    return () => observer.disconnect();
  }, []);

  // Reserve the native scrollbar's width below the full-width title strip.
  // Content observation catches overflow changes without adding any scroll listener.
  useLayoutEffect(() => {
    const viewport = documentScrollContainer();
    if (!viewport) return;
    const measure = () => shell.current?.style.setProperty("--document-scrollbar-width", `${viewport.offsetWidth - viewport.clientWidth}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    const column = viewport.querySelector(".document-column");
    if (column) observer.observe(column);
    measure();
    return () => observer.disconnect();
  }, [activeId, tabs.length, start]);
  useEffect(() => {
    window.addEventListener("keydown", scrollDocumentFromShell);
    return () => window.removeEventListener("keydown", scrollDocumentFromShell);
  }, []);

  // Entering overlay closes it; returning to docked restores the explicit choice or default.
  useEffect(() => {
    const query = matchMedia(PANEL_OVERLAY_LAYOUT);
    const change = () => {
      setPanelOverlay(query.matches);
      setPanelOpen(query.matches ? false : dockedPanelOpen.current ?? true);
    };
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  async function openFile(path: string, openedNotice = "", group = navigation.focused): Promise<string | null> {
    const requestedPath = unquotePath(path);
    if (!requestedPath) return i18n.t("Enter a Markdown file path.");
    if (!/\.(md|txt)$/i.test(requestedPath)) return i18n.t("Only .md and .txt files can be opened.");
    if (operationRef.current || busy || continuation) return i18n.t("Wait for the current operation to finish.");
    const existing = openedTab(tabs, requestedPath);
    if (existing) {
      placeTab(existing.id, group);
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
      acceptFile(next, group);
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
  async function openComparison(folder: string, current = () => true): Promise<string> {
    return openPluginTab("docling/comparison", folder, current);
  }
  async function openPluginTab(key: string, resource: string, current = () => true): Promise<string> {
    try {
      const [pluginId, kindId] = key.split("/");
      const plugin = ui.plugins.find(plugin => plugin.id === pluginId);
      const kind = plugin?.contributions?.tabs.find(kind => kind.id === kindId);
      if (!kind) return i18n.t("Plugin is disabled.");
      const content = await kind.open(resource);
      if (!current()) return "";
      if (currentPlugins.current.find(item => item.id === pluginId)?.contributions !== plugin?.contributions) return i18n.t("Plugin is disabled.");
      if (!content || typeof content.path !== "string" || !content.path) throw new Error("Invalid plugin tab content.");
      const existing = pluginTabs.find(tab => tab.plugin === pluginId && tab.kind === kindId && tab.path === content.path);
      if (existing) { placeTab(existing.id); return ""; }
      const id = `plugin-${++nextId.current}`;
      setPluginTabs(previous => [...previous, { ...content, id, plugin: pluginId!, kind: kindId!, label: kind.label, className: kind.className }]);
      placeTab(id); return "";
    } catch (cause) { return messageOf(cause); }
  }
  async function createFile(path: string): Promise<string> {
    if (operationRef.current || busy || continuation) return i18n.t("Wait for the current operation to finish.");
    operationRef.current = true;
    setOperation("creating");
    setError("");
    setNotice("");
    try {
      acceptFile(await requestDocument("PUT", path, folders.rootOf(path)));
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
  function newDocument(returnFocus: HTMLElement | null): void {
    if (busy || continuation) return;
    newFileButton.current = returnFocus;
    const root = folders.rootOf(openedPath) ?? folders.roots[0];
    if (root) newFile(root);
    else {
      dialogReturnFocus.current = returnFocus;
      setNewAfterFolder(true);
      setFolderDialog(true);
    }
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
  async function openFolder(path: string, createAfterOpen = false): Promise<string> {
    const root = unquotePath(path);
    if (!root) return i18n.t("Enter a folder path.");
    try {
      const listed = await requestFolder(root);
      const parent = folders.open(listed, openedPath);
      if (parent) {
        setSidebarOpen(true);
        setNotice({ key: "Already inside the opened folder {{name}}.", values: { name: splitDocumentPath(parent).name || parent } });
        if (!createAfterOpen) {
          if (folderDialog) pendingFolderFocus.current = listed.root;
          else setFolderFocus(listed.root);
        }
      }
      // Responses can overlap; advance the list before another completion or render.
      recentFoldersRef.current = rememberRecentFolder(listed.root, recentFoldersRef.current);
      setRecentFolders(recentFoldersRef.current);
      if (createAfterOpen) {
        setNewDirectory(listed.root);
        folderNewReady.current = true;
      }
      return "";
    } catch (cause) {
      return messageOf(cause);
    }
  }

  /** Creates a folder; nothing about the open document changes. */
  async function createFolder(parent: string, name: string): Promise<string> {
    try {
      await requestCreateFolder(parent, name);
      folders.refresh(parent);
      return "";
    } catch (cause) {
      return messageOf(cause);
    }
  }

  async function openFolderDocument(path: string, group = navigation.focused): Promise<boolean> {
    const message = await openFile(path, "", group);
    if (message) setError(message);
    return message === "";
  }

  // Startup tab restoration lists/reveals child folders but respects remembered section collapse.
  // Only an explicit navigation (rememberVersion) expands and remembers containing sections.
  useEffect(() => {
    if (openedPath) folders.reveal(openedPath, rememberVersion > 0);
  }, [openedPath]);

  // Ctrl/Cmd+S is the Save button: same path, same messages. The browser's own page save
  // never applies. Modal dialogs cover the Save button, so the shortcut waits for them too.
  const saveShortcut = useRef<(event: KeyboardEvent) => void>(() => {});
  saveShortcut.current = (event) => {
    if (COMMAND_CENTER_SHORTCUT.matches(event)) {
      event.preventDefault();
      if (globalThis.document.querySelector('[data-slot="dialog-content"]:not(.command-center-dialog)') ||
          folderDialog || newDialog || newFolderDialog || reloadDialog || openRefusal || continuation || recoveryReview || saveComparison || settingsOpen) return;
      openCommandCenter("");
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey ||
        (event.key.toLowerCase() !== "s" && event.code !== "KeyS")) return;
    event.preventDefault();
    if (globalThis.document.querySelector('[data-slot="dialog-content"]') || folderDialog || newDialog || newFolderDialog || reloadDialog || openRefusal || continuation || recoveryReview || saveComparison || settingsOpen) return;
    void save();
  };
  useEffect(() => {
    // Capture, so inputs inside node views (Equation, Figure, code language) cannot swallow it.
    const listener = (event: KeyboardEvent) => saveShortcut.current(event);
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  // Nonediting shell focus shares the active document's existing keymap and focus policy.
  const historyShortcut = useRef<(event: KeyboardEvent) => void>(() => {});
  historyShortcut.current = event => {
    if (event.defaultPrevented || event.isComposing || busy || !document || view !== "visual" ||
        (isMac() ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey)) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || (target !== globalThis.document.body && !shell.current?.contains(target) && !target.closest('.notification-center')) ||
        target.closest('input, textarea, select, .document-editor, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="menu"]') ||
        globalThis.document.querySelector('[data-slot="dialog-content"], [aria-modal="true"], dialog[open], .settings-screen')) return;
    const action = EDITOR_SHORTCUTS.undo.matches(event) ? "undo"
      : EDITOR_SHORTCUTS.redo.matches(event) || EDITOR_SHORTCUTS.redoAlternative.matches(event) ? "redo" : undefined;
    const editor = editorRef.current;
    if (!action || !editor?.getFocusTarget()) return;
    event.preventDefault();
    editor[action]();
  };
  useEffect(() => {
    // Bubble after native editable surfaces and local handlers have had their turn.
    const listener = (event: KeyboardEvent) => historyShortcut.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
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

  const update = desktopInfo?.update;
  const offeredUpdate = update && "version" in update ? update : update?.phase === "error" ? update.update : undefined;
  const unseenUpdate = offeredUpdate && update?.phase !== "installing" && offeredUpdate.version !== desktopInfo?.seenUpdate
    ? offeredUpdate.version : undefined;
  const [highlightUpdate, setHighlightUpdate] = useState(false);

  // Viewing the offered version acknowledges it, including an offer arriving while About is open.
  useEffect(() => {
    if (!desktop || !settingsOpen || settingsCategory !== "about" || !unseenUpdate) return;
    setDesktopInfo(info => info && { ...info, seenUpdate: unseenUpdate });
    void desktop.markUpdateSeen(unseenUpdate).catch((cause: unknown) => setError(cause instanceof Error ? cause : String(cause)));
  }, [settingsOpen, settingsCategory, unseenUpdate]);

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
  async function copyPath(path = openedPath): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      setError({ key: "Copy path needs clipboard access, which this browser allows only on HTTPS or local pages. The full path is in the filename's tooltip." });
      return;
    }
    try {
      await navigator.clipboard.writeText(path);
      setError("");
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

  function openCommandCenter(query = ""): void {
    if (commandQuery === null) {
      commandReturnFocus.current = globalThis.document.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null;
    }
    setCommandQuery(query);
  }

  // The center is another entry to the same handlers and availability conditions as the shell.
  // It owns no document operation, indexing or persistent command registry.
  const commandDocumentNames = tabNames(tabs);
  const commandOpen = commandQuery !== null;
  const listedDocuments = useMemo(() => {
    if (!commandOpen) return [];
    const listed = new Map<string, FolderEntry>();
    // Follow current parent listings, regardless of expansion. Disconnected caches stay in the
    // sidebar for reuse but do not contribute search results. No Host discovery is involved.
    for (const tree of folders.trees) for (const path of knownFolders(tree)) {
      for (const entry of tree.nodes.get(path)?.entries ?? []) if (entry.kind === "document") listed.set(entry.path, entry);
    }
    return [...listed.values()].sort((a, b) => a.path.localeCompare(b.path));
  }, [commandOpen, folders.trees]);
  const openedPaths = new Set(tabs.map(tab => tab.path));
  const inlineInsertionDisabled = !document || busy || view !== "visual" ||
    !editorRef.current?.canInsertInline() || commandReturnFocus.current !== editorRef.current?.getFocusTarget();
  const historyDisabled = !document || busy || view !== "visual";
  const sampleWarning = start?.sampleProblem === "conflict"
    ? i18n.t("Sample documents are unavailable because the sample folder could not be replaced safely. The existing folder was kept.")
    : start?.sampleProblem ? i18n.t("Sample documents could not be prepared. You can still open your documents.") : "";
  const samplePath = start?.samples?.[i18n.language === "ko" ? "ko" : "en"];
  const openSample = () => {
    if (samplePath) void openFile(samplePath, i18n.t("This is a writable sample copy. Changes are kept until the bundled sample version changes.")).then(message => {
      if (message) setError(message);
      else if (message === "") setCommandFileFocus(samplePath);
    });
  };
  const commandItems: CommandCenterItem[] = [
    ...(samplePath ? [{ id: "open-sample", kind: "command" as const, label: i18n.t("Open sample document"), icon: FileText, takesFocus: true, disabled: busy || Boolean(continuation),
      keywords: ["sample", "샘플"], run: openSample }] : []),
    ...tabs.map((tab, index) => ({
      id: `tab:${tab.id}`, kind: "document" as const, label: commandDocumentNames[index]!,
      detail: `${i18n.t("Opened tab")} · ${tab.path}`, icon: FileText, disabled: busy || Boolean(continuation),
      run: () => {
        activateTab(tab.id);
        const owner = sessions.current.get(tab.id);
        // The retained target can still be hidden here; Dialog focuses it after activation/dismissal.
        commandReturnFocus.current = (owner?.kind === "text" || owner?.view === "visual") ? owner.editorRef.current?.getFocusTarget() ?? null
          : globalThis.document.getElementById(`tab-${tab.id}`);
      },
    })),
    ...listedDocuments.filter(entry => !openedPaths.has(entry.path)).map(entry => ({
      id: `file:${entry.path}`, kind: "file" as const, label: entry.name,
      detail: `${i18n.t("Explorer")} · ${entry.native === false ? `${i18n.t("Not an IeumDoc document")} · ` : ""}${entry.path}`,
      icon: entry.native === false ? FileX : FileText, foreign: entry.native === false,
      disabled: busy || Boolean(continuation), takesFocus: true,
      run: () => {
        // Run after dismissal so an admission/recovery dialog can own focus. Keep a live return
        // target for refusals, then focus a successful open only after its editor has mounted.
        commandReturnFocus.current?.focus({ preventScroll: true });
        void openFolderDocument(entry.path).then(opened => { if (opened) setCommandFileFocus(entry.path); });
      },
    })),
    { id: "new-document", kind: "command", label: i18n.t("New document…"), icon: FileText, takesFocus: true,
      disabled: busy || Boolean(continuation), keywords: ["new document", "new file", "새 문서", "새 파일"],
      run: () => newDocument(commandReturnFocus.current) },
    { id: "open-right", kind: "command", label: i18n.t("Open to the right"), icon: PanelRightOpen,
      disabled: !activeId || !canSplit || busy || Boolean(continuation), takesFocus: true,
      keywords: ["split editor group", "오른쪽 그룹 분할"], run: () => { if (activeId) moveTab(activeId, true); } },
    { id: "move-group", kind: "command", label: i18n.t("Move to other group"), icon: ArrowLeftRight,
      disabled: !activeId || !split || busy || Boolean(continuation), takesFocus: true,
      keywords: ["move tab group", "탭 그룹 이동"], run: () => { if (activeId) moveTab(activeId); } },
    { id: "open-folder", kind: "command", label: i18n.t("Open folder…"), icon: FolderOpen, takesFocus: true,
      keywords: ["open folder", "폴더 열기"], run: () => { dialogReturnFocus.current = commandReturnFocus.current; setFolderDialog(true); } },
    ...folders.trees.map(tree => ({ id: 'refresh-folder:' + tree.root, kind: "command" as const,
      label: i18n.t("Refresh folder"), detail: tree.root, icon: RotateCw,
      keywords: ["refresh folder", "폴더 새로고침"], run: () => folders.refreshRoot(tree.root) })),
    { id: "save", kind: "command", label: i18n.t("Save"), icon: Save, disabled: !session || busy || view === "read",
      keywords: ["save", "저장"], shortcut: SAVE_SHORTCUT.label, run: () => { void save(); } },
    { id: "save-comparison", kind: "command", label: i18n.t("Changes before saving"), icon: FileDiff,
      disabled: !document || !(documentDirty || draftActive) || busy, takesFocus: true, keywords: ["diff compare save preview", "저장 전 변경 내용 보기"],
      run: () => compareBeforeSave(commandReturnFocus.current) },
    { id: "reload", kind: "command", label: i18n.t("Reload"), icon: RotateCcw, disabled: !session || busy, takesFocus: true,
      keywords: ["reload", "다시 불러오기", "새로고침"], run: () => { void reload(); } },
    { id: "copy-path", kind: "command", label: i18n.t("Copy path"), icon: Copy, disabled: !session || busy,
      keywords: ["copy path", "경로 복사"], run: () => { void copyPath(); } },
    ...(session?.kind === "text" ? [] : [{ id: "read", kind: "command" as const, label: i18n.t("View: Read"), icon: FileText, disabled: !document || busy, takesFocus: true,
      keywords: ["read view", "읽기 보기"], run: () => { globalThis.document.querySelector<HTMLElement>(`[data-editor-group="${navigation.focused}"] [data-testid="view-read"]`)?.focus(); setView("read"); } },
    { id: "visual", kind: "command" as const, label: i18n.t("View: Edit"), icon: FileText, disabled: !document || busy, takesFocus: true,
      keywords: ["visual view", "비주얼 보기"], run: () => { globalThis.document.querySelector<HTMLElement>(`[data-editor-group="${navigation.focused}"] [data-testid="view-visual"]`)?.focus(); setView("visual"); } },
    { id: "source", kind: "command" as const, label: i18n.t("View: Source"), icon: SquareCode, disabled: !document || busy, takesFocus: true,
      keywords: ["source markdown", "소스 보기"], run: () => { globalThis.document.querySelector<HTMLElement>(`[data-editor-group="${navigation.focused}"] [data-testid="view-source"]`)?.focus(); void showSource(); } }]),
    { id: "outline", kind: "command", label: i18n.t(panelOpen ? "Hide outline" : "Show outline"), icon: PanelRight, takesFocus: true, disabled: session?.kind === "text",
      keywords: ["outline", "개요"], run: () => { outlineToggle.current?.focus(); choosePanelOpen(!panelOpen); } },
    { id: "sidebar", kind: "command", label: i18n.t(sidebarOpen ? "Collapse Explorer" : "Expand Explorer"), icon: PanelLeft,
      keywords: ["sidebar", "사이드바"], takesFocus: true,
      run: () => { sidebarFocus.current = "sidebar"; setSidebarOpen(value => !value); } },
    { id: "width", kind: "command", label: i18n.t(documentWidth === "wide" ? "Standard document width" : "Wide document"), icon: documentWidth === "wide" ? Columns3 : StretchHorizontal, disabled: session?.kind === "text",
      keywords: ["document width", "문서 너비"], run: toggleDocumentWidth },
    ...pluginActions("commands").map(action => ({ id: action.id, kind: "command" as const, label: i18n.t(action.label as MessageKey), icon: FileText,
      takesFocus: true, disabled: busy || Boolean(continuation), keywords: action.keywords, run: () => action.run(commandReturnFocus.current) })),
    ...THEMES.map(value => ({ id: `theme-${value}`, kind: "command" as const,
      label: i18n.t(`Color mode: ${THEME_LABELS[value]}`), icon: Monitor,
      keywords: ["color mode", "theme", "색상 모드", "테마", THEME_LABELS[value], { system: "시스템", light: "라이트", dark: "다크" }[value]],
      run: () => changeTheme(value) })),
    { id: "settings", kind: "command", label: i18n.t("Settings"), icon: Settings2, takesFocus: true,
      keywords: ["settings", "설정"], run: () => { settingsReturnFocus.current = commandReturnFocus.current; setSettingsCategory("appearance"); setSettingsOpen(true); void refreshRecovery(); } },
    { id: "document-settings", kind: "command", label: i18n.t("Document settings…"), icon: SlidersHorizontal,
      disabled: historyDisabled, takesFocus: true, keywords: ["document settings", "문서 설정"],
      run: () => editorRef.current?.openDocumentSettings() },
    { id: "insert-citation", kind: "command", label: i18n.t("Insert citation…"), icon: Quote,
      disabled: inlineInsertionDisabled, takesFocus: true, keywords: ["insert citation", "인용 삽입"],
      run: () => editorRef.current?.openInlineInsertion("citation") },
    { id: "connect-bibliography", kind: "command", label: i18n.t("Connect bibliography…"), icon: Quote,
      disabled: !document || busy || view !== "visual", takesFocus: true, keywords: ["connect bibliography", "참고문헌 파일 연결"],
      run: () => editorRef.current?.openBibliographyConnection(commandReturnFocus.current) },
    { id: "insert-reference", kind: "command", label: i18n.t("Insert cross-reference…"), icon: Bookmark,
      disabled: inlineInsertionDisabled, takesFocus: true, keywords: ["insert cross-reference", "상호 참조 삽입"],
      run: () => editorRef.current?.openInlineInsertion("reference") },
    { id: "undo", kind: "command", label: i18n.t("Undo"), icon: RotateCcw,
      disabled: historyDisabled || !editorRef.current?.canUndo(), takesFocus: true,
      keywords: ["undo", "실행 취소"], shortcut: EDITOR_SHORTCUTS.undo.label, run: () => editorRef.current?.undo() },
    { id: "redo", kind: "command", label: i18n.t("Redo"), icon: RotateCw,
      disabled: historyDisabled || !editorRef.current?.canRedo(), takesFocus: true,
      keywords: ["redo", "다시 실행"], shortcut: EDITOR_SHORTCUTS.redo.label, run: () => editorRef.current?.redo() },
    { id: "keyboard-shortcuts", kind: "command", label: i18n.t("Keyboard shortcuts"), icon: Keyboard, takesFocus: true,
      keywords: ["keyboard shortcuts", "키보드 단축키"],
      run: () => { shortcutsReturnFocus.current = commandReturnFocus.current; setShortcutsOpen(true); } },
  ];

  return (
    <div ref={shell} className={`app-shell${sidebarOpen ? "" : " app-shell--collapsed"}${panelOpen && !pluginTab && session?.kind !== "text" ? "" : " app-shell--panel-closed"}${documentWidth === "wide" ? " app-shell--wide" : ""}${split ? " app-shell--split" : ""}`}>
      <Sidebar
        theme={theme} onThemeChange={changeTheme}
        onDoclingConvert={(path, element) => { conversionReturn.current = element; setConversionPath(path); setConversionOpen(true); setConversionNotice(null); }}
        doclingBusy={converter.pending || converter.job?.state === "running"}
        contributions={pluginActions("sidebar")}
        onFileAction={fileAction} fileActionsDisabled={busy || Boolean(continuation)}
        isFileDirty={path => { const tab = tabs.find(tab => tab.path === path); return !!(tab && sessions.current.get(tab.id)?.editorRef.current?.hasUnsavedChanges()); }}
        open={sidebarOpen}
        documentPath={openedPath}
        toggleRef={sidebarToggle}
        onToggle={() => {
          setSidebarOpen((value) => !value);
        }}
        onOpenFolder={(returnFocus) => {
          dialogReturnFocus.current = returnFocus;
          setFolderDialog(true);
        }}
        recent={visibleRecent}
        onNewDocument={newDocument}
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
        focusFolder={folderFocus}
        onFolderFocused={() => setFolderFocus(null)}
        onToggleFolder={folders.toggle}
        onToggleSection={folders.toggleSection}
        onOpenDocument={(path) => {
          void openFolderDocument(path);
        }}
        onOpenRight={path => { if (canSplit) void openFolderDocument(path, rightGroup).then(opened => { if (opened) setCommandFileFocus(path); }); }}
        openRightDisabled={!canSplit || busy || Boolean(continuation)}
        onRevealFolder={desktop?.openFolderInExplorer ? path => {
          void (async () => {
            try {
              await desktop.setOpenedFolders(openedFolderPaths);
              await desktop.openFolderInExplorer(path);
            } catch { setError({ key: "Could not open the folder in File Explorer. Check that it still exists and is accessible." }); }
          })();
        } : undefined}
        onRefreshFolder={folders.refreshRoot}
        onCloseFolder={folders.close}
        updateVersion={unseenUpdate}
        onSettings={(returnFocus) => {
          settingsReturnFocus.current = returnFocus;
          setSettingsCategory(unseenUpdate ? "about" : "appearance");
          setHighlightUpdate(!!unseenUpdate);
          setSettingsOpen(true);
          void refreshRecovery();
        }}
      />
      <div className="app-titlebar" ref={titlebar}>
        <div className="app-brand">
          <img src={appIcon} alt="IeumDoc" />
          {sidebarOpen ? <span aria-hidden="true">IEUMDOC</span> : null}
        </div>
        <div className="top-bar-container">
          <TopBar onOpenCommandCenter={() => openCommandCenter()} documentPath={openedPath}
            location={documentLocation(openedPath, folders.rootOf(openedPath))} />
        </div>
      </div>
      <div className="app-main" ref={main}>
        <div className="app-header" ref={header}>
          <div className="editor-group-headers">
          {navigation.groups.map((group, index) => {
            const owner = group.active ? sessions.current.get(group.active) : undefined;
            const groupBusy = Boolean(operation || fileOperationPending || owner?.busy || continuationPending);
            return <section key={group.id} data-editor-group={group.id} data-focused={group.id === navigation.focused}
              aria-label={i18n.t("Editor group {{number}}", { number: index + 1 })}
              onFocusCapture={() => { if (group.active) activateTab(group.active, false); }}
              onPointerDownCapture={() => { if (group.active) activateTab(group.active, false); }}>
          <DocumentTabs allTabs={allTabs} tabs={group.tabs.flatMap(id => allTabs.filter(tab => tab.id === id)).map(tab => ({ ...tab,
            dirty: Boolean(sessions.current.get(tab.id)?.documentDirty || sessions.current.get(tab.id)?.draftActive),
          }))} active={group.active} disabled={groupBusy || Boolean(continuation)} onActivate={activateTab} onClose={closeTab}
            onOpenRight={id => moveTab(id, true)} onMove={id => moveTab(id)} openRightDisabled={!canSplit || groupBusy} moveDisabled={!split || groupBusy} actions={
            <DocumentActions
              documentPath={owner?.openedPath ?? ""}
              wide={documentWidth === "wide"}
              onToggleWide={owner?.kind === "text" ? undefined : toggleDocumentWidth}
              compact={split}
              status={operation || (owner?.assetPending ? "adding-image" : owner?.status ?? "ready")}
              unsaved={owner?.documentDirty || owner?.draftActive}
              draftNotice={owner?.draftNotice}
              textMode={owner?.kind === "text"}
              hideViewControls={pluginTabs.some(tab => tab.id === group.active)}
              view={owner?.kind === "native" ? owner.view : "visual"}
              viewDisabled={!owner || groupBusy}
              onViewChange={(next) => { if (owner?.kind === "native") { if (next === "source") void owner.showSource(); else owner.setView(next); } }}
              saveDisabled={!owner || groupBusy || owner.kind === "native" && owner.view === "read"}
              onSave={() => void owner?.save()}
              onCompare={owner?.kind === "text" ? undefined : () => compareBeforeSave(fileActionsToggle.current, owner)}
              compareDisabled={!(owner?.documentDirty || owner?.draftActive) || groupBusy}
              onReload={() => void owner?.reload()}
              reloadDisabled={!owner || groupBusy}
              onCopyPath={() => void copyPath(owner?.openedPath)}
              fileActionsRef={group.id === navigation.focused ? fileActionsToggle : undefined}
              onOpenRight={() => { if (group.active) moveTab(group.active, true); }}
              onMove={() => { if (group.active) moveTab(group.active); }}
              openRightDisabled={!owner || !canSplit || groupBusy}
              moveDisabled={!owner || !split || groupBusy}
              outline={panelOpen}
              onToggleOutline={owner?.kind === "text" ? undefined : () => choosePanelOpen(!panelOpen)}
              outlineToggleRef={group.id === navigation.focused ? outlineToggle : undefined}
            />
          } />
          </section>;
          })}
          </div>
          <MessageArea
            warnings={[...(recoveryProblem ? [{ id: "recovery-storage", message: recoveryProblem }] : []),
              ...(sampleWarning ? [{ id: `sample-preparation:${start?.sampleProblem}`, message: sampleWarning }] : [])]}
            error={error} errorCause={errorCause}
            notice={notice} noticeCause={noticeCause}
            onNoticeExpired={() => setNotice("")}
          />
        </div>
        <main className="document-stage" onMouseDown={(event) => {
          // The empty area below the document places the caret at its end.
          const id = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-document-tab]")?.dataset.documentTab : undefined;
          const owner = id ? sessions.current.get(id) : undefined;
          if (event.button === 0 && event.target instanceof HTMLElement && event.target.classList.contains("document-column") && (owner?.kind === "text" || owner?.view === "visual") &&
            owner.editorRef.current?.focusEnd(event.clientY)) event.preventDefault();
        }}>
          {tabs.length === 0 && pluginTabs.length === 0 && start ? (
            <div className="document-scroll" data-active="true"><div className="document-column"><DocumentStart
              mark={productMark}
              recovery={<RecoveryList records={recoveryRecords.filter(record => !tabs.some(tab => tab.recoveryId === record.id))} unavailable={Boolean(recoveryProblem)} onReview={reviewRecovery} />}
              recent={visibleRecent}
              sample={samplePath}
              busy={busy}
              onNewDocument={newDocument}
              onOpenFolder={(returnFocus) => {
                dialogReturnFocus.current = returnFocus;
                setFolderDialog(true);
              }}
              onOpenRecent={(folder) => void openFolder(folder).then((message) => { if (message) setError(message); })}
              onOpenSample={openSample}
            /></div></div>
          ) : null}
          {tabs.map(tab => {
            const groupIndex = navigation.groups.findIndex(group => group.tabs.includes(tab.id));
            const group = navigation.groups[groupIndex];
            return <DocumentTab settingsDisabled={Boolean(operation || fileOperationPending || continuationPending)} key={tab.id} id={tab.id} file={tab.file} restored={tab.restored} recoveryId={tab.recoveryId}
              active={group?.active === tab.id} focused={tab.id === activeId} groupIndex={groupIndex} onFocus={focusDocument}
              report={reportSession} onAssetChange={onAssetChange} renameImage={renameImage} onReveal={revealDocument} />;
          })}
          {pluginTabs.map(tab => {
            const groupIndex = navigation.groups.findIndex(group => group.tabs.includes(tab.id));
            return <PluginTab key={tab.id} tab={tab} plugin={ui.plugins.find(plugin => plugin.id === tab.plugin)} groupIndex={groupIndex}
              active={navigation.groups[groupIndex]?.active === tab.id} focused={tab.id === activeId} onFocus={focusDocument} />;
          })}
        </main>
      </div>
      {panelOpen && !pluginTab && session?.kind !== "text" ? (
        <DocumentPanel
          overlay={panelOverlay}
          outline={document ? outlineStore : undefined}
          onSelectItem={item => nativeSession?.revealItem(item)}
          onClose={() => {
            choosePanelOpen(false);
            // Escape dismisses the overlay; its toggle keeps the focus.
            outlineToggle.current?.focus();
          }}
        />
      ) : null}
      <DoclingConversionDialog open={conversionOpen} input={conversionPath || converter.job?.input || ""} job={converter.job} pending={converter.pending}
        problem={converter.problem} returnFocus={conversionReturn} onClose={() => setConversionOpen(false)}
        onStart={() => { conversionAttempt.current++; setConversionNotice(null); void converter.start(conversionPath).catch(cause => setConversionNotice({ id: `start-${Date.now()}`, message: messageOf(cause) })); }}
        onCancel={() => void converter.cancel()} />
      <FolderDialog open={pdfPicker} choose="pdf" title={i18n.t("Convert with Docling")}
        description={i18n.t("Choose a PDF on the Host device.")}
        initialPath={folders.roots.at(-1) ?? splitDocumentPath(openedPath).directory} recent={visibleRecent}
        restricted={allowedRoots !== undefined} browse={browseHostPdfs} places={folderPlaces}
        onOpen={async path => { setConversionPath(path); setConversionNotice(null); return ""; }}
        returnFocus={conversionReturn} onClose={() => setPdfPicker(false)}
        onClosed={() => { if (conversionPath) setConversionOpen(true); }} />
      <NotificationSource items={[...(themeProblem && !settingsOpen ? [{ id: "theme-storage", severity: "error" as const, message: i18n.t("Theme could not be saved. This choice applies until you close this page.") }] : []), ...(conversionNotice ? [{ id: `docling-error-${conversionNotice.id}`, severity: "error" as const, message: conversionNotice.message,
        reveal: () => { setConversionPath(converter.job?.input ?? conversionPath); setConversionOpen(true); } }] : []),
        ...[ui.problem, pluginActionProblem, ...ui.plugins.filter(plugin => plugin.error).map(plugin => `${plugin.id}: ${plugin.error}`)].filter(Boolean).map(message => ({ id: `plugin-error-${message}`, severity: "error" as const, message })),
        ...pluginTabs.flatMap(tab => contributionNotices(ui.plugins.find(plugin => plugin.id === tab.plugin), tab.kind, tab.data).map(notice => ({ ...notice, id: `plugin-${tab.id}-${notice.id}`,
        reveal: () => {
          activateTab(tab.id);
          requestAnimationFrame(() => globalThis.document.getElementById(`panel-${tab.id}`)?.focus());
        },
      })))]} />
      <FolderDialog open={Boolean(pluginPicker)} title={pluginPicker?.title ?? ""}
        description={pluginPicker?.description ?? ""}
        showSidebarHint={false}
        initialPath={folders.roots.at(-1) ?? splitDocumentPath(openedPath).directory} recent={visibleRecent}
        restricted={allowedRoots !== undefined} browse={browseHostFolder} places={folderPlaces} onOpen={async folder => {
          try { return await pluginPicker?.open(folder) ?? i18n.t("Plugin is disabled."); }
          catch (error) { return messageOf(error); }
        }}
        returnFocus={compareReturn} onClose={() => setPluginPicker(null)} />
      <SettingsDialog
          open={settingsOpen}
          theme={theme} themeProblem={themeProblem} onThemeChange={changeTheme}
          category={settingsCategory}
          highlightUpdate={highlightUpdate}
          onCategoryChange={(category) => { setSettingsCategory(category); setHighlightUpdate(false); }}
          documentName={openedPath ? splitDocumentPath(openedPath).name : ""}
          unsaved={documentDirty || draftActive}
          recoveryCount={recoveryRecords.length}
          recoveryProblem={recoveryProblem}
          onClearRecovery={() => deleteRecovery()}
          desktop={desktop}
          info={desktopInfo}
          onInfo={setDesktopInfo}
          onInstall={installUpdate}
          returnFocus={() => shellReturnFocus(settingsReturnFocus.current)}
          onClose={() => { setSettingsOpen(false); setHighlightUpdate(false); }}
        />
      <CommandCenter open={commandQuery !== null} initialQuery={commandQuery ?? ""} items={commandItems}
        returnFocus={commandReturnFocus} onClose={() => setCommandQuery(null)} />
      <KeyboardShortcutsDialog open={shortcutsOpen} returnFocus={shortcutsReturnFocus} onClose={() => setShortcutsOpen(false)} />
      {saveComparison ? <Suspense fallback={null}><SaveCompare comparison={saveComparison}
        returnFocus={saveComparisonReturnFocus} onClose={() => setSaveComparison(null)} /></Suspense> : null}
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
        onOpen={path => openFolder(path, newAfterFolder)}
        onClosed={() => {
          if (pendingFolderFocus.current) {
            setFolderFocus(pendingFolderFocus.current);
          }
          if (!folderNewReady.current) return;
          setNewDialog(true);
        }}
        onCreateFolder={createFolder}
        returnFocus={dialogReturnFocus}
        finalFocus={() => folderNewReady.current || pendingFolderFocus.current ? false : shellReturnFocus(dialogReturnFocus.current)}
        onClose={() => { setFolderDialog(false); setNewAfterFolder(false); }}
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
        destinations={newDestinations(folders.trees)}
        directory={newDirectory}
        busy={busy}
        onCreate={(directory, name) => createFile(childPath(directory, name))}
        createdFocusTarget={() => editorRef.current?.getFocusTarget() ?? null}
        finalFocus={() => shellReturnFocus(newFileButton.current)}
        returnFocus={newFileButton}
        onClose={() => { if (!switching) { setNewDialog(false); folderNewReady.current = false; } }}
      />
      <Dialog open={figureRenamePending}>
        <DialogContent showCloseButton={false} finalFocus={false}>
          <DialogTitle>{i18n.t("Rename file")}</DialogTitle>
          <DialogDescription>{i18n.t("Wait for the current file operation to finish.")}</DialogDescription>
        </DialogContent>
      </Dialog>
      <UnsavedChangesDialog
        open={continuation !== null}
        pending={continuationPending}
        documentName={splitDocumentPath(continuation?.session.openedPath ?? "").name}
        hasDrafts={continuation?.session.draftActive ?? false}
        readOnly={continuation?.session.kind === "native" && continuation.session.view === "read"}
        finalFocus={() => continuationReturnFocus.current?.isConnected ? continuationReturnFocus.current
          : (activeId ? globalThis.document.getElementById(`tab-${activeId}`) : globalThis.document.querySelector<HTMLElement>('[data-testid="document-start"] button')) ?? true}
        onSave={() => void continueSession(true)}
        onDiscard={() => void continueSession(false)}
        onCancel={() => { if (!continuationRunning.current) setContinuation(null); }}
      />
      <NewDialog
        kind="folder"
        open={newFolderDialog}
        destinations={newDestinations(folders.trees)}
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
            <DialogDescription render={<div />} className="grid gap-4 [overflow-wrap:anywhere]">
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

/** Unique New locations in opened-folder/tree order; the first tree supplies each path's label. */
function newDestinations(trees: readonly FolderTreeState[]): NewDestination[] {
  const seen = new Set<string>();
  return trees.flatMap(tree => {
    const separator = tree.root.includes("\\") ? "\\" : "/";
    const name = splitDocumentPath(tree.root).name || tree.root;
    const prefix = tree.root.endsWith(separator) ? tree.root : tree.root + separator;
    const base = name.endsWith(separator) ? name : name + separator;
    return knownFolders(tree).filter(path => {
      if (seen.has(path)) return false;
      seen.add(path);
      return true;
    }).map(path => ({ path, label: path === tree.root ? name : base + path.slice(prefix.length) }));
  });
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
async function browseHostFolder(path: string, files?: "image" | "pdf"): Promise<FolderBrowseResponse> {
  const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/folder-browse?${new URLSearchParams({ path, ...(files ? { files } : {}) })}`);
  const payload = (await response.json()) as Partial<FolderBrowseResponse> & Partial<DocumentErrorResponse>;
  if (!response.ok || !Array.isArray(payload.entries) || !Array.isArray(payload.crumbs)) throw new Error(payload.error ?? `request failed (${response.status})`);
  return payload as FolderBrowseResponse;
}

const browseHostImages = (path: string) => browseHostFolder(path, "image");
const browseHostPdfs = (path: string) => browseHostFolder(path, "pdf");

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
