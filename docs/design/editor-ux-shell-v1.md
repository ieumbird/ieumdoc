# Editor UX Shell v1

- Status: Implemented
- Double-click verification: 2026-10-26 (#470: figure-authoring and equation-insertion browser regressions verify the shared Edit path, focus, draft/history preservation and native Figure-caption word selection).

- Last verified: 2026-10-26 (Sidebar summary checked against the file-listing contract and implementation; incoming heading links checked; no Editor/browser/Desktop re-execution).

- Scope: existing Editor interactions. [Visual Language (current v4.7)](editor-visual-language-v1.md) and [Layout Rules v1](editor-layout-rules-v1.md) define presentation and geometry.

Historical verification records: [Verification record](#verification-record).

## Structure

Every Host has a Sidebar footer Settings entry (also in the collapsed rail) for Local recovery explanations and confirmed Clear all. The start screen adds a minimal recovery list/empty state; matching Open offers the newest record in a shared recovery dialog. Standing recording failures use MessageArea. The [recovery contract](editing-session-save-v1.md#local-recovery-records-296-pr2) owns retention and lifecycle. The typed Desktop bridge additionally provides About and update notice/actions. About reuses Base UI dialog focus/dismiss behavior; update notices do not take editor focus. Version/channel/progress/retry/restart policy is defined by [Desktop distribution](desktop-distribution-v1.md).

The document is the primary surface. Each document tab keeps one Tiptap/ProseMirror document state owning selection, history and editing; typed blocks use NodeViews and overlays.

The shell has three responsibilities: the Sidebar on the left switches between Files (which document) and Display (how it is shown), the document column in the center is authoring (what is edited), and the Document panel on the right is navigation inside the open document (where in it).

| Area | Current behavior |
| --- | --- |
| Sidebar | IeumDoc and, while expanded, one always-visible Open folder… icon button followed by Collapse sidebar in the header; then Files / Display tool buttons. Files is initially selected. Each tool opens the same panel space; choosing it from the collapsed rail also expands the sidebar. Collapse/expand retains the selected tool. Both buttons remain keyboard reachable and report selected/expanded state. Files contains the opened folders (#112, [ADR-0009](../adr/0009-multiple-opened-folders.md)), each its own section in the order opened, or, without any, guidance followed by the browser's recent folders (name, full path in `title`): one click lists that folder like Open folder, without opening a document. User-controlled collapse/expand, except that below 640px (phone widths) the sidebar starts closed with no rail, so the document uses the whole width, and opened from the TopBar it covers the whole screen (#321); there Escape inside it, Collapse sidebar, or opening or creating a document from it closes it again. No workspace or placeholder navigation. Each folder heading names its folder (disclosure button and name, full path in `title`; [section visibility](#collapsible-folder-sections-425)) with `+` (New file in folder), New folder and a `⋯` menu containing only Close folder (removes only that folder; tabs stay open). The header Open folder… adds a folder; one already open is listed again in place. It stays in the same position with zero, one or several folders, including while Display is selected; the empty Files panel has no duplicate button (#385). Below each heading is a folder tree; file listing and activation follow [Folder files and image preview](#folder-files-and-image-preview-217). A `.md` file whose leading frontmatter lacks the native marker stays listed in subtle text with its own icon, and its tooltip and accessible description say it is not an IeumDoc document; opening it still shows the refusal and why ([Folder listing](filesystem-host-boundary-v1.md#folder-listing-v1-112)). On explicit active-document path changes, the containing sections and folders above it expand in each opened folder containing it; a document elsewhere adds nothing to the trees. The opened folders' paths are browser preferences: on start they are listed again in order, and one the Host refuses or no longer has is left out quietly. Child-folder expansion and tool choice are page state only. Root section collapse is an origin-specific preference restored on Reload/Desktop restart; startup document restoration respects it. Switching tools or collapsing the sidebar retains the mounted tree, its expansion, scroll and keyboard stop, without listing again. The tree takes the remaining height and scrolls by itself; the open document uses the shared selected surface/text and a vertical current marker there and Close folder removes it. Keyboard: Up/Down, Home/End move through visible items; Right expands a folder or moves into it; Left collapses it or moves to the parent; Enter or Space opens a document or toggles a folder. Files does not list the open document separately: the tab row and TopBar name it. |
| Display | Identifies the current document by filename (full path in title). Saved in document contains Number headings (H2–H6) and Reference style (Default, Concise, Formal, Korean; unmatched values show Custom), sharing document history and Save behavior under the [numbering contract](heading-numbering-v1.md). It is disabled without a document, during pending work and in Source, with a reason shown. Local view contains Wide document, remembered here and never written to Markdown or included in document history/dirty state. It remains available without a document and in Source. Tab enters the selected content; Escape in Display returns focus to its opening tool button. Tool changes do not remount the editor or discard its selection, history or drafts. This is separate from Desktop Settings/About. |
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

On Reload or Desktop restart, tab paths, order and active identity are restored from browser
preferences, after opened-folder restoration. Missing/refused/non-native documents are quietly
excluded; no document content, cursor or undo is remembered here. Explicit URL/Desktop launch paths
win over remembered tabs, and unsaved recovery records retain their existing review flow rather than
being opened automatically from disk. Restoration alone does not rewrite preferences; successful
user Open/New, Close, recovery Restore or tab selection remembers the current list. An empty list
keeps the start screen. See [startup precedence and recovery](editing-session-save-v1.md#tab-navigation-memory-383).

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

Behavior change (sidebar chrome cleanup): the sidebar no longer has the old Open…, Open folder…
and New button row; #385 supplies the single header Open folder… described above. There is no separate current-document row. The app-level New, which took a full
file path in any existing directory, is removed rather than moved: a document is created by
opening its folder and using the folder's `+`. The separate full-file-path Open file entry is also
removed (#190); the shared document loader, Host file APIs and Desktop `.md` arguments remain.
Folder navigation changes no document meaning, so this removal adds no Core operation or CLI command.

## Boundaries

No workspace, recursive filesystem scan, folder watch, filesystem-wide or document-content search, accounts, autosave, new block semantics, overlay framework or persistence architecture is introduced. The right-side Document panel hosts only the Outline: no properties inspector, AI panel, References panel, tabs or generic panel/extension framework is introduced. Buttons enter through the Base UI `components/ui/button`; Notice remains a separate presentation primitive.

Browser procedures and repeatable scratch preparation: [TEST_GUIDE](../test/TEST_GUIDE.md). Actual shell evidence: [#176 review](../reviews/editor-shell-176-2026-10-13.md); earlier visual evidence: [review record](editor-visual-refinement-v1-review.md).

## UI display language (#256)

Settings in Web, HTTP Host and Desktop offers `한국어` and `English`, always written in their own languages. An explicit `ieumdoc.uiLanguage` preference wins; without a valid choice, a Korean first preferred browser/app language selects Korean and other languages select English. Both translations are bundled using i18next/react-i18next; there is no translation network request. If local preference storage fails, the current choice still applies and Settings explains that it may not persist.

Changes apply immediately to UI text, accessible names and the page `lang`. Menus support Korean and English search aliases regardless of display language. Operation IDs such as `saving` and `saved-pending` (also exposed by `data-operation`) are independent of translated status text. Translation cannot enable Save, switch documents or bypass work-loss protection.

Existing Admonition labels also update without a document edit. Block-handle accessible names translate the displayed block kind while preserving engine type IDs, and foreign-document tooltips translate their explanation while retaining the literal path.

The mounted editor, document, tabs, selection, history and unapplied property drafts survive language changes. Decorations are refreshed without a document transaction; NodeViews update their UI independently. Document text, labels, computed reference/caption notation and canonical Markdown do not change. No Core operation or CLI command is added: UI language is a local display preference, not a document semantic operation.

Application messages retain translation keys and parameters when stored. Save failures retain their submitted snapshot and are formatted at display time, so their location still refers to the failed submission. Core/Host/library diagnostic details retain their original text; the UI translates the surrounding context and phase-specific guidance without interpreting English reasons or duplicating validation rules. CLI diagnostics and OS-owned dialogs are outside this UI translation boundary.

Verification and implementation scope are recorded in the [#256 plan](ui-language-256-plan.md).

## Collapsible folder sections (#425)

An opened folder without remembered section collapse starts expanded. The chevron beside its name is a native compact ghost button,
with localized `Collapse folder <name>` / `Expand folder <name>` labels and tooltips, `aria-expanded`
and `aria-controls` naming that section's tree. The name remains the section/tree title and its
full path remains in `title`. The chevron points right when collapsed and down when expanded,
like subfolder chevrons. New file (`+`), New folder and More actions (`⋯`, Close folder only)
remain visible and usable when the section is collapsed. Empty-folder help is hidden with the tree.
Tab order within a section follows its existing actions, then the new toggle, then the tree's single
retained keyboard stop when expanded. Enter/Space toggle; collapsed tree items are outside Tab and
the accessibility tree. Tree arrow/Home/End behavior is unchanged.

Section visibility belongs to the existing folder-tree state. Collapsing neither lists
folders nor clears cached entries, child expansion, tree scroll or keyboard position. Relisting
the same root, switching tools/sidebar layout, and opening/closing other roots retain it. Closing
that root clears its collapse record, so a later Open starts expanded. Open of a root still in the
live list is a relist and preserves its section state. Reload and Desktop restart instead restore
remembered section collapse under the owner-approved
[ADR-0009 persistence amendment](../adr/0009-multiple-opened-folders.md#amendment-2026-10-25-remember-collapsed-folder-sections-425).

The origin-specific localStorage key `ieumdoc.collapsedFolderSections` contains a JSON array of
Host-normalized root paths, in opened-folder order; for example `["/work/docs"]`. Only collapsed,
currently opened roots are written. Expanded roots, child-folder expansion and listings are not
stored. Vite, Desktop and HTTP origins do not share the preference. It grants no filesystem access:
the Host authorizes and lists every restored root before its remembered collapse is applied.

Restoration alone never writes either navigation preference. Missing/refused/unopened roots have
no live collapse state; stale stored records are pruned on the next explicit write, matching
#370's restoration-only boundary. User Open/Close, section toggle and navigation reveal write the
current reduced collapsed-root list. During startup those writes wait for all remembered roots
to settle, retaining pending roots and user changes. There is no last-written-value cache: each
explicit action writes even if this tab previously saved that same array and another tab has since
overwritten it. Tabs retain independent live views; the latest action writes its own current list,
without a storage-event synchronization service. Child listing/expansion alone never writes.
Unavailable storage leaves the live page usable without persistence.

Manual collapse is allowed even for the active document: its tree current marker is hidden with
the tree, while the document tab and TopBar still identify it. Expanding restores the marker.
The existing reveal trigger is unchanged: changing the active document path (including selecting
an inactive tab/search result), creating a document, or creating a folder reveals it in every
containing opened root. Reveal now also expands those sections. Relisting an already-open root
may reveal child folders as before but respects the section's manual collapse. Selecting the
already-active document does not change its path and therefore does not undo manual collapse.
This follows the existing active-path reveal, rather than continuously forcing the current tree
visible on each render or listing response.

Reveal expansion is remembered, including when a containing section was already expanded locally:
the user's document navigation should survive restart and supersede another tab's older collapse.
Startup document/tab restoration is distinguished from explicit navigation: it may list/expand
the current document's child ancestors as before, but never expands a remembered collapsed section
or writes section preferences. Otherwise restoring the active document would erase the very
collapse being restored. Selecting the already-active document still changes no active path.

Command-center search still collects all reachable cached document listings regardless of section
or subfolder visibility (#400 / #384); searching never expands a section or makes Host requests.
Opening a different result uses the same reveal described above. No new search source, Core
semantic operation or CLI command is needed: this is interface navigation state.

Historical section decisions and captures: [Section persistence decision and verification](#section-persistence-decision-and-verification-2026-10-25) and [Section disclosure verification and captures](#section-disclosure-verification-and-captures).

## Sidebar Open folder entry (#385)

The [ADR-0009 amendment](../adr/0009-multiple-opened-folders.md#amendment-2026-10-24-open-folder-entry-385) records the owner-approved #380 decision 3. This changes entry placement only: the existing picker, handler, add/relist behavior, recent/opened preferences, start-screen entry and command-center command remain. The expanded header entry uses the existing English/Korean Open folder… name as both accessible label and tooltip. Tab order is Open folder → Collapse sidebar → Files → Display → selected panel content; Shift+Tab reverses it. Picker Open, Cancel and Escape return focus to the header opener. Phone sidebar dismissal retains its TopBar focus behavior. The collapsed rail remains the existing expand/Files/Display navigation.

Historical sidebar captures and verification: [Sidebar entry capture evidence](#sidebar-entry-capture-evidence-385).

## Start without a document (#174)

When startup leaves no open document tabs, the document column shows the start instead of an
editor. A Host response without a default document does not prevent the Editor from restoring tabs.
Explicit paths, tab memory, recovery and the Vite fallback follow the
[session startup contract](editing-session-save-v1.md#tab-navigation-memory-383).
It is the app's start, not a document (#298): it sits on the
canvas without the document paper, under the product mark and name. It offers Open folder… (primary), the
recent folders from the folder picker (name, then full path) and, when the Host offers one, the
sample. Choosing a recent folder lists it in the sidebar like Open folder; the start stays until
a document is chosen in the sidebar. Choosing a folder never discards current edits or drafts;
choosing another file or New preserves existing sessions under the
[session protection contract](editing-session-save-v1.md#switching-and-recovery). Open sample document
opens the Host's writable sample through Open and its checks, with a temporary notice that it is a
copy in the app's data. The sample is opened only on request. Without a document the TopBar shows `No file opened`; Save, File actions and the views
stay unavailable. Display remains reachable, with document numbering/reference style disabled and local width available. No error is shown. With nothing to lose, the Desktop app's
update restart check allows the restart unless a document is opening. Closing the last document tab returns here while keeping the folder tree and preferences. Host start
information is retained; a Host that supplied an initial document instead of start information returns
to the folder/recent-folder actions without inventing a sample. HTTP offers allowed server folders, filters recent folders to
those roots and has no sample fallback. The start writes nothing and changes no document
semantics, so it has no CLI counterpart.

## Folder files and image preview (#217)

Files lists every regular non-hidden file, including extensionless files; symlinks/junctions stay excluded.
Markdown retains existing document/native admission and tab behavior. Images use the image icon and
read-only preview description; other files use the generic file icon and explicit editing-unavailable
description. Mouse and Enter/Space share the same dispatch. Image/file selection opens a transient
shared Dialog, preserving the existing editor, selection, Undo, dirty work and property drafts.
Other files show name/path and an editing-unavailable explanation only. Image loading/failure stays
inside the dialog; closing or Escape returns focus to its tree row. The modal blocks Save shortcuts.
The image picker remains independent. See the [Host preview contract](filesystem-host-boundary-v1.md#read-only-folder-preview-217).

## Command center (#363)

The current document's location/name is a searchable command-center button centered in the TopBar.
The existing full-path tooltip and `No file opened` state remain. Click or Ctrl/Cmd+/
opens a search dialog near the top center. Type `>` to list commands only.
Ctrl/Cmd+P and Ctrl/Cmd+Shift+P are no longer intercepted: browser printing retains its default behavior.
The shortcut uses the character with a guarded opaque-IME fallback, exact modifiers and no active IME composition; other modal dialogs
still block opening the center and Save behind them.
The input searches opened tab names/paths, Markdown documents already listed in the sidebar and
existing shell command names, including their Korean/English aliases. It does not search document
contents. The bounded listing scope is defined below (#384); #363's no-index/no-scan boundary remains.

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

Historical command-center captures and keyboard probes: [Command center verification](#command-center-verification-363) and [Command center keyboard verification](#command-center-keyboard-verification-386).

### Caret insertion commands (part of #439)

`Insert citation…` / `인용 삽입…` and `Insert cross-reference…` / `상호 참조 삽입…`
open the existing Citation and Reference forms at the retained Visual editor caret. They need
no slash or preceding whitespace, including directly after Korean text. Availability reuses
the slash menu's schema-backed inline caret eligibility and the existing session busy/view
restrictions. The center must be opened while editor content itself has focus; forms,
property controls (including their buttons), popovers, node-view controls and other shell
controls cannot use a retained body selection to insert. Code, Source and non-caret
selections cannot insert.
Known limitation ([#416](https://github.com/ieumbird/ieumdoc/issues/416)): the engine may not yet have read a selection made within a few tens of milliseconds of the shortcut.
The center releases modal focus before opening the form. Escape returns to the same editor
caret without a document/history change; Apply uses the existing insertion function, returns
editor focus and creates one undo step. Outside dismissal retains the clicked control's focus.

Scope: reuse forms, semantic operations and inline eligibility; no new Core/CLI operation is
needed for this interface entry point. No shortcut or slash-trigger change is included.
Shortcut combinations remain an owner decision, so #439 stays open. Completion requires the
extended `citation-authoring` browser regression (Korean caret, Escape, Undo/Redo and actual
Save → Reload), Editor tests, typecheck/build, docs and diff checks.

Historical insertion regressions and focus-origin evidence: [Caret insertion verification](#caret-insertion-verification-439).

### Listed document search (#384)

The source is the in-memory listing cache reachable from the roots of **all currently opened sidebar
folders** ([ADR-0009](../adr/0009-multiple-opened-folders.md)). Starting at each root, follow folder
entries in the current parent listings and collect each reached listing's `document` entries,
regardless of expansion or sidebar visibility. A subfolder whose contents have never been listed
contributes no files. If a parent is relisted without a child folder, that disconnected child's
retained cache stops contributing immediately. Restoring the child entry makes its retained listing
reachable again, including while collapsed. Search does not change the sidebar's cache preservation
or expansion behavior. Closing a root removes its contribution. Candidate collection and path sorting
run only while the center is open and are memoized until the opened-folder trees change.
Search itself neither requests Host listings/document reads nor expands folders, recursively lists
the filesystem, builds an index or stores the search source in preferences.

Results use the Host-resolved path as identity: an opened tab replaces that file's listing result,
and overlapping opened roots yield one file result. Opened tabs keep tab order and show `Opened tab`
with the full path; unopened Markdown follows in full-path locale sort order and shows `Files` with
its full path. Existing commands follow in their existing order. Name/path word matching and the
`>` commands-only mode are unchanged. Filtering always searches **all** candidates before presentation.
The existing height-bounded, scrolling Combobox renders only the first 50 matches in that order.
A persistent count status shows the full match count, including zero. Above 50 it shows the visible
and total counts with guidance to type more to narrow the search, in Korean or English. Base UI's
always-mounted `Combobox.Status` supplies a polite, atomic live region, including its initial text
announcement handling. Base UI still owns highlight, arrows and Enter within the displayed matches;
there are no page controls. To reach a match outside the first 50, narrow the query: filtering still
searches the entire source. This explicit presentation limit replaces the earlier pagination decision
without changing source scope, ordering, matching or shell action handlers. No ranking, search index,
virtualization library or document-content command is introduced.

As in Files, a listed Markdown file with `native: false` remains selectable but uses subtle text,
the crossed-file icon and `Not an IeumDoc document` explanation (also accessible). This keeps the
same admission explanation available through either navigation entry. The existing Host/Core
admission check remains authoritative even for a listing marked native. Images, other regular files
and folders are omitted: they are preview/navigation entries rather than editable documents and
retain their existing sidebar entry points.

Selecting an unopened file closes the center before calling the same `openFolderDocument` handler
as the sidebar, including existing operation/continuation restrictions, retained dirty tabs and
property drafts, admission refusal and recovery flows. A successful open focuses the mounted Visual
editor; an admission/recovery dialog owns its focus. Opening a file may relist/reveal its folders
through the existing open path; those requests are not search-time discovery. Opened-tab selection
keeps #386's synchronous tab activation and Dialog final-focus behavior, including Source tabs.
This is Editor navigation, so no Core operation or CLI command is added.

Historical listed-search verification, measurements and result-limit decisions: [Listed document search verification](#listed-document-search-verification-384), [Listed search review follow-up](#listed-search-review-follow-up-384) and [Listed search result-limit follow-up](#listed-search-result-limit-follow-up-384).

### Shortcut contract (#381)

The [shared shortcut definitions](../../apps/editor/src/shortcuts.ts) own characters, IME fallback keys, modifiers,
platform labels and `aria-keyshortcuts`. TopBar, selection toolbar and the Save command-center item
consume those definitions. Existing Bold/Italic tooltip notation is retained. Outline still has no shortcut.
The link shortcut runs in ProseMirror's existing `handleKeyDown` path only for a supported text
selection, uses the same link draft/form as the toolbar, and retains link-range expansion, URL
validation, Apply/Remove, Escape and blur dismissal. Apply/Remove/Escape return focus synchronously
through ProseMirror, so a previous form cannot later blur a newly opened link form. It does nothing behind a modal or during IME
composition. No Core operation or CLI counterpart is needed for this focus/selection interaction.

Selection follows [#378](https://github.com/ieumbird/ieumdoc/issues/378). The two-key bindings are
**Ctrl/Cmd+/** (slash character) for the center and **Ctrl/Cmd+'** (apostrophe character)
for links. Neither uses Alt/AltGr or Shift. The old Ctrl/Cmd+Alt+Shift+P/K bindings are removed;
Ctrl/Cmd+P and Ctrl/Cmd+Shift+P remain unhandled so browser printing is preserved.

The official [Chrome](https://support.google.com/chrome/answer/157179?hl=en),
[Edge](https://support.microsoft.com/en-us/edge/keyboard-shortcuts-in-microsoft-edge),
[Windows](https://support.microsoft.com/en-gb/accessibility/windows/keyboard-shortcuts-in-windows) and
[macOS](https://support.apple.com/en-us/102650) lists were checked on 2026-10-24.
The selected bindings have no listed browser or global system default. Apple's Cmd+/ toggles the
status bar in Finder only; it does not apply when Chrome/Edge has focus. The
[Microsoft Korean layout](https://learn.microsoft.com/en-us/globalization/keyboards/kbdkor.html)
includes unshifted slash (after period) and apostrophe (after semicolon, before Enter).
Literal `event.key` must be `/` or `'`. A different character at the same position is not a shortcut;
full-width punctuation is a different character too. Only `Process` or `Unidentified` may fall back
to `event.code` (`Slash` / `Quote`), and active composition is still ignored.
Left Ctrl is recommended on Korean layouts where right Ctrl is Hanja conversion. No input-source
switching shortcut is claimed. No Core or CLI semantics change.

Historical shortcut candidates, delivery probes and captures: [Earlier two-key candidate audit](#earlier-two-key-candidate-audit-381-historical-physical-only-implementation) and [Earlier three-modifier verification and captures](#earlier-three-modifier-verification-and-captures-381-historical).

#### Keyboard-layout safety (#381 review follow-up)

Browser accelerators are also checked conservatively: `keyCode` must be the definition's unshifted
punctuation virtual key (191 for `/`, 222 for `'`), unspecified (0), or IME Process (229).
Other native mappings are passed through, even if an IME reports an opaque key or the visible
character matches. This is necessary because French AZERTY apostrophe uses digit 4: character-only
matching would compete with Ctrl+4. A German `Process`/`Unidentified` event with VK_MINUS (189)
must likewise retain browser zoom. Chromium derives browser accelerators from the
[Windows virtual key](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/ui/content_accelerators/accelerator_util.cc),
not just the DOM character. The numeric guard deliberately uses the legacy field for this supported
Chromium boundary; [Windows virtual-key definitions](https://learn.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes)
identify those values. Unknown native mappings fail closed rather than claiming cross-layout support.

Shift remains disallowed. We do not introduce Ctrl/Cmd+Shift+7 or any other layout-dependent alias:
the displayed two-key bindings must not grow an unverified browser/OS accelerator. Layouts requiring
Shift, AltGr, or a reserved virtual key use the existing Command center / Link buttons instead.
The tooltip, ARIA and command-item definitions remain unchanged and denote characters, not universal
physical positions. Depending on the layout, the character can be on another key; not every layout
has a usable unshifted, unreserved keyboard combination. No automatic remapping is claimed.

Official layouts: [US](https://learn.microsoft.com/en-us/globalization/keyboards/kbdus),
[Korean](https://learn.microsoft.com/en-us/globalization/keyboards/kbdkor),
[German](https://learn.microsoft.com/en-us/globalization/keyboards/kbdgr),
[French legacy AZERTY](https://learn.microsoft.com/en-us/globalization/keyboards/kbdfr).

| Layout / event | Center | Link | Browser behavior |
| --- | --- | --- | --- |
| US, Korean literal `/` / `'`, VK 191 / 222 | Opens | Opens | No listed default replaced |
| Korean opaque `Process` / `Unidentified`, Slash / Quote, VK 229 / 0 / matching punctuation | Opens | Opens | Composition still ignored; other physical codes passed through |
| German Slash-position `-`, VK 189; Quote-position `ä` | Does not open | Does not open | Ctrl+- zoom preserved |
| German Shift+7 `/`; Shift+Backslash `'` | Does not open | Does not open | Shift aliases deliberately unavailable; use buttons |
| French Slash-position `!`; Quote-position `ù` | Does not open | Does not open | Different characters passed through |
| French Shift+Period `/`; digit-4 apostrophe | Does not open | Does not open | Ctrl+4 tab switch preserved; use buttons |
| Opaque key masking VK_MINUS / VK_4 | Does not open | Does not open | Browser zoom / tab switch preserved |

Historical layout-specific failures and browser probes: [Shortcut layout verification](#shortcut-layout-verification-381).

## Writing interactions

- The leading level-1 heading is the [document title](document-editing-v1.md#document-title-255) and stays first: its handle opens block actions but does not drag, nothing drops above it, and Enter in it continues below it. A document without one shows Add a title above its first block; an empty title shows `Title` and is removed if left empty.
- Hover or keyboard focus reveals the current block's `+` and drag/action handle. Pointer travel into tools preserves them; hover does not change document state. On devices without hover, tools remain visible. A single empty editable paragraph is the starting-state exception: its `+` is always visible, its drag handle hidden, and a non-persistent hint says `Start writing, or type / to add a block.` Typing hides the hint; undo restores it. Clicking the paper below the content continues writing through the existing editor operation.
- `+` and `/` share supported insert commands, grouped by dividers with an icon and, as a key chip, the Markdown shortcut that makes the same block: Text (Paragraph, Heading 1–3; Heading 4–6 only when the query matches), Lists, Blocks (Note, Warning, Quote, Divider), Technical (Code block, Equation, Figure, Table); slash also offers Endnote ([Endnotes](footnotes-v1.md)) and actual Equation/Figure/Table targets and section references. The block menu groups conversions, table, section and block actions the same way. Slash keeps editor focus. Gutter-opened menus focus their first item.
- Slash reference choices show computed display numbers with caption summaries (Equation: label), and search caption words, labels, kinds and display prefix/number; template-based forms such as `Figure 2`, `식 (3)` and `Table 1` remain one slash query. Section choices keep their heading names and creation behavior. Ordering and overflow use the existing shared menu; see [reference search and menu names](section-references-v1.md#editor).
- `/ref`, `/reference` and `/참조` list all reference kinds, including unlabeled headings. Figure and Table kind keywords (`figure` / `그림`, `table` / `표`) match their respective kinds. Empty queries retain labeled targets only, and unrelated queries do not list references unless their labels, captions or heading words match.
- Paragraph/Heading block menus convert between prose and H1–H6 while preserving supported inline content; line breaks prevent conversion to a Heading. Admonition menus change among the standard kinds.
- Block action menu exposes existing supported deletion, and for a table adding a row below or a column right of the caret's cell; a table's own action bar below it holds Edit (caption and label), Table actions and Delete table; handle drag reorders through the existing editor operation. Unsupported document structures reject [native admission](document-support-v1.md). [Endnotes](footnotes-v1.md#editor) follow their first reference: their handle opens block actions but does not drag, they have no `+`, and a dragged block lands in the body.
- Text selection in supported paragraphs, headings, quotes, simple admonitions, table cells and Figure captions offers Bold, Italic, Strikethrough, Subscript, Superscript, Inline code, Link, Inline Math and Cross-reference. Each button's tooltip names it with its shortcut where one exists (Bold Ctrl/Cmd+B, Italic Ctrl/Cmd+I, Strikethrough Ctrl/Cmd+Shift+S, Inline code Ctrl/Cmd+E, Link Ctrl/Cmd+'); Cross-reference uses a bookmark icon, as do reference choices in the slash menu. Ctrl/Cmd+, and Ctrl/Cmd+. toggle subscript and superscript; applying one replaces the other. Tab moves from the selection into the toolbar (in table cells and lists Tab keeps its cell/indent meaning); Escape or Shift+Tab returns with the selection unchanged.
- Figure selection shows the selection outline only. Explicit Edit or double-click on its image surface (including the pending frame and image-load error) opens Image/Alt text/Label fields and a Caption field for plain captions; caption double-click keeps normal text selection, and rich captions are edited in the document. Metadata Apply preserves rich caption content. Editing survives selection movement and outside interaction. Core validation failure preserves values. Apply/Cancel and explicit Escape-to-Cancel retain existing behavior; Cancel never removes the Figure.
- `/figure` and `+` insert an empty Figure without opening its properties; the caret starts in its caption. Image-less Figures, with or without caption or label, remain as pending Figures with a dashed `No content yet` frame. Clicking the frame selects the Figure; existing Edit connects an image URL later. Pending Figures retain normal Figure metadata, numbering and references and are included in Save/Source. See [Figure authoring](figure-authoring-v1.md).
- Equations, Figures, Tables and section labels use the shared explicit properties form: selecting a block opens no panel; Edit opens the form anchored to its metadata line (Equation: LaTeX, preview, label; Figure: image, alt text, label), with Apply/Cancel and Escape. Display Equation formula and Figure image surfaces also offer double-click through that same Edit path (#470); other blocks gain no double-click action, and inline math keeps its single-click editor. Edit focuses the first field; closing retains a text selection inside the block or returns a [caret after the block](document-editing-v1.md#continuous-editing), so subsequent typing preserves it. Opening properties and focus restoration change neither document nor history; double-click while already editing leaves the existing form untouched. Unapplied changes retain the block-local notice and an explicit applied-only Save/Source notice.
- Authoring restrictions, reference chips, caption text and errors stay visible. Authoring metadata is hidden at rest and revealed during interaction; actual labels remain explicit in properties/editing. Figure, Equation and captioned/labeled Table numbers are computed for display and never written into their text. The [Number headings](heading-numbering-v1.md) checkbox in Display optionally numbers H2–H6 in the document and Outline, leaves H1 as a title, and saves MyST numbering settings only.

### Nested inline slash menu (#377)

The reference target form closes on Escape and outside pointer interaction, including when
the document has no labeled targets and the form has no autofocus control. Outside dismissal
preserves the clicked destination's focus; Escape returns focus to the editor. This applies
to both selection-toolbar insertion and an unresolved reference's editor, without changing
document content, and leaves slash insertion available without Reload (#427).

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

## Evidence and history

### Verification record

- Documentation verification: 2026-10-26 (start-screen conditions and Open/New protection compared with App.tsx and the session contract; no new browser execution).
- Outline input verification: 2026-10-25 (#362: retain heading-row identity while preceding text shifts engine positions; navigation, current-section geometry and document semantics unchanged. [Windows measurements and preservation evidence](../reviews/editor-input-performance-2026-10-25.md)).
- Reference dismissal verification: 2026-10-25 (#427: no-target selection form and unresolved-reference form, Escape/outside pointer dismissal and subsequent slash insertion in cross-reference; Editor 280/280, typecheck/build).
- Result-limit verification: 2026-10-24 (#384 integration decision: first 50 matches, persistent bilingual live counts and query narrowing instead of pages; [new evidence](#listed-search-result-limit-follow-up-384)).
- Search review verification: 2026-10-24 (#384: reachable cached listings after parent relisting, bounded/paged 2,000-document search and #397 restored-tab integration; [measurements and regression scope](#listed-search-review-follow-up-384)).
- Layout-safe shortcut verification: 2026-10-24 (#381 review follow-up: character matching, guarded opaque-IME fallback, German zoom and French tab-switch preservation; supersedes physical-only matching).
- Two-key shortcut verification: 2026-10-24 (#381 follow-up: headed Chrome/Edge candidate delivery and cancellation; Chrome/Edge product regressions, Electron candidate/action smoke, Editor/Desktop tests and typecheck/build; macOS documentation review only).
- Shortcut verification: 2026-10-24 (#381: Editor tests, Chrome/Edge command-center and link-authoring integration, Electron shortcut smoke, typecheck/build and docs; native browser-chrome verification remains unconfirmed as detailed below).
- Last verified: 2026-10-25 (#425 owner persistence decision: Editor tests/typecheck/build, folder-memory/navigation/command-center/document-tabs/editor-shell/quiet-document; [restoration evidence](editor-ux-shell-v1.md#section-persistence-decision-and-verification-2026-10-25)).
- Previous verification: 2026-10-25 (#425: collapsible folder sections; Editor tests/typecheck/build, folder-navigation/folder-memory/command-center/editor-shell/layout-rules/ui-language/quiet-document and [desktop/phone captures](editor-ux-shell-v1.md#section-disclosure-verification-and-captures)).
- Previous verification: 2026-10-24 (#385: Sidebar header entry, Close-only folder menus; folder-navigation browser check, Editor tests/typecheck/build and [same-state desktop/phone evidence](editor-ux-shell-v1.md#sidebar-open-folder-entry-385)).
- Previous verification: 2026-10-24 (#383 review integration: command-center focus on restored tabs and recovery-dialog modality with #391/#392; document-tabs/recovery/command-center browser regressions).
- Listed-document search verification: 2026-10-24 (#384: cached sidebar listings, native admission, path deduplication and new-editor focus; command-center and related browser regressions, Editor tests and typecheck/build; [evidence](#listed-document-search-verification-384)).
- Previous verification: 2026-10-24 (#386: immediate command-center search typing and document focus; command-center/editor-shell/document-tabs/ui-language/layout-rules/quiet-document browser regressions, Editor tests and typecheck/build).
- Code/endnote save verification: 2026-10-24 (#393: Core intermediate-snapshot regressions and Editor Save replay with a new endnote, code edit and existing definition edit; no UI change).
- Nested inline verification: 2026-10-24 (#377: Editor slash eligibility tests, Core list/Figure intermediate-footnote regressions, and actual citation-authoring menu/insertion/Save → Reload on all locations below, including a citation-only list item).
- Previous verification: 2026-10-24 (#383: Reload restores document tab paths/order/active identity; recovery priority and explicit startup routing; document-tabs/recovery/recovery-structure browser regressions).
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

### Section persistence decision and verification (2026-10-25)

The repository owner changed #425 after the initial implementation: remember only root section
collapse across Reload/Desktop restart. The earlier no-section-persistence decision and the
verification records below describe that earlier implementation and remain intact.

The extended folder-memory failed on unmodified head `7a45f2bc0f8bb40751193851d3cd093ccc422fdd`:
`Collapse remembers the root: collapsed preference [], expected [...]` and
`Reload must restore the active document section collapsed`. This test now covers stored root
format, active-document Reload, expand/Reload, Close/reopen, missing/unopened record pruning on
the next action, restoration-only zero writes, delayed-root collapse/expand/Close races, and
the #370 two-tab order including reveal of an already-expanded local section after another tab's
collapse. Original opened-folder memory regressions remain in the same scenario.

After the change, Editor tests pass 280/280 and typecheck/build pass. The final related run covers
folder-memory, command-center, document-tabs and editor-shell (4/4); folder-navigation with
screenshots and quiet-document with actual glyph-font assertions each pass separately (1/1).
The persistence scenarios include both user collapse and user expansion while a later root is
pending, and same-path Close winning over an older restoration. Existing source fixture guards
and expected-error classification are unchanged. Build warnings remain the existing externalized
punycode/large bundle warnings. No platform installer or live Desktop restart is claimed by these
local browser checks; Desktop uses the same origin-specific preference path and required CI.

Real Reload captures: [1440px](assets/sidebar-collapse-425/restored-collapsed-1440.png) and
[375px](assets/sidebar-collapse-425/restored-collapsed-375.png), with
[capture metadata](assets/sidebar-collapse-425/persistence-environment.json). These use capture
HEAD `7a45f2bc0f8bb40751193851d3cd093ccc422fdd` plus this persistence change; source SHA-256
identifies the exact implementation. Same worktree-owned Vite/persistent Windows Chrome, measured
DPR/viewport scale/CSS zoom 1, bundled Pretendard, scroll 0, blurred focus and no dialog/menu.
Direct review confirms the first section remains collapsed after Reload, the other section's
tree remains visible, and names/actions/document geometry match the existing collapsed view.
The earlier disclosure captures and their metadata below remain historical evidence.

The first persistence CI at `e9d58bbdb0626f1c6e481685e6687970dfaa7ed9`
([run 40136117318](https://github.com/ieumbird/ieumdoc/actions/runs/40136117318)) passed quality,
Desktop/HTTP and browser shard 1/2, including folder-memory; shard 2/2 passed folder-navigation
but failed file-preview's phone archive-row click. Its input-events artifact shows Escape targeting
the still-focused tree row, then focus moving to Expand sidebar: the preview image was visible
before the modal's initial focus, and the sidebar closed too. The unchanged local file-preview
passes. The viewport preview case now explicitly asserts modal focus ownership (within 5 seconds)
before its Escape. This adds a readiness assertion without forcing focus, reopening the sidebar,
changing product behavior or weakening the existing preview/content checks. Capture sources are
unchanged; the new test-only head needs its own final checks and CI, recorded in the PR.

### Section disclosure verification and captures

The clean base's existing folder-navigation and quiet-document checks passed. Before product
edits, the extended folder-navigation failed with `Opened folder section must expose an expanded
toggle button`; command-center stopped at the absent toggle as well. Later expected HTTP failures
were not reached in those early exits. An initial implementation run also exposed a test locator
mistake: modal background controls are excluded from default role queries. Its inspection locator
now includes hidden controls while the center is open; no product assertion/timeout was weakened.

The final folder-navigation checks Enter/Space and Tab/reverse Tab, whole-tree/empty-help hiding,
retained child expansion/current marker/scroll/keyboard stop without Host listing, collapsed New
file/New folder/Close, relisting including the active document, unrelated-root Open/Close, Reload,
and 28px target/long-name geometry at 1440/1024/375px. Folder-memory verifies no preference write
on collapse and preservation through relist; command-center verifies cached-file search without
expansion/Host requests, active-result preservation and different-result reveal. Existing
editor-shell/layout-rules/ui-language also pass. Editor tests: 278/278; typecheck, Editor build,
docs/diff checks pass. The build retains its existing punycode externalization/bundle-size warnings.

Same-state product captures below use base HEAD `108d134a04228001ada41944e41dec8ac2a227b9`.
After is that HEAD plus the implementation, identified by source SHA-256 in
[capture metadata](assets/sidebar-collapse-425/environment.json). All use this worktree's own
Vite and persistent headless Windows Chrome profile. Before uses the runner's default DPR 1 with
no zoom override; After measures DPR/viewport scale/CSS zoom 1. Both wait for fonts; quiet-document
checks actual bundled Pretendard glyph fonts. Files is selected, the sidebar expanded, scroll 0,
focus blurred, pointer at the right edge and no dialog/menu present.

| Width | Before | After, expanded | After, first section collapsed |
| --- | --- | --- | --- |
| 1440×812 | [Before](assets/sidebar-collapse-425/before-1440.png) | [Expanded](assets/sidebar-collapse-425/after-1440.png) | [Collapsed](assets/sidebar-collapse-425/collapsed-1440.png) |
| 375×812 | [Before](assets/sidebar-collapse-425/before-375.png) | [Expanded](assets/sidebar-collapse-425/after-375.png) | [Collapsed](assets/sidebar-collapse-425/collapsed-375.png) |

Direct review: heading/name/action positions and document layout remain aligned. The root icon
becomes a quiet chevron; only the selected section's contents disappear. Other sections move up
naturally, and all three folder actions remain reachable in the full-screen phone sidebar.
The 200px sidebar and wrapped Korean/unbroken names retain their geometry and reachable targets.
These are visual/navigation checks, not new document semantics or platform packaging evidence.

The first full CI at implementation head `6e5bf3f1df5689088efaeb7e635640a20277c092`
([run 40133576414](https://github.com/ieumbird/ieumdoc/actions/runs/40133576414)) passed quality,
Desktop/HTTP and browser shard 2/2, but shard 1/2 failed in cross-reference: its partial button-name
query also matched the new `Collapse folder cross-reference` control. The unchanged scenario
reproduced that strict-mode ambiguity locally. Scope its existing selection-toolbar action to
that toolbar with the exact accessible name; the same scenario then passes. No product code,
assertion/timeout or capture source changed. The failure remains historical evidence; the new
head requires its own full CI result, recorded in the PR.

### Sidebar entry capture evidence (#385)

Same-worktree real browser Before/After captures, with the sidebar expanded, Files selected and no menu/dialog open:

| State | 1440 × 812 | 375 × 812 (full-screen sidebar) |
| --- | --- | --- |
| No folder | [Before](assets/sidebar-open-folder-385/before-empty-1440.png) / [After](assets/sidebar-open-folder-385/after-empty-1440.png) | [Before](assets/sidebar-open-folder-385/before-empty-375.png) / [After](assets/sidebar-open-folder-385/after-empty-375.png) |
| One folder | [Before](assets/sidebar-open-folder-385/before-one-1440.png) / [After](assets/sidebar-open-folder-385/after-one-1440.png) | [Before](assets/sidebar-open-folder-385/before-one-375.png) / [After](assets/sidebar-open-folder-385/after-one-375.png) |
| Several folders | [Before](assets/sidebar-open-folder-385/before-several-1440.png) / [After](assets/sidebar-open-folder-385/after-several-1440.png) | [Before](assets/sidebar-open-folder-385/before-several-375.png) / [After](assets/sidebar-open-folder-385/after-several-375.png) |

Capture base HEAD: `359b7121e2b910998c89808b3c112c2d16490b06`. After images use that HEAD plus this PR's Sidebar/styles implementation; [capture metadata](assets/sidebar-open-folder-385/environment.json) identifies the exact source hashes and measured After environment. Both use the same checkout-owned Vite origin and persistent headless Windows Chrome profile; no second checkout or temporary profile. The runner's default DPR is 1 with no zoom override. After records measured DPR 1, visual viewport scale 1 and CSS zoom 1; Before used the same unmodified runner configuration. Scroll is 0, pointer at the right edge, focus blurred before capture. Bundled Pretendard fonts are checked by quiet-document's CDP glyph-font assertions; screenshots wait for `document.fonts.ready`.

Direct visual review: the header opener stays beside Collapse, the product name remains readable, and the empty panel loses its duplicate action. Folder headings/tree indentation retain their alignment. At phone width the same header controls remain inside the full-screen sidebar; at 1024px the 200px sidebar's controls remain reachable without overflow. The 28px target, 16px icon and 4px group gap reuse product tokens; no adjustable value was added.

Before implementation, the added folder-navigation check failed with `Sidebar header must always expose one Open folder entry with zero opened folders`. Its early exit also left later expected HTTP-error checks unreached. After implementation the zero/one/several header-position, per-folder Close-only menu, Open and focus checks pass. Related regressions and required CI are recorded in the PR; previous verification entries elsewhere in this document remain unchanged.

### Caret insertion verification (#439)

Verification: the extended browser scenario failed before implementation because `Insert citation…`
was absent. After implementation it checks Korean text in the middle of a sentence, literal slash
behavior, both forms' Escape/content/caret/focus restoration, single-step Undo/Redo and exact
Save → Reload content, Korean command search, availability on every listed inline surface and
refusal in code/non-caret selections. The existing command-center, layout-rules and quiet-document
scenarios also pass. Editor tests pass 281/281; repository typecheck, Editor build, docs and diff
checks pass. Build retains the existing externalized `punycode` and bundle-size warnings.

The review follow-up reproduces the form-button gap on head `9d8893b`: Tab from the
Citation key to Add, open the center, and assert both insert commands are disabled. Before
the focus-origin guard this fails because Insert citation remains enabled. The same browser
scenario now compares an allowed ordinary paragraph caret with a selected range in that
paragraph, independently of code restrictions. Allowed-surface checks also open and Escape
the real Citation form before continuing the existing slash insertion.

### Shortcut layout verification (#381)

At pre-fix `e2ee863`, the revised shell test failed on German zoom, and existing browser scenarios
failed with `German zoom shortcut was intercepted` and `Layout-specific key was intercepted by Link`.
The current scenarios cover literal US punctuation, Korean opaque IME keys/composition, German
minus/umlaut and shifted variants, and French characters/digit-4 apostrophe. The original immediate
search typing, modal blocking, shared labels/ARIA and prior-link-form focus regression are retained.

Headed installed Chrome 155.0.8059.85 and Edge 155.0.4283.62 were additionally sent layout-specific
CDP key/code/virtual-key tuples. Both an ordinary input and the actual Editor retained German Ctrl+-:
DPR 1 → 0.899999976 for `-`, `Process`, and `Unidentified` with Slash / VK 189, without opening the
center. After Ctrl+0 reset, literal and opaque US/Korean center/link cases opened their existing UI.
French apostrophe / digit-4 VK 52, including opaque variants, still activated browser tab 4 without
opening Link. German/French shifted or umlaut characters did not open the forms. These are protocol
reproductions against official layouts, not hardware/OS layout switching. No native UI was screen
automated. The same checkout-owned Chrome and fixed Edge profiles were reused and zoom reset.

#### Earlier two-key candidate audit (#381, historical physical-only implementation)

The following US-key probe and its recorded results predate the layout-safety fix above. They do
not establish safety on German/French layouts; the review follow-up supersedes that inference.

Each row below was sent with Playwright to an input in a **headed installed** Windows Chrome
155.0.8059.85 and Edge 155.0.4283.62, then to Electron 44.7.0 / Chromium 152.0.7977.130.
`received/cancelled` means exactly one trusted, cancelable keydown arrived with the expected physical
code, `preventDefault()` set `defaultPrevented`, input focus/value stayed unchanged and no browser
tab was added. Electron has a null application menu, so no menu accelerator claims these keys.

| Candidate (Ctrl; Cmd on macOS) | Chrome official / Windows probe | Edge official / Windows probe | Electron | Korean IME / physical key | Decision |
| --- | --- | --- | --- | --- | --- |
| / (Slash) | No listed default; received/cancelled | No listed default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | **Center**; shares the slash command cue |
| ' (Quote) | No listed default; received/cancelled | No listed default; received/cancelled | received/cancelled; no menu | Present beside Enter, no AltGr/Shift | **Link**; easy home-row key, no existing editor binding |
| ; (Semicolon) | No listed browser default; received/cancelled | No listed browser default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: macOS Cmd+; finds misspellings |
| \ (Backslash) | No listed default; received/cancelled | PDF fit mode; received/cancelled on HTML input | received/cancelled; no menu | Present; may have won-sign keycap | Reserve PDF behavior; clearer unused alternatives exist |
| [ (BracketLeft) | Cmd+[ is Back; Windows received/cancelled | PDF rotation, Cmd+[ Back; Windows received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: macOS browser navigation |
| ] (BracketRight) | Cmd+] is Forward; Windows received/cancelled | PDF rotation, Cmd+] Forward; Windows received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: macOS browser navigation |
| Grave accent (Backquote) | No listed browser default; received/cancelled | No listed browser default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: macOS window switching |
| , (Comma) | Cmd+, Settings; Windows received/cancelled | No listed default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: browser preferences / existing Subscript |
| . (Period) | No listed default; received/cancelled | No listed default; received/cancelled | received/cancelled; no menu | Present, no AltGr/Shift | Reject: existing Superscript |

Known reserved letter combinations (print P/Shift+P, address search K/E/L, new/close tabs N/T/W,
DevTools, Edge sidebar/Collections) are excluded using the official lists rather than opening native
UI. Ctrl+Alt variants are excluded for AltGr; Space variants are excluded for IME switching.
Two punctuation combinations pass, so additional Shift+letter/F-key bindings are unnecessary.

Reproduce the browser delivery audit from this checkout with
`pnpm exec tsx apps/editor/test/browser/shortcut-probe.ts chrome` and then `... msedge`.
The script closes its context in `finally` and writes raw event results to `tmp/shortcut-probe-*.json`.
Chrome reuses the runner's existing checkout hash profile; Edge reuses its one fixed `-edge` sibling.
`IEUMDOC_BROWSER_CHANNEL=msedge pnpm browser:test command-center link-authoring` reuses that same
Edge profile for product integration. Run channels sequentially, never with temporary profiles.

This proves page delivery/cancellation for protocol-injected keys in these installed Windows builds,
not hardware keyboard routing through every OS hook. No print/address/native UI was screen-automated.
macOS is a documentation-level review only; custom global hotkeys and nonstandard compact keyboard
layouts are outside this evidence. The full-width key/code cases are synthetic IME-state regressions,
not a claim that Playwright toggled the OS IME. Browser defaults remain supported by official lists,
with actual delivery/focus evidence for each punctuation candidate.

Before changing the bindings at `e60ef78`, the revised shell test failed on the new physical key;
`command-center` failed waiting for the Slash-opened input and `link-authoring` failed its shortcut
label assertion. After the change: Editor 277/277, Desktop 40/40 and typecheck/build passed;
Chrome `command-center`, `link-authoring`, `layout-rules`, `quiet-document` and Edge's two shortcut
scenarios passed. Electron passed center opening/typing and existing link-form Apply. The queued
previous-link-form focus regression and #386 immediate search/document focus assertions remain.

Same-worktree `quiet-document --screenshots`, 100% zoom / DPR 1, bundled font, same rest state:

| Viewport | Before (three modifiers) | After (two keys) |
| --- | --- | --- |
| 1440×1000 | [Before](assets/shortcuts-381/after-1440.png) | [After](assets/shortcuts-381/two-key-after-1440.png) |
| 375×1000 | [Before](assets/shortcuts-381/after-375.png) | [After](assets/shortcuts-381/two-key-after-375.png) |

The existing shortcut chip is shorter; control placement, document typography and responsive rules
are retained. The earlier verification record below is historical and is not rewritten as new proof.

#### Earlier three-modifier verification and captures (#381, historical)

Windows Chrome 155.0.8059.85 passed `command-center`, `link-authoring`, `layout-rules` and
`quiet-document`; Edge 155.0.4283.62 passed the two shortcut scenarios using the same checkout-owned
persistent profile sequentially. These exercise actual renderer keyboard dispatch, Korean key values
with physical codes, composition exclusion, tooltips/ARIA, modal blocking and real file Save → Reload.
Printing is checked by uncancelled `Ctrl+P` / `Ctrl+Shift+P` events with no center opening.
Electron 44.7.0 (Chromium 152.0.7977.130) staged-app smoke passed center opening/typing, link opening/Apply
and a null application menu. Desktop tests passed 40/40; Editor tests passed 277/277.

Native browser chrome (including the actual print window and address bar) is **not verified**:
Computer Use stopped because it could not determine the browser URL confidently enough for policy.
No native key was sent after that stop. Runtime integration success and official default-shortcut
lists are separate evidence; this record does not claim a completed native browser/OS collision audit.
Initial headed Chrome and the first CI run exposed a link-form focus timeout after Remove: a queued
Tiptap `focus()` could blur the next form. A regression holds only frames queued by Remove and
releases them after opening the next form; it failed before the fix and passes with synchronous
ProseMirror focus return on Apply/Remove/Escape. The exploratory headed layout scenario also
observed a 15px native-scrollbar difference; the standard runner passes unchanged assertions.
No browser-runner or command-center focus-policy change is introduced by #381. The full CI also
exposed a platform-label test isolation race: a recorded deletion offered recovery after Reload and
covered Settings. Waiting for an actual deletion record reproduced it locally. The cross-reference
scenario now Saves its scratch edits and observes removal of that path's recovery record before the
platform-only Reload; product recovery behavior and existing assertions are unchanged.

Same-path `quiet-document --screenshots` product comparison at base `c587663` and #381 implementation,
Windows Chrome, DPR 1 / 100% zoom, bundled Pretendard, scroll top, equivalent rest state:

| Viewport | Before | After |
| --- | --- | --- |
| 1440×1000 | [Before](assets/shortcuts-381/before-1440.png) | [After](assets/shortcuts-381/after-1440.png) |
| 375×1000 | [Before](assets/shortcuts-381/before-375.png) | [After](assets/shortcuts-381/after-375.png) |

The base product files were temporarily restored and the implementation reapplied in the same
worktree; no other checkout or Chrome profile was created. Only the existing shortcut chip/tooltip
text changes. Document layout and control positions retain the Visual Language rules.

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

### Listed document search verification (#384)

The extended `command-center` scenario failed against base `144e34af8ec75c1d14fad045f76440d8da72aead`
before product edits: `Sidebar-listed unopened document missing from search`. Actual Windows Chrome
[before](assets/command-center-384/before.png) / [after](assets/command-center-384/after.png) captures
show the same `technical` query, opened `technical-1.md`, listed scratch folder and 1280×720 viewport
(default DPR/100% zoom, bundled Pretendard). Both came from this same worktree and its existing
persistent browser profile; no extra checkout or temporary Chrome profile was used.

The scenario now checks tab/file distinction and ordering without result truncation, no Host request
while searching, unloaded-child exclusion, collapsed-child inclusion, overlapping-root and tab-path
deduplication, image/other-file exclusion, immediate typing/Undo after opening a file, retained dirty
work, busy restrictions and the real non-native refusal with unchanged active document. The existing
#386 immediate search/tab-focus and Source/IME/modal/history/draft checks remain. New-editor focus
runs after Tiptap's Strict Mode DOM reattachment in a cancellable microtask; the browser check adds
no focus polling or reload before typing. The visual change reuses the existing result layout,
selected surface and sidebar subtle-text/crossed-file treatment; no adjustable value is introduced.

### Listed search review follow-up (#384)

The existing scenario failed on reviewed head `4fdb5bc8ffc8f91403d58a84c4ba50ab934b497f`
with `Disconnected child cache remained searchable after parent relisting`. It now expands/collapses
`alpha`, removes that entry from the next parent response, verifies the sidebar and search omit it,
then restores the parent entry and verifies its preserved collapsed listing is searchable again.
The folder-tree reducer/cache lifecycle is unchanged; search reuses `knownFolders` for reachability.

Performance measurements used 2,000 synthetic native document entries in one existing scratch folder,
one initial document tab, collapsed sidebar, 1280×720, the same worktree/persistent Windows headless
Chrome/Vite development setup and no CPU throttling. Three trials measured Control+P and real `b`,
`u`, `l` key presses through two subsequent animation frames; unique search used `fill('bulk-1999')`.
These are local end-to-end observations including Playwright overhead, not production benchmarks or
fixed timing gates. The after run includes #397 on `cda1397` (subsequent changes add tests/evidence).

| Measurement | Reviewed implementation | After follow-up |
| --- | --- | --- |
| Open, three trials (ms) | 1387 / 1085 / 1031 | 333 / 256 / 204 |
| Real b/u/l input, nine key presses (ms) | 395–831 | 35–72 |
| Unique search, three trials (ms) | 204 / 171 / 168 | 64 / 53 / 55 |
| Chrome CPU samples with React render/commit frames, extra open + b/u/l run | about 1926 ms | about 188 ms |
| Samples within filter / App, same profile | about 6 / 12 ms | about 6 / 15 ms |

The sampling profile identified result rendering/commit as the main input bottleneck, rather than
text matching. The source also regenerated all file candidates during closed-center App renders.
Open-only memoized collection/sorting removes that unnecessary work; the 50-row page bounds rendering
without limiting full-scope filtering or making late results unreachable. The sampled totals are
stack categories, not isolated component timings; idle/native/other work is not listed above.
The [before](assets/command-center-384/profile-before.json) and
[after](assets/command-center-384/profile-after.json) summaries retain all trial values and top samples.

The existing `command-center` scenario now also supplies the synthetic 2,000-entry listing, checks
visible range/total, real Tab/Enter previous/next access and within-page arrows, no Host requests,
query narrowing to the final document, actual open and immediate editor typing/Undo. Only that last
target is a real scratch file; there is no 2,000-file fixture or timing assertion. Existing restored-tab
checks in `document-tabs` also verify one `Opened tab` result per restored path. Actual pagination at
[1280px](assets/command-center-384/paged-1280.png) and [375px](assets/command-center-384/paged-375.png)
uses existing footer typography/spacing, shared Button controls and tokens, with no new adjustable value.

### Listed search result-limit follow-up (#384)

After the review approved `5dfb690`, the integration owner selected a simpler presentation: the first
50 matches, a full count at every size, and explicit narrowing guidance above 50, without page controls.
The current [listed-search contract](#listed-document-search-384) supersedes the pagination behavior
recorded in the preceding verification; those earlier measurements and captures remain historical evidence.
Reachability, open-only/tree-state memoization, full-source matching and result order are unchanged.

The existing 2,000-entry browser check now verifies the first/last displayed paths, the 50-row bound,
real ArrowDown access to the 50th match and existing wrap/stay behavior at that boundary. It checks
the overflow guidance, counts of 10/0/1 after query changes, and the same mounted polite/atomic live
status throughout. Korean command search also checks its translated count. Narrowing to the final
file still opens it with immediate editor typing/Undo, with no Host request during search. These are
DOM/keyboard accessibility checks, not a claim of manual screen-reader verification.

The same three-trial probe and 2,000-document fixture described above ran after merging #402. The
worktree, persistent Chrome profile, 1280×720 viewport, collapsed sidebar, one initial tab and no CPU
throttling were retained. The current worktree's Vite server used port 5174 because another worktree
already owned 5173; its `/api/document` path was checked before measurement.

| Measurement | First-50 presentation |
| --- | --- |
| Open, three trials (ms) | 348 / 325 / 278 |
| Real b/u/l input, nine key presses (ms) | 52–89 |
| Unique search, three trials (ms) | 66 / 59 / 67 |
| React render/commit CPU samples, extra open + b/u/l run | about 371 ms |
| Filter / App samples, same profile | about 8 / 17 ms |

The [raw summary](assets/command-center-384/profile-limited.json) retains each value and sampled
stacks. This local development observation includes Playwright overhead and has no timing threshold;
it does not claim a speed improvement over the earlier bounded pagination run. Actual first-50
captures at [1280px](assets/command-center-384/limited-1280.png) and
[375px](assets/command-center-384/limited-375.png) retain the same query/first selection as the earlier
paged captures, with existing footer typography/spacing and no new adjustable style value.
