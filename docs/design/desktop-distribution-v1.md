# Desktop distribution and updates v1

- Status: Implemented
- Last verified: 2026-10-12 (`feat/desktop-distribution`: local Windows package/install/update, Editor browser suite and checks below; no remote CI or public release executed).
- Authority: [ADR-0004](../adr/0004-desktop-host-distribution.md); document semantics and Save remain owned by [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md), [Filesystem Host](filesystem-host-boundary-v1.md) and [Editing session](editing-session-save-v1.md).
- Scope: Windows x64 per-user Electron/NSIS app, Stable/Beta updates and local/CI packaging. Public publication requires a separate explicit approval.

## Scope and completion

The Desktop Host lives in `apps/desktop`. It ships the existing Editor production build and directly imports the existing document/asset Host handlers. `ieumdoc://app` serves files and Host requests inside Electron; it starts neither Vite nor a TCP server. Core, File commit and CLI document operations do not change. There is no portable release, remote service, new autosave/recovery, cloud account or second editor state.

Completion requires the Windows installer, channel/state tests, packaged app and actual install/update regressions, the existing Core/CLI/Editor/browser checks, CI configuration and this documentation. A local unsigned package is a development artifact. Authenticode credentials, protected release environment, actual signed publication and real GitHub update delivery remain separate public-release prerequisites.

## App and Host

- App/product name: `IeumDoc`; App ID: `io.github.ieumbird.ieumdoc`; updater cache: `%LOCALAPPDATA%\ieumdoc-updater`; preferences/sample/logs: `%APPDATA%\IeumDoc`. Keep these identities stable after first publication.
- The per-user one-click NSIS installer requires no separate Node.js/pnpm/browser installation. Uninstall keeps user data. The first `.md` command-line argument opens; otherwise a writable sample is copied into user data once. Opening another argument into an already running instance and OS file association are not implemented.
- Electron main owns window lifecycle, protocol, preferences and updater. The sandboxed, isolated renderer has no Node integration; its typed preload exposes only update/settings calls and a restart check. Host/Markdown/file writes never pass through this bridge.
- IPC accepts only the app's main frame. External navigation/new windows are denied; http(s) links open in the system browser. Static paths are confined to the production build, including symlinks. CSP permits own scripts, own/inline styles needed by the editor/KaTeX, and local/data/blob images; no remote code or frames.

## Channels and versions

The first distribution version is `0.0.1-beta.1`; Stable publication is deferred. On first launch, an installed `X.Y.Z-beta.N` defaults to Beta and a Stable version defaults to Stable. A valid saved Stable/Beta choice always wins, including after installing a different version. Missing/damaged preferences or an invalid/missing channel fall back to the installed version's default. Preferences are persisted by temporary sibling/rename. Settings → About shows installed version, channel, update status/actions and a Release notes link.

| Channel | Feed and offer | Release assets |
| --- | --- | --- |
| Stable | GitHub's latest full release; only a greater stable semver is offered | `latest.yml` |
| Beta | Newest Beta or Stable; only a greater semver is offered | Beta publishes `beta.yml`; a Stable release's `latest.yml` is the provider fallback |

Tags are exactly `vX.Y.Z` or `vX.Y.Z-beta.N`; tag, app/package version and update metadata must agree. Beta Releases have `prerelease=true`; Stable Releases have `prerelease=false`. Other prerelease channels are rejected. Setting the updater channel is followed by explicit `allowPrerelease` and `allowDowngrade=false`, because the library's channel setter enables downgrades. A Beta → Stable switch keeps an installed newer Beta until a newer Stable exists.

Before the first public release, local development versions can be reset. A previously installed `0.1.0` development build cannot update down to `0.0.1-beta.1`; replace that development installation manually without weakening downgrade protection. Public Beta releases require the same signing and publication checks as Stable.

`generateUpdatesFilesForAllChannels=false` and explicit publish channels prevent a Beta from generating Stable metadata. Artifact validation refuses the other channel file. Channel changes during download/install are refused; late check results from a previous channel are ignored. A downloaded update stays ready until installation or a channel change makes it ineligible.

## Update lifecycle and work protection

