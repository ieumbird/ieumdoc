import { REFERENCE_STYLES, referenceStyle, type ReferenceStyle } from "../reference-style.ts";
import type { ReferenceTemplates } from "@ieumdoc/core/numbering";
import { useTranslation } from "react-i18next";
import { i18n } from "../i18n.ts";
import { splitDocumentPath } from "./document-path.ts";
import { Button } from "@/components/ui/button.tsx";

export type DisplaySettingsProps = {
  documentPath: string;
  headingNumbering: boolean;
  referenceTemplates?: ReferenceTemplates | null;
  onReferenceStyleChange?(style: ReferenceStyle): void;
  onToggleHeadingNumbering(): void;
  onConnectBibliography?(returnFocus: HTMLElement): void;
  numberingDisabled: boolean;
  numberingHint?: string;
  wide: boolean;
  onToggleWide(): void;
};

/** Placement only: numbering stays in the document's history; width stays a local preference. */
export function DisplaySettings({
  documentPath, headingNumbering, referenceTemplates, onReferenceStyleChange, onToggleHeadingNumbering, onConnectBibliography, numberingDisabled, numberingHint, wide, onToggleWide,
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
        <label className="display-template-choice">
          <span>{i18n.t("Reference style")}</span>
          <select className="form-select h-[var(--size-control)] w-full min-w-0 rounded-md border border-input bg-background pl-[var(--space-3)] text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" value={referenceStyle(referenceTemplates)} disabled={numberingDisabled}
            aria-describedby="display-numbering-hint"
            onChange={event => onReferenceStyleChange?.(event.target.value as ReferenceStyle)}>
            {Object.entries(REFERENCE_STYLES).map(([key, style]) => <option key={key} value={key}>{i18n.t(style.label)}</option>)}
            {referenceStyle(referenceTemplates) === "custom" ? <option value="custom" disabled>{i18n.t("Custom")}</option> : null}
          </select>
        </label>
        <Button variant="outline" size="sm" className="mt-[var(--space-3)]" disabled={numberingDisabled} aria-describedby="display-numbering-hint"
          onClick={event => onConnectBibliography?.(event.currentTarget)}>{i18n.t("Connect bibliography…")}</Button>
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
