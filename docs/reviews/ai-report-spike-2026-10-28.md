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
Model: owner-confirmed **`gpt-6-luna` only**, passed explicitly to thread/start and turn/start.
No default, user-configured model or fallback. The 2026-10-28 catalog identifies this as
`gpt-6-luna` / `GPT-6-Luna`. After initially requesting "GPT 6.1 Luna", the owner explicitly
confirmed that this exact identifier was intended. Codex version: **0.164.0**.
Authentication: existing ChatGPT `codex login`, never an API key.
The transport, panel toggle and status idea reuse the earlier
[`spike/codex-ai-1028`](https://github.com/ieumbird/ieumdoc/tree/spike/codex-ai-1028)
experiment. Its block replacement/proposal semantics are not imported.
The implementation is reconstructed on current master; Core is unchanged.

Every report request receives a fresh exclusive filename in the user's existing output subfolder.
The shim delegates to the actual CLI's exported `runCli`, including all Core operations,
argument validation, atomic batch commit and canonical checks. It admits only
`create`, `apply-batch`, `inspect`, `check`, help and version introspection. Writes target only the new report.
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

## Round 1 measurements and conclusions

The owner added the Luna-only instruction during the initial experiment. The active Sol request
was immediately interrupted and the Host stopped. The catalog initially lacked the exact requested
"GPT-6.1-Luna" name, so execution stayed blocked until the owner confirmed `gpt-6-luna`.
`model-catalog.json` preserves all paginated catalog entries. The final Luna experiment uses a
separate `luna/scratch` reference folder and output, excluding earlier Sol artifacts from its input.

Before that instruction there were **six `gpt-6.1-sol` requests**: one initial browser attempt,
two infrastructure diagnostics, and three planned report requests (the last interrupted).
Two reports passed Host validation. These are historical diagnostic artifacts, **not Luna results**,
and their performance figures are not used as the requested final measurements.
The owner-confirmed Luna experiment performed exactly the three planned requests. No extra model
diagnostics or repeat benchmark runs were performed. Every thread and turn explicitly used
`gpt-6-luna`; the Host reported ChatGPT authentication and Codex 0.164.0.

| Request | Time (s) | Shell commands / failures | CLI calls / failures | CLI retry calls | Successful batch |
| --- | ---: | ---: | ---: | ---: | --- |
| Summary | 64.517 | 15 / 6 | 18 / 3 | 2 | None; Host refused to open empty document |
| THD assessment | 51.048 | 10 / 2 | 14 / 2 | 2 | One atomic batch, 6 operations |
| Control review | 53.869 | 9 / 1 | 20 / 2 | 1 | One atomic batch, 8 operations |

Time starts before Host preparation and ends at model turn completion; the separate final Host
check is outside this timer. CLI calls include help, inspect, create, dry runs and check; a single
shell command can contain several. A retry call is the next CLI call for the same command, target
and dry-run flag after a failure. Successful dry-run counts were 0, 1 and 3 respectively (total
dry-run attempts 3, 3 and 4). Raw events and Core read-model analysis are in
`luna/events.ndjson` and `luna/measurement-summary.json` outside the repository.

Q1 is **partial, not a full success**. Two of three documents passed revision/check and rendered
their table, equation, Mermaid and table/Figure captions. The first stayed empty after operations
JSON quoting/constrained-language failures; no report event or tab opening was emitted.
Request 2 recovered from missing heading level and forbidden Mermaid alt text. Request 3 recovered
from operations-JSON creation problems. However, **both successful documents have zero Core
reference nodes**: literal "Table 1" / "Equation (1)" / "Figure 1" mentions are ordinary text.
Thus complete requested-feature success is **0/3**, despite Host structural success **2/3**.
An empty unresolved-reference list does not establish that requested references were created.

The control-review diagram also omits the source's PWM step and adds sensor/feedback structure
without identifying that addition as an assumption. Host structural checks cannot judge such
source fidelity. The report's additional power/current points are explicitly labelled sample
calculations, not measured results.

Q2: one atomic batch was practical once valid operations JSON existed (6 and 8 operations), but
the Windows JSON handoff/CLI discovery overhead and first-request failure remain significant.
Three runs do not establish a general success rate or performance distribution.

Q3: no raw Markdown write or file-edit-tool use was observed in the three Luna requests. The two
successful final CLI revisions matched disk and passed an independent Host check. A real-file Host
regression deliberately appends content after the recorded CLI revision and verifies rejection
before check/open; file-edit-tool attempts and check-time races are rejected too. This proves the
specified revision comparison, not complete protection against a hostile shell (limits above).

Q4: legacy workspaceWrite reads the synthetic outside sentinel. A restricted named permission
profile is recognized but cannot run with this PC's Windows unelevated sandbox. Folder-only shell
read restriction is therefore not achieved in this environment.

Q5: no missing Core/CLI write capability was established for the requested table, equation,
Mermaid, caption and reference semantics. `--content` also accepts inline marks, links and inline
math. Practical gaps are the file-only `--operations` handoff (no stdin) and discoverability of
InlineContent: inspect's paragraph/heading JSON exposes text, not structured inline content.
The generated reports did not use reference nodes despite the existing write surface and prompt;
whether inspect discoverability caused that omission is unverified.
Luna hit PowerShell quoting/constrained-language errors, required heading level, and Mermaid alt
restrictions. Earlier Sol also hit `type` versus `kind` and missing reference role. These are not
proof that the corresponding semantic operations are missing. The shim's `help COMMAND` and
`--version` refusals are fixed; the latter occurred once during Luna request 3 and remains counted
in that request's failures. No benchmark was rerun after that small shim correction. The CLI was
not expanded and Markdown was not written through a workaround.

Sol-only captures and transcripts remain under `captures/` and `sol-browser-results/` and are
labelled as such. Final Luna captures, command events and measurements are under `luna/`.
The 1440px `luna/captures/report-and-chat-1440.png` shows the final actual report and conversation;
`luna/captures/settings-1440.png` shows `gpt-6-luna`, ChatGPT login and Codex 0.164.0.

## Round 2: stdin and a validated reference example

Scope is limited to two changes: `apply-batch --operations -` reads UTF-8 operations from stdin,
and the model receives a short generic operations example for labelled table/equation/Mermaid
blocks and real inline references. The batch parser, Core operations, atomic commit, dry-run,
revision checks, model, sandbox and inspect projection are unchanged. Stdin alone accepts an
initial UTF-8 BOM; the existing operations-file path retains its previous behavior.

The generic example uses `y = x`, an A/1 table and Input→Output diagram; it is not a prewritten
answer to any measurement request. Its initial CLI test exposed a wrong field in round 1's
guidance: reference nodes need **`label`**, not `target`. Round 2 corrects that instruction.
The exact injected example passed actual CLI dry-run, apply and check, and Core confirmed the
three references. A model-free `command/exec` preflight in the unchanged Windows sandbox also
confirmed those operations and Korean stdin preservation. That preflight initially failed because
Windows PowerShell's UTF-8 pipe prepended a BOM; the new stdin decoder handles it. Both preflight
attempts are retained outside the repository; they involved no model thread or turn.

Round 2 reuses the exact round-1 reference folder without rewriting it, uses a separate
`round2-reports` output subfolder and starts a fresh in-memory conversation. The three request
strings are shared with round 1. Only `gpt-6-luna` is allowed, exactly three requests. The manual
measurement records model content/visual failures as findings so they do not prevent the remaining
planned requests; normal stable browser assertions and timeouts are unchanged. Only the final
1440px report/chat and necessary failure evidence are captured in round 2.

Exactly three `gpt-6-luna` requests completed on Codex 0.164.0. The browser result confirms byte-identical
request strings and the same reference root as round 1; all four reference-file hashes stayed unchanged.
No operations JSON files were created in round 2's output folder; every actual batch used stdin.

| Metric (requests 1 / 2 / 3) | Round 1 | Round 2 |
| --- | --- | --- |
| Host revision/check pass | 2/3 | 3/3 |
| Table, equation, Mermaid, captions and actual reference coverage | 0/3 | 3/3 |
| Core reference nodes | 0 / 0 / 0 | 3 / 3 / 3 |
| Time (s), excluding final Host check | 64.517 / 51.048 / 53.869 | 42.605 / 51.212 / 40.472 |
| Shell commands | 15 / 10 / 9 | 8 / 9 / 6 |
| Shell failures | 6 / 2 / 1 | 0 / 1 / 1 |
| CLI calls | 18 / 14 / 20 | 12 / 12 / 13 |
| CLI failure receipts | 3 / 2 / 2 | 0 / 3 / 3 |
| CLI retry calls | 2 / 2 / 1 | 0 / 1 / 0 |
| Dry-run attempts / successes | 3/0 · 3/1 · 4/3 | 1/1 · 2/1 · 1/1 |
| Successful batches / operation counts | 0/0 · 1/6 · 1/8 | 1/13 · 1/10 · 1/6 |

The same timers/counters and retry definition as round 1 are used. Total turn time was 169.434→134.289s
(mean 56.478→44.763s); this is descriptive evidence from three requests, not a general latency claim.
The Windows operations-JSON transfer failure that stopped round-1 request 1 did not recur.
Round-2 request 2 recovered after Core refused a paragraph containing heading/paragraph Markdown.
Request 3 tried to inspect the SVG as a native document and received a read error.

The raw CLI failure counts also include a pre-existing shim defect: `create --help` and
`apply-batch --help` each show help but then incorrectly enter write-receipt handling (two failures
in each of requests 2 and 3). These four failures remain in the table; they are not stdin or actual
write failures. The defect is recorded without fixing it because round 2 authorizes only stdin and
the reference example. No model benchmark is repeated to obtain better counts.

Source fidelity: all reported source numbers and derived currents/THD differences were consistent
with the fixtures. Request 1's diagram nevertheless adds an unprovided feedback path while calling
the figure source-based. Requests 2 and 3 did not add unprovided structures; request 3 retains the
source PWM step and explicitly labels its single-phase/unity-power-factor calculation assumption.
Therefore structural/reference success 3/3 does not establish complete source fidelity.

The only round-2 capture is the actual final report/chat at 1440px:
[round-2 report and chat](../../spike-evidence/ai-report-1028/round2/report-and-chat-1440.png).
No new Settings capture is needed. Model/email credentials are not displayed in the report capture.
Raw model events, Core read-model counts, source hashes, unchanged requests and browser findings are
retained in the external round-2 evidence directory. No Core, inspect projection, model, sandbox,
machine PATH or registry changes were made.

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
