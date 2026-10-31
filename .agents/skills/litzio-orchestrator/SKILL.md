---
name: litzio-orchestrator
description: Orchestrate several Litzio GitHub issues end to end by planning waves, launching Paseo worker agents in isolated worktrees, reviewing risky PRs, and merging through the merge queue. Use only when the user explicitly invokes litzio-orchestrator inside the litzio/litzio repository.
---

# Litzio Orchestrator

여러 이슈를 작업자 agent에게 나눠 맡기고, 결과 PR을 확인해 merge queue로 병합하는 통합 담당자 절차다. 오케스트레이터는 직접 제품 코드를 고치지 않는다. 판단, 배정, 확인, 병합, 정리를 맡는다. 사용자에게는 한국어로 보고한다.

이 스킬은 모델과 하네스에 의존하지 않는다. 작업자 생성·메시지·상태 확인은 Paseo MCP 도구가 있으면 그것을, 없으면 `paseo` CLI를 쓴다. 사용법은 전역 `paseo` 스킬을 따른다. 스크립트 경로는 이 SKILL.md가 있는 폴더 기준이다.

## 0. 적용 범위 확인

- `git remote get-url origin`이 `github.com/litzio/litzio`이 아니면 즉시 멈추고 이 스킬은 이 저장소 전용이라고 알린다.
- 사용자가 이 스킬을 명시적으로 호출한 경우에만 쓴다. 단일 이슈를 직접 구현하는 일에는 쓰지 않는다.
- 저장소 규칙의 우선순위는 사용자 지시 → [AGENTS.md](../../../AGENTS.md) → [CONTRIBUTING.md](../../../CONTRIBUTING.md) → 이 스킬이다. 충돌하면 사용자에게 어떤 규칙에서 벗어나는지 밝힌다.

## 지휘 원칙 (모든 단계 공통)

**멈추지 않는다.** 하네스는 턴이 끝나면 다음 알림이나 사용자 메시지가 올 때까지 오케스트레이터를 깨우지 않는다. 턴을 끝내기 전에 다음을 확인한다.

- 진행 중인 항목마다 오케스트레이터를 다시 깨울 장치가 걸려 있다. 작업자·리뷰어의 완료 알림(notifyOnFinish), 또는 queue 감시(6절)가 그 장치다.
- 오케스트레이터가 내릴 결정이 남아 있지 않다. 남아 있으면 지금 결정하고 지시를 보낸 뒤 끝낸다.
- 병합·작업자 보고·리뷰 결과 같은 중간 완료를 받았으면, 같은 턴에서 다음 할 일(다음 이슈 배정, 재등록, 정리)까지 시작했다.

**판단은 오케스트레이터가 내린다.** 승인된 결정 범위 안의 판단은 사용자나 작업자에게 넘기지 않는다. 진단 실행 여부, 테스트 최소 수정 방향, 재실행 여부, 리뷰 필요 여부가 여기에 속한다. 작업자에게 조사를 맡길 때는 범위와 끝낼 기준(무엇이 확인되면 어떤 조치로 갈지)을 함께 준다. 결과가 오면 그 턴에 판정한다. 사용자에게는 결정 범위 밖의 제품 판단만 묻는다.

**보고 형식.**
- 사용자에게는 한국어로만 보고한다.
- 질문에는 일반 문장으로 답하고, 응답 끝에 지휘 중인 작업의 현황 표 하나를 둔다. 표 위아래에는 빈 줄을 둔다.
- 바뀐 것이 없는 "대기 중" 보고를 반복하지 않는다.
- 절차 문서 링크를 의례적으로 붙이지 않는다.

**작업자 지시 문장.**
- 작업자·리뷰어에게는 띄어쓰기를 지킨 정상 문장으로 지시한다. 식별자를 붙여 쓴 압축 문장은 쓰지 않는다.
- 단순 상태 보고에 수신 확인 답신을 보내지 않는다. 같은 지시를 다시 보내지 않는다.

**인계받을 때.** 다른 오케스트레이터가 만든 작업자의 완료 알림은 새 오케스트레이터에게 오지 않는다. 진행 중인 작업자와 리뷰어마다 `send_agent_prompt`(notifyOnFinish: true)로 "현재 상태를 짧게 보고하고 하던 일을 계속하라"를 보내 알림을 넘겨받는다. 지시 내용은 바꾸지 않는다.

