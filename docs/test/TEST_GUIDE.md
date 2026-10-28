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

전체 quality CI에서는 `pnpm test`가 Core, File commit, CLI, Editor, Desktop suite를 모두 통과해야 한다. 문서 전용 PR은 아래 [CI](#ci)의 문서·정책 검사만 실행한다. 개별 테스트 개수와 이름은 계약이 아니며 package scripts와 test runner가 source of truth다.

### Browser regression

`apps/editor/test/*.browser.js`는 `pnpm browser:test`로 실행한다. runner는 공통 `openDocument` helper를 전달하며, helper는 실제 Open folder 대화상자와 Sidebar 파일 선택으로 검증용 문서를 연다. 파일 전환이 거부되는지는 각 시나리오가 판정한다.

`openDocument`의 클릭 완료는 비동기 Open 완료가 아니다. 성공을 기대하는 시나리오는 대상 경로가 활성화되고 상태가 Ready가 된 뒤 활성 문서의 요소를 조작한다. 이전 탭은 숨겨진 채 계속 마운트되므로, 전환 전에 얻은 요소를 대상으로 한 action은 숨겨진 이전 요소를 계속 기다릴 수 있다. 실패를 기대하는 Open은 해당 오류를 기다린다. 타임아웃 뒤 페이지에서 `evaluate`하는 정리 코드는 최초 실패를 가릴 수 있으므로, 실패 시 페이지·route 정리는 runner fixture의 page close에 맡기고 지연 응답만 해제한다.

```bash
pnpm editor                                # 필요하면 다른 터미널에서 dev server를 직접 시작
pnpm browser:test                          # stable 시나리오 전체
pnpm browser:test footnotes outline        # 이름을 준 시나리오만
pnpm browser:test --shard=1/4              # CI와 같은 분할. 로컬 전체 실행 시 네 그룹을 차례로 실행
pnpm browser:prepare                       # 수동 검토용 scratch 사본만 다시 만든다
```

- 파일을 쓰는 시나리오는 저장소의 무시되는 `tmp/<시나리오>/` scratch 사본에서만 실행한다. 원본(`apps/editor/document/`, `apps/editor/test/browser/fixtures/`)이 바뀌면 실패한다. 어떤 사본을 만드는지는 `apps/editor/test/browser/fixtures.ts`에 있다.
- stable 목록은 `apps/editor/test/browser/scenarios.ts`의 `STABLE_SCENARIOS`다.
- Playwright Test worker가 `launchPersistentContext`로 checkout별 재사용 프로필을 연다. 새 프로필 Chrome 반복 실행 금지와 cleanup은 [Windows browser automation](../contributing/windows-browser-automation.md)을 따른다.
- 같은 checkout에서 `browser:test`를 동시에 여러 개 실행하지 않는다. 다른 checkout의 dev server를 쓰려면 빈 포트에 띄우고 `IEUMDOC_BROWSER_URL`을 지정한다.
- Windows는 설치형 Chrome을 사용한다. 다른 OS의 로컬 실행에서는 처음 한 번 `pnpm exec playwright install chromium`을 실행한다. Linux CI는 [CONTRIBUTING의 컨테이너 설정](../../CONTRIBUTING.md#verification-matrix)에 따라 공식 Noble 이미지를 OS 의존성에만 사용하고, 고정 alpha Chromium을 별도 캐시에 설치한다(`--with-deps` 없음, 설치 제한 2분).
- 기본 URL의 서버가 없으면 Playwright `webServer`가 시작/종료한다. 로컬의 기존 서버와 `IEUMDOC_BROWSER_URL` 서버는 그대로 유지한다.
- `@playwright/cli`는 직접 디버깅용으로 유지하며 `open --persistent`를 사용한다. 정식 runner는 CLI 출력 형식을 파싱하지 않는다.

### CI

CI 선택·필수 성공 조건은 [CONTRIBUTING Verification matrix](../../CONTRIBUTING.md#verification-matrix)와 [ci.yml](../../.github/workflows/ci.yml)을 따른다. quality는 항상 실행하고, PR의 추가 job은 변경 경로에 따라 선택한다. 선택된 job은 성공해야 하며 미선택 job만 skipped를 허용한다. master push는 전체 실행하고, Desktop 설치·업데이트 단계는 별도 `update` 선택 조건을 따른다.

문서 전용 PR의 quality는 문서/checker tests·diff/whitespace·issue 정책·AI provenance·CI 경로 분류 회귀를 실행하고 제품 단위 테스트·typecheck·Editor build를 생략한다. 제품·미분류 경로가 섞이거나 master push이면 전체 quality를 실행한다. [경로 분류 테스트](../../scripts/ci-quality-mode.test.mjs)가 docs-only probe를 포함한다. browser가 선택되면 4개 shard의 stable 시나리오 합집합이 전체 목록과 같고 중복이 없어야 한다. 배정은 runner 로그와 기존 browser-fixtures 테스트로 확인한다.

Playwright가 browser job의 dev server와 browser 수명을 관리하며 실패 진단과 서버 로그를 artifact로 보존한다.

#### 실패 진단 (#411, #423)

`scenarios.spec.ts`는 재사용 persistent context에서 시나리오마다 tracing을 시작하고, 실패 시에만 `tmp/browser-results/scenarios-<이름>/trace.zip`으로 보존한다. 성공 시 trace는 버린다. 성공 실행의 비용을 줄이기 위해 trace는 action·API 로그·console·source를 기록한다. 매 action의 DOM/network snapshot과 연속 스크린샷 filmstrip은 기록하지 않는다. 실패 시점의 접근성 snapshot·PNG·focus/selection은 아래 파일로 별도 보존한다. timeout·재시도·판정 기준은 바꾸지 않는다. Playwright 기본 context/page fixture가 아닌 이 fixture가 페이지를 닫기 전에 아래 파일을 직접 저장한다.

- `browser-state.json`: 브라우저 페이지 URL, 문서 탭과 활성 탭, focus 요소, DOM/ProseMirror selection, 메뉴·dialog·status. 닫힌 페이지 등 수집 실패도 기록한다.
- `input-events.json`: 실패 직전 현재 페이지의 최근 400개 이벤트(고정 크기 링 버퍼). 각 항목의 `timestamp`(UTC), `elapsedMs`(페이지 시작 이후), `sequence` 순으로 키 입력 당시 상태와 이후 변화를 대조한다. `keydown`/`keyup`에는 대상 tag/testId/role/label, 원래 key/code, modifier·repeat·composing을, `focusin`/`focusout`에는 previous/next 요소를 기록한다. 모든 항목은 당시 activeElement, DOM selection의 anchor/focus 노드·offset·텍스트 길이와 활성 Editor의 selection(from/to/type), focus, undoDepth/redoDepth를 포함한다. `transaction`에는 발생시킨 Editor와 docChanged 및 해당 transaction selection도 있다. `editor-attached`와 Editor별 id/tab/active로 여러 문서 탭과 재생성된 인스턴스를 구분한다. 활성 탭 외 Editor의 transaction도 구독한다.
- `error-context.md`, `test-failed.png`: 실패 메시지와 접근성 snapshot, 실패 시점 viewport. 캡처 중 실패는 `diagnostic-errors.json`에 기록하며 최초 테스트 오류를 대체하지 않는다.
- `console-errors.json`: console/pageerror 원문과 예상·예상 밖·누락 분류. console 검사만 실패한 경우에도 위 진단을 저장한다.
- `saved-source-<번호>-expected.md`, `saved-source-<번호>-actual.md`: 공통 `assertSavedSource(actual, expected, message)`를 사용하는 저장 비교가 실패했을 때의 정확한 문자열. assertion 메시지에도 diff가 표시된다. 현재 `citations`의 원문/반복 Save/Merge 비교에 적용한다.

결과 디렉터리는 다음 `browser:test` 시작 시 초기화되므로 다음 실행 전에 복사한다. scratch fixture 재준비는 이 결과 디렉터리를 지우지 않는다. CI 실패 시 `editor-browser-ci-logs-<shard>` (1–4) artifact가 결과 디렉터리 전체와 `editor-vite.log`를 포함한다. HTTP scenario 실패는 `http-host-diagnostics-<OS>`에 같은 결과 경로를 업로드한다. 여러 upload 경로의 공통 상위 경로 때문에 artifact 안에서는 `ieumdoc/ieumdoc/tmp/browser-results/`처럼 checkout prefix 아래 있을 수 있다.

artifact를 내려받아 `trace.zip`을 찾은 뒤 `pnpm exec playwright show-trace <trace.zip 경로>`로 action 순서·selector·좌표·API 로그를 조사하고, 실패 시점의 UI는 `error-context.md`, `test-failed.png`, `browser-state.json`을 함께 본다. 저장 차이는 `git diff --no-index -- <expected.md> <actual.md>`로 확인한다(diff가 있으면 exit 1). 진단 저장은 실패 시에만 하며, 성공 시 기존 scenario-result 이외의 영구 파일은 추가하지 않는다.

키 입력 조사에서는 `input-events.json`의 `events`에서 `type === "keydown"`과 `key === "Backspace"`(또는 Undo/Redo의 `z`)를 찾는다. `activeElement`/`target`과 당시 `activeEditor`를 먼저 보고, 뒤따르는 transaction의 selection·history 깊이 및 Save 쪽 focusout/focusin과 비교한다. capture 단계의 keydown은 Editor가 키를 처리하기 **전**, keyup은 처리 **후**의 상태다. 브라우저의 selectionchange는 비동기 통지이므로 키·transaction 항목에 함께 찍힌 selection을 우선한다. `dropped`는 버퍼에서 밀려난 개수다. 전체 navigation/Reload 시 버퍼는 초기화된다. timestamp와 elapsedMs는 페이지의 Date/performance 시계이므로 Playwright clock을 쓰는 시나리오(같은 persistent context에서 앞서 clock을 설치한 경우 포함)의 가상 시각·진행·초기값을 반영할 수 있다. 실제 CI 벽시계와 같다고 가정하지 않고 `sequence`로 순서를 확정한다. renderer crash나 닫힌 페이지에서는 이력을 읽지 못하고 파일에 diagnosticError가 남는다. 브라우저 탭은 시나리오 page 범위이며 문서 탭마다 별도 파일을 만들지 않는다.

수집은 테스트 fixture의 `addInitScript`와 DOM listener/MutationObserver, 기존 `element.editor` 및 Tiptap 공개 transaction 이벤트만 사용한다. 공개 `@tiptap/pm/history`의 undoDepth/redoDepth를 포함한 테스트 전용 스크립트를 worker마다 한 번 메모리에서 bundle하여 개발 서버와 production HTTP Host에 동일하게 주입한다. 제품 build에 진단 코드를 넣거나 event마다 Node로 전송하지 않으며, 성공 시 파일·attachment를 추가하지 않는다. 이력에는 문서 본문/선택 텍스트/입력 값/clipboard/transaction steps를 저장하지 않는다. DOM 텍스트는 길이만, label·testId·tab 식별자는 최대 80자로 제한하고 key 값은 원래대로 둔다. 따라서 짧은 입력은 key 시퀀스로 드러날 수 있으며 완전한 익명화는 아니다. 기존 trace·browser-state·saved-source의 별도 수집 범위는 이 제한으로 바뀌지 않는다.

## 사람이 직접 볼 것

자동화가 판정하지 않는 항목이다. 릴리스 전이나 해당 영역을 바꿨을 때 확인한다.

### Quiet Document visual review

```bash
pnpm browser:test quiet-document --screenshots      # tmp/visual-refinement/after-*.png
pnpm browser:test folder-navigation --screenshots   # tmp/picker-capture/
pnpm browser:test open-files --screenshots          # tmp/visual-refinement/: 시작 화면·폴더 메뉴
pnpm browser:test footnotes --screenshots           # tmp/visual-refinement/footnotes-*.png: 미주 구역
pnpm browser:test citations --screenshots           # tmp/visual-refinement/citations-*.png: 인용 표시
```

캡처에서 정렬, 간격, 겹침, 잘림, 긴 이름·수식·표의 처리를 본다. 기준은 [layout rules](../design/editor-layout-rules-v1.md)와 [visual language](../design/editor-visual-language-v1.md), 이전 근거는 [review record](../design/editor-visual-refinement-v1-review.md)다.

### 실제 환경 확인

Windows Desktop 제목 줄은 문서와 Settings 양쪽에서 light/dark, Outline 열림/닫힘,
일반/최대화 및 실제 디스플레이 배율로 확인한다. 하단선이 창 컨트롤 아래까지 이어져야 하며,
컨트롤의 hover/press·최소화/최대화/닫기와 빈 영역 drag·더블클릭도 유지되어야 한다.
Windows packaged CI는 기본 배율의 OS 화면 픽셀과 기존 40px 오버레이의 실패 대조를 검사한다
(`desktop-caption-pixels` artifact). 로컬 browser geometry와 renderer screenshot은 네이티브
오버레이를 포함하지 않으므로 이 확인의 대체 근거가 아니다.
Settings는 기존 scroll lock을 유지하면서 선이 창 끝까지 이어져야 한다. #488 0단계가
문서 스크롤을 header 아래로 옮겼으므로 최종 CI는 문서·Settings 양쪽 모두 gutter 예외 없이
전체 caption 구간의 픽셀을 검사한다. 병합 전 root gutter의 13px 불일치 측정은 PR #696에 보존한다.

1. **OS 한국어 IME.** 문단에서 한글을 조합·확정하고 후보창을 쓴 뒤, Backspace와 문단 경계 이동을 거쳐 Save → Reload한다. 글자 누락·중복이 없어야 한다. 자동 검사는 Chromium 조합 입력만 본다.
2. **실제 앱에서 붙여넣기.** 웹 페이지, Notion, Word에서 제목·목록·표·코드·링크가 섞인 내용을 복사해 붙여넣고 Save → Reload한다. 자동 검사는 대표 HTML을 쓴다. 정책은 [Continuous document editing](../design/document-editing-v1.md)을 따른다.
3. **이미지 붙여넣기와 이동.** 스크린샷 PNG를 붙여넣고, 파일 탐색기에서 사진(JPEG)을 끌어다 놓아 Save한 뒤, 문서와 `assets/`를 함께 다른 폴더로 옮겨 다시 연다. 이미지가 모두 보여야 한다. 자동 검사의 drop은 합성 event다.
4. **Code block 키 입력.** code block 안에서 Enter, Tab/Shift+Tab, 빈 줄 Enter 세 번으로 빠져나가기와 구문 강조 표시를 확인한다. 이 동작에는 전용 browser 시나리오가 없다.
5. **이탈 보호.** 저장하지 않은 입력이 있을 때 새로고침이나 탭 닫기를 시도하고 취소한다. 입력이 남아야 한다.
6. **실제 폴더 탐색.** `Open folder…`에서 Home, Documents, 다른 드라이브, 긴 경로를 열고, picker와 sidebar에서 새 폴더를 만들고, 문서를 오가며 편집·저장한다.
