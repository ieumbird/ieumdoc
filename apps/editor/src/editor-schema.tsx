import { updateLabelProperties } from "./label-rename.ts";
import type { UiMessage } from "./ui-message.ts";
import { useMessageState } from "./ui-message.ts";
import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import { allocateBlockPath } from "./block-locators.ts";
import { Extension, Node, type Attribute, type Editor, type Extensions, type NodeViewRenderer } from "@tiptap/core";
import { BulletList, ListItem, ListKeymap, OrderedList } from "@tiptap/extension-list";
import { Code } from "@tiptap/extension-code";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { codeHighlightingPlugin, lowlight } from "./code-highlight.ts";
import { type DOMOutputSpec, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { documentInteraction } from "./document-interaction.ts";
import { imageAssets } from "./image-assets.ts";
import { ImageRenames, ImageRenameContext, imageFileStem } from "./image-rename.ts";
import { figureMediaPath } from "../shared/figure-media-path.ts";
import { MarkdownInputRules } from "./markdown-input-rules.ts";
import StarterKit from "@tiptap/starter-kit";
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { isAdmonitionVariant, type EditableBlock, type FigureContent, type InlineContent } from "@ieumdoc/core";
import { figureContentError } from "@ieumdoc/core/figure";
import { headingNumbers, type HeadingNumbering } from "@ieumdoc/core/numbering";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { labelError, labelKey, targetLabelError } from "@ieumdoc/core/label";
import { Input } from "@/components/ui/input.tsx";
import { CodeLanguageInput } from "./code-language-input.tsx";
import { BlockProperties, PropertyForm } from "./block-properties.tsx";
import { FigureProperties } from "./figure-properties.tsx";
import { NumberField } from "./numbering-properties.tsx";
import { ChevronRight } from "lucide-react";
import { useEditorVisible } from "./editor-visibility.ts";
import { ADMONITION_LABELS, admonitionTone, updateFigure } from "./block-commands.ts";
import { CrossReference, captionPrefixText, useBlockNumber, useCaptionNumberText } from "./cross-reference.tsx";
import { Endnotes, canEditEndnoteAt, cancelEndnoteEditing, endnoteAt, endnoteEditingKey, endnoteEditorToken, revealReference, useEndnoteNumber } from "./endnotes.ts";
import { FootnoteReference } from "./footnote.tsx";
import { Citation } from "./citation.tsx";
import { renderEquation } from "./equation-render.ts";
import { MermaidPreview } from "./mermaid-preview.tsx";
import { normalizeMermaidSource } from "./mermaid-source.ts";
import { snapshotBlocksByPath } from "./tiptap-edits.ts";
import {
  DELETED_PATHS_ATTR,
  figureContent,
  isNewBlockPath,
  isSupportedDocumentChange,
  normalizeEngineDocument,
  TABLE_CELL_SOURCE_ATTR,
  toTiptapBlockNode,
  type TiptapJSON,
} from "./tiptap-document.ts";
import { Button } from "@/components/ui/button.tsx";
import { Notice } from "./ui/primitives.tsx";
import { TableCellFocus, TableTools } from "./table-tools.tsx";

/** Reports whether the block at a source path holds an unapplied draft. */
export type DraftKind = "Equation" | "Figure" | "Table" | "Section label" | "Inline math";
export type DraftListener = (kind: DraftKind, path: string, active: boolean, id?: string) => void;

const EDIT_PROPERTIES = "ieumdoc-edit-properties";

/** Route selected-node Enter to its mounted form, before the prose Enter keymaps. */
const PropertyEntry = Extension.create({
  name: "propertyEntry",
  priority: 130,
  addKeyboardShortcuts() {
    return { Enter: () => {
      const { view, state } = this.editor;
      const { selection } = state;
      if (!this.editor.isEditable || view.composing || !(selection instanceof NodeSelection) ||
          !["figure", "table", "equation", "inlineMath"].includes(selection.node.type.name)) return false;
      const dom = view.nodeDOM(selection.from);
      const wrapper = dom instanceof HTMLElement ? dom.querySelector("[data-node-view-wrapper]") : null;
      return wrapper ? !wrapper.dispatchEvent(new Event(EDIT_PROPERTIES, { cancelable: true })) : false;
    } };
  },
});

function usePropertyEntry(anchor: RefObject<HTMLElement | null>, begin: () => void) {
  useEffect(() => {
    const wrapper = anchor.current?.closest("[data-node-view-wrapper]");
    const open = (event: Event) => { event.preventDefault(); begin(); };
    wrapper?.addEventListener(EDIT_PROPERTIES, open);
    return () => wrapper?.removeEventListener(EDIT_PROPERTIES, open);
  }, [anchor, begin]);
}

/** Core's persistent validation of a Figure Apply: its properties and its label. */
export type FigureValidator = (figure: FigureContent, label: string) => Promise<string | undefined>;
/** An image chosen for a Figure. `discard` removes a copy made for it, once no Figure will use it. */
export type ImageChoice = { path: string; discard?(): void };
/** Lets the user choose an image on the Host for this document; undefined when cancelled. */
export type ImageChooser = (documentPath: string, returnFocus: RefObject<HTMLElement | null>) => Promise<ImageChoice | undefined>;

/** An open Equation form is unsaved only when its source changed. */
export function isUnappliedEquationDraft(editing: boolean, draft: string, latex: string): boolean {
  return editing && draft !== latex;
}

/** An open Figure form is unsaved when changed. */
export function isUnappliedFigureDraft(editing: boolean, draft: FigureContent, applied: FigureContent): boolean {
  const changed = draft.imageUrl !== applied.imageUrl || draft.imageAlt !== applied.imageAlt ||
    draft.mermaidSource !== applied.mermaidSource ||
    JSON.stringify(draft.caption) !== JSON.stringify(applied.caption);
  return editing && changed;
}

const hiddenAttr = (defaultValue: string | number | boolean = ""): Attribute => ({
  default: defaultValue,
  rendered: false,
});

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

// A heading holds the paragraph's inline content except line breaks, which Markdown headings cannot.
const SourcedHeading = Node.create({
  name: "heading",
  group: "block",
  content: "(text | inlineMath | crossReference | footnoteReference | citation)*",
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
    return blockAttrs({
      start: {
        default: 1,
        parseHTML: (element) => element.hasAttribute("start") ? Number.parseInt(element.getAttribute("start") ?? "", 10) : 1,
      },
      style: {
        default: "decimal",
        parseHTML: element => element.getAttribute("data-list-style") ?? "decimal",
        renderHTML: attributes => ({ "data-list-style": attributes.style }),
      },
      delimiter: {
        default: ".",
        parseHTML: element => element.getAttribute("data-list-delimiter") ?? ".",
        renderHTML: attributes => ({ "data-list-delimiter": attributes.delimiter }),
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

// Decorations are view-only: guidance cannot enter copied or saved document content.
const EmptyElementGuidance = Extension.create({
  name: "emptyElementGuidance",
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        decorations(state) {
          const decorations: Decoration[] = [];
          state.doc.descendants((node, pos, parent) => {
            if (node.content.size !== 0) return;
            const prompt = node.type.name === "quote" ? i18n.t("Enter a quote")
              : node.type.name === "paragraph" && parent?.type.name === "listItem" ? i18n.t("Enter a list item") : undefined;
            if (prompt) decorations.push(Decoration.node(pos, pos + node.nodeSize, { "data-empty-prompt": prompt }));
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
      view(view) {
        const refresh = () => view.dispatch(view.state.tr.setMeta("addToHistory", false));
        i18n.on("languageChanged", refresh);
        return { destroy() { i18n.off("languageChanged", refresh); } };
      },
    })];
  },
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

const Admonition = Node.create({
  name: "admonition",
  group: "block",
  isolating: true,
  defining: true,
  content: "inline*",
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ variant: hiddenAttr("note") });
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
// the quote; Shift+Enter is a line break. Native admission rejects other quotes.
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
// holds no footnote references; native admission rejects other definitions.
const FootnoteDefinition = Node.create({
  name: "footnoteDefinition",
  group: "block",
  content: "(text | hardBreak | inlineMath | crossReference | citation)*",
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
    // NodeView-only marker: CSS can recognize adjacent definitions without changing the schema.
    return ReactNodeViewRenderer(FootnoteDefinitionView, { attrs: { "data-footnote-definition": "true" } });
  },
});

function FootnoteDefinitionView({ node, editor, getPos, selected }: ReactNodeViewProps) {
  useTranslation();
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
      data-editing={String(editing)}
      data-endnote-owner={label}
      data-endnote-editor={endnoteEditorToken(editor)}
      data-endnotes-heading={i18n.t("Endnotes")}
      role="textbox"
      aria-label={`${i18n.t("Endnote")} ${useEndnoteNumber(editor, label) ?? label}`}
      aria-readonly={!editing}
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
      {editor.isEditable ? <div className="endnote-actions" contentEditable={false}>
        {editing ? <>
          <Button size="sm" variant="outline" data-testid="endnote-cancel" onClick={() => finish(true)}>{i18n.t("Cancel")}</Button>
          <Button size="sm" data-testid="endnote-apply" onClick={() => finish(false)}>{i18n.t("Done")}</Button>
        </> : <Button size="sm" variant="outline" data-testid="endnote-edit" onClick={begin}>{i18n.t("Edit")}</Button>}
      </div> : null}
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

export const DocumentPathContext = createContext<string | undefined>(undefined);

function captionNodeView(renderer: NodeViewRenderer): NodeViewRenderer {
  return props => {
    const nodeView = renderer(props);
    const ignoreMutation = nodeView.ignoreMutation?.bind(nodeView);
    nodeView.ignoreMutation = mutation => {
      // Chromium can remove the whole contentDOM when cancelling composition. Tiptap
      // ignores that parent mutation; ProseMirror must read it and rebuild the lost DOM.
      if (mutation.type === "childList" && nodeView.contentDOM &&
          !nodeView.dom.contains(nodeView.contentDOM)) return false;
      return ignoreMutation?.(mutation) ?? false;
    };
    return nodeView;
  };
}

const Figure = Node.create<{ documentPath?: string | (() => string) }>({
  name: "figure",
  group: "block",
  content: "(text | hardBreak | inlineMath | crossReference | footnoteReference | citation)*",
  isolating: true,
  selectable: true,
  draggable: false,
  addOptions() { return { documentPath: undefined }; },
  addAttributes() {
    return blockAttrs({
      label: hiddenAttr(""),
      imageUrl: hiddenAttr(""),
      enumerator: { default: null, rendered: false },
      imageIdentity: hiddenAttr(""),
      imageAlt: hiddenAttr(""),
      mermaidSource: { default: null, rendered: false },
    });
  },
  parseHTML() {
    return [{ tag: "figure[data-figure]", contentElement: "figcaption" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["figure", { ...HTMLAttributes, "data-figure": "" },
      ...(node.attrs.imageUrl ? [["img", { src: resolveFigureSource(node.attrs.imageUrl, this.options.documentPath), alt: node.attrs.imageAlt }]] : []), ["figcaption", 0]];
  },
  addNodeView() {
    return captionNodeView(ReactNodeViewRenderer(FigureView));
  },
});

const Equation = Node.create({
  name: "equation",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ latex: hiddenAttr(""), label: hiddenAttr(""), enumerator: { default: null, rendered: false } });
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

function figureNode(documentPath?: string | (() => string), onDraftChange?: DraftListener, validateFigure?: FigureValidator, chooseImage?: ImageChooser) {
  return Figure.configure({ documentPath }).extend({
    addNodeView() {
      return captionNodeView(ReactNodeViewRenderer(createFigureNodeView(documentPath, onDraftChange, validateFigure, chooseImage)));
    },
  });
}

function createFigureNodeView(documentPath?: string | (() => string), onDraftChange?: DraftListener, validateFigure?: FigureValidator, chooseImage?: ImageChooser) {
  return function FigureAssetNodeView(props: ReactNodeViewProps) {
    return <FigureView {...props} documentPath={documentPath} onDraftChange={onDraftChange} validateFigure={validateFigure} chooseImage={chooseImage} />;
  };
}

function createEquationNodeView(onDraftChange?: DraftListener) {
  return function EquationDraftNodeView(props: ReactNodeViewProps) {
    return <EquationView {...props} onDraftChange={onDraftChange} />;
  };
}

// A Markdown table lives in the single document state: editable cells hold supported
// inline content without line breaks; native admission rejects other cells. Commands add, remove and
// move whole rows (below the header row) and columns, and set column alignment; snapshot cells
// carry their opening position. The structure guard rejects any other change to the grid.
const headerAttr: Attribute = { default: false, rendered: false, parseHTML: (element) => element.tagName === "TH" };

const Table = Node.create({
  name: "table",
  allowGapCursor: false,
  group: "block",
  content: "tableRow+ tableCaption",
  isolating: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ label: hiddenAttr(""), enumerator: { default: null, rendered: false } });
  },
  parseHTML() {
    return [{ tag: "div[data-table-block]", contentElement: "table" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, class: "table-block", "data-block": "table",
      "data-table-block": "", "data-source-path": String(node.attrs.sourcePath ?? "") },
      ["table", { class: "table" }, 0]];
  },
});

// A native caption is part of its table, while rows/cells retain their engine coordinates.
const TableCaption = Node.create({
  name: "tableCaption",
  content: "(text | inlineMath | crossReference | footnoteReference | citation)*",
  isolating: true,
  selectable: false,
  parseHTML() { return [{ tag: "caption" }]; },
  renderHTML() { return ["caption", { class: "caption table-caption" }, 0]; },
  addNodeView() {
    return captionNodeView(ReactNodeViewRenderer(TableCaptionView, { as: "caption", className: "table-caption", contentDOMElementTag: "span" }));
  },
});

function handleTextblockMouseDown(event: ReactMouseEvent, { editor, node, getPos }: Pick<ReactNodeViewProps, "editor" | "node" | "getPos">): void {
  if (!editor.isEditable || event.button !== 0 || event.defaultPrevented) return;
  if (node.content.size !== 0 && event.detail !== 3) return;
  const position = getPos();
  if (typeof position !== "number") return;
  // Outside contentDOM, Tiptap stops the editable wrapper's mousedown. Prevent
  // native triple-click selection from extending into the following block.
  event.preventDefault();
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, position + 1,
    event.detail === 3 ? position + node.nodeSize - 1 : position + 1)));
  editor.view.focus();
}

export function captionPlaceholderVisible(state: EditorState, pos: number, editable: boolean): boolean {
  const node = state.doc.nodeAt(pos);
  if (!editable || !node || node.content.size !== 0) return false;
  const selection = state.selection;
  return !(selection instanceof TextSelection && selection.head === pos + 1);
}

function useCaptionPlaceholder({ editor, getPos }: Pick<ReactNodeViewProps, "editor" | "getPos">, kind: "table" | "figure") {
  const show = useEditorState({ editor, selector: ({ editor: current }) => {
    const pos = getPos();
    if (!current || !current.isEditable || typeof pos !== "number") return false;
    return captionPlaceholderVisible(current.state, pos, current.isEditable);
  } });
  return show ? i18n.t(kind === "table" ? "Enter a table caption…" : "Enter a figure caption…") : undefined;
}

function TableCaptionView({ node, editor, getPos }: ReactNodeViewProps) {
  useTranslation();
  const placeholder = useCaptionPlaceholder({ editor, getPos }, "table");
  const numbered = useCaptionNumberText(editor, getPos, "table");
  return <NodeViewWrapper className="caption" data-testid="table-caption" data-number={numbered} data-caption-prefix={numbered === undefined ? undefined : captionPrefixText(numbered)}
    onMouseDown={(event: ReactMouseEvent) => handleTextblockMouseDown(event, { editor, node, getPos })}>
    <NodeViewContent as="div" aria-label={i18n.t("Table caption")} data-empty-caption={node.content.size === 0 || undefined}
      data-placeholder={placeholder} />
  </NodeViewWrapper>;
}

function tableNode(onDraftChange?: DraftListener) {
  return Table.extend({
    addNodeView() { return ReactNodeViewRenderer(props => <TableView {...props} onDraftChange={onDraftChange} />, { contentDOMElementTag: "table" }); },
  });
}

function TableView({ node, editor, getPos, selected, onDraftChange }: ReactNodeViewProps & { onDraftChange?: DraftListener }) {
  useTranslation();
  const formId = useId();
  const grid = useRef<HTMLDivElement>(null);
  const rowLayer = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLParagraphElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const numbered = useCaptionNumberText(editor, getPos, "table");
  const kind = numbered ?? i18n.t("Table");
  const label = String(node.attrs.label ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const enumerator = String(node.attrs.enumerator ?? "");
  const [numberDraft, setNumberDraft] = useState(enumerator);
  const [error, setError] = useMessageState("");
  const sourcePath = String(node.attrs.sourcePath);
  const dirty = editing && (draft !== label || numberDraft !== enumerator);
  useEffect(() => { onDraftChange?.("Table", sourcePath, dirty); return () => onDraftChange?.("Table", sourcePath, false); }, [sourcePath, dirty, onDraftChange]);
  const begin = () => { if (!editor.isEditable || editing) return; setDraft(label); setNumberDraft(enumerator); setError(""); setEditing(true); };
  usePropertyEntry(anchor, begin);
  const close = () => { setEditing(false); focusBlock(editor.view, getPos); };
  const apply = () => {
    const invalid = labelError(draft);
    if (invalid) { setError(invalid); return; }
    const position = getPos();
    if (typeof position !== "number") return;
    try {
      editor.view.dispatch(updateLabelProperties(editor.state, position, { label: draft, enumerator: numberDraft || null }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return; }
    close();
  };
  return <NodeViewWrapper className="table-block" data-block="table" data-table-block="" data-source-path={sourcePath}
    data-selected={selected ? "true" : "false"} data-editing={editing ? "true" : "false"}>
    <p ref={anchor} className="block-kind block-metadata" contentEditable={false} onMouseDown={event => {
      const position = getPos();
      if (typeof position !== "number") return;
      event.preventDefault();
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)));
      editor.view.focus();
    }} onDoubleClick={begin}>{[kind, label].filter(Boolean).join(" · ")}</p>
    <div className="table-scroll"><div ref={grid} className="table-grid">
      <NodeViewContent as="div" className="table" />
      <TableTools editor={editor} node={node} getPos={getPos} grid={grid} rowLayer={rowLayer} onEdit={begin} hidden={editing} />
    </div></div>
    <div ref={rowLayer} className="table-row-layer" contentEditable={false} />
    <BlockProperties anchor={anchor} initialFocus={input} kind={kind} testId="table" open={editing}
      error={error} onApply={apply} onCancel={close}>
      <label className="form-label" htmlFor={`table-label-${formId}`}>{i18n.t("Label")}</label>
      <Input ref={input} id={`table-label-${formId}`} data-testid="table-label" value={draft} onChange={event => setDraft(event.target.value)} />
      <NumberField editor={editor} getPos={getPos} testId="table" value={numberDraft} onChange={setNumberDraft} />
    </BlockProperties>
  </NodeViewWrapper>;
}

function cellAlignmentStyle(node: ProseMirrorNode): string {
  return ["left", "center", "right"].includes(node.attrs.align) ? `text-align: ${node.attrs.align}` : "";
}

const TableRow = Node.create({
  name: "tableRow",
  allowGapCursor: false,
  content: "tableCell+",
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
  content: "(text | inlineMath | crossReference | footnoteReference | citation)*",
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

// A `(label)=` section label: it names the heading after it for {ref} references.
const LabelTarget = Node.create<{ onDraftChange?: DraftListener }>({
  addOptions() { return {}; },
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
  return taken ? i18n.t("Label \"{{label}}\" already names another target in this document.", { label: label }) : undefined;
}

function LabelTargetView({ node, editor, getPos, selected }: ReactNodeViewProps) {
  useTranslation();
  const formId = useId();
  const label = String(node.attrs.label ?? "");
  const anchor = useRef<HTMLParagraphElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [error, setError] = useMessageState("");
  const path = String(node.attrs.sourcePath ?? "");
  const onDraftChange = editor.extensionManager.extensions.find(extension => extension.name === "labelTarget")?.options.onDraftChange as DraftListener | undefined;
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
    if (typeof position !== "number") return;
    try { editor.view.dispatch(updateLabelProperties(editor.state, position, { label: draft })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return; }
    close();
  };
  // Authoring metadata like a Figure label: it takes no space and shows with its heading.
  return (
    <NodeViewWrapper as="div" className="label-target" data-block="label-target" data-testid="label-target"
      data-label={label} data-source-path={String(node.attrs.sourcePath ?? "")} data-selected={selected ? "true" : "false"}
      data-editing={editing ? "true" : "false"} contentEditable={false}>
      <p ref={anchor} className="label-target-content">
        {editor.isEditable ? (
          <button type="button" className="label-target-edit" aria-label={i18n.t("Edit section label {{label}}", { label: label })} data-testid="label-target-edit"
            title={i18n.t("Section label: {ref} references to it name the heading below")}
            onClick={() => { setDraft(label); setError(""); setEditing(true); }}>§ {label}</button>
        ) : <span className="label-target-text">§ {label}</span>}
      </p>
      <BlockProperties anchor={anchor} initialFocus={input} kind={i18n.t("Section label")} testId="label-target" open={editing}
        error={error}
        onApply={apply} onCancel={close}>
        <label className="form-label" htmlFor={`label-target-${formId}`}>{i18n.t("Label")}</label>
        <Input ref={input} id={`label-target-${formId}`} data-testid="label-target-input" value={draft}
          onChange={event => { setDraft(event.target.value); setError(""); }} />
      </BlockProperties>
    </NodeViewWrapper>
  );
}

const InlineMath = Node.create<{ onDraftChange?: DraftListener }>({
  addOptions() { return {}; },
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
        parent.type.name === "quote" || parent.type.name === "footnoteDefinition" || parent.type.name === "admonition";
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
            ? allocateBlockPath("split")
            : sourcePath;
          const leftSourcePath = tr.doc.nodeAt(start)?.content.size === 0 && rightNode!.content.size > 0
            ? allocateBlockPath("split") : sourcePath;
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

export function editorExtensions(
  onDraftChange?: DraftListener,
  documentPath?: string | (() => string),
  validateFigure?: FigureValidator,
  hasActiveDraft?: () => boolean,
  chooseImage?: ImageChooser,
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
    PropertyEntry,
    ImageRenames,
    Endnotes.configure({ canOrder: () => !hasActiveDraft?.() }),
    TableCellFocus,
    ParagraphHardBreak,
    ParagraphSplit,
    ParagraphMerge,
    SourcedParagraph,
    SourcedHeading,
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
    figureNode(documentPath, onDraftChange, validateFigure, chooseImage),
    equationNode(onDraftChange),
    tableNode(onDraftChange),
    TableRow,
    TableCaption,
    TableCell,
    LabelTarget.configure({ onDraftChange }),
    InlineMath.configure({ onDraftChange }),
    CrossReference,
    FootnoteReference,
    Citation,
    MarkdownInputRules,
    EmptyElementGuidance,
  ];
}

export function createEditorExtensions(
  baseline: TiptapJSON,
  onReject: (reason?: UiMessage) => void,
  onDraftChange?: DraftListener,
  documentPath?: string | (() => string),
  validateFigure?: FigureValidator,
  onAssetPendingChange?: (active: boolean) => void,
  onAssetError?: (reason: string) => void,
  hasActiveDraft?: () => boolean,
  chooseImage?: ImageChooser,
  initialDeletedPaths: readonly string[] = [],
  onAssetChange?: (path: string) => void,
): Extensions {
  return [...editorExtensions(onDraftChange, documentPath, validateFigure, hasActiveDraft, chooseImage),
    ...(documentPath ? [imageAssets({ documentPath, reject: onAssetError ?? onReject, pending: onAssetPendingChange, changed: onAssetChange })] : []),
    documentInteraction(onReject), structureGuard(baseline, onReject, initialDeletedPaths)];
}

function structureGuard(baseline: TiptapJSON, onReject: (reason?: UiMessage) => void, initialDeletedPaths: readonly string[]): Extension {
  return Extension.create({
    name: "structureGuard",
    addProseMirrorPlugins() {
      return [structureGuardPlugin(baseline, onReject, initialDeletedPaths)];
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
    if (path && !isNewBlockPath(path)) paths.add(path);
  }));
  return paths;
}

function commandDeletions(transaction: Transaction, declared: string[]): string[] {
  if (!transaction.docChanged) return declared;
  const remaining = snapshotPathsOf(transaction.doc);
  const removed = [...snapshotPathsOf(transaction.before)].filter(path => !remaining.has(path));
  return removed.length ? [...new Set([...declared, ...removed])] : declared;
}

export function structureGuardPlugin(baseline: TiptapJSON, onReject: (reason?: UiMessage) => void, initialDeletedPaths: readonly string[] = []): Plugin {
  const blocksByPath = snapshotBlocksByPath(baseline);
  return new Plugin<string[]>({
    key: structureGuardKey,
    state: {
      init: () => [...initialDeletedPaths],
      apply(transaction, declared) {
        return commandDeletions(transaction, declared);
      },
    },
    // Engine edits are accepted only if the normalized result has a semantic
    // save representation. This retains table/inline validation.
    filterTransaction(transaction, state) {
      if (!transaction.docChanged) return true;
      try {
        const next = normalizeEngineDocument(baseline, {
          ...transaction.doc.toJSON(), attrs: { [DELETED_PATHS_ATTR]: commandDeletions(transaction, declaredDeletions(state)) },
        }, transaction.before.childCount !== transaction.doc.childCount, blocksByPath);
        if (isSupportedDocumentChange(baseline, next, blocksByPath)) return true;
      } catch { /* Unrepresentable input keeps the previous document. */ }
      onReject();
      return false;
    },
    appendTransaction(transactions, old, state) {
      if (!transactions.some(tr => tr.docChanged)) return null;
      const normalized = normalizeEngineDocument(baseline, state.doc.toJSON(), old.doc.childCount !== state.doc.childCount, blocksByPath);
      const tr = state.tr;
      state.doc.forEach((node, pos, index) => {
        const attrs = normalized.content![index].attrs!;
        if (node.attrs.sourcePath !== attrs.sourcePath) tr.setNodeMarkup(pos, undefined, attrs);
      });
      return tr.docChanged ? tr : null;
    },
  });
}

function AdmonitionView({ node, editor, getPos }: ReactNodeViewProps) {
  useTranslation();
  const variant = String(node.attrs.variant ?? "note");
  const label = isAdmonitionVariant(variant) ? ADMONITION_LABELS[variant] : variant;
  return (
    <NodeViewWrapper
      as="aside"
      className={`admonition admonition-${admonitionTone(variant)}`}
      data-block="admonition"
      data-variant={variant}
      data-source-path={String(node.attrs.sourcePath ?? "")}
    >
      <p className="admonition-label" contentEditable={false}>{label}</p>
      <NodeViewContent className="admonition-body" data-testid="admonition-body" data-empty-prompt={node.content.size === 0 ? i18n.t("Enter admonition text") : undefined} />
    </NodeViewWrapper>
  );
}

function figureAttrs(node: ProseMirrorNode): FigureContent {
  return figureContent(node.toJSON() as TiptapJSON);
}

type FigureViewProps = ReactNodeViewProps & { documentPath?: string | (() => string); onDraftChange?: DraftListener; validateFigure?: FigureValidator; chooseImage?: ImageChooser };

function FigureView(props: FigureViewProps) {
  return typeof props.node.attrs.mermaidSource === "string" ? <MermaidFigureView {...props} /> : <ImageFigureView {...props} />;
}

function ImageFigureView({ node, editor, selected, getPos, view, documentPath: initialDocumentPath, onDraftChange, validateFigure, chooseImage }: FigureViewProps) {
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
  const [numberDraft, setNumberDraft] = useState(enumerator);
  const appliedStem = imageFileStem(applied.imageUrl);
  const [filename, setFilename] = useState(appliedStem ?? "");
  const filenameDraft = appliedStem !== undefined && filename !== appliedStem;
  const canRename = !!renameImage && !!documentPath && appliedStem !== undefined && !imageFailed && draft.imageUrl === applied.imageUrl && !copied.current;
  const [error, setError] = useMessageState("");
  const [validating, setValidating] = useState(false);
  const pendingRequest = useRef(0);
  const captionKey = JSON.stringify(applied.caption);
  const hasUnappliedDraft = isUnappliedFigureDraft(editing,
    { ...draft, caption: applied.caption }, applied) ||
    (editing && (labelDraft !== label || numberDraft !== enumerator)) || filenameDraft;

  useEffect(() => {
    if (!editing) {
      setDraft(applied);
      setLabelDraft(label); setNumberDraft(enumerator);
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
    setLabelDraft(label); setNumberDraft(enumerator);
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
    setLabelDraft(label); setNumberDraft(enumerator);
    setFilename(appliedStem ?? "");
    setError("");
    setEditing(false);
    focusBlock(view, getPos);
  };
  // Apply commits only a value Core accepts as persistent; an invalid draft keeps the form open.
  // Core checks the live target/reference context before committing a label rename.
  const apply = async (rename = false, returnCaret = true) => {
    if (validating || choosing) return;
    const position = getPos();
    const current = typeof position === "number" ? view.state.doc.nodeAt(position) : null;
    if (!current) return;
    const liveCaption = figureAttrs(current).caption;
    const candidate = { ...draft, caption: liveCaption };
    const nextLabel = labelDraft;
    const local = labelError(nextLabel) ?? figureContentError(candidate) ??
      (validateFigure ? undefined : "Figure validation is unavailable.");
    if (local) {
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
      updateFigure(view.state, latestPosition, { imageUrl: candidate.imageUrl, imageAlt: candidate.imageAlt, label: nextLabel, enumerator: numberDraft || null });
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
      if (now?.attrs.imageUrl !== attributes.imageUrl || now.attrs.imageAlt !== attributes.imageAlt || now.attrs.label !== nextLabel || now.attrs.enumerator !== (numberDraft || null)) {
        view.dispatch(updateFigure(view.state, latestPosition, { ...attributes, label: nextLabel, enumerator: numberDraft || null }));
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
    <label className="form-field">
      <span>{name}</span>
      <Input
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
    </label>
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
        <div className="figure-no-content" data-testid="figure-no-content" contentEditable={false} onMouseDown={selectFigure} onDoubleClick={beginEdit}>{i18n.t("No content yet")}</div>
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
        error={error}
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
        <label className="form-field">
          <span>{i18n.t("Label")}</span>
          <Input
            data-testid="figure-label"
            disabled={validating}
            value={labelDraft}
            placeholder={i18n.t("None")}
            onChange={(event) => {
              setLabelDraft(event.target.value);
              setError("");
            }}
          />
        </label>
        <NumberField segmented editor={editor} getPos={getPos} testId="figure" value={numberDraft} onChange={value => { setNumberDraft(value); setError(""); }} disabled={validating} />
        </div>
        {canRename ? <details key={String(editing)} open={filenameDraft || !!error || undefined}>
          <summary><ChevronRight aria-hidden="true" />{i18n.t("Advanced")}</summary>
          <div className="figure-image-field"><label className="form-field"><span>{i18n.t("File name")}</span>
            <Input data-testid="figure-file-name" value={filename} disabled={validating}
              placeholder={i18n.t("None")}
              onChange={event => { setFilename(event.target.value); setError(""); }} />
          </label><Button type="button" size="sm" variant="outline" disabled={validating || !filenameDraft}
            data-testid="figure-rename" onClick={() => void apply(true)}>{i18n.t("Rename")}</Button></div>
        </details> : null}
      </FigureProperties>
    </NodeViewWrapper>
  );
}

// Keep native text dragging inside form controls; ProseMirror otherwise handles their drop.
function isolateInputDrag(event: ReactDragEvent<HTMLDivElement>) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.stopPropagation();
}

/** Insertion refocuses the engine first; deferred entry must yield to subsequent user input. */
function useSourceInputFocus(input: RefObject<HTMLElement | null>, editing: boolean) {
  const frame = useRef<number | null>(null);
  const interaction = useRef<AbortController | null>(null);
  const cancel = () => {
    interaction.current?.abort();
    interaction.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  useEffect(() => {
    if (!editing) return;
    cancel();
    // Entry's pointerdown/Enter has already passed document capture. Any later trusted
    // input cancels entry; the insertion command's programmatic focus does not.
    interaction.current = new AbortController();
    const leave = (event: Event) => {
      if (event.isTrusted) cancel();
    };
    const options = { capture: true, signal: interaction.current.signal };
    document.addEventListener("pointerdown", leave, options);
    document.addEventListener("keydown", leave, options);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      cancel();
      const element = input.current;
      if (element?.getClientRects().length &&
        !element.closest("form")?.contains(document.activeElement)) element.focus();
    });
    return cancel;
  }, [editing, input]);
  return cancel;
}

function MermaidFigureView({ node, editor, selected, getPos, view, onDraftChange, validateFigure }: FigureViewProps) {
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
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(applied.mermaidSource!);
  const [labelDraft, setLabelDraft] = useState(label);
  const enumerator = String(node.attrs.enumerator ?? "");
  const [numberDraft, setNumberDraft] = useState(enumerator);
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
  const hasDraft = (editing || properties) && (draft !== applied.mermaidSource || labelDraft !== label || numberDraft !== enumerator);
  const cancelFocus = useSourceInputFocus(input, editing);
  useSourceInputFocus(sourceButton, properties);
  useEffect(() => () => { request.current++; focusTracking.current?.abort(); }, []);
  useEffect(() => {
    if (!editing && !properties) { setDraft(applied.mermaidSource!); setLabelDraft(label); setNumberDraft(enumerator); }
  }, [editing, properties, applied.mermaidSource, label, enumerator]);
  useEffect(() => {
    onDraftChange?.("Figure", sourcePath, hasDraft);
    return () => onDraftChange?.("Figure", sourcePath, false);
  }, [sourcePath, hasDraft, onDraftChange]);
  function beginEdit() {
    if (!view.editable || editing || properties) return;
    setDraft(applied.mermaidSource!); setLabelDraft(label); setNumberDraft(enumerator); setError(""); setProperties(true);
  }
  const [openOnInsert] = useState(() => view.editable && isNewBlockPath(sourcePath));
  useEffect(() => { if (openOnInsert) setEditing(true); }, [openOnInsert]);
  usePropertyEntry(anchor, beginEdit);
  const cancel = () => {
    request.current++; cancelFocus(); setBusy(false);
    focusTracking.current?.abort(); restoreInput.current = null;
    setDraft(applied.mermaidSource!); setLabelDraft(label); setNumberDraft(enumerator); setError(""); setEditing(false);
    setProperties(false);
    focusBlock(view, getPos);
  };
  const apply = async (openSource = false, returnCaret = true) => {
    if (!view.editable || busy) return;
    const position = getPos();
    const current = typeof position === "number" ? view.state.doc.nodeAt(position) : null;
    if (!current) return;
    const caption = figureAttrs(current).caption;
    const source = normalizeMermaidSource(draft);
    const candidate = { ...figureAttrs(current), mermaidSource: source, caption };
    const local = labelError(labelDraft) ?? figureContentError(candidate) ??
      (validateFigure ? undefined : "Figure validation is unavailable.");
    if (local) { setError(local); input.current?.focus(); return; }
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
      if (latest.attrs.mermaidSource !== source || latest.attrs.label !== labelDraft || latest.attrs.enumerator !== (numberDraft || null))
        view.dispatch(updateFigure(view.state, latestPosition, { mermaidSource: source, label: labelDraft, enumerator: numberDraft || null }));
    }
    catch (cause) { reject(cause instanceof Error ? cause.message : String(cause)); return; }
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
      <PropertyForm kind={kind} testId="mermaid" error={error} busy={busy} onApply={() => void apply()} onCancel={cancel}>
        <label className="form-field"><span>{i18n.t("Mermaid source")}</span>
          <textarea ref={input} className="document-source-input" data-testid="mermaid-source" disabled={busy}
            value={draft} spellCheck={false} onChange={event => { setDraft(event.target.value.replace(/\r\n?/g, "\n")); setError(""); }} />
        </label>
        <MermaidPreview source={draft} draft />
        <label className="form-field"><span>{i18n.t("Label")}</span>
          <Input data-testid="mermaid-label" disabled={busy} value={labelDraft} placeholder={i18n.t("None")}
            onChange={event => { setLabelDraft(event.target.value); setError(""); }} />
        </label>
        <NumberField editor={editor} getPos={getPos} testId="mermaid" value={numberDraft} onChange={value => { setNumberDraft(value); setError(""); }} disabled={busy} />
      </PropertyForm>
    </div> : null : <div contentEditable={false} onMouseDown={selectFigure} onDoubleClick={beginEdit}>
      <MermaidPreview source={applied.mermaidSource!} />
    </div>}
    <figcaption className="caption" data-number={numbered} data-caption-prefix={numbered === undefined ? undefined : captionPrefixText(numbered)}
      onMouseDown={event => handleTextblockMouseDown(event, { editor, node, getPos })}>
      <NodeViewContent data-testid="figure-caption-content" aria-label={i18n.t("Figure caption")}
        data-empty-caption={node.content.size === 0 || undefined} data-placeholder={placeholder} />
    </figcaption>
    {view.editable && !editing && !properties ? <Button className="figure-edit" size="sm" variant="outline" aria-label={i18n.t("Edit figure")}
      contentEditable={false} onClick={beginEdit}>{i18n.t("Edit")}</Button> : null}
    <FigureProperties anchor={anchor} kind={kind} testId="mermaid-property" open={properties} error={error} busy={busy}
      onApply={outside => void apply(false, !outside)} onCancel={cancel}>
      <div className="figure-property-media">
        <div className="figure-property-thumbnail"><MermaidPreview source={applied.mermaidSource!} /></div>
        <Button ref={sourceButton} type="button" size="sm" variant="outline" data-testid="mermaid-edit-source"
          disabled={busy} onClick={() => void apply(true)}>{i18n.t("Edit source")}</Button>
      </div>
      <div className="figure-property-columns">
        <label className="form-field"><span>{i18n.t("Label")}</span>
          <Input data-testid="mermaid-property-label" disabled={busy} value={labelDraft} placeholder={i18n.t("None")}
            onChange={event => { setLabelDraft(event.target.value); setError(""); }} />
        </label>
        <NumberField segmented editor={editor} getPos={getPos} testId="mermaid-property" value={numberDraft}
          onChange={value => { setNumberDraft(value); setError(""); }} disabled={busy} />
      </div>
    </FigureProperties>
  </NodeViewWrapper>;
}

/**
 * Closing properties keeps a text selection inside the block; otherwise it returns a caret just
 * after the block. Use the engine's gap cursor where no adjacent text is available, so the next
 * input cannot replace the whole block. Selection changes add no history or document edits.
 */
function focusBlock(view: ReactNodeViewProps["view"], getPos: ReactNodeViewProps["getPos"]): void {
  // This is explicit property navigation, not native caret normalization on a preview.
  view.dom.contentEditable = String(view.editable);
  const position = getPos();
  const node = typeof position === "number" ? view.state.doc.nodeAt(position) : null;
  const current = view.state.selection;
  if (node && typeof position === "number" && !(current instanceof TextSelection &&
    current.from > position && current.to < position + node.nodeSize)) {
    const $after = view.state.doc.resolve(position + node.nodeSize);
    const selection = view.someProp("createSelectionBetween", create => create(view, $after, $after))
      ?? TextSelection.between($after, $after);
    view.dispatch(view.state.tr.setSelection(selection));
  }
  view.focus();
}

export function resolveFigureSource(imageUrl: string, documentPath?: string | (() => string)): string {
  const locator = typeof documentPath === "function" ? documentPath() : documentPath;
  const encodedPath = figureMediaPath(imageUrl);
  if (encodedPath === undefined) return imageUrl;
  const query = locator ? `?path=${encodeURIComponent(locator)}` : "";
  return `${import.meta.env?.BASE_URL ?? "/"}document/${encodedPath}${query}`;
}

function EquationView({ node, editor, selected, getPos, view, onDraftChange }: ReactNodeViewProps & { onDraftChange?: DraftListener }) {
  useTranslation();
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
  const [numberDraft, setNumberDraft] = useState(enumerator);
  const [error, setError] = useMessageState("");

  const cancelFocus = useSourceInputFocus(latexInput, editing);

  useEffect(() => {
    if (!editing) {
      setDraft(latex);
      setLabelDraft(label); setNumberDraft(enumerator);
    }
  }, [editing, latex, label, enumerator]);

  const [openOnInsert] = useState(() => view.editable && isNewBlockPath(String(node.attrs.sourcePath)) && latex.length === 0);
  useEffect(() => {
    // Open an inserted/remounted empty equation once; clearing an applied value must not reopen Apply.
    if (openOnInsert) beginEdit();
  }, [openOnInsert]);

  const sourcePath = String(node.attrs.sourcePath ?? "");
  const hasUnappliedDraft = isUnappliedEquationDraft(editing, draft, latex) ||
    (editing && (labelDraft !== label || numberDraft !== enumerator));
  useEffect(() => {
    onDraftChange?.("Equation", sourcePath, hasUnappliedDraft);
    return () => onDraftChange?.("Equation", sourcePath, false);
  }, [sourcePath, hasUnappliedDraft, onDraftChange]);

  function beginEdit() {
    if (!view.editable || editing) return;
    setDraft(latex);
    setLabelDraft(label); setNumberDraft(enumerator);
    setError("");
    setEditing(true);
  }
  usePropertyEntry(anchor, beginEdit);
  const cancel = () => {
    cancelFocus();
    setDraft(latex);
    setLabelDraft(label); setNumberDraft(enumerator);
    setError("");
    setEditing(false);
    focusBlock(view, getPos);
  };
  // Core checks the live target/reference context before committing a label rename.
  const apply = () => {
    const invalidLabel = labelError(labelDraft);
    if (invalidLabel) {
      setError(invalidLabel);
      return;
    }
    cancelFocus();
    const position = getPos();
    if (typeof position !== "number") return;
    try { view.dispatch(updateLabelProperties(view.state, position, { latex: draft, label: labelDraft, enumerator: numberDraft || null })); }
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
          <PropertyForm kind={kind} testId="equation" error={error} onApply={apply} onCancel={cancel}>
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
            <label className="form-field">
              <span>{i18n.t("Label")}</span>
              <Input
                data-testid="equation-label"
                value={labelDraft}
                placeholder={i18n.t("None")}
                onChange={(event) => {
                  setLabelDraft(event.target.value);
                  setError("");
                }}
              />
            </label>
            <NumberField editor={editor} getPos={getPos} testId="equation" value={numberDraft} onChange={value => { setNumberDraft(value); setError(""); }} />
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

function InlineMathView({ node, editor, getPos, updateAttributes, selected }: ReactNodeViewProps) {
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
        open={editing} error={error} busy={!canEdit} onApply={apply} onCancel={close}>
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
          <Button type="button" size="sm" variant="outline" data-testid="inline-math-remove" disabled={!canEdit} onClick={remove}>{i18n.t("Remove")}</Button>
      </BlockProperties>
    </NodeViewWrapper>
  );
}

function CodeBlockView({ node, editor, getPos, updateAttributes }: ReactNodeViewProps) {
  useTranslation();
  const editable = useEditorState({ editor, selector: ({ editor: current }) => current.isEditable });
  return (
    <NodeViewWrapper
      as="div"
      className="code-block"
      data-block="code"
      data-source-path={String(node.attrs.sourcePath ?? "")}
    >
      <CodeLanguageInput language={String(node.attrs.language ?? "")} readOnly={!editable}
        onChange={(language) => { if (editor.isEditable) updateAttributes({ language }); }} />
      <pre onMouseDown={event => { if (event.detail === 3) handleTextblockMouseDown(event, { editor, node, getPos }); }}><NodeViewContent<"code"> as="code" /></pre>
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

const DocumentNumbering = Extension.create({
  name: "documentNumbering",
  addGlobalAttributes() { return [{ types: ["doc"], attributes: { title: { default: null, rendered: false }, headingNumbering: { default: null, rendered: false }, referenceTemplates: { default: null, rendered: false }, bibliography: { default: null, rendered: false } } }]; },
  addProseMirrorPlugins() {
    return [new Plugin({ props: { decorations(state) {
      const blocks: { block: string; level?: number }[] = [];
      state.doc.forEach(node => blocks.push({ block: node.type.name, level: Number(node.attrs.level) }));
      const numbers = headingNumbers(blocks, state.doc.attrs.headingNumbering as HeadingNumbering | null);
      const decorations: Decoration[] = [];
      state.doc.forEach((node, pos, index) => { if (numbers[index]) decorations.push(Decoration.node(pos, pos + node.nodeSize, { "data-heading-number": numbers[index]! })); });
      return DecorationSet.create(state.doc, decorations);
    } } })];
  },
});
