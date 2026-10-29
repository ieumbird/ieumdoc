import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import { Node, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { Pencil } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useEditorVisible } from "./editor-visibility.ts";
import type { ReferenceRole } from "@ieumdoc/core";
import { labelKey, resolveLabelReference, targetLabelError } from "@ieumdoc/core/label";
import { referenceNumberText, captionNumberText, type ReferenceTemplates, blockTargets, targetNumbers, type NumberedKind, type NumberedTargets } from "@ieumdoc/core/numbering";
import { Button } from "@/components/ui/button.tsx";
import { useOverlayBounds } from "./ui/use-overlay-bounds.ts";
import { tableCaption } from "./tiptap-edits.ts";
import { canEditEndnoteAt } from "./endnotes.ts";

/** A labeled Equation, Figure, Table or section in the current editor document that a reference
 * can name, with its computed number or, for a section, its heading text. */
export type ReferenceTarget = { role: ReferenceRole; label: string; number?: number | string; template?: string; kind?: NumberedKind; title?: string };

/** A reference to an unlabeled heading: inserting it labels the heading too. */
type HeadingChoice = { heading: number; title: string };

const KIND: Record<ReferenceRole, string> = { get eq() { return i18n.t("Equation"); }, get numref() { return i18n.t("Figure"); }, get ref() { return i18n.t("Section"); } };
const HEADINGS = new Set(["heading"]);

// Each immutable engine document shares the same display numbers across its NodeViews.
const numbersOf = new WeakMap<ProseMirrorNode, readonly Readonly<NumberedTargets>[]>();

/**
 * The equation, figure and table numbers of each top-level block of the current editor
 * document, by Core's numbering rule: snapshot blocks keep the targets Core counted, blocks
 * added since have their kind's default. Numbers are display only and never saved.
 */
export function blockNumbers(doc: ProseMirrorNode): readonly Readonly<NumberedTargets>[] {
  const existing = numbersOf.get(doc);
  if (existing) return existing;
  const blocks: NumberedTargets[] = [];
  doc.forEach((node) => blocks.push(blockTargets({ block: node.type.name, enumerator: node.attrs.enumerator ?? undefined })));
  const numbers = targetNumbers(blocks);
  numbersOf.set(doc, numbers);
  return numbers;
}

/** The computed number of the top-level block at `pos`, for one target kind. */
export function blockNumberAt(doc: ProseMirrorNode, pos: number, kind: NumberedKind): number | string | undefined {
  return blockNumbers(doc)[doc.resolve(pos).index(0)]?.[kind];
}

/** A target block's computed number, following every change to the editor document. */
export function useBlockNumber(editor: Editor, getPos: () => number | undefined, kind: NumberedKind): number | string | undefined {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const pos = getPos();
      return current && typeof pos === "number" ? blockNumberAt(current.state.doc, pos, kind) : undefined;
    },
  }) ?? undefined;
}

/** Shared body/navigation caption prefix; the number itself comes from Core templates. */
export function captionPrefixText(numbered: string): string {
  return `${numbered}. `;
}

/** Core caption text follows both the current number and document template changes. */
export function useCaptionNumberText(editor: Editor, getPos: () => number | undefined, kind: NumberedKind): string | undefined {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const pos = getPos();
      if (!current || typeof pos !== "number") return undefined;
      const doc = current.state.doc;
      const number = blockNumberAt(doc, pos, kind);
      if (number === undefined) return undefined;
      if (kind === "equation") {
        const text = referenceNumberText(kind, number, doc.attrs.referenceTemplates);
        return doc.attrs.referenceTemplates?.equation === undefined ? `${i18n.t("Equation")} ${text}` : text;
      }
      return captionNumberText(kind, number, doc.attrs.referenceTemplates);
    },
  }) ?? undefined;
}

/** How a number is shown: equations in parentheses, as MyST renders them. */
export function numberText(kind: NumberedKind, number: number | string): string {
  return kind === "equation" ? `(${number})` : String(number);
}

/** A native heading's text. */
function headingText(node: ProseMirrorNode): string {
  return node.type.name === "heading" ? node.textContent : String(node.attrs.text ?? "");
}

