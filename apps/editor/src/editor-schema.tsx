import { Extension, Node, type Attribute, type Extensions } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
import type { FigureContent } from "@ieumdoc/core";
import { figureContentError } from "@ieumdoc/core/figure";
import { labelError } from "@ieumdoc/core/label";
import { Input } from "@/components/ui/input.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { BLOCK_COMMAND_META } from "./block-commands.ts";
import { renderEquation } from "./equation-render.ts";
import {
  DELETED_PATHS_ATTR,
  isNewBlockPath,
  isSupportedDocumentChange,
  NEW_BLOCK_PREFIX,
  type TiptapJSON,
} from "./tiptap-document.ts";
import { Button, Notice } from "./ui/primitives.tsx";

/** Reports whether the block at a source path holds an unapplied draft. */
export type DraftListener = (key: string, active: boolean) => void;
export type EquationDraftListener = DraftListener;

/** Core's persistent Figure validation through the Host; resolves to an error message, if any. */
export type FigureValidator = (figure: FigureContent) => Promise<string | undefined>;

/** An Equation draft blocks saving only while the editor is open and the draft differs from the applied LaTeX. */
export function isUnappliedEquationDraft(editing: boolean, draft: string, latex: string, sourcePath = ""): boolean {
  return editing && (draft !== latex || (isNewBlockPath(sourcePath) && draft.length === 0));
}

/** A Figure draft blocks saving while its editor is open and differs from the applied Figure, or while a new Figure was never applied. */
export function isUnappliedFigureDraft(editing: boolean, draft: FigureContent, applied: FigureContent, sourcePath = ""): boolean {
  const changed = draft.imageUrl !== applied.imageUrl || draft.imageAlt !== applied.imageAlt || draft.caption !== applied.caption;
  return editing && (changed || (isNewBlockPath(sourcePath) && applied.imageUrl.length === 0));
}

const hiddenAttr = (defaultValue: string | number | boolean = ""): Attribute => ({
  default: defaultValue,
  rendered: false,
});

let nextEmptySplitLocator = 0;

function headingTag(level: unknown): "h1" | "h2" | "h3" | "h4" | "h5" | "h6" {
  switch (Number(level)) {
    case 2:
      return "h2";
    case 3:
      return "h3";
    case 4:
      return "h4";
    case 5:
      return "h5";
    case 6:
      return "h6";
    default:
      return "h1";
  }
}

function blockAttrs(attrs: Record<string, Attribute>): Record<string, Attribute> {
  return { sourcePath: hiddenAttr(""), ...attrs };
}

const SourcedHeading = Node.create({
  name: "heading",
  group: "block",
  content: "inline*",
  marks: "",
  defining: true,
  addAttributes() {
    return blockAttrs({ level: hiddenAttr(1) });
  },
  parseHTML() {
    return [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } }));
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      headingTag(node.attrs.level),
      {
        ...HTMLAttributes,
        class: "heading",
        "data-block": "heading",
        "data-source-path": String(node.attrs.sourcePath ?? ""),
      },
      0,
    ];
  },
});

const SourcedParagraph = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",
  addAttributes() {
    return blockAttrs({});
  },
  parseHTML() {
    return [{ tag: "p" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "p",
      {
        ...HTMLAttributes,
        class: "paragraph",
        "data-block": "paragraph",
        "data-source-path": String(node.attrs.sourcePath ?? ""),
      },
      0,
    ];
  },
});

const ReadonlyHeading = Node.create({
  name: "readonlyHeading",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ level: hiddenAttr(1), text: hiddenAttr("") });
  },
  parseHTML() {
    return [{ tag: "h1[data-readonly-heading]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["h1", { ...HTMLAttributes, "data-readonly-heading": "" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ReadonlyHeadingView);
  },
});

const ReadonlyParagraph = Node.create({
  name: "readonlyParagraph",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ text: hiddenAttr("") });
  },
  parseHTML() {
    return [{ tag: "p[data-readonly-paragraph]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["p", { ...HTMLAttributes, "data-readonly-paragraph": "" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ReadonlyParagraphView);
  },
});

