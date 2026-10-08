# Filesystem Host Boundary v1

- Status: Implemented
- Last verified: 2026-10-08 (development adapter and tests, including the sidebar folder tree; not a production-host validation).
- Authority: implemented development-host boundary; production host remains undecided. [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md) owns persistence semantics.
- Date: 2026-09-23
- Scope: 실제 filesystem에 접근하는 주체와 Browser Editor, Host, Core 사이의 책임 경계.

## Purpose

IeumDoc의 persistent SSOT는 사용자의 로컬 filesystem에 있는 사람이 읽을 수 있는 plain-text `.md` 파일이다. 이 문서는 Open, Save, New Document 및 Open Folder가 그 파일에 접근하는 경계를 정한다.

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
- 사용자가 고른 folder의 한 단계 listing (아래 Folder listing v1)

filesystem watch는 현재 제공하지 않으며 향후 검토 대상이다.

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
- 사용자가 고른 folder의 listing (filesystem watch는 미구현)
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

### Asset Host Contract v1 (#59)

- Browser의 clipboard/drop 이미지 바이트를 local Host가 검증하고 열린 Markdown 문서의 `assets/image-<UUID>.<ext>`에 저장한다. 응답 경로는 `./assets/image-<UUID>.<ext>`이며 원본 filename은 사용하지 않는다. `<ext>`는 MIME이 정한다: PNG `png`, JPEG `jpg`, GIF `gif`, WebP `webp`. 문서와 `assets/`를 함께 이동하면 경로가 유지된다.
- PNG, JPEG, GIF, WebP를 지원한다. MIME과 그 형식의 완성된 container를 확인한다: PNG는 signature·IHDR·IEND까지의 chunk envelope, JPEG는 SOI·frame header·scan 뒤의 EOI(EOI 뒤 camera 부가 data는 유지), GIF는 header·block·trailer, WebP는 file 길이와 맞는 RIFF chunk와 image data. 내용이 MIME과 다르거나 잘린 파일, 빈 파일과 과도한 크기를 거부한다. 형식 목록과 크기 상한의 코드 기준은 `apps/editor/shared/asset-policy.ts`다. 이미지를 decode·변환·최적화하지 않는다. SVG는 script를 담을 수 있는 active content라 sanitizer 없이 저장하지 않는다. 원격 다운로드도 포함하지 않는다. 문서에 이미 있는 상대 media는 확장자에 맞는 `Content-Type`과 `nosniff`로 제공한다.
- `POST /api/asset?path=<document locator>`는 지원 형식의 MIME을 `Content-Type`으로 한 binary body를 받는다. 응답은 상대 `path`와 opaque `rollbackToken`이다. 저장 protocol과 binary upload를 합치지 않는다.
- Host는 document directory의 real path를 경계로 사용한다. `assets/` 자체의 symlink, 경계 밖 document symlink, traversal·absolute·비정상 asset path를 거부한다. 완성된 temporary sibling을 exclusive hard link로 공개한 뒤 temp를 제거하여 partial 파일과 기존 파일 overwrite를 막는다. 이 filesystem 동작을 지원하지 않으면 실패를 표시한다.
- Host write 실패는 Editor를 변경하지 않는다. 성공한 경로로 기존 Figure insert 경로를 사용하며, 삽입이 거부되거나 요청 중 Editor가 사라지면 `DELETE /api/asset`로 rollback한다. 서명된 receipt는 생성 inode와 업로드 바이트에 묶는다. 삭제 전에 임시 이름으로 옮겨 같은 fd에서 identity/content를 검증하고, 다른 파일로 바뀌었으면 overwrite 없이 원위치로 복구한다. rollback/복구 실패는 남은 경로와 함께 명시한다. temp cleanup도 directory/file identity를 확인하며, 외부 directory 교체로 소유권을 확인할 수 없으면 삭제를 거부하고 잔여 temp 경로를 오류로 표시한다. Host는 session이나 asset 목록을 저장하지 않으며 receipt 서명 key는 dev server 수명에 한정한다.
- 내부 IeumDoc rich clipboard는 기존 typed paste를 우선한다. 그 외 파일을 포함한 paste/drop은 한 번에 지원 형식 이미지 하나를 처리하고 함께 제공된 text/HTML은 삽입하지 않는다. 업로드 중 engine transaction mapping으로 삽입 위치를 유지하며, Figure 삽입은 독립 Undo 한 번으로 취소된다.
- 정상 삽입 뒤 Undo, Figure 삭제, 미저장 종료로 남는 orphan asset은 자동 정리하지 않는다. 응답을 받기 전에 연결이 끊기거나 Host가 재시작되어 receipt가 무효화된 경우에도 자동 복구/GC는 없다. Markdown Save, Core canonical guard와 opening-snapshot session 계약은 그대로 유지한다.

