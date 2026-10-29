import { useId } from "react";
import { useTranslation } from "react-i18next";
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { numberingReport } from "@ieumdoc/core/numbering";
import { Input } from "@/components/ui/input.tsx";
import { Notice } from "./ui/primitives.tsx";
import { i18n } from "./i18n.ts";

/** Only adapt the live engine document to Core's editor-neutral report. Paths here are
 * current display positions, including newly inserted blocks, not opening-snapshot locators. */
export function editorNumberingReport(doc: Node) {
  const blocks: Parameters<typeof numberingReport>[0][number][] = [];
  doc.forEach((node, _pos, index) => blocks.push({ block: node.type.name, path: [index],
    ...(typeof node.attrs.enumerator === "string" ? { enumerator: node.attrs.enumerator } : {}) }));
  return numberingReport(blocks);
}

export function NumberField({ editor, getPos, value, onChange, testId, disabled }: {
  editor: Editor; getPos(): number | undefined; value: string; onChange(value: string): void; testId: string; disabled?: boolean;
}) {
  useTranslation();
  const id = useId();
  const warnings = useEditorState({ editor, selector: ({ editor: current }) => {
    const pos = getPos();
    if (!current || typeof pos !== "number") return [];
    const index = current.state.doc.resolve(pos).index(0);
    return editorNumberingReport(current.state.doc).diagnostics.filter(item => item.path[0] === index);
  } }) ?? [];
  return <>
    <label className="form-field" htmlFor={id}>
      <span>{i18n.t("Number")}</span>
      <Input id={id} data-testid={`${testId}-enumerator`} value={value} disabled={disabled}
        placeholder={i18n.t("Automatic")} aria-describedby={`${id}-hint`}
        onChange={event => onChange(event.target.value)} />
    </label>
    <p className="form-hint" id={`${id}-hint`}>{i18n.t("Enter a fixed number; leave empty for automatic numbering.")}</p>
    {warnings.map(item => <Notice tone="warning" key={item.code} data-testid="numbering-block-warning">
      {item.code === "numbering-missing"
        ? i18n.t("Missing fixed number in a fixed-number document. Saving is allowed.")
        : i18n.t("Fixed number {{number}} is duplicated for this kind. Saving is allowed.", { number: item.enumerator ?? "" })}
    </Notice>)}
  </>;
}

export function NumberingNotice({ editor }: { editor: Editor }) {
  useTranslation();
  const count = useEditorState({ editor, selector: ({ editor: current }) =>
    current ? editorNumberingReport(current.state.doc).diagnostics.length : 0 }) ?? 0;
  return count ? <Notice tone="warning" data-testid="numbering-warnings">
    {i18n.t("Numbering warnings: {{count}}. Review Number in block properties for missing or duplicate fixed numbers. Saving is allowed.", { count })}
  </Notice> : null;
}
