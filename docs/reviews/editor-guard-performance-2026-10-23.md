# Editor guard performance

- Status: Draft
- Last verified: 2026-10-23 (CPU comparison and four browser regressions; real UI timing pending).
- Scope: Editor adapter CPU lookup cost; [Continuous editing](../design/document-editing-v1.md) and [ADR-0003](../adr/0003-document-addressing-identity-boundary.md) remain authoritative.
- Issue: [#349](https://github.com/ieumbird/ieumdoc/issues/349).

## Plan

Scope: reuse opening-snapshot path lookup and per-document path groups in normalization,
validation and Save collection. Remove the unused baseline callback union and source-editing
wrapper/comments. Keep validation normalization and committed locator normalization separate:
both can allocate fresh session paths, and only the latter applies them to engine state.

Excluded: Core semantics, new CLI commands (no semantic operation changes), transaction caches,
incremental engine, numbering registry, unrelated refactoring and test cleanup.

Completion: preserve locator/forged identity, deletion, split/merge/reorder, recovery and Undo/Redo
protections; show before/after lookup scaling on fixed-length plain and mixed documents with
100/500/1000/2000/5000 top-level blocks. Assess Windows 2000 default / 5000 stress and provisional
guard p95 16ms / browser input 100ms against measured evidence, not as pre-existing guarantees.

Verification: Editor tests, typecheck, Editor build, docs check and diff whitespace check.
Use existing engine/test primitives for CPU measurements in an exclusive execution slot;
browser regression uses pnpm browser:test and persistent profile after parent slot approval.
Report guard CPU separately from real browser input/rendering and canonical Save/Reload.

## Method

Baseline: `496d800e9dbd6a83e448e77019b22b78f46e0bc9`. Windows, AMD Ryzen 5 5600X
(6 cores / 12 logical processors), Node 24.21.0, pnpm 12.5.1; repository-pinned Tiptap.
Other implementation workers paused tests/builds/browser work for the CPU run. Normal OS
and user processes were not stopped. This is one coordinated run, not a controlled lab.

A temporary tsx runner used the existing `getSchema(editorExtensions())`, fixture
`loadEditableDocument(nativeSource(body))`, projection and `EditorState` APIs. Baseline copies
of the two source files plus the bridge barrel were imported beside the new implementation
in the same process. The old barrel pointed at the old edits module, so both guard stages
actually ran their respective implementations. No benchmark framework or production
instrumentation was added.

Each document has exactly 100, 500, 1000, 2000 or 5000 top-level blocks. Plain documents repeat
`Fixed length ordinary paragraph text.`. Mixed documents repeat this eight-block cycle:

1. That paragraph.
2. `## Fixed length heading`.
3. `> Fixed length quote text.`.
4. A `text` code fence containing `fixed code text`.
5. An unlabeled display equation containing `x = 1`.
6. A two-column pipe table: header `A | B`, body `C | D`.
7. A bullet list: `Fixed list item`, `Other list item`.
8. A divider.

Blocks are separated by two line feeds and wrapped in the native frontmatter. Parsing,
projection, schema normalization, snapshot index and EditorState construction are outside
timing. A single `X` is inserted into the first paragraph. Old/new collected edits must
match before measurement. Each path gets 8 warmups and 40 timed samples using
`performance.now()`; p50 is sorted sample 20 and p95 sample 38 (one-based). Implementation
order alternates: after-first at 500/2000, before-first otherwise. There are no retries,
forced GC, discarded outliers or timing assertions.

- Normalize: `normalizeEngineDocument(baseline, next, false)`; new guard uses its existing
  snapshot Map. It still examines the full next document and declares missing paths.
- Validate: `assertSupportedDocumentChange(baseline, next)` with the new snapshot Map reused.
- Collect: `collectSupportedEdits(snapshot, next)`, including projection, independent
  validation and per-call Core block lookup. It excludes Host replay, serialization and I/O.
- Guard: `state.applyTransaction(state.tr.insertText("X", 2))` using a state with only the
  structure guard plugin. The same prepared transaction is applied to the same immutable
  starting state for each sample. This includes filter, deletion tracking, JSON conversion,
  validation and append normalization; it excludes DOM, React, full editor plugins and Save.

## Regression coverage

Existing `editor.test.ts` already covers forged/missing locators, reordered blocks, split
groups, mixed split/merge edits, save error coordinates, deletion restoration across Save,
and recovery snapshots. Existing block-command and typed-authoring tests cover actual engine
transactions, conversion and Undo/Redo. Those tests are reused; no new test duplicates their
protections and `editor.test.ts` does not need modification. The separately owned
`block-commands.test.ts` and `figure-authoring.test.ts` are untouched.

Editor suite: 269/270 initially passed; the sole failure was
`HTTP rejects an escaped surrogate locator and preserves valid Unicode names`, with
Undici `fetch failed` / `bad port` from a randomly allocated HTTP port. The unchanged
`http-host.test.ts` file passed all 10 tests on targeted rerun. No port, timeout, retry or
protection rule was changed. Typecheck and Editor build passed (existing large-chunk warning).
Final Editor-only typecheck and `editor.test.ts` rerun passed (88/88). `pnpm browser:test
continuous-editing save-session recovery-structure block-move` passed all four scenarios
(46.1s) against this checkout's own Vite server on port 5193 with its persistent profile.

Real keyboard-to-frame timings and large-document Save/Reload are still pending. Two initial
measurement attempts were stopped without valid timing samples: the temporary scenario waited
for a visible `ready` status, although the clean status is empty and `.status:empty` is hidden.
The existing runner and save-session scenario correctly wait for `state: 'attached'`. The
temporary scenario now uses that same state condition and bounded diagnostic waits; no product
code or regression timeout was changed. Its own runner/browser process trees and Vite PID 56940
were terminated; port 5193 was verified free before returning the browser slot.

## CPU results

All values are milliseconds, p50 / p95. [Complete path results](assets/editor-guard-performance-2026-10-23/cpu.jsonl) also include normalization and validation.

| Document | Blocks | Guard before | Guard after | Collect before | Collect after |
| --- | ---: | ---: | ---: | ---: | ---: |
| plain | 100 | 0.764 / 1.091 | 0.224 / 0.387 | 1.554 / 3.329 | 0.848 / 1.599 |
| plain | 500 | 11.247 / 13.113 | 0.999 / 1.572 | 19.972 / 28.06 | 3.955 / 4.682 |
| plain | 1000 | 155.057 / 277.18 | 3.269 / 55.635 | 67.751 / 89.383 | 15.196 / 117.057 |
| plain | 2000 | 408.858 / 560.475 | 4.154 / 9.537 | 451.071 / 1150.359 | 27.425 / 35.648 |
| plain | 5000 | 1032.516 / 1054.759 | 10.452 / 13.802 | 1316.289 / 1431.85 | 42.198 / 46.916 |
| mixed | 100 | 1.593 / 1.962 | 0.391 / 0.617 | 1.431 / 2.177 | 0.677 / 1.306 |
| mixed | 500 | 13.063 / 13.804 | 1.295 / 1.834 | 17.658 / 22.489 | 3.758 / 5.198 |
| mixed | 1000 | 56.554 / 64.586 | 2.762 / 3.726 | 65.483 / 77.621 | 6.32 / 10.207 |
| mixed | 2000 | 236.256 / 359.846 | 5.828 / 7.779 | 244.213 / 272.861 | 12.742 / 14.619 |
| mixed | 5000 | 1475.612 / 1992.731 | 16.711 / 24.991 | 1539.817 / 2301.082 | 35.838 / 46.686 |

The lookup loops now build/traverse Maps once instead of scanning N blocks for each block.
For mixed 1000→5000, validation median grew 31.983→791.743ms before (~24.8x) versus
1.520→6.114ms after (~4.0x) for 5x as many fixed-size blocks. Mixed guard median grew
56.554→1475.612ms before (~26.1x), versus 2.762→16.711ms after (~6.1x).
This supports removing the specified quadratic lookup cost; it does not prove every editor
operation is linear (large individual tables, rendering, numbering and Host replay are separate).

The 1000-plain after run had substantial jitter (guard p95 55.635ms and collect p95 117.057ms).
It is retained, not replaced by a favorable repeat. Mixed 5000 guard p95 24.991ms also exceeds
the provisional 16ms target. Although both 2000-block guard samples were below 16ms p95,
these results do not justify a universal 16ms acceptance gate. Keep 2000 as the proposed
Windows routine measurement size and 5000 as stress coverage, not document admission limits
or a product responsiveness guarantee. Browser input must be assessed separately against the
provisional 100ms target. No further optimization is justified by lookup results alone.
