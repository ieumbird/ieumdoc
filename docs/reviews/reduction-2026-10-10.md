# IeumDoc 감량 검증 기록

- Status: Historical
- Last verified: 2026-10-11 (baseline 대조, 실제 구현·단위/전체 자동 검증 및 독립 리뷰).
- Baseline: `95457319e96d04023002949f8e003a3b84eecc5f` (remote master 확인).
- Environment: Windows, Node 24.21.0, pnpm 12.5.1, TypeScript 7.0.2. 실행 session의 model/effort: `gpt-6.1-sol` / `xhigh`.
- Authority: 실행 근거. 현재 계약은 [Editing session](../design/editing-session-save-v1.md), [UX Shell](../design/editor-ux-shell-v1.md), [Visual Language](../design/editor-visual-language-v1.md).

## 변경 전 조사와 검증 경계

생산 import뿐 아니라 package exports/bin, Vite 동적 server loading, generator alias, CSS import, 동적 class와 fixture를 대조했다. 추가 분석은 기존 TypeScript의 `--noUnusedLocals --noUnusedParameters`로 후보만 얻었으며 자동 수정하지 않았다. 공개 Core operation과 dependency patch는 유지한다.

| ID | 생산/테스트 호출자와 계약 | 제거 위험과 검증 | 처리 |
| --- | --- | --- | --- |
| C01 | TopBar의 sourceHint는 shell 정적 테스트만 소비; App은 미전달 | viewDisabled/Save hint 유지; Source와 pending Figure browser | 구현(단위 1) |
| C02 | convenience loader는 테스트 전용; 실제 Open/New는 loadDocumentFile → readModel | HTTP/file 테스트는 API, replay 테스트는 replay, 타입은 shared 직접 import | 구현(단위 1) |
| C03 | Save/Source/session replay는 markdown만 소비; App은 acknowledgement의 revision 사용 | 최종 canonical write와 중간 operation의 차이, conflict/history/delayed Save 검증 | 구현(단위 2) |
| C04 | App만 HTTP Save/Source 정식 소비; pure file helper에는 별도 테스트 호출자 | HTTP session 필수 검사, 누락/잘못된 값 거부; 내부 helper 재사용 보존 | 구현(단위 2) |
| C05 | legacy Button/IconButton 6개 소비 파일; Base UI button은 shell 소비 | type/ref/aria/disabled/event/selection, toolbar와 NodeView browser | 구현(단위 3) |
| C06 | cn helper는 generator alias 소비; CSS/exports/local unused를 개별 확인 | generator 경로 일치, 동적 hljs/admonition 클래스·asset 유지 | 구현(단위 1/3/5) |
| C07 | Equation/Figure/Table/section label summary와 dismiss 상태 | 명시 Edit, Apply/Cancel/Escape, read-only source, touch/keyboard | 구현(단위 3) |
| C08 | 4 overlay animation class, button/input transition와 legacy CSS | 위치 transform·Save spinner 유지; close/unmount/focus browser | 구현(단위 3) |
| C09 | DocumentEditor render에서 opening projection 반복; App generation key가 수명 구분 | lazy initializer, document 교체/StrictMode/Save/history | 구현(단위 4) |
| C10 | Equation/Figure Sets와 Table의 Figure listener 재사용 | kind+snapshot locator 집계, callback cleanup, 여러 draft와 이탈 보호 | 구현(단위 4) |
| C11 | TopBar에는 기존 menu 없음; Sidebar menu는 folder 책임 | 이관에 새 menu나 책임 혼합 필요; responsive 접근성 확인 | 유지 |
| C12 | lowlight common 초기 bundle 기여 실제 측정 | 언어 지원 보존; 지연 등록 완료를 문서 변경 없이 반영할 API 확인 | 구현(단위 5) |
| C13 | CLI runner + CI lifecycle를 공식 Playwright API와 격리 비교 | persistent profile, console/pageerror, scratch/storage/routes/cleanup 동등성 | 구현(별도 단위 6) |
| C14 | development Host만 존재; folder picker는 유일 정식 탐색 경로 | file/folder/child/recent/New 유지 | 유지 |
| C15 | contract에 여러 역사적 Before/After가 섞임; test 각 경계 분리 | 과거 증거를 보존하며 historical review에 배치; docs links/index | 구현(단위 5) |

