# 작업자 프롬프트

`<...>`만 바꾸고 공통 규칙은 그대로 붙인다. 승인된 결정은 사용자가 확정한 내용만 쓴다. 해결책을 새로 지어내지 않는다.

```text
IeumDoc 저장소 worktree(현재 디렉터리, 브랜치 <branch>, master 기준)에서 GitHub 이슈 #<N>을 해결하고 PR을 만들어라. `gh issue view <N>`과 <관련 계약 문서·코드 경로>를 먼저 읽어라.

## 소유자가 승인한 결정
- <결정 1>
- <범위에서 제외할 것과 그 이유>

## 다른 병렬 작업과의 관계
- <같은 파일을 고치는 다른 PR/작업자와, 건드리지 말아야 할 부분. 없으면 이 절을 지운다>

## 공통 규칙
- AGENTS.md, CONTRIBUTING.md, docs/README.md에서 연결된 관련 설계 계약을 먼저 확인한다. 필요하면 `pnpm install`을 먼저 실행한다.
- 가장 작은 변경으로 해결한다. 무관한 리팩터링과 문서 수정은 하지 않는다. 현재 동작을 바꾸면 관련 설계 문서를 같은 PR에서 갱신한다.
- 기존 테스트 보완을 우선한다. 고유한 보호 가치가 있는 검사만 추가한다. 로컬에서는 CONTRIBUTING verification matrix에 따라 변경 영역의 대상 검사만 실행한다.
- 버그는 수정 전 실패를 먼저 확인한다. 재현할 수 없으면 추측성 수정 없이 근거를 보고한다.
- 브라우저는 `pnpm browser:test`(persistent profile)만 쓴다. 실행 전 PowerShell `([ADSI]"WinNT://$env:COMPUTERNAME/$env:USERNAME,user").psbase.InvokeGet('BadPasswordAttempts')`가 5 이상이면 3 미만이 될 때까지 2분 간격으로 기다린다(최대 20분, 넘으면 보고). 6 이상이면 멈추고 보고한다. Edge 채널, 패키지된 Desktop 검사, 새 profile을 만드는 probe는 로컬에서 실행하지 않고 CI에 맡긴다.
- 리뷰 agent나 하위 agent를 띄우지 않는다.
- 결정 범위 밖의 제품 판단이 필요하거나 이슈와 다른 원인을 발견하면, 구현을 멈추고 근거와 선택지를 보고한다.
- 커밋은 UTF-8 메시지 파일(`git commit --file`)로 만든다. 마지막 trailer 블록에 정확히 `AI-Agent: <agent>`, `AI-Model: <provider>/<model>`을 한 번씩 넣는다(실제 구현 모델). merge 커밋도 포함하고, Co-authored-by는 쓰지 않는다. 커밋마다 `git log -1 --format='%H%n%(trailers:only)'`로 확인한다.
- master를 base로 PR을 만든다. 본문에 `Closes #<N>`(일부만 해결하면 `Refs #<N>`), 변경 요약, 실행한 검증을 쓴다. 시각 변경은 1440px와 390px 전후 캡처를 남긴다. 재생성 가능한 대용량 근거 파일은 커밋하지 않는다.
- PR CI 결과까지 확인한다. 실패하면 재실행 전에 artifact를 분석해 제품 결함인지 테스트 문제인지 판정한다. 사람이 실제로 낼 수 있는 속도와 순서에서 생기면 제품 결함이다. 테스트 문제라면 단언을 약화하지 말고 실제 상태를 기다리게 고친다. 재시도나 timeout 증가로 덮지 않는다. 병합은 하지 않는다.
- 끝나면 직접 시작한 dev server와 브라우저 세션을 정리한다. 최종 보고에는 PR URL, head SHA, 변경 요약, 검증 결과, CI 상태, 브라우저 카운터 값, 남은 프로세스 여부, 범위 밖 발견을 포함한다. 한국어로 보고한다.
```

## 후속 지시 예

- **master 반영:** "PR #<M>(<무엇을 바꿨는지>)이 master에 병합됐다. origin/master를 merge해 양쪽 의도를 보존하며 충돌을 해결하라. merge 커밋 trailer를 확인하고, 단위 테스트·typecheck·충돌 파일 관련 브라우저 시나리오만 실행한 뒤 push하라. CI까지 확인해 새 head와 결과를 보고하라. 병합하지 않는다."
- **queue 실패:** "PR #<N>이 merge queue 실행 <run-id>의 <job>에서 `<오류>`로 실패했다. `gh run download <run-id>`로 artifact를 받아 원인을 판정하라. (공통 규칙의 판정 기준을 적용) push 후 CI까지 확인해 원인, 수정, 새 head를 보고하라."
- **리뷰 중 대기:** "같은 worktree에서 독립 리뷰어가 브라우저로 검토한다. 이 worktree에서 브라우저와 서버를 실행하지 말고 CI 결과만 확인해 보고하라."
- **재개:** "모델 오류로 턴이 중단됐다. `git status`, `git log --oneline -3`, 열린 PR을 확인한 뒤 처음 지시대로 이어서 진행하라. 끝낸 단계는 반복하지 마라."