const Admonition = Node.create({
  name: "admonition",
  group: "block",
  content: "inline*",
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ variant: hiddenAttr("note"), text: hiddenAttr(""), editable: hiddenAttr(false) });
  },
  parseHTML() {
    return [{ tag: "aside[data-admonition]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["aside", { ...HTMLAttributes, "data-admonition": "" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AdmonitionView);
  },
});

const Figure = Node.create({
  name: "figure",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({
      label: hiddenAttr(""),
      imageUrl: hiddenAttr(""),
      imageAlt: hiddenAttr(""),
      caption: hiddenAttr(""),
      editable: hiddenAttr(false),
    });
  },
  parseHTML() {
    return [{ tag: "figure[data-figure]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", { ...HTMLAttributes, "data-figure": "" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FigureView);
  },
});

const Equation = Node.create({
  name: "equation",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ latex: hiddenAttr(""), label: hiddenAttr("") });
  },
  parseHTML() {
    return [{ tag: "div[data-equation]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-equation": "" }];
  },
});

function equationNode(onDraftChange?: EquationDraftListener) {
  return Equation.extend({
    addNodeView() {
      return ReactNodeViewRenderer(createEquationNodeView(onDraftChange));
    },
  });
}

function figureNode(documentPath?: string, onDraftChange?: DraftListener, validateFigure?: FigureValidator) {
  return Figure.extend({
    addNodeView() {
      return ReactNodeViewRenderer(createFigureNodeView(documentPath, onDraftChange, validateFigure));
    },
  });
}

function createFigureNodeView(documentPath?: string, onDraftChange?: DraftListener, validateFigure?: FigureValidator) {
  return function FigureAssetNodeView(props: ReactNodeViewProps) {
    return <FigureView {...props} documentPath={documentPath} onDraftChange={onDraftChange} validateFigure={validateFigure} />;
  };
}

function createEquationNodeView(onDraftChange?: EquationDraftListener) {
  return function EquationDraftNodeView(props: ReactNodeViewProps) {
    return <EquationView {...props} onDraftChange={onDraftChange} />;
  };
}

// A Markdown table lives in the single document state: editable cells hold plain
// text (no marks), other cells are read-only leaves. Rows and cells cannot be added,
// removed or moved; the structure guard rejects any such change.
const headerAttr: Attribute = { default: false, rendered: false, parseHTML: (element) => element.tagName === "TH" };

const Table = Node.create({
  name: "table",
  group: "block",
  content: "tableRow+",
  isolating: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({});
  },
  parseHTML() {
    return [{ tag: "div[data-table-block]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        class: "table-block",
        "data-block": "table",
        "data-table-block": "",
        "data-source-path": String(node.attrs.sourcePath ?? ""),
      },
      ["p", { class: "block-kind", contenteditable: "false" }, "Table"],
      ["table", { class: "table" }, ["tbody", 0]],
    ];
  },
});

const TableRow = Node.create({
  name: "tableRow",
  content: "(tableCell | readonlyTableCell)+",
  parseHTML() {
    return [{ tag: "tr" }];
  },
  renderHTML() {
    return ["tr", 0];
  },
});

const TableCell = Node.create({
  name: "tableCell",
  content: "text*",
  marks: "",
  isolating: true,
  addAttributes() {
    return { header: headerAttr };
  },
  parseHTML() {
    return [{ tag: "th[data-table-cell]" }, { tag: "td[data-table-cell]" }];
  },
  renderHTML({ node }) {
    return [node.attrs.header ? "th" : "td", { "data-table-cell": "" }, 0];
  },
});

const ReadonlyTableCell = Node.create({
  name: "readonlyTableCell",
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      header: headerAttr,
      text: { default: "", rendered: false, parseHTML: (element) => element.textContent ?? "" },
    };
  },
  parseHTML() {
    return [{ tag: "th[data-readonly-cell]" }, { tag: "td[data-readonly-cell]" }];
  },
  renderHTML({ node }) {
    return [
      node.attrs.header ? "th" : "td",
      { "data-readonly-cell": "", "data-readonly": "true", contenteditable: "false" },
      String(node.attrs.text ?? ""),
    ];
  },
});

