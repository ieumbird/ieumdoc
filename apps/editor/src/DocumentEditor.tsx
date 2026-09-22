import { forwardRef, useImperativeHandle } from "react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import type { EditableDocument } from "@ieumdoc/core";
import { createEditorExtensions } from "./editor-schema.tsx";
import { toTiptapDocument, type TiptapJSON } from "./tiptap-document.ts";

export type DocumentEditorHandle = {
  getDocument(): TiptapJSON;
};

type DocumentEditorProps = {
  document: EditableDocument;
  onStructuralReject: () => void;
};

export const DocumentEditor = forwardRef<DocumentEditorHandle, DocumentEditorProps>(function DocumentEditor(
  { document, onStructuralReject },
  ref,
) {
  const projection = toTiptapDocument(document);
  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    extensions: createEditorExtensions(projection, onStructuralReject),
    content: projection,
    editorProps: {
      attributes: {
        class: "document-editor",
        spellcheck: "false",
      },
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      getDocument() {
        if (!editor) {
          throw new Error("Editor is not ready");
        }
        return editor.getJSON() as TiptapJSON;
      },
    }),
    [editor],
  );

  if (!editor) {
    return null;
  }

  return (
    <div>
      <div className="format-bar">
        <button
          type="button"
          aria-label="Bold"
          aria-pressed={editor.isActive("bold")}
          className={editor.isActive("bold") ? "active" : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleMark(editor, "bold", onStructuralReject)}
        >
          B
        </button>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={editor.isActive("italic")}
          className={editor.isActive("italic") ? "active" : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleMark(editor, "italic", onStructuralReject)}
        >
          I
        </button>
      </div>
      <article className="document" data-testid="document-editor">
        <EditorContent editor={editor} />
      </article>
    </div>
  );
});

function toggleMark(editor: Editor, mark: "bold" | "italic", onReject: () => void): void {
  if (!editor.isActive("paragraph")) {
    onReject();
    return;
  }
  const chain = editor.chain().focus();
  const applied = (mark === "bold" ? chain.toggleBold() : chain.toggleItalic()).run();
  if (!applied) onReject();
}
