# Editor Visual Language — Quiet Document

- Status: Implemented
- Last verified: 2026-10-10 (`layout-rules`, `quiet-document`, `visual-states`, `folder-navigation`, full stable browser suite; bundled Pretendard glyphs, inline math size and same-state responsive captures).
- Current contract: v4.1. Historical filename retained for link stability.
- History: v1 implemented 2026-09-25; v2 (chrome recedes) implemented 2026-10-06; v3 (distinct states) 2026-10-08; v4 (TopBar tabs, toggles and Save states) 2026-10-10; v4.1 (TopBar state axes) 2026-10-10. Visual approval remains with the user.
- Scope: existing Editor presentation and interaction overlays. Core, CLI, source format, save API and the single Tiptap state are unchanged.

## Direction

**Document at rest, application on interaction.** White document space, readable typography and a quiet shell take priority over persistent tools. A subtle paper boundary and an empty-document starting hint keep the writing area discoverable before it has content.

[Reference mockup](assets/quiet-document-reference.png) is a visual reference, not a screenshot of the product. Adopt its reading column, hierarchy, restrained borders and relationship between a selected Figure and its properties. Do not copy its workspace tree, search, account, window decorations, unimplemented numbering/reference behavior, autosave or technical claims. Current computed numbering and heading settings follow [Heading numbering](heading-numbering-v1.md) and [UX Shell](editor-ux-shell-v1.md). Existing heritage red remains the primary-action accent; focus and current items use a separate blue interaction role. Pretendard Variable is bundled and served by the app; it does not require a font CDN.

## Surfaces and typography

| Role | Actual values / treatment |
| --- | --- |
| Shell | `#f6f7f9` sidebar and Document panel, white header; 48px header, 240px sidebar (176px at ≤1024px), 48px collapsed rail, 256px Document panel (docked at ≥1280px; below, an overlay with the overlay shadow under the header) |
| Document | White continuous writing surface on the `surface-subtle` canvas, with a 1px inset `border-subtle` edge and no radius or raised shadow. 928px maximum column, 16px outer inset, 80px document inset on each side; 736px body at 1440px with sidebar open. At least the viewport height below the measured header, less the top/bottom outer insets; grows with content, without paper sizes or page breaks. |
| Narrow document | Below 1280px the Document panel starts closed and overlays when opened. At ≤1024px, retain 80px tool gutter; trailing inset becomes 16px. At ≤704px header wraps; sidebar remains user controlled. |
| Body | Shared sans stack (below); 17px / 28.9px, 400; 16px paragraph gap |
| H1–H6 | Same document stack, 700; 34/45.9, 24/32.4, 20/27, 18/24.3, 16/21.6, 14/18.9px; 32px before / 12px after; first block has no top margin |
| UI | Same shared sans stack; 14/20px labels/controls, 12/16px metadata and status |
| Caption / table | UI stack, 14/20px; caption gap 8px; cells 8px × 12px, 112px minimum width, light visible grid |
| Callout | UI stack, 14/21px; a 3px kind-colored side bar and its surface, no outline; informational, caution and danger kinds; plain variant title, explicit read-only restriction when applicable |
| Footnote definition | Body type; its number hangs before the first line in a 16px left inset and goes back to the first reference. A read-only definition keeps the read-only source presentation. |
| Figure / Equation | Transparent at rest; authoring metadata hidden at rest, shown on hover/focus/selection/editing at 12/16px; caption unchanged. Selected/editing outline uses the interaction role. |
| Editing surfaces | White popovers/dialogs, subtle Equation form surface, shared border/radius/shadow; 32px inputs, 28px form actions, explicit labels and errors |

Document and UI share `Pretendard Variable → Pretendard → Noto Sans KR → Apple SD Gothic Neo → Malgun Gothic → Segoe UI → sans-serif`; the document token aliases the UI stack. The Editor pins the official `pretendard` package to `1.3.9` and imports its variable dynamic-subset CSS. Vite resolves the relative WOFF2 URLs into app-hosted assets. All upstream subsets remain available for newly entered text; only needed ranges are requested. The upstream `font-display: swap` and weight range are retained, so a system fallback can appear while a font loads or for unsupported characters. No CSS size adjustment or new typography dimensions are introduced.