/** The heading a run of `(label)=` targets starting at `index` labels, as Core's section rule reads them. */
function labeledHeading(doc: ProseMirrorNode, index: number): number | undefined {
  let next = index;
  while (doc.maybeChild(next)?.type.name === "labelTarget") next++;
  return HEADINGS.has(doc.maybeChild(next)?.type.name ?? "") ? next : undefined;
}

/**
 * The applied Equation ({eq}), Figure and Table ({numref}) and section ({ref}) labels of the
 * current document, in document order. Labels come from Core's read model and the label edits
 * applied since. A section label is a target directly before its heading.
 */
export function referenceTargets(doc: ProseMirrorNode): ReferenceTarget[] {
  const numbers = blockNumbers(doc);
  const targets: ReferenceTarget[] = [];
  doc.forEach((node, _pos, index) => {
    const label = String(node.attrs.label ?? "");
    if (node.type.name === "labelTarget") {
      const heading = labeledHeading(doc, index);
      if (label.length > 0 && heading !== undefined) targets.push({ role: "ref", label, title: headingText(doc.child(heading)) });
      return;
    }
    const role: ReferenceRole | undefined = node.type.name === "equation" ? "eq" : ["figure", "table"].includes(node.type.name) ? "numref" : undefined;
    if (label.length === 0 || !role) return;
    const kind = node.type.name as NumberedKind;
    const number = numbers[index][kind];
    const template = (doc.attrs.referenceTemplates as ReferenceTemplates | null)?.[kind];
    targets.push({ role, label, ...(template === undefined ? {} : { template }), ...(kind === "table" ? { kind } : {}), ...(number === undefined ? {} : { number }) });
  });
  return targets;
}

/** Headings no section label names yet, which a reference can label as it is inserted. */
function unlabeledHeadings(doc: ProseMirrorNode): HeadingChoice[] {
  const headings: HeadingChoice[] = [];
  doc.forEach((node, _pos, index) => {
    if (HEADINGS.has(node.type.name) && doc.maybeChild(index - 1)?.type.name !== "labelTarget" && headingText(node).trim()) {
      headings.push({ heading: index, title: headingText(node) });
    }
  });
  return headings;
}

/** Whether the heading at `index` has a section label. */
export function hasSectionLabel(doc: ProseMirrorNode, index: number): boolean {
  return HEADINGS.has(doc.maybeChild(index)?.type.name ?? "") && doc.maybeChild(index - 1)?.type.name === "labelTarget";
}

/**
 * A new section label for the heading at `index`: `sec-` and an ASCII slug of its text, or a
 * numbered `sec-n`, that names no target in the document. MyST reads only ASCII target labels.
 */
export function newSectionLabel(doc: ProseMirrorNode, index: number): string {
  const taken = new Set<string>();
  doc.forEach((node) => { if (typeof node.attrs.label === "string" && node.attrs.label) taken.add(labelKey(node.attrs.label)); });
  const slug = headingText(doc.child(index)).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
  const base = slug ? `sec-${slug}` : "sec";
  for (let suffix = slug ? 1 : 2; ; suffix++) {
    const label = suffix === 1 ? base : `${base}-${suffix - (slug ? 0 : 1)}`;
    if (!taken.has(labelKey(label)) && !targetLabelError(label)) return label;
  }
}

function blockPosition(doc: ProseMirrorNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  return pos;
}

/** Label the heading at `index` with a new `(label)=` target before it. */
export function addSectionLabel(state: EditorState, index: number): Transaction {
  const target = state.schema.nodes.labelTarget.create({ label: newSectionLabel(state.doc, index) });
  return state.tr.insert(blockPosition(state.doc, index), target).scrollIntoView();
}

/** The target a reference names here, compared the way MyST resolves labels. */
export function resolvedTarget(targets: ReferenceTarget[], role: ReferenceRole, label: string): ReferenceTarget | undefined {
  return resolveLabelReference({ label }, key => targets.find((target) => target.role === role && labelKey(target.label) === key));
}

/** Remaining references whose resolved target block was removed, not merely relabeled.
 * Session source paths identify blocks only within this editor's immutable opening snapshot. */
