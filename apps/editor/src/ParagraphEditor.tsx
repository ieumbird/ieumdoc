import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { InlineContent } from "@ieumdoc/core";
import { type FocusEdge } from "./editor-focus.ts";
import { splitInlineContent } from "./inline-edit.ts";
import { fromTiptapContent, toTiptapContent, type TiptapJSON } from "./tiptap-inline.ts";

type ParagraphEditorProps = {
  content: InlineContent[];
  testId: string;
  autoFocus: FocusEdge | null;
  onChange: (content: InlineContent[]) => void;
  onError: (cause: unknown) => void;
  onEnter: (before: InlineContent[], after: InlineContent[]) => void;
  onBackspaceAtStart: (content: InlineContent[]) => void;
  onVerticalExit: (direction: "up" | "down") => boolean;
  onRegisterFocus: (focus: (edge: FocusEdge) => void) => () => void;
  onAutoFocusApplied: () => void;
};

export function ParagraphEditor({
  content,
  testId,
  autoFocus,
  onChange,
  onError,
  onEnter,
  onBackspaceAtStart,
  onVerticalExit,
  onRegisterFocus,
  onAutoFocusApplied,
}: ParagraphEditorProps) {
  const handlers = useRef({ onChange, onError, onEnter, onBackspaceAtStart, onVerticalExit });
  handlers.current = { onChange, onError, onEnter, onBackspaceAtStart, onVerticalExit };

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
      handleKeyDown(view, event) {
        if (event.isComposing) return false;
        if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          try {
            const current = fromTiptapContent(view.state.doc.toJSON() as TiptapJSON);
            const parts = splitInlineContent(current, view.state.selection.from - 1);
            handlers.current.onEnter(parts.before, parts.after);
          } catch (cause) {
            handlers.current.onError(cause);
          }
          return true;
        }
        if (
          event.key === "Backspace" &&
          !event.shiftKey &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          view.state.selection.empty &&
          view.state.selection.from <= 1
        ) {
          event.preventDefault();
          try {
            handlers.current.onBackspaceAtStart(fromTiptapContent(view.state.doc.toJSON() as TiptapJSON));
          } catch (cause) {
            handlers.current.onError(cause);
          }
          return true;
        }
        if (
          (event.key === "ArrowUp" || event.key === "ArrowDown") &&
          !event.shiftKey &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey
        ) {
          const direction = event.key === "ArrowUp" ? "up" : "down";
          if (view.endOfTextblock(direction) && handlers.current.onVerticalExit(direction)) {
            event.preventDefault();
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: next }) => {
      try {
        handlers.current.onChange(fromTiptapContent(next.getJSON()));
      } catch (cause) {
        handlers.current.onError(cause);
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    return onRegisterFocus((edge) => applyParagraphFocus(editor, edge));
  }, [editor, onRegisterFocus]);

  useEffect(() => {
    if (!editor || !autoFocus) return;
    applyParagraphFocus(editor, autoFocus);
    onAutoFocusApplied();
  }, [autoFocus, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="rich-paragraph" data-testid={testId}>
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

function applyParagraphFocus(editor: NonNullable<ReturnType<typeof useEditor>>, edge: FocusEdge): void {
  const length = editor.state.doc.textContent.length;
  if (edge === "start") {
    editor.chain().focus().setTextSelection(1).run();
    return;
  }
  if (edge === "end") {
    editor.chain().focus().setTextSelection(1 + length).run();
    return;
  }
  if (edge === "all") {
    editor.chain().focus().setTextSelection({ from: 1, to: Math.max(1, 1 + length) }).run();
    return;
  }
  const position = Math.min(1 + length, Math.max(1, 1 + edge.offset));
  editor.chain().focus().setTextSelection(position).run();
}
