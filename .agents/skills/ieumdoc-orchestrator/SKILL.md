---
name: ieumdoc-orchestrator
description: Orchestrate several IeumDoc GitHub issues end to end by planning waves, launching Paseo worker agents in isolated worktrees, reviewing risky PRs, and merging through the merge queue. Use only when the user explicitly invokes ieumdoc-orchestrator inside the ieumbird/ieumdoc repository.
---

# IeumDoc Orchestrator

여러 이슈를 작업자 agent에게 나눠 맡기고, 결과 PR을 확인해 merge queue로 병합하는 통합 담당자 절차다. 오케스트레이터는 직접 제품 코드를 고치지 않는다. 판단, 배정, 확인, 병합, 정리를 맡는다. 사용자에게는 한국어로 보고한다.

이 스킬은 모델과 하네스에 의존하지 않는다. 작업자 생성·메시지·상태 확인은 Paseo MCP 도구가 있으면 그것을, 없으면 `paseo` CLI를 쓴다. 사용법은 전역 `paseo` 스킬을 따른다. 스크립트 경로는 이 SKILL.md가 있는 폴더 기준이다.

## 0. 적용 범위 확인

- `git remote get-url origin`이 `github.com/ieumbird/ieumdoc`이 아니면 즉시 멈추고 이 스킬은 이 저장소 전용이라고 알린다.
- 사용자가 이 스킬을 명시적으로 호출한 경우에만 쓴다. 단일 이슈를 직접 구현하는 일에는 쓰지 않는다.
- 저장소 규칙의 우선순위는 사용자 지시 → [AGENTS.md](../../../AGENTS.md) → [CONTRIBUTING.md](../../../CONTRIBUTING.md) → 이 스킬이다. 충돌하면 사용자에게 어떤 규칙에서 벗어나는지 밝힌다.

## 1. 시작 전에 사용자에게 확정받을 것

추천안을 함께 제시하고 한 번에 확정받는다. "추천안대로"라는 답도 승인으로 본다.

- **범위:** 대상 이슈 목록. 열린 이슈는 `gh issue list --state open --json number,title,labels`로 확인한다. 결정 이슈(`type:decision`), 규모가 큰 기능, 원인이 확정되지 않은 버그, `status:deferred`는 이번 범위에서 빼거나 결정만 받는 후보로 분류한다.
- **결정 이슈의 결정:** 각 결정 이슈마다 추천안을 쓰고 승인받는다. 승인 전에는 구현을 맡기지 않는다.
- **작업자 모델:** 사용자가 지정한 provider/model만 쓴다. 쓰지 말라고 한 provider는 어떤 단계에서도 쓰지 않는다. 지정이 없으면 물어본다. 규모별 effort 기본값: 작은 UI·CSS·문구는 medium, 일반 기능은 high, schema·셸 구조·상태 경합은 xhigh. `ultra`처럼 스스로 하위 agent를 만드는 설정은 쓰지 않는다.
- **리뷰 범위:** 기본은 CONTRIBUTING대로 모든 PR에 독립 리뷰다. 사용자가 줄이라고 하면 위험 기준(5절)에 맞는 PR에만 리뷰를 붙이고, 생략한 PR에는 확인 기록 댓글을 남긴다.
- **병합 권한:** 조건을 만족한 PR을 오케스트레이터가 queue에 넣어도 되는지, 시각 변경은 승인을 기다릴지 확인한다.

## 2. 계획

1. 이슈 본문과 관련 Accepted ADR·Implemented 계약([docs index](../../../docs/README.md))을 읽는다. 주장하는 사실은 코드로 확인한다.
2. 이슈마다 고칠 파일을 예상하고, 같은 파일(예: `App.tsx`, `Sidebar.tsx`, `TopBar.tsx`, `styles.css`, `tokens.css`, `editor-schema.tsx`, `editor-ux-shell-v1.md`, 명령센터 테스트)을 고치는 이슈끼리 선후를 정한다. 해결이 다른 이슈에 포함되면(예: 구조 변경이 버그를 함께 고침) 한 작업으로 묶는다.
3. 결정 없이 시작할 수 있고 서로 겹치지 않는 이슈를 1차로, 나머지를 선행 PR 병합 순서대로 배치한다. 동시에 실행하는 작업자는 5명 이하로 둔다.
4. 계획을 표로 보고한다(이슈, 설정, 주로 고칠 파일, 선행 조건). 제외한 이슈와 이유도 쓴다.

