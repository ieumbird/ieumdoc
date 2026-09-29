import { forwardRef, useEffect, useImperativeHandle, useReducer, useRef, useState, type CSSProperties } from "react";
import { closeHistory } from "@tiptap/pm/history";
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
import { insertReference, referenceCommandItems, referenceOfCommand, referenceTargets, ReferenceForm } from "./cross-reference.tsx";
import { LinkForm, linkDraftOf, SelectionToolbar, type LinkDraft } from "./SelectionToolbar.tsx";
import { EditorContent, useEditor } from "@tiptap/react";
import type { EditableDocument } from "@ieumdoc/core";
import {
  createEditorExtensions,
  type FigureValidator,
  editorDocumentJSON,
} from "./editor-schema.tsx";
import { appliedDocument, toTiptapDocument, type TiptapJSON } from "./tiptap-document.ts";

type BlockMenu = { kind: "insert" | "block"; index: number; top: number };

const EQUATION_DRAFT_MOVE_HINT = "Apply or Cancel the Equation edit before moving it.";
const FIGURE_DRAFT_MOVE_HINT = "Apply or Cancel the Figure edit before moving it.";

export type DocumentEditorHandle = {
  getDocument(): TiptapJSON;
  beginSave(): TiptapJSON;
  finishSave(succeeded?: boolean): void;
  hasUnsavedChanges(): boolean;
};

type DocumentEditorProps = {
  document: EditableDocument;
  documentPath: string;
  readOnly?: boolean;
  onStructuralReject: (reason?: string) => void;
  onEquationDraftChange?: (active: boolean) => void;
  onFigureDraftChange?: (active: boolean) => void;
  /** Presentation only; reuse the existing document dirty comparison. */
  onDirtyChange?: (dirty: boolean) => void;
  validateFigure?: FigureValidator;
};

