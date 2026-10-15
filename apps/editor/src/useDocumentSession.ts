import { useEffect, useMemo, useRef, useState } from "react";
import type { EditableDocument } from "@ieumdoc/core";
import type { DocumentFileResponse, DocumentStartResponse, SaveRequest, SupportedEdits } from "../shared/document-protocol.ts";
import { SaveContentError } from "../shared/save-error.ts";
import type { DocumentEditorHandle } from "./DocumentEditor.tsx";
import type { ImageChoice, ImageChooser } from "./editor-schema.tsx";
import { chooseHostImage, rollbackAsset } from "./image-assets.ts";
import { createOutlineStore, type OutlineItem } from "./outline.ts";
import { saveErrorMessage } from "./save-error.ts";
import type { DocumentView } from "./shell/TopBar.tsx";
import { collectSupportedEdits, type TiptapJSON } from "./tiptap-document.ts";
import { createDocumentSessionLifetime, messageOf, NativeOpenError, requestDocument, requestSave, requestSource, SaveConflictError, validateFigure } from "./document-session.ts";

/** Shown until the first Save of a source whose endnote definitions canonical write moves. */
const ENDNOTES_MOVE_NOTICE = "Save moves this file's endnote definitions after the body, in the order of their first reference, keeping each label and text. Source shows the Markdown Save writes.";

