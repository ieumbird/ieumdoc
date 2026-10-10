import { Extension, Node, getHTMLFromFragment, type Attribute, type Editor, type Extensions } from "@tiptap/core";
import { BulletList, ListItem, ListKeymap, OrderedList } from "@tiptap/extension-list";
import { Code } from "@tiptap/extension-code";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { codeHighlightingPlugin, lowlight } from "./code-highlight.ts";
import type { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { documentInteraction } from "./document-interaction.ts";
import { imageAssets } from "./image-assets.ts";
import { MarkdownInputRules } from "./markdown-input-rules.ts";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { isAdmonitionVariant, type EditableBlock, type FigureContent } from "@ieumdoc/core";
import { toTiptapContent } from "./tiptap-inline.ts";
import { figureCaptionContent, figureContentError, figurePersistenceError } from "@ieumdoc/core/figure";
import { headingNumbers, type HeadingNumbering } from "@ieumdoc/core/numbering";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { labelError, labelKey, targetLabelError } from "@ieumdoc/core/label";
import { Input } from "@/components/ui/input.tsx";
import { BlockProperties } from "./block-properties.tsx";
import { ADMONITION_LABELS, admonitionTone, BLOCK_COMMAND_META } from "./block-commands.ts";
import { CrossReference, useBlockNumber } from "./cross-reference.tsx";
import { FootnoteReference, revealReference, useFootnoteNumber } from "./footnote.tsx";
import { renderEquation } from "./equation-render.ts";
import {
  BLOCK_SOURCES_ATTR,
  blockSourcesOf,
  DELETED_PATHS_ATTR,
  figureContent,
  isNewBlockPath,
  isSupportedDocumentChange,
  NEW_BLOCK_PREFIX,
  normalizeEngineDocument,
  paragraphContent,
  tableCaption,
  TABLE_CELL_SOURCE_ATTR,
  toTiptapBlockNode,
  withBlockSourceNodes,
  type AppliedBlockSources,
  type TiptapJSON,
} from "./tiptap-document.ts";
import { Button } from "@/components/ui/button.tsx";
import { Notice } from "./ui/primitives.tsx";
import { useOverlayBounds } from "./ui/use-overlay-bounds.ts";
import { TableCellFocus, TableTools } from "./table-tools.tsx";

/** Reports whether the block at a source path holds an unapplied draft. */
export type DraftKind = "Equation" | "Figure" | "Table" | "Section label" | "Source";
export type DraftListener = (kind: DraftKind, path: string, active: boolean) => void;

/** Core's persistent Figure validation through the Host; resolves to an error message, if any. */
/** Core's persistent validation of a Figure Apply: its properties and its label. */
export type FigureValidator = (figure: FigureContent, label: string) => Promise<string | undefined>;

/** Core's block source replacement through the Host: the block a source makes at a snapshot path,
 * after the session's other applied sources. Rejects with Core's reason. */
export type BlockSourceApplier = (path: string, source: string, applied: AppliedBlockSources) => Promise<EditableBlock>;

/** An open Equation form is unsaved when changed, or when its placeholder was never applied. */
export function isUnappliedEquationDraft(editing: boolean, draft: string, latex: string, sourcePath = ""): boolean {
  return editing && (draft !== latex || (isNewBlockPath(sourcePath) && draft.length === 0));
}

/** An open Figure form is unsaved when changed, or when its new Figure was never applied.
 * Whether a Figure was applied is the session's `applied` state, never its missing image. */
export function isUnappliedFigureDraft(editing: boolean, draft: FigureContent, applied: FigureContent, wasApplied = true): boolean {
  const changed = draft.imageUrl !== applied.imageUrl || draft.imageAlt !== applied.imageAlt ||
    JSON.stringify(draft.caption) !== JSON.stringify(applied.caption);
  return editing && (changed || !wasApplied);
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
  // `numbered`: the snapshot's numbered targets where they differ from the block kind's default.
  return { sourcePath: hiddenAttr(""), original: { default: null, rendered: false }, numbered: { default: null, rendered: false }, headingLevels: { default: null, rendered: false }, footnotes: { default: null, rendered: false }, ...attrs };
}

// A heading holds the paragraph's inline content except line breaks, which Markdown headings cannot.
const SourcedHeading = Node.create({
  name: "heading",
  group: "block",
  content: "(text | inlineMath | crossReference | footnoteReference)*",
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

// List v1: a top-level list carries its snapshot locator; each item holds one paragraph,
// optionally followed by one nested list. Enter, Tab/Shift-Tab and Backspace edit items.
// List input shortcuts (`- `, `1. `) are MarkdownInputRules, not Tiptap's list rules.
const listHTML = { class: "list", "data-block": "list" };

const SourcedBulletList = BulletList.extend({
  addAttributes() {
    return blockAttrs({});
  },
  addInputRules() {
    return [];
  },
}).configure({ HTMLAttributes: listHTML });

const SourcedOrderedList = OrderedList.extend({
  addAttributes() {
    // The Markdown list start number only; HTML list types have no Markdown form.
    return blockAttrs({
      start: {
        default: 1,
        parseHTML: (element) => element.hasAttribute("start") ? Number.parseInt(element.getAttribute("start") ?? "", 10) : 1,
      },
    });
  },
  addInputRules() {
    return [];
  },
}).configure({ HTMLAttributes: listHTML });

const SimpleListItem = ListItem.extend({
  content: "paragraph (bulletList | orderedList)?",
});

// Code block v1: a language and literal code. Enter and Tab insert text; three Enters or
// ArrowDown at the end leave the block. The ``` input shortcut is a MarkdownInputRule.
// Syntax highlighting is display-only: lowlight decorations never enter the document or
// the saved Markdown. An empty or unregistered language shows plain code.

const SourcedCodeBlock = CodeBlockLowlight.extend({
  addProseMirrorPlugins() {
    const plugins = this.parent!();
    return [...plugins.slice(0, -1), codeHighlightingPlugin(plugins.at(-1)!)];
  },
  addAttributes() {
    return blockAttrs({ language: { default: "", rendered: false } });
  },
  addInputRules() {
    return [];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({
  // Stock lowlight auto-detects unknown languages; IeumDoc's fallback is literal plain code.
  lowlight: { ...lowlight, highlightAuto: () => ({ children: [] }) },
  defaultLanguage: null, enableTabIndentation: true, tabSize: 4,
});

// Inline code is literal text that may sit inside bold, italic or a link, as in Markdown.
const InlineCode = Code.extend({
  excludes: "",
  addInputRules() {
    return [];
  },
  addPasteRules() {
    return [];
  },
});

// Subscript and superscript replace each other, as Core never nests them (Mod-, and Mod-.).
const SubscriptMark = Subscript.extend({ excludes: "subscript superscript" });
const SuperscriptMark = Superscript.extend({ excludes: "subscript superscript" });

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
  isolating: true,
  defining: true,
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
    return ["aside", { ...HTMLAttributes, "data-admonition": "" }, 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(AdmonitionView);
  },
});

// Quote v1: one paragraph of inline content, edited like a simple admonition body. Enter leaves
// the quote; Shift+Enter is a line break. Other quotes are unsupported (read-only) blocks.
const Quote = Node.create({
  name: "quote",
  group: "block",
  content: "inline*",
  isolating: true,
  defining: true,
  addAttributes() {
    return blockAttrs({});
  },
  parseHTML() {
    return [{ tag: "blockquote[data-quote]", contentElement: "p" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["blockquote", {
      ...HTMLAttributes,
      class: "quote",
      "data-block": "quote",
      "data-quote": "",
      "data-source-path": String(node.attrs.sourcePath ?? ""),
    }, ["p", { class: "quote-body" }, 0]];
  },
});

// Footnotes v2: a definition holding one paragraph of inline content, edited like a quote. It
// holds no footnote references; other definitions are read-only (unsupported) blocks.
const FootnoteDefinition = Node.create({
  name: "footnoteDefinition",
  group: "block",
  content: "(text | hardBreak | inlineMath | crossReference)*",
  isolating: true,
  defining: true,
  addAttributes() {
    return blockAttrs({ label: hiddenAttr("") });
  },
  parseHTML() {
    return [{ tag: "div[data-footnote-definition]", contentElement: "p" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-footnote-definition": "" }, ["p", 0]];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FootnoteDefinitionView);
  },
});

function FootnoteDefinitionView({ node, editor }: ReactNodeViewProps) {
  const label = String(node.attrs.label ?? "");
  return (
    <NodeViewWrapper
      as="div"
      className="footnote-definition"
      data-block="footnote"
      data-testid="footnote-definition"
      data-label={label}
      data-source-path={String(node.attrs.sourcePath ?? "")}
    >
      <FootnoteNumber editor={editor} label={label} />
      <NodeViewContent<"p"> as="p" className="footnote-definition-body" />
    </NodeViewWrapper>
  );
}

/** A Markdown thematic break. */
const Divider = Node.create({
  name: "divider",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({});
  },
  parseHTML() {
    return [{ tag: "div[data-divider]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["div", {
      ...HTMLAttributes,
      class: "divider",
      "data-block": "divider",
      "data-divider": "",
      "data-source-path": String(node.attrs.sourcePath ?? ""),
    }, ["hr"]];
  },
});

const Figure = Node.create({
  name: "figure",
  group: "block",
  content: "(text | hardBreak | inlineMath | crossReference | footnoteReference)*",
  isolating: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({
      label: hiddenAttr(""),
      imageUrl: hiddenAttr(""),
      imageAlt: hiddenAttr(""),
      caption: hiddenAttr(""),
      editable: hiddenAttr(false),
      // Editor session state, never written: false only for a Figure the insert command made
      // and no Apply has committed yet. Apply sets it in its transaction, so undo/redo restore it.
      applied: hiddenAttr(true),
    });
  },
  parseHTML() {
    return [{ tag: "figure[data-figure]", contentElement: "figcaption" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["figure", { ...HTMLAttributes, "data-figure": "" },
      ...(node.attrs.imageUrl ? [["img", { src: node.attrs.imageUrl, alt: node.attrs.imageAlt }]] : []), ["figcaption", 0]];
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

function equationNode(onDraftChange?: DraftListener) {
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

function createEquationNodeView(onDraftChange?: DraftListener) {
  return function EquationDraftNodeView(props: ReactNodeViewProps) {
    return <EquationView {...props} onDraftChange={onDraftChange} />;
  };
}

// A Markdown table lives in the single document state: editable cells hold supported
// inline content without line breaks; other cells are read-only leaves. Commands add, remove and
// move whole rows (below the header row) and columns, and set column alignment; snapshot cells
// carry their opening position. The structure guard rejects any other change to the grid.
const headerAttr: Attribute = { default: false, rendered: false, parseHTML: (element) => element.tagName === "TH" };

const Table = Node.create({
  name: "table",
  allowGapCursor: false,
  group: "block",
  content: "tableRow+",
  isolating: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ label: hiddenAttr(""), caption: { default: [], rendered: false } });
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
      ["table", { class: "table" }, ["tbody", 0]],
      ...(node.attrs.original ? [originalDOM(node.attrs.original)] : []),
    ];
  },
});

function tableNode(onDraftChange?: DraftListener) {
  return Table.extend({
    addNodeView() { return ReactNodeViewRenderer(props => <TableView {...props} onDraftChange={onDraftChange} />, { contentDOMElementTag: "tbody" }); },
  });
}

function TableView({ node, editor, getPos, updateAttributes, selected, onDraftChange }: ReactNodeViewProps & { onDraftChange?: DraftListener }) {
  const grid = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLParagraphElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const number = useBlockNumber(editor, getPos, "table");
  const kind = number === undefined ? "Table" : `Table ${number}`;
  const label = String(node.attrs.label ?? "");
  const caption = tableCaption(node.toJSON() as TiptapJSON);
  const text = figureCaptionContent(caption).map(item => captionText(item)).join("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ label, caption: text });
  const [error, setError] = useState("");
  const sourcePath = String(node.attrs.sourcePath);
  const dirty = editing && (draft.label !== label || draft.caption !== text);
  useEffect(() => { onDraftChange?.("Table", sourcePath, dirty); return () => onDraftChange?.("Table", sourcePath, false); }, [sourcePath, dirty, onDraftChange]);
  const begin = () => { setDraft({ label, caption: text }); setError(""); setEditing(true); };
  const close = () => { setEditing(false); focusBlock(editor.view, getPos); };
  const apply = () => {
    const invalid = labelError(draft.label) || (/^[\s]|[\s]$|[\r\n]/.test(draft.caption) ? "Caption must be a single line without surrounding spaces." : undefined);
    if (invalid) { setError(invalid); return; }
    updateAttributes({ label: draft.label, caption: draft.caption === text ? caption : draft.caption ? [{ kind: "text", text: draft.caption }] : [], numbered: null });
    close();
  };
  return <NodeViewWrapper className="table-block" data-block="table" data-table-block="" data-source-path={sourcePath}
    data-selected={selected ? "true" : "false"} data-editing={editing ? "true" : "false"}>
    <p ref={anchor} className="block-kind block-metadata" contentEditable={false}>{[kind, label].filter(Boolean).join(" · ")}</p>
    <div className="table-scroll"><div ref={grid} className="table-grid">
      <NodeViewContent<"table"> as="table" className="table" />
      <TableTools editor={editor} node={node} getPos={getPos} grid={grid} onEdit={begin} hidden={editing} />
    </div></div>
    {caption.length > 0 ? <div className="caption" data-testid="table-caption" data-number={number === undefined ? undefined : kind} contentEditable={false}
      // The editor's own schema: rebuilding one from its resolved extensions duplicates them.
      dangerouslySetInnerHTML={{ __html: getHTMLFromFragment(editor.schema.nodeFromJSON(toTiptapContent(caption)).content, editor.schema) }} /> : null}
    <OriginalContent node={node} editor={editor} getPos={getPos} />
    {editor.isEditable && !editing ? <Button className="table-edit" size="sm" variant="outline" aria-label="Edit table" contentEditable={false} onClick={begin}>Edit</Button> : null}
    <BlockProperties anchor={anchor} initialFocus={input} kind={kind} testId="table" open={editing}
      error={error}
      onApply={apply} onCancel={close}>
      <label className="form-label" htmlFor={`table-caption-${sourcePath}`}>Caption</label>
      <Input ref={input} id={`table-caption-${sourcePath}`} data-testid="table-caption-input" value={draft.caption} onChange={event => setDraft({ ...draft, caption: event.target.value })} />
      <label className="form-label" htmlFor={`table-label-${sourcePath}`}>Label</label>
      <Input id={`table-label-${sourcePath}`} data-testid="table-label" value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} />
    </BlockProperties>
  </NodeViewWrapper>;
}

function captionText(item: import("@ieumdoc/core").InlineContent): string {
  if ("children" in item) return item.children.map(captionText).join("");
  if (item.kind === "text") return item.text;
  if ("value" in item) return item.value;
  if ("label" in item) return item.label;
  return "";
}

function cellAlignmentStyle(node: ProseMirrorNode): string {
  return ["left", "center", "right"].includes(node.attrs.align) ? `text-align: ${node.attrs.align}` : "";
}

function originalDOM(original: NonNullable<EditableBlock["original"]>): DOMOutputSpec {
  return ["details", { class: "original-content", contenteditable: "false" },
    ["summary", {}, originalSummary(original)],
    ["pre", {}, original.text]];
}

/** Replace the block at `position` with the block an applied source made, and record the source,
 * as one undo step. */
export function blockSourceTransaction(state: EditorState, position: number, path: string, source: string, block: EditableBlock): Transaction {
  const current = state.doc.nodeAt(position)!;
  return closeHistory(state.tr.replaceWith(position, position + current.nodeSize, state.schema.nodeFromJSON(toTiptapBlockNode(block)))
    .setDocAttribute(BLOCK_SOURCES_ATTR, { ...blockSourcesOf({ attrs: state.doc.attrs }), [path]: { source, block } }));
}

function originalSummary(original: NonNullable<EditableBlock["original"]>): string {
  return `${original.kind} · Read-only content · ${original.line === undefined ? "Applied source" : `Original line ${original.line}`}`;
}

/** A read-only block's source. Edit source applies a new source through Core in one undoable step. */
function OriginalContent({ node, editor, getPos }: Pick<ReactNodeViewProps, "node" | "editor" | "getPos">) {
  const original = node.attrs.original as EditableBlock["original"];
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const openedNode = useRef<ProseMirrorNode | null>(null);
  const validation = useRef(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const editing = draft !== null;
  const path = String(node.attrs.sourcePath ?? "");
  const options = blockSourceOptions(editor);
  const onDraftChange = options?.onDraftChange;
  const dirty = busy || (editing && draft !== original?.text);
  useEffect(() => {
    onDraftChange?.("Source", path, dirty);
    return () => onDraftChange?.("Source", path, false);
  }, [path, dirty, onDraftChange]);
  useEffect(() => () => { validation.current++; }, []);
  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);
  if (!original) return null;
  const applier = options?.apply;
  // The draft starts from the block's source, so it must still be the block that source made.
  const sources = blockSourcesOf({ attrs: editor.state.doc.attrs });
  const baseline = options?.baseline && withBlockSourceNodes(options.baseline(), sources).content?.find(block => block.attrs?.sourcePath === path);
  const unchanged = Boolean(baseline) && editor.schema.nodeFromJSON(baseline).eq(node);
  const close = () => { validation.current++; setBusy(false); setDraft(null); setError(""); editor.commands.focus(); };
  const replacementError = () => {
    const position = editor.isDestroyed ? undefined : getPos();
    const current = typeof position === "number" ? editor.state.doc.nodeAt(position) : null;
    if (!current || !openedNode.current?.eq(current)) return "This block changed. Undo its edits, or Cancel and reopen source editing.";
    if (options?.hasOtherDraft?.("Source", path)) return "Apply or Cancel this block's other property edit before applying its source.";
    return undefined;
  };
  const apply = async () => {
    if (draft === null || !applier || busy) return;
    const invalid = replacementError();
    if (invalid) { setError(invalid); return; }
    const request = ++validation.current;
    setBusy(true);
    setError("");
    try {
      const block = await applier(path, draft, sources);
      if (request !== validation.current) return;
      const changed = replacementError() ?? (draftRef.current !== draft ||
        JSON.stringify(blockSourcesOf({ attrs: editor.state.doc.attrs })) !== JSON.stringify(sources)
        ? "Source changed during validation. Apply again." : undefined);
      if (changed) { setError(changed); return; }
      const position = getPos();
      if (typeof position !== "number") return;
      editor.view.dispatch(blockSourceTransaction(editor.state, position, path, draft, block));
      // Typing right after Apply starts its own undo step.
      editor.view.dispatch(closeHistory(editor.state.tr));
      close();
    } catch (cause) {
      if (request === validation.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request === validation.current) setBusy(false);
    }
  };
  return <details className="original-content" contentEditable={false}>
    <summary>{originalSummary(original)}</summary>
    {editing ? (
      <form className="block-properties-form" data-testid="block-source-editor"
        onSubmit={(event) => { event.preventDefault(); void apply(); }}
        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
        <label className="form-field">
          <span>MyST source</span>
          <textarea ref={input} className="equation-input" aria-label="Block MyST source" data-testid="block-source-input"
            value={draft} onChange={(event) => { setDraft(event.target.value); setError(""); }} />
        </label>
        {error ? <Notice tone="error" data-testid="block-source-error">{error}</Notice> : null}
        <div className="form-actions">
          <Button type="submit" size="sm" disabled={busy} data-testid="block-source-apply">Apply</Button>
          <Button type="button" size="sm" variant="outline" onClick={close} data-testid="block-source-cancel">Cancel</Button>
        </div>
      </form>
    ) : (
      <>
        <pre>{original.text}</pre>
        {editor.isEditable && applier ? <>
          <Button size="sm" variant="outline" disabled={!unchanged} data-testid="block-source-edit"
            onClick={() => { openedNode.current = node; setDraft(original.text); setError(""); }}>Edit source</Button>
          {unchanged ? null : <p className="block-popover-note">Undo this block's edits, or Save and Reload, to edit its source.</p>}
        </> : null}
      </>
    )}
  </details>;
}

const TableRow = Node.create({
  name: "tableRow",
  allowGapCursor: false,
  content: "(tableCell | readonlyTableCell)+",
  parseHTML() {
    return [{ tag: "tr" }];
  },
  renderHTML() {
    return ["tr", 0];
  },
});

// A cell holds inline content without line breaks, like a heading.
const TableCell = Node.create({
  name: "tableCell",
  content: "(text | inlineMath | crossReference | footnoteReference)*",
  isolating: true,
  addAttributes() {
    return { header: headerAttr, align: hiddenAttr(""), [TABLE_CELL_SOURCE_ATTR]: { default: "", rendered: false } };
  },
  parseHTML() {
    return [{ tag: "th[data-table-cell]" }, { tag: "td[data-table-cell]" }];
  },
  renderHTML({ node }) {
    return [node.attrs.header ? "th" : "td", { "data-table-cell": "", style: cellAlignmentStyle(node) }, 0];
  },
});

const ReadonlyTableCell = Node.create({
  name: "readonlyTableCell",
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      header: headerAttr,
      align: hiddenAttr(""),
      [TABLE_CELL_SOURCE_ATTR]: { default: "", rendered: false },
      text: { default: "", rendered: false, parseHTML: (element) => element.textContent ?? "" },
    };
  },
  parseHTML() {
    return [{ tag: "th[data-readonly-cell]" }, { tag: "td[data-readonly-cell]" }];
  },
  renderHTML({ node }) {
    return [
      node.attrs.header ? "th" : "td",
      { "data-readonly-cell": "", "data-readonly": "true", contenteditable: "false", style: cellAlignmentStyle(node) },
      String(node.attrs.text ?? ""),
    ];
  },
});

// A `(label)=` section label: it names the heading after it for {ref} references.
const LabelTarget = Node.create({
  name: "labelTarget",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ label: hiddenAttr("") });
  },
  parseHTML() {
    return [{ tag: "p[data-label-target]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["p", { ...HTMLAttributes, "data-label-target": "", "data-source-path": String(node.attrs.sourcePath ?? "") }, `Section label · ${String(node.attrs.label ?? "")}`];
  },
  addNodeView() {
    return ReactNodeViewRenderer(LabelTargetView);
  },
});

/** Why `label` cannot name this section: the target label rules, or another target's label. */
function sectionLabelError(doc: ProseMirrorNode, own: number, label: string): string | undefined {
  const error = targetLabelError(label);
  if (error) return error;
  let taken = false;
  doc.forEach((node, pos) => { if (pos !== own && typeof node.attrs.label === "string" && node.attrs.label && labelKey(node.attrs.label) === labelKey(label)) taken = true; });
  return taken ? `Label "${label}" already names another target in this document.` : undefined;
}

function LabelTargetView({ node, editor, getPos, updateAttributes, selected }: ReactNodeViewProps) {
  const label = String(node.attrs.label ?? "");
  const anchor = useRef<HTMLParagraphElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [error, setError] = useState("");
  const path = String(node.attrs.sourcePath ?? "");
  const onDraftChange = blockSourceOptions(editor)?.onDraftChange;
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
    updateAttributes({ label: draft });
    close();
  };
  // Authoring metadata like a Figure label: it takes no space and shows with its heading.
  return (
    <NodeViewWrapper as="div" className="label-target" data-block="label-target" data-testid="label-target"
      data-label={label} data-source-path={String(node.attrs.sourcePath ?? "")} data-selected={selected ? "true" : "false"}
      data-editing={editing ? "true" : "false"} contentEditable={false}>
      <p ref={anchor} className="label-target-content">
        {editor.isEditable ? (
          <button type="button" className="label-target-edit" aria-label={`Edit section label ${label}`} data-testid="label-target-edit"
            title="Section label: {ref} references to it name the heading below"
            onClick={() => { setDraft(label); setError(""); setEditing(true); }}>§ {label}</button>
        ) : <span className="label-target-text">§ {label}</span>}
      </p>
      <BlockProperties anchor={anchor} initialFocus={input} kind="Section label" testId="label-target" open={editing}
        error={error}
        onApply={apply} onCancel={close}>
        <label className="form-label" htmlFor={`label-target-${String(node.attrs.sourcePath)}`}>Label</label>
        <Input ref={input} id={`label-target-${String(node.attrs.sourcePath)}`} data-testid="label-target-input" value={draft}
          onChange={event => { setDraft(event.target.value); setError(""); }} />
      </BlockProperties>
    </NodeViewWrapper>
  );
}

const UnsupportedBlock = Node.create({
  name: "unsupportedBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    // `footnote`: the label of the footnote a definition block defines.
    return blockAttrs({ text: hiddenAttr(""), footnote: hiddenAttr("") });
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
        parent.type.name === "quote" || parent.type.name === "footnoteDefinition" || (parent.type.name === "admonition" && parent.attrs.editable === true);
      // A selected inline math node is not replaced by a break.
      if (!editableInlineParent || state.selection instanceof NodeSelection) return true;
      // A break ends inline code; code is text only.
      const marks = (state.storedMarks ?? state.selection.$from.marks()).filter(mark => mark.type.name !== "code");
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
        // Paragraphs inside list items split as list items.
        if (selection.$from.depth !== 1 || selection.$from.parent.type.name !== "paragraph" ||
            !selection.$from.sameParent(selection.$to)) return false;
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
          const leftSourcePath = tr.doc.nodeAt(start)?.content.size === 0 && rightNode!.content.size > 0
            ? `${NEW_BLOCK_PREFIX}split:${++nextEmptySplitLocator}` : sourcePath;
          tr.setNodeMarkup(start, this.editor.schema.nodes.paragraph, { sourcePath: leftSourcePath });
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
        if (selection.$from.depth !== 1 || selection.$from.parent.type.name !== "paragraph") return false;
        const pos = selection.$from.before();
        const previous = state.doc.resolve(pos).nodeBefore;
        if (previous?.type.name !== "paragraph") return false;
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

type BlockSourceOptions = {
  apply?: BlockSourceApplier;
  baseline?: () => TiptapJSON;
  onDraftChange?: DraftListener;
  hasOtherDraft?: (kind: DraftKind, path: string) => boolean;
};

function blockSourceOptions(editor: Editor): BlockSourceOptions | undefined {
  return editor.extensionManager.extensions.find(extension => extension.name === "blockSourceEditing")?.options;
}

/** Applied block sources are editor document state; Apply asks Core through the Host. */
const BlockSourceEditing = Extension.create<BlockSourceOptions>({
  name: "blockSourceEditing",
  addOptions() { return { apply: undefined, baseline: undefined }; },
  addGlobalAttributes() { return [{ types: ["doc"], attributes: { [BLOCK_SOURCES_ATTR]: { default: null, rendered: false } } }]; },
});

export function editorExtensions(
  onDraftChange?: DraftListener,
  documentPath?: string,
  validateFigure?: FigureValidator,
  blockSource?: BlockSourceOptions,
): Extensions {
  return [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      dropcursor: false,
      // The engine supplies cursor positions around atomic blocks.
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
      trailingNode: false,
      underline: false,
    }),
    DocumentNumbering,
    TableCellFocus,
    ParagraphHardBreak,
    ParagraphSplit,
    ParagraphMerge,
    SourcedParagraph,
    SourcedHeading,
    ReadonlyHeading,
    ReadonlyParagraph,
    SourcedCodeBlock,
    InlineCode,
    SubscriptMark,
    SuperscriptMark,
    SourcedBulletList,
    SourcedOrderedList,
    SimpleListItem,
    ListKeymap,
    Admonition,
    Quote,
    FootnoteDefinition,
    Divider,
    figureNode(documentPath, onDraftChange, validateFigure),
    equationNode(onDraftChange),
    tableNode(onDraftChange),
    TableRow,
    TableCell,
    ReadonlyTableCell,
    LabelTarget,
    UnsupportedBlock,
    InlineMath,
    CrossReference,
    FootnoteReference,
    MarkdownInputRules,
    BlockSourceEditing.configure({ ...blockSource, onDraftChange }),
  ];
}

export function createEditorExtensions(
  baseline: TiptapJSON | (() => TiptapJSON),
  onReject: (reason?: string) => void,
  onDraftChange?: DraftListener,
  documentPath?: string,
  validateFigure?: FigureValidator,
  onAssetPendingChange?: (active: boolean) => void,
  onAssetError?: (reason: string) => void,
  applyBlockSource?: BlockSourceApplier,
  hasOtherDraft?: BlockSourceOptions["hasOtherDraft"],
): Extensions {
  const baselineOf = typeof baseline === "function" ? baseline : () => baseline;
  return [...editorExtensions(onDraftChange, documentPath, validateFigure, { apply: applyBlockSource, baseline: baselineOf, hasOtherDraft }),
    ...(documentPath ? [imageAssets({ documentPath, reject: onAssetError ?? onReject, pending: onAssetPendingChange })] : []),
    documentInteraction(onReject), structureGuard(baseline, onReject)];
}

function structureGuard(baseline: TiptapJSON | (() => TiptapJSON), onReject: (reason?: string) => void): Extension {
  return Extension.create({
    name: "structureGuard",
    addProseMirrorPlugins() {
      return [structureGuardPlugin(baseline, onReject)];
    },
  });
}

const structureGuardKey = new PluginKey<string[]>("structureGuard");

/**
 * Snapshot paths removed by accepted engine transactions since the baseline loaded.
 * The set only grows, so undo and redo stay within it.
 */
export function declaredDeletions(state: EditorState): string[] {
  return structureGuardKey.getState(state) ?? [];
}

/** The editor document as the Save adapter reads it, including declared deletions. */
export function editorDocumentJSON(state: EditorState): TiptapJSON {
  return { ...(state.doc.toJSON() as TiptapJSON), attrs: { ...state.doc.attrs, [DELETED_PATHS_ATTR]: declaredDeletions(state) } };
}

function snapshotPathsOf(doc: ProseMirrorNode): Set<string> {
  const paths = new Set<string>();
  doc.forEach(node => String(node.attrs.sourcePath).split(";").forEach(path => {
    if (!isNewBlockPath(path)) paths.add(path);
  }));
  return paths;
}

function commandDeletions(transaction: Transaction, declared: string[]): string[] {
  if (!transaction.docChanged) return declared;
  const remaining = snapshotPathsOf(transaction.doc);
  const removed = [...snapshotPathsOf(transaction.before)].filter(path => !remaining.has(path));
  return removed.length ? [...new Set([...declared, ...removed])] : declared;
}

/** The snapshot baseline with the document's applied block sources in place. */
function sessionBaseline(baseline: TiptapJSON | (() => TiptapJSON), doc: ProseMirrorNode): TiptapJSON {
  return withBlockSourceNodes(typeof baseline === "function" ? baseline() : baseline, blockSourcesOf({ attrs: doc.attrs }));
}

export function structureGuardPlugin(baseline: TiptapJSON | (() => TiptapJSON), onReject: (reason?: string) => void): Plugin {
  return new Plugin<string[]>({
    key: structureGuardKey,
    state: {
      init: () => [],
      apply(transaction, declared) {
        return commandDeletions(transaction, declared);
      },
    },
    // Engine edits are accepted only if the normalized result has a semantic
    // save representation. This retains read-only and table/inline validation.
    filterTransaction(transaction, state) {
      if (!transaction.docChanged) return true;
      try {
        const base = sessionBaseline(baseline, transaction.doc);
        const next = normalizeEngineDocument(base, {
          ...transaction.doc.toJSON(), attrs: { [DELETED_PATHS_ATTR]: commandDeletions(transaction, declaredDeletions(state)) },
        }, transaction.before.childCount !== transaction.doc.childCount);
        if (isSupportedDocumentChange(base, next)) return true;
      } catch { /* Unrepresentable input keeps the previous document. */ }
      onReject();
      return false;
    },
    appendTransaction(transactions, old, state) {
      if (!transactions.some(tr => tr.docChanged)) return null;
      const normalized = normalizeEngineDocument(sessionBaseline(baseline, state.doc), state.doc.toJSON(), old.doc.childCount !== state.doc.childCount);
      const tr = state.tr;
      state.doc.forEach((node, pos, index) => {
        const attrs = normalized.content![index].attrs!;
        if (node.attrs.sourcePath !== attrs.sourcePath) tr.setNodeMarkup(pos, undefined, attrs);
      });
      return tr.docChanged ? tr : null;
    },
  });
}

function ReadonlyHeadingView({ node, editor, getPos }: ReactNodeViewProps) {
  const Heading = headingTag(node.attrs.level);
  return (
    <NodeViewWrapper
      as="div"
      className="heading-readonly"
      data-block="readonly-heading"
      data-source-path={String(node.attrs.sourcePath ?? "")}
      data-readonly="true"
      contentEditable={false}
    >
      <Heading className="heading">{String(node.attrs.text ?? "")}</Heading>
      <OriginalContent node={node} editor={editor} getPos={getPos} />
    </NodeViewWrapper>
  );
}

function ReadonlyParagraphView({ node, editor, getPos }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper
      as="div"
      className="paragraph paragraph-readonly"
      data-block="readonly-paragraph"
      data-source-path={String(node.attrs.sourcePath ?? "")}
      data-readonly="true"
      contentEditable={false}
    >
      {node.attrs.original ? null : <span className="block-kind">Read-only </span>}{String(node.attrs.text ?? "")}
      <OriginalContent node={node} editor={editor} getPos={getPos} />
    </NodeViewWrapper>
  );
}

function AdmonitionView({ node, editor, getPos }: ReactNodeViewProps) {
  const variant = String(node.attrs.variant ?? "note");
  const editable = node.attrs.editable === true;
  const label = isAdmonitionVariant(variant) ? ADMONITION_LABELS[variant] : variant;
  return (
    <NodeViewWrapper
      as="aside"
      className={`admonition admonition-${admonitionTone(variant)}`}
      data-block="admonition"
      data-variant={variant}
      data-source-path={String(node.attrs.sourcePath ?? "")}
      data-readonly={editable ? "false" : "true"}
      contentEditable={editable ? undefined : false}
    >
      <p className="admonition-label" contentEditable={false}>{label}{editable ? "" : " · Read-only"}</p>
      {editable
        ? <NodeViewContent className="admonition-body" data-testid="admonition-body" />
        : <p className="admonition-body" data-testid="admonition-body">{String(node.attrs.text ?? "")}</p>}
      <OriginalContent node={node} editor={editor} getPos={getPos} />
    </NodeViewWrapper>
  );
}

function figureAttrs(node: ProseMirrorNode): FigureContent {
  return node.attrs.editable === true ? figureContent(node.toJSON() as TiptapJSON) : {
    imageUrl: String(node.attrs.imageUrl ?? ""),
    imageAlt: String(node.attrs.imageAlt ?? ""),
    caption: String(node.attrs.caption ?? ""),
  };
}

function FigureView({ node, editor, selected, deleteNode, getPos, view, documentPath, onDraftChange, validateFigure }: ReactNodeViewProps & { documentPath?: string; onDraftChange?: DraftListener; validateFigure?: FigureValidator }) {
  const number = useBlockNumber(editor, getPos, "figure");
  // The computed number prefixes the caption, as MyST renders it; it is never saved.
  const numbered = number === undefined ? undefined : `Figure ${number}`;
  const anchor = useRef<HTMLParagraphElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const applied = figureAttrs(node);
  const src = resolveFigureSource(applied.imageUrl, documentPath);
  const label = String(node.attrs.label ?? "");
  const sourcePath = String(node.attrs.sourcePath ?? "");
  const editableFigure = node.attrs.editable === true && view.editable;
  // A new Figure has no persistent state until a valid value is applied. No image is not
  // "never applied": an applied pending Figure has a caption or a label and no content yet.
  const neverApplied = node.attrs.applied === false;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(applied);
  const [labelDraft, setLabelDraft] = useState(label);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const validation = useRef(0);
  const captionChanged = useRef(false);
  const captionKey = JSON.stringify(applied.caption);
  const hasUnappliedDraft = isUnappliedFigureDraft(editing,
    { ...draft, caption: captionChanged.current ? draft.caption : applied.caption }, applied, !neverApplied) ||
    (editing && labelDraft !== label);

  useEffect(() => {
    if (!editing) {
      setDraft(applied);
      setLabelDraft(label);
    }
  }, [editing, applied.imageUrl, applied.imageAlt, captionKey, label]);

  // Insertion and Undo of Apply restore the transient form; selection does not open it.
  useEffect(() => {
    if (!editableFigure) return;
    if (neverApplied) beginEdit();
  }, [editableFigure, neverApplied]);

  useEffect(() => {
    onDraftChange?.("Figure", sourcePath, hasUnappliedDraft);
    return () => onDraftChange?.("Figure", sourcePath, false);
  }, [sourcePath, hasUnappliedDraft, onDraftChange]);

  function beginEdit() {
    captionChanged.current = false;
    setDraft(applied);
    setLabelDraft(label);
    setError("");
    setEditing(true);
    // After the form renders and after an insert command refocuses the editor.
    requestAnimationFrame(() => {
      const input = imageInput.current;
      if (input && !input.closest('[data-testid="figure-editor"]')?.contains(document.activeElement)) input.focus();
    });
  }
  const cancel = () => {
    validation.current++;
    setValidating(false);
    if (neverApplied) removeUnappliedBlock(view, getPos, node, deleteNode);
    setDraft(applied);
    setLabelDraft(label);
    setError("");
    setEditing(false);
    if (neverApplied) view.focus();
    else focusBlock(view, getPos);
  };
  // Apply commits only a value Core accepts as persistent; an invalid draft keeps the form open.
  // Whether the label is referenceable and unique in the document is checked by Core on Save.
  const apply = async () => {
    const position = getPos();
    const current = typeof position === "number" ? view.state.doc.nodeAt(position) : null;
    if (!current) return;
    const liveCaption = figureAttrs(current).caption;
    const candidate = { ...draft, caption: captionChanged.current ? draft.caption : liveCaption };
    const nextLabel = labelDraft;
    const local = labelError(nextLabel) ?? figureContentError(candidate) ?? figurePersistenceError(candidate, nextLabel) ??
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
      message = await validateFigure!(candidate, nextLabel);
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
    const latestPosition = getPos();
    const latest = typeof latestPosition === "number" ? view.state.doc.nodeAt(latestPosition) : null;
    if (!latest || typeof latestPosition !== "number") return;
    if (JSON.stringify(figureAttrs(latest).caption) !== JSON.stringify(liveCaption)) {
      setError("Caption changed during validation. Apply again.");
      return;
    }
    const { caption, ...attributes } = candidate;
    const replacement = latest.type.create({ ...latest.attrs, ...attributes, label: nextLabel, applied: true },
      view.state.schema.nodeFromJSON({ type: "figure", content: paragraphContent(figureCaptionContent(caption)) }).content);
    // Validation may finish after the user has moved on; only focus left in this form returns.
    const active = document.activeElement;
    const returnFocus = active === document.body || Boolean(imageInput.current?.closest("form")?.contains(active));
    // One undo step: undo returns the form's previous value (for a new Figure, its transient state).
    view.dispatch(closeHistory(view.state.tr.replaceWith(latestPosition, latestPosition + latest.nodeSize, replacement)));
    setEditing(false);
    if (returnFocus) focusBlock(view, getPos);
  };
  const field = (key: keyof FigureContent, name: string, testId: string) => (
    <label className="form-field">
      <span>{name}</span>
      <Input
        ref={key === "imageUrl" ? imageInput : undefined}
        data-testid={testId}
        disabled={validating}
        value={typeof draft[key] === "string" ? draft[key] : ""}
        onChange={(event) => {
          if (key === "caption") captionChanged.current = true;
          setDraft({ ...draft, [key]: event.target.value });
          setError("");
        }}
      />
    </label>
  );

  // The image and the no-content frame select the Figure, which shows its properties.
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
      data-readonly={editableFigure ? "false" : "true"}
      contentEditable={editableFigure ? undefined : false}
    >
      <p ref={anchor} className="block-kind block-metadata" contentEditable={false}>{[numbered ?? "Figure", label].filter(Boolean).join(" · ")}</p>
      {hasUnappliedDraft ? (
        <p className="draft-status" role="status" data-testid="figure-draft-status" contentEditable={false}>
          Unapplied changes are not saved. Apply to include them, or Cancel.
        </p>
      ) : null}
      {src ? <img src={src} alt={applied.imageAlt} data-testid="figure-image" contentEditable={false} onMouseDown={selectFigure} /> : null}
      {editableFigure && !src ? (
        <div className="figure-no-content" data-testid="figure-no-content" contentEditable={false} onMouseDown={selectFigure}>
          No content yet
        </div>
      ) : null}
      {editableFigure
        ? <figcaption className="caption" data-number={numbered}><NodeViewContent data-testid="figure-caption-content" aria-label="Figure caption" /></figcaption>
        : <figcaption className="caption" data-number={numbered}>{String(node.attrs.caption ?? "")}</figcaption>}
      <OriginalContent node={node} editor={editor} getPos={getPos} />
      {editableFigure && !editing ? (
        <Button className="figure-edit" size="sm" variant="outline" aria-label="Edit figure" contentEditable={false} onClick={beginEdit}>
          Edit
        </Button>
      ) : null}
      <BlockProperties
        anchor={anchor}
        kind={numbered ?? "Figure"}
        testId="figure"
        open={editing}
        error={error}
        busy={validating}
        onApply={() => void apply()}
        onCancel={cancel}
      >
        {field("imageUrl", "Image", "figure-image-url")}
        {field("imageAlt", "Alt text", "figure-alt")}
        {typeof draft.caption === "string" && typeof applied.caption === "string" ? field("caption", "Caption", "figure-caption")
          : <p className="block-popover-note">Edit the formatted caption directly below the image.</p>}
        <label className="form-field">
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
      </BlockProperties>
    </NodeViewWrapper>
  );
}

/**
 * Closing a block's properties returns keyboard focus to the editor at that block. A selection
 * already inside the block is kept; otherwise the block is selected, so focus does not move the
 * view to an unrelated earlier caret. Selection changes add no history and leave the document.
 */
function focusBlock(view: ReactNodeViewProps["view"], getPos: ReactNodeViewProps["getPos"]): void {
  const position = getPos();
  const node = typeof position === "number" ? view.state.doc.nodeAt(position) : null;
  const { from, to } = view.state.selection;
  if (node && typeof position === "number" && (from < position || to > position + node.nodeSize)) {
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)));
  }
  view.focus();
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
      const tr = view.state.tr
        .setNodeMarkup(position, view.state.schema.nodes.paragraph, {
          sourcePath: `${NEW_BLOCK_PREFIX}empty`,
        })
        .setMeta(BLOCK_COMMAND_META, true);
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, position + 1)));
    }
  } else if (typeof position === "number") {
    const tr = view.state.tr
      .delete(position, position + node.nodeSize)
      .setMeta(BLOCK_COMMAND_META, true);
    // The caret returns to the text before the removed block, never selecting the next block.
    const $position = tr.doc.resolve(position);
    const caret = TextSelection.findFrom($position, -1, true) ?? TextSelection.findFrom($position, 1, true);
    view.dispatch((caret ? tr.setSelection(caret) : tr).scrollIntoView());
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
  return `${import.meta.env?.BASE_URL ?? "/"}document/${encodedPath}${query}`;
}

