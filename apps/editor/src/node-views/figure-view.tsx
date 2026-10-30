import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { type FigureContent } from "@ieumdoc/core";
import { figureContentError } from "@ieumdoc/core/figure";
import { labelPropertyError } from "../label-rename.ts";
import { labelError } from "@ieumdoc/core/label";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { i18n } from "../i18n.ts";
import { type UiMessage, useMessageState } from "../ui-message.ts";
import { ImageRenameContext, imageFileStem } from "../image-rename.ts";
import { validFileStem } from "../../shared/file-operations.ts";
import { figureMediaPath } from "../../shared/figure-media-path.ts";
import { PropertyForm } from "../block-properties.tsx";
import { FigureProperties } from "../figure-properties.tsx";
import { NumberField, useNumberDraft } from "../numbering-properties.tsx";
import { useEditorVisible } from "../editor-visibility.ts";
import { updateFigure } from "../block-commands.ts";
import { captionPrefixText, useCaptionNumberText } from "../cross-reference.tsx";
import { MermaidPreview } from "../mermaid-preview.tsx";
import { normalizeMermaidSource } from "../mermaid-source.ts";
import { figureContent, isNewBlockPath, type TiptapJSON } from "../tiptap-document.ts";
import { FieldError, Notice } from "../ui/primitives.tsx";
import { focusBlock, handleTextblockMouseDown, isolateInputDrag, useCaptionPlaceholder, usePropertyEntry, useSourceInputFocus, type DraftListener } from "./shared.ts";

/** Core's persistent validation of a Figure Apply: its properties and its label. */
export type FigureValidator = (figure: FigureContent, label: string) => Promise<string | undefined>;
/** An image chosen for a Figure. `discard` removes a copy made for it, once no Figure will use it. */
export type ImageChoice = { path: string; discard?(): void };
/** Lets the user choose an image on the Host for this document; undefined when cancelled. */
export type ImageChooser = (documentPath: string, returnFocus: RefObject<HTMLElement | null>) => Promise<ImageChoice | undefined>;

/** An open Figure form is unsaved when changed. */
export function isUnappliedFigureDraft(editing: boolean, draft: FigureContent, applied: FigureContent): boolean {
  const changed = draft.imageUrl !== applied.imageUrl || draft.imageAlt !== applied.imageAlt ||
    draft.mermaidSource !== applied.mermaidSource ||
    JSON.stringify(draft.caption) !== JSON.stringify(applied.caption);
  return editing && changed;
}

export const DocumentPathContext = createContext<string | undefined>(undefined);

export function createFigureNodeView(documentPath?: string | (() => string), onDraftChange?: DraftListener, validateFigure?: FigureValidator, chooseImage?: ImageChooser) {
  return function FigureAssetNodeView(props: ReactNodeViewProps) {
    return <FigureView {...props} documentPath={documentPath} onDraftChange={onDraftChange} validateFigure={validateFigure} chooseImage={chooseImage} />;
  };
}

function figureAttrs(node: ProseMirrorNode): FigureContent {
  return figureContent(node.toJSON() as TiptapJSON);
}

type FigureViewProps = ReactNodeViewProps & { documentPath?: string | (() => string); onDraftChange?: DraftListener; validateFigure?: FigureValidator; chooseImage?: ImageChooser };

export function FigureView(props: FigureViewProps) {
  const [writingMermaid, setWritingMermaid] = useState(false);
  const pending = !props.node.attrs.imageUrl && props.node.attrs.mermaidSource == null;
  useEffect(() => { if (!pending) setWritingMermaid(false); }, [pending]);
  return typeof props.node.attrs.mermaidSource === "string" || (pending && writingMermaid)
    ? <MermaidFigureView {...props} onCancelPending={pending ? () => setWritingMermaid(false) : undefined} />
    : <ImageFigureView {...props} onWriteMermaid={() => setWritingMermaid(true)} />;
}