const UnsupportedBlock = Node.create({
  name: "unsupportedBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ text: hiddenAttr("") });
  },
  parseHTML() {
    return [{ tag: "p[data-unsupported-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["p", { ...HTMLAttributes, "data-unsupported-block": "" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(UnsupportedView);
  },
});

// Inline math is an atomic inline node holding its LaTeX source; bold, italic and
// link marks apply to it like to text. Clicking it opens a small source form.
const InlineMath = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      value: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-value") ?? "",
        renderHTML: (attributes) => ({ "data-value": String(attributes.value ?? "") }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-inline-math]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", { ...HTMLAttributes, "data-inline-math": "" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView, { as: "span" });
  },
});

// Tiptap's default hard-break command keeps marks for following text only.
// Preserve their coverage on the break itself as required by Core InlineContent.
const ParagraphHardBreak = Extension.create({
  name: "paragraphHardBreak",
  priority: 110,
  addKeyboardShortcuts() {
    const insert = () => {
      const { state } = this.editor;
      const parent = state.selection.$from.parent;
      const editableInlineParent = parent.type.name === "paragraph" ||
        (parent.type.name === "admonition" && parent.attrs.editable === true);
      // A selected inline math node is not replaced by a break.
      if (!editableInlineParent || state.selection instanceof NodeSelection) return true;
      const marks = state.storedMarks ?? state.selection.$from.marks();
      return this.editor.chain()
        .insertContent({ type: "hardBreak", marks: marks.map(mark => mark.toJSON()) })
        .command(({ tr }) => { tr.ensureMarks(marks); return true; })
        .run();
    };
    return { "Shift-Enter": insert, "Mod-Enter": insert };
  },
});

const ParagraphSplit = Extension.create({
  name: "paragraphSplit",
  priority: 110,
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { selection } = this.editor.state;
        if (selection.$from.parent.type.name !== "paragraph" || !selection.$from.sameParent(selection.$to)) return true;
        // Enter on a selected inline math node does not delete it.
        if (selection instanceof NodeSelection) return true;
        const sourcePath = selection.$from.parent.attrs.sourcePath;
        const start = selection.$from.before();
        return this.editor.chain().splitBlock().command(({ tr }) => {
          const right = tr.selection.$from.before();
          const rightNode = tr.doc.nodeAt(right);
          const rightSourcePath = rightNode?.content.size === 0
            ? `${NEW_BLOCK_PREFIX}split:${++nextEmptySplitLocator}`
            : sourcePath;
          tr.setNodeMarkup(start, this.editor.schema.nodes.paragraph, { sourcePath });
          tr.setNodeMarkup(right, this.editor.schema.nodes.paragraph, { sourcePath: rightSourcePath });
          tr.setMeta("paragraphSplit", true);
          return true;
        }).run();
      },
    };
  },
});

const ParagraphMerge = Extension.create({
  name: "paragraphMerge",
  priority: 110,
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;
        if (!selection.empty || selection.$from.parentOffset !== 0) return false;
        if (selection.$from.depth !== 1 || selection.$from.parent.type.name !== "paragraph") return true;
        const pos = selection.$from.before();
        const previous = state.doc.resolve(pos).nodeBefore;
        if (previous?.type.name !== "paragraph") return true;
        // Snapshot provenance only: merge adjacent source groups, including any
        // unsaved split siblings. Nothing is persisted as an identity.
        const paths = [...new Set(`${previous.attrs.sourcePath};${selection.$from.parent.attrs.sourcePath}`.split(";"))];
        const tr = state.tr.join(pos);
        tr.doc.forEach((node, position) => {
          if (node.type.name === "paragraph" && String(node.attrs.sourcePath).split(";").some(path => paths.includes(path))) {
            tr.setNodeMarkup(position, undefined, { ...node.attrs, sourcePath: paths.join(";") });
          }
        });
        this.editor.view.dispatch(tr.setMeta("paragraphMerge", true).scrollIntoView());
        return true;
      },
    };
  },
});