function EquationView({ node, editor, selected, updateAttributes, deleteNode, getPos, view, onDraftChange }: ReactNodeViewProps & { onDraftChange?: DraftListener }) {
  const label = String(node.attrs.label ?? "");
  const number = useBlockNumber(editor, getPos, "equation");
  const kind = number === undefined ? "Equation" : `Equation (${number})`;
  const latex = String(node.attrs.latex ?? "");
  const anchor = useRef<HTMLParagraphElement>(null);
  const latexInput = useRef<HTMLTextAreaElement>(null);
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

  const emptyNewEquation = view.editable && isNewBlockPath(String(node.attrs.sourcePath)) && latex.length === 0;
  useEffect(() => {
    // Insertion and Undo restore an empty new Equation; existing content needs Edit.
    if (emptyNewEquation) beginEdit();
  }, [emptyNewEquation]);

  const sourcePath = String(node.attrs.sourcePath ?? "");
  const hasUnappliedDraft = isUnappliedEquationDraft(editing, draft, latex, sourcePath) ||
    (editing && labelDraft !== label);
  useEffect(() => {
    onDraftChange?.("Equation", sourcePath, hasUnappliedDraft);
    return () => onDraftChange?.("Equation", sourcePath, false);
  }, [sourcePath, hasUnappliedDraft, onDraftChange]);

  function beginEdit() {
    if (!view.editable) return;
    setDraft(latex);
    setLabelDraft(label);
    setError("");
    setEditing(true);
    // After the panel renders and after an insert command refocuses the editor.
    requestAnimationFrame(() => {
      const input = latexInput.current;
      if (input && !input.closest('[data-testid="equation-editor"]')?.contains(document.activeElement)) input.focus();
    });
  }
  const cancel = () => {
    const isUnappliedNewEquation = isNewBlockPath(sourcePath) && latex.length === 0;
    if (isUnappliedNewEquation) removeUnappliedBlock(view, getPos, node, deleteNode);
    setDraft(latex);
    setLabelDraft(label);
    setError("");
    setEditing(false);
    if (isUnappliedNewEquation) view.focus();
    else focusBlock(view, getPos);
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
        <p className="draft-status" role="status" data-testid="equation-draft-status">
          Unapplied changes are not saved. Apply to include them, or Cancel.
        </p>
      ) : null}
      {/* The computed number sits right of the formula, as MyST renders it; it is never saved. */}
      <div className="equation-row">
        <EquationFormula className="equation-math" latex={latex} testId="equation-preview" />
        {number === undefined ? null : <span className="equation-number" data-testid="equation-number">({number})</span>}
      </div>
      {view.editable && !editing ? (
        <Button className="equation-edit" size="sm" variant="outline" onClick={beginEdit}>
          Edit
        </Button>
      ) : null}
      <BlockProperties
        anchor={anchor}
        kind={kind}
        testId="equation"
        open={editing}
        error={error}
        onApply={apply}
        onCancel={cancel}
      >
        <label className="form-field">
          <span>LaTeX</span>
          <textarea
            ref={latexInput}
            aria-label="Equation LaTeX"
            className="equation-input"
            data-testid="equation-latex"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
          />
        </label>
        <EquationFormula className="equation-preview" latex={draft} testId="equation-edit-preview" />
        <label className="form-field">
          <span>Label</span>
          <Input
            data-testid="equation-label"
            value={labelDraft}
            placeholder="None"
            onChange={(event) => {
              setLabelDraft(event.target.value);
              setError("");
            }}
          />
        </label>
      </BlockProperties>
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
    >
      <div className="equation-content" dangerouslySetInnerHTML={{ __html: result.html ?? "" }} />
    </div>
  );
}