### Folder listing v1 (#112)

사용자가 `Open folder…` 대화상자에서 folder 경로 하나를 고르면 Host가 그 folder를 한 단계씩 list하고, Sidebar는 이를 tree로 보여 주며 문서를 연다. Workspace가 아니다. 선택한 sidebar folder는 Browser 페이지 상태에만 있고 Host나 파일에 저장하지 않는다. 최근에 성공적으로 연 folder 경로는 Browser preference로만 기억한다.

- `GET /api/folder?root=<선택한 folder>&path=<그 안의 folder, 생략 시 root>`는 `{ root, path, parent?, entries }`를 돌려준다. `entries`는 `{ name, kind: "folder" | "document", path }`이고 sub-folder 먼저, 그다음 이름순(숫자 인식)이다. `parent`는 root보다 아래일 때만 있다. 현재 Sidebar tree는 `parent`를 쓰지 않지만 API 계약은 그대로다.

| 범위 | 지원 |
| --- | --- |
| Hierarchical tree UI | 지원. Sidebar가 펼친 folder들의 listing을 page state에 모아 tree로 그린다. |
| Lazy one-level Host listing | 지원. folder를 펼칠 때 그 folder 하나만 위 API로 list한다. |
| Recursive scan | 지원하지 않음. Host도 Editor도 하위 folder를 미리 읽지 않는다. |
| Watch service | 지원하지 않음. 외부 변경은 다시 펼치거나 문서를 열 때만 반영된다. |
| Workspace persistence | 지원하지 않음. 선택한 folder와 펼친 상태는 새로고침 후 복원하지 않는다. |
- 일반 directory와 일반 `.md` 파일만 넣는다. `.`으로 시작하는 항목, 다른 종류의 파일, symlink(Windows junction 포함)는 넣지 않는다. 재귀 scan은 하지 않는다.
- Host는 `root`와 `path`를 신뢰 경계 밖 입력으로 다룬다. `path`는 lexical로도, symlink를 해석한 real path로도 `root` 안이어야 한다. directory가 아니거나 없거나 읽을 수 없으면 명시적 오류다. Host는 요청 사이에 아무것도 기억하지 않는다.
- 문서는 기존 `GET /api/document` 경로로 연다. 저장하지 않은 변경이나 draft가 있으면 기존 Open처럼 전환을 거부한다. 문서를 열거나 만들면 그 문서 위의 folder들(선택한 folder 안일 때)을 펼치고 다시 list하므로 새 문서가 바로 보인다. IeumDoc 밖의 변경은 watch하지 않는다. 늦게 도착한 listing은 같은 folder의 더 새 요청을 덮지 않고, 그 사이 접힌 folder를 다시 펼치지 않는다.
- `.md` 파일 open 범위는 넓어지지 않는다. Host는 이전부터 임의 `.md` 경로를 열 수 있고, listing은 이름과 종류만 보여 준다.
- Git 감지, `.ieumdoc/` 설정, index DB, watch service, 검색 인프라는 포함하지 않는다. CLI 명령도 없다. folder listing은 문서 의미를 바꾸는 operation이 아니라 interface/Host 탐색이며, headless 환경에서는 shell의 파일 목록으로 충분하다.

### Folder picker v1

