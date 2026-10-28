import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import { Fragment, memo, useLayoutEffect, useState } from "react";
import type { DocumentFileResponse } from "../shared/document-protocol.ts";
import { DocumentEditor } from "./DocumentEditor.tsx";
import { ProposalReview } from "./ProposalReview.tsx";
import type { AiProposal } from "./ai.ts";
import { EditorVisibility } from "./editor-visibility.ts";
import { useDocumentSession, type DocumentSession, type DocumentSessionSnapshot } from "./useDocumentSession.ts";

/** One mounted hook/editor per tab. Reporting shell state never replaces the editor. */
export const DocumentTab = memo(function DocumentTab({ settingsDisabled, id, file, restored, recoveryId, active, report, onAssetChange, proposal, onProposalDone }: {
  settingsDisabled: boolean;
  id: string;
  file: DocumentFileResponse;
  restored?: DocumentSessionSnapshot;
  recoveryId: string;
  active: boolean;
  report(id: string, session: DocumentSession | null): void;
  onAssetChange(documentPath: string, assetPath: string): void;
  /** SPIKE: an AI edit proposal under review replaces the editor until it is applied or discarded. */
  proposal?: AiProposal;
  onProposalDone(id: string): void;
}) {
  useTranslation();
  const [settingsExpanded, setSettingsExpanded] = useState(false);
  const session = useDocumentSession(file, restored, recoveryId, onAssetChange);
  useLayoutEffect(() => { if (!active && session.noticeAction) session.setNotice(""); }, [active]);
  useLayoutEffect(() => { report(id, session); });
  useLayoutEffect(() => () => report(id, null), [id, report]);
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={!active} inert={!active}
      data-document-tab={id} data-active={active ? "true" : "false"}>
      {session.view === "source" ? (
        <article className="document source-view" data-testid="source-view" aria-label={i18n.t("Markdown source")}>
          <pre className="source-view-text"><SourceLines markdown={session.sourceMarkdown} /></pre>
        </article>
      ) : null}
      {proposal && session.view !== "source" ? <ProposalReview proposal={proposal} documentPath={session.openedPath} onDone={async written => {
        if (written) await session.reloadFromDisk();
        onProposalDone(id);
      }} /> : null}
      <div hidden={session.view === "source" || Boolean(proposal)}>
        <EditorVisibility value={active && session.view === "visual"}>
          <DocumentEditor key={session.editorGeneration} ref={session.editorRef}
            settingsExpanded={settingsExpanded} onSettingsExpandedChange={setSettingsExpanded} settingsDisabled={settingsDisabled || session.busy}
            document={session.document} bibliography={session.bibliography} initialSnapshot={session.initialEditorSnapshot} documentPath={session.openedPath} {...session.editorCallbacks} />
        </EditorVisibility>
      </div>
    </div>
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
