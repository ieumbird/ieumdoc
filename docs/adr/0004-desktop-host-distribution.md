# ADR-0004: Desktop Host & Distribution

- Status: Accepted
- Last verified: 2026-10-12 (decision recorded with the first `apps/desktop` implementation; no public release published).
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
- **업데이트**: electron-updater의 GitHub provider와 GitHub Releases를 쓴다. 채널은 Stable(기본)과 Beta 둘이며 같은 앱의 사용자 설정이다. Stable은 GitHub의 정식 최신 Release만, Beta는 Beta와 Stable을 함께 받는다. 설치된 버전보다 낮은 버전으로는 채널을 바꿔도 내려가지 않는다.
- **설치 승인**: 업데이트 확인은 자동이지만 다운로드와 설치는 사용자가 각각 승인한다. 일반 종료는 설치 승인이 아니다. 설치를 위한 재시작은 Editor가 미저장 작업이 없다고 답하고 창이 정상적으로 닫힌 뒤에만 시작한다.
- **릴리즈**: GitHub Actions가 Windows에서 빌드·검증하고, 명시적으로 승인된 수동 실행만 기존 Git tag의 Release를 게시한다. 공개 릴리즈는 Authenticode 서명을 요구한다.

## Rationale

Spike는 custom protocol로 Editor와 Host 코드를 고치지 않고 감쌀 수 있음을 실제 실행으로 보였다. 이를 쓰면 localhost 서버의 노출(다른 로컬 프로세스, DNS rebinding, 보안 제품의 localhost 차단)이 없고, Editor·CLI·dev server와 같은 Host 코드와 Core 저장 계약을 유지한다.

설치형 per-user NSIS는 spike의 portable 비용(매 실행 압축 해제)을 없애고, 관리자 권한 없이 설치와 업데이트를 할 수 있으며, electron-updater가 지원하는 Windows 업데이트 형식이다. GitHub Releases는 저장소와 같은 곳에서 버전·릴리즈 노트·자산을 관리하고 별도 업데이트 서버나 데이터베이스가 필요 없다.

electron-updater의 GitHub provider는 Stable에서 GitHub의 `releases/latest`를, Beta에서 Release feed의 semver tag를 사용한다. 따라서 Git tag의 semver prerelease, GitHub Release의 `prerelease` 속성과 업데이트 메타데이터(`latest.yml`, `beta.yml`)가 서로 일치해야 하며, 릴리즈 workflow가 이를 검사한다.

## Consequences

- `apps/editor/server`는 더 이상 개발 전용 adapter가 아니다. 변경은 Vite dev server와 Desktop Host 모두에서 동작해야 하며, Vite 전용 기능에 의존할 수 없다.
- Electron과 Chromium의 보안 업데이트를 따라 주기적으로 다시 빌드·배포해야 한다.
- 공개 릴리즈에는 코드 서명 인증서와 GitHub Actions secret, 그리고 Release 게시 승인 절차가 필요하다. 서명되지 않은 빌드는 개발·검증용이며 공개 배포 완료로 보지 않는다.
- Desktop 전용 UI(Settings → About, 업데이트 알림)는 Desktop bridge가 있을 때만 나타나며, 브라우저 Editor의 화면과 동작은 바뀌지 않는다.
- 첫 문서는 명령줄의 `.md` 인자이거나, 없으면 사용자 데이터의 sample 사본이다. Workspace, recent document, 파일 연결(file association)은 이 결정에 포함하지 않는다.

## Non-decisions

- macOS/Linux installer, Microsoft Store, portable 공식 배포
- 독립 HTTP 서버(`ieumdoc serve`), 원격 접속, 계정·클라우드 동기화
- 점진적(staged) 배포, 업데이트 전용 서버나 데이터베이스
- 자동 저장과 draft recovery([Editing session](../design/editing-session-save-v1.md)의 결정을 유지)
- 특정 서명 방식(인증서 파일 또는 클라우드 서명 서비스)의 선택

## Revisit Conditions

- Windows 외 플랫폼 배포가 필요해지는 경우
- GitHub Releases나 electron-updater가 Stable/Beta 분리, 서명 검증 또는 per-user 설치를 더 이상 지원하지 못하는 경우
- Host를 Electron이 아닌 다른 native host나 원격 서비스로 바꿔야 하는 구체적인 요구가 생기는 경우
