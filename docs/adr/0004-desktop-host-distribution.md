# ADR-0004: Desktop Host & Distribution

- Status: Accepted
- Last verified: 2026-10-28 (unsigned v0.0.2-beta.1 release CI, anonymous asset hashes and withdrawal of v0.1.0-beta.1/v0.1.0-beta.2 Releases/assets/remote tags verified; actual GitHub 0.0.1-beta.4→0.0.2-beta.1 installation/update unverified; Stable unpublished; [record](../releases/v0.0.2-beta.1.md)).
- Authority: architectural decision under [AGENTS.md](../../AGENTS.md). Related: [ADR-0002](0002-document-persistence-semantic-ownership.md) · [Filesystem Host boundary](../design/filesystem-host-boundary-v1.md) · [Desktop distribution](../design/desktop-distribution-v1.md) · historical evidence [Desktop shell spike](../reviews/desktop-shell-spike-v1.md)
- Decision date: 2026-10-12

## Context

IeumDoc은 Vite 개발 서버의 local Host adapter로만 실행되었다. 사용자가 Node.js, pnpm, 브라우저 없이 설치하고 업데이트할 수 있는 제품 Host가 없었고, [Filesystem Host boundary](../design/filesystem-host-boundary-v1.md)는 제품 Host를 미정으로 두었다.

[Desktop shell spike](../reviews/desktop-shell-spike-v1.md)는 Editor와 Host 코드를 바꾸지 않고 Electron main의 custom protocol에서 기존 `handleDocumentRequest`/`handleAssetRequest`를 호출해 TCP 포트 없이 문서 열기·저장·asset·폴더 탐색을 할 수 있음을 보였다. 그 spike의 `portable` 단일 exe는 실행마다 약 6초와 약 840 MB의 임시 디스크를 썼고 자동 업데이트가 없었다.

제품 요구는 Windows x64 설치형 앱, 관리자 권한 없는 설치·업데이트, GitHub Releases 기반 Stable/Beta 업데이트, 사용자 승인 기반 설치와 미저장 작업 보호다.

## Decision

IeumDoc은 다음을 채택한다.

- **Desktop Host**: Electron 기반 `apps/desktop`을 Windows 제품 Host로 둔다. Editor의 production build를 그대로 싣고, custom protocol `ieumdoc://app`에서 Editor 정적 파일과 기존 `apps/editor/server`의 document/asset handler를 같은 프로세스 안에서 호출한다. TCP listener와 새 HTTP 서버를 만들지 않는다.
- **Host 코드 재사용**: `apps/editor/server`의 handler는 Vite dev server와 Desktop Host가 함께 쓰는 Host 구현이 된다. Desktop은 Vite runtime(`ssrLoadModule`)이 아니라 handler를 직접 import해 번들한다. Desktop은 별도의 문서 저장 규칙, Markdown 처리나 경로 정책을 구현하지 않는다. 문서 의미와 write contract는 계속 Core([ADR-0002](0002-document-persistence-semantic-ownership.md))가 소유하고, 파일 교체는 CLI와 같은 File commit을 쓴다.
- **배포**: electron-builder의 per-user NSIS installer(x64)를 기본 배포 형식으로 한다. Portable exe는 공식 배포하지 않는다. App ID `io.github.ieumbird.ieumdoc`, product name `IeumDoc`, 사용자 데이터 `%APPDATA%\IeumDoc`은 첫 공개 후 바꾸지 않는다.
- **업데이트**: electron-updater의 GitHub provider와 GitHub Releases를 쓴다. 채널은 Stable과 Beta 둘이며 같은 앱의 사용자 설정이다. 최초 실행 기본값은 설치 버전에 따라 Stable 또는 Beta이며, 저장된 유효한 사용자 선택을 우선한다. Stable은 GitHub의 정식 최신 Release만, Beta는 Beta와 Stable을 함께 받는다. 설치된 버전보다 낮은 버전으로는 채널을 바꿔도 내려가지 않는다.
- **설치 승인**: 업데이트 확인은 자동이지만 다운로드와 설치는 사용자가 각각 승인한다. 일반 종료는 설치 승인이 아니다. 설치를 위한 재시작은 Editor가 미저장 작업이 없다고 답하고 창이 정상적으로 닫힌 뒤에만 시작한다.
- **릴리즈**: GitHub Actions가 Windows에서 빌드·검증한다. Beta는 검증된 unsigned installer를 신뢰할 수 있는 master 이력의 기존 `vX.Y.Z-beta.N` tag에 GitHub Prerelease로 게시할 수 있다. 소유자가 승인한 릴리스는 master에서 workflow를 수동 실행하며, 검증 성공 후 별도 environment 승인 없이 게시한다(2026-10-28 소유자 결정; 종전 required reviewer 승인 단계를 대체). `master` 배포 제한은 유지한다. 서명되지 않았고 Windows 경고가 나타날 수 있음을 알린다. Stable 공개와 Signed 모드는 Authenticode 서명을 요구한다. 게시 권한과 실제 환경 보호 규칙은 [Desktop contract](../design/desktop-distribution-v1.md)를 따른다.

