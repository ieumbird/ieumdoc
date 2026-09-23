import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from "react";
import { mapSavedRanges, type SavedRange } from "./block-reorder.ts";
import {
  BLOCK_COMMANDS,
  filterInsertCommands,
  formattableSelection,
  INSERT_COMMANDS,
  slashQueryAt,
  type SlashRange,
} from "./block-commands.ts";
import { BlockHandles } from "./BlockHandles.tsx";
import { CommandMenu } from "./CommandMenu.tsx";
import { SelectionToolbar } from "./SelectionToolbar.tsx";
import { EditorContent, useEditor } from "@tiptap/react";
import type { EditableDocument } from "@ieumdoc/core";
import {
  createEditorExtensions,
  DECLARED_DELETIONS_META,
  declaredDeletions,
  differsFromBaseline,
  editorDocumentJSON,
} from "./editor-schema.tsx";
import { toTiptapDocument, type TiptapJSON } from "./tiptap-document.ts";

type BlockMenu = { kind: "insert" | "block"; index: number; top: number };

export type DocumentEditorHandle = {
  getDocument(): TiptapJSON;
  beginSave(): TiptapJSON;
  finishSave(saved?: EditableDocument): void;
  hasUnappliedEquationDraft(): boolean;
  hasUnsavedChanges(): boolean;
};

type DocumentEditorProps = {
  document: EditableDocument;
  documentPath: string;
  onStructuralReject: () => void;
  onEquationDraftChange?: (active: boolean) => void;
};

