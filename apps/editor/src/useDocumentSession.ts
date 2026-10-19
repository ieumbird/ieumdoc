import type { UiMessage } from "./ui-message.ts";
import { useMessageState } from "./ui-message.ts";
import { i18n } from "./i18n.ts";
import { type Operation } from "./operation.ts";
import { createRecoveryRecorder } from "./recovery-storage.ts";
import type { EditorSnapshot } from "./editor-snapshot.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EditableDocument } from "@ieumdoc/core";
import type { DocumentFileResponse, SaveRequest, SupportedEdits } from "../shared/document-protocol.ts";
import { SaveContentError } from "../shared/save-error.ts";
import type { DocumentEditorHandle } from "./DocumentEditor.tsx";
import type { ImageChoice, ImageChooser } from "./editor-schema.tsx";
import { chooseHostImage, rollbackAsset } from "./image-assets.ts";
import { createOutlineStore, type OutlineItem } from "./outline.ts";
import { SaveDisplayError } from "./save-error.ts";
import type { DocumentView } from "./shell/TopBar.tsx";
import { collectSupportedEdits, type TiptapJSON } from "./tiptap-document.ts";
import { createDocumentSessionLifetime, messageOf, requestDocument, requestSave, requestSource, SaveConflictError, validateFigure } from "./document-session.ts";

/** Shown until the first Save of a source whose endnote definitions canonical write moves. */
const ENDNOTES_MOVE_NOTICE = "Save moves this file's endnote definitions after the body, in the order of their first reference, keeping each label and text. Source shows the Markdown Save writes.";

/** Opening model/source plus the acknowledged disk checkpoint and applied engine snapshots.
 * Shared by client recovery and the internal initialization tests. */
export type DocumentSessionSnapshot = {
  file: DocumentFileResponse;
  editor: EditorSnapshot;
  savedEdits?: SupportedEdits;
};

