# Table caption and label v1

- Status: Implemented
- CLI insertion verification: 2026-10-15 (#280 caption/label in one write, label-only table, invalid/duplicate label refusal and rich batch caption; Core/CLI tests).
- Last verified: 2026-10-17 (UX review: Edit moved to the table's action bar; table-authoring and property-drafts browser checks).
- Previous verification: 2026-10-11 (contract compared with current code and regression coverage; caption inline math and reference display, #165).
- Scope: Core table caption/label operations and their Editor/CLI interfaces; [Table interaction](table-interaction-v1.md).

Issue #94. Core owns `updateTableCaption` and table `updateLabel`. Plain tables become MyST `{table}` directives when caption or label is present, and return to plain Markdown when both are removed. Canonical writing uses the existing Markdown writer for the caption and GFM grid, then verifies the complete semantic round-trip. Cell paths remain logical `[block,row,column]` regardless of the directive wrapper.

Editor uses the existing single document state and shared properties panel. Hover a table and choose Edit (the pencil in its action bar below the table, beside Table actions, which also offers Edit caption and label); Caption and Label apply together. Cancel keeps the applied table, and pending form changes participate in the existing unsaved-state guard. Caption and label make a numbered Table target, including `{numref}` insertion and click navigation. Caption edits reset snapshot numbering defaults so removing both properties immediately removes the number. Grid children and row positions are unchanged.

Changing an existing non-empty label also retargets its same-document references through the shared
[Core-backed label rename](section-references-v1.md#editor) (#374). Caption/label and reference changes
share one Undo/Redo step and survive Save/Reload. Rich caption references and fragment links follow
renamed targets without losing their formatting. Clearing the label retains references as written.
Deleting a referenced target uses the [shared deletion feedback](section-references-v1.md#editor);
unresolved caption references use the same kind-neutral text as body reference chips.

The properties field authors plain single-line caption text. Existing formatted inline captions retain their content unless the user replaces the caption text; Core and CLI also accept InlineContent. In the document a caption reads as the body does: its formatting and links, inline math rendered by KaTeX, and references showing their target's computed number (or the dashed unresolved form), following label and numbering changes anywhere in the document. The caption is display only there: its math and references are not clickable, and it is never re-written by being shown. Merged cells, additional legends and directive options reject native admission. No new table editor engine or persistence architecture is introduced.

CLI: `ieumdoc update-table-caption <file> --path <block> --text <caption>` (empty text removes it), or `--content <InlineContent JSON>`. `update-label` accepts tables; `inspect --format json` includes caption, label and computed table number.

Insertion (#280): `insert-table <file> --at <index|end> --cells <json> [--align <json>] [--caption <text> | --caption-content <InlineContent JSON>] [--label <label>]` composes Core `insertTable`, optional `updateTableCaption`, then `updateLabel` in one edit and one atomic file replacement. A label does not require a caption. The caption uses the existing single-line inline contract; label validation and collision refusal use `updateLabel` and the shared [label rules](section-references-v1.md#core), including implicit heading IDs. Any failure leaves the original bytes unchanged. `apply-batch` shares the options and accepts `"at": "end"`, resolved by Core before endnotes on the current step's snapshot.

Verification: Core round-trip and fail-closed table tests; CLI file writes and rejected multiline input; Editor save adapter coverage; browser table-authoring exercises Apply/Cancel, Save/Reload, subsequent cell edits, Table reference display and click navigation, and that a caption renders without Tiptap warnings; cross-reference checks a caption's math and resolved/unresolved references, their update when a target is relabeled and undone, and that Source, Save and Reload keep the canonical caption unchanged. Existing table-cell-editing and row/column authoring remain regression coverage.
