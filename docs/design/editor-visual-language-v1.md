# Editor Visual Language — Quiet Document

Role: current visual rules for tokens, palette, typography, surfaces, themes and states; [Layout Rules](editor-layout-rules-v1.md) owns placement/control dimensions and [UI patterns](ui-patterns-v1.md) owns repeated interaction targets.

- Status: Implemented
- Last verified: 2026-10-31 (#833: shared UI eojeol wrapping; persistent Chrome at 640px Dark/Korean and 1440px Light/English, with [capture metadata](assets/ui-wrap-833/capture-metadata.json)).
- Scope: Editor presentation. Core semantics, source format, Host persistence and editing state follow [ADR-0001](../adr/0001-single-document-editor-architecture.md) and [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md).
- Authority: [AGENTS.md](../../AGENTS.md), Accepted ADRs and [documentation governance](../contributing/documentation-governance.md). [ADR-0010](../adr/0010-supported-viewport-and-input.md) sets a minimum 640px with keyboard and pointer input.
- History: [Original rules, issue verification and captures through 2026-10-30](../reviews/editor-visual-language-history-2026-10-30.md) are Historical evidence. The v1 filename remains stable.

## Direction

**Document at rest, application on interaction.** Readable document space and a quiet shell take priority over persistent tools. The paper boundary and empty-document hints make writing discoverable. Showing tools never shifts document text or shell controls.

[Reference mockup](assets/quiet-document-reference.png) is a visual reference, not a product screenshot or a contract for its tree, search, account, window decorations, numbering, references or autosave. Current feature contracts own those behaviors. [UI pattern targets and known mismatches](ui-patterns-v1.md#알려진-불일치) distinguish approved future work from current implementation; this document does not mark those targets complete.

## Tokens and palette

[styles/tokens.css](../../apps/editor/src/styles/tokens.css) is the single source of product values. Consumers use role variables; new UI color literals outside that file are prohibited. [index.css](../../apps/editor/src/index.css) maps product roles one way to shadcn/Tailwind. Product colors/radii use `--id-*` names. No alias cycles, duplicate role definitions or `!important`.

One chosen accent owns primary actions, focus, selection/current/drag indicators, links/references and generated heading/Outline numbers. `accent` aliases `interaction`; `interaction-soft` aliases `surface-selected`; `text-selected` aliases `accent-hover`. Current Outline numbers inherit selected text; heading text retains normal color. Information is neutral; danger and warning keep distinct meanings. shadcn `accent` means neutral hover and `muted` means a quiet background.

The table lists `--id-color-` roles; selected roles come from the preset tables below.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| `paper` | `#ffffff` | `#1e2229` | Continuous Visual/Source sheet only |
| `canvas` | `#eceef2` | `#14171c` | Area outside paper |
| `surface` | `#ffffff` | `#262b34` | Floating surfaces, fields, current segments and Settings |
| `surface-subtle` | `#f6f7f9` | `#191d24` | Header, panels and neutral information |
| `surface-muted` | `#eef0f4` | `#242a33` | Code and muted faces |
| `surface-hover` | `#eaedf2` | `#303743` | Ordinary hover on panel and paper |
| `surface-pressed` | `#e3e7ee` | `#37404d` | Neutral open/pressed face and segment track |
| `text` | `#20242c` | `#edf0f5` | Main text |
| `text-muted` / `text-subtle` | `#545c68` / `#606874` | `#c3cad5` / `#b7c0ce` | Secondary labels / metadata |
| `text-on-accent` | `#ffffff` | `#14171c` | Primary-action text |
| `border` / `border-subtle` / `border-strong` | `#d9dde4` / `#e7eaf0` / `#bbc2cd` | `#737f90` / `#363e4a` / `#8491a3` | Structural separators / quiet edges / stronger rules |
| `border-control` | `#7b8390` | `#9aa6b7` | Recognizable fields and outlined controls |
| `paper-border` | Alias `border-subtle` | `#485363` | Independent paper edge |
| `danger` / `surface-danger` | `#a12b32` / `#fff1f0` | `#ffa4aa` / `#422b30` | Errors and destructive actions |
| `warning` / `surface-warning` | `#875717` / `#fff8ed` | `#efc079` / `#3e3323` | Caution |
| `info` / `surface-info` | Alias `text-muted` / `surface-subtle` | Same aliases | Neutral information |
| `backdrop` | Black 10% | Black 45% | Modal backdrop |

Settings offers six validated presets, default Blue, with no free color picker. Theme-scoped `--id-color-accent-{preset}` supplies each swatch and interaction role once. Scripts set validated IDs, never colors.

| Light preset | Interaction/primary/focus/number | Hover/selected text | Selected | Selected hover |
| --- | --- | --- | --- | --- |
| Blue / 파랑 | `#315fd4` | `#2449a6` | `#e9f0ff` | `#e1eaff` |
| Violet / 보라 | `#7041bd` | `#552c98` | `#f0eafa` | `#ebe3f7` |
| Plum / 자주 | `#8a3f85` | `#6d2c69` | `#f6eaf5` | `#f0e2ee` |
| Teal / 청록 | `#076f65` | `#075b53` | `#e4f3f0` | `#d5ebe7` |
| Green / 초록 | `#346d38` | `#27542b` | `#e9f2e7` | `#dfeadb` |
| Graphite / 흑연 | `#52616b` | `#3d4a53` | `#eaf0f3` | `#dfe8ed` |

| Dark preset | Interaction/primary/focus/number | Hover/selected text | Selected | Selected hover |
| --- | --- | --- | --- | --- |
| Blue | `#9abbff` | `#bdd2ff` | `#253954` | `#2d4260` |
| Violet | `#c4a8ff` | `#dac8ff` | `#38304e` | `#44395e` |
| Plum | `#dda3d5` | `#efc3e9` | `#432e40` | `#50384c` |
| Teal | `#6dd6c7` | `#a0e9de` | `#203d3b` | `#284946` |
| Green | `#9bce91` | `#c2e5ba` | `#2d3d2c` | `#374a35` |
| Graphite | `#b5c6d1` | `#d4e0e8` | `#303b43` | `#3a4751` |

UI text/generated small numbers meet 4.5:1; required control boundaries, focus and state indicators meet 3:1 against adjacent backgrounds, including canvas/paper in Flat. Document-tab markers meet 3:1 at rest and hover. Current list items/segments also use 600 semibold as a non-color cue. Decorative dividers, segment face/shadow edges and rest-versus-hover differences do not carry a 3:1 state-boundary requirement; text and focus still do.

The encoded native-select chevron is a deliberate literal exception: data-URL SVG cannot inherit CSS variables, so its theme-specific stroke matches `text-muted`. Black/transparent mask alpha and zero-alpha rings are rendering mechanisms. Shadows remain tokens; document art and syntax/KaTeX content keep their own ownership.

## Typography

Document and UI share `Pretendard Variable → Pretendard → Noto Sans KR → Apple SD Gothic Neo → Malgun Gothic → Segoe UI → sans-serif`. The document stack aliases UI but has independent size/spacing tokens. Embedded controls retain UI typography. English and Korean use the same tokens.

Pretendard `1.3.9` is bundled through its official variable dynamic-subset CSS; Vite serves WOFF2 assets. All upstream ranges remain available, with upstream `font-display: swap` and weight range; fallback may appear during load or for unsupported glyphs. `--font-feature-sans: "cv08"` gives capital I its serifs in document/UI. KaTeX and code fonts are unaffected. Refresh the [OFL notice](../../apps/editor/public/licenses/Pretendard-OFL.txt) from the same version when updating.

| Role | Size / line height / treatment |
| --- | --- |
| Body, including callout prose | 17/28.9px, 400, document stack |
| H1–H6 | 34/45.9, 24/32.4, 20/27, 18/24.3, 16/21.6, 14/18.9px, document stack, 700 |
| Frontmatter title | H1 type while typing; empty `Add a title (optional)` / `제목 추가(선택)` uses subtle 14px normal UI type centered vertically within the same title slot; outward focus outline leaves breathing room without changing layout; no box at rest (#786) |
| UI labels/controls and Figure/Table captions | 14/20px, UI stack |
| Metadata/status/helpers | 12/16px, UI stack |
| Dialog title / start or Settings title | 16px semibold / 24px semibold UI type |
| Table cells | 15/22px, UI stack for dense columns |
| Callout kind title | 14/21px semibold UI type |
| Endnote definition | 16/24px, document stack and normal text; separator label is UI metadata |
| Code block / inline code | Monospace 14/21px / 0.9em with inherited line height |
| Source | Read-only monospace 14/20px, subtle gutter numbers |
| Inline math / display equation | `--math-inline-size` (1.1em) / KaTeX's 1.21em; no internal KaTeX restyling |

Korean prose wraps at eojeol boundaries with `--word-break-document: keep-all`: title, headings, paragraphs/lists/quotes/callouts, captions, cells and endnotes. Oversized tokens retain emergency wrapping. CSS declares `overflow-wrap: anywhere`, but Tiptap's injected `word-wrap` alias makes document prose compute to `break-word`; Source computes to `anywhere`. Headings retain `text-wrap: pretty`. Inline code/math keep contextual `keep-all` in headings and `normal` elsewhere, with `break-word`. Code blocks retain their own wrapping. [Layout Rules](editor-layout-rules-v1.md#exceptions-and-checks) owns local table/formula scrolling and prohibits document-wide clipping.

UI prose shares the same existing word-break token with `overflow-wrap: anywhere` at the shell, portal and embedded property-form/notice/helper boundaries (#833). This covers draft messages, property explanations, Settings, dialog descriptions and other shell guidance in both languages. Document text, tables, Source, code, literal recovery comparisons and standalone file/path displays retain their own rules. Buttons, tabs, menu/options and input controls retain their existing wrapping/nowrap/ellipsis; prose defaults do not replace those control rules. [Issue #833](https://github.com/ieumbird/ieumdoc/issues/833) links the PR with same-state 640px Dark/Korean and 1440px Light/English product captures; [capture metadata and manual review conditions](assets/ui-wrap-833/capture-metadata.json) and the [reproduction script](assets/ui-wrap-833/capture.browser.js) accompany the images.

References read like links without box/fill: content-link color, underline on hover, subtle dashed underline when unresolved, with explicit localized unresolved text. Citations use numeric text/selected treatment; unchecked/incomplete/missing/duplicate resources use subtle dashed text, while complete limited IEEE entries have content-link color without underline. [Reference](section-references-v1.md#editor) and [citation](citations-v1.md) contracts own labels/readiness/interaction. Code comments/quotes use `text-subtle`, keywords `info`, strings `warning`, numbers/types `danger` on `surface-muted`.

## Surfaces and themes

| Surface | Expression |
| --- | --- |
| Shell | Quiet `surface-subtle` header/panels, shared structural rules; native caption background uses the same role |
| Paper | Continuous Visual/Source `paper`, independent inset edge/radius/shadow; grows without page sizes/breaks |
| Light Paper | Gentle `--shadow-paper: 0 2px 8px rgb(32 36 44 / 6%)`, quieter than overlays |
| Dark Paper | One step brighter than canvas, visible edge, zero elevation (`0 0 0 transparent`) |
| Floating menus/dialogs/properties | Themed `surface`, shared border/radius and `--shadow-overlay`; fields use control roles |
| Settings | Opaque themed `surface` viewport, subtle separators; no popup corners/shadow or floating close button |
| Start without a document | Canvas with product mark/title, muted explanation and surface cards with subtle edges; never paper |
| Figure/Equation rest | Transparent; captions remain readable; metadata reserves no space |
| Callout | Kind surface and side rule, no full outline |
| Source editing forms | Equation/Mermaid full-column code-style source and preview; inline math uses its wrapping popover |

Settings → Appearance & language offers System / Light / Dark, default System. System follows live OS `prefers-color-scheme`; explicit choices ignore it. Resolved `:root[data-theme]` drives roles, `color-scheme` and Tailwind `dark:` together. Native and Base UI controls share roles without dark-only utility tints. Images retain original pixels without inversion/filter; KaTeX inherits text.

External blocking [theme-init.js](../../apps/editor/public/theme-init.js) resolves theme/page before styles/app bundle; it temporarily sets native `color-scheme` without duplicating colors. Runtime applies theme/accent before React UI. [Desktop appearance](desktop-distribution-v1.md#appearance-595) owns native resolution/bridge and first-window background; no Host theme persistence is added.

Page style / 페이지 모양 offers Paper / 종이 (default) and Flat / 평면. `:root[data-page="flat"]`, after theme scopes, changes only canvas to paper, paper edge width/radius to zero and paper shadow to `0 0 0 transparent`. A transparent zero shadow stays valid when composed with the inset edge. Geometry and floating surfaces remain unchanged in either theme.

## Shared controls

Use existing Button/Input and `components/ui` primitives, preserving refs, events and editor selection. Base UI owns shared button/focusable-disabled behavior; document-specific native controls retain their owner. [Control sizes, spacing and deliberate exceptions](editor-layout-rules-v1.md#controls-and-spacing) have one current home in Layout Rules. UI typography stays independent of document preferences.

Ghost rest is transparent; neutral hover is visible on panel/paper. Open-menu faces use neutral pressed fill without a control boundary. Secondary/Cancel has a themed outlined face and neutral hover. Select/outlined controls and modal inputs retain `border-control`; short property text fields use `surface-subtle`, a transparent rest border and visible hover/focus borders under [P05](ui-patterns-v1.md#p05-입력칸placeholder위계). Short field errors reuse `--word-break-document` (`keep-all`) for Korean eojeol boundaries and `overflow-wrap: anywhere` for oversized tokens (#819). Invalid fields retain a danger border and a connected short error under [P07](ui-patterns-v1.md#p07-입력-오류와-알림-센터); Command Center uses `surface-subtle` and structural `border`, and selected segments use surface/shadow/weight instead of a control edge.

Destructive Buttons use danger text/border on `surface`, then `surface-danger` on hover. Keyboard focus retains danger text and adds the chosen-accent ring. Native disabled destructive buttons have an opaque muted face, readable secondary text and structural boundary; other native disabled controls retain dimming. Focusable `aria-disabled` keeps its muted face, secondary text, structural boundary, tooltip, focus ring and activation guard.

Controls/overlays change state without decorative transitions, pressed movement or enter/exit animation. Save alone retains its reduced-motion-aware progress spinner. Action menu rows use shared line icons/text/separators; destructive rows use danger text/icons and enabled `surface-danger` hover. Disabled rows have no hover fill. [Menu behavior](editor-ux-shell-v1.md#unified-action-menus-516) and [P10](ui-patterns-v1.md#p10-메뉴와-선택-도구) own roles/navigation.

## State rules

These are independent axes. Visual interactions never write document attributes.

| Axis | Expression |
| --- | --- |
| Rest | No paragraph input box or block extent outline. Gutter/Edit/authoring metadata are hidden, without invisible pointer targets. Captions, references, errors and restrictions remain visible. Endnotes explicitly retain always-visible Edit under the [Endnotes contract](footnotes-v1.md#editor). |
| Mermaid kind | Editable Visual Editor retains a small muted `Mermaid` badge at rest, including failures and pending source drafts; existing metadata typography, structural border, small radius and spacing tokens. Decorative chrome only; [Figure authoring](figure-authoring-v1.md#mermaid-editor) owns scope. |
| Hover | Gutter, typed-block Edit and metadata appear without moving text; the route to buttons remains inside the hover area. One top-level block gets a neutral input-transparent extent overlay. Nested lists/cells indicate the whole top-level block. Geometry/clearance belongs to [Layout Rules](editor-layout-rules-v1.md#alignment-and-ownership). |
| Keyboard focus | Caret/selection shows document focus without a document frame. `:focus-within` reveals tools; controls draw focus only on `:focus-visible`, never after a pointer click. |
| Current lists | Files, Outline and +/slash use selected surface/text and 600 semibold, no left marker. Hover uses selected-hover while current. Focus never changes current/ARIA state. Command Center retains Base UI highlighting and existing disabled/foreign-text exceptions. |
| Current segments | Shared view toggles use a pressed track, raised themed `surface`, `text`, 600 semibold and `--shadow-segment`, without control edge/marker. Inactive text is muted, normal text on hover, without a hover face. Hidden semibold labels reserve width. |
| Current tab/group | Document tabs stay flat with normal current text and an inset bottom accent marker; inactive is muted. Neutral hover preserves the marker; focus is independent. In split groups the focused group's tab-row adds selected-surface fill alongside active tab markers. |
| Pressed/open | Menu-open controls retain neutral pressed fill. Wide document/Outline on toggles use selected face/icon (selected-hover on hover), without marker/control boundary. Expanded Sidebar Collapse keeps transparent rest rather than a persistent pressed face. |
| Selected | One chosen-accent block outline and visible Edit; selection opens no properties. Figure/Equation/Table/endnote outlines share hover's expanded rectangle/inset stroke/outer radius and paint above hover. No content border/padding or extra cue. |
| Editing | Form/outline persist independently of selection. Typing hides no selected/editing outline. Completion/focus return follows feature contracts and [P04](ui-patterns-v1.md#p04-적용취소완료). |
| Dirty/invalid | Notices distinguish applied Save content from unapplied form input; errors preserve values. Labels/helpers/errors remain associated. Invalid field boundaries coexist with focus; operation failure does not mislabel a valid field. |
| Save refusal | Danger block/cell strokes and localized Cannot save badge identify the cause. They paint above selection/hover in the document's isolated stacking context below the header, without interactive hit targets. The danger message gives localized cause/action and collapsed keyboard-accessible Technical details retaining the original diagnostic. [Save](editing-session-save-v1.md#refused-block-highlighting-and-navigation-578-phase-1) owns lifetime/navigation. |
| Read-only | Source soft-wraps unbroken words, with one subtle gutter number per source line and aligned continuations. Numbers/wrapping add no copied/stored characters. Foreign file rows remain subtle with crossed-file icon and native-marker description; admission follows the [support contract](document-support-v1.md). |
| Empty document | A lone empty editable paragraph shows the subtle document-type starting hint on the text axis and first `+`; its drag handle stays hidden. The hint is decoration, absent from selection/clipboard/Source/Save/dirty comparison. Title uses the small optional-title hint above. |
| Pending Figure | Dashed subtle frame contains compact `Choose image` / `Write Mermaid` actions (`이미지 선택` / `Mermaid 작성`). The actions open existing authoring flows; only completion commits content. Frame-background selection and caption behavior stay unchanged (#786). |
| Empty caption | Editable Table/image/pending/Mermaid captions use a muted italic hint only while selection is elsewhere. Number prefix/click surface remain. Generated text has an empty accessibility alternative and is absent from clipboard/Source/Save; read-only omits it. |
| Accent swatch | Checked native radio uses a 2px interaction-color circle outline with a 2px offset exposing the Settings surface; keyboard focus independently rings the transparent target. Hover subtly brightens the circle. Only the selected translated name is visible, muted metadata; all swatches keep accessible names/tooltips. No option box/background/check icon or per-circle visible name. |

Document input, IME composition and document-changing keydown commands suppress only the neutral hover outline until real pointer movement. Selection, transactions, scrolling, mouseover and resizing do not restore it; blocks passing under a stationary pointer remain suppressed. Mouseleave retains the last movement coordinates. Unsuppressed hover follows the block under the pointer, not selection. It disappears outside the host, between blocks or during block drag, where drag tint/drop line wins. Gutter/Edit/metadata keep independent visibility. Existing no-hover fallbacks may keep tools visible and omit hover extent without creating touch-only support requirements.

Buttons use the solid 2px outer `--focus-ring`; list/menu rows, tab-group controls, checkboxes and table tools use `--focus-ring-inset`. Both use opaque `border-focus` (chosen accent). Current/error/pressed faces remain visible alongside focus. Primary controls separate accent face from ring with an inner surface boundary. Figure metadata's quiet filled fields are an explicit exception to always-visible field boundaries; [P05](ui-patterns-v1.md#p05-입력칸placeholder위계) tracks other current form differences.

Clean available Save is ghost, unsaved is accent, unavailable muted without hover. Saving preserves position/width/name while a spinner overlays a transparent label. The fixed status slot conveys unsaved/saved/operation/failure with localized text/tooltip; clean Ready is blank. Settings' unseen-update dot uses accent with localized tooltip/name; About actions use selected fill/interaction outline without animation. [Shell](editor-ux-shell-v1.md#title-strip-and-tab-row-actions-695) and [Desktop](desktop-distribution-v1.md#settings-update-cue-verification-665) own the operations.

## Adjustable values and preferences

Values tuned by hand or changed by taste live under **Adjustable values** in `styles/tokens.css`, with a comment describing each purpose. Rules/scripts consume shared variables rather than repeat numbers. Regression checks read tokens/resolved relationships while preserving public constraints such as standard/compact control sizes, contrast, word boundaries and unmoved text.

| Area | Adjustable variables / owner |
| --- | --- |
| Palette/theme/page | Product roles/preset scopes above; `--id-color-paper`, `--id-color-canvas`, `--id-color-paper-border`, `--size-paper-border`, `--id-radius-paper`, `--shadow-paper` |
| Body/word boundaries | `--font-family-document`, `--font-size-document`, `--line-height-document`, `--word-break-document` |
| Headings/title | `--font-size-document-h1` through `-h6`, `--font-weight-document-heading`, `--line-height-document-heading`, `--space-document-heading-before/after`; `--id-color-document-heading-number` aliases interaction, with the existing single-space number gap |
| Block/quote/list | `--space-document-block`, `--space-document-list-indent`, `--space-document-quote-indent`, `--size-document-side-rule` |
| Captions/table | `--font-size-document-caption`, `--line-height-document-caption`, `--space-document-caption`, `--font-size-document-table`, `--line-height-document-table`, `--space-document-table-cell-block/inline` |
| Code/math | `--font-size-document-code`, `--line-height-document-code`, `--font-size-document-inline-code`, `--math-inline-size`, `--layout-equation-input-min-height`, `--layout-inline-math-input-min-height`, `--layout-inline-math-popover-width` |
| Endnotes | `--font-size-document-endnote`, `--line-height-document-endnote`, `--space-document-endnotes`, `--space-document-endnote-gap/indent` |
| Block outlines | `--id-color-block-hover-outline`, `--size-block-hover-outline`, `--id-radius-block-hover`, `--space-block-hover-inline/block`; geometry in [Layout Rules](editor-layout-rules-v1.md#alignment-and-ownership) |
| Document column/padding | `--layout-content-width`, `--layout-content-width-wide`, `--layout-content-gutter`, `--layout-document-block-padding`, `--layout-document-block-padding-narrow`, `--layout-document-end-space`; blank end space also controls caret clearance |
| Shell/navigation | `--layout-sidebar-width`, `--layout-sidebar-width-narrow`, `--layout-document-panel-width`, `--layout-document-tab-height`, `--layout-document-tab-max-width`, `--space-sidebar-tree-indent`, `--space-outline-indent` |
| Command Center | `--layout-command-center-width`, `--layout-command-center-popup-width`, `--layout-command-center-list-height` |
| Settings | `--layout-settings-content-width`, `--layout-settings-control-width`, `--layout-document-settings-label-width`, `--space-document-settings-after` |
| Figure metadata | `--layout-figure-popover-width`, `--size-figure-property-thumbnail-max-width/height`, `--space-figure-popover-gap`; preview retains intrinsic ratio |
| Folder/image picker | `--layout-folder-picker-width`, `--layout-folder-picker-list-height`, `--layout-folder-picker-folder-list-height`, `--layout-folder-picker-preview-height` |
| File/reading previews/comparison | `--layout-file-preview-width`, `--layout-file-preview-image-max-height`, `--layout-reading-preview-width/height`, `--layout-recovery-compare-width`, `--layout-recovery-diff-max-height` |
| Other presentation | `--font-feature-sans`, `--layout-start-width`, `--size-start-mark`, `--size-overflow-fade`, `--reference-underline-offset`; start title has independent UI size/line-height tokens |

Preferences select validated scopes/classes, never computed/stored pixel values. [preferences.ts](../../apps/editor/src/preferences.ts) keeps display choices in browser/app-profile storage outside Markdown/frontmatter/Core/Host requests. Missing/invalid/unreadable storage defaults to System theme, Blue accent, Paper and Standard width. Theme/accent/page write failure keeps the live choice and shows the localized Settings alert. Wide document retains its live choice if storage fails. Startup theme/page/accent applies before first UI; document state/history/drafts survive display changes.

Bibliography, citation chips, shortcut labels and notices reuse existing type/spacing/control roles. Behavior belongs to [Citations](citations-v1.md), [Shortcuts](editor-ux-shell-v1.md#shortcut-contract-381) and [UI patterns](ui-patterns-v1.md). Overlay focus/dismissal stays with feature owners; sizing/collision clearance with [Layout Rules](editor-layout-rules-v1.md). Visual review procedure and same-state Before/After requirements live in [Reviewing a visual change](../test/README.md#reviewing-a-visual-change).
