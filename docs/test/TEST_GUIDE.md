# IeumDoc Test Guide

[검증 진입점](README.md) · [준비](#준비) · [자동 검증](#자동-검증) · [Browser regression](#browser-regression) · [CI](#ci) · [사람이 직접 볼 것](#사람이-직접-볼-것)

동작의 판정은 자동 테스트가 한다. 이 문서는 자동 검증을 실행하는 방법과, 자동화가 판정하지 않아 사람이 직접 봐야 하는 항목만 둔다.

기능별 계약은 다음에서 찾는다.

- CLI 명령과 입력 조건: `pnpm ieumdoc help`는 Start here(현재 경로/revision 조회, 단건/배치 선택, revision 보호/미리보기, 배치 경로 수명)와 모든 명령의 용도별 그룹을 표시한다. `pnpm ieumdoc help <command>`에서 옵션과 혼동하기 쉬운 명령의 선택 기준을 확인한다.
- 설계와 경계: [`docs/design/`](../design/), [`docs/adr/`](../adr/)
- 동작 근거: Core·CLI·Editor·Desktop 테스트와 `apps/editor/test/*.browser.js`; Windows package/install/update는 [검증 진입점](README.md#windows-desktop-regression)을 따른다.

## 준비

- Node.js 24 LTS (`24.21.0` 이상, 24.x)
- 루트 `package.json`의 `packageManager`에 고정된 pnpm `12.5.1`

```bash
pnpm install --frozen-lockfile
```

Windows에서 전역 pnpm shim이 실패하면 같은 버전의 `corepack pnpm`을 쓴다.

## 자동 검증

로컬에서는 [Verification matrix](../../CONTRIBUTING.md#verification-matrix)에 따라 아래 명령 중 관련 패키지 테스트·browser 시나리오를 선택한다. 전체 suite와 패키징·플랫폼별 검증의 실행 기준은 [검증 진입점](README.md)을 따른다.

```bash
pnpm docs:check
pnpm typecheck
pnpm test                                  # Core, File commit, CLI, Editor, Desktop
pnpm --filter @ieumdoc/editor build
```

필수 CI에서는 `pnpm test`가 Core, File commit, CLI, Editor, Desktop suite를 모두 통과해야 한다. 개별 테스트 개수와 이름은 계약이 아니며 package scripts와 test runner가 source of truth다.

### Browser regression

`apps/editor/test/*.browser.js`는 `pnpm browser:test`로 실행한다. runner는 공통 `openDocument` helper를 전달하며, helper는 실제 Open folder 대화상자와 Sidebar 파일 선택으로 검증용 문서를 연다. 파일 전환이 거부되는지는 각 시나리오가 판정한다.

```bash
pnpm editor                                # 필요하면 다른 터미널에서 dev server를 직접 시작
pnpm browser:test                          # stable 시나리오 전체
pnpm browser:test footnotes outline        # 이름을 준 시나리오만
pnpm browser:test --shard=1/2              # CI와 같은 분할. 로컬 전체 실행 시 두 그룹을 차례로 실행
pnpm browser:prepare                       # 수동 검토용 scratch 사본만 다시 만든다
```

- 파일을 쓰는 시나리오는 저장소의 무시되는 `tmp/<시나리오>/` scratch 사본에서만 실행한다. 원본(`apps/editor/document/`, `apps/editor/test/browser/fixtures/`)이 바뀌면 실패한다. 어떤 사본을 만드는지는 `apps/editor/test/browser/fixtures.ts`에 있다.
- stable 목록은 `apps/editor/test/browser/scenarios.ts`의 `STABLE_SCENARIOS`다.
- Playwright Test worker가 `launchPersistentContext`로 checkout별 재사용 프로필을 연다. 새 프로필 Chrome 반복 실행 금지와 cleanup은 [Windows browser automation](../contributing/windows-browser-automation.md)을 따른다.
- 같은 checkout에서 `browser:test`를 동시에 여러 개 실행하지 않는다. 다른 checkout의 dev server를 쓰려면 빈 포트에 띄우고 `IEUMDOC_BROWSER_URL`을 지정한다.
- Windows는 설치형 Chrome을 사용한다. 다른 OS에서는 처음 한 번 `pnpm exec playwright install chromium`을 실행한다.
- 기본 URL의 서버가 없으면 Playwright `webServer`가 시작/종료한다. 로컬의 기존 서버와 `IEUMDOC_BROWSER_URL` 서버는 그대로 유지한다. 실패 시 `tmp/browser-results/`에 console/pageerror와 browser-state 진단을 남긴다.
- `@playwright/cli`는 직접 디버깅용으로 유지하며 `open --persistent`를 사용한다. 정식 runner는 CLI 출력 형식을 파싱하지 않는다.

### CI

`.github/workflows/ci.yml`은 모든 pull request와 master push에서 위 검사를 실행한다. Playwright가 browser job의 dev server와 browser 수명을 관리하며 실패 진단과 서버 로그를 artifact로 보존한다. 품질 job(docs check와 checker regression, typecheck, 테스트, build), browser `--shard=1/2`·`--shard=2/2`, Windows/Linux HTTP package·browser, Windows Desktop package·자산 검증·설치/업데이트 회귀가 병렬로 돌고, aggregate 필수 check는 모두 성공했을 때만 통과한다.

## 사람이 직접 볼 것

자동화가 판정하지 않는 항목이다. 릴리스 전이나 해당 영역을 바꿨을 때 확인한다.

### Quiet Document visual review

```bash
pnpm browser:test quiet-document --screenshots      # tmp/visual-refinement/after-*.png
pnpm browser:test folder-navigation --screenshots   # tmp/picker-capture/
pnpm browser:test open-files --screenshots          # tmp/visual-refinement/: 시작 화면·폴더 메뉴
pnpm browser:test footnotes --screenshots           # tmp/visual-refinement/footnotes-*.png: 미주 구역
```

캡처에서 정렬, 간격, 겹침, 잘림, 긴 이름·수식·표의 처리를 본다. 기준은 [layout rules](../design/editor-layout-rules-v1.md)와 [visual language](../design/editor-visual-language-v1.md), 이전 근거는 [review record](../design/editor-visual-refinement-v1-review.md)다.

### 실제 환경 확인

1. **OS 한국어 IME.** 문단에서 한글을 조합·확정하고 후보창을 쓴 뒤, Backspace와 문단 경계 이동을 거쳐 Save → Reload한다. 글자 누락·중복이 없어야 한다. 자동 검사는 Chromium 조합 입력만 본다.
2. **실제 앱에서 붙여넣기.** 웹 페이지, Notion, Word에서 제목·목록·표·코드·링크가 섞인 내용을 복사해 붙여넣고 Save → Reload한다. 자동 검사는 대표 HTML을 쓴다. 정책은 [Continuous document editing](../design/document-editing-v1.md)을 따른다.
3. **이미지 붙여넣기와 이동.** 스크린샷 PNG를 붙여넣고, 파일 탐색기에서 사진(JPEG)을 끌어다 놓아 Save한 뒤, 문서와 `assets/`를 함께 다른 폴더로 옮겨 다시 연다. 이미지가 모두 보여야 한다. 자동 검사의 drop은 합성 event다.
4. **Code block 키 입력.** code block 안에서 Enter, Tab/Shift+Tab, 빈 줄 Enter 세 번으로 빠져나가기와 구문 강조 표시를 확인한다. 이 동작에는 전용 browser 시나리오가 없다.
5. **이탈 보호.** 저장하지 않은 입력이 있을 때 새로고침이나 탭 닫기를 시도하고 취소한다. 입력이 남아야 한다.
6. **실제 폴더 탐색.** `Open folder…`에서 Home, Documents, 다른 드라이브, 긴 경로를 열고, picker와 sidebar에서 새 폴더를 만들고, 문서를 오가며 편집·저장한다.