## 1. 시작 전에 사용자에게 확정받을 것

추천안을 함께 제시하고 한 번에 확정받는다. "추천안대로"라는 답도 승인으로 본다.

- **범위:** 대상 이슈 목록. 열린 이슈는 `gh issue list --state open --json number,title,labels`로 확인한다. 결정 이슈(`type:decision`), 규모가 큰 기능, 원인이 확정되지 않은 버그, `status:deferred`는 이번 범위에서 빼거나 결정만 받는 후보로 분류한다.
- **결정 이슈의 결정:** 각 결정 이슈마다 추천안을 쓰고 승인받는다. 승인 전에는 구현을 맡기지 않는다.
- **작업자 모델:** 사용자가 지정한 provider/model만 쓴다. 쓰지 말라고 한 provider는 어떤 단계에서도 쓰지 않는다. 지정이 없으면 물어본다. 규모별 effort 기본값: 작은 UI·CSS·문구는 medium, 일반 기능은 high, schema·셸 구조·상태 경합은 xhigh. `ultra`처럼 스스로 하위 agent를 만드는 설정은 쓰지 않는다. 리뷰어도 사용자가 지정한 작업자 provider/model에서 고른다. 사용자가 둔 예외(예: "설계 판단 작업은 다른 모델")를 리뷰어 선정이나 다른 단계로 넓히지 않는다.
- **리뷰 범위:** 기본은 CONTRIBUTING 2단계의 위험 기준이다. 위험 PR에만 독립 리뷰를 붙이고, 나머지는 오케스트레이터 확인 기록으로 승인한다. 사용자가 모든 PR 리뷰를 원하면 그대로 따른다.
- **병합 권한:** 조건을 만족한 PR을 오케스트레이터가 queue에 넣어도 되는지, 시각 변경은 승인을 기다릴지 확인한다.

## 2. 계획

1. 이슈 본문과 관련 Accepted ADR·Implemented 계약([docs index](../../../docs/README.md))을 읽는다. 주장하는 사실은 코드로 확인한다.
2. 이슈마다 고칠 파일을 예상하고, 같은 파일(예: `App.tsx`, `Sidebar.tsx`, `TopBar.tsx`, `styles.css`, `tokens.css`, `editor-schema.tsx`, `editor-ux-shell-v1.md`, 명령센터 테스트)을 고치는 이슈끼리 선후를 정한다. 해결이 다른 이슈에 포함되면(예: 구조 변경이 버그를 함께 고침) 한 작업으로 묶는다.
3. 결정 없이 시작할 수 있고 서로 겹치지 않는 이슈를 1차로, 나머지를 선행 PR 병합 순서대로 배치한다. 동시에 실행하는 작업자는 5명 이하로 둔다.
4. 계획을 표로 보고한다(이슈, 설정, 주로 고칠 파일, 선행 조건). 제외한 이슈와 이유도 쓴다.

## 3. 작업자 실행

- 이슈마다 새 Paseo worktree를 `baseBranch: "origin/master"`에서 branch-off로 만든다(로컬 master는 낡았을 수 있다). 병합 직후의 worktree를 재사용하지 않는다(workspace가 자동 archive되어 작업자가 사라질 수 있다).
- 작업자는 쓰기와 네트워크가 가능한 모드로 만든다. 프롬프트는 [worker-prompt.md](references/worker-prompt.md)의 공통 규칙을 그대로 붙이고, 이슈별 범위와 승인된 결정만 바꾼다.
- 만든 뒤 1–2분 지나서 상태가 `running`인지, worktree가 실제로 있는지 직접 확인한다. 알림이 없다는 이유로 "진행 중"이라고 보고하지 않는다.
- 작업자가 모델 용량 오류로 멈추면 같은 agent에 "`git status`, 최근 커밋, 열린 PR을 확인한 뒤 이어서 진행하라"를 보낸다.
- 작업자가 결정이 필요하다고 멈추면, 승인된 결정 범위에서 답할 수 있으면 근거와 함께 답한다. 범위 밖이면 사용자에게 묻는다.

### 브라우저 규칙 (Windows)

