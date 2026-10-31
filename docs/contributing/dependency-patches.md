# Dependency patch register

- Status: Implemented
- Last verified: 2026-10-29 (등록 설정·패치 diff·계약·테스트 파일 대조; 제품 회귀 재실행을 뜻하지 않음).
- Scope: `pnpm-workspace.yaml`의 현재 로컬 의존성 패치와 갱신 절차. 세부 동작의 authority는 각 행의 계약 문서다.
- Related: [#741](https://github.com/litzio/litzio/issues/741).

## Current patches

첫 두 열은 `docs:check`가 읽는 패키지 키와 패치 파일 링크다. 패치 하나당 한 행을 유지한다.

| 패키지@버전 | 패치 파일 | 이유·이슈 | 바꾸는 내용 | 영향 범위 | 제거 조건 | 보호 테스트 (파일·명령) | 관련 계약 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `linkify-it@4.0.1` | [patch](../../patches/linkify-it@4.0.1.patch) | [#346](https://github.com/litzio/litzio/issues/346), [#11](https://github.com/litzio/litzio/issues/11): URL/email 반복 탐색 보안 backport | 독립 global scan 병합, credential 50자·email local-part 64자 제한 | MyST의 13.x API/peers 유지; Core 공개 parse·참조 진단의 URL 인식 | 호환 upstream에 모든 수정이 포함되고 패치 없이 공개 admission/진단·HTML 거부·canonical·Core/CLI/Editor·browser 회귀 통과, audit·도달성 재평가 | [myst-regression.test.ts](../../packages/core/test/myst-regression.test.ts): `pnpm --filter @litzio/core test` | [Parser security](../design/parser-security-v1.md#pinned-backports) |
| `markdown-it@13.0.2` | [patch](../../patches/markdown-it@13.0.2.patch) | [#11](https://github.com/litzio/litzio/issues/11), [#346](https://github.com/litzio/litzio/issues/346): smartquotes·inline HTML 보안 backport | quote 치환 batching 유지, HTML 종결자별 탐색 구간 cache | MyST 13.x HTML 문법·native 거부 보존; Core smartquotes 비활성 유지 | 호환 upstream에 모든 수정이 포함되고 패치 없이 공개 admission/진단·HTML 거부·canonical·Core/CLI/Editor·browser 회귀 통과, audit·도달성 재평가 | [myst-regression.test.ts](../../packages/core/test/myst-regression.test.ts), [parse-boundary.test.ts](../../packages/core/test/parse-boundary.test.ts): `pnpm --filter @litzio/core test`; [smartquotes-patch.test.ts](../../packages/core/test/smartquotes-patch.test.ts): `pnpm --filter @litzio/core test:smartquotes` | [Parser security](../design/parser-security-v1.md#pinned-backports) |
| `myst-parser@1.7.4` | [patch](../../patches/myst-parser@1.7.4.patch) | [#734](https://github.com/litzio/litzio/issues/734), [#730](https://github.com/litzio/litzio/issues/730): Python MyST 목록 형식·인접 경계 보존 | 기존 markdown-it list rule로 제한된 style 속성을 읽고 delimiter 보존 | 로컬 JS schema 확장; 다섯 style의 unquoted/double-quoted 값만 지원, 일반 block attributes 아님 | upstream이 같은 의미를 지원하고 패치 없이 format·adjacency·canonical round-trip 회귀 통과 | [list.test.ts](../../packages/core/test/list.test.ts): `pnpm --filter @litzio/core test` | [Native document support](../design/document-support-v1.md) |
| `myst-to-md@1.0.17` | [patch](../../patches/myst-to-md@1.0.17.patch) | [#730](https://github.com/litzio/litzio/issues/730), [#734](https://github.com/litzio/litzio/issues/734): 목록 의미·인접 경계 쓰기 보존 | 기존 writer에 본문 위임, semantic delimiter·style 경계 출력, bulletOther 유지 | Core canonical 목록 쓰기; ordered delimiter alternation 대체 | upstream이 같은 의미를 지원하고 패치 없이 format·adjacency·canonical round-trip 회귀 통과 | [list.test.ts](../../packages/core/test/list.test.ts): `pnpm --filter @litzio/core test` | [Native document support](../design/document-support-v1.md) |
| `prosemirror-view@1.42.4` | [patch](../../patches/prosemirror-view@1.42.4.patch) | [#144](https://github.com/litzio/litzio/issues/144), [#542](https://github.com/litzio/litzio/issues/542), [#489](https://github.com/litzio/litzio/issues/489): focus 복원이 후속 selection을 덮어씀 | native focus 때 observer 읽기 전 selection 복원, 후속 key/pointer/touch 보존 | Editor engine ESM·CJS runtime; Core·CLI·Markdown 변경 없음 | upstream에서 패치 없이 두 focus restore의 후속 key 보존과 무입력/modifier controls 통과; citation-authoring real-click·held-check 및 document-title 강제 callback 순서의 pointer/touch 목적지 보존 통과 | [focus-caret.browser.js](../../apps/editor/test/focus-caret.browser.js), [citation-authoring.browser.js](../../apps/editor/test/citation-authoring.browser.js), [document-title.browser.js](../../apps/editor/test/document-title.browser.js): `pnpm browser:test focus-caret citation-authoring document-title` | [Continuous editing](../design/document-editing-v1.md), [원인·초기 제거 절차](../reviews/prosemirror-focus-caret-2026-10-09.md#removal-condition) |

보안 advisory·upstream commit의 상세 출처와 적용 경계는 Parser security 계약에 유지한다. 위 보호 테스트는 현재 파일에서 확인한 회귀 경로이며 upstream 수정 완료를 의미하지 않는다.

## Update procedure

1. 새 패치·버전 변경·제거 시 `patchedDependencies`, 패치 파일, lockfile과 이 표의 패키지 키·파일을 함께 갱신한다. 설정 주석은 `#이슈번호; docs/contributing/dependency-patches.md` 한 줄 형식을 사용한다.
2. 이유·변경 요약·영향·제거 조건·보호 테스트를 실제 diff와 현재 계약에서 확인하고 해당 행을 갱신한다. 확인할 수 없는 항목은 `미확인`으로 남기고 PR에 보고한다. 상세 계약은 복제하지 않고 링크한다.
3. `pnpm docs:check`와 `pnpm exec tsx --test scripts/check-docs.test.ts`로 등록 누락·중복·버전/파일 불일치를 검사한다. 실제 의존성 변경의 검증은 [CONTRIBUTING matrix](../../CONTRIBUTING.md#verification-matrix)를 따른다. 제거는 각 행의 조건을 패치 없이 검증한 뒤 수행한다.