/** One document's state and operations. The shell owns the shared work-loss confirmation. */
export function useDocumentSession(start: DocumentStartResponse | null, onStart: (start: DocumentStartResponse | null) => void) {
  const editorRef = useRef<DocumentEditorHandle>(null);
  const [document, setDocument] = useState<EditableDocument | null>(null);
  const [sourceRevision, setSourceRevision] = useState("");
  const sessionBase = useRef<SaveRequest["base"] | undefined>(undefined);
  const [openedPath, setOpenedPath] = useState("");
  const [headingNumbering, setHeadingNumbering] = useState(false);
  const [reloadDialog, setReloadDialog] = useState(false);
  const [openRefusal, setOpenRefusal] = useState<{ path: string; reason: string; action: string } | null>(null);
  const openRefusalReturnFocus = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
  const lifetime = useRef(createDocumentSessionLifetime()).current;
  const isCurrent = useMemo(() => lifetime.capture(), [lifetime, editorGeneration]);
  // A Figure's Choose… opens the image picker; its promise settles when the picker closes.
  const [imageChoice, setImageChoice] = useState<{ documentPath: string; resolve(choice?: ImageChoice): void } | null>(null);
  const imageChoiceRef = useRef(imageChoice);
  const imageReturnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // StrictMode's effect cleanup/setup must not revive callbacks from the first setup.
    setEditorGeneration(lifetime.activate());
    void load();
    return () => {
      lifetime.dispose();
      imageChoiceRef.current?.resolve(undefined);
      imageChoiceRef.current = null;
    };
  }, []);

  // Stable for one editor lifetime, including its NodeViews and asynchronous asset callbacks.
  const editorCallbacks = useMemo(() => {
    const chooseImage: ImageChooser = (documentPath, returnFocus) => new Promise(resolve => {
      if (!isCurrent()) { resolve(undefined); return; }
      imageReturnFocus.current = returnFocus.current;
      imageChoiceRef.current = { documentPath, resolve };
      setImageChoice(imageChoiceRef.current);
    });
    return {
      onDraftChange: (active: boolean) => { if (isCurrent()) setDraftActive(active); },
      onAssetPendingChange: (active: boolean) => { if (isCurrent()) setAssetPending(active); },
      onAssetError: (reason: string) => { if (isCurrent()) setError(reason); },
      onDirtyChange: (dirty: boolean) => { if (isCurrent()) setDocumentDirty(dirty); },
      onHeadingNumberingChange: (enabled: boolean) => { if (isCurrent()) setHeadingNumbering(enabled); },
      onOutlineChange: (outline: Parameters<typeof outlineStore.set>[0]) => { if (isCurrent()) outlineStore.set(outline); },
      validateFigure,
      chooseImage,
      onStructuralReject: (reason?: string) => {
        if (isCurrent()) setNotice(reason ?? "This change cannot preserve the supported document structure. Your document is unchanged.");
      },
    };
  }, [isCurrent, outlineStore]);
  // A pending Source preview belongs to the open document, so it blocks document switches too.
  const busy = status === "Loading…" || status === "Opening…" || status === "Creating…" || status === "Saving…" ||
    sourcePending || assetPending;
  // A close can arrive after the rendered status changed but before passive effects ran.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const switching = status === "Loading…" || status === "Opening…" || status === "Creating…";

  function acceptDocument(next: DocumentFileResponse): void {
    setEditorGeneration(lifetime.replace());
    imageChoiceRef.current?.resolve(undefined);
    imageChoiceRef.current = null;
    setImageChoice(null);
    onStart(null);
    setDocument(next.document);
    sessionBase.current = { source: next.source };
    setEndnotesMove(!next.endnotesInPlace);
    setSourceRevision(next.revision);
    setOpenedPath(next.path);
    setDraftActive(false);
    setAssetPending(false);
    setDocumentDirty(false);
    setSourcePending(false);
    setSourceMarkdown("");
    setView("visual");
    setStatus("Ready");
  }

  /** Error message, "" on success, or null for a dialog refusal or superseded request. */
  async function load(requestedPath?: string, openReturnFocus?: HTMLElement | null, openedNotice = ""): Promise<string | null> {
    if (requestedPath && !isCurrent()) return null;
    const current = lifetime.beginOpen();
    setError("");
    setNotice("");
    setStatus(requestedPath ? "Opening…" : "Loading…");
    try {
      const next = await requestDocument("GET", requestedPath);
      if (!current()) return null;
      setReloadDialog(false);
      if ("start" in next) {
        onStart(next);
        setStatus("Ready");
        return "";
      }
      acceptDocument(next);
      setNotice(openedNotice);
      return "";
    } catch (cause) {
      if (!current()) return null;
      setReloadDialog(false);
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

  async function save(): Promise<boolean> {
    if (!isCurrent() || !document || !editorRef.current || !openedPath || !sessionBase.current || busy) return false;
    const editor = editorRef.current;
    const base = sessionBase.current;
    setError("");
    setNotice("");
    setStatus("Saving…");
    let submitted: TiptapJSON | undefined;
    let payload: SupportedEdits | undefined;
    try {
      submitted = editor.beginSave();
      payload = collectSupportedEdits(document, submitted);
      const next = await requestSave({ path: openedPath, revision: sourceRevision, base, ...payload });
      if (!isCurrent()) return false;
      setSourceRevision(next.revision);
      setEndnotesMove(false);
      base.savedEdits = payload;
      editor.finishSave(true);
      const hasPendingUserState = editor.hasUnsavedChanges();
      setStatus(hasPendingUserState ? "Saved; newer edits pending" : "Saved");
      return true;
    } catch (cause) {
      if (!isCurrent()) return false;
      editor.finishSave();
      const failure = cause instanceof SaveContentError ? cause
        : new SaveContentError(messageOf(cause), undefined, { phase: "collect", cause });
      setError(saveErrorMessage(failure, submitted, payload));
      setStatus(cause instanceof SaveConflictError ? "Save conflict" : "Save failed");
      return false;
    }
  }

  /**
   * Shows the canonical Markdown the current editor state would save as. The Host runs
   * the Save request through Core without writing; any failure keeps the Visual view.
   */
  async function showSource(): Promise<void> {
    if (!isCurrent() || !document || !editorRef.current || !openedPath || !sessionBase.current || busy) return;
    setError("");
    setSourcePending(true);
    try {
      const payload = collectSupportedEdits(document, editorRef.current.getDocument());
      const markdown = await requestSource({ path: openedPath, revision: sourceRevision, base: sessionBase.current, ...payload });
      if (!isCurrent()) return;
      setSourceMarkdown(markdown);
      setView("source");
    } catch (cause) {
      if (isCurrent()) setError(`Source view unavailable: ${messageOf(cause)}`);
    } finally {
      if (isCurrent()) setSourcePending(false);
    }
  }

  async function createFile(path: string): Promise<string> {
    if (!isCurrent()) return "The document session is no longer active.";
    const requestedPath = path.trim();
    if (!requestedPath) return "Enter a Markdown file path.";
    if (!requestedPath.toLowerCase().endsWith(".md")) return "Only .md files can be created.";
    if (busy) return "Wait for the current operation to finish.";
    const current = lifetime.beginOpen();
    // New's sole entry point confirms work loss before showing the modal filename form.
    // Keep the old session until exclusive creation succeeds, including its drafts on failure.
    setError("");
    setNotice("");
    setStatus("Creating…");
    try {
      const next = await requestDocument("PUT", requestedPath);
      if (!current()) return "The document session is no longer active.";
      acceptDocument(next);
      return "";
    } catch (cause) {
      if (!current()) return "The document session is no longer active.";
      const message = messageOf(cause);
      setError(message);
      setStatus("Create failed");
      return message;
    }
  }

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
  /** Outline navigation always lands in the Visual view, where the heading is. */
  function revealHeading(item: OutlineItem): void {
    if (view === "visual") {
      editorRef.current?.revealHeading(item);
      return;
    }
    setView("visual");
    requestAnimationFrame(() => { if (isCurrent()) editorRef.current?.revealHeading(item); });
  }

  async function reload(): Promise<void> {
    if (!isCurrent() || busy || !openedPath) return;
    if (editorRef.current?.hasUnsavedChanges()) {
      setReloadDialog(true);
      return;
    }
    await reloadFromDisk();
  }

  async function reloadFromDisk(): Promise<void> {
    if (!isCurrent()) return;
    // Keep a modal boundary during the read, so newly typed input cannot race a reload.
    setReloadDialog(true);
    const message = await load(openedPath);
    // load closes only its own modal; a superseded read returns no error to report.
    if (message && isCurrent()) setError(message);
  }

  async function selectImage(source: string): Promise<string> {
    if (!imageChoice || !isCurrent()) return "";
    const { documentPath, resolve } = imageChoice;
    try {
      const { path, rollbackToken } = await chooseHostImage(documentPath, source);
      // A copy no Figure ends up using is removed; a linked image is never touched.
      const discard = rollbackToken === undefined ? undefined : () => void rollbackAsset({ path, rollbackToken }, documentPath).catch((cause: unknown) => {
        if (isCurrent()) setError(`The unused copied image remains at ${path}: ${messageOf(cause)}`);
      });
      if (!isCurrent() || imageChoiceRef.current !== imageChoice) {
        discard?.();
        resolve(undefined);
        return "";
      }
      resolve({ path, ...(discard ? { discard } : {}) });
      return "";
    } catch (cause) {
      return isCurrent() && imageChoiceRef.current === imageChoice ? messageOf(cause) : "";
    }
  }
  function closeImageChoice(): void {
    if (!isCurrent() || imageChoiceRef.current !== imageChoice) return;
    imageChoice?.resolve(undefined);
    imageChoiceRef.current = null;
    setImageChoice(null);
  }

  return {
    editorRef, document, openedPath, headingNumbering, outlineStore, editorGeneration, isCurrent,
    view, setView, sourceMarkdown, status, setStatus, error, setError, notice, setNotice,
    draftActive, assetPending, documentDirty, busy, switching, busyRef, draftNotice,
    documentNotice: endnotesMove ? ENDNOTES_MOVE_NOTICE : "",
    load, createFile, save, showSource, reload, reloadFromDisk, reloadDialog, setReloadDialog,
    pendingWork, revealHeading, openRefusal, setOpenRefusal, openRefusalReturnFocus,
    imageChoice, imageReturnFocus, selectImage, closeImageChoice,
    editorCallbacks,
  };
}

export type DocumentSession = ReturnType<typeof useDocumentSession>;
