import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import { Fragment, memo, useLayoutEffect, useState, type CSSProperties } from "react";
import type { DocumentFileResponse, EditorFileResponse } from "../shared/document-protocol.ts";
import { TextDocumentTab, type TextSession, type TextSessionSnapshot } from "./TextDocumentTab.tsx";
import { DocumentEditor } from "./DocumentEditor.tsx";
import type { ImageRenamer } from "./image-rename.ts";
import { EditorVisibility } from "./editor-visibility.ts";
import { NotificationScope } from "./components/ui/notification-center.tsx";
import { MessageArea } from "./shell/MessageArea.tsx";
import { splitDocumentPath } from "./shell/document-path.ts";
import { useDocumentSession, type DocumentSession, type DocumentSessionSnapshot } from "./useDocumentSession.ts";

export type EditorSession = DocumentSession | TextSession;
export type SessionSnapshot = DocumentSessionSnapshot | TextSessionSnapshot;
type TabProps = {
  settingsDisabled: boolean;
  id: string;
  file: EditorFileResponse;
  restored?: SessionSnapshot;
  recoveryId: string;
  active: boolean;
  focused: boolean;
  groupIndex: number;
  onFocus(id: string): void;
  onReveal(id: string): void;
  report(id: string, session: EditorSession | null): void;
  onAssetChange(documentPath: string, assetPath: string): void;
  renameImage: ImageRenamer;
};

/** Reclassification on Reload starts the corresponding editor; Save never swaps editors. */
export const DocumentTab = memo(function DocumentTab(props: TabProps) {
  const [replacement, setReplacement] = useState<{ file: EditorFileResponse; generation: number } | null>(null);
  const replaceFile = (file: EditorFileResponse) => setReplacement(previous => ({ file, generation: (previous?.generation ?? 0) + 1 }));
  const file = replacement?.file ?? props.file;
  const restored = replacement ? undefined : props.restored;
  if (file.kind === "text") return <TextDocumentTab {...props} key={`text-${replacement?.generation ?? 0}`} file={file}
    restored={restored?.kind === "text" ? restored : undefined} replaceFile={replaceFile} />;
  return <NativeDocumentTab {...props} key={`native-${replacement?.generation ?? 0}`} file={file} restored={restored?.kind !== "text" ? restored : undefined} replaceFile={replaceFile} />;
});

const NativeDocumentTab = memo(function NativeDocumentTab({ settingsDisabled, id, file, restored, recoveryId, active, focused, groupIndex, onFocus, report, onAssetChange, renameImage, onReveal, replaceFile }:
  Omit<TabProps, "file" | "restored"> & { file: DocumentFileResponse; restored?: DocumentSessionSnapshot; replaceFile(file: EditorFileResponse): void }) {
  useTranslation();
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const session = useDocumentSession(file, restored, recoveryId, onAssetChange, renameImage, replaceFile);
  useLayoutEffect(() => { if (!focused && session.noticeAction) session.setNotice(""); }, [focused]);
  useLayoutEffect(() => { report(id, session); });
  useLayoutEffect(() => () => report(id, null), [id, report]);
  return (
    <NotificationScope value={{ name: splitDocumentPath(session.openedPath).name, reveal(action) {
      onReveal(id);
      session.setView("visual");
      requestAnimationFrame(() => { if (session.isCurrent()) action(); });
    } }}>
    <MessageArea error={session.error} errorCause={session.errorCause} notice={session.notice} noticeCause={session.noticeCause} noticeAction={session.noticeAction}
      warnings={session.recoveryError ? [{ id: "document-recovery", message: session.recoveryError }] : []} documentNotice={session.documentNotice}
      saveError={session.saveFailure ? { failure: session.saveFailure, locations: session.saveLocations,
        onReveal(index) { onReveal(id); requestAnimationFrame(() => session.revealSaveLocation(index)); } } : undefined}
      onReveal={() => session.editorRef.current?.focusEnd(0)} onNoticeExpired={() => session.setNotice("")} />
    <div className="document-scroll" role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={!active} inert={!active}
      data-document-tab={id} data-active={focused ? "true" : "false"} data-visible={active ? "true" : "false"} data-group-index={groupIndex}
      style={{ "--editor-group-index": groupIndex } as CSSProperties}
      onFocusCapture={() => onFocus(id)} onPointerDownCapture={() => onFocus(id)}>
      <div className="document-column">
        {session.view === "source" ? (
          <article className="document source-view" data-testid="source-view" aria-label={i18n.t("Markdown source")}>
            <pre className="source-view-text"><SourceLines markdown={session.sourceMarkdown} /></pre>
          </article>
        ) : null}
        <div hidden={session.view === "source"}>
          <EditorVisibility value={active && session.view === "visual"}>
            <DocumentEditor key={session.editorGeneration} ref={session.editorRef}
              settingsExpanded={settingsExpanded} onSettingsExpandedChange={setSettingsExpanded} settingsDisabled={settingsDisabled || session.busy}
              document={session.document} bibliography={session.bibliography} initialSnapshot={session.initialEditorSnapshot} documentPath={session.openedPath} {...session.editorCallbacks} />
          </EditorVisibility>
        </div>
      </div>
    </div>
    </NotificationScope>
  );
});

/**
 * One span per line, so CSS can number lines in the gutter. The numbers are generated content:
 * the text, and what Copy takes from it, stays the Markdown exactly.
 */
function SourceLines({ markdown }: { markdown: string }) {
  const lines = markdown.split("\n");
  const trailing = lines.length > 1 && lines.at(-1) === "";
  if (trailing) lines.pop();
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>{index > 0 ? "\n" : null}<span className="source-line">{line}</span></Fragment>
      ))}
      {trailing ? "\n" : null}
    </>
  );
}
