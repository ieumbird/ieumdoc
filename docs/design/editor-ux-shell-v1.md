# Editor UX Shell v1

- Status: Implemented, updated 2026-09-25.
- Scope: existing Editor interactions. [Visual Language v1](editor-visual-language-v1.md) and [Layout Rules v1](editor-layout-rules-v1.md) define presentation and geometry.

## Structure

The document is the primary surface. One Tiptap/ProseMirror document state owns selection, history and editing; typed blocks use NodeViews and overlays.

| Area | Current behavior |
| --- | --- |
| Sidebar | IeumDoc, Open, New and current document. User-controlled collapse/expand; no workspace tree or placeholder navigation. |
| TopBar | Filename and ellipsized directory (full path in title), Visual/Source, actual status and Save. Sticky while document scrolls. |
| MessageArea | Load/save errors, conflict and temporary notices below TopBar; no reserved height when empty. |
| Document | Continuous reading column. Block tools occupy its gutter. No fixed formatting toolbar. |

Open uses the existing local path dialog. New creates through the existing API in an existing parent directory. Source previews canonical Markdown read-only; it does not replace or reconstruct the single visual editor state. Pending Source work and unapplied drafts retain their existing switching/Save guards. `Ready`, `Saved`, pending changes and errors are not relabeled as automatic saving.

## Writing interactions

- Hover or keyboard focus reveals the current block's `+` and drag/action handle. Pointer travel into tools preserves them; hover does not change document state. On devices without hover, tools remain visible.
- `+` and `/` share supported insert commands (Paragraph, supported heading levels, Equation, Figure); slash also offers actual Equation/Figure reference targets. Slash keeps editor focus. Gutter-opened menus focus their first item.
- Block action menu exposes existing supported deletion; handle drag reorders through the existing editor operation. Unsupported structures remain protected.
- Paragraph/admonition text selection offers Bold, Italic, Link, Inline Math and Cross-reference where currently supported.
- Figure selection shows an anchored property summary. Edit opens Image/Alt text/Caption/Label fields. Summary may dismiss outside; editing survives selection movement and outside interaction. Core validation failure preserves values. Apply/Cancel and explicit Escape-to-Cancel retain existing behavior; new never-applied Figure Cancel removes the transient block.
- Equation editing stays inline with source, label, preview, Apply/Cancel and the existing Escape behavior. Unapplied changes retain the block-local notice and Save-disabled reason.
- Read-only restrictions, real labels, caption text and errors stay visible. There is no automatic Figure/equation/section numbering.

## Boundaries

No workspace tree, search, accounts, autosave, right-hand inspector, new block semantics, overlay framework or persistence architecture is introduced. New UI primitives enter through `components/ui`; native legacy controls continue to share product styles safely.

Browser procedures and repeatable scratch preparation: [TEST_GUIDE](../test/TEST_GUIDE.md). Actual visual evidence: [review record](editor-visual-refinement-v1-review.md).
