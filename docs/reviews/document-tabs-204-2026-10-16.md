# Document tabs #204: implementation and review

당시 이름: 이음독(IeumDoc), 현재 Litzio

- Status: Historical
- Last verified: 2026-10-16 (implementation and user-approved visual review; verification recorded below).
- Authority: evidence for [#204](https://github.com/litzio/litzio/issues/204), not a separate behavior contract. Current contracts: [Editing session and Save](../design/editing-session-save-v1.md), [UX shell](../design/editor-ux-shell-v1.md), [layout](../design/editor-layout-rules-v1.md), [visual language](../design/editor-visual-language-v1.md).
- Base: `8b4ed6f`, including PR #312. Target: `feat/204-document-tabs`, second and final implementation step.

## Scope and completion

Keep one mounted `useDocumentSession` and `DocumentEditor` per tab. App owns startup, successful
Open/New admission, normalized-path identity, active/close selection, shared dialogs and all-tab
unload/restart aggregation. Tab switching keeps content, history, property drafts, selection, scroll
and view without reprojecting the document. Hidden sessions suspend portals, autofocus and geometry.

Complete with tab-close work protection (including post-Save newer edits), active-only Save/Source/
Reload, all-tabs Desktop protection, responsive accessible tab UI, the PR #312 observable-busy
regression, updated contracts, required tests and actual-product visual review. Rough memory/switch
measurements inform the review; no tab limits or eviction are introduced.

No Core, CLI or Host persistence change, Save all, close others/all, drag reorder, tab restoration,
split view, watchers, file tracking, OS file association, recovery or autosave. CLI parity is not
applicable to these Editor interactions. No remote push or PR is part of this delivery.

## Structure and behavior

`DocumentTab` owns its hook/editor and reports current session state to the shared shell.
`document-tabs.ts` contains only normalized-path lookup, close-neighbour choice, display names and
pending-work aggregation. `DocumentTabs` is the header's accessible scrolling tab row.
`EditorVisibility` is a presentation context for existing geometry and overlay consumers. NodeViews
keep their own drafts; form identifiers use mounted-instance IDs rather than document-local paths.

Open/New waits for a successful Host response before admitting a tab. An existing normalized path
activates the retained instance. Dirty work does not block navigation. Close uses the existing
confirmation and Save path; failure, cancellation and newer applied edits retain the tab. Inactive
close preserves the active document and its scroll. Last close retains folder/preferences and any
Host start information. A Host that initially supplied a document has folder/recent-folder start
actions, without inventing a sample path.

The Desktop native window-close dialog remains native, with plural wording. The timed restart
check only aggregates pending work; it never waits for a new user-input dialog. The existing
renderer/Host lifetime and Save revision boundaries remain.

## Verification and visual evidence

Exact automated results and measurements are recorded below; original captures and approval follow.
Captures use the actual product at 1440×900 and 375×900, Windows Chrome, DPR 1, 100% zoom and bundled
Pretendard. The product currently implements one light presentation; no dark theme is available.
The clean base was captured before implementation. Multi-tab states have no equivalent in the base;
their Before images show the same documents opened through its single-document interface.

## Visual review

The 1440px comparison preserves document typography, content width and axis; the new tab row adds
40px plus its 1px border below the existing controls. Labels, close icons, active underline, dirty
dot and keyboard focus reuse the existing tokens. At 375px only the tab row scrolls horizontally;
Save and all three close-dialog actions remain visible. Long tab names truncate while full paths
remain in tooltips and complete names in accessible labels. Same names use distinguishing parents.

The expanded sidebar already leaves a very narrow document at 375px in the clean base; this change
retains that layout. Collapsing the existing sidebar remains available. A responsive shell redesign
is outside #204. Dark-theme captures do not apply because no dark theme is implemented.

Original product captures (light, 1440×900 and 375×900) are under `docs/design/assets/issue-204/`.
Before is clean `8b4ed6f`; After is this worktree. The base has no tabs, so its several/long states
show sequential Open, and its dialog is the original Open-time work-loss confirmation. Same-name
After additionally proves simultaneous `alpha/guide.md` and `beta/guide.md`; the base cannot show
that state. Images are original browser captures, not mockups or composites.

| State | 1440px Before | 1440px After | 375px Before | 375px After |
| --- | --- | --- | --- | --- |
| one | [before 1440](../design/assets/issue-204/before-1440-one.png) | [after 1440](../design/assets/issue-204/after-1440-one.png) | [before 375](../design/assets/issue-204/before-375-one.png) | [after 375](../design/assets/issue-204/after-375-one.png) |
| several | [before 1440](../design/assets/issue-204/before-1440-several.png) | [after 1440](../design/assets/issue-204/after-1440-several.png) | [before 375](../design/assets/issue-204/before-375-several.png) | [after 375](../design/assets/issue-204/after-375-several.png) |
| long | [before 1440](../design/assets/issue-204/before-1440-long.png) | [after 1440](../design/assets/issue-204/after-1440-long.png) | [before 375](../design/assets/issue-204/before-375-long.png) | [after 375](../design/assets/issue-204/after-375-long.png) |
| dirty | [before 1440](../design/assets/issue-204/before-1440-dirty.png) | [after 1440](../design/assets/issue-204/after-1440-dirty.png) | [before 375](../design/assets/issue-204/before-375-dirty.png) | [after 375](../design/assets/issue-204/after-375-dirty.png) |
| close-dialog | [before 1440](../design/assets/issue-204/before-1440-close-dialog.png) | [after 1440](../design/assets/issue-204/after-1440-close-dialog.png) | [before 375](../design/assets/issue-204/before-375-close-dialog.png) | [after 375](../design/assets/issue-204/after-375-close-dialog.png) |
| Same names | Not supported | [After 1440](../design/assets/issue-204/after-1440-same-name.png) | Not supported | [After 375](../design/assets/issue-204/after-375-same-name.png) |

Visual approval: the user approved the current 1440px/375px views on 2026-10-16 ("현재 화면 승인").

## Strict self-review and scope decisions

- Session isolation: one mounted hook/editor per tab; Host-normalized paths decide duplicates. The
  real A/B regression retains engine identity, independent Undo/Redo, drafts, selection, scroll and
  Source view, and observes zero document API requests during switching. Save/Reload uses each file.
- Close safety: Cancel, discard, Save, failure/conflict and newer edits are covered on the shared
  dialog. An inactive Save failure also names that tab in the shell; it does not silently hide the
  failure or activate the tab. Last close keeps the folder and available Host start information.
- Async attribution: PR #312's lifetime guard is retained; its test now asserts observable `busy`.
  A delayed Figure validation can finish in its retained hidden owner without affecting B or focus;
  destroyed/deleted owners still ignore late completions. Deferred outline navigation checks DOM
  visibility before changing selection, focus or scroll.
- Hidden effects: properties, inline/reference forms and block tools suspend when hidden. Outline,
  table and overlay geometry observers stop; table/label/math/reference form IDs are instance-local.
  Restoring a property/reference form does not autofocus over the selected tab.
- All-tabs protection: real renderer `beforeunload` event handling and the mocked Desktop restart
  bridge inspect hidden dirty/draft sessions. The existing native Desktop close dialog uses plural
  wording; no extra dialog is inserted into the timed restart handshake.
- Layout fixes found by existing regressions: heading scroll margin and command-menu maximum height
  now use measured header height. The extra row otherwise hid an outline target and pushed the last
  menu action below a short viewport. The menu test checks actual scroll access to its last action.
- Test scope: existing browser selectors target the active document, while portals remain scoped by
  their unique visible surface. No new `.first()` workaround masks duplicate document sessions.
  Re-reading saved tables/outline explicitly invokes Reload; activation is a separate operation.
  Keyboard focus tests start from the final tab-row control now that it precedes the document.
- No feature-scope deviation: no Core/CLI semantic or Host persistence implementation changed.
  A Host whose initial response is a file supplies no sample/start metadata; last close uses the
  normal folder/recent-folder start actions without inventing a sample. A Host-provided start
  response (including sample/allowed roots) is retained, and sample retention is browser-tested.

The 375px expanded-sidebar layout limitation predates this change. The production build reports
its existing >500 kB chunk-size advisory. Installed Desktop packaging, OS-native close UI and a
real updater install were not re-run: these boundaries did not change, and remain CI/manual checks.
The Desktop browser regression uses the existing mock bridge, not a claimed installed-app proof.

## Changed files

| Area | Files |
| --- | --- |
| Session ownership | `apps/editor/src/App.tsx`, `useDocumentSession.ts`, new `DocumentTab.tsx` and `document-tabs.ts` |
| Hidden presentation | `apps/editor/src/DocumentEditor.tsx`, new `editor-visibility.ts`, `block-properties.tsx`, `editor-schema.tsx`, `cross-reference.tsx`, `table-tools.tsx`, `ui/use-overlay-bounds.ts` |
| Tab UI | New `apps/editor/src/shell/DocumentTabs.tsx`, `shell/UnsavedChangesDialog.tsx`, `styles.css`, `styles/tokens.css` |
| Desktop | `apps/desktop/src/main.ts` (native close wording only) |
| Unit/integration harness | `apps/editor/test/shell.test.tsx`, `figure-authoring.test.ts`, `helpers/document-session-harness.ts` |
| Browser support | `apps/editor/test/browser/fixtures.ts`, `navigation.ts`, `scenarios.ts`, `scenarios.spec.ts`; new `document-tabs.browser.js`; active-document scoping and Close/Reload adaptations in the existing scenario files listed below |
| Current documentation | `docs/README.md`, `docs/adr/0007-editing-session-lifetime.md`, `docs/design/editing-session-save-v1.md`, `editor-ux-shell-v1.md`, `editor-layout-rules-v1.md`, `editor-visual-language-v1.md`, `folder-picker-v1.md`, `filesystem-host-boundary-v1.md`, `desktop-distribution-v1.md` |
| Evidence | This review and 22 original PNGs in `docs/design/assets/issue-204/` |

No dependency, package-manager lock, browser profile policy, Core/CLI semantic source or Host
persistence file changed. The temporary capture-only script and debug timeout changes are removed.

## Final verification

All required checks passed on the final implementation on 2026-10-16:

| Check | Result |
| --- | --- |
| `pnpm --filter @ieumdoc/editor test` | 246 passed, 0 failed/skipped |
| `pnpm --filter @ieumdoc/desktop test` | 39 passed, 0 failed/skipped |
| `pnpm typecheck` | Core, File commit, CLI, Editor and Desktop passed |
| `pnpm --filter @ieumdoc/editor build` | Passed (existing chunk-size advisory) |
| `pnpm --filter @ieumdoc/cli build` | Passed; builds the production Editor/HTTP bundle |
| `pnpm browser:test` | 44/44 passed in one final full run, 5.7 minutes |
| `pnpm browser:test http-host` | 1/1 passed, production bundle, real two-root Save/Reload/conflict |
| `pnpm docs:check` and `git diff --check` | Passed |

Exact stable scenarios (each is `apps/editor/test/<name>.browser.js`; earlier targeted runs used
subsets of the same list, with failures fixed before the final full pass):

```text
continuous-editing  editor-shell  layout-rules  quiet-document
visual-states  new-document  open-files  save-during-edit
save-session  document-session  document-tabs  equation-insertion
equation-save-during-edit  reference-save-reload  quote-save-reload  writeability-preflight
block-move  figure-authoring  pending-figure  image-assets
external-html-paste  figure-draft-race  table-cell-editing  table-authoring
link-authoring  inline-math-authoring  inline-math-split  admonition-authoring
structural-block-authoring  markdown-input  basic-blocks  outline
list-authoring  source-view  source-view-pending  label-authoring
cross-reference  property-drafts  code-highlighting  section-reference
folder-navigation  footnotes  focus-caret  desktop-updates
```

The additional production scenario is `http-host`. Manual capture/measurement ran
`pnpm browser:test document-tabs --screenshots`; the one-off `document-tabs-visual` capture scenario
was used for same-state baseline pairs and then removed. It is not counted as automated coverage.
All runs used the repository runner and the same workspace-specific persistent Windows Chrome
profile, never temporary browser profiles. Debug timeouts were restored before the final full run.

## Rough memory and switching measurement

The final `document-tabs --screenshots` run passed (1/1). Eight copies of the repository's
`technical-document.md` include headings, prose, image, equation, table and references. Measurement
uses Windows Chrome, Vite development mode, 1440×900 and a warmed page. Closed-editor diagnostic
references are removed before collection. Chrome CDP forces GC, then reads `JSHeapUsedSize`.

| Measurement | Result |
| --- | --- |
| One open document, post-GC JS heap | 44.11 MiB |
| Eight open documents, post-GC JS heap | 46.55 MiB |
| Increment for seven retained sessions | +2.44 MiB |
| Tab switch, median of 24 samples | 33.3 ms |
| Tab switch, nearest-rank P95 | 65.8 ms |

Switch time runs from tab click through two animation frames, so it includes frame scheduling and
is not pure CPU time or a general performance guarantee. JS heap excludes native DOM, decoded images
and GPU memory. These are small representative technical documents, not large-document stress
limits; no tab cap or eviction follows from this measurement.

## Cleanup status

Task-owned Vite/HTTP servers and persistent-browser sessions were closed, and the process inventory contains no remaining task server/browser. The temporary capture script and debug config edits are removed. Approved images and the final measurements are archived above.

Cleanup limitation: automatic approval review rejected recursive scratch cleanup and a narrower, checked file-by-file batch with only the reason `blocked by policy`. One individually named diagnostic log was removed; the remaining ignored `tmp/` fixtures, logs and duplicate captures remain. No alternate deletion mechanism was used. The reusable browser profile is retained under the Windows automation policy.