function InlineMathView({ node, editor, getPos, updateAttributes, selected }: ReactNodeViewProps) {
  const value = String(node.attrs.value ?? "");
  const [editing, setEditing] = useState(false);
  const bounds = useOverlayBounds<HTMLFormElement>(editing);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const rendered = renderEquation(value, false);
  const open = () => {
    if (!editor.isEditable) return;
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
          ref={bounds}
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
          <label className="form-label" htmlFor="inline-math-source">LaTeX</label>
          <Input
            id="inline-math-source"
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
          <Button size="sm" variant="outline" data-testid="inline-math-remove" onClick={remove}>Remove</Button>
          {error ? <span className="link-form-error" role="alert">{error}</span> : null}
        </form>
      ) : null}
    </NodeViewWrapper>
  );
}

function CodeBlockView({ node, editor, updateAttributes }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper
      as="div"
      className="code-block"
      data-block="code"
      data-source-path={String(node.attrs.sourcePath ?? "")}
    >
      <input
        className="code-language"
        data-testid="code-language"
        aria-label="Code language"
        placeholder="Language"
        spellCheck={false}
        contentEditable={false}
        readOnly={!editor.isEditable}
        value={String(node.attrs.language ?? "")}
        // A fence language is one word.
        onChange={(event) => updateAttributes({ language: event.target.value.replace(/[\s`]/g, "") })}
      />
      <pre><NodeViewContent<"code"> as="code" /></pre>
    </NodeViewWrapper>
  );
}

function UnsupportedView({ node, editor, getPos }: ReactNodeViewProps) {
  const footnote = String(node.attrs.footnote ?? "");
  return (
    <NodeViewWrapper
      as="div"
      className="unsupported"
      data-block="unsupported"
      data-source-path={String(node.attrs.sourcePath ?? "")}
      data-readonly="true"
      contentEditable={false}
    >
      {node.attrs.original ? null : <span className="block-kind">Read-only </span>}
      {footnote ? <FootnoteNumber editor={editor} label={footnote} /> : null}{String(node.attrs.text ?? "")}
      <OriginalContent node={node} editor={editor} getPos={getPos} />
    </NodeViewWrapper>
  );
}

/** A footnote definition's computed number, as MyST lists it. Clicking it goes back to the first reference. */
function FootnoteNumber({ editor, label }: { editor: Editor; label: string }) {
  const number = useFootnoteNumber(editor, label);
  return (
    <sup className="footnote-number" data-testid="footnote-number" contentEditable={false}
      title="Go to the reference" aria-label={`Footnote ${number ?? label}. Go to the reference.`}
      onMouseDown={(event) => event.preventDefault()} onClick={() => revealReference(editor, label)}>
      {number ?? `[^${label}]`}
    </sup>
  );
}

const DocumentNumbering = Extension.create({
  name: "documentNumbering",
  addGlobalAttributes() { return [{ types: ["doc"], attributes: { headingNumbering: { default: null, rendered: false } } }]; },
  addProseMirrorPlugins() {
    return [new Plugin({ props: { decorations(state) {
      const blocks: { block: string; level?: number; headingLevels?: number[] }[] = [];
      state.doc.forEach(node => blocks.push({ block: node.type.name === "readonlyHeading" ? "heading" : node.type.name, level: Number(node.attrs.level), headingLevels: node.attrs.headingLevels }));
      const numbers = headingNumbers(blocks, state.doc.attrs.headingNumbering as HeadingNumbering | null);
      const decorations: Decoration[] = [];
      state.doc.forEach((node, pos, index) => { if (numbers[index]) decorations.push(Decoration.node(pos, pos + node.nodeSize, { "data-heading-number": numbers[index]! })); });
      return DecorationSet.create(state.doc, decorations);
    } } })];
  },
});
