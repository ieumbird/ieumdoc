import { forwardRef, useImperativeHandle, useRef } from "react";
import { mapSavedRanges, type SavedRange } from "./block-reorder.ts";
import { BlockHandles } from "./BlockHandles.tsx";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import type { EditableDocument } from "@ieumdoc/core";
import { createEditorExtensions } from "./editor-schema.tsx";
import { toTiptapDocument, type TiptapJSON } from "./tiptap-document.ts";
import { IconButton } from "./ui/primitives.tsx";

export type DocumentEditorHandle = {
  getDocument(): TiptapJSON;
  beginSave(): TiptapJSON;
  finishSave(saved?: EditableDocument): void;
};

type DocumentEditorProps = {
  document: EditableDocument;
  onStructuralReject: () => void;
  onEquationDraftChange?: (active: boolean) => void;
};

export const DocumentEditor = forwardRef<DocumentEditorHandle, DocumentEditorProps>(function DocumentEditor(
  { document, onStructuralReject, onEquationDraftChange },
  ref,
) {
  const projection = toTiptapDocument(document);
  const baseline = useRef(projection);
  const pending = useRef<{ ranges: SavedRange[] } | null>(null);
  const onEquationDraftChangeRef = useRef(onEquationDraftChange);
  onEquationDraftChangeRef.current = onEquationDraftChange;
  const activeEquationDrafts = useRef(new Set<string>());
  const reportEquationDraft = (key: string, active: boolean) => {
    if (active) activeEquationDrafts.current.add(key);
    else activeEquationDrafts.current.delete(key);
    onEquationDraftChangeRef.current?.(activeEquationDrafts.current.size > 0);
  };
  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    extensions: createEditorExtensions(() => baseline.current, onStructuralReject, reportEquationDraft),
    content: projection,
    onTransaction({ transaction }) {
      if (pending.current) pending.current.ranges = mapSavedRanges(pending.current.ranges, transaction);
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
        const ranges: SavedRange[] = [];
        editor.state.doc.forEach((node, pos, index) => ranges.push({start: pos, end: pos + node.nodeSize, path: String(index)}));
        pending.current = { ranges };
        return editor.getJSON() as TiptapJSON;
      },
      finishSave(saved) {
        const submission = pending.current;
        pending.current = null;
        if (!editor || !saved || !submission) return;
        // Map only the in-flight save snapshot to the current editor positions.
        // These paths are refreshed locators, never persistent block identities.
        const ranges = submission.ranges.map(range => ({...range, path: saved.blocks[Number(range.path)].path.join(",")}));
        const tr = editor.state.tr;
        const groups: { positions: number[]; paths: string[] }[] = [];
        editor.state.doc.forEach((node, pos) => {
          const paths = [...new Set(ranges.filter(range => pos < range.end && pos + node.nodeSize > range.start).map(range => range.path))];
          if (!paths.length) return;
          const group = { positions: [pos], paths };
          // A pending merge can overlap two saved paragraphs and their pending
          // split siblings. Keep that connected paragraph group together.
          let overlap: number;
          while ((overlap = groups.findIndex(previous => previous.paths.some(path => group.paths.includes(path)))) >= 0) {
            const previous = groups.splice(overlap, 1)[0];
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
        <IconButton
          label="Bold"
          aria-pressed={editor.isActive("bold")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleMark(editor, "bold", onStructuralReject)}
        >
          <strong aria-hidden="true">B</strong>
        </IconButton>
        <IconButton
          label="Italic"
          aria-pressed={editor.isActive("italic")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => toggleMark(editor, "italic", onStructuralReject)}
        >
          <em aria-hidden="true">I</em>
        </IconButton>
      </div>
      <article className="document" data-testid="document-editor">
        <EditorContent editor={editor} />
        <BlockHandles editor={editor} />
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
