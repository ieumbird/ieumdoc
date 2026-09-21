import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { EditableDocument } from "@ieumdoc/core";
import { EquationNode } from "./EquationNode.ts";
import { fromTiptapDocument, toTiptapDocument } from "./single-editor-adapter.ts";

type BlockType = "paragraph" | "heading" | "equation";

type SingleDocumentEditorProps = {
  document: EditableDocument;
  onChange: (document: EditableDocument) => void;
  onError: (cause: unknown) => void;
};

export function SingleDocumentEditor({ document, onChange, onError }: SingleDocumentEditorProps) {
  const editor = useEditor({
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        dropcursor: false,
        gapcursor: false,
        hardBreak: false,
        horizontalRule: false,
        link: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
        trailingNode: false,
        underline: false,
      }),
      EquationNode,
    ],
    content: toTiptapDocument(document),
    editorProps: {
      attributes: { class: "single-document-tiptap" },
    },
    onUpdate: ({ editor: next }) => {
      try {
        onChange(fromTiptapDocument(next.getJSON()));
      } catch (cause) {
        onError(cause);
      }
    },
  });

  if (!editor) return null;

  return (
    <section className="single-editor" data-testid="single-editor">
      <div className="block-toolbar" aria-label="Block actions">
        <span className="block-toolbar-label">+ Add Block</span>
        <button type="button" onClick={() => insertBlock(editor, "paragraph")}>
          Paragraph
        </button>
        <button type="button" onClick={() => insertBlock(editor, "heading")}>
          Heading
        </button>
        <button type="button" onClick={() => insertBlock(editor, "equation")}>
          Equation
        </button>
        <button
          type="button"
          className="delete-block"
          disabled={editor.state.doc.childCount <= 1}
          onClick={() => deleteSelectedBlock(editor)}
        >
          Delete selected block
        </button>
      </div>
      <div className="format-bar" aria-label="Inline formatting">
        <button
          type="button"
          aria-label="Bold"
          aria-pressed={editor.isActive("bold")}
          className={editor.isActive("bold") ? "active" : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </button>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={editor.isActive("italic")}
          className={editor.isActive("italic") ? "active" : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </button>
        <span className="selection-hint">One editor · {selectedBlockLabel(editor)}</span>
      </div>
      <EditorContent editor={editor} />
    </section>
  );
}

function insertBlock(editor: NonNullable<ReturnType<typeof useEditor>>, type: BlockType): void {
  const index = selectedBlockIndex(editor);
  const position = positionAfterBlock(editor, index);
  const content = type === "paragraph"
    ? { type: "paragraph", content: [{ type: "text", text: "New paragraph" }] }
    : type === "heading"
      ? { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "New heading" }] }
      : { type: "equation", attrs: { latex: "i* = P* / Vrms", label: "" } };
  editor.chain().focus().insertContentAt(position, content).run();
}

function deleteSelectedBlock(editor: NonNullable<ReturnType<typeof useEditor>>): void {
  if (editor.state.doc.childCount <= 1) return;
  const index = selectedBlockIndex(editor);
  const start = positionBeforeBlock(editor, index);
  const end = start + editor.state.doc.child(index).nodeSize;
  editor.chain().focus().deleteRange({ from: start, to: end }).run();
}

function selectedBlockIndex(editor: NonNullable<ReturnType<typeof useEditor>>): number {
  const selection = editor.state.selection;
  const index = selection.$from.index(0);
  return Math.min(index, editor.state.doc.childCount - 1);
}

function positionBeforeBlock(editor: NonNullable<ReturnType<typeof useEditor>>, index: number): number {
  let position = 0;
  for (let current = 0; current < index; current += 1) {
    position += editor.state.doc.child(current).nodeSize;
  }
  return position;
}

function positionAfterBlock(editor: NonNullable<ReturnType<typeof useEditor>>, index: number): number {
  return positionBeforeBlock(editor, index) + editor.state.doc.child(index).nodeSize;
}

function selectedBlockLabel(editor: NonNullable<ReturnType<typeof useEditor>>): string {
  const block = editor.state.doc.child(selectedBlockIndex(editor));
  return block.type.name;
}
