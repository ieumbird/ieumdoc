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

`pnpm test`는 Core, CLI, Editor suite를 모두 실행한다. 개별 테스트 개수와 이름은 계약이 아니며 package scripts와 test runner가 source of truth다. 문서 checker 자체를 바꾸면 `pnpm exec tsx --test scripts/check-docs.test.ts`도 실행한다.

## Browser regression

```bash
pnpm editor                          # 별도 터미널, 개발 서버
pnpm browser:test                    # stable 전체
pnpm browser:test save-session       # 관련 시나리오만 선택
```

runner는 원본 fixture의 scratch 사본을 준비한다. 테스트 실행을 위해 `apps/editor/document/`나 `apps/editor/test/browser/fixtures/`의 원본을 직접 수정하지 않는다. fixture 자체를 바꾸는 작업이라면 의도한 변경으로 검토하고 관련 regression을 실행한다. Windows에서는 [persistent profile과 session 규칙](../contributing/windows-browser-automation.md)을 따른다. 작업 후 직접 시작한 서버와 세션을 종료한다.

## Manual review

- [TEST_GUIDE](TEST_GUIDE.md): 실행 옵션, CI, OS IME·실제 앱 clipboard 등 자동화가 판정하지 않는 시나리오.
- [Visual change review](../design/editor-visual-language-v1.md#reviewing-a-visual-change): 같은 상태의 Before/After 캡처와 검토 절차.
- [Layout Rules](../design/editor-layout-rules-v1.md): 정렬·간격·control 치수 기준.
