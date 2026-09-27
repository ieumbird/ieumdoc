import { Node, type Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeViewWrapper, ReactNodeViewRenderer, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { useState, type CSSProperties } from "react";
import type { ReferenceRole } from "@ieumdoc/core";
import { labelKey } from "@ieumdoc/core/label";
import { Button } from "./ui/primitives.tsx";
import { useOverlayBounds } from "./ui/use-overlay-bounds.ts";

/** A labeled Equation or Figure in the current editor document that a reference can name. */
export type ReferenceTarget = { role: ReferenceRole; label: string };

const KIND: Record<ReferenceRole, string> = { eq: "Equation", numref: "Figure" };
const PREFIX: Record<ReferenceRole, string> = { eq: "Eq.", numref: "Fig." };

/**
 * The applied Equation ({eq}) and Figure ({numref}) labels of the current document, in
 * document order. Labels come from Core's read model and the label edits applied since.
 */
export function referenceTargets(doc: ProseMirrorNode): ReferenceTarget[] {
  const targets: ReferenceTarget[] = [];
  doc.forEach((node) => {
    const label = String(node.attrs.label ?? "");
    if (label.length === 0) return;
    if (node.type.name === "equation") targets.push({ role: "eq", label });
    else if (node.type.name === "figure") targets.push({ role: "numref", label });
  });
  return targets;
}

/** Whether a reference names a target of its kind here, compared the way MyST resolves labels. */
export function isResolved(targets: ReferenceTarget[], role: ReferenceRole, label: string): boolean {
  const key = labelKey(label);
  return targets.some((target) => target.role === role && labelKey(target.label) === key);
}

/** Slash menu items that insert a reference to each target matching the query. */
export function referenceCommandItems(targets: ReferenceTarget[], query: string): { id: string; label: string }[] {
  const needle = query.toLowerCase();
  return targets
    .filter((target) => needle.length === 0 || ["reference", "ref", KIND[target.role].toLowerCase(), target.label.toLowerCase()]
      .some((word) => word.startsWith(needle)))
    .map((target) => ({ id: referenceCommandId(target), label: `${KIND[target.role]} reference: ${target.label}` }));
}

export function referenceCommandId(target: ReferenceTarget): string {
  return `reference:${target.role}:${target.label}`;
}

export function referenceOfCommand(id: string): ReferenceTarget | undefined {
  const match = /^reference:(eq|numref):(.+)$/s.exec(id);
  return match ? { role: match[1] as ReferenceRole, label: match[2] } : undefined;
}

/**
 * Replace a range of one paragraph (a selection or a slash query) with a reference, keeping
 * the bold/italic marks that cover it. References are never inside links.
 */
export function insertReference(editor: Editor, range: { from: number; to: number }, target: ReferenceTarget): boolean {
  const { state } = editor;
  const $from = state.doc.resolve(range.from);
  const $to = state.doc.resolve(range.to);
  const parent = $from.parent;
  if (!$from.sameParent($to) || !(parent.type.name === "paragraph" ||
      (parent.type.name === "admonition" && parent.attrs.editable === true))) return false;
  const marks = (range.from === range.to ? state.storedMarks ?? $from.marks() : $from.marksAcross($to) ?? [])
    .filter((mark) => mark.type.name !== "link");
  return editor.chain().focus().insertContentAt(range, {
    type: "crossReference",
    attrs: { role: target.role, label: target.label },
    marks: marks.map((mark) => mark.toJSON()),
  }).run();
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
  const resolved = isResolved(JSON.parse(targets ?? "[]") as ReferenceTarget[], role, label);
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
  const status = resolved ? `${KIND[role]} ${label}` : `Unresolved: no ${KIND[role]} labeled “${label}” in this document`;
  return (
    <NodeViewWrapper
      as="span"
      className="cross-reference"
      data-selected={selected ? "true" : "false"}
      data-resolved={resolved ? "true" : "false"}
      data-testid="cross-reference"
    >
      <span className="cross-reference-chip" title={status} aria-label={status} onClick={() => setEditing(true)}>
        {PREFIX[role]} {label}
      </span>
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
    if (target) onApply(target);
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
                  {KIND[target.role]} · {target.label}{missing ? " (unresolved)" : ""}
                </option>
              );
            })}
          </select>
          <Button size="sm" type="submit" data-testid="reference-apply">Apply</Button>
        </>
      ) : (
        <span className="reference-empty">Label an Equation or Figure to reference it.</span>
      )}
      {onRemove ? <Button size="sm" variant="subtle" data-testid="reference-remove" onClick={onRemove}>Remove</Button> : null}
    </form>
  );
}
