# Folder picker v1

- Status: Implemented
- Last verified: 2026-10-24 (#367: delayed restoration/Open/Close, remembered paths and Reload, and unique nested New destinations; folder-memory browser regression).
- Previous verification: 2026-10-23 (#235 [ADR-0009](../adr/0009-multiple-opened-folders.md): Open adds a sidebar folder and opened folders are restored; folder-navigation and stable browser suite).
- Previous verification: 2026-10-16 (#204: Open/New retain tabs without work-loss confirmation; new-document, folder-navigation and image-assets regressions).
- Previous verification: 2026-10-14 (image choice through the `image-assets` browser regression; Vite full browser suite and HTTP two-root navigation, creation, narrow/wide layout and Save/Reload on 2026-10-13).
- Scope: choose a Host folder inside the existing Editor dialog, without an OS window, and create folders from it or the sidebar folder.
- Core, CLI, Markdown, document saving and each document's single Tiptap editor state are unchanged.

Vite, Windows Desktop and the standalone [HTTP Host](http-host-v1.md) reuse this picker and the same folder operations. It is the general document-navigation entry: choose a folder here, then choose a `.md` file in its sidebar tree. The Desktop start also offers recent folders and an explicit sample; `.md` execution arguments still open directly. See [Desktop distribution](desktop-distribution-v1.md).

## Behavior

- The path field determines the folder to open. Typing filters its parent's sub-folders;
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
  one already open is listed again in place. Recently opened folders are browser preferences, retained
  only after a successful Open. The opened folders' paths are remembered separately and listed again on
  start; neither enters a document or Host configuration. Quoted paths copied from Explorer are accepted.
- The folder-tree hook owns both the live opened list and its remembered paths. After a successful
  user Open or Close, it remembers the latest reduced list. During startup restoration, writing is
  deferred until all remembered paths have been tried, so pending folders cannot be lost. Restoration
  alone does not rewrite preferences: missing/refused folders stay remembered until the next user
  Open/Close, while remaining quietly absent from the Sidebar. A user change during restoration
  writes the final live list once restoration finishes, excluding those failed paths.
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
makes it the typed path; Use, or Enter, chooses it. Use is available only for an image the listing
shows; a typed folder path, with or without a trailing separator, only navigates, and Enter enters it. The Host then links
or copies the image as the [Asset Host Contract](filesystem-host-boundary-v1.md#image-choice-v1-208)
describes. An error, such as an unsupported or missing file, keeps the picker open with the path.

## Exclusions

No native picker, upload, rename/delete/move, tree inside the dialog, search, watcher, workspace file,
new persistence service or other file-picker UI. Copying is limited to the image choice above. (Each opened folder is shown as a lazily listed tree in the sidebar; see
[Folder listing v1](filesystem-host-boundary-v1.md#folder-listing-v1-112).) The separate full-file-path dialog is removed (#190). No CLI parity command:
choosing a folder is interface/Host navigation, not a document semantic operation.

## New document in a sidebar folder

- The sidebar folder heading has a `+` (New file in folder) and New folder beside its `⋯` menu (Open folder…, Close folder).
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