export function referencesBrokenByDeletion(before: ProseMirrorNode, after: ProseMirrorNode): ReferenceTarget[] {
  const remaining = new Set<string>();
  after.forEach(node => remaining.add(String(node.attrs.sourcePath)));
  const deletedLabels = new Set<string>();
  before.forEach(node => {
    if (node.attrs.label && !remaining.has(String(node.attrs.sourcePath))) deletedLabels.add(labelKey(String(node.attrs.label)));
  });
  if (!deletedLabels.size) return [];
  const was = referenceTargets(before);
  const now = referenceTargets(after);
  const broken: ReferenceTarget[] = [];
  const visit = (node: ProseMirrorNode) => {
    if (node.type.name === "crossReference") {
      const role = node.attrs.role as ReferenceRole;
      const label = String(node.attrs.label);
      if (deletedLabels.has(labelKey(label)) && resolvedTarget(was, role, label) && !resolvedTarget(now, role, label)) broken.push({ role, label });
    }
    for (const mark of node.marks) {
      if (mark.type.name !== "link") continue;
      const reference = { url: String(mark.attrs.href) };
      const target = resolveLabelReference(reference, key => was.find(target => labelKey(target.label) === key));
      if (target && deletedLabels.has(labelKey(target.label)) &&
          !resolveLabelReference(reference, key => now.find(target => labelKey(target.label) === key))) broken.push(target);
    }
  };
  after.descendants(visit);
  return broken;
}

/** How a reference reads, as its chip shows it: the target's computed number, a section's heading
 * text, or the label when it names no target here. */
export function referenceDisplay(targets: ReferenceTarget[], role: ReferenceRole, label: string): { text: string; resolved: boolean; kindName: string } {
  const target = resolvedTarget(targets, role, label);
  if (!target) return { text: i18n.t("Unresolved reference: {{label}}", { label }), resolved: false, kindName: "" };
  const kindName = target?.kind === "table" ? i18n.t("Table") : KIND[role];
  // A resolved reference shows its target's computed number or a section's heading text, as MyST renders it.
  const kind = target.kind ?? (role === "eq" ? "equation" : "figure");
  const text = role === "ref" ? `§ ${target.title ?? label}` : target.number !== undefined
    ? referenceNumberText(kind, target.number, target.template === undefined ? undefined : { [kind]: target.template }) : label;
  return { text, resolved: true, kindName };
}

/** What an unresolved reference tells the reader. */
export function unresolvedStatus(_role: ReferenceRole, label: string): string {
  return i18n.t("Unresolved reference: no target labeled “{{label}}” in this document", { label });
}

/** Whether a reference names a target of its kind here, compared the way MyST resolves labels. */
export function isResolved(targets: ReferenceTarget[], role: ReferenceRole, label: string): boolean {
  return resolvedTarget(targets, role, label) !== undefined;
}

/** Select the block a reference names and bring it into view; false when it names no target here.
 * A section reference goes to the start of its heading. */
export function revealReferenceTarget(editor: Editor, role: ReferenceRole, label: string): boolean {
  const key = labelKey(label);
  const { doc } = editor.state;
  let target: number | undefined;
  doc.forEach((node, pos, index) => {
    const own = String(node.attrs.label ?? "");
    if (target !== undefined || own.length === 0 || labelKey(own) !== key) return;
    if (role === "ref" && node.type.name === "labelTarget") {
      const heading = labeledHeading(doc, index);
      if (heading !== undefined) target = blockPosition(doc, heading);
    } else if (role === "eq" ? node.type.name === "equation" : role === "numref" && ["figure", "table"].includes(node.type.name)) {
      target = pos;
    }
  });
  if (target === undefined) return false;
  const textHeading = doc.nodeAt(target)?.type.name === "heading";
  editor.view.dispatch(editor.state.tr.setSelection(textHeading ? TextSelection.create(doc, target + 1) : NodeSelection.create(doc, target)));
  editor.view.focus();
  const element = editor.view.nodeDOM(target);
  if (element instanceof HTMLElement) element.scrollIntoView({ block: "center" });
  return true;
}

