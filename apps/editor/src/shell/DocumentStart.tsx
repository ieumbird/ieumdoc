import { BookOpen, Folder, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { splitDocumentPath } from "./document-path.ts";

type DocumentStartProps = {
  /** Folders opened in this browser, newest first. */
  recent: string[];
  /** A writable sample the Host offers, opened only when the user asks. */
  sample?: string;
  busy: boolean;
  onOpenFolder(returnFocus: HTMLElement): void;
  onOpenRecent(folder: string): void;
  onOpenSample(sample: string): void;
};

/**
 * The document column while no document is open: the user chooses what to work on. Nothing here
 * is a document; the sample is a separate choice, never opened for them.
 */
export function DocumentStart({ recent, sample, busy, onOpenFolder, onOpenRecent, onOpenSample }: DocumentStartProps) {
  return (
    <section className="document document-start" aria-labelledby="document-start-title" data-testid="document-start">
      <h1 id="document-start-title" className="document-start-title">Open your Markdown</h1>
      <p className="document-start-text">Open a folder, then choose a Markdown file from the sidebar or create a new one.</p>
      <div className="document-start-actions">
        <Button size="sm" disabled={busy} onClick={event => onOpenFolder(event.currentTarget)}>
          <FolderOpen aria-hidden="true" />
          Open folder…
        </Button>
      </div>
      {recent.length > 0 ? (
        <section className="document-start-section" aria-labelledby="document-start-recent">
          <h2 id="document-start-recent" className="document-start-label">Recent folders</h2>
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
      {sample ? (
        <section className="document-start-section" aria-labelledby="document-start-sample">
          <h2 id="document-start-sample" className="document-start-label">Sample</h2>
          <p className="document-start-text">A technical document showing what IeumDoc edits. It is a copy in IeumDoc's app data, apart from your files.</p>
          <div className="document-start-actions">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onOpenSample(sample)}>
              <BookOpen aria-hidden="true" />
              Open sample document
            </Button>
          </div>
        </section>
      ) : null}
    </section>
  );
}
