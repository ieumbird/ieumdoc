# Mixed document input performance (#362)

당시 이름: 이음독(IeumDoc), 현재 Litzio

- Status: Historical
- Last verified: 2026-10-25 (before/after input and CPU/timeline measurements, complete canonical Save/Reload; mixed 2000 p95 96.7ms).
- Scope: Windows development Editor input; [Continuous editing](../design/document-editing-v1.md) and [ADR-0001](../adr/0001-single-document-editor-architecture.md) remain authoritative.
- Issue: [#362](https://github.com/ieumbird/ieumdoc/issues/362); preceding [measurement report](editor-guard-performance-2026-10-23.md).

## Result

The mixed 2000-block p95 target of **100ms is met in this bounded Windows run**:
114.2ms before, 96.7ms after. The sole product change is the Outline row key in
`apps/editor/src/shell/DocumentPanel.tsx`, from `${item.index}:${item.pos}` to `item.index`.
The measured base is `7c80f9f3959fd3c01d6c079b307281c9c5b88425`; the after file's Git blob
is `1f5667094b37b6d4ec60d8a838a01143b36643f7`. No other product source changed.

| Document | Blocks | Before p50 / p95 ms | After p50 / p95 ms | Before / after single Save ms | Full canonical / Reload |
| --- | ---: | ---: | ---: | ---: | --- |
| plain | 2000 | 27.0 / 27.8 | 26.8 / 27.2 | 989 / 470 | pass / pass |
| mixed | 2000 | 100.7 / 114.2 | 82.1 / 96.7 | 1593 / 1623 | pass / pass |
| plain | 5000 | 72.0 / 88.9 | 71.5 / 73.5 | 1275 / 1222 | pass / pass |
| mixed | 5000 | 480.0 / 511.3 | 419.6 / 443.2 | 9239 / 6384 | pass / pass |

The preceding report's mixed 2000 result was 100.6/111.7ms; that is historical evidence
on older source, not the before value used here. All current before/after conditions were
measured once, in plain 2000, plain 5000, mixed 2000, mixed 5000 order. No retries or outlier
removal were used. The after profile and acceptance scenario passed together in 1.6 minutes.
5000 remains a stress workload, and mixed 5000 still exceeds 100ms.

[Before chronological/sorted samples and warmups](assets/editor-input-performance-2026-10-25/before-browser.json)
and [after samples and warmups](assets/editor-input-performance-2026-10-25/after-browser.json)
include all measured values and single Save observations. These Save durations are not
percentiles and do not establish a Save performance improvement.

## Original plan and completion boundary

Measure unchanged source `7c80f9f3959fd3c01d6c079b307281c9c5b88425` before implementation.
Compare plain and mixed 2000-block input CPU/timeline windows to identify the mixed cost,
then change only measured dominant work. Preserve all guards, document semantics,
selection/history, recovery and canonical Save behavior. No new Core semantic operation
or CLI surface is planned. No independent review is performed by this implementation worker.

Acceptance uses the preceding report's exact eight-block mixed cycle and plain paragraphs,
2000/5000 top-level blocks, viewport 1280×720, Vite development server, installed headless
Chrome and this checkout's persistent `pnpm browser:test` runner. Insert 25 native `x` keys
starting at first-paragraph position 2. Discard only the specified five warmups; retain all
20 measured keydown-to-second-requestAnimationFrame samples. p50/p95 are sorted samples
10/19 (one-based). The mixed 2000 target remains p95 ≤100ms; 5000 is stress evidence.

Before every browser batch, check the Windows failed-logon counter; at ≥5 wait for reset.
Only this main worker may run the browser, sequentially. CPU/timeline profiling is separate
from uninstrumented acceptance. Verify exact file identity, block count, second block type,
one-character growth per key, actual Save/Reload engine text equality and independent Core
whole-document canonical equality against the original fixture plus exactly 25 `x` characters.

Run Editor tests, typecheck, production build and affected browser regressions, then record
raw samples, profile attribution, environment and limitations. Push a cohesive PR referencing
#362; do not merge or claim issue completion unless its target is met. Stop all owned processes.

## Profile attribution and change

Fresh four-key profiling found mixed-only Outline work: 36.159ms render,
40.872ms React before-mutation commit and 20.844ms outline reveal geometry within
521.359ms of key/frame windows. These inclusive paths overlap. Plain windows totaled
112.219ms, with no Outline render samples. Typing before all headings changes every
heading engine position, and the former `${item.index}:${item.pos}` React key therefore
remounts every heading row. Use the top-level index as the row key; current props still
carry the latest position, text and level. Keep all reporting, geometry, navigation and
engine validation unchanged. Reprofile and rerun acceptance before deciding further work.

Both profiles use fresh original plain/mixed 2000 fixtures, five native `x` warmups and four
profiled native `x` keys, starting at position 2. They do not save diagnostic edits. CDP CPU
sampling requests 1000 microseconds; timeline capture surrounds input and a one-second drain.
Only native keydown-to-second-rAF trace-mark windows are attributed. This is diagnostic
evidence, not an alternative percentile acceptance run. CPU timestamps are reconstructed
from `startTime` plus cumulative `timeDeltas`, sorted (including negative deltas), and each
sample owns the interval to the next chronological sample, clipped to those windows.

| Four-key inclusive sampled path, ms | Plain before | Mixed before | Mixed after |
| --- | ---: | ---: | ---: |
| Key/frame windows | 112.219 | 521.359 | 408.589 |
| React `performWorkOnRoot` | 6.997 | 127.944 | 96.135 |
| Outline render | 0 sampled | 36.159 | 34.318 |
| React `commitBeforeMutationEffects` | 1.115 | 40.872 | 30.313 |
| Outline `revealInList` | 0 sampled | 20.844 | 0 sampled |
| Outline geometry report | 0 sampled | 11.993 | 8.914 |
| BlockHandles `rectangles` | 36.136 | 98.658 | 89.823 |
| Engine `applyTransaction` | 14.442 | 23.756 | 23.764 |
| Structure guard filter | 9.689 | 15.881 | 17.384 |
| DocumentEditor dirty/update notification | 6.105 | 14.968 | 15.175 |

Inclusive paths overlap; do not sum them. Sample attribution covers the entire measured
windows in these captures. A zero means no attributable CPU sample, not zero execution:
JIT inlining and sampling granularity can hide a named function. The separate plain after
windows totaled 117.001ms, not an instrumented plain speedup. React Mount markers fell from
99 to 0 in mixed windows (plain: 0); markers are not a complete DOM-row census.

The source explains the mixed-only work: each input shifts all 250 heading positions and
therefore used to change every Outline key. React then remounted the heading controls even
though their text, level and block index were unchanged. Index keys preserve those controls;
all current item props, handlers, reporting and reading-position geometry still update.
No row-local React state is added. Heading insertion/deletion/reordering still changes the
indexed content and callbacks through normal reconciliation. The Outline continues to render;
this change removes remounting, not its subscription or current-section tracking.

The fixture has no target labels: `referencesBrokenByDeletion` still scans old/new top-level
nodes but returns before target/reference traversal. Broken-target restoration requires a
prior broken reference. These paths were not dominant sampled costs. Table caption selectors
already skip target resolution for captions without references, and Tiptap already preserves
unchanged NodeViews. Numbering and decorations were not separately sampled as dominant paths.
`shouldRerenderOnTransaction`, all plugins/guards, node views, numbering, handle geometry,
recovery and Save paths remain unchanged. The measured target is met, so no position cache,
DOM traversal replacement, geometry suppression or additional optimization is introduced.

| Mixed main-thread trace duration, ms | Before | After |
| --- | ---: | ---: |
| Layout | 34.507 | 17.861 |
| PrePaint | 19.221 | 14.307 |
| Paint | 25.731 | 15.629 |
| HitTest | 46.053 | 26.392 |

Trace totals may nest and must not be added to sampled CPU costs as independent work.
[Before raw CPU/timeline](assets/editor-input-performance-2026-10-25/before-profile.json.gz),
[before derived summary](assets/editor-input-performance-2026-10-25/before-profile-summary.json),
[after raw CPU/timeline](assets/editor-input-performance-2026-10-25/after-profile.json.gz) and
[after derived summary](assets/editor-input-performance-2026-10-25/after-profile-summary.json)
retain per-key evidence as well as aggregates. The summaries are compact analyzer output
(every named path for the four-key aggregate, the ten largest self and inclusive frames, the five largest
trace events, and sampled named paths per key); rerunning the analyzer on the raw profiles
reproduces them exactly.

## Environment, method and limits

Windows 11 Pro 10.0.26200, AMD Ryzen 5 5600X (6 cores / 12 logical processors), approximately
32GiB RAM; Node v24.21.0, pnpm 12.5.1, Vite 8.3.0, React 19.3.0. Frozen-lockfile install succeeded.
Installed headless Chrome 155.0.8059.85, viewport 1280×720, Vite development server on 127.0.0.1:5193,
and this checkout's unchanged persistent `pnpm browser:test` fixture were used for both sides.
The profile suffix is `e4802c5bba7081e9`. Failed-logon counts before the before-acceptance,
before-profile, after-profile/acceptance and regression batches were respectively 0, 1, 1, 1.
No profile was replaced or shared. Other IeumDoc workers paused heavy work. A separate
pre-existing Chrome session (PID 32552, started 2026-10-23, `cp3-audit-ready`) remained open
and untouched; its CPU was not controlled. Normal OS scheduling remains a source of variation.

The exact plain paragraph and eight-block mixed cycle are specified in the preceding report.
Original bodies were restored for each side, with native frontmatter. Setup/focus is outside
timing. Each condition inserts 25 `page.keyboard.press('x')` characters at first-paragraph
position 2; five are warmups and 20 are captured from native keydown to the second rAF.
p50/p95 are sorted samples 10/19, one-based. CPU/timeline instrumentation is off for acceptance.
The current runner's ordinary action diagnostics are unchanged. Every key must add exactly
one engine text character. File identity, top-level count and second block type are checked.
The product Reload rereads the saved target and must reproduce the complete engine text.

After each acceptance batch, an independent Core parse/serialize comparison required the
entire exact target file to equal the original expected canonical document with only 25 `x`
characters after the first `F`. Both [before target evidence](assets/editor-input-performance-2026-10-25/before-targets.json)
and [after target evidence](assets/editor-input-performance-2026-10-25/after-targets.json) pass
for all four conditions. Their SHA-256 values also match the preceding report's final targets,
confirming identical canonical fixture contents and expected edits across the reports.

This is one coordinated before/after run, not a universal responsiveness guarantee. The
margin below 100ms is 3.3ms. The boundary is a frame-opportunity proxy, not physical display
paint or OS hardware-input latency. Production builds, Electron, native IME, other hardware,
long individual blocks and arbitrary mixed documents were not measured. The larger 5000-block
numbers must not be turned into admission limits or a routine responsiveness guarantee.

The before batch's terminal wrapper was interrupted while its child runner continued; the
child completed all four condition results and closed its browser. The complete sample arrays,
Save/Reload assertions and independent canonical checks were retained, without a rerun or
filtering. This terminal interruption is not reported as a successful wrapper exit.

## Reproduction artifacts and verification

The bounded temporary modules are retained as evidence, not a new test framework:
[measurement scenario](assets/editor-input-performance-2026-10-25/measurement-scenario.js.txt),
[profile scenario](assets/editor-input-performance-2026-10-25/profile-scenario.js.txt),
[fixture/check helper](assets/editor-input-performance-2026-10-25/fixtures.ts.txt) and
[profile analyzer](assets/editor-input-performance-2026-10-25/analyze-profile.mjs.txt).
To reproduce in a controlled slot, copy the scenario text to `apps/editor/test/perf-362.browser.js`
and `perf-362-profile.browser.js`, and the fixture helper to `tmp/perf-362/fixtures.ts`.
Run `pnpm exec tsx tmp/perf-362/fixtures.ts` before each side, then the existing runner with
`IEUMDOC_BROWSER_URL` pointing to the owned server. After acceptance run the helper with
`check <output.json>`; it checks exact whole-document bytes. Archive the scenarios out of
the test directory before regular tests. The existing scenario registry deliberately rejects
temporary scenarios: an initial Editor test run reported that one failure; after removal the
unchanged suite passed **281/281**. No assertion, timeout or registry policy was weakened.

Final local verification:

- Editor tests: **281/281** on the final source after archiving temporary measurement modules.
- `pnpm typecheck`: all packages pass.
- `pnpm --filter @ieumdoc/editor build`: pass, with the existing large-chunk advisory.
- `pnpm browser:test outline continuous-editing save-session recovery-structure block-move document-title ui-language layout-rules cross-reference`: **9/9**, 1.8 minutes. Existing checks cover heading text/level/numbering/reorder/navigation/current section, selection/history, draft restrictions, actual Save, recovery and layout/hover behavior. No new duplicate semantic tests were added for this display identity change.
- `pnpm docs:check` and `git diff --check`: pass.

The owned Vite PID 62264 was stopped; port 5193 and this checkout's profile-owned Chrome
processes were checked clear. Persistent contexts closed, and no measurement scenario remains
in the source test directory. The failed-logon counter remained 1. No other session was stopped.
Independent review and PR CI remain separate from this local implementation evidence.
