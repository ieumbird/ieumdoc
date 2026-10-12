# Verification

변경 유형별 최소 검증은 [CONTRIBUTING](../../CONTRIBUTING.md#verification-matrix)을 따른다.

## 자동 검증

저장소 루트에서 실행한다.

```bash
pnpm install --frozen-lockfile
pnpm docs:check
pnpm typecheck
pnpm test
pnpm --filter @ieumdoc/editor build
git diff --check
```

`pnpm test`는 Core, File commit, CLI, Editor, Desktop suite를 모두 실행한다. 개별 테스트 개수와 이름은 계약이 아니며 package scripts와 test runner가 source of truth다. 문서 checker 자체를 바꾸면 `pnpm exec tsx --test scripts/check-docs.test.ts`도 실행한다. Authenticode의 실제 검사는 Windows job에서 실행한다.

## Browser regression

```bash
pnpm editor                          # 별도 터미널, 개발 서버
pnpm browser:test                    # stable 전체
pnpm browser:test save-session       # 관련 시나리오만 선택
```

runner는 원본 fixture의 scratch 사본을 준비한다. 테스트 실행을 위해 `apps/editor/document/`나 `apps/editor/test/browser/fixtures/`의 원본을 직접 수정하지 않는다. fixture 자체를 바꾸는 작업이라면 의도한 변경으로 검토하고 관련 regression을 실행한다. Windows에서는 [persistent profile과 session 규칙](../contributing/windows-browser-automation.md)을 따른다. 작업 후 직접 시작한 서버와 세션을 종료한다.

## Windows Desktop regression

Windows x64에서 실행한다. `package`와 아래 tests는 공개 Release를 만들지 않는다.

```bash
pnpm --filter @ieumdoc/desktop test
pnpm --filter @ieumdoc/desktop typecheck
pnpm --filter @ieumdoc/desktop test:update
pnpm --filter @ieumdoc/desktop package
pnpm --filter @ieumdoc/desktop exec tsx scripts/verify-release.ts --tag v0.0.1-beta.2
pnpm --filter @ieumdoc/desktop test:packaged
pnpm browser:test desktop-updates
```

`test:update`는 기존 IeumDoc 설치/user data/updater cache가 있으면 거부한다. 테스트 전용 NSIS 두 버전을 로컬 feed로 설치·업데이트하고, 미저장 재시작 거부, Save 후 설치/재실행과 문서 보존, uninstall을 검증한다. 실패 시에도 자신이 설치한 프로세스와 data를 정리한다. 사용자 설치를 지워서 실행하지 않는다. 생성 경로는 `tmp/desktop-update/`와 앱의 기존 generated build/release 폴더다. 테스트 후 normal `package`를 실행해야 테스트 버전/HTTP feed가 산출물에 남지 않는다.

기본 설치·업데이트 검증은 Stable `0.0.1 → 0.0.2`다. Beta 릴리즈 회귀에서는 아래 PowerShell 명령으로 `0.0.1-beta.1 → 0.0.1-beta.2`도 검증한다. Beta feed에는 Stable Release가 없으며 최초 기본 채널, `beta.yml` 검색과 Beta 설치/재실행, 저장된 preferences·채널·사용자 데이터·Markdown 보존을 확인한다. 이후 환경 변수를 제거하고 normal `package`를 실행한다.

```powershell
$env:IEUMDOC_TEST_UPDATE_CHANNEL = 'beta'
try { pnpm --filter @ieumdoc/desktop test:update }
finally { Remove-Item Env:IEUMDOC_TEST_UPDATE_CHANNEL }
```

`test:packaged`는 production app의 문서 없는 시작과 선택한 sample, 외부 .md, Save→재실행, Figure, 합성 image paste/asset, folder/New, conflict, 종료 보호, channel 유지와 직접 실행의 시작 시간/working set/TCP listener를 검증한다. app별 고정 profile은 `tmp/desktop-e2e/profiles/`에 재사용하며 Electron 자동화는 설치형 Chrome profile을 사용하지 않는다. 직접 실행한 PID만 종료한다. OS 실제 clipboard/IME, SmartScreen 및 서명된 실제 GitHub delivery는 이 테스트의 판정 대상이 아니다.

`desktop-updates`는 mock bridge와 실제 Editor 상태로 Settings, notification, Draft/dirty/Save/Source/asset restart refusal을 검증한다. `--screenshots`로 UI 비교를 저장할 수 있다. 업데이트 버전/feed/checksum은 Desktop의 real `NsisUpdater` + mock GitHub integration에서 검증하며 동일 의미 사례를 브라우저에 반복하지 않는다.

CI의 Windows Desktop job은 위 install/update, clean package와 packaged regressions를 실행하며 aggregate required job이 그 결과도 요구한다. 수동 release workflow는 기존 tag를 검증하고 최종 artifact를 검증/업로드한다. 서명/승인 절차는 [Contributing](../../CONTRIBUTING.md#windows-desktop-builds-and-releases), 현재 계약과 검증 결과는 [Desktop distribution](../design/desktop-distribution-v1.md)에 있다.

## Real GitHub Beta update

2026-10-12 승인된 beta.2 게시 후 실제 `beta.1 → beta.2` 공개 업데이트 검증이 통과했다. 공개 바이너리와 GitHub Provider를 사용한 결과는 [릴리즈 기록](../releases/v0.0.1-beta.2.md)에 있다. 이 opt-in 검증은 두 버전의 공개 후 명시적 승인 범위에서 실행한다. 모의 Feed 성공은 이 검증의 성공이 아니다. 이미 설치된 IeumDoc이나 사용자 데이터·cache를 삭제해서 실행하지 않는다. 별도 Windows 테스트 계정/VM을 권장한다. 테스트는 기존 설치, `%APPDATA%\IeumDoc`, `%LOCALAPPDATA%\ieumdoc-updater`, 기본 설치 폴더가 하나라도 있으면 거부한다. 이 검사 후에만 테스트가 소유하는 per-user 설치와 profile/cache를 만들고 정리한다. Markdown은 `tmp/desktop-update/documents/`에만 만든다.

```powershell
pnpm --filter @ieumdoc/desktop test:update:github
```

이 opt-in 경로는 두 버전이 이미 public Prerelease인지 확인한 다음 공식 beta.1 installer를 HTTPS로 내려받아 GitHub SHA-256·metadata SHA-512·크기를 대조하고 설치한다. 테스트용 빌드나 HTTP Feed를 사용하지 않는다. 설치된 beta.1의 실제 GitHub Provider로 Beta 업데이트 확인 → 정확히 beta.2 알림 → 사용자 요청 다운로드/검증 → 일반 종료가 설치하지 않음 → IPC 실패/미저장 문서가 재시작 거부 → Save → 설치/재실행 → PE FileVersion·실행 로그·저장된 채널/preferences·user-data canary·Markdown 보존을 확인한다. 더 최신 Beta가 제공되면 beta.2 대신 설치하지 않고 실패한다. 테스트는 Release/tag/asset을 변경하는 API를 호출하지 않는다.

검증 후에도 beta.2 공개 버전 안내 갱신은 실제 게시 결과에 따라 수행한다. 서명 인증·SmartScreen reputation 검증은 이 unsigned 경로의 판정 범위가 아니다.

## Manual review

- [TEST_GUIDE](TEST_GUIDE.md): 실행 옵션, CI, OS IME·실제 앱 clipboard 등 자동화가 판정하지 않는 시나리오.
- [Visual change review](../design/editor-visual-language-v1.md#reviewing-a-visual-change): 같은 상태의 Before/After 캡처와 검토 절차.
- [Layout Rules](../design/editor-layout-rules-v1.md): 정렬·간격·control 치수 기준.
