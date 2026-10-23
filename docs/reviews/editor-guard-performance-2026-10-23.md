# Editor input and guard performance

- Status: Historical
- Last verified: 2026-10-23 (final source 7a214dcb: Editor 271/271, typecheck/build, eight browser regressions, actual four-condition input and complete canonical Save/Reload verification; mixed 2000 input target unmet).
- Scope: Editor adapter lookups, handle rendering and display numbering; [Continuous editing](../design/document-editing-v1.md) and [ADR-0003](../adr/0003-document-addressing-identity-boundary.md) remain authoritative.
- Issue: [#349](https://github.com/ieumbird/ieumdoc/issues/349).

## Final actual UI acceptance

Measured source head: `7a214dcb2480505a189d1fa09dba51dac80e3146`, including master
`2a03c35abf57e9cad8133409989b17086deec9f5` and the frozen-lockfile-installed parser patches.
This is the measurement of the final handle/numbering changes; earlier UI and profile sections
below describe intermediate implementations, and the guard-only CPU comparison retains its
original revision scope.

| Document | Blocks | Input p50 ms | Input p95 ms | Single Save ms | Full canonical target / Reload |
| --- | ---: | ---: | ---: | ---: | --- |
| plain | 2000 | 19.7 | 27.5 | 465 | pass |
| mixed | 2000 | 100.6 | 111.7 | 1608 | pass |
| plain | 5000 | 83.1 | 109.7 | 1250 | pass |
| mixed | 5000 | 374.7 | 392.6 | 4687 | pass |

The provisional **2000-block input p95 100ms target passes for plain and remains unmet for
mixed**. The 5000-block cases are stress evidence, not the routine acceptance gate. Overall
long-document responsiveness is not complete; #349 remains open and the PR remains Draft.
Preservation success does not convert the mixed result into a performance pass. No threshold
was increased and no outlier was removed.

The fixed original bodies were restored before this run. Each condition typed 25 native `x`
keys at the first paragraph's position 2, with five warmups and 20 measured keydown-to-second-rAF
samples. Setup/focus stayed outside timing. The named file, block count and second block type
were checked before input; every key increased engine text length by one. Same Windows machine,
1280×720 viewport, Vite development server and installed headless Chrome persistent runner;
other workers paused heavy work. CPU/timeline instrumentation was off. p50/p95 remain sorted
samples 10/19 (one-based). This is a frame-opportunity proxy, not hardware-input or physical-paint
latency. Save is a single click-to-saved observation, not a percentile. Production/Electron and
other hardware remain outside this measurement.

[Final chronological and sorted samples](assets/editor-guard-performance-2026-10-23/browser-final.json)
and [exact whole-document canonical comparisons, identities and hashes](assets/editor-guard-performance-2026-10-23/targets-final.json)
retain the results. Actual Reload matched engine text in every case, and an independent Core
parse/serialize comparison confirmed the complete expected document with only 25 inserted `x`
characters. The final measurement scenario passed in 1.3 minutes. Final regression and process
cleanup status are recorded separately below.

Final changed-area verification on that source passed Editor tests **271/271**, Editor typecheck,
Editor production build, and eight browser scenarios: continuous-editing, save-session,
recovery-structure, block-move, document-title, ui-language, layout-rules and cross-reference.
The unchanged document-title scenario passed this final run; its earlier isolated failure and
unestablished cause remain recorded below. The owned measurement/regression Vite PID 29852
was stopped, persistent contexts closed normally, and port 5193/profile-owned processes were
checked clear. The build retains its existing large-chunk advisory.

## Original lookup plan

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

Two initial
measurement attempts were stopped without valid timing samples: the temporary scenario waited
for a visible `ready` status, although the clean status is empty and `.status:empty` is hidden.
The existing runner and save-session scenario correctly wait for `state: 'attached'`. The
temporary scenario now uses that same state condition and bounded diagnostic waits; no product
code or regression timeout was changed. Its own runner/browser process trees and Vite PID 56940
were terminated; port 5193 was verified free before returning the browser slot.

After integrating master, the first bounded attempt detected an input-length mismatch during
warmup: `openDocument` waits for the file click, not for the replacement Editor to finish loading.
The measurement had selected the previous Editor. The [failed attempt log](assets/editor-guard-performance-2026-10-23/setup-failure.txt)
is retained. Setup now waits for the target block count and ready state before selecting the
caret. Every condition starts with a full page reload to the default sample (not the preceding
condition), and the final four exact target files were independently checked as described below.
The input-length assertion was retained. These setup failures yielded no accepted timing samples;
they are not product passes or evidence that a product failure was fixed by retrying.

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
or a product responsiveness guarantee. Browser input is assessed separately below against the
provisional 100ms target. No further optimization is justified by lookup results alone.

## Intermediate lookup-only browser input and Save/Reload

Measured implementation head: `0836a3d937c3d2d66f43e6bfe08dbba875b33bde`, containing master
`8b3ea92354f86ef282bfd2a0f73c55ac29c1d29c`. CPU results above retain their original before/after
revision scope; they were not rerun after integration. This UI run used the same Windows machine,
the checkout's Vite development server on 5193 and installed headless Chrome through the existing
`pnpm browser:test` persistent-profile runner, viewport 1280×720. Other workers paused heavy work.

The same fixed plain/mixed bodies were used at 2000/5000 blocks. Setup and focus are outside
timing. Each condition inserts 25 real `page.keyboard.press('x')` characters at position 2 of
the first paragraph. Five are warmups; 20 are measured from captured native keydown to the
second `requestAnimationFrame`. A length assertion after every key requires exactly one added
character. p50/p95 are sorted samples 10/19 (one-based). This measures the complete Editor/React/
browser update path plus frame scheduling; it is a frame opportunity proxy, not a physical
display-paint or OS hardware-input latency measurement. No UI before/after speedup is claimed.

Save is one observed click-to-`saved` duration per document, including automation click dispatch,
Host replay, canonical serialization and file I/O. It is **not a Save percentile**. The product
Reload command then rereads the file, and the full engine text must match the pre-save state.
After the browser closed, an independent Core parse/serialize comparison verified that each
exact target file equals the entire expected canonical fixture with only those 25 inserted `x`
characters. This checks all block kinds/content, not just the measured paragraph, and confirms
that plain/mixed results belong to their named files. [Target identities, block counts and SHA-256](assets/editor-guard-performance-2026-10-23/targets.json)
record that evidence. [All 20 input samples per condition and observed Save durations](assets/editor-guard-performance-2026-10-23/browser.json)
are retained without outlier removal.

| Document | Blocks | Input p50 ms | Input p95 ms | Single Save ms | Exact target / Reload |
| --- | ---: | ---: | ---: | ---: | --- |
| plain | 2000 | 327.8 | 521.0 | 1356 | pass |
| plain | 5000 | 1249.2 | 1691.3 | 4659 | pass |
| mixed | 2000 | 528.9 | 622.3 | 2320 | pass |
| mixed | 5000 | 1894.1 | 2059.2 | 10064 | pass |

All four conditions **miss the provisional 100ms input target**. The guard lookup improvement
does not make these large documents responsive. The 2000 routine / 5000 stress proposal is only
a repeatable verification workload, not a recommended responsive document size. Retain the
100ms target as unmet; do not raise it to these observations or turn preservation-test success
into a performance pass. The CPU guard's provisional 16ms target is also not a universal guarantee.

The remaining end-to-end latency needs a separate bounded profile of the actual input pipeline
(other plugins, notifications/serialization, React, DOM/layout/rendering and recovery work) before
another optimization. These measurements do not identify which of those dominates, and do not
justify a transaction cache, incremental engine or numbering registry. Production builds,
Electron, other hardware, OS IME and long/complex individual blocks are outside this measurement.

The final temporary scenario passed in 3.4 minutes. Its persistent context closed normally;
the owned Vite PID 58324 was stopped, no profile-owned Chrome remained, and port 5193 was free.
Temporary measurement modules were moved outside the source tree; no permanent benchmark
framework, timing gate, timeout relaxation or retry policy was introduced.

## Bounded input profile after the unmet target

On the same implementation head, a separate diagnostic run loaded the verified plain/mixed
2000-block files and typed four real `y` characters in each, asserting the exact filename,
block count, second block type and one-character growth after every key. These diagnostic edits
were not saved. CDP CPU sampling (requested interval 1000 microseconds) and timeline tracing
surrounded the inputs plus a one-second drain. Analysis below includes only each native-keydown
to second-animation-frame window. It excludes the drain and does not infer a recovery cost from
the earlier 521ms p95. This is a four-key profile under instrumentation, **not another p95 run**.

[Compressed raw CPU profiles and timeline traces](assets/editor-guard-performance-2026-10-23/input-profile.json.gz)
and [derived profile summary](assets/editor-guard-performance-2026-10-23/input-profile-summary.json)
preserve the evidence. CPU timestamps are reconstructed from `startTime` plus cumulative
`timeDeltas`, then sorted because this capture contains out-of-order samples (negative deltas).
Each sample owns the interval to the next chronological sample, clipped to the key windows.
Thus attributed sample durations sum to the measured windows rather than double-counting
overlapping intervals. Function costs below include descendants and overlap with each other;
they must not be added. Trace event totals likewise can overlap through nesting.

| Four-key aggregate | plain 2000 | mixed 2000 |
| --- | ---: | ---: |
| Key/frame windows | 1810.042ms | 2178.131ms |
| React `performWorkOnRoot` inclusive | 1618.294ms (89.4%) | 1539.780ms (70.7%) |
| `BlockHandles` render inclusive | 931.143ms (51.4%) | 701.348ms (32.2%) |
| `moveBlockedHint` inclusive | 415.748ms (23.0%) | 314.086ms (14.4%) |
| `editorTitleIndex` inclusive | 252.408ms (13.9%) | 287.668ms (13.2%) |
| `blockNumbers` inclusive | not a dominant plain path | 238.996ms (11.0%) |
| Main-thread `Layout` trace events | 9.421ms | 34.614ms |

Source inspection matches the sampled title path: each of N block handles calls
`moveBlockedHint`, which rescans N document children through `editorTitleIndex`/`titleMarkers`.
The first bounded proposal is to calculate that index once for the same React render/document
and share it across handle hints. No persistent cache is required. The measured title cost also
shows why this change alone cannot be claimed to meet the 100ms target. Remaining handle
rendering and mixed-document numbering need separate bounded decisions and subsequent actual
input measurement; this profile does not authorize an incremental engine or a numbering registry.
React development instrumentation is visible in the capture, so these shares describe this
development-server workload and must not be projected onto a production build.

The diagnostic scenario passed in 19.8 seconds; its browser context closed and its own Vite
PID 9520 was stopped. Port 5193 and profile-owned processes were checked clear before analysis.

### First follow-up scope and verification

Compute the title index once inside each `BlockHandles` render using its current editor document.
Keep title-fixed hint precedence there; the parent callback supplies only active-draft restrictions.
This avoids capturing a parent-render title index across the handle component's independent
transaction updates. Do not change numbering, geometry, validation or draft state in this step.
Reuse the existing `document-title` and `block-move` browser checks for title changes, Undo,
fixed-title dragging and Apply/Cancel restrictions, plus Editor typecheck. Then run a bounded
2000-block diagnostic before deciding the next optimization or repeating all four UI conditions.

The title-once diagnostic passed `document-title` and `block-move`; four-key windows fell from
1810 to 1300ms plain and 2178 to 1766ms mixed under instrumentation. Remaining handle render
cost was 450/319ms, translation 237/211ms and Base UI Button 203/190ms (overlapping inclusive
costs). The next bounded step preserves identical geometry state and memoizes individual handle
rows with scalar display/permission props and stable callbacks. Locale subscriptions remain on
each row; current title/draft restrictions are recomputed before row comparison. All geometry
reads, controls, hover and drag interactions remain. Reuse title, move, hover/layout regressions;
do not add count/markup assertions. Mixed numbering remains a separate measured path.

With row memoization, title/move/layout-hover regressions passed and the diagnostic plain
four-key sum was 179ms (individual keys 65.6/40.8/35.8/36.6ms); mixed was 993ms. Mixed
`blockNumbers` still consumed 253ms inclusive (25.4%). The next step shares its Core-computed
display numbers only for the identical immutable ProseMirror document, using the existing
endnote/citation WeakMap pattern. A new document identity recomputes the entire numbering;
no semantic rule, transaction validation, registry or incremental update is introduced.

The numbering step passed 13 cross-reference unit tests, including revisiting the earlier
document after numbering a changed one, Editor typecheck and the cross-reference browser
scenario. Instrumented mixed four-key time fell from 993 to 689ms; `blockNumbers` was no longer
among the top 55 inclusive paths. Plain remained 176ms. These diagnostic sequences retain
all four keys including cold first-key effects; they are not percentile acceptance results.

| Diagnostic stage | Raw CPU/timeline | Derived summary | plain / mixed four-key ms |
| --- | --- | --- | ---: |
| Title once | [raw](assets/editor-guard-performance-2026-10-23/title-once-profile.json.gz) | [summary](assets/editor-guard-performance-2026-10-23/title-once-profile-summary.json) | 1300 / 1766 |
| Equal geometry and memoized rows | [raw](assets/editor-guard-performance-2026-10-23/row-memo-profile.json.gz) | [summary](assets/editor-guard-performance-2026-10-23/row-memo-profile-summary.json) | 179 / 993 |
| Immutable-document display numbering | [raw](assets/editor-guard-performance-2026-10-23/numbering-profile.json.gz) | [summary](assets/editor-guard-performance-2026-10-23/numbering-profile-summary.json) | 176 / 689 |

A subsequent [12-key diagnostic without CPU/timeline instrumentation](assets/editor-guard-performance-2026-10-23/uninstrumented-diagnostic.json)
still showed a late spike: plain key 11 took 350ms, mixed key 11 took 490.2ms. Most other plain
keys were 28–39ms and mixed keys 100–150ms. No samples were removed. These results do not pass
the 100ms input target and require a longer bounded profile before another optimization.

After integrating master `cdcedde0020ec4b625245688decb769a24fb858a` and running
`pnpm install --frozen-lockfile`, head `bdcb2516f03c467732660772563157b0b15190fc` was profiled
for 12 keys ([raw](assets/editor-guard-performance-2026-10-23/long-profile.json.gz),
[aggregate](assets/editor-guard-performance-2026-10-23/long-profile-summary.json),
[key 11](assets/editor-guard-performance-2026-10-23/long-profile-key11.json)). Key 11 took
400.7/586.2ms; React accounted for 345/411ms inclusive and `HandleRow` for 104/117ms.
There was no `TimerFire` in either key window, and recovery/capture was not a dominant stack.
This evidence does not support changing recovery timing or safety.

A separate [geometry diagnostic](assets/editor-guard-performance-2026-10-23/wrap-diagnostic.json)
confirmed the trigger: exactly at key 11, the first paragraph height changed from 28.890625 to
57.78125px and the second block moved down by 28.890625px in both documents. All later row
tops consequently changed. The approved local follow-up separates each positioning wrapper
from its memoized controls; current top/height are read through a local geometry ref by menu
and drag callbacks. Position, visibility and menu-open attributes update on the wrapper;
permissions, block kind/index and locale still update the controls. No custom memo comparator,
geometry-read suppression, recovery or validation change is introduced. Verify title, move,
hover/layout and the complete uninstrumented 12-key sequence, including wrapping.

The wrapper follow-up passed title/move/layout-hover checks; the uninstrumented wrap key was
143.3ms plain and 182.8ms mixed, still not an acceptance pass. Existing `block-move` now also
checks menu anchor displacement after actual wrapping, viewport resize and reorder; its existing
real-drag tint assertion checks the new coordinates. That scenario and `ui-language` passed.

An updated 12-key profile reduced TableTools to 47ms of 1926ms mixed (2.5%), with no TableTools
samples in a representative steady key. No TableTools change is justified or made. Residual
BlockHandles rendering was 191ms plain / 238ms mixed. The final bounded optimization uses
standard React memoization on BlockHandles and stabilizes the parent's hint callback until its
existing draft revision changes. Its own transaction/ResizeObserver updates continue reading
all geometry. State equality includes source-path identity and the current title flag, not only
dimensions/type/endnote status: same-sized structural changes must refresh draft permissions.
Title lookup occurs once per refresh from the current document. Locale subscriptions and menu
props independently invalidate rendering. No custom React comparator is used. After affected
regressions, run the actual four-condition acceptance before considering further scope.

The [wrapper diagnostic](assets/editor-guard-performance-2026-10-23/wrapper-diagnostic.json)
and subsequent [raw profile](assets/editor-guard-performance-2026-10-23/wrapper-profile.json.gz)
with [summary](assets/editor-guard-performance-2026-10-23/wrapper-profile-summary.json) retain
the intermediate evidence; these are not measurements of the final memoized boundary.

One unchanged `document-title` run after the memo boundary failed its composite
`emptyTitleRemoved` check ([failure](assets/editor-guard-performance-2026-10-23/title-removal-failure.txt)).
All other title checks passed. A diagnostic with the same assertion passed, followed by six
isolated empty-title cycles that also passed; their [observed state](assets/editor-guard-performance-2026-10-23/title-removal-diagnostic.json)
shows no title, visible Add a title, original paragraph and clean status. The original failure
did not capture those individual predicates, so its cause remains unestablished. No timeout,
assertion, recovery or title implementation was changed to make it pass. Retain this limitation
and rerun the unchanged scenario with the final affected-area set.

## Residual profile of the final source

After acceptance, a single bounded diagnostic on the same source used only mixed 2000: five
warmup `y` keys, then six profiled keys. The saved fixture already contained the acceptance
run's 25 `x` characters; the sixth profiled key therefore included the separately verified
paragraph wrap. No code changed and the acceptance run was not repeated. The six instrumented
durations were 119.4, 109.3, 110.7, 110.1, 108.6 and 250.3ms, totaling 808.345ms by trace marks.
These are diagnostic durations, not a p95 estimate. [Raw profile](assets/editor-guard-performance-2026-10-23/current-profile.json.gz)
and [summary](assets/editor-guard-performance-2026-10-23/current-profile-summary.json) retain the capture.

| Sampled path in six key windows | Inclusive ms | Share |
| --- | ---: | ---: |
| `blockNumberAt` | 9.512 | 1.18% |
| `resolve`/`findIndex` specifically beneath `blockNumberAt` | 7.951 | 0.98% |
| Number selector's `getPos` → `posBeforeChild` | 10.998 | 1.36% |
| Handle `rectangles` | 152.915 | 18.92% |
| `nodeDOM` → `descAt` specifically beneath `rectangles` | 54.540 | 6.75% |
| `BlockHandles` render | 58.779 | 7.27% |
| React `performWorkOnRoot` | 249.444 | 30.86% |

Paths overlap; percentages must not be summed. `getBoundingClientRect` self time was
105.965ms across callers. Main-thread trace events included Layout 53.424ms, PrePaint 56.784ms,
HitTest 40.763ms and Paint 28.940ms; these cannot be added to sampled CPU costs as independent
time. The measured approximately 1% resolve cost does not justify another position cache.
Remaining DOM lookup/geometry and rendering work has not been proven removable while preserving
the engine's DOM mapping and controls. No further implementation, geometry-read suppression,
virtualization or recovery/validation change follows from this diagnostic alone.

The diagnostic's own Vite PID 51820 was stopped, its persistent context closed normally, and
port 5193 and owned browser/server processes were checked clear. No task-owned background process
or temporary measurement source module remains.
