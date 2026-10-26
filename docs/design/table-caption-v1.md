# Table caption and label v1

Implementation plan (#555, approved table-caption portion of #557, 2026-10-26):
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
- Direct-editing verification: 2026-10-26 (#555 and the approved table-caption portion of #557; scope and evidence below).
- Caption-label verification: 2026-10-26 (#462 Core template rule, CLI inspect, cross-reference browser immediate update, Undo/Redo, Source and Save → Reload).
- CLI insertion verification: 2026-10-15 (#280 caption/label in one write, label-only table, invalid/duplicate label refusal and rich batch caption; Core/CLI tests).
- Last verified: 2026-10-17 (UX review: Edit moved to the table's action bar; table-authoring and property-drafts browser checks).
- Previous verification: 2026-10-11 (contract compared with current code and regression coverage; caption inline math and reference display, #165).
- Scope: Core table caption/label operations and their Editor/CLI interfaces; [Table interaction](table-interaction-v1.md).

Issue #94. Core owns `updateTableCaption` and table `updateLabel`. Plain tables become MyST `{table}` directives when caption or label is present, and return to plain Markdown when both are removed. Canonical writing uses the existing Markdown writer for the caption and GFM grid, then verifies the complete semantic round-trip. Cell paths remain logical `[block,row,column]` regardless of the directive wrapper.

Editor uses the existing single document state. Captions are edited directly below the
table, including formatting, links, inline math, cross-references and citations, with the
same inline controls as Figure captions and prose. A table owns its caption: moving or
deleting the table includes its caption, and Undo/Redo restores them together. ArrowDown
from the final grid row enters the caption; ArrowUp from its first line returns to the
last cell. Enter leaves the table. Emptying a caption removes its persistent content;
a label alone still numbers the table. Removing both immediately removes the number.

Hover a table and choose Edit (the pencil below the grid, beside Table actions, which
also offers Edit label). The properties form contains only Label; Apply/Cancel and
unsaved-draft protection apply to that field. It preserves the live caption, including
edits made while properties are open. Add caption, below a table without one, creates an
inline caret surface and focuses it, or focuses the existing empty caption without
creating another one. The action stays available while the caption is empty. A caption cleared during editing remains a caret
surface until reopening; Save omits its empty content. Cell and row coordinates remain
unchanged. Core read models, canonical MyST and CLI surfaces are unchanged.

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
options still reject native admission. No new table editor engine or persistence
architecture is introduced.

CLI: `ieumdoc update-table-caption <file> --path <block> --text <caption>` (empty text removes it), or `--content <InlineContent JSON>`. `update-label` accepts tables; `inspect --format json` includes caption, label and computed table number.

Insertion (#280): `insert-table <file> --at <index|end> --cells <json> [--align <json>] [--caption <text> | --caption-content <InlineContent JSON>] [--label <label>]` composes Core `insertTable`, optional `updateTableCaption`, then `updateLabel` in one edit and one atomic file replacement. A label does not require a caption. The caption uses the existing single-line inline contract; label validation and collision refusal use `updateLabel` and the shared [label rules](section-references-v1.md#core), including implicit heading IDs. Any failure leaves the original bytes unchanged. `apply-batch` shares the options and accepts `"at": "end"`, resolved by Core before endnotes on the current step's snapshot.

Verification: existing Core/CLI contracts retain canonical round-trip and fail-closed
coverage. Editor grid-command coverage protects rich captions while rows/columns change,
and checks invalid duplicate captions. The `table-caption` browser scenario reproduces
#555 before the fix, then checks rich editing, Undo/Redo, Save/Reload, keyboard entry and
exit, shared selection/slash authoring, whole-table move/delete, removal and addition.
Existing table-authoring, table-cell-editing, cross-reference, property-drafts, citations,
recovery-structure and continuous-editing protect their interface-specific integrations.

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
