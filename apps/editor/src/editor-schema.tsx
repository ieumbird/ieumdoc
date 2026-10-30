import type { UiMessage } from "./ui-message.ts";
import { i18n } from "./i18n.ts";
import { allocateBlockPath } from "./block-locators.ts";
import { Extension, Node, type Attribute, type Extensions, type NodeViewRenderer } from "@tiptap/core";
import { BulletList, ListItem, ListKeymap, OrderedList } from "@tiptap/extension-list";
import { Code } from "@tiptap/extension-code";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { codeHighlightingPlugin, lowlight } from "./code-highlight.ts";
import { type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { documentInteraction } from "./document-interaction.ts";
import { imageAssets } from "./image-assets.ts";
import { ImageRenames } from "./image-rename.ts";
import { MarkdownInputRules } from "./markdown-input-rules.ts";
import StarterKit from "@tiptap/starter-kit";
import { headingNumbers, type HeadingNumbering } from "@ieumdoc/core/numbering";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { CrossReference } from "./cross-reference.tsx";
import { Endnotes } from "./endnotes.ts";
import { FootnoteReference } from "./footnote.tsx";
import { Citation } from "./citation.tsx";
import { snapshotBlocksByPath } from "./tiptap-edits.ts";
import {
  DELETED_PATHS_ATTR,
  isNewBlockPath,
  isSupportedDocumentChange,
  normalizeEngineDocument,
  TABLE_CELL_SOURCE_ATTR,
  type TiptapJSON,
} from "./tiptap-document.ts";
import { TableCellFocus } from "./table-tools.tsx";
import { AdmonitionView } from "./node-views/admonition-view.tsx";
import { CodeBlockView } from "./node-views/code-block-view.tsx";
import { createEquationNodeView } from "./node-views/equation-view.tsx";
import { createFigureNodeView, FigureView, resolveFigureSource, type FigureValidator, type ImageChooser } from "./node-views/figure-view.tsx";
import { FootnoteDefinitionView } from "./node-views/footnote-definition-view.tsx";
import { InlineMathView } from "./node-views/inline-math-view.tsx";
import { LabelTargetView } from "./node-views/label-target-view.tsx";
import { TableCaptionView, TableView } from "./node-views/table-view.tsx";
import { EDIT_PROPERTIES, type DraftListener } from "./node-views/shared.ts";

export type { DraftKind, DraftListener } from "./node-views/shared.ts";
export { captionPlaceholderVisible } from "./node-views/shared.ts";
export { isUnappliedEquationDraft } from "./node-views/equation-view.tsx";
export { DocumentPathContext, isUnappliedFigureDraft, resolveFigureSource } from "./node-views/figure-view.tsx";
export type { FigureValidator, ImageChoice, ImageChooser } from "./node-views/figure-view.tsx";

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

function tableNode(onDraftChange?: DraftListener) {
  return Table.extend({
    addNodeView() { return ReactNodeViewRenderer(props => <TableView {...props} onDraftChange={onDraftChange} />, { contentDOMElementTag: "table" }); },
  });
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
  hasActiveDraft?: (sourcePath?: string) => boolean,
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
  hasActiveDraft?: (sourcePath?: string) => boolean,
  chooseImage?: ImageChooser,
  initialDeletedPaths: readonly string[] = [],
  onAssetChange?: (path: string) => void,
): Extensions {
  return [...editorExtensions(onDraftChange, documentPath, validateFigure, hasActiveDraft, chooseImage),
    ...(documentPath ? [imageAssets({ documentPath, reject: onAssetError ?? onReject, pending: onAssetPendingChange, changed: onAssetChange, hasActiveDraft })] : []),
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
