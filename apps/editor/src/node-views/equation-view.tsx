import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { labelError } from "@ieumdoc/core/label";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { updateLabelProperties } from "../label-rename.ts";
import { useMessageState } from "../ui-message.ts";
import { i18n } from "../i18n.ts";
import { PropertyForm } from "../block-properties.tsx";
import { NumberField, useNumberDraft } from "../numbering-properties.tsx";
import { useEditorVisible } from "../editor-visibility.ts";
import { useBlockNumber, useCaptionNumberText } from "../cross-reference.tsx";
import { renderEquation } from "../equation-render.ts";
import { isNewBlockPath } from "../tiptap-document.ts";
import { FieldError, Notice } from "../ui/primitives.tsx";
import { focusBlock, isolateInputDrag, usePropertyEntry, useSourceInputFocus, type DraftListener } from "./shared.ts";

/** An open Equation form is unsaved only when its source changed. */
export function isUnappliedEquationDraft(editing: boolean, draft: string, latex: string): boolean {
  return editing && draft !== latex;
}

export function createEquationNodeView(onDraftChange?: DraftListener) {
  return function EquationDraftNodeView(props: ReactNodeViewProps) {
    return <EquationView {...props} onDraftChange={onDraftChange} />;
  };
}

function EquationView({ node, editor, selected, getPos, view, onDraftChange }: ReactNodeViewProps & { onDraftChange?: DraftListener }) {
  useTranslation();
  const formId = useId();
  const visible = useEditorVisible();
  const label = String(node.attrs.label ?? "");
  const number = useBlockNumber(editor, getPos, "equation");
  const numbered = useCaptionNumberText(editor, getPos, "equation");
  const kind = numbered ?? i18n.t("Equation");
  const latex = String(node.attrs.latex ?? "");
  const anchor = useRef<HTMLParagraphElement>(null);
  const latexInput = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(latex);
  const [labelDraft, setLabelDraft] = useState(label);
  const enumerator = String(node.attrs.enumerator ?? "");
  const numberDraft = useNumberDraft(enumerator);
  const [error, setError] = useMessageState("");

  const cancelFocus = useSourceInputFocus(latexInput, editing);

  useEffect(() => {
    if (!editing) {
      setDraft(latex);
      setLabelDraft(label); numberDraft.reset(enumerator);
    }
  }, [editing, latex, label, enumerator]);

  const [openOnInsert] = useState(() => view.editable && isNewBlockPath(String(node.attrs.sourcePath)) && latex.length === 0);
  useEffect(() => {
    // Open an inserted/remounted empty equation once; clearing an applied value must not reopen Apply.
    if (openOnInsert) beginEdit();
  }, [openOnInsert]);

  const sourcePath = String(node.attrs.sourcePath ?? "");
  const hasUnappliedDraft = isUnappliedEquationDraft(editing, draft, latex) ||
    (editing && (labelDraft !== label || numberDraft.changedFrom(enumerator)));
  useEffect(() => {
    onDraftChange?.("Equation", sourcePath, hasUnappliedDraft);
    return () => onDraftChange?.("Equation", sourcePath, false);
  }, [sourcePath, hasUnappliedDraft, onDraftChange]);

  function beginEdit() {
    if (!view.editable || editing) return;
    setDraft(latex);
    setLabelDraft(label); numberDraft.reset(enumerator);
    setError("");
    setEditing(true);
  }
  usePropertyEntry(anchor, beginEdit);
  const cancel = () => {
    cancelFocus();
    setDraft(latex);
    setLabelDraft(label); numberDraft.reset(enumerator);
    setError("");
    setEditing(false);
    focusBlock(view, getPos);
  };
  // Core checks the live target/reference context before committing a label rename.
  const apply = () => {
    if (!numberDraft.validate()) return;
    const invalidLabel = labelError(labelDraft);
    if (invalidLabel) {
      setError(invalidLabel);
      return;
    }
    cancelFocus();
    const position = getPos();
    if (typeof position !== "number") return;
    try { view.dispatch(updateLabelProperties(view.state, position, { latex: draft, label: labelDraft, enumerator: numberDraft.value || null })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return; }
    setError("");
    setEditing(false);
    focusBlock(view, getPos);
  };

  return (
    <NodeViewWrapper
      className="equation"
      data-block="equation"
      data-editing={editing}
      data-selected={selected}
      data-source-path={String(node.attrs.sourcePath ?? "")}
      contentEditable={false}
    >
      <p ref={anchor} className="block-kind block-metadata">{[kind, label].filter(Boolean).join(" · ")}</p>
      {hasUnappliedDraft ? (
        <p className="draft-status" role="status" data-testid="equation-draft-status">{i18n.t("Unapplied changes are not saved. Apply to include them, or Cancel.")}</p>
      ) : null}
      {!editing ? (
        <>
          {/* The computed number sits right of the formula, as MyST renders it; it is never saved. */}
          <div className="equation-row">
            {latex.length === 0 ? <div className="equation-math empty-equation" data-testid="equation-empty" onDoubleClick={beginEdit}>{i18n.t("Enter an equation")}</div> : <EquationFormula className="equation-math" latex={latex} testId="equation-preview" onDoubleClick={beginEdit} />}
            {number === undefined ? null : <span className="equation-number" data-testid="equation-number">({number})</span>}
          </div>
          {view.editable ? <Button className="equation-edit" size="sm" variant="outline" onClick={beginEdit}>{i18n.t("Edit")}</Button> : null}
        </>
      ) : visible ? (
        <div data-testid="equation-properties" onDragStart={isolateInputDrag} onDragEnter={isolateInputDrag}
          onDragOver={isolateInputDrag} onDragLeave={isolateInputDrag} onDrop={isolateInputDrag} onDragEnd={isolateInputDrag}>
          <PropertyForm kind={kind} testId="equation" onApply={apply} onCancel={cancel}>
            <label className="form-field">
              <span>LaTeX</span>
              <textarea
                ref={latexInput}
                aria-label={i18n.t("Equation LaTeX")}
                className="equation-input document-source-input"
                data-testid="equation-latex"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError("");
                }}
              />
            </label>
            <div className="equation-row">
              <EquationFormula className="equation-math equation-preview" latex={draft} testId="equation-edit-preview" />
              {number === undefined ? null : <span className="equation-number" data-testid="equation-number">({number})</span>}
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor={`${formId}-label`}>{i18n.t("Label")}</label>
              <Input id={`${formId}-label`}
                aria-invalid={!!error || undefined} aria-describedby={error ? `${formId}-error` : undefined}
                data-testid="equation-label"
                value={labelDraft}
                placeholder={i18n.t("None")}
                onChange={(event) => {
                  setLabelDraft(event.target.value);
                  setError("");
                }}
              />
              <FieldError id={`${formId}-error`}>{error}</FieldError>
            </div>
            <NumberField editor={editor} getPos={getPos} testId="equation" draft={numberDraft} onChange={() => setError("")} />
          </PropertyForm>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

function EquationFormula({ className, latex, testId, onDoubleClick }: { className: string; latex: string; testId: string; onDoubleClick?: () => void }) {
  useTranslation();
  const result = renderEquation(latex);
  if (result.error) {
    return (
      <Notice className={`${className} equation-preview-error`} tone="error" data-testid={`${testId}-error`} onDoubleClick={onDoubleClick}>{i18n.t("Equation preview unavailable:")}{result.error}
      </Notice>
    );
  }
  return (
    <div
      className={className}
      data-testid={testId}
      onDoubleClick={onDoubleClick}
    >
      <div className="equation-content" dangerouslySetInnerHTML={{ __html: result.html ?? "" }} />
    </div>
  );
}
