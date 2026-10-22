import { useMemo, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { evaluateBibliography } from "@ieumdoc/core/bibliography";
import type { DocumentFileResponse } from "../shared/document-protocol.ts";
import { citationNumbers, BibliographyContext, bibliographyState } from "./citation.tsx";
import { i18n } from "./i18n.ts";

/** Derived display only, outside ProseMirror's content and after its canonical endnotes. */
export function BibliographyContent({ editor, bibliography, children }: {
  editor: Editor; bibliography: DocumentFileResponse["bibliography"]; children: ReactNode;
}) {
  useTranslation();
  const numbering = useEditorState({ editor, selector: ({ editor: current }) => JSON.stringify([...citationNumbers(current.state.doc)]) });
  const evaluation = useMemo(() => {
    if (!bibliography) return undefined;
    const numbered = JSON.parse(numbering) as [string, number][];
    return evaluateBibliography({ bibliography: bibliography?.declarations ?? [], citations: numbered.map(([key, number]) => ({
      path: [], role: "cite", keys: [key], numbers: [number], text: `[${number}]`,
    })) }, bibliography?.sources ?? []);
  }, [bibliography, numbering]);
  if (!evaluation) return children; // Older recovery snapshots have no resource context: retain unchecked chips.
  const shown = evaluation.references.length > 0 || (bibliography?.declarations.length ?? 0) > 0;
  return <BibliographyContext value={evaluation}>
    {children}
    {shown ? <section className="bibliography-region" aria-label={i18n.t("Bibliography references")} data-testid="bibliography">
      <h2>{i18n.t("Bibliography references")}</h2>
      <p className="bibliography-status">{i18n.t("References use the snapshot from Open or Reload. Reload to see external changes.")}</p>
      {!evaluation.readiness.complete ? <p className="bibliography-status" role="status">{i18n.t("References are incomplete. You can still save this document.")}</p> : null}
      <ol className="bibliography-list">
        {evaluation.references.map(reference => <li key={reference.key} data-key={reference.key} data-readiness={reference.status}>
          <span className="bibliography-number">[{reference.number}]</span>
          <div><span>{reference.parts.map((part, index) => part.emphasis ? <em key={index}>{part.text}</em> : part.text)}</span>
            {reference.status !== "complete" ? <span className="bibliography-status">{bibliographyState(reference.status)} · {reference.key}</span> : null}
          </div>
        </li>)}
      </ol>
      {evaluation.readiness.diagnostics.some(d => d.source && !d.key) ? <ul className="bibliography-status bibliography-resources">
        {evaluation.readiness.diagnostics.filter(d => d.source && !d.key).map((d, index) => <li key={index}>{d.source}: {i18n.t("Bibliography could not be verified")}</li>)}
      </ul> : null}
    </section> : null}
  </BibliographyContext>;
}
