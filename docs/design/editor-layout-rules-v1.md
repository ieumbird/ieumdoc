# Editor Layout Rules v1

Role: alignment, spacing, control dimensions and deliberate geometry exceptions; [Visual Language](editor-visual-language-v1.md) owns visual roles and [UI patterns](ui-patterns-v1.md) owns repeated interaction targets.

- Status: Implemented
- Contract cross-check: 2026-10-30 (#777 inventory and #785 document/code comparison at master `e6eb3282`; control exceptions moved here, no geometry changes or browser rerun).
- Form content viewport verification: 2026-10-30 (#782; [계약·검사·전후 캡처](#form-content-viewport-782)).
- Outline display update: 2026-10-29 (#719; single-line ellipsis, full title tooltip and accessible name; [evidence](../reviews/editor-visual-language-history-2026-10-30.md#single-line-outline-719)).
- Editor groups verification: 2026-10-29 (#488 phase 1; 440px minimum per group, fixed equal columns, narrow merging and [1440/640px evidence](editor-ux-shell-v1.md#two-editor-groups-488-phase-1)).
- Tab-row actions update: 2026-10-29 (#695; [contract and evidence](editor-ux-shell-v1.md#title-strip-and-tab-row-actions-695)).
- Document scroll verification: 2026-10-29 (#488 phase 0 and #694 header follow-up; [viewport geometry and captures](editor-ux-shell-v1.md#document-scroll-container-488-phase-0)).
- Brand title-strip update: 2026-10-28 (#647; title strip spans all columns, side headers align with document tabs).
- Block outline verification: 2026-10-28 (#469 follow-up: shared expanded selection/hover rectangle and inset stroke; [measurements and captures](../reviews/editor-visual-language-history-2026-10-30.md#typing-and-outline-verification-469)).
- Save refusal geometry: 2026-10-28 (#578 phase 1: error overlays reuse the same measured block extent and inset stroke, paint above selection/hover within a locally isolated document below the sticky header, and add no document padding/border; [contract and captures](../reviews/editor-visual-language-history-2026-10-30.md#save-refusal-highlights-578)).
- Previous separator verification: 2026-10-28 (#635: persistent Windows Chrome matrix at 1440/1424/1423/640px, both themes, caption reservation 138px/zero and panel/sidebar states; 1440/640px before/after pixels differ only by the missing separator segment, preserving the total header/tab geometry).
- Shell verification: 2026-10-27 (#582 / #605: 40px headers, native caption reservation and supported-width browser checks; [contract and captures](editor-ux-shell-v1.md#sidebar-and-native-title-bar-582--605)).
- Document tab verification: 2026-10-27 (#581: adjustable 32px row, full-height activation, preserved 28px close and measured-header consumers; [comparison](../reviews/editor-visual-language-history-2026-10-30.md#slim-document-tabs-581)).
- Document settings verification: 2026-10-27 (#580: inline settings, per-tab expansion, notation previews and existing document operations; [integration, checks and captures](editor-ux-shell-v1.md#document-settings-placement-554)).
- Docking verification: 2026-10-26 (#552: 1424px Standard-column boundary, session-only docked choice, targeted browser checks and [same-state captures](editor-ux-shell-v1.md#outline-docking-verification-552)).
- Table handle verification: 2026-10-26 (#517: unchanged 28px/6px hit geometry with light line icons; bilingual layout-rules, table-authoring narrow-scroll/keyboard/touch checks and [same-state comparison](table-interaction-v1.md#light-handle-verification-and-comparison)).
- Last verified: 2026-10-26 (#515 P1/P3 owner review correction: contrast-qualified tab edges, 600 list cue and stable Outline row extent; targeted regressions and [1440/390px comparison](../reviews/editor-visual-language-history-2026-10-30.md#selection-cue-review-correction-515)).
- Previous verification: 2026-10-26 (#515: owner A1 raised tab groups and background-only current lists; targeted browser regressions, Editor tests/typecheck/build and [1440/390px manual comparison](../reviews/editor-visual-language-history-2026-10-30.md#selection-expression-verification-515)).
- Shared control verification: 2026-10-26 (#514: B1 32/28px and 6px control geometry, UI isolation and token-selected/focus colors in English/Korean at 1440/390px; [manual captures and guard evidence](../reviews/editor-visual-language-history-2026-10-30.md#shared-control-verification-514)).
- Previous verification: 2026-10-26 (#476: Source soft wrapping; Editor tests/typecheck/build, Source/layout/quiet-document browser checks and [1440/375px Before/After](editor-ux-shell-v1.md#source-wrapping-476)).
- Previous verification: 2026-10-26 (#469: shared painted Figure/Equation and hover corner radius, unchanged offsets and 0px content movement; [same-state captures](../reviews/editor-visual-language-history-2026-10-30.md#typing-and-outline-verification-469)).
- Previous verification: 2026-10-25 (#425: collapsible folder sections; Editor tests/typecheck/build, folder-navigation/folder-memory/command-center/editor-shell/layout-rules/ui-language/quiet-document and [desktop/phone captures](editor-ux-shell-v1.md#section-disclosure-verification-and-captures)).
- Previous verification: 2026-10-24 (#385: Sidebar header entry, Close-only folder menus; folder-navigation browser check, Editor tests/typecheck/build and [same-state desktop/phone evidence](editor-ux-shell-v1.md#sidebar-open-folder-entry-385)).
- Previous verification: 2026-10-23 (#363 command center; Editor tests, typecheck/build, command-center/editor-shell/document-tabs/ui-language/layout-rules/quiet-document browser checks; [actual captures](editor-ux-shell-v1.md#command-center-verification-363)).
- Previous verification: 2026-10-23 (#235: several opened folder sections, separated by `--space-3`; several scroll together as one list while one keeps its own tree scroll; folder-navigation and stable browser suite).
- Previous verification: 2026-10-19 (#321: phone-width sidebar closed without a rail or covering the whole screen; layout-rules, folder-navigation, quiet-document and the stable suite; same-state 375px captures against `6c03188`: closed [before](assets/phone-sidebar-321/before-375-closed.png)/[after](assets/phone-sidebar-321/after-375-closed.png), open [before](assets/phone-sidebar-321/before-375-open.png)/[after](assets/phone-sidebar-321/after-375-open.png)).
- Previous verification: 2026-10-17 (UX review: unreserved block metadata, text-aligned tables, folder heading actions, 200px narrow sidebar and the overlay sidebar below 640px; stable browser suite and 1440/1024/375px [Before/After](../reviews/editor-ux-review-2026-10-17.md)).
- Previous verification: 2026-10-16 (#204: tab row and measured-header overlay bounds; layout-rules/quiet-document checks and approved 1440/375px [captures](../reviews/document-tabs-204-2026-10-16.md)). Previous verification: 2026-10-14 (#218: folder-navigation, layout-rules and quiet-document checks; full folder names, Korean word wrapping, unbroken wrapping, first-line icon and short-name alignment, reachable actions and actual Before/After captures. #225 review fixes: layout-rules and quiet-document browser checks, gutter hover retention, expanded top-level extent geometry, control/neighbor clearance, 0px text shift and same-state Before/After captures). Previous shell verification: 2026-10-13 (#176; [actual captures](../reviews/editor-shell-176-2026-10-13.md)).
- Scope: Editor shell, document, block tools and control geometry.
- Pattern targets: UI 작업 전 [UI 패턴](ui-patterns-v1.md)의 사용처·확정 목표·불일치를 확인한다. 아래는 현재 geometry이며 P01 가용 콘텐츠 경계는 #782에서 구현했다. P09 표 상단 도구 목표는 #793에서 구현했다.
- [Visual Language](editor-visual-language-v1.md) owns color, typography, surfaces and state expression. It supersedes the earlier restriction against changing fonts/colors.

- Viewport alignment: #695 replaces the 35rem/56rem multi-row header and 704px action wrapping with a fixed title strip and tab row. Search becomes icon-only below a 22rem available title container; Wide document folds into ⋯ at viewport widths up to 1024px. Settings, Sidebar and Outline docking breakpoints remain unchanged.

## Supported viewport and input

[ADR-0010](../adr/0010-supported-viewport-and-input.md) defines a minimum viewport width of **640px**, with keyboard and pointer input. Viewports below 640px and touch-only entry are outside support and verification. Existing no-hover fallbacks may remain without creating a touch requirement.

## Alignment and ownership

- Frontmatter title (#786) keeps the existing H1-line-height minimum slot. The small empty
  hint's line box matches that slot and centers vertically; empty-state height is explicit
  to prevent a fractional intrinsic-size shift when typing begins. The title focus outline
  uses `--space-1` outward offset for visible inner clearance without adding padding,
  resizing the field or moving the following body. This also applies to entered titles.

- Editor groups (#488 phase 1) use equal fixed columns with a 1px structural divider.
  Each needs 440px, the existing 640px supported viewport less the 200px narrow Explorer.
  Available document area must therefore reach 881px before splitting. A narrower
  area merges groups without unmounting tabs or losing their editing/scroll state.
  Split paper uses the existing 80px starting gutter and 16px narrow trailing inset;
  each native scrollbar belongs to its group. The shared title strip stays 40px;
  both tab rows stay 32px plus the boundary. See the [group contract](editor-ux-shell-v1.md#two-editor-groups-488-phase-1).
  Floating editor controls fit and cap their size to the owning document's visible
  content viewport in both single and split layouts. Exclude Sidebar, docked or
  overlay Outline/Tables/Figures panels, padding and native scrollbars. Keep the
  existing 8px edge inset for inline forms, menus and reading previews; property
  popovers retain their existing library collision spacing and placement rules.
  Resize, group movement and panel/Sidebar changes recompute the boundary.
  [#782 verification and captures](#form-content-viewport-782) cover the former
  single-group mismatch with [P01](ui-patterns-v1.md#p01-속성-편집-표면과-위치).


- The bottom Settings icon carries an 8px update dot in the same icon slot in both expanded Sidebar and collapsed rail (#665), without changing button targets or footer placement. Dot activation opens About & updates; its update actions receive an inset accent outline and selected-surface background. See the [update contract and captures](desktop-distribution-v1.md#settings-update-cue-verification-665).

- Folder sections retain a 28px compact disclosure target (#425) around the 16px chevron,
  followed by the same name slot as subfolder rows (#582); folder rows have no folder icon. It rotates like
  subfolder chevrons and stays clear of the always-visible right-hand actions. The single-line
  name/title rules below apply. Collapsing hides only the tree/empty help; controls remain reachable at
  desktop and 200px narrow-sidebar widths. See the
  [section contract](editor-ux-shell-v1.md#collapsible-folder-sections-425).

- The Sidebar header contains Explorer and the compact Collapse Explorer button, or only Expand Explorer in the collapsed rail. Each root row shows New document… and More actions (New folder…, Open folder…, Refresh, Close folder). Empty Explorer retains Open folder… and New document…. See [#582 / #605](editor-ux-shell-v1.md#sidebar-and-native-title-bar-582--605).

- Sidebar icons use a 16px slot and 8px label gap. A tree row has one 16px leading slot (chevron for folders, retained type icon for files) and an 8px name gap; folder and file names at the same visual depth share one text start within 1px. Each level indents 12px, at most five levels; deeper names keep that indent and ellipsize, with the full path in `title`.
- Each opened folder is its own accessible section in the order opened (#235), visually continuous with its child rows and the next root, without extra heading or section gaps. One opened folder keeps its heading in place while its tree scrolls; with several, the Explorer panel scrolls them together as one list, so every heading and item stays reachable without overlapping.
- Each opened root folder is presented as a depth-zero folder row, using the same chevron and name without a folder icon, 14px regular type, 20px line height, 28px row height and icon/label gaps as child folder rows. Its New document / More actions group stays at the right of the same row, with 4px before the group and no gaps between its 28px ghost buttons. The root name uses the same single-line ellipsis as tree entries; its full path remains in `title` and its full name in accessible section/disclosure/tree labels. This owner-approved #582 revision supersedes #218's full root-name wrapping. Child entries start one visual indentation step below the root, retaining the existing 12px step/cap. This visual depth does not change the section, disclosure button, tree/treeitem roles, ARIA levels or #425 state. Tab order follows disclosure, New document, More actions, then the tree's retained keyboard stop.
- The full-width title strip and Settings header are always `--layout-header-row` (40px). Explorer and docked Document navigation align with the tab row: `--layout-document-tab-height` (32px) plus a 1px bottom boundary. Search shrinks or becomes icon-only; title/status/actions never wrap into extra rows.
- The document tab row sits below the title strip, including when no document is open. Its 32px tablist scrolls within the space left by fixed active-document actions; the wrapper owns the 1px structural boundary. Activation fills the token height, close remains 28px and focus rings fit inside. Tabs ellipsize and retain horizontal keyboard reveal. Save stays outside the scroller at the right. Header measurement includes tabs and messages for navigation clearance and overlay bounds.
- The title strip has one 1px bottom separator across the full viewport, including the native caption reservation in every Outline state (#635/#636/#647). Document scrolling moved below the header in #488 phase 0, so the native scrollbar no longer interrupts the title strip. The reservation reduces the search container's usable content width; it does not shorten the separator. The brand occupies the current Explorer width, showing the existing Desktop SVG at 28px with IEUMDOC text, or only the icon when collapsed. The Explorer header and docked Outline tabs share the document tabs' top and bottom boundaries. Expand remains in the second-row rail, preserving its target and Explorer focus path.
- Windows native overlay paint ends before that separator: its height is `--layout-header-row` minus `--border-width` (39px), while both title strip and Settings retain 40px overall (#694). The main-process value is checked against resolved CSS tokens and OS-composed pixels by Windows packaged CI; DOM border geometry alone cannot detect native occlusion. See [Desktop title-bar contract](desktop-distribution-v1.md#integrated-windows-title-bar-605).
- TopBar and MessageArea retain their 20px inline inset. Search is centered in the remaining title-strip area with a 28rem cap and a 32px control; below 22rem available width it becomes a 32px icon button. Location yields before shortcut, then the action label. The full path/shortcut remain in tooltips. The scrolling tablist uses 4px inline insets; tab-row actions use 8px inline insets, 12px between view/file groups and 4px within groups. A fixed 16px status slot beside Save retains the complete live text and tooltip without moving controls.
- Document settings sits above the title, outside ProseMirror (#580); TopBar has no document-settings button. View controls (Visual/Source, Wide document, Outline) and file action groups keep their order, separated by 12px between groups and 4px within groups. Visual/Source is one segmented control: a 28px track with 2px padding holding two 24px segments. Visual/Source raised faces and shadows do not affect layout; document tabs instead use a flat surface with a bottom accent marker (#581). Both retain independent inset focus rings; tab text stays at 0px movement. Current Explorer/Outline/+·slash rows intentionally use 600 semibold as a non-color cue, so glyph widths may change. Explorer retains ellipsis; Outline reserves its semibold text extent with a hidden copy and keeps single-line ellipsis to avoid row-height jumps. Hover/focus preserve the current weight and existing insets.
- The document column centers in the area remaining between the sidebar and the Document panel. Its maximum width is `--layout-content-width` (928px), or `--layout-content-width-wide` (1280px) with the Wide document preference, with 16px outer insets; it never exceeds the available area. Both values are [adjustable values](editor-visual-language-v1.md#adjustable-values-and-preferences). Wide changes only the column width: the content axis, 80px gutter and block rules stay the same.
- Document owns the 80px starting gutter: 8px edge + 28px control + 4px gap + 28px control + 12px safety. Trailing inset is 80px, becoming 16px at ≤1024px.
- The white document surface fills at least the viewport below the measured sticky header, less two outer insets. The column's 16px canvas gap surrounds it; an inset 1px edge changes no width. Long documents grow naturally and end with the adjustable writing end space (`--layout-document-end-space`) as bottom padding. The blank paper below the actual editor content remains clickable to continue writing.
- All top-level block wrappers share the content axis. Block-internal content may inset or center. Controls overlay the gutter and never shift text. The pointer-hover extent starts from the drag-source rectangle (content axis, block top/height, trailing document inset), expanded by `--space-block-hover-inline` (8px left/right) and `--space-block-hover-block` (4px above/below). This uses 8px of the 12px gutter safety, leaving 4px before the handle, and keeps neighboring extents separate within the existing block gaps. The hover corner radius is `--id-radius-block-hover` (small radius plus space-1 and the shared border width, currently 9px). Figure/Equation/table/endnote selected/editing overlays use the same expanded rectangle, radius and inset stroke width; their accent stroke paints above hover when both coincide. The inset strokes share the overlay outer radius. No content border/padding is added: text moves 0px. Hover uses the original vertical block range anywhere inside the document host, including its gutter controls; expansion does not activate the gaps. Gutter, hover and drag geometry observe both the paper and editor content, so content resizing inside a minimum-height paper still updates the handles and overlays. The hover extent is recomputed under the pointer on layout/scroll/transactions, independently of selection; geometry updates do not switch its controls to the selection.
- Expanded sidebar width is `--layout-sidebar-width` (240px), or `--layout-sidebar-width-narrow` (200px, so a short folder name fits beside its actions) at ≤1024px; both are [adjustable values](editor-visual-language-v1.md#adjustable-values-and-preferences). It is 48px when explicitly collapsed. The collapsed rail contains Expand Explorer and the shared Settings footer (#671/#703). Folder-specific New/Close actions appear in expanded file navigation; Open folder is in each folder menu, or in empty Explorer. Document settings uses 14px labels, 12px descriptions/previews, 16px native checkboxes and shared 28px actions. Grouped rows align on the adjustable label column, stacking labels above controls at narrow desktop widths. Its summary ellipsizes secondary values with a full-value tooltip. Long filenames wrap in the expanded body; controls and menu stay within the viewport at 640px. The body is position-independent. Label-column width and title separation are Adjustable values in tokens.css.
- The Document panel is `--layout-document-panel-width` (256px, an adjustable value) and docks at 1424px and wider; closed, it takes no width. The docking width is separate from the 1024px narrow sidebar so the document keeps a readable width beside both panels: at 1424px, 1424 − 240 − 256 = 928px remains, preserving the Standard column (736px of text after outer and inner insets). At 1280–1423px it stays closed by default, preserving the 928px Standard column and single-row TopBar; the former 1280px docking rule left only 592px of text. Below 1424px the panel never takes grid width: opened, it overlays at its width against the right edge (at most the viewport), from the bottom of the sticky header (TopBar and messages, measured as `--app-header-height`) to the bottom of the viewport, and the document keeps its width. When resizing below the docking width, CSS immediately hides any still-mounted docked panel until the media-query state update closes it, so its header cannot overflow the zero-width column. Explicitly opened overlays remain visible. Returning to the docked layout restores the user's last explicit docked open/closed choice, or opens by default if none exists. Overlay interactions do not replace that docked choice; each transition into overlay starts closed. This choice lives only in page memory and resets on reload. The docking width is a media query (`width < 89rem` in `styles.css` and `PANEL_OVERLAY_LAYOUT` in `App.tsx`), not an adjustable value.

The Document panel's Outline / Tables N / Figures N segments form its first visible row, aligned with document tabs (#647), with `--layout-document-tab-height` content and a 1px bottom boundary. They reuse
the Visual/Source 28px track and 24px Button segments; the three labels divide the available
width with the existing compact inline spacing. All view segments reserve their semibold label width, so changing selection never moves the track or neighboring controls (#620). The list keeps single-line ellipsis and
semibold extent reservation. Overflow uses ellipsis; the full title remains in the native `title` tooltip and accessible name (#719). Heading/table/figure reveal uses the same measured-header
scroll margin. The accessible Outline heading remains visually hidden; overlay placement stays below the whole measured header.

Desktop reserves native caption-button width using CSS `env(titlebar-area-x)` and
`env(titlebar-area-width)`; ordinary browser tabs reserve no width. The full-width title strip carries that reservation independently of Outline state; search shrinks or becomes an icon within the remaining width. Tab-row actions remain below it. Title-strip empty areas are drag regions and
interactive descendants are no-drag. No fixed caption-button width is used in production.

Figure metadata (#757) is anchored to the full Figure and caption, below by default and above
on collision, with its width/height capped to the owning group's available viewport. Single-group
Sidebar/Outline padding and native scrollbar are excluded. `--layout-figure-popover-width` and
`--size-figure-property-thumbnail-max-width`, `--size-figure-property-thumbnail-max-height`
and `--space-figure-popover-gap` are adjustable; spacing and control dimensions reuse the shared
tokens. Label and Number share a two-column row at both wide and supported narrow widths.
The Number track and Label input share a height and vertical center (#760); revealing the
fixed input or its warning does not stretch the Label field. Media previews retain their own
aspect ratio within the maximum width/height, without a fixed box or letterbox fill, and center
their compact action. Expanded Advanced retains the collapsed label-line clearance above Done.
Above placement also clears the absolute metadata line.
See [Figure properties](figure-authoring-v1.md#anchored-figure-properties-757).

## Controls and spacing

Document scrolling belongs to the active tab's viewport below the measured tabs/messages
header (#488 phase 0, #694 follow-up). Its native scrollbar stays at the window's right edge
only below that header. The DOM title-strip border spans the viewport, removing the root
scrollbar interruption; scrollbar width is reserved only in the lower layout. Native window-control
overlay height and actual Windows pixels in document/Settings are verified by [#694](https://github.com/ieumbird/ieumdoc/issues/694).
Navigation clearance is
the viewport's top plus the target's scroll margin, preserving the existing physical header
clearance. Sidebar and Outline retain their independent scroll regions. See the
[scroll contract and measured captures](editor-ux-shell-v1.md#document-scroll-container-488-phase-0).

- Dedicated Settings (#594/#605/#694) covers the viewport with a 40px minimum header, the existing
  240px sidebar width and a bounded 680px content column (`--layout-settings-content-width`).
  Label/description and control columns share row axes; selectors use the adjustable
  `--layout-settings-control-width` (240px) and existing 32px control tokens. Content uses
  the 64px inline/32px block spacing scale; below 768px the named category list stacks above
  content with 24px content insets and single-column rows. The body scrolls inside the
  viewport, leaving Back reachable. #488 keeps the root viewport locked and places document
  scrolling below the header; Base UI respects that lock without a reserved root gutter.
  Settings and document separators must both reach the window edge. #694 changes neither
  the lock nor document scrolling, and its OS pixel checks allow no gutter exception.
  Accent choices (#617) use one row of six 20px circles (compact control size minus
  space-2), 28px radio targets with 8px between circles. Only the current color name appears to
  the right, in 12/16px muted text with an 8px gap. This fits the 240px control axis
  and the 640px viewport. There are no option boxes or names under each circle.

- The [folder dialog](folder-picker-v1.md#folder-presentation-522) keeps one column at wide and supported narrow widths. Its folder-only child list has a 16rem maximum (eight standard 32px rows); longer lists scroll and the enclosing dialog remains scrollable for short viewports. The shared image mode retains its 15rem bound. Starting-place names wrap inside the column, retaining the whole name and path description; New folder shares the child-list heading row. Ancestor breadcrumbs retain wrapping and disappear with Up at the Root.

- B1 (#514): standard controls/inputs 32px (`--size-control`); compact controls/actions/fields 28px (`--size-control-compact`); control radius 6px (`--id-radius-md`); text-button inline padding 12px; centered line icons 16px. Use Button/Input, the lockfile-pinned lucide icons and existing size/radius/UI tokens; do not derive control metrics from document type. Measure actual rendered height after transitions complete. Typography follows [Visual Language](editor-visual-language-v1.md#typography); role-specific exceptions and reasons are in [Deliberate control exceptions](#deliberate-control-exceptions).
- Existing 4/8/12/16/20/24/32/48/64px spacing scale remains. The paper starts 16px below the header; its adjustable top block padding is 32px (16px at ≤1024px), keeping the content start at 48px (32px at ≤1024px), before block margins.
- Typography follows [Visual Language](editor-visual-language-v1.md#typography); changing document type never changes UI control metrics.
- Paragraph/block gaps: 16px. Heading before/after: 32/12px. Figure and Table caption gap: the shared adjustable `--space-document-caption` (8px by default).
- Figure, Equation and Table authoring metadata takes no layout space: it is positioned in the block gap above its block, right-aligned and clear of the hover outline. A table's 28px row and column handles keep a 32px handle gutter (`--size-table-handle-gutter`): the column handles above the table and the row handles left of the text axis, so the table itself starts on the text axis. Its Edit (label and number), Table actions and Delete sit together in the action bar below it, starting at the table's start beside Append row, so a table wider than the column keeps them in view before it is scrolled.
- Table bottom actions and Append row sit after the entire native table, including its caption and empty input surface (#721). The grid reserves their compact-control height plus `--space-2` above and below; caption wrapping and caption-gap tuning cannot move text into those targets. Row handles remain centered on grid rows, outside horizontal scrolling; column handles retain their existing top gutter.
- Table tools use compact shared Buttons with 6px radii; column width follows the column and row targets stay centered at 28px. B2 (#517) uses centered 16px horizontal column / vertical row line icons in those same hit areas, with address names/tooltips; the layout/command target is unchanged. Breadcrumbs use 28px minimum shared Button geometry with 6px radii and wrapping; the code language uses a recognizable 28px outlined Button with a selection menu (#645). Tiny inline reference/citation edit/remove controls retain the explicit line-height/neighbor-hit-area exception in [Deliberate control exceptions](#deliberate-control-exceptions). Expanded Sidebar Collapse has quiet transparent rest with its disclosure semantics preserved.
- Endnote definitions: one trailing region, 16/24px text, 24px number inset and space before/after the region, 8px between definitions. Only the first has a 1px rule, 12px to the 12/16px `미주` label, then 8px to the definition. Original source disclosures keep their existing dimensions; the [Endnotes contract](footnotes-v1.md#endnotes-presentation) defines display order and source conversion.
- `components/ui` and legacy native primitives share product tokens; refs, events and selection are preserved.

### Deliberate control exceptions

| Role | Exception and reason |
| --- | --- |
| Title slot, inline math/reference/link content, endnote reference/return numbers | Document-sized text, not 32px toolbar actions. Preserve body/title/superscript typography, line height and content radii. Their editing forms use ordinary UI fields/actions. |
| Section-label edit | Content-sized 12px monospace metadata with its existing 4px radius; preserves the out-of-flow heading annotation. Its property form follows B1. |
| Inline reference/citation edit and citation-key remove | Retain the existing 18px corner edit / 16px chip remove targets, 12px icons, zero icon line box and 4px radius. Enlarged invisible targets could cover neighboring document text or keys; preserving selection, wrapping and line height is safer. Accessible names and keyboard focus rings remain. This is a deliberate tiny-target exception, not permission for new toolbar actions. |
| Table row/column handles | 28px-high targets with 16px line icons and localized address names/tooltips (#517). Column target width follows its actual column; row targets remain 28px wide and vertically centered. State expression follows [Visual Language](editor-visual-language-v1.md#state-rules) and [Table interaction](table-interaction-v1.md). |
| Breadcrumbs and wrapping list/menu rows | At least 28px; actionable paths and translated multi-line content may grow rather than truncate or overflow. Breadcrumbs use 4px inline padding to keep long paths reachable. |
| File tree, Outline, recent-folder/picker options and menu primitives | Retain their navigation/selection/focus owners and token-backed row geometry. They are not generic fixed-height action buttons. Command center results retain 36/56px and 4px radius for one/two-line result navigation; CommandMenu rows follow the shared 6px menu rule. |
| Document tabs and close slot | Use the adjustable 32px navigation row, a full-height activation area, 28px close target with a 16px icon and the existing roving keyboard owner. State expression follows [Visual Language](editor-visual-language-v1.md#state-rules). |
| Visual/Source and Outline/Tables/Figures | The documented 24px inner segment sits inside a 28px track; measure the whole segmented control. Outline navigation reuses these Button faces, selected/focus tokens and typography in its own document-tab-height row below the drag header (#613). |
| Native checkboxes | 16px OS checkbox inside an associated label target of at least 28px; retain native accessibility, accent and focus behavior. |
| Accent swatch radios | Six 20px circles in 28px circular targets, with 8px between circles (4px inside each target edge). Size is compact control minus space-2; no new size token. Only the selected name appears to the right, with a space-2 gap. State and focus follow [Visual Language](editor-visual-language-v1.md#state-rules). |
| Picker path input | 20px inner line box inside the recognizable 32px/6px field wrapper; the wrapper owns boundary and focus. |
| Multiline LaTeX/recovery fields | Block source minimum 80px, inline math minimum 64px, recovery minimum 128px, retaining editable/copyable multi-line content rather than a one-line action size. Recovery's 4px field radius remains a specific existing treatment. |
| Content/surface radii | Existing 4px content, 8px popover, 12px dialog and 6px paper radii express content/surface hierarchy; the shared 6px radius is a control rule. |

## Exceptions and checks

- TopBar prioritizes its search action, with optional muted location/name; the full unchanged address remains in the secondary information title.
- Tables and formulas scroll inside their block, with a thin scrollbar where the platform draws one and a fade (`--size-overflow-fade`) at an edge with more content; the fade follows the scroll position and is absent without overflow. Source soft-wraps Markdown lines, including unbroken text, within the available width without horizontal scrolling (#476). Each source line has one gutter number; continuation rows align with its text, leaving the number gutter clear. Wrapping is display-only and preserves source text/Copy. Overlay contents may scroll if viewport height demands it. Never hide overflow on the whole document or restyle KaTeX internals to make measurements pass.
- Overlay positioning respects the viewport and sticky header. Required controls must exist and stay reachable.
- `new-document.browser.js` checks the empty surface at 1440 and 768px, first hint and insert visibility without hover, New focus, immediate typing/undo, blank-paper click, actual empty Save/Source and real-file Save → Reload. Cancel and rejected New return to the opening control without creating a file.
- `layout-rules.browser.js` measures real scratch documents at 1440, 1424, 1423, 1280, 1279, 1025, 1024, 768, 705, 704 and 640px with sidebar open/collapsed and a folder shown. No-element results fail. It checks the sidebar and docked panel widths against their variables, 16px sidebar icons and top-level tree icon/text alignment, the overlay at 1423, 1280, 1279, 1024, 768 and 704px (document width unchanged, no sideways scroll, top at the header's bottom, Save, File actions and the Outline toggle uncovered, Escape returns focus to the Outline toggle) and that hiding the docked panel widens the centering area by its width. Boundary checks preserve the 928px Standard column at 1424px and a single-row TopBar at 1280–1424px, retain explicit docked open/closed choices through resize, keep overlay dismissal separate, and reset the choice on reload. At 640px with the Sidebar expanded and collapsed, every tab-row action remains inside the viewport on the fixed second row with no sideways page scroll, in reading order, 4px apart within a group and at least 12px between groups; Wide document remains available in ⋯; the Reload menu stays inside the viewport. At 1920px it toggles Wide document in the tab-row actions and checks the column against `--layout-content-width-wide` (capped by the area), centering, the shared axis, the text inset, unmoved TopBar controls and the preference surviving a reload without changing document content/dirty state. It also checks inline document settings/control bounds and Escape disclosure focus at 1920/1440/1280/1024/768/640px (#580). The block uses the document content axis, independently of Sidebar width. An additional English/Korean matrix at 1280/1423/1424/1440px covers both Sidebar states and both Outline states, asserting 40px height, centered placement, 160px minimum command button, visible controls without overlap and secondary-location/shortcut/action reduction order.
- No change to Core/CLI, document semantics, save API, Tiptap state architecture or backend persistence.

## Form content viewport #782

`documentContentBounds` shares FigureProperties' content-boundary calculation with
`useOverlayBounds` (link/reference/citation forms, selection toolbar, menus and reading
previews) and `BlockProperties` (inline math). Figure, table and section-label metadata now share
`MetadataProperties` with target-wide anchoring and Done completion (#791).
The width cap lets existing fields/actions wrap inside the available area. Form
appearance, anchor alignment, confirmation and draft behavior keep their contracts.
The opening focus target stays stable through the boundary measurement render;
existing `property-drafts` and `inline-math-authoring` focus checks verify this.
This is Editor interaction only; Core/CLI semantics are unchanged.

The `cross-reference` regression checks 1440×900 and 640×900 with Outline open/closed,
including the 640px overlay panel and an expanded Sidebar. It opens actual targets
near the visible right edge, checks each form and enabled control against document
bounds, and hit-tests controls to detect covering panels. The same section-label
form also stays usable while Outline changes. `editor-groups` checks reference and
link forms in both columns; 640px retains the existing automatic single-group merge.

Manual before/after evidence uses the same disposable `overlays.md`, Windows Chrome
persistent checkout profile, English/light UI, default document width, 100% zoom,
DPR 1 and the bundled Pretendard fonts at 1440×900/640×900. Before uses base
`ceead74c` product code; after uses this PR's content-boundary change. Inline targets
are opened with the document at scroll top 0; the screenshot captures the resulting
focus/selection and popup. These are manual review images, not pixel assertions.

| Form / Outline open | 1440px before / after | 640px before / after |
| --- | --- | --- |
| Cross-reference | [Before](assets/form-viewport-782/before/reference-1440-open.png) / [After](assets/form-viewport-782/after/reference-1440-open.png) | [Before](assets/form-viewport-782/before/reference-640-open.png) / [After](assets/form-viewport-782/after/reference-640-open.png) |
| Link | [Before](assets/form-viewport-782/before/link-1440-open.png) / [After](assets/form-viewport-782/after/link-1440-open.png) | [Before](assets/form-viewport-782/before/link-640-open.png) / [After](assets/form-viewport-782/after/link-640-open.png) |
| Inline math | [Before](assets/form-viewport-782/before/inline-math-1440-open.png) / [After](assets/form-viewport-782/after/inline-math-1440-open.png) | [Before](assets/form-viewport-782/before/inline-math-640-open.png) / [After](assets/form-viewport-782/after/inline-math-640-open.png) |

The same asset directories include each form with Outline closed.
[Measured geometry and browser environment](assets/form-viewport-782/verification.json)
record the before/after bounds and pointer hit results. Before: at 1440px
the reference extends to x=1388.625 beyond the content right edge x=1184, hiding Apply;
at 640px it extends to x=632 beyond x=384. Section-label properties also cross the
Sidebar boundary; inline math/table properties can cross the narrow overlay panel.
After: all five forms' inputs and buttons fit and receive pointer hits in all four
states. Citation-only behavior was not changed or reworked (ADR-0008 freeze).