/** One document's state and operations. The shell owns the shared work-loss confirmation. */
export function useDocumentSession(initial: DocumentFileResponse, restored?: Pick<DocumentSessionSnapshot, "editor" | "savedEdits">, recoveryId?: string) {
  const [initialEditorSnapshot, setInitialEditorSnapshot] = useState(() => restored?.editor && structuredClone(restored.editor));
  const editorRef = useRef<DocumentEditorHandle>(null);
  const [recoveryError, setRecoveryError] = useMessageState("");
  const captureRef = useRef<() => DocumentSessionSnapshot | null>(() => null);
  const [recorder] = useState(() => recoveryId ? createRecoveryRecorder(recoveryId, () => captureRef.current(),
    cause => setRecoveryError({ key: "Local recovery is unavailable: {{reason}}. Keep this window open and save or copy your work. Changes after the last record may be lost.", values: { reason: messageOf(cause) } }),
    () => setRecoveryError("")) : undefined);
  const [document, setDocument] = useState<EditableDocument>(initial.document);
  const sourceRevision = useRef(initial.revision);
  const [initialBase] = useState<SaveRequest["base"]>(() => ({
    source: initial.source, ...(restored?.savedEdits ? { savedEdits: structuredClone(restored.savedEdits) } : {}),
  }));
  const sessionBase = useRef(initialBase);
  const [openedPath, setOpenedPath] = useState(initial.path);
  const [headingNumbering, setHeadingNumbering] = useState(false);
  const [reloadDialog, setReloadDialog] = useState(false);
  const [status, setStatus] = useState<Operation>("ready");
  const [error, setError] = useMessageState("");
  const [notice, setNotice] = useMessageState("");
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [draftActive, setDraftActive] = useState(false);
  const [assetPending, setAssetPending] = useState(false);
  const [documentDirty, setDocumentDirty] = useState(false);
  // Outline changes on scrolling re-render the outline only, never the App and its editor.
  const outlineStore = useRef(createOutlineStore()).current;
  // The opened source writes endnote definitions elsewhere than canonical write puts them; the
  // first Save moves them. Opening never writes and does not make the document dirty.
  const [endnotesMove, setEndnotesMove] = useState(!initial.endnotesInPlace);
  const draftNotice = draftActive
    ? i18n.t("Save and Source include applied content only. Block property drafts remain unsaved until Apply.")
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
    if (restored) recorder?.edit();
    return () => {
      recorder?.cancel();
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
      onAppliedEdit: () => { if (isCurrent()) recorder?.edit(); },
      onDirtyChange: (dirty: boolean) => { if (isCurrent()) setDocumentDirty(dirty); },
      onHeadingNumberingChange: (enabled: boolean) => { if (isCurrent()) setHeadingNumbering(enabled); },
      onOutlineChange: (outline: Parameters<typeof outlineStore.set>[0]) => { if (isCurrent()) outlineStore.set(outline); },
      validateFigure,
      chooseImage,
      onStructuralReject: (reason?: UiMessage) => {
        if (isCurrent()) setNotice(reason ?? { key: "This change cannot preserve the supported document structure. Your document is unchanged." });
      },
    };
  }, [isCurrent, outlineStore]);
  // A pending Source preview belongs to the open document, so it blocks document switches too.
  const busy = status === "loading" || status === "opening" || status === "creating" || status === "saving" ||
    sourcePending || assetPending;
  // A close can arrive after the rendered status changed but before passive effects ran.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const switching = status === "loading" || status === "opening" || status === "creating";

  function acceptDocument(next: DocumentFileResponse): void {
    setEditorGeneration(lifetime.replace());
    imageChoiceRef.current?.resolve(undefined);
    imageChoiceRef.current = null;
    setImageChoice(null);
    setDocument(next.document);
    setInitialEditorSnapshot(undefined);
    sessionBase.current = { source: next.source };
    setEndnotesMove(!next.endnotesInPlace);
    sourceRevision.current = next.revision;
    setOpenedPath(next.path);
    setDraftActive(false);
    setAssetPending(false);
    setDocumentDirty(false);
    setSourcePending(false);
    setSourceMarkdown("");
    setView("visual");
    setStatus("ready");
  }

  /** Error message, "" on success, or null for a dialog refusal or superseded request. */
  async function load(requestedPath: string): Promise<string | null> {
    if (!isCurrent()) return null;
    const current = lifetime.beginOpen();
    setError("");
    setNotice("");
    setStatus(requestedPath ? "opening" : "loading");
    try {
      const next = await requestDocument("GET", requestedPath);
      if (!current()) return null;
      setReloadDialog(false);
      if ("start" in next) throw new Error("The Host did not return a document.");
      recorder?.discard();
      acceptDocument(next);
      return "";
    } catch (cause) {
      if (!current()) return null;
      setReloadDialog(false);
      const message = messageOf(cause);
      setStatus("open-failed");
      return message;
    }
  }

  async function save(): Promise<boolean> {
    if (!isCurrent() || !document || !editorRef.current || !openedPath || !sessionBase.current || busy) return false;
    const editor = editorRef.current;
    const base = sessionBase.current;
    setError("");
    setNotice("");
    setStatus("saving");
    let submitted: TiptapJSON | undefined;
    let payload: SupportedEdits | undefined;
    try {
      submitted = editor.beginSave();
      payload = collectSupportedEdits(document, submitted);
      const next = await requestSave({ path: openedPath, revision: sourceRevision.current, base, ...payload });
      if (!isCurrent()) return false;
      sourceRevision.current = next.revision;
      setEndnotesMove(false);
      base.savedEdits = payload;
      editor.finishSave(true);
      if (editor.hasDocumentChanges()) recorder?.checkpoint();
      else recorder?.discard();
      const hasPendingUserState = editor.hasUnsavedChanges();
      setStatus(hasPendingUserState ? "saved-pending" : "saved");
      return true;
    } catch (cause) {
      if (!isCurrent()) return false;
      editor.finishSave();
      const failure = cause instanceof SaveContentError ? cause
        : new SaveContentError(messageOf(cause), undefined, { phase: "collect", cause });
      setError(new SaveDisplayError(failure, submitted, payload));
      setStatus(cause instanceof SaveConflictError ? "save-conflict" : "save-failed");
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
      const markdown = await requestSource({ path: openedPath, revision: sourceRevision.current, base: sessionBase.current, ...payload });
      if (!isCurrent()) return;
      setSourceMarkdown(markdown);
      setView("source");
    } catch (cause) {
      if (isCurrent()) setError({ key: "Source view unavailable: {{reason}}", values: { reason: messageOf(cause) } });
    } finally {
      if (isCurrent()) setSourcePending(false);
    }
  }

  /**
   * Work an update restart would lose or interrupt, as the Desktop app asks before installing:
   * the same state that guards closing the page, with the reason to show.
   */
  function pendingWork(): string | null {
    if (!document || !editorRef.current) return i18n.t("The editor is not ready to restart.");
    if (status === "saving") return i18n.t("A save is in progress. Restart to update after it finishes.");
    if (assetPending) return i18n.t("An image is still being added. Restart to update after it finishes.");
    if (sourcePending || switching) return i18n.t("IeumDoc is still working on the document. Try again in a moment.");
    if (editorRef.current?.hasUnsavedChanges()) {
      return draftActive ? i18n.t("Apply or Cancel the open edits and save your changes, then restart to update.")
        : i18n.t("Save your changes, then restart to update.");
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
        if (isCurrent()) setError({ key: "The unused copied image remains at {{path}}: {{reason}}", values: { path: path, reason: messageOf(cause) } });
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

  function getSnapshot(): DocumentSessionSnapshot {
    if (!isCurrent() || !editorRef.current) throw new Error("Editor is not ready");
    return structuredClone({
      file: { path: openedPath, document, source: sessionBase.current.source, revision: sourceRevision.current, endnotesInPlace: sessionBase.current.savedEdits !== undefined || !endnotesMove },
      editor: editorRef.current.getSnapshot(),
      ...(sessionBase.current.savedEdits ? { savedEdits: sessionBase.current.savedEdits } : {}),
    });
  }

  captureRef.current = () => isCurrent() && editorRef.current?.hasDocumentChanges() ? getSnapshot() : null;

  return {
    recoveryError, discardRecovery: () => recorder?.discard(),
    getSnapshot, initialEditorSnapshot, editorRef, document, openedPath, headingNumbering, outlineStore, editorGeneration, isCurrent,
    view, setView, sourceMarkdown, status, setStatus, error, setError, notice, setNotice,
    draftActive, assetPending, documentDirty, busy, switching, busyRef, draftNotice,
    documentNotice: endnotesMove ? i18n.t(ENDNOTES_MOVE_NOTICE) : "",
    load, save, showSource, reload, reloadFromDisk, reloadDialog, setReloadDialog,
    pendingWork, revealHeading,
    imageChoice, imageReturnFocus, selectImage, closeImageChoice,
    editorCallbacks,
  };
}

export type DocumentSession = ReturnType<typeof useDocumentSession>;
