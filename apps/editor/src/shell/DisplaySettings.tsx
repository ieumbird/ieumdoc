import { splitDocumentPath } from "./document-path.ts";

export type DisplaySettingsProps = {
  documentPath: string;
  headingNumbering: boolean;
  onToggleHeadingNumbering(): void;
  numberingDisabled: boolean;
  numberingHint?: string;
  wide: boolean;
  onToggleWide(): void;
};

/** Placement only: numbering stays in the document's history; width stays a local preference. */
export function DisplaySettings({
  documentPath, headingNumbering, onToggleHeadingNumbering, numberingDisabled, numberingHint, wide, onToggleWide,
}: DisplaySettingsProps) {
  return (
    <div className="display-settings">
      <div>
        <h2 className="display-title">Document display</h2>
        <p className="display-file" title={documentPath || undefined}>
          {documentPath ? splitDocumentPath(documentPath).name : "No document open"}
        </p>
      </div>
      <section aria-labelledby="display-document-title">
        <h3 id="display-document-title" className="display-scope">Saved in document</h3>
        <label className="display-choice">
          <input type="checkbox" checked={headingNumbering} disabled={numberingDisabled}
            aria-describedby="display-numbering-hint" onChange={onToggleHeadingNumbering} />
          <span>Number headings</span>
        </label>
        <p id="display-numbering-hint" className="display-hint">
          {numberingHint || "Numbers H2–H6; H1 stays a title. Save to keep changes."}
        </p>
      </section>
      <section aria-labelledby="display-local-title">
        <h3 id="display-local-title" className="display-scope">Local view</h3>
        <label className="display-choice">
          <input type="checkbox" checked={wide} aria-describedby="display-width-hint" onChange={onToggleWide} />
          <span>Wide document</span>
        </label>
        <p id="display-width-hint" className="display-hint">Remembered here; never saved in the document.</p>
      </section>
    </div>
  );
}
