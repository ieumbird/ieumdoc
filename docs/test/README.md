# Verification

변경 유형별 로컬 최소 검증과 CI에 맡길 범위는 [CONTRIBUTING](../../CONTRIBUTING.md#verification-matrix)을 따른다. 관련 패키지 테스트·browser 시나리오 지정 실행을 우선하며, 영향 범위가 여러 계층에 걸치는 경우가 아니면 전체 `pnpm test`·전체 `pnpm browser:test`는 로컬 필수가 아니다. PR의 필수 CI 통과와 실제 Save → Reload·Visual Before/After 등 고유 위험 검증은 유지한다.

## 자동 검증

저장소 루트에서 변경 유형에 필요한 명령을 선택한다. 패키지 선택 실행은 예를 들어 `pnpm --filter @ieumdoc/core test`를 사용한다.

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

## Production HTTP regression

로컬에서는 관련 HTTP boundary tests와 아래 HTTP browser 시나리오를 실행한다. CLI 패키징·배포 경계를 바꿀 때 `package`·`test:packaged`도 로컬 실행하며, 그 외에는 필수 Windows/Linux HTTP CI에 맡긴다.

```bash
pnpm --filter @ieumdoc/cli build
pnpm browser:test http-host
# CLI 패키징·배포 경계 변경 시 추가 실행
pnpm --filter @ieumdoc/cli package
pnpm --filter @ieumdoc/cli test:packaged
```

The archive test installs outside the checkout with no runtime dependencies and runs Node-only CLI/serve, real writes, port conflict and shutdown. The separate HTTP browser scenario starts the built Host with two scratch roots and verifies real Save/Reload, New file/folder, images, dirty/draft guards, revision conflict and SVG script blocking. Do not combine it with Vite scenarios. Windows uses the existing persistent browser profile. `--screenshots` saves optional wide/narrow manual captures under `tmp/http-host-capture/`.

HTTP boundary tests are included in `pnpm test`; targeted command: `pnpm --filter @ieumdoc/editor exec tsx --test test/http-host.test.ts`. When the HTTP job is selected, CI requires the archive and HTTP browser paths on Windows and Linux. PR path selection and full checks on master pushes follow the [Verification matrix](../../CONTRIBUTING.md#verification-matrix), with [ci.yml](../../.github/workflows/ci.yml) as the path-rule source of truth. See [HTTP contract](../design/http-host-v1.md) for scope and deployment limitations.

## Windows Desktop regression

Windows x64에서 아래 명령 중 변경 영역의 tests/typecheck·browser 회귀를 선택한다. 패키징·설치/업데이트·배포 경계 변경 시 관련 `test:update`·`package`·release 자산 검증·`test:packaged`도 로컬 실행하며, 그 외에는 필수 Windows Desktop CI에 맡긴다. `package`와 아래 tests는 공개 Release를 만들지 않는다.

```bash
pnpm --filter @ieumdoc/desktop test
pnpm --filter @ieumdoc/desktop typecheck
pnpm --filter @ieumdoc/desktop test:update
pnpm --filter @ieumdoc/desktop package
pnpm --filter @ieumdoc/desktop exec tsx scripts/verify-release.ts --tag v0.0.1-beta.4
pnpm --filter @ieumdoc/desktop test:packaged
pnpm browser:test desktop-updates
```

`test:update`는 기존 IeumDoc 설치/user data/updater cache가 있으면 거부한다. 테스트 전용 NSIS 두 버전을 로컬 feed로 설치·업데이트하고, 미저장 재시작 거부, Save 후 설치/재실행과 문서 보존, uninstall을 검증한다. 실패 시에도 자신이 설치한 프로세스와 data를 정리한다. 사용자 설치를 지워서 실행하지 않는다. 생성 경로는 `tmp/desktop-update/`와 앱의 기존 generated build/release 폴더다. 테스트 후 normal `package`를 실행해야 테스트 버전/HTTP feed가 산출물에 남지 않는다.

기본 설치·업데이트 검증은 Stable `0.0.1 → 0.0.2`다. Beta 릴리즈 회귀에서는 아래 PowerShell 명령으로 `0.0.1-beta.3 → 0.0.1-beta.4`도 검증한다. Beta feed에는 Stable Release가 없으며 최초 기본 채널, `beta.yml` 검색과 Beta 설치/재실행, 저장된 preferences·채널·사용자 데이터·Markdown 보존을 확인한다. 이후 환경 변수를 제거하고 normal `package`를 실행한다.

```powershell
$env:IEUMDOC_TEST_UPDATE_CHANNEL = 'beta'
try { pnpm --filter @ieumdoc/desktop test:update }
finally { Remove-Item Env:IEUMDOC_TEST_UPDATE_CHANNEL }
```

`test:packaged`는 production app의 문서 없는 시작과 선택한 sample, 외부 .md, Save→재실행, Figure, 합성 image paste/asset, folder/New, conflict, 종료 보호, channel 유지와 직접 실행의 시작 시간/working set/TCP listener를 검증한다. app별 고정 profile은 `tmp/desktop-e2e/profiles/`에 재사용하며 Electron 자동화는 설치형 Chrome profile을 사용하지 않는다. 직접 실행한 PID만 종료한다. OS 실제 clipboard/IME, SmartScreen 및 서명된 실제 GitHub delivery는 이 테스트의 판정 대상이 아니다.

`open-files`는 시작 화면 → 폴더 → Sidebar 파일 선택, 최근 폴더와 명시적 sample, 미저장 확인의 Save 성공 후 전환·Save 실패/충돌 보존·Don't save의 쓰기 없는 전환·Cancel/Escape와 focus 복귀·draft 손실 안내, Save 진행 중 전환 거부를 검증한다. `new-document`와 `folder-navigation`은 폴더 `+`의 같은 확인과 기존 New 흐름을 검증한다. `source-view-pending`은 Source 처리 중 Sidebar의 다른 파일을 선택해도 현재 문서가 유지됨을 확인한다. `open-files --screenshots`는 시작 화면과 폴더 메뉴, 1440/375px 미저장 확인창(draft 유무)의 수동 검토용 캡처를 `tmp/` 아래 저장한다.

`editor-shell`은 Files/Display 전환·접힌 도구에서 다시 열기·키보드 포커스·편집기/selection/history/draft 보존과 File actions → Reload 취소를 검증한다. `folder-navigation`은 도구 전환 전후 트리 펼침·스크롤·키보드 위치와 여러 폴더 추가·새로고침 후 순서 복원·폴더별 닫기를, `outline`은 Display의 제목 번호 변경·Undo/Redo·실제 Save/Reload를 검증한다. `layout-rules`는 Display의 너비 설정이 문서를 바꾸지 않는지와 로컬 유지, 1920/1440/1280/1024/768/375px의 표시 설정·접기·재진입을 확인한다. 문서 없음·저장 진행·Source에서의 설정 제한은 해당 기존 시나리오에서 확인한다. `quiet-document --screenshots`는 기존 동일 상태 비교와 Display 화면을 함께 촬영한다.

`ui-language`는 한국어·영어 전환 시 같은 편집기·탭·selection·미저장 내용·속성 초안 보존, Undo/Redo, 표시 중인 오류의 언어 전환, 한국어 UI에서 실제 Save → Reload 및 페이지 재실행 후 언어 설정 유지를 검사한다. `pnpm browser:test ui-language --screenshots`는 동일한 Settings의 영어/한국어 및 375px 한국어 화면을 `tmp/256/`에 저장한다. 기존 영어 시나리오는 재사용 profile의 브라우저 locale을 `en-US`로 고정하며, 언어 시나리오는 종료 시 영어 preference를 복원한다. 초기 언어 정책·저장 실패·번역 키/매개변수·복수형·양 언어 명령 검색은 Editor 테스트에서 검증한다.

`footnotes`는 본문 중간에 정의를 쓴 파일을 열어도 디스크·dirty 상태가 바뀌지 않고 안내가 표시되는지, Source와 첫 Save·반복 Save·Reload가 같은 정규화 결과(본문 뒤 첫 참조 순서)를 쓰는지, 단일 미주 구역과 번호, 실제 사용한 참조로 복귀, 미주 핸들(드래그·삽입 없음)과 본문 드롭, 참조 순서 변경의 Undo/Redo, Section 삭제·이동, 원문 초안 보존, Enter/Undo와 Source 복사를 검증한다. `footnotes --screenshots`는 1440/768/375px의 수동 비교용 캡처를 `tmp/visual-refinement/footnotes-*.png`에 저장한다. 저장 문법은 MyST footnote를 유지한다.

`citations`는 세 명시적 role과 bibliography 선언이 있는 문서에서 실제 타이핑·인용 잘라내기/붙여넣기·Undo/Redo·번호 갱신·Save/Reload·반복 Save와 한국어/영어 상태 표시를 검증한다. `.bib` 요청이 없는지도 확인한다. 의미·경로 거부 규칙은 Core 테스트가 담당한다. `citations --screenshots`는 1440/375px 수동 검토 자료를 추가하며, 현재 계약과 대표 캡처는 [Citations](../design/citations-v1.md)에 있다. `citation-authoring`은 공통 폴더에서 연 문서에서 슬래시 검색 삽입, 인용 폼의 role·키 그룹·잘못된 키 거부·목록에 없는 키, Escape 취소·Apply·Remove, Undo/Redo, Save → Reload와 `.bib` 바이트 불변을 검증한다.

`desktop-updates`는 mock bridge와 실제 Editor 상태로 Settings, notification, Draft/dirty/Save/Source/asset restart refusal을 검증한다. 키보드로 Settings를 열면 첫 언어 컨트롤의 실제 포커스를 기다린다. 대화상자 표시만으로 Base UI의 비동기 초기 포커스 완료를 가정하지 않으며, 검사에서 포커스를 강제로 이동하지 않는다. 포커스가 오지 않으면 5초 안에 실패한다(#342). `--screenshots`로 UI 비교를 저장할 수 있다. 업데이트 버전/feed/checksum은 Desktop의 real `NsisUpdater` + mock GitHub integration에서 검증하며 동일 의미 사례를 브라우저에 반복하지 않는다.

CI의 Windows Desktop job이 선택되면 clean package·release 자산 검증·packaged regressions는 항상 실행하고 install/update 단계만 경로 규칙의 `update` 출력에 따라 실행한다. PR에서는 경로별로 job을 선택하며, master push와 미분류 경로 변경은 전체 검증한다. aggregate required job의 성공·skipped·취소 판정과 경로 요약은 [Verification matrix](../../CONTRIBUTING.md#verification-matrix), 실제 규칙은 [ci.yml](../../.github/workflows/ci.yml)을 따른다. 수동 release workflow는 기존 tag를 검증하고 최종 artifact를 검증/업로드한다. 서명/승인 절차는 [Contributing](../../CONTRIBUTING.md#windows-desktop-builds-and-releases), 현재 계약과 검증 결과는 [Desktop distribution](../design/desktop-distribution-v1.md)에 있다.

## Real GitHub Beta update

2026-10-15 beta.4 게시 후 실제 `beta.3 → beta.4` 공개 업데이트도 통과했다. 공개 자산과 설치·재실행·문서/설정 보존 결과는 [beta.4 릴리즈 기록](../releases/v0.0.1-beta.4.md)에 있다. 아래 명령의 현재 대상은 beta.3→beta.4이다. 공개 beta.3은 네이티브 문서 이전 버전이라 앞쪽 Frontmatter를 본문 블록처럼 편집하므로, 이 경로에서만 표식 없는 Markdown으로 저장·보존을 확인한다.

2026-10-14 beta.3 게시 후 실제 `beta.2 → beta.3` 공개 업데이트도 통과했다([beta.3 릴리즈 기록](../releases/v0.0.1-beta.3.md)).

2026-10-12 승인된 beta.2 게시 후 실제 `beta.1 → beta.2` 공개 업데이트 검증이 통과했다. 공개 바이너리와 GitHub Provider를 사용한 결과는 [릴리즈 기록](../releases/v0.0.1-beta.2.md)에 있다. 이 opt-in 검증은 두 버전의 공개 후 명시적 승인 범위에서 실행한다. 모의 Feed 성공은 이 검증의 성공이 아니다. 이미 설치된 IeumDoc이나 사용자 데이터·cache를 삭제해서 실행하지 않는다. 별도 Windows 테스트 계정/VM을 권장한다. 테스트는 기존 설치, `%APPDATA%\IeumDoc`, `%LOCALAPPDATA%\ieumdoc-updater`, 기본 설치 폴더가 하나라도 있으면 거부한다. 이 검사 후에만 테스트가 소유하는 per-user 설치와 profile/cache를 만들고 정리한다. Markdown은 `tmp/desktop-update/documents/`에만 만든다.

```powershell
pnpm --filter @ieumdoc/desktop test:update:github
```

이 opt-in 경로는 두 버전이 이미 public Prerelease인지 확인한 다음 공식 beta.3 installer를 HTTPS로 내려받아 GitHub SHA-256·metadata SHA-512·크기를 대조하고 설치한다. 테스트용 빌드나 HTTP Feed를 사용하지 않는다. 설치된 beta.3의 실제 GitHub Provider로 Beta 업데이트 확인 → 정확히 beta.4 알림 → 사용자 요청 다운로드/검증 → 일반 종료가 설치하지 않음 → IPC 실패/미저장 문서가 재시작 거부 → Save → 설치/재실행 → PE FileVersion·실행 로그·저장된 채널/preferences·user-data canary·Markdown 보존을 확인한다. 더 최신 Beta가 제공되면 beta.4 대신 설치하지 않고 실패한다. 테스트는 Release/tag/asset을 변경하는 API를 호출하지 않는다.

공개 버전 안내는 실제 게시 결과를 확인한 뒤 갱신한다. 서명 인증·SmartScreen reputation 검증은 이 unsigned 경로의 판정 범위가 아니다.

## Manual review

- [TEST_GUIDE](TEST_GUIDE.md): 실행 옵션, CI, OS IME·실제 앱 clipboard 등 자동화가 판정하지 않는 시나리오.
- [Visual change review](../design/editor-visual-language-v1.md#reviewing-a-visual-change): 같은 상태의 Before/After 캡처와 검토 절차.
- [Layout Rules](../design/editor-layout-rules-v1.md): 정렬·간격·control 치수 기준.

## Native document boundary

Success fixtures contain `ieumdoc: 1` and supported content. Core owns syntax/support rejection. CLI tests cover exclusive create, failed text/JSON check and unchanged bytes. Host tests cover refused files and Save revalidation. `pnpm browser:test writeability-preflight` covers native admission errors and retained document, selection, unsaved content and property drafts. `new-document`, `source-view`, `outline` and `property-drafts` retain their interface checks. Block-source and partial read-only scenarios have been removed. Production HTTP and packaged Desktop use the same Core admission.

## Local recovery regression

`pnpm browser:test recovery-storage recovery recovery-structure` checks actual IndexedDB ordering/deletion barriers and the user recovery flow with real Vite files. `recovery-structure` adds New/title/Enter, Equation/Table/Figure content and captions, dirty Restore → Save → Reload, readable fallback and live Korean/English refusal reasons. `pnpm browser:test recovery --screenshots` combines those UI assertions with 1440/375px captures of empty/list/prompt/settings/clear/failure/incompatible states in `tmp/296/`; `pnpm browser:test recovery-structure --screenshots` captures the structured recovery/fallback in `tmp/331-*.png`. The snapshot initialization/Save replay semantics remain covered by `document-session` and Editor tests; they are not repeated as a Host semantic matrix.

For #296 PR3, after the builds described above:

```bash
pnpm browser:test http-host
pnpm --filter @ieumdoc/desktop test:packaged
```

The HTTP command includes `http-recovery.spec.ts`: actual browser process termination and a new
PID using the same persistent checkout profile and origin, while the production server stays
running. New title/Enter, Equation/Table/Figure and caption content are recorded before the first crash.
Two crashes cover Restore → Save/Reload and external disk modification before Restore
→ Save 409 without overwrite. Use the runner-owned local Host for this scratch-file test; do not
point it at a remote/user server. Windows uses Chrome; Linux uses Playwright Chromium in CI.

Desktop's cohesive recovery test kills only its owned packaged app tree, restarts at
`ieumdoc://app` with the same `userData`/`sessionData`, restores applied text and a pending Figure,
and verifies real Save/Reload. A subsequent normal `BrowserWindow.close()` exercises the native
close guard, with the existing dialog-answer seam choosing **Close without saving**, then verifies
retained work and external conflict after restart. This is actual app lifecycle/storage/Host
execution with a stubbed native dialog answer, not an OS dialog-click test. Each test's initial
launch clears only its own recovery DB; subsequent launches in that test preserve it. Profiles
are retained across suite runs. This also prevents previous close tests' records from intercepting
the next run with a recovery prompt.

Both flows inspect the expected committed record before terminating; a 500ms sleep would not
establish recording. Only the last successful record is protected. Later input, OS/power loss,
profile removal and another origin/device are outside that proof. The prior final-v3 two-page
ticket p95 around 2.4s remains a limitation, not a recording deadline.

2026-10-16 local execution established Windows x64 packaged Desktop and production HTTP/Chrome.
Required CI (including Linux HTTP) remains necessary before issue closure; no installer/update,
publication or other-platform completion is implied. Compact machine-readable evidence records
process IDs/profile/origin and assertions in `tmp/desktop-e2e/recovery-proof.json` and the HTTP
test's `tmp/browser-results/http-recovery-*/host-recovery-proof.json` (also attached to the test).
