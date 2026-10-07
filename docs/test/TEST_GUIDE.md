# IeumDoc Test Guide

[검증 진입점](README.md) · [준비](#준비) · [자동 검증](#자동-검증) · [Browser regression](#browser-regression) · [CI](#ci) · [사람이 직접 볼 것](#사람이-직접-볼-것)

동작의 판정은 자동 테스트가 한다. 이 문서는 자동 검증을 실행하는 방법과, 자동화가 판정하지 않아 사람이 직접 봐야 하는 항목만 둔다.

기능별 계약은 다음에서 찾는다.

- CLI 명령과 입력 조건: `pnpm ieumdoc help`, `pnpm ieumdoc help <command>`
- 설계와 경계: [`docs/design/`](../design/), [`docs/adr/`](../adr/)
- 동작 근거: Core·CLI·Editor 테스트와 `apps/editor/test/*.browser.js`

## 준비

- Node.js 24 LTS (`24.21.0` 이상, 24.x)
- 루트 `package.json`의 `packageManager`에 고정된 pnpm `12.5.1`

```bash
pnpm install --frozen-lockfile
```

Windows에서 전역 pnpm shim이 실패하면 같은 버전의 `corepack pnpm`을 쓴다.

## 자동 검증

```bash
pnpm docs:check
pnpm typecheck
pnpm test                                  # Core, CLI, Editor
pnpm --filter @ieumdoc/editor build
```

`pnpm test`가 Core, CLI, Editor suite를 모두 통과해야 한다. 개별 테스트 개수와 이름은 계약이 아니며 package scripts와 test runner가 source of truth다.

### Browser regression

`apps/editor/test/*.browser.js`는 실제 브라우저에서 Editor 흐름을 검증한다.

```bash
pnpm editor                                # 다른 터미널에서 dev server(http://127.0.0.1:5173)
pnpm browser:test                          # stable 시나리오 전체
pnpm browser:test footnotes outline        # 이름을 준 시나리오만
pnpm browser:test --shard=1/2              # CI와 같은 분할. 로컬에서는 두 그룹을 차례로 실행
pnpm browser:prepare                       # scratch 사본만 다시 만든다(run-code를 직접 실행할 때)
```

- 파일을 쓰는 시나리오는 저장소의 무시되는 `tmp/<시나리오>/` scratch 사본에서만 실행한다. 원본(`apps/editor/document/`, `apps/editor/test/browser/fixtures/`)이 바뀌면 실패한다. 어떤 사본을 만드는지는 `apps/editor/test/browser/fixtures.ts`에 있다.
- stable 목록은 `apps/editor/test/browser/scenarios.ts`의 `STABLE_SCENARIOS`다.
- 브라우저는 재사용 프로필(`open --persistent`)로 연다. 새 프로필 Chrome 반복 실행 금지와 cleanup은 [Windows browser automation](../contributing/windows-browser-automation.md)을 따른다.
- 같은 checkout에서 `browser:test`를 동시에 여러 개 실행하지 않는다. 다른 checkout의 dev server를 쓰려면 빈 포트에 띄우고 `IEUMDOC_BROWSER_URL`을 지정한다.
- 처음 한 번 필요하면 `pnpm exec playwright-cli install-browser chromium`을 실행한다.

### CI

`.github/workflows/ci.yml`은 모든 pull request와 master push에서 위 검사를 실행한다. 품질 job(docs check와 checker regression, typecheck, 테스트, build)과 browser `--shard=1/2`, `--shard=2/2`가 병렬로 돌고, 최종 check는 모두 성공했을 때만 통과한다.

## 사람이 직접 볼 것

자동화가 판정하지 않는 항목이다. 릴리스 전이나 해당 영역을 바꿨을 때 확인한다.

### Quiet Document visual review

```bash
pnpm browser:test quiet-document --screenshots      # tmp/visual-refinement/after-*.png
pnpm browser:test folder-navigation --screenshots   # tmp/picker-capture/
```

캡처에서 정렬, 간격, 겹침, 잘림, 긴 이름·수식·표의 처리를 본다. 기준은 [layout rules](../design/editor-layout-rules-v1.md)와 [visual language](../design/editor-visual-language-v1.md), 이전 근거는 [review record](../design/editor-visual-refinement-v1-review.md)다.

### 실제 환경 확인

1. **OS 한국어 IME.** 문단에서 한글을 조합·확정하고 후보창을 쓴 뒤, Backspace와 문단 경계 이동을 거쳐 Save → Reload한다. 글자 누락·중복이 없어야 한다. 자동 검사는 Chromium 조합 입력만 본다.
2. **실제 앱에서 붙여넣기.** 웹 페이지, Notion, Word에서 제목·목록·표·코드·링크가 섞인 내용을 복사해 붙여넣고 Save → Reload한다. 자동 검사는 대표 HTML을 쓴다. 정책은 [Continuous document editing](../design/document-editing-v1.md)을 따른다.
3. **이미지 붙여넣기와 이동.** 스크린샷 PNG를 붙여넣고 Save한 뒤, 문서와 `assets/`를 함께 다른 폴더로 옮겨 다시 연다. 이미지가 보여야 한다.
4. **Code block 키 입력.** code block 안에서 Enter, Tab/Shift+Tab, 빈 줄 Enter 세 번으로 빠져나가기와 구문 강조 표시를 확인한다. 이 동작에는 전용 browser 시나리오가 없다.
5. **이탈 보호.** 저장하지 않은 입력이 있을 때 새로고침이나 탭 닫기를 시도하고 취소한다. 입력이 남아야 한다.
6. **실제 폴더 탐색.** `Open folder…`에서 Home, Documents, 다른 드라이브, 긴 경로를 열고 문서를 오가며 편집·저장한다.
