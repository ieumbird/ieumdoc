# Host worker plugins v1

- Status: Implemented
- Last verified: 2026-10-31 (#853: shared Host tests with synthetic REST, independent HTTP process, Desktop protocol, crash/lock recovery and identical-PID owner replacement; real Docling remains manual and packaged Desktop is checked by CI).
- Authority: [ADR-0012](../adr/0012-plugin-runtime-and-ui-contributions.md), with [ADR-0004](../adr/0004-desktop-host-distribution.md) and [ADR-0005](../adr/0005-http-host.md).
- Scope: trusted local worker execution in Vite, in-process Desktop and independent `ieumdoc serve`. UI connections remain static under [ADR-0011](../adr/0011-code-module-boundary.md).

## Installation and API

All Hosts running as one OS user share `~/.ieumdoc/plugins`.
`IEUMDOC_PLUGINS_DIR` selects an isolated installation, including for tests.
Use a local filesystem supporting SQLite locks; network shares and hostile
mutation of this user-owned directory are outside the contract.

A worker manifest is JSON with `id` (lowercase ASCII identifier), `version`
(1–128 letters/digits, underscore, dot, plus or hyphen), `workerApi: 1` and
`entry: "worker.cjs"`. The entry is a self-contained Node CommonJS bundle beside
the manifest. Registration copies its bytes into `installed/<SHA-256>/worker.cjs`
and stores the selected manifest and hash. Each admission pins that installation;
the runtime checks its hash before execution. Re-registering changes future work
only. API mismatch is refused before registration or execution. Worker API 1
accepts the Docling PDF request shape; it is not a general document API.

The first-party Docling bundle ships with the CLI and Desktop, and Vite builds
the same entry at startup. First conversion registers it only if no Docling
registration exists. Explicit unregistration is never silently reversed. Existing
registrations stay pinned until explicit re-registration, including app updates.
This preserves the existing conversion screen without adding an install UI.

The thin shared Host surface is available without restarting:

| Request | Result |
| --- | --- |
| `GET /api/worker-plugins` | Current registrations, including disabled entries. |
| `POST /api/worker-plugins`, `{ manifest: absolutePath }` | Validate and register/replace trusted installed code. HTTP Root checks apply to both source manifest and entry. |
| `DELETE /api/worker-plugins`, `{ id }` | Disable registration; retain installation/receipts and drain accepted work. |
| `POST /api/docling-conversion`, `{ path, id? }` | Admit a PDF request. Optional `id` is a UUID; omitted IDs are generated once by the Host for the existing UI. |
| `GET /api/docling-conversion?id=<UUID>` | Read that receipt, subject to this Host's input/output Root checks. Without `id`, retain the current process-local UI snapshot. |

HTTP retains its Origin/Host/body limits. Desktop uses the same handler through
`ieumdoc://app`, with no TCP listener. No UI plugin assets or contributions are
served here. Registration is explicit trusted code execution, without an OS
sandbox, download, approval workflow or additional permissions model.

## Identity, durable state and recovery

The only durable authority is `runtime.sqlite`: the `plugins` table holds
registration state; `requests` holds UUID, source/server fingerprint, pinned
installation, progress/task ID, owning session UUID and final job status.
The fingerprint includes the PDF's absolute locator, SHA-256 and server URL.
An admitted UUID returns its original receipt, even after disable; changed input
bytes, locator or server refuse conflicting reuse. SQLite transactions make
registration/admission atomic across independent Hosts. Work never starts before
the admission commits, and an uncommitted crash leaves no accepted request.

`owners/<session-UUID>.sqlite` is a request-ownership lock, not a job queue.
The owning Host holds a SQLite write transaction on this file for its lifetime.
An observer probes that session's OS lock: busy means still owned; an unlocked
or missing file means the owner ended. Other I/O errors fail closed. Process IDs,
wall-clock deadlines and heartbeat expiry do not decide ownership, so a reused
PID or a new Host session in the identical live process cannot revive old work.
SQLite releases writer locks and rolls back incomplete transactions on crash.
Owner lock files and installed bundles are retained; no garbage collector is
introduced. These files carry only installation/request ownership information.

A receipt left `running` without its owner becomes `uncertain` on observation.
The existing UI receives an error snapshot explaining interruption. Neither a
read nor replay of the same UUID executes it again. Starting another UUID is an
explicit new request. There is no persistent queue, resume, automatic retry,
cross-Host cancellation, shared live task controller or document/session store.
Startup does not restore completed jobs/tabs; an explicit receipt read remains
possible. Each Host still admits one new conversion at a time.

## Worker lifetime and publication

Worker API 1 uses one IPC request `{ input, output, server }`. Progress and task
ID messages update the receipt. A complete message **and exit code zero** are
required for publication; failure messages preserve module failure codes. The
Host deadline defaults to 30 minutes and covers startup through publication.
Stop waiting, deadline and normal Host close terminate local workers and await
cleanup. Desktop closes workers only after its ordinary unsaved-work close gate.
Host death disconnects IPC; this Docling worker exits when its event loop services
disconnect. Trusted code is not protected against hostile infinite loops.
No local Docling service is launched. A remote task may survive any local stop.

Each execution has a private sibling `.ieumdoc-plugin-*` directory. Worker OS
temporary files and its complete bundle stay inside it. All ordinary Host file
surfaces refuse private paths, including symlink aliases and local Desktop/Vite.
The module uses only public Core operations and validates its native bundle;
original PDF/JSON remain unchanged. Input SHA-256 and Root/real-parent access
are checked again before publication.

The Host exclusively creates the final directory, adds `.ieumdoc-incomplete`,
copies only a successful exited worker's complete bundle, rechecks access, then
removes the marker. Ordinary file routes reject the entire marked directory.
This avoids POSIX rename replacing a concurrently created empty directory and
keeps no-overwrite behavior on Windows too. It is atomic **Host visibility**,
not an atomic filesystem directory rename: direct OS tools can observe the
reserved directory while copying. Failure cleans owned output and staging;
an abrupt Host crash can leave hidden staging or a marked final directory for
inspection. These are never automatically published or replayed. A crash after
marker removal but before receipt commit may leave a complete result with an
uncertain receipt; it still cannot cause duplicate execution. External hostile
filesystem replacement retains the shared Host's existing check/use limitation.

## Verification and remaining adoption

The shared tests cover synthetic conversion, worker kill while downloading a
partial response, timeout, source immutability, private paths/aliases, occupied
publication name, cross-process duplicate admission/conflicts, disable/drain,
Host death/restart, no replay, crashed registry-lock rollback and new ownership
at an identical live PID. Desktop registers the same installation an independent
HTTP Host executes. Distribution smoke tests exercise the shipped worker through
offline Node CLI and the actual packaged Desktop protocol in required CI.

The existing `docling-server` and `docling-compare` browser scenarios exercise the
unchanged screens. Real Docling verification remains an explicit
[manual check](../test/README.md#docling-worker-runtime-853); synthetic REST does
not establish OCR/model readiness or fidelity. ADR-0012's UI compatibility and
disposal adoption conditions remain separate work. No new Core semantics are
introduced: existing headless `docling convert-pdf` remains the CLI surface;
registration is available through the shared Host API and adds no semantic CLI
operation.