## Rationale

Spike는 custom protocol로 Editor와 Host 코드를 고치지 않고 감쌀 수 있음을 실제 실행으로 보였다. 이를 쓰면 localhost 서버의 노출(다른 로컬 프로세스, DNS rebinding, 보안 제품의 localhost 차단)이 없고, Editor·CLI·dev server와 같은 Host 코드와 Core 저장 계약을 유지한다.

설치형 per-user NSIS는 spike의 portable 비용(매 실행 압축 해제)을 없애고, 관리자 권한 없이 설치와 업데이트를 할 수 있으며, electron-updater가 지원하는 Windows 업데이트 형식이다. GitHub Releases는 저장소와 같은 곳에서 버전·릴리즈 노트·자산을 관리하고 별도 업데이트 서버나 데이터베이스가 필요 없다.

electron-updater의 GitHub provider는 Stable에서 GitHub의 `releases/latest`를, Beta에서 Release feed의 semver tag를 사용한다. 따라서 Git tag의 semver prerelease, GitHub Release의 `prerelease` 속성과 업데이트 메타데이터(`latest.yml`, `beta.yml`)가 서로 일치해야 하며, 릴리즈 workflow가 이를 검사한다.

## Consequences

- `apps/editor/server`는 더 이상 개발 전용 adapter가 아니다. 변경은 Vite dev server와 Desktop Host 모두에서 동작해야 하며, Vite 전용 기능에 의존할 수 없다.
- Electron과 Chromium의 보안 업데이트를 따라 주기적으로 다시 빌드·배포해야 한다.
- 서명된 릴리즈에는 코드 서명 인증서와 GitHub Actions secret이 필요하다. Beta는 이 준비 없이 unsigned installer로 공개할 수 있으며, 배포자 서명 검증을 제공한다고 주장하지 않는다. Windows 경고·실행 차단 정책과 파일의 서명 상태를 구분하여 알린다.
- Desktop 전용 UI(Settings → About, 업데이트 알림)는 Desktop bridge가 있을 때만 나타나며, 브라우저 Editor의 화면과 동작은 바뀌지 않는다.
- 첫 문서는 명령줄의 `.md` 또는 `.txt` 인자가 있을 때만 (#817 텍스트 모드) 바로 연다. 인자가 없으면 문서 없이 시작하며, 폴더를 선택하고 Sidebar에서 파일을 고르거나 사용자 요청으로 sample 사본을 연다([시작 계약](../design/editor-ux-shell-v1.md#start-without-a-document-174), #174/#190). sample 자동 열기 설명은 #174 이전 동작이 남은 문서 drift이므로 현행 계약에 맞춘다. Workspace, recent document, 파일 연결(file association)은 이 결정에 포함하지 않는다.

## Amendment: optional Windows CLI integration (#604, 2026-10-27)

The owner approved shipping the existing `packages/cli` build with Desktop. Settings offers an
explicit, initially disabled command-line integration. Its per-user `ieumdoc.cmd` runs the installed
`IeumDoc.exe` with `ELECTRON_RUN_AS_NODE=1`; commands, arguments, JSON output, exit codes and `serve`
remain the existing CLI's responsibility. The independent Node.js CLI/HTTP distribution remains.

The CLI build's Editor assets are the single packaged copy used by both Desktop and `serve`.
The shim lives in `%LOCALAPPDATA%\IeumDoc\bin`, outside the installation tree replaced by updates.
An owned directory junction references the fixed application installation folder, avoiding literal
Unicode installation paths in batch source and any console-code-page change. No version-specific
path is embedded. Enabling adds only this bin directory to the user's PATH; disabling and actual
uninstall remove it. Installation and update never opt the user in. Existing foreign commands and
files are not overwritten; broken registrations can be repaired or disabled.

Disabling removes our bin's PATH entries even when ownership records are damaged, leaving
unverifiable files untouched and reporting them. Optional CLI cleanup must never block app
uninstallation, including silent `/S` removal: NSIS records failures, remaining paths and manual
cleanup instructions, warns interactive users, and continues removing the app. Updates still skip
cleanup. A valid record owned by another installation remains protected.

The owner's #629 cleanup clarification (2026-10-28) removes the bin directory nonrecursively
after its owned files/junction have been removed, only if it is empty. User files and subdirectories
keep a nonempty bin in place without a cleanup error. The parent `%LOCALAPPDATA%\IeumDoc` is
preserved because its creation is not ownership-tracked and it also holds uninstall diagnostics;
CLI cleanup does not extend to application user data, updater cache or the installation directory.

Registry scripts receive values through stdin, separate from fixed executable code, so long PATH
values do not consume the Windows argv limit. Before writing, the helper checks for a stale
snapshot; this is not an atomic compare-and-set against concurrent external writers.

Electron's RunAsNode fuse stays enabled (its current default). This explicitly accepts the cost
that the installed, potentially signed executable can execute arbitrary JavaScript under the
user's authority, as with VS Code `code` and Paseo. It is not a trust boundary for scripts. No other
fuse setting changes. See [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses).

Completion requires the [Desktop integration contract](../design/desktop-distribution-v1.md#optional-command-line-tools-604),
isolated PATH/ownership tests, Settings browser coverage and Windows CI package/install/update/
uninstall checks. CI measures the packaged runtime's Node version against the bundled CLI engines
range and compares existing CLI commands through the shim with standalone Node execution.
The owner's additional decision adds a common `--version` option: build-injected product/package
version and commit identify the executable distribution without runtime manifest reads. Real-user
Windows acceptance remains explicitly separate from CI.

## Non-decisions

- macOS/Linux installer, Microsoft Store, portable 공식 배포
- 독립 HTTP 서버와 원격 접속은 이 Desktop 결정 밖이며, 후속 [ADR-0005](0005-http-host.md)에서 별도 채택했다. 계정·클라우드 동기화는 계속 범위 밖이다.
- 점진적(staged) 배포, 업데이트 전용 서버나 데이터베이스
- 자동 저장과 draft recovery(결정 당시 [Editing session](../design/editing-session-save-v1.md)의 결정을 유지. 이후 방향은 [ADR-0007](0007-editing-session-lifetime.md)이 정한다)
- 특정 서명 방식(인증서 파일 또는 클라우드 서명 서비스)의 선택

## Revisit Conditions

- Windows 외 플랫폼 배포가 필요해지는 경우
- GitHub Releases나 electron-updater가 Stable/Beta 분리, 서명 검증 또는 per-user 설치를 더 이상 지원하지 못하는 경우
- Host를 Electron이 아닌 다른 native host나 원격 서비스로 바꿔야 하는 구체적인 요구가 생기는 경우
