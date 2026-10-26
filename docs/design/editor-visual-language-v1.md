# Editor Visual Language — Quiet Document

- Status: Implemented
- Last verified: 2026-10-26 (#506: Korean eojeol wrapping with oversized-token fallback; [verification and same-state 1440px/375px captures](#korean-document-wrapping-506)).
- Previous verification: 2026-10-26 (#497: document presentation token refactor; Editor tests, typecheck/build, layout-rules/quiet-document/footnotes and [byte-identical 1440px/375px comparisons](#document-presentation-token-verification-497)).
- Previous verification: 2026-10-26 (#480: bounded active-image picker preview, layout-rules/quiet-document, same-state 1440px/375px [captures](folder-picker-v1.md#active-image-preview-480) and byte-identical quiet-document rest pairs).
- Source wrapping verification: 2026-10-26 (#476: Source soft wrapping; Editor tests/typecheck/build, Source/layout/quiet-document browser checks and [1440/375px Before/After](editor-ux-shell-v1.md#source-wrapping-476)).
- Table deletion verification: 2026-10-26 (#474: existing MessageArea/ghost Undo action, 1280/375px English/Korean captures and byte-identical quiet-document rest pairs; [verification](table-interaction-v1.md#table-deletion-notice-verification-474)).
- Previous verification: 2026-10-26 (#469: typing/IME hover suppression, offset-aware Figure/Equation corners, targeted browser regressions and [1440px comparison](#typing-and-outline-verification-469)).
- Previous verification: 2026-10-25 (#438: bibliography connection controls, bilingual notices, 1280/375px captures and unchanged quiet-document rest pairs; [verification](citations-v1.md#bibliography-connection-verification-438)).
- Previous verification: 2026-10-25 (#425: collapsible folder sections; Editor tests/typecheck/build, folder-navigation/folder-memory/command-center/editor-shell/layout-rules/ui-language/quiet-document and [desktop/phone captures](editor-ux-shell-v1.md#section-disclosure-verification-and-captures)).
- Previous verification: 2026-10-24 (#385: Sidebar header entry, Close-only folder menus; folder-navigation browser check, Editor tests/typecheck/build and [same-state desktop/phone evidence](editor-ux-shell-v1.md#sidebar-open-folder-entry-385)).
- Previous verification: 2026-10-24 (#401: long-name/path dialogs at 1440/375px; [measurements and captures](#long-dialog-names-and-paths-401)).
- Previous verification: 2026-10-24 (#395: recovery review path wrapping and footer bounds at 1440/375px; [same-state evidence](editing-session-save-v1.md#recovery-review-layout-395)).
- Previous verification: 2026-10-24 (#382 / #391 review: recovery deletion confirmations, nested backdrop outside dismissal/pending guards; refreshed 1440/375px English/Korean [captures and environment](editing-session-save-v1.md#local-recovery-records-296-pr2)).
- Previous verification: 2026-10-23 (#363 command center; Editor tests, typecheck/build, command-center/editor-shell/document-tabs/ui-language/layout-rules/quiet-document browser checks; [actual captures](editor-ux-shell-v1.md#command-center-verification-363)).
- Previous verification: 2026-10-23 (#265 citation form reusing the reference form surface and existing tokens; [verification and captures](citations-v1.md#unit-c-verification-265)).
- Previous verification: 2026-10-22 (#265 derived References with existing type/spacing tokens; [verification and captures](citations-v1.md#unit-b-verification-265)).
- Previous verification: 2026-10-22 (#217: all-file Sidebar listing, bounded read-only image preview; Host/Editor/Desktop protocol tests and actual Vite/production HTTP browser regressions).
- Previous verification: 2026-10-22 (#332 citation display and shared reference underline token; [verification and captures](citations-v1.md#verification)).
- Previous verification: 2026-10-19 (#255: Add a title place and empty-title placeholder in the document's subtle hint role).
- Previous verification: 2026-10-19 (#298: start without a document on the canvas with the product mark and card sections; open-files captures at 1440/768/375px).
- Previous verification: 2026-10-19 (#321: phone-width sidebar without a rail, covering the screen when open; stable browser suite and 375px captures).
- Previous verification: 2026-10-17 (UX review v4.7: location identity, segmented view control, tab folder labels, unreserved block metadata, overflow fades, Source line numbers, `cv08`; stable browser suite and same-state Before/After in the [review](../reviews/editor-ux-review-2026-10-17.md)).
- Previous verification: 2026-10-16 (#296 PR2: recovery list/dialog/Settings/failure/empty captures at 1440/375px; existing shared tokens and overlay controls).
- Previous verification: 2026-10-16 (#204: tabs reuse product tokens; actual Before/After review approved by the user, with [evidence](../reviews/document-tabs-204-2026-10-16.md)). Previous verification: 2026-10-15 (#281: cross-reference, section-reference, table-authoring, pending-figure, layout-rules and quiet-document browser checks; actual 1440px slash-menu Before/After). Previous verification: 2026-10-15 (#276: save-session browser checks for Reload danger colors, text/control contrast, keyboard focus and in-flight disabled state; same-state 1440/375px Before/After captures). ADR-0006 admission/projection cleanup was checked by code/test comparison only. Previous verification: 2026-10-14 (#225 review fixes: layout-rules, quiet-document, block-move and list-authoring browser checks; gutter/content row hover, adjustable extent expansion, control/neighbor clearance, no-hover suppression, drag priority and 0px text shift; same-state quiet-document Before/After with actual Pretendard glyphs). The #226 paper-surface refinement was previously checked by document/code comparison only. Previous shell verification: 2026-10-13 (#176; [review and verification](../reviews/editor-shell-176-2026-10-13.md)).
- Current contract: v4.7, with the #226 paper-surface refinement and #225 pointer-hover block extent. Historical filename retained for link stability.
- History: v1 implemented 2026-09-25; v2 (chrome recedes) implemented 2026-10-06; v3 (distinct states) 2026-10-08; v4 (TopBar tabs, toggles and Save states) 2026-10-10; v4.1 (TopBar state axes) 2026-10-10; v4.2 (one blue action role, light theme only, #172) 2026-10-12; v4.3 (start without a document, #174) 2026-10-12; v4.4 (in-place footnote regions, #185) 2026-10-12. v4.5 (one trailing endnotes region, #194) 2026-10-12. v4.6 (Files/Display tools and File actions, #176) 2026-10-13. v4.7 (UX review: one meaning for the blue marker, location identity, unreserved metadata, overflow cues) 2026-10-17. Visual approval remains with the user.
- Scope: existing Editor presentation and interaction overlays. Core, CLI, source format, save API and the single Tiptap state are unchanged.

## Direction

**Document at rest, application on interaction.** White document space, readable typography and a quiet shell take priority over persistent tools. A subtle paper boundary and an empty-document starting hint keep the writing area discoverable before it has content.

[Reference mockup](assets/quiet-document-reference.png) is a visual reference, not a screenshot of the product. Adopt its reading column, hierarchy, restrained borders and relationship between a selected Figure and its properties. Do not copy its workspace tree, search, account, window decorations, unimplemented numbering/reference behavior, autosave or technical claims. Current computed numbering and heading settings follow [Heading numbering](heading-numbering-v1.md) and [UX Shell](editor-ux-shell-v1.md). Primary actions, focus and current items share one blue interaction role; red means only errors and destructive meaning. Pretendard Variable is bundled and served by the app; it does not require a font CDN.

## Surfaces and typography

Korean document prose wraps at eojeol (space-separated word) boundaries using
`word-break: var(--word-break-document)` (`keep-all`). The title, H1–H6, paragraphs,
list paragraphs, quotes, admonition text, figure/table captions, table cells and endnote
definitions share this rule. The existing inherited `overflow-wrap: anywhere` remains
the emergency fallback when a token cannot fit on an otherwise empty line, including
long URLs and English identifiers. Unlike `break-word`, `anywhere` also contributes
emergency break opportunities to min-content sizing. Normal Korean words move intact
to the next line; an eojeol wider than the entire available line may split to avoid overflow.
Chromium retains its normal punctuation restrictions. Headings previously had their own
literal `keep-all`; they now use the same token and retain `text-wrap: pretty`.
Code blocks, inline code, KaTeX, Source wrapping and UI chrome retain their own behavior.
This is presentation only, with no preference, source-format, Core or CLI change.

The shared Settings language selector follows the existing 32px input/control size and typography. Korean and English use the same font stack and tokens. Long translations wrap within existing dialogs and scroll within their viewport bounds; language changes do not introduce a new layout system. The UI language policy and document-text boundary are defined in [UX Shell](editor-ux-shell-v1.md#ui-display-language-256).

| Role | Actual values / treatment |
| --- | --- |
| Shell | `#f6f7f9` sidebar and Document panel, white header; 48px header, 240px sidebar (200px at ≤1024px; below 640px no rail: closed, the TopBar opens it; open, it covers the whole screen), 48px collapsed rail, 256px Document panel (docked at ≥1280px; below, an overlay with the overlay shadow under the header) |
| Document | White continuous writing surface on the adjustable `canvas` (`#eceef2`), with a 1px inset `border-subtle` edge, adjustable 6px paper radius and gentle paper shadow (`0 2px 8px rgb(32 36 44 / 6%)`). Paper elevation is quieter than the overlay shadow. 928px maximum column, 16px outer inset, 80px document inset on each side; 736px body at 1440px with sidebar open. At least the viewport height below the measured header, less the top/bottom outer insets; grows with content, without paper sizes or page breaks. |
| Narrow document | Below 1280px the Document panel starts closed and overlays when opened. At ≤1024px, retain 80px tool gutter; trailing inset becomes 16px. At ≤704px header wraps. Below 640px the sidebar starts closed and the document uses the whole width; opened, the sidebar covers the screen. Otherwise it remains user controlled. |
| Body | Shared sans stack (below); 17px / 28.9px, 400; 16px paragraph gap |
| H1–H6 | Same document stack, 700; 34/45.9, 24/32.4, 20/27, 18/24.3, 16/21.6, 14/18.9px; 32px before / 12px after; first block has no top margin |
| UI | Same shared sans stack; 14/20px labels/controls, 12/16px metadata and status |
| Caption / table | UI stack, 14/20px; caption gap 8px; cells 8px × 12px, 112px minimum width, light visible grid |
| Callout | UI stack, 14/21px; a 3px kind-colored side bar and its surface, no outline; informational, caution and danger kinds; plain variant title |
| Endnote definition | One region after the body in first-reference order. 16/24px document type and normal text color; baseline number in a 24px inset, returning to the invoking reference. Subtle rule and 12/16px `미주` label at the start, 8px internal gaps and 24px separation from the body. Each definition is one supported paragraph edited in place; unsupported definitions reject native admission. An endnote's gutter has no `+` and its handle opens block actions without dragging. Placement and Save follow [Endnotes](footnotes-v1.md). |
| Figure / Equation | Transparent at rest; authoring metadata takes no space, hidden at rest and shown on hover/focus/selection/editing at 12/16px in the gap above the block, right-aligned and clear of the hover outline; caption unchanged. Selected/editing outline uses the interaction role. |
| Editing surfaces | White popovers/dialogs, subtle Equation form surface, shared border/radius/shadow; 32px inputs, 28px form actions, explicit labels and errors |

Document and UI share `Pretendard Variable → Pretendard → Noto Sans KR → Apple SD Gothic Neo → Malgun Gothic → Segoe UI → sans-serif`; the document token aliases the UI stack. The Editor pins the official `pretendard` package to `1.3.9` and imports its variable dynamic-subset CSS. Vite resolves the relative WOFF2 URLs into app-hosted assets. All upstream subsets remain available for newly entered text; only needed ranges are requested. The upstream `font-display: swap` and weight range are retained, so a system fallback can appear while a font loads or for unsupported characters. No CSS size adjustment or new typography dimensions are introduced. UI and document text use Pretendard's `cv08` variant (capital I with serifs, `--font-feature-sans`), so the product name never reads as "leumDoc" and a capital I stays distinct from l in technical text; KaTeX and code fonts are unaffected.

The SIL OFL 1.1 notice text is copied from `pretendard/dist/LICENSE.txt` into [the public license](../../apps/editor/public/licenses/Pretendard-OFL.txt), served at `licenses/Pretendard-OFL.txt` in the built app. When updating the package, refresh that notice from the same version. The 2026-10-08 Noto Sans KR observation remains historical evidence; the [Pretendard verification](../reviews/pretendard-2026-10-09.md) records the new actual fonts and wrapping. Heading sizes/weights/line heights are unchanged; KaTeX and code fonts retain their own typography; inline math is sized by `--math-inline-size` ([verification](../reviews/inline-math-size-2026-10-09.md)).

Colors originate in `styles/tokens.css`. `--id-color-accent` / `-hover` color Save/Apply and other primary actions; the accent is the interaction blue, so an action, the focus ring and the current item read as one role, and red never marks an ordinary action. Content links, references and informational callouts retain `--id-color-info`; `--id-color-danger: #a12b32` and its existing surface retain validation/destructive meaning. The shadcn primary/ring/destructive roles map one way to these product roles. In particular, shadcn `accent` is the neutral hover surface, not the product primary-action accent, and `muted` remains a quiet background rather than a universal interaction state. The Editor has one light theme: Tailwind's `dark:` variant follows a `.dark` class the Editor never sets, so an OS dark preference cannot gray out fields or outlined controls.

| Product role (prefix `--id-color-`) | Value / responsibility |
| --- | --- |
| `surface`, `surface-subtle` | White paper/dialogs and `#f6f7f9` panels |
| `canvas` | Adjustable `#eceef2` background around the white paper; independent of panel surfaces |
| `surface-hover` | `#eaedf2`, visible on both panels and white paper |
| `surface-selected`, `surface-selected-hover`, `text-selected` | `#e9f0ff`, `#e1eaff`, `#2449a6`: current navigation and active command choice; `text-selected` also colors TopBar toggle icons that are on |
| `surface-pressed` | `#e3e7ee`: neutral persistent menu-open/pressed face; an open ghost control shows only this face, without a border |
| `text`, `text-muted`, `text-subtle` | `#20242c`, `#545c68`, `#606874`: main text, secondary labels, metadata; subtle remains readable on hover surfaces |
| `border`, `border-subtle`, `border-strong` | Structural separators, paper edge, and stronger content rules; these are not input identification |
| `border-control` | `#7b8390`: fields and outlined buttons. At least 3:1 against their adjacent white/panel faces. Open/pressed ghost controls and tabs take no boundary |
| `interaction`, `interaction-soft` | `#315fd4` indicator/focus and an alias to `surface-selected`; no separate copied selection palette |
| `accent`, `accent-hover` | An alias to `interaction` and `#2449a6`: primary action faces with `text-on-accent` |

Focus indicators appear only on `:focus-visible` (keyboard), never after a mouse click. Buttons show a solid 2px outer ring (`--focus-ring`, `border-focus`); list rows (file tree, Outline, recent folders, menus, folder picker), checkboxes and table tools show a solid 2px inset ring (`--focus-ring-inset`). The rings are opaque `border-focus`, so their composited contrast is 5.65:1 on white and at least 4.55:1 on the hover, pressed and selected surfaces; `visual-states` and `save-session` measure the rendered box-shadow ring against its surface. A current marker, error boundary or pressed face stays visible alongside it; no element shows an underline marker and a box together. Normal UI text meets 4.5:1 and required control/state indicators meet 3:1 against adjacent backgrounds. Decorative dividers and the rest/hover color difference are not required to meet 3:1. Formula typography belongs to KaTeX, whose internals are not restyled. IeumDoc sets only the overall size of inline math (`--math-inline-size`); display equations keep KaTeX's 1.21em. A content-sized IeumDoc wrapper and the enclosing block own horizontal formula scrolling. Tables scroll within their block. Document-wide clipping is prohibited.

The destructive Button variant uses `danger` text and border on `surface`, with `surface-danger` on hover. Keyboard focus retains the danger text and adds the shared blue border/ring. Text meets 4.5:1 and enabled boundaries/focus indicators meet 3:1. Native disabled destructive buttons use an opaque muted face, secondary text (still 4.5:1) and structural border rather than opacity dimming; focusable `aria-disabled` buttons keep the shared disabled treatment. For #276, only **Discard and reload** uses this variant. **Keep editing** remains the initial focus and the existing button order is preserved.

## State rules

| Axis | Expression |
| --- | --- |
| Rest | No paragraph input box, persistent Edit button or block extent outline. Gutter tools are hidden except the first `+` in an empty editable document; its drag handle stays hidden. No invisible pointer targets. Figure/Equation/Table authoring metadata is hidden, inert text positioned in the gap above its block, so it takes no space at rest and showing it moves nothing; node attrs are untouched. Captions, reference chips, errors and restrictions remain visible. |
| Hover | Gutter, typed-block Edit and metadata appear without moving text. The path from content to buttons remains inside the hover area. A pointer in a top-level block's vertical range inside the document host, including its gutter `+`/handle, shows a thin neutral outline overlay based on the drag-source rectangle, expanded by the adjustable inline/block gaps. Nested list items and table cells indicate their entire top-level block. Expansion gives the text breathing room, preserves clearance from controls/neighbors, and does not enlarge the hover hit area. The overlay captures no input and adds no border/padding to content. Document text input (including IME composition) and document-changing keydown commands hide only this neutral outline until the next real pointer movement; selection, transactions, scrolling and resizing alone do not restore it. Gutter, typed-block Edit and metadata keep their independent rules. It also disappears outside the host, between blocks and during a block drag, where the existing tint/drop line take priority. |
| Keyboard focus | Native editor caret/selection, visible control focus; Tab reveals tools using `:focus-within`. The document editing surface shows focus with the caret only, never a frame around the document. |
| Selected | Block selection outline and visible Edit access; selection opens no properties panel and never supplies a hover extent. Figure/Equation selected/editing interaction outlines retain their blue role and existing offset alongside the expanded neutral hover outline. Their painted outer corner radius matches the inset hover outline outer edge: the element radius is the shared hover radius minus the existing outline offset and outline width. Typing hides no selection/editing outline. |
| Editing | Form and editing outline persist independently of selection. |
| Dirty / invalid | Draft notices distinguish applied Save content from unsaved form input; validation preserves entered values. These do not replace hover/focus/selection. |
| Read-only | Source view stays read-only: monospace source lines soft-wrap within the available width, including unbroken URLs/words, without horizontal scrolling (#476). Each Markdown line has one subtle gutter number (generated content, never copied); unnumbered continuations align with its text. Wrapping inserts no source or copied characters/line breaks and never writes to the document. Unsupported documents are rejected at admission; in the Files tree a document without the native marker keeps its row in subtle text with a crossed-file icon and says so in its tooltip and accessible description. |
| Disabled control | Native disabled controls retain dimming. Focusable `aria-disabled` controls use a muted face, secondary text and structural boundary, preserving their tooltip, focus ring and Base UI activation guard. |
| No hover device | Gutter and Edit remain visible; the block extent outline is hidden under `(hover: none)`. |

These are independent axes, not a state enum. Visual interactions never write document attributes. Figure Apply/Cancel and the existing explicit Escape-to-Cancel behavior remain; selection changes and outside dismissal do not cancel an editing Figure. Cancel never removes a Figure.

## Document title (#255)

A document without a title shows Add a title above its first block in the H1 type (34/45.9px bold, document font) and the subtle text color, with no box at rest; hover darkens it to muted text and keyboard focus shows the 2px ring. It sits above the editable content rather than inside it, so it never takes the caret and is never document content. An empty title shows `Title` in the same subtle color, like the empty-document hint. The title's handle keeps the ordinary handle look; its tooltip explains that the title stays at the top.

## Empty document start (#133)

A single empty editable paragraph shows `Start writing, or type / to add a block.` at the actual text axis, in the document font and subtle text color. The first `+` stays visible even without hover or focus. Tiptap's Placeholder supplies a decoration; the hint is not content, is not selectable and never appears in Markdown, Source, Save or dirty comparison. Typing hides it; undo to the empty paragraph restores it. Source view and non-empty documents do not receive this starting state.

After New succeeds, Base UI's closing focus handoff targets the newly mounted editor, so typing starts immediately. Cancel/Escape, including after rejected creation, returns focus to the New button. Opening or reloading an existing file does not invoke the New handoff. The white space below the actual editor content still places the caret at the end through the existing engine operation.

The paper boundary is permanent and neutral, not a document focus ring. Top paper padding is 32px (16px at ≤1024px), inside the 16px canvas gap; the body and gutter keep their existing axes. These are display and focus changes only; Core, CLI and saved document meaning are unchanged.

Historical comparison evidence is preserved in the [visual review](editor-visual-refinement-v1-review.md#subsequent-visual-evidence).

## Start without a document (#174)

With no document open, the [start](editor-ux-shell-v1.md#start-without-a-document-174) is the app's start, not a document (#298): it never uses the paper. A centered column at most `--layout-start-width` (640px) wide sits on the canvas, 48px below the header, under the product mark (`--size-start-mark`, 32px) and the 14/20px semibold muted name `IeumDoc`. A 24px semibold UI title, 14/20px muted explanation and 28px actions (Open folder… primary; choose a file in the sidebar after opening the folder) lead; the Recent folders, Recover unsaved work and Sample sections follow as white cards with a `border-subtle` edge, 8px radius and 16px padding. Section labels are 12/16px semibold subtle text. A recent folder is a 32px row whose folder icon sits on the text axis: its name, then its full path in 12/16px subtle text, both ellipsized, with the full path in `title`; hover uses the neutral hover surface and keyboard focus the solid 2px inset ring. Open sample document is an outlined secondary action. The column keeps a 16px inline inset at every width, and a label wider than a card wraps inside its button, so nothing leaves the screen at 375px.

## Writing end space (#173)

The paper's bottom padding is the end space, 35% of the viewport height, so the last line can be scrolled well above the bottom edge without adding blank lines. Writing keeps the caret at least that far above the window bottom: ProseMirror's `scrollThreshold`/`scrollMargin` read the paper's bottom padding for their bottom side and keep their defaults on the other sides, so the line being written stays near the middle instead of the bottom edge. Like the rest of the blank paper, a click in the end space places the caret at the end, with the same room. The end space is presentation only and never reaches Markdown, Source, Save or dirty comparison. `new-document` writes past the window at 1440×900 and checks the caret, the scrolled end and the saved file.

## Filename and status

The centered TopBar command-center button shows where the open document is: its folders (from the outermost opened sidebar folder containing it down, otherwise its own folder) in muted text with subtle `/` separators, then its name in semibold. The tab row below names the document too; the TopBar adds its place. Folders ellipsize first, then a long name; the complete unchanged path stays in `title`. The status sits in its own left cell; narrow headers give the command center a separate centered row and phone widths give nonempty status its own row (#363). Open/New still receive the original address. A loaded clean document has no idle text. Unsaved document changes or unapplied drafts show `Unsaved changes`; the display reads the existing baseline comparison and draft signals. `Saved` appears only after a successful save while no edits remain (including undo back to that saved baseline). Saving, load/save errors and conflict retain their existing operation text/UI. The status does not imply autosave.

## Shell and control rules — v3 (2026-10-08), v4 and v4.1 (2026-10-10)

The shell distinguishes current location, hovered alternatives, pressed/open controls and keyboard focus with static states. Save alone adds a reduced-motion-aware progress spinner.

Folder-section disclosure (#425) uses the same right/down ChevronRight as child folders in the
heading's icon slot, inside the existing compact ghost Button. It remains visible at rest so
collapsed content is discoverable; neutral hover and the shared keyboard focus ring follow the
control rules. It adds no new color, size or adjustable value. Name typography, wrapping and
New/More actions stay in place. See [section behavior and evidence](editor-ux-shell-v1.md#collapsible-folder-sections-425).

| Area | Rule |
| --- | --- |
| TopBar | Centered: a neutral bordered command-center button with search icon, location/name and shortcut hint. Left: status. Below a 56rem header width the center has its own row; the sidebar/panel headers keep their height. A status appearing never moves a control; `layout-rules` asserts a 0px shift. Right, in order: view (Visual/Source, Outline), file actions (Save, File actions `⋯` with Reload), with 12px between groups and 4px within them. A clean Save is an ordinary available ghost action, like the closed File actions menu: no face at rest, the neutral hover face, the focus ring. It takes the accent with unsaved changes. An unavailable Save keeps the disabled face (muted face, muted text, structural boundary) and does not react to hover; its tooltip remains. While saving, Save keeps its place, width and accessible name, showing a spinner over a transparent label. The separate status text alone reports `Saved`. The blue horizontal marker means "current place" only (document tabs, sidebar tool). Visual/Source is a segmented control: a `surface-pressed` track with the chosen view as a raised white segment (structural border and `--shadow-segment`) in dark text, the other view in muted text that darkens on hover without a face. Outline, when on, is a pressed toggle with the `surface-selected` face and selected icon color (`surface-selected-hover` on hover), without a marker or control boundary; the File actions menu uses the shared neutral open-menu face, without a boundary. Hover and focus preserve these states. |
| Document tab row | White header surface with a structural bottom rule. 14px regular filename, a fixed dirty-dot slot, and 28px close target with a 16px icon. Active uses dark text and the shared horizontal interaction marker; hover uses the neutral surface and keyboard focus uses the inset ring independently. Long names ellipsize, full paths remain tooltips, and parent folders distinguish equal names: the distinguishing folder follows the filename in 12px subtle text and keeps its width (up to half the label), so the filename ellipsizes first. Tabs never move Save into their horizontal scroller. |
| Sidebar and Document panel | One current rule for both the open file and section being read: selected surface, selected text and a 3px vertical interaction marker. Hover uses the neutral hover surface; current+hover uses selected-hover and keeps the marker. An independent inset focus ring is not clipped by the scrolling lists. Current does not change font metrics or text placement. The folder and Outline headings remain 14px semibold; ordinary rows remain 14px regular. Folder icons/chevrons, wrapping/indent limits and compact ghost actions retain their behavior. Files/Display buttons switch the left panel contents within its existing width. The active tool shows only its horizontal interaction marker: no face and no border while its content is expanded; hover adds the neutral hover face. Closed, the rail keeps both icons with accessible names/tooltips. Files retains its tree when hidden. The expanded Sidebar header keeps one Open folder… ghost icon button before Collapse sidebar, regardless of folder count or selected tool (#385). Its 28px target, 16px icon and 4px group gap use existing product tokens; the neutral hover face and keyboard focus ring follow the shared control rules. Accessible name and tooltip use the same English/Korean translation. Empty Files retains guidance/recent folders without a duplicate Open button, and per-folder menus contain only Close folder. See the [same-state capture review](editor-ux-shell-v1.md#sidebar-open-folder-entry-385). Display identifies its target filename and separates Saved in document from Local view using section labels, 24px spacing and secondary scope help. Native checkboxes show their actual checked state, use the interaction color and an explicit keyboard focus ring; disabled numbering keeps a readable reason. Shared Settings stays in its separate footer. |
| Controls | Base UI and native controls share 6px radii, 32px standard/28px compact targets and 16px icon slots. Ghost rest is transparent; hover is visible on a panel as well as white paper. Open menus, including TopBar File actions, use only the neutral pressed face, without a control boundary; tabs and toggles with an interaction marker (sidebar tools) take neither face nor border when open or on; the on Outline toggle takes only its selected face. Secondary/Cancel uses a white outlined face, with neutral hover. Refs, events and selection preservation are retained. Controls and overlays change state without decorative transitions, pressed movement or enter/exit animations. Save alone keeps its reduced-motion-aware progress spinner. |
| Forms and overlays | White fields have a control boundary, visible labels, secondary helper text, explicit errors and separated actions. Dialog titles are 16px semibold. Native selects share the field box and end in a 16px chevron. A refused Open first says in plain words why and what to do, then shows Core's exact reason and action as 12/16px details beside a structural rule. Open/New/Folder retain and associate their error messages. Refused Open descriptions use `overflow-wrap: anywhere` so unbroken names and Core detail paths do not enlarge the intrinsic grid width. An invalid New filename has an error boundary alongside focus; operation failures such as unsaved-work protection do not mislabel valid field values. Menus, dialogs and properties alone use the restrained overlay shadow. The continuous document uses its separate, gentler paper shadow. |
| Color | Interaction (`interaction`, selected roles): focus, selection, current item, drag. Content (`info`, `surface-info`): links, references, informational callouts and notices. Most chrome stays neutral; the current document tab and sidebar tool carry the interaction marker, the on Outline toggle the selected face. Brand and danger meanings remain unchanged. |
| References | Read like links: content color, no box or fill; underline on hover, dashed underline and subtle color when unresolved. An unresolved reference explicitly reads `Unresolved reference: label` (localized), without a guessed kind prefix. Deleting a referenced target uses the existing transient MessageArea notice with platform-appropriate Undo guidance (Ctrl+Z / ⌘Z); explicit table deletion instead uses the table deletion notice and Undo action below. Selected uses the interaction axis. Citations use the same numeric text and selected treatment, with subtle dashed text for unchecked, incomplete, missing or duplicate resources; complete limited IEEE entries use content-link color without an underline. Their accessible label/tooltip gives exact keys and Core readiness in the chosen UI language; there is no navigation. |
| Table deletion notice | Reuses the informational MessageArea surface, message text and action spacing, with one compact ghost Undo button. English/Korean text uses the shared typography and translations. No confirmation dialog or focus transfer on appearance; the polite status notice expires under the [table interaction contract](table-interaction-v1.md). No new color, size or overlay system. |
| Slash reference choices | Use the existing menu row, typography, icon and selected state. Show template-based text (defaults: `Figure 2 · caption summary`, `Table 1 · caption summary` or `(3) · label`); a missing Figure/Table caption falls back to its label. Long captions are summarized, while the full caption remains searchable. Section names retain `Section reference: heading text`. [Search/display contract](section-references-v1.md#editor). |
| Callouts | Side bar and surface carry the kind; no full outline. |
| Authoring metadata | Section labels (`(label)=`) follow the Figure/Equation metadata rule: hidden and inert at rest, out of layout (no space between blocks), shown with their heading on hover, focus or selection. Clicking the shown label edits it. |

Historical comparison evidence is preserved in the [visual review](editor-visual-refinement-v1-review.md#subsequent-visual-evidence).

### Reviewing a visual change

A change to the Editor's look or a new visible control states which rule above (or in v1) it follows, or updates this document in the same PR. Compare the same states before and after:

1. Capture the clean base before editing and preserve its files separately, or check out the base in a second worktree and start its dev server on a free port (for example 5174).
2. In each checkout, run `pnpm browser:test quiet-document --screenshots` against that checkout's own server; in the base worktree set `IEUMDOC_BROWSER_URL=http://127.0.0.1:5174`. Fixtures and captures belong to the checkout that runs the command.
3. Compare the captures in each checkout's `tmp/visual-refinement/` and attach the representative pairs to the PR.

IeumDoc keeps one stylesheet; comparison captures do not need a runtime old/new theme toggle. Record the actual HEAD, viewport, DPR/zoom, scroll/interaction state and font environment. CSS studies and mockups are not product Before images.

### Korean document wrapping #506

`pnpm browser:test quiet-document --screenshots` extends the existing typography scenario.
Before changing CSS, its new Range-based assertion failed on the base
`48aabb312a0c8cb71c620747d5d25f370f2b7817` at 375px: words such as `측정하여`,
`출력전류의` and `측정결과를` crossed line boxes. It passes after the change.
The scenario measures each Korean word's Range rects across all supported prose surfaces
and the technical paragraph's individual characters, requiring line starts/ends at spaces.
It also checks closing CJK punctuation, URL bounds in a paragraph and table cell, a
constrained real table cell that forces the URL to wrap, caret placement by clicking a
wrapped-line start and keyboard selection across lines (native DOM result immediately,
exact engine positions/text after its `selectionUpdate` event), native Chromium composition at the
preceding line end, and exact document restoration by Undo.

Same-state product captures below are **manual review only**, not screenshot assertions.
Windows Chrome 155, bundled Pretendard Variable, 1440×1000 / 375×1000, DPR 1, zoom 1,
scroll 0, no selection/hover, no folder displayed; Outline is open on desktop and closed
by the existing phone layout. The input is the committed
[Korean technical fixture](../../apps/editor/test/browser/fixtures/quiet-document-wrap.md).
Only wrapping changes: font sizes, spacing, paper and shell rules are unchanged.

| Width | Before | After | Manual observation |
| --- | --- | --- | --- |
| 1440px | [PNG](assets/korean-wrap-506/before-1440.png) | [PNG](assets/korean-wrap-506/after-1440.png) | Same layout and line endings; files have the same SHA-256. The paragraph already happened to break at a space. |
| 375px | [PNG](assets/korean-wrap-506/before-375.png) | [PNG](assets/korean-wrap-506/after-375.png) | Body, list, quote and callout words now move intact; the title and heading retain word wrapping. The technical paragraph grows from seven to eight lines. No stranded closing punctuation was observed. |

[Measurements and capture hashes](assets/korean-wrap-506/verification.json) preserve the
baseline failure and passing result. A wide table still uses the existing local scroller;
this change does not replace its intrinsic column sizing. The separate constrained-cell
probe verifies emergency URL wrapping rather than accepting an arbitrarily wide cell.
The [overflow-wrap definition](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow-wrap)
explains why `anywhere` is retained instead of `break-word` for intrinsic sizing.

Local coverage is Chrome/Chromium; Electron consumes the same stylesheet, but its rendering
was not separately exercised locally. Native CDP composition checks text, caret and Undo,
not the Windows IME candidate window. OS IME candidate placement remains a manual check.
No new Core/CLI operation is needed for CSS-only presentation.

### Typing and outline verification #469

Only the neutral pointer-hover outline is suppressed on document `beforeinput`, IME
composition start and document-changing keydown commands. Capture and bubble listeners on
the editor element bracket ProseMirror keymaps; a `docChanged` transaction during keydown
suppresses the outline without enumerating keys (Enter, Shift+Enter, boundary deletion and
indentation). Selection-only navigation does not trigger suppression. Gutter controls keep
their active/menu rules; typed-block Edit and authoring
metadata retain their CSS hover/focus/selection rules. Selection and editing outlines, drag
feedback and `(hover: none)` keep their existing behavior. This is Editor interaction only;
Core/CLI semantics and document layout are unchanged.

`quiet-document` first failed against base `c2329159016cdae6183885bd24de2bd8a8046e1e`:
`hiddenAfterTyping=false`, `hiddenAfterLayout=false`. Independent review of `18b851e` found
two remaining gaps. New assertions failed on that head: Enter and Shift+Enter changed the
document but left the outline visible, and both Figure/Equation measured a 9px selection
outer radius (4px element + 4px offset + 1px outline width) against an 8px hover outer radius.
The earlier radius comparison omitted stroke width and incorrectly claimed an outer-edge match.

The corrected shared hover radius is 9px. The selection outline's outer radius includes both
offset and stroke width; the hover stroke is inset, so its outer radius is the overlay radius.
Both are computed from actual styles on this same outer-edge basis. Existing rectangle offsets,
stroke widths, blue color and the selection element's 4px radius remain unchanged; the outer
corner radii match, while the deliberately different overlay rectangles retain their spacing.
The test also checks immediate input/IME suppression, Enter/Shift+Enter suppression with real
document changes and Undo, navigation retaining hover, restoration on pointer movement,
transaction/resize suppression, unchanged metadata/Edit access and 0px block movement while
typing; existing no-hover and drag checks remain.

Manual comparison: same scratch document, selected block and pointer hovering it, 1440 × 1000,
DPR 1, 100% zoom, scroll (0, 0), Windows Chrome 155.0.8059.85 headless, bundled Pretendard
Variable (verified with the existing CDP glyph-font check). Before uses the base above;
After uses the reviewed correction in this change. The refreshed After capture uses the explicit
`IEUMDOC_BROWSER_URL=http://127.0.0.1:5179` server, whose PID command line and document API path
were verified to belong to this worktree, with `pnpm browser:test quiet-document --screenshots`
and its persistent profile. Only the neutral corners become rounder to follow the
blue outline's outer curves; text, captions, tools and block positions stay aligned. The existing
horizontal/vertical overlay offsets remain. These images are manual review evidence, not
pixel-diff assertions or a substitute for user visual approval.

| Selected + hovered at 1440px | Before | After |
| --- | --- | --- |
| Figure | [Before](assets/hover-outline-469/before-1440-figure-selected-hover.png) | [After](assets/hover-outline-469/after-1440-figure-selected-hover.png) |
| Equation | [Before](assets/hover-outline-469/before-1440-equation-selected-hover.png) | [After](assets/hover-outline-469/after-1440-equation-selected-hover.png) |

## Adjustable values and preferences

- Document presentation (#497): the following document-only tokens retain the previous
  values exactly. Changing them does not change Sidebar, button or dialog typography.
  Embedded UI buttons explicitly retain the UI font stack; the start-screen title uses
  separate `--font-size-start-title` / `--line-height-start-title` UI tokens.
  Native table tools use the UI stack and `--line-height-table-tool`, retaining their
  original 20.4px line box independently of document preferences.

  | Controls | Adjustable variables |
  | --- | --- |
  | Body | `--font-family-document`, `--font-size-document`, `--line-height-document` |
  | Document prose word boundaries (oversized-token fallback remains `anywhere`) | `--word-break-document` (`keep-all`) |
  | H1–H6 sizes (H1 also controls the title slot) | `--font-size-document-h1`, `--font-size-document-h2`, `--font-size-document-h3`, `--font-size-document-h4`, `--font-size-document-h5`, `--font-size-document-h6` |
  | Heading/title-slot weight and line spacing | `--font-weight-document-heading`, `--line-height-document-heading` |
  | Heading margins (title slot uses the after gap) | `--space-document-heading-before`, `--space-document-heading-after` |
  | Top-level paragraph, list, quote, equation, code, figure, table and admonition gap | `--space-document-block` |
  | List/quote indentation | `--space-document-list-indent`, `--space-document-quote-indent` |
  | Quote/admonition left accent rule | `--size-document-side-rule` |
  | Figure/table caption size, line spacing and gap | `--font-size-document-caption`, `--line-height-document-caption`, `--space-document-caption` |
  | Table text and cell padding | `--font-size-document-table`, `--line-height-document-table`, `--space-document-table-cell-block`, `--space-document-table-cell-inline` |
  | Code block size/line spacing; inline code size (line spacing inherited) | `--font-size-document-code`, `--line-height-document-code`, `--font-size-document-inline-code` |
  | Endnote size, line spacing, region separation, internal gap and number inset | `--font-size-document-endnote`, `--line-height-document-endnote`, `--space-document-endnotes`, `--space-document-endnote-gap`, `--space-document-endnote-indent` |
  | Navigation indentation per level (separate from document text) | `--space-sidebar-tree-indent`, `--space-outline-indent` |

  The endnotes separator label remains UI metadata. Existing depth caps, row insets and
  other structural dimensions are unchanged. These are hand-tuned variables with no new
  preference UI, Core operation or CLI command: they change presentation only.
  See [same-state comparison](#document-presentation-token-verification-497).

- Image picker (#480): `--layout-folder-picker-preview-height` (10rem / 160px) bounds the
  active image below the list at desktop widths. Below the existing `40rem` phone boundary the
  preview collapses, preserving the list and action space. Its structural border, subtle surface,
  radius, 12px helper inset and muted text reuse existing product tokens. It adds no control;
  the image keeps its aspect ratio and the dialog retains its viewport scrolling.

Values meant to be tuned by hand, or that change with a user's taste, are shared variables, never numbers repeated in rules or scripts.

- They live at the top of `styles/tokens.css` under **Adjustable values**, each with a comment saying what it controls. Changing one value there changes the Editor; tests read the variable instead of pinning its number.
- A user preference switches between such variables (a class on `.app-shell`); it does not compute or store pixel values. Preferences are kept by `src/preferences.ts` in this browser's storage, never in Markdown, front matter or the Host. They are display choices, not document semantics, so Core and CLI do not know them.
- Current entries: `--layout-content-width` (Standard document column, 928px) and `--layout-content-width-wide` (Wide document column, 1280px, capped by the window). The Wide document checkbox in Sidebar Display chooses between them.
- Paper surface entries (#226): `--id-color-canvas` (`#eceef2`), `--id-radius-paper` (0.375rem / 6px) and `--shadow-paper` (`0 2px 8px rgb(32 36 44 / 6%)`) distinguish the white paper with a slightly darker neutral canvas, small corners and gentle elevation. Visual and Source share this paper treatment; the start without a document deliberately does not (#298). Panel surfaces, control/overlay radii and `--shadow-overlay` retain their own roles. These are hand-tuned values, without a new preference control or theme.
- Block hover entries (#225): `--id-color-block-hover-outline` aliases the neutral `border-strong` role (`#bbc2cd`), `--size-block-hover-outline` is 1px, and `--id-radius-block-hover` is the small radius plus the existing selection outline offset (`space-1`) and outline width (`border-width`), currently 9px; Figure/Equation use this shared value minus their offset and width for their element radius, so the painted outlines have matching curves. `--space-block-hover-inline` aliases `space-2` (8px per side) and `--space-block-hover-block` aliases `space-1` (4px above/below), expanding only the overlay for breathing room around text. The expansion keeps gutter controls clear and fits within block gaps; one hovered extent is shown at a time. These hand-tuned values have no preference control; CSS and browser checks read the variables. Selection/editing keeps its blue role and text moves 0px.
- Paper padding entries: `--layout-document-block-padding` (32px) and `--layout-document-block-padding-narrow` (16px at ≤1024px) at the top, and `--layout-document-end-space` (35% of the viewport height) at the bottom, which also sets how far above the window bottom writing keeps the caret. The existing `--layout-content-gutter` supplies the outer canvas gap; the minimum paper height deducts that gap and the measured header rather than fixing a page size.
- Sidebar entries: `--layout-sidebar-width` (expanded, 240px) and `--layout-sidebar-width-narrow` (expanded at ≤1024px, 200px). The collapsed rail is fixed.
- Command-center entries: `--layout-command-center-width`, `--layout-command-center-popup-width` and `--layout-command-center-list-height` control preferred widths and list height. The 56rem/27rem container breakpoints are layout transitions, not preferences.
- Tab entries: `--layout-document-tab-height` (40px) and `--layout-document-tab-max-width` (256px, capped by the row) control the separate header row. Labels and buttons use existing spacing/type/icon/compact-control tokens.
- Document panel entry: `--layout-document-panel-width` (256px), docked or overlaid.
- Typography entry: `--font-feature-sans` (`"cv08"`), Pretendard's serifed capital I for UI and document text.
- Overflow entry: `--size-overflow-fade` (32px), how far a wide table or formula fades out at an edge with more content to scroll to.
- Start entries (#298): `--layout-start-width` (40rem / 640px), the centered start column, and `--size-start-mark` (2rem / 32px), the product mark above its title.
- Inline math entry: `--math-inline-size` (1.1em of its text). KaTeX's own 1.21em reads larger than Pretendard body text and, with integral or sum limits, makes a line taller.
- Derived bibliography: one section after endnotes, document font and body line-height, metadata heading/status, `--space-6` separation, `--space-3` top inset, existing subtle rule. Number and wrapped text use a flex row with `--space-2` gap. No new adjustable dimension. [Contract and captures](citations-v1.md#unit-b-verification-265).
- Bibliography connections (#438): a trailing References action even without citations; compact ghost Connect/Disconnect controls, outlined file choices and metadata helper/status text use existing tokens. Long file choices ellipsize inside the panel, with the full filename in the title and accessible name. No new adjustable dimension. [Contract and verification](citations-v1.md#connect-and-disconnect-bibliography-files-438).
- Reference entry: `--reference-underline-offset` (3px), shared by references and unchecked citations. Citation groups wrap with ordinary inline content.
- Citation form: the reference form surface, select, input and buttons. Its ordered key chips use the standard border, `--id-radius-sm`, `--space-1`/`--space-2` and small text, and wrap long keys. No new adjustable dimension. [Contract and captures](citations-v1.md#unit-c-verification-265).
- Folder picker entries: `--layout-folder-picker-width` and `--layout-folder-picker-list-height` control the dialog and its scrollable list. Recent folder paths are browser navigation preferences; they do not alter the document or restore a sidebar folder on reload.
- File preview entries: `--layout-file-preview-width` (48rem) and `--layout-file-preview-image-max-height` (60dvh) control the preferred modal width and image height cap. The existing viewport inset still bounds the modal.

Shortcut labels in the existing TopBar key chip and button tooltips use the platform notation
from the [shared definitions](../../apps/editor/src/shortcuts.ts), also used for ARIA and command
items. The two-key center label (Ctrl+/ or ⌘/) uses the existing chip and responsive layout; no new control,
surface or adjustable dimension is introduced. The [shortcut contract](editor-ux-shell-v1.md#shortcut-contract-381)
owns key choices and behavior.
Shortcut labels denote characters. Keyboard layout may put a character on another key or leave no
unshifted, unreserved combination; the existing buttons remain available. The tooltip/ARIA text
does not promise that a US physical key position works on every layout.

## Responsibility boundaries

Recovery uses the existing start-screen section/label/text roles and compact secondary Review action, with wrapping names/paths and dates. The empty state is plain explanatory text. Restore/incompatible prompts use the shared Dialog, primary Restore, destructive Delete and secondary Not now (initial focus), a selectable plaintext disclosure, and existing stacked narrow-screen footer. Review paths use `overflow-wrap: anywhere`, like deletion confirmations, so long unbroken Windows paths contribute wrapping opportunities to intrinsic grid sizing; the path and all footer actions remain inside the popup at phone widths. Shared spacing, compact control sizes and desktop footer direction are unchanged (#395). Settings uses its existing section rhythm; Clear all uses the shared deletion confirmation Dialog. Failures use a standing MessageArea warning, not an expiring notice. There is no start-screen redesign or new theme.

Shared Settings/Local recovery and Desktop About reuse the existing dialog, Button and Notice components and product spacing/type/surface tokens. The Sidebar footer uses the existing compact ghost target; the native channel radios and progress use the interaction color. Status is plain text and actions wrap within the dialog. Update notices use the existing information surface with View/Restart and Later actions. No new visual theme or document state is introduced. [Desktop contract](desktop-distribution-v1.md) owns the behavior.

- **Product tokens** own role values. `index.css` maps them one way to shadcn/Tailwind. Product colors/radii use `--id-*` names so generated Tailwind names cannot override them. No cycles, duplicate role definitions or `!important`.
- **Controls** enter through `components/ui`. Base UI Button owns shared button behavior, refs and disabled/focusable-disabled semantics. Document-specific native controls keep their interaction policy. Notice remains independent.
- **Document container** owns width, content axis, external spacing and gutter. **Blocks** own inner arrangement and necessary local scrolling. The two 28px gutter controls have a 4px gap and 12px separation from text.
- **Overlays** own their existing focus/dismissal policy. Overlay maximum height deducts the measured header, including tabs and messages; a constrained command menu scrolls to keep its final action reachable. The small `useOverlayBounds` helper only translates existing editor overlays inside viewport/header bounds; it introduces no focus framework or document state. Base UI owns Figure and dialog collision handling.

| Overlay | Focus / Escape / return |
| --- | --- |
| Slash menu | Focus stays in editor; arrows select; Escape dismisses query UI. |
| Gutter command menu | Button opening focuses first item; Escape closes; return to connected opening control when no other focus has been chosen. |
| Selection toolbar | Pointer actions preserve editor text selection. Tab from a text selection enters its first button when no table or list Tab applies; the toolbar stays while focus is in it. Escape, or Shift+Tab from the first button, returns to the editor with the same selection. Leaving both hides it. |
| Link / inline math / reference | Input/select receives focus; existing blur dismissal and Escape close are retained; explicit close returns to editor. |
| Figure | Selection keeps editor focus; explicit Edit autofocuses Image. Outside/selection dismissal never closes a draft. Explicit Apply/Cancel or existing Escape in its form completes it. |
| Equation | Inline source form and preview; existing Apply/Cancel/Escape semantics. |
| Block properties (Figure, Equation, Table, section label) | Actions read Cancel, then Apply (primary last), like dialogs. Edit focuses the first field. Apply/Cancel/Escape return focus to the editor at the block: a selection inside it stays, otherwise the block is selected. Cancel of a never-applied Equation leaves the caret in the text before it. A Figure Apply whose validation finishes after focus has moved elsewhere does not take it back. |
| Open / New | Base UI modal focus boundary and Escape dismissal. New success hands focus to the first paragraph; Cancel/Escape or rejected creation returns it to the New button. New folder always returns focus to its button. Open folder… returns focus to its opening control: the Sidebar header button, start-screen button, or the prior focus target when dispatched through the command center (trigger for a click, original focused element for a shortcut). Folder menus contain no Open folder entry (#385). |
| Document panel (overlay below 1280px) | Below the header, so it never covers TopBar actions or messages. Opened from the TopBar Outline toggle, which keeps focus; Escape inside the panel or Hide outline closes it and returns focus to the toggle. No focus trap: it is navigation, not a dialog. |
| Full-screen sidebar (below 640px) | Opened from the TopBar's Expand sidebar, it covers the screen without a focus trap and focuses Collapse sidebar. Escape inside it (after Display's own Escape) or Collapse sidebar closes it and focuses the TopBar's Expand sidebar; opening or creating a document from it closes it. Portaled menus and dialogs keep their own Escape. |
| Sidebar Display | Files/Display remain reachable collapsed. Selecting a tool keeps focus on its button; Tab enters its content. Escape from Display returns to its button without changing the tool, values or document. |
| Command center | Shared Dialog near the top center, max 36rem wide and bounded by the viewport. Base UI Combobox owns highlighting, arrows, Enter and IME; Escape/outside dismissal returns to the opener without editing. A command opening another modal hands off focus after close. The search and results use existing input/control/type/surface tokens; results scroll within the popup. |
| File actions `⋯` / Reload, Copy path | Base UI Menu owns navigation/dismissal. Copy path writes the document's full path to the clipboard and confirms with a temporary notice; where the browser offers no Clipboard API (a non-HTTPS remote page), it shows an error that explains this instead. Reload opens the existing work-loss confirmation when needed; cancel, Escape or successful loading returns to the File actions trigger. |
| Unsaved changes confirmation | Shared Dialog surface, 16px padding, 12px paragraph gap and compact 28px Button actions. Save uses the primary role; Don't save uses `destructive`; Cancel uses `secondary` and receives initial focus. Actions stack on narrow screens using the existing footer. Cancel/Escape/outside dismissal restores the invoking control; pending close-Save disables actions and dismissal. Successful tab close focuses the active neighbour (or the start action after the last tab); New and unsupported-Open alerts retain their existing dialog focus. Draft-loss guidance is ordinary description text, not another warning bar. The description uses `overflow-wrap: anywhere` to keep long unbroken filenames and footer actions inside the popup. |
| Recovery deletion confirmation | The same shared Dialog header/description/footer, secondary Cancel with initial focus and compact destructive Delete action. Identify one record by full path, or all local records, and explicitly state that deletion cannot be undone. Long paths wrap within the popup at phone widths. Cancel/Escape/outside dismissal returns focus to the invoking delete/clear button; pending deletion disables actions and dismissal. |
| Folder `⋯` menu | Base UI Menu: Enter/Space or click opens it, arrows move between items, Escape or an outside click closes and returns focus to `⋯`. An item that opens a dialog hands focus to the dialog, whose closing returns it to `⋯`. |

## Evidence and verification

### Document presentation token verification (#497)

Scope: value extraction only, with no default visual change. Baseline is
`6352fa661b5e4583db75597e70c146cd4e815646`. A disposable native Markdown file extends
the existing quiet-document fixture with nested/ordered lists, a quote, inline code, a
code block, a captioned table and two endnotes. It also contains the title, H2–H6,
paragraphs, admonitions, captioned figure and equation. The Sidebar expands
`nested/child/leaf.md`; the Outline shows the nested headings.

Manual captures used `pnpm browser:test` in this worktree with its persistent Chrome
profile and its own Vite server at `127.0.0.1:5297`. Both runs use Windows Chrome 155,
1440×1000 / 375×1000 viewports, DPR 1, 100% zoom, scroll top, no editor focus or hover,
and loaded fonts/images. The document-only capture closes the Outline; the Outline
capture opens it (docked at 1440px, overlaid at 375px); the phone Sidebar capture opens
the full-screen Sidebar. The existing quiet-document regression checks actual bundled
Pretendard glyphs. Captures are manual review artifacts, not new screenshot tests.

| State | Before | After | Comparison |
| --- | --- | --- | --- |
| 1440px document | [PNG](assets/typography-497/before/capture-1440-document.png) | [PNG](assets/typography-497/after/capture-1440-document.png) | Byte-identical, 0 pixels changed |
| 1440px document + Outline | [PNG](assets/typography-497/before/capture-1440-document-outline.png) | [PNG](assets/typography-497/after/capture-1440-document-outline.png) | Byte-identical, 0 pixels changed |
| 1440px nested Sidebar | [PNG](assets/typography-497/before/capture-1440-sidebar.png) | [PNG](assets/typography-497/after/capture-1440-sidebar.png) | Byte-identical, 0 pixels changed |
| 375px document | [PNG](assets/typography-497/before/capture-375-document.png) | [PNG](assets/typography-497/after/capture-375-document.png) | Byte-identical, 0 pixels changed |
| 375px document + Outline | [PNG](assets/typography-497/before/capture-375-document-outline.png) | [PNG](assets/typography-497/after/capture-375-document-outline.png) | Byte-identical, 0 pixels changed |
| 375px nested Sidebar | [PNG](assets/typography-497/before/capture-375-sidebar.png) | [PNG](assets/typography-497/after/capture-375-sidebar.png) | Byte-identical, 0 pixels changed |

Comparison uses complete PNG byte equality (`Buffer.equals`) and SHA-256, which also
proves pixel equality. The [comparison manifest](assets/typography-497/comparison.json)
records each pair's hashes, dimensions, environment, fixture/style input hashes and
selector coverage. Deep equality of the collected [before](assets/typography-497/before/styles.json)
and [after](assets/typography-497/after/styles.json) computed styles also passes: font
family/size/weight, line-height, margins, padding and side-rule width for the document
blocks and navigation. This evidence does not imply coverage of every possible document
or operating-system font fallback.

`layout-rules` now reads document typography variables and temporarily overrides the
document size/family to verify that Sidebar, Outline, Save, embedded Figure/Equation
buttons and dialog typography stay unchanged. `footnotes` reads endnote variables for
type, spacing and number inset. Editor tests (289), typecheck, Editor build and the
layout-rules/quiet-document/footnotes browser regressions pass.

PR #500 P2 follow-up: the expanded isolation check also covers native table row/column
handles, Append row/column, the table action bar, code-language input, Figure/Equation/
table metadata, section-label controls and reference-edit icons. With the original
`d1b8717` styles, overriding the document family to monospace and line-height to 2
reproduces the table tools changing from Pretendard / 20.4px to monospace / 24px.
The fixed styles retain the UI family and original line box; layout-rules and
quiet-document pass. Code-language and block metadata already have explicit UI family
and line-height. Section-label controls inherit fixed monospace metadata typography;
property inputs, equation LaTeX, reference/citation forms and menu buttons inherit their
UI dialog/toolbar typography (LaTeX stays monospace). Reference-edit icons now explicitly
use the UI family and keep their zero-height icon line box; their em positioning still
follows the reference text, while the visible SVG size is independent of document type.
The title slot, equation numbering, inline reference text and endnote numbers remain
document presentation rather than UI controls.

After incorporating master `288375d` (#498 Keyboard shortcuts dialog), the P2 fix keeps
the 1440×1000 hovered table and Figure states byte-identical to `d1b8717` (0 changed
pixels), including visible row/column handles, the table action bar and authoring
metadata. The collected control styles are also identical; table-tool line-height is
exactly 20.4px. The [P2 comparison manifest](assets/typography-497/p2/comparison.json)
contains hashes, viewport/state, style inputs and merge base. Manual review pairs:
[table before](assets/typography-497/p2/before/table-block-1440.png) /
[after](assets/typography-497/p2/after/table-block-1440.png),
[Figure before](assets/typography-497/p2/before/figure-1440.png) /
[after](assets/typography-497/p2/after/figure-1440.png).
The [baseline isolation failure](assets/typography-497/p2/baseline-isolation-failure.json)
records the regression using the final expanded test against `d1b8717` styles.
After restoring those baseline files for the negative control, the Vite server was
restarted to remove a stale imported-token compilation; the served CSS was checked for
the UI token before the final successful isolation/capture run.
Post-merge local verification: Editor tests (290), typecheck, Editor build, docs check,
layout-rules, quiet-document, editor-shell and command-center browser regressions pass.

[Static UI v3 verification and same-state product captures](../reviews/static-ui-v3-2026-10-08.md) preserves that refinement's baseline, measurements and limits.

[Review record and actual Before/After](editor-visual-refinement-v1-review.md). `quiet-document-reference.png` is the mockup; `quiet-document-before-*` / `quiet-document-after-*` are original v1 Editor captures, and `quiet-document-final-*` are the final polish captures.

`pnpm browser:prepare` copies `test/browser/fixtures/quiet-document*.md` and the existing local diagram into `tmp/quiet-document`. `pnpm browser:test layout-rules quiet-document` measures actual DOM, captures real API-backed documents and checks focus, draft retention, local overflow and overlay bounds. Required elements are asserted, never substituted with zero; sidebar icon/label checks are explicitly inapplicable when collapsed. Before/After use 1440×1000 / 1024×1000 / 768×1000, 100% zoom, scroll top and equivalent interaction state after fonts/images load.

This is one implemented light presentation. Responsive popover placement, operating-system font fallback and the existing sample diagram intentionally differ from the mockup. No theme variants, fake navigation or proposed product features are included.


### Read-only file preview (#217)

The Sidebar keeps its existing row geometry and 16px icon slot: Image for supported images, File for
other files, and existing native/foreign document icons. A shared modal uses the existing Dialog
surface, title, description, compact Close button and spacing tokens. Name/path use `overflow-wrap: anywhere` so long unbroken text stays inside the intrinsic grid width; the image
contains within the available width and 60dvh, and the dialog stays within the viewport at wide and
phone widths. Loading and failure use ordinary status/alert text. Close/Escape returns to the invoking
row while document selection and property drafts remain. File information has no edit/open/execute action.

#### #217 verification and captures

The final SVG handler and token-based CSS were captured and tested at clean code HEAD
`aad457a46a6ab98c9948fc828adc405c2debbb49` on Windows/Chrome, DPR 1, 100% zoom and bundled
Pretendard. This evidence commit changes documentation/assets only. The earlier Before captures
were taken with HEAD `811a5662a2c69d804b0d0f419f2d84a4b4df054d` and its unchanged product code (only the failing regression test and
ignored plan were being prepared). Quiet Document rest states use scroll top and loaded fonts/images.

| State | Before | Final After / new UI | Viewport |
| --- | --- | --- | --- |
| Quiet Document, wide rest | [Before](assets/file-preview-217/before-1440.png) | [After](assets/file-preview-217/after-1440.png) | 1440×1000 |
| Quiet Document, narrow rest | [Before](assets/file-preview-217/before-768.png) | [After](assets/file-preview-217/after-768.png) | 768×1000 |
| Image preview, English | — | [Wide](assets/file-preview-217/image-1440.png) / [Phone](assets/file-preview-217/image-375.png) | 1440×900 / 375×900 |
| Image preview, Korean | — | [Korean](assets/file-preview-217/image-ko.png) | 1440×900 |
| Generic file information | — | [Phone](assets/file-preview-217/file-375.png) | 375×900 |
| SVG 1.1 DOCTYPE, red square | — | [Decoded image](assets/file-preview-217/doctype-1280.png) | 1280×720 |

The new preview captures retain applied dirty text and an unapplied section-label draft behind the
modal. The existing dialog width (48rem) and image height cap (60dvh) remain unchanged through
the Adjustable tokens. `pnpm browser:test file-preview --screenshots`, `layout-rules`, and
`quiet-document --screenshots` passed at that HEAD with `IEUMDOC_BROWSER_URL=http://127.0.0.1:5193`.
The SVG regression first failed with `Invalid SVG image`, then passed with XML declaration,
comment and external SVG 1.1 DOCTYPE. The browser decodes the committed DOCTYPE fixture as 20×20;
the DOCTYPE-bearing active fixture still cannot execute scripts/events or fetch its external image/DTD
in the image context. Direct SVG navigation also cannot execute its script under the sandbox CSP.
No server XML/DTD/entity parser was added.
Targeted Host and token tests, Editor typecheck/build, documentation and whitespace checks also passed.


### Long dialog names and paths (#401)

On 2026-10-24, all three candidates reproduced overflow at both 1440×900 and 375×900.
Only four text classes changed from `break-words` to `[overflow-wrap:anywhere]`: the unsaved
and refused-Open descriptions, and file-preview title/path. Shared Dialog, spacing, controls,
normal prose line breaking and desktop footer direction retain their existing rules.
Core/CLI semantics are unchanged; this is an Editor presentation correction.

The extended existing `open-files` and `file-preview` browser scenarios failed before the product
change and passed after it. They measure popup/text `clientWidth` and `scrollWidth`, each button's
bounds, and enabled button actionability at both widths, even without `--screenshots`.
The file-preview fixture is a real ZIP entry; Open/Close uses the existing mocked document Host flow,
including a native admission refusal with a long path in its technical reason. Names contain Korean
and an unbroken ASCII run (no spaces or hyphens); the full Windows path contains no spaces.
Assertions are deferred until all candidate widths have been measured, without weakening them.

| Dialog | Viewport width | Before client/scroll | After client/scroll | Before buttons outside | After |
| --- | --- | --- | --- | --- | --- |
| Unsaved changes | 1440 | 382/1160 | 382/382 | Save | All inside |
| Unsaved changes | 375 | 341/1160 | 341/341 | All three | All inside |
| Cannot open document | 1440 | 382/1160 | 382/382 | None | All inside |
| Cannot open document | 375 | 341/1160 | 341/341 | OK | All inside |
| File preview | 1440 | 766/1161 | 766/766 | None | All inside |
| File preview | 375 | 341/1161 | 341/341 | None | All inside |

Raw measurements: [before Open/Close](assets/dialog-wrap-401/before-open.json),
[after Open/Close](assets/dialog-wrap-401/after-open.json),
[before preview](assets/dialog-wrap-401/before-preview.json),
[after preview](assets/dialog-wrap-401/after-preview.json).
Before expanded text widths were 1128px (Open/Close) and 1129px (preview).
After, Open/Close text is 350px at 1440 and 309px at 375 (technical details 337/296px);
preview title/path are 734px and 309px. Every measured text node has equal client/scroll widths.

Capture metadata: HEAD `e0708061839a76bf19c2824e53e5f3dbfff4463e` for both sets.
Before has only the scenario/fixture additions; After adds the four product class replacements.
Windows installed Chrome, persistent profile for this same worktree, Vite at port 5197,
DPR 1, visualViewport scale 1 (100% zoom), bundled Pretendard Variable 1.3.9, `document.fonts.ready`,
scroll top, English UI. The existing server on 5173 belonged to another worktree; its initial
run is excluded from this evidence. No checkout/profile was created for capture comparison.

| Dialog / width | Before | After |
| --- | --- | --- |
| Unsaved / 1440 | [Before](assets/dialog-wrap-401/before-unsaved-1440.png) | [After](assets/dialog-wrap-401/after-unsaved-1440.png) |
| Unsaved / 375 | [Before](assets/dialog-wrap-401/before-unsaved-375.png) | [After](assets/dialog-wrap-401/after-unsaved-375.png) |
| Refused Open / 1440 | [Before](assets/dialog-wrap-401/before-refusal-1440.png) | [After](assets/dialog-wrap-401/after-refusal-1440.png) |
| Refused Open / 375 | [Before](assets/dialog-wrap-401/before-refusal-375.png) | [After](assets/dialog-wrap-401/after-refusal-375.png) |
| Preview / 1440 | [Before](assets/dialog-wrap-401/before-preview-1440.png) | [After](assets/dialog-wrap-401/after-preview-1440.png) |
| Preview / 375 | [Before](assets/dialog-wrap-401/before-preview-375.png) | [After](assets/dialog-wrap-401/after-preview-375.png) |

Visual inspection confirms wrapped text and visible buttons at phone widths, with horizontal
Open/Close footers retained on desktop. Existing verification records above remain unchanged.

Local validation: Editor tests 276 passed; `open-files --screenshots`, `file-preview --screenshots`,
`layout-rules`, `quiet-document`, and `writeability-preflight` passed. Workspace `typecheck`,
Editor `build`, `docs:check` and `git diff --check` passed. Build emitted the existing punycode
externalization and chunk-size warnings. Packaging and other-platform checks belong to required CI;
no packaging or Host boundary changed.


#### Latest master integration (#401)

After the captures above, master `0648ce98b6f3e77c531520b40a6cab66f405cf5c` (#397 tab restoration)
was merged without conflicts at `861ade17ad4826e77ed7a92a50a64005e3bd2516`.
Editor tests (277), workspace typecheck, Editor build and documentation/whitespace checks passed.
The long-preview setup now explicitly reopens a closed narrow overlay sidebar before choosing its
file, just as the existing navigation helper does; measured dialog assertions remain immediate.
`open-files` and `file-preview` passed together. The first CI run's unrelated `cross-reference`
(Settings lookup) and `save-session` (Reload initial focus) failures also passed locally after the
merge; the new Open/Close and preview checks had already passed in that first CI run.
The preserved capture HEAD and historical measurements above are not rewritten as merge-head evidence.
