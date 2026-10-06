# Editor UX Shell v1

- Status: Implemented, updated 2026-09-28.
- Scope: existing Editor interactions. [Visual Language v1](editor-visual-language-v1.md) and [Layout Rules v1](editor-layout-rules-v1.md) define presentation and geometry.

## Structure

The document is the primary surface. One Tiptap/ProseMirror document state owns selection, history and editing; typed blocks use NodeViews and overlays.

| Area | Current behavior |
| --- | --- |
| Sidebar | IeumDoc, Open, Open folder, New, current document, the chosen folder (#112) and the heading outline (#61). User-controlled collapse/expand; no workspace or placeholder navigation. The folder lists one level (Up while below the chosen folder, sub-folders, then `.md` files), takes at most two fifths of the height and scrolls by itself; the open document uses the neutral current treatment and Close folder removes the list. The outline is derived from the editor document, indents 12px per level below H1, marks the section being read and scrolls by itself; it is never written to the document. |
| TopBar | Filename (full path in title), Visual/Source, Wide document, actual status, Reload and Save. Wide document widens the document column and is remembered in this browser only. Sticky while document scrolls. |
| MessageArea | Load/save errors, conflict and temporary notices below TopBar; no reserved height when empty. |
| Document | Continuous reading column. Block tools occupy its gutter. No fixed formatting toolbar. |

Open uses the existing local path dialog. Open folder uses the same dialog for a folder path; a document clicked in the folder opens through Open and its checks ([Folder listing v1](filesystem-host-boundary-v1.md#folder-listing-v1-112)). New creates through the existing API in an existing parent directory. Source previews canonical Markdown read-only (or the original Markdown when an unwritable file opens read-only); it does not replace or reconstruct the single visual editor state. Pending Source work blocks document switching. Unapplied drafts remain unsaved while Save/Source use applied content; Reload explicitly confirms discarding local work. See [Editing session and Save v1](editing-session-save-v1.md). Clean loaded state is silent; document changes/drafts show `Unsaved changes`. `Saved` is shown only following a successful save with no remaining edits. Saving/errors/conflict retain their meaning; there is no autosave.

## Writing interactions

- Hover or keyboard focus reveals the current block's `+` and drag/action handle. Pointer travel into tools preserves them; hover does not change document state. On devices without hover, tools remain visible.
- `+` and `/` share supported insert commands, grouped by dividers with an icon and the Markdown shortcut that makes the same block: Text (Paragraph, Heading 1–3; Heading 4–6 only when the query matches), Lists, Blocks (Note, Warning, Quote, Divider), Technical (Code block, Equation, Figure, Table); slash also offers actual Equation/Figure reference targets. The block menu groups conversions, table, section and block actions the same way. Slash keeps editor focus. Gutter-opened menus focus their first item.
- Paragraph/Heading block menus convert between prose and H1–H6 while preserving supported inline content; line breaks prevent conversion to a Heading. Admonition menus change among the standard kinds.
- Block action menu exposes existing supported deletion, and for a table adding a row below or a column right of the caret's cell; handle drag reorders through the existing editor operation. Unsupported structures remain protected.
- Text selection in supported paragraphs, headings, quotes, simple admonitions, table cells and Figure captions offers Bold, Italic, Strikethrough, Inline code, Link, Inline Math and Cross-reference.
- Figure selection shows an anchored property summary. Edit opens Image/Alt text/Label fields and a Caption field for plain captions; rich captions are edited in the document. Metadata Apply preserves rich caption content. Summary may dismiss outside; editing survives selection movement and outside interaction. Core validation failure preserves values. Apply/Cancel and explicit Escape-to-Cancel retain existing behavior; new never-applied Figure Cancel removes the transient block.
- Equations and Figures share one properties panel (#92): selecting the block shows a summary under its metadata line (`Equation (n) · label`, `Figure n · label`); Edit opens the form in the same panel (Equation: LaTeX, preview, label; Figure: image, alt text, label), with Apply/Cancel and Escape. A read-only block offers no Edit. Unapplied changes retain the block-local notice and an explicit applied-only Save/Source notice.
- Read-only restrictions, reference chips, caption text and errors stay visible. Authoring metadata is hidden at rest and revealed during interaction; actual labels remain explicit in properties/editing. There is no automatic Figure/equation/section numbering.

## Boundaries

No workspace, recursive tree, search, accounts, autosave, right-hand inspector, new block semantics, overlay framework or persistence architecture is introduced. New UI primitives enter through `components/ui`; native legacy controls continue to share product styles safely.

Browser procedures and repeatable scratch preparation: [TEST_GUIDE](../test/TEST_GUIDE.md). Actual visual evidence: [review record](editor-visual-refinement-v1-review.md).
