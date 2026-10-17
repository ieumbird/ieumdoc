import { Fragment, memo, useLayoutEffect } from "react";
import type { DocumentFileResponse } from "../shared/document-protocol.ts";
import { DocumentEditor } from "./DocumentEditor.tsx";
import { EditorVisibility } from "./editor-visibility.ts";
import { useDocumentSession, type DocumentSession } from "./useDocumentSession.ts";

/** One mounted hook/editor per tab. Reporting shell state never replaces the editor. */
export const DocumentTab = memo(function DocumentTab({ id, file, active, report }: {
  id: string;
  file: DocumentFileResponse;
  active: boolean;
  report(id: string, session: DocumentSession | null): void;
}) {
  const session = useDocumentSession(file);
  useLayoutEffect(() => { report(id, session); });
  useLayoutEffect(() => () => report(id, null), [id, report]);
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={!active} inert={!active}
      data-document-tab={id} data-active={active ? "true" : "false"}>
      {session.view === "source" ? (
        <article className="document source-view" data-testid="source-view" aria-label="Markdown source">
          <pre className="source-view-text"><SourceLines markdown={session.sourceMarkdown} /></pre>
        </article>
      ) : null}
      <div hidden={session.view === "source"}>
        <EditorVisibility value={active && session.view === "visual"}>
          <DocumentEditor key={session.editorGeneration} ref={session.editorRef}
            document={session.document} documentPath={session.openedPath} {...session.editorCallbacks} />
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
