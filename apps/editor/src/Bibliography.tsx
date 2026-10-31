import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { closeHistory } from "@tiptap/pm/history";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog.tsx";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { bibliographyError } from "@ieumdoc/core/citation";
import { evaluateBibliography } from "@ieumdoc/core/bibliography";
import type { DocumentFileResponse, FolderResponse } from "../shared/document-protocol.ts";
import { citationNumbers, BibliographyContext } from "./citation.tsx";
import { BibliographyReferenceText } from "./BibliographyReferenceText.tsx";
import { i18n } from "./i18n.ts";

/** Citable entries follow the last loaded resource snapshot, never staged declarations. */
export function useBibliographyEntries(bibliography: DocumentFileResponse["bibliography"]) {
  return useMemo(() => bibliography
    ? evaluateBibliography({ bibliography: bibliography.declarations, citations: [] }, bibliography.sources ?? []).entries
    : undefined, [bibliography]);
}

/** References and connection controls sit outside editable content, after canonical endnotes. */
export type BibliographyHandle = { connect(returnFocus: HTMLElement | null): void };

export const BibliographyContent = forwardRef<BibliographyHandle, {
  editor: Editor; bibliography: DocumentFileResponse["bibliography"]; documentPath: string; children: ReactNode;
}>(function BibliographyContent({ editor, bibliography, documentPath, children }, ref) {
  useTranslation();
  const editable = useEditorState({ editor, selector: ({ editor: current }) => current.isEditable });
  const paths = useEditorState({ editor, selector: ({ editor: current }) => current.state.doc.attrs.bibliography as string[] | null });
  const declared = paths ?? bibliography?.declarations ?? [];
  const pending = JSON.stringify(declared) !== JSON.stringify(bibliography?.declarations ?? []);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const connectButton = useRef<HTMLButtonElement>(null);
  const change = (next: string[]) => {
    if (!editor.isEditable) return;
    editor.view.dispatch(closeHistory(editor.state.tr).setDocAttribute("bibliography", next));
    editor.view.dispatch(closeHistory(editor.state.tr));
    if (!connectOpen) connectButton.current?.focus();
  };
  const connect = (target: HTMLElement | null) => {
    if (!editor.isEditable) return;
    returnFocus.current = target;
    setCandidates(null);
    setConnectOpen(true);
    void list();
  };
  useImperativeHandle(ref, () => ({ connect }));
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
  const available = candidates?.filter(source => !bibliographyError([...declared, source])) ?? [];
  const numbering = useEditorState({ editor, selector: ({ editor: current }) => JSON.stringify([...citationNumbers(current.state.doc)]) });
  const evaluation = useMemo(() => {
    if (!bibliography) return undefined;
    const numbered = JSON.parse(numbering) as [string, number][];
    return evaluateBibliography({ bibliography: bibliography?.declarations ?? [], citations: numbered.map(([key, number]) => ({
      path: [], role: "cite", keys: [key], numbers: [number], text: `[${number}]`,
    })) }, bibliography?.sources ?? []);
  }, [bibliography, numbering]);
  const shown = declared.length > 0 || JSON.parse(numbering).length > 0;
  return <BibliographyContext value={evaluation}>
    {children}
    {shown ? <section className="bibliography-region" aria-label={i18n.t("Bibliography references")} data-testid="bibliography">
      <h2>{i18n.t("Bibliography references")}</h2>
      {editable ? <Button ref={connectButton} variant="ghost" size="sm" onClick={event => connect(event.currentTarget)}>{i18n.t("Connect bibliography…")}</Button> : null}
      {declared.length ? <ul className="bibliography-files">{declared.map(source => <li key={source}>
        <span>{source}</span>{editable ? <Button variant="ghost" size="sm" aria-label={i18n.t("Disconnect {{file}}", { file: source })} onClick={() => change(declared.filter(path => path !== source))}>{i18n.t("Disconnect")}</Button> : null}
      </li>)}</ul> : null}
      {pending ? <p className="bibliography-status" role="status">{i18n.t("Save this document to load the connected bibliography files.")}</p> : null}
      <p className="bibliography-status">{i18n.t("If you edit a .bib file in another app, save your document, then choose Reload to update its references.")}</p>
      {evaluation && !evaluation.readiness.complete ? <p className="bibliography-status" role="status">{i18n.t("References are incomplete. You can still save this document.")}</p> : null}
      <ol className="bibliography-list">
        {evaluation?.references.map(reference => <li key={reference.key} data-key={reference.key} data-readiness={reference.status}>
          <span className="bibliography-number">[{reference.number}]</span>
          <BibliographyReferenceText reference={reference} />
        </li>)}
      </ol>
      {evaluation?.readiness.diagnostics.some(d => d.source && !d.key) ? <ul className="bibliography-status bibliography-resources">
        {evaluation.readiness.diagnostics.filter(d => d.source && !d.key).map((d, index) => <li key={index}>{d.source}: {i18n.t("Bibliography could not be verified")}</li>)}
      </ul> : null}
    </section> : null}
    <Dialog open={editable && connectOpen} onOpenChange={setConnectOpen}>
      <DialogContent finalFocus={() => returnFocus.current ?? true} aria-busy={loading}>
        <DialogTitle>{i18n.t("Connect bibliography…")}</DialogTitle>
        {candidates !== null ? <div className="bibliography-choices min-w-0" role="group" aria-label={i18n.t("Bibliography files in this folder")}>
          <p className="bibliography-status">{i18n.t("Bibliography files in this folder")}</p>
          {available.map(source => <Button key={source} variant="outline" size="sm" title={source} aria-label={i18n.t("Connect {{file}}", { file: source })} onClick={() => { change([...declared, source]); setConnectOpen(false); }}><span>{source}</span></Button>)}
          {!available.length ? <p className="bibliography-status">{i18n.t("No more .bib files in this folder.")}</p> : null}
        </div> : null}
        {error ? <p className="bibliography-status" role="alert">{i18n.t("The bibliography files could not be listed. Try again.")}</p> : null}
      </DialogContent>
    </Dialog>
  </BibliographyContext>;
});