/** Slash menu items that insert a reference to each target matching the query, then to each
 * unlabeled heading the query searches for (which inserting the reference labels). */
export function referenceCommandItems(doc: ProseMirrorNode, query: string): { id: string; label: string; group: string }[] {
  const needle = query.toLowerCase().replace(/\s+/g, " ").trim();
  const matches = (words: string[]) => needle.length === 0 || ["reference", "ref", "참조", ...words].some((word) => word.toLowerCase().replace(/\s+/g, " ").startsWith(needle));
  const titleWords = (title: string) => [title, ...title.split(/\s+/)];
  // Captions are needed only by this menu, never by the per-chip resolution selectors.
  // Both caption kinds are live inline children.
  const captions = new Map<string, string>();
  doc.forEach((node) => {
    const label = String(node.attrs.label ?? "");
    if (!label || !["figure", "table"].includes(node.type.name)) return;
    const content = node.type.name === "table" ? node.lastChild?.type.name === "tableCaption" ? node.lastChild : undefined : node;
    const caption = content?.textBetween(0, content.content.size, " ",
      leaf => String(leaf.attrs.value ?? leaf.attrs.label ?? " ")).replace(/\s+/g, " ").trim();
    if (caption) captions.set(label, caption);
  });
  const kindName = (target: ReferenceTarget) => target.kind === "table" ? i18n.t("Table") : KIND[target.role];
  const display = (target: ReferenceTarget) => referenceDisplay([target], target.role, target.label).text;
  const menuLabel = (target: ReferenceTarget, caption?: string) => {
    if (target.role === "ref") return i18n.t("Section reference: {{title}}", { title: target.title ?? target.label });
    const detail = caption ?? target.label;
    const characters = Array.from(detail);
    const summary = caption && characters.length > 80 ? `${characters.slice(0, 80).join("")}…` : detail;
    return target.number === undefined && !caption ? display(target) : `${display(target)} · ${summary}`;
  };
  return [
    ...referenceTargets(doc)
      .filter((target) => {
        const caption = captions.get(target.label);
        return matches([kindName(target), target.kind ?? target.role, target.label, display(target),
          ...({eq: ["equation", "수식"], numref: target.kind === "table" ? ["table", "표"] : ["figure", "그림"], ref: ["section", "절", "제목"]}[target.role]),
          ...(target.number === undefined ? [] : [String(target.number)]),
          ...(target.role === "eq" && target.number !== undefined ? [numberText("equation", target.number)] : []),
          ...(caption ? [caption, ...caption.split(/[\s\p{P}]+/u)] : []),
          ...(target.title ? ["heading", ...titleWords(target.title)] : [])]);
      })
      .map((target) => ({ id: referenceCommandId(target), label: menuLabel(target, captions.get(target.label)), group: i18n.t("References") })),
    // Generic reference, section and heading-word searches include unlabeled headings; empty queries do not.
    ...unlabeledHeadings(doc)
      .filter((choice) => needle.length > 0 && matches(["section", "heading", "절", "제목", ...titleWords(choice.title)]))
      .map((choice) => ({ id: `reference:heading:${choice.heading}`, label: i18n.t("Section reference: {{title}}", { title: choice.title }), group: i18n.t("References") })),
  ];
}

export function referenceCommandId(target: ReferenceTarget): string {
  return `reference:${target.role}:${target.label}`;
}

export function referenceOfCommand(id: string): ReferenceTarget | HeadingChoice | undefined {
  const heading = /^reference:heading:(\d+)$/.exec(id);
  if (heading) return { heading: Number(heading[1]), title: "" };
  const match = /^reference:(eq|numref|ref):(.+)$/s.exec(id);
  return match ? { role: match[1] as ReferenceRole, label: match[2] } : undefined;
}

/**
 * Replace a range of one paragraph (a selection or a slash query) with a reference, keeping
 * the bold/italic marks that cover it. References are never inside links. A reference to an
 * unlabeled heading labels it in the same step.
 */
