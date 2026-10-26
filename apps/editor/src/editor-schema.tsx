import { useBibliography } from "./citation.tsx";
import { updateLabelProperties } from "./label-rename.ts";
import type { BibliographyEvaluation } from "@ieumdoc/core";
import type { UiMessage } from "./ui-message.ts";
import { useMessageState } from "./ui-message.ts";
import { useTranslation } from "react-i18next";
import { i18n } from "./i18n.ts";
import { allocateBlockPath } from "./block-locators.ts";
import { useEditorVisible } from "./editor-visibility.ts";
import { Extension, Node, type Attribute, type Editor, type Extensions } from "@tiptap/core";
import { BulletList, ListItem, ListKeymap, OrderedList } from "@tiptap/extension-list";
import { Code } from "@tiptap/extension-code";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { codeHighlightingPlugin, lowlight } from "./code-highlight.ts";
import { DOMSerializer, type DOMOutputSpec, type Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditorState, type ReactNodeViewProps } from "@tiptap/react";
import { documentInteraction } from "./document-interaction.ts";
import { imageAssets } from "./image-assets.ts";
import { figureMediaPath } from "../shared/figure-media-path.ts";
import { MarkdownInputRules } from "./markdown-input-rules.ts";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useId, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { isAdmonitionVariant, type EditableBlock, type FigureContent, type InlineContent, type ReferenceRole } from "@ieumdoc/core";
import { toTiptapContent } from "./tiptap-inline.ts";
import { figureCaptionContent, figureContentError } from "@ieumdoc/core/figure";
import { headingNumbers, type HeadingNumbering } from "@ieumdoc/core/numbering";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { labelError, labelKey, targetLabelError } from "@ieumdoc/core/label";
import { Input } from "@/components/ui/input.tsx";
import { BlockProperties } from "./block-properties.tsx";
import { ADMONITION_LABELS, admonitionTone, BLOCK_COMMAND_META, updateFigure } from "./block-commands.ts";
import { CrossReference, referenceDisplay, referenceTargets, unresolvedStatus, useBlockNumber, useCaptionNumberText, type ReferenceTarget } from "./cross-reference.tsx";
import { Endnotes, revealReference, useEndnoteNumber } from "./endnotes.ts";
import { DocumentTitle, TITLE_FIXED, titleKept } from "./document-title.ts";
import { FootnoteReference } from "./footnote.tsx";
import { Citation, citationNumbers, citationStatus, citationReadiness } from "./citation.tsx";
import { citationKeys, citationText } from "@ieumdoc/core/citation";
import { renderEquation } from "./equation-render.ts";
import { snapshotBlocksByPath } from "./tiptap-edits.ts";
import {
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
  type TiptapJSON,
} from "./tiptap-document.ts";
import { Button } from "@/components/ui/button.tsx";
import { Notice } from "./ui/primitives.tsx";
import { useOverlayBounds } from "./ui/use-overlay-bounds.ts";
import { TableCellFocus, TableTools } from "./table-tools.tsx";

/** Reports whether the block at a source path holds an unapplied draft. */
export type DraftKind = "Equation" | "Figure" | "Table" | "Section label";
export type DraftListener = (kind: DraftKind, path: string, active: boolean) => void;

/** Core's persistent validation of a Figure Apply: its properties and its label. */
export type FigureValidator = (figure: FigureContent, label: string) => Promise<string | undefined>;
/** An image chosen for a Figure. `discard` removes a copy made for it, once no Figure will use it. */
export type ImageChoice = { path: string; discard?(): void };
/** Lets the user choose an image on the Host for this document; undefined when cancelled. */
export type ImageChooser = (documentPath: string, returnFocus: RefObject<HTMLElement | null>) => Promise<ImageChoice | undefined>;

/** An open Equation form is unsaved when changed, or when its placeholder was never applied. */
export function isUnappliedEquationDraft(editing: boolean, draft: string, latex: string, sourcePath = ""): boolean {
  return editing && (draft !== latex || (isNewBlockPath(sourcePath) && draft.length === 0));
}

