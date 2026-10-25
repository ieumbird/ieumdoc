# Table interaction v1

- Status: Implemented
- Last verified: 2026-10-25 (#430 last-cell Tab, including integration with #431/#433: table-authoring and continuous-editing browser regressions, first-cell focus/typing, one-step Undo/Redo, actual Save/Reload; Editor 281/281, typecheck/build).
- Previous verification: 2026-10-23 (empty-table boundaries compared with Core and Editor code/tests; documentation comparison only).
- Previous verification: 2026-10-08 (contract compared with table commands and regression coverage).
- Related: [Continuous editing](document-editing-v1.md), [Table caption and label](table-caption-v1.md).

- Scope: active-cell outline, matching row/column handles, append buttons and a contextual menu on existing Markdown tables.
- Reuse the Editor table commands and Core save operations. Handles and selection indicators are UI only; they never enter Markdown or document attributes.
- Row/column handles address a specific row/column independently of caret focus. The first row remains the header; the last column cannot be deleted.
- Menus offer existing add, move, delete and column alignment commands. Table actions include caption/label editing and explicitly named table deletion.
- Keep the native engine caret, history and Tab navigation. One structural action is one undo step; after adding, focus moves into the new cell.
- Tab in the last cell of an editable table appends a row and focuses its first cell using the same Add row below command and Core Save path. Shift+Tab in the first cell still enters preceding prose; Enter and final-row ArrowDown still leave the table. Tab does not act during IME composition or add rows in read-only tables.
- Tools share the table's local scroll geometry; menus use a portal so local overflow cannot clip them. Tools appear on hover, focus or selection, and remain visible on touch devices.
- Excluded: multiple-cell selection, merging, formulas, resizing and new document semantics. Unsupported cells reject native admission.
- Completion: pointer and keyboard operation; fixed header/last-column restrictions; focus-safe menu targets; Undo/Redo; Save/Reload with content, alignment, captions and labels retained; narrow-layout geometry.
- Verification: existing table command/unit tests, extended table-authoring browser regression, typecheck, production build and required CI.
- CLI: no new semantic operation; existing Core/CLI table commands already cover these actions. Handles and focus are Editor-only.

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
