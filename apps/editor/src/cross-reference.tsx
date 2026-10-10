import { Node, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { Pencil } from "lucide-react";
import { useState, type CSSProperties } from "react";
import type { ReferenceRole } from "@ieumdoc/core";
import { labelKey, targetLabelError } from "@ieumdoc/core/label";
import { blockTargets, targetNumbers, type NumberedKind, type NumberedTargets } from "@ieumdoc/core/numbering";
import { Button } from "@/components/ui/button.tsx";
import { useOverlayBounds } from "./ui/use-overlay-bounds.ts";

/** A labeled Equation, Figure, Table or section in the current editor document that a reference
 * can name, with its computed number or, for a section, its heading text. */
export type ReferenceTarget = { role: ReferenceRole; label: string; number?: number; kind?: NumberedKind; title?: string };

/** A reference to an unlabeled heading: inserting it labels the heading too. */
type HeadingChoice = { heading: number; title: string };

const KIND: Record<ReferenceRole, string> = { eq: "Equation", numref: "Figure", ref: "Section" };
const PREFIX: Record<ReferenceRole, string> = { eq: "Eq.", numref: "Fig.", ref: "§" };
const HEADINGS = new Set(["heading", "readonlyHeading"]);

/**
 * The equation, figure and table numbers of each top-level block of the current editor
 * document, by Core's numbering rule: snapshot blocks keep the targets Core counted, blocks
 * added since have their kind's default. Numbers are display only and never saved.
 */
export function blockNumbers(doc: ProseMirrorNode): NumberedTargets[] {
  const blocks: NumberedTargets[] = [];
  doc.forEach((node) => blocks.push(blockTargets({ block: node.type.name, label: node.attrs.label, caption: node.attrs.caption, numbered: node.attrs.numbered as NumberedTargets | null })));
  return targetNumbers(blocks);
}

/** The computed number of the top-level block at `pos`, for one target kind. */
export function blockNumberAt(doc: ProseMirrorNode, pos: number, kind: NumberedKind): number | undefined {
  return blockNumbers(doc)[doc.resolve(pos).index(0)]?.[kind];
}

/** A target block's computed number, following every change to the editor document. */
export function useBlockNumber(editor: Editor, getPos: () => number | undefined, kind: NumberedKind): number | undefined {
  return useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const pos = getPos();
      return current && typeof pos === "number" ? blockNumberAt(current.state.doc, pos, kind) : undefined;
    },
  }) ?? undefined;
}

/** How a number is shown: equations in parentheses, as MyST renders them. */
export function numberText(kind: NumberedKind, number: number): string {
  return kind === "equation" ? `(${number})` : String(number);
}

