# Docling runtime spike

당시 이름: 이음독(IeumDoc), 현재 Litzio

- Status: Historical
- Last verified: 2026-10-31 (branch-only experiment; measured results below).
- Scope: `spike/docling-plugin-runtime`; owner-authorized experiment, no adoption or merge.
- Authority: current [ADR-0004](../adr/0004-desktop-host-distribution.md), [ADR-0005](../adr/0005-http-host.md), [ADR-0011](../adr/0011-code-module-boundary.md), [AGENTS.md](../../AGENTS.md). Context: [Discussion 767](https://github.com/ieumbird/ieumdoc/discussions/767), [Discussion 834](https://github.com/ieumbird/ieumdoc/discussions/834).

## Question and boundary

Can the existing in-process Desktop Host and independent HTTP Host register,
run, isolate failure and disable the first trusted module without a daemon?
This experiment reuses `convertDoclingPdf` in a bundled child process and Core's
public API unchanged. Existing Settings, conversion dialog and comparison stay.
It does not introduce a general Runtime/Adapter, Workspace or Project layer.

The only new durable authority is the user's `~/.ieumdoc/modules` folder
(`IEUMDOC_MODULES_DIR` can isolate an experiment). `registry.json` holds the
selected immutable worker installation and enabled flag. Each request UUID has
one exclusively created `runs/<UUID>` directory and an atomically replaced
`run.json`. A duplicate ID returns its first run; changed source bytes, path or
server conflict. Incomplete admission refuses replay. Implementation version is
pinned at first admission. Child handles and the currently viewed ID are
transient Host memory; a new Host reconstructs visible receipts from disk.

Registration and disable are available live through one command family:

```powershell
pnpm exec tsx scripts/build-docling-module.ts
pnpm ieumdoc module register tmp/docling-module/manifest.json
pnpm ieumdoc module disable
pnpm ieumdoc module enable
pnpm ieumdoc module list
```

Hosts opt in with `IEUMDOC_MODULE_RUNTIME=1`. They reread the registry for each
new ID, without restarting. The same operation is exposed at
`GET/POST /api/docling-module` for the development Desktop experiment. HTTP Root
checks apply to the supplied manifest. This is explicit execution of trusted
local code; permissions are declarations, not an OS sandbox or security grant.
The manifest contains ID, version, Host API 1, one bundled CJS entrypoint and
`read-input`, `write-staging`, `network-docling` permissions. No automatic install,
download, approval UI or default registration is added.

Disable keeps the installation and run history, rejects new IDs and drains
already accepted work. Repeated accepted IDs remain readable after disable.
Normal Host close stops local workers and records cancellation. Pipe closure
also ends a worker when its Host dies. A later Host observing a running record
whose owner PID is dead marks it `uncertain`, never resubmits and preserves its
staging for inspection. This borrows only request identity and no-replay rules
from [WorkNaru ADR 0016](https://github.com/SWBaek/worknaru-dev/blob/main/docs/adr/0016-module-run-idempotency-and-recovery.md).
It does not claim exactly-once external completion: the Docling service's task
may outlive a stopped local worker. Its task ID remains in the ledger.

The worker writes under a hidden sibling `.ieumdoc-module-<UUID>`, including its
temporary REST response. Normal Host routes refuse that staging path. Only a
complete result plus exit code 0 can trigger the Host's same-volume directory
rename into the final bundle. Failed/killed/timed-out workers expose no final
output. Source input is hashed before execution and rechecked before publishing.

## Measurements

Windows 2026-10-31, base `19b75939`, Node 24.21.0, pnpm 12.5.1,
development Electron 44.7.0, bundled worker SHA-256
`fa59dbd4bec38124a54015092c25cdae92027f6e4f4b932a1eb8700ca204ca17`.
The first valid complete run is [attempt 3](https://github.com/ieumbird/ieumdoc/blob/3d4cb6e139313ab458f841f5c1514dadc3e21470/docs/reviews/assets/docling-runtime-spike/attempt-3.json),
11:48:29–11:48:45 KST. Assertions operate on actual child PIDs, on-disk files,
real TCP HTTP and the actual Electron renderer. Only the external Docling REST
service is synthetic. The local `127.0.0.1:8001/version` connection was refused;
real extraction, OCR/models and full production-service conversion are **unverified**.

| Condition | Result | Observed evidence |
| --- | --- | --- |
| a. Normal conversion | Unverified against real Docling | Both workers passed the synthetic REST/converter/Core path; canonical native content and non-stale comparison returned. The real Docling endpoint was unavailable. |
| b. Kill/timeout isolation | Pass | Both Hosts survived kills during streamed download and a 350ms deadline. Actual Desktop contenteditable accepted text after each failure. |
| c. Original PDF/JSON unchanged | Pass | Input PDF and committed fixture PDF/JSON SHA-256 matched before/after the combined scenarios; no source JSON write path was introduced. |
| d. No partial output publication | Pass | A 31-byte partial `response.json` existed in private staging; its Host read returned 403, final output did not exist, and kill cleanup removed staging in both Hosts. |
| e. Request ID deduplication | Pass | Concurrent replay through both live Hosts added no submission; a concurrent fresh UUID produced exactly one submission; conflicting PDF locator refused. |
| f. Disable/unregister | Pass | Desktop disabled the shared registry while a request ran; both Hosts rejected new UUIDs; the accepted conversion completed. Disable preserves installation/receipts. |
| g. Desktop and serve | Pass, development Desktop scope | Actual `ieumdoc://app` in-process Host and separately launched built `cli.mjs serve` converted and isolated both faults. Real HTTP process termination/restart marked its receipt uncertain; same UUID did not resubmit. Packaged Desktop unverified. |
| h. Shared user installation | Pass | Desktop registered the worker in default `~/.ieumdoc/modules`; independently started serve read and executed that copy without another registration. |

The raw harness's `checks.a.result: pass` is scoped to its declared synthetic
REST fixture. It does not establish the owner's complete real-service condition
a; that condition remains unverified above.

| Measurement | Desktop | HTTP serve |
| --- | ---: | ---: |
| Worker admission → ready (includes module import) | 128ms | 156ms |
| Normal conversion total (includes two 1s fixture polls) | 2,335ms | 2,438ms |
| Kill during partial download, admission → recorded failure | 2,195ms | 2,236ms |
| 350ms deadline, admission → recorded failure/cleanup | 383ms | 372ms |

Desktop startup → Editor ready: 1,257ms. These are single observations, not a
latency guarantee. The kill totals include waiting for fixture download; they
are not kill-signal response latencies. Timeout totals include process exit and
cleanup. JSON/PDF input hashes are in the evidence JSON.

Reproduction (builds development files only, no installer/package):

```powershell
pnpm exec tsx scripts/build-docling-module.ts
pnpm --filter @ieumdoc/desktop build
pnpm browser:test docling-runtime
```

The explicit spike scenario uses a fixed checkout-owned Electron profile and
an otherwise empty default user module registry (or its disabled identical
previous spike worker). It preserves the installed worker and receipts, disabled
at exit. It leaves the interrupted run's hidden staging for inspection. No
background worker is retained. The first complete run's owned Host/launcher and
nine worker PIDs were all dead at final inspection. A later process inventory
also found no worktree-owned Node/Electron/Chrome verification processes or
listeners on 5282/5283. The independent Vite check used port 5282 and the
runner's checkout-specific persistent Chrome profile; its caller-owned Vite PID
63168 was explicitly terminated afterward.

Validation: Docling's 36 tests, CLI's 83 tests, 27 shared Host/HTTP/Desktop
protocol target tests (including manifest validation/immutable-copy), four affected package typechecks,
documentation links and `git diff --check`. Existing real-browser
`docling-server` (28.8s) and `docling-compare` (16.2s) passed against the opt-in
worker Host, including lost-response observation, cancellation, failure,
comparison and existing editor interaction. No test criterion or timeout was
relaxed. The new CLI command required updating the help command inventory;
its focused help regressions passed after that expected public-surface update.

### Unsuccessful measurement attempts

- [Attempt 1](https://github.com/ieumbird/ieumdoc/blob/3d4cb6e139313ab458f841f5c1514dadc3e21470/docs/reviews/assets/docling-runtime-spike/attempt-1.json): the harness tried GET
  on the POST-only document-source route and parsed an empty 405 response as JSON.
  The product check was corrected to the existing file-preview route and now
  requires an actual 403. All recorded owned PIDs exited.
- Attempt 2: fault/conversion assertions progressed, but the harness waited on
  the test document's real unsaved-work exit confirmation. It did not produce a
  valid final measurement. Verified owned Desktop PID 60604 and serve PID 56824
  were stopped explicitly. The harness now exits only its owned test Electron
  directly after its unsaved scratch-edit check. Product shutdown cleanup waits
  until `window-all-closed`, after the ordinary work-loss confirmation.
- Attempt 3 is the earliest complete valid run; it is reported above. Attempts
  are not selected by favorable timing.

## Architectural differences and limits

- ADR-0004: preserves in-process protocol routing and opens no Desktop TCP listener.
- ADR-0005: preserves the independent stateless document Host and Root boundary;
  adding a durable non-document task ledger goes beyond its current scope.
- ADR-0011: explicitly conflicts with its no-registration/dynamic-loading and
  process-local transient conversion decisions. This branch is not an amendment.
- AGENTS.md: durable module state is outside document/session handlers, but its
  use by Host adapters needs an explicit accepted exception before product adoption.
- No packaged Desktop, packaging, update/uninstall or Edge runs on Windows.
- PID liveness does not defend against PID reuse, remote/network filesystems or
  hostile mutation of this trusted user-owned folder. A registry lock left by a
  crash requires inspection. No migration, job queue, durable event stream,
  cross-Host cancellation or shared editing session is provided.
- POSIX empty-target rename races are not solved by this Windows spike; the
  prepublication existence check is not a portable no-replace rename primitive.

## Follow-up ADR outline (unaccepted)

1. Decide whether the measured Docling-only worker boundary merits adoption.
2. Keep Desktop in-process and HTTP independent; no shared daemon.
3. Place trusted module installations, enabled flags and run receipts in one user folder.
4. Require a small versioned manifest and explicit registration; reread on admission.
5. Pin implementation at admission; UUID conflicts fail, duplicates never execute twice.
6. Mark interrupted unconfirmed work uncertain; forbid automatic replay.
7. Disable drains accepted work; Host exit stops local workers; external tasks may continue.
8. Publish complete bundles only; Core remains the sole owner of native semantics.
9. Exclude AI installation/approval, sandboxing, marketplace and remote deployment.
10. Verify real Docling and resolve locking, PID identity and portable no-replace publication before adoption.
