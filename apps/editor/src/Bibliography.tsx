import { useMemo, useRef, useState, type ReactNode } from "react";
import { closeHistory } from "@tiptap/pm/history";
import { Button } from "@/components/ui/button.tsx";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { evaluateBibliography } from "@ieumdoc/core/bibliography";
import type { DocumentFileResponse, FolderResponse } from "../shared/document-protocol.ts";
import { citationNumbers, BibliographyContext, bibliographyState } from "./citation.tsx";
import { i18n } from "./i18n.ts";

/** Citable entries follow the last loaded resource snapshot, never staged declarations. */
export function useBibliographyEntries(bibliography: DocumentFileResponse["bibliography"]) {
  return useMemo(() => bibliography
    ? evaluateBibliography({ bibliography: bibliography.declarations, citations: [] }, bibliography.sources ?? []).entries
    : undefined, [bibliography]);
}

/** References and connection controls sit outside editable content, after canonical endnotes. */
export function BibliographyContent({ editor, bibliography, documentPath, children }: {
  editor: Editor; bibliography: DocumentFileResponse["bibliography"]; documentPath: string; children: ReactNode;
}) {
  useTranslation();
  const paths = useEditorState({ editor, selector: ({ editor: current }) => current.state.doc.attrs.bibliography as string[] | null });
  const declared = paths ?? bibliography?.declarations ?? [];
  const pending = JSON.stringify(declared) !== JSON.stringify(bibliography?.declarations ?? []);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const connectButton = useRef<HTMLButtonElement>(null);
  const change = (next: string[]) => {
    editor.view.dispatch(closeHistory(editor.state.tr).setDocAttribute("bibliography", next));
    editor.view.dispatch(closeHistory(editor.state.tr));
    connectButton.current?.focus();
  };
  const list = async () => {
    setLoading(true); setError(false);
    try {
      // One level of the existing listing, in the document's own directory. The Host
      // still decides whether the saved declarations can be read; no text preview route.
      const folder = documentPath.slice(0, Math.max(documentPath.lastIndexOf("/"), documentPath.lastIndexOf("\\")) + 1);
      const response = await fetch(`${import.meta.env?.BASE_URL ?? "/"}api/folder?${new URLSearchParams({ root: folder })}`);
      const result = await response.json() as FolderResponse;
      if (!response.ok || !Array.isArray(result.entries)) throw new Error();
      setCandidates(result.entries.filter(entry => entry.kind === "file" && entry.name.endsWith(".bib")).map(entry => entry.name));
    } catch { setError(true); }
    finally { setLoading(false); }
  };
  const numbering = useEditorState({ editor, selector: ({ editor: current }) => JSON.stringify([...citationNumbers(current.state.doc)]) });
  const evaluation = useMemo(() => {
    if (!bibliography) return undefined;
    const numbered = JSON.parse(numbering) as [string, number][];
    return evaluateBibliography({ bibliography: bibliography?.declarations ?? [], citations: numbered.map(([key, number]) => ({
      path: [], role: "cite", keys: [key], numbers: [number], text: `[${number}]`,
    })) }, bibliography?.sources ?? []);
  }, [bibliography, numbering]);
  const shown = (evaluation?.references.length ?? 0) > 0 || (bibliography?.declarations.length ?? 0) > 0 || declared.length > 0 || candidates !== null || loading || error;
  return <BibliographyContext value={evaluation}>
    {children}
    <section className={shown ? "bibliography-region" : "bibliography-connect"} aria-label={i18n.t("Bibliography references")} data-testid="bibliography">
      {shown ? <h2>{i18n.t("Bibliography references")}</h2> : null}
      <Button ref={connectButton} variant="ghost" size="sm" disabled={loading} aria-expanded={candidates !== null} onClick={() => candidates === null ? void list() : setCandidates(null)}>{i18n.t("Connect bibliography…")}</Button>
      {declared.length ? <ul className="bibliography-files">{declared.map(source => <li key={source}>
        <span>{source}</span><Button variant="ghost" size="sm" aria-label={i18n.t("Disconnect {{file}}", { file: source })} onClick={() => change(declared.filter(path => path !== source))}>{i18n.t("Disconnect")}</Button>
      </li>)}</ul> : null}
      {candidates !== null ? <div className="bibliography-choices" role="group" aria-label={i18n.t("Bibliography files in this folder")}>
        <p className="bibliography-status">{i18n.t("Bibliography files in this folder")}</p>
        {candidates.filter(source => !declared.includes(source)).map(source => <Button key={source} variant="outline" size="sm" aria-label={i18n.t("Connect {{file}}", { file: source })} onClick={() => { change([...declared, source]); setCandidates(null); }}>{source}</Button>)}
        {!candidates.some(source => !declared.includes(source)) ? <p className="bibliography-status">{i18n.t("No more .bib files in this folder.")}</p> : null}
      </div> : null}
      {error ? <p className="bibliography-status" role="alert">{i18n.t("The bibliography files could not be listed. Try again.")}</p> : null}
      {pending ? <p className="bibliography-status" role="status">{i18n.t("Save this document to load the connected bibliography files.")}</p> : null}
      {shown ? <p className="bibliography-status">{i18n.t("If you edit a .bib file in another app, save your document, then choose Reload to update its references.")}</p> : null}
      {evaluation && !evaluation.readiness.complete ? <p className="bibliography-status" role="status">{i18n.t("References are incomplete. You can still save this document.")}</p> : null}
      <ol className="bibliography-list">
        {evaluation?.references.map(reference => <li key={reference.key} data-key={reference.key} data-readiness={reference.status}>
          <span className="bibliography-number">[{reference.number}]</span>
          <div><span>{reference.parts.map((part, index) => part.emphasis ? <em key={index}>{part.text}</em> : part.text)}</span>
            {reference.status !== "complete" ? <span className="bibliography-status">{bibliographyState(reference.status)} · {reference.key}</span> : null}
          </div>
        </li>)}
      </ol>
      {evaluation?.readiness.diagnostics.some(d => d.source && !d.key) ? <ul className="bibliography-status bibliography-resources">
        {evaluation.readiness.diagnostics.filter(d => d.source && !d.key).map((d, index) => <li key={index}>{d.source}: {i18n.t("Bibliography could not be verified")}</li>)}
      </ul> : null}
    </section>
  </BibliographyContext>;
}