export function insertReference(editor: Editor, range: { from: number; to: number }, choice: ReferenceTarget | HeadingChoice): boolean {
  const { state } = editor;
  const $from = state.doc.resolve(range.from);
  const $to = state.doc.resolve(range.to);
  const parent = $from.parent;
  if (!$from.sameParent($to) || !(parent.type.name === "paragraph" ||
      parent.type.name === "quote" || parent.type.name === "footnoteDefinition" || parent.type.name === "heading" || parent.type.name === "tableCell" || parent.type.name === "figure" || parent.type.name === "tableCaption" || parent.type.name === "admonition")) return false;
  const marks = (range.from === range.to ? state.storedMarks ?? $from.marks() : $from.marksAcross($to) ?? [])
    .filter((mark) => mark.type.name !== "link");
  const tr = state.tr;
  let target = choice as ReferenceTarget;
  if ("heading" in choice) {
    target = { role: "ref", label: newSectionLabel(state.doc, choice.heading) };
    tr.insert(blockPosition(state.doc, choice.heading), state.schema.nodes.labelTarget.create({ label: target.label }));
  }
  const from = tr.mapping.map(range.from);
  const reference = state.schema.nodes.crossReference.create({ role: target.role, label: target.label }, null, marks);
  tr.replaceWith(from, tr.mapping.map(range.to), reference);
  editor.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + reference.nodeSize)).scrollIntoView());
  editor.view.focus();
  return true;
}

// A local {eq}/{numref} cross-reference is an atomic inline node holding its role and label.
// Bold and italic apply to it like to text; a link cannot contain it.
export const CrossReference = Node.create({
  name: "crossReference",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  marks: "bold italic",
  addAttributes() {
    return {
      role: {
        default: "eq",
        parseHTML: (element) => element.getAttribute("data-role") ?? "eq",
        renderHTML: (attributes) => ({ "data-role": String(attributes.role ?? "eq") }),
      },
      label: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-label") ?? "",
        renderHTML: (attributes) => ({ "data-label": String(attributes.label ?? "") }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-cross-reference]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, "data-cross-reference": "" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CrossReferenceView, { as: "span" });
  },
});

function CrossReferenceView({ node, editor, getPos, updateAttributes, selected }: ReactNodeViewProps) {
  useTranslation();
  const role = node.attrs.role as ReferenceRole;
  const label = String(node.attrs.label ?? "");
  const [editing, setEditing] = useState(false);
  const canEdit = useEditorState({ editor, selector: ({ editor: current }) => {
    const pos = getPos();
    return !!current && typeof pos === "number" && canEditEndnoteAt(current.state, pos);
  } });
  useEffect(() => { if (!canEdit) setEditing(false); }, [canEdit]);
  // Resolution follows label changes anywhere in the document, including unsaved ones.
  const targets = useEditorState({
    editor,
    selector: ({ editor: current }) => JSON.stringify(current ? referenceTargets(current.state.doc) : []),
  });
  const { text, resolved, kindName } = referenceDisplay(JSON.parse(targets ?? "[]") as ReferenceTarget[], role, label);
  const close = () => {
    setEditing(false);
    editor.view.focus();
  };
  // Replace the reference with its label as ordinary text, keeping bold/italic marks.
  const remove = () => {
    const position = getPos();
    if (typeof position !== "number") return;
    setEditing(false);
    editor.chain().focus().insertContentAt({ from: position, to: position + node.nodeSize },
      { type: "text", text: label, marks: node.marks.map((mark) => mark.toJSON()) }).run();
  };
  const accessibleText = role === "ref" ? `${kindName} ${label}` : `${text} · ${label}`;
  const status = resolved ? `${accessibleText}. Click to go to it.` : unresolvedStatus(role, label);
  return (
    <NodeViewWrapper
      as="span"
      className="cross-reference"
      data-selected={selected ? "true" : "false"}
      data-resolved={resolved ? "true" : "false"}
      data-testid="cross-reference"
      data-role={role}
      data-label={label}
    >
      {/* A resolved reference goes to its target; one without a target opens the form. */}
      <span className="cross-reference-chip" title={status} aria-label={status}
        onClick={() => { if (!revealReferenceTarget(editor, role, label) && canEdit) setEditing(true); }}>
        {text}
      </span>
      {canEdit ? <button type="button" className="cross-reference-edit" aria-label={i18n.t("Edit reference")} title={i18n.t("Edit reference")}
        data-testid="cross-reference-edit" onMouseDown={(event) => event.preventDefault()} onClick={() => setEditing(true)}>
        <Pencil aria-hidden="true" size={12} />
      </button> : null}
      {editing && canEdit ? (
        <ReferenceForm
          className="cross-reference-form"
          editor={editor}
          current={{ role, label }}
          onApply={(target) => {
            updateAttributes({ role: target.role, label: target.label });
            close();
          }}
          onRemove={remove}
          onClose={close}
          onDismiss={() => setEditing(false)}
        />
      ) : null}
    </NodeViewWrapper>
  );
}