브라우저는 checkout마다 하나인 persistent profile만 쓴다. Edge 채널, 패키지된 Desktop 검사, 새 profile probe는 로컬에서 실행하지 않는다. 상세 근거는 [Windows browser automation](../../../docs/contributing/windows-browser-automation.md)에 있다.

계정 잠금 카운터 대기는 그 PC에 계정 잠금 임계값이 켜져 있을 때만 적용한다. `net accounts`의 잠금 임계값이 `Never`(0)이면 이 대기와 카운터 보고를 생략한다. 켜져 있으면 새 profile의 첫 실행마다 Windows 로그온 실패가 1회 기록된다. 그때는 다음을 따른다.

- 카운터는 PowerShell `([ADSI]"WinNT://$env:COMPUTERNAME/$env:USERNAME,user").psbase.InvokeGet('BadPasswordAttempts')`로 읽는다.
- 새 worktree를 만들기 전에 카운터가 3 이상이면 0으로 돌아올 때까지 기다린다.
- 작업자는 실행 전 카운터가 5 이상이면 3 미만이 될 때까지 기다린다(최대 20분). 6 이상이면 중단하고 보고한다.

리뷰어는 구현자의 worktree를 같이 쓴다. 이때 구현자에게는 브라우저와 서버 실행을 멈추라고 먼저 알린다(같은 profile을 동시에 쓰면 Chrome 기동이 실패하고 fixture가 덮어써진다).

## 4. PR이 올라왔을 때

1. `gh pr view <N> --json files`와 `gh pr diff <N>`로 diff를 직접 읽는다. 확인할 것: 범위 밖 변경, 테스트 단언 약화(삭제·완화·위치 고정·timeout 증가·재시도), 계약 문서 갱신, 승인된 결정과의 일치.
2. CI 실패를 조사하기 전에, 같은 시나리오나 증상에 대한 기존 이슈와 소유자 결정을 먼저 찾는다(`gh issue list --state all --search "<시나리오 이름>"`). 이미 알려진 제한으로 결정된 것이면 그 결정에 맞춰 바로 조치한다. CI 실패를 작업자가 보고하면 원인 판정을 확인한다. 기준은 "사람이 실제로 낼 수 있는 속도와 순서에서 생기는가"다. 그렇다면 제품 결함이므로 제품을 고친다. 아니면 단언을 약화하지 않고 실제 상태를 기다리게 테스트를 고친다. 재실행은 artifact 분석 뒤에만 한다. 이 PR과 무관하고 처음 나온 간헐 실패면 실패한 job만 재실행하고, 재발하면 이슈로 등록한다.
3. 리뷰가 필요하면 5절대로 리뷰어를 붙인다. 필요 없으면 6절로 간다.

## 5. 독립 리뷰

- 붙이는 기준은 CONTRIBUTING 2단계의 위험 PR이다. editor schema·직렬화·저장 경로, 미저장 draft·복구, 셸 구조 변경, 성능·상태 경합, 문서 데이터가 바뀌는 연산, 보안·릴리스·CI workflow가 여기에 해당한다. 작은 UI·CSS·문구·테스트만·문서만의 수정은 오케스트레이터 확인으로 대신한다. 시각 변경은 캡처가 나오는 즉시 CI를 기다리지 않고 검토한다.
- 리뷰어는 구현에 참여하지 않은 새 agent이고, 프롬프트는 [reviewer-prompt.md](references/reviewer-prompt.md)를 쓴다. 이 PR에서 특히 위험한 지점을 중점 확인 항목으로 구체적으로 적는다.
- 리뷰 중 구현자가 head를 바꾸면 리뷰어에게 최종 head 기준으로 판정하라고 알린다.
- `REQUEST_CHANGES`면 지적을 구현자에게 전달하고, 수정 후 같은 리뷰어 또는 새 리뷰어에게 재검토를 맡긴다.

## 6. 병합

[pr-gate.mjs](scripts/pr-gate.mjs)로 확인하고 queue에 넣는다. queue 투입은 항상 `pr-gate.mjs --enqueue`로만 한다. `enqueuePullRequest` GraphQL을 직접 호출하지 않는다. `gh pr merge`는 이 저장소에서 거부된다(auto-merge 비활성).

