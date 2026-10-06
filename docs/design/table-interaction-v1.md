# Table interaction v1

- Scope: active-cell outline, matching row/column handles, append buttons and a contextual menu on existing Markdown tables.
- Reuse the Editor table commands and Core save operations. Handles and selection indicators are UI only; they never enter Markdown or document attributes.
- Row/column handles address a specific row/column independently of caret focus. The first row remains the header; the last column cannot be deleted.
- Menus offer existing add, move, delete and column alignment commands. Table actions include caption/label editing and explicitly named table deletion.
- Keep the native engine caret, history and Tab navigation. One structural action is one undo step; after adding, focus moves into the new cell.
- Tools share the table's local scroll geometry; menus use a portal so local overflow cannot clip them. Tools appear on hover, focus or selection, and remain visible on touch devices.
- Excluded: multiple-cell selection, merging, formulas, resizing and new document semantics. Existing read-only cells remain intact.
- Completion: pointer and keyboard operation; fixed header/last-column restrictions; focus-safe menu targets; Undo/Redo; Save/Reload with content, alignment, captions and labels retained; narrow-layout geometry and read-only preservation.
- Verification: existing table command/unit tests, extended table-authoring browser regression, typecheck, production build and required CI.
- CLI: no new semantic operation; existing Core/CLI table commands already cover these actions. Handles and focus are Editor-only.
