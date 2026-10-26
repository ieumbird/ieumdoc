import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import type { ReactNode } from "react";
import { BookOpen, Folder, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { splitDocumentPath } from "./document-path.ts";

type DocumentStartProps = {
  /** The product mark's URL; the start is the app's, not a document's. */
  mark?: string;
  recovery?: ReactNode;
  /** Folders opened in this browser, newest first. */
  recent: string[];
  /** A writable sample the Host offers, opened only when the user asks. */
  sample?: string;
  busy: boolean;
  onNewDocument(returnFocus: HTMLElement): void;
  onOpenFolder(returnFocus: HTMLElement): void;
  onOpenRecent(folder: string): void;
  onOpenSample(sample: string): void;
};

/**
 * The document column while no document is open: the user chooses what to work on. It sits on the
 * canvas with the product mark rather than on a document's paper, so it never reads as an open
 * document (#298). The sample is a separate choice, never opened for them.
 */
export function DocumentStart({ mark, recovery, recent, sample, busy, onNewDocument, onOpenFolder, onOpenRecent, onOpenSample }: DocumentStartProps) {
  useTranslation();
  return (
    <section className="document-start" aria-labelledby="document-start-title" data-testid="document-start">
      <p className="document-start-product">
        {mark ? <img className="document-start-mark" src={mark} alt="" /> : null}
        IeumDoc
      </p>
      <h1 id="document-start-title" className="document-start-title">{i18n.t("Start an IeumDoc document")}</h1>
      <p className="document-start-text">{i18n.t("Create a document, or open a folder to continue working on an IeumDoc document.")}</p>
      <div className="document-start-actions">
        <Button size="sm" disabled={busy} onClick={event => onNewDocument(event.currentTarget)}>{i18n.t("New document")}</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={event => onOpenFolder(event.currentTarget)}>
          <FolderOpen aria-hidden="true" />{i18n.t("Open folder…")}</Button>
      </div>
      {recent.length > 0 ? (
        <section className="document-start-section" aria-labelledby="document-start-recent">
          <h2 id="document-start-recent" className="document-start-label">{i18n.t("Recent folders")}</h2>
          <ul className="document-start-recent">
            {recent.map(folder => (
              <li key={folder}>
                <button type="button" className="document-start-folder" title={folder} disabled={busy} onClick={() => onOpenRecent(folder)}>
                  <Folder aria-hidden="true" />
                  <span className="document-start-folder-name">{splitDocumentPath(folder.replace(/[\\/]+$/, "")).name || folder}</span>
                  <span className="document-start-folder-path">{folder}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {recovery}
      {sample ? (
        <section className="document-start-section" aria-labelledby="document-start-sample">
          <h2 id="document-start-sample" className="document-start-label">{i18n.t("Sample")}</h2>
          <p className="document-start-text">{i18n.t("A technical document showing what IeumDoc edits. It is a copy in IeumDoc's app data, apart from your files.")}</p>
          <div className="document-start-actions">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onOpenSample(sample)}>
              <BookOpen aria-hidden="true" />{i18n.t("Open sample document")}</Button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