## Baseline

Frozen install, typecheck, test, production build 통과. Core 210, File commit 2 pass / 2 환경 skip, CLI와 Editor suite 통과(Editor 225). 기존 File commit skip은 Windows symlink 권한/POSIX mode 조건이다. 브라우저 `save-session`, `pending-figure`, `source-view-pending`, `quiet-document --screenshots` 통과. Vite의 500KB chunk 경고는 baseline부터 존재한다.

생산 asset baseline: JS 1,890,997 bytes, CSS 150,100 bytes. 폰트와 문서 asset은 감량 대상이 아니다. Before 캡처는 실제 baseline에서 `tmp/visual-refinement`로 생성하고 repository 밖 비교 사본을 보존했다.

## PR 단위

1. 비활성 Source 경로, 테스트 import 경계, 확정 local 잔여물.
2. Save acknowledgement, markdown replay 후처리와 HTTP session 경계 (1에 의존).
3. Base UI button 통합, 명시 속성 Edit와 정적 overlay (2에 의존).
4. opening projection와 draft 집계 (3에 의존).
5. 언어 지연 등록, 나머지 증거와 문서 정리 (4에 의존).
6. 공식 Playwright Test runner와 CI lifecycle (5에 의존).

각 단위의 검증·commit·PR와 최종 측정은 실행 후 아래에 기록한다.

### 단위 1 검증

`pnpm typecheck`, Core 210/210, Editor 225/225, editor build, docs:check, diff --check 통과. CLI의 미사용 heading-number 계산만 제거했고 추가 CLI 46/46도 통과했다. cn 재수출은 generator의 실제 filesystem alias이므로 유지하며 6 UI consumer를 그 경로로 연결했다. Notice, 공개 Core operation, CLI bin, dependency patch는 유지한다.

### 단위 2 검증과 측정

응답 축소(`35af134`)와 replay 후처리 제거(`0cb8507`)는 별도 commit이다. Save acknowledgement는 revision만 반환하고 App은 read model을 요구하지 않는다. 최종 Core canonicalSerialize/figureWriteError/fingerprint/reparse 및 validateStructure는 유지; Open/New canonicalWriteError도 유지한다. 제거된 최종 readModel의 preflight는 별도 write gate가 아닌 반환 데이터였다. HTTP에서 path/revision/base.source를 요구하며 pure file helper의 disk-snapshot 재사용은 보존한다.

같은 technical-document fixture, 고정 path와 64자리 revision의 JSON 응답: 3,325 → 79 bytes. 임시 Host 함수 계측(각 1 replay)에서 editable projection 3 → 1회, Markdown 동일. 코드 계측 사본은 실행 후 삭제했다. Windows Node 24.21, no-edit replay, warmup 5 + 측정 20회: baseline 총 204.988ms, 변경 후 총 111.085ms. 동시 검증 프로세스가 있었던 단일 측정이므로 일반화된 개선율이나 latency 보장은 하지 않는다.

Editor 225/225, typecheck 통과. targeted browser 7개(save-session, save-during-edit, equation-save-during-edit, pending-figure, source-view, source-view-pending, writeability-preflight) 통과. 누락/잘못된 HTTP session fields는 Save와 Source 양쪽에서 400 및 원본 보존을 확인했다. valid stale revision은 409, conflict 이후 Source는 계속 복사 가능하다. pending Figure label swap 및 caption/label 변경 조합은 최종 canonical 계약으로 검증한다.

### 단위 3 검증

Base UI Button으로 6개 소비 파일을 이관하고 legacy Button/IconButton 및 전용 CSS를 제거했다. ref/type/disabled/aria, mousedown 선택 보존과 click/focus 반환을 유지하며 glyph 굵기 700도 보존했다. Notice와 독립 document control은 유지한다. 실제 소비가 없는 button variant/size, Popover/Dialog export와 구형 paragraph CSS만 제거했다.

선택 summary와 dismiss 상태 4종을 제거했다. 선택은 선택으로 끝나고 기존 Edit가 폼을 연다. 신규 삽입과 Apply를 Undo한 transient Figure/빈 신규 Equation은 기존 폼 수명을 유지한다. 밖 클릭/선택 이동으로 폼을 폐기하지 않는다. overlay 입출 모션·pressed 이동·불필요한 transition을 제거한 뒤 tw-animate-css를 패키지 절차로 제거했다. 위치 보정 transform, spinner/reduced-motion과 shadcn CSS import는 유지한다.

