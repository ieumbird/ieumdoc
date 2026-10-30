import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { numberingReport } from "@ieumdoc/core/numbering";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { FieldError, Notice } from "./ui/primitives.tsx";
import { i18n } from "./i18n.ts";

/** Only adapt the live engine document to Core's editor-neutral report. Paths here are
 * current display positions, including newly inserted blocks, not opening-snapshot locators. */
export function editorNumberingReport(doc: Node, automaticIndex?: number) {
  const blocks: Parameters<typeof numberingReport>[0][number][] = [];
  doc.forEach((node, _pos, index) => blocks.push({ block: node.type.name, path: [index],
    ...(index !== automaticIndex && typeof node.attrs.enumerator === "string" ? { enumerator: node.attrs.enumerator } : {}) }));
  return numberingReport(blocks);
}

/** UI mode stays explicit even while its fixed value is empty; only Automatic clears it. */
export function useNumberDraft(initial: string) {
  const [value, setValue] = useState(initial);
  const [fixed, setFixed] = useState(!!initial);
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return {
    value, fixed, invalid, input,
    reset(value: string) { setValue(value); setFixed(!!value); setInvalid(false); },
    change(value: string) { setValue(value); setInvalid(false); },
    choose(fixed: boolean) { setFixed(fixed); if (!fixed) setValue(""); setInvalid(false); },
    changedFrom(applied: string) { return value !== applied || fixed !== !!applied; },
    validate() {
      const valid = !fixed || !!value.trim();
      setInvalid(!valid);
      if (!valid) input.current?.focus();
      return valid;
    },
  };
}

export function NumberField({ editor, getPos, draft, onChange, testId, disabled }: {
  editor: Editor; getPos(): number | undefined; draft: ReturnType<typeof useNumberDraft>; onChange?(): void; testId: string; disabled?: boolean;
}) {
  useTranslation();
  const id = useId();
  const { value, fixed, invalid, input } = draft;
  const report = useEditorState({ editor, selector: ({ editor: current }) => {
    const pos = getPos();
    if (!current || typeof pos !== "number") return undefined;
    const index = current.state.doc.resolve(pos).index(0);
    return {
      warnings: editorNumberingReport(current.state.doc).diagnostics.filter(item => item.path[0] === index),
      automatic: editorNumberingReport(current.state.doc, index).targets.find(item => item.path[0] === index)?.number,
    };
  } });
  const notices = report?.warnings.map(item => <Notice tone="warning" key={item.code} data-testid="numbering-block-warning">
    {item.code === "numbering-missing"
      ? i18n.t("Missing fixed number in a fixed-number document. Saving is allowed.")
      : i18n.t("Fixed number {{number}} is duplicated for this kind. Saving is allowed.", { number: item.enumerator ?? "" })}
  </Notice>);
  return <div className="form-field figure-number-field">
      <span id={`${id}-label`}>{i18n.t("Number")}</span>
      <div className="view-toggle" role="group" aria-labelledby={`${id}-label`}>
        {[false, true].map(option => <Button key={String(option)} type="button" size="sm" variant="ghost"
          className="view-toggle-option" aria-pressed={fixed === option} disabled={disabled}
          data-segment-label={i18n.t(option ? "Fixed" : "Automatic")}
          onClick={() => { draft.choose(option); onChange?.(); }}>
          <span className="view-toggle-label">{i18n.t(option ? "Fixed" : "Automatic")}</span>
        </Button>)}
      </div>
      {fixed ? <Input ref={input} id={id} aria-labelledby={`${id}-label`} data-testid={`${testId}-enumerator`}
        aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}
        placeholder={i18n.t("None")}
        value={value} disabled={disabled} onChange={event => { draft.change(event.target.value); onChange?.(); }} />
        : <p className="form-hint" data-testid={`${testId}-automatic-number`}>{i18n.t("Automatic number: {{number}}", { number: report?.automatic ?? "" })}</p>}
      {invalid ? <FieldError id={`${id}-error`}>{i18n.t("Enter a fixed number or choose Automatic.")}</FieldError> : null}
      {notices}
    </div>;
}

export function NumberingNotice({ editor }: { editor: Editor }) {
  useTranslation();
  const count = useEditorState({ editor, selector: ({ editor: current }) =>
    current ? editorNumberingReport(current.state.doc).diagnostics.length : 0 }) ?? 0;
  return count ? <Notice tone="warning" data-testid="numbering-warnings">
    {i18n.t("Numbering warnings: {{count}}. Review Number in block properties for missing or duplicate fixed numbers. Saving is allowed.", { count })}
  </Notice> : null;
}
