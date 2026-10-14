# Table caption and label v1

- Status: Implemented
- Last verified: 2026-10-11 (contract compared with current code and regression coverage; caption inline math and reference display, #165).
- Scope: Core table caption/label operations and their Editor/CLI interfaces; [Table interaction](table-interaction-v1.md).

Issue #94. Core owns `updateTableCaption` and table `updateLabel`. Plain tables become MyST `{table}` directives when caption or label is present, and return to plain Markdown when both are removed. Canonical writing uses the existing Markdown writer for the caption and GFM grid, then verifies the complete semantic round-trip. Cell paths remain logical `[block,row,column]` regardless of the directive wrapper.

Editor uses the existing single document state and shared properties panel. Hover a table and choose Edit; Caption and Label apply together. Cancel keeps the applied table, and pending form changes participate in the existing unsaved-state guard. Caption and label make a numbered Table target, including `{numref}` insertion and click navigation. Caption edits reset snapshot numbering defaults so removing both properties immediately removes the number. Grid children and row positions are unchanged.

The properties field authors plain single-line caption text. Existing formatted inline captions retain their content unless the user replaces the caption text; Core and CLI also accept InlineContent. In the document a caption reads as the body does: its formatting and links, inline math rendered by KaTeX, and references showing their target's computed number (or the dashed unresolved form), following label and numbering changes anywhere in the document. The caption is display only there: its math and references are not clickable, and it is never re-written by being shown. Merged cells, additional legends and directive options reject native admission. No new table editor engine or persistence architecture is introduced.

CLI: `ieumdoc update-table-caption <file> --path <block> --text <caption>` (empty text removes it), or `--content <InlineContent JSON>`. `update-label` accepts tables; `inspect --format json` includes caption, label and computed table number.

Verification: Core round-trip and fail-closed table tests; CLI file writes and rejected multiline input; Editor save adapter coverage; browser table-authoring exercises Apply/Cancel, Save/Reload, subsequent cell edits, Table reference display and click navigation, and that a caption renders without Tiptap warnings; cross-reference checks a caption's math and resolved/unresolved references, their update when a target is relabeled and undone, and that Source, Save and Reload keep the canonical caption unchanged. Existing table-cell-editing and row/column authoring remain regression coverage.
