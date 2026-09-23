import type { Editor } from "@tiptap/core";
import type { CSSProperties } from "react";
import { IconButton } from "./ui/primitives.tsx";

/** Inline marks for a paragraph text selection. Only Core-supported marks are offered. */
export function SelectionToolbar({ editor, style, onReject }: { editor: Editor; style: CSSProperties; onReject: () => void }) {
  return (
    <div className="selection-toolbar" role="toolbar" aria-label="Text formatting" style={style} data-testid="selection-toolbar">
      <IconButton
        label="Bold"
        aria-pressed={editor.isActive("bold")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggleMark(editor, "bold", onReject)}
      >
        <strong aria-hidden="true">B</strong>
      </IconButton>
      <IconButton
        label="Italic"
        aria-pressed={editor.isActive("italic")}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggleMark(editor, "italic", onReject)}
      >
        <em aria-hidden="true">I</em>
      </IconButton>
    </div>
  );
}

function toggleMark(editor: Editor, mark: "bold" | "italic", onReject: () => void): void {
  if (!editor.isActive("paragraph")) {
    onReject();
    return;
  }
  const chain = editor.chain().focus();
  const applied = (mark === "bold" ? chain.toggleBold() : chain.toggleItalic()).run();
  if (!applied) onReject();
}
