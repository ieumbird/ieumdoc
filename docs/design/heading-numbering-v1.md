# Heading numbering v1

- Status: Implemented
- Last verified: 2026-10-14 (#232 native metadata contract).
- Scope: Core-owned settings and Editor/CLI projection; [Native document support](document-support-v1.md).

Core persists `numbering.headings: boolean` and `numbering.title: false` alongside the mandatory `ieumdoc: 1` marker. Omitted numbering means off. H1 remains a document title; H2–H6 use the default section counter policy. Heading text never contains generated numbers. Custom starts, prefixes, per-level settings and other metadata are rejected at admission.

`updateHeadingNumbering(document, enabled)` updates the native frontmatter with the existing YAML library. `HeadingNumbering` and `headingNumbers` expose the editor-neutral display rule. Editor headings and Outline call the same rule; one ProseMirror document attribute participates in Undo/Redo. Save applies the Core operation without changing snapshot paths. Metadata is hidden from the body, never inserted as an editor block.

In the sidebar's Display panel, Number headings belongs to Saved in document. It is disabled without a document, during pending work and in Source. Wide document is a local preference with a separate scope. Source is read-only. Supported top-level headings advance counters; unsupported nested structures never enter a native document.

CLI: `ieumdoc update-heading-numbering <file> --enabled true|false`. `inspect --format json` reports computed `headingNumber` values. Figure/equation numbering is independent.

Verification covers Core default-policy equivalence to MyST, native metadata writes, CLI edits, Editor path retention, Outline agreement, Undo/Redo and Save → Reload.