Editor 225/225, typecheck/build/frozen install/docs:check/diff 통과. targeted browser editor-shell, layout-rules, quiet-document, visual-states, figure-authoring, figure-draft-race, pending-figure, equation-insertion, table-authoring, section-reference, inline-math-authoring, link-authoring, new-document 통과(첫 실행 ARIA 오류 및 obsolete summary 대기는 수정 후 재실행). Undo → Save의 transient 안내 회귀도 기존 pending-figure 검사가 잡아 수정 후 통과했다. baseline/after 실제 768px selected/editing 캡처를 비교했고 문서 축·caption·폼 위치가 유지되며 자동 summary만 없어졌다. 704/768/1024/1440px captures는 임시 폴더에만 보존한다.

### 단위 4 검증과 발견

opening projection을 lazy state initializer로 옮기고 중복 baseline ref를 제거했다. App의 generation key가 Open/New/Reload 수명이며 Save는 그 key나 document를 갱신하지 않는다. 실제 StrictMode/같은 scratch/각 1회 임시 계측: Wide 5회 전환의 계산 10→0, 4문자 입력과 focus의 계산 10→0, Save 6→0, Reload 6→2(새 editor의 StrictMode initializer). 계측과 전용 browser session은 제거했다.

Equation/Figure의 2 Set·callback ref·2 App 상태를 kind+snapshot locator Map, 안정 callback, 단일 active 알림으로 통합했다. 값은 각 폼에 남으며 동일 membership 알림은 no-op이다. Table/Source가 같은 locator여도 독립 등록된다. doc dirty·draft·pending Figure·asset busy는 별도 의미다.

변경 전 실제 browser에서 section label/source draft의 beforeunload=false와 Reload 입력 유실, Table source Apply가 caption draft/이미 적용된 caption을 덮는 문제를 재현했다(`tmp/reduction-pre-fix`, disk Save 없음). section/source 등록 누락을 고치고 source replacement를 요청 전후 node/other draft/source/input 상태로 가드했다. Cancel/unmount는 늦은 응답을 무효화한다. 새 property-drafts 시나리오는 서로 다른 종류/같은 locator/한 폼 Cancel/Reload Keep editing/beforeunload/stale Apply/요청 중 입력을 검증한다. 기존 block-source refusal은 document JSON 불변과 입력 보존/dirty/Cancel을 검사하며 예전 변수명 고정 assertion은 실제 browser 보호로 대체했다.

Editor 225/225와 typecheck/docs 통과. targeted browser property-drafts, block-source-editing, save-session, figure-draft-race, save-during-edit, equation-save-during-edit, pending-figure 모두 통과. 독립 reviewer의 관련 unit 36개와 diff 검토도 통과했다. 별도 기존 Inline Math/Link local input은 blur로 닫히는 inline overlay 계약이며 이번 블록 registry에 넣거나 durable recovery로 확대하지 않았다.

### 단위 5 판단과 검증

C11은 유지한다. TopBar에 재사용할 menu가 없고 Sidebar menu는 파일 탐색 책임이다. numbering/Wide/Reload 이관은 새 menu 상태·추가 클릭·현재 상태 숨김을 늘려 채택 조건을 충족하지 않는다. 저사용 기능이라는 통계 주장은 하지 않는다. C14는 현재 개발 Host만 채택됐으므로 유일한 picker를 유지하고 실제 대체 Host 채택/동등 검증 시점까지의 수명을 기존 계약에 명시했다.

C06은 producer가 없는 button icon/button-group, input file, tooltip kbd 생성 modifier를 제거했다. 기존 unused 진단을 4 packages에 실행해 통과했다. cn alias, shadcn CSS, dynamic hljs/Notice/admonition/NodeView CSS, 공개 exports/bin, dependency patches, fonts/license/document assets는 확인한 소비자·계약 때문에 유지한다.

