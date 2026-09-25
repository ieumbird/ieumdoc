# Editor Layout Rules v1

- Status: Implemented, updated 2026-09-25.
- Scope: Editor shell, document, block tools and control geometry.
- [Visual Language v1](editor-visual-language-v1.md) owns color, typography and surface rules. It supersedes the earlier restriction against changing fonts/colors.

## Alignment and ownership

- Sidebar icons use a 16px slot and 8px label gap; action and current-file text starts align within 1px (button border).
- Sidebar and TopBar share a 48px header row. At ≤704px the TopBar wraps and grows; the sidebar header remains 48px.
- TopBar and MessageArea share a 20px inline inset.
- The document column centers in the area remaining beside the sidebar. Its maximum width is 928px, with 16px outer insets.
- Document owns the 80px starting gutter: 8px edge + 28px control + 4px gap + 28px control + 12px safety. Trailing inset is 80px, becoming 16px at ≤1024px.
- All top-level block wrappers share the content axis. Block-internal content may inset or center. Controls overlay the gutter and never shift text.
- Sidebar width is 208px, 176px at ≤1024px, and 48px when explicitly collapsed. Open/New remain behind the existing expansion policy.

## Controls and spacing

- Standard controls/inputs: 32px; compact controls/actions: 28px; icons: 16px. Measure actual rendered height after transitions complete.
- Existing 4/8/12/16/20/24/32/48/64px spacing scale remains. Document starts 48px below header (32px at ≤1024px).
- Body: 17/28.9px; UI/caption/table: 14/20px; metadata/status: 12/16px. Heading values and spacing are in Visual Language v1.
- Paragraph/block gaps: 16px. Heading before/after: 32/12px. Figure caption gap: 8px.
- `components/ui` and legacy native primitives share product tokens; refs, events and selection are preserved.

## Exceptions and checks

- Long file paths ellipsize directory before filename; the full address remains in `title`. Very long filenames also ellipsize.
- Tables and formulas scroll inside their block; overlay contents may scroll if viewport height demands it. Never hide overflow on the whole document or restyle KaTeX internals to make measurements pass.
- Overlay positioning respects the viewport and sticky header. Required controls must exist and stay reachable.
- `layout-rules.browser.js` measures real scratch documents at 1440, 1025, 1024, 768, 705 and 704px with sidebar open/collapsed. No-element results fail. Collapsed sidebar icon/label alignment is explicitly not applicable.
- No change to Core/CLI, document semantics, save API, Tiptap state architecture or backend persistence.
