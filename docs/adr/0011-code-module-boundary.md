# ADR-0011: Code module boundary

- Status: Accepted
- Decision date: 2026-10-30
- Last verified: 2026-10-31 (#853 Host worker contract and synthetic execution/crash tests; UI connections remain static).
- Previous verification: 2026-10-30 (Docling module/CLI, comparison tab/reading surface and shared Host; package boundary and browser tests).
- Authority: owner decisions in [Discussion #766](https://github.com/ieumbird/ieumdoc/discussions/766) and [Discussion #767](https://github.com/ieumbird/ieumdoc/discussions/767), under [AGENTS.md](../../AGENTS.md).
- Superseded in part: [ADR-0012](0012-plugin-runtime-and-ui-contributions.md) replaces the static/no-registration/no-dynamic-loading boundary and extends process-local-only conversion state with shared request records. The remaining boundaries stay Accepted.

The static connections and transient-task text below preserve the original
decision. #853 replaces Host execution with the
[worker contract](../design/plugin-runtime-v1.md); UI connections remain static. For the approved runtime
plugin direction, the superseding parts of ADR-0012 take precedence; adoption
requires its conditions and corresponding contract updates.

## Decision

The first code module lives in `packages/docling` (`@ieumdoc/docling`), alongside
the existing workspace packages. It depends on the public `@ieumdoc/core` API;
Core neither imports the module nor knows its source format or data. Document
meaning, validation and canonical writing remain in Core, under
[ADR-0002](0002-document-persistence-semantic-ownership.md).

Docling interpretation, conversion policy and correspondence data belong to the
module. Correspondence is a versioned JSON sidecar outside the native document.
Removing the module and its sidecar leaves a complete native MyST document and
its ordinary image assets. Snapshot paths have the lifetime defined by
[ADR-0003](0003-document-addressing-identity-boundary.md); the document hash binds
each new sidecar to exactly one generated document.

The CLI offers thin `ieumdoc docling convert` and `convert-pdf` commands that
delegate conversion, external REST service access and file output to the module.
It does not implement Docling interpretation,
MyST syntax or document semantics. The implemented policy and sidecar contract
are in [Docling conversion](../design/docling-conversion-v1.md).

## Scope and consequences

This records the package, dependency direction, external module data and CLI
boundary demonstrated by the first module. No registration framework, dynamic
loading, marketplace, database or compatibility infrastructure is introduced.
[#769](https://github.com/ieumbird/ieumdoc/issues/769) establishes two explicit
Editor connections: a sidebar action choosing a conversion folder and a read-only
comparison tab in the existing tab groups. The shell owns tab lifetime, folder
selection, translation and shared notification controls. Comparison tabs have no
editing/recovery session and are not restored at startup.

The module's `./ui` entry receives shared controls and product tokens, plus an
Editor-owned reading surface through `ReadingSurfaceProps`: a public Core read
model, document path and block/list-item position callback. Editor engine types,
DOM and CSS remain private to Editor. The module measures only its own pane and
source-page DOM. Its `./compare` entry contains browser-safe types/geometry;
Node parsing and hash checks stay behind `./compare-host`.

`GET /api/docling-compare?path=…` uses the existing stateless file handler in
Vite, Desktop and HTTP Host. Ordinary Root and document-relative real-path
boundaries apply before reading Markdown/sidecar or serving lazy page images
through the existing media route. The sidecar contains the necessary information
from document.json; the UI does not fetch/repeatedly parse that large source JSON.
The comparison endpoint is read-only. See the
[comparison contract](../design/docling-compare-v1.md).

Unsupported source meaning must be reported explicitly by the
converter rather than silently claimed as preserved native meaning.

## App conversion connections (#797)

The module also connects at the app Settings Docling section, Explorer PDF file
menu and Command Center command. These are explicit contributions, not a general
registration/loading framework. The module supplies server-settings UI using
Editor-injected controls and external-link opener; it never imports Editor code.
The shell supplies the PDF picker, progress dialog, notification integration and
opens the existing comparison tab on completion.

The `./server-types` entry is browser-safe. `./server` owns Host-local settings
and one transient conversion controller; `./server-ui` supplies settings and
Host polling. The shared Host handler routes `GET/PUT /api/docling-settings`,
`POST /api/docling-check`, and `GET/POST/DELETE /api/docling-conversion` in all
three transports. The Host supplies the settings-file location and Root access
checks. PDF REST, failure interpretation and bundle creation stay in the module,
with the same preflight as CLI. The setting is a device preference outside
native documents; the task snapshot is process-local and has no persistent queue,
resume, document session or background-service contract. Cancellation stops
local waiting, not a server job. See the
[conversion contract](../design/docling-conversion-v1.md#app-pdf-conversion-797).