export function editorExtensions(
  onEquationDraftChange?: EquationDraftListener,
  documentPath?: string,
  onFigureDraftChange?: DraftListener,
  validateFigure?: FigureValidator,
): Extensions {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      dropcursor: false,
      gapcursor: false,
      hardBreak: { keepMarks: true },
      heading: false,
      horizontalRule: false,
      // Ordinary Markdown links (href and optional title only). Links are created or
      // changed explicitly from the selection toolbar, never implicitly while typing.
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        HTMLAttributes: { target: null, rel: null, class: null },
      },
      listItem: false,
      listKeymap: false,
      orderedList: false,
      paragraph: false,
      strike: false,
      trailingNode: false,
      underline: false,
    }),
    ParagraphHardBreak,
    ParagraphSplit,
    ParagraphMerge,
    SourcedHeading,
    SourcedParagraph,
    ReadonlyHeading,
    ReadonlyParagraph,
    Admonition,
    figureNode(documentPath, onFigureDraftChange, validateFigure),
    equationNode(onEquationDraftChange),
    Table,
    TableRow,
    TableCell,
    ReadonlyTableCell,
    UnsupportedBlock,
    InlineMath,
  ];
}

export function createEditorExtensions(
  baseline: TiptapJSON | (() => TiptapJSON),
  onReject: () => void,
  onEquationDraftChange?: EquationDraftListener,
  documentPath?: string,
  onFigureDraftChange?: DraftListener,
  validateFigure?: FigureValidator,
): Extensions {
  return [...editorExtensions(onEquationDraftChange, documentPath, onFigureDraftChange, validateFigure), structureGuard(baseline, onReject)];
}

function structureGuard(baseline: TiptapJSON | (() => TiptapJSON), onReject: () => void): Extension {
  return Extension.create({
    name: "structureGuard",
    addProseMirrorPlugins() {
      return [structureGuardPlugin(baseline, onReject)];
    },
  });
}

const structureGuardKey = new PluginKey<string[]>("structureGuard");

/** Replaces the declared deletions after Save remaps snapshot paths. */
export const DECLARED_DELETIONS_META = "declaredDeletions";

/**
 * Snapshot paths removed by explicit Delete commands since the baseline loaded.
 * The set only grows, so undo and redo stay within it.
 */
export function declaredDeletions(state: EditorState): string[] {
  return structureGuardKey.getState(state) ?? [];
}

/** The editor document as the Save adapter reads it, including declared deletions. */
export function editorDocumentJSON(state: EditorState): TiptapJSON {
  return { ...(state.doc.toJSON() as TiptapJSON), attrs: { [DELETED_PATHS_ATTR]: declaredDeletions(state) } };
}

/** Structural comparison; projection JSON and engine JSON may order attributes differently. */
export function differsFromBaseline(state: EditorState, baseline: TiptapJSON): boolean {
  return !state.doc.eq(state.schema.nodeFromJSON(baseline));
}

function snapshotPathsOf(doc: ProseMirrorNode): Set<string> {
  const paths = new Set<string>();
  doc.forEach(node => String(node.attrs.sourcePath).split(";").forEach(path => {
    if (!isNewBlockPath(path)) paths.add(path);
  }));
  return paths;
}

function commandDeletions(transaction: Transaction, declared: string[]): string[] {
  if (!transaction.getMeta(BLOCK_COMMAND_META)) return declared;
  const remaining = snapshotPathsOf(transaction.doc);
  const removed = [...snapshotPathsOf(transaction.before)].filter(path => !remaining.has(path));
  return removed.length ? [...new Set([...declared, ...removed])] : declared;
}

export function structureGuardPlugin(baseline: TiptapJSON | (() => TiptapJSON), onReject: () => void): Plugin {
  return new Plugin<string[]>({
    key: structureGuardKey,
    state: {
      init: () => [],
      apply(transaction, declared) {
        const replaced = transaction.getMeta(DECLARED_DELETIONS_META) as string[] | undefined;
        return replaced ?? commandDeletions(transaction, declared);
      },
    },
    // Permit structural changes only through paragraph split/merge keys, block
    // commands, reorder, or engine history. Comparing with the loaded snapshot
    // also keeps undo inside that set.
    filterTransaction(transaction, state) {
      if (!transaction.docChanged) return true;
      if (transaction.getMeta("savedPaths")) return true;
      const history = state.plugins.some(plugin => {
        const key = (plugin as Plugin & { key: string }).key;
        return key.startsWith("history$") && transaction.getMeta(key);
      });
      const paths = (doc: typeof state.doc) => {
        const result: string[] = [];
        doc.forEach(node => result.push(String(node.attrs.sourcePath)));
        return result.join("|");
      };
      const structural = paths(transaction.doc) !== paths(state.doc);
      const next = {
        ...(transaction.doc.toJSON() as TiptapJSON),
        attrs: { [DELETED_PATHS_ATTR]: commandDeletions(transaction, declaredDeletions(state)) },
      };
      if ((!structural || transaction.getMeta("paragraphSplit") || transaction.getMeta("paragraphMerge") ||
          transaction.getMeta("blockReorder") || transaction.getMeta(BLOCK_COMMAND_META) || history) &&
          isSupportedDocumentChange(typeof baseline === "function" ? baseline() : baseline, next)) return true;
      onReject();
      return false;
    },
  });
}

