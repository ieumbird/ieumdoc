# Editor UX Shell v1

- Status: Implemented
- Last verified: 2026-10-24 (#386: immediate command-center search typing and document focus; command-center/editor-shell/document-tabs/ui-language/layout-rules/quiet-document browser regressions, Editor tests and typecheck/build).
- Code/endnote save verification: 2026-10-24 (#393: Core intermediate-snapshot regressions and Editor Save replay with a new endnote, code edit and existing definition edit; no UI change).
- Nested inline verification: 2026-10-24 (#377: Editor slash eligibility tests, Core list/Figure intermediate-footnote regressions, and actual citation-authoring menu/insertion/Save → Reload on all locations below, including a citation-only list item).
- Previous verification: 2026-10-24 (#367 cross-tab follow-up: explicit same-path Open remembers the active tab's list after another tab writes; tree-only no-write and Reload checks; folder-memory browser regression).
- Previous verification: 2026-10-24 (#367 review follow-up: same-path Close survives late restoration/Reload, tree-only updates do not rewrite paths; folder-memory browser regression).
- Previous verification: 2026-10-24 (#367: folder restoration/Open/Close response-order and Reload checks, unique nested New file/folder destinations; folder-memory browser regression).
- Previous verification: 2026-10-23 (#363 command center; Editor tests, typecheck/build, command-center/editor-shell/document-tabs/ui-language/layout-rules/quiet-document browser checks; [actual captures](editor-ux-shell-v1.md#command-center-verification-363)).
- Previous verification: 2026-10-23 (#235 [ADR-0009](../adr/0009-multiple-opened-folders.md): several opened folders as separate Sidebar sections, Open adds, per-folder Close, restored paths and outermost-folder location/New; Editor unit tests and stable browser suite).
- Previous verification: 2026-10-22 (#217: all-file Sidebar listing, bounded read-only image preview; Host/Editor/Desktop protocol tests and actual Vite/production HTTP browser regressions).
- Previous verification: 2026-10-20 (#256: bundled Korean/English settings, live language changes and editing preservation; `ui-language` browser scenario and Editor tests).
- Previous verification: 2026-10-19 (#255: document title area, Add a title, fixed title handle and Enter below the title; `document-title` browser scenario).
- Previous verification: 2026-10-19 (#298: the start without a document sits on the canvas with the product mark, apart from the paper; open-files, recovery, document-tabs and the stable suite; same-state captures against `e265e1c`: 1440px [before](assets/start-screen-298/before-1440.png)/[after](assets/start-screen-298/after-1440.png), 375px [before](assets/start-screen-298/before-375.png)/[after](assets/start-screen-298/after-375.png)).
- Previous verification: 2026-10-19 (#321: phone-width sidebar closed without a rail or covering the whole screen, opened from the TopBar; browser checks).
- Previous verification: 2026-10-17 (UX review: location identity, recent folders and unsupported files in Files, overlay sidebar below 640px, Copy path, tooltips, table Edit placement and Source lines; stable browser suite and captures in the [review](../reviews/editor-ux-review-2026-10-17.md)).
- Previous verification: 2026-10-16 (#296 PR2: shared recovery Settings, start list, matching-document prompt and standing failure surface; real Vite recovery UI checks).
- Previous verification: 2026-10-16 (#204: tab row, active shell and retained sessions; browser checks and user-approved 1440/375px captures in the [review](../reviews/document-tabs-204-2026-10-16.md)). Previous verification: 2026-10-15 (#281: cross-reference, section-reference, table-authoring, pending-figure, layout-rules and quiet-document browser checks; actual 1440px slash-menu Before/After). Previous verification: 2026-10-15 (#275 Equation/Figure/Table/section-label property-close caret, Apply/typing and insertion/Cancel/Escape browser regressions; ADR-0006 native admission wording compared with code/tests). Previous verification: 2026-10-13 (#176: Files/Display switching, tree/selection/history/draft preservation, File actions and Reload focus, unavailable settings; browser results and actual captures in the [#176 review](../reviews/editor-shell-176-2026-10-13.md)).
- Scope: existing Editor interactions. [Visual Language (current v4.7)](editor-visual-language-v1.md) and [Layout Rules v1](editor-layout-rules-v1.md) define presentation and geometry.

## Structure

Every Host has a Sidebar footer Settings entry (also in the collapsed rail) for Local recovery explanations and confirmed Clear all. The start screen adds a minimal recovery list/empty state; matching Open offers the newest record in a shared recovery dialog. Standing recording failures use MessageArea. The [recovery contract](editing-session-save-v1.md#local-recovery-records-296-pr2) owns retention and lifecycle. The typed Desktop bridge additionally provides About and update notice/actions. About reuses Base UI dialog focus/dismiss behavior; update notices do not take editor focus. Version/channel/progress/retry/restart policy is defined by [Desktop distribution](desktop-distribution-v1.md).

## UI display language (#256)

Settings in Web, HTTP Host and Desktop offers `한국어` and `English`, always written in their own languages. An explicit `ieumdoc.uiLanguage` preference wins; without a valid choice, a Korean first preferred browser/app language selects Korean and other languages select English. Both translations are bundled using i18next/react-i18next; there is no translation network request. If local preference storage fails, the current choice still applies and Settings explains that it may not persist.

Changes apply immediately to UI text, accessible names and the page `lang`. Menus support Korean and English search aliases regardless of display language. Operation IDs such as `saving` and `saved-pending` (also exposed by `data-operation`) are independent of translated status text. Translation cannot enable Save, switch documents or bypass work-loss protection.

Existing Admonition labels also update without a document edit. Block-handle accessible names translate the displayed block kind while preserving engine type IDs, and foreign-document tooltips translate their explanation while retaining the literal path.

The mounted editor, document, tabs, selection, history and unapplied property drafts survive language changes. Decorations are refreshed without a document transaction; NodeViews update their UI independently. Document text, labels, computed reference/caption notation and canonical Markdown do not change. No Core operation or CLI command is added: UI language is a local display preference, not a document semantic operation.

Application messages retain translation keys and parameters when stored. Save failures retain their submitted snapshot and are formatted at display time, so their location still refers to the failed submission. Core/Host/library diagnostic details retain their original text; the UI translates the surrounding context and phase-specific guidance without interpreting English reasons or duplicating validation rules. CLI diagnostics and OS-owned dialogs are outside this UI translation boundary.

Verification and implementation scope are recorded in the [#256 plan](ui-language-256-plan.md).

The document is the primary surface. Each document tab keeps one Tiptap/ProseMirror document state owning selection, history and editing; typed blocks use NodeViews and overlays.

The shell has three responsibilities: the Sidebar on the left switches between Files (which document) and Display (how it is shown), the document column in the center is authoring (what is edited), and the Document panel on the right is navigation inside the open document (where in it).

| Area | Current behavior |
| --- | --- |
| Sidebar | IeumDoc, then Files / Display tool buttons. Files is initially selected. Each tool opens the same panel space; choosing it from the collapsed rail also expands the sidebar. Collapse/expand retains the selected tool. Both buttons remain keyboard reachable and report selected/expanded state. Files contains the opened folders (#112, [ADR-0009](../adr/0009-multiple-opened-folders.md)), each its own section in the order opened, or, without any, Open folder… as its only general document-navigation entry, followed by the browser's recent folders (name, full path in `title`): one click lists that folder like Open folder, without opening a document. User-controlled collapse/expand, except that below 640px (phone widths) the sidebar starts closed with no rail, so the document uses the whole width, and opened from the TopBar it covers the whole screen (#321); there Escape inside it, Collapse sidebar, or opening or creating a document from it closes it again. No workspace or placeholder navigation. Each folder heading names its folder (icon and name, full path in `title`) with `+` (New file in folder), New folder and a `⋯` menu: Open folder… (adds a folder; one already open is listed again in place), Close folder (removes only that folder; tabs stay open). Below each heading the folder is a tree (sub-folders, then `.md` files, at each level): a folder expands and collapses in place, and expanding lists that one folder again; a document opens. A `.md` file whose leading frontmatter lacks the native marker stays listed in subtle text with its own icon, and its tooltip and accessible description say it is not an IeumDoc document; opening it still shows the refusal and why ([Folder listing](filesystem-host-boundary-v1.md#folder-listing-v1-112)). The folders above the open document expand by themselves in each opened folder containing it; a document elsewhere adds nothing to the trees. The opened folders' paths are browser preferences: on start they are listed again in order, and one the Host refuses or no longer has is left out quietly. Expanded folders and tool choice are page state only and are not restored on page reload. Switching tools or collapsing the sidebar retains the mounted tree, its expansion, scroll and keyboard stop, without listing again. The tree takes the remaining height and scrolls by itself; the open document uses the shared selected surface/text and a vertical current marker there and Close folder removes it. Keyboard: Up/Down, Home/End move through visible items; Right expands a folder or moves into it; Left collapses it or moves to the parent; Enter or Space opens a document or toggles a folder. Files does not list the open document separately: the tab row and TopBar name it. |
| Display | Identifies the current document by filename (full path in title). Saved in document contains Number headings: the existing H2–H6 setting, engine Undo/Redo and Save behavior. It is disabled without a document, during pending work and in Source, with a reason shown. Local view contains Wide document, remembered here and never written to Markdown or included in document history/dirty state. It remains available without a document and in Source. Tab enters the selected content; Escape in Display returns focus to its opening tool button. Tool changes do not remount the editor or discard its selection, history or drafts. This is separate from Desktop Settings/About. |
| Document panel | The heading outline (#61), titled Outline with a Hide outline button. The outline is derived from the editor document, indents 12px per level below H1 up to three levels and wraps labels to two lines, marks the section being read and keeps that mark inside the list's visible area. The list scrolls by itself and is never written to the document. At 1280px and wider the panel is docked and starts open; below 1280px it starts closed and, opened, overlays the document below the sticky header instead of narrowing it, so Save, File actions and the Outline toggle stay usable; Escape closes it. The docking width is independent of the 1024px narrow sidebar. Crossing 1280px starts the panel in that layout's default. Open/closed is page state only. |
| TopBar | At phone widths with the sidebar closed, Expand sidebar first; actual status on the left; the centered command-center button contains the document's location and filename (full path in title); the location names the folders from the outermost opened sidebar folder containing the document down, otherwise its own folder. Visual/Source and Outline, then Save and File actions (`⋯`) on the right. File actions contains Reload and Copy path (the full path to the clipboard, confirmed by a temporary notice, or an explanatory error where the browser has no Clipboard API); the menu is unavailable without a document or during pending work. Enter/Space opens it, arrows navigate, Escape closes and returns focus. Reload keeps its existing discard confirmation and modal boundary while loading; closing that dialog returns focus to File actions. Outline shows or hides the Document panel (pressed while shown); closing the panel returns focus to it. Sticky while document scrolls. |
| Document tabs | A separate row inside the sticky header below TopBar. Filename, dirty dot, close button and full-path tooltip; same-named files show the shortest distinguishing parent folder after the name, which stays visible while the name ellipsizes. Only this row scrolls horizontally on narrow screens. Accessible tablist/tab/tabpanel relationships, Left/Right/Home/End switching and Delete to close. Closing selects the right neighbour, else left; an inactive close keeps the current tab. |
| MessageArea | Load/save errors, conflict and temporary notices below the tab row; no reserved height when empty. |
| Document | Continuous white writing surface with a subtle edge on a muted canvas, extending at least to the bottom of the viewport minus its outer gap. Block tools occupy its gutter. Empty editable documents expose a first-line hint and `+`. No fixed formatting toolbar. |

General file navigation is Open folder… followed by choosing a `.md` file in the sidebar tree; there is no full-file-path dialog (#190). Closing the folder dialog returns focus to the control that opened it. Open folder uses an in-app [folder picker](folder-picker-v1.md), with path completion, breadcrumbs, Up, New folder, recent folders and starting places. Navigating never opens a folder: Enter or Open applies the typed path to the sidebar. A document clicked in the folder opens through Open and its checks ([Folder listing v1](filesystem-host-boundary-v1.md#folder-listing-v1-112)). Source previews canonical Markdown read-only, one numbered line per Markdown line (the numbers are never copied); it does not replace or reconstruct that tab's visual editor state. Pending Source work blocks document switching. Unapplied drafts remain unsaved while Save/Source use applied content; Reload explicitly confirms discarding local work. See [Editing session and Save v1](editing-session-save-v1.md). Clean loaded state is silent; document changes/drafts show `Unsaved changes`. `Saved` is shown only following a successful save with no remaining edits. Saving/errors/conflict retain their meaning; there is no autosave.

Opening another document or the folder heading's `+` opens a new tab after Host success; an already-open
normalized path activates its tab without a Host GET when the requested path matches exactly. Other
spellings still use Host normalization. Neither Open/New nor tab switching asks to discard work. Switching
retains history, block property drafts, selection, scroll and view; transient inline link/math inputs
close on blur as within one document. Active pending Save/Source/assets/Open/New still
block it. **Save / Don't save / Cancel** is used for closing one dirty tab. Failed Save, Cancel, or newer
applied edits after Save keep that tab. Inactive tabs keep their state with overlays and measurement
suspended. Browser unload and Desktop close/update inspect all tabs. See the
[editing-session contract](editing-session-save-v1.md#switching-and-recovery).

A folder heading's `+` opens the New filename form without work-loss confirmation. Its Location field shows the destination and lists the
opened folders and every sub-folder their trees have listed, each named from its opened folder
(`docs`, `docs\guides`). Overlapping trees contribute each Host-normalized path only once: the first
occurrence in opened-folder order, then tree order, supplies its position and label. It starts at the open document's folder when that is inside the
heading's folder, otherwise at that folder. Expanding or collapsing folders never changes it.
New asks for a filename, adds `.md` if omitted and uses the existing creation checks; success
opens the document in a new tab and lists its folder again. When the modal closes after successful creation,
focus moves to the first paragraph for immediate typing. Cancel/Escape, including after a
rejected creation, returns focus to the New button.
It is the only New entry point. See [Folder New](folder-picker-v1.md#new-document-in-a-sidebar-folder).
The heading's New folder uses the same Location and starting destination for a folder name;
success shows the folder in the tree and returns focus to New folder. See [New folder](folder-picker-v1.md#new-folder).

The folder-tree hook owns the live opened list and the preference derived from it. User Open/Close
remembers the latest reduced list; if startup restoration is pending, writing waits until every
remembered path has been tried. Restoration alone leaves preferences unchanged, including paths
the Host no longer lists. A user Open/Close of the same Host-normalized path wins over a late
restoration response, so a closed folder stays closed. Successful explicit Open/Close always
remembers that browser tab's current list, including a same-path Open after another tab saved a
different list. Tree expansion and listing updates never write preferences. See
[Folder picker behavior](folder-picker-v1.md#behavior).

Behavior change (sidebar chrome cleanup): the sidebar no longer has the Open…, Open folder…
and New button row or the separate current-document row. The app-level New, which took a full
file path in any existing directory, is removed rather than moved: a document is created by
opening its folder and using the folder's `+`. The separate full-file-path Open file entry is also
removed (#190); the shared document loader, Host file APIs and Desktop `.md` arguments remain.
Folder navigation changes no document meaning, so this removal adds no Core operation or CLI command.

## Start without a document (#174)

When the Host's answer to the first request opens no document (Desktop without a `.md` argument,
or the [HTTP Host](http-host-v1.md)), the document column
shows the start instead of an editor. It is the app's start, not a document (#298): it sits on the
canvas without the document paper, under the product mark and name. It offers Open folder… (primary), the
recent folders from the folder picker (name, then full path) and, when the Host offers one, the
sample. Choosing a recent folder lists it in the sidebar like Open folder; the start stays until
a document is chosen in the sidebar. Choosing a folder never discards current edits or drafts;
choosing another file uses the existing document-switch guards. Open sample document opens the Host's writable sample through Open and its
checks, with a temporary notice that it is a copy in the app's data. Nothing is opened for the
user. Without a document the TopBar shows `No file opened`; Save, File actions and the views
stay unavailable. Display remains reachable, with heading numbering disabled and local width available. No error is shown. With nothing to lose, the Desktop app's
update restart check allows the restart unless a document is opening. Closing the last document tab returns here while keeping the folder tree and preferences. Host start
information is retained; a Host that supplied an initial document instead of start information returns
to the folder/recent-folder actions without inventing a sample. The browser development server still
opens its default document on a fresh page load. HTTP offers allowed server folders, filters recent folders to
those roots and has no sample fallback. The start writes nothing and changes no document
semantics, so it has no CLI counterpart.

## Command center (#363)

The current document's location/name is a searchable command-center button centered in the TopBar.
The existing full-path tooltip and `No file opened` state remain. Click or Ctrl/Cmd+P opens a
search dialog near the top center; Ctrl/Cmd+Shift+P starts with `>` to list commands only.
The input searches already-open document names/paths and existing shell command names, including
their Korean/English aliases. It does not list unopened files or search document contents.

Commands reuse Open folder, Save, Reload, Copy path, Visual/Source, Outline, sidebar, document width
and Settings handlers and their current availability. Switching to an opened document reuses tab
activation: no document read/write, new editor state or implicit save. Pending operations retain the
same switching and document-action restrictions; unavailable results remain visibly disabled.
Without an open document, the center still offers folder/settings/view-layout commands.

Base UI Combobox owns keyboard/pointer highlighting, selection and IME handling inside the shared
Dialog. Filtering highlights the first match; the first Down moves to the next available result.
Hover moves the same active highlight, using the existing selected surface; arrows continue from
that item. Enter runs the chosen item. The search input autofocuses on mount so typing immediately
after the opening shortcut goes to search, including before the Dialog's deferred initial focus.
Selecting a Visual document focuses its editor after tab activation and modal dismissal, preserving
its selection and allowing immediate typing; this applies to a newly opened or retained tab and
reselecting the active tab. A tab retained in read-only Source keeps that view and tab-button focus.
Escape/outside dismissal returns to the invoking control or editor without changing its
selection/history/property drafts.
A selected command closes the center before opening its target dialog; that dialog owns focus.
Outline and sidebar commands hand focus to their surviving toggle, including when the invoking
control was inside the panel being hidden. On a phone, closing the sidebar focuses its TopBar opener.
Other dialogs retain their shortcuts, and Ctrl/Cmd+S cannot save behind the center.
No-match feedback and controls are translated with the existing UI language.

This is Editor shell navigation only. It adds no semantic operation or CLI command; Core and the
existing file/session handlers remain authoritative. The first version has no command plugin system,
recent-command persistence, filesystem index or new document-content actions.

### Command center verification (#363)

Clean-base captures were taken at `4b55e5506ea85a3ef4bc1c99f92c2e5b7f18e710` before product
edits. The same `quiet-document` fixture, 100% zoom, loaded fonts/images and scroll-top state
were captured after implementation. The 768px header now uses two rows; document typography and
horizontal geometry remain unchanged. New-center captures show real opened documents, not a mockup.

| State | Before | After | Viewport |
| --- | --- | --- | --- |
| Quiet Document, wide | [Before](assets/command-center-363/before-1440.png) | [After](assets/command-center-363/after-1440.png) | 1440×1000 |
| Quiet Document, narrow | [Before](assets/command-center-363/before-768.png) | [After](assets/command-center-363/after-768.png) | 768×1000 |
| Center search | — | [Opened documents and commands](assets/command-center-363/search-1440.png) | 1440×900 |
| Phone | — | [Entry](assets/command-center-363/center-375.png), [Korean command search](assets/command-center-363/search-ko-375.png) | 375×900 |

`command-center` checks no-document/disabled/no-match states, cancel preserving the editor and
selection, command-only shortcut, IME and Save shortcut ownership, modal focus handoff, dirty tab
and property-draft retention, Undo/Redo, real Save/Reload, pending-Save restrictions, view switching,
equal filenames, Korean/English search and 1440/1024/768/375px bounds. Existing `editor-shell`,
`document-tabs`, `ui-language`, `layout-rules` and `quiet-document` also passed. Editor tests
(272), typecheck/build, documentation and whitespace checks passed. No Core/CLI semantics changed.

### Command center keyboard verification (#386)

At base `a61dff5b32b6c6d36b8c8d225539700b07789589`, on Windows Chrome in the same worktree,
Ctrl+P followed immediately by typing `technical` lost its first character to the editor in 3 of
12 attempts. The Dialog schedules initial focus on the next animation frame; mounting the search
input with autofocus closes that gap while retaining the Dialog's focus/dismissal handling.
Document selection focused the tab button, so immediate typing failed for both retained and newly
opened tabs, including selecting the active tab again. Selection now activates the tab together with
dismissal and supplies its existing editor focus target to the Dialog's final-focus handling.

The first-Down and missing-hover reports were not reproduced: ten search attempts covered direct
typing (`> o`, `> s`, `technical`), fill, replacing a query and searching after no matches. Down moved
to the next result. Seven pointer attempts moved the same active highlight and showed the existing
selected surface. No navigation, hover, style, search-scope or shortcut-mapping change was made.

The existing `command-center` scenario failed before the fix for immediate search typing and both
document focus cases. It now sends real keyboard input while delaying the next animation frame,
checks both opening shortcuts, first Down, hover appearance/shared active item, arrows after hover,
and immediate typing/Undo after retained/newly opened/active-tab selection. Source view, editor
state/history/property drafts, cancellation, panel hiding and command/modal focus handoff remain
covered. A repeat of the unthrottled typing probe passed all 12 attempts after the fix. Related
`editor-shell`, `document-tabs`, `ui-language`, `layout-rules` and `quiet-document` checks also passed.
No Core operation or CLI command is needed for these Editor-only focus interactions.

## Writing interactions

- The leading level-1 heading is the [document title](document-editing-v1.md#document-title-255) and stays first: its handle opens block actions but does not drag, nothing drops above it, and Enter in it continues below it. A document without one shows Add a title above its first block; an empty title shows `Title` and is removed if left empty.
- Hover or keyboard focus reveals the current block's `+` and drag/action handle. Pointer travel into tools preserves them; hover does not change document state. On devices without hover, tools remain visible. A single empty editable paragraph is the starting-state exception: its `+` is always visible, its drag handle hidden, and a non-persistent hint says `Start writing, or type / to add a block.` Typing hides the hint; undo restores it. Clicking the paper below the content continues writing through the existing editor operation.
- `+` and `/` share supported insert commands, grouped by dividers with an icon and, as a key chip, the Markdown shortcut that makes the same block: Text (Paragraph, Heading 1–3; Heading 4–6 only when the query matches), Lists, Blocks (Note, Warning, Quote, Divider), Technical (Code block, Equation, Figure, Table); slash also offers Endnote ([Endnotes](footnotes-v1.md)) and actual Equation/Figure/Table targets and section references. The block menu groups conversions, table, section and block actions the same way. Slash keeps editor focus. Gutter-opened menus focus their first item.
- Slash reference choices show computed display numbers with caption summaries (Equation: label), and search caption words, labels, kinds and display prefix/number; `Fig. 2`, `Eq. 3` and `Table 1` remain one slash query. Section choices keep their heading names and creation behavior. Ordering and overflow use the existing shared menu; see [reference search and menu names](section-references-v1.md#editor).
- Paragraph/Heading block menus convert between prose and H1–H6 while preserving supported inline content; line breaks prevent conversion to a Heading. Admonition menus change among the standard kinds.
- Block action menu exposes existing supported deletion, and for a table adding a row below or a column right of the caret's cell; a table's own action bar below it holds Edit (caption and label), Table actions and Delete table; handle drag reorders through the existing editor operation. Unsupported document structures reject [native admission](document-support-v1.md). [Endnotes](footnotes-v1.md#editor) follow their first reference: their handle opens block actions but does not drag, they have no `+`, and a dragged block lands in the body.
- Text selection in supported paragraphs, headings, quotes, simple admonitions, table cells and Figure captions offers Bold, Italic, Strikethrough, Subscript, Superscript, Inline code, Link, Inline Math and Cross-reference. Each button's tooltip names it with its shortcut where one exists (Bold Ctrl/Cmd+B, Italic Ctrl/Cmd+I, Strikethrough Ctrl/Cmd+Shift+S, Inline code Ctrl/Cmd+E); Cross-reference uses a bookmark icon, as do reference choices in the slash menu. Ctrl/Cmd+, and Ctrl/Cmd+. toggle subscript and superscript; applying one replaces the other. Tab moves from the selection into the toolbar (in table cells and lists Tab keeps its cell/indent meaning); Escape or Shift+Tab returns with the selection unchanged.
- Figure selection shows the selection outline only. Explicit Edit opens Image/Alt text/Label fields and a Caption field for plain captions; rich captions are edited in the document. Metadata Apply preserves rich caption content. Editing survives selection movement and outside interaction. Core validation failure preserves values. Apply/Cancel and explicit Escape-to-Cancel retain existing behavior; Cancel never removes the Figure.
- `/figure` and `+` insert an empty Figure without opening its properties; the caret starts in its caption. Image-less Figures, with or without caption or label, remain as pending Figures with a dashed `No content yet` frame. Clicking the frame selects the Figure; existing Edit connects an image URL later. Pending Figures retain normal Figure metadata, numbering and references and are included in Save/Source. See [Figure authoring](figure-authoring-v1.md).
- Equations, Figures, Tables and section labels use the shared explicit properties form: selecting a block opens no panel; Edit opens the form anchored to its metadata line (Equation: LaTeX, preview, label; Figure: image, alt text, label), with Apply/Cancel and Escape. Edit focuses the first field; closing retains a text selection inside the block or returns a [caret after the block](document-editing-v1.md#continuous-editing), so subsequent typing preserves it. Focus restoration itself changes neither document nor history. Unapplied changes retain the block-local notice and an explicit applied-only Save/Source notice.
- Authoring restrictions, reference chips, caption text and errors stay visible. Authoring metadata is hidden at rest and revealed during interaction; actual labels remain explicit in properties/editing. Figure, Equation and captioned/labeled Table numbers are computed for display and never written into their text. The [Number headings](heading-numbering-v1.md) checkbox in Display optionally numbers H2–H6 in the document and Outline, leaves H1 as a title, and saves MyST numbering settings only.

### Nested inline slash menu (#377)

Implementation scope: expose existing inline insertion paths on Core-backed editable inline
surfaces. Preserve top-level paragraph order/search/keys; omit block commands everywhere else.
No new Core semantic operation, CLI command, search ranking or gutter `+` change is needed.
Completion requires menu/insertion regressions and actual Save → Reload, including a citation-only
list item (#366), plus Editor tests, typecheck/build and documentation checks.

| Caret location | Citation / document reference | Endnote | Existing Core save contract |
| --- | --- | --- | --- |
| Top-level paragraph | Yes; existing full menu | Yes | Paragraph inline content |
| List item, including nested lists | Yes; inline menu only | Yes | `updateList` with typed item content; [native List contract](document-support-v1.md#supported-meaning) |
| Quote / simple admonition | Yes; inline menu only | Yes | `updateQuoteInlineContent` / `updateAdmonitionInlineContent` |
| Endnote definition | Yes; inline menu only | No | `updateFootnoteDefinition` permits citations/references and refuses footnote references |
| Table header/body cell | Yes; inline menu only | Yes | `updateTableCell` |
| Figure caption | Yes; inline menu only | Yes | `updateFigure` with inline caption content |
| Heading, including document title | Yes; inline menu only | Yes | `updateHeadingInlineContent` |
| Table caption / code / property fields | No menu | No menu | Table caption is not a caret surface in the editor document; code and fields keep literal input |

The Editor schema mirrors these existing Core inline contracts (in particular, a definition
excludes `footnoteReference`). Menu eligibility and the existing endnote insertion guard use
that schema; the Editor introduces no new semantic rule. Figure/list Save uses the existing
typed content operations even though the dedicated Core `insertFootnote`/`insertCitation`
addressing surface does not include those locations. The same `insertCitation`, `insertReference`
and `insertEndnote` paths serve all locations. Arrows, Enter and Escape keep the shared menu's
existing behavior. See [citations](citations-v1.md), [references](section-references-v1.md) and
[endnotes](footnotes-v1.md) for their persistent contracts.

List and Figure round-trip validation compares the completed intermediate footnote snapshot that
`serializeFor` already verifies. This lets the existing Save replay edit a list before adding
its new definitions, just as other inline operations do. It still compares block count,
list structure, exact inline content and canonical stability; final writes still reject
missing definitions. No new persistent document combination is introduced.

Code block edits can be saved together with new endnote references (#393). Core compares
the code block round-trip count with the same completed footnote snapshot used for
serialization, matching the list and Figure checks. Save replay order is unchanged;
final writes still require real definitions. The literal `/` code probe in
`citation-authoring` remains separate from this Core/replay regression coverage.

## Boundaries

No workspace, recursive filesystem scan, folder watch, filesystem/content search, accounts, autosave, new block semantics, overlay framework or persistence architecture is introduced. The right-side Document panel hosts only the Outline: no properties inspector, AI panel, References panel, tabs or generic panel/extension framework is introduced. Buttons enter through the Base UI `components/ui/button`; Notice remains a separate presentation primitive.

Browser procedures and repeatable scratch preparation: [TEST_GUIDE](../test/TEST_GUIDE.md). Actual shell evidence: [#176 review](../reviews/editor-shell-176-2026-10-13.md); earlier visual evidence: [review record](editor-visual-refinement-v1-review.md).


## Folder files and image preview (#217)

Files lists every regular non-hidden file, including extensionless files; symlinks/junctions stay excluded.
Markdown retains existing document/native admission and tab behavior. Images use the image icon and
read-only preview description; other files use the generic file icon and explicit editing-unavailable
description. Mouse and Enter/Space share the same dispatch. Image/file selection opens a transient
shared Dialog, preserving the existing editor, selection, Undo, dirty work and property drafts.
Other files show name/path and an editing-unavailable explanation only. Image loading/failure stays
inside the dialog; closing or Escape returns focus to its tree row. The modal blocks Save shortcuts.
The image picker remains independent. See the [Host preview contract](filesystem-host-boundary-v1.md#read-only-folder-preview-217).
