import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { labelError } from "@ieumdoc/core/label";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { labelPropertyError, updateLabelProperties } from "../label-rename.ts";
import { useMessageState } from "../ui-message.ts";
import { i18n } from "../i18n.ts";
import { PropertyForm } from "../block-properties.tsx";
import { MetadataProperties } from "../metadata-properties.tsx";
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
  const labelInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [properties, setProperties] = useState(false);
  const [draft, setDraft] = useState(latex);
  const [labelDraft, setLabelDraft] = useState(label);
  const enumerator = String(node.attrs.enumerator ?? "");
  const numberDraft = useNumberDraft(enumerator);
  const [error, setError] = useMessageState("");

  const cancelFocus = useSourceInputFocus(latexInput, editing);

  useEffect(() => {
    if (!editing && !properties) {
      setDraft(latex);
      setLabelDraft(label); numberDraft.reset(enumerator);
    }
  }, [editing, properties, latex, label, enumerator]);

  const [openOnInsert] = useState(() => view.editable && isNewBlockPath(String(node.attrs.sourcePath)) && latex.length === 0);
  useEffect(() => {
    // Open an inserted/remounted empty equation once; clearing an applied value must not reopen Apply.
    if (openOnInsert) beginEdit();
  }, [openOnInsert]);

  const sourcePath = String(node.attrs.sourcePath ?? "");
  const hasUnappliedDraft = isUnappliedEquationDraft(editing, draft, latex) ||
    ((editing || properties) && (labelDraft !== label || numberDraft.changedFrom(enumerator)));
  useEffect(() => {
    onDraftChange?.("Equation", sourcePath, hasUnappliedDraft);
    return () => onDraftChange?.("Equation", sourcePath, false);
  }, [sourcePath, hasUnappliedDraft, onDraftChange]);

  function beginEdit() {
    // Re-entry never replaces an open metadata/source draft with the other form.
    if (!view.editable || editing || properties) return;
    setDraft(latex);
    setLabelDraft(label); numberDraft.reset(enumerator);
    setError("");
    setEditing(true);
  }
  function beginProperties() {
    if (!view.editable || editing || properties) return;
    setLabelDraft(label); numberDraft.reset(enumerator);
    setError("");
    setProperties(true);
  }
  usePropertyEntry(anchor, beginEdit);
  const cancel = () => {
    cancelFocus();
    setDraft(latex);
    setLabelDraft(label); numberDraft.reset(enumerator);
    setError("");
    setEditing(false);
    setProperties(false);
    focusBlock(view, getPos);
  };
  // Core checks the live target/reference context before committing a label rename.
  const apply = (openSource = false, returnCaret = true) => {
    if (!numberDraft.validate()) return;
    const invalidLabel = labelError(labelDraft);
    if (invalidLabel) {
      setError(invalidLabel);
      return;
    }
    cancelFocus();
    const position = getPos();
    if (typeof position !== "number") return;
    try {
      // Merely following Edit → Edit source must not add an empty Undo step.
      if (editing || labelDraft !== label || numberDraft.changedFrom(enumerator)) {
        view.dispatch(updateLabelProperties(view.state, position, {
          ...(editing ? { latex: draft } : {}), label: labelDraft, enumerator: numberDraft.value || null,
        }));
      }
    }
    catch (cause) { setError(labelPropertyError(cause)); return; }
    setError("");
    setProperties(false);
    if (openSource) setDraft(String(view.state.doc.nodeAt(position)?.attrs.latex ?? ""));
    setEditing(openSource);
    if (!openSource && returnCaret) focusBlock(view, getPos);
  };

  return (
    <NodeViewWrapper
      className="equation"
      data-block="equation"
      data-editing={editing || properties}
      data-selected={selected}
      data-source-path={String(node.attrs.sourcePath ?? "")}
      contentEditable={false}
    >
      <p ref={anchor} className="block-kind block-metadata">{[kind, label].filter(Boolean).join(" · ")}</p>
      {hasUnappliedDraft ? (
        <p className="draft-status" role="status" data-testid="equation-draft-status">{i18n.t(editing
          ? "Unapplied changes are not saved. Apply to include them, or Cancel."
          : "Unapplied equation properties are not saved. Choose Done or press Esc to cancel.")}</p>
      ) : null}
      {!editing ? (
        <>
          {/* The computed number sits right of the formula, as MyST renders it; it is never saved. */}
          <div className="equation-row">
            {latex.length === 0 ? <div className="equation-math empty-equation" data-testid="equation-empty" onDoubleClick={beginEdit}>{i18n.t("Enter an equation")}</div> : <EquationFormula className="equation-math" latex={latex} testId="equation-preview" onDoubleClick={beginEdit} />}
            {number === undefined ? null : <span className="equation-number" data-testid="equation-number">({number})</span>}
          </div>
          {view.editable && !properties ? <Button className="equation-edit" size="sm" variant="outline" onClick={beginProperties}>{i18n.t("Edit")}</Button> : null}
        </>
      ) : visible ? (
        <div data-testid="equation-properties" onDragStart={isolateInputDrag} onDragEnter={isolateInputDrag}
          onDragOver={isolateInputDrag} onDragLeave={isolateInputDrag} onDrop={isolateInputDrag} onDragEnd={isolateInputDrag}>
          <PropertyForm kind={kind} testId="equation" onApply={() => apply()} onCancel={cancel}>
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
      {/* End the metadata field's ref lifetime before the source field takes ownership. */}
      {!editing ? <MetadataProperties anchor={anchor} target={() => anchor.current?.closest('[data-block="equation"]') ?? null}
        initialFocus={labelInput} kind={kind} testId="equation-property" open={properties}
        onApply={outside => apply(false, !outside)} onCancel={cancel}>
        <Button type="button" size="sm" variant="outline" data-testid="equation-edit-source" onClick={() => apply(true)}>{i18n.t("Edit source")}</Button>
        <div className="figure-property-columns">
          <div className="form-field">
            <label className="form-label" htmlFor={`${formId}-property-label`}>{i18n.t("Label")}</label>
            <Input ref={labelInput} id={`${formId}-property-label`} data-testid="equation-property-label"
              aria-invalid={!!error || undefined} aria-describedby={error ? `${formId}-property-error` : undefined}
              value={labelDraft} placeholder={i18n.t("None")} onChange={event => { setLabelDraft(event.target.value); setError(""); }} />
            <FieldError id={`${formId}-property-error`}>{error}</FieldError>
          </div>
          <NumberField editor={editor} getPos={getPos} testId="equation-property" draft={numberDraft} onChange={() => setError("")} />
        </div>
      </MetadataProperties> : null}
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
