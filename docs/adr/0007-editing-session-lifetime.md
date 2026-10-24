# ADR-0007: 편집 세션 수명과 미저장 작업 보호

- Status: Accepted
- Last verified: 2026-10-24 (decision 3 extended by the owner-approved #380 decision, implemented in #383: navigation-only tab memory under the ADR-0009 preference boundary; recovery remains authoritative for unsaved work).
- Previous verification: 2026-10-16 (decision 1 revised: autosave deferred, #297; #204 implementation status compared with the current Editing session and Save contract).
- Previous verification: 2026-10-15 (decision recorded and revised after PR #295 review: Host-specific close boundary, recovery guarantee limits; current switching/Save/unload contract compared with [Editing session and Save](../design/editing-session-save-v1.md) and `App.tsx`; #291 Open/New confirmation verified with browser regressions).
- Authority: product and architectural decision under [AGENTS.md](../../AGENTS.md). Related: [#291](https://github.com/ieumbird/ieumdoc/issues/291) · [#204](https://github.com/ieumbird/ieumdoc/issues/204) · [#272](https://github.com/ieumbird/ieumdoc/issues/272) · [ADR-0001](0001-single-document-editor-architecture.md) · [ADR-0002](0002-document-persistence-semantic-ownership.md) · [ADR-0004](0004-desktop-host-distribution.md)
- Decision date: 2026-10-15

이 문서는 승인된 방향을 기록한다. 현재 동작은 [Editing session and Save](../design/editing-session-save-v1.md)의 Implemented 계약을 따르며, 각 후속 작업이 구현될 때 그 계약을 같은 PR에서 갱신한다. #291에서 4의 확인 대화상자를 다른 문서 열기와 New에 적용했고, #204에서 독립 탭과 단일 탭 닫기 확인으로 옮겼다. 클라이언트 복구는 #296 PR2에서 구현했다. PR3의 실제 Windows Desktop/HTTP 지속성·장애 검증과 남은 필수 CI·플랫폼 경계는 [Host 검증 계약](../design/editing-session-save-v1.md#host-persistence-verification-296-pr3)을 따른다. 1의 자동 저장은 2026-10-16에 보류했다(#297 향후 검토).

## Context

결정 시점의 Editor는 한 번에 한 문서의 편집 세션만 가진다. 저장하지 않은 변경이나 Apply하지 않은 속성 초안이 있으면 다른 문서 열기를 거부하고 안내만 표시하며, 그 자리에서 저장하거나 버리고 넘어갈 수 없다(#291). 여러 문서를 열어 두고 전환하는 요구가 있다(#204). 자동 저장과 비정상 종료 후 작업 복구는 없다. `beforeunload`와 Desktop 업데이트 재시작 확인은 정상적인 닫기만 보호하며, 강제 종료나 장애로 메모리에만 있던 작업은 잃는다. 저장할 수 없는 편집 상태에서는 Save와 Source가 모두 거부되어 작업을 꺼낼 경로도 없다는 보고가 있다(#272, Discussion #268).

세 문제는 같은 질문에 대한 답에 의존한다. 편집 세션이 지금 보이는 문서보다 오래 사는가, 그리고 프로세스보다 오래 사는가. 따로 결정하면 서로의 결론을 뒤집는다. 탭을 도입하면 문서 전환에서 미저장 처리를 물을 필요가 없어지고, 질문은 탭이나 창을 닫을 때로 옮겨 간다.

기존 계약은 "no autosave and no local draft recovery for now"였다. 자동 저장이 입력 중의 미완성 상태를 Git으로 관리하는 원본에 계속 쓴다는 점을 이유로 들었다. 파일 쓰기는 Git commit이 아니므로 이것만으로 자동 저장을 배제할 이유는 되지 않는다. 참고로 VS Code는 자동 저장(`files.autoSave`)을 기본으로 끄고, 저장하지 않은 편집 내용을 원본과 별도로 백업해 다시 열 때 복원하는 기능(`files.hotExit`)을 기본으로 켠다.

## Decision

### 1. 저장은 명시적 동작이며, 자동 저장은 보류한다

2026-10-16 수정: 처음 결정은 자동 저장을 선택 설정(기본 off)으로 제공하는 것이었다. 실제 구현 착수 전에 이를 **보류**하고 [#297](https://github.com/ieumbird/ieumdoc/issues/297)을 향후 검토로 돌렸다. 원본 파일에 쓰는 자동 저장은 명시적 Save와의 경쟁, 입력 중 canonical 재작성, CLI·AI 에이전트의 외부 수정과의 잦은 충돌, 저장 불가 상태의 재시도 같은 타이밍 문제를 Save 경로 전체에 더한다. 기본값을 꺼도 이 유지 비용은 남는다. 2의 복구 기록이 저장할 수 없거나 충돌한 작업까지 지키므로, 자동 저장으로 얻는 추가 이득은 실제 사용에서 필요가 확인될 때 다시 판단한다. 다시 검토할 때 아래 조건을 출발점으로 삼는다.

- 자동 저장을 설정으로 제공한다면 **기본값은 끈다**. 켜면 공식 Save와 같은 경로(Core canonical write, revision 확인, File commit)로 저장한다. 별도의 쓰기 경로를 만들지 않는다.
- 저장할 수 없는 상태(canonical 검증 거부)에서는 자동 저장을 건너뛰고 미저장 상태를 그대로 표시한다. 입력 중에 저장 오류를 반복해 띄우지 않는다.
- 외부 변경과 충돌하면 자동 저장을 멈추고 기존 충돌 처리로 넘긴다. 디스크의 변경을 덮어쓰지 않는다.
- Apply하지 않은 속성 초안은 자동 저장이 적용하지 않는다. 지금의 Save와 같다.
- 사용자가 저장하지 않아도 canonical 형식(예: 각주 정의 위치)으로 파일이 다시 쓰일 수 있음을 계약에 명시한다.

### 2. 미저장 작업 복구는 원본과 분리된 로컬 기록으로 제공한다

- 비정상 종료 후 미저장 작업 복구를 Stable 이전에 제공한다. 복구 기록은 원본 파일, canonical write, File commit과 분리한다. 복구가 원본을 묵시적으로 쓰거나 덮어쓰지 않는다.
- 1차 복구 대상은 세션의 **적용된 편집 내용**이다. 저장할 수 없는 상태도 포함한다. Apply하지 않은 속성 초안은 1차 범위에서 제외한다.
- 기록은 Editor 클라이언트 쪽 로컬 저장소에 둔다. Editor engine 고유의 상태 표현은 `apps/editor` 안에 머문다. `apps/editor/server`의 stateless 파일 Host handler를 영속 저장소로 확장하지 않는다.
- 다시 열 때 복구 기록이 있으면 복원을 제안한다. 복원한 세션은 기록한 기준 revision에 대한 미저장 세션이며, 이후 Save는 기존 revision 충돌 검사를 그대로 거친다. 성공한 Save나 명시적 버리기는 해당 기록을 지운다.
- 정상 닫기의 기존 보호(`beforeunload`, Desktop 닫기·업데이트 확인)는 유지한다. 복구 기록을 이유로 닫기 확인을 생략하지 않는다.
- 복구하지 않는 것은 사용자에게 알린다: Apply하지 않은 속성 초안은 복구되지 않으며, 로컬 저장소 쓰기 실패(할당량 부족 등)로 기록하지 못하면 그 사실을 표시한다. 구체 방식은 후속 설계에서 정한다.
- Desktop, 웹(Vite), HTTP Host 모두에서 제공한다. 복구 기록은 그 클라이언트에 국한되며 기기·브라우저 간에 공유하지 않는다.

### 3. 여러 문서를 탭으로 열어 두고, 탭마다 독립된 세션을 가진다

- 여러 문서를 동시에 열 수 있다. 각 탭은 [ADR-0001](0001-single-document-editor-architecture.md)에 따라 문서 하나에 Tiptap/ProseMirror state 하나를 가지며, 열기 snapshot, 승인된 revision, 실행 취소 기록, 초안과 미저장 상태를 독립적으로 유지한다.
- 탭 사이의 전환은 미저장 처리를 요구하지 않는다. 이미 열린 문서를 다시 열면 그 탭으로 이동한다.
- 문서 탭을 닫을 때 미저장 작업이 있으면 아래 4의 확인을 거친다. 창·브라우저 탭 닫기는 4의 Host별 경계를 따른다.

2026-10-24 추가 결정 ([#380](https://github.com/ieumbird/ieumdoc/issues/380), 구현 #383):

- 열린 문서의 경로·순서·활성 경로만 [ADR-0009](0009-multiple-opened-folders.md)의 열린 폴더와 같은 origin별 브라우저 환경설정(localStorage)에 기억한다. 내용·커서·undo·Host 상태·파일을 저장하지 않는다. 기억은 접근 권한이 아니며 Host는 매 요청을 검증한다.
- 새로고침과 Desktop 재시작에서 그 순서로 다시 열고 마지막 활성 탭을 선택한다. 없어진 경로, Host 거부, 비네이티브 문서는 조용히 제외한다. 복원만으로 기억을 재작성하지 않고 사용자의 열기·닫기·전환이 현재 목록을 기억한다.
- 미저장 작업은 2의 기존 복구 기록 흐름이 우선한다. 탭 기억이 복구 제안을 우회하거나 기록을 덮거나 같은 문서를 중복해서 열지 않는다. 명시적 시작 경로와 복구 제안의 구체 우선순위는 [현재 시작 계약](../design/editing-session-save-v1.md#tab-navigation-memory-383)을 따른다.

기존 Accepted ADR의 3을 이 승인된 추가 결정으로 확장한다. 폴더 결정(ADR-0009)을 바꾸거나 새 Workspace/Host persistence architecture를 도입하지 않으므로 별도 ADR은 만들지 않는다. 문서 의미 변경이 아닌 UI 탐색 상태이므로 CLI parity 대상도 아니다.

### 4. 미저장 작업 처리는 하나의 확인 대화상자를 재사용한다

- 선택지는 **저장 / 저장하지 않음 / 취소**다. 저장하지 않음은 위험 동작으로 표시한다.
- 저장이 실패하거나(저장 불가 상태, 충돌) 취소하면 세션을 그대로 두고 요청한 동작(다른 문서 열기, 탭·창 닫기)을 진행하지 않는다.
- Apply하지 않은 속성 초안이 있으면, 저장과 저장하지 않음 모두 그 초안을 잃는다는 점을 대화상자에서 알린다.
- 앱 안의 동작에 사용한다: 탭 도입 전에는 다른 문서를 열 때(#291), 도입 후에는 문서 탭을 닫을 때.
- Desktop 창 닫기는 기존 업데이트 재시작 확인처럼 main·renderer 간 확인을 거쳐 같은 대화상자를 사용할 수 있다.
- 웹(Vite, HTTP Host)의 브라우저 탭·창 닫기와 새로고침에는 이 대화상자를 쓸 수 없다. `beforeunload`는 브라우저가 소유한 일반 확인창만 표시하며 페이지가 선택지·문구나 비동기 Save를 제공할 수 없다([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)). 이 경로는 기존 `beforeunload` 확인과 2의 복구 기록으로 보호한다.

### 후속 작업 순서

1. #291: 4의 확인 대화상자와 다른 문서 열기에 적용.
2. #204: 탭과 독립 세션, 닫기에 4를 재사용.
3. 2의 복구 기록. 세션 구조가 정해진 뒤 세션마다 기록한다.
4. 1의 자동 저장 설정은 보류한다(#297 향후 검토). 1~3과 독립이다.

## Rationale

- 파일 쓰기는 Git commit이 아니므로 자동 저장 자체는 SSOT 원칙과 충돌하지 않는다. 처음에 기본값을 끄기로 한 이유는 이음독의 Save가 임의 텍스트 저장이 아니라 거부될 수 있는 canonical write이고, CLI·AI 에이전트가 같은 파일을 수정하는 사용 방식에서 충돌이 잦아질 수 있기 때문이다. 같은 이유와 타이밍 관리 비용 때문에 자동 저장 자체를 보류했으며, 실제 사용으로 필요가 확인되면 다시 판단한다.
- 자동 저장은 저장할 수 없거나 충돌한 작업을 지키지 못한다. 그 작업을 지키는 것은 원본과 분리된 복구 기록뿐이므로, 복구를 자동 저장보다 우선한다. 복구 기록은 적용된 편집의 손실 위험을 줄이지만 없애지는 않는다. Apply하지 않은 속성 초안과 기록에 실패한 작업은 1차 범위에서 여전히 잃을 수 있다.
- 탭을 먼저 결정하면 미저장 처리의 위치(전환이 아니라 닫기)가 정해지고, 확인 대화상자와 복구 기록을 세션 단위로 한 번만 설계하면 된다.

## Consequences and constraints

- [ADR-0002](0002-document-persistence-semantic-ownership.md)의 plain-text Markdown SSOT, Core 의미 소유권, canonical write와 fail-closed 저장을 유지한다. 자동 저장과 복구는 Save 경로나 검증을 약화하지 않는다.
- 이 결정의 기능은 Editor 세션 동작이며 영속 문서 의미를 바꾸지 않는다. CLI parity 대상이 아니다.
- 복구 기록은 문서 내용을 사용자 기기에 추가로 남긴다. 저장 위치와 삭제 시점을 사용자에게 설명해야 한다.
- 탭 수와 메모리 한도, 복구 기록의 보존 기간·형식은 후속 구현에서 정하고 해당 design 계약에 기록한다.
