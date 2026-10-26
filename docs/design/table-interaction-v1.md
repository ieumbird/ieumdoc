# Table interaction v1

- Status: Implemented
- Last verified: 2026-10-26 (#514: shared Button migration with explicit target/anchor preservation, 28px targets/6px radius; table-authoring/table-cell-editing/continuous-editing browser regressions and [manual captures](editor-visual-language-v1.md#shared-control-verification-514)).
- Previous verification: 2026-10-26 (#474 / PR #486 review: table-authoring and source-view-pending browser regressions for explicit deletion notices, guarded one-step Undo, focus, typing, Save/Reload, Source request start, tab switching and expiry; appended endnote placement in the document-session harness; footnotes and bilingual cross-reference browser regressions, typecheck/build).
- Previous verification: 2026-10-25 (#430 last-cell Tab, including integration with #431/#433: table-authoring and continuous-editing browser regressions, first-cell focus/typing, one-step Undo/Redo, actual Save/Reload; Editor 281/281, typecheck/build).
- Previous verification: 2026-10-23 (empty-table boundaries compared with Core and Editor code/tests; documentation comparison only).
- Previous verification: 2026-10-08 (contract compared with table commands and regression coverage).
- Related: [Continuous editing](document-editing-v1.md), [Table caption and label](table-caption-v1.md).

- Scope: active-cell outline, matching row/column handles, append buttons and a contextual menu on existing Markdown tables.
- Reuse the Editor table commands and Core save operations. Handles and selection indicators are UI only; they never enter Markdown or document attributes.
- Row/column handles address a specific row/column independently of caret focus. The first row remains the header; the last column cannot be deleted.
- Menus offer existing add, move, delete and column alignment commands. Table actions include caption/label editing and explicitly named table deletion.
- Row/column/table menus use the [unified action rows](editor-ux-shell-v1.md#unified-action-menus-516): action-specific 16px line icons, labels and group separators, with danger-token text/icons and enabled danger hover on deletion. Existing explicit targets, disabled restrictions, keyboard focus and deletion paths remain unchanged.
- Explicit table deletion (block-menu Delete, table-tools Delete table, and Delete/Backspace on a selected table node) takes effect without confirmation. The existing MessageArea shows `Table deleted` / `표를 삭제했습니다` with `Undo` / `되돌리기`, politely announced without taking editor focus. Its action runs the same editor Undo as Ctrl+Z, restoring the complete table, caption and label in one history step and returning editor focus.
- The deletion notice and action expire on the next document change (including typing, keyboard Undo/Redo or an appended transaction such as deferred endnote placement), Save, Reload, Source preview request start, tab switch or the existing five-second temporary-notice timeout. Source revokes the action before its request is pending, so it cannot change a hidden Visual document or outlive the Markdown snapshot; returning to Visual does not revive it. A stale action cannot undo a newer edit or another tab. Further typing starts a separate history step. Deleting a referenced table uses this deletion notice; the existing unresolved reference display remains until Undo restores the table. Other block deletion notices are unchanged.
- Keep the native engine caret, history and Tab navigation. One structural action is one undo step; after adding, focus moves into the new cell.
- Tab in the last cell of an editable table appends a row and focuses its first cell using the same Add row below command and Core Save path. Shift+Tab in the first cell still enters preceding prose; Enter and final-row ArrowDown still leave the table. Tab does not act during IME composition or add rows in read-only tables.
- Tools share the table's local scroll geometry; menus use a portal so local overflow cannot clip them. Tools appear on hover, focus or selection, and remain visible on touch devices. Under B1 (#514), row/column/append/caption-edit/actions/delete use shared Button with token-backed 28px targets and 6px control radii. Columns follow measured cell widths, rows stay centered, address letters/numbers remain 12/16px metadata text. Explicit targets, anchor refs, pressed/focus states and commands remain unchanged; handle redesign belongs to #517.
- Excluded: multiple-cell selection, merging, formulas, resizing and new document semantics. Unsupported cells reject native admission.
- Completion: pointer and keyboard operation; fixed header/last-column restrictions; focus-safe menu targets; Undo/Redo; Save/Reload with content, alignment, captions and labels retained; narrow-layout geometry.
- Verification: existing table command/unit tests, extended table-authoring browser regression, typecheck, production build and required CI.
- CLI: no new semantic operation; existing Core/CLI table commands already cover these actions. Handles and focus are Editor-only.

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

The Editor currently treats a newly inserted table whose cells all have empty inline text as
unfinished session content: Save reports `empty table cannot be saved` until a cell contains
text or the table is deleted. The table is not silently omitted. Caption or label alone does
not satisfy this cell-content check. This check applies to insertion relative to the opening
snapshot; clearing every cell of an existing opening-snapshot table uses normal Core cell/shape
edits and can be saved, retaining the empty table. A table that has just been saved still has
its insertion locator until Reload, so clearing it before Reload still meets the insertion check.

These are the current implementation boundaries, not a permanent product decision to make
empty tables invalid. Evidence: [Core table tests](../../packages/core/test/table.test.ts),
[Editor insertion tests](../../apps/editor/test/table-authoring.test.ts) and the insertion versus
existing-table branches of [Save collection](../../apps/editor/src/tiptap-edits.ts).
