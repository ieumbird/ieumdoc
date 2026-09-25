# Editor Visual Language v1 — Quiet Document

- Status: Implemented (2026-09-25); visual approval remains with the user.
- Scope: existing Editor presentation and interaction overlays. Core, CLI, source format, save API and the single Tiptap state are unchanged.

## Direction

**Document at rest, application on interaction.** White document space, readable typography and a quiet shell take priority over persistent cards and tools.

[Reference mockup](assets/quiet-document-reference.png) is a visual reference, not a screenshot of the product. Adopt its reading column, hierarchy, restrained borders and relationship between a selected Figure and its properties. Do not copy its workspace tree, search, account, window decorations, automatic numbers/references, autosave or technical claims. Existing heritage red remains the action/focus accent. No new fonts are downloaded or packaged.

## Surfaces and typography

| Role | Actual values / treatment |
| --- | --- |
| Shell | `#f7f7f6` sidebar, white header; 48px header, 208px sidebar (176px at ≤1024px), 48px collapsed rail |
| Document | White continuous page without a card border or radius; 928px maximum column, 16px outer inset, 80px document inset on each side; 736px body at 1440px with sidebar open |
| Narrow document | At ≤1024px, retain 80px tool gutter; trailing inset becomes 16px. At ≤704px header wraps; sidebar remains user controlled. |
| Body | Georgia → Malgun Gothic → Noto Serif KR → serif; 17px / 28.9px, 400; 16px paragraph gap |
| H1–H6 | Same document stack, 700; 34/45.9, 24/32.4, 20/27, 18/24.3, 16/21.6, 14/18.9px; 32px before / 12px after; first block has no top margin |
| UI | Segoe UI → Malgun Gothic → Noto Sans → sans-serif; 14/20px labels/controls, 12/16px metadata and status |
| Caption / table | UI stack, 14/20px; caption gap 8px; cells 8px × 12px, 112px minimum width, light visible grid |
| Callout | UI stack, 14/21px; Note blue-gray and Warning warm surfaces retain semantic distinction; plain variant title, explicit read-only restriction when applicable |
| Figure / Equation | Transparent at rest; real label retained as quiet 12/16px metadata; caption unchanged. Selected/editing outline uses the brand accent. |
| Editing surfaces | White popovers/dialogs, subtle Equation form surface, shared border/radius/shadow; 32px inputs, 28px form actions, explicit labels and errors |

Colors originate in `styles/tokens.css`. Normal UI text targets 4.5:1 contrast; focus rings remain visible. Formula typography belongs to KaTeX, whose internals are not restyled. A content-sized IeumDoc wrapper and the enclosing block own horizontal formula scrolling. Tables scroll within their block. Document-wide clipping is prohibited.

## State rules

| Axis | Expression |
| --- | --- |
| Rest | No paragraph input box, persistent gutter or Edit button. No invisible pointer targets. Real labels, captions, errors and restrictions remain visible. |
| Hover | Gutter and typed-block Edit appear without moving text. The path from content to buttons remains inside the hover area. |
| Keyboard focus | Native editor caret/selection, visible control focus; Tab reveals tools using `:focus-within`. |
| Selected | Figure outline and a dismissible properties summary; summary does not steal editor focus. |
| Editing | Form and editing outline persist independently of selection. |
| Dirty / invalid | Existing draft notice and Save guard; validation preserves entered values. These do not replace hover/focus/selection. |
| Read-only | Existing restriction is visible; source view stays read-only. |
| No hover device | Gutter and Edit remain visible. |

These are independent axes, not a state enum. Visual interactions never write document attributes. Figure Apply/Cancel and the existing explicit Escape-to-Cancel behavior remain; selection changes and outside dismissal do not cancel an editing Figure. Cancel removes only a never-applied new Figure, as before.

## Responsibility boundaries

- **Product tokens** own role values. `index.css` maps them one way to shadcn/Tailwind. Product colors/radii use `--id-*` names so generated Tailwind names cannot override them. No cycles, duplicate role definitions or `!important`.
- **Controls** enter through `components/ui`. Existing native primitives retain refs, events and selection behavior and share product tokens. No wholesale primitive migration.
- **Document container** owns width, content axis, external spacing and gutter. **Blocks** own inner arrangement and necessary local scrolling. The two 28px gutter controls have a 4px gap and 12px separation from text.
- **Overlays** own their existing focus/dismissal policy. The small `useOverlayBounds` helper only translates existing editor overlays inside viewport/header bounds; it introduces no focus framework or document state. Base UI owns Figure and dialog collision handling.

| Overlay | Focus / Escape / return |
| --- | --- |
| Slash menu | Focus stays in editor; arrows select; Escape dismisses query UI. |
| Gutter command menu | Button opening focuses first item; Escape closes; return to connected opening control when no other focus has been chosen. |
| Selection toolbar | Pointer actions preserve editor text selection. |
| Link / inline math / reference | Input/select receives focus; existing blur dismissal and Escape close are retained; explicit close returns to editor. |
| Figure | Summary keeps editor focus and can dismiss outside; editing autofocuses Image. Outside/selection dismissal never closes a draft. Explicit Apply/Cancel or existing Escape in its form completes it. |
| Equation | Inline source form and preview; existing Apply/Cancel/Escape semantics. |
| Open / New | Existing Base UI modal focus boundary, Escape dismissal and focus restoration. |

## Evidence and verification

[Review record and actual Before/After](editor-visual-refinement-v1-review.md). `quiet-document-reference.png` is the mockup; `quiet-document-before-*` / `quiet-document-after-*` are actual Editor captures.

`pnpm browser:prepare` copies `test/browser/fixtures/quiet-document*.md` and the existing local diagram into `tmp/quiet-document`. `pnpm browser:test layout-rules quiet-document` measures actual DOM, captures real API-backed documents and checks focus, draft retention, local overflow and overlay bounds. Required elements are asserted, never substituted with zero; sidebar icon/label checks are explicitly inapplicable when collapsed. Before/After use 1440×1000 / 1024×1000 / 768×1000, 100% zoom, scroll top and equivalent interaction state after fonts/images load.

This is one implemented light presentation. Responsive popover placement, operating-system font fallback and the existing sample diagram intentionally differ from the mockup. No theme variants, fake navigation or proposed product features are included.
