# IeumDoc 감량 검증 기록

- Status: Historical
- Baseline: `95457319e96d04023002949f8e003a3b84eecc5f` (remote master 확인).
- Environment: Windows, Node 24.21.0, pnpm 12.5.1, TypeScript 7.0.2. 실행 session의 model/effort: `gpt-6.1-sol` / `xhigh`.
- Authority: 실행 근거. 현재 계약은 [Editing session](../design/editing-session-save-v1.md), [UX Shell](../design/editor-ux-shell-v1.md), [Visual Language](../design/editor-visual-language-v1.md).

## 변경 전 조사와 검증 경계

생산 import뿐 아니라 package exports/bin, Vite 동적 server loading, generator alias, CSS import, 동적 class와 fixture를 대조했다. 추가 분석은 기존 TypeScript의 `--noUnusedLocals --noUnusedParameters`로 후보만 얻었으며 자동 수정하지 않았다. 공개 Core operation과 dependency patch는 유지한다.

| ID | 생산/테스트 호출자와 계약 | 제거 위험과 검증 | 처리 |
| --- | --- | --- | --- |
| C01 | TopBar의 sourceHint는 shell 정적 테스트만 소비; App은 미전달 | viewDisabled/Save hint 유지; Source와 pending Figure browser | 구현(단위 1) |
| C02 | convenience loader는 테스트 전용; 실제 Open/New는 loadDocumentFile → readModel | HTTP/file 테스트는 API, replay 테스트는 replay, 타입은 shared 직접 import | 구현(단위 1) |
| C03 | Save/Source/session replay는 markdown만 소비; App은 acknowledgement의 revision 사용 | 최종 canonical write와 중간 operation의 차이, conflict/history/delayed Save 검증 | 구현 예정 |
| C04 | App만 HTTP Save/Source 정식 소비; pure file helper에는 별도 테스트 호출자 | HTTP session 필수 검사, 누락/잘못된 값 거부; 내부 helper 재사용 보존 | 구현 예정 |
| C05 | legacy Button/IconButton 6개 소비 파일; Base UI button은 shell 소비 | type/ref/aria/disabled/event/selection, toolbar와 NodeView browser | 구현 예정 |
| C06 | cn helper는 generator alias 소비; CSS/exports/local unused를 개별 확인 | generator 경로 일치, 동적 hljs/admonition 클래스·asset 유지 | 구현 중 |
| C07 | Equation/Figure/Table/section label summary와 dismiss 상태 | 명시 Edit, Apply/Cancel/Escape, read-only source, touch/keyboard | 구현 예정 |
| C08 | 4 overlay animation class, button/input transition와 legacy CSS | 위치 transform·Save spinner 유지; close/unmount/focus browser | 구현 예정 |
| C09 | DocumentEditor render에서 opening projection 반복; App generation key가 수명 구분 | lazy initializer, document 교체/StrictMode/Save/history | 구현 예정 |
| C10 | Equation/Figure Sets와 Table의 Figure listener 재사용 | kind+snapshot locator 집계, callback cleanup, 여러 draft와 이탈 보호 | 구현 예정 |
| C11 | TopBar에는 기존 menu 없음; Sidebar menu는 folder 책임 | 이관에 새 menu나 책임 혼합 필요; responsive 접근성 확인 | 조사 중 |
| C12 | lowlight common 초기 bundle 기여 실제 측정 | 언어 지원 보존; 지연 등록 완료를 문서 변경 없이 반영할 API 확인 | 조사 중 |
| C13 | CLI runner + CI lifecycle를 공식 Playwright API와 격리 비교 | persistent profile, console/pageerror, scratch/storage/routes/cleanup 동등성 | 조사 중 |
| C14 | development Host만 존재; folder picker는 유일 정식 탐색 경로 | file/folder/child/recent/New 유지 | 유지 |
| C15 | contract에 여러 역사적 Before/After가 섞임; test 각 경계 분리 | 과거 증거를 보존하며 historical review에 배치; docs links/index | 조사 중 |

## Baseline

Frozen install, typecheck, test, production build 통과. Core 210, File commit 2 pass / 2 환경 skip, CLI와 Editor suite 통과(Editor 225). 기존 File commit skip은 Windows symlink 권한/POSIX mode 조건이다. 브라우저 `save-session`, `pending-figure`, `source-view-pending`, `quiet-document --screenshots` 통과. Vite의 500KB chunk 경고는 baseline부터 존재한다.

생산 asset baseline: JS 1,890,997 bytes, CSS 150,100 bytes. 폰트와 문서 asset은 감량 대상이 아니다. Before 캡처는 실제 baseline에서 `tmp/visual-refinement`로 생성하고 repository 밖 비교 사본을 보존했다.

## PR 단위

1. 비활성 Source 경로, 테스트 import 경계, 확정 local 잔여물.
2. Save acknowledgement, markdown replay 후처리와 HTTP session 경계 (1에 의존).
3. Base UI button 통합, 명시 속성 Edit와 정적 overlay (2에 의존).
4. opening projection와 draft 집계 (3에 의존).
5. 나머지 증거와 문서 정리 (4에 의존; runner 전환 채택 시 별도 PR).

각 단위의 검증·commit·PR와 최종 측정은 실행 후 아래에 기록한다.

### 단위 1 검증

`pnpm typecheck`, Core 210/210, Editor 225/225, editor build, docs:check, diff --check 통과. CLI의 미사용 heading-number 계산만 제거했고 추가 CLI suite는 실행 중이다. cn 재수출은 generator의 실제 filesystem alias이므로 유지하며 6 UI consumer를 그 경로로 연결했다. Notice, 공개 Core operation, CLI bin, dependency patch는 유지한다.