C12은 같은 common grammar 집합을 첫 code block 시점에 지연 등록한다. 문서·language·history는 기존 엔진/operation을 유지하고 code-free document는 grammar를 요청하지 않는다. 실제 stock lowlight가 미등록 언어를 auto-detect하는 기존 plain-fallback 계약 불일치도 확인하여 literal fallback으로 맞췄다. 초기 reconfigure 실험은 모든 plugin view를 destroy하여 image upload를 취소하는 반례를 독립 probe가 잡았으므로 폐기했다. 최종 연결은 stock PluginKey/state를 보존하면서 metadata transaction에서 기존 init로 decoration만 갱신하며 plugin set/view를 재구성하지 않는다. 독립 실제 imageAssetsPlugin probe에서 held upload, Undo/Redo, 모든 view destroy=0, rollback=0, document/selection/history identity를 확인했다. 실제 browser도 grammar 요청과 asset 응답을 동시에 보류하고 이후 이미지 삽입 및 별도 Undo, 코드 Undo/Redo/언어 전환/미등록·load failure plain 입력을 검증했다.

동일 최종 코드/설정으로 eager/deferred 변형을 각 1회 Node Vite build했고 gzip은 Node zlib 기본 설정으로 측정했다. Entry 1,888,410→1,750,377 bytes, gzip597,299→554,898. 지연 chunk139,887/gzip43,073; 전체 JS는 1,854/gzip672 bytes 증가한다. 두 변형 CSS139,451 bytes 동일. 이 격리 build의 cwd는 repository root이며 정식 pnpm build와 CSS scan 범위가 다르므로 최종 전체 변화는 정식 build로 따로 기록한다. 측정 script는 삭제했다. code가 있는 문서는 mount 뒤 grammar를 요청하므로 전체 초기 network/latency 개선율을 주장하지 않는다.

C15은 empty/v2/v4/v4.1 비교 설명을 기존 Historical visual review로 옮기고 날짜/baseline/이미지/anchor를 보존했다. 같은 입력·같은 경계의 정확한 중복 assertion 3개만 제거했고 테스트 자체와 Core/CLI/projection/browser의 고유 경계는 유지했다. 문서 이동은 runtime 감량이 아니다.

Editor225, typecheck/build/docs 통과. code-highlighting/image-assets/visual-states/markdown-input targeted browser 통과. Save 진행 spinner의 normal/reduced-motion도 computed browser state로 통과했다. 독립 UI 비교에서 Open Escape와 toolbar keyboard focus 제한은 변경 전 동일함을 확인했다. Figure/Eq Cancel/Escape의 기존 BODY focus도 보존됐다. 375px touch Edit/Cancel은 실제 touchscreen API와 bounds를 확인했으나 mobile emulation 전환 때문에 375px Save pointer 검사는 신뢰 가능한 등가성 판정이 불가능했다(기존 baseline에서도 Save x417–474 overflow). 물리 기기 검증으로 주장하지 않는다.

비교 baseline worktree의 browser/server/등록은 종료했으나 Windows가 TEMP directory 제거를 끝내지 못했고 후속 Remove-Item은 자동 승인 검토에서 `blocked by policy`로 거절됐다. 잔여 `C:\Users\swBaek\AppData\Local\Temp\ieumdoc-ui-baseline-97fea98`에는 활성 process가 없다(파일 apparent length191,096,707 bytes; disk allocation 아님). 동일 삭제는 재시도하지 않았다.

### 단위 6: runner 채택 근거

