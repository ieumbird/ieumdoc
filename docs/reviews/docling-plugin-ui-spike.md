# Docling UI contribution spike

- Status: Historical
- Last verified: 2026-10-31 (branch-only measurement; no merge or adoption).
- Scope: `spike/docling-plugin-ui`, based on runtime spike head `3d4cb6e139313ab458f841f5c1514dadc3e21470`.
- Authority: owner-authorized experiment in [Discussion 767](https://github.com/ieumbird/ieumdoc/discussions/767); current [ADR-0001](../adr/0001-single-document-editor-architecture.md), [ADR-0004](../adr/0004-desktop-host-distribution.md), [ADR-0011](../adr/0011-code-module-boundary.md), [AGENTS.md](../../AGENTS.md).
- Related: [runtime spike](docling-plugin-runtime-spike.md), [comparison contract](../design/docling-compare-v1.md), [shell contract](../design/editor-ux-shell-v1.md).

## Question and implementation

Can an installed plugin add/remove one command and one tab kind while the Editor
keeps running? This branch contributes **Docling comparison / Docling 대조** and
the `docling-comparison` view. The existing picker and shell tab/navigation state
remain Editor-owned. This is an explicit Docling-only protocol, not a general
extension framework. Core and native document semantics are unchanged; no new
semantic operation needs CLI parity. Existing module register/enable/disable CLI
commands still provide the headless registration surface.

`scripts/build-docling-module.ts` builds the existing worker plus `ui.mjs` and
`ui.css`. The optional manifest `ui` section declares UI Host API version 1 and
the two filenames. Registration copies all three bundles to an immutable
installation directory and records the UI hashes in the runtime spike's user
registry. `GET /api/docling-module-ui` exposes only enabled/API-version/revision.
Its asset query serves only the selected script/style after revision and SHA-256
checks, with JavaScript/CSS MIME and `Cache-Control: no-store`. Arbitrary paths,
old revisions, disabled installations and unsupported API versions are refused.
HTTP Root checks still apply when registering a supplied manifest; the UI route
is an explicit exception allowing installed trusted code outside document Roots.

The Editor observes registration every 500ms using sequential fetches; no daemon,
WebSocket or shared document session is introduced. It uses native ESM `import()`
from the Host origin and one installed stylesheet link. Generation checks discard
obsolete asynchronous results. Commands exist only after successful activation;
replacing/removing the registration unmounts the view and removes its stylesheet.
API mismatch is checked **before requesting either bundle** and explained in the
tab and shared notification center. Failed imports/activation are local module
state; each contributed tab has its own React error boundary.

The same shared handler is routed through Vite, production `serve`, and the
existing in-process `ieumdoc://app` protocol. No Desktop TCP listener, protocol
privilege or CSP relaxation was added. Both production transports retained
`script-src 'self'`; Vite retains its existing development policy without CSP.

## UI Host API and React

`packages/docling/src/ui-plugin-api.ts` is a type-only API 1 contract. The Editor
passes React, the JSX runtime, a shared Button, translation, media URL builder,
the comparison-picker callback and its existing read-only ReadingSurface. The
ReadingSurface takes a public Core read model/path and reports neutral layout
positions. Plugin code does not import Editor modules, inspect its reading DOM,
or receive Tiptap/ProseMirror state, types or commands.

The UI build externalizes `react` and `react/jsx-runtime`. Its ESM activation
factory binds those imports to the exact renderer instances passed in API 1;
there is no global React bridge, eval, import map or second React copy. The
existing CompareView hooks ran under both production and development React.
The build guard and harness inspect the transitive esbuild graph; the harness
also scans UI source/type-contract imports. Only the module's four runtime
inputs and the two permitted React externals were present.

This is dependency/failure isolation for **trusted code**, not a security sandbox.
A shared renderer can still be blocked by an infinite loop or affected by global
DOM/CSS changes, uncaught asynchronous callbacks or resource exhaustion. React
major versions and this injected contract need explicit compatibility policy
before adoption. Error boundaries cover rendering and React lifecycle failures,
not arbitrary event/async code. Native ESM cannot be unloaded from the realm;
unregistration detaches contributions, and repeated unique registrations retain
module records until the page exits. The bundled view cleans up its own observers
and animation frames on unmount; no general plugin disposal contract is proven.

## Open-tab disable policy

Keep the shell tab id, path and opening snapshot, unmount plugin content and show
**Module is disabled / 모듈이 꺼짐**. Registration reconstructs the view in that
same tab. This is preferable to closing a user's comparison context for a
temporary module disable; the tab has no unsaved document changes or recovery
session. It can always be closed normally. Local bbox selection and scroll reset
on reactivation, and the retained snapshot is not a fresh read of changed files.
Changing that policy would require a separate freshness/refresh decision.

## Measured results

Windows, Node 24.21.0, pnpm 12.5.1, development Electron 44.7.0 and installed
Chrome with the checkout's persistent profile. Vite used **5283**; independent
production serve used **5284**. No Edge, packaging, update or uninstall ran.
The UI used the declared synthetic comparison fixture with real Core read model,
real images and the actual Editor reading surface. No Docling REST conversion or
OCR was performed in this UI spike; the runtime spike's real-server gap remains.

The earliest complete valid run is [attempt 5](https://github.com/ieumbird/ieumdoc/blob/b35f854b69fc7d7c762097326045b34de0610c96/docs/reviews/assets/docling-ui-spike/attempt-5.json),
12:27:08–12:27:34 KST. All conditions below passed independently in each of
Desktop, serve and Vite. There were **0 main-frame navigations** during each
registration/fault/recovery sequence; `performance.timeOrigin` stayed unchanged.

| Condition | Result and direct evidence |
| --- | --- |
| a. Dynamic command + comparison tab | Pass: live command opened the picker; installed ESM/CSS rendered images, selected bbox, correspondence wires and read-only Core content. [Desktop](https://github.com/ieumbird/ieumdoc/blob/b35f854b69fc7d7c762097326045b34de0610c96/docs/reviews/assets/docling-ui-spike/Desktop-ready.png), [serve](https://github.com/ieumbird/ieumdoc/blob/b35f854b69fc7d7c762097326045b34de0610c96/docs/reviews/assets/docling-ui-spike/serve-ready.png), [Vite](https://github.com/ieumbird/ieumdoc/blob/b35f854b69fc7d7c762097326045b34de0610c96/docs/reviews/assets/docling-ui-spike/Vite-ready.png). |
| b. Register/disable/register without reload | Pass: an already-open Command Center gained/lost its exact command; registration restored the same tab id and identical reading content. |
| c. Render/load failure isolation | Pass: injected render throw, module-evaluation throw, and deleted installed ESM each stayed local. The ordinary document retained its exact DOM instance and unsaved text, then accepted more real keyboard input after each fault. Re-registration recovered. [Render error](https://github.com/ieumbird/ieumdoc/blob/b35f854b69fc7d7c762097326045b34de0610c96/docs/reviews/assets/docling-ui-spike/Desktop-render-error.png). |
| d. Version mismatch | Pass: API 2 displayed “UI Host API 2 is incompatible; expected 1.”; script request count did not increase and poison code never ran. Command absent; ordinary Editor usable. Host unit check also refuses direct incompatible-asset access. |
| e. Desktop + serve | Pass: actual `ieumdoc://app/index.html` with CSP and a separate built CLI process at HTTP 5284; also Vite 5283. Packaged Desktop is unverified. |
| f. Disable an open comparison | Pass: same shell tab, explicit disabled state, zero contributed views or stylesheet links; re-registration restored the snapshot. [Disabled tab](https://github.com/ieumbird/ieumdoc/blob/b35f854b69fc7d7c762097326045b34de0610c96/docs/reviews/assets/docling-ui-spike/serve-disabled.png). |
| g. Internal-import boundary | Pass: transitive build graph and source/type-contract inspection, React externalization and hook rendering; no Editor/Tiptap/ProseMirror dependency in the plugin. Raw input list/hashes in attempt 5. |

| Measurement (one observation, ms) | Desktop | serve | Vite |
| --- | ---: | ---: | ---: |
| Register request → observed ready | 419 | 45 | 848 |
| Native import + CSS + activation | 8 | 7.5 | 52.5 |
| Disable request → observed detach | 25 | 108 | 833 |
| Re-register request → observed restored view | 438 | 839 | 854 |

The outer observations include registry I/O, 500ms discovery phase and Playwright
assertion sampling; they are not strict poll latency bounds or performance
guarantees. Import timing excludes discovery and React/Editor code already loaded.
Bundle sizes: **16,628 bytes JS**, **3,787 bytes CSS**, uncompressed. JS SHA-256:
`ae6fc431c37df1f591b38105eccb344bd997aa7e0c30f6ae9b7c3ab839f1ebab`.
Startup plus the harness's preference-isolation reload was 1,103ms; this is not a
clean startup benchmark. Original source PDF/JSON hashes matched before/after.

### Attempts retained without timing selection

1. [Attempt 1](https://github.com/ieumbird/ieumdoc/blob/b35f854b69fc7d7c762097326045b34de0610c96/docs/reviews/assets/docling-ui-spike/attempt-1.json): Desktop followed its system Korean language; the English command-button locator timed out. Set the test UI language explicitly.
2. [Attempt 2](https://github.com/ieumbird/ieumdoc/blob/b35f854b69fc7d7c762097326045b34de0610c96/docs/reviews/assets/docling-ui-spike/attempt-2.json): Desktop passed dynamic loading/lifecycle; a later keyboard insertion split the sentinel string. The harness now compares the exact unsaved text before a new insertion and verifies removing that insertion yields the original text; it does not assume an unrelated cursor placement.
3. [Attempt 3](https://github.com/ieumbird/ieumdoc/blob/b35f854b69fc7d7c762097326045b34de0610c96/docs/reviews/assets/docling-ui-spike/attempt-3.json): Desktop passed a–f; serve's selected-tab locator also matched Outline. Scope it to document-tab controls.
4. [Attempt 4](https://github.com/ieumbird/ieumdoc/blob/b35f854b69fc7d7c762097326045b34de0610c96/docs/reviews/assets/docling-ui-spike/attempt-4.json): Desktop/serve passed a–f; Vite's existing sample left a hidden editable tab first in DOM. Reuse the existing exact-path/active-document helper.
5. Attempt 5 above is the first complete valid run. No product assertion, timeout or fault case was relaxed. Every attempt's owned process liveness check ended empty.

Reproduction (development builds, no package/install):

```powershell
pnpm exec tsx scripts/build-docling-module.ts
pnpm --filter @ieumdoc/desktop build
pnpm browser:test docling-ui
```

The harness isolates its registry with `IEUMDOC_MODULES_DIR` under checkout `tmp`
and uses that same installation directory across independent Hosts. It does not
change the default user registry proven by the first spike. Fixed Electron and
checkout-hashed Chrome profiles are reused, with test-origin preferences/recovery
reset at startup. It starts no conversion worker. Each run preserves raw evidence
and screenshots, and closes its browser/Hosts in `finally`.

Validation: all six package typechecks; Editor **363**, Docling **36**, Desktop
**80** and CLI **83** tests passed. The existing `docling-compare` (9.9s),
`command-center` (58.5s), `layout-rules` (23.6s) and `quiet-document` (25.8s)
browser scenarios passed on Vite 5283 with the installed dynamic UI. These reuse
the checkout profile, including the existing bilingual/panel/viewport checks;
no timeout or expected behavior was relaxed. The development Desktop build
(including CLI/production Editor), documentation links and whitespace checks
passed. Screenshots above were visually inspected; this is no visual redesign.
No PR was opened, so required PR CI has not been claimed or substituted by local
results. All five measurement attempts reported no live owned PIDs. The separate
regression Vite PID **24028** was identified and stopped after its browser runner
closed; final process inventory found no worktree-owned verification processes
and no listeners on 5283/5284. No conversion worker was started in this spike.

## Remaining static surfaces and adoption boundaries

- **Sidebar: feasible.** The existing picker callback and translated action are
  sufficient; add a small action descriptor and preserve footer placement/focus.
  This branch deliberately leaves the existing sidebar entry unchanged.
- **Settings: feasible with a further narrow contract.** Inject shared controls,
  versioned section identity/order, external-link opener and Host settings
  requests; define what happens to unsaved form input on disable. Existing
  ServerSettings already takes injected controls but remains statically imported.
- **Conversion dialog: feasible, more lifecycle work.** Keep shell modal/focus and
  notification ownership; inject a task read/control surface and picker callbacks.
  UI detach must not cancel/drain differently from the first worker spike or
  silently lose the current receipt. No such migration was implemented or proven.

This does **not** remove all static Docling imports from App, Settings, conversion
dialog or ReadingSurface type contracts. Host comparison parsing also remains
static. It proves only the two requested UI contributions. AI install/approval,
OS sandbox, daemon, marketplace, Core changes and other contribution points are
outside scope. No remaining blocker for these measured a–g conditions; real
Docling conversion, packaged-app behavior and hostile-code isolation are unproven.

ADR-0001 is preserved: the Editor retains engine/selection/history ownership.
ADR-0004 is preserved: same production Editor and in-process custom protocol,
without TCP/CSP bypass. ADR-0011's explicit static/no-registration/no-dynamic-load
decision and the shell's no-command-plugin contract conflict with this branch.
Combined with the first spike, ADR-0005/AGENTS stateless Host scope must explicitly
allow a separate durable user module registry/receipts before adoption. Historical
spikes do not supersede those accepted decisions.

## Combined follow-up ADR outline (unaccepted, 12 lines)

1. Decide whether to adopt the two measured Docling-only runtime/UI boundaries.
2. Keep Desktop in-process and serve independent; introduce no shared daemon.
3. Put trusted immutable worker/UI installations, enabled flags and receipts in one user folder.
4. Require explicit registration with separate versioned worker and UI Host APIs.
5. Serve only registered hashed ESM/CSS from each Host's own origin, preserving CSP.
6. Inject the renderer React/JSX runtime and narrow controls/reading/navigation capabilities.
7. Keep Core semantics and all engine types/state inside their existing owners.
8. Add/remove commands and tab views live; retain disabled tab context and define disposal limits.
9. Isolate worker process failures and per-tab render/load failures; do not claim an OS/UI sandbox.
10. Pin admitted work, deduplicate UUIDs, mark interrupted work uncertain and forbid automatic replay.
11. Disable drains accepted work; publish only complete output; UI detachment does not change receipt lifetime.
12. Before adoption, verify real Docling/packaged Desktop and resolve locking, PID, React/API and unload limits; exclude AI install, marketplace and remote deployment.
