import { forwardRef, useCallback, useEffect, useImperativeHandle, useReducer, useRef, useState, type CSSProperties } from "react";
import { closeHistory } from "@tiptap/pm/history";
import {
  BLOCK_COMMANDS,
  blockCommandGroup,
  filterInsertCommands,
  formattableSelection,
  INSERT_COMMANDS,
  slashQueryAt,
  type SlashRange,
} from "./block-commands.ts";
import { BlockHandles } from "./BlockHandles.tsx";
import { CommandMenu, type CommandMenuItem } from "./CommandMenu.tsx";
import { insertCommandIcon } from "./command-icons.ts";
import { insertReference, referenceCommandItems, referenceOfCommand, ReferenceForm } from "./cross-reference.tsx";
import { FOOTNOTE_COMMAND, footnoteCommandItems, insertFootnote } from "./footnote.tsx";
import { LinkForm, linkDraftOf, SelectionToolbar, type LinkDraft } from "./SelectionToolbar.tsx";
import { Extension } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions/placeholder";
import { defaultHeadingNumbering } from "@ieumdoc/core/numbering";
import type { EditableDocument } from "@ieumdoc/core";
import {
  createEditorExtensions,
  type BlockSourceApplier,
  type FigureValidator,
  type DraftKind,
  editorDocumentJSON,
} from "./editor-schema.tsx";
import { appliedDocument, freshBlockPath, toTiptapDocument, type TiptapJSON } from "./tiptap-document.ts";
import { MARKDOWN_INPUT_RULES } from "./markdown-input-rules.ts";
import { currentOutlineItem, documentOutline, sameOutline, type DocumentOutline, type OutlineItem } from "./outline.ts";
import { documentEnd } from "./document-interaction.ts";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";

type BlockMenu = { kind: "insert" | "block"; index: number; top: number };

/** An insert command or reference item as the insert menu shows it: grouped, with its icon. */
function insertMenuItem(item: { id: string; label: string; group: string; hint?: string }): CommandMenuItem {
  return { id: item.id, label: item.label, group: item.group, hint: item.hint, icon: insertCommandIcon(item.id) };
}

export type DocumentEditorHandle = {
  getDocument(): TiptapJSON;
  /** Let the New dialog hand focus to the newly mounted editor through Base UI. */
  getFocusTarget(): HTMLElement | null;
  toggleHeadingNumbering(): void;
  beginSave(): TiptapJSON;
  finishSave(succeeded?: boolean): void;
  hasUnsavedChanges(): boolean;
  /** Move the caret to an outline heading and scroll it to the top of the document view. */
  revealHeading(item: OutlineItem): void;
  /** A click below the document places the caret at its end; returns whether it did. */
  focusEnd(clientY: number): boolean;
};


type DocumentEditorProps = {
  document: EditableDocument;
  documentPath: string;
  readOnly?: boolean;
  onStructuralReject: (reason?: string) => void;
  onDraftChange?: (active: boolean) => void;
  onAssetPendingChange?: (active: boolean) => void;
  onAssetError?: (reason: string) => void;
  /** Presentation only; reuse the existing document dirty comparison. */
  onDirtyChange?: (dirty: boolean) => void;
  onHeadingNumberingChange?: (enabled: boolean) => void;
  validateFigure?: FigureValidator;
  applyBlockSource?: BlockSourceApplier;
  /** The heading outline and the section being read, for navigation outside the editor. */
  onOutlineChange?: (outline: DocumentOutline) => void;
};

