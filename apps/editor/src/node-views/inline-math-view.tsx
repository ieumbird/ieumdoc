import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NodeSelection } from "@tiptap/pm/state";
import { NodeViewWrapper, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { FieldError } from "../ui/primitives.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useMessageState } from "../ui-message.ts";
import { i18n } from "../i18n.ts";
import { BlockProperties } from "../block-properties.tsx";
import { canEditEndnoteAt, endnoteAt, endnoteEditorToken } from "../endnotes.ts";
import { renderEquation } from "../equation-render.ts";
import { focusBlock, usePropertyEntry, type DraftListener } from "./shared.ts";

export function InlineMathView({ node, editor, getPos, updateAttributes, selected }: ReactNodeViewProps) {
  useTranslation();
  const formId = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const value = String(node.attrs.value ?? "");
  const [editing, setEditing] = useState(false);
  const canEdit = useEditorState({ editor, selector: ({ editor: current }) => {
    const pos = getPos();
    return !!current && typeof pos === "number" && canEditEndnoteAt(current.state, pos);
  } });
  const [draft, setDraft] = useState(value);
  const [error, setError] = useMessageState("");
  const rendered = renderEquation(value, false);
  const open = () => {
    if (!editor.isEditable || !canEdit || editing) return;
    setDraft(value);
    setError("");
    setEditing(true);
  };
  usePropertyEntry(anchor, open);
  const position = getPos();
  const endnoteOwner = typeof position === "number" ? endnoteAt(editor.state, position) : null;
  const path = typeof position === "number" ? String(editor.state.doc.resolve(position).node(1).attrs.sourcePath) : "";
  const onDraftChange = editor.extensionManager.extensions.find(extension => extension.name === "inlineMath")?.options.onDraftChange as DraftListener | undefined;
  const dirty = editing && draft !== value;
  useEffect(() => {
    onDraftChange?.("Inline math", path, dirty, formId);
    return () => onDraftChange?.("Inline math", path, false, formId);
  }, [path, dirty, onDraftChange, formId]);
  const close = () => {
    setDraft(value);
    setError("");
    setEditing(false);
    focusBlock(editor.view, getPos);
  };
  const apply = () => {
    if (!canEdit) return;
    // Core validates the source on Save; only an empty or multi-line source is refused here.
    if (draft.length === 0) return setError({ key: "Enter LaTeX, or use Remove." });
    updateAttributes({ value: draft });
    close();
  };
  // Replace the math with its source as ordinary text, keeping bold/italic/link marks.
  const remove = () => {
    if (!canEdit) return;
    const position = getPos();
    if (typeof position !== "number") return;
    setEditing(false);
    editor.chain().focus().insertContentAt({ from: position, to: position + node.nodeSize },
      { type: "text", text: value, marks: node.marks.map((mark) => mark.toJSON()) }).run();
  };
  return (
    <NodeViewWrapper as="span" className="inline-math" data-selected={selected ? "true" : "false"} data-testid="inline-math">
      <span
        ref={anchor}
        contentEditable={false}
        className={rendered.html ? "inline-math-rendered" : "inline-math-rendered inline-math-error"}
        title={rendered.error ?? value}
        onMouseDown={event => {
          const position = getPos();
          if (typeof position !== "number") return;
          event.preventDefault();
          editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)));
          editor.view.focus();
        }}
        onDoubleClick={open}
        {...(rendered.html ? { dangerouslySetInnerHTML: { __html: rendered.html } } : { children: `$${value}$` })}
      />
      <BlockProperties anchor={anchor} initialFocus={input} kind={i18n.t("Inline math")} testId="inline-math" className="inline-math-properties"
        endnoteOwner={endnoteOwner ? { label: endnoteOwner, editor: endnoteEditorToken(editor) } : undefined}
        open={editing} busy={!canEdit} onApply={apply} onCancel={close}>
        <div className="form-field">
          <label className="form-label" htmlFor={formId}>LaTeX</label>
          <textarea
            id={formId}
            ref={input}
            className="inline-math-input"
            aria-label="LaTeX"
            data-testid="inline-math-source"
            value={draft}
            disabled={!canEdit}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${formId}-error` : undefined}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            onChange={(event) => {
              setDraft(event.target.value.replace(/[\r\n]+/g, " "));
              setError("");
            }}
          />
          <FieldError id={`${formId}-error`}>{error}</FieldError>
        </div>
        <Button type="button" size="sm" variant="outline" data-testid="inline-math-remove" disabled={!canEdit} onClick={remove}>{i18n.t("Remove")}</Button>
      </BlockProperties>
    </NodeViewWrapper>
  );
}