```bash
node <skill>/scripts/pr-gate.mjs --pr <N>                                  # 검사만
node <skill>/scripts/pr-gate.mjs --pr <N> --enqueue --note-file <note.md>  # 기록 댓글 후 enqueue
```

- 스크립트는 저장소, PR head와 원격 브랜치 일치, Draft 여부, 충돌, 필수 CI 전체 성공, 미해결 review thread 0, 저장소 validator의 AI trailer를 확인한다. 하나라도 실패하면 enqueue하지 않는다. Draft PR은 `gh pr ready <N>`로 바꾼 뒤 다시 확인한다.
- 기록 댓글에는 리뷰 여부와 근거(독립 APPROVE head, 또는 생략 사유와 오케스트레이터가 확인한 사항)를 쓴다.
- 승인 뒤 head가 바뀐 경우에는 CONTRIBUTING 5단계를 따른다.
  - 위험 PR에서 제품 코드나 테스트 단언이 바뀌었으면 새 APPROVE를 받는다.
  - 충돌 해결, 문서만의 변경, 단언을 바꾸지 않는 테스트 대기 보완은 리뷰어를 다시 부르지 않는다. `git show --remerge-diff <merge>`와 추가 diff를 직접 확인하고, 새 head SHA로 확인 기록을 남긴다.
- master가 움직였다는 이유만으로 PR에 master를 반영하지 않는다.

### queue 감시와 실패 처리

[queue-watch.mjs](scripts/queue-watch.mjs)로 상태를 본다. `--wait`는 상태가 바뀌면 출력하고 끝난다. enqueue한 뒤에는 반드시 감시를 걸고 턴을 끝낸다.

- **완료 알림이 오는 백그라운드 실행이 있는 하네스(예: Claude Code):** 오케스트레이터가 직접 `--wait`를 백그라운드로 실행한다.
- **그런 기능이 없는 하네스(예: Codex):** 그 PR의 작업자에게 `queue-watch.mjs --wait <N>` 실행과 결과 보고를 맡긴다. 작업자의 완료 알림이 오케스트레이터를 깨운다. 작업자가 이미 archive됐으면 감시만 하는 agent를 띄워 맡긴다.

```bash
node <skill>/scripts/queue-watch.mjs 560 561 562           # 현재 상태
node <skill>/scripts/queue-watch.mjs --wait 560 561 562    # 병합·이탈 시 출력 후 종료
```

queue에서 병합 없이 빠지면 원인을 먼저 가른다.

- **충돌(`CONFLICTING`):** 원래 작업자에게 `origin/master` merge와 충돌 해결을 맡긴다. 앞서 병합된 PR이 무엇을 바꿨는지 함께 알려 준다.
- **merge_group CI 실패:** `gh run list --event merge_group`에서 실패 run을 찾고 `gh run view <id> --log-failed`로 시나리오를 확인한다. 이 PR의 테스트면 원래 작업자에게 4절 기준으로 판정·수정을 맡긴다. 앞서 병합된 다른 PR이 만든 master 결함이면 새 worktree에서 별도 수정 PR을 만들고, 원래 PR은 head가 그대로이므로 그 사실을 댓글에 남기고 다시 enqueue한다.

## 7. 정리와 보고

- PR이 병합되면 그 worktree를 archive한다(작업자와 리뷰어 포함). 결과만 남기고 끝난 작업자는 archive한다.
- 하나의 PR이 병합될 때마다, 병합을 확인한 그 턴에서 맞물린 다음 작업을 시작한다. 선행 조건이 풀린 이슈의 작업자 배정, master 반영이 필요한 PR에 대한 지시가 여기에 해당한다. 그 뒤 사용자에게 다음 할 일을 짧게 보고한다. 병합 보고만 하고 멈추지 않는다.
- 끝나면 확인한다: 대상 이슈의 상태, 열린 PR, 남은 worktree와 작업자. 직접 시작한 백그라운드 감시도 종료한다.
- 최종 보고: 병합한 이슈·PR 표(리뷰 여부 포함), 저장소 절차에서 벗어난 점, 남은 일과 확인하지 못한 것(재현·실측·실제 IME 등), 리뷰의 비차단 메모, 처음 나온 간헐 실패, 정리 상태.
