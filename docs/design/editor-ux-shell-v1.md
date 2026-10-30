# Editor UX Shell v1

- Status: Implemented
- Image-link preview verification: 2026-10-29 (#731; [contract and captures](#relative-image-link-previews-731)).
- Link opening verification: 2026-10-29 (#725; [contract and captures](#open-ordinary-links-725)).
- Editor groups verification: 2026-10-29 (#488 phase 1; Editor 341 tests, workspace typecheck/build, related browser regressions and [group/visual evidence](#two-editor-groups-488-phase-1)).
- Tab-row actions update: 2026-10-29 (#695; [current contract and evidence](#title-strip-and-tab-row-actions-695)).
- Non-overlapping roots verification: 2026-10-29 (#702: Editor 338 unit tests, typecheck/build; persistent Chrome folder-navigation/memory, layout-rules, quiet-document, document-tabs, editor-shell and reveal-folder; [behavior and captures](editor-ux-shell-v1.md#non-overlapping-opened-folders-702)).
- Document scroll verification: 2026-10-29 (#488 phase 0; [container contract and evidence](#document-scroll-container-488-phase-0)).
- Feature sample verification: 2026-10-28 (#528 Core read-model coverage, canonical CLI check/format, Desktop version unit tests, existing Command center browser entry and manual 1440/640px Korean/English captures; packaged execution deferred to CI).
- Last verified: 2026-10-28 (#637: block Equation editing moves into the document; inline math retains its popover).
- Explorer naming update: 2026-10-29 (#703: Explorer / 탐색기 replaces the Files panel name; [contract and captures](#explorer-name-703)).
- Collapsed rail update: 2026-10-28 (#671: Files and shared Settings entry; [contract and captures](#collapsed-rail-files-and-settings-671)).
- Settings entry update: 2026-10-28 (#669: remove the Settings-only document-settings entry; [contract and captures](#settings-document-entry-removal-669)).
- Brand title-strip update: 2026-10-28 (#647 owner-approved composition; targeted verification recorded in the PR).
- Previous shell verification: 2026-10-27 (#582 / #605: Editor 315 tests, Desktop 48 tests, typecheck/build and targeted persistent-Chrome regressions; [contract and captures](#sidebar-and-native-title-bar-582--605)).
- Image rename verification: 2026-10-27 (#504: targeted file-actions browser flow; [1440px/640px save-first guidance comparison](#image-rename-guidance-504)).
- File operations verification: 2026-10-27 (#505 / #504 PR A: Editor/Host/Desktop unit tests, workspace typecheck, production Editor build and targeted persistent-Chrome browser checks; packaged Desktop is CI-only).
- Property Apply verification: 2026-10-27 (#576: shared Ctrl/Cmd+Enter submission, validation/busy guards, IME/modifier exclusions and prose hard-break isolation; Editor tests and targeted Windows Chrome browser regressions, with Apple platform emulation rather than native macOS).
- Property-entry update: 2026-10-27 (#557: shared selection/Enter/double-click and explicit property drafts; see [Continuous editing](document-editing-v1.md#continuous-editing)).
- Command find verification: 2026-10-27 (#556: Editor 295 tests, typecheck/build/docs, command-center/editor-shell/layout-rules/quiet-document/file-preview; [scope and captures](#action-and-search-scope-556)).
- Document settings verification: 2026-10-27 (#580: inline settings, per-tab expansion, notation previews and existing document operations; [integration, checks and captures](#document-settings-placement-554)).
- New-document entry verification: 2026-10-27 (#553: Editor 291 tests, workspace typecheck/build/docs; new-document, command-center, folder-navigation, editor-shell, ui-language, layout-rules and quiet-document; [behavior and visual comparison](#new-document-entry-553)).
- Folder refresh verification: 2026-10-26 (#494: Editor 291 tests, typecheck/build, folder-tree failure guard and folder-navigation/image-assets/command-center/folder-memory/layout-rules/quiet-document; actual menu comparison below).
- List-format verification: 2026-10-29 (#734: explicit handle target, all ten choices/current check, single Undo, typed clipboard and Host Save→Reload; English/Korean 1440px and 640px manual captures).
- Menu verification: 2026-10-26 (#516: action icons/danger tokens, adjacent block movement/Undo/Save→Reload, title/endnote/draft/boundary restrictions, conversions and slash editor focus; [contract and evidence](#unified-action-menus-516)).
- Body-heading verification: 2026-10-26 (#472: Editor 287/287, typecheck/build, docs check and new-document, structural-block-authoring, document-title, basic-blocks, markdown-input browser regressions; persistent Chrome in the implementation worktree).
- Double-click verification: 2026-10-26 (#470: figure-authoring and equation-insertion browser regressions verify the shared Edit path, focus, draft/history preservation and native Figure-caption word selection).

- Previous verification: 2026-10-27 (#590: internal Outline close button removed; [verification and comparison](#outline-toggle-only-590)).
- Previous verification: 2026-10-26 (#515 P1/P3 owner review correction: contrast-qualified tab edges, 600 list cue and stable Outline row extent; targeted regressions and [1440/390px comparison](../reviews/editor-visual-language-history-2026-10-30.md#selection-cue-review-correction-515)).
- Previous verification: 2026-10-26 (#515: owner A1 raised tab groups and background-only current lists; targeted browser regressions, Editor tests/typecheck/build and [1440/390px manual comparison](../reviews/editor-visual-language-history-2026-10-30.md#selection-expression-verification-515)).
- Previous verification: 2026-10-26 (#496: curated shortcut guide, Windows/macOS binding validity, desktop single-line rows and phone overflow; [verification and Before/After](#curated-shortcut-guide-496)).
- Previous verification: 2026-10-26 (#471 and #485 review follow-up after merging master d3cfd58: Editor tests, workspace typecheck, Editor build, command-center/layout-rules/quiet-document/continuous-editing/markdown-input browser regressions, input-rule parity and complete keymap audit; [verification](#shortcut-guide-verification-471)).
- Source wrapping verification: 2026-10-26 (#476: Source soft wrapping; Editor tests/typecheck/build, Source/layout/quiet-document browser checks and [1440/375px Before/After](#source-wrapping-476)).
- Table deletion verification: 2026-10-26 (#474 / PR #486 review: transient table deletion/Undo through MessageArea, including revocation when Source starts; table-authoring, source-view-pending and bilingual cross-reference browser regressions, typecheck/build and [captures](table-interaction-v1.md#table-deletion-notice-verification-474)).
- Previous verification: 2026-10-26 (#473: Display/command-center bibliography connection and conditional References; [verification and product captures](citations-v1.md#conditional-references-verification-473)).
- Previous verification: 2026-10-26 (Sidebar summary checked against the file-listing contract and implementation; incoming heading links checked; no Editor/browser/Desktop re-execution).

- Scope: existing Editor interactions. [Visual Language](editor-visual-language-v1.md) and [Layout Rules v1](editor-layout-rules-v1.md) define presentation and geometry.

Historical verification records: [Verification record](#verification-record).

## Docling comparison tabs (#769)

The sidebar opens the read-only module tab described in
[Docling comparison](docling-compare-v1.md), under [ADR-0011](../adr/0011-code-module-boundary.md).
Its entry sits in the sidebar footer above Settings, separate from Explorer's
empty-state help and folder navigation. Collapse Explorer → Open folder retains
its existing Tab order; the collapsed rail still exposes only Explorer and Settings.
After Explorer's file navigation, the footer's Tab order is Docling comparison → Settings.
It shares tab navigation/closing while remaining outside document editing,
Save/recovery sessions and startup tab restoration.

## Two editor groups (#488 phase 1)

There are at most two editor groups, in fixed equal columns separated by a 1px
structural boundary. Each has its own scrolling tablist and active-document
Visual/Source, Save/status and File actions at the right. The title strip is shared.
Pointer or keyboard focus in a group's tabs, actions or document makes that group
the target of Outline, Command Center and shell shortcuts. Both documents remain
independently scrollable and editable. The focused group's tab row uses the existing
selected-surface color as a cue; individual tab selection keeps its accent marker.
Equal filenames keep their distinguishing parent-folder labels across both groups.

Floating editor controls stay inside their owning group's native document viewport,
excluding its scrollbar: text formatting, slash/insert/block menus and inline link,
reference and citation forms. Their existing 8px inset applies on each side. The shared
bounds helper caps width/height before measuring and placing the overlay, so long menus
wrap or scroll within the group. It observes that viewport as well as the overlay;
window resize, group resize/movement and document scrolling refit the same controls.
Single-group mode retains the previous window/header bounds and CSS size limits.

Open to the right is available in tab context menus, document File actions, Explorer
document context menus and Command Center. It targets the right group, creating it
when necessary. Move to other group is available from tab/File menus and Command
Center when two groups exist. There was no tab drag interaction to extend; these
commands provide keyboard and pointer movement. An ordinary document Open targets
the focused group. Selecting an existing tab in Command Center focuses its owner.
Opening an already open document in another group moves that same tab. No second
session, editor, undo history, property draft or recovery record is created. Moving
the last tab out of a group, closing it or deleting its file removes the empty group.

Each group needs **440px**, derived from the supported 640px desktop viewport minus
the existing 200px narrow expanded Explorer. Split documents use the existing narrow
paper trailing inset (16px), preserving the 80px starting gutter. The available
document area must be at least **881px** (2 × 440px + 1px boundary), after the current
Explorer and docked Outline reservations. Split commands are disabled below this
width. Resizing the window or opening a side panel below this limit merges both tab
lists in left-to-right order and retains the focused active tab. Tabs stay mounted;
unsaved content, drafts, history and each document's scroll position survive. Widening
the window does not split again automatically.

Group layout is page memory. The existing [navigation-only tab memory](editing-session-save-v1.md#tab-navigation-memory-383)
continues to remember flattened tab order and the focused active path, without a new
preference format or recovery mechanism. Reload restores those documents in one
group through the existing Host validation and recovery precedence. No stored-data
migration, Core semantic operation or CLI surface is needed for this editor interaction.
Derived screens, a third group and divider dragging remain outside phase 1.

### Group verification and visual evidence

The #718 review follow-up reproduces a first-paragraph selection at the right edge
of the left group, 1440×900 with Explorer and docked Outline open. Before correction,
the group ended at x=711.5 but the 294px toolbar reached x=877.171875; five trailing
buttons failed native `elementFromPoint` hit tests. The same assertion now measures
x=409.5…703.5 and all nine actions are reachable. Tab traverses every action and Enter
opens the final Cross-reference form; pointer activation verifies that same trailing
action and Link. Reference/Link/Citation forms and slash/block menus also assert their
owning group bounds, including keyboard-active menu items. These checks supplement the
existing group/session regression without changing its timeout or retry policy.

Same-state manual [before](assets/editor-groups-488/toolbar-before-1440.png) /
[after](assets/editor-groups-488/toolbar-after-1440.png) captures use head `74cdecda`,
then this correction, the same persistent Windows Chrome/profile, English/light,
1440×900, DPR/zoom 1, bundled Pretendard and the selected `link` in `DC-link voltage`.
The existing 1440/640px single-group comparisons below remain unchanged.
The follow-up reran `quiet-document --screenshots` at both widths and matched those
PNG hashes. `editor-groups`, `link-authoring`, `cross-reference`, `citation-authoring`,
`basic-blocks` and `layout-rules` pass with the shared bounds correction.

`editor-groups` verifies retained editor identity, content/selection/property drafts,
Undo/Redo, independent native scroll, group Save/Source, focused shortcut/Command Center/
Outline, ordinary Open relocation without rereading, Explorer Open to the right,
empty-group/dirty-close guards, narrow merging and navigation-only Reload. A held
Host Open response also verifies that actual focus can change groups during loading;
the immediate focus assertion failed before separating focus from operation guards.
Existing same-tab navigation-memory regression caught a misplaced early return; it
still verifies explicit selection overwrites stale shared memory, without changing
Save or restoration write boundaries. Neither test criterion was relaxed.

Final local `editor-groups` and `quiet-document --screenshots` pass. The related
`document-tabs`, `document-scroll`, `command-center`, `editor-shell`, `source-view`,
`save-session` and `layout-rules` scenarios pass. Temporary local stop-after-first-failure
prevented automatic worker relaunches during diagnosis and is absent from the PR.
No retries or timeout changes were added. Edge and packaged Desktop remain CI-only.

The same-state Quiet Document pairs below use base `7f6ba127803ad456f57b7c2d8688e638cf6040cb`
and this implementation, Vite 127.0.0.1:5294, checkout-owned persistent installed Windows
Chrome, English/light UI, bundled Pretendard loaded, DPR/zoom 1 and 1000px height.
They retain the existing single-group document, panel and interaction state. The
Before/After PNG hashes match at both widths. The
additional 900px-high group captures show two different document scroll positions at
1440px and their lossless single-group merge at 640px; these are feature evidence,
not same-state comparisons. At 1440px with both side panels open, each group measures
471.5px, separated by 1px, and both viewports end at y=900. Their shared message/header
bottom is y=120 in the captured draft-notice state.

| State | Before | After |
| --- | --- | --- |
| Quiet Document, 1440px | [Before](assets/editor-groups-488/before-1440.png) | [After](assets/editor-groups-488/after-1440.png) |
| Quiet Document, 640px | [Before](assets/editor-groups-488/before-640.png) | [After](assets/editor-groups-488/after-640.png) |
| Two groups / narrow merge | — | [1440px split](assets/editor-groups-488/groups-1440.png) · [640px merged](assets/editor-groups-488/groups-640.png) |

## Title strip and tab-row actions (#695)

The shared title strip is always exactly one `--layout-header-row` (40px): brand,
Find documents and commands, and Desktop caption reservation. Search shrinks within
its remaining width, yielding secondary location then shortcut then label; below a
22rem available title container it becomes a named search icon button. Its tooltip,
shortcut and accessible name remain unchanged. One 1px DOM bottom separator spans
the entire viewport at y=39, including the native caption reservation.

The second row is always 32px plus its 1px boundary, including the start screen with
no document. Only the tablist scrolls horizontally; Visual/Source, layout toggles,
status, Save and File actions stay fixed at the right of that row. At viewport widths
up to 1024px the less frequent Wide document toggle moves into ⋯ as a checked menu
item. Outline remains a direct button so its overlay Escape/focus-return path remains
stable. The compact menu stays available without a document and during pending work
for the width preference; document-specific commands retain their disabled guards.
Visual/Source and Save are disabled on the empty start screen. No special tab is added.

Each row receives the actions and status of its own active document. #488 phase 1
adds the groups described above. Existing independent tab sessions, Save/shortcut,
Source, Reload/discard, Compare, Copy path, Command center and error/conflict
MessageArea paths are retained. Explorer → search → document tabs → document actions →
content follows DOM keyboard order. Tabs retain roving navigation, close and dirty dots.

A fixed 16px status slot next to Save shows a small filled dot for unsaved work,
a check for saved, a progress glyph during operations, or a warning glyph on failure.
The complete localized status stays in the polite live region and native tooltip.
A clean Ready state leaves the slot blank; status transitions move no action.
MessageArea can add notification height below these two fixed rows. It does not
change the title-strip or tab-row height. Document semantics and CLI are unaffected.

The native overlay height and actual Windows overlay pixels remain #694's scope;
#695 preserves env(titlebar-area-*) reservation and drag/no-drag boundaries. Both
issues touch title-strip geometry, so integration must retain this fixed 40px row
and #694's separate overlay fix.

Same-state manual captures use base master `bbfdd948` and this implementation in
this worktree, Vite origin 127.0.0.1:5173, persistent Windows Chrome, English UI,
Paper, bundled Pretendard/fonts ready, DPR/zoom 1 and 900px height. Three tabs are
open; technical-2 is active with the same unsaved heading edit, scroll 0 and no
focus/hover. Open means Sidebar and Outline open; below 1424px Outline overlays.
Local verification: Editor 335/335; final shell/token checks 39/39, workspace typecheck,
production Editor build and docs checks. Four persistent-Chrome launches were used:
first manual-tour URL error, successful Before tour, After + layout-rules (then the
old long-filename width assertion failed), final After + quiet-document (then a
flex-shrunk test probe in document-tabs failed). The filename assertion now checks
readable visible text, full close-target containment and exact path tooltip. The
probe now resists flex shrinking so it measures the actual 16px token; actual icon,
focus and target checks retain their original values. The latter correction and
remaining browser suites are verified by PR CI. Local runs 3/4 stopped at the first
failure to prevent worker restarts exceeding the four-launch cap; the temporary
maxFailures setting and capture scenario are removed. No retry, timeout increase,
skip or permanent runner change is introduced. Before each launch BadPasswordAttempts
was 1/2/2/2. Desktop packaging/update/uninstall and Edge remain CI-only.

These 16 pairs are manual evidence. Every After measures a 40px title strip plus
33px tab row and a continuous 1px DOM separator. Before records the previous
wrapping rather than claiming it meets the new two-row contract. Native overlay
painting is not verified. [Before geometry](assets/tab-row-695/before-geometry.json),
[After geometry](assets/tab-row-695/after-geometry.json), and
[environment/source/image hashes](assets/tab-row-695/capture-metadata.json).

| Width / theme / panels | Before | After |
| --- | --- | --- |
| 640-light-closed | [Before](assets/tab-row-695/before-640-light-closed.png) | [After](assets/tab-row-695/after-640-light-closed.png) |
| 640-light-open | [Before](assets/tab-row-695/before-640-light-open.png) | [After](assets/tab-row-695/after-640-light-open.png) |
| 640-dark-closed | [Before](assets/tab-row-695/before-640-dark-closed.png) | [After](assets/tab-row-695/after-640-dark-closed.png) |
| 640-dark-open | [Before](assets/tab-row-695/before-640-dark-open.png) | [After](assets/tab-row-695/after-640-dark-open.png) |
| 1024-light-closed | [Before](assets/tab-row-695/before-1024-light-closed.png) | [After](assets/tab-row-695/after-1024-light-closed.png) |
| 1024-light-open | [Before](assets/tab-row-695/before-1024-light-open.png) | [After](assets/tab-row-695/after-1024-light-open.png) |
| 1024-dark-closed | [Before](assets/tab-row-695/before-1024-dark-closed.png) | [After](assets/tab-row-695/after-1024-dark-closed.png) |
| 1024-dark-open | [Before](assets/tab-row-695/before-1024-dark-open.png) | [After](assets/tab-row-695/after-1024-dark-open.png) |
| 1234-light-closed | [Before](assets/tab-row-695/before-1234-light-closed.png) | [After](assets/tab-row-695/after-1234-light-closed.png) |
| 1234-light-open | [Before](assets/tab-row-695/before-1234-light-open.png) | [After](assets/tab-row-695/after-1234-light-open.png) |
| 1234-dark-closed | [Before](assets/tab-row-695/before-1234-dark-closed.png) | [After](assets/tab-row-695/after-1234-dark-closed.png) |
| 1234-dark-open | [Before](assets/tab-row-695/before-1234-dark-open.png) | [After](assets/tab-row-695/after-1234-dark-open.png) |
| 1440-light-closed | [Before](assets/tab-row-695/before-1440-light-closed.png) | [After](assets/tab-row-695/after-1440-light-closed.png) |
| 1440-light-open | [Before](assets/tab-row-695/before-1440-light-open.png) | [After](assets/tab-row-695/after-1440-light-open.png) |
| 1440-dark-closed | [Before](assets/tab-row-695/before-1440-dark-closed.png) | [After](assets/tab-row-695/after-1440-dark-closed.png) |
| 1440-dark-open | [Before](assets/tab-row-695/before-1440-dark-open.png) | [After](assets/tab-row-695/after-1440-dark-open.png) |

## Explorer name (#703)

The left Sidebar is named **Explorer / 탐색기**. Its heading, empty-region name,
Command center file-result category and expand/collapse command use this name.
The expanded control is **Collapse Explorer / 탐색기 접기**; the collapsed rail
control is **Expand Explorer / 탐색기 펼치기**, for both accessible name and tooltip.
The shortcut guide contains no Sidebar-specific entry or binding to rename.
The folder-menu command **Open in File Explorer / 파일 탐색기에서 열기** (#487)
still names the Windows application and keeps its existing wording.
Only display strings change: icons, geometry, command IDs, keyboard/focus behavior,
mounted tree and document semantics remain unchanged. No Core/CLI operation is needed.
This naming supersedes the Files wording in earlier verification records and captures.

Same-state manual comparison: Windows persistent Chrome through `pnpm browser:test`,
1440×900, English, light theme/OS, DPR 1, viewport scale 1, default 100% zoom, bundled
Pretendard after `document.fonts.ready`, technical-document fixture, no opened folder,
Sidebar expanded, Outline docked, scroll 0, focus blurred, pointer at (1439, 899).
Before is `a1be38ce063a10bf5068d077e07b8884455967e4`; After is the same worktree with
this PR's naming changes. Captures are manual review evidence, not pixel assertions.

| Representative expanded state | Before | After |
| --- | --- | --- |
| 1440×900 | [Files](assets/explorer-label-703/before-1440.png) | [Explorer](assets/explorer-label-703/after-1440.png) |

## Document scroll container (#488 phase 0)

Each mounted document tab owns one native `.document-scroll` viewport. Hiding a tab retains
its scroll position with its existing editor/session; closing it releases that element. Visual
and Source share the tab's viewport. No scroll position is persisted across application reloads.
`documentScrollContainer` is the single lookup for the owning viewport; shell actions can use
the focused surface, including the document start surface. #488 phase 1 bounds each
visible document's viewport to its editor group; hidden tabs keep their viewport.

The viewport spans the window width **below the measured tabs/messages header** to keep its
native scrollbar at the right edge only in the document area (#694 follow-up). The root does
not scroll; the DOM title strip and its bottom boundary extend across the whole viewport.
This removes interruption caused by the root scrollbar. Browser geometry/captures do not
verify native window-control overlay painting; overlay height, Settings gutter and native
pixel verification belong to [#694](https://github.com/ieumbird/ieumdoc/issues/694). Its content keeps
the existing Sidebar/Document panel insets, centered column, paper dimensions and measured
header clearance. The shell reserves the viewport's actual native scrollbar width only below
the full-width title strip, observed on
viewport/content resize without a scroll listener. Sidebar and Outline retain their independent
scrolling. Only the visible Visual editor subscribes to document scrolling for Outline/Tables/Figures;
the same reading line, reveal pin and bottom-of-document behavior are retained.

Native DOM `scrollIntoView` and ProseMirror's ancestor scrolling now reach the owning viewport:
Outline, Find/Command center, save refusal locations (#578), cross references/endnotes, caret
reveal, list/block movement and scroll preservation retain their existing paths. Block handles
and local overlay bounds retain their capturing scroll listeners, which receive descendant
container and horizontal-table scrolling. Portaled Base UI popovers explicitly use the owning viewport as their
collision boundary, allow the library's sticky shift when resize/scroll moves the anchor out of
view, and retain its anchor/scroll tracking. Native drag edge scrolling uses
the document viewport. No per-block scroll listeners or independent editor engine are added.

PageUp/PageDown, Space/Shift+Space and Home/End also scroll the active document when focus is
in the surrounding shell. Editable controls, modal/menu keys, native button/link activation,
and independent scrollable file/Outline lists keep their own keyboard behavior. Print media
releases the fixed viewport and its overflow, removes shell navigation, and exposes the whole
active document in normal flow. Hidden tabs remain hidden.

### Scroll migration verification

Before is master `a1be38ce063a10bf5068d077e07b8884455967e4`; After is this phase-0 implementation.
The persistent Chrome runner captured the clean Before `tmp/quiet-document/quiet-document.md`,
English, Pretendard loaded, 900px height, at scroll top and 420px, in light/dark themes,
1440/640px widths and all four Sidebar/Outline open/closed combinations. Full 32-pair evidence
is in [the asset directory](assets/document-scroll-488/). The final After capture is collected
by the Linux CI geometry matrix because the five local browser runs were already used when
the scrollbar/header completion criteria were extended. Cross-platform rasterization differs;
the unchanged Host's default-locale filename collation also orders the Korean-named fixture
differently on Windows and Linux. These platform differences are not scroll-layout changes;
the geometry assertions verify that the scrollbar begins at the header bottom, ends at the
viewport bottom, and the title-strip border reaches the full window width at both sizes and
all captured states, while the root remains unscrolled. Representative top pairs:

| Theme / width | Sidebar open, Outline open | Sidebar closed, Outline closed |
| --- | --- | --- |
| Light / 1440 | [Before](assets/document-scroll-488/before-light-1440-open-open-top.png) / [After](assets/document-scroll-488/after-light-1440-open-open-top.png) | [Before](assets/document-scroll-488/before-light-1440-closed-closed-top.png) / [After](assets/document-scroll-488/after-light-1440-closed-closed-top.png) |
| Dark / 1440 | [Before](assets/document-scroll-488/before-dark-1440-open-open-top.png) / [After](assets/document-scroll-488/after-dark-1440-open-open-top.png) | [Before](assets/document-scroll-488/before-dark-1440-closed-closed-top.png) / [After](assets/document-scroll-488/after-dark-1440-closed-closed-top.png) |
| Light / 640 | [Before](assets/document-scroll-488/before-light-640-open-open-top.png) / [After](assets/document-scroll-488/after-light-640-open-open-top.png) | [Before](assets/document-scroll-488/before-light-640-closed-closed-top.png) / [After](assets/document-scroll-488/after-light-640-closed-closed-top.png) |
| Dark / 640 | [Before](assets/document-scroll-488/before-dark-640-open-open-top.png) / [After](assets/document-scroll-488/after-dark-640-open-open-top.png) | [Before](assets/document-scroll-488/before-dark-640-closed-closed-top.png) / [After](assets/document-scroll-488/after-dark-640-closed-closed-top.png) |

The screenshots preserve geometry and content placement; they are not byte-identical pixel
assertions. Some header text and dark scrolled document text have different antialiasing under
the container compositor. Existing layout and overlay geometry checks remain authoritative for
their measured contracts; captures are the manual visual evidence.

The final [32-state geometry record](assets/document-scroll-488/geometry.json) and After PNGs
come from [CI run 40778182959](https://github.com/ieumbird/ieumdoc/actions/runs/40778182959),
product code `93e4b9a36e1de344a3b11a9c5fbcc5096fff7214`, Linux pinned Chromium
154.0.8037.0. All measured states have root scroll 0, root height 900px, a 1px title-strip
bottom border reaching exactly 640/1440px, and a document viewport starting at the measured
header bottom (73/122/130px, depending on width/Sidebar state) and ending at 900px.

Browser assertions migrated without changing their tolerances or retry/timeout/skip policies:

- `document-tabs`: save/read each tab's actual scrollTop while retaining editor identity,
  JSON, selection, draft, Undo and no-load-on-switch assertions.
- `outline`: drive document scrolling and read its end/position from the viewport, using
  `scrollTop + clientHeight >= scrollHeight - 2` for the same 2px end tolerance; retain
  current-item visibility, list scroll, selection and editor-options stability assertions.
- `new-document`: read writing scroll and scroll to the viewport's end; retain the same
  visible caret/last-line end space and exact saved-source checks.
- `save-error`: use viewport scrollTop for offscreen-cell navigation; retain editor/cell
  selection and measured highlight/header geometry checks.
- `ui-language`: compare document viewport position across Settings instead of window position.
- `panel-lists`, `command-center`, `table-authoring`: direct scroll setup at the same target
  positions; retain current target/reveal/editing assertions. Geometry queries in `layout-rules`,
  `new-document` and `table-authoring` now select the active tab's column because hidden tabs
  also own a column. The measured-header clearance calculation now adds the container top
  to its scroll margin: the same header + 32px physical target, at the same 0.5px tolerance.
- `scenarios.spec`, `citations`, `file-preview`, `folder-navigation`, `footnotes`, `layout-rules`,
  `open-files`, `quiet-document`, `recovery`, `source-view` and manual capture sections:
  reset the document viewport instead of the window. Other assertions are unchanged.

The new `document-scroll` boundary scenario checks shell-focus reading keys, native Source
PageDown, wheel/drag edge scrolling, stationary shell chrome, zero window scroll, right-edge
viewport, scrollbar restricted below tabs/messages, full-width title-strip border, and unclipped
full-document print flow. Its measured 32-state matrix also produces the CI captures without
a separate capture-only tour. The existing 4-shard CI suite is the full
regression gate. Local packaged Desktop, install/update/uninstall and Edge/profile probes are
excluded from this task's validation scope.

## Folder Explorer menu (#487)

When the Host exposes `openFolderInExplorer`, every opened root's More actions menu adds
**Open in File Explorer** / **파일 탐색기에서 열기** between Open folder and Refresh.
Each child-folder row also offers More actions with this command. It uses the shared compact
button and action menu components; activating it does not expand/collapse the folder.
Vite and HTTP have no capability and display neither the command nor child-folder menu buttons.
Folder right-click menus remain #223 scope. Failure shows the existing localized error surface.
Closing a folder synchronizes Desktop's active roots without closing its documents.

Browser verification uses a stand-in Desktop bridge and checks root/child paths, browser absence,
close synchronization and failure notification; it does not execute Explorer. A 1440px menu
capture is retained in the [menu screenshot](../reviews/assets/reveal-folder-487-1440.png).
Actual Windows root/child Explorer launches and a deleted-folder failure are manual acceptance
items (not run). See the [Desktop boundary](desktop-distribution-v1.md#open-folders-in-file-explorer-487).


## File context menu (#505 / #504 PR A)

Each file tree row (native/foreign document, image or other file) offers Rename… and Delete file…
in a shared Base UI ContextMenu. Right click and focused-row Shift+F10 / Menu key open the
same menu in every Host. Only these file targets suppress the browser context
menu; folder rows and the document body retain native behavior. There are no new ellipsis,
toolbar, F2 or Delete entries. Target-local data supplies IDs, labels, icons, visibility and execution;
there is no global registry. Keyboard menu navigation is independent of tree arrows; Escape
restores the target row. Choosing an action hands focus to its shared dialog.

Rename uses a small dialog with the selected stem and a separate immutable extension, matching
New file shell controls. Cancel/Escape/outside dismissal restores the row. Invalid names and
collisions retain input and show the reason. Image rename updates saved native Figure references
under the opened folder. Dirty referring tabs in this window refuse with document names and
save-first guidance; clean affected tabs reload before the dialog closes. Skipped unreadable or
non-native Markdown files are named in a notice. [Host checking and rollback](filesystem-host-boundary-v1.md#referenced-image-rename-504-pr-b)
include saved and applied unsaved work; [session behavior](editing-session-save-v1.md#referenced-image-rename-504)
defines the same-window boundary and other-window Save conflicts.

Deletion names the file and distinguishes permanent deletion in Vite/HTTP from OS Trash on
Desktop. An open dirty document additionally says its unsaved changes will be discarded and
uses Delete and discard changes. Cancel has initial focus. The shared danger confirmation blocks
dismissal while pending and keeps failures visible. Success closes the deleted document's tab,
removes all local recovery records for that path and focuses the adjacent visible tree item (next,
then previous; the folder disclosure if empty). An inactive deletion leaves the active tab intact.

Rename updates open tab paths, session locators and matching recovery record/snapshot paths
without rereading the file or replacing its Tiptap editor. Unsaved content, property drafts, selection
and Undo/Redo remain. Existing Figure NodeViews, future image uploads and asset callbacks read
the new locator. Both operations update remembered tab navigation and loaded parent listings.
Recovery storage failure after a completed disk operation is reported explicitly for manual review.

### File action verification and captures

`pnpm browser:test file-actions --screenshots` uses scratch fixtures and the checkout-owned
persistent Chrome profile. The scenario verifies mouse and keyboard input, native
menu boundaries, collision/reference refusal, editor identity/no reread, Undo/Redo, Save at the new
path, recovery relocation/deletion, active/inactive deletion and adjacent focus. It also checks
existing Figure image URLs and a subsequent real image upload after rename.

Review regressions run actual file operations only in the checkout's OS temporary fixture folder.
Two-window tests hold the other editor's first recovery write until deletion/rename completes,
then require its old-path ticket to be refused. The storage scenario separately verifies that
unrelated tickets and post-operation edits still work. Selected UI captures below retain the
original implementation state; these review corrections do not change menu/dialog presentation.

Captures: Windows Chrome, English UI, 100% zoom, DPR 1, 1440×900 / 640×900, bundled Pretendard.
Before uses master `7e935cf4592ee6a4135fd069a31a638d2a768c7b` Sidebar in this merged worktree (controlled rollback of the file menu); After restores the PR Sidebar in the same state.
1440 uses light OS preference; 640 uses dark OS preference. The default System theme resolves each preference using the current #595 light/dark roles. Full traces and logs stay in
ignored `tmp/file-actions-evidence`; only the selected small captures are retained here.

| Surface | 1440px (light OS) | 640px (dark OS) |
| --- | --- | --- |
| Before: file tree, no product context menu | [Before](assets/file-actions-505/before-1440.png) | [Before](assets/file-actions-505/before-640.png) |
| Context menu | [After](assets/file-actions-505/after-menu-1440.png) | [After](assets/file-actions-505/after-menu-640.png) |
| Delete confirmation | [After](assets/file-actions-505/after-delete-1440.png) | [After](assets/file-actions-505/after-delete-640.png) |
| Rename input | [After](assets/file-actions-505/after-rename-1440.png) | [After](assets/file-actions-505/after-rename-640.png) |


### Image rename guidance (#504)

The existing rename dialog and danger text now ask the user to save the named referring tabs.
No control geometry, toolbar placement or style tokens change. `file-actions` checks refusal
for an inactive dirty tab and a property-only draft, preserving that work. After Save/Cancel it
checks clean active/inactive reference tabs immediately after completion (without polling or a
manual reload), Source-to-Visual refresh, a subsequent real Save, skipped-file notice, and a
second window's 409 Save conflict with its local edits retained. Host unit tests inject failures
at preflight, publication, document commit, image unlink and rollback, including case-only names
and an external revision change. All actual file mutations use OS temporary directories.

| Dirty-reference guidance, same state | Before | After |
| --- | --- | --- |
| 1440×900 | [Before](assets/image-rename-504/before-1440.png) | [After](assets/image-rename-504/after-1440.png) |
| 640×900 | [Before](assets/image-rename-504/before-640.png) | [After](assets/image-rename-504/after-640.png) |

Captured on Windows Chrome with the checkout-owned persistent profile, Vite at
`http://127.0.0.1:5173`, English UI, light OS/System theme, DPR 1, 100% zoom and bundled
Pretendard after `document.fonts.ready`. `ref.md` has an applied unsaved caption edit, `b.md`
is active, and the rename dialog has attempted `diagram.svg → updated.svg`. Both widths
keep text/actions inside the dialog. The longer save-first guidance wraps without clipping.
Actual HEAD was `d04c0e2302818b2123f2bcdf4356715fb68aa31a` with this PR's working changes.
For Before only App/locales were temporarily restored from that HEAD; the new Host remained
and refused the same dirty reference. These are controlled UI comparisons, not a full old-Host
behavior comparison. After restores this PR's App/locales. Only these four small images are
committed; regenerable traces/logs/full screenshot sets remain ignored.

## Document settings placement (#554)

The Sidebar browses opened folders and documents. Under #580's owner decision, the
existing heading numbering, reference style and bibliography connection live in a
collapsed **Document settings / 문서 설정** block at the very top of the paper,
before the title. Its one-line summary shows heading numbering, reference style and
connected bibliography filenames. Expanding shows grouped field rows with labels,
controls and short descriptions. Reference style offers actual Figure/Table/Equation
examples in each choice, including Korean. The body renders a field list and has no
placement dependency; bibliography uses a dedicated renderer within that list. This
is an Editor UI structure, not a Core field registry or #606 metadata implementation.

The block is outside ProseMirror content, like Add a title. It cannot enter document
text, Copy, caret navigation or Undo. Opening/collapsing it leaves document state,
selection, history and property drafts intact. Enter/Space operates the disclosure;
Tab reaches each control; menu arrow keys select a style; Escape within the block
collapses it and focuses its disclosure. A menu first handles its own Escape.
Expansion starts collapsed for each newly opened tab and lasts only for that tab's
session; tab switches and Visual/Source switches preserve it, without writing a
preference or document setting. Read-only documents show only the value summary;
the start screen and Source show no block. Pending work disables field controls,
including choices in an already-open portaled reference-style menu.

The TopBar Document settings button and its modal are removed. Command center
`Document settings…` closes its overlay, scrolls to the block, expands it and focuses
its disclosure. It retains its existing
no-document/busy/Source availability. Bibliography opens the existing connection
dialog from its row and returns focus to that row's Connect button after selection
or dismissal. The existing References-region connection remains available.

Settings still use the same editor/Core operations, dirty indication, Save and save
failure handling. No Core/CLI operation, file format or device preference changes.
Wide document belongs to the tab-row actions, folding into ⋯ at narrow widths (#695).
The title strip stays 40px at all supported widths; search retains #556's reduction order
before becoming icon-only. Verification widths follow ADR-0010: 1440px and 640px, keyboard and pointer,
light/dark and paper/white backgrounds. Current UI verification supersedes #554's
placement; the following #554 measurements and captures are historical evidence.

#580 local verification (2026-10-27): Editor **302/302**, workspace typecheck, production
Editor build and docs/whitespace checks; targeted shell/command/Settings, heading,
reference/bibliography, Source, tab and layout browser checks (**18/18** passed).
The open-menu Save guard follow-up passed bibliography-connection, cross-reference
and inline-document-settings (**3/3**) with Editor typecheck and docs checks.
After integrating master `d04c0e2` (#601), Editor **302/302**, workspace typecheck/build,
focus-caret, file-actions, editor-shell, command-center, inline-document-settings,
layout-rules, desktop-updates, ui-language and document-tabs passed. The caret
scenario follows the new disclosure Tab stop without changing its restoration
assertions; file-actions selects ProseMirror paragraphs rather than settings hints.
The visual matrix restores its incoming display preferences in finally.

Review follow-up (2026-10-27, PR #607 P2): a settings disclosure can move document
content while a short paper and its editor keep the same sizes. The existing gutter
ResizeObserver now also observes the settings block and uses its unchanged measurement
path for controls and hover extent. The reading Outline likewise reschedules its
existing reporter when that block resizes. Table tools remain relative to their own
table canvas; heading scroll margin still follows the measured sticky header. Inline
text menus dismiss on outside interaction, while property popovers keep their DOM
anchors. No document transaction, new measurement framework or Core/CLI change.
The inline-document-settings regression measures expand→hover and collapse→hover after
two animation frames, with no body click/input, transaction or resize. A minimum-height
1440×1200 fixture verifies unchanged paper/editor sizes, actual block/control/hover
alignment, reading-line changes and table row/column alignment. The original 1440/640px
language/theme/background matrix remains in the same scenario.
Short-paper comparison: [Before](assets/inline-settings-580/review-before-expanded.png),
[After](assets/inline-settings-580/review-after-expanded.png). Before highlights the
old paragraph position above the actual block; After follows the actual paragraph.
Follow-up verification: Editor **302/302**, workspace typecheck, production build,
docs/whitespace and **8/8** browser scenarios passed: inline-document-settings,
outline, quiet-document, layout-rules, table-authoring, focus-caret, editor-shell
and block-move. The passing browser result records the actual geometry for all
three short-document states; full generated results remain in ignored tmp.
Integration with master `a8c874a` (#610 / #602) retains the permanent Sidebar rail
and 640px minimum, removes both obsolete TopBar openers, and keeps the inline
settings handoff and position-change observers. Editor **302/302**, workspace
typecheck/build, docs/whitespace, quiet-document with screenshots and **13/13**
conflict-related browser scenarios passed. Supported-width captures remain 1440/640px.
A subsequent integration of master `b7a6444` (#609 image-reference rename) keeps both
sets of current translations and removes its retired refusal key. Editor **314/314**,
workspace typecheck/build/docs and file-actions, inline-document-settings, editor-shell,
command-center, desktop-updates, ui-language and layout-rules (**7/7**) passed.

 The dedicated
`inline-document-settings` scenario adds unique per-tab/new-open/reload expansion,
read-only summary, content/selection/history isolation, keyboard/menu Escape and
notation-preview coverage. Its geometry matrix covers English/Korean, Light/Dark,
Paper/Flat at 1440×900 and 640×900; the same run creates optional manual
captures. Existing semantic Save→Reload and failed-Save checks stay in their original
scenarios. Edge, HTTP and packaged Desktop run in required CI.

Same-state manual comparison: persistent Windows Chrome, DPR 1, zoom 1, bundled
Pretendard, clean `technical-1.md`, three open tabs, document-tabs folder, scroll top,
English/Light/Paper unless named otherwise. Before uses master `053f7c8`; After is
#580 including master `d04c0e2` (#601); its file actions are not attributed to this
settings change. In Before, “collapsed” means the document with its settings dialog closed.
The filename/tab/Sidebar state is the same; TopBar and title movement are the intended
placement change. Native and shared menu captures use their real open controls.

| State | Before 1440px | After 1440px | Before 640px | After 640px |
| --- | --- | --- | --- | --- |
| Collapsed | [Before](assets/inline-settings-580/before-1440-collapsed.png) | [After](assets/inline-settings-580/after-en-light-paper-1440-collapsed.png) | [Before](assets/inline-settings-580/before-640-collapsed.png) | [After](assets/inline-settings-580/after-en-light-paper-640-collapsed.png) |
| Expanded | [Before](assets/inline-settings-580/before-1440-expanded.png) | [After](assets/inline-settings-580/after-en-light-paper-1440-expanded.png) | [Before](assets/inline-settings-580/before-640-expanded.png) | [After](assets/inline-settings-580/after-en-light-paper-640-expanded.png) |
| Notation menu | [Before](assets/inline-settings-580/before-1440-menu.png) | [After](assets/inline-settings-580/after-en-light-paper-1440-menu.png) | [Before](assets/inline-settings-580/before-640-menu.png) | [After](assets/inline-settings-580/after-en-light-paper-640-menu.png) |

Additional manual review: [Korean/Dark/Flat at 640px](assets/inline-settings-580/after-ko-dark-flat-640-menu.png),
[Korean/Light/Flat at 1440px](assets/inline-settings-580/after-ko-light-flat-1440-expanded.png).
Recreate After with `pnpm browser:test inline-document-settings --screenshots`;
full output remains in ignored `tmp/inline-settings-580`. Only representative small
PNGs are retained here; owner mockups and generated browser traces are not committed.

### Historical #554 verification

Local verification: Editor **295/295**, workspace typecheck, Editor build, docs check and
whitespace check passed. Fourteen targeted browser scenarios passed across the integrated run
and focused follow-ups: editor-shell, layout-rules, quiet-document, source-view-pending,
bibliography-connection, cross-reference, outline, folder-navigation, visual-states, open-files,
ui-language, bibliography, citation-authoring and new-document. After integrating #571, the
command-center scenario checks both document-settings aliases, focus return and both width
commands using exact command names; the shell scenario retains its dialog/editor-state checks.
The layout scenario checks 32
English/Korean combinations of 1280/1423/1424/1440px, expanded/collapsed Sidebar and open/closed
Outline (docked from 1424px, overlay below it): 48px TopBar, centered button of at least 160px,
visible controls without overlap, and the folder/shortcut/filename reduction order.

Earlier separate failure: `command-center` timed out opening app Settings after its synthetic
IME sequence (`run('settings')`, then line 413), including on clean master
`34436c7cf0240fd2ebf0dcdaa74b3c5a226f7066` with the same checkout, origin and persistent profile.
PR #571 resolved the test-helper ambiguity: folder paths also match settings, so the helper
selects the exact named command before Enter. Its dedicated settings-path fixture is retained.
No timeout, immediate assertion or IME criterion was weakened. Edge and packaged Desktop run in CI.

Same-state manual comparison (Korean UI, the default technical document, clean loaded state):

| Width | Before: Sidebar Display | After: Document settings | After: shell |
| --- | --- | --- | --- |
| 1440px | [Before](assets/document-settings-554/before-1440.png) | [After](assets/document-settings-554/after-1440.png) | [Shell](assets/document-settings-554/after-shell-1440.png) |
| 390px | [Before](assets/document-settings-554/before-390.png) | [After](assets/document-settings-554/after-390.png) | [Shell](assets/document-settings-554/after-shell-390.png) |

Captures were made through `pnpm browser:test` using this checkout's persistent Chrome profile.
Before uses `ff37a32`; After includes master integration through `a414cb5` (#553/#555/#559/#552/#568/#565), so unrelated merged color and document-type changes are not attributed to #554.
At phone width the former full-screen Sidebar is replaced by the shared viewport-capped modal;
the underlying document remains in place. These images support manual layout review; automated
checks separately assert geometry, operations, availability and focus. Historical Display captures
below retain their original date and behavior.

## Dedicated Settings screen (#594)

Settings from the Sidebar or command center covers the entire app with an opaque,
viewport-sized screen. The document shell stays mounted beneath it: tabs, independent
editor instances, unapplied drafts, selection, Undo history and scroll remain intact.
Back to document / 문서로 돌아가기 names the active file and its unsaved state;
without a document the same control reads Back to start / 시작 화면으로 돌아가기.
Back and Escape restore the opener's focus. Entry focuses Back. The existing modal
boundary still blocks Save and command-center shortcuts and prevents document interaction.

The named navigation uses buttons with `aria-current="page"`: Appearance & language /
표시·언어, Saving & recovery / 저장·복구, and Desktop-only About & updates / 정보·업데이트.
Ordinary entry starts at Appearance; an update notice's View opens About. Theme, page style, language and
accent changes apply immediately, with profile-local preference storage and failure notices.
Theme offers System / Light / Dark (시스템 / 라이트 / 다크), defaulting to System.
System follows live OS changes. `ieumdoc.theme` belongs to `preferences.ts` localStorage,
never document content or Host preferences. Unavailable storage retains the current-page
choice and shows the same style of localized persistence alert as accent/language.
Page style offers Paper / Flat (종이 / 평면), defaulting to Paper.
Flat makes canvas and paper one surface, including one dark surface in Dark theme.
The paper's edge, elevation and corners disappear without moving or resizing content, in Visual
and Source and at either document width. `ieumdoc.pageBackground` is profile-local localStorage,
read before styles/UI by the existing theme initialization path. Unknown/unavailable storage
falls back to Paper; a failed write keeps the live choice and shows a localized alert.
The same editor instances, drafts, selection and history remain mounted across theme and page-background changes.
See [Visual Language](editor-visual-language-v1.md#surfaces-and-themes) for surface roles and
startup/native synchronization, its [palette rules](editor-visual-language-v1.md#tokens-and-palette) for contrast, and the [Historical theme record](../reviews/editor-visual-language-history-2026-10-30.md#theme-verification-and-captures) for visual evidence. This presentation choice
adds no Core operation or CLI command.
Recovery retains its explanation, count and confirmed Clear all; individual records stay
on the start screen. Desktop channel, status, release notes and update actions keep their
existing bridge and restart guards. Settings search remains outside the implemented scope;
Wide document stays in the document tab-row actions (#695).

The navigation footer explains that heading numbers, reference style and bibliography
belong to each document. Settings has no Open document settings entry (#669).
The inline block above the document title and Command center's `Document settings…`
remain the entry points. Settings dismissal resolves the original
opener or the currently visible Sidebar toggle.

Implementation/verification scope: Editor shell, shared controls and bundled Korean/English
copy only; no new Core operation or CLI command. Reuse the existing language, recovery,
command-center and Desktop-update scenarios; extend their interface coverage for full-screen
bounds, keyboard navigation/focus, state retention and 1440/390/375px layout. Run Editor
tests, workspace typecheck, build, docs check and layout-rules/quiet-document regressions.
Keep only the representative small captures below in Git; generated traces, full browser
results, scratch fixtures and downloaded owner mockups stay outside the commit.

Local verification (2026-10-27): Editor 297/297 and Desktop 47/47 tests, workspace
typecheck, Editor production build, docs and whitespace checks passed. Targeted browser
coverage: ui-language, desktop-updates, recovery, recovery-storage, command-center,
editor-shell, layout-rules and quiet-document. The existing layout helper now gates the
screen's Back focus rather than the old popup's language selector; its deliberate delayed
focus assertion remains. The Desktop scenario also crosses 1440→390px while Settings
is open: if the old Sidebar opener disappears, Back/Escape focuses the visible Expand
sidebar control. Review follow-up: the same viewport traversal includes the Document
settings link and Escape, in both languages, with dismissal at 390px or after returning
to 1440px. Before the fix, the first linked-dialog case failed with focus on BODY;
the shared dismissal-time resolver retains the original visible opener or selects the
current Sidebar toggle. Follow-up local checks passed: the expanded desktop-updates
scenario, ui-language, command-center, editor-shell and layout-rules, Editor 297/297,
workspace typecheck, production build, docs and whitespace checks. Packaged Desktop
and install/update execution remain required CI checks.

Manual comparison: Windows Chrome, bundled Pretendard Variable, DPR 1, zoom 1,
1440×900 and 390×900, English, content scroll 0, clean `updates.md`, mock Desktop
version 0.2.0 / Stable / idle and zero recovery records. Before is master
`987ae137ce0615b51b682fffefe040fca4cec872`; After is this change. Before shows the
initial language focus; After shows the selected category. The original popup contains
all three groups and requires vertical scrolling. After covers Sidebar, tabs, document
and Outline; on phones navigation stacks above content and all controls remain reachable.
The same geometry assertions cover Korean and 375px (18 language/width/category states);
the additional captures remain in `tmp/desktop-visual`. Capture with
`pnpm browser:test desktop-updates --screenshots`; these images support manual review,
while geometry, keyboard and editor-state checks provide automated coverage.

| State | 1440px | 390px |
| --- | --- | --- |
| Before: combined popup | [Before](assets/settings-screen-594/settings-before-1440.png) | [Before](assets/settings-screen-594/settings-before-390.png) |
| Appearance & language | [After](assets/settings-screen-594/settings-en-appearance-1440.png) | [After](assets/settings-screen-594/settings-en-appearance-390.png) |
| Saving & recovery | [After](assets/settings-screen-594/settings-en-recovery-1440.png) | [After](assets/settings-screen-594/settings-en-recovery-390.png) |
| About & updates | [After](assets/settings-screen-594/settings-en-about-1440.png) | [After](assets/settings-screen-594/settings-en-about-390.png) |

## Sidebar and native title bar (#582 / #605)

The approved explorer layout puts only **Explorer / 탐색기** and Collapse Explorer in the header.
Each opened folder shows **New document… / 새 문서…** and its More actions
menu (New folder…, Open folder…, Refresh, Close folder, in that order). There is no additional New document row while
a folder is open. Empty Explorer retains Open folder… and New document…; the latter first
chooses a folder, then opens the existing filename form. Start and command-center entries
use the same New document… name. Folder selection and creation semantics are unchanged.
Cancel returns to the invoking button; if opening the first folder removed that empty-state
button, the visible Sidebar toggle receives focus. Menu-originated dialogs return to that
folder's More actions trigger. Each opened root has the same chevron and name (no folder icon),
regular typography, 28px row and spacing as child folders, at visual depth zero, without extra
heading or inter-section gaps. Root actions remain visible without hover. File type icons remain in the leading slot, with
file/folder names at the same visual depth aligned; folders use that slot for their chevron. Children start
one visual step deeper. Root-only actions stay right-aligned on that row; long names ellipsize
with the full path in `title`. Existing section/disclosure/tree/treeitem semantics, ARIA levels
and #425 collapse memory remain unchanged. Tab order follows the visual order from disclosure
through the two actions to the retained tree stop.

The first row is one full-width title strip (#647): the existing Desktop SVG icon and
**IEUMDOC** at the left, shared search in the remaining width, and native caption
buttons at the right in Desktop. HTTP Host uses the same arrangement with zero caption
reservation and no native window dragging. The brand follows the Explorer width; collapsing
Explorer retains only the icon. The Explorer icon button (Expand Explorer, #671) stays in the 48px rail on
the second row, directly below the icon: this preserves its Explorer-navigation location,
28px target, accessible name, aria-expanded and keyboard focus return without making the
brand an additional action. DOM tab order follows Explorer controls, title-strip search, document tabs, document actions/content, then
document navigation; the brand adds no tab stop.

Explorer / Collapse and the Outline / Tables / Figures tab row begin directly below the title
strip, aligned with the document tab row and its bottom boundary. The separate visible
Outline title row is removed; the panel keeps its accessible Outline heading. Docking,
width, overlay dismissal and list navigation are unchanged. Below the docking width the
opened panel continues to overlay below the entire measured sticky header, leaving the
document tabs, messages and title-strip controls usable.

The title strip stays 40px at every supported width. Document actions and compact status
belong to the fixed tab row ([#695](#title-strip-and-tab-row-actions-695)). CSS Window Controls Overlay geometry
reserves native caption width in the title strip once, independently of Outline state.
Its single 1px bottom separator spans the full viewport, including the reservation (#635/#636).
The second-row headers are not drag regions. Title-strip empty space and brand drag the
native window and retain native double-click maximize; controls use no-drag. Shared UI
portal popups, positioners and dialog backdrops also use no-drag, including Command Center
and Recovery. Dropdown/context menus retain Base UI's outside interaction without an added
full-screen pointer-catching backdrop. While any shared menu is open, the title strip and
TopBar themselves use no-drag; closing it restores dragging. Full-screen Settings retains
its own 40px drag header, caption reservation and no-drag body. Existing surface-subtle and
native caption color synchronization remain unchanged. Native drag/double-click behavior
requires packaged Desktop verification; browser mocks inspect geometry and CSS boundaries.

The active filename sets `document.title` to `<filename> — IeumDoc`, or `IeumDoc` without
a document, including tab switches, renames and last-tab closure. Outline retains #590's
toggle-only close and Escape/focus behavior; its second-row tabs name the navigation choices, with no new navigation mode here. These changes are interface-only: no Core semantic
operation or CLI parity command is needed.

Local verification (2026-10-27): Editor/Desktop tests, workspace typecheck and Editor build;
folder-navigation, new-document, editor-shell, layout-rules, ui-language, desktop-updates,
document-tabs and quiet-document browser scenarios. The first folder-navigation run exposed
BODY focus after the removed empty-state opener; the existing shell fallback now returns to
the Sidebar toggle. Language-menu verification waits for the opened menu before inspecting
its translated item. No assertion or timeout was relaxed.

Review follow-up verification (2026-10-27): folder-navigation compares root/child typography,
row height, visual indentation, always-visible same-row actions and zero section gaps at
1440/1024/640px, with multiple roots and long Korean/unbroken names. Existing section-memory
and keyboard tests remain. Desktop mock checks 40px Settings and a representative 138px caption
reservation with a long filename at 1440/640px. At 640×480 the Command Center search overlaps
the wrapped header; popup/backdrop no-drag, typing and outside dismissal are checked, along
with the shared menu boundaries and temporary header drag exclusion/restoration. Folder/file
regressions exercise single-click menu switching and successive context-menu targeting. Native
mouse behavior remains a manual item below.

Same-state browser captures: clean base `9dd7af40f30aa43bcce8ab0f8dc5e26dfba10055`
versus this implementation, persistent Windows Chrome, Vite `127.0.0.1:5173`, English,
Light/Paper/Blue, DPR 1, zoom 1, bundled Pretendard, scroll 0, empty Files with the same document.
`pnpm browser:test quiet-document --screenshots` produced both pairs; regenerated traces and
the larger capture matrix remain uncommitted.

| Viewport | Before | After |
| --- | --- | --- |
| 1440×1000 | [PNG](assets/sidebar-titlebar-582-605/before-1440.png) | [PNG](assets/sidebar-titlebar-582-605/after-1440.png) |
| 640×1000 | [PNG](assets/sidebar-titlebar-582-605/before-640.png) | [PNG](assets/sidebar-titlebar-582-605/after-640.png) |

Opened-folder review from `folder-navigation --screenshots`: [1440px](assets/sidebar-titlebar-582-605/folder-1440.png),
[640px](assets/sidebar-titlebar-582-605/folder-640.png), [menu](assets/sidebar-titlebar-582-605/folder-menu.png).
Multiple opened roots: [1440px](assets/sidebar-titlebar-582-605/folders-1440.png),
[640px](assets/sidebar-titlebar-582-605/folders-640.png).
These additional After captures show icon-free folder rows with two same-row actions. The
640px root-name column is 79px in this capture, displaying more text than the previous
folder-icon/three-button layout; no new functionality is introduced.

Native drag, double-click
maximize, maximized spacing, rendered caption colors and taskbar/Alt+Tab presentation need
manual Windows confirmation; browser bridge/geometry checks do not claim native proof.

### Brand title-strip verification and captures (#647)

Scope: existing shell composition only; no command/menu, document semantic operation or CLI
surface. Reuse `apps/desktop/assets/icon.svg` through a Vite asset import, without duplicating
or redesigning it. Completion requires aligned second rows, icon-only collapsed branding,
preserved keyboard/focus/Files actions and panel behavior, 640px containment, caption
reservation and portal/menu drag boundaries. Related existing browser scenarios carry the
geometry, interaction and accessibility checks; packaged Desktop runs in required CI.

Manual Before/After captures use base `5ecc9a985540a16b298082e7693f66ca67800f17`
and this change in the same worktree, Vite origin `http://127.0.0.1:5277`, installed Windows
Chrome and the checkout-owned persistent profile. Both use `tmp/quiet-document/quiet-document.md`,
English UI with Korean/English document content, bundled Pretendard, 900px height, DPR 1,
zoom 1, scroll 0, blurred focus and pointer outside the document. All fonts/images are loaded.
A temporary capture-only driver ran through `pnpm browser:test desktop-updates --screenshots`;
it is not an automated assertion or a maintained scenario. The full matrix, measurements,
logs and traces remain in ignored `tmp/titlebar-647`; only representative PNG pairs are kept.
At 640px an opened Outline retains its overlay placement below the whole sticky header;
second-row alignment applies to the docked panel. Desktop captures simulate 138px caption
reservation; they do not show or prove native caption-button rendering or native dragging.

| State | 1440px Before / After | 640px Before / After |
| --- | --- | --- |
| Both open, Light | [Before](assets/brand-titlebar-647/before-1440-light-both.png) / [After](assets/brand-titlebar-647/after-1440-light-both.png) | [Before](assets/brand-titlebar-647/before-640-light-both.png) / [After](assets/brand-titlebar-647/after-640-light-both.png) |
| Files collapsed, Dark | [Before](assets/brand-titlebar-647/before-1440-dark-left-collapsed.png) / [After](assets/brand-titlebar-647/after-1440-dark-left-collapsed.png) | [Before](assets/brand-titlebar-647/before-640-dark-left-collapsed.png) / [After](assets/brand-titlebar-647/after-640-dark-left-collapsed.png) |
| Outline closed, Light | [Before](assets/brand-titlebar-647/before-1440-light-right-closed.png) / [After](assets/brand-titlebar-647/after-1440-light-right-closed.png) | [Before](assets/brand-titlebar-647/before-640-light-right-closed.png) / [After](assets/brand-titlebar-647/after-640-light-right-closed.png) |
| Desktop reservation, Dark | [Before](assets/brand-titlebar-647/before-1440-dark-desktop.png) / [After](assets/brand-titlebar-647/after-1440-dark-desktop.png) | [Before](assets/brand-titlebar-647/before-640-dark-desktop.png) / [After](assets/brand-titlebar-647/after-640-dark-desktop.png) |

## Structure

Every Host has a Sidebar footer Settings entry in both expanded and collapsed states (also available through the command center), opening the [dedicated Settings screen](#dedicated-settings-screen-594). The start screen adds a minimal recovery list/empty state; matching Open offers the newest record in a shared recovery dialog. Standing recording failures use MessageArea. The [recovery contract](editing-session-save-v1.md#local-recovery-records-296-pr2) owns retention and lifecycle. The typed Desktop bridge additionally provides About and update notice/actions. Update notices do not take editor focus. Version/channel/progress/retry/restart policy is defined by [Desktop distribution](desktop-distribution-v1.md).

The document is the primary surface. Each document tab keeps one Tiptap/ProseMirror document state owning selection, history and editing; typed blocks use NodeViews and overlays.

The shell has three responsibilities: the Sidebar on the left browses opened folders and files (which document), the document column in the center is authoring (what is edited), and the Document panel on the right is navigation inside the open document (where in it).

| Area | Current behavior |
| --- | --- |
| Sidebar | Explorer and Collapse Explorer in the header, followed by file navigation; no duplicate New document row with opened folders (#582). There is no Explorer / Display switch. The collapsed 48px rail contains an Explorer icon button at the document-tab row and an icon-only Settings button at the bottom (#671). The Explorer icon restores file navigation; its accessible name and tooltip remain Expand Explorer (탐색기 펼치기), describing the action rather than only naming the panel. Settings uses the same entry component and screen as the expanded footer, at the same vertical position; Back/Escape returns focus to its opening button. Both rail actions are keyboard reachable, have localized names/tooltips and are Desktop no-drag targets. An always-visible Activity bar and additional panels are future work. Explorer contains the opened folders (#112, [ADR-0009](../adr/0009-multiple-opened-folders.md)), each a non-overlapping root section in opening order (ancestor absorption takes the first absorbed position; [#702](#non-overlapping-opened-folders-702)), or, without any, guidance followed by the browser's recent folders (name, full path in `title`): one click lists that folder like Open folder, without opening a document. User-controlled collapse/expand, with a 48px rail when collapsed. No workspace or placeholder navigation. Each folder heading names its folder (disclosure button and name, full path in `title`; [section visibility](#collapsible-folder-sections-425)) with `+` (New document…) and a `⋯` menu containing New folder…, Open folder…, Refresh and Close folder (removes only that folder; tabs stay open). Open folder… adds an unrelated folder; one already open is listed again in place. A descendant is revealed in its ancestor tree, and a new ancestor absorbs its descendant sections ([#702](#non-overlapping-opened-folders-702)). With no opened folder, the empty Explorer panel offers Open folder… and New document…. Below each heading is a folder tree; file listing and activation follow [Folder files and image preview](#folder-files-and-image-preview-217). A `.md` file whose leading frontmatter lacks the native marker stays listed in subtle text with its own icon, and its tooltip and accessible description say it is not an IeumDoc document; opening it still shows the refusal and why ([Folder listing](filesystem-host-boundary-v1.md#folder-listing-v1-112)). On explicit active-document path changes, the containing sections and folders above it expand in each opened folder containing it; a document elsewhere adds nothing to the trees. The opened folders' paths are browser preferences: on start they are listed again in order, and one the Host refuses or no longer has is left out quietly. Child-folder expansion is page state only. Root section collapse is an origin-specific preference restored on Reload/Desktop restart; startup document restoration respects it. Opening document settings or collapsing the sidebar retains the mounted tree, its expansion, scroll and keyboard stop, without listing again. The tree takes the remaining height and scrolls by itself; the open document uses the shared selected surface/text with 600 semibold as a non-color cue, without a left marker there and Close folder removes it. Keyboard: Up/Down, Home/End move through visible items; Right expands a folder or moves into it; Left collapses it or moves to the parent; Enter or Space opens a document or toggles a folder. Explorer does not list the open document separately: the tab row and TopBar name it. |
| Document settings | Collapsed value summary at the top of the paper, before the title and outside ProseMirror (#580). Expands into grouped field rows for Number headings (H1–H6), Reference style (Default, Concise, Formal, Korean; unmatched values show Custom) with notation previews, and Connect bibliography…. Reuses existing operations, history, dirty indication and Save under the [numbering](heading-numbering-v1.md) and [bibliography](citations-v1.md#connect-and-disconnect-bibliography-files-438) contracts. Command center reveals/expands/focuses it. Field controls disable during pending work; Source/start omit the block and read-only shows only summary. Escape inside collapses and focuses the disclosure; the style menu handles its own Escape first. Bibliography uses the existing connection dialog with return to the row’s Connect button. Expansion is per-tab session only. Opening/collapsing preserves editor instance, selection, history and unapplied drafts. App Settings remains separate and has no document-settings entry (#669). |
| Document panel | Outline, Tables and Figures navigation (#613), with 600 semibold, themed surface and segment shadow for the selected tab, muted inactive labels and reserved semibold label width (#620), titled Outline, with no internal close button (#590). The tab-row Outline toggle opens and closes it. The outline is derived from the editor document, indents 12px per level below H1 up to three levels and wraps labels to two lines, marks the section being read with selected background/text and 600 semibold (no left marker, #515); a hidden semibold copy reserves its two-line text extent to prevent selection height jumps. The current item stays inside the list's visible area. The list scrolls by itself and is never written to the document. Table/Figure items reuse the body caption prefix and Core reference template (for example `Table 1. Caption`), including in Korean UI; a missing caption shows only the number. At 1424px and wider the panel is docked and starts open; below 1424px it starts closed and, opened, overlays the document below the sticky header instead of narrowing it, so Save, File actions and the Outline toggle stay usable; Escape closes it and returns focus to the tab-row Outline toggle. The docking width is independent of the 1024px narrow sidebar. Entering the overlay layout always closes it. Returning to docked restores the user's last explicit docked open/closed choice, or opens by default if none exists. Overlay interactions do not overwrite that choice. Open/closed is page memory only and resets on reload; no persistent preference is added. |
| TopBar | Shared single-row brand/search/caption strip; document actions and compact status belong to their owning tab row. See [#695](#title-strip-and-tab-row-actions-695) for responsive search, menu guards and status. Save, Source, Compare, Reload/discard, Copy path and layout preferences retain their existing operations and shortcuts. |
| Document tabs | Fixed second row below the title strip, with a flat current accent marker (#581). Filename, dirty dot, close button and full-path tooltip; same-named files show the distinguishing parent folder. Only the tablist scrolls; its active-document actions remain fixed to its right (#695). Accessible tablist/tab/tabpanel relationships, Left/Right/Home/End switching and Delete to close remain. Closing selects the right neighbour, else left; an inactive close keeps the current tab. |
| MessageArea | Load/save errors, conflict and temporary notices below the tab row; no reserved height when empty. Explicit table deletion shows `Table deleted` / `표를 삭제했습니다` with `Undo` / `되돌리기`, using the existing five-second temporary notice, informational surface and polite status role. It takes no focus. Undo restores the table in one editor history step and returns focus to the editor. The notice/action closes on the next document change, Save, Reload (including opening its discard prompt), Source preview request start, tab switch or timeout; a revoked action cannot undo other work. Source cannot undo the hidden Visual document, and returning to Visual does not revive the action. See [Table interaction](table-interaction-v1.md). |
| Document | Continuous white writing surface with a subtle edge on a muted canvas, extending at least to the bottom of the viewport minus its outer gap. Block tools occupy its gutter. Empty editable documents expose a first-line hint and `+`. No fixed formatting toolbar. |

General file navigation is Open folder… followed by choosing a `.md` file in the sidebar tree; there is no full-file-path dialog (#190). Closing the folder dialog returns focus to the control that opened it. Open folder uses an in-app [folder picker](folder-picker-v1.md), with path completion, breadcrumbs, Up, New folder, recent folders and starting places. Navigating never opens a folder: Enter or Open applies the typed path to the sidebar. A document clicked in the folder opens through Open and its checks ([Folder listing v1](filesystem-host-boundary-v1.md#folder-listing-v1-112)). Source previews canonical Markdown read-only. Long source lines, including unbroken URLs/words, soft-wrap to the available width without horizontal scrolling (#476). Line numbers count Markdown lines only; continuations align with their line's text and have no new number. Wrapping changes no document text or saved content, inserts no copied characters or line breaks, and the generated numbers are never copied. Native selection/Copy retains its existing omission of the terminal newline in Chromium. Source does not replace or reconstruct that tab's visual editor state. Pending Source work blocks switching tabs within its group. Unapplied drafts remain unsaved while Save/Source use applied content; Reload explicitly confirms discarding local work. See [Editing session and Save v1](editing-session-save-v1.md). Clean loaded state is silent; document changes/drafts show `Unsaved changes`. `Saved` is shown only following a successful save with no remaining edits. Saving/errors/conflict retain their meaning; there is no autosave.

Opening another document or the folder heading's `+` opens a new tab after Host success; an already-open
normalized path activates its existing tab in the requested group without a Host GET when the requested path matches exactly. Other
spellings still use Host normalization. Neither Open/New nor tab switching asks to discard work. Switching
retains history, block property drafts, selection, scroll and view; transient inline link/math inputs
close on blur as within one document. Pending Save/Source/assets block tab switching within their group; Open/New and close confirmation retain their operation guards. Focus can still move between visible documents. **Save / Don't save / Cancel** is used for closing one dirty tab. Failed Save, Cancel, or newer
applied edits after Save keep that tab. Inactive tabs keep their state with overlays and measurement
suspended. Browser unload and Desktop close/update inspect all tabs. See the
[editing-session contract](editing-session-save-v1.md#switching-and-recovery).

On Reload or Desktop restart, flattened tab paths, order and focused active identity are restored in one group from browser
preferences, after opened-folder restoration. Missing/refused/non-native documents are quietly
excluded; no document content, cursor or undo is remembered here. Explicit URL/Desktop launch paths
win over remembered tabs, and unsaved recovery records retain their existing review flow rather than
being opened automatically from disk. Restoration alone does not rewrite preferences; successful
user Open/New, Close, recovery Restore or tab selection remembers the current list. An empty list
keeps the start screen. See [startup precedence and recovery](editing-session-save-v1.md#tab-navigation-memory-383).

A folder heading's `+` opens the New filename form without work-loss confirmation. Its Location field shows the destination and lists the
opened folders and every sub-folder their trees have listed, each named from its opened folder
(`docs`, `docs\guides`). Overlapping trees contribute each Host-normalized path only once: the first
occurrence in opened-folder order, then tree order, supplies its position and label. It starts at the open document's folder when that is inside the
heading's folder, otherwise at that folder. Expanding or collapsing folders never changes it.
New asks for a filename, adds `.md` if omitted and uses the existing creation checks; success
opens the document in a new tab and lists its folder again. When the modal closes after successful creation,
focus moves to the first paragraph for immediate typing. Cancel/Escape, including after a
rejected creation, returns focus to the New button.
The start screen, Files area and command center also enter this same creation flow (#553).
See [Folder New](folder-picker-v1.md#new-document-in-a-sidebar-folder).
The folder menu's New folder… uses the same Location and starting destination for a folder name;
success shows the folder in the tree; creation and cancellation return focus to the same More actions trigger. See [New folder](folder-picker-v1.md#new-folder).

### New document entry (#553)

The start screen says **Start an IeumDoc document / 이음독 문서 시작하기**, with purpose-focused
guidance about creating or continuing an IeumDoc document. **New document… / 새 문서…** is the
primary text button, followed by the secondary **Open folder… / 폴더 열기…**. Empty Files has the
same actions; opened folders collect their creation actions in the folder heading (#582). The command center offers **New document… / 새 문서…**
with Korean and English document/file aliases, available without an open document and disabled
during pending work or a close confirmation.

With no opened folder, New document opens the existing FolderDialog, including New folder.
Successful Open adds the Host-normalized folder to the Sidebar and recent/opened preferences,
then, after the picker closes, opens the existing filename form in that exact folder. Cancelling
the picker opens nothing. Cancelling the filename leaves the selected folder open and creates
no document. Both cancellations return focus to the invoking control, or the Sidebar toggle if opening the first folder removed that control. A failed location stays
in the picker; a failed creation stays in the filename form.

With opened folders, the common entry defaults to the current document's containing folder in
its opened tree, or the first opened folder if none contains that document. The per-folder `+`
retains its section-specific default. The form is titled **New document / 새 문서** and explains
the `.md` suffix once. All entries reuse Host/Core creation and the existing tab/focus protections;
no temporary untitled document, autosave, new semantic operation or CLI command is introduced.

#### New document visual comparison

Before is clean base `ff37a32e273dfad90bde84a9c30e2a28ec5e3af3`; After is that base plus #553.
Both use the same checkout-owned persistent headless Windows Chrome profile and Vite origin
`127.0.0.1:5173`, bundled Pretendard, DPR/viewport scale/CSS zoom 1, scroll top, no focused control
and pointer at the top right. A Host start response with no sample/recent/recovery is used for
both. These are manual product captures, separate from automated assertions; the temporary
capture-only walk is removed before commit. Shared Button sizes, spacing and surfaces follow
[Layout Rules](editor-layout-rules-v1.md#controls-and-spacing) and
[Visual Language](editor-visual-language-v1.md); capture procedure follows [Visual change review](../test/README.md#reviewing-a-visual-change). No new token or CSS is needed.

| Language / viewport | Before | After |
| --- | --- | --- |
| English / 1440×900 | [PNG](assets/new-document-553/new-entry-before-en-1440.png) | [PNG](assets/new-document-553/new-entry-after-en-1440.png) |
| English / 390×900 | [PNG](assets/new-document-553/new-entry-before-en-390.png) | [PNG](assets/new-document-553/new-entry-after-en-390.png) |
| Korean / 1440×900 | [PNG](assets/new-document-553/new-entry-before-ko-1440.png) | [PNG](assets/new-document-553/new-entry-after-ko-1440.png) |
| Korean / 390×900 | [PNG](assets/new-document-553/new-entry-before-ko-390.png) | [PNG](assets/new-document-553/new-entry-after-ko-390.png) |

Direct review confirms reachable primary/secondary text actions and readable Korean/English guidance
at both widths, with the existing Sidebar header unchanged. The browser assertions cover the three
entries, Korean/English command aliases, location cancellation, New folder → filename handoff,
Host-normalized Sidebar/destination agreement, filename cancellation and immediate focus, real-file
Save/Reload, and preservation of an existing unsaved tab. The initial chained-dialog attempt failed
the direct filename-focus assertion: the outgoing picker restored focus to the start button.
The handoff now waits for closing completion, suppresses that return only during handoff, and uses
the filename field as explicit initial focus. No timeout, retry or polling allowance was increased.
Windows BadPasswordAttempts was 0 before the first profile launch, 3 at subsequent pre-run checks,
and 5 before the final integrated run; the persistent profile was reused. Traces and capture-only
scripts remain uncommitted. After integrating master `3a8be3e` (#552), Editor 291 tests,
workspace typecheck, Editor build, docs/whitespace and new-document/command-center/layout-rules/
quiet-document passed again. Its docking change leaves the captured 1440/390px states unchanged.
The later master `425eab7` (#494) integration retains the Refresh callback and its shared
folder-creation refresh, alongside New document. Editor tests/typecheck/build/docs are rechecked;
browser integration coverage is left to PR CI because the final local account counter reached 6.
No Edge, packaged Desktop or alternate-profile probe is run locally.

The folder-tree hook owns the live opened list and the preference derived from it. User Open/Close
remembers the latest reduced list; if startup restoration is pending, writing waits until every
remembered path has been tried. Restoration alone leaves preferences unchanged, including paths
the Host no longer lists. A user Open/Close of the same Host-normalized path wins over a late
restoration response, so a closed folder stays closed. Successful explicit Open/Close always
remembers that browser tab's current list, including a same-path Open after another tab saved a
different list. Tree expansion and listing updates never write preferences. See
[Folder picker behavior](folder-picker-v1.md#behavior).

Behavior change (sidebar chrome cleanup): the sidebar no longer has the old Open…, Open folder…
and New button row; #582 now collects those entries in folder headings or the empty Files state. There is no separate current-document row. The app-level New, which took a full
file path in any existing directory, is removed rather than moved: a document is created by
opening its folder and using the folder's `+`. The separate full-file-path Open file entry is also
removed (#190); the shared document loader, Host file APIs and Desktop `.md` arguments remain.
Folder navigation changes no document meaning, so this removal adds no Core operation or CLI command.

## Document navigation lists (#613)

The Outline panel retains an accessible heading. Its first visible row, aligned with the document tabs (#647), is a full-width
row that shares the document-tab height and offers Outline, Tables and Figures without counts (#700). The row
reuses the Visual/Source Button and segmented-control tokens, outside the title-strip drag region.
It works in both docked and overlay layouts, independently of native caption-button space.

The segments are keyboard-accessible tabs linked to their panels; only the selected list
mounts its items. Arrow Left/Right,
Home and End switch tabs; each list retains the outline's Arrow Up/Down, Home/End and
Enter/Space navigation. Empty lists have localized guidance. The chosen list is page-local
state, with no new preference or persistence.

Tables and figures show the existing Core-computed caption number and caption text;
captionless targets show only the number. Both reuse the outline's two-line clamp,
current-item styling, scroll tracking and Visual-view reveal path. Equations are excluded.
This is Editor navigation only: existing Core read-model projections and numbering suffice,
so no semantic operation, Core read-model extension or CLI command is added.

The existing navigation store and reveal path own all three lists. `panel-lists` verifies
live edits, numbering, click/keyboard/Source navigation, current-item tracking, empty guidance,
Korean labels and 1440px/640px light/dark geometry. Existing `outline`, `document-tabs`,
`folder-navigation`, `layout-rules` and `quiet-document` regressions pass. The document-tab
and recovery tests now count tabs inside the Documents tablist, retaining exact count/order assertions
when navigation tabs are also visible. Editor tests (316), workspace typecheck, Editor build,
documentation and whitespace checks pass. Packaging/platform coverage stays in CI.

For #700, 1440×900 Chrome captures show the count-free [Tables](assets/panel-tabs-700/tables-1440.png) and [Figures](assets/panel-tabs-700/figures-1440.png) tabs with the existing lists.

### Navigation list comparison

Actual Windows Chrome 156.0.8078.48 captures use this checkout's persistent profile and
runner-owned Vite origin `127.0.0.1:5173`, English UI, bundled Pretendard after fonts/images
load, DPR/viewport scale/CSS zoom 1, scroll top, blurred controls and pointer outside the
document. Before is product code at `d926c8ad4c9c530b4417997fb46999ce20738dd6`;
After is that HEAD with #613's working changes. Both use the same three-table/three-figure
scratch document, including empty and long captions. Before has only the heading list;
each new list is compared with that baseline. The capture-only runner script is removed;
traces, logs and regenerable full output remain in ignored `tmp/`.

| State | 1440×900 Light | 640×900 Dark |
| --- | --- | --- |
| Before | [PNG](assets/panel-lists-613/before-1440.png) | [PNG](assets/panel-lists-613/before-640.png) |
| Outline | [After](assets/panel-lists-613/after-outline-1440.png) | [After](assets/panel-lists-613/after-outline-640.png) |
| Tables | [After](assets/panel-lists-613/after-tables-1440.png) | [After](assets/panel-lists-613/after-tables-640.png) |
| Figures | [After](assets/panel-lists-613/after-figures-1440.png) | [After](assets/panel-lists-613/after-figures-640.png) |

Direct review confirms the header/drag area remains separate, all segments fit the panel,
and captionless numbers, current-item cues and two-line long captions remain readable in
both modes. Browser tests verify simulated native caption-width reservation and CSS drag
regions; actual native dragging and Windows caption buttons are not browser proof.

## Boundaries

No workspace, recursive filesystem scan, folder watch, filesystem-wide or document-content search, accounts, autosave, new block semantics, overlay framework or persistence architecture is introduced. The right-side Document panel hosts Outline, Tables and Figures navigation: no properties inspector, AI panel, References panel or generic panel/extension framework is introduced. Buttons enter through the Base UI `components/ui/button`; Notice remains a separate presentation primitive.

Browser procedures and repeatable scratch preparation: [TEST_GUIDE](../test/TEST_GUIDE.md). Actual shell evidence: [#176 review](../reviews/editor-shell-176-2026-10-13.md); earlier visual evidence: [review record](editor-visual-refinement-v1-review.md).

## UI display language (#256)

Settings in Web, HTTP Host and Desktop offers `한국어` and `English`, always written in their own languages. An explicit `ieumdoc.uiLanguage` preference wins; without a valid choice, a Korean first preferred browser/app language selects Korean and other languages select English. Both translations are bundled using i18next/react-i18next; there is no translation network request. If local preference storage fails, the current choice still applies and Settings explains that it may not persist.

Changes apply immediately to UI text, accessible names and the page `lang`. Menus support Korean and English search aliases regardless of display language. Operation IDs such as `saving` and `saved-pending` (also exposed by `data-operation`) are independent of translated status text. Translation cannot enable Save, switch documents or bypass work-loss protection.

Existing Admonition labels also update without a document edit. Block-handle accessible names translate the displayed block kind while preserving engine type IDs, and foreign-document tooltips translate their explanation while retaining the literal path.

The mounted editor, document, tabs, selection, history and unapplied property drafts survive language changes. Decorations are refreshed without a document transaction; NodeViews update their UI independently. Document text, labels, computed reference/caption notation and canonical Markdown do not change. No Core operation or CLI command is added: UI language is a local display preference, not a document semantic operation.

Application messages retain translation keys and parameters when stored. Save failures retain their submitted snapshot and are formatted at display time, so their location still refers to the failed submission. Core/Host/library diagnostic details retain their original text; the UI translates the surrounding context and phase-specific guidance without interpreting English reasons or duplicating validation rules. CLI diagnostics and OS-owned dialogs are outside this UI translation boundary.

Verification and implementation scope are recorded in the [#256 plan](ui-language-256-plan.md).

## Local accent color (#559)

Settings offers six named presets: Blue (default), Violet, Plum, Teal, Green and Graphite.
The accent control (#617) is one named radio group (Accent color / 포인트 색): six
small circles form one row, without option boxes, check marks or individual visible
names. Each radio retains its translated accessible name and title tooltip. Only the
selected color name appears beside the row; an offset outer ring marks selection.
Tab enters the selected option; arrow keys move and select, with native radio state
and a visible keyboard focus ring. Swatches use the same theme-specific token values
as the actual accents. Storage failure retains the live choice and existing alert.
There is no free color picker. The choice applies immediately to interactions, selection
background/text, focus, primary actions, links/references and generated heading/Outline numbers.
Information states are neutral; danger and warning retain their meanings. Values and contrast
requirements belong to [Visual Language](editor-visual-language-v1.md#tokens-and-palette).

The existing browser/origin preference path stores only a preset ID in
`ieumdoc.accentColor`, independent of documents and the Host. Vite, HTTP and Desktop
profiles/origins do not share it. Startup applies a valid stored choice before mounting
the first UI. Missing, unknown or unreadable preferences use Blue. A storage failure
keeps the live choice and Settings explains that it lasts for the current page.
Changes preserve the mounted editor, tabs, content, selection, history and property drafts.
This display preference needs no Core operation or CLI command.

## Folder refresh (#494)

Each opened folder's More actions menu offers Refresh before Close folder. Refresh reuses the
one-level Host listing path for that root and its reachable, already loaded child listings,
including cached collapsed children. Never-loaded folders are not read. The command center has
one Refresh folder command per opened root, identified by its full path and using the same handler.
Refresh keeps section/child expansion, current document selection, tabs, editor state and preferences.
Removed entries disappear and new entries appear in the refreshed listings; existing Host errors
remain explicit and late responses retain the newest-request guard. No watcher, periodic refresh,
Host API or Core/CLI semantic operation is added.

When IeumDoc creates a file/folder or creates/rolls back an image asset (paste/drop or Choose…),
its already loaded parent listings are refreshed through the same loader without expanding folders.
This includes the document directory when a new assets directory appears. Unloaded asset listings
remain lazy.

Actual 1280×720 English menu comparison: [Before](assets/folder-refresh-494/before.png) /
[After](assets/folder-refresh-494/after.png). Both use this checkout, the same persistent Windows
Chrome profile, dedicated Vite origin (127.0.0.1:5194), default DPR 1 and the same document/folder
state. Before restores only Sidebar.tsx from base ff37a32; After uses this change. Direct review
confirms the added shared menu row/icon fits without moving surrounding chrome. Large regenerated
traces, full scenario captures and logs remain under ignored tmp/.

The extended folder-navigation fails with the base Sidebar's Close-only menu and passes after the
change. It checks root/loaded-child additions and removals, no unread-folder requests, document
selection/editor content/selection/tabs, preference preservation and command refresh while the
section is collapsed. image-assets now starts in a directory with no assets folder, checks that
paste reveals it and that later drop updates its loaded listing, retaining existing real-file
Save/Reload/rollback coverage. The existing reducer test also covers expansion retained on refresh
failure; command-center's navigation check follows the second enabled match rather than a fixed
command's old result position.

## Collapsible folder sections (#425)

An opened folder without remembered section collapse starts expanded. The chevron beside its name is a native compact ghost button,
with localized `Collapse folder <name>` / `Expand folder <name>` labels and tooltips, `aria-expanded`
and `aria-controls` naming that section's tree. The name remains the section/tree title and its
full path remains in `title`. The chevron points right when collapsed and down when expanded,
like subfolder chevrons. New document… (`+`) and More actions (`⋯`, New folder…, Open folder…, Refresh and Close folder)
remain visible and usable when the section is collapsed. Empty-folder help is hidden with the tree.
Tab order within a section is disclosure → New document… → More actions → the tree's single
retained keyboard stop when expanded. Enter/Space toggle; collapsed tree items are outside Tab and
the accessibility tree. Tree arrow/Home/End behavior is unchanged.

Section visibility belongs to the existing folder-tree state. Collapsing neither lists
folders nor clears cached entries, child expansion, tree scroll or keyboard position. Relisting
the same root, switching tools/sidebar layout, and opening/closing other roots retain it. Closing
that root clears its collapse record, so a later Open starts expanded. Open of a root still in the
live list is a relist and preserves its section state. Reload and Desktop restart instead restore
remembered section collapse under the owner-approved
[ADR-0009 persistence amendment](../adr/0009-multiple-opened-folders.md#amendment-2026-10-25-remember-collapsed-folder-sections-425).

The origin-specific localStorage key `ieumdoc.collapsedFolderSections` contains a JSON array of
Host-normalized root paths, in opened-folder order; for example `["/work/docs"]`. Only collapsed,
currently opened roots are written. Expanded roots, child-folder expansion and listings are not
stored. Vite, Desktop and HTTP origins do not share the preference. It grants no filesystem access:
the Host authorizes and lists every restored root before its remembered collapse is applied.

Restoration alone never writes either navigation preference. Missing/refused/unopened roots have
no live collapse state; stale stored records are pruned on the next explicit write, matching
#370's restoration-only boundary. User Open/Close, section toggle and navigation reveal write the
current reduced collapsed-root list. During startup those writes wait for all remembered roots
to settle, retaining pending roots and user changes. There is no last-written-value cache: each
explicit action writes even if this tab previously saved that same array and another tab has since
overwritten it. Tabs retain independent live views; the latest action writes its own current list,
without a storage-event synchronization service. Child listing/expansion alone never writes.
Unavailable storage leaves the live page usable without persistence.

Manual collapse is allowed even for the active document: its tree current background is hidden with
the tree, while the document tab and TopBar still identify it. Expanding restores the current background.
The existing reveal trigger is unchanged: changing the active document path (including selecting
an inactive tab/search result), creating a document, or creating a folder reveals it in every
containing opened root. Reveal now also expands those sections. Relisting an already-open root
may reveal child folders as before but respects the section's manual collapse. Selecting the
already-active document does not change its path and therefore does not undo manual collapse.
This follows the existing active-path reveal, rather than continuously forcing the current tree
visible on each render or listing response.

Reveal expansion is remembered, including when a containing section was already expanded locally:
the user's document navigation should survive restart and supersede another tab's older collapse.
Startup document/tab restoration is distinguished from explicit navigation: it may list/expand
the current document's child ancestors as before, but never expands a remembered collapsed section
or writes section preferences. Otherwise restoring the active document would erase the very
collapse being restored. Selecting the already-active document still changes no active path.

Command-center search still collects all reachable cached document listings regardless of section
or subfolder visibility (#400 / #384); searching never expands a section or makes Host requests.
Opening a different result uses the same reveal described above. No new search source, Core
semantic operation or CLI command is needed: this is interface navigation state.

Historical section decisions and captures: [Section persistence decision and verification](#section-persistence-decision-and-verification-2026-10-25) and [Section disclosure verification and captures](#section-disclosure-verification-and-captures).

## Sidebar Open folder entry (#385)

Historical placement decision: #385 moved Open folder into the header. The owner-approved
[#582 amendment](../adr/0009-multiple-opened-folders.md#amendment-2026-10-27-explorer-sidebar-582)
supersedes that placement with the [explorer layout](#sidebar-and-native-title-bar-582--605).
The picker, handler, add/relist behavior, preferences and command-center entry remain unchanged.

Historical sidebar captures and verification: [Sidebar entry capture evidence](#sidebar-entry-capture-evidence-385).

## Start without a document (#174)

When startup leaves no open document tabs, the document column shows the start instead of an
editor. A Host response without a default document does not prevent the Editor from restoring tabs.
Explicit paths, tab memory, recovery and the Vite fallback follow the
[session startup contract](editing-session-save-v1.md#tab-navigation-memory-383).
It is the app's start, not a document (#298): it sits on the
canvas without the document paper, under the product mark and name. It offers Open folder… (primary), the
recent folders from the folder picker (name, then full path) and, when the Host offers one, the
sample. Choosing a recent folder lists it in the sidebar like Open folder; the start stays until
a document is chosen in the sidebar. Choosing a folder never discards current edits or drafts;
choosing another file or New preserves existing sessions under the
[session protection contract](editing-session-save-v1.md#switching-and-recovery). Open sample document
opens the Host's writable sample for the current UI language through Open and its checks. Its
temporary notice explains that edits persist until the bundled sample version changes. The sample is opened only on request. Without a document the TopBar keeps its Find documents and commands action, with `No file opened` only as optional secondary information; Save, File actions and the views
stay unavailable. Document settings is absent; the TopBar local-width toggle remains available. No error is shown. With nothing to lose, the Desktop app's
update restart check allows the restart unless a document is opening. Closing the last document tab returns here while keeping the folder tree and preferences. Host start
information is retained, including localized sample paths supplied alongside a Desktop launch file
or the development fallback. HTTP offers allowed server folders, filters recent folders to
those roots and has no sample fallback. The start writes nothing and changes no document
semantics, so it has no CLI counterpart.

## Folder files and image preview (#217)

Files lists every regular non-hidden file, including extensionless files; symlinks/junctions stay excluded.
Markdown retains existing document/native admission and tab behavior. Images use the image icon and
read-only preview description; other files use the generic file icon and explicit editing-unavailable
description. Mouse and Enter/Space share the same dispatch. Image/file selection opens a transient
shared Dialog, preserving the existing editor, selection, Undo, dirty work and property drafts.
Other files show name/path and an editing-unavailable explanation only. Image loading/failure stays
inside the dialog; closing or Escape returns focus to its tree row. The modal blocks Save shortcuts.
The image picker remains independent. See the [Host preview contract](filesystem-host-boundary-v1.md#read-only-folder-preview-217).

## Command center (#363)

The TopBar button leads with a search icon and `Find documents and commands` / `문서·명령 찾기` (#556). Its accessible name also names that action. The current document location/name is optional muted secondary information; the tab row already identifies the file. The full path remains in the secondary information's tooltip. Click or Ctrl/Cmd+/
opens a search dialog near the top center. Type `>` to list commands only.
Ctrl/Cmd+P and Ctrl/Cmd+Shift+P are no longer intercepted: browser printing retains its default behavior.
The shortcut uses the character with a guarded opaque-IME fallback, exact modifiers and no active IME composition; other modal dialogs
still block opening the center and Save behind them.
The input searches opened tab names/paths, Markdown documents already listed in the sidebar and
existing shell command names, including their Korean/English aliases. It does not search document
contents. The bounded listing scope is defined below (#384); #363's no-index/no-scan boundary remains.
The placeholder explicitly names open tabs, loaded documents and commands in both languages (#556).
No-match guidance explains that unread subfolders contribute no documents until expanded, and
Refresh updates already loaded listings; it does not claim that Refresh recursively reads unopened folders.

Commands reuse Open folder, Save, Reload, Copy path, Visual/Source, Outline, sidebar, document width
and app/document Settings handlers and their current availability, plus the history and read-only shortcut guide below (#471). Switching to an opened document reuses tab
activation: no document read/write, new editor state or implicit save. Pending operations retain the
same switching and document-action restrictions; unavailable results remain visibly disabled.
Without an open document, the center still offers folder/settings/view-layout commands.

**Connect bibliography…** (#473, owner decision 2026-10-26) opens the same candidate Dialog as
the **Document settings** action and the connect button in a visible References area.
It shares the document settings restrictions (no document, pending work, Source), without
requiring an editor caret. Selection stages the existing bibliography declaration edit; Save
applies it. See [bibliography connections](citations-v1.md#connect-and-disconnect-bibliography-files-438).

Base UI Combobox owns keyboard/pointer highlighting, selection and IME handling inside the shared
Dialog. Filtering highlights the first match; the first Down moves to the next available result.
Hover moves the same active highlight, using selected surface/text without a marker and the shared control radius (#515); arrows continue from
that item. Enter runs the chosen item. The search input autofocuses on mount so typing immediately
after the opening shortcut goes to search, including before the Dialog's deferred initial focus.
Selecting a Visual document focuses its editor after tab activation and modal dismissal, preserving
its selection and allowing immediate typing; this applies to a newly opened or retained tab and
reselecting the active tab. A tab retained in read-only Source keeps that view and tab-button focus.
Escape/outside dismissal returns to the invoking control or editor without changing its
selection/history/property drafts.
A selected command closes the center before opening its target dialog; that dialog owns focus.
Outline and sidebar commands hand focus to their surviving toggle, including when the invoking
control was inside the panel being hidden. Collapsing the sidebar keeps its rail toggle available for focus return.
Other dialogs retain their shortcuts, and Ctrl/Cmd+S cannot save behind the center.
No-match feedback and controls are translated with the existing UI language.

This is Editor shell navigation and existing-history dispatch. It adds no semantic operation or CLI command;
Core and the existing file/session handlers remain authoritative. There is no command plugin system,
recent-command persistence, filesystem index or independent document-content implementation.

### Action and search scope (#556)

The owner-approved change prioritizes the search action and truthful loaded-list scope, with
label matches before detail-only matches. It preserves #554's 56rem / 48px single-row boundary,
160px minimum, centered button and #571's exact-name command selection helper. Secondary location
yields before the shortcut; only then may the action label ellipsize. This is shell presentation
and navigation, so Core semantics, CLI and Host APIs need no changes.

Manual comparison uses the same initial technical document, clean state, English UI, persistent
Windows Chrome profile, Vite origin and 900px viewport height. Before is master `cc2fb2d`; After
uses #556. These captures are visual evidence, separate from automatic geometry assertions:

| Width | Before | After |
| --- | --- | --- |
| 1440px | [Before](assets/command-find-556/before-1440.png) | [After](assets/command-find-556/after-1440.png) |
| 390px | [Before](assets/command-find-556/before-390.png) | [After](assets/command-find-556/after-390.png) |

The existing shell unit test covers normalized label/detail ordering, ties, aliases, empty queries
and command-only mode. The existing command-center browser scenario checks both languages' scope
copy alongside its unchanged cached-folder/no-request, focus, IME and Save/Reload protections.
Layout-rules retains the 32-case bilingual/panel matrix and fails if secondary information remains
while the action is clipped. Its first run caught exactly that product defect at 1440px with a
collapsed Sidebar; the action now reserves its width while secondary location is shown. Failure
artifacts remain in ignored `tmp/layout-failure-556`; no assertion or timeout was weakened.
Local Editor tests (295/295), workspace typecheck, Editor build, docs/whitespace checks and
command-center, editor-shell and corrected layout-rules browser scenarios passed. Chrome's
checkout-owned persistent profile was reused; Edge and packaged Desktop are left to PR CI.
The first PR CI run (`40387087410`, head `e5aceb0`) exposed two old visibility assumptions:
file-preview waited for the now-optional TopBar filename, and quiet-document required that filename
to remain over 100px. Both now inspect the visible selected document tab. Quiet-document retains
the full-path tooltip, filename-width, content containment and end-scroll assertions; file-preview
retains active-file identity and all preview state/focus checks. These are contract-aligned selector
updates, not reduced assertions. Downloaded CI artifacts are kept under ignored `tmp/ci-556-shard3`
and `tmp/ci-556-shard4`. The corrected file-preview and quiet-document scenarios both passed locally.

### History commands and keyboard shortcut guide (#471)

`Undo` / `되돌리기` and `Redo` / `다시 실행` act on the active Visual document's
existing Tiptap keyboard path, one invocation at a time. Undo gives Markdown input-rule reversal
precedence just like Ctrl/Cmd+Z: after `## ` converts a paragraph to a heading, it restores the
typed `## ` including the space and its caret. Otherwise Undo/Redo use the existing native history.
The command center and opaque-IME fallback share the same visible-key dispatch through the engine
keymaps; no second matcher, input-rule implementation or captured/replayed transaction is added.
The table-deletion notice retains its native Undo for the specific deletion, guarded by the exact
post-deletion document identity. Command-center Undo/Redo changes that identity and revokes the
table-deletion notice/action through the same transaction invalidation; it cannot revive a stale
notice action. Redo of a referenced table's deletion can still show the ordinary reference warning.
They remain visible but disabled without
an active Visual document, while busy, or when that history has no corresponding step.
They do not require an editor-origin opener: clicking the TopBar center can dispatch history.
After the center releases its modal focus, the command runs and synchronously focuses the
same editor. Other tabs' history and unapplied property forms are not separate history targets.
The Save, Undo and Redo rows show their shared platform labels (Ctrl+S/Z/Y, or ⌘S/Z/Y).
The guide also shows the existing Ctrl/Cmd+Shift+Z redo alternative.

`Keyboard shortcuts` / `키보드 단축키` opens a read-only shared Dialog after the center
closes. The guide is a curated list of useful IeumDoc editing shortcuts (#496), with short
English/Korean names and shared platform labels, rather than an inventory of every binding:

- General: Command center Ctrl/Cmd+/, Save Ctrl/Cmd+S.
- Editing: Undo Ctrl/Cmd+Z; Redo Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z; New block Enter;
  Edit selected Figure, Table, block Equation or inline math Enter (#557);
  Apply properties Ctrl+Enter on Windows/Linux or Cmd+Enter on macOS within a properties form (#576);
  Line break Shift+Enter (supported prose blocks, not headings);
  Tab/Shift+Tab increases/decreases heading level at a caret or indents/outdents a list item;
  Ctrl/Cmd+Shift+8 and Ctrl/Cmd+Shift+7 toggle Bullet list / Numbered list;
  Code block Ctrl/Cmd+Alt+C; Go to document end Ctrl/Cmd+End.
- Formatting: bold Ctrl/Cmd+B, italic Ctrl/Cmd+I, strikethrough Ctrl/Cmd+Shift+S,
  inline code Ctrl/Cmd+E, link Ctrl/Cmd+', subscript Ctrl/Cmd+, and superscript Ctrl/Cmd+.
- Tables: Next / previous cell Tab/Shift+Tab.

Keyboard-layout aliases, separate macOS-only variants, basic OS editing/navigation keys and
menu/dialog navigation are omitted from the guide. Their registered behavior is unchanged.

Labels use `shortcuts.ts`, also consumed by the existing shell matchers and formatting tooltips;
Tiptap retains ownership of its keymaps. Editor unit coverage checks every displayed binding
against enabled Core, Tiptap and application keymaps or the existing shell handlers, on Windows
and macOS. A focused presence check protects the curated commands above, without requiring every
registered binding, layout alias, item count or markup. Escape, outside dismissal or Close returns focus to the center's original opener
(editor when opened there, otherwise the invoking control). The shared dialog surface, compact
Close control, spacing, typography and viewport-bounded scroll are reused. The guide reuses the
existing wide Folder dialog width token. At 1280/1440px each entry has its name left and keys
right on one line; at 375px rows may wrap within the viewport without horizontal overflow.
It creates no document/history change and has no opening shortcut. These are Editor history,
focus and help interactions, so they introduce no Core operation or CLI command. Desktop Hangul
IME delivery of Ctrl+Y/Ctrl+Z reuses the guarded matcher integrated from [#481](https://github.com/ieumbird/ieumdoc/pull/481).

Historical command-center captures and keyboard probes: [Command center verification](#command-center-verification-363) and [Command center keyboard verification](#command-center-keyboard-verification-386).

### Caret insertion commands (part of #439)

`Insert citation…` / `인용 삽입…` and `Insert cross-reference…` / `상호 참조 삽입…`
open the existing Citation and Reference forms at the retained Visual editor caret. They need
no slash or preceding whitespace, including directly after Korean text. Availability reuses
the slash menu's schema-backed inline caret eligibility and the existing session busy/view
restrictions. The center must be opened while editor content itself has focus; forms,
property controls (including their buttons), popovers, node-view controls and other shell
controls cannot use a retained body selection to insert. Code, Source and non-caret
selections cannot insert.
Known limitation ([#416](https://github.com/ieumbird/ieumdoc/issues/416)): the engine may not yet have read a selection made within a few tens of milliseconds of the shortcut.
The center releases modal focus before opening the form. Escape returns to the same editor
caret without a document/history change; Apply uses the existing insertion function, returns
editor focus and creates one undo step. Outside dismissal retains the clicked control's focus.

Scope: reuse forms, semantic operations and inline eligibility; no new Core/CLI operation is
needed for this interface entry point. No shortcut or slash-trigger change is included.
Shortcut combinations remain an owner decision, so #439 stays open. Completion requires the
extended `citation-authoring` browser regression (Korean caret, Escape, Undo/Redo and actual
Save → Reload), Editor tests, typecheck/build, docs and diff checks.

Historical insertion regressions and focus-origin evidence: [Caret insertion verification](#caret-insertion-verification-439).

### Listed document search (#384)

The source is the in-memory listing cache reachable from the roots of **all currently opened sidebar
folders** ([ADR-0009](../adr/0009-multiple-opened-folders.md)). Starting at each root, follow folder
entries in the current parent listings and collect each reached listing's `document` entries,
regardless of expansion or sidebar visibility. A subfolder whose contents have never been listed
contributes no files. If a parent is relisted without a child folder, that disconnected child's
retained cache stops contributing immediately. Restoring the child entry makes its retained listing
reachable again, including while collapsed. Search does not change the sidebar's cache preservation
or expansion behavior. Closing a root removes its contribution. Candidate collection and path sorting
run only while the center is open and are memoized until the opened-folder trees change.
Search itself neither requests Host listings/document reads nor expands folders, recursively lists
the filesystem, builds an index or stores the search source in preferences.

Results use the Host-resolved path as identity: an opened tab replaces that file's listing result,
and overlapping opened roots yield one file result. Opened tabs keep tab order and show `Opened tab`
with the full path; unopened Markdown follows in full-path locale sort order and shows `Files` with
its full path. Existing commands follow in their existing order before filtering. For a nonempty query,
matches whose label contains every query word come before matches requiring detail/path or aliases
(#556). Existing order is stable inside each grade; an empty query and `>` alone retain original order.
Case/width normalization, all-word matching across name/path/aliases and the `>` commands-only mode
remain. Filtering always searches **all** candidates before presentation.
The existing height-bounded, scrolling Combobox renders only the first 50 matches in that order.
A persistent count status shows the full match count, including zero. Above 50 it shows the visible
and total counts with guidance to type more to narrow the search, in Korean or English. Base UI's
always-mounted `Combobox.Status` supplies a polite, atomic live region, including its initial text
announcement handling. Base UI still owns highlight, arrows and Enter within the displayed matches;
there are no page controls. To reach a match outside the first 50, narrow the query: filtering still
searches the entire source. This explicit presentation limit replaces the earlier pagination decision
without changing source scope or shell action handlers. #556 adds only the two match grades above; no search index,
virtualization library or document-content command is introduced.

As in Files, a listed Markdown file with `native: false` remains selectable but uses subtle text,
the crossed-file icon and `Not an IeumDoc document` explanation (also accessible). This keeps the
same admission explanation available through either navigation entry. The existing Host/Core
admission check remains authoritative even for a listing marked native. Images, other regular files
and folders are omitted: they are preview/navigation entries rather than editable documents and
retain their existing sidebar entry points.

Selecting an unopened file closes the center before calling the same `openFolderDocument` handler
as the sidebar, including existing operation/continuation restrictions, retained dirty tabs and
property drafts, admission refusal and recovery flows. A successful open focuses the mounted Visual
editor; an admission/recovery dialog owns its focus. Opening a file may relist/reveal its folders
through the existing open path; those requests are not search-time discovery. Opened-tab selection
keeps #386's synchronous tab activation and Dialog final-focus behavior, including Source tabs.
This is Editor navigation, so no Core operation or CLI command is added.

Historical listed-search verification, measurements and result-limit decisions: [Listed document search verification](#listed-document-search-verification-384), [Listed search review follow-up](#listed-search-review-follow-up-384) and [Listed search result-limit follow-up](#listed-search-result-limit-follow-up-384).

### Open ordinary links (#725)

An ordinary click keeps editing and never opens a link. Ctrl/Cmd+single click on an ordinary
link mark opens an absolute http(s) URL with `window.open(url, "_blank", "noopener")`.
The web Host opens a new tab; Desktop's existing `setWindowOpenHandler` sends it to the
system browser. Composition, selection drags, multi-clicks and read-only endnotes do not open links.
The existing Link form also has a keyboard-accessible **Open / 열기** button using its current
URL input, without applying that draft to the document. Relative paths, fragments, incomplete
URLs and other schemes disable Open; its wrapper tooltip explains that only external http(s)
links can be opened. Authoring and preserving those links remain unchanged. This is Editor-only
interaction; no Core operation or CLI command is needed.

2026-10-29 verification: Editor tests (339), workspace typecheck and Editor build passed.
The existing `link-authoring` browser scenario covers plain/modified clicks, IME, selection
drag, read-only endnotes, disabled destinations and the keyboard Open action without applying
its draft. A real new tab has a null `window.opener`; existing authoring/Save/Reload checks remain.
Local `layout-rules` and `quiet-document` checks cover the surrounding shared controls.
Desktop's existing main-process dispatch was inspected; packaged Desktop/Edge execution is left to CI.

The following manual-review captures use Windows persistent Chrome, English UI, Light/Paper,
900px viewport height, DPR/zoom 1, bundled Pretendard ready, the same fresh `links.md` scratch
document and selected OpenAI link, URL-input focus and pointer at (0,0). Before uses the original
Link form from base `7f6ba127803ad456f57b7c2d8688e638cf6040cb`; After uses this implementation.
Both use the updated fixture including the read-only endnote. Capture through
`pnpm browser:test link-authoring --screenshots`; generated traces/logs remain in ignored `tmp/`.
The extra compact outline button wraps with the existing form controls without widening the form.

| Width | Before | After |
| --- | --- | --- |
| 1440px | [Before](assets/open-link-725/before-en-1440.png) | [After](assets/open-link-725/after-en-1440.png) |
| 640px | [Before](assets/open-link-725/before-en-640.png) | [After](assets/open-link-725/after-en-640.png) |

### Relative image link previews (#731)

An ordinary Markdown link to a document-relative PNG, JPG/JPEG, GIF, WebP or SVG
shows an image preview on pointer hover throughout the Visual document, including
read-only endnote definitions. Keyboard reading follows the existing editor selection:
an empty text selection inside an image-link mark shows its preview while the editor
has focus. Moving the caret outside the link, selecting a range, editing or composition
closes it. Links retain ordinary StarterKit rendering and editing: no extra Tab stop,
anchor-element focus or Enter/Tab interception. Click placement, double-click word
selection, drag selection, Korean composition, link authoring and Undo stay unchanged.
Destinations use the existing Figure Host resolver and document locator, including
its access boundary. Missing or undecodable images show **Image not found /
이미지를 찾을 수 없음**. Absolute paths, fragments, http(s) destinations and other
schemes have no preview; hover/focus never requests a remote image. Click behavior
remains the [ordinary-link contract](#open-ordinary-links-725).

The display-only overlay reuses the editor overlay surface, border, typography and
shadow, with 8px padding, a 320px width cap and 240px image-height cap (adjustable
tokens). It fits the owning split group's viewport through `useOverlayBounds`,
follows document scrolling, and closes when its anchor scrolls out of view. Escape,
pointer exit, blur, pointer down, editing and composition dismiss it. It is pointer
transparent and never moves focus, changes selection or writes document content.
No new syntax, Core operation, CLI command or Host API is introduced. Image rename
retargeting, printing/export and remote images are outside this feature.

### Endnote and citation reading previews (#752)

Body endnote references show their current definition on hover; citation chips show the matching
bibliography entries in key order, using the same formatted parts and readiness as References.
Missing definitions, missing keys and unchecked bibliography retain the existing status messages.
These previews replace the chips' native title tooltips. Endnote previews show the definition without
a visible navigation hint (#773); the resolved original chip exposes a link role and retains its
accessible name describing navigation. Endnote click still reveals its definition;
citation click/selection and its explicit Edit button keep their existing behavior.

The same `ReadingPreview` observer handles image links and both chip kinds. A focused editor's
collapsed text caret touching either side of a chip, or native atomic selection of that chip, shows
the same content. There are no added Tab stops, focus transfers, selection changes or transactions.
Typing, document updates and composition close the preview until a subsequent reading gesture;
range selection, Escape, blur, pointer down/exit and scrolling the anchor out of view also close it.
Existing editor keyboard, pointer and IME handling owns all input and selection.

Endnote inline content uses schema mark serialization and existing math/reference/citation display
calculations, without an editor instance or editable NodeViews. Image links keep their formatted
link text in this static preview; their original definition still supports #731 image hover.
Preview links are display-only spans, so there are no focusable or editable descendants.
Both kinds share #731's pointer-transparent surface, spacing, `useOverlayBounds`, split-group
viewport fitting and adjustable reading width/height tokens (20rem / 15rem). Longer content is
clipped to the preview cap; the original definition or References list remains the full reading
surface. No Core operation, CLI command, saved syntax or Host API is added because this is
Editor-only presentation.

`reference-preview` covers hover without state changes, both caret sides/native atom selection,
range dismissal, existing endnote navigation, real citation-click typing/Undo, text-caret Korean
composition, rich static content, unresolved states, list/table chips, scroll dismissal and
1440/640px split bounds. `image-link-preview`, `citations`, `footnotes`, `citation-authoring`,
`layout-rules` and `quiet-document` retain their interface regressions. CDP composition is not
a manual native Windows IME/candidate-window check.

Manual captures use the same fixture, pointer targets, scroll top and persistent Chrome profile
at 1440×900 / 640×900, DPR/zoom 1, English Light/Paper and bundled Pretendard. Before restores
the runtime sources from base `35cbfdfb`; After uses this implementation. The
[capture metadata](assets/reference-preview-752/capture-metadata.json) records the environment.
Only representative PNGs are retained; traces and generated logs stay outside Git.

| Preview | Width | Before | After |
| --- | --- | --- | --- |
| Endnote | 1440 | [PNG](assets/reference-preview-752/before-endnote-1440.png) | [PNG](assets/reference-preview-752/after-endnote-1440.png) |
| Endnote | 640 | [PNG](assets/reference-preview-752/before-endnote-640.png) | [PNG](assets/reference-preview-752/after-endnote-640.png) |
| Citation | 1440 | [PNG](assets/reference-preview-752/before-citation-1440.png) | [PNG](assets/reference-preview-752/after-citation-1440.png) |
| Citation | 640 | [PNG](assets/reference-preview-752/before-citation-640.png) | [PNG](assets/reference-preview-752/after-citation-640.png) |

The `image-link-preview` browser scenario covers hover and keyboard caret movement,
read-only endnotes, quote/list/table links, missing and undecodable images, zero
remote requests, scrolling and split-group bounds. It also compares actual pointer
editing of body/list/table image links with an ordinary link: click then type, native
double-click and drag selection, Korean composition through Chromium's IME protocol,
Ctrl/Cmd+' link authoring and Undo. It never repairs focus or selection before those
input checks. The click/caret regression fails on the original preview implementation
(`33c3bf2b67b7f814dd4083b3a02798d3f680101d`). Native Core admission and canonical round-trip were checked
before implementation with `[^n]: [그림 보기](assets/footnote-110.png)`; the link's
URL/text and stable reserialization are already supported.

Manual-review pairs below use base `a5c1c702f375712a5bdd9e3962ec6c7e137e9f9f`
and this implementation, the same `image-link-preview/links.md` scratch fixture,
Local diagram hover, scroll top, Windows persistent Chrome, English Light/Paper,
1440/640 × 900px, DPR/zoom 1 and bundled Pretendard ready. Before was captured
with the base rendering; After is reproducible with
`pnpm browser:test image-link-preview --screenshots`. Generated logs/traces stay in
ignored `tmp/`; only these small review PNGs are retained.

| Width | Before | After |
| --- | --- | --- |
| 1440px | [Before](assets/image-link-preview-731/before-1440.png) | [After](assets/image-link-preview-731/after-1440.png) |
| 640px | [Before](assets/image-link-preview-731/before-640.png) | [After](assets/image-link-preview-731/after-640.png) |

### Shortcut contract (#381)

The [shared shortcut definitions](../../apps/editor/src/shortcuts.ts) own characters, IME fallback keys, modifiers,
platform labels and `aria-keyshortcuts`. TopBar, selection toolbar, shortcut guide and command-center
items consume those definitions. Existing Bold/Italic tooltip notation is retained. Outline still has no shortcut.
The link shortcut runs in ProseMirror's existing `handleKeyDown` path only for a supported text
selection, uses the same link draft/form as the toolbar, and retains link-range expansion, URL
validation, Apply/Remove, Escape and blur dismissal. Apply/Remove/Escape return focus synchronously
through ProseMirror, so a previous form cannot later blur a newly opened link form. It does nothing behind a modal or during IME
composition. No Core operation or CLI counterpart is needed for this focus/selection interaction.

Selection follows [#378](https://github.com/ieumbird/ieumdoc/issues/378). The two-key bindings are
**Ctrl/Cmd+/** (slash character) for the center and **Ctrl/Cmd+'** (apostrophe character)
for links. Neither uses Alt/AltGr or Shift. The old Ctrl/Cmd+Alt+Shift+P/K bindings are removed;
Ctrl/Cmd+P and Ctrl/Cmd+Shift+P remain unhandled so browser printing is preserved.

The official [Chrome](https://support.google.com/chrome/answer/157179?hl=en),
[Edge](https://support.microsoft.com/en-us/edge/keyboard-shortcuts-in-microsoft-edge),
[Windows](https://support.microsoft.com/en-gb/accessibility/windows/keyboard-shortcuts-in-windows) and
[macOS](https://support.apple.com/en-us/102650) lists were checked on 2026-10-24.
The selected bindings have no listed browser or global system default. Apple's Cmd+/ toggles the
status bar in Finder only; it does not apply when Chrome/Edge has focus. The
[Microsoft Korean layout](https://learn.microsoft.com/en-us/globalization/keyboards/kbdkor.html)
includes unshifted slash (after period) and apostrophe (after semicolon, before Enter).
Literal `event.key` must be `/` or `'`. A different character at the same position is not a shortcut;
full-width punctuation is a different character too. Only `Process` or `Unidentified` may fall back
to `event.code` (`Slash` / `Quote`), and active composition is still ignored.
Left Ctrl is recommended on Korean layouts where right Ctrl is Hanja conversion. No input-source
switching shortcut is claimed. No Core or CLI semantics change.

Historical shortcut candidates, delivery probes and captures: [Earlier two-key candidate audit](#earlier-two-key-candidate-audit-381-historical-physical-only-implementation) and [Earlier three-modifier verification and captures](#earlier-three-modifier-verification-and-captures-381-historical).

#### Keyboard-layout safety (#381 review follow-up)

Browser accelerators are also checked conservatively: `keyCode` must be the definition's unshifted
punctuation virtual key (191 for `/`, 222 for `'`), unspecified (0), or IME Process (229).
Other native mappings are passed through, even if an IME reports an opaque key or the visible
character matches. This is necessary because French AZERTY apostrophe uses digit 4: character-only
matching would compete with Ctrl+4. A German `Process`/`Unidentified` event with VK_MINUS (189)
must likewise retain browser zoom. Chromium derives browser accelerators from the
[Windows virtual key](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/ui/content_accelerators/accelerator_util.cc),
not just the DOM character. The numeric guard deliberately uses the legacy field for this supported
Chromium boundary; [Windows virtual-key definitions](https://learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes)
identify those values. Unknown native mappings fail closed rather than claiming cross-layout support.

Shift remains disallowed. We do not introduce Ctrl/Cmd+Shift+7 or any other layout-dependent alias:
the displayed two-key bindings must not grow an unverified browser/OS accelerator. Layouts requiring
Shift, AltGr, or a reserved virtual key use the existing Command center / Link buttons instead.
The tooltip, ARIA and command-item definitions remain unchanged and denote characters, not universal
physical positions. Depending on the layout, the character can be on another key; not every layout
has a usable unshifted, unreserved keyboard combination. No automatic remapping is claimed.

Official layouts: [US](https://learn.microsoft.com/en-us/globalization/keyboards/kbdus),
[Korean](https://learn.microsoft.com/en-us/globalization/keyboards/kbdkor),
[German](https://learn.microsoft.com/en-us/globalization/keyboards/kbdgr),
[French legacy AZERTY](https://learn.microsoft.com/en-us/globalization/keyboards/kbdfr).

| Layout / event | Center | Link | Browser behavior |
| --- | --- | --- | --- |
| US, Korean literal `/` / `'`, VK 191 / 222 | Opens | Opens | No listed default replaced |
| Korean opaque `Process` / `Unidentified`, Slash / Quote, VK 229 / 0 / matching punctuation | Opens | Opens | Composition still ignored; other physical codes passed through |
| German Slash-position `-`, VK 189; Quote-position `ä` | Does not open | Does not open | Ctrl+- zoom preserved |
| German Shift+7 `/`; Shift+Backslash `'` | Does not open | Does not open | Shift aliases deliberately unavailable; use buttons |
| French Slash-position `!`; Quote-position `ù` | Does not open | Does not open | Different characters passed through |
| French Shift+Period `/`; digit-4 apostrophe | Does not open | Does not open | Ctrl+4 tab switch preserved; use buttons |
| Opaque key masking VK_MINUS / VK_4 | Does not open | Does not open | Browser zoom / tab switch preserved |

Historical layout-specific failures and browser probes: [Shortcut layout verification](#shortcut-layout-verification-381).

## Writing interactions

- The [document title](document-editing-v1.md#document-title-255) is a plain frontmatter string edited above the body. Empty/absent values show an empty input with Add a title placeholder. Every H1–H6 is a body section with ordinary movement, conversion and reference controls; no title is inferred from body position (#722).
- Hover or keyboard focus reveals the current block's `+` and drag/action handle. Pointer travel into tools preserves them; hover does not change document state. On devices without hover, tools remain visible. A single empty editable paragraph is the starting-state exception: its `+` is always visible, its drag handle hidden, and a non-persistent hint says `Start writing, or type / to add a block.` Typing hides the hint; undo restores it. Clicking the paper below the content continues writing through the existing editor operation.
- `+` and `/` share supported insert commands, grouped by dividers with an icon and, as a key chip, the Markdown shortcut that makes the same block: Text (Paragraph, Heading 1–6, including without a search query; #575), Lists, Blocks (Note, Warning, Quote, Divider), Technical (Code block, Equation, Figure, Table); slash also offers Endnote ([Endnotes](footnotes-v1.md)) and actual Equation/Figure/Table targets and section references. H1 is a body insert choice; the separate title input writes frontmatter (#722). The block menu groups conversions, table, section and block actions the same way. Slash keeps editor focus. Gutter-opened menus focus their first item. The command center has inline citation/reference insertion, but no heading insertion items.
- Slash reference choices show computed display numbers with caption summaries (Equation: label), and search caption words, labels, kinds and display prefix/number; template-based forms such as `Figure 2`, `식 (3)` and `Table 1` remain one slash query. Section choices keep their heading names and creation behavior. Ordering and overflow use the existing shared menu; see [reference search and menu names](section-references-v1.md#editor).
- `/ref`, `/reference` and `/참조` list all reference kinds, including unlabeled headings. Figure and Table kind keywords (`figure` / `그림`, `table` / `표`) match their respective kinds. Empty queries retain labeled targets only, and unrelated queries do not list references unless their labels, captions or heading words match.
- Body Paragraph/Heading menus convert between prose and H1–H6 while preserving inline content; line breaks prevent conversion to a Heading. Tab/Shift+Tab changes level within H1–H6; Markdown `# ` creates a body H1. Title metadata remains independent. See [document title](document-editing-v1.md#document-title-255). Admonition menus change among the standard kinds.
- Block action menu exposes existing supported deletion, and for a table adding a row below or a column right of the caret's cell; a table's own action bar below it holds Edit (label), Table actions and Delete table; handle drag reorders through the existing editor operation. Unsupported document structures reject [native admission](document-support-v1.md). [Endnotes](footnotes-v1.md#editor) follow their first reference: their handle opens block actions but does not drag, they have no `+`, and a dragged block lands in the body.
- Text selection in supported paragraphs, headings, quotes, simple admonitions, table cells and Figure/Table captions offers Bold, Italic, Strikethrough, Subscript, Superscript, Inline code, Link, Inline Math and Cross-reference. Each button's tooltip names it with its shortcut where one exists (Bold Ctrl/Cmd+B, Italic Ctrl/Cmd+I, Strikethrough Ctrl/Cmd+Shift+S, Inline code Ctrl/Cmd+E, Link Ctrl/Cmd+'); Cross-reference uses a bookmark icon, as do reference choices in the slash menu. Ctrl/Cmd+, and Ctrl/Cmd+. toggle subscript and superscript; applying one replaces the other. Tab moves from the selection into the toolbar (in table cells and lists Tab keeps its cell/indent meaning); Escape or Shift+Tab returns with the selection unchanged.
- Figure selection shows the selection outline only. Explicit Edit, selected Enter or double-click on its image surface (including the pending frame and image-load error) opens Image/Alt text/Label fields. All captions are edited directly in the document; caption double-click keeps normal text selection. Metadata Apply preserves the live caption and its formatting. Figure metadata survives keyboard selection/focus movement. Done and pointer dismissal apply; Escape cancels. Core validation failure preserves values. The anchored popover, explicit replacement/rename and Mermaid source-entry contracts are in [Figure properties](figure-authoring-v1.md#anchored-figure-properties-757); cancelling never removes the Figure.
- `/figure` and `+` insert an empty Figure without opening its properties; the caret starts in its caption. Image-less Figures, with or without caption or label, remain as pending Figures with a dashed `No content yet` frame. Clicking the frame selects the Figure; existing Edit connects an image URL later. Pending Figures retain normal Figure metadata, numbering and references and are included in Save/Source. See [Figure authoring](figure-authoring-v1.md).
- Equations, Tables, inline math and section labels use the shared explicit properties form; Figure metadata uses the #757 popover described above: selecting a block opens no panel; Edit opens its explicit form (Equation in its document block with LaTeX, draft preview, number and label; Figure in a popover with image, alt text and label), with Apply/Cancel and Escape. Figure image surfaces, block/inline formula previews and Table metadata offer double-click through the same path; Enter on a selected Figure, Table or math node also opens properties (#557). Figure/Table caption and cell double-click keeps native text selection. Inline math has an explicit Cancel button and retains its unapplied draft on outside focus, Save/Source and tab switching. Edit, double-click and selected Enter focus the first field; closing retains a text selection inside the block or returns a [caret after the block](document-editing-v1.md#continuous-editing), so subsequent typing preserves it. Opening properties and focus restoration change neither document nor history; double-click while already editing leaves the existing form untouched. Unapplied changes retain the block-local notice and an explicit applied-only Save/Source notice.
- Authoring restrictions, reference chips, caption text and errors stay visible. Authoring metadata is hidden at rest and revealed during interaction; actual labels remain explicit in properties/editing. Figure, Equation and every Table number are computed for display and never written into their text. Table numbers do not depend on caption or Label; [all tables use numbered directives](table-caption-v1.md). The [Number headings](heading-numbering-v1.md) checkbox in Document settings optionally numbers H1–H6 body sections in the document and Outline, leaves the frontmatter title unnumbered, and saves MyST numbering settings only.

### Unified action menus (#516)

Owner decision D2/M1 (2026-10-26, [#507](https://github.com/ieumbird/ieumdoc/issues/507)):
block `⠿`, `+`, slash and table row/column/table menus reuse `CommandMenu` with
action-specific 16px pinned lucide line icons, labels, optional real hints and group
separators. `+`/slash retain their Markdown-input hints as key chips; block actions
gain no invented keyboard shortcuts. Delete, Delete section, Delete table and
Delete row/column use the danger text/icon token and danger hover surface. Disabled
rows keep native disabled semantics and are skipped by arrow navigation; fixed-block
and draft reasons are exposed as accessible descriptions and tooltips. Boundary moves
also explain their direction: `There is no body block above this one.` /
`There is no body block below this one.` (Korean: `위로 이동할 본문 블록이 없습니다.` /
`아래로 이동할 본문 블록이 없습니다.`), using both tooltip and accessible description.
Fixed endnote reasons retain their priority. Otherwise an active properties
draft's Apply or Cancel reason precedes the boundary reason, so the menu explains
the user action needed before movement can become available.

Body Paragraph/Heading conversions offer H1–H6 and Paragraph for headings, excluding
the current level. Frontmatter title is not a block conversion target. No Duplicate
or list conversion is added.

Numbered-list block handles offer **List format / 목록 형식** (#734). It opens one
shared action-menu list with `1.`, `1)`, `a.`, `a)`, `A.`, `A)`, `i.`, `i)`, `I.`,
`I)` preview labels and a check on the current format. Bullet-list menus omit this
entry. Selection applies to the handle's top-level list, preserving its start,
items and nested lists' independent formats; cursor position does not retarget it.
One format change is one engine transaction and one Undo. Save uses the existing
Core `updateList` replay and its [ordered-format contract](document-support-v1.md#ordered-list-formats-734),
also available through CLI `--list` JSON. Choosing the current format leaves history
unchanged. The Editor renders each list's effective style and delimiter, including
nested lists, and its typed clipboard retains both through paste. Split, merge,
item deletion and Undo retain the containing list's attributes. Direct `a) ` typing
input rules and external HTML/PDF rendering are outside this change.

Move up / Move down swap the block with its adjacent body block through the same
reorder transaction as drag, with one-step Undo. They are disabled at boundaries,
for endnotes, and while that block
has an active properties draft, using the drag restriction reasons. Nothing moves
into endnotes. The leading H1 has no special movement restriction. A heading moves as one block; the existing separately
named Move section up/down and Delete section retain their section meaning. Save
uses the existing Core `moveBlock` replay (CLI `move-block`); no new Core operation
or CLI command is needed. Delete paths, reference warnings and the table deletion
notice/Undo stay unchanged.

Gutter/table menus focus their first enabled row; Escape restores their opener.
Slash highlight/navigation and pointer selection keep focus in the editor.
Base UI File actions/folder menus share the 28px minimum row height, 4px/12px padding,
8px gap, 6px radius and 16px icon slot; their existing focus/highlight owner remains.

Manual same-state evidence at 1440×900, English, fresh `tables.md`, first-row focus,
pointer away: block [before](assets/unified-menus-516/before-block.png) /
[after](assets/unified-menus-516/after-block.png), `+`
[before](assets/unified-menus-516/before-insert.png) /
[after](assets/unified-menus-516/after-insert.png), table
[before](assets/unified-menus-516/before-table.png) /
[after](assets/unified-menus-516/after-table.png). These captures are manual visual
review evidence, not automated screenshot assertions. Baseline: master
`325704e73871303b70aa4c73fc930eb2f975b8c1`.

Verification: new block-move, structural-block-authoring and table-authoring browser
assertions failed on that unchanged master (missing moves, missing block icons/danger,
missing table icons respectively). After implementation, those scenarios plus
basic-blocks, document-title, footnotes, layout-rules and quiet-document passed in
one serial persistent Chrome run in this worktree. The final block-move run also
checks that moving a heading swaps only that block and compares saved/reloaded
content order. Editor tests (290/290), workspace typecheck, Editor build, documentation
and whitespace checks passed. The final block-move/editor-shell/folder-navigation
run passed, including Base UI menu keyboard behavior. The `+` before/after PNGs
are byte-identical. The temporary manual capture scenario was removed.

Review correction (#523): on `842965f`, new boundary tooltip/accessible-description
assertions failed for both first-body Move up and last-body Move down (both values
were absent). The corrected browser scenario checks both English and Korean reasons,
then retains the existing move/Undo/Save→Reload coverage. Movement semantics are
unchanged; the existing command rejection metadata supplies the missing explanation.
The re-review regression on `7284bd6` also reproduced boundary reasons hiding an
open Equation draft's reason at both body edges. `block-move` now opens real drafts
in the first and last body Equations and checks the draft reason in both tooltip
and accessible description before retaining the existing boundary/Undo/Save coverage.

### Default heading choices (#575)

The default `+` and slash insert lists show Heading 2–6 in their existing Text
order. Search aliases and group order stay unchanged. #722 later expands body insertion to H1.
This changes Editor command discovery only; no Core semantic operation or CLI
surface is needed.

Same-state slash captures use the basic-blocks scratch document, English UI,
installed Windows Chrome, Pretendard, DPR 1 and default zoom at 1440×844 and
390×844. Before runs the unchanged command implementation from
`97a73bb55aa93f31d67ed6b043cfaaa468ad29e4`; After includes this change.
The menu moves upward to stay in the viewport as the list grows. At these sizes
all choices fit; basic-blocks checks every choice's viewport bounds during arrow
navigation, wrapping, editor focus and the existing H5 insertion/Save → Reload.

| Width | Before | After |
| --- | --- | --- |
| 1440px | [Before](assets/slash-heading-575/before-1440.png) | [After](assets/slash-heading-575/after-1440.png) |
| 390px | [Before](assets/slash-heading-575/before-390.png) | [After](assets/slash-heading-575/after-390.png) |

### Nested inline slash menu (#377)

The reference target form closes on Escape and outside pointer interaction, including when
the document has no labeled targets and the form has no autofocus control. Outside dismissal
preserves the clicked destination's focus; Escape returns focus to the editor. This applies
to both selection-toolbar insertion and an unresolved reference's editor, without changing
document content, and leaves slash insertion available without Reload (#427).

Implementation scope: expose existing inline insertion paths on Core-backed editable inline
surfaces. Preserve top-level paragraph order/search/keys; omit block commands everywhere else.
No new Core semantic operation, CLI command, search ranking or gutter `+` change is needed.
Completion requires menu/insertion regressions and actual Save → Reload, including a citation-only
list item (#366), plus Editor tests, typecheck/build and documentation checks.

| Caret location | Citation / document reference | Endnote | Existing Core save contract |
| --- | --- | --- | --- |
| Top-level paragraph | Yes; existing full menu | Yes | Paragraph inline content |
| List item, including nested lists | Yes; inline menu only | Yes | `updateList` with typed item content; [native List contract](document-support-v1.md#supported-meaning) |
| Quote / simple admonition | Yes; inline menu only | Yes | `updateQuoteInlineContent` / `updateAdmonitionInlineContent` |
| Endnote definition | Yes; inline menu only | No | `updateFootnoteDefinition` permits citations/references and refuses footnote references |
| Table header/body cell | Yes; inline menu only | Yes | `updateTableCell` |
| Figure caption | Yes; inline menu only | Yes | `updateFigure` with inline caption content |
| Table caption | Yes; inline menu only | Yes | `updateTableCaption` with inline caption content |
| Body heading (H1–H6) | Yes; inline menu only | Yes | `updateHeadingInlineContent` |
| Code / property fields | No menu | No menu | Code and fields keep literal input |

The Editor schema mirrors these existing Core inline contracts (in particular, a definition
excludes `footnoteReference`). Menu eligibility and the existing endnote insertion guard use
that schema; the Editor introduces no new semantic rule. Figure/list Save uses the existing
typed content operations even though the dedicated Core `insertFootnote`/`insertCitation`
addressing surface does not include those locations. The same `insertCitation`, `insertReference`
and `insertEndnote` paths serve all locations. Arrows, Enter and Escape keep the shared menu's
existing behavior. See [citations](citations-v1.md), [references](section-references-v1.md) and
[endnotes](footnotes-v1.md) for their persistent contracts.

List and Figure round-trip validation compares the completed intermediate footnote snapshot that
`serializeFor` already verifies. This lets the existing Save replay edit a list before adding
its new definitions, just as other inline operations do. It still compares block count,
list structure, exact inline content and canonical stability; final writes still reject
missing definitions. No new persistent document combination is introduced.

Code block edits can be saved together with new endnote references (#393). Core compares
the code block round-trip count with the same completed footnote snapshot used for
serialization, matching the list and Figure checks. Save replay order is unchanged;
final writes still require real definitions. The literal `/` code probe in
`citation-authoring` remains separate from this Core/replay regression coverage.

## Evidence and history

### Verification record

- Documentation verification: 2026-10-26 (start-screen conditions and Open/New protection compared with App.tsx and the session contract; no new browser execution).
- Outline input verification: 2026-10-25 (#362: retain heading-row identity while preceding text shifts engine positions; navigation, current-section geometry and document semantics unchanged. [Windows measurements and preservation evidence](../reviews/editor-input-performance-2026-10-25.md)).
- Reference dismissal verification: 2026-10-25 (#427: no-target selection form and unresolved-reference form, Escape/outside pointer dismissal and subsequent slash insertion in cross-reference; Editor 280/280, typecheck/build).
- Result-limit verification: 2026-10-24 (#384 integration decision: first 50 matches, persistent bilingual live counts and query narrowing instead of pages; [new evidence](#listed-search-result-limit-follow-up-384)).
- Search review verification: 2026-10-24 (#384: reachable cached listings after parent relisting, bounded/paged 2,000-document search and #397 restored-tab integration; [measurements and regression scope](#listed-search-review-follow-up-384)).
- Layout-safe shortcut verification: 2026-10-24 (#381 review follow-up: character matching, guarded opaque-IME fallback, German zoom and French tab-switch preservation; supersedes physical-only matching).
- Two-key shortcut verification: 2026-10-24 (#381 follow-up: headed Chrome/Edge candidate delivery and cancellation; Chrome/Edge product regressions, Electron candidate/action smoke, Editor/Desktop tests and typecheck/build; macOS documentation review only).
- Shortcut verification: 2026-10-24 (#381: Editor tests, Chrome/Edge command-center and link-authoring integration, Electron shortcut smoke, typecheck/build and docs; native browser-chrome verification remains unconfirmed as detailed below).
- Last verified: 2026-10-25 (#425 owner persistence decision: Editor tests/typecheck/build, folder-memory/navigation/command-center/document-tabs/editor-shell/quiet-document; [restoration evidence](editor-ux-shell-v1.md#section-persistence-decision-and-verification-2026-10-25)).
- Previous verification: 2026-10-25 (#425: collapsible folder sections; Editor tests/typecheck/build, folder-navigation/folder-memory/command-center/editor-shell/layout-rules/ui-language/quiet-document and [desktop/phone captures](editor-ux-shell-v1.md#section-disclosure-verification-and-captures)).
- Previous verification: 2026-10-24 (#385: Sidebar header entry, Close-only folder menus; folder-navigation browser check, Editor tests/typecheck/build and [same-state desktop/phone evidence](editor-ux-shell-v1.md#sidebar-open-folder-entry-385)).
- Previous verification: 2026-10-24 (#383 review integration: command-center focus on restored tabs and recovery-dialog modality with #391/#392; document-tabs/recovery/command-center browser regressions).
- Listed-document search verification: 2026-10-24 (#384: cached sidebar listings, native admission, path deduplication and new-editor focus; command-center and related browser regressions, Editor tests and typecheck/build; [evidence](#listed-document-search-verification-384)).
- Previous verification: 2026-10-24 (#386: immediate command-center search typing and document focus; command-center/editor-shell/document-tabs/ui-language/layout-rules/quiet-document browser regressions, Editor tests and typecheck/build).
- Code/endnote save verification: 2026-10-24 (#393: Core intermediate-snapshot regressions and Editor Save replay with a new endnote, code edit and existing definition edit; no UI change).
- Nested inline verification: 2026-10-24 (#377: Editor slash eligibility tests, Core list/Figure intermediate-footnote regressions, and actual citation-authoring menu/insertion/Save → Reload on all locations below, including a citation-only list item).
- Previous verification: 2026-10-24 (#383: Reload restores document tab paths/order/active identity; recovery priority and explicit startup routing; document-tabs/recovery/recovery-structure browser regressions).
- Previous verification: 2026-10-24 (#367 cross-tab follow-up: explicit same-path Open remembers the active tab's list after another tab writes; tree-only no-write and Reload checks; folder-memory browser regression).
- Previous verification: 2026-10-24 (#367 review follow-up: same-path Close survives late restoration/Reload, tree-only updates do not rewrite paths; folder-memory browser regression).
- Previous verification: 2026-10-24 (#367: folder restoration/Open/Close response-order and Reload checks, unique nested New file/folder destinations; folder-memory browser regression).
- Previous verification: 2026-10-23 (#363 command center; Editor tests, typecheck/build, command-center/editor-shell/document-tabs/ui-language/layout-rules/quiet-document browser checks; [actual captures](editor-ux-shell-v1.md#command-center-verification-363)).
- Previous verification: 2026-10-23 (#235 [ADR-0009](../adr/0009-multiple-opened-folders.md): several opened folders as separate Sidebar sections, Open adds, per-folder Close, restored paths and outermost-folder location/New; Editor unit tests and stable browser suite).
- Previous verification: 2026-10-22 (#217: all-file Sidebar listing, bounded read-only image preview; Host/Editor/Desktop protocol tests and actual Vite/production HTTP browser regressions).
- Previous verification: 2026-10-20 (#256: bundled Korean/English settings, live language changes and editing preservation; `ui-language` browser scenario and Editor tests).
- Previous verification: 2026-10-19 (#255: document title area, Add a title, fixed title handle and Enter below the title; `document-title` browser scenario).
- Previous verification: 2026-10-19 (#298: the start without a document sits on the canvas with the product mark, apart from the paper; open-files, recovery, document-tabs and the stable suite; same-state captures against `e265e1c`: 1440px [before](assets/start-screen-298/before-1440.png)/[after](assets/start-screen-298/after-1440.png), 375px [before](assets/start-screen-298/before-375.png)/[after](assets/start-screen-298/after-375.png)).
- Previous verification: 2026-10-19 (#321: phone-width sidebar closed without a rail or covering the whole screen, opened from the TopBar; browser checks).
- Previous verification: 2026-10-17 (UX review: location identity, recent folders and unsupported files in Files, overlay sidebar below 640px, Copy path, tooltips, table Edit placement and Source lines; stable browser suite and captures in the [review](../reviews/editor-ux-review-2026-10-17.md)).
- Previous verification: 2026-10-16 (#296 PR2: shared recovery Settings, start list, matching-document prompt and standing failure surface; real Vite recovery UI checks).
- Previous verification: 2026-10-16 (#204: tab row, active shell and retained sessions; browser checks and user-approved 1440/375px captures in the [review](../reviews/document-tabs-204-2026-10-16.md)). Previous verification: 2026-10-15 (#281: cross-reference, section-reference, table-authoring, pending-figure, layout-rules and quiet-document browser checks; actual 1440px slash-menu Before/After). Previous verification: 2026-10-15 (#275 Equation/Figure/Table/section-label property-close caret, Apply/typing and insertion/Cancel/Escape browser regressions; ADR-0006 native admission wording compared with code/tests). Previous verification: 2026-10-13 (#176: Files/Display switching, tree/selection/history/draft preservation, File actions and Reload focus, unavailable settings; browser results and actual captures in the [#176 review](../reviews/editor-shell-176-2026-10-13.md)).

### Section persistence decision and verification (2026-10-25)

The repository owner changed #425 after the initial implementation: remember only root section
collapse across Reload/Desktop restart. The earlier no-section-persistence decision and the
verification records below describe that earlier implementation and remain intact.

The extended folder-memory failed on unmodified head `7a45f2bc0f8bb40751193851d3cd093ccc422fdd`:
`Collapse remembers the root: collapsed preference [], expected [...]` and
`Reload must restore the active document section collapsed`. This test now covers stored root
format, active-document Reload, expand/Reload, Close/reopen, missing/unopened record pruning on
the next action, restoration-only zero writes, delayed-root collapse/expand/Close races, and
the #370 two-tab order including reveal of an already-expanded local section after another tab's
collapse. Original opened-folder memory regressions remain in the same scenario.

After the change, Editor tests pass 280/280 and typecheck/build pass. The final related run covers
folder-memory, command-center, document-tabs and editor-shell (4/4); folder-navigation with
screenshots and quiet-document with actual glyph-font assertions each pass separately (1/1).
The persistence scenarios include both user collapse and user expansion while a later root is
pending, and same-path Close winning over an older restoration. Existing source fixture guards
and expected-error classification are unchanged. Build warnings remain the existing externalized
punycode/large bundle warnings. No platform installer or live Desktop restart is claimed by these
local browser checks; Desktop uses the same origin-specific preference path and required CI.

Real Reload captures: [1440px](assets/sidebar-collapse-425/restored-collapsed-1440.png) and
[375px](assets/sidebar-collapse-425/restored-collapsed-375.png), with
[capture metadata](assets/sidebar-collapse-425/persistence-environment.json). These use capture
HEAD `7a45f2bc0f8bb40751193851d3cd093ccc422fdd` plus this persistence change; source SHA-256
identifies the exact implementation. Same worktree-owned Vite/persistent Windows Chrome, measured
DPR/viewport scale/CSS zoom 1, bundled Pretendard, scroll 0, blurred focus and no dialog/menu.
Direct review confirms the first section remains collapsed after Reload, the other section's
tree remains visible, and names/actions/document geometry match the existing collapsed view.
The earlier disclosure captures and their metadata below remain historical evidence.

The first persistence CI at `e9d58bbdb0626f1c6e481685e6687970dfaa7ed9`
([run 40136117318](https://github.com/ieumbird/ieumdoc/actions/runs/40136117318)) passed quality,
Desktop/HTTP and browser shard 1/2, including folder-memory; shard 2/2 passed folder-navigation
but failed file-preview's phone archive-row click. Its input-events artifact shows Escape targeting
the still-focused tree row, then focus moving to Expand sidebar: the preview image was visible
before the modal's initial focus, and the sidebar closed too. The unchanged local file-preview
passes. The viewport preview case now explicitly asserts modal focus ownership (within 5 seconds)
before its Escape. This adds a readiness assertion without forcing focus, reopening the sidebar,
changing product behavior or weakening the existing preview/content checks. Capture sources are
unchanged; the new test-only head needs its own final checks and CI, recorded in the PR.

### Section disclosure verification and captures

The clean base's existing folder-navigation and quiet-document checks passed. Before product
edits, the extended folder-navigation failed with `Opened folder section must expose an expanded
toggle button`; command-center stopped at the absent toggle as well. Later expected HTTP failures
were not reached in those early exits. An initial implementation run also exposed a test locator
mistake: modal background controls are excluded from default role queries. Its inspection locator
now includes hidden controls while the center is open; no product assertion/timeout was weakened.

The final folder-navigation checks Enter/Space and Tab/reverse Tab, whole-tree/empty-help hiding,
retained child expansion/current marker/scroll/keyboard stop without Host listing, collapsed New
file/New folder/Close, relisting including the active document, unrelated-root Open/Close, Reload,
and 28px target/long-name geometry at 1440/1024/375px. Folder-memory verifies no preference write
on collapse and preservation through relist; command-center verifies cached-file search without
expansion/Host requests, active-result preservation and different-result reveal. Existing
editor-shell/layout-rules/ui-language also pass. Editor tests: 278/278; typecheck, Editor build,
docs/diff checks pass. The build retains its existing punycode externalization/bundle-size warnings.

Same-state product captures below use base HEAD `108d134a04228001ada41944e41dec8ac2a227b9`.
After is that HEAD plus the implementation, identified by source SHA-256 in
[capture metadata](assets/sidebar-collapse-425/environment.json). All use this worktree's own
Vite and persistent headless Windows Chrome profile. Before uses the runner's default DPR 1 with
no zoom override; After measures DPR/viewport scale/CSS zoom 1. Both wait for fonts; quiet-document
checks actual bundled Pretendard glyph fonts. Files is selected, the sidebar expanded, scroll 0,
focus blurred, pointer at the right edge and no dialog/menu present.

| Width | Before | After, expanded | After, first section collapsed |
| --- | --- | --- | --- |
| 1440×812 | [Before](assets/sidebar-collapse-425/before-1440.png) | [Expanded](assets/sidebar-collapse-425/after-1440.png) | [Collapsed](assets/sidebar-collapse-425/collapsed-1440.png) |
| 375×812 | [Before](assets/sidebar-collapse-425/before-375.png) | [Expanded](assets/sidebar-collapse-425/after-375.png) | [Collapsed](assets/sidebar-collapse-425/collapsed-375.png) |

Direct review: heading/name/action positions and document layout remain aligned. The root icon
becomes a quiet chevron; only the selected section's contents disappear. Other sections move up
naturally, and all three folder actions remain reachable in the full-screen phone sidebar.
The 200px sidebar and wrapped Korean/unbroken names retain their geometry and reachable targets.
These are visual/navigation checks, not new document semantics or platform packaging evidence.

The first full CI at implementation head `6e5bf3f1df5689088efaeb7e635640a20277c092`
([run 40133576414](https://github.com/ieumbird/ieumdoc/actions/runs/40133576414)) passed quality,
Desktop/HTTP and browser shard 2/2, but shard 1/2 failed in cross-reference: its partial button-name
query also matched the new `Collapse folder cross-reference` control. The unchanged scenario
reproduced that strict-mode ambiguity locally. Scope its existing selection-toolbar action to
that toolbar with the exact accessible name; the same scenario then passes. No product code,
assertion/timeout or capture source changed. The failure remains historical evidence; the new
head requires its own full CI result, recorded in the PR.

### Sidebar entry capture evidence (#385)

Same-worktree real browser Before/After captures, with the sidebar expanded, Files selected and no menu/dialog open:

| State | 1440 × 812 | 375 × 812 (full-screen sidebar) |
| --- | --- | --- |
| No folder | [Before](assets/sidebar-open-folder-385/before-empty-1440.png) / [After](assets/sidebar-open-folder-385/after-empty-1440.png) | [Before](assets/sidebar-open-folder-385/before-empty-375.png) / [After](assets/sidebar-open-folder-385/after-empty-375.png) |
| One folder | [Before](assets/sidebar-open-folder-385/before-one-1440.png) / [After](assets/sidebar-open-folder-385/after-one-1440.png) | [Before](assets/sidebar-open-folder-385/before-one-375.png) / [After](assets/sidebar-open-folder-385/after-one-375.png) |
| Several folders | [Before](assets/sidebar-open-folder-385/before-several-1440.png) / [After](assets/sidebar-open-folder-385/after-several-1440.png) | [Before](assets/sidebar-open-folder-385/before-several-375.png) / [After](assets/sidebar-open-folder-385/after-several-375.png) |

Capture base HEAD: `359b7121e2b910998c89808b3c112c2d16490b06`. After images use that HEAD plus this PR's Sidebar/styles implementation; [capture metadata](assets/sidebar-open-folder-385/environment.json) identifies the exact source hashes and measured After environment. Both use the same checkout-owned Vite origin and persistent headless Windows Chrome profile; no second checkout or temporary profile. The runner's default DPR is 1 with no zoom override. After records measured DPR 1, visual viewport scale 1 and CSS zoom 1; Before used the same unmodified runner configuration. Scroll is 0, pointer at the right edge, focus blurred before capture. Bundled Pretendard fonts are checked by quiet-document's CDP glyph-font assertions; screenshots wait for `document.fonts.ready`.

Direct visual review: the header opener stays beside Collapse, the product name remains readable, and the empty panel loses its duplicate action. Folder headings/tree indentation retain their alignment. At phone width the same header controls remain inside the full-screen sidebar; at 1024px the 200px sidebar's controls remain reachable without overflow. The 28px target, 16px icon and 4px group gap reuse product tokens; no adjustable value was added.

Before implementation, the added folder-navigation check failed with `Sidebar header must always expose one Open folder entry with zero opened folders`. Its early exit also left later expected HTTP-error checks unreached. After implementation the zero/one/several header-position, per-folder Close-only menu, Open and focus checks pass. Related regressions and required CI are recorded in the PR; previous verification entries elsewhere in this document remain unchanged.

### Caret insertion verification (#439)

Verification: the extended browser scenario failed before implementation because `Insert citation…`
was absent. After implementation it checks Korean text in the middle of a sentence, literal slash
behavior, both forms' Escape/content/caret/focus restoration, single-step Undo/Redo and exact
Save → Reload content, Korean command search, availability on every listed inline surface and
refusal in code/non-caret selections. The existing command-center, layout-rules and quiet-document
scenarios also pass. Editor tests pass 281/281; repository typecheck, Editor build, docs and diff
checks pass. Build retains the existing externalized `punycode` and bundle-size warnings.

The review follow-up reproduces the form-button gap on head `9d8893b`: Tab from the
Citation key to Add, open the center, and assert both insert commands are disabled. Before
the focus-origin guard this fails because Insert citation remains enabled. The same browser
scenario now compares an allowed ordinary paragraph caret with a selected range in that
paragraph, independently of code restrictions. Allowed-surface checks also open and Escape
the real Citation form before continuing the existing slash insertion.

### Shortcut layout verification (#381)

At pre-fix `e2ee863`, the revised shell test failed on German zoom, and existing browser scenarios
failed with `German zoom shortcut was intercepted` and `Layout-specific key was intercepted by Link`.
The current scenarios cover literal US punctuation, Korean opaque IME keys/composition, German
minus/umlaut and shifted variants, and French characters/digit-4 apostrophe. The original immediate
search typing, modal blocking, shared labels/ARIA and prior-link-form focus regression are retained.

Headed installed Chrome 155.0.8059.85 and Edge 155.0.4283.62 were additionally sent layout-specific
CDP key/code/virtual-key tuples. Both an ordinary input and the actual Editor retained German Ctrl+-:
DPR 1 → 0.899999976 for `-`, `Process`, and `Unidentified` with Slash / VK 189, without opening the
center. After Ctrl+0 reset, literal and opaque US/Korean center/link cases opened their existing UI.
French apostrophe / digit-4 VK 52, including opaque variants, still activated browser tab 4 without
opening Link. German/French shifted or umlaut characters did not open the forms. These are protocol
reproductions against official layouts, not hardware/OS layout switching. No native UI was screen
automated. The same checkout-owned Chrome and fixed Edge profiles were reused and zoom reset.

#### Earlier two-key candidate audit (#381, historical physical-only implementation)

The following US-key probe and its recorded results predate the layout-safety fix above. They do
not establish safety on German/French layouts; the review follow-up supersedes that inference.

Each row below was sent with Playwright to an input in a **headed installed** Windows Chrome
155.0.8059.85 and Edge 155.0.4283.62, then to Electron 44.7.0 / Chromium 152.0.7977.130.
`received/cancelled` means exactly one trusted, cancelable keydown arrived with the expected physical
code, `preventDefault()` set `defaultPrevented`, input focus/value stayed unchanged and no browser
tab was added. Electron has a null application menu, so no menu accelerator claims these keys.

| Candidate (Ctrl; Cmd on macOS) | Chrome official / Windows probe | Edge official / Windows probe | Electron | Korean IME / physical key | Decision |
| --- | --- | --- | --- | --- | --- |
| / (Slash) | No listed default; received/cancelled | No listed default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | **Center**; shares the slash command cue |
| ' (Quote) | No listed default; received/cancelled | No listed default; received/cancelled | received/cancelled; no menu | Present beside Enter, no AltGr/Shift | **Link**; easy home-row key, no existing editor binding |
| ; (Semicolon) | No listed browser default; received/cancelled | No listed browser default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: macOS Cmd+; finds misspellings |
| \ (Backslash) | No listed default; received/cancelled | PDF fit mode; received/cancelled on HTML input | received/cancelled; no menu | Present; may have won-sign keycap | Reserve PDF behavior; clearer unused alternatives exist |
| [ (BracketLeft) | Cmd+[ is Back; Windows received/cancelled | PDF rotation, Cmd+[ Back; Windows received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: macOS browser navigation |
| ] (BracketRight) | Cmd+] is Forward; Windows received/cancelled | PDF rotation, Cmd+] Forward; Windows received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: macOS browser navigation |
| Grave accent (Backquote) | No listed browser default; received/cancelled | No listed browser default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: macOS window switching |
| , (Comma) | Cmd+, Settings; Windows received/cancelled | No listed default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: browser preferences / existing Subscript |
| . (Period) | No listed default; received/cancelled | No listed default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: existing Superscript |

Known reserved letter combinations (print P/Shift+P, address search K/E/L, new/close tabs N/T/W,
DevTools, Edge sidebar/Collections) are excluded using the official lists rather than opening native
UI. Ctrl+Alt variants are excluded for AltGr; Space variants are excluded for IME switching.
Two punctuation combinations pass, so additional Shift+letter/F-key bindings are unnecessary.

Reproduce the browser delivery audit from this checkout with
`pnpm exec tsx apps/editor/test/browser/shortcut-probe.ts chrome` and then `... msedge`.
The script closes its context in `finally` and writes raw event results to `tmp/shortcut-probe-*.json`.
Chrome reuses the runner's existing checkout hash profile; Edge reuses its one fixed `-edge` sibling.
`IEUMDOC_BROWSER_CHANNEL=msedge pnpm browser:test command-center link-authoring` reuses that same
Edge profile for product integration. Run channels sequentially, never with temporary profiles.

This proves page delivery/cancellation for protocol-injected keys in these installed Windows builds,
not hardware keyboard routing through every OS hook. No print/address/native UI was screen-automated.
macOS is a documentation-level review only; custom global hotkeys and nonstandard compact keyboard
layouts are outside this evidence. The full-width key/code cases are synthetic IME-state regressions,
not a claim that Playwright toggled the OS IME. Browser defaults remain supported by official lists,
with actual delivery/focus evidence for each punctuation candidate.

Before changing the bindings at `e60ef78`, the revised shell test failed on the new physical key;
`command-center` failed waiting for the Slash-opened input and `link-authoring` failed its shortcut
label assertion. After the change: Editor 277/277, Desktop 40/40 and typecheck/build passed;
Chrome `command-center`, `link-authoring`, `layout-rules`, `quiet-document` and Edge's two shortcut
scenarios passed. Electron passed center opening/typing and existing link-form Apply. The queued
previous-link-form focus regression and #386 immediate search/document focus assertions remain.

Same-worktree `quiet-document --screenshots`, 100% zoom / DPR 1, bundled font, same rest state:

| Viewport | Before (three modifiers) | After (two keys) |
| --- | --- | --- |
| 1440×1000 | [Before](assets/shortcuts-381/after-1440.png) | [After](assets/shortcuts-381/two-key-after-1440.png) |
| 375×1000 | [Before](assets/shortcuts-381/after-375.png) | [After](assets/shortcuts-381/two-key-after-375.png) |

The existing shortcut chip is shorter; control placement, document typography and responsive rules
are retained. The earlier verification record below is historical and is not rewritten as new proof.

#### Earlier three-modifier verification and captures (#381, historical)

Windows Chrome 155.0.8059.85 passed `command-center`, `link-authoring`, `layout-rules` and
`quiet-document`; Edge 155.0.4283.62 passed the two shortcut scenarios using the same checkout-owned
persistent profile sequentially. These exercise actual renderer keyboard dispatch, Korean key values
with physical codes, composition exclusion, tooltips/ARIA, modal blocking and real file Save → Reload.
Printing is checked by uncancelled `Ctrl+P` / `Ctrl+Shift+P` events with no center opening.
Electron 44.7.0 (Chromium 152.0.7977.130) staged-app smoke passed center opening/typing, link opening/Apply
and a null application menu. Desktop tests passed 40/40; Editor tests passed 277/277.

Native browser chrome (including the actual print window and address bar) is **not verified**:
Computer Use stopped because it could not determine the browser URL confidently enough for policy.
No native key was sent after that stop. Runtime integration success and official default-shortcut
lists are separate evidence; this record does not claim a completed native browser/OS collision audit.
Initial headed Chrome and the first CI run exposed a link-form focus timeout after Remove: a queued
Tiptap `focus()` could blur the next form. A regression holds only frames queued by Remove and
releases them after opening the next form; it failed before the fix and passes with synchronous
ProseMirror focus return on Apply/Remove/Escape. The exploratory headed layout scenario also
observed a 15px native-scrollbar difference; the standard runner passes unchanged assertions.
No browser-runner or command-center focus-policy change is introduced by #381. The full CI also
exposed a platform-label test isolation race: a recorded deletion offered recovery after Reload and
covered Settings. Waiting for an actual deletion record reproduced it locally. The cross-reference
scenario now Saves its scratch edits and observes removal of that path's recovery record before the
platform-only Reload; product recovery behavior and existing assertions are unchanged.

Same-path `quiet-document --screenshots` product comparison at base `c587663` and #381 implementation,
Windows Chrome, DPR 1 / 100% zoom, bundled Pretendard, scroll top, equivalent rest state:

| Viewport | Before | After |
| --- | --- | --- |
| 1440×1000 | [Before](assets/shortcuts-381/before-1440.png) | [After](assets/shortcuts-381/after-1440.png) |
| 375×1000 | [Before](assets/shortcuts-381/before-375.png) | [After](assets/shortcuts-381/after-375.png) |

The base product files were temporarily restored and the implementation reapplied in the same
worktree; no other checkout or Chrome profile was created. Only the existing shortcut chip/tooltip
text changes. Document layout and control positions retain the Visual Language rules.

### Command center verification (#363)

Clean-base captures were taken at `4b55e5506ea85a3ef4bc1c99f92c2e5b7f18e710` before product
edits. The same `quiet-document` fixture, 100% zoom, loaded fonts/images and scroll-top state
were captured after implementation. The 768px header now uses two rows; document typography and
horizontal geometry remain unchanged. New-center captures show real opened documents, not a mockup.

| State | Before | After | Viewport |
| --- | --- | --- | --- |
| Quiet Document, wide | [Before](assets/command-center-363/before-1440.png) | [After](assets/command-center-363/after-1440.png) | 1440×1000 |
| Quiet Document, narrow | [Before](assets/command-center-363/before-768.png) | [After](assets/command-center-363/after-768.png) | 768×1000 |
| Center search | — | [Opened documents and commands](assets/command-center-363/search-1440.png) | 1440×900 |
| Phone | — | [Entry](assets/command-center-363/center-375.png), [Korean command search](assets/command-center-363/search-ko-375.png) | 375×900 |

`command-center` checks no-document/disabled/no-match states, cancel preserving the editor and
selection, command-only shortcut, IME and Save shortcut ownership, modal focus handoff, dirty tab
and property-draft retention, Undo/Redo, real Save/Reload, pending-Save restrictions, view switching,
equal filenames, Korean/English search and 1440/1024/768/375px bounds. Existing `editor-shell`,
`document-tabs`, `ui-language`, `layout-rules` and `quiet-document` also passed. Editor tests
(272), typecheck/build, documentation and whitespace checks passed. No Core/CLI semantics changed.

### Command center keyboard verification (#386)

At base `a61dff5b32b6c6d36b8c8d225539700b07789589`, on Windows Chrome in the same worktree,
Ctrl+P followed immediately by typing `technical` lost its first character to the editor in 3 of
12 attempts. The Dialog schedules initial focus on the next animation frame; mounting the search
input with autofocus closes that gap while retaining the Dialog's focus/dismissal handling.
Document selection focused the tab button, so immediate typing failed for both retained and newly
opened tabs, including selecting the active tab again. Selection now activates the tab together with
dismissal and supplies its existing editor focus target to the Dialog's final-focus handling.

The first-Down and missing-hover reports were not reproduced: ten search attempts covered direct
typing (`> o`, `> s`, `technical`), fill, replacing a query and searching after no matches. Down moved
to the next result. Seven pointer attempts moved the same active highlight and showed the existing
selected surface. No navigation, hover, style, search-scope or shortcut-mapping change was made.

The existing `command-center` scenario failed before the fix for immediate search typing and both
document focus cases. It now sends real keyboard input while delaying the next animation frame,
checks both opening shortcuts, first Down, hover appearance/shared active item, arrows after hover,
and immediate typing/Undo after retained/newly opened/active-tab selection. Source view, editor
state/history/property drafts, cancellation, panel hiding and command/modal focus handoff remain
covered. A repeat of the unthrottled typing probe passed all 12 attempts after the fix. Related
`editor-shell`, `document-tabs`, `ui-language`, `layout-rules` and `quiet-document` checks also passed.
No Core operation or CLI command is needed for these Editor-only focus interactions.

### Listed document search verification (#384)

The extended `command-center` scenario failed against base `144e34af8ec75c1d14fad045f76440d8da72aead`
before product edits: `Sidebar-listed unopened document missing from search`. Actual Windows Chrome
[before](assets/command-center-384/before.png) / [after](assets/command-center-384/after.png) captures
show the same `technical` query, opened `technical-1.md`, listed scratch folder and 1280×720 viewport
(default DPR/100% zoom, bundled Pretendard). Both came from this same worktree and its existing
persistent browser profile; no extra checkout or temporary Chrome profile was used.

The scenario now checks tab/file distinction and ordering without result truncation, no Host request
while searching, unloaded-child exclusion, collapsed-child inclusion, overlapping-root and tab-path
deduplication, image/other-file exclusion, immediate typing/Undo after opening a file, retained dirty
work, busy restrictions and the real non-native refusal with unchanged active document. The existing
#386 immediate search/tab-focus and Source/IME/modal/history/draft checks remain. New-editor focus
runs after Tiptap's Strict Mode DOM reattachment in a cancellable microtask; the browser check adds
no focus polling or reload before typing. The visual change reuses the existing result layout,
selected surface and sidebar subtle-text/crossed-file treatment; no adjustable value is introduced.

### Listed search review follow-up (#384)

The existing scenario failed on reviewed head `4fdb5bc8ffc8f91403d58a84c4ba50ab934b497f`
with `Disconnected child cache remained searchable after parent relisting`. It now expands/collapses
`alpha`, removes that entry from the next parent response, verifies the sidebar and search omit it,
then restores the parent entry and verifies its preserved collapsed listing is searchable again.
The folder-tree reducer/cache lifecycle is unchanged; search reuses `knownFolders` for reachability.

Performance measurements used 2,000 synthetic native document entries in one existing scratch folder,
one initial document tab, collapsed sidebar, 1280×720, the same worktree/persistent Windows headless
Chrome/Vite development setup and no CPU throttling. Three trials measured Control+P and real `b`,
`u`, `l` key presses through two subsequent animation frames; unique search used `fill('bulk-1999')`.
These are local end-to-end observations including Playwright overhead, not production benchmarks or
fixed timing gates. The after run includes #397 on `cda1397` (subsequent changes add tests/evidence).

| Measurement | Reviewed implementation | After follow-up |
| --- | --- | --- |
| Open, three trials (ms) | 1387 / 1085 / 1031 | 333 / 256 / 204 |
| Real b/u/l input, nine key presses (ms) | 395–831 | 35–72 |
| Unique search, three trials (ms) | 204 / 171 / 168 | 64 / 53 / 55 |
| Chrome CPU samples with React render/commit frames, extra open + b/u/l run | about 1926 ms | about 188 ms |
| Samples within filter / App, same profile | about 6 / 12 ms | about 6 / 15 ms |

The sampling profile identified result rendering/commit as the main input bottleneck, rather than
text matching. The source also regenerated all file candidates during closed-center App renders.
Open-only memoized collection/sorting removes that unnecessary work; the 50-row page bounds rendering
without limiting full-scope filtering or making late results unreachable. The sampled totals are
stack categories, not isolated component timings; idle/native/other work is not listed above.
The [before](assets/command-center-384/profile-before.json) and
[after](assets/command-center-384/profile-after.json) summaries retain all trial values and top samples.

The existing `command-center` scenario now also supplies the synthetic 2,000-entry listing, checks
visible range/total, real Tab/Enter previous/next access and within-page arrows, no Host requests,
query narrowing to the final document, actual open and immediate editor typing/Undo. Only that last
target is a real scratch file; there is no 2,000-file fixture or timing assertion. Existing restored-tab
checks in `document-tabs` also verify one `Opened tab` result per restored path. Actual pagination at
[1280px](assets/command-center-384/paged-1280.png) and [375px](assets/command-center-384/paged-375.png)
uses existing footer typography/spacing, shared Button controls and tokens, with no new adjustable value.

### Listed search result-limit follow-up (#384)

After the review approved `5dfb690`, the integration owner selected a simpler presentation: the first
50 matches, a full count at every size, and explicit narrowing guidance above 50, without page controls.
The current [listed-search contract](#listed-document-search-384) supersedes the pagination behavior
recorded in the preceding verification; those earlier measurements and captures remain historical evidence.
Reachability, open-only/tree-state memoization, full-source matching and result order are unchanged.

The existing 2,000-entry browser check now verifies the first/last displayed paths, the 50-row bound,
real ArrowDown access to the 50th match and existing wrap/stay behavior at that boundary. It checks
the overflow guidance, counts of 10/0/1 after query changes, and the same mounted polite/atomic live
status throughout. Korean command search also checks its translated count. Narrowing to the final
file still opens it with immediate editor typing/Undo, with no Host request during search. These are
DOM/keyboard accessibility checks, not a claim of manual screen-reader verification.

The same three-trial probe and 2,000-document fixture described above ran after merging #402. The
worktree, persistent Chrome profile, 1280×720 viewport, collapsed sidebar, one initial tab and no CPU
throttling were retained. The current worktree's Vite server used port 5174 because another worktree
already owned 5173; its `/api/document` path was checked before measurement.

| Measurement | First-50 presentation |
| --- | --- |
| Open, three trials (ms) | 348 / 325 / 278 |
| Real b/u/l input, nine key presses (ms) | 52–89 |
| Unique search, three trials (ms) | 66 / 59 / 67 |
| React render/commit CPU samples, extra open + b/u/l run | about 371 ms |
| Filter / App samples, same profile | about 8 / 17 ms |

The [raw summary](assets/command-center-384/profile-limited.json) retains each value and sampled
stacks. This local development observation includes Playwright overhead and has no timing threshold;
it does not claim a speed improvement over the earlier bounded pagination run. Actual first-50
captures at [1280px](assets/command-center-384/limited-1280.png) and
[375px](assets/command-center-384/limited-375.png) retain the same query/first selection as the earlier
paged captures, with existing footer typography/spacing and no new adjustable style value.

### Curated shortcut guide (#496)

The owner corrected #485's complete-list requirement: keep useful editing commands concise,
reuse existing bindings/platform labels and a wide Dialog, and replace exhaustive omission
coverage with displayed-binding validity plus curated-command presence. Scope is help content,
presentation, translations and existing tests; no new shortcuts or Core/CLI semantics.

Before changing product code, the extended `command-center` assertions failed on base
`6352fa661b5e4583db75597e70c146cd4e815646`: English/Korean 1440px rows wrapped (including
Redo and heading/list entries) and the Russian-layout alias appeared in both languages at
1440/375px. The existing phone overflow assertion already passed; it remains protected.
After the change, `command-center --screenshots` passes: English entries stay one line at
1280/1440px, Korean entries at 1440px, the alias is absent, and both languages fit at 375px.
Every row is measured against its label's single-line height, without a fixed row count.
Editor tests (290), workspace typecheck, Editor build, docs/whitespace checks and the existing
`layout-rules quiet-document` browser regressions also pass. Windows/macOS keymap
validity and shared labels are unit checks; no native macOS keyboard run is claimed.

Manual visual review only: same worktree/server (`127.0.0.1:5206`), installed Chrome with
the checkout-owned persistent profile, DPR 1, 100% zoom and bundled Pretendard. Each pair
uses the same document, language, viewport, guide scroll 0 and keyboard-focused Close control.
The 1440px guide widens from the default 384px to the existing 672px Folder dialog token;
labels and multiple key hints now share a row. At 375px the 343px popup retains its viewport
inset, shows the shorter list and keeps Close reachable. Surface, font, spacing and focus
treatment follow [Visual Language](editor-visual-language-v1.md); capture procedure follows [Visual change review](../test/README.md#reviewing-a-visual-change).
Captures are review evidence, not screenshot-based automated assertions.

| Language / viewport | Before | After |
| --- | --- | --- |
| English, 1440×900 | [Before](assets/shortcut-guide-496/before-en-1440.png) | [After](assets/shortcut-guide-496/after-en-1440.png) |
| English, 375×900 | [Before](assets/shortcut-guide-496/before-en-375.png) | [After](assets/shortcut-guide-496/after-en-375.png) |
| Korean, 1440×900 | [Before](assets/shortcut-guide-496/before-ko-1440.png) | [After](assets/shortcut-guide-496/after-ko-1440.png) |
| Korean, 375×900 | [Before](assets/shortcut-guide-496/before-ko-375.png) | [After](assets/shortcut-guide-496/after-ko-375.png) |

### Shortcut guide verification (#471)

The extended `command-center` scenario failed against the baseline with `Undo command and
Keyboard shortcuts entry are missing`. The shared-label unit assertion also failed with
`bold tooltip must read the shared label` when run against the baseline toolbar. Both pass
with this change. The browser scenario verifies exact one-step Undo/Redo, active-tab targeting,
disabled empty/busy/Source history, shortcut hints, read-only guide content (including Shift+Enter),
Escape/Close/outside dismissal and focus restoration to the editor or original focused control.
It also measures English and Korean guide overflow at phone width without depending on screenshots.

Local checks: Editor suite (287 tests), workspace typecheck, Editor build, documentation/whitespace
checks, and `pnpm browser:test command-center --screenshots`, `layout-rules quiet-document`,
and `quiet-document --screenshots` passed. Build retains the existing punycode externalization and
large-chunk warnings. Desktop packaging and other-platform coverage are left to required CI;
macOS labels are unit-checked, without claiming a native macOS keyboard run.

Captures use this worktree's server at `http://127.0.0.1:5199`, Windows installed Chrome and its
checkout-owned persistent profile, DPR 1, 100% zoom and bundled Pretendard. The baseline is
`c2329159016cdae6183885bd24de2bd8a8046e1e`; After uses the same base with this PR's changes.
Quiet Document is at rest after fonts/images load, with the same scroll position. History uses
the same original document, text/formatting history and `> Undo` query at 1280×720. Initial runs
that reused another worktree's server on 5173 are excluded from this evidence.

| State | Before | After / new guide | Viewport |
| --- | --- | --- | --- |
| History command | [Before](assets/shortcut-guide-471/history-before.png) | [After](assets/shortcut-guide-471/history-after.png) | 1280×720 |
| Quiet Document at rest | [Before](assets/shortcut-guide-471/quiet-before.png) | [After](assets/shortcut-guide-471/quiet-after.png) | 1440×1000 |
| Shortcut guide, English | — | [Desktop](assets/shortcut-guide-471/guide-1440.png) / [Phone](assets/shortcut-guide-471/guide-375.png) | 1440×900 / 375×900 |
| Shortcut guide, Korean | — | [Phone](assets/shortcut-guide-471/guide-ko-375.png) | 375×900 |

Visual inspection confirms grouped, readable entries and accessible Close controls inside the viewport.
The existing modal surface, spacing, type and key-label treatment are retained, with no new CSS token.

#### Review follow-up: history parity

After merging master `d3cfd58` (#481), the new command-center comparison failed with
`command Undo lost the input-rule space: ##The converter…`. It compares keyboard and command
Undo on identical file state after a real `## ` input-rule conversion, then compares Redo after
a native history Undo, including document, selection, availability and immediate editor focus.
The corrected `command-center` and existing `markdown-input` (opaque-IME input-rule Undo) scenarios
pass. `continuous-editing` initially stopped at an unrelated ambiguous Equation Apply locator,
before reaching its history probes; its next unchanged run passed, including the #481 history probes.

#### Review follow-up: complete keymap audit (historical, superseded by #496)

The following records #485's earlier full inventory and omission test. The curated contract
above replaces that display requirement; registered key behavior remains unchanged.

The omission check failed against the earlier guide with `Undocumented Windows bindings`, including
the list toggles, code toggle, document end and the other previously unlisted editing keys. It now
compares the guide against registered keymaps for both `Win32` and `MacIntel`, restoring the platform
after each test. No keymap is added or overridden to make the guide match.

| Audited source | Existing bindings represented in the guide |
| --- | --- |
| Tiptap Core `Keymap` | Enter/Mod+Enter, selection, deletion/join aliases and macOS Ctrl/Option aliases |
| Enabled StarterKit marks, hard break and history | Bold/Italic case aliases, strike, hard breaks, Undo/Redo including Russian-layout aliases |
| Explicit Code/Subscript/Superscript/List extensions | Inline formatting, list toggles, list indentation/split/delete, code toggle/indent/newline/boundary exit |
| `document-interaction.ts` | Clipboard admission, heading/table Tab, Enter, deletion, document end and final-block navigation; opaque IME uses the same matcher and history dispatch |
| `document-title.tsx`, `markdown-input-rules.ts`, `DocumentEditor.tsx` | Metadata title input/history, input-rule Undo precedence, selection-toolbar Tab, slash menu and link shortcut |
| Shell, selection/property/citation forms and shared dialogs | Navigation, completion, activation, tab close, cancellation and focus return in their existing contexts |

The macOS extra document-end key is Cmd+ArrowDown; Cmd+End remains listed because it is also
registered. Core's literal Ctrl+H/D/A/E and Option deletion aliases are not relabeled as Cmd.
Disabled StarterKit blockquote/heading/horizontal-rule/underline extensions contribute no guide
entries. Native browser text navigation is retained; the guide's clipboard entries describe the
existing real clipboard paths rather than registering new browser shortcuts.

Local follow-up verification: Editor tests 288 passed; shell tests 29 passed after the final audit
check; workspace typecheck, Editor build, docs and whitespace checks passed. The final sequential
browser runs passed `command-center --screenshots` and `layout-rules quiet-document continuous-editing
markdown-input`, using this worktree's 5199 server and its existing persistent Chrome profile.
The initial Equation Apply locator failure above did not require a test or product change.

The expanded guide remains in the same viewport-bounded shared Dialog and scrolls to its lower
groups. New assertions scroll to and verify list/code/document-end hints and reach the final
navigation entry at 1440px and 375px without horizontal overflow. These review captures retain
the existing Windows/Chrome/DPR/font/zoom environment, on merge `edf169a` plus the review fixes;
the initial captures above remain historical evidence of the first implementation.

| Expanded guide state | 1440×900 | 375×900 |
| --- | --- | --- |
| English, top | [Desktop](assets/shortcut-guide-471/guide-complete-1440.png) | [Phone](assets/shortcut-guide-471/guide-complete-375.png) |
| English, scrolled to code/navigation | [Desktop](assets/shortcut-guide-471/guide-complete-code-1440.png) | [Phone](assets/shortcut-guide-471/guide-complete-code-375.png) |
| Korean, top | — | [Phone](assets/shortcut-guide-471/guide-complete-ko-375.png) |

#### Integration with Source wrapping and table-deletion notices

Master `9dfd724` (#483/#486) was merged after review approval of `2cb2409`. Both Source wrapping
and shortcut-guide verification histories are preserved. The shared Korean `Undo` key uses master's
`되돌리기`; the command-center `실행 취소` search alias remains. The notice keeps its doc-identity
guarded native history Undo, while command history retains the shared keyboard dispatch.

Editor tests (289), workspace typecheck, Editor build and documentation/whitespace checks passed.
The requested single local `command-center table-authoring` browser run passed command-center;
the added table integration check initially failed because it incorrectly required every notice
to disappear after Redo. Its trace showed one remaining table, editor focus and one notice.
The reference-deletion handler explains that ordinary warning: Redo deletes a referenced table.
The corrected assertion checks that the stale table-deletion Undo action is absent **and** the
reference warning remains. This correction is verified by the required CI, without another local
browser run. All existing table-notice cases and the new command Undo restoration passed locally.

### Source wrapping (#476)

Source soft wrapping is a CSS-only presentation change. The existing source-line spans, literal
newlines and generated gutter numbers remain; no Core/CLI semantic operation is needed.
`pre-wrap` preserves source whitespace, `overflow-wrap: anywhere` wraps unbroken text, and the
existing gutter width is reserved outside the wrapping text. Numbers remain on each source
line's first row. There is no clipping or document write.

Same-state captures use base `c232915` in this worktree at 1440×900 and 375×900, on the same
checkout-owned persistent headless Windows Chrome profile and Vite origin (`127.0.0.1:5177`).
Both show clean `wrapping.md` in Source, scroll top, no selection/focus, pointer at the top right,
after `document.fonts.ready`. DPR, visual viewport scale and CSS zoom are 1. Source retains its
existing Consolas / Courier New / monospace stack, 14px/20px; the shell retains bundled Pretendard.
After uses the base plus this CSS change; [Before evidence](assets/source-wrap-476/before.json)
and [After results](assets/source-wrap-476/after.json) record the measurements and source hashes.

| Viewport | Before | After | Source scrollWidth / clientWidth, Before → After |
| --- | --- | --- | --- |
| 1440×900 | [Before](assets/source-wrap-476/before-1440.png) | [After](assets/source-wrap-476/after-1440.png) | 5160 / 800 → 800 / 800 |
| 375×900 | [Before](assets/source-wrap-476/before-375.png) | [After](assets/source-wrap-476/after-375.png) | 5131 / 311 → 311 / 311 |

Direct visual review: the paragraph and unbroken URL now continue vertically within the paper.
The first and continuation rows share the original text axis, leaving the number gutter clear;
the next source line receives the next number. The phone view uses normal vertical scrolling.
Controls, monospace typography, paper and document insets retain their previous appearance.
Captures are manual-review evidence only.
The unchanged Visual view's Quiet Document 1440px rest captures are byte-identical:
[Before](assets/source-wrap-476/quiet-before-1440.png) /
[After](assets/source-wrap-476/quiet-after-1440.png).

The extended `source-view` assertions fail with the original CSS at both widths, then pass after
the change. There are still 13 source lines; the paragraph occupies 6/16 visual rows and the URL
7/19 rows at 1440/375px. Whole-source DOM text, native selection and native clipboard preserve the
same source characters and indentation with no numbered text or inserted wrap newlines.
Chromium's existing native selection/Copy omission of the terminal newline is unchanged.
Disk contents and clean status remain unchanged. Existing canonical Source/Save/Reload,
unapplied drafts and Visual history checks also pass.

Editor tests (286/286), workspace typecheck, Editor build, visual-token and documentation checks
pass, alongside `source-view`, `source-view-pending`, `layout-rules` and `quiet-document`.
The build retains its existing large-chunk advisory. The existing 2000/5000-block
[performance fixture and measurement](../reviews/editor-input-performance-2026-10-25.md)
measure typing/Save rather than Source rendering; this change adds no Source timing gate or
performance claim.

## Outline docking verification #552

The docking boundary is 89rem (1424px): 240px Sidebar + 256px Outline + 928px Standard
column. At 1280–1423px the Outline starts closed and opens as an overlay. Explicit docked
open/closed choices survive resizing in page memory; entering overlay closes it without
replacing that choice. Reload restores the default. This is Editor interaction only;
Core/CLI semantics and persistent preferences do not change.

`layout-rules` measures the boundary with the Sidebar expanded and collapsed: the Standard
column remains 928px at 1279/1280/1423/1424/1440px and the TopBar stays 48px at
1280/1423/1424px. At #552 it checked docked closure from both Hide outline and the TopBar toggle (the internal button was removed in #590; current coverage uses the TopBar toggle),
explicit reopening, overlay dismissal, return to docked, and reload default restoration.
`outline` retains docked keyboard/navigation coverage at 1440px; `command-center` retains
Show/Hide outline and focus coverage. The endnote Outline-exclusion check explicitly opens
and closes the 1280px overlay. `quiet-document --screenshots` retains typography,
editing and visual checks with its Outline isolation explicitly above the docking boundary.
The initial outline/quiet-document failures assumed a default-open Outline at 1280px;
artifacts showed loaded documents and no console errors. Their setup now uses 1440px,
without removing their Outline assertions. CI also exposed a Command Center setup race:
after resizing into docked layout, the test now waits for its default-open panel rather
than conditionally toggling while the media-query update is pending.

Same-state captures below use the real Windows installed Chrome persistent profile,
English UI with mixed Korean/English fixture text, bundled Pretendard (font assertions pass),
100% browser zoom, DPR 1, viewport height 1000px, expanded Sidebar with no open folder,
Standard column, scroll at top, and the same selected Equation with no pointer hover.
Before product source: `ff37a32e273dfad90bde84a9c30e2a28ec5e3af3`; After: this PR's source.
Only representative PNG pairs are retained; generated traces, full captures and logs stay in `tmp/`.
Manual comparison confirms the wider text at 1280px, single-row header and closed Outline
below 1424px, and the preserved Standard column with docked Outline at 1424px.

| Viewport | Before | After |
| --- | --- | --- |
| 1280 × 1000 | [Before](assets/toc-docking-552/before-1280.png) | [After](assets/toc-docking-552/after-1280.png) |
| 1423 × 1000 | [Before](assets/toc-docking-552/before-1423.png) | [After](assets/toc-docking-552/after-1423.png) |
| 1424 × 1000 | [Before](assets/toc-docking-552/before-1424.png) | [After](assets/toc-docking-552/after-1424.png) |

## Outline toggle only #590

The internal Hide outline button is removed. The TopBar Outline toggle remains the panel's
open/close control; overlay Escape still closes it and returns focus to that toggle.
Command Center Show/Hide outline commands remain available. Title, list navigation, docking,
page-memory choices and reload defaults are unchanged. This is Editor interaction only;
Core/CLI operations are not applicable. The Sidebar Collapse sidebar button is unchanged.

Verification: Editor tests (297), typecheck, Editor build, docs check and the `layout-rules`,
`outline`, `command-center` browser scenarios passed. The existing layout scenario now uses
the TopBar toggle for docked closure and overlay dismissal, retaining resize/choice/reload
assertions, overlay Escape focus return, and a 48px vertically centered Outline header check.
Outline list focus-exit tracking and command dismissal from a focused heading remain covered.
The new button-absence unit assertion failed against the original implementation first.

Same-state captures: Windows installed Chrome, checkout-owned persistent profile, English UI,
bundled Pretendard, DPR 1, 100% zoom, 900px viewport height, Standard document width,
quiet-document fixture at scroll top, Outline open, pointer outside the document. Sidebar is
expanded at 1440px and closed at 390px. Before source: `1cd199cda9b70318586a6264cadc7044a4b8e57e`;
After: this PR. Manual comparison confirms the close button alone disappears and the title,
list and document geometry remain in place. Generated traces/logs stay in `tmp/outline-590`.

| Viewport | Before | After |
| --- | --- | --- |
| 1440 × 900 | [Before](assets/outline-toggle-590/before-1440.png) | [After](assets/outline-toggle-590/after-1440.png) |
| 390 × 900 | [Before](assets/outline-toggle-590/before-390.png) | [After](assets/outline-toggle-590/after-390.png) |


## Figure image filename (#652)

The Figure properties popover places File name (without extension) in collapsed Advanced, using
the existing shared Input and inline error surface. The explicit Rename action performs the Host
operation; Done/outside completion applies ordinary properties without renaming. Filename drafts
and errors reopen Advanced. See [Figure properties](figure-authoring-v1.md#anchored-figure-properties-757). It reuses the #504 Host rename,
other-document protection and notices. Eligibility and failure behavior are specified in
[Figure file name](document-editing-v1.md#figure-file-name-652); history and checkpoints in
[Figure-form image rename](editing-session-save-v1.md#figure-form-image-rename-652).
The Host chooses readable upload defaults without an extra paste dialog: drop retains even
`image.png`, while paste uses document numbering for unnamed/generic images and retains real
descriptive file names. No CLI surface is added because no new semantic operation is introduced.


### Filename form verification (#652)

Host unit tests cover sanitized hints, generic-name classification, MIME suffixes, Korean,
sequence gaps/collisions, Unicode rejection and signed rollback after rename. The existing
`image-assets` browser scenario covers native clipboard names, original drop names, rename
refusal without partial properties, saved and just-pasted Figure rename, immediate Undo/Redo
paths, and Save/Reload. The engine regression separately covers deletion history and a new
attachment reusing an old filename. The 1440px/640px captures below use the same technical
sample, local SVG and open properties state; the new field uses existing control geometry.

| Viewport | Before | After |
| --- | --- | --- |
| 1440 x 900 | [Before](assets/image-names-652/before-1440.png) | [After](assets/image-names-652/after-1440.png) |
| 640 x 900 | [Before](assets/image-names-652/before-640.png) | [After](assets/image-names-652/after-640.png) |

Local verification: Editor unit suite (320 passed), final history/block-command regressions
(36 passed), Host image/file tests (43 passed), workspace typecheck, Editor/CLI production
builds and docs checks passed. Persistent Chrome `image-assets`, `figure-authoring`,
`file-actions`, `layout-rules`, `quiet-document` and production `http-host` (including process
crash recovery) passed. Packaged Desktop and Edge are left to CI. The packaged Desktop asset
assertion now expects its supplied `paste.png` hint. A transient Vite ResizeObserver notification
was logged on the last image-assets run; its console/behavior assertions passed.


Review follow-up (#654): the existing image-assets scenario now saves an equivalent Image
spelling before rename and checks immediate Undo/Redo paths plus actual Host 200 responses.
It opens two Figure forms together, retains Alt/Label drafts while following untouched Image
paths, and separately preserves an explicitly edited Image draft. Generic `image.png` drop
keeps its stem while native clipboard paste keeps document numbering. Host tests cover source
validation and inode-confirmed historical spellings, including remote/out-of-scope non-matches.
The same browser scenario observes the actual post-rename recovery record, reloads, uses Restore
work, checks all image paths against real files, and completes Save/Reload with the same applied
content. The review's non-blocking record-disappearance observation was not reproduced in this
flow; no separate recovery defect or cause is asserted. Existing recovery browser regressions
also pass. Local follow-up: targeted unit tests 79, Editor unit tests 320, workspace typecheck,
Editor/CLI build, docs checks and Vite image-assets/figure-authoring/file-actions/recovery pass.

## Desktop log folder (#712)

Desktop Settings → About & updates also offers **Open log folder** / **로그 폴더 열기**
(#712), using the existing small secondary button. It disables during the request and
shows a localized failure notice on error. This control is absent from HTTP Host and
Vite; the [Desktop diagnostic contract](desktop-distribution-v1.md#log-folder-and-process-diagnostics-712)
owns its fixed path, IPC and logging behavior.

## Settings document entry removal (#669)

Settings no longer offers Open document settings. Its navigation footer retains the
per-document explanation without an empty control container. The document's own
inline disclosure and Command center entry remain available; this shell-only change
adds no Core operation or CLI command.

Same-state captures use installed Windows Chrome with the checkout-owned persistent
profile, English UI, Dark theme, Paper style, DPR 1, 100% zoom and a 900px viewport
height. The Desktop bridge is the existing browser-test stand-in; no installed-app
settings or PATH are changed. Before source: `23d178a3c4d19a20cda28991cdb9b911e451a7c8`.
Manual comparison confirms the footer still contains its explanation at 1440px, and
at 640px the content moves upward into the space released by the removed button.

| Viewport | Before | After |
| --- | --- | --- |
| 1440 x 900 | [Before](assets/settings-doc-link-669/before-1440.png) | [After](assets/settings-doc-link-669/after-1440.png) |
| 640 x 900 | [Before](assets/settings-doc-link-669/before-640.png) | [After](assets/settings-doc-link-669/after-640.png) |

The existing `desktop-updates` scenario checks entry absence, full-screen bounds,
category access, overflow and reachable controls in both languages at both widths.
Its document-settings checks now use Command center and retain disclosure focus,
resize and Escape coverage. `ui-language` uses the inline disclosure after leaving
Settings while preserving its draft/history checks.


## Collapsed rail Files and Settings (#671)

The owner decision is recorded in [#671](https://github.com/ieumbird/ieumdoc/issues/671).
The 48px rail keeps Files on the document-tab row and Settings at the expanded
footer's vertical position. The same Settings entry has a text or icon-only variant,
so a later #665 indicator can apply to both; no update indicator is implemented here.
The title strip, caption reservation and drag areas from #647 remain unchanged.
This is shell interaction only; no Core semantic operation or CLI command is needed.

Before/After uses master `c8debf3fb9a6a0ab8ceb16e6dd19bf3eecf677da` and this change in the same
checkout, Vite origin (`127.0.0.1:5319`) and checkout-owned persistent Windows Chrome
profile through `pnpm browser:test`. English, technical-document fixture, no opened
folder, collapsed Files, 900px height, DPR 1, 100% zoom, bundled Pretendard and scroll 0.
Desktop is a renderer bridge mock with a representative 138px caption reservation;
native dragging and packaged Desktop are left to existing CI/manual checks.
Captures are manual review evidence, separate from browser assertions.

| Host / theme | 1440px Before / After | 640px Before / After |
| --- | --- | --- |
| browser / light | [Before](assets/rail-671/before-browser-1440-light.png) / [After](assets/rail-671/after-browser-1440-light.png) | [Before](assets/rail-671/before-browser-640-light.png) / [After](assets/rail-671/after-browser-640-light.png) |
| browser / dark | [Before](assets/rail-671/before-browser-1440-dark.png) / [After](assets/rail-671/after-browser-1440-dark.png) | [Before](assets/rail-671/before-browser-640-dark.png) / [After](assets/rail-671/after-browser-640-dark.png) |
| desktop / light | [Before](assets/rail-671/before-desktop-1440-light.png) / [After](assets/rail-671/after-desktop-1440-light.png) | [Before](assets/rail-671/before-desktop-640-light.png) / [After](assets/rail-671/after-desktop-640-light.png) |
| desktop / dark | [Before](assets/rail-671/before-desktop-1440-dark.png) / [After](assets/rail-671/after-desktop-1440-dark.png) | [Before](assets/rail-671/before-desktop-640-dark.png) / [After](assets/rail-671/after-desktop-640-dark.png) |

Verification for #671: Editor unit tests (324), typecheck, Editor production build,
docs and whitespace checks pass. Existing editor-shell checks rail keyboard order,
Settings dismissal focus and Files activation; desktop-updates measures the same
footer position in both states, bounded targets and no-drag alongside the unchanged
#647 header matrix, and opens Desktop Settings from the collapsed rail with Back/Escape
focus return. The layout-rules, quiet-document and command-center scenarios retain
their existing geometry, visual and command/focus protection. Across all eight
Before/After pairs, pixel differences are confined to the rail (x=17–30); document,
title strip and right panel pixels are identical.


## Localized feature samples (#528)

Desktop and the development Editor offer **Open sample document** on the start screen and in
Command center. The command is also available with a document open, uses the current UI language
at dispatch time and preserves existing tabs through ordinary Open. Korean and English notes have
the same structure and supported features: heading numbering and section references, formatted
inline content, links and math, nested bullet/ordered lists, code, quote and admonitions, a labeled
captioned table, numbered equation, asset image and Mermaid Figure, references with authored
templates, endnote, citation and a local BibTeX bibliography. Most content is a worked, illustrative
48 V converter current-loop design note, with explicit separation between assumptions and tests.
The reference book's bibliographic data is verified against its
[publisher record](https://link.springer.com/book/10.1007/978-3-030-43881-4).

When sample preparation fails, the Host omits sample paths and reports a sample problem alongside
the ordinary startup response. The Editor keeps opening the argument/restored document or shows
the ordinary start screen, with a standing translated warning. A folder conflict explicitly says
the existing folder was kept. No sample command or start action is shown for an unavailable sample;
this is separate from document Open admission and does not show a native-document refusal Alert.

The Host supplies writable copies; [sample distribution](desktop-distribution-v1.md#native-sample)
defines version replacement. HTTP Host omits the sample command and start offer. Changing UI
language affects the next selection, not an open document's content or editor state.

Manual capture review uses the existing `command-center --screenshots` path at 1440×900 and
640×900 with both languages, the checkout-owned persistent Chrome profile and fully loaded
fonts and image/Mermaid content. The sample feature assertions use Core's read model rather than
source string matching. No document semantics or supported syntax are extended.


| Sample | 1440px | 640px |
| --- | --- | --- |
| Korean, title/table | [Capture](assets/feature-samples-528/sample-ko-1440.png) | [Capture](assets/feature-samples-528/sample-ko-640.png) |
| Korean, image/equation | [Capture](assets/feature-samples-528/sample-ko-1440-image.png) | [Capture](assets/feature-samples-528/sample-ko-640-image.png) |
| Korean, Mermaid/list | [Capture](assets/feature-samples-528/sample-ko-1440-mermaid.png) | [Capture](assets/feature-samples-528/sample-ko-640-mermaid.png) |
| English, title/table | [Capture](assets/feature-samples-528/sample-en-1440.png) | [Capture](assets/feature-samples-528/sample-en-640.png) |
| English, image/equation | [Capture](assets/feature-samples-528/sample-en-1440-image.png) | [Capture](assets/feature-samples-528/sample-en-640-image.png) |
| English, Mermaid/list | [Capture](assets/feature-samples-528/sample-en-1440-mermaid.png) | [Capture](assets/feature-samples-528/sample-en-640-mermaid.png) |

Manual review confirmed title/paragraph wrapping, table columns, image/equation/caption containment
and readable Mermaid/list content at both supported widths. Captures retain the pre-existing
Command center scenario tabs. No shell geometry, typography or token values changed.
The first new browser assertion incorrectly waited for an inline SVG; Mermaid intentionally renders
an SVG data-URL image. The assertion was corrected to observe that actual image, without changing
product behavior or timeout/console criteria. The rerun passed. Windows `BadPasswordAttempts`
was 4 before the initial launch and 5 afterward; additional runs waited until it returned to 0.

The local `open-files` scenario initially retained the old sample notice text and stopped before
its later Save-error assertions. Its expected notice is updated to the new version-preservation
wording. Under the owner's subsequent no-repeat/browser-counter rule, that scenario is not
repeated locally; the final PR CI must verify the corrected assertion.

## Non-overlapping opened folders (#702)

The [2026-10-29 ADR-0009 amendment](../adr/0009-multiple-opened-folders.md#amendment-2026-10-29-non-overlapping-roots-702)
replaces nested Sidebar sections. A successful Open of a descendant expands the existing section,
its intermediate folders and the requested folder. The row is selected, focused after the picker
closes and scrolled into the Files panel; a collapsed sidebar opens. The notice reads
“이미 열린 폴더 {{name}} 안에 있습니다” / “Already inside the opened folder {{name}}.”
Same-root Open still relists in place and respects manual section collapse.

Opening an ancestor replaces its descendant sections at their first position. Cached listings and
child expansion move into the ancestor; each absorbed section's visibility becomes its child-folder
expansion. Missing intermediate branches are listed lazily. Unrelated sections, open tabs, active
path, dirty content and editor history remain. Late requests for removed sections cannot overwrite
the new tree. Recent Open uses this same path. Restoring nested saved roots reduces them in either
order without notices/focus or preference writes, retaining the surviving root's saved visibility;
explicit navigation remembers the final reduced list after all restoration requests settle (#367).

Containment uses the existing Host-normalized text and separator boundaries, with no new case,
symlink, junction or UNC identity policy (#372 remains deferred). This is Editor navigation only;
no Core/CLI semantic operation, document write or Host state is added.

Manual review captures from the same final folder-navigation scenario, Windows installed Chrome,
checkout-owned persistent profile, 1440×900, English, Light theme, DPR 1 / 100% zoom. These show
sequential navigation states, not a same-state visual redesign comparison. Shared selected-surface,
text and semibold tokens style the selected folder row; geometry and control sizes are unchanged.

| State | Capture |
| --- | --- |
| Parent opened: two child sections absorbed, child expansion and dirty active tab retained | [1440px](assets/non-overlapping-roots-702/parent-1440.png) |
| Deep child opened: existing root expanded, requested row selected and notice visible | [1440px](assets/non-overlapping-roots-702/child-1440.png) |

Local browser launches are capped at four for this change. Launch 1 stopped on a new test helper
that attempted to use a hidden menu after sidebar collapse; launch 2 exposed finalFocus stealing
focus after onClosed selected the requested row. Both were corrected without relaxing assertions;
launch 3 passed folder-navigation and produced these captures. Launch counters before runs 1–3
were 1, 2, 2 respectively. No packaged Desktop, install/update/uninstall, Edge or fresh-profile probe
was run locally. Host normalization, system PATH/registry and installed IeumDoc user data are unchanged.

Launch 4 (counter 2) passed folder-memory, layout-rules, quiet-document, document-tabs,
editor-shell and reveal-folder. Command-center stopped at its legacy wait for a separate alpha
root after opening that descendant. Its helper now accepts the surviving root or a contained
folder row and explicitly checks one section with alpha expanded. This correction is left to
required PR CI; no fifth local browser execution is performed. The final local counter is 2.
Final focused folder-tree/shell tests (48), Editor typecheck and production build pass.

## Docling server and conversion (#797)

Settings includes the module's Docling category for Host-owned server configuration,
connection checking and the Korean administration guide. Explorer PDF context menus
and Command Center's Convert with Docling share a PDF picker/explicit conversion
flow, progress and Stop waiting. The shared notification center handles conversion
failures alongside stale comparison warnings; other alert migration remains #792.
See the [conversion contract](docling-conversion-v1.md#app-pdf-conversion-797) for
setting lifetime, output naming, limits and automatic comparison tabs. Existing
Appearance/recovery settings and ordinary document actions retain their contracts.
