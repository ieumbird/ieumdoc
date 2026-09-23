# Filesystem Host Boundary v1

- Status: Draft
- Date: 2026-09-23
- Scope: 실제 filesystem에 접근하는 주체와 Browser Editor, Host, Core 사이의 책임 경계.

## Purpose

IeumDoc의 persistent SSOT는 사용자의 로컬 filesystem에 있는 사람이 읽을 수 있는 plain-text `.md` 파일이다. 이 문서는 Open, Save, New Document 및 향후 Open Folder가 그 파일에 접근하는 경계를 정한다.

이 경계의 핵심은 filesystem을 Browser Editor가 직접 소유하지 않고, 교체 가능한 Host가 소유한다는 것이다. 현재의 localhost HTTP adapter는 이 경계의 한 구현일 뿐이며 최종 backend architecture로 확정하지 않는다.

## Decision

Local host가 filesystem access의 소유자다.

```text
Browser Editor
      |
      v
Host interface / adapter
      |
      v
Local filesystem
```

Browser Editor는 Host를 통해 다음을 요청한다.

- file read
- file write
- file create
- 향후 file/directory listing
- 향후 filesystem watch

Host는 요청된 document locator를 실제 filesystem 동작으로 연결한다. Locator는 interface/host layer의 값이며 Core의 semantic document model에 포함하지 않는다.

Host 구현은 교체 가능해야 한다. 현재 localhost HTTP를 사용할 수 있지만, 향후 Desktop, Tauri, Electron 또는 다른 native host adapter로 바꿀 수 있다. HTTP transport나 localhost server를 permanent architecture, production backend, 또는 workspace server로 정의하지 않는다.

IeumDoc은 browser file upload를 기본 document access model로 사용하지 않는다.

```text
기본 경로:
Browser Editor -> Host -> 사용자의 원본 .md 파일

채택하지 않는 기본 경로:
Browser -> file upload -> remote service -> edit -> download
```

따라서 Host는 원본 파일을 직접 읽고 같은 파일에 저장한다. IeumDoc 전용 파일 저장소나 database를 별도의 SSOT로 만들지 않는다.

## Responsibility boundary

### Host owns

- OS filesystem에 대한 read, write, create
- document locator를 실제 path 또는 native file handle로 해석하는 일
- 향후 directory/file listing과 filesystem watch
- filesystem error를 Browser에 전달할 수 있는 host-level 결과와 오류
- path normalization, traversal 방지, 허용된 filesystem 범위, overwrite protection 등 filesystem security 검증
- 열린 `.md` 파일 directory를 기준으로 한 상대 media resolution

Host는 Browser가 보낸 임의 path를 무조건 신뢰하지 않는다. 특히 path는 사용자 입력이라는 전제에서 검증한다.

### Browser Editor owns

- Host 요청을 위한 interface/adapter 호출
- 현재 document의 UI 상태, selection, focus, save status 및 editor interaction
- Host가 반환한 source와 Core read model을 Editor 상태로 연결하는 일
- Host 오류, conflict 및 저장 실패를 사용자에게 표시하는 일

Browser Editor는 OS path access를 직접 수행하지 않는다. Browser File System Access API는 향후 가능한 adapter 중 하나로 볼 수 있지만, v1의 주 architecture로 선택하지 않는다.

### Core owns

- document parsing과 document semantics
- editor-neutral semantic operations
- structural validation
- canonical read/write contract와 canonical serialization

Core는 다음을 알지 않는다.

- absolute filesystem path
- workspace root 또는 OS directory structure
- browser permission
- localhost transport
- file picker implementation

Core source나 semantic model에 filesystem path를 넣지 않는다. Core는 Host가 읽어 온 document source를 의미적으로 처리하고, Host는 그 결과를 canonical document로 저장한다.

### Relative assets

현재 동작을 유지한다. Markdown의 `./image.svg` 같은 상대 media는 열린 `.md` 파일의 directory를 기준으로 resolve한다. 이 resolution은 Host/Editor adapter 책임이며 Core source 또는 semantic model을 filesystem path로 오염시키지 않는다.

현재 document directory 밖으로 나가는 traversal은 허용하지 않는다. Workspace가 생길 것이라는 가정만으로 이 asset scope를 넓히지 않는다.

## Current implementation mapping

현재 `apps/editor/server`는 **local filesystem host boundary의 현재 dev implementation**이다.

- `apps/editor/server/document-api.ts`가 요청된 `.md` path를 resolve하고 Node filesystem API로 read/write한다.
- 현재 Browser와 adapter 사이의 transport는 `/api/document`를 경유하는 localhost HTTP다.
- adapter는 Core의 parse, semantic save operation, validation 및 serialization을 호출하고, 파일 I/O 자체는 adapter가 수행한다.
- 문서 revision을 확인하여 외부 변경 후 stale save를 거부하는 현재 conflict 동작도 이 경계 안의 host/editor adapter 동작이다.
- 상대 media는 열린 document directory를 기준으로 resolve하며 directory 밖 traversal을 거부한다.

이 매핑은 현재 개발 구현을 설명할 뿐이다. `apps/editor/server`를 production backend, permanent local server architecture 또는 workspace server로 정의하지 않는다.

## Security considerations

Host는 Browser에서 전달된 locator와 filesystem operation을 신뢰 경계 밖 입력으로 취급한다. 현재와 향후 구현은 최소한 다음을 고려해야 한다.

- path normalization 및 canonical path 확인
- `..` 등을 이용한 traversal 방지
- Host가 허용한 filesystem 범위 밖 접근 차단
- 의도하지 않은 기존 파일 overwrite 방지
- missing file, permission denied, concurrent change 등 filesystem 오류의 명시적 처리

이번 문서는 sandbox, OS permission model, browser permission flow 또는 별도의 permission system을 설계하지 않는다. 이 항목들은 구현 시 Host adapter의 구체적인 보안 계약으로 정해야 한다.

회사 환경에서 browser file upload가 차단되어도 local Host 방식은 upload를 요구하지 않는다. 다만 DLP/EDR 정책이 localhost 통신이나 특정 process의 filesystem access 자체를 차단하는 경우는 제품 architecture가 우회할 수 있는 문제가 아니다. 이는 이 경계의 선택과 별도의 deployment/security policy 문제다.

## Relationship to New Document

이 경계는 다음 New Document creation v1의 기반이다.

```text
사용자 path
    |
    v
Host
    |
    v
new `.md` file
```

New Document v1은 Workspace를 만들지 않고 특정 file path를 Host에 전달하는 수준으로 시작한다. 예상되는 최소 정책은 다음과 같다.

- `.md` 파일만 생성
- parent directory가 이미 존재해야 함
- 기존 파일 overwrite 금지
- 생성 성공 후 해당 파일을 current document로 open

New Document 기능 자체와 그 UI/adapter 구현은 이 문서의 작업 범위가 아니다.

## Non-goals

- Open Folder UX, workspace root 또는 project concept
- Git repository detection, recent workspace, file tree
- `.ieumdoc/`, workspace config 또는 multi-document navigation
- 특정 HTTP API, localhost server 또는 production backend architecture
- browser file upload 또는 Browser File System Access API를 기본 architecture로 채택하는 결정
- database, remote document service 또는 별도 document storage를 SSOT로 추가하는 결정
- Host sandbox/permission system의 상세 설계
- filesystem watch, sync, collaboration 또는 conflict resolution의 상세 설계
- ADR 추가 또는 기존 ADR 변경
