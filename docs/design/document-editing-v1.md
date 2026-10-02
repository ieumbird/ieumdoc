# Continuous document editing v1

Issue #41 extends interaction among the existing supported blocks. ProseMirror
owns selection, replacement, clipboard slices and history. Core still owns all
persistent changes and canonical semantic validation.

- Enter splits prose and headings, exits a heading at its end, and creates space
  beside an atomic block. Backspace/Delete use engine joins and selections. A
  heading joined with prose that has line breaks becomes a paragraph to retain them
  (headings hold marks and inline atoms but no line breaks, #58).
  Admonitions, Figures and table cells are isolating: they never silently become prose.
- Tab/Shift+Tab move between editable table cells, skipping read-only cells;
  leaving the first/last cell enters surrounding prose (creating a paragraph at
  a document edge). Enter leaves a table, a Figure caption or a simple admonition.
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

Issue #58 extends table cells and Figure captions to the supported InlineContent
contract. Core updateTableCell/insertTable accept text or inline content (CLI
update-table-cell --content and insert-table --cells); cells reject line breaks.
Core updateFigure/insertFigure accept text or inline captions (CLI --caption-content).
A Figure's caption is inline content in the single ProseMirror document, editable
in place with the existing formatting/clipboard controls. Image/alt/label drafts
retain Apply/Cancel; the legacy plain-caption field remains available for plain
captions. Metadata Apply keeps rich caption content. Legends and unsupported
inline elements stay read-only with original source and a visible reason.

Issue #60 normalizes external clipboard HTML (web pages, Notion, Word) before the
engine parses it (`transformPastedHTML`, `apps/editor/src/external-html.ts`). It
rewrites semantic HTML into the editor's own block markup, so ProseMirror still
parses, fits and replaces the selection in one transaction (one Undo), and Save
still goes through Core validation. IeumDoc's typed clipboard is not normalized, and
a clipboard PNG file still takes the #59 asset path first.

- Kept: paragraphs, H1–H6, bullet/numbered lists within List v1, single-paragraph
  quotes, `<pre>` code (whitespace kept, a `language-*` class as the language, one
  trailing newline dropped), dividers, rectangular tables of single-line cells, and
  bold/italic/strikethrough, inline code and links as the engine's mark rules read
  them. Only http(s), mailto, tel, ftp, relative and `#` targets stay links; a `#`
  target is an ordinary link, never a cross-reference. Column alignment comes only
  from a uniform HTML `align` attribute, never from CSS.
- Dropped silently: wrappers, classes, ids, data and vendor attributes, layout
  styles and blank paragraphs. Dropped with a notice: visual styles (font, size,
  color, underline, alignment), sub/superscript, other link targets, images and
  drawings (no download), table captions (kept as a paragraph before the table) and
  header cells outside the first row (the first row becomes the header row).
- Refused, keeping document, selection and clipboard: merged or nested table cells,
  ragged rows, cells, list items or quotes with several paragraphs or other blocks,
  headings with line breaks, links around blocks, embeds and media, form controls
  (task lists), MathML, definition lists and collapsible sections.
- Word writes list items as `mso-list` paragraphs rather than HTML lists; this one
  vendor rule turns them into lists so they do not become "·"-prefixed paragraphs.
  A skipped level, or a level above the list's first item, is refused rather than
  lowered or filled with invented items.
- At the paste edges only a paragraph joins the text around the selection; edge
  headings, lists, code blocks and tables stay whole.
- Limits: task lists drawn without form controls and code copied without `<pre>`
  (styled `<div>` lines) arrive as ordinary lists and paragraphs.

The result uses existing blocks and InlineContent only, so no Core operation or CLI
command is added; pasting is an editor input interaction.
