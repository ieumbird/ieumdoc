# Continuous document editing v1

- Status: Implemented
- Select-all verification: 2026-10-29 (#751: Editor tests, typecheck/build, docs and targeted persistent Windows Chrome continuous-editing, footnotes, figure-authoring and image-assets regressions; Cmd+A uses Apple platform emulation).
- Title contract update: 2026-10-29 (#722; frontmatter-only title and H1–H6 body sections replace the #255/#472 leading-H1 policy).
- Empty-title entry: 2026-10-30 (#786; small bilingual optional-title hint, preserved slot height and immediate title typography; document-title browser regression and [captures](figure-authoring-v1.md#empty-authoring-entry-786)).
- Last verified: 2026-10-28 (#637: in-document block equation form, native input drag/paste isolation and wider wrapping inline math form; targeted Editor and browser checks and same-state 1440/640px captures).
- Equation metadata verified: 2026-10-30 (#788: separate metadata/source entry, explicit completion boundaries and Undo, dialog exclusion, pointer caret, tab switching and applied-only Save; targeted browser checks and [1440/640px captures](ui-patterns-v1.md#p04-적용취소완료)).
- Property Apply verification: 2026-10-27 (#576: shared Ctrl/Cmd+Enter submission, validation/busy guards, IME/modifier exclusions and prose hard-break isolation; Editor tests and targeted Windows Chrome browser regressions, with Apple platform emulation rather than native macOS).
- Code-language verification: 2026-10-28 (#645: selection-only menu, common grammar choices, preserved unlisted values, typeahead, language/body Undo/Redo and exact disk Save/Reload; [verification](#code-language-selection-verification-645)).
- Native focus selection: 2026-10-26 (#542: restore the retained selection before the observer can accept Chromium's native focus caret; real-click Command center and held-check browser regressions. #502 remains separate).
- Selection-race scope: 2026-10-26 (#489: citation-form focus, closing Reload focus and empty-title pointer selection. The separate table selection investigation is #502. Per-scenario evidence and the #421/#416 boundary are recorded in the [test guide](../test/README.md#focus-and-selection-race-investigation-489)).
- Body-heading verification: 2026-10-26 (#472: Editor 287/287, typecheck/build, docs check; new-document, structural-block-authoring, document-title, basic-blocks and markdown-input browser regressions with the worktree's persistent Chrome profile. New insertion/menu unit assertions and browser insert/H2 promotion regressions failed on unchanged implementation before the fix).
- Double-click verification: 2026-10-26 (#470: equation-insertion checks display-formula entry through Edit, LaTeX-field focus, Cancel/Escape caret restoration, unchanged document and Undo/Redo, and an existing draft; the new entry assertion failed before the change).
- Inline math focus verification: 2026-10-26 (#460: Apply/Escape immediately restore editor focus and the caret after the formula; inline-math-authoring checks subsequent typing and Undo, alongside equation-insertion, equation-node-selection-typing, inline-math-split and property-drafts browser regressions).
- Previous Equation-end verification: 2026-10-25 (#436: `/Equation` at the document end → Apply → Enter/ArrowDown/Control+End or direct typing; the end gap cursor and explicit node selection both reached following prose. #714 supersedes explicit node-selected typing with the input-ignore policy below; gap-cursor input and the other key commands are unchanged. Browser regression also checks Chromium composition and disk Save/Reload; native OS IME is not tested).
- Previous verification: 2026-10-25 (#429 document-end shortcuts, including integration with #431/#433/#432: Editor 281/281, typecheck/build, focus-caret, continuous-editing and table-authoring browser regressions; final Figure/table, delayed focus check, native Shift selection and Apple keymap emulation on Windows Chrome; native macOS not tested).
- Table Tab verification: 2026-10-25 (#430 last-cell Tab row addition, including integration with #431/#433: Editor 281/281, typecheck/build, table-authoring and continuous-editing browser regressions including first-cell focus, typing, one-step Undo and disk Save/Reload).
- Whole-document Undo verification: 2026-10-25 (#427: saved/new/applied/local-asset Figures, Backspace/Delete and Undo/Redo; figure-authoring, image-assets and atom-boundaries browser regressions; Editor 280/280, typecheck/build).
- Previous verification: 2026-10-24 (#387 atom boundary selection: Editor 273/273, typecheck/build, six browser scenarios including the 48-case keyboard matrix, visible selection, deletion, Undo/Redo and disk Save/Reload).
- Previous verification: 2026-10-23 (source 7a214dcb lookup/handle/display-numbering changes: Editor 271/271, typecheck/build, eight browser regressions and actual 2000/5000-block input plus complete canonical Save/Reload; mixed 2000 input p95 111.7ms remains above 100ms; [evidence and limits](../reviews/editor-guard-performance-2026-10-23.md)).
- Previous verification: 2026-10-23 (citation scope reconciled with the implemented units A–C [Citations contract](citations-v1.md); documentation comparison only).
- Previous verification: 2026-10-22 (#332 citation atom preservation through editing, typed clipboard, history and Save → Reload; [Citations](citations-v1.md)).
- Previous verification: 2026-10-19 (#255 document title: Core section/native tests, Editor save and section-command tests, the `document-title` browser scenario and CLI refusals on a scratch file; same-state 1440px captures against `a3d8992`: untitled [before](assets/document-title-255/before-1440-untitled.png)/[after](assets/document-title-255/after-1440-untitled.png), titled (unchanged) [before](assets/document-title-255/before-1440-titled.png)/[after](assets/document-title-255/after-1440-titled.png)).
- Previous verification: 2026-10-16 (Equation node-selection typing, IME-keydown composition and accepted paste, Undo/Redo and real Save/Reload; #275 property-close typing for Equation/Figure/Table/section label; ADR-0006 native editing boundary compared with code/tests). Previous verification: 2026-10-15 (#275 property-close typing). Previous verification: 2026-10-12 (heading Tab/Shift+Tab, history, selection and Core Save/Reload regression).
- Property-entry verification: 2026-10-27 (#557: selected-node Enter regression fails on unchanged master `c3f7153`; Figure/Table/math share explicit property entry and draft lifecycle. [Same-state form comparison](../reviews/editor-visual-language-history-2026-10-30.md#property-form-comparison)).
- Scope: Supported continuous editing and Core-backed persistence; [ADR-0001](../adr/0001-single-document-editor-architecture.md).

## Empty structural elements (#574)

New and existing empty admonitions, quotes, list items and display equations are authored
structure and save by the same [Core rules](document-support-v1.md#empty-structural-elements-574).
Space-only input in an admonition, quote or list item also saves: Core normalizes it to
empty content (#624), including whitespace inside formatting-only marks and break-only content.
Links retain their URL/title even with a whitespace-only label; formatting that cannot
round-trip is refused with guidance while the original file remains unchanged.
Save acknowledges the current Editor state without replacing it; reopening shows the
empty structure and its guidance. Meaningful inline nodes and content with visible text
keep the existing save rules. Editor does not implement a separate whitespace predicate.
Empty equations retain their official numbers. Apply may clear an equation; Cancel/Escape
restores its applied value (including empty) and never deletes the block. New equations still
auto-open their form. Changed property drafts remain excluded from Save until Apply.

Empty elements show localized guidance: “Enter admonition text”, “Enter a quote”,
“Enter a list item” and “Enter an equation”. Text surfaces use view-only decorations/NodeView
attributes and CSS generated text; the atomic equation uses a noneditable NodeView surface.
These prompts use the Figure empty-state subtle text and small sans-serif type tokens,
never enter Core content/clipboard serialization, and disappear as content is entered.
Language switching refreshes guidance without changing document state or history.

### Empty-element verification and visual comparison

Before changes, the pinned MyST probe parsed empty admonitions, `>`, bullet/ordered
markers and dollar math, while native admission refused the first three and the
canonical equation writer produced `mystDirectiveError`. The implementation keeps
MyST's own empty node shapes and full semantic/re-serialization checks.

Core tests cover all supported admonition kinds, nested empty list items, empty/filled
transitions, equation numbering, label rename, and located refusal without mutation
for labels that dollar math cannot preserve. CLI tests exercise existing command inputs
and real file preservation. Editor tests exercise insertion, dirty-state collection and
Host replay. `empty-elements` checks actual disk Save/Reload, unchanged Editor state,
localized display-only prompts and typing/Undo. `equation-insertion` also checks empty
Apply, Cancel preserving the structure, and clearing an already applied new equation.
The latter first reproduced an automatic form reopen; automatic entry is now limited to
insertion/remount, not every transition to empty. No retry or timeout change was used.

Local checks: Core, CLI and Editor package tests, workspace typecheck, Editor production
build, docs/whitespace, and `empty-elements`, `equation-insertion`,
`equation-save-during-edit`, `list-authoring`, `admonition-authoring`, `layout-rules` and
`quiet-document` passed. Edge and packaged Desktop checks are left to CI.

The first CI artifacts exposed two test assumptions: `empty-elements` left Korean
as the shared profile preference, and `ui-language` expected a now-valid empty block
equation to fail. The former restores its preference in `finally`; the latter uses
the existing empty inline-math refusal to retain live error-translation coverage,
including unchanged document and draft checks. `ui-language`, `empty-elements` and
`quote-save-reload` also pass in one sequential local run. No retry or timeout increase
was used to address either failure.

Capture-only `pnpm browser:test empty-elements --screenshots` uses identical scratch
content, insertion commands, scroll, fonts and 1440/640×900 viewports. Before is the
base product at `1304a90e650d8cd54a7c0a0c5368a4d854dfa93e`; after is #574. Four small
review PNGs are retained; traces and generated logs remain under ignored `tmp/`.
Windows Chrome reused this checkout's persistent profile. BadPasswordAttempts was 0
before its first launch and 1 thereafter; each launch checked below the owner threshold.
Runner-owned servers and browser contexts are closed after each execution.

| Viewport | Before | After |
| --- | --- | --- |
| 1440px | [PNG](assets/empty-elements-574/before-1440.png) | [PNG](assets/empty-elements-574/after-1440.png) |
| 640px | [PNG](assets/empty-elements-574/before-640.png) | [PNG](assets/empty-elements-574/after-640.png) |

## Code highlighting

Highlighting is display-only and keeps the existing lowlight common language set. Its grammars load when a code block first exists, without changing document, selection or history. Empty/unregistered languages or a grammar load failure keep literal editable code and its language; language edits still use the existing Core code operation and canonical fence. The deferred chunk reduces the initial entry, not total deployment size.

Triple-clicking the code body's `<pre>` padding or blank line area selects only the code
textblock, matching engine-handled text clicks (#724). The same editable-wrapper boundary
as Figure/Table captions otherwise allowed native selection into the next paragraph.
The shared mousedown handler prevents that default selection; subsequent typing/deletion
preserves neighboring blocks. Code-language controls and normal code drag selection
retain their existing behavior. `caption-selection` covers this shared failure path.

The code-language control is a single 28px compact outlined dropdown button (#645),
showing the current literal language or localized Plain text for an empty fence.
This supersedes #499/#527's direct-input decision. The shared DropdownMenu owns Tab/Enter/Space
entry, arrow navigation, typeahead while open, Enter selection, Escape dismissal and focus return.
Radio items expose the current choice through a check mark and `aria-checked`.
Read-only documents disable the trigger.

Plain text (empty language) is first, followed by the original 16 choices and the remaining
lowlight common grammar names. The static metadata lives only in `code-language-options.ts`,
without importing the deferred grammar module. `plaintext` is represented by Plain text;
`html`/`xml` and `bash`/`shell` remain distinct literal fence choices. No aliases are normalized.
An unlisted value from a file or CLI (including `js`, `mermaid`, `toml` or literal `plaintext`)
is shown unchanged in the trigger and as a checked menu item. Opening/dismissing the menu
or choosing the current item changes no document data. Only selecting another value edits it.

Language changes and Undo/Redo use the existing Core operation and editor history.
Core and CLI continue to accept arbitrary language names. This Editor-only selection interaction
adds no Core semantics, storage format or CLI command. The removed text field has no local
composition state; code-body composition remains ProseMirror-owned.

## Continuous editing

ProseMirror owns selection, replacement, clipboard slices and history among the existing supported blocks. Core still owns all
persistent changes and canonical semantic validation.

### Select all within an editing surface (#723)

Every textblock (paragraph, heading, list-item paragraph, code block, paragraph
inside a quote/admonition, table cell, table/Figure/Mermaid caption and explicitly
edited endnote body) uses the same Ctrl+A (Cmd+A on macOS) policy (#751).
The first press selects only that block's inline content, including formatting,
inline atoms and supported line breaks. Displayed numbers, properties and other
blocks stay outside it. An empty block retains its caret on the first press.
A consecutive second press, with no intervening editor transaction, selects the
whole document with AllSelection. Any intervening transaction resets this state.
An already complete nonempty block selection (in either direction) expands
immediately, even when made independently; empty blocks require two presses.

NodeSelection (including a Figure/table), cross-block selections and read-only
endnotes retain the engine's whole-document selection on the first press.
Ctrl+A does not enter endnote editing or change its input protection. During
composition inside an editable textblock the shortcut is consumed without
changing its content or composing selection. Mouse drag and Shift+click
multi-block selection remain engine-owned and unchanged.

`EXPAND_SELECT_ALL_TO_DOCUMENT` in `document-interaction.ts` is the single product
policy switch, currently true, with no settings UI. When false, repeated presses
and already complete ranges stay inside the current textblock; node, cross-block
and read-only-endnote selections are retained instead of expanding. This switch
controls this Editor shortcut, not pointer selection or Core/CLI semantics.

Replacement and Backspace use the engine's normal text transactions and history;
one Undo restores the rich content. This is Editor-only selection behavior and
adds no Core operation or CLI surface. The existing `continuous-editing` browser
regression covers selection, replacement, Backspace, empty surfaces, Undo and
Chromium composition across these textblocks, including Mermaid caption input/model
checks restored with [#750](https://github.com/litzio/litzio/issues/750).
The separate caption regression also verifies composition cancellation and real-file
Save → Reload; see [Figure authoring](figure-authoring-v1.md).
Native Windows IME and native macOS
keyboard behavior remain manual verification boundaries.

### Shared history and editing boundaries

With focus on a nonediting surface in the active document window (paper margin,
gray background, sidebar, tab chrome or nonmodal notification controls), Undo/Redo also dispatches to that active
Visual editor's existing keymap (#772). It uses the same focus return and engine
selection restoration as command-center Undo/Redo, including input-rule precedence.
Native input/textarea/contenteditable history remains local. Open dialogs, command
center and Settings, Source/comparison/read-only tabs, busy sessions and IME composition
exclude this shell dispatch. Other tabs/windows are untouched. Keyboard dispatch does
not apply or discard unrelated property drafts; the existing draft lifecycle still
governs changes to their own target. This is Editor interaction, with no Core/CLI change.

While a modal is open (#831), native Undo/Redo may edit only inputs within that
modal's portal subtree. Chromium shares native input history across the document;
the shared Dialog cancels `beforeinput` history actions targeting outside that
boundary before they edit or transfer focus. Native input Undo/Redo inside the
modal remains available, including after its own history is exhausted. Descendant
menus remain inside the boundary; a nested modal enforces its own narrower boundary.
This includes Settings, confirmations, command center and file dialogs. Base UI
continues to own focus trapping, accessibility hiding and dismissal. Nonmodal
notifications retain the shell history behavior above.

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

Unchanged block-handle rows retain their rendered controls, while geometry, visibility, menu state, move restrictions
and language changes still update them. Geometry reads are retained; equal measured geometry
reuses the previous state. Source-path identity also invalidates that state,
and draft changes invalidate the hint callback, preserving move permissions after reorder or
same-sized content changes. Equation/Figure/Table display numbers share the Core-computed result
only for the identical immutable engine document, as endnote/citation numbering already does.
A changed document recomputes numbering; source semantics and canonical output are unchanged.

- Enter splits prose and headings, exits a heading at its end, and creates space
  beside an atomic block. Enter on a selected Figure/Table/Equation opens properties,
  as described below. Backspace/Delete use engine joins and selections. A
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
- With a caret in an editable top-level heading, Tab changes H1 to H2 (one level
  deeper), and Shift+Tab changes H2 to H1 (one level higher). Each change is one
  Undo step and keeps content and caret. Tab at H6 and Shift+Tab at H1 keep the
  heading and focus unchanged. A text selection still uses Tab to reach its
  formatting toolbar; table, list and code Tab behavior is unchanged.
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
- Figure, Table, block Equation and inline math distinguish selection from property editing (#557).
  A single click selects the object without opening a form. Double-click or Enter on an
  engine node selection opens its properties; block objects also keep Edit. The Table's
  metadata number area is its object selection/double-click surface. Figure (including
  Mermaid), Table and block Equation label chips open the existing metadata popover and
  focus Label on click or keyboard Enter/Space (#847); block selection itself still opens
  no form. Cells and both Figure/Table
  captions retain normal text/caret/word selection. Figure image, empty-content and error
  surfaces and block/inline formula previews use the same property entry path.
- Endnote definitions use the same explicit selection, Enter and double-click entry pattern for
  in-place editing. Their read-only state and the ownership of their formatting and insertion
  tools are specified in [Endnotes](footnotes-v1.md#editor).
- Opening properties changes neither document nor history; re-entry preserves the current
  draft and error. A newly inserted empty Equation still opens automatically. Block Equation
  edits in its document position: a full-column, auto-growing code-style LaTeX field, draft
  preview with computed number, label and actions. Inline math uses a wider BlockProperties
  popover with a wrapping multiline field; pasted line breaks become spaces and plain Enter
  submits as before. Both forms use explicit Apply, Cancel and Escape. Outside
  click, blur and selection movement neither apply nor discard drafts. Save/Source and tab
  switching retain them under the [editing-session contract](editing-session-save-v1.md#applied-content-and-drafts).
  Block Equation's upper Edit opens a separate label/number metadata popover (#788).
  Formula double-click and node-selected Enter still enter the source form directly (#637).
  Only one of these forms can be open: keyboard re-entry while metadata is open retains its
  draft/error; source editing hides the metadata entry. Metadata's Edit source first applies
  valid label/number values, then opens source with those applied values and the current LaTeX.
  Invalid values keep metadata open. A pointer on the formula completes valid metadata like
  any outside click; once it is closed, double-click enters source. Cancelling source discards only that source
  form's changes, preserving metadata already applied before entering it. Entering source with
  unchanged metadata adds no document change or Undo step.
  Native text drag/drop and paste within a block Equation source or label field change only
  that draft; they do not create document content or history and Cancel leaves Save unchanged.
  Deferred opening focus for Equation, Mermaid and image Figure properties is cancelled by
  any trusted pointerdown or keydown after scheduling, including input inside the form,
  Tab/Shift+Tab out of the form, caret movement within the same editor and a trip back
  to the original focus owner. Once the user interacts, opening focus has no work left. The opening
  pointerdown/Enter precedes the capture listeners; keyup is not a cancellation signal.
  Programmatic focus is not user input, so the insertion command's editor focus return does not
  cancel the pending source focus. Listeners are removed on execution, cancellation and unmount.
  New Equation and Diagram insertion still hands focus to their source field on the next frame.
  Escape in a focused block menu closes that menu and preserves the property draft (#664).
- Figure, Table, block Equation and section-label metadata share the target-wide metadata popover (#791, #788;
  [Figure placement/completion](figure-authoring-v1.md#anchored-figure-properties-757)).
  Done/outside pointer completion applies and Escape cancels. Invalid input retains the
  form and values. Keyboard focus movement alone does not apply; keyboard Save includes
  only applied content. Outside pointer completion preserves the clicked focus/caret.
  Clicks inside a separate dialog (confirmation Cancel/Keep editing or Settings)
  retain the metadata form and draft; they do not complete the edit.
  Existing preview typing guards and source/inline Apply/Cancel behavior remain.
- Mermaid Figures reuse the block Equation's in-document source editing surface and shared
  PropertyForm, with draft preview, label and explicit Apply/Cancel. Caption editing stays in
  the document. The [Figure contract](figure-authoring-v1.md#mermaid-editor) defines rendering,
  source normalization and error handling; the same draft, focus and native input drag rules apply.
- In any shared properties form (Equation, inline math, Figure, Table or section label),
  Ctrl+Enter on Windows/Linux or Cmd+Enter on macOS submits the same Apply path, including
  validation and errors. Busy forms ignore Apply. Composition and Shift/Alt-modified keys
  do not Apply; plain Enter inserts a newline in block Equation/Mermaid source and Escape cancels.
  The binding is local to the form; prose Mod-Enter keeps its existing hard break behavior.
- Applying, cancelling or escaping an inline math form immediately restores the editor caret
  just after the formula, preserving its marks and subsequent typing. Remove keeps the existing
  explicit conversion to applied source text. Each inline form registers its own draft even
  when several belong to one paragraph; cancelling one never clears another.
  This is Editor interaction only and adds no Core operation or CLI command.
- Closing block properties with Apply, Cancel or Escape retains a text selection
  already inside the edited block (a Figure caption or Table cell). Otherwise,
  focus returns to a collapsed caret just after the block: the start of following
  text, or the engine's gap cursor at a closed block boundary/document end. This
  focus move adds no document content or history event. Subsequent typing edits
  that text or creates prose at the gap; it does not replace the applied block or
  lose its reference target. Section-label properties return to the following
  heading, keeping the label directly before it. Ordinary character input and IME
  composition on a node-selected Equation, image/Mermaid Figure or read-only endnote
  are ignored (#714 owner decision). They do not replace the block or caption,
  create a paragraph or add a history step, with or without an initial `Process`/229
  keydown. The shared selected-preview input boundary keeps the native typing surface
  read-only throughout the block selection, without blur or deferred focus restoration;
  clicking another text surface permits normal
  input again. This policy changes no Enter, arrow, Delete/Backspace or clipboard
  commands. Accepted clipboard slices still
  go below a node-selected Equation, in one undoable transaction, retaining the
  existing unsupported-content and duplicate-label checks. An accepted empty slice
  is consumed without changing the Equation, label, selection or history, and
  without creating a paragraph. Backspace/Delete on a node-selected Equation still use
  the engine's normal deletion. Other node kinds retain normal engine replacement
  behavior.
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
  Fixed Figure/Table/Equation enumerators travel with the typed attributes and the
  new-locator insertion payload; Host replay uses Core `updateEnumerator` so Cut/Paste,
  drop/copy and duplicate normalization preserve them through Save/Reload (#720).
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
A Table caption is a required last child of its Editor table; its authored content may be
empty (Save omits an empty caption). It is edited directly below
the grid with the shared rich-inline controls. Properties contain only Label. The caption
input surface is always present without an Add caption step; clearing it removes saved
caption content.
Rows/cells keep their existing coordinates. ArrowDown from the final row enters the
caption, ArrowUp returns to the last cell, and Enter leaves the table. Whole-table move,
delete and history include the caption. Core `updateTableCaption` and canonical MyST stay
unchanged; see [Table caption and label](table-caption-v1.md).

Equation block metadata uses Core's document equation reference template (#676),
for example `식 (2)`. Without an authored template it combines the UI-language
Equation name with Core's default number text. Without a number it keeps only the
UI-language name. As for Figures, the properties form's accessible name uses the
same visible kind text, followed by the localized properties suffix. The number
beside the rendered formula remains `(2)`. This is display-only; Core semantics
and CLI operations are unchanged.

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

Owner decision (2026-10-29, #722) replaces #255's leading-H1 title and #472's
H2-first authoring policy. The document title has one storage source: optional
frontmatter `title`. It is a single-line plain string, including an empty string.
Core operations, Native admission and final writes refuse line separators
(LF/CR, VT/FF, NEL, U+2028/U+2029), YAML literal/folded block scalars (`|`/`>`,
including chomping variants), inline formatting, math and nonstring values with
`native-metadata` and single-line corrective guidance; none are flattened.
An absent title or an empty document is valid. No body heading is inferred, duplicated or synchronized as
the title. The title has no label or reference target.

Core `EditableDocument.title` exposes the optional string.
`updateDocumentTitle(document, string | null)` sets it or removes the field with
`null`, using the shared YAML library and preserving other metadata/comments.
CLI `update-title <file> (--text <text> | --remove)` calls that operation; an
empty `--text` stores an empty title. It supports the existing revision guard,
dry-run and `apply-batch` (`text` or `remove: true`). `inspect` displays the title
separately from body nodes (JSON `title: null` means absent).

Editor keeps the title input above the body, preserving its one-line title slot height
when empty (#786). The empty placeholder is vertically centered small UI text: `Add a title (optional)` /
`제목 추가(선택)`. Input uses the document font/H1 size immediately; clearing it restores
the small hint. The focus outline sits outside the slot with the existing spacing token,
leaving visible room around both hint and title without moving the input or body. Both are
plain text only. Its value is a
ProseMirror document attribute in the same state/history as body edits. It does
not create an editor body block or snapshot path, and does not appear in
Outline. Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z use engine history while the input is focused.
Tab reaches the title after document settings, then enters the body editor.
Enter, including Shift+Enter, enters the existing body without inserting a line
break. Input/paste replaces runs of line separators with one space, following
the existing inline-math input convention; other characters and surrounding
spaces are retained. Visual wrapping does not add stored line breaks. Save and
Source replay the Core title operation. Recovery snapshots and their plaintext
salvage copy retain the title. Clearing the input stores an empty string.

Every H1–H6, including a leading H1, is a body section. Body insert/slash and
Paragraph/Heading conversion menus offer H1–H6 (current level excluded in the
block menu). Heading marks and references retain their existing rules. The
leading H1 and its label can move, accept preceding blocks, change level, or be
removed like other sections. There is no fixed-title guard, label exception or
Save replay bypass. Adding, changing or removing metadata title never changes
body heading levels, labels or content. `litzio: 1` remains unchanged; existing
leading-H1 input opens as a body section without migration.

Stored logical levels are independent of output heading placement. The installed
MyST compatibility observations and numbering boundary are recorded in
[Heading numbering](heading-numbering-v1.md#myst-title-and-output-boundary-722).

### Title verification and captures (#722)

Single-line title boundaries preserve surrounding spaces, quotes, colons, `#`,
strings resembling YAML null/boolean/numbers and Unicode exactly, independent
of key order and other metadata edits. Core regressions check direct operations,
opening and final write refusal of multiline/block-scalar titles, exact reopened
values and byte-identical second writes. Frontmatter keeps its actual final
line terminator; admitted block-scalar reference templates retain their trailing
spaces/newlines in either key order and through every metadata write operation.

Core title admission/operations/canonical reopening, CLI single/batch/revision/refusal
writes, Editor metadata history/recovery and real HTTP title Save are covered by
existing suites. The `document-title` browser scenario verifies absent/empty titles,
Undo/Redo, Enter, Source, actual Save → Reload, H1 movement with its label, and
Core-numbered section references. Existing `new-document`, `structural-block-authoring`,
`block-move`, `outline`, `recovery-structure`, `layout-rules`, `quiet-document`,
`focus-caret` and `equation-save-during-edit` cover the interface consequences. Old fixed-H1/H2-first assertions are replaced by
positive movement/H1-authoring assertions under the 2026-10-29 owner decision;
Native refusal and semantic round-trip checks are retained.

Manual captures use 1440×900 and 640×900, English/light, fonts ready and the same
checkout-owned persistent Chrome profile. Before is master `6d9f8d4e`; After is
this change. The existing-file comparison uses the same source and sidebar fixture
inventory; its empty metadata input and ordinary body H1 are the intended change.
The authored example is a separate file demonstrating title, numbered H1/H2,
Outline and section reference agreement. Manual review confirms title wrapping,
body alignment and no horizontal overflow at 640px. Screenshot-only capture passes
are manual evidence, separate from automated assertions. Large runner traces/logs
remain uncommitted. [Capture metadata and SHA-256 hashes](assets/frontmatter-title-722/capture-metadata.json).

| Viewport | Before, existing file | After, existing file | After, authored title/body |
| --- | --- | --- | --- |
| 1440px | [Before](assets/frontmatter-title-722/before-1440.png) | [After](assets/frontmatter-title-722/after-existing-1440.png) | [Authored](assets/frontmatter-title-722/after-authored-1440.png) |
| 640px | [Before](assets/frontmatter-title-722/before-640.png) | [After](assets/frontmatter-title-722/after-existing-640.png) | [Authored](assets/frontmatter-title-722/after-authored-640.png) |

## Sections

Block-menu Move up/down (#516) reuse the drag reorder transaction and Core
`moveBlock` Save replay (CLI `move-block`). Each swaps one adjacent body block in
one Undo step; a heading moves alone, independently of the existing section commands
below. Endnote, boundary and active-draft restrictions match drag.
See [unified menu behavior](editor-ux-shell-v1.md#unified-action-menus-516).

A section can be moved or deleted. It is computed from the current
top-level blocks: a heading, the label targets directly before it, and the blocks up to
the next heading of the same or a higher level. It has no identity or Markdown syntax
of its own (ADR-0003). One Core rule (`@litzio/core/section`) serves Core `moveSection`/
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
still goes through Core validation. Litzio's typed clipboard is not normalized, and
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

### Code-language input verification (#499/#527)

Historical evidence: #645 supersedes the free-text input and its composition handling.
The measurements and captures below describe the former control. Current behavior is
defined in [Code highlighting](#code-highlighting) and verified below.

On baseline `ff37a32e273dfad90bde84a9c30e2a28ec5e3af3`, CDP updates `ㅎ` → `한글`
and `Input.insertText(한글)` produced `ㅎ한글한글` in the language field. An independent
native input outside the editor and the code body both produced `한글` once. Tracking
the field's value setter identified React `restoreStateOfTarget` restoring the old
NodeView attribute after each input event, followed by the new attribute during React's
commit. Writing the old value destroyed the browser's composing range; the second update
started another composition. This confirms the controlled NodeView field's fault under
the automated lifecycle; it does not claim verification with a native Windows IME.

The existing `code-highlighting` regression now checks keyboard menu selection and
dismissal, custom/empty names, fence-name filtering, attribute/input Undo/Redo, each
composition update immediately, commit/cancel, code-body composition and Undo/Redo,
then exact canonical disk Save and Reload. The code body's existing behavior required
no change. Editor tests (291/291), workspace typecheck, Editor build, `layout-rules`,
`quiet-document`, `code-highlighting`, docs and whitespace checks passed locally.

Queue follow-up (2026-10-27, run `40344185308`, with #560): the menu was visible before its
frame-scheduled focus reached an item. The trace sent End less than 1ms after the visibility
wait returned and then Enter about 2ms later; both keydowns targeted the trigger, which
closed the menu without a language transaction. The regression now waits for the first
item's actual focus, then the intended item's focus before confirmation, and checks both
the input and engine language together after selection. No retry or timeout increase is
used, and the composition-update assertions above remain immediate.
Local probes on master `3a8be3ec509e9c647a913a3e631984fb75434065` integrated into this
branch selected the language correctly with 50ms and 100ms key holds (three trials each).
The corrected full `code-highlighting` scenario passed three consecutive runs with the
same Windows persistent profile, without retries. The integrated Editor suite passed
291/291; docs and whitespace checks passed. This is a test readiness correction; no
product code was changed for the queue failure.

Same-state manual captures: English, bundled Pretendard, Windows Chrome 155, DPR/zoom 1,
900px height, scroll top, code language `js` focused, identical composed body text. The
menu-only captures show the new disclosure after clicking it. These images do not assert
native IME behavior. [Protocol, setter evidence, environment and hashes](assets/code-language-499/verification.json).

| Width | Before | After | Language menu |
| --- | --- | --- | --- |
| 1440px | [PNG](assets/code-language-499/before-1440.png) | [PNG](assets/code-language-499/after-1440.png) | [PNG](assets/code-language-499/menu-1440.png) |
| 390px | [PNG](assets/code-language-499/before-390.png) | [PNG](assets/code-language-499/after-390.png) | [PNG](assets/code-language-499/menu-390.png) |

### Code-language selection verification (#645)

The existing `code-highlighting` scenario now verifies the selection-only control, all
common grammar names except the deliberately merged `plaintext` choice, retained html and
powershell, the checked unlisted `js` value, no document/history change on menu dismissal,
Base UI typeahead to rust, selection and Undo/Redo, empty language and python-repl selection,
code-body composition Undo/Redo and exact canonical disk Save/Reload. The language-input
composition/filtering tests were removed with that input. Deferred/failed grammar loading,
unknown-language fallback and theme contrast remain covered. The read-only transition test
exposed a stale NodeView editability snapshot; CodeBlockView now subscribes through the
existing useEditorState hook, disables menu choices and guards the existing update callback.
The popup explicitly uses its localized menu name instead of the trigger's current-value name.
Editor tests (317), workspace typecheck, production Editor build, `code-highlighting`,
`layout-rules`, `quiet-document`, docs and whitespace checks pass locally. The build retains
a separate deferred code-languages grammar chunk (139.88 kB). Master `15ef77e` (#640)
was integrated without conflicts; the same targeted checks pass on the combined tree.
Native Windows IME, Edge and
packaged Desktop were not tested locally; their existing CI/manual boundaries are unchanged.

Manual Before/After uses base `c71063faac8357880c079c03fa7577da1b0cb188`, the same scratch
`tmp/code-highlighting/code.md`, English, bundled Pretendard, persistent Windows Chrome,
1440×900 / 640×900, DPR/zoom 1, scroll top, language `js`, unchanged code body and pointer
at (0,0) for the closed control. Open-menu images follow a physical trigger click.
Only these representative PNGs are retained; generated traces/logs and the temporary
capture driver remain outside Git. These are manual visual evidence, not pixel gates.

| Width | Trigger Before / After | Menu Before / After |
| --- | --- | --- |
| 1440px | [Before](assets/code-language-645/before-1440-trigger.png) / [After](assets/code-language-645/after-1440-trigger.png) | [Before](assets/code-language-645/before-1440-menu.png) / [After](assets/code-language-645/after-1440-menu.png) |
| 640px | [Before](assets/code-language-645/before-640-trigger.png) / [After](assets/code-language-645/after-640-trigger.png) | [Before](assets/code-language-645/before-640-menu.png) / [After](assets/code-language-645/after-640-menu.png) |

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

`equation-node-selection-typing` covers actual preview selection and ignored ASCII
typing and CDP composition commit/cancel, with and without an initial IME keydown
and with repeated `Process` keys. The cancellation cases include Escape keydown followed
by a late empty composition ending after two animation frames. These inputs leave the full document, Equation/label,
rendered text and history unchanged, without adding a paragraph. A real body click
then permits ordinary composition and English input. Initial, post-composition and
control-focus-return `typing-again` cases check that native focus cannot redirect ignored
letters into the title. Shift+arrow/Home/End retain the existing native range extension,
and navigation followed by late cancellation preserves the document. The scenario also retains
single/multiline plain-text clipboard paste, duplicate-label paste refusal,
comment-only HTML paste as an empty-slice no-op with Undo/Redo preservation, real disk
Save/Reload and explicit Backspace/Delete. The Process-first path models the ordering in
[UI Events](https://www.w3.org/TR/uievents/#events-composition-key-events).
It does not verify a Windows Korean OS IME or candidate selection. Composition input,
with or without a preceding `Process`/229 keydown, is rejected on
selected Equation, image/Mermaid Figure and read-only endnote previews by the shared
`rejectPreviewComposition` handler at `compositionstart` and `compositionupdate`.
The native typing surface stays noneditable while that block is selected, so completion
or a late empty cancellation has no editable block range to replace. A focused read-only
root also retains the engine's block selection when Chromium proposes a default title
caret. The engine's logical editability remains enabled for existing keymaps and clipboard
commands; native range-extension navigation uses the engine/browser's existing selection
path. Explicit property-close commands enable native input before asking the engine
for their caret/gap cursor, even when the editor root already has focus.
A real text-surface click completes engine focus before enabling native input (#760), so
Tiptap's focus-only transaction cannot restore the preview's read-only root before that
click places its caret. This also covers entry from Figure/Equation properties and read-only
endnotes; table properties retain their existing explicit draft lifecycle. A real text-surface
click lets the browser place an editable caret, and explicit engine
navigation likewise restores normal native typing. No key-specific composition release,
blur or animation-frame focus restoration is used. Neither input path creates
an adjacent paragraph; `footnotes` and `mermaid-authoring` cover the same protection
and subsequent body input. Manual Windows Korean IME review remains: select the
Equation preview, type and commit `한글`, cancel another composition, and verify no
document change or new paragraph; then click prose and check normal single input,
Equation/label preservation, Undo/Redo and Save/Reload.

PR #314 review baseline (`3afb44f`): real clipboard paste of `Paste314` replaced
the selected `eq-power` Equation (`P = VI \\cos \\varphi`) with a paragraph and
removed its label. CDP composition (`ㅎ` through `한글`), both with and without an
initial 229 keydown, retained the Equation but appended `한글` to the preceding
`Before the equation.` paragraph. The strengthened adjacent-paragraph assertion
failed on that original implementation. During investigation, moving the caret
at `compositionstart` or routing through gapcursor's `beforeinput` produced
`ㅎ한글`: Chromium restarted its composing range after the first update. These
approaches were discarded. The #314 adapter prepared the caret at the initial
IME keydown, before that range existed; #714's input-ignore policy now supersedes
that placement. In pinned `prosemirror-view` 1.42.4, `input.ts` invokes custom DOM
handlers before its own keydown handler skips key code 229, while `domchange.ts`
can invoke `handleTextInput` during composition. Tiptap remains pinned at 3.31.3.

Review follow-up baseline (`9198093`): after typing `QR`, selecting `eq-power`
and calling `view.pasteHTML('<!-- data-litzio-type="paragraph" -->')` removed
the Equation/label and changed NodeSelection at 29 to TextSelection at 30.
The HTML parser produced a non-null empty Slice; returning false delegated it
to `doPaste`'s default `replaceSelection`. The regression failed on that HEAD.
The handler now consumes this accepted empty slice without dispatching. The same
real paste pipeline is tested with existing undo and redo history, preserving
the full document, selection, focus and the existing paste Undo/Redo steps.


### Figure file name (#652)

Figure properties offer File name (stem only) in collapsed Advanced, with an explicit Rename
action (#757). Done/outside completion never performs this filesystem action; an unconfirmed
filename remains an unapplied draft across reopening, while Escape discards it. Advanced opens
when such a draft or error exists. The field is available for the already applied, loadable document-relative
image. External/absolute URLs, paths containing `..` or backslashes, missing images and a newly
chosen/unapplied Image path hide the field. Apply that image first to rename it. The Host checks
actual regular-image existence, real document-folder containment and #504 root/symlink policy;
a syntactically local hint never grants access. Extension is preserved and Korean stems work.
A collision, invalid name or Host refusal retains all input and shows the reason in the form.
Alt/Label validate before rename and apply only after success. Filename and its reference paths
are excluded from history; Alt/Label keep normal Undo/Redo. Other open forms follow a renamed
Image only if that Image input was unchanged, preserving Alt/Label and custom filename drafts.
A directly edited Image stays as entered and is validated by the existing Figure Apply path;
this preserves explicit user intent rather than silently selecting another file. See [session integration](editing-session-save-v1.md#figure-form-image-rename-652).

## History

The implemented slices were tracked in #41 (continuous editing), #54 (block conversion), #58 (rich headings/cells/captions), #75 (table structure), #76 (sections), and #60 (external clipboard). These issue references record provenance; the behavior above is the current contract.
