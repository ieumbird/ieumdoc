# Table interaction v1

- Status: Implemented
- Last verified: 2026-10-26 (#474: table-authoring browser regression for explicit deletion notices, guarded one-step Undo, focus, typing, Save/Reload, tab switching and expiry; bilingual cross-reference browser regression and captures, typecheck/build).
- Previous verification: 2026-10-25 (#430 last-cell Tab, including integration with #431/#433: table-authoring and continuous-editing browser regressions, first-cell focus/typing, one-step Undo/Redo, actual Save/Reload; Editor 281/281, typecheck/build).
- Previous verification: 2026-10-23 (empty-table boundaries compared with Core and Editor code/tests; documentation comparison only).
- Previous verification: 2026-10-08 (contract compared with table commands and regression coverage).
- Related: [Continuous editing](document-editing-v1.md), [Table caption and label](table-caption-v1.md).

- Scope: active-cell outline, matching row/column handles, append buttons and a contextual menu on existing Markdown tables.
- Reuse the Editor table commands and Core save operations. Handles and selection indicators are UI only; they never enter Markdown or document attributes.
- Row/column handles address a specific row/column independently of caret focus. The first row remains the header; the last column cannot be deleted.
- Menus offer existing add, move, delete and column alignment commands. Table actions include caption/label editing and explicitly named table deletion.
- Explicit table deletion (block-menu Delete, table-tools Delete table, and Delete/Backspace on a selected table node) takes effect without confirmation. The existing MessageArea shows `Table deleted` / `표를 삭제했습니다` with `Undo` / `되돌리기`, politely announced without taking editor focus. Its action runs the same editor Undo as Ctrl+Z, restoring the complete table, caption and label in one history step and returning editor focus.
- The deletion notice and action expire on the next document change (including typing or keyboard Undo/Redo), Save, Reload, tab switch or the existing five-second temporary-notice timeout. A stale action cannot undo a newer edit or another tab. Further typing starts a separate history step. Deleting a referenced table uses this deletion notice; the existing unresolved reference display remains until Undo restores the table. Other block deletion notices are unchanged.
- Keep the native engine caret, history and Tab navigation. One structural action is one undo step; after adding, focus moves into the new cell.
- Tab in the last cell of an editable table appends a row and focuses its first cell using the same Add row below command and Core Save path. Shift+Tab in the first cell still enters preceding prose; Enter and final-row ArrowDown still leave the table. Tab does not act during IME composition or add rows in read-only tables.
- Tools share the table's local scroll geometry; menus use a portal so local overflow cannot clip them. Tools appear on hover, focus or selection, and remain visible on touch devices.
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
