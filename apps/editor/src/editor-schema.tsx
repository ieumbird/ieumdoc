import { Extension, Node, type Attribute, type Extensions } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";
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

export type EquationDraftListener = (key: string, active: boolean) => void;

/** An Equation draft blocks saving only while the editor is open and the draft differs from the applied LaTeX. */
export function isUnappliedEquationDraft(editing: boolean, draft: string, latex: string): boolean {
  return editing && draft !== latex;
}

const hiddenAttr = (defaultValue: string | number = ""): Attribute => ({
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
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ variant: hiddenAttr("note"), text: hiddenAttr("") });
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

function figureNode(documentPath?: string) {
  return Figure.extend({
    addNodeView() {
      return ReactNodeViewRenderer(createFigureNodeView(documentPath));
    },
  });
}

function createFigureNodeView(documentPath?: string) {
  return function FigureAssetNodeView(props: ReactNodeViewProps) {
    return <FigureView {...props} documentPath={documentPath} />;
  };
}

function createEquationNodeView(onDraftChange?: EquationDraftListener) {
  return function EquationDraftNodeView(props: ReactNodeViewProps) {
    return <EquationView {...props} onDraftChange={onDraftChange} />;
  };
}

const ReadonlyTable = Node.create({
  name: "readonlyTable",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return blockAttrs({ rows: hiddenAttr("[]") });
  },
  parseHTML() {
    return [{ tag: "div[data-readonly-table]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-readonly-table": "" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TableView);
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

// Tiptap's default hard-break command keeps marks for following text only.
// Preserve their coverage on the break itself as required by Core InlineContent.
const ParagraphHardBreak = Extension.create({
  name: "paragraphHardBreak",
  priority: 110,
  addKeyboardShortcuts() {
    const insert = () => {
      const { state } = this.editor;
      if (state.selection.$from.parent.type.name !== "paragraph") return true;
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
      link: false,
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
    figureNode(documentPath),
    equationNode(onEquationDraftChange),
    ReadonlyTable,
    UnsupportedBlock,
  ];
}

export function createEditorExtensions(
  baseline: TiptapJSON | (() => TiptapJSON),
  onReject: () => void,
  onEquationDraftChange?: EquationDraftListener,
  documentPath?: string,
): Extensions {
  return [...editorExtensions(onEquationDraftChange, documentPath), structureGuard(baseline, onReject)];
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
  return (
    <NodeViewWrapper
      as="aside"
      className={`admonition admonition-${variant}`}
      data-block="admonition"
      data-variant={variant}
      data-source-path={String(node.attrs.sourcePath ?? "")}
      data-readonly="true"
      contentEditable={false}
    >
      <p className="block-kind">Admonition: {variant}</p>
      <p className="admonition-body">{String(node.attrs.text ?? "")}</p>
    </NodeViewWrapper>
  );
}

function FigureView({ node, selected, documentPath }: ReactNodeViewProps & { documentPath?: string }) {
  const anchor = useRef<HTMLParagraphElement>(null);
  const imageUrl = String(node.attrs.imageUrl ?? "");
  const src = resolveFigureSource(imageUrl, documentPath);
  const label = String(node.attrs.label ?? "");
  const properties: [string, string][] = [
    ["Label", label],
    ["Image", imageUrl],
    ["Alt text", String(node.attrs.imageAlt ?? "")],
    ["Caption", String(node.attrs.caption ?? "")],
  ];
  return (
    <NodeViewWrapper
      as="figure"
      className="figure"
      data-block="figure"
      data-source-path={String(node.attrs.sourcePath ?? "")}
      data-readonly="true"
      contentEditable={false}
    >
      <p ref={anchor} className="block-kind">{label ? `Figure · ${label}` : "Figure"}</p>
      {src ? <img src={src} alt={String(node.attrs.imageAlt ?? "")} /> : null}
      <figcaption className="caption">{String(node.attrs.caption ?? "")}</figcaption>
      <Popover open={selected} onOpenChange={() => {}}>
        <PopoverContent
          anchor={anchor}
          side="bottom"
          align="start"
          // The popover only annotates the still-selected block; keep focus (and so
          // keyboard interaction, e.g. Delete) on the editor instead of the popup.
          initialFocus={false}
          finalFocus={false}
          aria-label="Figure properties"
          data-testid="figure-properties"
          className="figure-properties"
        >
          <dl>
            {properties.map(([name, value]) => (
              <div key={name} className="figure-property">
                <dt>{name}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
          </dl>
          {/* No Core operation updates Figure properties yet. */}
          <p className="block-popover-note">Figure properties are read-only in this version.</p>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
}

export function resolveFigureSource(imageUrl: string, documentPath?: string): string {
  const isRelative = imageUrl.startsWith("./") || imageUrl.startsWith("../");
  if (!isRelative) return imageUrl;
  const relativePath = imageUrl.startsWith("./") ? imageUrl.slice(2) : imageUrl;
  const encodedPath = relativePath.split("/").map(encodeURIComponent).join("/");
  const query = documentPath ? `?path=${encodeURIComponent(documentPath)}` : "";
  return `/document/${encodedPath}${query}`;
}

function EquationView({ node, selected, updateAttributes, onDraftChange }: ReactNodeViewProps & { onDraftChange?: EquationDraftListener }) {
  const label = String(node.attrs.label ?? "");
  const latex = String(node.attrs.latex ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(latex);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) setDraft(latex);
  }, [editing, latex]);

  useEffect(() => {
    if (selected && !editing) {
      setDraft(latex);
      setError("");
      setEditing(true);
    }
  }, [selected]);

  const sourcePath = String(node.attrs.sourcePath ?? "");
  const hasUnappliedDraft = isUnappliedEquationDraft(editing, draft, latex);
  useEffect(() => {
    onDraftChange?.(sourcePath, hasUnappliedDraft);
    return () => onDraftChange?.(sourcePath, false);
  }, [sourcePath, hasUnappliedDraft, onDraftChange]);

  const beginEdit = () => {
    setDraft(latex);
    setError("");
    setEditing(true);
  };
  const cancel = () => {
    setDraft(latex);
    setError("");
    setEditing(false);
  };
  const apply = () => {
    if (draft.length === 0) {
      setError("Equation LaTeX cannot be empty.");
      return;
    }
    updateAttributes({ latex: draft });
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

function TableView({ node }: ReactNodeViewProps) {
  const rows = parseRows(node.attrs.rows);
  const [header, ...body] = rows;
  return (
    <NodeViewWrapper
      className="table-block"
      data-block="table"
      data-source-path={String(node.attrs.sourcePath ?? "")}
      data-readonly="true"
      contentEditable={false}
    >
      <p className="block-kind">Table</p>
      <table className="table">
        {header ? (
          <thead>
            <tr>
              {header.map((cell, index) => (
                <th key={index}>{cell.text}</th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => (
                <td key={index}>{cell.text}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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

function parseRows(value: unknown): { text: string; header: boolean }[][] {
  if (typeof value !== "string" || value.length === 0) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) => {
      if (!Array.isArray(row)) return [];
      return row.map((cell) => {
        if (!cell || typeof cell !== "object") return { text: "", header: false };
        const record = cell as { text?: unknown; header?: unknown };
        return {
          text: typeof record.text === "string" ? record.text : "",
          header: record.header === true,
        };
      });
    });
  } catch {
    return [];
  }
}
