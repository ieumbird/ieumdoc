# Continuous document editing v1

- Status: Implemented
- Native focus selection: 2026-10-26 (#542: restore the retained selection before the observer can accept Chromium's native focus caret; real-click Command center and held-check browser regressions. #502 remains separate).
- Selection-race scope: 2026-10-26 (#489: citation-form focus, closing Reload focus and empty-title pointer selection. The separate table selection investigation is #502. Per-scenario evidence and the #421/#416 boundary are recorded in the [test guide](../test/README.md#focus-and-selection-race-investigation-489)).
- Body-heading verification: 2026-10-26 (#472: Editor 287/287, typecheck/build, docs check; new-document, structural-block-authoring, document-title, basic-blocks and markdown-input browser regressions with the worktree's persistent Chrome profile. New insertion/menu unit assertions and browser insert/H2 promotion regressions failed on unchanged implementation before the fix).
- Double-click verification: 2026-10-26 (#470: equation-insertion checks display-formula entry through Edit, LaTeX-field focus, Cancel/Escape caret restoration, unchanged document and Undo/Redo, and an existing draft; the new entry assertion failed before the change).
- Inline math focus verification: 2026-10-26 (#460: Apply/Escape immediately restore editor focus and the caret after the formula; inline-math-authoring checks subsequent typing and Undo, alongside equation-insertion, equation-node-selection-typing, inline-math-split and property-drafts browser regressions).
- Equation-end verification: 2026-10-25 (#436: `/Equation` at the document end → Apply → Enter/ArrowDown/Control+End or direct typing; the end gap cursor and explicit node selection both reach following prose. Browser regression also checks Chromium composition and disk Save/Reload; native OS IME is not tested).
- Last verified: 2026-10-25 (#429 document-end shortcuts, including integration with #431/#433/#432: Editor 281/281, typecheck/build, focus-caret, continuous-editing and table-authoring browser regressions; final Figure/table, delayed focus check, native Shift selection and Apple keymap emulation on Windows Chrome; native macOS not tested).
- Table Tab verification: 2026-10-25 (#430 last-cell Tab row addition, including integration with #431/#433: Editor 281/281, typecheck/build, table-authoring and continuous-editing browser regressions including first-cell focus, typing, one-step Undo and disk Save/Reload).
- Whole-document Undo verification: 2026-10-25 (#427: saved/new/applied/local-asset Figures, Backspace/Delete and Undo/Redo; figure-authoring, image-assets and atom-boundaries browser regressions; Editor 280/280, typecheck/build).
- Previous verification: 2026-10-24 (#387 atom boundary selection: Editor 273/273, typecheck/build, six browser scenarios including the 48-case keyboard matrix, visible selection, deletion, Undo/Redo and disk Save/Reload).
- Previous verification: 2026-10-23 (source 7a214dcb lookup/handle/display-numbering changes: Editor 271/271, typecheck/build, eight browser regressions and actual 2000/5000-block input plus complete canonical Save/Reload; mixed 2000 input p95 111.7ms remains above 100ms; [evidence and limits](../reviews/editor-guard-performance-2026-10-23.md)).
- Previous verification: 2026-10-23 (citation scope reconciled with the implemented units A–C [Citations contract](citations-v1.md); documentation comparison only).
- Previous verification: 2026-10-22 (#332 citation atom preservation through editing, typed clipboard, history and Save → Reload; [Citations](citations-v1.md)).
- Previous verification: 2026-10-19 (#255 document title: Core section/native tests, Editor save and section-command tests, the `document-title` browser scenario and CLI refusals on a scratch file; same-state 1440px captures against `a3d8992`: untitled [before](assets/document-title-255/before-1440-untitled.png)/[after](assets/document-title-255/after-1440-untitled.png), titled (unchanged) [before](assets/document-title-255/before-1440-titled.png)/[after](assets/document-title-255/after-1440-titled.png)).
- Previous verification: 2026-10-16 (Equation node-selection typing, IME-keydown composition and accepted paste, Undo/Redo and real Save/Reload; #275 property-close typing for Equation/Figure/Table/section label; ADR-0006 native editing boundary compared with code/tests). Previous verification: 2026-10-15 (#275 property-close typing). Previous verification: 2026-10-12 (heading Tab/Shift+Tab, history, selection and Core Save/Reload regression).
- Scope: Supported continuous editing and Core-backed persistence; [ADR-0001](../adr/0001-single-document-editor-architecture.md).

## Code highlighting

Highlighting is display-only and keeps the existing lowlight common language set. Its grammars load when a code block first exists, without changing document, selection or history. Empty/unregistered languages or a grammar load failure keep literal editable code and its language; language edits still use the existing Core code operation and canonical fence. The deferred chunk reduces the initial entry, not total deployment size.

## Continuous editing

ProseMirror owns selection, replacement, clipboard slices and history among the existing supported blocks. Core still owns all
persistent changes and canonical semantic validation.

Undo uses Ctrl+Z; Redo uses Ctrl+Y or Ctrl+Shift+Z on Windows (Cmd+Z and
Cmd+Shift+Z on macOS). In the editor, a Hangul IME's opaque Ctrl+Y/Z keydown
(`Process`/`Unidentified`, keyCode 229/0) uses physical `KeyY`/`KeyZ` only as
a fallback into the same engine keymap, retaining one-step history and Markdown
input-rule Undo. Real composition, Alt/AltGr and Shift combinations are excluded;
visible characters keep their layout's normal bindings. These keyboard interactions
add no Core operation or CLI command (#468).

Whole-document selection followed by Backspace/Delete starts a separate ProseMirror history
event, even immediately after a property Apply or insertion. One Undo restores the exact
pre-delete document, including Figure image path, alt text, caption, labels and references;
it does not also undo the preceding Apply. Asset files are retained through deletion/Undo.
This is an Editor keyboard/history boundary using the engine's deletion and `closeHistory`,
not a new semantic operation, so no Core or CLI command is added (#427).

The structure guard uses one path lookup for its fixed opening snapshot; document-local
groups preserve first appearance and split-part order. Every document-changing transaction
still receives full representability validation. Validation normalization and the appended
transaction's actual locator normalization remain separate, including fresh locator allocation;
no transaction result cache or incremental semantic engine is used. Save independently validates
the submitted document before collecting Core edits. This changes lookup cost, not admission,
deletion declarations, history, or canonical write rules. Measurement scope and limits are in
the [guard performance record](../reviews/editor-guard-performance-2026-10-23.md).

Block handles read the current document's title index once per transaction/layout refresh. Unchanged handle
rows retain their rendered controls, while geometry, visibility, menu state, move restrictions
and language changes still update them. Geometry reads are retained; equal measured geometry
reuses the previous state. Source-path identity and title status also invalidate that state,
and draft changes invalidate the hint callback, preserving move permissions after reorder or
same-sized content changes. Equation/Figure/Table display numbers share the Core-computed result
only for the identical immutable engine document, as endnote/citation numbering already does.
A changed document recomputes numbering; source semantics and canonical output are unchanged.

- Enter splits prose and headings, exits a heading at its end, and creates space
  beside an atomic block. Backspace/Delete use engine joins and selections. A
  heading joined with prose that has line breaks becomes a paragraph to retain them
  (headings hold marks and inline atoms but no line breaks, #58).
  Admonitions, Figures and table cells are isolating: they never silently become prose.
  At the start/end of a non-empty top-level paragraph or heading, Backspace/Delete
  first node-selects an adjacent selectable atom (for example an Equation or divider),
  without changing content or adding a history event. The existing node selection
  styling makes this step visible; pressing Backspace or Delete again deletes it
  through the normal engine path, including the existing reference-deletion handling.
  Prose joins, empty-paragraph removal, list lifting, isolating boundaries and a
  Backspace at the first block keep their existing behavior. Selection uses the
  engine's `selectNodeBackward`/`selectNodeForward` before its join commands; no Core
  operation or CLI command is added for this keyboard interaction.
- With a caret in an editable top-level heading, Tab changes H2 to H3 (one level
  deeper), and Shift+Tab changes H3 to H2 (one level higher). Each change is one
  Undo step and keeps the heading's content and caret. Tab at H6 and Shift+Tab at
  H2 keep the heading and focus unchanged; Shift+Tab at an existing H1 also leaves
  it unchanged. Body headings cannot be promoted to H1. A text selection still uses Tab to
  reach its formatting toolbar; table, list and code Tab behavior is unchanged.
- Tab/Shift+Tab move between table cells. Tab in the last cell of an editable
  table adds a row below it and moves the caret to the new row's first cell,
  through the same command, session locators and Core Save operation as Add row
  below. The row addition is one Undo step. Shift+Tab in the first cell enters
  preceding prose (creating a paragraph at a document edge). Read-only tables
  retain the existing navigation without adding a row; Tab does not act during
  IME composition. Enter leaves a table, a Figure caption or a simple admonition.
- The document end stays reachable. Control+End (Command+End or Command+ArrowDown
  on macOS) uses the same destination as the click below the document: the end of
  a final paragraph, or a new empty paragraph after any other final block.
  Shift-modified document-end shortcuts retain the engine/browser's selection behavior.
  ArrowDown on a node-selected final block or the gap cursor after it (including
  after an Equation Apply) moves to a paragraph below, using the same destination.
  ArrowDown on the last line of a final table
  row, list, quote, admonition or caption moves to a paragraph after it. A click in
  the empty area below the document puts the caret at the end of a final
  paragraph. After any other final block, both create an empty paragraph there.
- Selecting an existing Equation leaves keyboard focus in the document; Edit
  or double-clicking its rendered formula opens its source form through the same
  path, with LaTeX-field focus and the same closing focus behavior (#470).
  Opening changes neither document nor history; double-click while already editing
  leaves the current form and draft unchanged. A newly inserted empty Equation still opens its form
  automatically. NodeView selection alone must not steal navigation focus.
- Inline math retains its existing single-click source editor; the display-Equation
  double-click shortcut does not change inline math interaction.
- Applying or escaping an inline math source form returns DOM focus immediately
  to the editor and collapses its caret just after that formula, using the same
  engine selection/focus helper as block properties. Typing can continue without
  another click and preserves the formula. Outside blur still dismisses the inline
  form without applying its draft or taking focus from the clicked destination.
- Closing block properties with Apply, Cancel or Escape retains a text selection
  already inside the edited block (a Figure caption or Table cell). Otherwise,
  focus returns to a collapsed caret just after the block: the start of following
  text, or the engine's gap cursor at a closed block boundary/document end. This
  focus move adds no document content or history event. Subsequent typing edits
  that text or creates prose at the gap; it does not replace the applied block or
  lose its reference target. Section-label properties return to the following
  heading, keeping the label directly before it. Typing a printable character
  while an Equation is explicitly node-selected does not replace it: a new
  paragraph is created below (same as Enter on a node-selected block) and the
  typed text goes there. An initial IME keydown (`Process`/229) prepares that
  paragraph before composition starts; subsequent composition updates and
  commit/cancellation remain engine-owned. Cancellation may leave an empty
  session paragraph, which canonical Save omits. Accepted clipboard slices also
  go below a node-selected Equation, in one undoable transaction, retaining the
  existing unsupported-content and duplicate-label checks. An accepted empty slice
  is consumed without changing the Equation, label, selection or history, and
  without creating a paragraph. Backspace/Delete on a node-selected Equation still use
  the engine's normal deletion. Explicitly selecting other nodes still uses
  normal engine replacement behavior.
- The adapter repairs session locators after engine edits. New blocks and
  heading/paragraph conversions use existing Core insert/remove operations;
  missing source blocks become explicit deletions. Unsupported blocks reject
  native admission under [Native document support](document-support-v1.md).
  No raw Markdown or editor JSON is passed to Core.
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
- A caret key pressed right after the editor regains focus moves the caret as at any
  other time; Control+End reaches the document end and Control+Home its start. The engine
  still restores its own caret when focus arrives without a key (Tab, or a DOM `focus()`
  after which the browser resets the caret), also when only a modifier is pressed. A pinned
  `prosemirror-view` patch provides this ([cause and removal condition](../reviews/prosemirror-focus-caret-2026-10-09.md)).
- Native DOM focus (including Tab and shell dialog/menu focus return) synchronizes the
  retained engine selection before the DOM observer can read Chromium's document-start caret
  (#542). A recent click before opening a dialog must not disable this restoration. It adds
  no content/history event and applies only at focus, without blocking later native caret
  movement. The pinned `prosemirror-view` patch owns this ordering; remove this addition when
  upstream passes both real-click and held-check `citation-authoring` cases without it.
- A post-focus selection check must also preserve a later pointer or touch destination (#489).
  The same pinned engine patch snapshots pointer/touch activity when focus arrives; its delayed
  check only restores the old caret if neither has changed. It must not move a paragraph click
  back into an empty title before the native `selectionchange` is read.
  Remove this addition when the pinned upstream post-focus check respects later pointer/touch
  destinations under the forced callback order in `document-title`.

Core `insertParagraph` accepts InlineContent directly (CLI `insert-block --content`)
so rich content is never staged as flattened text. Core `insertTable` accepts optional
column alignment, also exposed by CLI `insert-table --align`. Text-block conversions
and selection replacement compose existing Core operations, already available
headlessly. Block-menu Paragraph/Heading conversion saves like
other engine conversions, and Core `convertBlock` (CLI `convert-block`) is the same
conversion for headless callers. Headings hold inline content without line breaks
(#58), so a paragraph with line breaks is refused with a visible reason instead of
losing them. Heading edits save through Core `updateHeadingInlineContent` (CLI
`update-heading`). Heading level changes from the menu or Tab/Shift+Tab save
through Core `updateHeadingLevel`, already exposed by CLI `update-heading-level`;
the keyboard shortcut adds no semantic operation or CLI command. Cursor navigation,
including reaching the document end, and session identity repair require no CLI command.

Subscript and superscript are InlineContent marks (`subscript`, `superscript`) written as
the MyST `{sub}` and `{sup}` roles, for text notation such as H{sub}`2`O or m{sup}`2`;
mathematical meaning belongs in inline math. They never nest in each other and hold no
references, footnotes or citations. Source that does, or a role with `class`/`label` options, is rejected at native admission. Headless callers use the existing `--content` JSON, so no CLI command is added.

[Citation atoms](citations-v1.md) hold the explicit role and exact key group, with optional bold,
italic or deletion marks. Core supplies their number policy and text. Supported clipboard slices,
normal editing and Save preserve those attributes and the bibliography declaration. Citation
authoring UI and bibliography resource reads follow the [Citations contract](citations-v1.md#editor).

## Reference display settings

In-text Figure/Table/Equation references use Core's per-document [reference templates](heading-numbering-v1.md#reference-templates-445).
Without settings they read `Figure 1`, `Table 1`, `(1)` (MyST U+00A0 no-break spaces for Figure/Table). The Document settings dialog's Reference style choice changes
one document attribute through the existing Undo/Redo history; Save applies Core
`updateReferenceTemplates` alongside heading settings. Target identities, reference roles,
caption text and the equation's own right-hand `(N)` number stay unchanged. Chips in table
captions, target choices, accessible names and menu search follow the same template values.

## Table cells and captions

Table cells and Figure/Table captions use the supported InlineContent contract. Core updateTableCell/insertTable accept text or inline content (CLI
update-table-cell --content and insert-table --cells); cells reject line breaks.
Core updateFigure/insertFigure accept text or inline captions (CLI --caption-content).
Figure content, caption and label may all be absent (a pending Figure). Pending/image
transitions preserve the container, label and caption; pending Figures participate in the
same editing state and history. See [Figure authoring](figure-authoring-v1.md) for
the persistence boundary and insertion behavior.
A Table caption is an optional last child of its Editor table, edited directly below
the grid with the shared rich-inline controls. Properties contain only Label. Add caption
creates and focuses the missing caret surface; clearing it removes saved caption content.
Rows/cells keep their existing coordinates. ArrowDown from the final row enters the
caption, ArrowUp returns to the last cell, and Enter leaves the table. Whole-table move,
delete and history include the caption. Core `updateTableCaption` and canonical MyST stay
unchanged; see [Table caption and label](table-caption-v1.md).

A Figure's caption is inline content in the single ProseMirror document, editable
in place with the existing formatting/clipboard controls. Image/alt/label drafts
retain Apply/Cancel; the legacy plain-caption field remains available for plain
captions. Metadata Apply keeps rich caption content. Legends and unsupported
inline elements reject the document at native admission.

## Table structure

Table structure edits stay within what a GFM pipe table expresses. Core
removes and moves body rows and columns and sets or clears column alignment (CLI
remove-table-row/-column, move-table-row/-column, update-table-alignment); the header
row stays first and a table keeps one column. The block menu applies them to the
caret's cell in one engine transaction each. Each opening-snapshot cell carries its
`row,column` as a session-only locator, like a block's `sourcePath` (ADR-0003), so Save
maps the edited grid to the snapshot. The Host then removes, moves, adds and aligns
through the same Core operations. Unsupported cells reject native admission.
Cell merge has no GFM form and is not supported.

## Document title (#255)

Owner decision (2026-10-26, #472): body sections start at H2. Editor slash/insert
menus offer H2–H6 (H4–H6 only for a matching search), and body Paragraph/Heading
block menus offer H2–H6, plus Paragraph for headings. They never offer H1,
including for an existing body H1 or an untitled document. The title's own block
menu and explicit title changes below remain unchanged, as do Add a title and
the empty `Title` flow. Existing body H1 blocks still open, edit and survive
Save → Reload at H1; no migration or rewriting is applied. The existing Markdown
input rule still turns `# ` in a body paragraph into H1; its policy is outside #472.
This is an Editor authoring choice, not a format or semantic change: Core and CLI
continue to admit and author H1, so no Core operation or CLI change is needed.

A level-1 heading that opens the body, preceded only by its own label targets, is the document
title. It is stored as that ordinary leading `# Title`, so the format and other Markdown/MyST
tools are unchanged; there is no frontmatter title. The title stays first. One Core rule
(`titleHeading` in `@ieumdoc/core/section`) serves Core, the CLI and the Editor:

- Core `moveBlock` refuses moving the title or its label targets and moving any block to or
  before the title; `moveSection` refuses moving the title's section and moving a section before
  it; insertions (`insertBlock` and every insert operation built on it) refuse positions at or
  before the title, except a label target for it. The CLI's move-block, move-section and insert
  commands therefore refuse the same changes with Core's reason and leave the file unchanged.
- Removing the title, converting it to another block or changing its level is an explicit change
  and is allowed; the body then has no title until a leading level-1 heading opens it again.
  Without a title, any heading may be moved to the top and becomes the title.
- Editor: the title carries `data-document-title`. Its handle does not drag and says why; no drop
  line is offered at or above it, and section commands neither move the title's section nor move
  another above it. Any engine change that would leave the old title as a level-1 heading below
  something else is refused with the notice `The title stays at the top of the document.` Enter
  in the title continues in a paragraph below it: at its start, an empty paragraph; elsewhere, the
  text after the caret.
- A document without a title shows an Add a title place above its first block (not document
  content). It starts an empty title with the caret in it and the `Title` placeholder; a title left
  empty is removed once the caret leaves it, because an empty heading is not saved.
  In an empty new document it reuses the single transient starting paragraph, so Enter at the
  end of the typed title leaves exactly one empty paragraph below it with the caret there (#437).
  Existing document content is retained when a title is inserted above it.
- Save replays a final block order through intermediate orders no one sees, so it moves blocks
  with Core's `checkTitle: false` and instead checks the rule once, against the opening snapshot:
  if that snapshot opened with a title still saved as a level-1 heading, it must still be the title.

## Sections

Block-menu Move up/down (#516) reuse the drag reorder transaction and Core
`moveBlock` Save replay (CLI `move-block`). Each swaps one adjacent body block in
one Undo step; a heading moves alone, independently of the existing section commands
below. Title/label, endnote, boundary and active-draft restrictions match drag.
See [unified menu behavior](editor-ux-shell-v1.md#unified-action-menus-516).

A section can be moved or deleted. It is computed from the current
top-level blocks: a heading, the label targets directly before it, and the blocks up to
the next heading of the same or a higher level. It has no identity or Markdown syntax
of its own (ADR-0003). One Core rule (`@ieumdoc/core/section`) serves Core `moveSection`/
`removeSection` (CLI move-section/remove-section; `inspect` shows each heading's range)
and the Editor. A heading's block menu moves its section past the previous or next
sibling section, or deletes it, in one engine transaction. Save reuses the existing
block order and deletion path, and the result matches the Core operation. Heading
levels never change. Supported label targets move or are removed with their section.
[Endnote](footnotes-v1.md#core) definitions belong to no section: a section ends at the
end of the body, moving or deleting it leaves them, and deleting a section that holds the
last reference to one is refused before anything changes.

## External clipboard

External clipboard HTML (web pages, Notion, Word) is normalized before the
engine parses it (`transformPastedHTML`, `apps/editor/src/external-html.ts`). It
rewrites semantic HTML into the editor's own block markup, so ProseMirror still
parses, fits and replaces the selection in one transaction (one Undo), and Save
still goes through Core validation. IeumDoc's typed clipboard is not normalized, and
a clipboard image file (PNG, JPEG, GIF or WebP) still takes the #59 asset path first.

- Kept: paragraphs, H1–H6, bullet/numbered lists within List v1, single-paragraph
  quotes, `<pre>` code (whitespace kept, a `language-*` class as the language, one
  trailing newline dropped), dividers, rectangular tables of single-line cells, and
  bold/italic/strikethrough, subscript/superscript (`sub`/`sup` tags and
  `vertical-align` styles), inline code and links as the engine's mark rules read
  them. Only http(s), mailto, tel, ftp, relative and `#` targets stay links; a `#`
  target is an ordinary link, never a cross-reference. Column alignment comes only
  from a uniform HTML `align` attribute, never from CSS.
- Dropped silently: wrappers, classes, ids, data and vendor attributes, layout
  styles and blank paragraphs. Dropped with a notice: visual styles (font, size,
  color, underline, alignment), other link targets, images and
  drawings (no download), table captions (kept as a paragraph before the table) and
  header cells outside the first row (the first row becomes the header row).
  Unsupported inline semantics are never dropped silently: `kbd`, `samp`, `var`,
  `cite`, `abbr`/`acronym`, `dfn`, `q`, `time` and `data` keep their text with a
  notice, which also covers lost metadata such as an `abbr` title or a `datetime`.
- Refused, keeping document, selection and clipboard: merged or nested table cells,
  ragged rows, cells, list items or quotes with several paragraphs or other blocks,
  headings with line breaks, links around blocks, embeds and media, form controls
  (task lists), MathML, definition lists and collapsible sections, and `ruby`,
  whose annotations would run into the base text if flattened.
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

## Verification

Verification covers engine transactions, real clipboard and keyboard input,
composition events, Undo/Redo across Save, and canonical Save/Reload preservation.
Automated composition events exercise the browser input lifecycle, not an OS IME.

`atom-boundaries` (#387) exercises real Backspace/Delete across six adjacent block
kinds and four caret block kinds. It checks the first key's selection/document,
visible Equation selection, second-key deletion in both directions, Undo/Redo,
real disk Save and Reload, first-block no-op and empty-paragraph removal. The baseline on `0475227` failed the first-key selection assertion: Equation and divider disappeared
from both heading and paragraph boundaries. The following matrix records that
baseline and the implemented behavior; each cell is Backspace / Delete. Lists use
the first/last item's boundary; quotes use their isolating text boundary.

| Adjacent block | Caret block | Before | After |
| --- | --- | --- | --- |
| Equation, divider | Heading, paragraph | Delete atom / Delete atom | Select atom / Select atom |
| Figure, table, admonition | Heading, paragraph | Select block / Select block | Unchanged |
| Code (textblock, not atom) | Heading, paragraph | Join / Join | Unchanged |
| Equation, divider, Figure, table, admonition | List | Lift item / Select block | Unchanged |
| Code | List | Lift item / Join | Unchanged |
| All six kinds | Quote | No change / No change | Unchanged |

The adapter only changes atom selection precedence for non-empty top-level prose;
it leaves the other keymaps in place. The baseline was gathered before the fix,
not inferred solely from dependency source. Tiptap 3.31.3's default Backspace chain
runs input-rule undo, first-empty-block conversion, `deleteSelection`, `joinBackward`,
then `selectNodeBackward`; Delete runs `deleteSelection`, `deleteCurrentNode`,
`joinForward`, then `selectNodeForward`. ProseMirror commands 1.7.2's join atom
fallback therefore deletes before the selection fallback. The higher-priority
Markdown input-rule undo and the existing list/empty-block commands remain intact.

`equation-node-selection-typing` covers actual preview selection, ASCII typing,
single/multiline plain-text clipboard paste, duplicate-label paste refusal,
comment-only HTML paste as an empty-slice no-op with Undo/Redo preservation, an
initial CDP IME keydown followed by `imeSetComposition` updates and commit/cancel,
ordinary paragraph composition, Undo/Redo, original Equation/label and surrounding
content preservation, real disk Save/Reload, and explicit Backspace/Delete.
The CDP path models the keyboard-before-composition ordering described in
[UI Events](https://www.w3.org/TR/uievents/#events-composition-key-events).
It does not verify a Windows Korean OS IME, candidate selection, or input methods
that start composition without a preceding `Process`/229 keydown. Those methods
still use the engine's default composition path; adjacent-paragraph placement is
not guaranteed there. Manual Windows Korean IME review remains: select the
Equation preview, type and commit `한글`, cancel another composition, then check
single input, Equation/label, Undo/Redo and Save/Reload.

PR #314 review baseline (`3afb44f`): real clipboard paste of `Paste314` replaced
the selected `eq-power` Equation (`P = VI \\cos \\varphi`) with a paragraph and
removed its label. CDP composition (`ㅎ` through `한글`), both with and without an
initial 229 keydown, retained the Equation but appended `한글` to the preceding
`Before the equation.` paragraph. The strengthened adjacent-paragraph assertion
failed on that original implementation. During investigation, moving the caret
at `compositionstart` or routing through gapcursor's `beforeinput` produced
`ㅎ한글`: Chromium restarted its composing range after the first update. These
approaches were discarded. The final adapter prepares the caret at the initial
IME keydown, before that range exists; it does not implement composition text
handling. In pinned `prosemirror-view` 1.42.4, `input.ts` invokes custom DOM
handlers before its own keydown handler skips key code 229, while `domchange.ts`
can invoke `handleTextInput` during composition. Tiptap remains pinned at 3.31.3.

Review follow-up baseline (`9198093`): after typing `QR`, selecting `eq-power`
and calling `view.pasteHTML('<!-- data-ieumdoc-type="paragraph" -->')` removed
the Equation/label and changed NodeSelection at 29 to TextSelection at 30.
The HTML parser produced a non-null empty Slice; returning false delegated it
to `doPaste`'s default `replaceSelection`. The regression failed on that HEAD.
The handler now consumes this accepted empty slice without dispatching. The same
real paste pipeline is tested with existing undo and redo history, preserving
the full document, selection, focus and the original typing Undo/Redo steps.

## History

The implemented slices were tracked in #41 (continuous editing), #54 (block conversion), #58 (rich headings/cells/captions), #75 (table structure), #76 (sections), and #60 (external clipboard). These issue references record provenance; the behavior above is the current contract.