function ImageFigureView({ node, editor, selected, getPos, view, documentPath: initialDocumentPath, onDraftChange, validateFigure, chooseImage, onWriteMermaid }: FigureViewProps & { onWriteMermaid(): void }) {
  const renameImage = useContext(ImageRenameContext);
  const documentPath = useContext(DocumentPathContext) ?? (typeof initialDocumentPath === "function" ? initialDocumentPath() : initialDocumentPath);
  useTranslation();
  const placeholder = useCaptionPlaceholder({ editor, getPos }, "figure");
  // Core's computed label prefixes the caption; it is never saved.
  const numbered = useCaptionNumberText(editor, getPos, "figure");
  const anchor = useRef<HTMLParagraphElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const replaceButton = useRef<HTMLButtonElement>(null);
  // A copy the chooser made for this form; discarded unless Apply puts it in the Figure.
  const copied = useRef<ImageChoice | undefined>(undefined);
  const [choosing, setChoosing] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const applied = figureAttrs(node);
  const src = resolveFigureSource(applied.imageUrl, documentPath);
  const [failedSource, setFailedSource] = useState<string>();
  const imageFailed = !!src && failedSource === src;
  const label = String(node.attrs.label ?? "");
  const sourcePath = String(node.attrs.sourcePath ?? "");
  const editableFigure = view.editable;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(applied);
  const previousImage = useRef(applied.imageUrl);
  const [labelDraft, setLabelDraft] = useState(label);
  const enumerator = String(node.attrs.enumerator ?? "");
  const numberDraft = useNumberDraft(enumerator);
  const appliedStem = imageFileStem(applied.imageUrl);
  const [filename, setFilename] = useState(appliedStem ?? "");
  const filenameDraft = appliedStem !== undefined && filename !== appliedStem;
  const canRename = !!renameImage && !!documentPath && appliedStem !== undefined && !imageFailed && draft.imageUrl === applied.imageUrl && !copied.current;
  const formId = useId();
  const [errorField, setErrorField] = useState<"label" | "imageUrl" | "imageAlt" | "filename">();
  const [error, setError] = useMessageState("");
  const [validating, setValidating] = useState(false);
  const pendingRequest = useRef(0);
  const captionKey = JSON.stringify(applied.caption);
  const hasUnappliedDraft = isUnappliedFigureDraft(editing,
    { ...draft, caption: applied.caption }, applied) ||
    (editing && (labelDraft !== label || numberDraft.changedFrom(enumerator))) || filenameDraft;

  useEffect(() => {
    if (!editing) {
      setDraft(applied);
      setLabelDraft(label); numberDraft.reset(enumerator);
    }
    if (previousImage.current !== applied.imageUrl) {
      // A rename updates applied paths in every Figure. Follow only untouched Image
      // and filename inputs; preserve the user's independent Image/Alt/Label drafts.
      const before = previousImage.current;
      if (editing) setDraft(current => current.imageUrl === before ? { ...current, imageUrl: applied.imageUrl } : current);
      setFilename(current => current === (imageFileStem(before) ?? "") ? appliedStem ?? "" : current);
    }
    previousImage.current = applied.imageUrl;
  }, [editing, applied.imageUrl, applied.imageAlt, captionKey, label, enumerator]);

  useEffect(() => {
    onDraftChange?.("Figure", sourcePath, hasUnappliedDraft);
    return () => onDraftChange?.("Figure", sourcePath, false);
  }, [sourcePath, hasUnappliedDraft, onDraftChange]);

  function beginEdit() {
    if (!editableFigure || editing) return;
    setDraft(applied);
    setLabelDraft(label); numberDraft.reset(enumerator);
    setReplacing(false);
    if (!filenameDraft) setError("");
    setEditing(true);
  }
  useSourceInputFocus(replaceButton, editing);
  useSourceInputFocus(imageInput, editing && replacing);
  usePropertyEntry(anchor, beginEdit);
  const releaseCopy = () => {
    const copy = copied.current;
    copied.current = undefined;
    copy?.discard?.();
  };
  // Reload, closing the document or deleting the Figure invalidates its asynchronous work.
  useEffect(() => () => {
    pendingRequest.current++;
    releaseCopy();
  }, []);
  const pickImage = async () => {
    if (!chooseImage || !documentPath) return;
    const request = ++pendingRequest.current;
    setChoosing(true);
    const choice = await chooseImage(documentPath, chooseButton);
    if (request !== pendingRequest.current || editor.isDestroyed) {
      choice?.discard?.();
      return;
    }
    setChoosing(false);
    if (!choice) return;
    releaseCopy();
    if (choice.discard) copied.current = choice;
    setDraft(current => ({ ...current, imageUrl: choice.path }));
    setError("");
  };
  const cancel = () => {
    releaseCopy();
    pendingRequest.current++;
    setChoosing(false);
    setValidating(false);
    setDraft(applied);
    setLabelDraft(label); numberDraft.reset(enumerator);
    setFilename(appliedStem ?? "");
    setError("");
    setEditing(false);
    focusBlock(view, getPos);
  };
  // Apply commits only a value Core accepts as persistent; an invalid draft keeps the form open.
  // Core checks the live target/reference context before committing a label rename.
  const apply = async (rename = false, returnCaret = true) => {
    if (validating || choosing) return;
    setErrorField(undefined);
    if (!numberDraft.validate()) return;
    if (rename && canRename && filenameDraft && !validFileStem(filename)) {
      setErrorField("filename");
      setError({ key: "Enter a valid file name without an extension or directory path." });
      return;
    }
    const position = getPos();
    const current = typeof position === "number" ? view.state.doc.nodeAt(position) : null;
    if (!current) return;
    const liveCaption = figureAttrs(current).caption;
    const candidate = { ...draft, caption: liveCaption };
    const nextLabel = labelDraft;
    const invalidLabel = labelError(nextLabel);
    const invalidContent = figureContentError(candidate);
    const local = invalidLabel ?? invalidContent ?? (validateFigure ? undefined : "Figure validation is unavailable.");
    if (local) {
      if (invalidLabel) setErrorField("label");
      else if (invalidContent) {
        const invalidImage = figureContentError({ ...candidate, imageAlt: "" });
        setErrorField(invalidImage ? "imageUrl" : "imageAlt");
        if (invalidImage) setReplacing(true);
      }
      setError(local);
      return;
    }
    const request = ++pendingRequest.current;
    setChoosing(false);
    setValidating(true);
    setError("");
    let message: string | undefined;
    try {
      message = await validateFigure!(candidate, nextLabel);
    } catch (cause) {
      message = i18n.t("Figure validation failed: {{reason}}", { reason: cause instanceof Error ? cause.message : String(cause) });
    }
    // Cancel, a newer request or NodeView teardown supersedes this result. The editor can be
    // destroyed before React runs the NodeView's effect cleanup.
    if (request !== pendingRequest.current || editor.isDestroyed) return;
    setValidating(false);
    if (message) {
      setError(message);
      return;
    }
    const latestPosition = getPos();
    const latest = typeof latestPosition === "number" ? view.state.doc.nodeAt(latestPosition) : null;
    if (!latest || typeof latestPosition !== "number") return;
    if (JSON.stringify(figureAttrs(latest).caption) !== JSON.stringify(liveCaption)) {
      setError({ key: "Caption changed during validation. Apply again." });
      return;
    }
    // Validate the exact label/reference transaction before changing any file.
    try {
      updateFigure(view.state, latestPosition, { imageUrl: candidate.imageUrl, imageAlt: candidate.imageAlt, label: nextLabel, enumerator: numberDraft.value || null });
    } catch (cause) {
      setErrorField("label");
      setError(labelPropertyError(cause));
      return;
    }
    try {
      if (rename && canRename && filenameDraft) {
        setValidating(true);
        candidate.imageUrl = await renameImage!(documentPath!, applied.imageUrl, filename);
        setDraft(value => ({ ...value, imageUrl: candidate.imageUrl }));
        setFilename(imageFileStem(candidate.imageUrl) ?? filename);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setValidating(false);
      return;
    }
    setValidating(false);
    const { caption: _caption, ...attributes } = candidate;
    // Validation may finish after the user has moved on; only focus left in this form returns.
    const active = document.activeElement;
    const returnFocus = !view.dom.closest("[hidden]") &&
      returnCaret && (active === document.body || Boolean(replaceButton.current?.closest("form")?.contains(active)));
    // The copy passes to the document before dispatch, which may replace this view.
    const copy = copied.current;
    copied.current = undefined;
    // One undo step: undo returns the form's previous value.
    try {
      const now = view.state.doc.nodeAt(latestPosition);
      if (now?.attrs.imageUrl !== attributes.imageUrl || now.attrs.imageAlt !== attributes.imageAlt || now.attrs.label !== nextLabel || now.attrs.enumerator !== (numberDraft.value || null)) {
        view.dispatch(updateFigure(view.state, latestPosition, { ...attributes, label: nextLabel, enumerator: numberDraft.value || null }));
      }
    } catch (cause) {
      copied.current = copy;
      setError(cause instanceof Error ? cause.message : String(cause));
      return;
    }
    let used = false;
    view.state.doc.forEach(block => { used ||= block.type.name === "figure" && block.attrs.imageUrl === copy?.path; });
    if (!used) copy?.discard?.();
    setEditing(false);
    if (returnFocus) focusBlock(view, getPos);
  };
  const field = (key: "imageUrl" | "imageAlt", name: string, testId: string) => (
    <div className="form-field">
      <label className="form-label" htmlFor={`${formId}-${key}`}>{name}</label>
      <Input id={`${formId}-${key}`}
        aria-invalid={!!error && errorField === key || undefined}
        aria-describedby={error && errorField === key ? `${formId}-${key}-error` : undefined}
        ref={key === "imageUrl" ? imageInput : undefined}
        data-testid={testId}
        disabled={validating}
        placeholder={i18n.t(key === "imageAlt" ? "Describe the image…" : "None")}
        value={typeof draft[key] === "string" ? draft[key] : ""}
        onChange={(event) => {
          setDraft({ ...draft, [key]: event.target.value });
          setError("");
        }}
      />
      <FieldError id={`${formId}-${key}-error`}>{errorField === key ? error : ""}</FieldError>
    </div>
  );

  // Image surfaces select the Figure; double-click uses the explicit Edit path.
  const selectFigure = (event: ReactMouseEvent) => {
    const position = getPos();
    if (typeof position !== "number") return;
    event.preventDefault();
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)));
    view.focus();
  };
  return (
    <NodeViewWrapper
      as="figure"
      className="figure"
      data-block="figure"
      data-editing={editing}
      data-selected={selected}
      data-source-path={sourcePath}
    >
      <p ref={anchor} className="block-kind block-metadata" contentEditable={false}>{[numbered ?? i18n.t("Figure"), label].filter(Boolean).join(" · ")}</p>
      {hasUnappliedDraft ? (
        <p className="draft-status" role="status" data-testid="figure-draft-status" contentEditable={false}>{i18n.t(filenameDraft
          ? "File name changes require Rename in Advanced. Press Esc to discard them."
          : "Unapplied figure properties are not saved. Choose Done or press Esc to cancel.")}</p>
      ) : null}
      {src ? <img key={src} src={src} alt={applied.imageAlt} hidden={imageFailed} data-testid="figure-image" contentEditable={false} onMouseDown={selectFigure} onDoubleClick={beginEdit}
        onError={() => setFailedSource(src)} onLoad={() => setFailedSource(undefined)} /> : null}
      {imageFailed ? (
        <Notice tone="error" className="figure-image-error" data-testid="figure-image-error" contentEditable={false} onMouseDown={selectFigure} onDoubleClick={beginEdit}>{i18n.t("Image could not be loaded. Check the image path or URL.")}</Notice>
      ) : null}
      {editableFigure && !src ? (
        <div className="figure-no-content" data-testid="figure-no-content" contentEditable={false}
          onMouseDown={event => { if (!(event.target as HTMLElement).closest("button")) selectFigure(event); }}
          onDoubleClick={event => { if (!(event.target as HTMLElement).closest("button")) beginEdit(); }}>
          <Button size="sm" variant="outline" disabled={editing || choosing} onClick={() => {
            beginEdit(); setReplacing(true); void pickImage();
          }}>{i18n.t("Choose image")}</Button>
          <Button size="sm" variant="outline" disabled={editing || choosing} onClick={onWriteMermaid}>{i18n.t("Write Mermaid")}</Button>
        </div>
      ) : null}
      <figcaption className="caption" data-number={numbered} data-caption-prefix={numbered === undefined ? undefined : captionPrefixText(numbered)}
        onMouseDown={event => handleTextblockMouseDown(event, { editor, node, getPos })}><NodeViewContent data-testid="figure-caption-content" aria-label={i18n.t("Figure caption")}
        data-empty-caption={node.content.size === 0 || undefined} data-placeholder={placeholder} /></figcaption>
      {editableFigure && !editing ? (
        <Button className="figure-edit" size="sm" variant="outline" aria-label={i18n.t("Edit figure")} contentEditable={false} onClick={beginEdit}>{i18n.t("Edit")}</Button>
      ) : null}
      <FigureProperties
        anchor={anchor}
        kind={numbered ?? i18n.t("Figure")}
        testId="figure"
        open={editing}
        error={errorField ? undefined : error}
        busy={validating}
        choosing={choosing}
        onApply={outside => void apply(false, !outside)}
        onCancel={cancel}
      >
        <div className="figure-property-media">
          {src && !imageFailed ? <div className="figure-property-thumbnail"><img src={src} alt="" /></div> : null}
          <Button ref={replaceButton} type="button" size="sm" variant="outline" disabled={validating || choosing}
            data-testid="figure-replace" onClick={() => setReplacing(value => !value)}>{i18n.t("Replace")}</Button>
        </div>
        {replacing ? chooseImage && documentPath ? (
          <div className="figure-image-field">
            {field("imageUrl", i18n.t("Image"), "figure-image-url")}
            <Button ref={chooseButton} type="button" variant="outline" disabled={validating || choosing} onClick={() => void pickImage()}>{i18n.t("Choose…")}</Button>
          </div>
        ) : field("imageUrl", i18n.t("Image"), "figure-image-url") : null}
        {field("imageAlt", i18n.t("Alt text"), "figure-alt")}
        <div className="figure-property-columns">
        <div className="form-field">
          <label className="form-label" htmlFor={`${formId}-label`}>{i18n.t("Label")}</label>
          <Input id={`${formId}-label`}
            aria-invalid={!!error && errorField === "label" || undefined}
            aria-describedby={error && errorField === "label" ? `${formId}-label-error` : undefined}
            data-testid="figure-label"
            disabled={validating}
            value={labelDraft}
            placeholder={i18n.t("None")}
            onChange={(event) => {
              setLabelDraft(event.target.value);
              setError("");
            }}
          />
          <FieldError id={`${formId}-label-error`}>{errorField === "label" ? error : ""}</FieldError>
        </div>
        <NumberField editor={editor} getPos={getPos} testId="figure" draft={numberDraft} onChange={() => setError("")} disabled={validating} />
        </div>
        {canRename ? <details key={String(editing)} open={filenameDraft || !!error || undefined}>
          <summary><ChevronRight aria-hidden="true" />{i18n.t("Advanced")}</summary>
          <div className="figure-image-field"><div className="form-field"><label className="form-label" htmlFor={`${formId}-filename`}>{i18n.t("File name")}</label>
            <Input id={`${formId}-filename`} aria-invalid={!!error && errorField === "filename" || undefined}
              aria-describedby={error && errorField === "filename" ? `${formId}-filename-error` : undefined}
              data-testid="figure-file-name" value={filename} disabled={validating}
              placeholder={i18n.t("None")}
              onChange={event => { setFilename(event.target.value); setError(""); }} />
            <FieldError id={`${formId}-filename-error`}>{errorField === "filename" ? error : ""}</FieldError>
          </div><Button className="figure-rename" type="button" size="sm" variant="outline" disabled={validating || !filenameDraft}
            data-testid="figure-rename" onClick={() => void apply(true)}>{i18n.t("Rename")}</Button></div>
        </details> : null}
      </FigureProperties>
    </NodeViewWrapper>
  );
}

