import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { InlineContent } from "@ieumdoc/core";
import { fromTiptapContent, toTiptapContent } from "./tiptap-inline.ts";

type ParagraphEditorProps = {
  content: InlineContent[];
  onChange: (content: InlineContent[]) => void;
  onError: (cause: unknown) => void;
};

export function ParagraphEditor({ content, onChange, onError }: ParagraphEditorProps) {
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
        heading: false,
        horizontalRule: false,
        link: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
        trailingNode: false,
        underline: false,
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
      try {
        onChange(fromTiptapContent(next.getJSON()));
      } catch (cause) {
        onError(cause);
      }
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
