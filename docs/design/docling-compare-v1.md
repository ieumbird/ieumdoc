# Docling comparison v1

- Status: Implemented
- Last verified: 2026-10-30
- Authority: owner decisions in [#766](https://github.com/ieumbird/ieumdoc/discussions/766), [#767](https://github.com/ieumbird/ieumdoc/discussions/767), [#769](https://github.com/ieumbird/ieumdoc/issues/769), under [ADR-0011](../adr/0011-code-module-boundary.md).

The sidebar's **Docling comparison** action opens the shared folder picker for
a conversion folder containing `document.md` and `document.docling-map.json`.
It opens a **Docling comparison · source name** tab; opening the same conversion
selects its existing comparison tab. An ordinary editable tab of the same file
is independent. Comparison tabs have no Save, draft, recovery or mutation session.
Closing one needs no unsaved-change decision. They are not restored at startup.

The left pane displays original page images with source bboxes using the map v1
page sizes and each bbox's TOPLEFT/BOTTOMLEFT origin. Categories have token colors
and a legend; decoration is dashed and unsupported is dotted. Selecting a region
shows its source ref, status, reason and conversion notes, and reveals the target
when the map matches. Counts include every map item, including groups and items
without provenance; only elements with provenance have source boxes.

The right pane reuses Editor's existing schema, projection and read-only NodeViews
for the public Core read model: lists, tables, equations, figures and endnotes.
An engine transaction filter rejects document changes. The module gets block and
recursive list-item positions through a callback, never Editor DOM. The Endnotes
action reveals trailing definitions. Source notes retain their original language.

Visible regions connect to visible document targets. Scroll synchronization is on
by default and can be disabled. Monotonically increasing correspondence anchors
drive scrolling in either direction. Endnotes/groups remain clickable links but
are excluded from scroll anchors when their order differs from the body.
Images mount only for pages intersecting the source viewport; page-size placeholders
retain whole-document scroll geometry. Only visible links are drawn. The Host
parses/validates the sidecar once per open; no repeated source JSON parsing runs
on the browser scroll path.

A Markdown SHA-256 mismatch appears in the shared bottom-right notification
center, following owner P07 in [#777](https://github.com/ieumbird/ieumdoc/issues/777).
It expands without taking focus, can be collapsed/dismissed and offers Go to
problem. Source regions and the current document remain readable; stale targets,
links and synchronized scrolling are disabled. Reconvert, close and reopen to use
fresh correspondence. Invalid format/coordinates/targets refuse opening with a
folder-picker error.

Comparison always uses two side-by-side panes and assumes a wide desktop window.
This is the explicit #769 exception to [ADR-0010](../adr/0010-supported-viewport-and-input.md):
640px usability/layout verification is not a target. Pane contents shrink and
scroll without overflowing the application shell.

UI uses shared controls/tokens and adopted P11 checkbox/P12 file picker patterns.
Bbox overlays, correspondence wires and the conversion-note strip are new
comparison-specific visual patterns, not generic Editor conventions.
Confirmation state, SQLite, correction, AI proposals, source mutation and post-edit
relinking are outside this contract. No new CLI command is needed for read-only UI;
headless conversion remains `ieumdoc docling convert`.

## Verification on 2026-10-30

Public NIST (11 pages) and the declared synthetic supplement exercise opening,
exact visible bbox/link counts, BOTTOMLEFT/TOPLEFT coordinates, decoration and
unsupported regions, list targets, read-only engine rejection, endnotes, both
scroll directions, sync off, stale warning/dismissal and tab group movement.
The shared Host test checks Root denial, non-GET refusal, stale snapshots and
remote/data/traversal page-image refusal. Existing Editor, layout-rules,
quiet-document, editor-groups and production HTTP Save/recovery/conflict checks
also pass. Manual 1440px review captures live separately from assertion tests;
they cover first view, figure/table/equation/endnotes and stale Light/Dark states.

The private local IEEE 1547 input was converted with the CLI and opened whole:
138 page placeholders, 1,436 native blocks, 2,728 converted map items, 373
decorations and 11 unsupported items. At 1440×1000 in persistent headless Chrome,
one observed open took 3,676ms. Initial source page images: 2; peak during a
120-frame full-range scroll: 3. Frame intervals were p50 16.9ms, p95 24.5ms,
maximum 137ms, with one observed 123ms long task. The scroll reached the last
page. GC-normalized JavaScript heap grew from 50,772,516 to 69,500,812 bytes
(about 17.9MiB); this excludes decoded image/GPU/native browser memory.
This is one local responsiveness observation, not a sustained 60fps or memory
ceiling guarantee. The native document is rendered whole; page pixels and wires
are viewport-bounded. IEEE content and screenshots are not committed.
