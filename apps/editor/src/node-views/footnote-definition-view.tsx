import { type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { type Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { NodeViewContent, NodeViewWrapper, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { Button } from "@/components/ui/button.tsx";
import { i18n } from "../i18n.ts";
import { cancelEndnoteEditing, endnoteEditingKey, endnoteEditorToken, revealReference, useEndnoteNumber } from "../endnotes.ts";
import { handleTextblockMouseDown } from "./shared.ts";

export function FootnoteDefinitionView({ node, editor, getPos, selected }: ReactNodeViewProps) {
  useTranslation();
  const editable = useEditorState({ editor, selector: ({ editor: current }) => current.isEditable });
  const label = String(node.attrs.label ?? "");
  const editing = useEditorState({ editor, selector: ({ editor: current }) => !!current && endnoteEditingKey.getState(current.state)?.label === label });
  const begin = () => {
    const pos = getPos();
    if (typeof pos !== "number" || !editor.isEditable) return;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos + node.nodeSize - 1)).setMeta(endnoteEditingKey, label));
    editor.view.focus();
  };
  const finish = (cancel: boolean) => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const tr = cancel ? cancelEndnoteEditing(editor.state) : editor.state.tr
      .setSelection(NodeSelection.create(editor.state.doc, pos)).setMeta(endnoteEditingKey, null);
    if (tr) editor.view.dispatch(tr);
    editor.view.focus();
  };
  return (
    <NodeViewWrapper
      as="div"
      className="footnote-definition"
      data-block="footnote"
      data-testid="footnote-definition"
      data-label={label}
      data-selected={String(selected)}
      data-editing={String(editable && editing)}
      data-endnote-owner={label}
      data-endnote-editor={endnoteEditorToken(editor)}
      data-endnotes-heading={i18n.t("Endnotes")}
      role="textbox"
      aria-label={`${i18n.t("Endnote")} ${useEndnoteNumber(editor, label) ?? label}`}
      aria-readonly={!editable || !editing}
      aria-multiline="true"
      data-source-path={String(node.attrs.sourcePath ?? "")}
      onMouseDown={(event: ReactMouseEvent) => {
        if (event.button !== 0 || (event.target as HTMLElement).closest("button, [data-testid=footnote-number], [data-testid=cross-reference], [data-citation], [data-testid=inline-math]")) return;
        if (editing) {
          if (event.detail === 3) handleTextblockMouseDown(event, { editor, node, getPos });
          return;
        }
        const pos = getPos();
        if (typeof pos !== "number") return;
        event.preventDefault();
        editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
        editor.view.focus();
      }}
    >
      <EndnoteNumber editor={editor} label={label} />
      {editable ? <div className="endnote-actions" contentEditable={false}>
        {editing ? <>
          <Button size="sm" variant="outline" data-testid="endnote-cancel" onClick={() => finish(true)}>{i18n.t("Cancel")}</Button>
          <Button size="sm" data-testid="endnote-apply" onClick={() => finish(false)}>{i18n.t("Done")}</Button>
        </> : <Button size="sm" variant="outline" data-testid="endnote-edit" onClick={begin}>{i18n.t("Edit")}</Button>}
      </div> : null}
      <NodeViewContent<"p"> as="p" className="footnote-definition-body" />
    </NodeViewWrapper>
  );
}

/** A definition's computed number; return to the invoking reference when one is remembered. */
function EndnoteNumber({ editor, label }: { editor: Editor; label: string }) {
  useTranslation();
  const number = useEndnoteNumber(editor, label);
  return (
    <sup className="footnote-number" data-testid="footnote-number" contentEditable={false}
      title={i18n.t("Return to the reference")} aria-label={i18n.t("Endnote {{number}}. Return to the reference.", { number: number ?? label })}
      onMouseDown={(event) => event.preventDefault()} onClick={() => revealReference(editor, label)}>
      {number ?? `[^${label}]`}
    </sup>
  );
}