export const DocumentEditor = forwardRef<DocumentEditorHandle, DocumentEditorProps>(function DocumentEditor(
  { document, documentPath, readOnly = false, onStructuralReject, onEquationDraftChange, onFigureDraftChange, onDirtyChange, validateFigure },
  ref,
) {
  const projection = toTiptapDocument(document);
  const baseline = useRef(projection);
  const pending = useRef<TiptapJSON | null>(null);
  const saved = useRef<TiptapJSON | null>(null);
  const onEquationDraftChangeRef = useRef(onEquationDraftChange);
  onEquationDraftChangeRef.current = onEquationDraftChange;
  const activeEquationDrafts = useRef(new Set<string>());
  const onFigureDraftChangeRef = useRef(onFigureDraftChange);
  onFigureDraftChangeRef.current = onFigureDraftChange;
  const activeFigureDrafts = useRef(new Set<string>());
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const host = useRef<HTMLElement>(null);
  const [blockMenu, setBlockMenu] = useState<BlockMenu | null>(null);
  const [slashActive, setSlashActive] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  // The selected paragraph text a new cross-reference will replace.
  const [referenceDraft, setReferenceDraft] = useState<{ from: number; to: number; text: string } | null>(null);
  const slashKeys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  // Draft changes are not transactions; re-render so the block handles reflect them.
  const [, draftsChanged] = useReducer((count: number) => count + 1, 0);
  const reportEquationDraft = (key: string, active: boolean) => {
    if (active) activeEquationDrafts.current.add(key);
    else activeEquationDrafts.current.delete(key);
    onEquationDraftChangeRef.current?.(activeEquationDrafts.current.size > 0);
    draftsChanged();
  };
  const reportFigureDraft = (key: string, active: boolean) => {
    if (active) activeFigureDrafts.current.add(key);
    else activeFigureDrafts.current.delete(key);
    onFigureDraftChangeRef.current?.(activeFigureDrafts.current.size > 0);
    draftsChanged();
  };
  const moveBlockedHint = (index: number) => {
    const path = String(editor.state.doc.maybeChild(index)?.attrs.sourcePath ?? "");
    if (activeEquationDrafts.current.has(path)) return EQUATION_DRAFT_MOVE_HINT;
    if (activeFigureDrafts.current.has(path)) return FIGURE_DRAFT_MOVE_HINT;
    return undefined;
  };
  const editor = useEditor({
    editable: !readOnly,
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    extensions: createEditorExtensions(() => baseline.current, onStructuralReject, reportEquationDraft, documentPath, reportFigureDraft, validateFigure),
    content: projection,
    onTransaction({ transaction }) {
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

  // Keep the opening snapshot and its locators for the lifetime of the editor. Save
  // acknowledges a submitted snapshot; it never rewrites nodes, selection or engine history.
  if (editor && saved.current === null) saved.current = editorDocumentJSON(editor.state);
  const hasDocumentChanges = () => Boolean(editor && JSON.stringify(appliedDocument(editorDocumentJSON(editor.state))) !==
    JSON.stringify(appliedDocument(saved.current!)));

  useImperativeHandle(
    ref,
    () => ({
      beginSave() {
        if (!editor) throw new Error("Editor is not ready");
        // Separate subsequent typing from this save's undo event without changing the document.
        editor.view.dispatch(closeHistory(editor.state.tr));
        pending.current = editorDocumentJSON(editor.state);
        return pending.current;
      },
      finishSave(succeeded = false) {
        if (succeeded && pending.current) saved.current = pending.current;
        pending.current = null;
        onDirtyChangeRef.current?.(hasDocumentChanges());
      },
      hasUnsavedChanges() {
        if (!editor) return false;
        return activeEquationDrafts.current.size > 0 || activeFigureDrafts.current.size > 0 ||
          hasDocumentChanges();
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
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    // Read the same baseline as Open/Save guards; do not create a second dirty model.
    const reportDirty = () => onDirtyChangeRef.current?.(hasDocumentChanges());
    reportDirty();
    editor.on("update", reportDirty);
    return () => { editor.off("update", reportDirty); };
  }, [editor]);

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
    const reference = referenceOfCommand(id);
    if (reference && slash) {
      setBlockMenu(null);
      insertReference(editor, slash, reference);
      return;
    }
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
    const rejection = command.rejection?.(editor.state, index);
    if (rejection) {
      onStructuralReject(rejection);
      return;
    }
    editor.view.dispatch(command.run(editor.state, index));
    editor.view.focus();
  };

  // `/` and `+` open the same insert menu over the same command list.
  const slash = blockMenu ? null : slashQueryAt(editor.state);
  const slashOpen = slash !== null && slash.from !== slashDismissed && focused;
  const slashItems = slash
    ? [...filterInsertCommands(slash.query), ...referenceCommandItems(referenceTargets(editor.state.doc), slash.query)]
    : [];
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
  const formatting = focused && !readOnly ? formattableSelection(editor.state) : null;
  const toolbarStyle = formatting ? caretStyle(formatting.from, false) : undefined;
  const linkStyle = linkDraft ? caretStyle(linkDraft.from, false) : undefined;
  const referenceStyle = referenceDraft ? caretStyle(referenceDraft.from, false) : undefined;
  const slashStyle = slashOpen && slash ? caretStyle(slash.from, true) : undefined;
  const blockMenuStyle: CSSProperties | undefined = blockMenu ? { top: blockMenu.top + 32, left: "var(--space-2)" } : undefined;

  return (
    <article className="document" data-testid="document-editor" ref={host}>
      <EditorContent editor={editor} />
      {!readOnly ? <BlockHandles
        editor={editor}
        menuIndex={blockMenu?.index}
        onInsert={(index, top) => setBlockMenu({ kind: "insert", index, top })}
        onOpenMenu={(index, top) => setBlockMenu({ kind: "block", index, top })}
        moveBlockedHint={moveBlockedHint}
      /> : null}
      {referenceDraft && referenceStyle ? (
        <ReferenceForm
          editor={editor}
          style={referenceStyle}
          preferredLabel={referenceDraft.text.trim()}
          onApply={(target) => {
            insertReference(editor, referenceDraft, target);
            setReferenceDraft(null);
          }}
          onClose={() => {
            setReferenceDraft(null);
            editor.commands.focus();
          }}
        />
      ) : linkDraft && linkStyle ? (
        <LinkForm editor={editor} draft={linkDraft} style={linkStyle} onClose={() => setLinkDraft(null)} />
      ) : toolbarStyle ? (
        <SelectionToolbar
          editor={editor}
          style={toolbarStyle}
          onReject={onStructuralReject}
          onEditLink={() => setLinkDraft(linkDraftOf(editor))}
          onEditReference={() => {
            const { from, to } = editor.state.selection;
            setReferenceDraft({ from, to, text: editor.state.doc.textBetween(from, to, "\n", "\n") });
          }}
        />
      ) : null}
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
          items={BLOCK_COMMANDS.filter(command => command.applies?.(editor.state, blockMenu.index) ?? true).map(command => ({
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