function MermaidFigureView({ node, editor, selected, getPos, view, onDraftChange, validateFigure, onCancelPending }: FigureViewProps & { onCancelPending?(): void }) {
  useTranslation();
  const placeholder = useCaptionPlaceholder({ editor, getPos }, "figure");
  const visible = useEditorVisible();
  const numbered = useCaptionNumberText(editor, getPos, "figure");
  const kind = numbered ?? i18n.t("Figure");
  const applied = figureAttrs(node);
  const label = String(node.attrs.label ?? "");
  const sourcePath = String(node.attrs.sourcePath ?? "");
  const anchor = useRef<HTMLParagraphElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const sourceButton = useRef<HTMLButtonElement>(null);
  const [properties, setProperties] = useState(false);
  const request = useRef(0);
  const [editing, setEditing] = useState(!!onCancelPending);
  const [draft, setDraft] = useState(applied.mermaidSource ?? "");
  const [labelDraft, setLabelDraft] = useState(label);
  const enumerator = String(node.attrs.enumerator ?? "");
  const numberDraft = useNumberDraft(enumerator);
  const formId = useId();
  const [errorField, setErrorField] = useState<"label" | "source">();
  const [error, setError] = useMessageState("");
  const [busy, setBusy] = useState(false);
  const restoreInput = useRef<HTMLElement | null>(null);
  const focusTracking = useRef<AbortController | null>(null);
  // Disabled fields cannot focus until React commits busy=false. Restore in that same commit,
  // before the user can type, and never after focus has moved to another surface.
  useLayoutEffect(() => {
    const target = restoreInput.current;
    restoreInput.current = null;
    const form = (input.current ?? sourceButton.current)?.closest("form");
    if (target?.isConnected && !busy && (editing || properties) && visible && document.hasFocus() &&
        (document.activeElement === document.body || form?.contains(document.activeElement))) target.focus();
  }, [busy, editing, properties, error, visible]);
  const hasDraft = (editing || properties) && (draft !== (applied.mermaidSource ?? "") || labelDraft !== label || numberDraft.changedFrom(enumerator));
  const cancelFocus = useSourceInputFocus(input, editing);
  useSourceInputFocus(sourceButton, properties);
  useEffect(() => () => { request.current++; focusTracking.current?.abort(); }, []);
  useEffect(() => {
    if (!editing && !properties) { setDraft(applied.mermaidSource ?? ""); setLabelDraft(label); numberDraft.reset(enumerator); }
  }, [editing, properties, applied.mermaidSource, label, enumerator]);
  useEffect(() => {
    onDraftChange?.("Figure", sourcePath, hasDraft);
    return () => onDraftChange?.("Figure", sourcePath, false);
  }, [sourcePath, hasDraft, onDraftChange]);
  function beginEdit() {
    if (!view.editable || editing || properties) return;
    setDraft(applied.mermaidSource ?? ""); setLabelDraft(label); numberDraft.reset(enumerator); setError(""); setProperties(true);
  }
  const [openOnInsert] = useState(() => view.editable && isNewBlockPath(sourcePath));
  useEffect(() => { if (openOnInsert) setEditing(true); }, [openOnInsert]);
  usePropertyEntry(anchor, beginEdit);
  const cancel = () => {
    request.current++; cancelFocus(); setBusy(false);
    focusTracking.current?.abort(); restoreInput.current = null;
    setDraft(applied.mermaidSource ?? ""); setLabelDraft(label); numberDraft.reset(enumerator); setError(""); setEditing(false);
    setProperties(false);
    onCancelPending?.();
    focusBlock(view, getPos);
  };
  const apply = async (openSource = false, returnCaret = true) => {
    if (!view.editable || busy) return;
    setErrorField(undefined);
    if (!numberDraft.validate()) return;
    const position = getPos();
    const current = typeof position === "number" ? view.state.doc.nodeAt(position) : null;
    if (!current) return;
    const caption = figureAttrs(current).caption;
    const source = normalizeMermaidSource(draft);
    const candidate = { ...figureAttrs(current), mermaidSource: source, caption };
    const invalidLabel = labelError(labelDraft);
    const invalidContent = figureContentError(candidate);
    const local = invalidLabel ?? invalidContent ?? (validateFigure ? undefined : "Figure validation is unavailable.");
    if (local) {
      setErrorField(invalidLabel ? "label" : invalidContent ? "source" : undefined);
      setError(local);
      if (invalidContent) input.current?.focus();
      return;
    }
    const pending = ++request.current;
    const form = (input.current ?? sourceButton.current)?.closest("form");
    const activeBefore = document.activeElement;
    const target = activeBefore instanceof HTMLInputElement || activeBefore instanceof HTMLTextAreaElement ? activeBefore : input.current ?? sourceButton.current;
    let movedFocus = !form?.contains(activeBefore);
    const trackFocus = (event: FocusEvent) => {
      if (event.target instanceof globalThis.Node && event.target !== document.body && !form?.contains(event.target)) movedFocus = true;
    };
    focusTracking.current?.abort();
    const tracking = new AbortController();
    focusTracking.current = tracking;
    document.addEventListener("focusin", trackFocus, { capture: true, signal: tracking.signal });
    const reject = (message: UiMessage) => {
      if (!movedFocus && !view.dom.closest("[hidden]")) restoreInput.current = target;
      setError(message);
    };
    setBusy(true); setError("");
    let message: string | undefined;
    try { message = await validateFigure!(candidate, labelDraft); }
    catch (cause) { message = i18n.t("Figure validation failed: {{reason}}", { reason: cause instanceof Error ? cause.message : String(cause) }); }
    finally { tracking.abort(); }
    if (request.current !== pending || editor.isDestroyed) return;
    setBusy(false);
    if (message) { reject(message); return; }
    const latestPosition = getPos();
    const latest = typeof latestPosition === "number" ? view.state.doc.nodeAt(latestPosition) : null;
    if (!latest || typeof latestPosition !== "number") return;
    if (JSON.stringify(figureAttrs(latest).caption) !== JSON.stringify(caption)) {
      reject({ key: "Caption changed during validation. Apply again." }); return;
    }
    const active = document.activeElement;
    const returnFocus = !view.dom.closest("[hidden]") &&
      (active === document.body || Boolean(form?.contains(active)));
    try {
      if (latest.attrs.mermaidSource !== source || latest.attrs.label !== labelDraft || latest.attrs.enumerator !== (numberDraft.value || null))
        view.dispatch(updateFigure(view.state, latestPosition, { mermaidSource: source, label: labelDraft, enumerator: numberDraft.value || null }));
    }
    catch (cause) { setErrorField("label"); reject(labelPropertyError(cause)); return; }
    cancelFocus(); setError(""); setProperties(false); setEditing(openSource);
    if (returnFocus && !openSource && returnCaret) focusBlock(view, getPos);
  };
  const selectFigure = (event: ReactMouseEvent) => {
    const position = getPos();
    if (typeof position !== "number") return;
    event.preventDefault();
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position))); view.focus();
  };
  return <NodeViewWrapper as="figure" className="figure mermaid-figure" data-block="figure"
    data-content-kind="mermaid" data-editing={editing || properties} data-selected={selected} data-source-path={sourcePath}>
    <p ref={anchor} className="block-kind block-metadata" contentEditable={false}>{[kind, label].filter(Boolean).join(" · ")}</p>
    {hasDraft ? <p className="draft-status" role="status" data-testid="figure-draft-status" contentEditable={false}>
      {i18n.t(editing ? "Unapplied changes are not saved. Apply to include them, or Cancel."
        : "Unapplied figure properties are not saved. Choose Done or press Esc to cancel.")}</p> : null}
    {editing ? visible ? <div contentEditable={false} data-testid="mermaid-properties" onDragStart={isolateInputDrag}
      onDragEnter={isolateInputDrag} onDragOver={isolateInputDrag} onDragLeave={isolateInputDrag} onDrop={isolateInputDrag} onDragEnd={isolateInputDrag}>
      <PropertyForm kind={kind} testId="mermaid" error={errorField ? undefined : error} busy={busy} onApply={() => void apply()} onCancel={cancel}>
        <div className="form-field"><label className="form-label" htmlFor={`${formId}-source`}>{i18n.t("Mermaid source")}</label>
          <textarea id={`${formId}-source`} aria-invalid={!!error && errorField === "source" || undefined}
            aria-describedby={error && errorField === "source" ? `${formId}-source-error` : undefined} ref={input} className="document-source-input" data-testid="mermaid-source" disabled={busy}
            value={draft} spellCheck={false} onChange={event => { setDraft(event.target.value.replace(/\r\n?/g, "\n")); setError(""); }} />
          <FieldError id={`${formId}-source-error`}>{errorField === "source" ? error : ""}</FieldError>
        </div>
        {!onCancelPending || draft.trim() ? <MermaidPreview source={draft} draft /> : null}
        <div className="form-field"><label className="form-label" htmlFor={`${formId}-label`}>{i18n.t("Label")}</label>
          <Input id={`${formId}-label`} aria-invalid={!!error && errorField === "label" || undefined}
            aria-describedby={error && errorField === "label" ? `${formId}-label-error` : undefined} data-testid="mermaid-label" disabled={busy} value={labelDraft} placeholder={i18n.t("None")}
            onChange={event => { setLabelDraft(event.target.value); setError(""); }} />
          <FieldError id={`${formId}-label-error`}>{errorField === "label" ? error : ""}</FieldError>
        </div>
        <NumberField editor={editor} getPos={getPos} testId="mermaid" draft={numberDraft} onChange={() => setError("")} disabled={busy} />
      </PropertyForm>
    </div> : null : null}
    {typeof applied.mermaidSource === "string" ? <div hidden={editing} contentEditable={false} onMouseDown={selectFigure} onDoubleClick={beginEdit}>
      <MermaidPreview source={applied.mermaidSource ?? ""} onReveal={() => { focusBlock(view, getPos); anchor.current?.scrollIntoView({ block: "center" }); }} />
    </div> : null}
    <figcaption className="caption" data-number={numbered} data-caption-prefix={numbered === undefined ? undefined : captionPrefixText(numbered)}
      onMouseDown={event => handleTextblockMouseDown(event, { editor, node, getPos })}>
      <NodeViewContent data-testid="figure-caption-content" aria-label={i18n.t("Figure caption")}
        data-empty-caption={node.content.size === 0 || undefined} data-placeholder={placeholder} />
    </figcaption>
    {view.editable && !editing && !properties ? <Button className="figure-edit" size="sm" variant="outline" aria-label={i18n.t("Edit figure")}
      contentEditable={false} onClick={beginEdit}>{i18n.t("Edit")}</Button> : null}
    <FigureProperties anchor={anchor} kind={kind} testId="mermaid-property" open={properties} error={errorField ? undefined : error} busy={busy}
      onApply={outside => void apply(false, !outside)} onCancel={cancel}>
      <div className="figure-property-media">
        <div className="figure-property-thumbnail"><MermaidPreview source={applied.mermaidSource ?? ""} /></div>
        <Button ref={sourceButton} type="button" size="sm" variant="outline" data-testid="mermaid-edit-source"
          disabled={busy} onClick={() => void apply(true)}>{i18n.t("Edit source")}</Button>
      </div>
      <div className="figure-property-columns">
        <div className="form-field"><label className="form-label" htmlFor={`${formId}-label`}>{i18n.t("Label")}</label>
          <Input id={`${formId}-label`} aria-invalid={!!error && errorField === "label" || undefined}
            aria-describedby={error && errorField === "label" ? `${formId}-label-error` : undefined} data-testid="mermaid-property-label" disabled={busy} value={labelDraft} placeholder={i18n.t("None")}
            onChange={event => { setLabelDraft(event.target.value); setError(""); }} />
          <FieldError id={`${formId}-label-error`}>{errorField === "label" ? error : ""}</FieldError>
        </div>
        <NumberField editor={editor} getPos={getPos} testId="mermaid-property" draft={numberDraft}
          onChange={() => setError("")} disabled={busy} />
      </div>
    </FigureProperties>
  </NodeViewWrapper>;
}

export function resolveFigureSource(imageUrl: string, documentPath?: string | (() => string)): string {
  const locator = typeof documentPath === "function" ? documentPath() : documentPath;
  const encodedPath = figureMediaPath(imageUrl);
  if (encodedPath === undefined) return imageUrl;
  const query = locator ? `?path=${encodeURIComponent(locator)}` : "";
  return `${import.meta.env?.BASE_URL ?? "/"}document/${encodedPath}${query}`;
}
