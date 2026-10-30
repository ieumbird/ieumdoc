# Table interaction v1

- Status: Implemented
- Whole-table tools update: 2026-10-30 (#793; upper Edit/More and metadata, menu-only Delete; [contract and evidence](#whole-table-tools-793)).
- Property-entry update: 2026-10-27 (#557: shared selection/Enter/double-click and explicit property drafts; see [Continuous editing](document-editing-v1.md#continuous-editing)).
- Last verified: 2026-10-26 (#517: light line handles, localized names/tooltips, keyboard discovery, no-hover visibility and independent targets; Editor tests/typecheck/build and table-authoring/table-cell-editing/continuous-editing/layout-rules/quiet-document browser regressions; [comparison and evidence](#light-handle-verification-and-comparison)).
- Previous verification: 2026-10-26 (#514: shared Button migration with explicit target/anchor preservation, 28px targets/6px radius; table-authoring/table-cell-editing/continuous-editing browser regressions and [manual captures](../reviews/editor-visual-language-history-2026-10-30.md#shared-control-verification-514)).
- Previous verification: 2026-10-26 (#474 / PR #486 review: table-authoring and source-view-pending browser regressions for explicit deletion notices, guarded one-step Undo, focus, typing, Save/Reload, Source request start, tab switching and expiry; appended endnote placement in the document-session harness; footnotes and bilingual cross-reference browser regressions, typecheck/build).
- Previous verification: 2026-10-25 (#430 last-cell Tab, including integration with #431/#433: table-authoring and continuous-editing browser regressions, first-cell focus/typing, one-step Undo/Redo, actual Save/Reload; Editor 281/281, typecheck/build).
- Previous verification: 2026-10-23 (empty-table boundaries compared with Core and Editor code/tests; documentation comparison only).
- Previous verification: 2026-10-08 (contract compared with table commands and regression coverage).
- Related: [Continuous editing](document-editing-v1.md), [Table caption and label](table-caption-v1.md).

Every table displays its official Core number, including the empty caption surface
(`Table N.` by default). Caption/Label changes retain that number, and canonical Save
writes a `{table}` directive even when both are absent (#584; [format contract](table-caption-v1.md)).

- Scope: active-cell outline, matching row/column handles, append buttons and a contextual menu on existing Markdown tables.
- Reuse the Editor table commands and Core save operations. Handles and selection indicators are UI only; they never enter Markdown or document attributes.
- Row/column handles address a specific row/column independently of caret focus. The first row remains the header; the last column cannot be deleted.
- Menus offer existing add, move, delete and column alignment commands. Table actions include label editing and explicitly named table deletion.
- Row/column/table menus use the [unified action rows](editor-ux-shell-v1.md#unified-action-menus-516): action-specific 16px line icons, labels and group separators, with danger-token text/icons and enabled danger hover on deletion. Existing explicit targets, disabled restrictions, keyboard focus and deletion paths remain unchanged.
- Explicit table deletion (block-menu Delete, table-tools Delete table, and Delete/Backspace on a selected table node) takes effect without confirmation. The existing MessageArea shows `Table deleted` / `표를 삭제했습니다` with `Undo` / `되돌리기`, politely announced without taking editor focus. Its action runs the same editor Undo as Ctrl+Z, restoring the complete table, caption and label in one history step and returning editor focus.
- The deletion notice and action expire on the next document change (including typing, keyboard Undo/Redo or an appended transaction such as deferred endnote placement), Save, Reload, Source preview request start, tab switch or the existing five-second temporary-notice timeout. Source revokes the action before its request is pending, so it cannot change a hidden Visual document or outlive the Markdown snapshot; returning to Visual does not revive it. A stale action cannot undo a newer edit or another tab. Further typing starts a separate history step. Deleting a referenced table uses this deletion notice; the existing unresolved reference display remains until Undo restores the table. Other block deletion notices are unchanged.
- Keep the native engine caret, history and Tab navigation. One structural action is one undo step; after adding, focus moves into the new cell.
- Ctrl/Cmd+A first selects the current cell's inline content; a consecutive second press selects the document. Empty cells stay local on the first press. See [scoped selection](document-editing-v1.md#select-all-within-an-editing-surface-723). Already complete nonempty cell selections expand immediately; the shared expansion policy switch can keep selection local (#751).
- Tab in the last cell of an editable table appends a row and focuses its first cell using the same Add row below command and Core Save path. Shift+Tab in the first cell still enters preceding prose; Enter leaves the table; final-row ArrowDown enters the caption, including its always available empty input surface (#577). ArrowUp from the caption returns to the final grid cell. Tab does not act during IME composition or add rows in read-only tables.
- Grid tools share the table's local scroll geometry; upper Edit/More and metadata stay outside the horizontal scroller; menus use a portal so local overflow cannot clip them. Tools appear on hover, focus or selection, and retain the existing no-hover fallback; touch-only entry is outside [ADR-0010](../adr/0010-supported-viewport-and-input.md). B2 (#517) replaces visible address letters/numbers with 16px horizontal column / vertical row line icons in the existing shared Buttons, with transparent neutral rest and the existing neutral current/open faces. The address remains in the localized accessible name and matching tooltip (including the header-row qualifier). All targets retain token-backed 28px height and 6px radii; columns follow measured cell widths and rows stay centered at 28px wide. Upper Edit/More and row/column entry points stay in native Tab order while visually hidden; Tab from preceding prose reveals Edit, then More, then a column handle on focus, Enter opens their menu, and Escape returns to the invoking handle. Hidden handles reject pointer input until hover/focus/selection; append tools retain their previous visibility rules. Upper tools reuse Figure Edit reveal and remain visible while a table menu is open. Explicit targets, anchor refs, pressed/focus states and commands remain unchanged.
- Excluded: multiple-cell selection, merging, formulas, resizing and new document semantics. Unsupported cells reject native admission.
- Completion: pointer and keyboard operation; fixed header/last-column restrictions; focus-safe menu targets; Undo/Redo; Save/Reload with content, alignment, captions and labels retained; narrow-layout geometry.
- Verification: existing table command/unit tests, extended table-authoring browser regression, typecheck, production build and required CI.
- CLI: no new semantic operation; existing Core/CLI table commands already cover these actions. Handles and focus are Editor-only.

## Property entry (#557)

The metadata line selects the whole Table on single click, opens its Label properties on
double-click, and supports Enter on the engine's Table node selection. Edit uses the same
form. Keyboard re-entry keeps the existing draft/error. The short Label/Number form shares
Figure's target-wide metadata popover (#791), including the complete table and caption,
inside the document content viewport. Done applies, Escape cancels and a valid outside
pointer click applies without returning focus to the table. Keyboard focus movement alone
keeps drafts; validation failure retains fields and errors. NumberField follows #776.
Cells and the directly editable caption keep ordinary text selection and navigation.
Save includes only applied content; keyboard Save retains metadata drafts.
See [Continuous editing](document-editing-v1.md#continuous-editing).

## Whole-table tools (#793)

Edit and More occupy the upper metadata row, outside `.table-scroll`. Edit uses Figure's
outlined text button and the existing `figure-edit` reveal class. More retains the shared
action menu, including Edit label and danger-styled Delete table. There is no standalone
Delete button. The existing #791 target-wide `MetadataProperties` popover, draft lifecycle,
selection, deletion command and one-step Undo remain unchanged; no Core/CLI operation is added.

A compact-control-height row is always reserved inside the table block above the column
handles. This avoids overlap with preceding prose, column tools and captions; showing or
hiding controls never changes document height. The number/label shares its vertical center,
with ellipsis for long metadata. Row/column/Append tools remain on the grid; Append row
stays after the caption. #721's shared figure/table caption gap is unchanged. Both upper
buttons remain reachable before and after scrolling a wide table horizontally.

The `table-authoring` upper-row assertion failed before product edits at baseline
`b9b2b8e9a4b9fc959177b1755369ff3caf1013ba`: Edit/More were below the grid, inside the
scroller, with an independent Delete button. The extended scenario checks upper geometry,
no preceding-prose/column overlap, unchanged bounds on reveal, native keyboard discovery,
More/Delete keyboard execution and focus return, wide scrolling, existing structural
restrictions, deletion Undo and real Save/Reload. Existing caption, layout and quiet-document
checks retain their behavioral assertions with the new entry points. Other interface
regressions run in required CI.

Manual comparison uses the same seven-column scratch table and caption, persistent Windows
Chrome at `http://127.0.0.1:5293`, DPR 1, 100% zoom and loaded Pretendard. The 1440×900
captures are English/Light; 640×900 captures are Korean/Dark. The baseline is the unchanged
product commit above; After uses this PR's product. [Capture script](assets/table-tools-793/capture.browser.js)
and [environment/file hashes](assets/table-tools-793/capture-metadata.json) make the states reproducible.
Screenshots are manual visual evidence, not additional automated test passes. Self-review
checked vertical alignment, padding, Korean text, viewport/panel edges and horizontal scrolling.
The [640px property popover](assets/table-tools-793/after-640-properties.png),
[Figure tools](assets/table-tools-793/after-figure-comparison.png) and
[Equation tools](assets/table-tools-793/after-equation-comparison.png) were compared too;
Equation source and the shared metadata popover were not changed.

Local verification: 46 targeted Editor unit tests, workspace typecheck, Editor build,
`table-authoring table-caption layout-rules quiet-document`, docs and whitespace checks.
CI then caught metadata pointer interception by the later grid padding; a metadata z-index
restores the existing single/double-click/Enter contract (`property-drafts` and
`table-authoring` pass locally). Its reserved row also pushed the short settings fixture
1.0625px beyond the paper minimum; that position-only test uses a taller viewport while
retaining unchanged paper/content size, zero transactions, reading-line crossing and
row/column alignment assertions (`inline-document-settings`). After PNGs predate only
the pointer-layer correction; it does not change pixels or geometry.
Broader interface/platform regressions belong to required CI. The existing D08 tracking
row remains linked to #793; issue closure owns its progress state.

| State | Before | After |
| --- | --- | --- |
| 1440px | [PNG](assets/table-tools-793/before-1440.png) | [PNG](assets/table-tools-793/after-1440.png) |
| 640px Korean/Dark | [PNG](assets/table-tools-793/before-640.png) | [PNG](assets/table-tools-793/after-640.png) |
| 1440px scrolled | [PNG](assets/table-tools-793/before-1440-scrolled.png) | [PNG](assets/table-tools-793/after-1440-scrolled.png) |
| 640px scrolled | [PNG](assets/table-tools-793/before-640-scrolled.png) | [PNG](assets/table-tools-793/after-640-scrolled.png) |
| 1440px More | [PNG](assets/table-tools-793/before-1440-menu.png) | [PNG](assets/table-tools-793/after-1440-menu.png) |
| 640px More | [PNG](assets/table-tools-793/before-640-menu.png) | [PNG](assets/table-tools-793/after-640-menu.png) |

## Light handle work record (#517)

Implementation plan (2026-10-26, owner decision B2): replace visible column letters
and row numbers with short horizontal/vertical line handles in the existing shared
Buttons. Keep the measured column widths, centered 28px row targets, explicit command
addresses and portal anchors. Use neutral transparent rest and supporting neutral
current/open states, accessible address names/tooltips, hover/focus discovery and
the existing no-hover fallback.

Excluded: B3 toolbar redesign, #502 selection-root-cause work, new table commands,
resizing, merging, formulas and persistence changes. No Core/CLI change is needed:
this is Editor presentation and interaction over existing semantic operations.

Completion/verification: extend the existing table-authoring regression and show the
new light-handle assertion failing before product edits, then passing with explicit
targets, keyboard menus, header/last-column restrictions, narrow scroll geometry,
engine caret/history and actual Save/Reload preserved. Run Editor tests, typecheck,
build, layout-rules, quiet-document, table-cell-editing and continuous-editing plus
docs/whitespace checks; all required CI must pass on the PR head. Capture comparable
real Before/After states in English/Korean at wide/narrow widths separately from
automated assertions. Preserve the historical B2 mockup. Stop own test processes,
publish the issue-linked PR and retain this worktree for independent review; no merge.

### Light handle verification and comparison

The existing `table-authoring` regression's new light-handle assertion failed against
unchanged product `93636fac231a8a305138b211fa87ac96dad7de51`: buttons still displayed
`A/B/1/2`, lacked icons/tooltips and had opaque rest faces. The complete
[first run log](assets/table-handles-517/fail-first.txt) also preserves an earlier,
separate manual-capture interruption: its English-only file-opening helper could not
open Files after switching to Korean. The live trace identified that pending click;
only the owned browser was stopped. The corrected manual script opens the document
in English before switching language; its [capture run passed](assets/table-handles-517/before-capture.txt).
The original Before files remain under `assets/table-handles-517/original-before/`.
That capture preparation failure is not the fail-first product assertion or a CI result.

Final comparison isolates #517 from #524's inherited shell changes. Its product Before
is master `b28541f373d301fad4da5605ce67808bbcda0b39`; the test/capture harness and final
product are from `f8f1865e25f69325d5eff318a4b85fa834262441`. Only `table-tools.tsx` and
`styles.css` were temporarily read from the baseline in this same checkout. Exact final
byte copies were restored in `finally`, with matching SHA-256 and no product Git diff;
all other product files already matched that master. The
[baseline/harness metadata](assets/table-handles-517/integrated-baseline.json) and
[comparison manifest](assets/table-handles-517/comparison.json) record source hashes,
environment, screenshot names and pair hashes. The historical B2 mockup is unchanged.

The final [four-scenario run](assets/table-handles-517/final-browser.txt) passes the
unchanged fail-first criterion plus native Tab discovery from prose, Enter/Escape
focus return, actual no-hover media, explicit row targeting while the caret is in the
header and column targeting while it is elsewhere, header/last-column restrictions,
centered row targets and measured columns after horizontal scrolling, portaled menus,
caret/history, last-cell Tab and actual Save/Reload. The existing bilingual
`layout-rules` loop checks handle icon/name/tooltip agreement at 1440/390px alongside
28px/6px geometry, UI typography isolation and #514/#515 controls.
[Table-authoring results](assets/table-handles-517/table-authoring-pass.json) retain
the existing behavioral outcomes. Editor tests (291), workspace typecheck, Editor
build and docs/whitespace checks pass. Packaging/HTTP/platform coverage belongs to
required CI; no Host, Core or CLI boundary changed. #502 is untouched.

Manual captures use this checkout's persistent Windows Chrome 155 profile, its own
Vite server on 5317, DPR 1, 100% zoom, loaded bundled Pretendard and scroll top.
Table captures are English/Korean at 1440×900 and 390×900, with the same current U
cell. The manual narrow captures have `scrollLeft=0`; nonzero horizontal-scroll
coverage comes from the existing table-authoring regression. The delivered `blurred-current`
images retain that current-cell indicator after blur (the script originally named
them `rest`); they are not evidence of table tools being hidden at rest. The separate
Quiet Document 1440×1000/375×1000 pointer-away pairs are byte-identical but retain
the script's Equation selection, blue outline and Edit control. The original `rest`
filenames are preserved; these are blurred states with selection, not completely
unselected document rest. Capture-only traversal
is separate from automated assertions; images require visual review.

| Comparable state | Before | After |
| --- | --- | --- |
| English active cell, 1440px | [PNG](assets/table-handles-517/before/en-1440-active.png) | [PNG](assets/table-handles-517/after/en-1440-active.png) |
| English active cell, 390px | [PNG](assets/table-handles-517/before/en-390-active.png) | [PNG](assets/table-handles-517/after/en-390-active.png) |
| Korean active cell, 1440px | [PNG](assets/table-handles-517/before/ko-1440-active.png) | [PNG](assets/table-handles-517/after/ko-1440-active.png) |
| Korean active cell, 390px | [PNG](assets/table-handles-517/before/ko-390-active.png) | [PNG](assets/table-handles-517/after/ko-390-active.png) |
| English keyboard menu, 1440px | [PNG](assets/table-handles-517/before/en-1440-keyboard-menu.png) | [PNG](assets/table-handles-517/after/en-1440-keyboard-menu.png) |
| Korean keyboard menu, 390px | [PNG](assets/table-handles-517/before/ko-390-keyboard-menu.png) | [PNG](assets/table-handles-517/after/ko-390-keyboard-menu.png) |
| Quiet Document blurred, Equation selected, 1440px | [PNG](assets/table-handles-517/before/quiet-1440-rest.png) | [PNG](assets/table-handles-517/after/quiet-1440-rest.png) |
| Quiet Document blurred, Equation selected, 375px | [PNG](assets/table-handles-517/before/quiet-375-rest.png) | [PNG](assets/table-handles-517/after/quiet-375-rest.png) |

[Final manual capture](assets/table-handles-517/after-capture.txt) and
[Quiet Document](assets/table-handles-517/after-quiet.txt) passed. Both baseline and
final servers and their owned children were stopped; the final
[cleanup record](assets/table-handles-517/cleanup.json) reports no 5317 listener or
checkout-profile Chrome process and `BadPasswordAttempts=0`. The profile is retained
and account policy unchanged. Independent review and owner merge approval remain
required; local verification and manual inspection do not supply that approval.

### P2 review: actual handle visibility

Review correction plan (2026-10-26): extend the existing table-authoring scenario
to inspect each actual row/column button and its relevant ancestors, target geometry
and pointer state in verified no-hover/no-current-cell and keyboard Tab/Escape states.
The previous container/focus-only predicates are insufficient. Independently disable
touch and keyboard reveal with temporary CSS mutations, prove the former scenario
misses them and the extended assertions reject them, then restore exact product
bytes and run the restored scenario. No product change or new capture-only run is
planned. Keep the existing target/history/Save/Reload assertions and correct only
the descriptions of the already-preserved captures.

Completed: the extended scenario checks every row/column button with browser
`checkVisibility`, its own and ancestor display/visibility/opacity, actual pointer
events and at least 28px geometry. The no-hover setup independently requires the
pointer and focus outside the table, no current cell and no active table tools.
Tab and Escape inspect the actual handles immediately, with exactly one focused
handle; no polling, reload or delay was added to these assertions.

| Temporary negative control | Previous scenario | Extended scenario |
| --- | --- | --- |
| Remove only the no-hover button reveal override | [Pass](assets/table-handles-517/review-touch-reveal-legacy.txt) | [Fails at actual no-hover handles](assets/table-handles-517/review-touch-reveal-updated.txt): opacity 0, pointer-events none despite visible containers |
| Remove only focus-within from the row/column reveal selector | [Pass](assets/table-handles-517/review-keyboard-reveal-legacy.txt) | [Fails immediately after Tab](assets/table-handles-517/review-keyboard-reveal-updated.txt): focused handle opacity 0 |

Both mutations were separately tested and restored in `finally`. The
[mutation record](assets/table-handles-517/review-mutations.json) preserves the
mutation/source hashes, exit codes and actual button/ancestor failure measurements.
Restored product hashes match the reviewed implementation exactly (styles
`EC6078F18BDD24E47B96F070A06BAC82B74290AB38E479C643BDB4E4A2BC2811`, TableTools
`D5B1788DEAAC4793C44C8827082B89806FCCBDAB7EB2034ADFE8BAD291F431DF`), with no product
Git diff. The [restored table-authoring run](assets/table-handles-517/review-restored-pass.txt)
passes, including [actual touch/Tab/Escape visibility results](assets/table-handles-517/review-table-authoring-pass.json)
and all existing targeting/history/Save/Reload checks. Relevant
[table and visual-token tests](assets/table-handles-517/review-unit.txt) pass 19/19.
No product defect or product change was found. No capture-only run was added and
all existing PNG bytes are preserved; only their state descriptions were corrected.
The [review cleanup](assets/table-handles-517/review-cleanup.json) confirms the owned
server/port/profile processes are gone and BadPasswordAttempts remains 0.

### CI prose precondition investigation

Run 40292844193's Linux shard 2 failed at the single-Tab discovery assertion.
The downloaded screenshot, DOM, input log and trace show native Intro offset 16
but engine title position 1 at Tab keydown; Tab changed H1 to H2 and increased Undo
depth before selectionchange arrived. This establishes an unmet engine-prose
precondition, not a failed handle reveal or a diagnosis of #502.

Correction plan: register selectionUpdate before the real prose click, require
the actual native caret and acknowledged engine positions to match without a
document change, then retain one Tab and the immediate actual-handle checks.
Use a temporary observer-acknowledgement hold as a deterministic negative control,
retain both reveal mutations, restore the uninstrumented scenario and run it on
Windows. Preserve the original Linux artifact and distinguish its observed failure
from the controlled Windows experiment. No forced selection, product change,
polling, reload, fixed sleep, increased timeout or extra Tab is intended. This
does not claim to fix rapid click-to-Tab product behavior.

Completed evidence: the [original Linux failure bundle](assets/table-handles-517/ci-selection/linux-original-artifacts.zip)
preserves the actual screenshot, DOM/ARIA, input events, trace and shard log from
[run 40292844193 / job 121471910574](https://github.com/ieumbird/ieumdoc/actions/runs/40292844193/job/121471910574).
The [timeline and original-file hashes](assets/table-handles-517/ci-selection/investigation.json)
record event 19 (native Intro offset 16, engine position 1), event 20 (H2, document
change, Undo depth 1) and event 22 (selectionchange), plus the actual click/Tab trace
calls. The failed [screenshot](assets/table-handles-517/ci-selection/linux-failure.png)
is retained unchanged. No blind retry or intervening push replaced that result.

On Windows Chrome 155, the temporary native-observer gate made the
[previous harness fail at the same assertion](assets/table-handles-517/ci-selection/old-held.txt);
its [raw diagnostics](assets/table-handles-517/ci-selection/windows-old-held-artifacts.zip)
also retain the heading change. With the fence registered before clicking, the
[controlled scenario passes](assets/table-handles-517/ci-selection/fence-held.txt):
the [measured gate state](assets/table-handles-517/ci-selection/windows-held-pass.json)
has native positions 25/25, engine 1/1 and a pending acknowledgement before release,
then engine 25/25 after the original observer reads the native selection. The actual
intercepted-call count was zero before that release; the gate was armed but the
asynchronous read had not arrived yet. This controlled Windows experiment is not a
local Linux reproduction or a product fix.

The committed scenario installs no observer gate or release hook. Its listener is
registered before the click and cleaned in `finally`, including failures; a missing
acknowledgement fails at the existing selection-fence pattern's 1000ms deadline,
without increasing the scenario timeout. Native/engine positions and document
identity must match before the existing single Tab. Both
[touch](assets/table-handles-517/ci-selection/touch-reveal.txt) and
[keyboard](assets/table-handles-517/ci-selection/keyboard-reveal.txt) reveal mutations
still fail at their immediate actual-handle checks. After exact CSS/test restoration,
the [uninstrumented Windows run](assets/table-handles-517/ci-selection/restored-pass.txt)
passes with [prose readiness and unchanged-document outcomes](assets/table-handles-517/ci-selection/windows-restored-pass.json).
The [mutation/restore record](assets/table-handles-517/ci-selection/reveal-controls.json)
reports no product diff; [relevant unit tests](assets/table-handles-517/ci-selection/unit.txt)
pass 19/19. New-head Linux CI must be evaluated separately. The
[cleanup record](assets/table-handles-517/ci-selection/cleanup.json) reports no owned
server, 5317 listener or profile Chrome process, with BadPasswordAttempts 0.

## Table deletion notice verification (#474)

The extended `table-authoring` scenario first failed on the unchanged implementation with
`Table deletion must show Table deleted / Undo without taking editor focus`. After implementation,
it passes for the direct Delete table button, table-actions menu, block-menu Delete and selected
table Delete/Backspace. It checks intact grid/caption restoration, focus and polite status, typing
at the deletion caret as a separate history step, actual Save → Reload after Undo, and notice
revocation on Save, Reload cancellation, switching away/back and the existing five-second timeout.
A preceding Copy path notice cannot mask the new deletion notice. `cross-reference` additionally
checks Korean text/action and restored reference resolution; other target deletion notices retain
their previous behavior. Core/CLI are unchanged: this adds only Editor interaction to existing deletion.

PR #486 review added a Source regression: hold the preview request after deleting a table, check
that the notice/action are absent while pending and in Source, then return to Visual and check
that neither revives. All three checks failed on `40671f6` before the request-start invalidation fix.
Only the actionable table-deletion notice is revoked on Source; ordinary notices such as HTML
paste normalization keep their existing lifetime. The existing `external-html-paste` CI regression
caught an initial overbroad clear at `8cc6824` (Word normalization notice was absent after Source).

The existing `document-session` hook/editor harness covers appended changes without the shell:
an unapplied Equation draft postpones endnote placement, a table is deleted, then cancelling the
draft releases placement. On `40671f6` the root transaction had `docChanged=false`, the final doc
changed, but `Table deleted` and its action remained. The regression now checks actual placement
and immediate notice/action revocation after that transaction, using the final editor doc identity.
These review fixes change invalidation only; the captures below retain their original #474 provenance.

PR #478 integration investigation (2026-10-26, head `4cb4805`): the
[failed Linux browser job](https://github.com/ieumbird/ieumdoc/actions/runs/40250078219/job/121339875529)
failed in the selected-table Backspace check. Its downloaded screenshot/ARIA snapshot had no
deletion notice or Undo button, but `browser-state.json` had `editorFocused=true` and both
tables were still present. The input recorder showed table NodeSelection 59–102 (event 674),
then a native DOM selection in H1 (676), then an editor TextSelection at position 1 (677),
all before Backspace keydown (678). The following transactions (679–680) had `docChanged=false`.
Thus this occurrence did not delete a table and then discard its notice: Backspace arrived at
the start of H1 and performed no document change. Focus had not left the editor at failure.

The unchanged `table-authoring` scenario passed once on `4cb4805` and once on detached master
`9dfd724`, in the same Windows checkout and persistent profile against its own verified 5179
server, then the PR branch was restored. A separate 4× CPU-delay diagnostic on `4cb4805` also
passed; its temporary instrumentation was removed. These runs do not identify the source of
the pre-keydown native selection change or prove that a timing interaction is absent. No
product change or flake classification is justified by these observations. The existing
assertion now retains the original locator/accessibility checks and reports notice count/text,
Undo count and editor focus separately, with an immediate selection/parent/table-count snapshot
on failure. Required behavior is unchanged and no polling or delay is added.

The existing `cross-reference --screenshots` and `quiet-document --screenshots` runs captured the
real product on Windows/installed headless Chrome using this worktree's persistent profile,
DPR 1, 100% zoom and bundled Pretendard. Before is base HEAD
`c2329159016cdae6183885bd24de2bd8a8046e1e`; After uses that base plus the source hashes in the
[capture environment](assets/table-delete-474/environment.json). Rest captures use scroll top,
blurred focus and the pointer outside the document. Both rest pairs are byte-identical.

| State | Before | After | Viewport |
| --- | --- | --- | --- |
| Quiet document, wide | [Before](assets/table-delete-474/before-1440-rest.png) | [After](assets/table-delete-474/after-1440-rest.png) | 1440×1000 |
| Quiet document, phone | [Before](assets/table-delete-474/before-375-rest.png) | [After](assets/table-delete-474/after-375-rest.png) | 375×1000 |
| Table deletion, English | — | [Wide](assets/table-delete-474/deleted-table-1280.png) / [Phone](assets/table-delete-474/deleted-table-375.png) | 1280×720 / 375×900 |
| Table deletion, Korean | — | [Wide](assets/table-delete-474/deleted-table-ko-1280.png) / [Phone](assets/table-delete-474/deleted-table-ko-375.png) | 1280×720 / 375×900 |

The notice uses the existing informational message and compact ghost action tokens; the phone
captures retain readable text and an unclipped action. No CSS or layout tokens changed.

## Empty tables and Save

Core accepts a structurally valid table whose cells are all empty, including canonical
serialization and reparse. Empty cell content alone does not make a document invalid.

The Editor saves newly inserted and existing tables by the same rule, even when every cell is
empty, with or without a caption or label (#588). An empty table is authored structure and is
never silently omitted as a session placeholder. Save followed by Reload retains its rows,
columns, caption and label. Clearing cells after Save also remains saveable before Reload.

Verified on 2026-10-27 with Editor insertion/Save/reopen tests and the table-authoring browser
Save/Reload regression. Evidence: [Core table tests](../../packages/core/test/table.test.ts),
[Editor insertion tests](../../apps/editor/test/table-authoring.test.ts) and the insertion versus
existing-table branches of [Save collection](../../apps/editor/src/tiptap-edits.ts).
