# Table caption and label v1

Implementation plan (#584, owner decision 2026-10-27): number every table through
Core and canonically write every table as a `{table}` directive. Keep accepting plain
GFM input; treat its wrapper as an explicit canonical equivalence while retaining
the full reparse/fingerprint guard for grid, alignment, caption, label and other fields.
Caption/label edits must not change table numbers. Existing CLI operations and inspect
provide the command surface; no new option or operation is needed. Editor consumes
Core numbering. No migration, alternate unnumbered table kind or #588 empty-table Save
change is included. Completion requires pinned MyST parsing/enumeration and grid
preservation evidence, fail-first Core coverage, targeted Core/CLI/Editor and browser
checks, comparable 1440/390px captures, docs/typecheck/build and passing PR CI.

Historical implementation plan (#555, approved table-caption portion of #557, 2026-10-26;
empty-caption discovery superseded by #577 below):
make captions editable inline children of the Editor table, retaining existing cell
coordinates and the Core read model/canonical MyST format. Properties edit only Label;
an explicit Add caption action discovers empty captions. Reuse the existing inline
NodeViews, toolbar, history and Core save operations. Figure/equation property rules
are excluded. Completion requires fail-first rich-caption reproduction, preserved
formatting/references/citations, Undo/Redo, Save/Reload, caption removal/addition,
whole-table move/delete, keyboard navigation, targeted Editor/browser checks and
comparable real-product Before/After images. No new Core operation or CLI command:
the existing `updateTableCaption` operation already owns the persistent semantics.

- Status: Implemented
- Fixed numbering: 2026-10-29 (#720 Core/CLI and Editor property controls/warnings); [shared number contract](heading-numbering-v1.md#fixed-numbers-720).
- Empty-caption surface (#577): every editable table exposes its inline caption without
  an Add caption action. An empty surface uses the caption typography and a muted
  italic `Enter a table caption…` / `표 캡션을 입력하세요...` hint while the ProseMirror
  selection is outside it; clicking it starts normal inline input and hides the hint.
  Clearing the text and moving the selection away restores it. Opening alone creates
  neither dirty state nor Undo history, and empty captions are omitted on Save.
- Empty-caption verification: 2026-10-27 (#577: Editor tests, typecheck/build,
  caption/table authoring, references, recovery and layout browser checks;
  [same-state comparison](#always-available-empty-caption-577)).
- Direct-editing verification: 2026-10-26 (#555 and the approved table-caption portion of #557; scope and evidence below).
- Caption-label verification: 2026-10-26 (#462 Core template rule, CLI inspect, cross-reference browser immediate update, Undo/Redo, Source and Save → Reload).
- CLI insertion verification: 2026-10-15 (#280 caption/label in one write, label-only table, invalid/duplicate label refusal and rich batch caption; Core/CLI tests).
- Last verified: 2026-10-17 (UX review: Edit moved to the table's action bar; table-authoring and property-drafts browser checks).
- Previous verification: 2026-10-11 (contract compared with current code and regression coverage; caption inline math and reference display, #165).
- Scope: Core table caption/label operations and their Editor/CLI interfaces; [Table interaction](table-interaction-v1.md).

Issues #94 / #584. Core owns `updateTableCaption`, table `updateLabel` and table numbering.
Every table receives an automatic number in document order or an authored fixed number, regardless of caption or Label, and is
canonically written as a MyST `{table}` directive. Without caption or Label, the directive
has neither an argument nor `:name:`; its optional fixed number uses `:enumerator:`.
Plain GFM input remains supported and is normalized
on any official write. Canonical writing uses the existing Markdown writer for the caption
and GFM grid, then verifies the complete semantic round-trip. The fingerprint treats only
the plain top-level table and its empty directive wrapper as equivalent; grid content,
rows/columns, alignment, caption, Label and other fields remain checked. Cell paths remain
logical `[block,row,column]` regardless of the directive wrapper. No migration or alternate
unnumbered table kind is introduced.

Editor uses the existing single document state. Captions are edited directly below the
table, including formatting, links, inline math, cross-references and citations, with the
same inline controls as Figure captions and prose. A table owns its caption: moving or
deleting the table includes its caption, and Undo/Redo restores them together. ArrowDown
from the final grid row enters the caption; ArrowUp from its first line returns to the
last cell. Enter leaves the table. Emptying a caption removes its persistent content.
Every empty caption surface shows its official `Table N.` and, while the selection is outside,
the input hint. Filling or
clearing the caption or Label never changes the table's kind or number, nor the numbers
of later tables. References to a retained Label therefore keep their number. Clearing a
Label retains reference text but makes references to that removed target unresolved.
The Editor uses Core numbering, without a separate prospective-number rule.

Hover a table and choose Edit (the pencil below the grid, beside Table actions, which
also offers Edit label). The properties form contains Label and Number; Apply/Cancel and
unsaved-draft protection apply to both fields. It preserves the live caption, including
edits made while properties are open. The inline caret surface is present below every
editable table, including after clearing and reopening. No Add caption button is needed.
Read-only captions retain existing content and official numbers, like Figure captions,
but omit the editable empty-input hint. Save omits empty caption content. Cell and row coordinates remain
unchanged. CLI and Editor share the Core read model and numbering rule.
Table properties expose Number after Label (#720), with the shared automatic placeholder
and empty-to-clear rule. Number-only drafts participate in unsaved-work protection;
Apply changes label and number in one engine transaction and Save replays Core
`updateEnumerator`. Cancel/Escape keeps the applied value. The field shows Core's applicable
missing/duplicate warning; the document Notice also reports warnings. Neither prevents Save.
See the [shared fixed-number Editor contract](heading-numbering-v1.md#fixed-numbers-720).
The Editor schema requires exactly one caption after the rows. Native parsing and
replacement therefore retain the surface even when a range deletion removes everything
after the final cell while keeping the table. No repair transaction or Undo step is added.
Recovery requires that caption child in both checkpoints. The owner ended pre-#577
snapshot supplementation on 2026-10-29 (#705), following AGENTS.md's exclusion of
historical-data compatibility. Unsupported records follow the common refusal and
stored plaintext-copy path in [Editing session and Save](editing-session-save-v1.md).

Whole-table clipboard output retains the empty structural `<caption>` element in HTML
and the existing trailing block separator (`\n\n`) in plain text. The input hint and
generated number are never copied; canonical Save still omits empty caption content.
Changing `setEditable(false)` at runtime removes the hint; reenabling editing restores it,
when the selection is outside, without changing document content, dirty state or Undo history.
The shared Figure/Table rule follows ProseMirror selection, including keyboard and programmatic
selection, independently of DOM focus. The hint is generated with an empty accessibility
alternative; the caption retains its single accessible name. See [visual evidence](editor-visual-language-v1.md#empty-caption-hints-698).

Backspace removes caption text through the normal editor history. At an empty caption's
start, further Backspace leaves the table and neighboring content unchanged. When a native
delete input's target range would empty the caption, the Editor uses that range in a
ProseMirror deletion transaction: native Chrome deletion had
removed the React-owned content wrapper, leaving its contentDOM detached and, for Figures,
the model out of sync. The same boundary applies to image, pending and Mermaid captions.
The `table-caption` browser scenario checks repeated Backspace, word deletion and cut for
each kind, including contentDOM, model, surrounding blocks, Undo/Redo and hint restoration.

Triple-clicking anywhere on the caption line, including its generated number and blank
space after the text, selects only the caption's inline content (#724). Typing or deleting
then preserves the grid and neighboring blocks. The shared Figure/Table mousedown
handler prevents native selection from crossing contentDOM's caption boundary, while
retaining ProseMirror's text-click handling and ordinary drag selection. The
`caption-selection` browser scenario checks native triple clicks and subsequent input
at text, text-end, right-blank and number positions, including consecutive Figures,
Figure before table, table before paragraph, Mermaid and pending Figures.

The caption stays below the table. Its computed number follows the document's authored
Table reference template, retaining the existing `. ` separator; without a template,
`Table N. ` stays unchanged. Metadata and numbered properties accessible names share Core's
display text. [Caption number labels](heading-numbering-v1.md#caption-number-labels-462)
defines the intentional MyST difference, spaces, Undo/Redo, Save/Reload and CLI inspect.
The generated label is never written into caption Markdown.

Changing an existing non-empty label also retargets its same-document references through the shared
[Core-backed label rename](section-references-v1.md#editor) (#374). Caption/label and reference changes
share one Undo/Redo step and survive Save/Reload. Rich caption references and fragment links follow
renamed targets without losing their formatting. Clearing the label retains references as written.
Deleting a referenced target uses the [shared deletion feedback](section-references-v1.md#editor);
unresolved caption references use the same kind-neutral text as body reference chips.

The Editor caption uses the existing single-line InlineContent contract. Its reference
and citation NodeViews are the same ones used in the body, including computed numbers,
readiness, editing and navigation. MyST reads caption citations/endnotes before grid
cells even though the caption is visually below them; numbering follows that Core order.
No generated display text enters Markdown. Merged cells, additional legends and directive
options other than Label (`name` / `label`) and fixed number (`enumerator`) reject native admission. Only plain GFM and
the exact `{table}` directive are accepted; `{csv-table}`, `{list-table}` and other
table directives are refused regardless of caption, Label or options. Before lifting,
Core checks MyST's option map and refuses any VFile diagnostic within the table
directive's source range. The map alone is insufficient: some option names are dropped
before it is built. Thus duplicate/unknown-option diagnostics also prevent admission,
including for YAML options. No new table editor engine or persistence
architecture is introduced.

CLI: `ieumdoc update-table-caption <file> --path <block> --text <caption>` (empty text removes it), or `--content <InlineContent JSON>`. `update-label` accepts tables; `inspect --format json` includes caption, label and computed table number.

`updateEnumerator` / CLI `update-enumerator` sets or clears the `{table}` enumerator.
Caption, label, cell and shape edits preserve it. Plain GFM inputs acquire the same canonical
wrapper when a number is set; every official write already uses that wrapper, including
without caption, label or number. The [shared fixed-number rules](heading-numbering-v1.md#fixed-numbers-720)
define warning-only consistency checks. `{list-table}` and `{csv-table}` remain unsupported,
following the [#597 owner decision](https://github.com/ieumbird/ieumdoc/issues/597).

No new CLI option is needed for #584: `format`, `insert-table`, caption/Label edits and
`apply-batch` already use the Core write path; `inspect` already projects Core numbers.
They now retain numbered directives and report a number for captionless, unlabeled tables.

Insertion (#280): `insert-table <file> --at <index|end> --cells <json> [--align <json>] [--caption <text> | --caption-content <InlineContent JSON>] [--label <label>]` composes Core `insertTable`, optional `updateTableCaption`, then `updateLabel` in one edit and one atomic file replacement. A label does not require a caption. The caption uses the existing single-line inline contract; label validation and collision refusal use `updateLabel` and the shared [label rules](section-references-v1.md#core), including implicit heading IDs. Any failure leaves the original bytes unchanged. `apply-batch` shares the options and accepts `"at": "end"`, resolved by Core before endnotes on the current step's snapshot.

Verification: existing Core/CLI contracts retain canonical round-trip and fail-closed
coverage. Editor grid-command coverage protects rich captions while rows/columns change,
and checks invalid duplicate captions. The `table-caption` browser scenario reproduces
#555 before the fix, then checks rich editing, Undo/Redo, Save/Reload, keyboard entry and
exit, shared selection/slash authoring, whole-table move/delete, removal and addition.
Existing table-authoring, table-cell-editing, cross-reference, property-drafts, citations,
recovery-structure and continuous-editing protect their interface-specific integrations.

Review-fix plan (#584): retain the parser's original `{table}` option evidence before
directive lifting, so native admission rejects every option except the supported Label
spellings (`name` and `label`). Use MyST's parsed option map, with no new source parser.
Apply the same guard to captioned and captionless tables. Verify failure first through
public Core and CLI check/format tests, then unchanged file bytes on refusal, supported
Label round-trips, Core/CLI tests, typecheck, docs and PR CI. No UI or command change.

Second review-fix plan (#584): supplement the option map with MyST VFile diagnostics
within each table directive's source range. Refuse any such diagnostic, without a list
of special option names. At native admission, only the exact `table` directive is
supported; CSV/list-table source is refused regardless of caption or options. Retain
source-kind evidence separately from semantic equality, as native syntax admission
does elsewhere; internal MyST serializer tests do not establish native input support.
Extend fail-first public Core and CLI regressions to inherited option names, YAML
options and alternate table directives, with BOM/CRLF byte preservation and supported
input controls. Verify Core/CLI, typecheck, docs and all PR CI checks.


## Cell code and math preservation (#622)

Keep `{table}` + GFM as decided in [#597](https://github.com/ieumbird/ieumdoc/issues/597).
The canonical writer adds one backslash before every pipe in inline code and math
inside grid cells, including inside marks and links. The pinned MyST/markdown-it
table splitter removes exactly that one backslash before inline parsing, regardless
of how many backslashes already precede the pipe. Authored code/LaTeX strings must
therefore reload exactly, including existing backslashes; no `\vert` substitution
is performed. Math dollar and role forms share this rule. Captions and content
outside cells retain their existing serialization.

Implementation/verification scope: fix only Core's write-only adaptation, retain
the complete reparse/fingerprint guard, and replace the existing pipe refusal
regression with insertion/edit/reopen/repeated-save preservation checks for exact
strings and column alignment. Existing operations and CLI commands already use
this writer; no Editor/CLI semantic operation is added. Run fail-first regressions,
Core tests, workspace typecheck, docs/whitespace checks and required PR CI.

Local verification (2026-10-27): all 24 code/math preservation cases failed before
the writer fix and pass after it. Core 325/325, workspace typecheck, docs and
whitespace checks pass. Prose/caption output remains byte-identical in its regression.
The existing Host file-save regression also replaces its former pipe refusal with
an actual file write, native reopen and byte-identical second save, retaining all
malformed-input refusals. Editor 316/316, Editor typecheck and production build pass.

## All-table numbering verification (#584)

Second review reproduced two remaining paths on `f76e027`: inherited option names
were absent from the map but present in VFile diagnostics, and CSV/list-table source
was accepted after its directive name was lifted away. Before this fix, 24 added Core
cases and 48 CLI command cases failed their refusal assertion. The revised source
admission passes Core 295/295 and CLI 129/129 (including subtests), workspace typecheck,
docs and whitespace. Refused CLI files keep their BOM, CRLF and exact bytes. Supported
Label spellings, optionless directives and GFM remain accepted and preserve their grids.
The existing internal CSV semantic round-trip and security-probe tests pass unchanged;
they are not public native admission tests. No local browser run was needed for this
Core-only fix; the complete PR CI remains required.

Independent review reproduced silent source-option loss on `f45ae18`. Before the fix,
all eight public Core refusal cases and all twelve CLI check/format cases failed:
captioned and captionless tables accepted `align`, `widths` and unknown options; Core
also accepted the YAML option spelling. MyST retains these in `mystDirective.options`,
so the parse boundary now carries unsupported options to the container before lifting.
Existing native field admission rejects that evidence; no source grammar is duplicated.
Both Label spellings and GFM column alignment retain their canonical round-trip.
Review-fix checks: Core 270/270, CLI 81/81 (including subtests), workspace typecheck,
docs and whitespace pass. CLI refusal preserves exact original file bytes.

Before implementation, the installed `myst-parser` 1.7.4 and `myst-transforms` 1.3.51
parsed and enumerated argumentless, nameless `{table}` directives without diagnostics.
Empty-cell, header-only and aligned rich grids retained their full semantic fingerprints.
Raw mixed GFM/directive input only numbers its directives in MyST; after Core canonical
writing all four tables are directives, and MyST and Core both report 1, 2, 3, 4.
MyST's visible-caption behavior is distinguished from official enumeration in
[Caption number labels](heading-numbering-v1.md#caption-number-labels-462).

The new Core regression failed before implementation at native admission of the empty
directive. It now checks input admission, numbering, rich grid preservation, idempotent
canonical output and caption/Label edits. Existing fingerprint tests additionally reject
changed content, row/column shape, alignment, caption, Label and unknown wrapper fields.
Existing CLI file-write/refusal and Editor schema/Save tests retain their exact data
assertions with the canonical directive spelling. Headerless CSV security-probe containers
retain the upstream writer; they are not admitted as native GFM grids.

Local checks: Core 261/261, CLI 68/68, Editor 297/297, workspace typecheck, Editor build,
docs/whitespace, and `table-caption`, `table-authoring`, `cross-reference`, `layout-rules`,
`quiet-document`. The first table-authoring run looked for its old `Table 1` reference;
failure state showed the correct `Table 2` after counting the preceding uncaptioned table.
Updated expectations retain exact source/grid assertions. The added caption-clear/Undo
checks read the official caption and reference number immediately, without polling.
After integrating master `0e1e30d` (PR #589 / #588), the Editor's new-empty-table Save
permission is retained. The merged table-authoring checks also verify that a completely
empty inserted table is saved as a directive, retains its grid on Reload and receives
`Table 1`, while the following table remains `Table 2`. Repeated Save is byte-identical.
The removal of Editor/Host empty-table refusals belongs to #588; this work adds only the
canonical-format and number assertions to that coverage.
Post-merge checks: Editor targets 110/110, `table-authoring` and `table-caption` browser
scenarios, workspace typecheck, Editor build and docs/whitespace all passed.

The first PR CI's external-HTML paste artifact showed a successful Save with the new
directive; its two expected Markdown strings still assumed plain GFM. They now include
the canonical wrapper. The exact Source/disk comparison and Reload structure equality
remain unchanged. Local `external-html-paste` passes after this expectation correction;
no timeout, retry or state-wait change was needed.
The next CI's table-cell-editing artifact passed editing, formatting, grid preservation
and Save/Reload; only its old GFM-to-following-paragraph regex failed. It now explicitly
requires the directive opener and closer around the same exact grid. Local
`table-cell-editing` passes; all other product CI jobs on that head had passed.

Manual captures compare baseline `586a9b61ac1d06dd0708466faead6717396bb74e` with this
change through `pnpm browser:test table-caption --screenshots`. Both use the same scratch
document, open tabs, preferences, scroll, loaded fonts, DPR 1 and 100% zoom on the same
checkout-owned Windows Chrome profile and Vite origin `http://127.0.0.1:5384`.
The narrow surface retains the number and input hint without horizontal overflow.
BadPasswordAttempts was 1 before the first browser launch and 3 during the initial checks;
the later post-merge browser checks started and ended at 0.
No local Edge or packaged Desktop run; platform coverage belongs to CI.

| Viewport | Before | After |
| --- | --- | --- |
| 1440×900 | [PNG](assets/table-numbering-584/before-1440.png) | [PNG](assets/table-numbering-584/after-1440.png) |
| 390×900 | [PNG](assets/table-numbering-584/before-390.png) | [PNG](assets/table-numbering-584/after-390.png) |

## Always available empty caption (#577)

This historical verification describes #577. Its number appearance/removal behavior is
superseded by #584's all-table rule above; the caret, schema and history evidence remains.

Baseline `97a73bb55aa93f31d67ed6b043cfaaa468ad29e4`: a temporary browser probe opened
the uncaptioned `tmp/table-authoring/tables.md` and immediately checked the caption
surface. It failed with expected **1**, actual **0**, before product changes.
The extended existing regressions now cover clean Open/no Undo, immediate empty-caption
click and typing, blank-caption ArrowDown/ArrowUp, refused line breaks, one-step
Undo/Redo, official-number appearance/removal, empty Save omission and Reload.
Previously valid captionless recovery snapshots are normalized in both checkpoints;
stored records remain unchanged. Rich content, cell addresses, move/delete and references
keep their existing coverage.

Immediate typing after closing properties exposed a real caret defect: the native caret
was inside the empty caption while the engine retained a GapCursor after the table.
Empty-surface mousedown now selects its existing inline position synchronously; the
regression asserts that state immediately, without a poll or retry. Grid-tool geometry
continues to compare tools with the last row, since native table bounds include captions.

Local checks: Editor **296/296**, workspace typecheck, Editor production build,
docs/whitespace and `table-caption`, `table-authoring`, `table-cell-editing`,
`cross-reference`, `property-drafts`, `recovery-structure`, `layout-rules` and
`quiet-document` passed. Windows Chrome used this checkout's persistent profile and
dedicated Vite origin `http://127.0.0.1:5377`. No local Edge or packaged Desktop run.

The first PR CI run exposed the external-HTML paste path: its table lacked the empty
caption until Reload, so the existing exact structure-preservation assertion failed.
Artifact/input-state analysis led to adding the surface in the existing clipboard Slice
conversion. The original Save/Reload equality assertion is retained, with an immediate
input-surface assertion added before Save. This is a product initialization fix, not a
retry or relaxed comparison.
The corrected product also passes local `external-html-paste` and
`continuous-editing`, the unchanged exact Save/Reload comparison, Editor **296/296**,
Editor typecheck/build and docs/whitespace checks.

Independent review reproduced a range-deletion hole at `f0e80d2`: after selecting from
the last cell to trailing prose and Backspace, the table remained but its caption count
was **0**. The regression checks the surface and unchanged cells immediately after
deletion, Undo and Redo. The schema now requires `tableRow+ tableCaption`, so native
ProseMirror replacement owns that invariant. The earlier paste-only filler is removed;
DOM/clipboard parsing fills required children. Older captionless snapshots retain their
lossless compatibility preparation in both checkpoints before schema validation.
Review-fix checks: Editor **296/296**, workspace typecheck, Editor build,
`table-authoring`, `table-caption` (including runtime editable transitions),
`external-html-paste`, `recovery-structure`, `continuous-editing`, docs and whitespace
all pass. The range-deletion assertions do not poll after deletion, Undo or Redo.

Manual captures use the same fresh scratch document, open tabs, preferences, scroll
position, loaded fonts, DPR 1 and 100% zoom at 1440/390×900px. Capture-only
`pnpm browser:test table-caption --screenshots` writes After images under ignored `tmp/`;
only the small reviewed comparisons below are retained. Traces and generated logs are
not committed.

| Viewport | Before | After |
| --- | --- | --- |
| 1440px | [PNG](assets/table-caption-577/before-1440.png) | [PNG](assets/table-caption-577/after-1440.png) |
| 390px | [PNG](assets/table-caption-577/before-390.png) | [PNG](assets/table-caption-577/after-390.png) |

## Direct editing evidence (#555 / #557)

Baseline product: `ff37a32e273dfad90bde84a9c30e2a28ec5e3af3`. The [fail-first result](assets/table-caption-555/fail-first.txt) from
`pnpm browser:test table-caption` changed one caption word through the original
properties UI. The preservation assertion failed: the saved caption was plain text
`Updated with fig-a, alpha and x^2`, losing emphasis, the reference, citation and math.
The first two preparation attempts (unsupported VM URL global, then Windows path
separator) were harness errors and are not the product reproduction. The corrected
scenario failed at the canonical-content assertion before any product edits.

Manual comparisons use the same scratch document and checkout-owned persistent Windows
Chrome profile, dedicated Vite origin `http://127.0.0.1:5355`, 1280/390 by 900 viewports,
DPR 1, default zoom and loaded bundled fonts. Capture-only `table-caption --screenshots`
is separate from behavioral assertions. Large traces and generated run artifacts stay
under ignored `tmp/`; only small review images are committed.

| State | Before | After |
| --- | --- | --- |
| Caption, 1280px | [PNG](assets/table-caption-555/before-1280.png) | [PNG](assets/table-caption-555/after-1280.png) |
| Properties, 1280px | [PNG](assets/table-caption-555/before-1280-properties.png) | [PNG](assets/table-caption-555/after-1280-properties.png) |
| Caption, 390px | [PNG](assets/table-caption-555/before-390.png) | [PNG](assets/table-caption-555/after-390.png) |
| Properties, 390px | [PNG](assets/table-caption-555/before-390-properties.png) | [PNG](assets/table-caption-555/after-390-properties.png) |

Recovery snapshots created with the former caption-attribute schema are refused by the
existing lossless snapshot check rather than dropping caption content; their original
recovery text remains available. No recovery-format migration is introduced.

Local verification: Editor tests **292/292**, workspace typecheck, production Editor
build, docs and whitespace checks passed. Targeted browser runs passed `table-caption`,
`table-authoring`, `table-cell-editing`, `property-drafts`, `cross-reference`,
`continuous-editing`, `citations`, `recovery-structure`, `desktop-updates`,
`layout-rules` and `quiet-document`. The recovery language-switch assertion passed
with a clean dedicated dev-server session after an HMR-era run failed to address the
mounted language instance. The rich-caption regression's final helpers clone comparison
JSON and exclude opening-snapshot locators, which legitimately change on moved-file
reopening; neither helper changes product state or waits for a failed assertion to pass.
The browser stop threshold was changed by the orchestrator from 2 to 6 during the work;
every actual launch checked a value below 6. Profile and account policy were preserved.
Figure/equation property entry and Apply/Cancel unification remain outside this PR.

The initial HTTP CI run on both Windows and Linux failed because its synthetic
`insertContentAt` fixture still supplied the former caption attribute; the caption
was absent before crash/restore. The fixture now supplies the caption child and keeps
all existing preservation assertions. The old-schema caption salvage regression and its
attribute extraction were retired
by the 2026-10-29 owner decision (#705). Current recovery accepts only the current
schema; rejected records retain their separately stored plaintext copy. Historical
#555 verification above does not establish ongoing support for obsolete attributes.

The attempted additional local production-HTTP browser run was stopped before launch
at `BadPasswordAttempts=6`; its temporary Host was shut down. The subsequent owner
rule waits at two-minute intervals for a value below 3 (maximum 20 minutes) when the
counter is at least 5. No local Edge or packaged Desktop run is used. HTTP CI validates
the corrected fixture on both operating systems.
