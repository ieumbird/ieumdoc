# Editor Layout Rules v1

- Status: Implemented
- Last verified: 2026-10-08 (sidebar width and folder alignment measured by `layout-rules`).
- Scope: Editor shell, document, block tools and control geometry.
- [Visual Language (current v2)](editor-visual-language-v1.md) owns color, typography and surface rules. It supersedes the earlier restriction against changing fonts/colors.

## Alignment and ownership

- Sidebar icons use a 16px slot and 8px label gap; the folder heading and its entries share one icon start and one text start within 1px.
- Sidebar and TopBar share a 48px header row. At ≤704px the TopBar wraps and grows; the sidebar header remains 48px.
- TopBar and MessageArea share a 20px inline inset. TopBar status sits beside the filename; a status change moves no control (0px, measured).
- The document column centers in the area remaining beside the sidebar. Its maximum width is `--layout-content-width` (928px), or `--layout-content-width-wide` (1280px) with the Wide document preference, with 16px outer insets; it never exceeds the available area. Both values are [adjustable values](editor-visual-language-v1.md#adjustable-values-and-preferences). Wide changes only the column width: the content axis, 80px gutter and block rules stay the same.
- Document owns the 80px starting gutter: 8px edge + 28px control + 4px gap + 28px control + 12px safety. Trailing inset is 80px, becoming 16px at ≤1024px.
- All top-level block wrappers share the content axis. Block-internal content may inset or center. Controls overlay the gutter and never shift text.
- Expanded sidebar width is `--layout-sidebar-width` (240px), or `--layout-sidebar-width-narrow` (176px) at ≤1024px; both are [adjustable values](editor-visual-language-v1.md#adjustable-values-and-preferences). It is 48px when explicitly collapsed. Folder and file actions appear only in the expanded sidebar.

## Controls and spacing

- Standard controls/inputs: 32px; compact controls/actions: 28px; icons: 16px. Measure actual rendered height after transitions complete.
- Existing 4/8/12/16/20/24/32/48/64px spacing scale remains. Document starts 48px below header (32px at ≤1024px).
- Body: 17/28.9px; UI/caption/table: 14/20px; metadata/status: 12/16px. Heading values and spacing are in Visual Language (current v2).
- Paragraph/block gaps: 16px. Heading before/after: 32/12px. Figure caption gap: 8px.
- `components/ui` and legacy native primitives share product tokens; refs, events and selection are preserved.

## Exceptions and checks

- TopBar shows the filename, ellipsizing long names; the full unchanged address remains in `title`.
- Tables and formulas scroll inside their block; overlay contents may scroll if viewport height demands it. Never hide overflow on the whole document or restyle KaTeX internals to make measurements pass.
- Overlay positioning respects the viewport and sticky header. Required controls must exist and stay reachable.
- `layout-rules.browser.js` measures real scratch documents at 1440, 1025, 1024, 768, 705 and 704px with sidebar open/collapsed and a folder shown. No-element results fail. It checks the sidebar width against the width variables, and the folder heading/entry icon and text alignment; collapsed sidebar icon/label alignment is explicitly not applicable. At 1920px it toggles Wide document and checks the column against `--layout-content-width-wide` (capped by the area), centering, the shared axis, the text inset, unmoved TopBar controls and the preference surviving a reload.
- No change to Core/CLI, document semantics, save API, Tiptap state architecture or backend persistence.