The SIL OFL 1.1 notice text is copied from `pretendard/dist/LICENSE.txt` into [the public license](../../apps/editor/public/licenses/Pretendard-OFL.txt), served at `licenses/Pretendard-OFL.txt` in the built app. When updating the package, refresh that notice from the same version. The 2026-10-08 Noto Sans KR observation remains historical evidence; the [Pretendard verification](../reviews/pretendard-2026-10-09.md) records the new actual fonts and wrapping. Heading sizes/weights/line heights are unchanged; KaTeX and code fonts retain their own typography; inline math is sized by `--math-inline-size` ([verification](../reviews/inline-math-size-2026-10-09.md)).

Colors originate in `styles/tokens.css`. `--id-color-accent` / `-hover` retain heritage red for Save/Apply and existing primary actions. Content links, references and informational callouts retain `--id-color-info`; `--id-color-danger: #a12b32` and its existing surface retain validation/destructive meaning. The shadcn primary/ring/destructive roles map one way to these product roles. In particular, shadcn `accent` is the neutral hover surface, not the product brand accent, and `muted` remains a quiet background rather than a universal interaction state.

| Product role (prefix `--id-color-`) | Value / responsibility |
| --- | --- |
| `surface`, `surface-subtle` | White paper/dialogs and `#f6f7f9` panels |
| `surface-hover` | `#eaedf2`, visible on both panels and white paper |
| `surface-selected`, `surface-selected-hover`, `text-selected` | `#e9f0ff`, `#e1eaff`, `#2449a6`: current navigation and active command choice; `text-selected` also colors TopBar toggle icons that are on |
| `surface-pressed` | `#e3e7ee`: neutral persistent menu-open/pressed face outside the TopBar, accompanied by a control boundary |
| `text`, `text-muted`, `text-subtle` | `#20242c`, `#545c68`, `#606874`: main text, secondary labels, metadata; subtle remains readable on hover surfaces |
| `border`, `border-subtle`, `border-strong` | Structural separators, paper edge, and stronger content rules; these are not input identification |
| `border-control` | `#7b8390`: fields, outlined buttons, menu-open/pressed controls outside the TopBar. At least 3:1 against their adjacent white/panel/pressed faces |
| `interaction`, `interaction-soft` | `#315fd4` indicator/focus and an alias to `surface-selected`; no separate copied selection palette |

Keyboard control focus uses a separate 2px ring; a current marker, error boundary or pressed face stays visible alongside it. Normal UI text meets 4.5:1 and required control/state indicators meet 3:1 against adjacent backgrounds. Decorative dividers and the rest/hover color difference are not required to meet 3:1. Formula typography belongs to KaTeX, whose internals are not restyled. IeumDoc sets only the overall size of inline math (`--math-inline-size`); display equations keep KaTeX's 1.21em. A content-sized IeumDoc wrapper and the enclosing block own horizontal formula scrolling. Tables scroll within their block. Document-wide clipping is prohibited.

## State rules

| Axis | Expression |
| --- | --- |
| Rest | No paragraph input box or persistent Edit button. Gutter tools are hidden except the first `+` in an empty editable document; its drag handle stays hidden. No invisible pointer targets. Figure/Equation authoring metadata is hidden, inert text with its space reserved to avoid layout movement; node attrs are untouched. Captions, reference chips, errors and restrictions remain visible. |
| Hover | Gutter, typed-block Edit and metadata appear without moving text. The path from content to buttons remains inside the hover area. |
| Keyboard focus | Native editor caret/selection, visible control focus; Tab reveals tools using `:focus-within`. The document editing surface shows focus with the caret only, never a frame around the document. |
| Selected | Block selection outline and visible Edit access; selection opens no properties panel. |
| Editing | Form and editing outline persist independently of selection. |
| Dirty / invalid | Draft notices distinguish applied Save content from unsaved form input; validation preserves entered values. These do not replace hover/focus/selection. |
| Read-only | Existing restriction is visible; source view stays read-only. |
| Disabled control | Native disabled controls retain dimming. Focusable `aria-disabled` controls use a muted face, secondary text and structural boundary, preserving their tooltip, focus ring and Base UI activation guard. |
| No hover device | Gutter and Edit remain visible. |

