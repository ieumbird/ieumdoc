# Folder picker v1

- Status: Implemented
- Last verified: 2026-10-08 (New Location field compared with current code and regression coverage).
- Scope: choose a Host folder inside the existing Editor dialog, without an OS window.
- Core, CLI, Markdown, document saving and the single Tiptap editor state are unchanged.

## Behavior

- The path field determines the folder to open. Typing filters its parent's sub-folders;
  Tab or Right completes into a match, Up/Down moves through matches, and Enter opens the
  typed path. Backspace at a trailing separator, Up and breadcrumbs navigate upward.
- Clicking a folder, a recent folder or a starting place navigates there. Opening requires
  Enter or the Open button, whose label identifies the typed folder. Cancel and Escape
  leave the sidebar and document unchanged.
- Home, Documents when present, and filesystem roots come from the Host. The Host supplies
  one level of folder/Markdown names and breadcrumbs; it remembers no browsing state.
- Recently opened folders are browser preferences, retained only after a successful Open.
  They do not restore a chosen sidebar folder on reload and never enter a document or Host
  configuration. Quoted paths copied from Explorer are accepted.
- An unreadable/missing location shows an error and retains the entered path. Earlier
  browse responses cannot replace a newer location; reopening refreshes the listing.
- Shared product tokens control presentation. Long folder names and narrow viewports keep
  navigation and Open/Cancel reachable.

## Exclusions

No native picker, upload/copy, tree inside the dialog, search, watcher, workspace, new persistence
service or file-picker UI. (The chosen folder is shown as a lazily listed tree in the sidebar; see
[Folder listing v1](filesystem-host-boundary-v1.md#folder-listing-v1-112).) The existing file-path dialog remains. No CLI parity command:
choosing a folder is interface/Host navigation, not a document semantic operation.

## New document in a sidebar folder

- The sidebar folder heading has a `+` (New file in folder) beside its `⋯` menu (Open file…, Open folder…, Close folder).
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
  opens the document and lists its folder again, so it appears in the tree. Existing files, pending
  operations and unsaved work keep their existing protections. Cancel/Escape writes nothing.
- No directory creation, workspace state or new Core/CLI operation is needed:
  this change supplies a destination to the existing document-creation flow.

Folder creation coverage includes root/sub-folder creation, cancellation, rejected names, existing-file protection, unsaved work, real-file Save → Reload and narrow-layout reachability.

## Verification and historical evidence

The Host listing test covers browsing/crumbs. The folder browser regression covers keyboard navigation, cancellation, recent-folder reload, quoted paths, errors, delayed responses and the sidebar/document flow. Preserve source fixtures when running these checks.

Future changes follow the [verification matrix](../../CONTRIBUTING.md#verification-matrix) and required CI. Keep the Host boundary, shell description and manual guide aligned, and close owned verification processes.

Historical local verification (2026-10-07) passed: 441 Core/CLI/Editor tests, all 36 browser regressions,
typecheck, production build and diff whitespace checks. The folder regression also
produced 1440px and 375px captures for visual review. Source fixtures remained unchanged.