/**
 * Pick a target among the document's labeled Equations and Figures. An existing reference
 * whose target is missing stays selectable as it is, so opening the form changes nothing.
 */
export function ReferenceForm({ editor, current, preferredLabel, className, style, onApply, onRemove, onClose, onDismiss }: {
  editor: Editor;
  current?: ReferenceTarget;
  /** Preselects a target with this label, e.g. the selected text a new reference replaces. */
  preferredLabel?: string;
  className?: string;
  style?: CSSProperties;
  onApply: (target: ReferenceTarget) => void;
  onRemove?: () => void;
  onClose: () => void;
  onDismiss?: () => void;
}) {
  useTranslation();
  const visible = useEditorVisible();
  const formId = useId();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);
  const targets = referenceTargets(editor.state.doc);
  const options = current && !targets.some((target) => referenceCommandId(target) === referenceCommandId(current))
    ? [current, ...targets] : targets;
  const preferred = targets.find((target) => preferredLabel !== undefined && labelKey(target.label) === labelKey(preferredLabel));
  const initial = current ?? preferred ?? options[0];
  const [value, setValue] = useState(initial ? referenceCommandId(initial) : "");
  const bounds = useOverlayBounds<HTMLFormElement>();
  useEffect(() => {
    if (!visible) return;
    // An empty target list has no autofocus control. Dismiss independently of focus/blur,
    // including clicks on non-focusable surfaces, without taking focus from the clicked target.
    const outside = (event: PointerEvent) => {
      if (!bounds.current?.contains(event.target as globalThis.Node)) (onDismiss ?? onClose)();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, [visible, onDismiss, onClose, bounds]);
  const apply = () => {
    const target = referenceOfCommand(value);
    if (target && !("heading" in target)) onApply(target);
  };
  if (!visible) return null;
  return (
    <form
      ref={bounds}
      className={`selection-toolbar reference-form ${className ?? ""}`}
      contentEditable={false}
      role="dialog"
      aria-label={i18n.t("Cross-reference")}
      data-testid="reference-form"
      style={style}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) (onDismiss ?? onClose)();
      }}
    >
      <label className="form-label" htmlFor={formId}>{i18n.t("Reference target")}</label>
      {options.length > 0 ? (
        <>
          <select
            id={formId}
            autoFocus={!mounted.current}
            className="reference-target"
            aria-label={i18n.t("Reference target")}
            data-testid="reference-target"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          >
            {options.map((target) => {
              const missing = !isResolved(targets, target.role, target.label);
              return (
                <option key={referenceCommandId(target)} value={referenceCommandId(target)}>
                  {target.role === "ref" ? KIND.ref : referenceDisplay(targets, target.role, target.label).text} · {target.title ? `${target.title} (${target.label})` : target.label}{missing ? i18n.t(" (unresolved)") : ""}
                </option>
              );
            })}
          </select>
          <Button size="sm" type="submit" data-testid="reference-apply">{i18n.t("Apply")}</Button>
        </>
      ) : (
        <span className="reference-empty">{i18n.t("Label an Equation, Figure, Table or heading to reference it.")}</span>
      )}
      {onRemove ? <Button size="sm" variant="outline" data-testid="reference-remove" onClick={onRemove}>{i18n.t("Remove")}</Button> : null}
    </form>
  );
}