- Check 15 seconds after launch, then every 6 hours; retry a failed check after 30 minutes. Manual Check for updates is immediate. Only one check is in flight; errors never block editing.
- Finding an update downloads nothing (`autoDownload=false`). Download update starts the real updater download and progress events. A verified download does not restart or install on ordinary quit (`autoInstallOnAppQuit=false`). Later persists the dismissed version; a different version may notify again. About remains available.
- Restart to update disables window input and asks the live Editor whether work is saved. Dirty document content, unapplied property/block-source drafts, Save, asset handling, Source generation and document switching refuse. Save failures/conflicts retain the unsaved content and therefore refuse too. Source is read-only and keeps the same editor state.
- Missing/malformed answers, renderer failure or a 5-second timeout refuse and re-enable the window. The existing `beforeunload` remains a second check. `quitAndInstall(true, true)` runs only after the agreed window close; a close veto returns to the downloaded state. Updates never discard or save user work implicitly.

## Verification and signing

The updater uses its own SHA-512 download verification. A public build additionally uses the public `NsisUpdater.verifyUpdateCodeSignature` hook for strict Windows Authenticode verification: status must be Valid and the publisher must match `app-update.yml`; missing tools/errors refuse the update. It repeats that check before marking the download installable, including cache reuse (6.x skips the fresh-download signature hook for a cached file). Code-signing secrets are supplied only by the release environment, never source/logs.

electron-updater 6.8.9 does not use a detached signature for `latest.yml`/`beta.yml`. Metadata is obtained over GitHub HTTPS; release permissions, version/channel/hash validation and the installer publisher signature form the trust boundary. A checksum alone does not authenticate a publisher. Local test builds intentionally use unsigned installers and a local stand-in feed; those checks do not prove signed GitHub delivery.

## Build and release procedure

Development and package/test commands, the CI jobs, signing setup and the publication boundary are documented in [Contributing](../../CONTRIBUTING.md) and [Verification](../test/README.md). Packaging removes its generated output first so test feeds, versions and old channel files cannot survive into a normal build. No build command publishes.

PR/push CI builds and tests unsigned packages. The release workflow is manual, targets an existing tag, defaults to build-only and refuses missing/mismatched tags or credentials. Publishing requires its explicit publish input and the `desktop-release` environment. It creates a new Draft, uploads verified assets, checks tag/prerelease/draft properties, then publishes; an existing Release is refused and assets are never overwritten. Failed upload leaves a Draft for review, not an active update.

## Evidence and limits

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

Before the unload fix, the first Saved DOM commit still prevented unload using the earlier Saving closure. The added browser regression failed on that state and passed when the guard read the current rendered busy ref. The real packaged Save→close→reopen path then completed normally. This changes no document, revision, selection/history or Save semantics. Electron test profiles retain Chromium state between runs; only app-owned test preferences/sample/logs are reset, and a failed close has a bounded cleanup that still fails the test.

Visual review used the same sample at 1440×1000 before/after the Desktop bridge, plus About at 1440×1000 and 375×812, DPR 1 / 100% zoom after fonts/images loaded. Captures are local `tmp/desktop-visual/`; only the Desktop footer was added to the sample view and About/actions fit the phone width. These are real Editor UI captures with a mock bridge, separately from packaged Windows execution.

`pnpm audit` reported 16 advisories (5 high, 10 moderate, 1 low), compared with 15 on the current baseline lockfile. The added advisory is optional build-time `sprintf-js@1.1.3` under electron-builder's download/proxy logger; it is not a runtime import or a shipped module in the bundled app. Existing Core/MyST and Editor tooling advisories remain; this work does not claim a clean security audit or change those dependencies. See the existing [MyST security follow-up](https://github.com/ieumbird/ieumdoc/issues/11).

Signing credentials are not installed by this work. SmartScreen/reputation, corporate endpoint policy, OS IME/clipboard and physical touch require their respective real environments; automated mocked feeds and clipboard events do not establish those results. Signed real GitHub delivery, GitHub environment/secret setup, push/tag/publication and distribution activation remain unperformed and require explicit approval. The current no-Release GitHub check error is expected and does not block editing.

## References

- [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-builder v26 updates](https://www.electron.build/v26/docs/features/auto-update/) (the current default site documents unreleased v27 APIs; this app uses 26.15.3 / updater 6.8.9)
- [v26 release channels](https://www.electron.build/v26/docs/tutorials/release-using-channels/)
- [Paseo updates UX](https://paseo.sh/docs/updates) (reference only; staged rollouts are excluded)