/** A heading's text, editable or read-only. */
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
    targets.push({ role, label, ...(kind === "table" ? { kind } : {}), ...(number === undefined ? {} : { number }) });
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
  const key = labelKey(label);
  return targets.find((target) => target.role === role && labelKey(target.label) === key);
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
  const needle = query.toLowerCase();
  const matches = (words: string[]) => needle.length === 0 || ["reference", "ref", ...words].some((word) => word.toLowerCase().startsWith(needle));
  const titleWords = (title: string) => [title, ...title.split(/\s+/)];
  const kindName = (target: ReferenceTarget) => target.kind === "table" ? "Table" : KIND[target.role];
  return [
    ...referenceTargets(doc)
      .filter((target) => matches([kindName(target), target.label, ...(target.title ? ["heading", ...titleWords(target.title)] : [])]))
      .map((target) => ({ id: referenceCommandId(target), label: `${kindName(target)} reference: ${target.title ?? target.label}`, group: "References" })),
    // Every heading can be referenced; only a search for sections or a heading's words lists them.
    ...unlabeledHeadings(doc)
      .filter((choice) => needle.length > 0 && ["section", "heading", ...titleWords(choice.title)].some((word) => word.toLowerCase().startsWith(needle)))
      .map((choice) => ({ id: `reference:heading:${choice.heading}`, label: `Section reference: ${choice.title}`, group: "References" })),
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
      parent.type.name === "quote" || parent.type.name === "footnoteDefinition" || parent.type.name === "heading" || parent.type.name === "tableCell" || (parent.type.name === "figure" && parent.attrs.editable === true) || (parent.type.name === "admonition" && parent.attrs.editable === true))) return false;
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
  const role = node.attrs.role as ReferenceRole;
  const label = String(node.attrs.label ?? "");
  const [editing, setEditing] = useState(false);
  // Resolution follows label changes anywhere in the document, including unsaved ones.
  const targets = useEditorState({
    editor,
    selector: ({ editor: current }) => JSON.stringify(current ? referenceTargets(current.state.doc) : []),
  });
  const target = resolvedTarget(JSON.parse(targets ?? "[]") as ReferenceTarget[], role, label);
  const resolved = target !== undefined;
  const close = () => {
    setEditing(false);
    editor.commands.focus();
  };
  // Replace the reference with its label as ordinary text, keeping bold/italic marks.
  const remove = () => {
    const position = getPos();
    if (typeof position !== "number") return;
    setEditing(false);
    editor.chain().focus().insertContentAt({ from: position, to: position + node.nodeSize },
      { type: "text", text: label, marks: node.marks.map((mark) => mark.toJSON()) }).run();
  };
  const kindName = target?.kind === "table" ? "Table" : KIND[role];
  const status = resolved ? `${kindName} ${label}. Click to go to it.` : `Unresolved: no ${KIND[role]} labeled “${label}” in this document`;
  // A resolved reference shows its target's computed number or a section's heading text, as MyST renders it.
  const shown = target?.number !== undefined ? numberText(target.kind ?? (role === "eq" ? "equation" : "figure"), target.number) : target?.title ?? label;
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
        onClick={() => { if (!revealReferenceTarget(editor, role, label)) setEditing(true); }}>
        {target?.kind === "table" ? "Table" : PREFIX[role]} {shown}
      </span>
      <button type="button" className="cross-reference-edit" aria-label="Edit reference" title="Edit reference"
        data-testid="cross-reference-edit" onMouseDown={(event) => event.preventDefault()} onClick={() => setEditing(true)}>
        <Pencil aria-hidden="true" size={12} />
      </button>
      {editing ? (
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
  const targets = referenceTargets(editor.state.doc);
  const options = current && !targets.some((target) => referenceCommandId(target) === referenceCommandId(current))
    ? [current, ...targets] : targets;
  const preferred = targets.find((target) => preferredLabel !== undefined && labelKey(target.label) === labelKey(preferredLabel));
  const initial = current ?? preferred ?? options[0];
  const [value, setValue] = useState(initial ? referenceCommandId(initial) : "");
  const bounds = useOverlayBounds<HTMLFormElement>();
  const apply = () => {
    const target = referenceOfCommand(value);
    if (target && !("heading" in target)) onApply(target);
  };
  return (
    <form
      ref={bounds}
      className={`selection-toolbar reference-form ${className ?? ""}`}
      contentEditable={false}
      role="dialog"
      aria-label="Cross-reference"
      data-testid="reference-form"
      style={style}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) (onDismiss ?? onClose)();
      }}
    >
      <label className="form-label" htmlFor="reference-target">Reference target</label>
      {options.length > 0 ? (
        <>
          <select
            id="reference-target"
            autoFocus
            className="reference-target"
            aria-label="Reference target"
            data-testid="reference-target"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          >
            {options.map((target) => {
              const missing = !isResolved(targets, target.role, target.label);
              return (
                <option key={referenceCommandId(target)} value={referenceCommandId(target)}>
                  {target.kind === "table" ? "Table" : KIND[target.role]} · {target.title ? `${target.title} (${target.label})` : target.label}{missing ? " (unresolved)" : ""}
                </option>
              );
            })}
          </select>
          <Button size="sm" type="submit" data-testid="reference-apply">Apply</Button>
        </>
      ) : (
        <span className="reference-empty">Label an Equation, Figure, Table or heading to reference it.</span>
      )}
      {onRemove ? <Button size="sm" variant="outline" data-testid="reference-remove" onClick={onRemove}>Remove</Button> : null}
    </form>
  );
}