function ReadonlyHeadingView({ node }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper
      as={headingTag(node.attrs.level)}
      className="heading heading-readonly"
      data-block="readonly-heading"
      data-source-path={String(node.attrs.sourcePath ?? "")}
      data-readonly="true"
      contentEditable={false}
    >
      {String(node.attrs.text ?? "")}
    </NodeViewWrapper>
  );
}

function ReadonlyParagraphView({ node }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper
      as="p"
      className="paragraph paragraph-readonly"
      data-block="readonly-paragraph"
      data-source-path={String(node.attrs.sourcePath ?? "")}
      data-readonly="true"
      contentEditable={false}
    >
      <span className="block-kind">Read-only</span> {String(node.attrs.text ?? "")}
    </NodeViewWrapper>
  );
}

function AdmonitionView({ node }: ReactNodeViewProps) {
  const variant = String(node.attrs.variant ?? "note");
  const editable = node.attrs.editable === true;
  return (
    <NodeViewWrapper
      as="aside"
      className={`admonition admonition-${variant}`}
      data-block="admonition"
      data-variant={variant}
      data-source-path={String(node.attrs.sourcePath ?? "")}
      data-readonly={editable ? "false" : "true"}
      contentEditable={editable ? undefined : false}
    >
      <p className="block-kind">Admonition: {variant}</p>
      {editable
        ? <NodeViewContent className="admonition-body" data-testid="admonition-body" />
        : <p className="admonition-body" data-testid="admonition-body">{String(node.attrs.text ?? "")}</p>}
    </NodeViewWrapper>
  );
}

function figureAttrs(node: ProseMirrorNode): FigureContent {
  return {
    imageUrl: String(node.attrs.imageUrl ?? ""),
    imageAlt: String(node.attrs.imageAlt ?? ""),
    caption: String(node.attrs.caption ?? ""),
  };
}

