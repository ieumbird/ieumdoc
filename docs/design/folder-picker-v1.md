# Folder picker v1

- Status: Implemented
- Last verified: 2026-10-14 (image choice through the `image-assets` browser regression; Vite full browser suite and HTTP two-root navigation, creation, narrow/wide layout and Save/Reload on 2026-10-13).
- Scope: choose a Host folder inside the existing Editor dialog, without an OS window, and create folders from it or the sidebar folder.
- Core, CLI, Markdown, document saving and the single Tiptap editor state are unchanged.

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
- Recently opened folders are browser preferences, retained only after a successful Open.
  They do not restore a chosen sidebar folder on reload and never enter a document or Host
  configuration. Quoted paths copied from Explorer are accepted.
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
makes it the typed path; Use, or Enter, chooses it. A folder path only navigates. The Host then links
or copies the image as the [Asset Host Contract](filesystem-host-boundary-v1.md#image-choice-v1-208)
describes. An error, such as an unsupported or missing file, keeps the picker open with the path.

## Exclusions

No native picker, upload, rename/delete/move, tree inside the dialog, search, watcher, workspace,
new persistence service or other file-picker UI. Copying is limited to the image choice above. (The chosen folder is shown as a lazily listed tree in the sidebar; see
[Folder listing v1](filesystem-host-boundary-v1.md#folder-listing-v1-112).) The separate full-file-path dialog is removed (#190). No CLI parity command:
choosing a folder is interface/Host navigation, not a document semantic operation.

## New document in a sidebar folder

- The sidebar folder heading has a `+` (New file in folder) and New folder beside its `⋯` menu (Open folder…, Close folder).
- The New dialog's Location field shows and chooses the destination: the chosen folder and
  every sub-folder listed in the tree so far, expanded or not, named from the chosen folder.
  It starts at the open document's folder when that is inside the chosen folder, otherwise at
  the chosen folder. No hidden state chooses it: expanding or collapsing folders does not.
  A folder deeper than the tree has listed appears once its parent is expanded.
- The dialog accepts a single filename.
  An omitted `.md` suffix is added; separators and `.`/`..` are rejected so this
  entry point cannot choose another directory. It is the only New entry point; the former
  top-level full-path New was removed with the [sidebar chrome cleanup](editor-ux-shell-v1.md#structure).
- Creation uses the existing Host API and Core's canonical empty Markdown. Success
  opens the document and lists its folder again, so it appears in the tree. On close, a successful
  New focuses its first paragraph; Cancel/Escape or a rejected New returns focus to the New button
  (see [Empty document start](editor-visual-language-v1.md#empty-document-start-133)). Existing files, pending
  operations and unsaved work keep their existing protections. Cancel/Escape writes nothing.
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
