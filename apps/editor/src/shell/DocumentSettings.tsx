import { forwardRef, useId, useImperativeHandle, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { DEFAULT_REFERENCE_TEMPLATES, type ReferenceTemplates } from "@litzio/core/numbering";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";
import { i18n } from "../i18n.ts";
import { REFERENCE_STYLES, referenceStyle, type ReferenceStyle } from "../reference-style.ts";
import { DisplaySettings, type SettingsGroup } from "./DisplaySettings.tsx";

export type DocumentSettingsHandle = { reveal(): void };
type Props = {
  expanded: boolean;
  onExpandedChange(expanded: boolean): void;
  readOnly: boolean;
  disabled: boolean;
  headingNumbering: boolean;
  referenceTemplates: ReferenceTemplates | null;
  bibliography: string[];
  onToggleHeadingNumbering(): void;
  onReferenceStyleChange(style: ReferenceStyle): void;
  onConnectBibliography(returnFocus: HTMLElement): void;
};

function preview(templates: ReferenceTemplates): string {
  return (["figure", "table", "equation"] as const).map(kind =>
    (templates[kind] ?? DEFAULT_REFERENCE_TEMPLATES[kind]).replace("%s", "1")).join(" · ");
}

/** UI only, outside document content. Expansion belongs to the owning tab, never storage. */
export const DocumentSettings = forwardRef<DocumentSettingsHandle, Props>(function DocumentSettings(props, ref) {
  useTranslation();
  const { expanded, onExpandedChange, readOnly, disabled, headingNumbering, referenceTemplates, bibliography } = props;
  const block = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const readonlySummary = useRef<HTMLParagraphElement>(null);
  const bodyId = useId();
  const style = referenceStyle(referenceTemplates);
  const styleLabel = i18n.t(style === "custom" ? "Custom" : REFERENCE_STYLES[style].label);
  const summary = [i18n.t(headingNumbering ? "Numbered headings" : "Unnumbered headings"),
    i18n.t("{{style}} references", { style: styleLabel }), ...bibliography].join(" · ");
  useImperativeHandle(ref, () => ({ reveal() {
    if (!readOnly) onExpandedChange(true);
    const target = readOnly ? readonlySummary.current : trigger.current;
    block.current?.scrollIntoView({ block: "start" });
    target?.focus({ preventScroll: true });
  } }));
  const groups: SettingsGroup[] = [{ label: i18n.t("Saved in this document"), fields: [
    { id: "numbering", label: i18n.t("Number headings"), summary: i18n.t("Numbers H1–H6 body sections. Save to keep changes."),
      control: { kind: "checkbox", checked: headingNumbering, onChange: props.onToggleHeadingNumbering } },
    { id: "references", label: i18n.t("Reference style"), summary: preview(referenceTemplates ?? {}),
      control: { kind: "custom", render: descriptionId => <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={disabled} aria-label={i18n.t("Reference style")}
          aria-describedby={descriptionId} />}>
          {styleLabel}<ChevronDown aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-label={i18n.t("Reference style")}>
          <Menu.RadioGroup value={style} onValueChange={value => props.onReferenceStyleChange(value as ReferenceStyle)}>
            {Object.entries(REFERENCE_STYLES).map(([key, option]) => <Menu.RadioItem key={key} value={key} disabled={disabled} closeOnClick
              className="document-settings-option" aria-label={i18n.t(option.label)}>
              <Check aria-hidden="true" className={key === style ? "" : "invisible"} />
              <span>{i18n.t(option.label)}</span><span className="document-settings-preview">{preview(option.templates)}</span>
            </Menu.RadioItem>)}
          </Menu.RadioGroup>
        </DropdownMenuContent>
      </DropdownMenu> } },
    { id: "bibliography", label: i18n.t("Bibliography"), summary: bibliography.join(" · ") || i18n.t("No bibliography connected"),
      control: { kind: "custom", render: descriptionId => <Button variant="outline" size="sm" disabled={disabled}
        aria-describedby={descriptionId} onClick={event => props.onConnectBibliography(event.currentTarget)}>{i18n.t("Connect bibliography…")}</Button> } },
  ] }];
  return <section ref={block} className="document-settings" aria-label={i18n.t("Document settings")}
    onKeyDown={event => {
      if (event.key === "Escape" && expanded && !event.defaultPrevented) {
        event.preventDefault(); event.stopPropagation(); onExpandedChange(false); trigger.current?.focus();
      }
    }}>
    {readOnly ? <p ref={readonlySummary} tabIndex={-1} className="document-settings-summary"><span>{i18n.t("Document settings")}</span><span className="document-settings-values" title={summary}>{summary}</span></p> : <Button ref={trigger}
      variant="ghost" size="sm" className="document-settings-summary" aria-label={i18n.t("Document settings")}
      aria-expanded={expanded} aria-controls={bodyId} onClick={() => onExpandedChange(!expanded)}>
      {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
      <span>{i18n.t("Document settings")}</span><span className="document-settings-values" title={summary}>{expanded ? i18n.t("Saved in this document") : summary}</span>
    </Button>}
    {!readOnly ? <div id={bodyId} hidden={!expanded}>
      <DisplaySettings groups={groups} disabled={disabled} />
    </div> : null}
  </section>;
});
