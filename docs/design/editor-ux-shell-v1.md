# Editor UX Shell v1

- Status: Implemented
- Last verified: 2026-10-08 (empty-document start, New success/cancel focus and real-file Save → Reload exercised by browser regression).
- Scope: existing Editor interactions. [Visual Language (current v3)](editor-visual-language-v1.md) and [Layout Rules v1](editor-layout-rules-v1.md) define presentation and geometry.

## Structure

The document is the primary surface. One Tiptap/ProseMirror document state owns selection, history and editing; typed blocks use NodeViews and overlays.

The shell has three responsibilities: the Sidebar on the left is filesystem/document navigation (which document), the document column in the center is authoring (what is edited), and the Document panel on the right is navigation inside the open document (where in it).

| Area | Current behavior |
| --- | --- |
| Sidebar | IeumDoc, then the chosen folder (#112) or, without one, a compact choice of Open folder… (primary) and Open file…. User-controlled collapse/expand; no workspace or placeholder navigation. The folder heading names the chosen folder (icon and name, full path in `title`) with `+` (New file in folder) and a `⋯` menu: Open file…, Open folder…, Close folder. Below it the folder is a tree (sub-folders, then `.md` files, at each level): a folder expands and collapses in place, and expanding lists that one folder again; a document opens. The folders above the open document expand by themselves when it is inside the chosen folder; a document elsewhere adds nothing to the tree. Expanded folders are page state only and are not restored on reload. The tree takes the remaining height and scrolls by itself; the open document uses the shared selected surface/text and a vertical current marker there and Close folder removes it. Keyboard: Up/Down, Home/End move through visible items; Right expands a folder or moves into it; Left collapses it or moves to the parent; Enter or Space opens a document or toggles a folder. The open document is not listed separately: the TopBar names it. |
| Document panel | The heading outline (#61), titled Outline with a Hide outline button. The outline is derived from the editor document, indents 12px per level below H1 up to three levels and wraps labels to two lines, marks the section being read and scrolls by itself; it is never written to the document. At 1280px and wider the panel is docked and starts open; below 1280px it starts closed and, opened, overlays the document below the sticky header instead of narrowing it, so Save, Reload and the Outline toggle stay usable; Escape closes it. The docking width is independent of the 1024px narrow sidebar. Crossing 1280px starts the panel in that layout's default. Open/closed is page state only. |
| TopBar | Filename (full path in title) and actual status on the left; Number headings icon toggle, Visual/Source, Wide document, Outline, Reload and Save on the right, in that order. Wide document widens the document column and is remembered in this browser only. Outline shows or hides the Document panel (pressed while shown); closing the panel returns focus to it. Sticky while document scrolls. |
| MessageArea | Load/save errors, conflict and temporary notices below TopBar; no reserved height when empty. |
| Document | Continuous white writing surface with a subtle edge on a muted canvas, extending at least to the bottom of the viewport minus its outer gap. Block tools occupy its gutter. Empty editable documents expose a first-line hint and `+`. No fixed formatting toolbar. |

Open file… uses the existing local path dialog. Open folder uses an in-app [folder picker](folder-picker-v1.md), with path completion, breadcrumbs, Up, recent folders and starting places. Navigating never opens a folder: Enter or Open applies the typed path to the sidebar. A document clicked in the folder opens through Open and its checks ([Folder listing v1](filesystem-host-boundary-v1.md#folder-listing-v1-112)). Source previews canonical Markdown read-only (or the original Markdown when an unwritable file opens read-only); it does not replace or reconstruct the single visual editor state. Pending Source work blocks document switching. Unapplied drafts remain unsaved while Save/Source use applied content; Reload explicitly confirms discarding local work. See [Editing session and Save v1](editing-session-save-v1.md). Clean loaded state is silent; document changes/drafts show `Unsaved changes`. `Saved` is shown only following a successful save with no remaining edits. Saving/errors/conflict retain their meaning; there is no autosave.

The folder heading's `+` opens New. Its Location field shows the destination and lists the
chosen folder and every sub-folder the tree has listed, named from the chosen folder
(`docs`, `docs\guides`); it starts at the open document's folder when that is inside the
chosen folder, otherwise at the chosen folder. Expanding or collapsing folders never changes it.
New asks for a filename, adds `.md` if omitted and uses the existing creation checks; success
opens the document and lists its folder again. When the modal closes after successful creation,
focus moves to the first paragraph for immediate typing. Cancel/Escape, including after a
rejected creation, returns focus to the New button.
It is the only New entry point. See [Folder New](folder-picker-v1.md#new-document-in-a-sidebar-folder).

Behavior change (sidebar chrome cleanup): the sidebar no longer has the Open…, Open folder…
and New button row or the separate current-document row. The app-level New, which took a full
file path in any existing directory, is removed rather than moved: a document is created by
opening its folder and using the folder's `+`. Open file… keeps arbitrary `.md` paths, and the
Host's creation API and checks are unchanged.

## Writing interactions

- Hover or keyboard focus reveals the current block's `+` and drag/action handle. Pointer travel into tools preserves them; hover does not change document state. On devices without hover, tools remain visible. A single empty editable paragraph is the starting-state exception: its `+` is always visible, its drag handle hidden, and a non-persistent hint says `Start writing, or type / to add a block.` Typing hides the hint; undo restores it. Clicking the paper below the content continues writing through the existing editor operation.
- `+` and `/` share supported insert commands, grouped by dividers with an icon and the Markdown shortcut that makes the same block: Text (Paragraph, Heading 1–3; Heading 4–6 only when the query matches), Lists, Blocks (Note, Warning, Quote, Divider), Technical (Code block, Equation, Figure, Table); slash also offers actual Equation/Figure/Table targets and section references. The block menu groups conversions, table, section and block actions the same way. Slash keeps editor focus. Gutter-opened menus focus their first item.
- Paragraph/Heading block menus convert between prose and H1–H6 while preserving supported inline content; line breaks prevent conversion to a Heading. Admonition menus change among the standard kinds.
- Block action menu exposes existing supported deletion, and for a table adding a row below or a column right of the caret's cell; handle drag reorders through the existing editor operation. Unsupported structures remain protected.
- Text selection in supported paragraphs, headings, quotes, simple admonitions, table cells and Figure captions offers Bold, Italic, Strikethrough, Subscript, Superscript, Inline code, Link, Inline Math and Cross-reference. Ctrl/Cmd+, and Ctrl/Cmd+. toggle subscript and superscript; applying one replaces the other.
- Figure selection shows an anchored property summary. Edit opens Image/Alt text/Label fields and a Caption field for plain captions; rich captions are edited in the document. Metadata Apply preserves rich caption content. Summary may dismiss outside; editing survives selection movement and outside interaction. Core validation failure preserves values. Apply/Cancel and explicit Escape-to-Cancel retain existing behavior; new never-applied Figure Cancel removes the transient block.
- Equations and Figures share one properties panel (#92): selecting the block shows a summary under its metadata line (`Equation (n) · label`, `Figure n · label`); Edit opens the form in the same panel (Equation: LaTeX, preview, label; Figure: image, alt text, label), with Apply/Cancel and Escape. A read-only block offers no Edit. Unapplied changes retain the block-local notice and an explicit applied-only Save/Source notice.
- Read-only restrictions, reference chips, caption text and errors stay visible. Authoring metadata is hidden at rest and revealed during interaction; actual labels remain explicit in properties/editing. Figure, Equation and captioned/labeled Table numbers are computed for display and never written into their text. The [Number headings](heading-numbering-v1.md) toggle optionally numbers H2–H6 in the document and Outline, leaves H1 as a title, and saves MyST numbering settings only.

## Boundaries

No workspace, recursive filesystem scan, folder watch, search, accounts, autosave, new block semantics, overlay framework or persistence architecture is introduced. The right-side Document panel hosts only the Outline: no properties inspector, AI panel, References panel, tabs or generic panel/extension framework is introduced. New UI primitives enter through `components/ui`; native legacy controls continue to share product styles safely.

Browser procedures and repeatable scratch preparation: [TEST_GUIDE](../test/TEST_GUIDE.md). Actual visual evidence: [review record](editor-visual-refinement-v1-review.md).
