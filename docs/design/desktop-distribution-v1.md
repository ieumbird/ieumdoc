# Desktop distribution and updates v1

- Status: Implemented
- Documentation verification: 2026-10-26 (Host startup response versus Editor tab restoration compared with first-document.ts, host-protocol.ts, App.tsx and the session contract; no new Desktop execution).
- Last verified: 2026-10-26 (public 0.1.0-beta.1, release CI, anonymous assets, real GitHub 0.0.1-beta.4→0.1.0-beta.1 update and Korean Windows packaged regression with #450; see the release record).
- Previous verification: 2026-10-16 (#296 PR3: actual packaged Windows process crash/normal close, same-profile recovery, pending Figure, Save/Reload and external conflict. Native close answer is stubbed; no install/update/release performed).
- Previous verification: 2026-10-16 (#296 PR2: native Close without saving wording; Desktop tests/typecheck and mock-bridge browser guards).
- Previous verification: 2026-10-16 (#204: all-tabs close/restart aggregation and native close wording; 39 Desktop tests and desktop-updates browser regression; no installer/updater boundary change).
- Previous verification: 2026-10-15 (public beta.4, release CI, anonymous assets and actual GitHub beta.3→beta.4 update; see the release record).
- Authority: [ADR-0004](../adr/0004-desktop-host-distribution.md); document semantics and Save remain owned by [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md), [Filesystem Host](filesystem-host-boundary-v1.md) and [Editing session](editing-session-save-v1.md).
- Start-up/CLI path verification: 2026-10-15 (#287 unit tests for refusal before path I/O and valid Unicode names; Desktop tested without Electron).
- Scope: Windows x64 per-user Electron/NSIS app, Stable/Beta updates and local/CI packaging. Public publication requires a separate explicit approval.

## Native sample

The default bundled sample is copied once to `sample-native-v1` under the user data directory. Existing `sample` directories and modified copies are preserved. The sample follows [Native document support](document-support-v1.md).

## Start-up document path Unicode (#287)

`firstDocument()`는 시작 `.md` 인자의 단독 UTF-16 surrogate를 `assertUnicode()`로 파일 접근·경로 정규화 전에 거부한다. 원본 경로 없이 거부 사유만 `userData/logs/desktop.log`에 기록하고 해당 인자를 건너뛰며, 다른 유효한 문서 인자가 없으면 문서 없이 시작하고 기존 sample 사본을 제공한다. 정상 한글·emoji·리터럴 U+FFFD 파일명은 허용한다([경로 계약](filesystem-host-boundary-v1.md#path-unicode)).

## Scope and completion

The Desktop Host lives in `apps/desktop`. It ships the existing Editor production build and directly imports the existing document/asset Host handlers. `ieumdoc://app` serves files and Host requests inside Electron; it starts neither Vite nor a TCP server. Core, File commit and CLI document operations do not change. There is no portable release, remote service, original-file autosave, cloud account or second editor state.

Completion requires the Windows installer, channel/state tests, packaged app and actual install/update regressions, the existing Core/CLI/Editor/browser checks, CI configuration and this documentation. Unsigned publication is restricted to exact `vX.Y.Z-beta.N` releases after these checks, with its signature status and possible Windows warnings disclosed. Authenticode credentials are prerequisites for signed releases and Stable publication. All publication requires explicit approval and actual environment protection configured in GitHub. Real GitHub update delivery is distinct from the local feed checks.

## App and Host

- App/product name: `IeumDoc`; App ID: `io.github.ieumbird.ieumdoc`; updater cache: `%LOCALAPPDATA%\ieumdoc-updater`; preferences/sample/logs: `%APPDATA%\IeumDoc`. Keep these identities stable after first publication.
- Windows EXE, NSIS installer/uninstaller, shortcuts and runtime window use the [IeumDoc wing/document icon](app-icon-v1.md). Its SVG source and generated ICO are tracked together; this does not replace previously published Beta assets.
- The per-user one-click NSIS installer requires no separate Node.js/pnpm/browser installation. Uninstall keeps user data. The Host supplies the first valid existing `.md` command-line file, or start information with a writable sample copied into user data once. Without an accepted argument it supplies no default document; the Editor may still restore tabs. Startup priority and session protection follow [Editing session and Save](editing-session-save-v1.md#tab-navigation-memory-383); if no tabs open, the Editor shows its [start](editor-ux-shell-v1.md#start-without-a-document-174). The sample opens only when chosen, through the same Open path as any file. Opening another argument into an already running instance and OS file association are not implemented.
- Electron main owns window lifecycle, protocol, preferences and updater. The sandboxed, isolated renderer has no Node integration; its typed preload exposes only update/settings calls and a restart check. Host/Markdown/file writes never pass through this bridge.
- IPC accepts only the app's main frame. External navigation/new windows are denied; http(s) links open in the system browser. Static paths are confined to the production build, including symlinks. CSP permits own scripts, own/inline styles needed by the editor/KaTeX, and local/data/blob images; no remote code or frames.

## Channels and versions

The public distribution version is `0.1.0-beta.1`; Stable publication is deferred. On first launch, an installed `X.Y.Z-beta.N` defaults to Beta and a Stable version defaults to Stable. A valid saved Stable/Beta choice always wins, including after installing a different version. Missing/damaged preferences or an invalid/missing channel fall back to the installed version's default. Preferences are persisted by temporary sibling/rename. Settings → About shows installed version, channel, update status/actions and a Release notes link.

The [0.1.0-beta.1 release record](../releases/v0.1.0-beta.1.md) contains publication, verified public assets, master CI and actual GitHub 0.0.1-beta.4→0.1.0-beta.1 update evidence. Earlier verification below remains historical.

| Channel | Feed and offer | Release assets |
| --- | --- | --- |
| Stable | GitHub's latest full release; only a greater stable semver is offered | `latest.yml` |
| Beta | Newest Beta or Stable; only a greater semver is offered | Beta publishes `beta.yml`; a Stable release's `latest.yml` is the provider fallback |

Tags are exactly `vX.Y.Z` or `vX.Y.Z-beta.N`; tag, app/package version and update metadata must agree. Beta Releases have `prerelease=true`; Stable Releases have `prerelease=false`. Other prerelease channels are rejected. Setting the updater channel is followed by explicit `allowPrerelease` and `allowDowngrade=false`, because the library's channel setter enables downgrades. A Beta → Stable switch keeps an installed newer Beta until a newer Stable exists.

Before the first public release, local development versions can be reset. A previously installed `0.1.0` development build cannot update down to `0.0.1-beta.1`; replace that development installation manually without weakening downgrade protection. Beta publication may use the restricted unsigned mode; Stable publication requires signing. Both require matching tag/version/channel, verified assets and passing CI.

`generateUpdatesFilesForAllChannels=false` and explicit publish channels prevent a Beta from generating Stable metadata. Artifact validation refuses the other channel file. Channel changes during download/install are refused; late check results from a previous channel are ignored. A downloaded update stays ready until installation or a channel change makes it ineligible.

## Window close

Electron retains its native **Close without saving / Keep editing** dialog. All-tab protection,
the distinction from single-tab Close and recovery retention follow the
[session protection contract](editing-session-save-v1.md#switching-and-recovery).

Client recovery uses IndexedDB at the stable `ieumdoc://app` origin in Electron's persistent
default session, under the app profile. The packaged regression checks identical `userData` and
`sessionData` paths across new app PIDs, actual forced termination and normal window close, and
record/Restore/Save/Reload/conflict preservation. It keeps its test profile and resets recovery
only at the beginning of each test, never between that test's restarts. The close-dialog response
is stubbed through the existing harness; native window lifecycle, protocol, storage and files are
real. See [Host recovery boundaries](editing-session-save-v1.md#host-persistence-verification-296-pr3)
for the last-successful-record and platform limits.

## Update lifecycle and work protection

- Check 15 seconds after launch, then every 6 hours; retry a failed check after 30 minutes. Manual Check for updates is immediate. Only one check is in flight; errors never block editing.
- Finding an update downloads nothing (`autoDownload=false`). Download update starts the real updater download and progress events. A verified download does not restart or install on ordinary quit (`autoInstallOnAppQuit=false`). Later persists the dismissed version; a different version may notify again. About remains available.
- Restart to update disables window input and asks the live Editor whether all tabs are safe, using the [session work-protection contract](editing-session-save-v1.md#save-shortcut-and-work-loss-protection-56). No user-input dialog is added inside the timed handshake.
- Missing/malformed answers, renderer failure or a 5-second timeout refuse and re-enable the window. The existing `beforeunload` remains a second check. `quitAndInstall(true, true)` runs only after the agreed window close; a close veto returns to the downloaded state. Updates never discard or save user work implicitly.

The [client recovery contract](editing-session-save-v1.md#local-recovery-records-296-pr2) owns recording/deletion. Windows Desktop crash/profile persistence checks and remaining limits are recorded in [Host persistence verification](editing-session-save-v1.md#host-persistence-verification-296-pr3).

## Verification and signing

The direct-start packaged check identifies its root through the live launched ChildProcess and executable, then follows parent PID edges only when creation times are consistent. Confirmed live child identities (PID plus creation time) persist across the initial and final samples and each sample's enumerations, even if their parent exits or its PID is reused. Collection is asynchronous so the original process handle's exit remains observable. Root and sampled listener identities are confirmed after TCP enumeration; missing/reused identities fail measurement. Both samples assert no TCP listeners. The process/TCP/process sequence is not atomic, cannot reconstruct unobserved process ancestry, and does not assert updater/installer leftovers after exit. See [Windows Desktop regression](../test/README.md#windows-desktop-regression) for the #491 ownership regression and diagnostic fields.

The updater uses its own SHA-512 download verification. A signed release build additionally uses the public `NsisUpdater.verifyUpdateCodeSignature` hook for strict Windows Authenticode verification: status must be Valid and the publisher must match `app-update.yml`; missing tools/errors refuse the update. It repeats that check before marking the download installable, including cache reuse (6.x skips the fresh-download signature hook for a cached file). Unsigned Betas do not enable this publisher-signature check. Code-signing secrets are supplied only by the release environment, never source/logs.

electron-updater 6.8.9 does not use a detached signature for `latest.yml`/`beta.yml`. The unsigned Beta relies on GitHub HTTPS/release access control and version/channel/hash validation; a checksum alone does not authenticate a publisher. Signed releases additionally validate the installer publisher signature. Local test feeds do not establish real GitHub delivery or SmartScreen reputation.

## Build and release procedure

Development and package/test commands, the CI jobs, signing setup and the publication boundary are documented in [Contributing](../../CONTRIBUTING.md) and [Verification](../test/README.md). Packaging removes its generated output first so test feeds, versions and old channel files cannot survive into a normal build. No build command publishes.

PR/push CI builds and tests unsigned packages and cannot publish. The manual workflow runs only from master and defaults to `verify`. `unsigned-beta` publishes only exact Beta tags; `signed` retains mandatory credentials, forceCodeSigning and strict publisher verification for Stable or Beta.

Full Editor browser regressions run on Linux, as in PR/push CI. The Windows job runs the workspace tests, actual Electron packaged regressions and both Stable/Beta NSIS install/update tests before producing a clean package. Publication requires successful preflight, browser and Windows build jobs. This avoids the observed Windows Vite browser-runner `ERR_NO_BUFFER_SPACE` failure without omitting browser scenarios or accepting network errors.

Preflight executes the controller from the dispatch master SHA before installing dependencies or running tag code. It validates the mode and canonical tag, requires an existing local/remote tag and matching Desktop package version, proves the peeled tag commit is an ancestor of that trusted SHA, then builds that immutable commit. Publication reruns preflight from the trusted controller and checks the remote tag immediately before activation. Tag, package, installer/app PE FileVersion and metadata agree. The pinned builder recomputes the installer blockmap; metadata names one installer with its exact size/SHA-512. Other-channel metadata and test-host configurations are refused.

Only the publication job has `contents: write`; it uses `desktop-release`. On 2026-10-12, after explicit publication approval, the repository environment was configured and verified through the GitHub API: required reviewer `SWBaek`, self-review allowed for solo operation, and a custom deployment branch policy allowing only `master`. Administrator bypass is allowed in the actual settings; this publication used the required reviewer approval. YAML's environment name alone does not enforce approval; maintainers must recheck the actual protection rules before subsequent publication. Signed mode additionally needs signing secrets, which remain unconfigured. Local preparation itself made no environment or secret changes.

The authenticated, paginated release list includes Drafts; any existing same-tag Release is refused. A new Draft is created with the correct prerelease/latest policy, and its returned ID is used for uploads and reads. Only installer, blockmap and the correct channel manifest are uploaded. The exact asset set, uploaded state, size and server SHA-256 must match before the final activation request. Beta always has `prerelease=true` and `latest=false`, with `beta.yml` only. Assets are never clobbered. Pre-activation failures leave a Draft for operator review. A lost response to the final activation request cannot establish whether GitHub applied it; the script reports the Release ID and requires confirmation, without automatic retry/delete.

The first beta.1 was published by the earlier CI-artifact procedure. Subsequent releases use this workflow. See [Contributing](../../CONTRIBUTING.md#windows-desktop-builds-and-releases) for the approval/tag/verification/publication sequence and [beta.2 notes](../releases/v0.0.1-beta.2.md) for publication and verification evidence.

## Stable not yet published

`IeumGitHubProvider` is a small adapter over pinned electron-updater 6.8.9's GitHubProvider. The provider wraps the structured HTTP error from latest-full lookup twice and loses its status; matching every 404 or parsing the wrapped error text is unsafe. The adapter observes the existing requests, without extra API polling. A valid empty Atom feed, or a valid Beta-only repository feed together with 404 at the exact latest-full endpoint, establishes absence. Public github.com returned 406 for this JSON endpoint when only beta.1 was public (confirmed during preparation on 2026-10-12); that status is accepted only at github.com with the same Beta-only evidence. Feed/asset 404s, a latest failure with Stable in the feed, malformed feeds, missing/corrupt metadata and other network failures remain errors.

GitHub's Atom feed also lists non-release tags: the feed inspected during preparation included `archive/*` spikes in addition to public beta.1. Like the library's Beta selector, the adapter ignores non-semver tags, but requires at least one canonical Beta version and no Stable version for the latest-endpoint absence classification. Malformed links, another repository or unrecognized version channels remain errors.

Stable absence yields `no-stable-release`, displayed as **No Stable release has been published yet.** It uses the normal 6-hour interval, keeps the Editor/Settings usable, and permits Beta selection/manual checks. The adapter resets evidence on each check so the first Stable publication resumes normal selection. The existing generation guard discards late results after channel changes. The library still owns selection, metadata parsing, checksum/download and signature handling; downgrade policy is unchanged.

## Evidence and limits

Beta.2 candidate verification on 2026-10-12: frozen install, full typecheck/docs, workspace tests (520 passed and 2 existing Windows skips), final Desktop integration (37), final full browser regression (43), clean Windows Beta package with PE versions/SHA-512/size/recomputed blockmap, packaged regressions (8), real NSIS local-feed Stable and Beta updates, actionlint and 21 Windows PowerShell run-step parses passed. The packaged live Stable lookup showed the expected absence message with the actual archive-tag feed. Installer remains unsigned. An initial browser run missed one expected save-session HTTP400 console entry; unchanged isolated and full rechecks passed without weakening criteria. The expanded install test initially needed its canary parent folder created, which was fixed; both final install/update runs passed and uninstalled their own app.

See the [beta.2 release record](../releases/v0.0.1-beta.2.md) for exact scope, failure defenses and public artifact fingerprints. The approved manual workflow published beta.2 after successful Linux browser and Windows NSIS/package checks. Anonymous downloads and the actual public beta.1→beta.2 installation passed, including ordinary-quit protection, unsaved-work refusal and saved Markdown/preferences/channel/user-data preservation. The following initial implementation/preparation measurements are historical evidence and remain unchanged.

Initial Desktop implementation verification on 2026-10-12:

| Check | Result |
| --- | --- |
| Frozen install, full workspace typecheck, docs checker tests/check and diff whitespace | Passed; docs checker tests 5 |
| Core / File commit / CLI / Editor / Desktop unit/integration | 210 / 2 / 46 / 225 / 30 passed; File commit has 2 existing Windows-only environment skips |
| Full browser suite | 43 passed after the unload fix; source fixture preservation and runner cleanup included |
| Actual NSIS install/update with a local stand-in feed | Passed: ordinary quit does not install; missing IPC answer/renderer check error/dirty document refuse; Save then update 0.0.1→0.0.2, relaunch, document preservation and uninstall |
| Normal 0.1.0 package and packaged regressions | Artifact verification and all 7 regressions passed; no forced process termination needed |
| Initial Beta test package | 0.1.0-beta.1 built/verified with `beta.yml`, no `latest.yml`; at that stage the normal package was reset to 0.1.0 and github.com |
| Public build without credentials | Refused by `forceCodeSigning`; this is an expected negative check |
| Workflows | actionlint 1.7.12 and PowerShell parsing of all 21 Windows run steps passed; GitHub jobs/publication not executed |

The initial 0.1.0 Windows app showed its window in 732 ms: 4 processes, 396 MB combined working set after 3 seconds, 0 TCP listening ports. This is a local single-run observation, not a performance guarantee. That development installer was approximately 102.5 MiB and unsigned.

First Beta preparation additionally verified `0.0.1-beta.1 → 0.0.1-beta.2` with actual NSIS installation and a local feed containing no Stable release. The installed default was Beta, `beta.yml` supplied the update, ordinary quit did not install, missing/failed Editor answers and unsaved work refused restart, and Save allowed installation/relaunch with document preservation and uninstall. Windows `ProductVersion` drops the prerelease identifier (`0.0.1.0` for both Betas); the regression now compares the complete `FileVersion` exactly, retaining `beta.1`/`beta.2`. Its first run exposed the old numeric-version assumption before that correction. This remains unsigned local-feed evidence, not signed GitHub delivery.

The same regression also passed for Stable `0.0.1 → 0.0.2`. Full workspace unit/integration and type checks passed, along with docs and whitespace checks. The final clean `0.0.1-beta.1` package passed artifact verification (`beta.yml` only, correct version/hash and GitHub provider without a test host) and all 7 packaged regressions, including initial Beta selection and saved Stable selection after restart. Direct execution showed the window in 681 ms, 4 processes, 395 MB combined working set after 3 seconds and no TCP listeners. The final approximately 102.5 MiB installer is unsigned and exists only in generated `apps/desktop/release/`; no remote CI, tag or public release was executed for Beta preparation.

The [first remote CI run](https://github.com/ieumbird/ieumdoc/actions/runs/38190001483) passed the Windows installer/update/package job and both Editor browser shards. Its Linux quality job exposed a fixture error: the Windows `NsisUpdater` mock inherited the runner platform and requested `latest-linux.yml`/`beta-linux.yml`. The fixture now uses electron-updater's test platform option to model Windows on every runner; the actual provider, download/checksum/signature paths and assertions are unchanged. The initial unsigned Beta policy supersedes the original requirement that every public Beta be signed.

Before the unload fix, the first Saved DOM commit still prevented unload using the earlier Saving closure. The added browser regression failed on that state and passed when the guard read the current rendered busy ref. The real packaged Save→close→reopen path then completed normally. This changes no document, revision, selection/history or Save semantics. Electron test profiles retain Chromium state between runs; only app-owned test preferences/sample/logs are reset, and a failed close has a bounded cleanup that still fails the test.

Visual review used the same sample at 1440×1000 before/after the Desktop bridge, plus About at 1440×1000 and 375×812, DPR 1 / 100% zoom after fonts/images loaded. Captures are local `tmp/desktop-visual/`; only the Desktop footer was added to the sample view and About/actions fit the phone width. These are real Editor UI captures with a mock bridge, separately from packaged Windows execution.

`pnpm audit` reported 16 advisories (5 high, 10 moderate, 1 low), compared with 15 on the current baseline lockfile. The added advisory is optional build-time `sprintf-js@1.1.3` under electron-builder's download/proxy logger; it is not a runtime import or a shipped module in the bundled app. Existing Core/MyST and Editor tooling advisories remain; this work does not claim a clean security audit or change those dependencies. See the existing [MyST security follow-up](https://github.com/ieumbird/ieumdoc/issues/11).

Signing credentials are not installed by this work. SmartScreen/reputation, corporate endpoint policy, OS IME/clipboard and physical touch require their respective real environments; automated mocked feeds and clipboard events do not establish those results. Signed real GitHub delivery and signing environment/secret setup remain future work. The first unsigned Beta was published from verified CI artifacts. Before it existed, GitHub update check errors were expected and did not block editing. These preceding paragraphs preserve preparation evidence; they do not describe the current public-release state.

## References

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-builder v26 updates](https://www.electron.build/v26/docs/features/auto-update/) (the current default site documents unreleased v27 APIs; this app uses 26.15.3 / updater 6.8.9)
- [v26 release channels](https://www.electron.build/v26/docs/tutorials/release-using-channels/)
- [Paseo updates UX](https://paseo.sh/docs/updates) (reference only; staged rollouts are excluded)