function FigureView({ node, selected, updateAttributes, deleteNode, getPos, view, documentPath, onDraftChange, validateFigure }: ReactNodeViewProps & { documentPath?: string; onDraftChange?: DraftListener; validateFigure?: FigureValidator }) {
  const anchor = useRef<HTMLParagraphElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const applied = figureAttrs(node);
  const src = resolveFigureSource(applied.imageUrl, documentPath);
  const label = String(node.attrs.label ?? "");
  const sourcePath = String(node.attrs.sourcePath ?? "");
  const editableFigure = node.attrs.editable === true;
  // A new Figure has no persistent state until a valid value is applied.
  const neverApplied = isNewBlockPath(sourcePath) && applied.imageUrl.length === 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(applied);
  const [labelDraft, setLabelDraft] = useState(label);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const validation = useRef(0);
  const hasUnappliedDraft = isUnappliedFigureDraft(editing, draft, applied, sourcePath) ||
    (editing && labelDraft !== label);

  useEffect(() => {
    if (!editing) {
      setDraft(applied);
      setLabelDraft(label);
    }
  }, [editing, applied.imageUrl, applied.imageAlt, applied.caption, label]);

  // Selection shows the properties summary; Edit opens the form. A new Figure starts in the form,
  // and leaving a Figure closes its form unless a draft is pending.
  useEffect(() => {
    if (!editableFigure) return;
    if (selected && neverApplied && !editing) beginEdit();
    if (!selected && editing && !hasUnappliedDraft) setEditing(false);
  }, [selected]);

  useEffect(() => {
    onDraftChange?.(sourcePath, hasUnappliedDraft);
    return () => onDraftChange?.(sourcePath, false);
  }, [sourcePath, hasUnappliedDraft, onDraftChange]);

  function beginEdit() {
    setDraft(applied);
    setLabelDraft(label);
    setError("");
    setEditing(true);
    // After the form renders and after an insert command refocuses the editor.
    requestAnimationFrame(() => imageInput.current?.focus());
  }
  const cancel = () => {
    validation.current++;
    setValidating(false);
    if (neverApplied) removeUnappliedBlock(view, getPos, node, deleteNode);
    setDraft(applied);
    setLabelDraft(label);
    setError("");
    setEditing(false);
  };
  // Apply commits only a value Core accepts as persistent; an invalid draft keeps the form open.
  // Whether the label is referenceable and unique in the document is checked by Core on Save.
  const apply = async () => {
    const candidate = draft;
    const nextLabel = labelDraft;
    const local = labelError(nextLabel) ?? figureContentError(candidate) ??
      (validateFigure ? undefined : "Figure validation is unavailable.");
    if (local) {
      setError(local);
      return;
    }
    const request = ++validation.current;
    setValidating(true);
    setError("");
    let message: string | undefined;
    try {
      message = await validateFigure!(candidate);
    } catch (cause) {
      message = `Figure validation failed: ${cause instanceof Error ? cause.message : String(cause)}`;
    }
    // Cancel or a newer Apply supersedes this result.
    if (request !== validation.current) return;
    setValidating(false);
    if (message) {
      setError(message);
      return;
    }
    updateAttributes({ ...candidate, label: nextLabel });
    setEditing(false);
  };
  const field = (key: keyof FigureContent, name: string, testId: string) => (
    <label className="figure-field">
      <span>{name}</span>
      <Input
        ref={key === "imageUrl" ? imageInput : undefined}
        data-testid={testId}
        disabled={validating}
        value={draft[key]}
        onChange={(event) => {
          setDraft({ ...draft, [key]: event.target.value });
          setError("");
        }}
      />
    </label>
  );

  const properties: [string, string][] = [
    ["Label", label],
    ["Image", applied.imageUrl],
    ["Alt text", applied.imageAlt],
    ["Caption", applied.caption],
  ];
  return (
    <NodeViewWrapper
      as="figure"
      className="figure"
      data-block="figure"
      data-source-path={sourcePath}
      data-readonly={editableFigure ? "false" : "true"}
      contentEditable={false}
    >
      <p ref={anchor} className="block-kind">{label ? `Figure · ${label}` : "Figure"}</p>
      {hasUnappliedDraft ? (
        <p className="equation-draft-status" role="status" data-testid="figure-draft-status">
          Unapplied changes. Apply or Cancel before saving.
        </p>
      ) : null}
      {src ? <img src={src} alt={applied.imageAlt} data-testid="figure-image" /> : null}
      <figcaption className="caption">{applied.caption}</figcaption>
      {editableFigure && !editing ? (
        <Button className="figure-edit" size="sm" variant="subtle" aria-label="Edit figure" onClick={beginEdit}>
          Edit
        </Button>
      ) : null}
      <Popover open={selected || editing} onOpenChange={() => {}}>
        <PopoverContent
          anchor={anchor}
          side="bottom"
          align="start"
          // Selection only annotates the block; keep focus (and so keyboard
          // interaction, e.g. Delete) on the editor. Edit focuses the form itself.
          initialFocus={false}
          finalFocus={false}
          aria-label="Figure properties"
          data-testid="figure-properties"
          className="figure-properties"
        >
          {editing ? (
            <form
              className="figure-editor"
              data-testid="figure-editor"
              onSubmit={(event) => {
                event.preventDefault();
                void apply();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancel();
                }
              }}
            >
              {field("imageUrl", "Image", "figure-image-url")}
              {field("imageAlt", "Alt text", "figure-alt")}
              {field("caption", "Caption", "figure-caption")}
              <label className="figure-field">
                <span>Label</span>
                <Input
                  data-testid="figure-label"
                  disabled={validating}
                  value={labelDraft}
                  placeholder="None"
                  onChange={(event) => {
                    setLabelDraft(event.target.value);
                    setError("");
                  }}
                />
              </label>
              {error ? <Notice tone="error">{error}</Notice> : null}
              <div className="equation-actions">
                <Button type="submit" size="sm" disabled={validating} data-testid="figure-apply">Apply</Button>
                <Button type="button" size="sm" variant="subtle" onClick={cancel} data-testid="figure-cancel">Cancel</Button>
              </div>
            </form>
          ) : (
            <>
              <dl>
                {properties.map(([name, value]) => (
                  <div key={name} className="figure-property">
                    <dt>{name}</dt>
                    <dd>{value || "—"}</dd>
                  </div>
                ))}
              </dl>
              {editableFigure ? null : (
                <p className="block-popover-note">This Figure's structure is read-only in this version.</p>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}

/** Remove a transient block that never held a persistent value, keeping one editor block. */
function removeUnappliedBlock(
  view: ReactNodeViewProps["view"],
  getPos: ReactNodeViewProps["getPos"],
  node: ProseMirrorNode,
  deleteNode: () => void,
): void {
  const position = getPos();
  if (view.state.doc.childCount === 1) {
    if (typeof position === "number") {
      view.dispatch(view.state.tr
        .setNodeMarkup(position, view.state.schema.nodes.paragraph, {
          sourcePath: `${NEW_BLOCK_PREFIX}empty`,
        })
        .setMeta(BLOCK_COMMAND_META, true));
    }
  } else if (typeof position === "number") {
    view.dispatch(view.state.tr
      .delete(position, position + node.nodeSize)
      .setMeta(BLOCK_COMMAND_META, true)
      .scrollIntoView());
  } else {
    deleteNode();
  }
}

export function resolveFigureSource(imageUrl: string, documentPath?: string): string {
  const isRelative = imageUrl.startsWith("./") || imageUrl.startsWith("../");
  if (!isRelative) return imageUrl;
  const relativePath = imageUrl.startsWith("./") ? imageUrl.slice(2) : imageUrl;
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  const query = documentPath ? `?path=${encodeURIComponent(documentPath)}` : "";
  return `/document/${encodedPath}${query}`;
}

function EquationView({ node, selected, updateAttributes, deleteNode, getPos, view, onDraftChange }: ReactNodeViewProps & { onDraftChange?: EquationDraftListener }) {
  const label = String(node.attrs.label ?? "");
  const latex = String(node.attrs.latex ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(latex);
  const [labelDraft, setLabelDraft] = useState(label);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) {
      setDraft(latex);
      setLabelDraft(label);
    }
  }, [editing, latex, label]);

  useEffect(() => {
    if (selected && !editing) {
      setDraft(latex);
      setLabelDraft(label);
      setError("");
      setEditing(true);
    }
  }, [selected]);

  const sourcePath = String(node.attrs.sourcePath ?? "");
  const hasUnappliedDraft = isUnappliedEquationDraft(editing, draft, latex, sourcePath) ||
    (editing && labelDraft !== label);
  useEffect(() => {
    onDraftChange?.(sourcePath, hasUnappliedDraft);
    return () => onDraftChange?.(sourcePath, false);
  }, [sourcePath, hasUnappliedDraft, onDraftChange]);

  const beginEdit = () => {
    setDraft(latex);
    setLabelDraft(label);
    setError("");
    setEditing(true);
  };
  const cancel = () => {
    const isUnappliedNewEquation = isNewBlockPath(sourcePath) && latex.length === 0;
    if (isUnappliedNewEquation) removeUnappliedBlock(view, getPos, node, deleteNode);
    setDraft(latex);
    setLabelDraft(label);
    setError("");
    setEditing(false);
  };
  // Whether the label is referenceable and unique in the document is checked by Core on Save.
  const apply = () => {
    if (draft.length === 0) {
      setError("Equation LaTeX cannot be empty.");
      return;
    }
    const invalidLabel = labelError(labelDraft);
    if (invalidLabel) {
      setError(invalidLabel);
      return;
    }
    updateAttributes({ latex: draft, label: labelDraft });
    setError("");
    setEditing(false);
  };

  return (
    <NodeViewWrapper
      className="equation"
      data-block="equation"
      data-source-path={String(node.attrs.sourcePath ?? "")}
      contentEditable={false}
    >
      <p className="block-kind">{label ? `Equation · ${label}` : "Equation"}</p>
      {hasUnappliedDraft ? (
        <p className="equation-draft-status" role="status" data-testid="equation-draft-status">
          Unapplied changes. Apply or Cancel before saving.
        </p>
      ) : null}
      {!editing ? (
        <>
          <EquationFormula className="equation-math" latex={latex} testId="equation-preview" />
          <Button className="equation-edit" size="sm" variant="subtle" onClick={beginEdit}>
            Edit
          </Button>
        </>
      ) : (
        <div className="equation-editor" data-testid="equation-editor">
          <textarea
            aria-label="Equation LaTeX"
            autoFocus
            className="equation-input"
            data-testid="equation-latex"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
          />
          <label className="figure-field">
            <span>Label</span>
            <Input
              data-testid="equation-label"
              value={labelDraft}
              placeholder="None"
              onChange={(event) => {
                setLabelDraft(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancel();
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  apply();
                }
              }}
            />
          </label>
          <EquationFormula className="equation-preview" latex={draft} testId="equation-edit-preview" />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="equation-actions">
            <Button size="sm" onClick={apply} data-testid="equation-apply">Apply</Button>
            <Button size="sm" variant="subtle" onClick={cancel} data-testid="equation-cancel">Cancel</Button>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

function EquationFormula({ className, latex, testId }: { className: string; latex: string; testId: string }) {
  const result = renderEquation(latex);
  if (result.error) {
    return (
      <Notice className={`${className} equation-preview-error`} tone="error" data-testid={`${testId}-error`}>
        Equation preview unavailable: {result.error}
      </Notice>
    );
  }
  return (
    <div
      className={className}
      data-testid={testId}
      dangerouslySetInnerHTML={{ __html: result.html ?? "" }}
    />
  );
}

function InlineMathView({ node, editor, getPos, updateAttributes, selected }: ReactNodeViewProps) {
  const value = String(node.attrs.value ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const rendered = renderEquation(value, false);
  const open = () => {
    setDraft(value);
    setError("");
    setEditing(true);
  };
  const close = () => {
    setEditing(false);
    editor.commands.focus();
  };
  const apply = () => {
    // Core validates the source on Save; only an empty or multi-line source is refused here.
    if (draft.length === 0) return setError("Enter LaTeX, or use Remove.");
    updateAttributes({ value: draft });
    close();
  };
  // Replace the math with its source as ordinary text, keeping bold/italic/link marks.
  const remove = () => {
    const position = getPos();
    if (typeof position !== "number") return;
    setEditing(false);
    editor.chain().focus().insertContentAt({ from: position, to: position + node.nodeSize },
      { type: "text", text: value, marks: node.marks.map((mark) => mark.toJSON()) }).run();
  };
  return (
    <NodeViewWrapper as="span" className="inline-math" data-selected={selected ? "true" : "false"} data-testid="inline-math">
      <span
        className={rendered.html ? "inline-math-rendered" : "inline-math-rendered inline-math-error"}
        title={rendered.error ?? value}
        onClick={open}
        {...(rendered.html ? { dangerouslySetInnerHTML: { __html: rendered.html } } : { children: `$${value}$` })}
      />
      {editing ? (
        <form
          className="inline-math-form selection-toolbar"
          contentEditable={false}
          role="dialog"
          aria-label="Inline math"
          data-testid="inline-math-form"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            close();
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) setEditing(false);
          }}
        >
          <Input
            autoFocus
            aria-label="LaTeX"
            data-testid="inline-math-source"
            value={draft}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setDraft(event.target.value.replace(/[\r\n]+/g, " "));
              setError("");
            }}
          />
          <Button size="sm" type="submit" data-testid="inline-math-apply">Apply</Button>
          <Button size="sm" variant="subtle" data-testid="inline-math-remove" onClick={remove}>Remove</Button>
          {error ? <span className="link-form-error" role="alert">{error}</span> : null}
        </form>
      ) : null}
    </NodeViewWrapper>
  );
}

function UnsupportedView({ node }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper
      as="p"
      className="unsupported"
      data-block="unsupported"
      data-source-path={String(node.attrs.sourcePath ?? "")}
      data-readonly="true"
      contentEditable={false}
    >
      <span className="block-kind">Unsupported</span> {String(node.attrs.text ?? "")}
    </NodeViewWrapper>
  );
}

