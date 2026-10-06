# Folder picker v1

- Status: implemented and verified locally on Windows, 2026-10-07.
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

No native picker, upload/copy, recursive tree, search, watcher, workspace, new persistence
service or file-picker UI. The existing file-path dialog remains. No CLI parity command:
choosing a folder is interface/Host navigation, not a document semantic operation.

## Completion and verification

Extend the existing Host listing test for browsing/crumbs and the existing folder browser
regression for keyboard navigation, cancellation, recent-folder reload, quoted paths,
errors and the sidebar/document flow. Exercise delayed responses in that same regression
and inspect the dialog at 1440px and a narrow viewport. Preserve source fixtures.

Required checks: `pnpm typecheck`, `pnpm test`, `pnpm --filter @ieumdoc/editor build`,
`pnpm browser:test` and `git diff --check`. Update the Host boundary, shell description and
manual test guide, then close this work's verification server and browser sessions.

Local verification passed: 441 Core/CLI/Editor tests, all 36 browser regressions,
typecheck, production build and diff whitespace checks. The folder regression also
produced 1440px and 375px captures for visual review. Source fixtures remained unchanged.
