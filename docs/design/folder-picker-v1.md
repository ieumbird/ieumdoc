# Folder picker v1

- Status: Implemented
- Last verified: 2026-10-26 (#461 owner decision: click selection preserves sibling images; editing resumes filtering. Editor tests/typecheck/build and figure-authoring/folder-navigation/image-assets/layout-rules/quiet-document browser regressions).
- Previous verification: 2026-10-25 (#425 owner persistence decision: Editor tests/typecheck/build, folder-memory/navigation/command-center/document-tabs/editor-shell/quiet-document; [restoration evidence](editor-ux-shell-v1.md#section-persistence-decision-and-verification-2026-10-25)).
- Previous verification: 2026-10-25 (#425: collapsible folder sections; Editor tests/typecheck/build, folder-navigation/folder-memory/command-center/editor-shell/layout-rules/ui-language/quiet-document and [desktop/phone captures](editor-ux-shell-v1.md#section-disclosure-verification-and-captures)).
- Previous verification: 2026-10-24 (#385: Sidebar header entry, Close-only folder menus; folder-navigation browser check, Editor tests/typecheck/build and [same-state desktop/phone evidence](editor-ux-shell-v1.md#sidebar-open-folder-entry-385)).
- Previous verification: 2026-10-24 (#383: remembered document tabs reuse restored folder context; folder navigation/memory and tab browser regressions).
- Previous verification: 2026-10-24 (#371: concurrent explicit Opens in both response orders retain recent folders in the UI, storage and Reload; unavailable storage retains the page list; folder-memory browser regression).
- Previous verification: 2026-10-24 (#367 cross-tab follow-up: explicit Open replaces another tab's preference and survives Reload, tree-only updates do not write; folder-memory browser regression).
- Previous verification: 2026-10-24 (#367 review follow-up: same-path user Open/Close wins over late restoration, unchanged paths are not rewritten; folder-memory browser regression).
- Previous verification: 2026-10-24 (#367: delayed restoration/Open/Close, remembered paths and Reload, and unique nested New destinations; folder-memory browser regression).
- Previous verification: 2026-10-23 (#235 [ADR-0009](../adr/0009-multiple-opened-folders.md): Open adds a sidebar folder and opened folders are restored; folder-navigation and stable browser suite).
- Previous verification: 2026-10-16 (#204: Open/New retain tabs without work-loss confirmation; new-document, folder-navigation and image-assets regressions).
- Previous verification: 2026-10-14 (image choice through the `image-assets` browser regression; Vite full browser suite and HTTP two-root navigation, creation, narrow/wide layout and Save/Reload on 2026-10-13).
- Scope: choose a Host folder inside the existing Editor dialog, without an OS window, and create folders from it or the sidebar folder.
- Core, CLI, Markdown, document saving and each document's single Tiptap editor state are unchanged.

Vite, Windows Desktop and the standalone [HTTP Host](http-host-v1.md) reuse this picker and the same folder operations. It is the general document-navigation entry: choose a folder here, then choose a `.md` file in its sidebar tree. The Desktop start also offers recent folders and an explicit sample; `.md` execution arguments still open directly. See [Desktop distribution](desktop-distribution-v1.md).

## Behavior

- The expanded Sidebar header has one Open folder… icon button in a fixed position with any
  number of opened folders, also while Display is selected. Empty Files has no duplicate entry;
  per-folder menus contain only Close folder. Start-screen and command-center Open folder remain.
  All use the existing picker/handler. The Sidebar button's accessible name and tooltip use the
  existing English/Korean translation; Open, Cancel and Escape return focus to that button.
  See the [ADR-0009 amendment](../adr/0009-multiple-opened-folders.md#amendment-2026-10-24-open-folder-entry-385)
  and [same-state visual evidence](editor-ux-shell-v1.md#sidebar-open-folder-entry-385).

- The path field determines the folder to open. Typing filters its parent's sub-folders;
  only user edits of the field set the filter. Selecting an image fills the path without
  filtering out sibling entries; editing that path resumes filtering (owner decision,
  2026-10-26, #461).
  Tab or Right completes into a match, Up/Down moves through matches, and Enter opens the
  typed path. Backspace at a trailing separator, Up and breadcrumbs navigate upward.
- Clicking a folder, a recent folder or a starting place navigates there. Opening requires
  Enter or the Open button, whose label identifies the typed folder. Cancel and Escape
  leave the sidebar and document unchanged.
- Home, Documents when present, and filesystem roots come from the Host. The Host supplies
  one level of folder/Markdown names and breadcrumbs; it remembers no browsing state.
- HTTP instead offers only configured allowed roots, with breadcrumbs/Up bounded by the most specific
  containing root. Paths name server folders. The path field can choose another allowed root.
  Recent folders outside current roots are hidden without deleting the preferences; Host validation
  remains authoritative for every request. No roots are merged into a Workspace.
- Open adds the folder to the sidebar's opened folders ([ADR-0009](../adr/0009-multiple-opened-folders.md));
  one already open is listed again in place, retaining its section collapse and child expansion
  (#425). Close removes that root's collapse record, so a later Open starts expanded; this differs
  from Reload/Desktop restart, which restore remembered section collapse. Only collapsed root paths
  are stored in origin-specific `ieumdoc.collapsedFolderSections`; child expansion/listings remain
  page state. Startup restoration never rewrites memory, including stale records: they are ignored
  and removed on the next user Open/Close, section toggle or navigation reveal. Writes during
  restoration wait for all roots, and each explicit action writes its current live list even if
  another tab changed storage since this tab's last write (#370). Startup tab reveal respects
  remembered collapse; explicit navigation reveal expands and remembers it. See
  [section visibility and reveal](editor-ux-shell-v1.md#collapsible-folder-sections-425).
  Recently opened folders are browser preferences, retained
  only after a successful Open. Overlapping successful Opens each update the latest recent list in
  completion order (most recently completed first), retaining up to five distinct paths. If browser
  storage is unavailable, the recent list still updates for this page. The opened folders' paths are remembered separately
  and listed again on start; neither enters a document or Host configuration. Quoted paths copied from Explorer are accepted.
- The folder-tree hook owns both the live opened list and its remembered paths. After a successful
  user Open or Close, it remembers the latest reduced list. During startup restoration, writing is
  deferred until all remembered paths have been tried, so pending folders cannot be lost. Restoration
  alone does not rewrite preferences: missing/refused folders stay remembered until the next user
  Open/Close, while remaining quietly absent from the Sidebar. A user change during restoration
  writes the final live list once restoration finishes, excluding those failed paths.
- Document tabs restore after this folder restoration, using the same outermost opened-folder
  context as explicit Open. Their separate path/order/active preference follows the same
  restoration-only no-write boundary; see [tab navigation memory](editing-session-save-v1.md#tab-navigation-memory-383).
- A successful user Open or Close of a Host-normalized path during restoration takes precedence
  over that path's older restoration response. In particular, Open then Close stays closed after
  the late response and Reload. Every successful explicit Open/Close remembers the current live list,
  even when its paths are unchanged or another browser tab has saved a different list. Expansion,
  collapse and listing refresh never write preferences, so they leave another tab's saved list intact. A cancelled
  restoration sends no further folder requests after its current request settles.
- An unreadable/missing location shows an error and retains the entered path. Earlier
  browse responses cannot replace a newer location; reopening refreshes the listing.
- New folder, beside Up, shows a name row for the listed folder (the breadcrumb's last folder).
  Create makes that folder through the Host and moves into it, so Open names it; it opens nothing
  and changes no sidebar expansion, though a sidebar folder already listed is listed again.
  A rejected name keeps the row with its error. Cancel or Escape closes the row and returns focus
  to New folder; a second Escape closes the dialog.
- Shared product tokens control presentation. Long folder names and narrow viewports keep
  navigation and Open/Cancel reachable.

## Choosing an image

A Figure's Choose… reuses this picker to choose an image file instead of a folder
([Figure authoring](figure-authoring-v1.md)). It starts in the open document's folder and lists
sub-folders and PNG, JPEG, GIF, WebP and SVG files instead of Markdown files; navigation, Recent,
starting places and the HTTP root limits are unchanged, and there is no New folder. Clicking an image
makes it the selected path and marks it selected in the list, keeping sibling images visible
until the user edits the field (#461). Tab/Right completion retains path filtering.
Use, or Enter, chooses it. Use is available only for an image the listing
shows; a typed folder path, with or without a trailing separator, only navigates, and Enter enters it. The Host then links
or copies the image as the [Asset Host Contract](filesystem-host-boundary-v1.md#image-choice-v1-208)
describes. An error, such as an unsupported or missing file, keeps the picker open with the path.

## Exclusions

No native picker, upload, rename/delete/move, tree inside the dialog, search, watcher, workspace file,
new persistence service or other file-picker UI. Copying is limited to the image choice above. (Each opened folder is shown as a lazily listed tree in the sidebar; see
[Folder listing v1](filesystem-host-boundary-v1.md#folder-listing-v1-112).) The separate full-file-path dialog is removed (#190). No CLI parity command:
choosing a folder is interface/Host navigation, not a document semantic operation.

## New document in a sidebar folder

- The sidebar folder heading has a `+` (New file in folder) and New folder beside its `⋯` menu (Close folder only). General Open folder… stays in the Sidebar header.
- `+` opens the filename form without an unsaved-work confirmation. Success adds a new tab; existing
  sessions and drafts remain. Cancelling or failed creation adds nothing. The shared **Save / Don't
  save / Cancel** confirmation belongs to closing a dirty tab. See
  [Switching and recovery](editing-session-save-v1.md#switching-and-recovery).
- The New dialog's Location field shows and chooses the destination: all opened folders and
  every sub-folder listed in their trees so far, expanded or not. Each Host-normalized path appears
  once. In opened-folder order, then tree order, the first occurrence supplies its position and label
  (named from that opened folder); a later overlapping tree does not rename it.
  It starts at the open document's folder when that is inside the chosen folder, otherwise at
  the chosen folder. No hidden state chooses it: expanding or collapsing folders does not.
  A folder deeper than the tree has listed appears once its parent is expanded.
- The dialog accepts a single filename.
  An omitted `.md` suffix is added; separators and `.`/`..` are rejected so this
  entry point cannot choose another directory. It is the only New entry point; the former
  top-level full-path New was removed with the [sidebar chrome cleanup](editor-ux-shell-v1.md#structure).
- Creation uses the existing Host API and Core's canonical empty Markdown. Success
  opens a new document tab and lists its folder again, so it appears in the tree. On close, a successful
  New focuses its first paragraph; Cancel/Escape or a rejected New returns focus to the New button
  (see [Empty document start](editor-visual-language-v1.md#empty-document-start-133)). Existing files, pending
  operations keep their existing protections. Cancel/Escape in the filename form creates nothing.
- No workspace state or new Core/CLI operation is needed:
  this change supplies a destination to the existing document-creation flow.

Folder New coverage includes root/sub-folder creation, cancellation, rejected names, existing-file protection, unsaved work, real-file Save → Reload and narrow-layout reachability.

## New folder

- Both entry points create one folder directly inside an existing folder through the
  [Host folder creation](filesystem-host-boundary-v1.md#folder-creation-v1). Nothing is replaced:
  an existing file or folder of that name is an error. The name is a single portable name (rules
  in the Host contract); the dialogs reject separators and `.`/`..` before asking the Host.
- The sidebar's New folder uses the New dialog form: the same Location choices and starting
  destination as New file, then a folder name. Success expands the folders above the new folder
  and lists them again, so it appears (collapsed) and is at once a New file destination. The open
  document, unsaved work and drafts are untouched, so New folder is not blocked by them. Closing
  returns focus to New folder.
- No Core operation or CLI command: a folder holds documents but is not document content.
  Headless creation is the shell's `mkdir`, as for [folder listing](filesystem-host-boundary-v1.md#folder-listing-v1-112).

## Verification and historical evidence

The Host listing test covers browsing/crumbs; the Host creation test covers portable names, overwrite refusal and missing parents. The folder browser regression covers keyboard navigation, cancellation, recent-folder reload, quoted paths, errors, delayed responses, New folder in the picker and sidebar, and the sidebar/document flow. Preserve source fixtures when running these checks.

Future changes follow the [verification matrix](../../CONTRIBUTING.md#verification-matrix) and required CI. Keep the Host boundary, shell description and manual guide aligned, and close owned verification processes.

Historical local verification (2026-10-07) passed: 441 Core/CLI/Editor tests, all 36 browser regressions,
typecheck, production build and diff whitespace checks. The folder regression also
produced 1440px and 375px captures for visual review. Source fixtures remained unchanged.
