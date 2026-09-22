import { forwardRef, useImperativeHandle, useRef } from "react";
import { Mapping } from "@tiptap/pm/transform";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import type { EditableDocument } from "@ieumdoc/core";
import { createEditorExtensions } from "./editor-schema.tsx";
import { toTiptapDocument, type TiptapJSON } from "./tiptap-document.ts";

export type DocumentEditorHandle = {
  getDocument(): TiptapJSON;
  beginSave(): TiptapJSON;
  finishSave(saved?: EditableDocument): void;
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
  const baseline = useRef(projection);
  const pending = useRef<{ doc: ProseMirrorNode; mapping: Mapping } | null>(null);
  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    extensions: createEditorExtensions(() => baseline.current, onStructuralReject),
    content: projection,
    onTransaction({ transaction }) {
      if (pending.current) pending.current.mapping.appendMapping(transaction.mapping);
    },
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
      beginSave() {
        if (!editor) throw new Error("Editor is not ready");
        pending.current = { doc: editor.state.doc, mapping: new Mapping() };
        return editor.getJSON() as TiptapJSON;
      },
      finishSave(saved) {
        const submission = pending.current;
        pending.current = null;
        if (!editor || !saved || !submission) return;
        // Map only the in-flight save snapshot to the current editor positions.
        // These paths are refreshed locators, never persistent block identities.
        const ranges: { start: number; end: number; path: string }[] = [];
        submission.doc.forEach((node, pos, index) => {
          ranges.push({
            start: submission.mapping.map(pos, -1),
            end: submission.mapping.map(pos + node.nodeSize, -1),
            path: saved.blocks[index].path.join(","),
          });
        });
        const tr = editor.state.tr;
        const groups: { positions: number[]; paths: string[] }[] = [];
        editor.state.doc.forEach((node, pos) => {
          const paths = ranges.filter(range => pos < range.end && pos + node.nodeSize > range.start).map(range => range.path);
          if (!paths.length) return;
          const group = { positions: [pos], paths };
          // A pending merge can overlap two saved paragraphs and their pending
          // split siblings. Keep that connected paragraph group together.
          while (groups.length && groups.at(-1)!.paths.some(path => group.paths.includes(path))) {
            const previous = groups.pop()!;
            group.positions.unshift(...previous.positions);
            group.paths = [...new Set([...previous.paths, ...group.paths])];
          }
          groups.push(group);
        });
        for (const group of groups) for (const pos of group.positions) {
          tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, sourcePath: group.paths.join(";") });
        }
        baseline.current = toTiptapDocument(saved);
        editor.view.dispatch(tr.setMeta("savedPaths", true).setMeta("addToHistory", false));
      },
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