## 3. 작업자 실행

- 이슈마다 새 Paseo worktree를 `master`에서 branch-off로 만든다. 병합 직후의 worktree를 재사용하지 않는다(workspace가 자동 archive되어 작업자가 사라질 수 있다).
- 작업자는 쓰기와 네트워크가 가능한 모드로 만든다. 프롬프트는 [worker-prompt.md](references/worker-prompt.md)의 공통 규칙을 그대로 붙이고, 이슈별 범위와 승인된 결정만 바꾼다.
- 만든 뒤 1–2분 지나서 상태가 `running`인지, worktree가 실제로 있는지 직접 확인한다. 알림이 없다는 이유로 "진행 중"이라고 보고하지 않는다.
- 작업자가 모델 용량 오류로 멈추면 같은 agent에 "`git status`, 최근 커밋, 열린 PR을 확인한 뒤 이어서 진행하라"를 보낸다.
- 작업자가 결정이 필요하다고 멈추면, 승인된 결정 범위에서 답할 수 있으면 근거와 함께 답한다. 범위 밖이면 사용자에게 묻는다.

### 브라우저 계정 잠금 규칙 (Windows)

이 PC는 설치형 Chrome을 새 profile로 띄울 때마다 Windows 로그온 실패가 1회 기록되고, 10분에 10회면 계정이 잠긴다. profile은 checkout 경로마다 하나이므로 새 worktree의 첫 브라우저 실행마다 1이 오른다. 카운터는 PowerShell `([ADSI]"WinNT://$env:COMPUTERNAME/$env:USERNAME,user").psbase.InvokeGet('BadPasswordAttempts')`로 읽는다. 상세 근거는 [Windows browser automation](../../../docs/contributing/windows-browser-automation.md)에 있다.

- 새 worktree를 만들기 전에 카운터를 확인한다. 3 이상이면 0으로 돌아올 때까지(마지막 실패 후 약 10분) 기다린다.
- 작업자 규칙: 실행 전 5 이상이면 3 미만이 될 때까지 2분 간격으로 대기(최대 20분), 6 이상이면 중단·보고. Edge 채널, 패키지된 Desktop 검사, 새 profile probe는 로컬에서 실행하지 않는다.
- 리뷰어는 구현자의 worktree를 같이 쓴다. 이때 구현자에게는 브라우저와 서버 실행을 멈추라고 먼저 알린다(같은 profile을 동시에 쓰면 Chrome 기동이 실패하고 fixture가 덮어써진다).

## 4. PR이 올라왔을 때

1. `gh pr view <N> --json files`와 `gh pr diff <N>`로 diff를 직접 읽는다. 확인할 것: 범위 밖 변경, 테스트 단언 약화(삭제·완화·위치 고정·timeout 증가·재시도), 계약 문서 갱신, 승인된 결정과의 일치.
2. CI 실패를 작업자가 보고하면 원인 판정을 확인한다. 기준은 "사람이 실제로 낼 수 있는 속도와 순서에서 생기는가"다. 그렇다면 제품 결함이므로 제품을 고친다. 아니면 단언을 약화하지 않고 실제 상태를 기다리게 테스트를 고친다. 재실행은 artifact 분석 뒤에만 한다. 이 PR과 무관하고 처음 나온 간헐 실패면 실패한 job만 재실행하고, 재발하면 이슈로 등록한다.
3. 리뷰가 필요하면 5절대로 리뷰어를 붙인다. 필요 없으면 6절로 간다.

## 5. 독립 리뷰