These are independent axes, not a state enum. Visual interactions never write document attributes. Figure Apply/Cancel and the existing explicit Escape-to-Cancel behavior remain; selection changes and outside dismissal do not cancel an editing Figure. Cancel removes only a never-applied new Figure, as before.

## Empty document start (#133)

A single empty editable paragraph shows `Start writing, or type / to add a block.` at the actual text axis, in the document font and subtle text color. The first `+` stays visible even without hover or focus. Tiptap's Placeholder supplies a decoration; the hint is not content, is not selectable and never appears in Markdown, Source, Save or dirty comparison. Typing hides it; undo to the empty paragraph restores it. Read-only content and non-empty documents do not receive this starting state.

After New succeeds, Base UI's closing focus handoff targets the newly mounted editor, so typing starts immediately. Cancel/Escape, including after rejected creation, returns focus to the New button. Opening or reloading an existing file does not invoke the New handoff. The white space below the actual editor content still places the caret at the end through the existing engine operation.

The paper boundary is permanent and neutral, not a document focus ring. Top/bottom paper padding is 32px (16px at ≤1024px), inside the 16px canvas gap; the body and gutter keep their existing axes. These are display and focus changes only; Core, CLI and saved document meaning are unchanged.

Historical comparison evidence is preserved in the [visual review](editor-visual-refinement-v1-review.md#subsequent-visual-evidence).

## Filename and status

TopBar shows only the filename; long names ellipsize and the complete unchanged path stays in `title`. The status sits beside the filename (v2). Open/New still receive the original address. A loaded clean document has no idle text. Unsaved document changes or unapplied drafts show `Unsaved changes`; the display reads the existing baseline comparison and draft signals. `Saved` appears only after a successful save while no edits remain (including undo back to that saved baseline). Saving, load/save errors and conflict retain their existing operation text/UI. The status does not imply autosave.

## Shell and control rules — v3 (2026-10-08), v4 and v4.1 (2026-10-10)

The shell distinguishes current location, hovered alternatives, pressed/open controls and keyboard focus with static states. Save alone adds a reduced-motion-aware progress spinner.

| Area | Rule |
| --- | --- |
| TopBar | Left: filename, then status. A status appearing never moves a control; `layout-rules` asserts a 0px shift. Right, in order: document setting (heading numbering), view (Visual/Source, Wide document, Outline), file actions (Reload, Save), with 12px between groups and 4px within them. A clean Save is an ordinary available ghost action, like Reload: no face at rest, the neutral hover face, the focus ring. It takes the accent with unsaved changes. An unavailable Save keeps the disabled face (muted face, muted text, structural boundary) and does not react to hover; its tooltip remains. While saving, Save keeps its place, width and accessible name, showing a spinner over a transparent label. The status beside the filename alone reports `Saved`. Visual/Source are borderless view tabs: the active tab has dark text and a horizontal interaction marker at its bottom (the current-marker size), the inactive tab muted text. Hovering an inactive tab never adds a face: its text darkens over a neutral `border`-colored marker, distinct from the active marker. Wide/Outline/numbering, when on, have the selected icon color and the same interaction marker, without a selected face, so hover keeps the neutral face. No TopBar control uses the control boundary for state. Hover and focus preserve these states. |
| Sidebar and Document panel | One current rule for both the open file and section being read: selected surface, selected text and a 3px vertical interaction marker. Hover uses the neutral hover surface; current+hover uses selected-hover and keeps the marker. An independent inset focus ring is not clipped by the scrolling lists. Current does not change font metrics or text placement. The folder and Outline headings remain 14px semibold; ordinary rows remain 14px regular. Folder icons/chevrons, wrapping/indent limits and compact ghost actions retain their behavior. Without a folder, Open folder… stays outlined and Open file… stays ghost. |
| Controls | Base UI and native controls share 6px radii, 32px standard/28px compact targets and 16px icon slots. Ghost rest is transparent; hover is visible on a panel as well as white paper. Menu open and pressed states outside the TopBar use the neutral pressed face plus control boundary. Secondary/Cancel uses a white outlined face, with neutral hover. Refs, events and selection preservation are retained. Controls and overlays change state without decorative transitions, pressed movement or enter/exit animations. Save alone keeps its reduced-motion-aware progress spinner. |
| Forms and overlays | White fields have a control boundary, visible labels, secondary helper text, explicit errors and separated actions. Open/New/Folder retain and associate their error messages. An invalid New filename has an error boundary alongside focus; operation failures such as unsaved-work protection do not mislabel valid field values. Menus, dialogs and properties alone use the restrained overlay shadow. The document is never raised into a card. |
| Color | Interaction (`interaction`, selected roles): focus, selection, current item, drag. Content (`info`, `surface-info`): links, references, informational callouts and notices. Most chrome stays neutral; the TopBar's active view tab and on toggles carry the interaction marker. Brand and danger meanings remain unchanged. |
| References | Read like links: content color, no box or fill; underline on hover, dashed underline and subtle color when unresolved. Selected uses the interaction axis. |
| Callouts | Side bar and surface carry the kind; no full outline. |
| Authoring metadata | Section labels (`(label)=`) follow the Figure/Equation metadata rule: hidden and inert at rest, out of layout (no space between blocks), shown with their heading on hover, focus or selection. Clicking the shown label edits it. |
| Read-only blocks | One indication: the source summary (`kind · Read-only content · line`). No separate label, no uppercase anywhere; `.block-kind` is plain 12px semibold metadata. Read-only text separates block children (`Draft Review`, not `DraftReview`). |

Historical comparison evidence is preserved in the [visual review](editor-visual-refinement-v1-review.md#subsequent-visual-evidence).

### Reviewing a visual change

A change to the Editor's look or a new visible control states which rule above (or in v1) it follows, or updates this document in the same PR. Compare the same states before and after:

1. Capture the clean base before editing and preserve its files separately, or check out the base in a second worktree and start its dev server on a free port (for example 5174).
2. In each checkout, run `pnpm browser:test quiet-document --screenshots` against that checkout's own server; in the base worktree set `IEUMDOC_BROWSER_URL=http://127.0.0.1:5174`. Fixtures and captures belong to the checkout that runs the command.
3. Compare the captures in each checkout's `tmp/visual-refinement/` and attach the representative pairs to the PR.

IeumDoc keeps one stylesheet; comparison captures do not need a runtime old/new theme toggle. Record the actual HEAD, viewport, DPR/zoom, scroll/interaction state and font environment. CSS studies and mockups are not product Before images.

## Adjustable values and preferences

Values meant to be tuned by hand, or that change with a user's taste, are shared variables, never numbers repeated in rules or scripts.

- They live at the top of `styles/tokens.css` under **Adjustable values**, each with a comment saying what it controls. Changing one value there changes the Editor; tests read the variable instead of pinning its number.
- A user preference switches between such variables (a class on `.app-shell`); it does not compute or store pixel values. Preferences are kept by `src/preferences.ts` in this browser's storage, never in Markdown, front matter or the Host. They are display choices, not document semantics, so Core and CLI do not know them.
- Current entries: `--layout-content-width` (Standard document column, 928px) and `--layout-content-width-wide` (Wide document column, 1280px, capped by the window). The TopBar Wide document toggle chooses between them.
- Paper padding entries: `--layout-document-block-padding` (32px) and `--layout-document-block-padding-narrow` (16px at ≤1024px). The existing `--layout-content-gutter` supplies the outer canvas gap; the minimum paper height deducts that gap and the measured header rather than fixing a page size.
- Sidebar entries: `--layout-sidebar-width` (expanded, 240px) and `--layout-sidebar-width-narrow` (expanded at ≤1024px, 176px). The collapsed rail is fixed.
- Document panel entry: `--layout-document-panel-width` (256px), docked or overlaid.
- Inline math entry: `--math-inline-size` (1.1em of its text). KaTeX's own 1.21em reads larger than Pretendard body text and, with integral or sum limits, makes a line taller.
- Folder picker entries: `--layout-folder-picker-width` and `--layout-folder-picker-list-height` control the dialog and its scrollable list. Recent folder paths are browser navigation preferences; they do not alter the document or restore a sidebar folder on reload.

## Responsibility boundaries

- **Product tokens** own role values. `index.css` maps them one way to shadcn/Tailwind. Product colors/radii use `--id-*` names so generated Tailwind names cannot override them. No cycles, duplicate role definitions or `!important`.
- **Controls** enter through `components/ui`. Base UI Button owns shared button behavior, refs and disabled/focusable-disabled semantics. Document-specific native controls keep their interaction policy. Notice remains independent.
- **Document container** owns width, content axis, external spacing and gutter. **Blocks** own inner arrangement and necessary local scrolling. The two 28px gutter controls have a 4px gap and 12px separation from text.
- **Overlays** own their existing focus/dismissal policy. The small `useOverlayBounds` helper only translates existing editor overlays inside viewport/header bounds; it introduces no focus framework or document state. Base UI owns Figure and dialog collision handling.

| Overlay | Focus / Escape / return |
| --- | --- |
| Slash menu | Focus stays in editor; arrows select; Escape dismisses query UI. |
| Gutter command menu | Button opening focuses first item; Escape closes; return to connected opening control when no other focus has been chosen. |
| Selection toolbar | Pointer actions preserve editor text selection. |
| Link / inline math / reference | Input/select receives focus; existing blur dismissal and Escape close are retained; explicit close returns to editor. |
| Figure | Selection keeps editor focus; explicit Edit autofocuses Image. Outside/selection dismissal never closes a draft. Explicit Apply/Cancel or existing Escape in its form completes it. |
| Equation | Inline source form and preview; existing Apply/Cancel/Escape semantics. |
| Open / New | Base UI modal focus boundary and Escape dismissal. New success hands focus to the first paragraph; Cancel/Escape or rejected creation returns it to the New button. Open retains its existing focus restoration. |
| Document panel (overlay below 1280px) | Below the header, so it never covers TopBar actions or messages. Opened from the TopBar Outline toggle, which keeps focus; Escape inside the panel or Hide outline closes it and returns focus to the toggle. No focus trap: it is navigation, not a dialog. |
| Folder `⋯` menu | Base UI Menu: Enter/Space or click opens it, arrows move between items, Escape or an outside click closes and returns focus to `⋯`. An item that opens a dialog hands focus to the dialog. |

## Evidence and verification

[Static UI v3 verification and same-state product captures](../reviews/static-ui-v3-2026-10-08.md) preserves that refinement's baseline, measurements and limits.

[Review record and actual Before/After](editor-visual-refinement-v1-review.md). `quiet-document-reference.png` is the mockup; `quiet-document-before-*` / `quiet-document-after-*` are original v1 Editor captures, and `quiet-document-final-*` are the final polish captures.

`pnpm browser:prepare` copies `test/browser/fixtures/quiet-document*.md` and the existing local diagram into `tmp/quiet-document`. `pnpm browser:test layout-rules quiet-document` measures actual DOM, captures real API-backed documents and checks focus, draft retention, local overflow and overlay bounds. Required elements are asserted, never substituted with zero; sidebar icon/label checks are explicitly inapplicable when collapsed. Before/After use 1440×1000 / 1024×1000 / 768×1000, 100% zoom, scroll top and equivalent interaction state after fonts/images load.

This is one implemented light presentation. Responsive popover placement, operating-system font fallback and the existing sample diagram intentionally differ from the mockup. No theme variants, fake navigation or proposed product features are included.
