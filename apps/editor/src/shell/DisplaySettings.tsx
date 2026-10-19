import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
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
  useTranslation();
  return (
    <div className="display-settings">
      <div>
        <h2 className="display-title">{i18n.t("Document display")}</h2>
        <p className="display-file" title={documentPath || undefined}>
          {documentPath ? splitDocumentPath(documentPath).name : i18n.t("No document open")}
        </p>
      </div>
      <section aria-labelledby="display-document-title">
        <h3 id="display-document-title" className="display-scope">{i18n.t("Saved in document")}</h3>
        <label className="display-choice">
          <input type="checkbox" checked={headingNumbering} disabled={numberingDisabled}
            aria-describedby="display-numbering-hint" onChange={onToggleHeadingNumbering} />
          <span>{i18n.t("Number headings")}</span>
        </label>
        <p id="display-numbering-hint" className="display-hint">
          {numberingHint || i18n.t("Numbers H2–H6; H1 stays a title. Save to keep changes.")}
        </p>
      </section>
      <section aria-labelledby="display-local-title">
        <h3 id="display-local-title" className="display-scope">{i18n.t("Local view")}</h3>
        <label className="display-choice">
          <input type="checkbox" checked={wide} aria-describedby="display-width-hint" onChange={onToggleWide} />
          <span>{i18n.t("Wide document")}</span>
        </label>
        <p id="display-width-hint" className="display-hint">{i18n.t("Remembered here; never saved in the document.")}</p>
      </section>
    </div>
  );
}
