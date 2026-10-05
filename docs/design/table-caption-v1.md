# Table caption and label v1

Issue #94. Core owns `updateTableCaption` and table `updateLabel`. Plain tables become MyST `{table}` directives when caption or label is present, and return to plain Markdown when both are removed. Canonical writing uses the existing Markdown writer for the caption and GFM grid, then verifies the complete semantic round-trip. Cell paths remain logical `[block,row,column]` regardless of the directive wrapper.

Editor uses the existing single document state and shared properties panel. Hover a table and choose Edit; Caption and Label apply together. Cancel keeps the applied table, and pending form changes participate in the existing unsaved-state guard. Caption and label make a numbered Table target, including `{numref}` insertion and click navigation. Caption edits reset snapshot numbering defaults so removing both properties immediately removes the number. Grid children and row positions are unchanged.

The properties field authors plain single-line caption text. Existing formatted inline captions retain their content unless the user replaces the caption text; Core and CLI also accept InlineContent. Merged cells, additional legends and directive options remain read-only. No new table editor engine or persistence architecture is introduced.

CLI: `ieumdoc update-table-caption <file> --path <block> --text <caption>` (empty text removes it), or `--content <InlineContent JSON>`. `update-label` accepts tables; `inspect --format json` includes caption, label and computed table number.

Verification: Core round-trip and fail-closed table tests; CLI file writes and rejected multiline input; Editor save adapter coverage; browser table-authoring exercises Apply/Cancel, Save/Reload, subsequent cell edits, Table reference display and click navigation. Existing table-cell-editing and row/column authoring remain regression coverage.