- [Folder picker](folder-picker-v1.md)는 앱 안에서 경로를 고른다. OS 선택창, upload, 별도 복사본은 없다. Open을 누르기 전의 탐색은 sidebar와 문서를 바꾸지 않는다.
- `GET /api/folder-browse?path=<folder>`는 `{ path, crumbs, entries }`를 돌려준다. `crumbs`는 filesystem root부터 해당 folder까지의 `{ name, path }` 목록이며 Host가 계산한다. 항목 필터와 정렬은 Folder listing v1과 같다. 선택 전의 탐색은 sidebar의 `root` 제한을 사용하지 않는다.
- `GET /api/folder-places`는 `{ places: [{ kind, name, path }] }`를 돌려준다. Home, 실제 존재하는 Documents, Windows drive roots 또는 `/`가 시작점이다. Host는 탐색 위치나 최근 목록을 저장하지 않는다.
- Recent는 이 Browser의 `ieumdoc.recentFolders` preference다. 성공한 Open만 기록하고, 새로고침 시 sidebar folder를 자동으로 복원하지 않는다. 문서 내용·의미와 무관하므로 Core operation이나 CLI command를 추가하지 않는다.

## Current implementation mapping

현재 `apps/editor/server`는 **local filesystem host boundary의 현재 dev implementation**이다.

- `apps/editor/server/document-api.ts`가 요청된 `.md` path를 resolve하고 Node filesystem API로 read/write한다.
- 현재 Browser와 adapter 사이의 transport는 `/api/document`를 경유하는 localhost HTTP다.
- `apps/editor/shared/document-protocol.ts`가 Browser와 Host의 저장 요청·응답 타입을 공유한다. 이 파일은 Core 공개 타입을 사용하는 데이터 계약이며, 파일 접근·검증·저장 실행은 포함하지 않는다.
- adapter는 Core의 parse, semantic save operation, validation 및 serialization을 호출하고, 파일 I/O 자체는 adapter가 수행한다.
- 문서 revision을 확인하여 외부 변경 후 stale save를 거부하는 현재 conflict 동작도 이 경계 안의 host/editor adapter 동작이다.
- 상대 media는 열린 document directory를 기준으로 resolve하며 directory 밖 traversal을 거부한다.
- `/api/folder`가 Folder listing v1을 구현한다(`listFolder`).
- `/api/folder-browse`와 `/api/folder-places`가 경로 선택용 목록과 시작점을 제공한다(`browseFolder`, `folderPlaces`).

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

현재 New Document creation은 이 개발 Host 경계로 구현되어 있다.

```text
사용자 path
    |
    v
Host
    |
    v
new `.md` file
```

New Document v1은 Workspace를 만들지 않고 특정 file path를 Host에 전달한다. 현재 정책은 다음과 같다.

- `.md` 파일만 생성
- parent directory가 이미 존재해야 함
- 기존 파일 overwrite 금지
- 생성 성공 후 해당 파일을 current document로 open

`createDocumentFile`이 Core의 canonical empty Markdown을 UTF-8로 exclusive create한다. Editor의 유일한 New 진입점은 [Folder New](folder-picker-v1.md#new-document-in-a-sidebar-folder)이며 표시 중인 folder를 destination으로 사용한다. Host API는 여전히 임의의 기존 parent directory 아래 경로를 받으며 위 정책으로 검사한다. 제품 Host나 installer의 결정은 포함하지 않는다.

## Non-goals

- workspace root 또는 project concept. Folder listing v1의 folder는 페이지 상태일 뿐 workspace가 아니다.
- Git repository detection, recent workspace, 재귀 filesystem scan, 검색 또는 index (Sidebar의 lazy tree UI는 위 Folder listing v1 범위다)
- `.ieumdoc/`, workspace config, 여러 문서 동시 열기 또는 문서 간 탐색 기록
- 특정 HTTP API, localhost server 또는 production backend architecture
- browser file upload 또는 Browser File System Access API를 기본 architecture로 채택하는 결정
- database, remote document service 또는 별도 document storage를 SSOT로 추가하는 결정
- Host sandbox/permission system의 상세 설계
- filesystem watch, sync, collaboration 또는 conflict resolution의 상세 설계
- ADR 추가 또는 기존 ADR 변경
