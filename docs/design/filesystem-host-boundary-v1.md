# Filesystem Host Boundary v1

- Status: Implemented
- Literal syntax verification: 2026-10-15 (#304: original-source warnings in check, single/batch writes and dry-run JSON; Core/CLI tests and source CLI).
- CLI preview verification: 2026-10-15 (#292: shared file-commit preflight, dry-run no-write boundary, failure parity and result/check output; source CLI and Core/CLI/file-commit tests).
- CLI insertion verification: 2026-10-15 (#280 single-write properties, unchanged-file refusal and per-step batch `end` resolution; Core/CLI tests).
- Start-up/CLI path verification: 2026-10-15 (#287 unit tests for refusal before path I/O and valid Unicode names; Desktop tested without Electron).
- Last verified: 2026-10-14 (#215: CLI batch sequential-byte equivalence, original preservation, revision/output, batch-wide versus step errors, null option rejection and commit conflict regressions. #214: CLI inspect revision and edit precondition, real-file stale path/byte preservation and commit conflict regressions. #237: unsupported save edit fields rejected with unchanged file bytes in Host tests; actual Vite `save-session`, production HTTP and packaged Desktop Save/Reload/conflict regressions. #211 / PR #229: proxy-safe normal media separators and standalone dot-segment transport retain Host traversal checks; Editor/Host unit tests and actual Vite `image-assets` loading/Save/Reload; image choice listing, link/copy and HTTP root denial; shared handlers, root enforcement and full regressions on 2026-10-13).
- Authority: shared file Host boundary for Vite, [ADR-0004 Desktop](../adr/0004-desktop-host-distribution.md) and [ADR-0005 HTTP](../adr/0005-http-host.md). [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md) owns persistence semantics.
- Encoding verification: 2026-10-15 (#271 malformed UTF-8/Unicode refusal, raw-byte revision checks, original preservation and temporary cleanup; Vite/production HTTP repeated Unicode Save → Reload and existing external-conflict regressions).
- Date: 2026-09-23
- Path verification: 2026-10-15 (#278 shared helper and real HTTP refusal before path I/O, no replacement files, valid Unicode names and pre-normalization checks; PR #284 strict percent-encoded query refusal for document/media reads, form decoding and valid Unicode URL regressions).
- Scope: 실제 filesystem에 접근하는 주체와 Browser Editor, Host, Core 사이의 책임 경계.

## Purpose

IeumDoc의 persistent SSOT는 Host가 접근하는 filesystem의 사람이 읽을 수 있는 plain-text `.md` 파일이다. HTTP 접속 시 경로는 브라우저 PC가 아닌 서버의 경로다. 이 문서는 Open, Save, New Document 및 Open Folder가 그 파일에 접근하는 경계를 정한다.

이 경계의 핵심은 filesystem을 Browser Editor가 직접 소유하지 않고, 교체 가능한 Host가 소유한다는 것이다. 현재의 localhost HTTP adapter는 이 경계의 한 구현일 뿐이며 최종 backend architecture로 확정하지 않는다.

## Decision

Host가 자신이 실행되는 OS의 filesystem access를 소유한다.

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
- 기존 folder 안의 새 folder 하나 생성 (아래 Folder creation v1)

filesystem watch는 현재 제공하지 않으며 향후 검토 대상이다.

Host는 요청된 document locator를 실제 filesystem 동작으로 연결한다. Locator는 interface/host layer의 값이며 Core의 semantic document model에 포함하지 않는다.

Host 구현은 교체 가능해야 한다. Vite는 개발 HTTP, Windows Desktop은 `ieumdoc://app` custom protocol, 독립 HTTP Host는 Node listener와 production 정적 파일을 사용하며 같은 stateless document/asset handler를 호출한다. Vite/Desktop은 기존 local 파일 정책을 명시적으로 선택하고 HTTP는 고정 Root allowlist를 반드시 적용한다. [Desktop contract](desktop-distribution-v1.md)와 [HTTP contract](http-host-v1.md)가 각 배포·접근 경계를 정한다. 이 재사용을 장기 persistence/backend 또는 Workspace 결정으로 확대하지 않는다.

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

### Path Unicode

CLI는 모든 문서 명령의 파일 인자와 `apply-batch --operations`를 공통 인자 파싱에서 `assertUnicode()`로 검사한다(#287). 단독 surrogate는 파일 접근 전에 Unicode 오류와 exit 1로 거부한다. `serve --root`는 기존 공유 Host Root 검사를 따른다. Desktop `firstDocument()`도 시작 문서 인자를 경로 정규화·존재 확인 전에 같은 함수로 검사한다. 거부한 인자는 경고 후 건너뛰며, 유효한 다른 인자가 없으면 문서 없이 시작하고 기존 sample 사본을 제공한다. 정상 한글·emoji·리터럴 U+FFFD 파일명은 허용한다.

Vite·Desktop·HTTP의 공유 Host는 사용자 경로·이름의 단독 UTF-16 surrogate를 파일시스템에 전달하거나 경로를 정규화하기 전에 거부한다. 문서 열기·생성·저장·미리보기의 `path`, 폴더 목록의 `root`/`path`, browse의 `path`, 폴더 생성의 `parent`/`name`, 이미지 선택의 `documentPath`/`source`, asset 업로드·rollback의 문서/상대 경로와 media 상대 경로에 적용한다. HTTP의 시작 Root도 같은 Unicode 검사를 거친다. 정상 한글·emoji·리터럴 U+FFFD는 허용하며 다른 문자로 치환하거나 이름을 보정하지 않는다.

공통 `accessPath`/Root locator에서 기존 Unicode 검사를 재사용한다. 폴더명과 decode한 media 상대 경로는 조합·정규화 전에 검사하여 잘못된 segment가 사라지는 경우도 거부한다. 잘못된 Unicode 입력은 기존 잘못된 요청과 같은 HTTP 400 오류이며, JSON API는 `{ error }`, media는 기존 빈 오류 응답을 유지한다. 거부된 경로로 파일·폴더를 생성하거나 다른 이름의 대상을 읽고 쓰지 않는다. Asset rollback의 제한된 상대 경로 형식과 receipt 검사도 그대로 적용한다.

고정 Editor build의 정적 자산 경로도 decode 후 같은 검사를 거치며, 잘못된 경로는 기존 404 응답을 유지한다.

요청 query는 원시 request target에서 key/value별로 엄격하게 percent-decode한다. Form 규칙의 `+`는 공백으로, `%2B`는 리터럴 `+`로 해석하며 한 번만 decode한다. 잘못된 percent escape·UTF-8은 U+FFFD로 바꾸지 않고 파일 접근 전에 HTTP 400 `{ error }`로 거부한다. 문서·폴더 목록/browse·media의 문서 locator·asset 업로드는 같은 query helper를 사용한다. 정상 percent-encoded 한글·리터럴 U+FFFD는 허용한다. Media 상대 경로는 기존 엄격한 `decodeURIComponent`와 문서 directory 경계를 유지한다. URL의 `..` 정규화로 사라진 segment는 실제 파일 대상이 아니며, 정규화 후에도 문서 directory 경계를 벗어날 수 없다.

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

### Save request fields

`POST /api/document` accepts `path`, `revision`, `base` and the edit fields emitted by the Editor's `collectSupportedEdits`: `headingNumbering`, `order`, `headings`, `headingLevels`, `paragraphs`, `equations`, `figures`, `cells`, `tables`, `tableCaptions`, `admonitions`, `quotes`, `footnotes`, `lists`, `codes`, `labels`, `splits`, `merges`, `inserts` and `deletes`. `base.savedEdits` accepts only those edit fields. Unsupported or unknown fields in either edit payload, including the removed `sources`, return HTTP 400 `{ error }` before saving and leave the file bytes unchanged. Source preview uses the same request validation.

### Relative assets

Markdown의 `image.svg`, `assets/image.svg`, `./image.svg` 같은 상대 media는 접두사 유무와 관계없이 열린 `.md` 파일의 directory를 기준으로 resolve한다. 이 resolution은 Host/Editor adapter 책임이며 저장된 경로 문자열을 변경하거나 Core source 또는 semantic model을 filesystem path로 오염시키지 않는다. 표시 규칙과 로드 실패 안내는 [Figure authoring](figure-authoring-v1.md#editor-session-states)을 따른다.

정상 경로는 segment별 URL encoding으로 `/` 구분자를 유지한다. leading `./`를 제외한 literal `.`·`..` segment가 있으면 전체 경로를 인코딩하여 browser가 `/document/` 밖으로 정규화하지 못하게 한다. 단독 `.`·`..`는 요청에만 trailing slash를 붙여 `.%2F`·`..%2F`로 전달한다. Host의 기존 single decode와 `resolveMediaPath`가 원래와 같은 위치로 resolve하거나 거부한다. `%2e` 같은 입력 문자는 추가 인코딩되어 기존 encoded-traversal 검사에 도달한다. 공유 Vite/HTTP/Desktop handler, 경로 접근 범위와 저장 문자열은 변경하지 않는다. Encoded slash를 막는 proxy는 dot-segment 요청을 Host 전에 거부할 수 있으나 정상 이미지 경로에는 encoded slash가 생기지 않는다.

현재 document directory 밖으로 나가는 traversal은 허용하지 않는다. Workspace가 생길 것이라는 가정만으로 이 asset scope를 넓히지 않는다.

### Asset Host Contract v1 (#59)

- Browser의 clipboard/drop 이미지 바이트를 local Host가 검증하고 열린 Markdown 문서의 `assets/image-<UUID>.<ext>`에 저장한다. 응답 경로는 `./assets/image-<UUID>.<ext>`이며 원본 filename은 사용하지 않는다. `<ext>`는 MIME이 정한다: PNG `png`, JPEG `jpg`, GIF `gif`, WebP `webp`. 문서와 `assets/`를 함께 이동하면 경로가 유지된다.
- PNG, JPEG, GIF, WebP를 지원한다. MIME과 그 형식의 완성된 container를 확인한다: PNG는 signature·IHDR·IEND까지의 chunk envelope, JPEG는 SOI·frame header·scan 뒤의 EOI(EOI 뒤 camera 부가 data는 유지), GIF는 header·block·trailer, WebP는 file 길이와 맞는 RIFF chunk와 image data. 내용이 MIME과 다르거나 잘린 파일, 빈 파일과 과도한 크기를 거부한다. 형식 목록과 크기 상한의 코드 기준은 `apps/editor/shared/asset-policy.ts`다. 이미지를 decode·변환·최적화하지 않는다. SVG는 script를 담을 수 있는 active content라 sanitizer 없이 저장하지 않는다. 원격 다운로드도 포함하지 않는다. 문서에 이미 있는 상대 media는 확장자에 맞는 `Content-Type`과 `nosniff`로 제공한다.
- `POST /api/asset?path=<document locator>`는 지원 형식의 MIME을 `Content-Type`으로 한 binary body를 받는다. 응답은 상대 `path`와 opaque `rollbackToken`이다. 저장 protocol과 binary upload를 합치지 않는다.
- 이미지 선택 POST와 rollback DELETE의 JSON body는 공통 strict UTF-8 decoder를 사용한다. 잘못된 UTF-8은 파일 복사·삭제 전에 HTTP 400으로 거부하고 문서·기존 asset 바이트를 보존한다. 이미지 binary body는 text로 decode하지 않는다. 이 경계는 Vite·Desktop·HTTP Host가 공유한다.
- Host는 document directory의 real path를 경계로 사용한다. `assets/` 자체의 symlink, 경계 밖 document symlink, traversal·absolute·비정상 asset path를 거부한다. 완성된 temporary sibling을 exclusive hard link로 공개한 뒤 temp를 제거하여 partial 파일과 기존 파일 overwrite를 막는다. 이 filesystem 동작을 지원하지 않으면 실패를 표시한다.
- Host write 실패는 Editor를 변경하지 않는다. 성공한 경로로 기존 Figure insert 경로를 사용하며, 삽입이 거부되거나 요청 중 Editor가 사라지면 `DELETE /api/asset`로 rollback한다. 서명된 receipt는 생성 inode와 업로드 바이트에 묶는다. 삭제 전에 임시 이름으로 옮겨 같은 fd에서 identity/content를 검증하고, 다른 파일로 바뀌었으면 overwrite 없이 원위치로 복구한다. rollback/복구 실패는 남은 경로와 함께 명시한다. temp cleanup도 directory/file identity를 확인하며, 외부 directory 교체로 소유권을 확인할 수 없으면 삭제를 거부하고 잔여 temp 경로를 오류로 표시한다. Host는 session이나 asset 목록을 저장하지 않으며 receipt 서명 key는 각 Host 프로세스 수명에 한정한다.
- 내부 IeumDoc rich clipboard는 기존 typed paste를 우선한다. 그 외 파일을 포함한 paste/drop은 한 번에 지원 형식 이미지 하나를 처리하고 함께 제공된 text/HTML은 삽입하지 않는다. 업로드 중 engine transaction mapping으로 삽입 위치를 유지하며, Figure 삽입은 독립 Undo 한 번으로 취소된다.
- 정상 삽입 뒤 Undo, Figure 삭제, 미저장 종료로 남는 orphan asset은 자동 정리하지 않는다. 응답을 받기 전에 연결이 끊기거나 Host가 재시작되어 receipt가 무효화된 경우에도 자동 복구/GC는 없다. Markdown Save, Core canonical guard와 opening-snapshot session 계약은 그대로 유지한다.

### Image choice v1 (#208)

Figure의 Choose…가 [folder picker](folder-picker-v1.md#choosing-an-image)에서 고른 Host 이미지를 문서에 연결한다.

- `GET /api/folder-browse?path=<folder>&files=image`는 Markdown 대신 `kind: "image"` 항목(`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`)을 넣는다. 그 밖의 필터·정렬·crumbs·root 제한은 Folder picker v1과 같다.
- `POST /api/asset`에 `Content-Type: application/json`의 `{ documentPath, source }`를 보내면 `source` 이미지를 그 문서에 연결한다. 응답은 상대 `path`이며, 복사했을 때만 `rollbackToken`이 붙는다. `source`는 모든 Host 파일 요청처럼 HTTP root 정책을 거친다.
- `source`가 lexical path와 real path 모두 문서 directory 안이면 아무것도 쓰지 않고 `./`로 시작하는 `/` 구분 상대 경로를 돌려준다. 원래 파일 이름과 위치, SVG가 그대로 유지된다. Editor가 요청하는 대로 segment를 URL-encode한 경로를 위 상대 media resolution이 받아들여야 한다. `100%.png`는 그대로 연결하고, `%2e`나 backslash가 든 이름처럼 media route가 제공할 수 없는 이름은 아래처럼 복사한다.
- 그 밖의 이미지, 문서 directory 안에서 밖을 가리키는 link를 포함해 Host가 읽어 Asset Host Contract v1과 같은 `createImageAsset` 검증·공개·receipt로 `assets/`에 복사한다. MIME은 확장자로 정하고 내용이 그 형식이 아니면 거부한다. SVG는 복사하지 않는다. 문서가 Core 네이티브 검증에 실패하거나 파일 쓰기 권한이 없으면 복사도 거부한다.
- Editor는 form을 Cancel하거나 다른 이미지를 다시 고르거나, Apply 없이 Figure view가 사라지면(Reload, 문서 닫기, Figure 삭제) 그 form이 만든 복사본을 같은 receipt로 rollback한다. Apply는 dispatch 전에 복사본을 문서로 넘기고, 결과 문서가 그 경로를 쓰지 않을 때만 rollback한다. rollback 실패는 남은 경로와 함께 표시한다. Apply한 복사본의 이후 orphan 처리는 위 정책과 같다.

### File commit v1

Editor Host Save와 CLI의 파일 수정 명령은 기존 Markdown 파일을 같은 Node 함수 `commitFile`(`packages/file-commit`)로 교체한다. 호출자는 Core validation과 canonical serialization을 마친 UTF-8 / LF Markdown과 baseline revision을 넘긴다. Core는 이 경로나 filesystem을 알지 않는다.

- Revision은 실제 파일 바이트의 SHA-256이다. 엄격하게 UTF-8로 읽은 유효한 text의 `textRevision`과 같으며 BOM도 포함한다. CLI·공유 Host는 잘못된 UTF-8 파일·문서 요청 text를 대체문자로 변환하지 않고 거부한다. CLI는 Core operation을 적용하기 전에 읽은 원본에서 revision을 얻는다. Editor는 열기 또는 직전 Save로 받은 revision을 보낸다. 저장 직전에 다시 읽은 내용을 baseline으로 삼지 않으며, 숨은 cache나 lock 파일을 두지 않는다.
- 최종 `commitFile`도 단독 surrogate가 든 출력 text를 temporary 생성 전에 거부한다. 두 revision 확인은 원본의 raw bytes를 비교하므로 잘못된 UTF-8로 바뀐 외부 파일도 덮어쓰지 않는다. 유효한 한글·emoji·리터럴 U+FFFD는 그대로 UTF-8로 기록하며 기존 LF canonicalization은 Core가 소유한다.
- `preflightFileCommit(filePath, text, revision)`은 출력 Unicode 검사 → symlink real path 해석 → raw-byte revision 확인 → 대상 파일 `W_OK` 검사 → permission mode 읽기의 읽기 전용 경계다. resolved `target`과 실제 교체에 사용할 `mode`를 반환하며 파일을 변경하지 않는다. `commitFile`과 CLI dry run이 같은 함수를 호출한다. 디렉터리 `access` 검사를 새로 추가하지 않으며, 실제 쓰기의 디렉터리 권한 오류는 기존 temporary 생성/rename 단계에서 기존 메시지로 보고한다.
- 순서: symlink를 real path로 해석 → revision 확인 → 쓰기 권한 확인 → 같은 directory에 고유한 temporary sibling(`.<name>.<UUID>.tmp`)을 exclusive create하여 완성된 내용 기록 → 원본 permission bits 적용 → revision 재확인 → rename으로 교체.
- 실패하면 원본은 그대로이고 temporary sibling은 삭제한다. Revision 불일치는 `FileChangedError`다. CLI는 그 메시지와 exit 1을, Editor Host는 기존 conflict 메시지와 HTTP 409를 반환한다. Core가 거부한 문서는 이 단계에 도달하지 않는다.
- Symlink는 link로 남고 대상이 교체된다. Permission bits는 umask와 무관하게 원본 값을 유지한다. 쓰기 권한이 없는 파일은 rename이 가능하더라도 거부한다. 이는 이전 CLI의 in-place write와 같은 결과다. POSIX에서 read-only 파일을 교체하던 Editor Host도 이제 거부한다.
- 새 문서는 이 경로가 아니라 위 New Document 정책의 exclusive create를 사용한다.

보장하지 않는 것:

- 마지막 revision 확인과 rename 사이에 끼어든 외부 write는 감지하지 못한다(TOCTOU). OS 수준의 atomic compare-and-swap이 아니다.
- Process 간 lock, fsync/전원 차단 시 영속성, 자동 merge, filesystem watch는 없다. 강제 종료된 process는 temporary sibling을 남길 수 있다.
- Rename은 새 파일로 교체하므로 owner/group, hard link, Windows의 명시적 ACL과 extended attribute를 유지하지 않는다. 다른 process가 파일을 공유 삭제 없이 열어 두면 Windows에서 rename이 실패할 수 있으며, 이때도 원본은 유지된다.

### CLI revision precondition (#214)

- `inspect <file> --format json`은 기존 `ok`, `command`, `nodes`에 `revision`을 추가한다. 파일을 한 번 읽은 동일한 원본 text를 Core parse와 `textRevision(source)`에 사용한다. Revision은 canonical serialization의 hash가 아니며 문서에 기록하지 않는다. Text inspect 출력은 유지한다.
- 공통 `edit()`를 거치는 모든 문서 변경 명령(`format` 포함)은 선택적 `--if-revision <revision>`을 받는다. `create`, `check`, `inspect`, `serve`는 대상이 아니다. 생략하면 기존 명령 형식과 동작을 유지한다.
- Revision 인자는 정확히 64자리 소문자 hex여야 한다. 형식이 잘못되면 `--if-revision must be 64 lowercase hexadecimal characters`를 stderr에 출력하고 exit 1로 종료한다. 값 누락·중복은 기존 공통 옵션 오류(`missing --if-revision`, `duplicate option: --if-revision`)로 거부한다.
- `edit()`는 원본을 읽은 직후 revision을 비교한다. 다르면 Core parse/operation 전에 `revision mismatch; run inspect again; nothing was written`을 stderr에 출력하고 exit 1로 종료하며 파일 바이트를 보존한다. 새 전용 exit code는 없다.
- 사전조건 통과 후에도 위 File commit 계약을 유지한다. `commitFile`의 baseline은 이번 요청이 읽은 원본의 revision이므로 검증부터 커밋 사이 외부 변경도 기존 `FileChangedError` 경계에서 거부한다. 마지막 확인과 rename 사이의 기존 TOCTOU 한계는 그대로다.
- 단건 변경 명령은 실제 쓰기 성공 후 새 revision을 출력하지 않는다. 후속 변경 전 `inspect`를 다시 실행해 새 revision과 경로를 함께 얻는다. [ADR-0003](../adr/0003-document-addressing-identity-boundary.md)에 따라 NodePath는 현재 snapshot의 locator이며, 구조 변경 후 오래된 경로가 다른 유효 블록을 가리켜도 추측으로 재지정하지 않는다.

### CLI batch application (#215)

- Insertion options (#280): single commands and batches share `insert-equation --label` and `insert-table --caption|--caption-content --label`. They compose existing Core operations before one file replacement; label validation/duplicate rejection and caption rules remain Core-owned. A table label does not require a caption. Failed properties never leave an inserted block in the file.
- `--at end` (batch JSON `"at": "end"`) is accepted by top-level body insertions: `insert-block`, `insert-heading`, `insert-admonition`, `insert-quote`, `insert-divider`, `insert-equation`, `insert-figure`, `insert-table`, `insert-list`, `insert-code-block`, `insert-target`. CLI calls Core `bodyEndIndex` for the current step's snapshot: before endnote definitions, after the last body block without definitions, or 1 for an empty native document. Table row/column positions, removal positions and move destinations (`--to`) remain numeric. The revision precondition above applies unchanged to all these edits.
- `apply-batch <file> --operations <json-file> [--if-revision <revision>] [--format json]`은 한 문서에 기존 Core operation을 순서대로 적용하는 CLI orchestration이다. Core 의미 처리나 Markdown/AST 로직을 별도로 구현하지 않는다. 단건 명령과 같은 옵션 해석·Core operation 생성 함수를 공유한다.
- 입력은 비어 있지 않은 JSON 배열이며 각 원소는 `{ "command": "<변경 명령명>", ...options }`다. 키는 기존 플래그에서 `--`를 뺀 이름이다. 스칼라 옵션은 string/number/boolean만 허용하고 플래그 문자열과 같은 의미로 해석한다. JSON 옵션(`content`, `caption-content`, `cells`, `list`, `insert-table`의 `align`)은 객체/배열을 직접 받거나 기존 JSON 문자열을 받으며 그 외 타입은 거부한다. 모든 옵션의 `null` 값은 거부한다. 필수·허용·상호 배타 옵션 검사는 단건과 같다. stdin(`-`)은 지원하지 않는다.
- `isEditCommand`인 모든 단건 변경 명령(`format` 포함)을 허용한다. `create`, `check`, `inspect`, `serve`, 중첩 `apply-batch`와 operation 내부의 `if-revision` 및 허용되지 않은 키를 거부한다. 배열이 아닌 입력과 빈 배열, 잘못된 JSON도 exit 1로 거부한다.
- 파일 원본을 한 번 읽고, 배치 전체의 `--if-revision`을 그 원본에 대해 위 #214와 같은 규칙으로 Core parse/operation 전에 한 번 확인한다. Revision 불일치는 operation prefix 없이 단건과 같은 `revision mismatch; run inspect again; nothing was written`으로 표시한다.
- 각 단계는 적용 → `validateStructure` → canonical serialize → 다시 parse 순서다. 후속 NodePath와 인덱스는 **직전 단계의 canonical 재파싱 snapshot** 기준이며 자동 추적·재지정하지 않는다. 따라서 같은 단건 명령을 순서대로 실행한 최종 파일 바이트와 일치한다. 각주 정의의 canonical 이동도 단계 사이에 반영된다.
- 중간 결과는 메모리에만 두고, 실제 쓰기 모드는 마지막에 최초 원본 revision으로 `commitFile`을 한 번 호출한다. 옵션·Core·검증·serialize·revision·커밋 실패 시 배치의 부분 결과를 쓰지 않고 exit 1로 종료한다. 외부 write는 덮어쓰지 않으며 위 File commit의 TOCTOU 한계는 동일하다.
- 각 원소의 입력 검증·옵션 해석·Core operation·validate/serialize·단계별 재파싱 오류에만 stderr에 `operation <1-based index> (<command>): <원래 오류>; nothing was written`을 출력한다. 최초 원본 read/parse·revision 확인과 최종 커밋 오류는 특정 operation에 연결하지 않고 prefix 없이 단건 명령과 동일한 메시지를 출력한다. 커밋 충돌도 기존 `... changed after it was read; nothing was written`을 유지한다. JSON 전체 파싱과 최상위 옵션 오류도 prefix 없이 원래 메시지를 출력한다. 실패 시 stdout은 비어 있다.
- 실제 쓰기 성공 시 text 모드는 출력이 없다. `--format json`은 stdout 한 줄에 `{"ok":true,"command":"apply-batch","applied":N,"revision":"<커밋한 내용의 textRevision>"}`을 출력한다. 단건 변경 명령 출력은 유지한다. 별도 후속 요청 전에는 `inspect`로 새 revision과 경로를 함께 얻는다.

### CLI dry run (#292)

- `apply-batch`와 모든 단건 문서 변경 명령(`format` 포함)은 값 없는 `--dry-run`을 받는다. Core operation, 구조 검증, canonical serialize와 배치 단계별 재파싱은 실제 쓰기와 같은 경로다. `--if-revision`도 원본에 대해 동일하게 확인한다. 옵션·operation·round-trip/writeability 실패는 실제 실행과 같은 메시지와 exit 1을 유지하며 stdout은 비어 있다. 배치의 operation prefix 규칙도 동일하다.
- 성공해도 `commitFile`을 호출하지 않으며 target·temporary sibling 생성/쓰기·chmod·rename·삭제를 수행하지 않는다. 결과는 메모리에만 둔다. 실제 쓰기와 같은 `preflightFileCommit`으로 출력 Unicode, symlink 대상의 현재 revision, 파일 쓰기 권한과 mode를 확인한다. 이는 입력과 Core 쓰기 가능성의 사전검증이며, 실제 쓰기를 하지 않고 디렉터리의 생성/rename 권한, 디스크 부족, OS rename 잠금, 이후 권한·파일 변경 등 commit I/O 성공까지 보장할 수는 없다.
- 결과 canonical Markdown을 다시 parse한 문서에 기존 `check` 로직을 적용한다. text stdout은 `dry run; nothing was written`, `revision: <결과 revision>`, 기존 check 요약, `--- markdown ---` 다음에 canonical Markdown을 출력한다. 경고·note는 check와 같이 stderr에 출력한다. Markdown을 포함하므로 별도 쓰기 없이 실제 적용될 문서를 검토할 수 있다. text 출력 전체는 Markdown 파일 자체가 아니며, 정확한 결과 추출에는 JSON의 `markdown`을 사용한다.
- 원본에 literal syntax 진단(정의 없는 각주·명시적 참조식 링크/이미지 또는 닫히지 않은 코드 opener)이 있으면 결과 검사와 별도로, 성공한 dry run도 실제 쓰기와 같은 `warnLiteralSyntax` 경고를 stderr에 출력한다(JSON 모드 포함). `written as literal`은 미리보기의 canonical Markdown 표현을 가리키며 파일을 썼다는 뜻이 아니다. 원본 parse의 진단을 operation 전에 보관하므로 배치도 원본의 각 발생을 한 번씩만 보고한다. 실패한 실행에서는 이 경고를 출력하지 않는다. [공통 literal syntax 진단 계약](footnotes-v1.md#literal-syntax-diagnostics-290-304)을 따른다.
- `--dry-run --format json`은 stdout 한 줄에 `ok`, `command`, `dryRun: true`, `revision`(결과 Markdown의 SHA-256), `markdown`과 check의 `validation`, `writeability`, `references`, `readiness`, `endnotes`를 출력한다. 배치는 `applied`도 포함한다. 단건의 `--format`은 dry run에서만 지원한다. 경고는 실패가 아니며 성공 exit code는 0이다. 실패는 기존 편집 명령처럼 stderr 메시지와 exit 1을 사용한다(JSON 오류 envelope를 새로 도입하지 않음).
- JSON 미리보기는 `originalWarnings` 배열도 포함한다. 원본의 모든 source-only 진단을 Core 형식 그대로 담는다(예: `{"footnote":true,"label":"loss","path":[1],"line":5}`); 없으면 `[]`다. `references.unresolved`는 결과 문서의 진단만 유지하므로 canonical escape 후 해당 항목이 사라져도 원본 경고를 잃지 않는다. `check`와 실제 쓰기 JSON에는 이 필드를 추가하지 않는다.
- `create`는 기존 파일 편집과 별도의 exclusive-create 경로이므로 제외한다. `check`, `inspect`, `serve`도 대상이 아니며 batch operation 안의 `dry-run`/`format` 출력 옵션은 허용하지 않는다. 배치 전체 요청에만 지정한다. 실제 쓰기 모드의 출력 계약은 유지한다. 미리보기 뒤 실제 적용 시 원본 revision을 `--if-revision`으로 전달하고, 실제 쓰기 후에는 `inspect`로 저장된 revision과 경로를 다시 얻는다.

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
- 문서는 기존 `GET /api/document` 경로로 연다. 저장하지 않은 변경이나 draft가 있으면 [편집 세션 계약](editing-session-save-v1.md#switching-and-recovery)의 Save / Don't save / Cancel 확인을 거친다. Save 실패나 취소 시 세션을 유지하며, 진행 중인 작업은 기존처럼 전환을 거부한다. 문서를 열거나 만들면 그 문서 위의 folder들(선택한 folder 안일 때)을 펼치고 다시 list하므로 새 문서가 바로 보인다. IeumDoc 밖의 변경은 watch하지 않는다. 늦게 도착한 listing은 같은 folder의 더 새 요청을 덮지 않고, 그 사이 접힌 folder를 다시 펼치지 않는다.
- `.md` 파일 open 범위는 넓어지지 않는다. Host는 이전부터 임의 `.md` 경로를 열 수 있고, listing은 이름과 종류만 보여 준다.
- Git 감지, `.ieumdoc/` 설정, index DB, watch service, 검색 인프라는 포함하지 않는다. CLI 명령도 없다. folder listing은 문서 의미를 바꾸는 operation이 아니라 interface/Host 탐색이며, headless 환경에서는 shell의 파일 목록으로 충분하다.

### Folder picker v1

- [Folder picker](folder-picker-v1.md)는 앱 안에서 경로를 고른다. OS 선택창, upload, 별도 복사본은 없다. Open을 누르기 전의 탐색은 sidebar와 문서를 바꾸지 않는다.
- `GET /api/folder-browse?path=<folder>`는 `{ path, crumbs, entries }`를 돌려준다. `crumbs`는 filesystem root부터 해당 folder까지의 `{ name, path }` 목록이며 Host가 계산한다. 항목 필터와 정렬은 Folder listing v1과 같다. 선택 전의 탐색은 sidebar의 `root` 제한을 사용하지 않는다.
- `GET /api/folder-places`는 `{ places: [{ kind, name, path }] }`를 돌려준다. Home, 실제 존재하는 Documents, Windows drive roots 또는 `/`가 시작점이다. Host는 탐색 위치나 최근 목록을 저장하지 않는다.
- Recent는 이 Browser의 `ieumdoc.recentFolders` preference다. 성공한 Open만 기록하고, 새로고침 시 sidebar folder를 자동으로 복원하지 않는다. 문서 내용·의미와 무관하므로 Core operation이나 CLI command를 추가하지 않는다.

### Folder creation v1

[Folder picker](folder-picker-v1.md#new-folder)와 sidebar folder의 New folder가 사용한다.

- `POST /api/folder`는 `{ parent, name }`을 받아 `parent` 바로 아래에 `name` folder 하나를 만들고 201 `{ path }`를 돌려준다. 오류는 다른 folder 요청처럼 400 `{ error }`다. Desktop은 같은 handler를 그대로 쓴다.
- `parent`는 이미 있는 directory여야 한다. 중간 folder를 함께 만들지 않는다(non-recursive). 같은 이름의 file이나 folder가 있으면 덮어쓰거나 합치지 않고 거부한다.
- `name`은 한 단계의 portable 이름이다. 빈 이름, 구분자(`/`, `\`), `.`/`..`, `.`으로 시작하는 이름(listing에 나타나지 않음), `< > : " | ? *`와 control 문자, 끝의 `.`이나 공백, Windows 예약 이름(`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, 확장자가 붙어도 같음)을 모든 플랫폼에서 거부한다. 문서 folder를 다른 OS로 옮겨도 열 수 있게 하기 위함이다.
- Picker는 선택 전 탐색처럼 sidebar의 `root` 제한을 쓰지 않는다. Host는 요청 사이에 아무것도 기억하지 않으며, 만든 folder를 열거나 rename/delete/move하는 API는 없다.
- 문서 내용과 의미를 바꾸지 않으므로 Core operation이나 CLI command를 추가하지 않는다. headless 환경에서는 shell의 `mkdir`로 충분하다.

## Current implementation mapping

현재 `apps/editor/server`는 **세 Host가 공유하는 stateless filesystem 구현**이다.

- `apps/editor/server/document-api.ts`가 요청된 `.md` path를 resolve하고 Node filesystem API로 read/create한다. 기존 파일 교체는 CLI와 공유하는 [File commit v1](#file-commit-v1)을 사용한다.
- `/api/document` 등의 동일 route를 Vite HTTP, Desktop custom protocol, 독립 HTTP가 연결한다.
- `file-access.ts`의 HTTP Root 정책은 모든 파일 helper에 전달한다. 기존 대상은 lexical/real path, 새 대상은 기존 parent의 real path를 검사한다. Root의 경로·identity가 바뀌면 거부한다. 정적 Editor 자산은 `editor-static.ts`가 별도 고정 build directory에서 제공한다.
- `apps/editor/shared/document-protocol.ts`가 Browser와 Host의 저장 요청·응답 타입을 공유한다. 이 파일은 Core 공개 타입을 사용하는 데이터 계약이며, 파일 접근·검증·저장 실행은 포함하지 않는다.
- adapter는 Core의 parse, semantic save operation, validation 및 serialization을 호출하고, 파일 I/O 자체는 adapter가 수행한다.
- 문서 revision을 확인하여 외부 변경 후 stale save를 거부하는 현재 conflict 동작도 이 경계 안의 host/editor adapter 동작이다.
- 상대 media는 열린 document directory를 기준으로 resolve하며 directory 밖 traversal을 거부한다.
- `/api/folder`가 Folder listing v1(GET, `listFolder`)과 Folder creation v1(POST, `createFolder`)을 구현한다.
- `/api/folder-browse`와 `/api/folder-places`가 경로 선택용 목록과 시작점을 제공한다(`browseFolder`, `folderPlaces`).
- `/api/asset`의 JSON POST가 Image choice v1(`chooseImageAsset`)을 구현한다.

HTTP의 네트워크 검사·Root 정책과 로컬 Host의 기존 정책은 분리한다. 새 문서 의미나 별도 영속 저장소는 추가하지 않는다.

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

현재 New Document creation은 이 공유 Host 경계로 구현되어 있다.

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

## Native admission

Open, Reload, Save, Source and asset creation share Core's [native contract](document-support-v1.md). New file serializes `createDocument()`. Rejected Open/Reload returns diagnostics without installing a document model or changing existing editor work. `/api/block-source` and source-replacement replay are removed.
