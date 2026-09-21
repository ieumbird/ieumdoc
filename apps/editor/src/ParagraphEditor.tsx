import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { InlineContent } from "@ieumdoc/core";
import { fromTiptapContent, toTiptapContent } from "./tiptap-inline.ts";

type ParagraphEditorProps = {
  content: InlineContent[];
  onChange: (content: InlineContent[]) => void;
};

export function ParagraphEditor({ content, onChange }: ParagraphEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        hardBreak: false,
        strike: false,
        dropcursor: false,
        gapcursor: false,
      }),
    ],
    content: toTiptapContent(content),
    editorProps: {
      attributes: { class: "paragraph-tiptap" },
      handleKeyDown(_view, event) {
        if (event.key === "Enter") {
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: next }) => {
      onChange(fromTiptapContent(next.getJSON()));
    },
  });

  if (!editor) {
    return null;
  }

  return (
    <div className="rich-paragraph">
      <div className="format-bar">
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
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
