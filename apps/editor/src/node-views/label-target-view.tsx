import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { labelKey, targetLabelError } from "@ieumdoc/core/label";
import { Input } from "@/components/ui/input.tsx";
import { updateLabelProperties } from "../label-rename.ts";
import { useMessageState } from "../ui-message.ts";
import { i18n } from "../i18n.ts";
import { BlockProperties } from "../block-properties.tsx";
import { focusBlock, type DraftListener } from "./shared.ts";

/** Why `label` cannot name this section: the target label rules, or another target's label. */
function sectionLabelError(doc: ProseMirrorNode, own: number, label: string): string | undefined {
  const error = targetLabelError(label);
  if (error) return error;
  let taken = false;
  doc.forEach((node, pos) => { if (pos !== own && typeof node.attrs.label === "string" && node.attrs.label && labelKey(node.attrs.label) === labelKey(label)) taken = true; });
  return taken ? i18n.t("Label \"{{label}}\" already names another target in this document.", { label: label }) : undefined;
}

export function LabelTargetView({ node, editor, getPos, selected }: ReactNodeViewProps) {
  useTranslation();
  const formId = useId();
  const label = String(node.attrs.label ?? "");
  const anchor = useRef<HTMLParagraphElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [error, setError] = useMessageState("");
  const path = String(node.attrs.sourcePath ?? "");
  const onDraftChange = editor.extensionManager.extensions.find(extension => extension.name === "labelTarget")?.options.onDraftChange as DraftListener | undefined;
  const dirty = editing && draft !== label;
  useEffect(() => {
    onDraftChange?.("Section label", path, dirty);
    return () => onDraftChange?.("Section label", path, false);
  }, [path, dirty, onDraftChange]);
  const close = () => { setEditing(false); setError(""); focusBlock(editor.view, getPos); };
  const apply = () => {
    const position = getPos();
    const invalid = typeof position === "number" ? sectionLabelError(editor.state.doc, position, draft) : undefined;
    if (invalid) { setError(invalid); return; }
    if (typeof position !== "number") return;
    try { editor.view.dispatch(updateLabelProperties(editor.state, position, { label: draft })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return; }
    close();
  };
  // Authoring metadata like a Figure label: it takes no space and shows with its heading.
  return (
    <NodeViewWrapper as="div" className="label-target" data-block="label-target" data-testid="label-target"
      data-label={label} data-source-path={String(node.attrs.sourcePath ?? "")} data-selected={selected ? "true" : "false"}
      data-editing={editing ? "true" : "false"} contentEditable={false}>
      <p ref={anchor} className="label-target-content">
        {editor.isEditable ? (
          <button type="button" className="label-target-edit" aria-label={i18n.t("Edit section label {{label}}", { label: label })} data-testid="label-target-edit"
            title={i18n.t("Section label: {ref} references to it name the heading below")}
            onClick={() => { setDraft(label); setError(""); setEditing(true); }}>§ {label}</button>
        ) : <span className="label-target-text">§ {label}</span>}
      </p>
      <BlockProperties anchor={anchor} initialFocus={input} kind={i18n.t("Section label")} testId="label-target" open={editing}
        error={error}
        onApply={apply} onCancel={close}>
        <label className="form-label" htmlFor={`label-target-${formId}`}>{i18n.t("Label")}</label>
        <Input ref={input} id={`label-target-${formId}`} data-testid="label-target-input" value={draft}
          onChange={event => { setDraft(event.target.value); setError(""); }} />
      </BlockProperties>
    </NodeViewWrapper>
  );
}
