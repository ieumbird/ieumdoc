# Continuous document editing v1

Issue #41 extends interaction among the existing supported blocks. ProseMirror
owns selection, replacement, clipboard slices and history. Core still owns all
persistent changes and canonical semantic validation.

- Enter splits prose and headings, exits a heading at its end, and creates space
  beside an atomic block. Backspace/Delete use engine joins and selections. A
  heading joined with prose that has line breaks becomes a paragraph to retain them
  (headings hold marks and inline atoms but no line breaks, #58).
  Admonitions and table cells are isolating: they never silently become prose.
- Tab/Shift+Tab move between editable table cells, skipping read-only cells;
  leaving the first/last cell enters surrounding prose (creating a paragraph at
  a document edge). Enter leaves a table or a simple admonition.
- Selecting an existing Equation leaves keyboard focus in the document; Edit
  opens its source form. A newly inserted empty Equation still opens its form
  automatically. NodeView selection alone must not steal navigation focus.
- The adapter repairs session locators after engine edits. New blocks and
  heading/paragraph conversions use existing Core insert/remove operations;
  missing source blocks become explicit deletions. Read-only survivors must
  remain unchanged. No raw Markdown or editor JSON is passed to Core.
- Clipboard DOM uses ProseMirror serialization/parsing, including typed semantic
  attributes for atoms and table alignment. Supported slices receive fresh
  session locators. Unsupported rich content is rejected before replacement or
  cut, retaining the source selection and clipboard with a visible reason.
  Labels are preserved; pasting a duplicate label is rejected until the user
  chooses a distinct label or cuts the original target to move it.
- New empty prose and empty remnants of cross-block replacement are session space
  and are omitted from canonical storage. Clearing an existing block in place and
  incomplete semantic fields retain existing Save validation and draft recovery.
- Ordinary typing and composition use the engine's DOM input handling. No custom
  IME, cursor, selection, history or clipboard engine is introduced.

Core `insertParagraph` accepts InlineContent directly (CLI `insert-block --content`)
so rich content is never staged as flattened text. Core `insertTable` accepts optional
column alignment, also exposed by CLI `insert-table --align`. Text-block conversions
and selection replacement compose existing Core operations, already available
headlessly. Issue #54 adds block-menu Paragraph/Heading conversion; it saves like
other engine conversions, and Core `convertBlock` (CLI `convert-block`) is the same
conversion for headless callers. Headings hold inline content without line breaks
(#58), so a paragraph with line breaks is refused with a visible reason instead of
losing them. Heading edits save through Core `updateHeadingInlineContent` (CLI
`update-heading`). Cursor navigation and session identity repair require no CLI command.

Verification covers engine transactions, real clipboard and keyboard input,
composition events, Undo/Redo across Save, and canonical Save/Reload preservation.
Automated composition events exercise the browser input lifecycle, not an OS IME.
