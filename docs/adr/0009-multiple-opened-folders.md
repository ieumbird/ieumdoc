# ADR-0009: 사이드바에 여러 폴더 열기

- Status: Accepted
- Last verified: 2026-10-23 (implemented with this decision; [Editor UX shell](../design/editor-ux-shell-v1.md), [Folder listing](../design/filesystem-host-boundary-v1.md#folder-listing-v1-112) and [Folder picker](../design/folder-picker-v1.md) contracts updated in the same change).
- Authority: product and architectural decision under [AGENTS.md](../../AGENTS.md). Related: [#235](https://github.com/ieumbird/ieumdoc/issues/235), [ADR-0005](0005-http-host.md) (#186).
- Decision date: 2026-10-23

## Context

결정 시점의 사이드바는 `Open folder…`로 고른 폴더 하나만 보여 준다. 다른 위치의 문서를 함께 다루려면 폴더를 번갈아 다시 열어야 하고, 새로고침하면 그 폴더도 사라진다(#235).

기존 계약은 이 폴더를 "Browser 페이지 상태일 뿐 Workspace가 아니다"라고 정하고, Workspace persistence·project concept·`.ieumdoc/` 설정을 non-goal로 두었다. ADR-0005는 HTTP Root가 접근 경계일 뿐 사이드바 폴더나 Workspace가 아니며, Open Folder가 한 번에 허용 Root나 그 하위 하나를 고른다고 정했다.

사이드바 폴더 목록은 Host가 기억하지 않는다. Editor가 매 요청에 `root`를 보내고 Host가 매번 검증한다. 따라서 여러 폴더를 동시에 여는 것은 Host 상태나 문서 의미 없이 Editor 상태만으로 표현할 수 있다. 바뀌는 것은 "폴더 하나"를 전제로 한 Editor의 문서별 폴더 맥락과 기존 문서의 non-goal 경계다.

## Decision

### 1. 사이드바는 열어 둔 폴더의 순서 있는 목록을 보여 준다

- `Open folder…`는 고른 폴더를 목록 끝에 **추가**한다. 이미 열린 폴더를 다시 고르면 그 자리에서 다시 list하며 펼친 상태를 유지한다.
- 폴더마다 기존 단일 폴더와 같은 섹션(이름, `+` New file, New folder, `⋯`의 Open folder…/Close folder)과 tree를 둔다. Close folder는 그 폴더만 목록에서 뺀다. 열린 문서 탭은 바뀌지 않는다.
- 폴더 tree를 하나로 합치지 않는다. 중첩되거나 겹치는 폴더도 각각 별도 섹션으로 보여 준다. 같은 경로(Host가 정규화한 root)는 한 번만 연다.

### 2. 열어 둔 폴더 경로만 브라우저 환경설정으로 기억한다

- 폴더 경로 목록만 기존 최근 폴더처럼 브라우저 localStorage에 둔다. origin별이므로 Vite, Desktop, HTTP Host가 서로 공유하지 않는다. 펼친 상태와 listing은 저장하지 않는다.
- 시작할 때 기억한 순서대로 Host에 다시 list를 요청해 연다. Host가 거부하거나 없어진 폴더(이동·삭제·허용 Root 밖)는 조용히 제외한다. 기억한 목록은 사용자가 폴더를 열거나 닫을 때 현재 목록으로 바뀐다.
- 기억은 탐색 편의일 뿐 접근 권한이 아니다. Host는 기존처럼 매 요청을 검증한다. 파일, 문서, Host 설정에 아무것도 쓰지 않는다.

### 3. 문서의 폴더 맥락은 그 문서를 담은 가장 바깥쪽의 열린 폴더다

- 참고문헌 읽기 경계(Vite/Desktop의 local folder context)와 TopBar 위치 표시는 문서를 담은 열린 폴더 중 가장 바깥쪽 것을 기준으로 한다. 사용자가 상위 폴더의 자료(예: `../refs.bib`)를 쓰려고 그 폴더를 열었다면, 함께 열린 하위 폴더가 그 맥락을 좁히지 않는다. 어느 열린 폴더에도 없는 문서는 전과 같이 문서 자신의 폴더를 쓴다.
- New의 기본 위치는 누른 폴더 섹션 안에서 정한다. 열린 문서의 폴더가 그 섹션 안이면 그 폴더, 아니면 섹션 폴더다.
- 탭이 열릴 때 정한 참고문헌 맥락은 기존 계약대로 탭이 닫힐 때까지 유지한다. 폴더를 더 열거나 닫아도 바뀌지 않는다.

### 4. Workspace 파일이나 project 개념은 만들지 않는다

- 폴더 목록을 plain-text 파일이나 `.ieumdoc/` 설정으로 저장하지 않는다. Host endpoint, Host 상태, Core 의미, Markdown은 바뀌지 않는다.
- CLI parity 대상이 아니다. 사이드바 폴더 목록은 interface 탐색 상태이며 문서 의미 operation이 아니다. headless에서는 파일 경로를 직접 지정한다.
- HTTP Root는 계속 접근 경계다. 열어 둔 폴더 각각은 허용 Root나 그 하위여야 하며 Root를 합치거나 넓히지 않는다.

## Consequences

- 여러 위치의 문서를 폴더를 다시 열지 않고 탐색·편집할 수 있고, 새로고침이나 재실행 뒤에도 같은 폴더가 다시 보인다.
- 폴더마다 같은 이름의 문서가 있을 수 있으므로 tree 항목은 섹션 안에서만 구분된다. 탭과 TopBar의 기존 경로 표시는 그대로다.
- 외부 경로 변경으로 사라진 폴더는 알림 없이 빠진다. 폴더 이동·검색·폴더 간 drag, Workspace 파일 공유, 다중 창은 이 결정의 범위가 아니며 필요하면 별도로 결정한다.
