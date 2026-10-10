# Editor Layout Rules v1

- Status: Implemented
- Last verified: 2026-10-08 (`layout-rules` and `new-document`: existing axes, widths and overlays plus the empty writing surface).
- Scope: Editor shell, document, block tools and control geometry.
- [Visual Language (current v3)](editor-visual-language-v1.md) owns color, typography and surface rules. It supersedes the earlier restriction against changing fonts/colors.

## Alignment and ownership

- Sidebar icons use a 16px slot and 8px label gap. A tree row is a 16px chevron slot (empty for documents), 4px, the icon and the name; top-level rows share one icon start and one text start within 1px. Each level indents 12px, at most five levels; deeper names keep that indent and ellipsize, with the full path in `title`.
- Sidebar, TopBar and the docked Document panel share a 48px header row. At ≤704px the TopBar wraps and grows; the sidebar and panel headers remain 48px.
- TopBar and MessageArea share a 20px inline inset. TopBar status sits beside the filename; a status change moves no control (0px, measured).
- TopBar settings, view and file actions keep their order, separated by 12px between groups and 4px within groups. Visual/Source are adjacent view tabs without a container. Current file/heading markers and focus rings are outside layout; font metrics and text positions do not change between rest, hover, current and focus.
- The document column centers in the area remaining between the sidebar and the Document panel. Its maximum width is `--layout-content-width` (928px), or `--layout-content-width-wide` (1280px) with the Wide document preference, with 16px outer insets; it never exceeds the available area. Both values are [adjustable values](editor-visual-language-v1.md#adjustable-values-and-preferences). Wide changes only the column width: the content axis, 80px gutter and block rules stay the same.
- Document owns the 80px starting gutter: 8px edge + 28px control + 4px gap + 28px control + 12px safety. Trailing inset is 80px, becoming 16px at ≤1024px.
- The white document surface fills at least the viewport below the measured sticky header, less two outer insets. The column's 16px canvas gap surrounds it; an inset 1px edge changes no width. Long documents grow naturally. The blank paper below the actual editor content remains clickable to continue writing.
- All top-level block wrappers share the content axis. Block-internal content may inset or center. Controls overlay the gutter and never shift text. Gutter and drag geometry observe both the paper and editor content, so content resizing inside a minimum-height paper still updates the handles and moved-block tint. Geometry updates retain the hovered block; they do not switch its controls to the selection.
- Expanded sidebar width is `--layout-sidebar-width` (240px), or `--layout-sidebar-width-narrow` (176px) at ≤1024px; both are [adjustable values](editor-visual-language-v1.md#adjustable-values-and-preferences). It is 48px when explicitly collapsed. Folder and file actions appear only in the expanded sidebar.
- The Document panel is `--layout-document-panel-width` (256px, an adjustable value) and docks at 1280px and wider; closed, it takes no width. The docking width is separate from the 1024px narrow sidebar so the document keeps a readable width beside both panels: at 1280px, 1280 − 240 − 256 = 784px remains (592px of text); at 1440px, 944px remains, so the 928px Standard column is unchanged. Below 1280px the panel never takes grid width: opened, it overlays at its width against the right edge (at most the viewport), from the bottom of the sticky header (TopBar and messages, measured as `--app-header-height`) to the bottom of the viewport, and the document keeps its width. The docking width is a media query (`width < 80rem` in `styles.css` and `PANEL_OVERLAY_LAYOUT` in `App.tsx`), not an adjustable value.

## Controls and spacing

- Standard controls/inputs: 32px; compact controls/actions: 28px; icons: 16px. Measure actual rendered height after transitions complete.
- Existing 4/8/12/16/20/24/32/48/64px spacing scale remains. The paper starts 16px below the header; its adjustable block padding is 32px (16px at ≤1024px), keeping the content start at 48px (32px at ≤1024px), before block margins.
- Body: 17/28.9px; UI/caption/table: 14/20px; metadata/status: 12/16px. Heading values and spacing are in Visual Language (current v3).
- Paragraph/block gaps: 16px. Heading before/after: 32/12px. Figure caption gap: 8px.
- `components/ui` and legacy native primitives share product tokens; refs, events and selection are preserved.

## Exceptions and checks

- TopBar shows the filename, ellipsizing long names; the full unchanged address remains in `title`.
- Tables and formulas scroll inside their block; overlay contents may scroll if viewport height demands it. Never hide overflow on the whole document or restyle KaTeX internals to make measurements pass.
- Overlay positioning respects the viewport and sticky header. Required controls must exist and stay reachable.
- `new-document.browser.js` checks the empty surface at 1440 and 768px, first hint and insert visibility without hover, New focus, immediate typing/undo, blank-paper click, actual empty Save/Source and real-file Save → Reload. Cancel and rejected New return to the opening control without creating a file.
- `layout-rules.browser.js` measures real scratch documents at 1440, 1280, 1279, 1025, 1024, 768, 705 and 704px with sidebar open/collapsed and a folder shown. No-element results fail. It checks the sidebar and docked panel widths against their variables, 16px sidebar icons and top-level tree icon/text alignment, the overlay at 1279, 1024, 768 and 704px (document width unchanged, no sideways scroll, top at the header's bottom, Save, Reload and the Outline toggle uncovered, Escape returns focus to the Outline toggle) and that hiding the docked panel widens the centering area by its width; collapsed sidebar icon/label alignment is explicitly not applicable. At 1920px it toggles Wide document and checks the column against `--layout-content-width-wide` (capped by the area), centering, the shared axis, the text inset, unmoved TopBar controls and the preference surviving a reload.
- No change to Core/CLI, document semantics, save API, Tiptap state architecture or backend persistence.