/** An open Figure form is unsaved when changed. */
export function isUnappliedFigureDraft(editing: boolean, draft: FigureContent, applied: FigureContent): boolean {
  const changed = draft.imageUrl !== applied.imageUrl || draft.imageAlt !== applied.imageAlt ||
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
      <EndnoteNumber editor={editor} label={label} />
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

const Figure = Node.create<{ documentPath?: string }>({
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
      imageAlt: hiddenAttr(""),
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

function figureNode(documentPath?: string, onDraftChange?: DraftListener, validateFigure?: FigureValidator, chooseImage?: ImageChooser) {
  return Figure.configure({ documentPath }).extend({
    addNodeView() {
      return ReactNodeViewRenderer(createFigureNodeView(documentPath, onDraftChange, validateFigure, chooseImage));
    },
  });
}

function createFigureNodeView(documentPath?: string, onDraftChange?: DraftListener, validateFigure?: FigureValidator, chooseImage?: ImageChooser) {
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
    ];
  },
});

function tableNode(onDraftChange?: DraftListener) {
  return Table.extend({
    addNodeView() { return ReactNodeViewRenderer(props => <TableView {...props} onDraftChange={onDraftChange} />, { contentDOMElementTag: "tbody" }); },
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
  const caption = tableCaption(node.toJSON() as TiptapJSON);
  const bibliography = useBibliography();
  const text = figureCaptionContent(caption).map(item => captionText(item)).join("");
  // References in the caption follow their targets' numbers anywhere in the document.
  const targets = useEditorState({
    editor,
    selector: ({ editor: current }) => current && hasReference(caption) ? JSON.stringify(referenceTargets(current.state.doc)) : "[]",
  });
  const citationLabels = useEditorState({
    editor,
    selector: ({ editor: current }) => current ? JSON.stringify(citationKeys(caption).map(key => [key, citationNumbers(current.state.doc).get(key)])) : "[]",
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ label, caption: text });
  const [error, setError] = useMessageState("");
  const sourcePath = String(node.attrs.sourcePath);
  const dirty = editing && (draft.label !== label || draft.caption !== text);
  useEffect(() => { onDraftChange?.("Table", sourcePath, dirty); return () => onDraftChange?.("Table", sourcePath, false); }, [sourcePath, dirty, onDraftChange]);
  const begin = () => { setDraft({ label, caption: text }); setError(""); setEditing(true); };
  const close = () => { setEditing(false); focusBlock(editor.view, getPos); };
  const apply = () => {
    const invalid: UiMessage | undefined = labelError(draft.label) || (/^[\s]|[\s]$|[\r\n]/.test(draft.caption) ? { key: "Caption must be a single line without surrounding spaces." } : undefined);
    if (invalid) { setError(invalid); return; }
    const position = getPos();
    if (typeof position !== "number") return;
    try {
      editor.view.dispatch(updateLabelProperties(editor.state, position, { label: draft.label, caption: draft.caption === text ? caption : draft.caption ? [{ kind: "text", text: draft.caption }] : [] }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return; }
    close();
  };
  return <NodeViewWrapper className="table-block" data-block="table" data-table-block="" data-source-path={sourcePath}
    data-selected={selected ? "true" : "false"} data-editing={editing ? "true" : "false"}>
    <p ref={anchor} className="block-kind block-metadata" contentEditable={false}>{[kind, label].filter(Boolean).join(" · ")}</p>
    <div className="table-scroll"><div ref={grid} className="table-grid">
      <NodeViewContent<"table"> as="table" className="table" />
      <TableTools editor={editor} node={node} getPos={getPos} grid={grid} rowLayer={rowLayer} onEdit={begin} hidden={editing} />
    </div></div>
    <div ref={rowLayer} className="table-row-layer" contentEditable={false} />
    {caption.length > 0 ? <div className="caption" data-testid="table-caption" data-number={numbered} contentEditable={false}
      dangerouslySetInnerHTML={{ __html: tableCaptionHTML(editor.schema, caption, JSON.parse(targets ?? "[]") as ReferenceTarget[], new Map(JSON.parse(citationLabels ?? "[]")), bibliography) }} /> : null}
    <BlockProperties anchor={anchor} initialFocus={input} kind={kind} testId="table" open={editing}
      error={error}
      onApply={apply} onCancel={close}>
      <label className="form-label" htmlFor={`table-caption-${formId}`}>{i18n.t("Caption")}</label>
      <Input ref={input} id={`table-caption-${formId}`} data-testid="table-caption-input" value={draft.caption} onChange={event => setDraft({ ...draft, caption: event.target.value })} />
      <label className="form-label" htmlFor={`table-label-${formId}`}>{i18n.t("Label")}</label>
      <Input id={`table-label-${formId}`} data-testid="table-label" value={draft.label} onChange={event => setDraft({ ...draft, label: event.target.value })} />
    </BlockProperties>
  </NodeViewWrapper>;
}

/**
 * A table caption as display HTML, from the editor's own schema (rebuilding one from its resolved
 * extensions duplicates them). Inline math and references, which the schema serializes as empty
 * spans for their NodeViews, show the same KaTeX and reference text as in the document. Display
 * only: the caption is edited in the table's properties.
 */
function tableCaptionHTML(schema: Schema, caption: InlineContent[], targets: ReferenceTarget[], citations: ReadonlyMap<string, number>, bibliography?: BibliographyEvaluation): string {
  const container = document.createElement("div");
  container.append(DOMSerializer.fromSchema(schema).serializeFragment(schema.nodeFromJSON(toTiptapContent(caption)).content));
  for (const math of container.querySelectorAll<HTMLElement>("span[data-inline-math]")) {
    const value = math.dataset.value ?? "";
    const rendered = renderEquation(value, false);
    const shown = document.createElement("span");
    shown.className = rendered.html ? "inline-math-rendered" : "inline-math-rendered inline-math-error";
    shown.title = rendered.error ?? value;
    if (rendered.html) shown.innerHTML = rendered.html;
    else shown.textContent = `$${value}$`;
    math.classList.add("inline-math");
    math.append(shown);
  }
  for (const reference of container.querySelectorAll<HTMLElement>("span[data-cross-reference]")) {
    const role = (reference.dataset.role ?? "eq") as ReferenceRole;
    const label = reference.dataset.label ?? "";
    const { text, resolved, kindName } = referenceDisplay(targets, role, label);
    const chip = document.createElement("span");
    chip.className = "cross-reference-chip";
    chip.title = resolved ? role === "ref" ? `${kindName} ${label}` : `${text} · ${label}` : unresolvedStatus(role, label);
    chip.setAttribute("aria-label", chip.title);
    chip.textContent = text;
    reference.classList.add("cross-reference");
    reference.dataset.resolved = String(resolved);
    reference.append(chip);
  }
  for (const citation of container.querySelectorAll<HTMLElement>("span[data-citation]")) {
    const keys = JSON.parse(citation.dataset.keys ?? "[]") as string[];
    const text = citationText(keys, citations);
    const chip = document.createElement("span");
    chip.className = "cross-reference-chip";
    chip.setAttribute("aria-label", chip.title);
    chip.textContent = text;
    chip.title = citationStatus(keys, text, bibliography);
    chip.setAttribute("aria-label", chip.title);
    citation.classList.add("cross-reference", "citation");
    citation.dataset.readiness = citationReadiness(keys, bibliography);
    citation.append(chip);
  }
  return container.innerHTML;
}

function hasReference(content: InlineContent[]): boolean {
  return content.some(item => item.kind === "reference" || ("children" in item && hasReference(item.children)));
}

function captionText(item: InlineContent): string {
  if ("children" in item) return item.children.map(captionText).join("");
  if (item.kind === "text") return item.text;
  if ("value" in item) return item.value;
  if ("label" in item) return item.label;
  if (item.kind === "citation") return item.keys.join(", ");
  return "";
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
  documentPath?: string,
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
    DocumentTitle,
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
    TableCell,
    LabelTarget.configure({ onDraftChange }),
    InlineMath,
    CrossReference,
    FootnoteReference,
    Citation,
    MarkdownInputRules,
  ];
}

export function createEditorExtensions(
  baseline: TiptapJSON,
  onReject: (reason?: UiMessage) => void,
  onDraftChange?: DraftListener,
  documentPath?: string,
  validateFigure?: FigureValidator,
  onAssetPendingChange?: (active: boolean) => void,
  onAssetError?: (reason: string) => void,
  hasActiveDraft?: () => boolean,
  chooseImage?: ImageChooser,
  initialDeletedPaths: readonly string[] = [],
): Extensions {
  return [...editorExtensions(onDraftChange, documentPath, validateFigure, hasActiveDraft, chooseImage),
    ...(documentPath ? [imageAssets({ documentPath, reject: onAssetError ?? onReject, pending: onAssetPendingChange })] : []),
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
      // The title stays first (#255): nothing moves it or goes above it.
      if (!titleKept(transaction.before, transaction.doc)) {
        onReject({ key: TITLE_FIXED });
        return false;
      }
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
      <NodeViewContent className="admonition-body" data-testid="admonition-body" />
    </NodeViewWrapper>
  );
}

function figureAttrs(node: ProseMirrorNode): FigureContent {
  return figureContent(node.toJSON() as TiptapJSON);
}

function FigureView({ node, editor, selected, getPos, view, documentPath, onDraftChange, validateFigure, chooseImage }: ReactNodeViewProps & { documentPath?: string; onDraftChange?: DraftListener; validateFigure?: FigureValidator; chooseImage?: ImageChooser }) {
  useTranslation();
  // Core's computed label prefixes the caption; it is never saved.
  const numbered = useCaptionNumberText(editor, getPos, "figure");
  const anchor = useRef<HTMLParagraphElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  // A copy the chooser made for this form; discarded unless Apply puts it in the Figure.
  const copied = useRef<ImageChoice | undefined>(undefined);
  const [choosing, setChoosing] = useState(false);
  const applied = figureAttrs(node);
  const src = resolveFigureSource(applied.imageUrl, documentPath);
  const [failedSource, setFailedSource] = useState<string>();
  const imageFailed = !!src && failedSource === src;
  const label = String(node.attrs.label ?? "");
  const sourcePath = String(node.attrs.sourcePath ?? "");
  const editableFigure = view.editable;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(applied);
  const [labelDraft, setLabelDraft] = useState(label);
  const [error, setError] = useMessageState("");
  const [validating, setValidating] = useState(false);
  const pendingRequest = useRef(0);
  const captionChanged = useRef(false);
  const captionKey = JSON.stringify(applied.caption);
  const hasUnappliedDraft = isUnappliedFigureDraft(editing,
    { ...draft, caption: captionChanged.current ? draft.caption : applied.caption }, applied) ||
    (editing && labelDraft !== label);

  useEffect(() => {
    if (!editing) {
      setDraft(applied);
      setLabelDraft(label);
    }
  }, [editing, applied.imageUrl, applied.imageAlt, captionKey, label]);

  useEffect(() => {
    onDraftChange?.("Figure", sourcePath, hasUnappliedDraft);
    return () => onDraftChange?.("Figure", sourcePath, false);
  }, [sourcePath, hasUnappliedDraft, onDraftChange]);

  function beginEdit() {
    if (!editableFigure || editing) return;
    captionChanged.current = false;
    setDraft(applied);
    setLabelDraft(label);
    setError("");
    setEditing(true);
    // After the form renders.
    requestAnimationFrame(() => {
      const input = imageInput.current;
      if (input && input.getClientRects().length && !input.closest('[data-testid="figure-editor"]')?.contains(document.activeElement)) input.focus();
    });
  }
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
    setLabelDraft(label);
    setError("");
    setEditing(false);
    focusBlock(view, getPos);
  };
  // Apply commits only a value Core accepts as persistent; an invalid draft keeps the form open.
  // Core checks the live target/reference context before committing a label rename.
  const apply = async () => {
    const position = getPos();
    const current = typeof position === "number" ? view.state.doc.nodeAt(position) : null;
    if (!current) return;
    const liveCaption = figureAttrs(current).caption;
    const candidate = { ...draft, caption: captionChanged.current ? draft.caption : liveCaption };
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
    const { caption, ...attributes } = candidate;
    const captionContent = view.state.schema.nodeFromJSON({ type: "figure", content: paragraphContent(figureCaptionContent(caption)) }).content;
    // Validation may finish after the user has moved on; only focus left in this form returns.
    const active = document.activeElement;
    const returnFocus = !view.dom.closest("[hidden]") &&
      (active === document.body || Boolean(imageInput.current?.closest("form")?.contains(active)));
    // The copy passes to the document before dispatch, which may replace this view.
    const copy = copied.current;
    copied.current = undefined;
    // One undo step: undo returns the form's previous value.
    try {
      view.dispatch(updateFigure(view.state, latestPosition, { ...attributes, label: nextLabel },
        captionContent.eq(latest.content) ? undefined : captionContent));
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
        <p className="draft-status" role="status" data-testid="figure-draft-status" contentEditable={false}>{i18n.t("Unapplied changes are not saved. Apply to include them, or Cancel.")}</p>
      ) : null}
      {src ? <img key={src} src={src} alt={applied.imageAlt} hidden={imageFailed} data-testid="figure-image" contentEditable={false} onMouseDown={selectFigure} onDoubleClick={beginEdit}
        onError={() => setFailedSource(src)} onLoad={() => setFailedSource(undefined)} /> : null}
      {imageFailed ? (
        <Notice tone="error" className="figure-image-error" data-testid="figure-image-error" contentEditable={false} onMouseDown={selectFigure} onDoubleClick={beginEdit}>{i18n.t("Image could not be loaded. Check the image path or URL.")}</Notice>
      ) : null}
      {editableFigure && !src ? (
        <div className="figure-no-content" data-testid="figure-no-content" contentEditable={false} onMouseDown={selectFigure} onDoubleClick={beginEdit}>{i18n.t("No content yet")}</div>
      ) : null}
      <figcaption className="caption" data-number={numbered}><NodeViewContent data-testid="figure-caption-content" aria-label={i18n.t("Figure caption")} /></figcaption>
      {editableFigure && !editing ? (
        <Button className="figure-edit" size="sm" variant="outline" aria-label={i18n.t("Edit figure")} contentEditable={false} onClick={beginEdit}>{i18n.t("Edit")}</Button>
      ) : null}
      <BlockProperties
        anchor={anchor}
        kind={numbered ?? i18n.t("Figure")}
        testId="figure"
        open={editing}
        error={error}
        busy={validating}
        onApply={() => void apply()}
        onCancel={cancel}
      >
        {chooseImage && documentPath ? (
          <div className="figure-image-field">
            {field("imageUrl", i18n.t("Image"), "figure-image-url")}
            <Button ref={chooseButton} type="button" variant="outline" disabled={validating || choosing} onClick={() => void pickImage()}>{i18n.t("Choose…")}</Button>
          </div>
        ) : field("imageUrl", i18n.t("Image"), "figure-image-url")}
        {field("imageAlt", i18n.t("Alt text"), "figure-alt")}
        {typeof draft.caption === "string" && typeof applied.caption === "string" ? field("caption", i18n.t("Caption"), "figure-caption")
          : <p className="block-popover-note">{i18n.t("Edit the formatted caption directly below the image.")}</p>}
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
      </BlockProperties>
    </NodeViewWrapper>
  );
}

/**
 * Closing properties keeps a text selection inside the block; otherwise it returns a caret just
 * after the block. Use the engine's gap cursor where no adjacent text is available, so the next
 * input cannot replace the whole block. Selection changes add no history or document edits.
 */
function focusBlock(view: ReactNodeViewProps["view"], getPos: ReactNodeViewProps["getPos"]): void {
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
  const encodedPath = figureMediaPath(imageUrl);
  if (encodedPath === undefined) return imageUrl;
  const query = documentPath ? `?path=${encodeURIComponent(documentPath)}` : "";
  return `${import.meta.env?.BASE_URL ?? "/"}document/${encodedPath}${query}`;
}

function EquationView({ node, editor, selected, deleteNode, getPos, view, onDraftChange }: ReactNodeViewProps & { onDraftChange?: DraftListener }) {
  useTranslation();
  const label = String(node.attrs.label ?? "");
  const number = useBlockNumber(editor, getPos, "equation");
  const kind = number === undefined ? i18n.t("Equation") : `Equation (${number})`;
  const latex = String(node.attrs.latex ?? "");
  const anchor = useRef<HTMLParagraphElement>(null);
  const latexInput = useRef<HTMLTextAreaElement>(null);
  const focusFrame = useRef<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(latex);
  const [labelDraft, setLabelDraft] = useState(label);
  const [error, setError] = useMessageState("");

  const cancelFocus = () => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = null;
  };
  useEffect(() => cancelFocus, []);

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
    if (!view.editable || editing) return;
    setDraft(latex);
    setLabelDraft(label);
    setError("");
    setEditing(true);
    // After the panel renders and after an insert command refocuses the editor.
    cancelFocus();
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      const input = latexInput.current;
      if (input && input.getClientRects().length && !input.closest('[data-testid="equation-editor"]')?.contains(document.activeElement)) input.focus();
    });
  }
  const cancel = () => {
    cancelFocus();
    const isUnappliedNewEquation = isNewBlockPath(sourcePath) && latex.length === 0;
    if (isUnappliedNewEquation) removeUnappliedBlock(view, getPos, node, deleteNode);
    setDraft(latex);
    setLabelDraft(label);
    setError("");
    setEditing(false);
    if (isUnappliedNewEquation) view.focus();
    else focusBlock(view, getPos);
  };
  // Core checks the live target/reference context before committing a label rename.
  const apply = () => {
    if (draft.length === 0) {
      setError({ key: "Equation LaTeX cannot be empty." });
      return;
    }
    const invalidLabel = labelError(labelDraft);
    if (invalidLabel) {
      setError(invalidLabel);
      return;
    }
    cancelFocus();
    const position = getPos();
    if (typeof position !== "number") return;
    try { view.dispatch(updateLabelProperties(view.state, position, { latex: draft, label: labelDraft })); }
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
      {/* The computed number sits right of the formula, as MyST renders it; it is never saved. */}
      <div className="equation-row">
        <EquationFormula className="equation-math" latex={latex} testId="equation-preview" onDoubleClick={beginEdit} />
        {number === undefined ? null : <span className="equation-number" data-testid="equation-number">({number})</span>}
      </div>
      {view.editable && !editing ? (
        <Button className="equation-edit" size="sm" variant="outline" onClick={beginEdit}>{i18n.t("Edit")}</Button>
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
            aria-label={i18n.t("Equation LaTeX")}
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
      </BlockProperties>
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
  const visible = useEditorVisible();
  const value = String(node.attrs.value ?? "");
  const [editing, setEditing] = useState(false);
  const bounds = useOverlayBounds<HTMLFormElement>(editing);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useMessageState("");
  const rendered = renderEquation(value, false);
  const open = () => {
    if (!editor.isEditable) return;
    setDraft(value);
    setError("");
    setEditing(true);
  };
  const close = () => {
    setEditing(false);
    focusBlock(editor.view, getPos);
  };
  const apply = () => {
    // Core validates the source on Save; only an empty or multi-line source is refused here.
    if (draft.length === 0) return setError({ key: "Enter LaTeX, or use Remove." });
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
      {editing && visible ? (
        <form
          ref={bounds}
          className="inline-math-form selection-toolbar"
          contentEditable={false}
          role="dialog"
          aria-label={i18n.t("Inline math")}
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
          <label className="form-label" htmlFor={formId}>LaTeX</label>
          <Input
            id={formId}
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
          <Button size="sm" type="submit" data-testid="inline-math-apply">{i18n.t("Apply")}</Button>
          <Button size="sm" variant="outline" data-testid="inline-math-remove" onClick={remove}>{i18n.t("Remove")}</Button>
          {error ? <span className="link-form-error" role="alert">{error}</span> : null}
        </form>
      ) : null}
    </NodeViewWrapper>
  );
}

function CodeBlockView({ node, editor, updateAttributes }: ReactNodeViewProps) {
  useTranslation();
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
        aria-label={i18n.t("Code language")}
        placeholder={i18n.t("Language")}
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
  addGlobalAttributes() { return [{ types: ["doc"], attributes: { headingNumbering: { default: null, rendered: false }, referenceTemplates: { default: null, rendered: false }, bibliography: { default: null, rendered: false } } }]; },
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