기존 subprocess/`### Result` 파싱/문자열 console monitor를 제거하고 Playwright Test worker fixture와 직접 Page API로 같은 시나리오를 실행한다. [webServer](https://playwright.dev/docs/test-webserver), [persistent context](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context), [worker fixture teardown](https://playwright.dev/docs/test-fixtures#execution-order)을 사용한다. browser 상태/console/pageerror는 TestInfo attachment로 보존하며 기존 HTTP status/path/최소 발생 수 분류 규칙을 그대로 옮겼다. 하나의 worker와 checkout별 재사용 profile, storage 정리, source write guard와 digest, scratch 복구를 유지한다. 실패한 delayed route는 해당 page 종료로 제거한다.

`@playwright/test`는 기존 transitive Playwright와 정확히 같은 `1.64.0-alpha-1789764292000` 버전으로 추가했다. CLI 이름/분할/screenshots 진입점은 유지하며 [해당 버전의 공개 CLI export/bin](https://github.com/microsoft/playwright/blob/78ff4260d79b924724bdcc4ccd89e463b8f43b0d/packages/playwright-test/package.json#L23-L28)을 같은 process에서 실행한다. private API나 별도 CLI subprocess는 없다. 이 실행 방식은 공개 bin과 pinned version 실험에 근거하며 별도 공식 JavaScript runner API로 주장하지 않는다. import 완료가 suite 완료를 뜻하지 않으며 CLI가 최종 종료와 signals를 소유한다. 직접 디버깅 계약에 실제 소비자가 있는 `@playwright/cli`는 유지한다.

격리 실험에서 대표 source/folder/save 3개 통과(26.5s), console+pageerror+held mock은 exit1로 실패하고 다음 worker의 storage/mock/source guard 정리는 통과(10.7s)했다. worker의 부모 PID가 entry process임도 확인했다. 직접 시작한 서버 종료, startup exit7 원인/실패 exit1, 기존 서버 PID/HTTP 생존을 각각 확인했고 실험 서버와 browser는 종료했다. strict typecheck와 통합 후 관련 5개 시나리오도 통과(28.8s)했다. Windows의 SIGTERM graceful option은 공식 구현에서 무시되며 owned process tree cleanup을 사용한다. CI의 수동 PGID/trap/readiness 코드를 없애고 webServer가 시작한 서버만 정리하도록 했다. 실패 로그와 attachment 업로드 및 기존 두 shard/필수 aggregate gate는 유지한다. 이전 runner는 남기지 않는다.


최종 Windows 실행에서 stable 42개 전체 통과(3.9m), Core210/CLI46/Editor225 통과했다. File commit은 2 pass와 baseline부터 같은 Windows 환경 skip 2개다. frozen install, docs checker 자체 5개, docs:check, typecheck, 정식 production build, diff --check도 통과했다. 독립 C13 reviewer는 fixture/shard 7개와 타입/문서 검사, classifier 네 경계를 별도로 검증했고 기능 finding은 없었다. 전체 suite의 browser는 자동 종료됐으며 직접 시작한 Vite는 소유 PID를 확인해 종료했다.


추가 production runner 검사에서 기존 dev server가 없는 상태로 `pnpm browser:test source-view`를 실행하여 실제 pnpm/Vite chain의 자동 시작과 종료를 확인했다(1 pass,11.4s; 종료 후5173 listener 없음). 이전 수동 서버의 Ctrl+C 후 남은 Vite child도 이 작업의 PID/parent/command를 확인하여 종료했다.

## 항목별 commit/PR와 결과

아래 구현 판단은 일반적인 후속 과제로 남기지 않았다. 보류 항목은 없고, C11/C14는 채택 조건을 조사한 유지 결정이다. 각 구현의 고유 검증은 위 단위 기록과 최종 전체 검사에 포함한다.

| ID | 판정/commit | PR | 검증 또는 유지 근거 |
| --- | --- | --- | --- |
| C01 | 구현 `d4e4c15` | [#156](https://github.com/ieumbird/ieumdoc/pull/156) | 비활성 sourceHint 제거; Source pending/shell |
| C02 | 구현 `d4e4c15` | #156 | test-only loader/re-export 제거; 실제 Open/file/replay 경계 |
| C03 | 구현 `35af134`, `0cb8507` | [#157](https://github.com/ieumbird/ieumdoc/pull/157) | revision ack/최종 projection 제거; Save/history/conflict/label 조합 |
| C04 | 구현 `97fea98` | #157 | HTTP session required와 malformed400; 내부 pure helper 보존 |
| C05 | 구현 `39abb98` | [#158](https://github.com/ieumbird/ieumdoc/pull/158) | Base UI 한 구현; ref/aria/selection/focus/keyboard |
| C06 | 구현 `d4e4c15`, `39abb98`, `c6fffcd` | #156/#158/[#160](https://github.com/ieumbird/ieumdoc/pull/160) | exports/bin/alias/CSS side effects 검사; 생성 잔여물만 제거 |
| C07 | 구현 `39abb98` | #158 | 자동 summary/dismiss 제거; 명시 Edit/Apply/Cancel/Undo |
| C08 | 구현 `39abb98`, `c6fffcd` | #158/#160 | overlay 모션/unused tw-animate 제거; 위치·닫힘·focus/spinner |
| C09 | 구현 `aafc122` | [#159](https://github.com/ieumbird/ieumdoc/pull/159) | 실제 lazy projection 계측과 remount/Save 회귀 |
| C10 | 구현 `aafc122` | #159 | kind+locator 집계; 미보고 source/section 및 late Apply 보호 |
| C11 | 유지 `c6fffcd` 기록 | #160 | 기존 menu 없음; 새 menu/state/추가 클릭이 증가 |
| C12 | 구현 `c6fffcd` | #160 | common 집합 전체 지연; 실제 upload/plugin 수명/언어/실패 |
| C13 | 구현 `d30ec9e` | [#161](https://github.com/ieumbird/ieumdoc/pull/161) | 공식 Test fixture; 정상/실패/ownership 격리 + 전체42 |
| C14 | 유지 `c6fffcd` 기록 | #160 | 유일 development Host; 동일 기능의 adopted native 대체 없음 |
| C15 | 구현 `c6fffcd` | #160 | 역사 evidence 재배치, 동일경계 중복 assertion3만 제거 |

Stack/base: master → #156 → #157 → #158 → #159 → #160 → #161. #156~#160은 각각 실제 HEAD에서 quality/browser1/browser2/aggregate 4 checks SUCCESS를 확인했다. #161 제출 시 CI는 진행 중이며 최종 HEAD/SHA의 결과는 해당 PR 설명과 작업 완료 응답에 별도로 기록한다. pending을 pass로 기록하지 않는다. 자동 merge나 master/force push는 하지 않았다.

## 감량과 추가 코드의 구분

Baseline에서 단위6까지 생산 코드/설정은367줄 추가/601줄 삭제(28files), browser infrastructure/CI는296/411(7files), 나머지 테스트는376/125(29files), 문서는 별도로 증가했다. lockfile은 정상 패키지 명령의 생성 결과이며 파일 이동/minification/문서 재배치를 runtime 감량으로 계산하지 않는다. runner 본체와 새 연결 파일 총344→283줄, CI 순65줄 제거로 자체 infrastructure는126줄 감소했다.

추가 생산 코드는 엄격한 HTTP session 검증, 공통 Draft 등록과 source의 늦은 응답 보호, plugin 수명을 유지하는 grammar refresh에 필요하다. 추가 테스트는 malformed protocol, pending label 조합, 미보고 Draft/late Apply, 동시 grammar+asset 수명 및 load failure의 기존 공백을 보호한다. 회귀 테스트 자체를 삭제하거나 skip을 추가하지 않았다. production dependency는 tw-animate-css 하나 제거했고 dev dependency는 기존 Playwright engine 버전과 같은 test surface 하나 추가했다.

정식 `pnpm --filter @ieumdoc/editor build` 각 baseline/final1회: entry JS1,890,997→1,750,377bytes(-140,620); 전체 JS1,890,997→1,890,264(-733); CSS150,100→138,982(-11,118). 언어 chunk139,887bytes는 전체 JS에 포함한다. 위 paired eager/deferred 수치는 지연 분리의 효과를 고립시킨 별도 조건이며 합산하지 않는다. 폰트/라이선스/실제 asset은 그대로다. Save 응답3325→79bytes와 editable projection3→1은 같은 fixture/환경에서 측정했다. latency나 사용자 체감 개선율은 주장하지 않는다.

남은 한계는 baseline부터의 375px TopBar Save overflow와 일부 keyboard/Escape focus 동작, OS IME/실제 clipboard/물리 touch의 수동 확인이다. 375px Edit/Cancel과704px 이상 실제 캡처는 확인했지만 mobile emulation 전환 중 Save pointer 결과는 신뢰할 수 없어 release 검증으로 주장하지 않는다. 새 durable recovery, Host abstraction이나 무관한 layout 재설계로 확대하지 않았다.


추가 실험 script/config/PID 파일46개는 소유 경로의 개별 파일로 정리했다. logs/measurements는 TEMP `ieumdoc-conditional-audit-20261010`에 보존했다. 그 안의 `C:\Users\swBaek\AppData\Local\Temp\ieumdoc-conditional-audit-20261010\refresh-lifetime\node_modules` junction 삭제도 자동 승인 검토가 `blocked by policy`로 거절했다(target은 기존 `C:\Projects\ieumdoc\apps\editor\node_modules`). 추가 이유는 제공되지 않았고 재시도하지 않았다. 두 TEMP 잔여물은 활성 process 없이 남아 있다.
