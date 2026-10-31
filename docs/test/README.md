# Verification

변경 유형별 로컬 최소 검증과 CI에 맡길 범위는 [CONTRIBUTING](../../CONTRIBUTING.md#verification-matrix)을 따른다. 관련 패키지 테스트·browser 시나리오 지정 실행을 우선하며, 영향 범위가 여러 계층에 걸치는 경우가 아니면 전체 `pnpm test`·전체 `pnpm browser:test`는 로컬 필수가 아니다. PR의 필수 CI 통과와 실제 Save → Reload·Visual Before/After 등 고유 위험 검증은 유지한다.

Last verified: 2026-10-29 (CI execution-policy/quality/scripts tests, browser fixture/shard unit checks, targeted Core parser/quote/patch tests and docs checks; no browser or Desktop execution).

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

CI quality는 문서 전용 PR과 merge group에서 문서·checker tests, diff/whitespace, issue 정책, AI provenance validator·event commit 검사와 경로 분류 회귀만 실행한다. 제품 테스트·typecheck·Editor build는 생략한다. `node --test scripts/ci-quality-mode.test.mjs scripts/ci-execution-policy.test.mjs`는 PR merge-base diff와 group 전체 base..head diff, 문서·Editor·설치기·lockfile·다중 PR·삭제/rename·diff 실패, master push의 같은 SHA 성공 run 재사용/API 실패 fallback, aggregate와 캐시 갱신 조건을 검증한다. queue head별 CI가 서로 취소되지 않는지도 검사한다. smartquotes 대형 패치 검사는 기본 Core suite에서 분리한 `pnpm --filter @ieumdoc/core test:smartquotes`이며 의존성·patch·parser 경로 변경 때 선택한다. 정확한 allowlist·실행 조건·캐시 key/scope는 [Verification matrix](../../CONTRIBUTING.md#verification-matrix)를 따른다. 로컬 probe와 PR CI만으로 실제 merge_group 실행을 검증했다고 보고하지 않는다.

병합은 [독립 승인 후 merge queue 절차](../../CONTRIBUTING.md#review-and-sequential-merge)와 [Enqueue 명령·상태 확인](../../CONTRIBUTING.md#enqueue)을 따른다. Queue는 최신 master와 합친 결과의 전체 diff에 경로 규칙을 적용하고 필수 검사 `Core, CLI, Editor, and browser regressions`를 보고한다. `node --test scripts/commit-provenance.test.mjs`는 PR 고유 commit과 agent 작성 merge 검사를 유지하면서 GitHub 생성 queue merge는 건너뛰는지 확인한다. Queue 실패는 artifact부터 조사한다. Queue는 2026-10-26부터 활성화되어 있으며, [#537 검증 기록](https://github.com/ieumbird/ieumdoc/issues/537)에 [PR #543](https://github.com/ieumbird/ieumdoc/pull/543)의 실제 [merge_group 실행](https://github.com/ieumbird/ieumdoc/actions/runs/40313330979)과 queue 병합 결과가 있다. 이후 PR도 해당 queue head의 실제 실행 결과를 확인하며, 로컬 probe와 PR CI만으로 실제 queue 병합 성공을 주장하지 않는다.

## Browser regression

```bash
pnpm editor                          # 별도 터미널, 개발 서버
pnpm browser:test                    # stable 전체
pnpm browser:test save-session       # 관련 시나리오만 선택
pnpm browser:test --shard=1/4         # CI의 4개 shard 중 하나
```

CI의 4개 shard는 stable 목록을 순환 분배하며 각 시나리오는 전체 shard에서 정확히 한 번 실행된다. `pnpm --filter @ieumdoc/editor exec tsx --test test/browser-fixtures.test.ts`가 누락·중복·빈 shard 없이 분할되는지 검사한다. CI 로그에는 각 shard의 시나리오 배정이 출력되고 실패 artifact는 `editor-browser-ci-logs-1`부터 `editor-browser-ci-logs-4`까지 구분된다. 로컬에서 전체를 분할 실행하려면 `1/4`부터 `4/4`까지 순서대로 실행한다.

runner는 원본 fixture의 scratch 사본을 준비한다. `file-actions`의 실제 파일 삭제·이름 변경은 저장소 밖 OS 임시 폴더의 checkout별 사본에서만 실행하며, runner의 `/api/file` guard가 저장소 내부 경로를 거부하는지도 확인한다. 테스트 실행을 위해 `apps/editor/document/`나 `apps/editor/test/browser/fixtures/`의 원본을 직접 수정하지 않는다. fixture 자체를 바꾸는 작업이라면 의도한 변경으로 검토하고 관련 regression을 실행한다. Windows에서는 [persistent profile과 session 규칙](../contributing/windows-browser-automation.md)을 따른다. 작업 후 직접 시작한 서버와 세션을 종료한다.

### Browser timeout policy

The [shared config](../../apps/editor/test/browser/playwright.config.ts) limits each scenario to
120 seconds and each action/wait or navigation to 15 seconds. Both persistent-context launch paths
explicitly apply the configured defaults before creating pages: the worker session in
`scenarios.spec.ts` (startup, scenario and secondary tabs in Editor and HTTP modes), and every
crash/restart context in `http-recovery.spec.ts`. `use.actionTimeout` alone is not relied on for the
worker-owned context. Navigation has its own default so `goto`/`reload` cannot inherit an unlimited
navigation setting. `waitForFunction`, locator `waitFor`/actions and page response/event waits use
the context action/wait default ([Playwright API](https://playwright.dev/docs/api/class-browsercontext#browser-context-set-default-timeout)).
Auto-retrying `expect` assertions retain Playwright's existing 5-second default. Explicit per-call
timeouts take precedence. Fixed `waitForTimeout` delays and arbitrary JavaScript promises/evaluations
are not bounded by the action default; the scenario limit remains their backstop. Retries stay at 0;
shard assignment and CI job limits are unchanged.

Measurement basis for [#549](https://github.com/ieumbird/ieumdoc/issues/549), 2026-10-26:

- The five most recent successful master CI runs were read with `gh run view --log`:
  [40315514715](https://github.com/ieumbird/ieumdoc/actions/runs/40315514715),
  [40314149215](https://github.com/ieumbird/ieumdoc/actions/runs/40314149215),
  [40310266799](https://github.com/ieumbird/ieumdoc/actions/runs/40310266799),
  [40307984898](https://github.com/ieumbird/ieumdoc/actions/runs/40307984898), and
  [40304484272](https://github.com/ieumbird/ieumdoc/actions/runs/40304484272).
  Across 310 passing test results (58 Editor scenarios plus HTTP Host and crash recovery on both
  OSes per run), the maximum was `folder-memory`, **58.8 seconds**, in 40304484272.
  HTTP crash recovery peaked at 18.0 seconds across the same runs.
- A temporary Playwright reporter recorded `onStepEnd` durations for `pw:api` and `expect` steps,
  including each step's scenario, location and error, and `onTestEnd` scenario durations. A Windows
  `pnpm browser:test` baseline at `ab922e2` passed **58/58**; its longest condition wait was
  `table-authoring`'s notice-detach `locator.waitFor`, **5.372 seconds**, and its longest scenario was
  `folder-memory`, **64.752 seconds**. With the new defaults, `editor-shell`, `table-authoring`,
  `folder-memory`, `equation-insertion` and `desktop-updates` passed again. The maximum condition wait
  was **5.445 seconds** (the same notice), so 15 seconds provides about 2.75 times that duration.
  `folder-memory` took **84.484 seconds** on this run, so the final 120-second scenario budget leaves
  **35.516 seconds (42%)** of margin over the largest local or sampled CI result. These are observed
  runs, not a guarantee about future machines. No global wait increase is used to fit that scenario.
- The production `pnpm browser:test http-host` run passed **2/2**, including real browser crashes
  with the same persistent profile, Restore, Save/Reload and external conflict. The longest HTTP
  condition wait/assertion was **0.888 seconds**; crash recovery took 6.311 seconds and `http-host`
  took 5.596 seconds. Fixed 15-second `Promise.race` guard timers in tab/folder tests and an
  11.278-second recovery-storage evaluation were recorded separately; they are not condition waits
  controlled by the context default.
- No wait needs a new longer override. The existing 30-second `waitForFunction` overrides in
  `equation-insertion` (focus handoff) and `desktop-updates` (first Saved commit) completed in
  **2 ms / 1 ms** in the baseline; both now use the 15-second default and passed the targeted rerun.
  Other existing explicit per-call budgets and all assertions remain unchanged.
- A temporary `timeout-proof` scenario created a **secondary page** from the shared context and
  awaited `waitForFunction(function issue549NeverReady() { return false; })` with **no timeout option**.
  It failed at that wait after **15.011 seconds** with
  `TimeoutError: page.waitForFunction: Timeout 15000ms exceeded.` and
  `evalmachine.<anonymous>:5:17`; the entire failed test, including setup and diagnostics, took
  **16.675 seconds**. This also verifies that newly created tabs inherit the default. The temporary
  scenario and measurement reporter were removed before commit. The normal targeted cases passed
  even under the provisional, stricter 90-second scenario budget; final-head CI verifies 120 seconds.

### Scenario helpers


The shared `reloadDocument` helper waits for the File actions menu to detach and the loading dialog to close with focus returned to File actions before callers focus the editor (#422). For a dirty tab it instead waits for the interactive discard confirmation to receive focus; the caller still chooses the answer. Tests that hold a Reload response must release it before awaiting the helper's completion.

`waitForEditorFocus(page)` waits for the active EditorView's actual focus after a form disappears.
`bibliography-connection` uses it before Undo after citation Remove: removing the form and updating
References does not mean Tiptap's queued focus callback has run. Reload's interactive-prompt branch
also requires an **open** popup (`data-open`); a closing popup may still contain focus and enabled
buttons before its final focus handoff. `citations` holds that handoff and verifies the helper
remains pending before checking the unchanged canonical-byte assertion (#489).

The citation-Remove gate explicitly checks that the focus helper's promise is still pending while
BODY has focus, before releasing callbacks. Replacing that helper with a resolved promise must fail
this same assertion; releasing focus before Undo alone does not prove that the helper waited.

`layout-rules` waits for Settings' language select to receive actual focus before changing the
language and pressing Escape, then for the dialog to detach and its Settings opener to regain
focus (#541). It uses Playwright's shared `expect(locator).toBeFocused()`; `waitForEditorFocus`
checks an EditorView, not a shell control. The 640px regression holds the real initial
focus call and verifies that readiness remains pending before releasing it. It neither focuses
the select early nor reopens a sidebar accidentally dismissed by Escape.

### Native focus selection regression (#542)

**Classification: product defect.** The earlier test-readiness diagnosis was incomplete.
A real code-block click followed within 300ms by Command center → Escape can replace the
retained code selection with H1 position 1, before further input. Typing even hundreds of
milliseconds later then edits the title. Waiting for a native code caret after Escape cannot
repair that lost engine selection; that wait has been removed.

Base UI returns focus through the editor DOM element's native `focus()`. Chromium puts a
native caret at the document start. ProseMirror's existing start-of-document heuristic ignores
resets within 300ms of a pointer/touch, including a click **before** the dialog opened. This
age condition is upstream, not an addition from #495. If the observer accepts the reset first,
the later 20ms check only restores the now-wrong H1 selection. The pinned engine patch now
writes its retained selection synchronously in the focus handler, before a later
`selectionchange` invokes `DOMObserver.flush()` and can adopt the browser caret. `stop()`
itself takes queued records, disconnects, and may schedule a flush after 20ms. The #144 key
counters and #495 later-pointer/touch guard remain unchanged.

`citation-authoring` uses an actual code click, awaits only the initial click's native/engine
caret agreement (#416 is separate), opens the center immediately, escapes, and types ` /`.
Both cases require pointerdown-to-shortcut age strictly below 300ms, but that alone does not
prove synchronous restoration: a slow dialog can move the later observer flush outside the
upstream click window, where its old heuristic can restore the caret. The test therefore
records selection snapshots within the **same root focus event**. Its capture listener must
observe a native document-start caret while the engine still retains the clicked code caret;
its non-capture listener must observe native/engine agreement at that code caret. ProseMirror
registers its non-capture listener at view creation, before this test's listener; capture runs
before it at the target and registration order puts the second snapshot after it. Later
selectionchange/flush or timers cannot repair the recorded snapshots.

The test also requires selection retention **before** input, literal `Code. /` in the code block
and no slash menu. The second case holds the engine's real 20ms check until after typing;
this does not hold the observer's direct start-caret heuristic or DOM-selection adoption.
There is no post-Escape caret polling, selection assignment, sleep, retry or timeout increase.
The earlier master/fix comparisons (shortcut 91ms/64ms versus 100ms/49ms) remain historical
evidence of the user-path defect, not proof that shortcut age bounds the later flush.

With only the synchronous focus write removed, fresh fast and delayed-dialog controls both
passed the capture precondition (engine code position 143, native position 1), then failed the
same-event post snapshot (native still 1). A temporary 400ms dialog delay exposed the old
test's gap: shortcuts at 69ms/58ms, direct heuristic flush at click age 575ms/547ms (focus age
8ms), and all later code-text/menu assertions passed, including with the 20ms check held.
Restoring the write passed both fast and delayed controls with native/engine position 143
inside that same event. Diagnostic delay, runtime markers and logging were removed afterward;
the committed regression observes the real fast path without injecting timing or selection.

`focus-caret` records the browser's initial focus caret in capture phase, before the engine
synchronizes it. Its existing caret-key, modifier and delayed-restore assertions stay intact.
`document-title` retains the forced later-pointer regression from #495. `command-center`
also checks that the shortcut-guide dialog's Escape, Close and outside dismissal preserve
the retained engine selection as well as the existing focus/content checks.

#### Focus audit and product judgement

The retained engine selection is authoritative when focus returns. A real pointer focuses
contenteditable before placing its new native caret; later pointer/touch selection is still
protected by #495. Assigning a native range in an unfocused editor is a test setup operation,
not that pointer path. `figure-authoring` now clicks its Copy source and uses the shared focus
helper before assigning the range. CI run 40318255136 had assigned the range at
11:54:46.238 while the file tree had focus; the editor focused at 46.253 and correctly restored
its engine selection, so the old selected-text wait hung. A helper alone cannot create focus
when the file tree retains it; the real click is required. All rich Copy/Paste assertions remain.

The audit searched all 59 browser-scenario files for native Selection writes and dependent keys
around admission, dialog/form close and tab switches. `citation-authoring` also now waits for
Citation Remove's queued Tiptap focus before Undo (#421's separate Redo cause is not claimed).
The other native-range Copy setup, `table-cell-editing`, already edits a focused cell before
assigning its Copy range. Source/footnotes PRE selection is read-only and outside the engine;
quiet-document/visual-states ranges only measure geometry; focus-caret writes are intentional
restore probes. The remaining reads and native-key setups already use real clicks, synchronous
engine focus, or observable caret readiness. Immediate handoff regressions in new-document,
command-center, property-drafts and continuous-editing remain immediate. Toolbar pointer
buttons prevent mousedown focus loss; keyboard return checks already wait for editor focus.

Electron removes its application menu and has no `findInPage`/`stopFindInPage` integration.
The authorized headless Chrome runner did not open native find UI for Ctrl+F (typing edited
the scratch document), so native Chrome find-bar compatibility is **not verified**. A separate
`window.find()` API probe from an unfocused shell control returned a match and focused the
editor, but focus restoration retained the engine caret instead of that programmatic range.
This is a non-pointer selection-before-focus producer; it is not a verified native find-bar
user path. No browser/Electron find feature or compatibility guarantee is introduced here.

**#502 remains open.** Reference navigation already dispatches a table NodeSelection and calls
`view.focus()`. The #502 report records resets 382ms/866.5ms after focus; this change acts only
on a real focus event and does not filter later native selection changes. Passing the existing
table-authoring scenario does not establish that the unexplained late NodeView reset is fixed.
No broad `nodeReset` guard or #502 resolution is claimed.

`link-authoring` reports a missing selection toolbar within 15 seconds, including the scenario phase, requested range and actual ProseMirror/DOM selection.

### Scenario coverage

`read-view` (#849) verifies native Read/Edit/Source controls and commands, blocked input,
clipboard/drop/assets/history/Save/explicit transactions, retained source/metadata/inline
and link drafts (including a late image-validation response), unchanged recovery/revision,
native copy, block/text keyboard navigation, hover, reading previews, Outline, tab/group
independence and close/reopen protection. `pnpm browser:test read-view --screenshots`
adds manual 1440px light/English, 640px dark/Korean, split-group and paired tab-control
captures under `tmp/read-view-849/`. Its browser uses the checkout's persistent profile.

`source-view` checks canonical/applied content, Save/Reload and retained Visual drafts/history. At 1440/375px it also checks long paragraphs and unbroken URLs for horizontal overflow, one number per source line, continuation alignment, unchanged source/disk/dirty state, and exact native selection/Copy (with Chromium's existing terminal-newline omission). `pnpm browser:test source-view --screenshots` adds manual-review captures under `tmp/source-wrap-captures/`; screenshots are not pass/fail assertions.

`command-center`는 상단 검색창의 취소·포커스 복귀, Ctrl/Cmd+/·명령 전용 모드와 Ctrl/Cmd+P 인쇄 통과, IME와 모달 단축키 경계, 문서 전환 시 미저장 내용·선택·history·속성 초안 보존, 기존 명령의 실제 Save → Reload와 저장 중 제한, 같은 파일명 구분 및 한영 검색을 검증한다. `link-authoring`은 Ctrl/Cmd+'로 기존 링크 폼 열기·적용, 실제 Save → Reload와 이전 폼의 지연 포커스 회귀도 검사한다. 단축키·표시·ARIA와 후보별 Chrome/Edge 자동 검사 방법은 [shortcut contract](../design/editor-ux-shell-v1.md#shortcut-contract-381)에 있다. `pnpm browser:test command-center --screenshots`는 1440/1024/768/375px 진입점·검색창과 한국어 검색 화면을 `tmp/command-center/`에 저장한다. `layout-rules`는 모든 지원 폭에서 제목 줄 40px와 탭 줄 33px로 고정된 두 줄 배치, 제목 줄 검색의 가운데 정렬과 탭 줄 오른쪽 문서 동작의 bounds·비겹침을 함께 검사한다.

`open-files`는 시작 화면 → 폴더 → Sidebar 파일 선택, 최근 폴더와 명시적 sample, 미저장 상태의 Open에 확인창 없이 기존 세션 보존, 탭 닫기 미저장 확인의 Save 성공 후 탭 닫기·Save 실패/충돌 보존·Don't save의 쓰기 없는 탭 닫기·Cancel/Escape와 focus 복귀·draft 손실 안내, Save 진행 중 전환 거부를 검증한다. `new-document`와 `folder-navigation`은 폴더 `+`에서 미저장 확인 없이 New 폼을 열고 기존 세션을 보존하는 흐름을 검증한다. 상세 보호 규칙은 [편집 세션 계약](../design/editing-session-save-v1.md#switching-and-recovery)을 따른다. `source-view-pending`은 Source 처리 중 Sidebar의 다른 파일을 선택해도 현재 문서가 유지됨을 확인한다. `open-files --screenshots`는 시작 화면과 폴더 메뉴, 1440/375px 탭 닫기 미저장 확인창(draft 유무)의 수동 검토용 캡처를 `tmp/` 아래 저장한다.

`folder-memory`는 열린 폴더 기억과 함께 root 섹션 접힘의 Reload/현재 문서 복원, Close/reopen, 복원만으로 쓰기 0회, 유효하지 않은 기록의 다음 사용자 쓰기 정리, 복원 중 사용자 접기·펼치기·Close 경합, 두 탭의 마지막 동작과 reveal 기억을 검증한다(#425, #370). 하위 펼침과 listing은 저장하지 않는다.

`editor-shell`은 문서 설정 대화상자의 TopBar 키보드 진입·닫기·포커스 복귀와 편집기/selection/history/draft 보존, 접힌 탐색 rail, File actions → Reload 취소를 검증한다. `folder-navigation`은 설정 열기와 접기 전후 트리 펼침·스크롤·키보드 위치를, `outline`은 문서 설정의 제목 번호 변경·Undo/Redo·실제 Save/Reload를 검증한다. `layout-rules`는 TopBar 넓게 보기의 문서/dirty 상태 불변과 기기별 유지, 1920/1440/1280/1024/768/390/375px 문서 설정 dialog 경계와 포커스 복귀를 확인한다. 문서 없음·저장 진행·Source에서 문서 설정 진입 제한은 기존 시나리오에서 확인한다. `command-center`는 정확한 명령 이름을 선택해 문서 설정의 양 언어 별칭·modal 전환과 넓게 보기 전환·복원·문서 상태 불변을, `bibliography-connection`은 기존 연결·Save/Reload와 원래 설정 진입점으로의 포커스 복귀를 검증한다. `quiet-document --screenshots`는 기존 동일 상태 비교와 문서 설정을 함께 촬영한다.

`visual-states`는 연 파일 행의 `aria-current="page"`를 기다린 뒤 파일·Outline의 현재 표식과 hover·keyboard focus·geometry를 측정한다. 파일 GET이 진행 중일 때 이전 문서의 Outline 표식은 남아 있을 수 있으므로 새 파일의 준비 신호가 아니다. 현재 상태를 기다린 뒤에도 비색상 표식의 실제 CSS와 너비를 별도로 검사한다.

`ui-language`는 한국어·영어 전환 시 같은 편집기·탭·selection·미저장 내용·속성 초안 보존, Undo/Redo, 표시 중인 오류의 언어 전환, 한국어 UI에서 실제 Save → Reload 및 페이지 재실행 후 언어 설정 유지를 검사한다. `pnpm browser:test ui-language --screenshots`는 동일한 Settings의 영어/한국어 및 375px 한국어 화면을 `tmp/256/`에 저장한다. 기존 영어 시나리오는 재사용 profile의 브라우저 locale을 `en-US`로 고정하며, 언어 시나리오는 종료 시 영어 preference를 복원한다. 초기 언어 정책·저장 실패·번역 키/매개변수·복수형·양 언어 명령 검색은 Editor 테스트에서 검증한다.

The `cross-reference` record-removal wait and #407 observation are retained in [Cross-reference regression history](#cross-reference-regression-history-407).

#409에서 clean 전환은 동기식 세션·세대 표식을 남기고, 복구 목록 읽기가 500ms 기록 턴보다 먼저여도 그 세대의 오래된 기록을 정리한다. 위 `cross-reference`의 제거 대기는 실제 IndexedDB 기록 부재를 확인하는 가치가 있어 유지한다. 즉시 Reload의 제품 회귀는 `document-tabs`가 **같은 browser turn의 Undo → Reload**로 검사하며, 그 사이 삭제 대기·Save를 넣지 않는다. 브라우저 탭 닫기 뒤 재열기에서도 제안이 없어야 하고, 일부 편집만 Undo해 실제 미저장 내용이 남으면 제안과 기록이 유지되어야 한다. `recovery-storage`는 clean 표식 후 disposal, 다른 세션과 기존 v1 기록 보존, IndexedDB가 밀린 사이 새 입력이 온 경우의 live snapshot 보존, 표식 접근 실패 시 기존 기록과 경고를 검사한다. 또한 더 최신 dirty 기록을 커밋한 뒤 이전 clean 표식만 되살려, 두 저장소의 비원자적 crash flush가 새 작업을 지우지 않는지 검사한다. 기존 `recovery`의 다른 창 Save/외부 revision 충돌 검사는 그대로 유지한다.

`footnotes`는 본문 중간에 정의를 쓴 파일을 열어도 디스크·dirty 상태가 바뀌지 않고 안내가 표시되는지, Source와 첫 Save·반복 Save·Reload가 같은 정규화 결과(본문 뒤 첫 참조 순서)를 쓰는지, 단일 미주 구역과 번호, 실제 사용한 참조로 복귀, 미주 핸들(드래그·삽입 없음)과 본문 드롭, 참조 순서 변경의 Undo/Redo, Section 삭제·이동, 원문 초안 보존, Enter/Undo와 Source 복사를 검증한다. `footnotes --screenshots`는 1440/768/375px의 수동 비교용 캡처를 `tmp/visual-refinement/footnotes-*.png`에 저장한다. 저장 문법은 MyST footnote를 유지한다.

거부된 Save의 미저장 편집도 복구 대상이다. `footnotes`는 참조 삭제로 저장할 수 없는 실제 snapshot이 기록된 것을 확인한 뒤, 다음 fixture로 넘어가기 전에 **Discard and reload**로 명시적으로 버린다. 저장된 참조 복원·원본 불변·복구 기록 제거를 확인하고 페이지 Reload를 진행한다(#417). Undo 직후 기록 제거 전 Reload의 제품 문제(#409)는 이 시나리오에서 다루지 않는다.

`citations`는 세 명시적 role과 bibliography 선언이 있는 문서에서 실제 타이핑·인용 잘라내기/붙여넣기·Undo/Redo·번호 갱신·Save/Reload·반복 Save와 한국어/영어 상태 표시를 검증한다. `.bib` 요청이 없는지도 확인한다. 의미·경로 거부 규칙은 Core 테스트가 담당한다. `citations --screenshots`는 1440/375px 수동 검토 자료를 추가하며, 현재 계약과 대표 캡처는 [Citations](../design/citations-v1.md)에 있다. `citation-authoring`은 공통 폴더에서 연 문서에서 슬래시 검색 삽입, 인용 폼의 role·키 그룹·잘못된 키 거부·목록에 없는 키, Escape 취소·Apply·Remove, Undo/Redo, Save → Reload와 `.bib` 바이트 불변을 검증한다.

`desktop-updates`는 mock bridge와 실제 Editor 상태로 Settings, notification, Draft/dirty/Save/Source/asset restart refusal을 검증한다. 키보드로 Settings를 열면 첫 언어 컨트롤의 실제 포커스를 기다린다. 대화상자 표시만으로 Base UI의 비동기 초기 포커스 완료를 가정하지 않으며, 검사에서 포커스를 강제로 이동하지 않는다. 포커스가 오지 않으면 5초 안에 실패한다(#342). `--screenshots`로 UI 비교를 저장할 수 있다. 업데이트 버전/feed/checksum은 Desktop의 real `NsisUpdater` + mock GitHub integration에서 검증하며 동일 의미 사례를 브라우저에 반복하지 않는다.

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

Packaged 테스트의 모든 직접 실행은 `--lang=en-US`로 Chromium UI 언어를 고정하여 OS 언어와 무관하게 영어 UI를 검증한다(#449). 이 인자는 `.md`가 아니므로 Desktop의 문서 인자 처리에서 무시된다. 업데이트 테스트는 설치기가 인자 없이 재실행해도 영어를 유지하도록 테스트 소유 profile의 `ieumdoc.uiLanguage`도 `en`으로 저장한다. 공개 beta.4는 영어 전용이며, 해당 바이너리의 `Ready`와 현재 `ready` 상태 속성은 대소문자를 무시하여 기다린다.

Windows x64에서 아래 명령 중 변경 영역의 tests/typecheck·browser 회귀를 선택한다. 패키징·설치/업데이트·배포 경계 변경 시 관련 `test:update`·`package`·release 자산 검증·`test:packaged`도 로컬 실행하며, 그 외에는 필수 Windows Desktop CI에 맡긴다. `package`와 아래 tests는 공개 Release를 만들지 않는다.

```bash
pnpm --filter @ieumdoc/desktop test
pnpm --filter @ieumdoc/desktop typecheck
pnpm --filter @ieumdoc/desktop test:update
pnpm --filter @ieumdoc/desktop package
pnpm --filter @ieumdoc/desktop exec tsx scripts/verify-release.ts --tag v0.0.2-beta.4
pnpm --filter @ieumdoc/desktop test:packaged
pnpm browser:test desktop-updates
```

`test:update`는 기존 IeumDoc 설치/user data/updater cache가 있으면 거부한다. 테스트 전용 NSIS 두 버전을 로컬 feed로 설치·업데이트하고, 미저장 재시작 거부, Save 후 설치/재실행과 문서 보존, uninstall을 검증한다. 실패 시에도 자신이 설치한 프로세스와 data를 정리한다. 사용자 설치를 지워서 실행하지 않는다. 생성 경로는 `tmp/desktop-update/`와 앱의 기존 generated build/release 폴더다. 테스트 후 normal `package`를 실행해야 테스트 버전/HTTP feed가 산출물에 남지 않는다.

`pnpm --filter @ieumdoc/desktop test:uninstall`은 일회용 Windows CI에서만 실행한다(`CI=true` guard).
clean package를 실제 설치하고 손상된 CLI owner, 외부 파일, helper 누락, 환경 접근 실패를 각각
interactive/silent 제거에 주입한다. 앱·제거 등록 삭제, 불확실한 파일 보존, 실제 PATH 결과와 경고
진단을 확인한다. 4,000자 이상의 한글·따옴표·`%VAR%` PATH 및 stale snapshot 거부도 실제 레지스트리에서
검사한 뒤 원래 PATH로 돌린다. native dialog driver는 테스트가 시작한 uninstaller PID의 OK만 누른다.
진단은 `tmp/desktop-uninstall/`에 수집한다. #604 작업에서는 실제 registry/install/update/packaged
검증과 저장소 밖 npm 설치를 로컬에서 실행하지 않는다.

기본 설치·업데이트 검증은 Stable `0.0.1 → 0.0.2`다. Beta 릴리즈 회귀에서는 아래 PowerShell 명령으로 `0.1.0-beta.1 → 0.1.0-beta.2`도 검증한다. Beta feed에는 Stable Release가 없으며 최초 기본 채널, `beta.yml` 검색과 Beta 설치/재실행, 저장된 preferences·채널·사용자 데이터·Markdown 보존을 확인한다. 이는 테스트 fixture의 보존 검사이며 beta.1의 모든 문서·복구 기록·설정에 대한 하위 호환성 보장은 아니다. 이후 환경 변수를 제거하고 normal `package`를 실행한다.

```powershell
$env:IEUMDOC_TEST_UPDATE_CHANNEL = 'beta'
try { pnpm --filter @ieumdoc/desktop test:update }
finally { Remove-Item Env:IEUMDOC_TEST_UPDATE_CHANNEL }
```

`test:packaged`는 production app의 문서 없는 시작과 선택한 sample, 외부 .md, Save→재실행, Figure, 합성 image paste/asset, folder/New, conflict, 종료 보호, channel 유지와 직접 실행의 시작 시간/working set/TCP listener를 검증한다. app별 고정 profile은 `tmp/desktop-e2e/profiles/`에 재사용하며 Electron 자동화는 설치형 Chrome profile을 사용하지 않는다. 직접 실행한 PID만 종료한다. OS 실제 clipboard/IME, SmartScreen 및 서명된 실제 GitHub delivery는 이 테스트의 판정 대상이 아니다.

직접 실행 계측은 실제 `ChildProcess`가 계측 전후 살아 있는지와 root PID의 실행 파일을 확인하고, 고정된 프로세스 목록에서 생성 순서가 맞는 부모 PID를 따라 자식 트리를 만든다(#491). 처음 관측한 자식의 부모 PID가 더 젊은 앱 소유 프로세스로 재사용되었다면, root보다 오래된 자식은 제외한다. root와 같거나 이후에 생성된 자식은 실행 파일이 앱 디렉터리 안에 있으면 포함하고, 외부 경로·경로 불명이면 PID·생성 시각·부모 PID가 포함된 `Ambiguous ownership` 오류로 계측을 실패시킨다. CI에서도 이 조건을 만나면 같은 오류가 발생하며 묵시적으로 제외하지 않는다. 이미 앱 소유로 확인한 자식은 PID와 생성 시각이 모두 같으면 부모 종료·부모 PID 재사용 뒤에도 소유로 유지한다. 초기·최종 계측과 각 계측의 전후 목록 사이에 이 정보를 전달하며, 두 계측 모두 listener가 없어야 한다. 비동기 수집 중에도 Node가 원래 process handle의 종료를 관측하며, 서로 다른 시계의 launch 시각을 비교하지 않는다. TCP 조회 뒤에도 root와 해당 listener의 PID·정밀 생성 시각을 대조하며 종료·PID 재사용·계측 오류는 실패한다. 로그에는 소유 프로세스의 PID·부모 PID·생성 시각·실행 파일을 남긴다. 재현 가능한 PID 재사용·orphan listener·모호성 거부 회귀와 Windows collector 검사는 Desktop unit tests에 포함된다. 프로세스/TCP/프로세스 조회는 원자적이지 않고 관측 전 사라진 ancestry 전체를 복원하지 못하며, updater/installer 종료 후 잔류 프로세스 전체를 검증하는 assertion은 없다.

CI의 Windows Desktop job이 선택되면 clean package·release 자산 검증·packaged regressions는 항상 실행하고 install/update 단계만 경로 규칙의 `update` 출력에 따라 실행한다. PR에서는 경로별로 job을 선택하며, master push와 미분류 경로 변경은 전체 검증한다. aggregate required job의 성공·skipped·취소 판정과 경로 요약은 [Verification matrix](../../CONTRIBUTING.md#verification-matrix), 실제 규칙은 [ci.yml](../../.github/workflows/ci.yml)을 따른다. 수동 release workflow는 기존 tag를 검증하고 최종 artifact를 검증/업로드한다. 서명/승인 절차는 [Contributing](../../CONTRIBUTING.md#windows-desktop-builds-and-releases), 현재 계약과 검증 결과는 [Desktop distribution](../design/desktop-distribution-v1.md)에 있다.

## Real GitHub Beta update

아래 opt-in 명령의 대상은 `0.0.2-beta.3 → 0.0.2-beta.4`다. 현재 공개 버전은 `0.0.2-beta.4`이며 직전 공개 버전은 `0.0.2-beta.3`다. **이 PC의 설치 상태를 바꾸지 않는다는 제약으로 이번 릴리스의 실제 GitHub 설치·업데이트는 미실행·미검증이다.** [#758 배포 기록](../releases/v0.0.2-beta.4.md)을 따른다. 별도 승인으로 실행할 경우 `ieumdoc: 1` 표식이 있는 Markdown의 저장·보존을 확인한다. CI local-feed는 현재 소스를 테스트 버전으로 각각 빌드하므로 Stable `0.0.1 → 0.0.2`, Beta `0.1.0-beta.1 → 0.1.0-beta.2` fixture를 그대로 유지하며 공개 버전 쌍과 구별한다. 이전 배포·철회 근거는 [#632 기록](../releases/v0.0.2-beta.1.md)에 보존한다.

이 opt-in 검증은 두 버전의 공개 후 명시적 승인 범위에서 실행한다. 모의 Feed 성공은 이 검증의 성공이 아니다. 이미 설치된 IeumDoc이나 사용자 데이터·cache를 삭제해서 실행하지 않는다. 별도 Windows 테스트 계정/VM을 권장한다. 테스트는 기존 설치, `%APPDATA%\IeumDoc`, `%LOCALAPPDATA%\ieumdoc-updater`, 기본 설치 폴더가 하나라도 있으면 거부한다. 이 검사 후에만 테스트가 소유하는 per-user 설치와 profile/cache를 만들고 정리한다. Markdown은 `tmp/desktop-update/documents/`에만 만든다.

```powershell
pnpm --filter @ieumdoc/desktop test:update:github
```

이 opt-in 경로는 두 버전이 이미 public Prerelease인지 확인한 다음 공식 0.0.2-beta.3 installer를 HTTPS로 내려받아 GitHub SHA-256·metadata SHA-512·크기를 대조하고 설치한다. 테스트용 빌드나 HTTP Feed를 사용하지 않는다. 설치된 0.0.2-beta.3의 실제 GitHub Provider로 Beta 업데이트 확인 → 정확히 0.0.2-beta.4 알림 → 사용자 요청 다운로드/검증 → 일반 종료가 설치하지 않음 → IPC 실패/미저장 문서가 재시작 거부 → Save → 설치/재실행 → PE FileVersion·실행 로그·저장된 채널/preferences·user-data canary·Markdown 보존을 확인한다. 더 최신 Beta가 제공되면 0.0.2-beta.4 대신 설치하지 않고 실패한다. 테스트는 Release/tag/asset을 변경하는 API를 호출하지 않는다.

공개 버전 안내는 실제 게시 결과를 확인한 뒤 갱신한다. 서명 인증·SmartScreen reputation 검증은 이 unsigned 경로의 판정 범위가 아니다.

`pnpm browser:test ui-prose-wrap` checks 640px Dark/Korean draft feedback next to Equation/image/Mermaid forms, embedded notices/helpers and table metadata forms using actual computed `word-break` and Korean word rectangles. It also checks that document prose/table cells and literal code/control boundaries retain their wrapping. `--screenshots` replaces only `tmp/ui-wrap-833/after-640-draft-form.png`. The former selector-string unit guard missed feedback rendered beside the form: the form computed to `keep-all` while the sibling status inherited `normal`. Removing the explicit draft-feedback boundary must fail the computed-style assertion.

## Manual review

- [TEST_GUIDE](TEST_GUIDE.md): 실행 옵션, CI, OS IME·실제 앱 clipboard 등 자동화가 판정하지 않는 시나리오.
- [Visual change review](#reviewing-a-visual-change): 같은 상태의 Before/After 캡처와 검토 절차.
- [Layout Rules](../design/editor-layout-rules-v1.md): 정렬·간격·control 치수 기준.

### Reviewing a visual change

A change to the Editor's look or a new visible control states which [Visual Language](../design/editor-visual-language-v1.md), [Layout Rules](../design/editor-layout-rules-v1.md) or [UI pattern](../design/ui-patterns-v1.md) rule it follows, or updates the relevant contract in the same PR. Compare the same states before and after:

1. Capture the clean base before editing and preserve its files separately, or check out the base in a second worktree and start its dev server on a free port (for example 5174).
2. In each checkout, run `pnpm browser:test quiet-document --screenshots` against that checkout's own server; in the base worktree set `IEUMDOC_BROWSER_URL=http://127.0.0.1:5174`. Fixtures and captures belong to the checkout that runs the command.
3. Compare the captures in each checkout's `tmp/visual-refinement/` and attach the representative pairs to the PR.

IeumDoc keeps one stylesheet; comparison captures do not need a runtime old/new theme toggle. Record the actual HEAD, viewport, DPR/zoom, scroll/interaction state and font environment. CSS studies and mockups are not product Before images.

Use 1440px and 640px as the default comparison widths under [ADR-0010](../adr/0010-supported-viewport-and-input.md). Follow the [Windows browser/session rules](../contributing/windows-browser-automation.md), and close processes started for the comparison. Captures are manual evidence, not screenshot assertions or owner visual approval.

## Native document boundary

Success fixtures contain `ieumdoc: 1` and supported content. Core owns syntax/support rejection. CLI tests cover exclusive create, failed text/JSON check and unchanged bytes. Host tests cover refused files and Save revalidation. `pnpm browser:test writeability-preflight` covers native admission errors and retained document, selection, unsaved content and property drafts. `new-document`, `source-view`, `outline` and `property-drafts` retain their interface checks. Block-source and partial read-only scenarios have been removed. Production HTTP and packaged Desktop use the same Core admission.

## Local recovery regression

`pnpm browser:test recovery-storage recovery recovery-structure` checks actual IndexedDB ordering/deletion barriers and the user recovery flow with real Vite files. `recovery-structure` adds New/title/Enter, Equation/Table/Figure content and captions, dirty Restore → Save → Reload, readable fallback and live Korean/English refusal reasons. `pnpm browser:test recovery --screenshots` combines those UI assertions with 1440/375px captures of empty/list/prompt/settings/clear/failure/incompatible states in `tmp/296/`; `pnpm browser:test recovery-structure --screenshots` captures the structured recovery/fallback in `tmp/331-*.png`. The snapshot initialization/Save replay semantics remain covered by `document-session` and Editor tests; they are not repeated as a Host semantic matrix.

To verify recovery across production HTTP browser and packaged Desktop process restarts ([#296](https://github.com/ieumbird/ieumdoc/issues/296)), run after the builds described above:

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

Both HTTP crash restarts explicitly request `?path=…` and expect that file's recovery review
dialog under the [startup precedence contract](../design/editing-session-save-v1.md#tab-navigation-memory-383).
The durability assertion concerns the committed IndexedDB record, not navigation preferences:
after a forced process kill, older clean-tab memory can return and hide the start-screen list (#417).

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
profile removal and another origin/device are outside that proof. The 500ms interval is scheduling, not a recording deadline.

Past local execution, required CI and proof artifacts: [Host recovery execution history](#host-recovery-execution-history-296-pr3).

## Evidence and history

### Settings initial-focus race (#541)

Run 40297651538 attempt 1, job 121487564515, artifact `editor-browser-ci-logs-2`
fails at the 390px Korean-to-English pass: the Sidebar's **Open folder…** click, after
`language('en')`, times out at 15000ms. Input event 70 sends Escape to **Settings**,
not the language select; events 71–73 move focus to **Expand sidebar**. The failure
state and screenshot show a closed sidebar and no visible dialog. The click trace
never resolves its target or reports pointer interception. This is an initial-focus
readiness race, not evidence of a lingering modal backdrop or failed final focus.

`selectOption` can finish without focusing the select while Base UI still owes its
animation-frame initial focus. Escape on the opener then also dismisses the phone
sidebar. Holding that actual focus call reproduces the original click timeout; the
fixed readiness assertion stays pending until release and the full scenario passes.
Replacing the wait with an immediately resolved promise fails the pending assertion.
All existing typography, geometry and document-preservation assertions remain.

### Focus and selection race investigation (#489)

The downloaded run artifacts (input events, browser state, trace and console errors) distinguish
test readiness from product selection handling in the three fixed paths. Console/page errors
were empty in these preserved failures.

| Scenario / artifact | Cause and classification | Regression boundary |
| --- | --- | --- |
| `bibliography-connection`, run 40248680852 / job 121335724273 | Test wait: Remove unmounted the citation form, leaving BODY focused. Ctrl+Z at 3392.4ms (event 142) preceded editor focus at 3393.6ms (145), so no Undo transaction ran. | Hold Remove's queued animation-frame callbacks; wait for actual editor focus before Undo. References and Undo assertions are unchanged. |
| `document-title`, run 40252460131 / first attempt | Product/engine defect: after Add a title focused H1, the delayed 20ms focus check could overwrite the paragraph's native caret before selectionchange read it. The retained state stayed at H1 position 1 (133–138). | Hold that actual engine callback and release it at paragraph mouseup. The check must respect the later pointer; the original empty-title removal and clean-document assertions remain. |
| `citations`, run 40246268525 / job 121328398849 | Test wait: the #448 helper could mistake the closing Reload modal's enabled buttons and retained focus for an interactive discard prompt. It returned before final focus reached File actions (134); Backspace went to that button (135). | A prompt must still have `data-open`. Hold the final File actions focus and assert Reload has not returned, then retain the exact canonical-byte comparison. |

The table selection reset is tracked separately in [#502](https://github.com/ieumbird/ieumdoc/issues/502).
`table-authoring` remains identical to master, including its failure-only diagnostics. No wait is
added to conceal that reset, and this PR does not claim to fix it.

The final bibliography proof checks that the helper remains pending while BODY has focus: the
same test fails with an immediate-return helper and passes with the real focus wait. The title
scenario holds the actual post-focus callback until paragraph mouseup, and citations holds the
closing Reload focus handoff. These checks retain the original assertions and existing timeouts.

Run 40076829146 for #421 has no input-events recording. Its trace confirms Undo succeeded and
Redo left the citation present, but cannot establish the key target or history transaction at
failure. Citation authoring's Redo assertions remain unchanged. #421 and the separate fast text-caret synchronization issue #416 are
not claimed fixed by #489.

`figure-draft-race`의 미주 case는 본문을 한 번 클릭한 직후 native anchor/focus가 모두 클릭한 본문 text offset에 있고 collapsed이며 EditorView focus가 유지되는지 대기 없이 단언한다. 즉시 engine snapshot도 결과에 보존한다. 이후 기본 assertion 제한시간 안에서 같은 native 위치·focus와 정확한 engine TextSelection이 일치하면 곧바로 입력하고, 본문 삽입 위치·미주 전체 노드 불변·readonly 복귀 및 기존 Save/Reload를 검사한다. 다른 네 case의 즉시 engine 단언은 유지한다. 이는 [#416 소유자 결정](https://github.com/ieumbird/ieumdoc/issues/416#issuecomment-6494573226)의 경계에 따른 [#811](https://github.com/ieumbird/ieumdoc/issues/811)의 테스트 관찰 조정이며, CI의 native/engine 불일치 구간에서 실제 입력이 안전하다고 입증하거나 제품을 수정한 것은 아니다. #839부터 문서가 안내 표시로 움직이지 않으므로 다섯 독립 case는 서로 다른 본문 내부 offset을 클릭한다. 이전 case와 같은 좌표를 500ms 안에 반복해 ProseMirror가 double/triple click으로 묶는 것을 피하며, 각 위치의 정확한 caret·입력 단언은 유지한다. 추가 클릭·selection 지정·강제 flush·sleep이나 timeout/retry 변경은 사용하지 않는다.

### Cross-reference regression history (#407)

`cross-reference`는 삭제 안내의 한국어 검사에서 복구 기록이 실제 커밋된 상태를 만든다. #407은 Undo 뒤 Apple 단축키 검사를 위한 페이지 Reload 전에 그 문서의 복구 기록 제거를 기다리도록 했다. 당시에는 Undo 완료 뒤에도 기록이 남은 채 Reload하면 탭 복원이 복구 dialog를 제안하여 Sidebar의 Files가 접근성 조회에서 제외될 수 있었다(#405).

### Real GitHub Beta update history

2026-10-25 게시된 `0.1.0-beta.1`의 실제 공개 `0.0.1-beta.4 → 0.1.0-beta.1` 업데이트가 통과했다(검증 확인: 2026-10-25/26). 정확한 버전 감지·다운로드 검증, 일반 종료 시 설치 없음, IPC 실패·renderer 오류·dirty 상태의 재시작 거부, Save → 설치 → 재실행, FileVersion과 preferences·Beta 채널·user-data canary·네이티브 Markdown 보존을 확인했다. 첫 시도는 공개 beta.4의 `Ready`를 lowercase `ready`로 기다려 업데이트 전에 실패했고, 한국어 Windows에서 갱신 앱의 한국어 UI도 하네스에 영향을 주었다(#449). #450의 영어 UI 고정·대소문자 무시 대기 후 재실행은 통과했다. 같은 수정으로 한국어 Windows의 로컬 `test:packaged`도 9/9 통과했으며, 테스트 소유 설치·registry·app data·cache·process는 정리했다. 당시 자산과 상세 결과는 [0.1.0-beta.1 릴리즈 기록](../releases/v0.1.0-beta.1.md)에 보존한다. 이 Release·자산·원격 tag는 이후 #632에서 철회되었으며, 이 과거 성공은 현재 `0.0.2-beta.3`의 실제 GitHub 업데이트 검증이 아니다.

2026-10-15 beta.4 게시 후 실제 `beta.3 → beta.4` 공개 업데이트도 통과했다. 공개 자산과 설치·재실행·문서/설정 보존 결과는 [beta.4 릴리즈 기록](../releases/v0.0.1-beta.4.md)에 있다. 당시 공개 beta.3은 네이티브 문서 이전 버전이라 앞쪽 Frontmatter를 본문 블록처럼 편집하므로, beta.3에서 출발하는 실제 공개 업데이트 경로만 표식 없는 Markdown을 사용했다. 이 beta.3 전용 fixture 예외는 현재 대상에는 적용되지 않는다.

2026-10-14 beta.3 게시 후 실제 `beta.2 → beta.3` 공개 업데이트도 통과했다([beta.3 릴리즈 기록](../releases/v0.0.1-beta.3.md)).

2026-10-12 승인된 beta.2 게시 후 실제 `beta.1 → beta.2` 공개 업데이트 검증이 통과했다. 공개 바이너리와 GitHub Provider를 사용한 결과는 [릴리즈 기록](../releases/v0.0.1-beta.2.md)에 있다.

### Host recovery execution history (#296 PR3)

2026-10-16 local execution established Windows x64 packaged Desktop and production HTTP/Chrome.
Required CI (including Linux HTTP) remains necessary before issue closure; no installer/update,
publication or other-platform completion is implied. Compact machine-readable evidence records
process IDs/profile/origin and assertions in `tmp/desktop-e2e/recovery-proof.json` and the HTTP
test's `tmp/browser-results/http-recovery-*/host-recovery-proof.json` (also attached to the test).

The prior final-v3 two-page
ticket p95 around 2.4s remains a limitation, not a recording deadline.
This prior measurement was documented on 2026-10-16 in [the Host recovery verification commit](https://github.com/ieumbird/ieumdoc/commit/ef1c09a63002827a38f2ea230e134c973cdb9344); the [recovery contract](../design/editing-session-save-v1.md#local-recovery-records-296-pr2) identifies it as a known limitation, not a guarantee or a new PR3 measurement.

## Docling app conversion (#797)

`pnpm browser:test docling-server` uses a worker-owned fake HTTP service and
scratch PDF, with the real Host routes. The same scenario can target a running
production HTTP Host via `IEUMDOC_BROWSER_URL`; no external Docling is used in
normal CI. Browser profiles follow the existing persistent-profile rules.

For manual real-service verification, first prepare the pinned local service
using the [administrator guide](../guides/docling-server.md), then run from the
checkout in PowerShell:

```powershell
$env:IEUMDOC_DOCLING_LIVE = "1"
try { pnpm browser:test docling-server --screenshots }
finally { Remove-Item Env:IEUMDOC_DOCLING_LIVE }
```

This explicitly selected mode uses the committed NIST PDF, copies it into
`tmp/797-real`, converts through the app and checks automatic comparison opening.
It never starts/stops Docker for the caller. Results remain in that scratch
folder; captures are in `tmp/docling-797-captures`. The caller owns the external
service's startup/model preparation and cleanup. Ordinary `--screenshots` uses
the fake service to collect Settings success/failure, PDF-menu, progress and
completion Light/Korean/Dark review states separately from normal CI assertions.

## Docling worker runtime (#853)

Automated synthetic checks (no local Docling server):

```powershell
pnpm exec tsx --test apps/editor/test/plugin-runtime.test.ts apps/editor/test/docling-server.test.ts apps/desktop/test/host-protocol.test.ts
pnpm browser:test docling-server docling-compare
```

The [runtime contract](../design/plugin-runtime-v1.md) describes the assertions,
shared installation and crash leftovers. Tests isolate `IEUMDOC_PLUGINS_DIR` and
`IEUMDOC_DOCLING_SETTINGS_FILE`. For a caller-owned Vite server set both variables
before starting it, use port 5282, then set `IEUMDOC_BROWSER_URL` for the runner.
Both scenarios explicitly set their UI language; reuse the checkout's persistent
profile. Shut down the caller-owned server after the runner closes its browser.
Offline CLI and packaged Desktop worker conversion smoke tests run in required
Windows/Linux and Windows package CI respectively. On this Windows development
PC do not run Desktop packaging, update/uninstall or Edge for #853.

Manual acceptance against an operator's existing **real** pinned Docling service:

1. Use a separate `IEUMDOC_PLUGINS_DIR`/settings file and a disposable copy of a
   known PDF. Record original PDF/JSON hashes. Start Desktop or `ieumdoc serve`
   with the same OS user/installation; do not launch a Docling service from this
   repository's test or agent workflow.
2. In the unchanged Docling Settings check the server, convert from the PDF menu
   or Command Center, and confirm progress, complete source/native bundle and
   automatic comparison. Check the conversion record's image/content integrity,
   canonical Core reopen and unchanged original hashes. Record task ID/server
   versions and separately judge OCR/content fidelity.
3. Register the same trusted manifest through Desktop's `/api/worker-plugins` and
   execute a conversion through independent `serve` with the same plugin folder.
   Disable while pending: accepted work drains, new UUIDs are refused. Restore
   registration afterward. This is not cross-Host cancellation or shared UI state.
4. Record remaining real-service/model/capacity errors without claiming synthetic
   tests proved them. A stopped worker may leave an external server task running;
   inspect it using the task ID before explicitly submitting a new UUID.

Real-service verification was not run for #853. Required packaged CI establishes
packaged execution; operator environment and visual/OCR fidelity remain manual.
