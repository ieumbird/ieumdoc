# CLI-only AI report spike #657

- Status: Historical
- Last verified: 2026-10-28 (spike implementation and local experiments; results below).
- Scope: `spike/ai-report-1028` only, based on master `1fff747`; **not a merge candidate**. [Issue #657](https://github.com/ieumbird/ieumdoc/issues/657).
- Authority: experimental evidence under [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md) and [ADR-0005](../adr/0005-http-host.md). Does not establish a new production architecture.

## Purpose and implementation

An in-memory AI conversation creates new reports from saved documents in an opened folder.
The App owns messages, request state and input/scope drafts, independently of document tabs and
the right panel's mount. No conversation persistence, multiple conversations, existing-document
edit proposals or Desktop integration are included.

`ieumdoc serve --ai` (or `IEUMDOC_AI=1 pnpm editor`) starts one lazy Codex app-server client.
Model: owner-required **GPT-6.1-Luna only**, resolved from the app-server catalog by its exact
display name, then passed explicitly to thread/start and turn/start. No default or fallback model.
The 2026-10-28 catalog has `gpt-6-luna` / `GPT-6-Luna` and `gpt-5.6-luna` / `GPT-5.6-Luna`,
but no GPT-6.1-Luna. Model execution is therefore blocked; neither identifier is silently substituted.
Authentication: existing ChatGPT `codex login`, never an API key.
The transport, panel toggle and status idea reuse the earlier
[`spike/codex-ai-1028`](https://github.com/ieumbird/ieumdoc/tree/spike/codex-ai-1028)
experiment. Its block replacement/proposal semantics are not imported.
The implementation is reconstructed on current master; Core is unchanged.

Every report request receives a fresh exclusive filename in the user's existing output subfolder.
The shim delegates to the actual CLI's exported `runCli`, including all Core operations,
argument validation, atomic batch commit and canonical checks. It admits only
`create`, `apply-batch`, `inspect`, `check` and help. Writes target only the new report.
Model-authored operations JSON is permitted within output; raw Markdown writes are forbidden.
CLI location and shim PATH are provided only to the Codex child and its command environment.
No machine PATH, registry, IeumDoc installation, global Codex config or authentication changes.

The Host requires a successful `create` receipt followed by a successful non-dry-run
`apply-batch` receipt. It compares the final write revision with the actual file, reruns the
real `ieumdoc check --format json`, and checks revision once more before emitting the report
event that opens an Editor tab. Check warnings remain warnings, consistent with existing Core.
Check failure, revision mismatch, missing receipts or file-edit-tool use leaves the report unopened.

Each request uses an ephemeral Codex thread with the visible conversation and Host outcome
explicitly supplied as context. Hidden model state is not retained between requests. The single
app-server process is reused. This is a bounded spike, not a conversation persistence design.

## Execution and security limits

- cwd is the output folder, never the reference folder: legacy `workspaceWrite` implicitly grants cwd writes.
- `writableRoots` contains output only; temporary-directory write grants are excluded; command network is off.
- Web search, inherited MCP servers, apps and agent spawning are disabled for report threads.
- User controls must select a dedicated existing output subfolder within one opened reference folder.
- Native Codex 0.164.0 has no legacy `readableRoots` in its schema. A synthetic outside-read sentinel
  is readable under workspaceWrite. `readOnlyAccess` is rejected with an instruction to use permission profiles.
- A process-only restricted permission profile registered successfully, but this PC's Windows
  **unelevated** sandbox refused every command because it cannot enforce split read restrictions.
  No sandbox setup, elevation, account policy change or global setting change was attempted.
- This is **not** a hard read boundary. The UI states that limitation. The CLI shim does validate
  inspect/check paths, but a model shell read can bypass the shim.
- Receipts arrive through command stdout. They are observations, not cryptographic attestations.
  A deliberately hostile model can forge stdout or modify before a later CLI batch. A matching
  final revision cannot prove that every historical write used the CLI. The experiment does not
  claim prevention or complete detection of arbitrary shell writes or extra output files.
- Microsoft Store PowerShell could not start within the sandbox. Only the Codex child's PATH
  excludes Store aliases, allowing system Windows PowerShell. A nested Node spawn also returned
  EPERM; calling the existing CLI entry in the shim's Node process avoids that extra child without
  changing sandbox permissions or reimplementing document semantics.

Official protocol guidance: [app-server](https://learn.chatgpt.com/docs/app-server),
[permission profiles](https://learn.chatgpt.com/docs/permissions). The installed protocol schema
and runtime errors take precedence over assuming the documentation's older read-access example works.

## Reproduction and evidence

```powershell
pnpm install --frozen-lockfile
pnpm --filter @ieumdoc/cli build
pnpm exec tsx scripts/spike-ai-report.ts probe
pnpm exec tsx scripts/spike-ai-report.ts profile-probe
node --import tsx scripts/spike-ai-report.ts
# Separate terminal, after checking BadPasswordAttempts:
$env:IEUMDOC_BROWSER_URL='http://127.0.0.1:5198'
pnpm browser:test ai-report
# Stop only this harness and its owned Codex process:
New-Item -ItemType File "$env:TEMP/ieumdoc-ai-report-1028/stop-host" -Force
```

Default evidence directory: `%TEMP%/ieumdoc-ai-report-1028` (override with
`IEUMDOC_AI_EVIDENCE`). No npm installation occurs outside the repository.
The harness copies the existing technical sample and its SVG and creates two clearly synthetic
specification/results fixtures. Reference documents are not changed by the model. Three different
requests ask for a summary, THD assessment and control review, each with table, equation, Mermaid,
captions and body references. `events.ndjson` retains raw command results; the browser scenario
records visible conversation/tab continuity and 1440px captures. It is explicitly selected and
excluded from the stable suite: live-model duration is not a normal browser latency assertion.

## Measurements and conclusions

The owner added the Luna-only instruction during the initial experiment. The active Sol request
was immediately interrupted and the Host stopped. **Luna measurements: 0; Q1 and Q2 remain
unverified for the requested model.** No additional model run is authorized while the exact
requested model is unavailable. `model-catalog.json` preserves all paginated catalog entries.

Before that instruction there were **six `gpt-6.1-sol` requests**: one initial browser attempt,
two infrastructure diagnostics, and three planned report requests (the last interrupted).
Two reports passed Host validation. These are historical diagnostic artifacts, **not Luna results**,
and their performance figures are not used as the requested final measurements.
The planned 3-run limit applies to the pending Luna experiment; there have been no Luna runs.

Q3: no successful raw Markdown write was observed in the preserved requests. A real-file Host
regression deliberately appends content after the recorded CLI revision and verifies rejection
before check/open; file-edit-tool attempts and check-time races are rejected too. This proves the
specified revision comparison, not complete protection against a hostile shell (limits above).

Q4: legacy workspaceWrite reads the synthetic outside sentinel. A restricted named permission
profile is recognized but cannot run with this PC's Windows unelevated sandbox. Folder-only shell
read restriction is therefore not achieved in this environment.

Q5: no missing Core/CLI capability was established for the requested table, equation, Mermaid,
caption and reference semantics. Those operations exist; `--content` also accepts inline marks,
links and inline math. The earlier model made discoverability/usage errors (`type` versus `kind`,
missing reference role and PowerShell UTF-8 BOM), rather than proving those features absent.
The shim initially refused `help COMMAND`; it now admits all CLI help forms. Error messages and
raw attempts remain in the external evidence directory; the CLI was not expanded or bypassed.

Sol-only captures and transcripts remain under `captures/` and `sol-browser-results/`. They must
be labelled as such. No screenshot can currently demonstrate a Luna-generated report.

## Validation boundary

Local verification includes existing Core/CLI/Editor suites, repository typecheck, production
Editor/CLI build, documentation checks and the scoped browser scenarios. No packaged installation,
update, uninstall, Edge, new-profile probe or Desktop tests are run for this spike.
The final result comment is written outside the repository for review and is not posted to #657.

Local checks passed: Core 332, CLI 135, Editor 328, full repository typecheck, production
Editor/CLI build, docs:check and diff whitespace. Persistent Chrome layout-rules, quiet-document,
production http-host and HTTP crash/recovery Save/Reload/conflict scenarios passed. The live
Sol scenario passed its UI continuity assertions while preserving the interrupted third request;
this is not a successful three-report or Luna benchmark. The first quiet-document attempt was
invalidated by editing during Vite HMR; the unchanged scenario passed with no concurrent edits.
One existing image rollback test failed once and passed targeted and final full Editor reruns.
No assertion, timeout or retry rule in those existing scenarios was weakened.
