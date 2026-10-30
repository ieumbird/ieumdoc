import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { labelError } from "@ieumdoc/core/label";
import { FieldError } from "../ui/primitives.tsx";
import { Input } from "@/components/ui/input.tsx";
import { labelPropertyError, updateLabelProperties } from "../label-rename.ts";
import { useMessageState } from "../ui-message.ts";
import { i18n } from "../i18n.ts";
import { MetadataProperties } from "../metadata-properties.tsx";
import { NumberField, useNumberDraft } from "../numbering-properties.tsx";
import { captionPrefixText, useCaptionNumberText } from "../cross-reference.tsx";
import { TableTools } from "../table-tools.tsx";
import { focusBlock, handleTextblockMouseDown, useCaptionPlaceholder, usePropertyEntry, type DraftListener } from "./shared.ts";

export function TableCaptionView({ node, editor, getPos }: ReactNodeViewProps) {
  useTranslation();
  const placeholder = useCaptionPlaceholder({ editor, getPos }, "table");
  const numbered = useCaptionNumberText(editor, getPos, "table");
  return <NodeViewWrapper className="caption" data-testid="table-caption" data-number={numbered} data-caption-prefix={numbered === undefined ? undefined : captionPrefixText(numbered)}
    onMouseDown={(event: ReactMouseEvent) => handleTextblockMouseDown(event, { editor, node, getPos })}>
    <NodeViewContent as="div" aria-label={i18n.t("Table caption")} data-empty-caption={node.content.size === 0 || undefined}
      data-placeholder={placeholder} />
  </NodeViewWrapper>;
}

export function TableView({ node, editor, getPos, selected, onDraftChange }: ReactNodeViewProps & { onDraftChange?: DraftListener }) {
  useTranslation();
  const formId = useId();
  const grid = useRef<HTMLDivElement>(null);
  const rowLayer = useRef<HTMLDivElement>(null);
  const actionLayer = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLParagraphElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const numbered = useCaptionNumberText(editor, getPos, "table");
  const kind = numbered ?? i18n.t("Table");
  const label = String(node.attrs.label ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const enumerator = String(node.attrs.enumerator ?? "");
  const numberDraft = useNumberDraft(enumerator);
  const [error, setError] = useMessageState("");
  const sourcePath = String(node.attrs.sourcePath);
  const dirty = editing && (draft !== label || numberDraft.changedFrom(enumerator));
  useEffect(() => { onDraftChange?.("Table", sourcePath, dirty); return () => onDraftChange?.("Table", sourcePath, false); }, [sourcePath, dirty, onDraftChange]);
  const begin = () => { if (!editor.isEditable || editing) return; setDraft(label); numberDraft.reset(enumerator); setError(""); setEditing(true); };
  usePropertyEntry(anchor, begin);
  const close = (returnCaret = true) => { setEditing(false); if (returnCaret) focusBlock(editor.view, getPos); };
  const apply = (outside = false) => {
    if (!numberDraft.validate()) return;
    const invalid = labelError(draft);
    if (invalid) { setError(invalid); return; }
    const position = getPos();
    if (typeof position !== "number") return;
    try {
      editor.view.dispatch(updateLabelProperties(editor.state, position, { label: draft, enumerator: numberDraft.value || null }));
    } catch (cause) { setError(labelPropertyError(cause)); return; }
    close(!outside);
  };
  return <NodeViewWrapper className="table-block" data-block="table" data-table-block="" data-source-path={sourcePath}
    data-selected={selected ? "true" : "false"} data-editing={editing ? "true" : "false"}>
    <p ref={anchor} className="block-kind block-metadata" contentEditable={false} onMouseDown={event => {
      const position = getPos();
      if (typeof position !== "number") return;
      event.preventDefault();
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)));
      editor.view.focus();
    }} onDoubleClick={begin}>{[kind, label].filter(Boolean).join(" · ")}</p>
    <div ref={actionLayer} className="figure-edit table-action-bar" contentEditable={false} />
    <div className="table-scroll"><div ref={grid} className="table-grid">
      <NodeViewContent as="div" className="table" />
      <TableTools editor={editor} node={node} getPos={getPos} grid={grid} rowLayer={rowLayer} actionLayer={actionLayer} onEdit={begin} hidden={editing} />
    </div></div>
    <div ref={rowLayer} className="table-row-layer" contentEditable={false} />
    <MetadataProperties target={() => anchor.current?.closest("[data-block=table]") ?? null} anchor={anchor} initialFocus={input} kind={kind} testId="table" open={editing}
      onApply={apply} onCancel={() => close()}>
      <div className="form-field">
        <label className="form-label" htmlFor={`table-label-${formId}`}>{i18n.t("Label")}</label>
        <Input ref={input} id={`table-label-${formId}`} aria-invalid={!!error || undefined} aria-describedby={error ? `${formId}-error` : undefined} data-testid="table-label" value={draft} onChange={event => { setDraft(event.target.value); setError(""); }} />
        <FieldError id={`${formId}-error`}>{error}</FieldError>
      </div>
      <NumberField editor={editor} getPos={getPos} testId="table" draft={numberDraft} />
    </MetadataProperties>
  </NodeViewWrapper>;
}