- 붙이는 기준(리뷰 범위를 줄인 경우): editor schema·직렬화·저장 경로, 미저장 draft·복구, 셸 구조 변경, 성능·상태 경합, 문서 데이터가 바뀌는 연산. 작은 UI·CSS·문구·테스트만의 수정은 오케스트레이터 확인으로 대신한다.
- 리뷰어는 구현에 참여하지 않은 새 agent이고, 프롬프트는 [reviewer-prompt.md](references/reviewer-prompt.md)를 쓴다. 이 PR에서 특히 위험한 지점을 중점 확인 항목으로 구체적으로 적는다.
- 리뷰 중 구현자가 head를 바꾸면 리뷰어에게 최종 head 기준으로 판정하라고 알린다.
- `REQUEST_CHANGES`면 지적을 구현자에게 전달하고, 수정 후 같은 리뷰어 또는 새 리뷰어에게 재검토를 맡긴다.

## 6. 병합

[pr-gate.mjs](scripts/pr-gate.mjs)로 확인하고 queue에 넣는다. `gh pr merge`는 이 저장소에서 거부된다(auto-merge 비활성).

```bash
node <skill>/scripts/pr-gate.mjs --pr <N>                                  # 검사만
node <skill>/scripts/pr-gate.mjs --pr <N> --enqueue --note-file <note.md>  # 기록 댓글 후 enqueue
```

- 스크립트는 저장소, PR head와 원격 브랜치 일치, Draft 여부, 충돌, 필수 CI 전체 성공, 미해결 review thread 0, 저장소 validator의 AI trailer를 확인한다. 하나라도 실패하면 enqueue하지 않는다. Draft PR은 `gh pr ready <N>`로 바꾼 뒤 다시 확인한다.
- 기록 댓글에는 리뷰 여부와 근거(독립 APPROVE head, 또는 생략 사유와 오케스트레이터가 확인한 사항)를 쓴다.
- 리뷰 승인 뒤 head가 바뀐 경우: CONTRIBUTING은 새 APPROVE를 요구한다. 사용자가 리뷰 범위를 줄였다면 충돌 해결이나 테스트 대기 수정에 한해 `git show --remerge-diff <head>`와 추가 diff를 직접 확인하고, 그 사실을 댓글에 남긴다.
- master가 움직였다는 이유만으로 PR에 master를 반영하지 않는다.

### queue 감시와 실패 처리

[queue-watch.mjs](scripts/queue-watch.mjs)로 상태를 본다. `--wait`는 상태가 바뀌면 출력하고 끝난다. 백그라운드 실행 기능이 있는 하네스에서는 백그라운드로 실행한다.

```bash
node <skill>/scripts/queue-watch.mjs 560 561 562           # 현재 상태
node <skill>/scripts/queue-watch.mjs --wait 560 561 562    # 병합·이탈 시 출력 후 종료
```

queue에서 병합 없이 빠지면 원인을 먼저 가른다.

- **충돌(`CONFLICTING`):** 원래 작업자에게 `origin/master` merge와 충돌 해결을 맡긴다. 앞서 병합된 PR이 무엇을 바꿨는지 함께 알려 준다.
- **merge_group CI 실패:** `gh run list --event merge_group`에서 실패 run을 찾고 `gh run view <id> --log-failed`로 시나리오를 확인한다. 이 PR의 테스트면 원래 작업자에게 4절 기준으로 판정·수정을 맡긴다. 앞서 병합된 다른 PR이 만든 master 결함이면 새 worktree에서 별도 수정 PR을 만들고, 원래 PR은 head가 그대로이므로 그 사실을 댓글에 남기고 다시 enqueue한다.

## 7. 정리와 보고

- PR이 병합되면 그 worktree를 archive한다(작업자와 리뷰어 포함). 결과만 남기고 끝난 작업자는 archive한다.
- 하나의 PR이 병합될 때마다 그 PR에 맞물린 다음 작업(선행 조건이 풀린 이슈, master 반영이 필요한 PR)을 바로 시작한다.
- 끝나면 확인한다: 대상 이슈의 상태, 열린 PR, 남은 worktree와 작업자, 카운터. 직접 시작한 백그라운드 감시도 종료한다.
- 최종 보고: 병합한 이슈·PR 표(리뷰 여부 포함), 저장소 절차에서 벗어난 점, 남은 일과 확인하지 못한 것(재현·실측·실제 IME 등), 리뷰의 비차단 메모, 처음 나온 간헐 실패, 정리 상태.
