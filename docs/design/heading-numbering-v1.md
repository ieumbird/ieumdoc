# Heading numbering v1

Issue #96. The default authoring policy keeps H1 as a document title and numbers H2–H6 as sections. Core persists `numbering.headings` and `numbering.title: false` in MyST front matter. Heading text never contains the generated number. The existing YAML library preserves other metadata values and comments; the MyST frontmatter library normalizes settings instead of duplicating its validation.

Core exposes `updateHeadingNumbering(document, enabled)`, an editor-neutral `HeadingNumbering` read model and `headingNumbers` rule. The heading counter is checked against MyST enumeration, including disabled levels, starts and prefix projection. The Editor calls that same rule for heading decorations and Outline labels; it uses the single ProseMirror document attribute for setting changes and engine Undo/Redo. Save applies the Core metadata operation after snapshot-based block edits so adding front matter does not shift their locators.

Click `1. H` in the top bar (accessible name: Number headings) to enable or disable numbering. The enabled policy uses H2–H6; selecting it replaces explicit per-level heading overrides and keeps H1 unnumbered. No general metadata editor or project-wide chapter numbering is added. Source remains read-only.

CLI: `ieumdoc update-heading-numbering <file> --enabled true|false`. `inspect --format json` includes each heading's computed `headingNumber` when numbered. Other numbering options remain in the YAML; figure/equation numbering behavior is outside this heading feature.

Verification: Core metadata preservation and MyST equivalence, CLI real-file writes and rejected values, Editor Save projection, browser Outline/heading agreement, Undo/Redo, Save/Reload and disabling numbering. Full typecheck, tests, production build and browser suite remain required.
