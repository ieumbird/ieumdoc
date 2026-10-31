# Plugin UI contributions v1

- Status: Implemented
- Last verified: 2026-10-31 (#857; shared Host, boundary, activation and browser checks; packaged Desktop runs in required CI).
- Authority: [ADR-0012](../adr/0012-plugin-runtime-and-ui-contributions.md), [Discussion #767](https://github.com/ieumbird/ieumdoc/discussions/767) and [brand-neutral Host API decision #856](https://github.com/ieumbird/ieumdoc/discussions/856).

## Manifest and assets

The brand-independent `@document-plugins/api` contract owns the identifiers in
`src/config.ts`: UI API 1, React major 19, `/api/ui-plugins`, `ui.mjs`, `ui.css`.
These are protocol identifiers, independent of a packager's product name.
Existing product identifiers/folders are not migrated by #857.

The [shared installation manifest](plugin-runtime-v1.md) may contain
`ui: { api: 1, reactMajor: 19, script: "ui.mjs", style: "ui.css" }`.
Style is optional. A UI-only plugin may omit both worker fields. When present,
the worker pair retains its own API 1 validation. Registration checks compatibility
before copying any code. HTTP Root checks cover the source manifest and every
declared file, including real-path/symlink resolution. The immutable installation
revision hashes the validated manifest plus worker/UI hashes; request admission
still pins worker bytes independently. Installation is trusted local code, without
download, marketplace or an approval UI.

`GET /api/ui-plugins` returns enabled `{ id, revision, ui }` records without local
installation paths. `?id=…&revision=…&asset=ui.mjs` (or `ui.css`) serves only the
currently enabled revision's declared, hash-checked bytes. Disabled, obsolete,
undeclared, traversing, missing or changed assets are refused. Responses use the
proper JS/CSS MIME, `nosniff` and `Cache-Control: no-store`. Vite, HTTP serve and
the in-process Desktop protocol use the same handler. Production CSP remains
`script-src 'self'`; no eval, global React bridge, remote URL or Desktop TCP
listener is added. Discovery seeds the bundled Docling installation only if absent;
explicit disable and pinned registrations survive later discovery/app updates.

## Renderer and API surface

The UI ESM exports `activate(host)` and returns commands, sidebar actions, tab
kinds and a mandatory `dispose()`. The build wraps a CommonJS bundle in a lexical
factory whose two external imports bind to **the exact Host React and JSX runtime
objects**. Nothing evaluates a string or loads a second React. Both registration
and Editor activation reject a different UI API or React major before requesting
assets. API 1 requires React 19; the Host supplies its installed minor/patch.
Changing major requires a new compatibility decision/API. This is verified by
actual plugin hooks and the production renderer, not just a version string.

| Supplied API | Purpose / boundary |
| --- | --- |
| `api`, `React`, `jsx` | Version and renderer instance injection. |
| `ReadingSurface`, `Button` | Fixed Read mode with public Core document/path, neutral block/list positions and selection keys; shared small ghost control. No editor DOM/state/commands. |
| `text`, `imageUrl` | Current translation and existing document-relative media route. |
| `readJson` | GET-only same-origin `/api/<route>` with Host Root checks; aborted/rejected on detach. |
| `pickFolder`, `openTab` | Shared folder picker and plugin-scoped shell tab navigation. |
| `showPdfConversion` | Existing shell PDF picker/progress dialog; conversion remains callable headlessly through the Host. |

The generic contribution shapes contain no AI provider, document mutation or
editor engine. A later provider-neutral AI plugin can contribute the same
commands, sidebar entries and views; it is not implemented here. Plugin source
and erased type imports are checked with the existing Babel parser, and the
transitive esbuild graph rejects Editor/Tiptap/ProseMirror/renderer internals.
Core is used only through its public exports. The parser is a build-only dependency.

## Contributions, lifetime and failures

The Editor observes registration with sequential 500ms reads. Each plugin loads
independently; a slow/broken one does not block another. Identical observations
preserve all activations. A changed/removed plugin first loses commands/sidebar
entries and unmounts its views, then calls its disposer and removes its stylesheet.
Other plugins and ordinary editing sessions keep their mounted identities. A
late load cannot activate a detached revision. Detached Host methods reject use;
pending supplied reads are aborted. Plugin actions/open failures and invalid
activation results are contained, and a per-tab React error boundary contains
render/lifecycle exceptions. Errors appear in their tab or shared notification
center. Ordinary documents keep their unsaved input and remain editable.

Commands live in Command Center; sidebar actions use the existing expanded
Explorer footer before Settings; tab kinds live in the existing two-group shell.
Shell-owned tab identity, kind, path, data snapshot and label remain when disabled.
The disabled tab can be moved or closed normally and has no Save/recovery session.
Re-registering reconstructs the view in the same tab; view-local selection and
scroll reset. Snapshot data is retained, not silently reread. Contributed tabs
are not restored at startup. Docling's command, picker, footer order, titles,
stale-map warnings and #815 fixed Read/bidirectional matching remain unchanged.

Native ESM records **cannot be unloaded**. Same-content re-registration uses the
same revision URL/module record but invokes a fresh activation. Different content
revisions retain their evaluated modules until the window closes; restarting the
window is the way to reclaim these records. Disposers must release timers,
listeners and other activation resources; views release their React resources on
unmount. Docling's existing observer/frame cleanup is retained. This is a trusted
dependency/failure boundary, not a sandbox for infinite loops, arbitrary global
DOM/CSS mutation, uncaught asynchronous plugin code or resource exhaustion.
Detachment never cancels an accepted worker or deletes its receipts.

Settings plugin management, conversion-dialog migration, official plugin
installation/update/removal, AI agent implementation, OS sandbox and daemon are
outside #857. Docling remains bundled until its official installation flow exists.
No new Core semantics or semantic CLI command is introduced. Existing headless
conversion and shared Host registration APIs remain available without a view.

## Verification

`plugin-ui` checks live commands/sidebar/tab activation, injected React hooks,
same-module reuse, disposal/style removal, retained tabs, render/load/API failures,
no page navigation and the exact ordinary document DOM/unsaved input across faults.
`docling-compare` keeps the #815 selection/read-only regressions and 1440/640px
English Light/Korean Dark capture path. Shared tests verify actual Desktop and
HTTP asset routes/CSP, hash/path/disable/revision refusal, invalid registration,
late-load detachment, independent activations and runtime/type import boundaries.
Packaged Desktop's Docling smoke also opens the dynamically loaded comparison
and exercises disable/re-register under its real CSP. Real Docling service fidelity
remains the separate [manual check](../test/README.md#docling-worker-runtime-853).