export const DocumentEditor = forwardRef<DocumentEditorHandle, DocumentEditorProps>(function DocumentEditor(
  { document, documentPath, onStructuralReject, onEquationDraftChange },
  ref,
) {
  const projection = toTiptapDocument(document);
  const baseline = useRef(projection);
  const pending = useRef<{ ranges: SavedRange[]; keys: string[] } | null>(null);
  const onEquationDraftChangeRef = useRef(onEquationDraftChange);
  onEquationDraftChangeRef.current = onEquationDraftChange;
  const activeEquationDrafts = useRef(new Set<string>());
  const host = useRef<HTMLElement>(null);
  const [blockMenu, setBlockMenu] = useState<BlockMenu | null>(null);
  const [slashActive, setSlashActive] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const slashKeys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const reportEquationDraft = (key: string, active: boolean) => {
    if (active) activeEquationDrafts.current.add(key);
    else activeEquationDrafts.current.delete(key);
    onEquationDraftChangeRef.current?.(activeEquationDrafts.current.size > 0);
  };
  const editor = useEditor({
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    extensions: createEditorExtensions(() => baseline.current, onStructuralReject, reportEquationDraft, documentPath),
    content: projection,
    onTransaction({ transaction }) {
      if (pending.current) pending.current.ranges = mapSavedRanges(pending.current.ranges, transaction);
      // Block indexes are snapshot positions; a document change invalidates an open menu.
      if (transaction.docChanged) setBlockMenu(null);
    },
    editorProps: {
      handleKeyDown: (_view, event) => slashKeys.current(event),
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
        const keys: string[] = [];
        editor.state.doc.forEach((node, pos, index) => {
          ranges.push({start: pos, end: pos + node.nodeSize, path: String(index)});
          keys.push(String(node.attrs.sourcePath));
        });
        pending.current = { ranges, keys };
        return editorDocumentJSON(editor.state);
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
        // Deletes made while saving now address saved blocks that no node claims.
        const deleted = new Set(declaredDeletions(editor.state));
        const claimed = new Set(groups.flatMap(group => group.paths));
        tr.setMeta(DECLARED_DELETIONS_META, saved.blocks
          .filter((block, index) => !claimed.has(block.path.join(",")) &&
            submission.keys[index].split(";").some(path => deleted.has(path)))
          .map(block => block.path.join(",")));
        baseline.current = toTiptapDocument(saved);
        editor.view.dispatch(tr.setMeta("savedPaths", true).setMeta("addToHistory", false));
      },
      hasUnappliedEquationDraft() {
        return activeEquationDrafts.current.size > 0;
      },
      hasUnsavedChanges() {
        if (!editor) return false;
        return activeEquationDrafts.current.size > 0 || differsFromBaseline(editor.state, baseline.current);
      },
      getDocument() {
        if (!editor) {
          throw new Error("Editor is not ready");
        }
        return editorDocumentJSON(editor.state);
      },
    }),
    [editor],
  );

  useEffect(() => {
    if (!editor) return;
    const focus = () => setFocused(true);
    const blur = () => setFocused(false);
    editor.on("focus", focus);
    editor.on("blur", blur);
    return () => {
      editor.off("focus", focus);
      editor.off("blur", blur);
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  const runInsert = (id: string, index: number, slash?: SlashRange) => {
    const command = INSERT_COMMANDS.find(command => command.id === id);
    if (!command) return;
    setBlockMenu(null);
    editor.view.dispatch(command.run(editor.state, index, slash));
    editor.view.focus();
  };
  const runBlockCommand = (id: string, index: number) => {
    const command = BLOCK_COMMANDS.find(command => command.id === id);
    setBlockMenu(null);
    if (!command?.enabled(editor.state, index)) return;
    editor.view.dispatch(command.run(editor.state, index));
    editor.view.focus();
  };

  // `/` and `+` open the same insert menu over the same command list.
  const slash = blockMenu ? null : slashQueryAt(editor.state);
  const slashOpen = slash !== null && slash.from !== slashDismissed && focused;
  const slashItems = slash ? filterInsertCommands(slash.query) : [];
  const slashIndex = Math.min(slashActive, Math.max(slashItems.length - 1, 0));
  slashKeys.current = (event) => {
    if (event.key === "/") {
      // A newly typed `/` starts a fresh query.
      setSlashDismissed(null);
      setSlashActive(0);
      return false;
    }
    if (!slashOpen || !slash) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const step = event.key === "ArrowDown" ? 1 : -1;
      setSlashActive((slashIndex + step + slashItems.length) % Math.max(slashItems.length, 1));
      return true;
    }
    if (event.key === "Enter" && slashItems[slashIndex]) {
      setSlashActive(0);
      runInsert(slashItems[slashIndex].id, slash.index, slash);
      return true;
    }
    if (event.key === "Escape") {
      setSlashDismissed(slash.from);
      return true;
    }
    return false;
  };

  const hostRect = host.current?.getBoundingClientRect();
  const caretStyle = (pos: number, below: boolean): CSSProperties | undefined => {
    if (!hostRect) return undefined;
    const coords = editor.view.coordsAtPos(pos);
    return below
      ? { top: coords.bottom - hostRect.top + 4, left: coords.left - hostRect.left }
      : { top: coords.top - hostRect.top - 4, left: coords.left - hostRect.left };
  };
  const formatting = focused ? formattableSelection(editor.state) : null;
  const toolbarStyle = formatting ? caretStyle(formatting.from, false) : undefined;
  const slashStyle = slashOpen && slash ? caretStyle(slash.from, true) : undefined;
  const blockMenuStyle: CSSProperties | undefined = blockMenu ? { top: blockMenu.top + 32, left: "var(--space-2)" } : undefined;

  return (
    <article className="document" data-testid="document-editor" ref={host}>
      <EditorContent editor={editor} />
      <BlockHandles
        editor={editor}
        menuIndex={blockMenu?.index}
        onInsert={(index, top) => setBlockMenu({ kind: "insert", index, top })}
        onOpenMenu={(index, top) => setBlockMenu({ kind: "block", index, top })}
      />
      {toolbarStyle ? <SelectionToolbar editor={editor} style={toolbarStyle} onReject={onStructuralReject} /> : null}
      {slashStyle && slash ? (
        <CommandMenu
          key={`slash-${slash.from}`}
          label="Insert block"
          items={slashItems}
          activeIndex={slashIndex}
          style={slashStyle}
          onSelect={id => runInsert(id, slash.index, slash)}
          onClose={() => setSlashDismissed(slash.from)}
        />
      ) : null}
      {blockMenu?.kind === "insert" && blockMenuStyle ? (
        <CommandMenu
          key={`insert-${blockMenu.index}`}
          label="Insert block"
          items={INSERT_COMMANDS}
          focusOnOpen
          style={blockMenuStyle}
          onSelect={id => runInsert(id, blockMenu.index)}
          onClose={() => setBlockMenu(null)}
        />
      ) : null}
      {blockMenu?.kind === "block" && blockMenuStyle ? (
        <CommandMenu
          key={`block-${blockMenu.index}`}
          label="Block actions"
          items={BLOCK_COMMANDS.map(command => ({
            id: command.id,
            label: command.label,
            disabled: !command.enabled(editor.state, blockMenu.index),
          }))}
          focusOnOpen
          style={blockMenuStyle}
          onSelect={id => runBlockCommand(id, blockMenu.index)}
          onClose={() => setBlockMenu(null)}
        />
      ) : null}
    </article>
  );
});