export const DocumentEditor = forwardRef<DocumentEditorHandle, DocumentEditorProps>(function DocumentEditor(
  { document, documentPath, readOnly = false, onStructuralReject, onDraftChange, onAssetPendingChange, onAssetError, onDirtyChange, onHeadingNumberingChange, validateFigure, applyBlockSource, onOutlineChange },
  ref,
) {
  // App remounts this editor for Open/New/Reload; Save keeps its opening projection.
  const [projection] = useState(() => toTiptapDocument(document));
  const pending = useRef<TiptapJSON | null>(null);
  const saved = useRef<TiptapJSON | null>(null);
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  const activeDrafts = useRef(new Map<string, { kind: DraftKind; path: string }>());
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;
  const onOutlineChangeRef = useRef(onOutlineChange);
  onOutlineChangeRef.current = onOutlineChange;
  // A heading revealed from the outline stays the current section until the reader scrolls,
  // even when the document ends before it can reach the top of the view.
  const revealed = useRef<{ index: number; scrollY: number } | null>(null);
  const scheduleOutline = useRef(() => {});
  const host = useRef<HTMLElement>(null);
  const [blockMenu, setBlockMenu] = useState<BlockMenu | null>(null);
  const [slashActive, setSlashActive] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const toolbar = useRef<HTMLDivElement>(null);
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  // The selected paragraph text a new cross-reference will replace.
  const [referenceDraft, setReferenceDraft] = useState<{ from: number; to: number; text: string } | null>(null);
  const slashKeys = useRef<(event: KeyboardEvent) => boolean>(() => false);
  // Draft changes are not transactions; re-render so the block handles reflect them.
  const [, draftsChanged] = useReducer((count: number) => count + 1, 0);
  const reportDraft = useCallback((kind: DraftKind, path: string, active: boolean) => {
    const key = `${kind}:${path}`;
    if (activeDrafts.current.has(key) === active) return;
    if (active) activeDrafts.current.set(key, { kind, path });
    else activeDrafts.current.delete(key);
    onDraftChangeRef.current?.(activeDrafts.current.size > 0);
    draftsChanged();
  }, []);
  const hasOtherDraft = useCallback((kind: DraftKind, path: string) =>
    [...activeDrafts.current.values()].some(draft => draft.path === path && draft.kind !== kind), []);
  const moveBlockedHint = (index: number) => {
    const path = String(editor.state.doc.maybeChild(index)?.attrs.sourcePath ?? "");
    const draft = [...activeDrafts.current.values()].find(draft => draft.path === path);
    return draft ? `Apply or Cancel the ${draft.kind} edit before moving it.` : undefined;
  };
  const editor = useEditor({
    editable: !readOnly,
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    extensions: [
      ...createEditorExtensions(projection, onStructuralReject, reportDraft, documentPath, validateFigure, onAssetPendingChange, onAssetError, applyBlockSource, hasOtherDraft),
      Placeholder.configure({ placeholder: "Start writing, or type / to add a block." }),
      // Tab from a text selection enters its formatting toolbar, after table and list Tab keys.
      Extension.create({
        name: "selectionToolbarFocus",
        priority: 50,
        addKeyboardShortcuts: () => ({
          Tab: () => {
            const first = toolbar.current?.querySelector("button");
            first?.focus();
            return Boolean(first);
          },
        }),
      }),
    ],
    content: projection,
    // Only IeumDoc's Markdown shortcuts; they never drop typed text where a result is not allowed.
    enableInputRules: [MARKDOWN_INPUT_RULES],
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

  const empty = !readOnly && editor?.isEmpty && editor.state.doc.childCount === 1 &&
    editor.state.doc.firstChild?.type.name === "paragraph";
  const focusEnd = (clientY: number): boolean => {
    if (!editor?.isEditable || clientY <= editor.view.dom.getBoundingClientRect().bottom) return false;
    editor.view.dispatch(documentEnd(editor.state));
    editor.view.focus();
    return true;
  };

  useEffect(() => {
    if (!editor) return;
    const notify = () => onHeadingNumberingChange?.(Boolean(editor.state.doc.attrs.headingNumbering));
    notify();
    editor.on("update", notify);
    return () => { editor.off("update", notify); };
  }, [editor, onHeadingNumberingChange]);

  // Keep the opening snapshot and its locators for the lifetime of the editor. Save
  // acknowledges a submitted snapshot; it never rewrites nodes, selection or engine history.
  if (editor && saved.current === null) saved.current = editorDocumentJSON(editor.state);
  const hasDocumentChanges = () => Boolean(editor && JSON.stringify(appliedDocument(editorDocumentJSON(editor.state))) !==
    JSON.stringify(appliedDocument(saved.current!)));

  useImperativeHandle(
    ref,
    () => ({
      getFocusTarget() { return editor?.isEditable ? editor.view.dom : null; },
      toggleHeadingNumbering() {
        if (!editor || !editor.isEditable) return;
        const settings = editor.state.doc.attrs.headingNumbering ? null : document.headingNumberingDefault ?? defaultHeadingNumbering(true);
        editor.view.dispatch(editor.state.tr.setDocAttribute("headingNumbering", settings));
      },
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
        return activeDrafts.current.size > 0 || hasDocumentChanges();
      },
      revealHeading(item) {
        if (!editor) return;
        const node = editor.state.doc.maybeChild(item.index);
        if (!node || (node.type.name !== "heading" && node.type.name !== "readonlyHeading")) return;
        let pos = 0;
        for (let i = 0; i < item.index; i++) pos += editor.state.doc.child(i).nodeSize;
        const selection = node.type.name === "heading"
          ? TextSelection.create(editor.state.doc, pos + 1)
          : NodeSelection.create(editor.state.doc, pos);
        editor.view.dispatch(editor.state.tr.setSelection(selection));
        editor.view.focus();
        const element = editor.view.nodeDOM(pos);
        if (element instanceof HTMLElement) element.scrollIntoView({ block: "start" });
        revealed.current = { index: item.index, scrollY: window.scrollY };
        scheduleOutline.current();
      },
      focusEnd,
      getDocument() {
        if (!editor) {
          throw new Error("Editor is not ready");
        }
        return editorDocumentJSON(editor.state);
      },
    }),
    [editor, document.headingNumberingDefault],
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
    // Recompute on edits, scrolling and resizing; report only when something changed.
    let reported: DocumentOutline | null = null;
    let frame = 0;
    const report = () => {
      frame = 0;
      const items = documentOutline(editor.state.doc);
      const tops = items.map(item => {
        const element = editor.view.nodeDOM(item.pos);
        return element instanceof HTMLElement ? element.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
      });
      // A heading that has scrolled into the upper part of the view starts the section being read.
      if (revealed.current && Math.abs(window.scrollY - revealed.current.scrollY) > 1) revealed.current = null;
      const pinned = revealed.current && items.findIndex(item => item.index === revealed.current!.index);
      const current = pinned !== null && pinned >= 0 ? pinned : currentOutlineItem(tops, window.innerHeight * 0.3,
        window.scrollY > 0 && window.scrollY + window.innerHeight >= window.document.documentElement.scrollHeight - 1 ? window.innerHeight : undefined);
      if (reported && reported.current === current && sameOutline(reported.items, items)) return;
      reported = { items, current };
      onOutlineChangeRef.current?.(reported);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(report); };
    // Edits move headings; the reading position decides again.
    const edited = () => { revealed.current = null; schedule(); };
    scheduleOutline.current = schedule;
    report();
    editor.on("update", edited);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      editor.off("update", edited);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const focus = () => setFocused(true);
    // Focus moving into the formatting toolbar keeps it for the selection.
    const blur = ({ event }: { event: FocusEvent }) => setFocused(toolbar.current?.contains(event.relatedTarget as Node | null) ?? false);
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
    if (id === FOOTNOTE_COMMAND && slash) {
      setBlockMenu(null);
      insertFootnote(editor, slash, freshBlockPath());
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
    ? [...filterInsertCommands(slash.query), ...footnoteCommandItems(slash.query), ...referenceCommandItems(editor.state.doc, slash.query)].map(insertMenuItem)
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
    <article className={`document${empty ? " document--empty" : ""}`} data-testid="document-editor" ref={host}
      onMouseDown={(event) => {
        // The paper extends below the editor content, including in a brand-new document.
        if (event.button === 0 && event.target === event.currentTarget && focusEnd(event.clientY)) event.preventDefault();
      }}>
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
          toolbarRef={toolbar}
          onLeave={() => setFocused(false)}
          // The form takes focus; opened from the toolbar by keyboard, the editor had none.
          onEditLink={() => {
            setFocused(editor.view.hasFocus());
            setLinkDraft(linkDraftOf(editor));
          }}
          onEditReference={() => {
            setFocused(editor.view.hasFocus());
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
          items={filterInsertCommands("").map(insertMenuItem)}
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
            group: blockCommandGroup(command.id),
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
