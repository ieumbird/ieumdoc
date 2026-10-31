# Filesystem Host Boundary v1

- Status: Implemented
- Non-overlapping roots verification: 2026-10-29 (#702: Editor 338 unit tests, typecheck/build; persistent Chrome folder-navigation/memory, layout-rules, quiet-document, document-tabs, editor-shell and reveal-folder; [behavior and captures](editor-ux-shell-v1.md#non-overlapping-opened-folders-702)).
- Post-replacement cleanup verification: 2026-10-27 (PR #609 review P1: four regressions failed before the fix; Host/HTTP 26, Editor 313, shared file-commit 4 passed / 2 platform skips, dedicated-port file-actions browser passed; shared file-commit behavior unchanged).
- Referenced image rename verification: 2026-10-27 (#504 PR B: Core/CLI/Host tests, file-actions browser dirty/draft protection and clean-tab reload, other-window Save conflict, production HTTP Save/Reload/recovery; rollback failures use real temporary files with injected I/O errors).
- File operations verification: 2026-10-27 (#505 / #504 PR A: Editor/Host/Desktop unit tests, workspace typecheck, production Editor build and targeted persistent-Chrome browser checks; packaged Desktop is CI-only).
- Folder refresh verification: 2026-10-26 (#494: loaded-list refresh and asset parent updates; [behavior and verification](editor-ux-shell-v1.md#folder-refresh-494)).
- Last verified: 2026-10-25 (#425 owner persistence decision: Editor tests/typecheck/build, folder-memory/navigation/command-center/document-tabs/editor-shell/quiet-document; [restoration evidence](editor-ux-shell-v1.md#section-persistence-decision-and-verification-2026-10-25)).
- Previous verification: 2026-10-24 (#367 cross-tab follow-up: explicit Open/Close remembers the current tab's list, tree-only updates leave preferences intact; folder-memory browser regression; Host handlers unchanged).
- Previous verification: 2026-10-24 (#367 review follow-up: user Open/Close wins over same-path restoration, unchanged path preferences are not rewritten; folder-memory browser regression; Host handlers unchanged).
- Previous verification: 2026-10-24 (#367: browser preference restoration/Open/Close race and Reload regression; tab Non-goal compared with [ADR-0007](../adr/0007-editing-session-lifetime.md) and the [editing-session contract](editing-session-save-v1.md#switching-and-recovery); Host handlers unchanged).
- Previous verification: 2026-10-23 (#235 [ADR-0009](../adr/0009-multiple-opened-folders.md): several opened folders in the Sidebar, paths restored from browser preferences, outermost-folder context; Host handlers unchanged; Editor unit tests and stable browser suite).
- Previous verification: 2026-10-22 (#217: all-file Sidebar listing, bounded read-only image preview; Host/Editor/Desktop protocol tests and actual Vite/production HTTP browser regressions).
- Literal syntax verification: 2026-10-15 (#304: original-source warnings in check, single/batch writes and dry-run JSON; Core/CLI tests and source CLI).
- CLI preview verification: 2026-10-15 (#292: shared file-commit preflight, dry-run no-write boundary, failure parity and result/check output; source CLI and Core/CLI/file-commit tests).
- CLI insertion verification: 2026-10-15 (#280 single-write properties, unchanged-file refusal and per-step batch `end` resolution; Core/CLI tests).
- Start-up/CLI path verification: 2026-10-15 (#287 unit tests for refusal before path I/O and valid Unicode names; Desktop tested without Electron).
- Previous verification: 2026-10-17 (UX review: sidebar folder listing marks documents without the native marker through Core `hasNativeMarker`; Editor/Core unit tests and the stable browser suite. Write handlers unchanged).
- Previous verification: 2026-10-16 (#204: Editor tab admission and navigation wording checked; Host persistence and write handlers unchanged).
- Previous verification: 2026-10-14 (#215: CLI batch sequential-byte equivalence, original preservation, revision/output, batch-wide versus step errors, null option rejection and commit conflict regressions. #214: CLI inspect revision and edit precondition, real-file stale path/byte preservation and commit conflict regressions. #237: unsupported save edit fields rejected with unchanged file bytes in Host tests; actual Vite `save-session`, production HTTP and packaged Desktop Save/Reload/conflict regressions. #211 / PR #229: proxy-safe normal media separators and standalone dot-segment transport retain Host traversal checks; Editor/Host unit tests and actual Vite `image-assets` loading/Save/Reload; image choice listing, link/copy and HTTP root denial; shared handlers, root enforcement and full regressions on 2026-10-13).
- Authority: shared file Host boundary for Vite, [ADR-0004 Desktop](../adr/0004-desktop-host-distribution.md) and [ADR-0005 HTTP](../adr/0005-http-host.md). [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md) owns persistence semantics.
- Encoding verification: 2026-10-15 (#271 malformed UTF-8/Unicode refusal, raw-byte revision checks, original preservation and temporary cleanup; Vite/production HTTP repeated Unicode Save → Reload and existing external-conflict regressions).
- Date: 2026-09-23
- Path verification: 2026-10-15 (#278 shared helper and real HTTP refusal before path I/O, no replacement files, valid Unicode names and pre-normalization checks; PR #284 strict percent-encoded query refusal for document/media reads, form decoding and valid Unicode URL regressions).
- Scope: 실제 filesystem에 접근하는 주체와 Browser Editor, Host, Core 사이의 책임 경계.

Bibliography reads reuse the shared stateless Host and existing Root checks through the dedicated
`/api/bibliography` endpoint. Only declarations of an admitted, revision-matched document are read;
resource errors do not block Markdown Save. The local per-document folder context, HTTP fixed Root
union, limits and snapshot policy are specified in [Citations v1](citations-v1.md#bibliography-snapshots-and-limited-formatting-unit-b).

## Plain text file boundary (#817)

Shared Vite/Desktop/HTTP `GET /api/document` returns either a native Core read model
or `{ kind: text, path, source, revision }` for `.txt` and Core-refused `.md`.
Native semantic Save requests keep their existing strict replay schema.
A separate tagged request `{ kind: text, path, source, revision }` allows no native
edit/base fields. It checks Root/path, UTF-8/Unicode, current revision and current
disk admission before invoking the existing File commit. A native file cannot be
written through this raw path, even by forging the kind tag. New remains native `.md`.
Folder listings include `.txt` as openable text files; other extensions are unchanged.
Recovery's disk-only comparison also reads `.txt` without attempting native replay.
No retained document/session state or new persistence service is introduced.

## Desktop folder Explorer action (#487)

Desktop alone offers the folder More actions command described in the
[Desktop contract](desktop-distribution-v1.md#open-folders-in-file-explorer-487).
Successful root listings through the shared handler register local roots for this action;
shared HTTP/Vite endpoints gain no OS-launch operation. The main process keeps the current
opened subset, checks directory type and reuses `RootAccess` to refuse lexical/real-path escape
and replaced roots before invoking the OS. UNC/device paths are not eligible. This is a Desktop
OS action, with no document write, Core semantic operation or CLI parity command.


## Docling execution (#797)

The shared handler exposes the Docling device setting, connection check and one
transient conversion in Vite, Desktop and HTTP Host. Module REST calls execute
only on the Host. PDF input and new sibling output use existing Root/real-path
checks, repeated before publication. The settings file is selected by the Host,
never a browser-supplied filesystem path. See the
[conversion contract](docling-conversion-v1.md#app-pdf-conversion-797) for routes,
configuration ownership, publication, cancellation and notification behavior.
This does not add a document session, persistence service or semantic write path.

## Purpose

The read-only `GET /api/docling-compare?path=…` route uses the same handler and
Root/media real-path checks in Vite, Desktop and HTTP Host. It admits the native
Markdown through Core and delegates correspondence interpretation/hash checking
to `@ieumdoc/docling`. Page images use the ordinary document-relative media route;
remote/data image URIs and paths escaping the conversion folder are refused.
No large source document.json is sent to the UI: correspondence v1 already carries
the needed page/item data. See [Docling comparison](docling-compare-v1.md).

Recovery source review and pre-save comparison (#655 stages 1/2) use a read-only mode of the existing endpoint:
`POST /api/document-source?recovery=1` accepts `{ path, save? }`, where `save`, when present,
contains the normal revision/opening source/savedEdits/edit payload. The shared Vite/Desktop/HTTP
handler reads the current disk source, revision and Core read model (or explicit absence), and
independently calls the same session preview used by Source and `saveCurrentDocument` used by Save.
A Core preview refusal returns its reason and the existing structured Save failure metadata (phase,
action and available target/block/cell/line) alongside the disk comparison input; no commit, temporary
file, revision acknowledgement or recovery storage change occurs. Normal Save conflict checks remain
unchanged. Requests retain existing path/Root, JSON/body-limit and same-origin protections. An absent
leaf is read only beneath the existing access boundary. The optional disk read model serves the
[same-rule plaintext fallback](editing-session-save-v1.md#recovery-review-layout-contract); failure
to read that model is explicit and never reclassifies a present file as missing.

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

- Browser의 clipboard/drop 이미지 바이트를 local Host가 검증하고 열린 Markdown 문서의 `assets/<name>.<ext>`에 저장한다. 응답 경로는 `./assets/<name>.<ext>`이며 이름은 아래 #652 규칙으로 Host가 정한다. `<ext>`는 MIME이 정한다: PNG `png`, JPEG `jpg`, GIF `gif`, WebP `webp`. 문서와 `assets/`를 함께 이동하면 경로가 유지된다.
- PNG, JPEG, GIF, WebP를 지원한다. MIME과 그 형식의 완성된 container를 확인한다: PNG는 signature·IHDR·IEND까지의 chunk envelope, JPEG는 SOI·frame header·scan 뒤의 EOI(EOI 뒤 camera 부가 data는 유지), GIF는 header·block·trailer, WebP는 file 길이와 맞는 RIFF chunk와 image data. 내용이 MIME과 다르거나 잘린 파일, 빈 파일과 과도한 크기를 거부한다. 형식 목록과 크기 상한의 코드 기준은 `apps/editor/shared/asset-policy.ts`다. 이미지를 decode·변환·최적화하지 않는다. SVG는 script를 담을 수 있는 active content라 sanitizer 없이 저장하지 않는다. 원격 다운로드도 포함하지 않는다. 문서에 이미 있는 상대 media는 확장자에 맞는 `Content-Type`과 `nosniff`로 제공한다.
- `POST /api/asset?path=<document locator>`는 지원 형식의 MIME을 `Content-Type`으로 한 binary body를 받는다. 응답은 상대 `path`와 opaque `rollbackToken`이다. 저장 protocol과 binary upload를 합치지 않는다.
- 이미지 선택 POST와 rollback DELETE의 JSON body는 공통 strict UTF-8 decoder를 사용한다. 잘못된 UTF-8은 파일 복사·삭제 전에 HTTP 400으로 거부하고 문서·기존 asset 바이트를 보존한다. 이미지 binary body는 text로 decode하지 않는다. 이 경계는 Vite·Desktop·HTTP Host가 공유한다.
- Host는 document directory의 real path를 경계로 사용한다. `assets/` 자체의 symlink, 경계 밖 document symlink, traversal·absolute·비정상 asset path를 거부한다. 완성된 temporary sibling을 exclusive hard link로 공개한 뒤 temp를 제거하여 partial 파일과 기존 파일 overwrite를 막는다. 이 filesystem 동작을 지원하지 않으면 실패를 표시한다.
- Host write 실패는 Editor를 변경하지 않는다. 성공한 경로로 기존 Figure insert 경로를 사용하며, 삽입이 거부되거나 요청 중 Editor가 사라지면 `DELETE /api/asset`로 rollback한다. 서명된 receipt는 생성 inode와 업로드 바이트에 묶는다. 삭제 전에 임시 이름으로 옮겨 같은 fd에서 identity/content를 검증하고, 다른 파일로 바뀌었으면 overwrite 없이 원위치로 복구한다. rollback/복구 실패는 남은 경로와 함께 명시한다. temp cleanup도 directory/file identity를 확인하며, 외부 directory 교체로 소유권을 확인할 수 없으면 삭제를 거부하고 잔여 temp 경로를 오류로 표시한다. Host는 session이나 asset 목록을 저장하지 않으며 receipt 서명 key는 각 Host 프로세스 수명에 한정한다.
- 내부 IeumDoc rich clipboard는 기존 typed paste를 우선한다. 그 외 파일을 포함한 paste/drop은 한 번에 지원 형식 이미지 하나를 처리하고 함께 제공된 text/HTML은 삽입하지 않는다. 업로드 중 engine transaction mapping으로 삽입 위치를 유지하며, Figure 삽입은 독립 Undo 한 번으로 취소된다.
- 정상 삽입 뒤 Undo, Figure 삭제, 미저장 종료로 남는 orphan asset은 자동 정리하지 않는다. 응답을 받기 전에 연결이 끊기거나 Host가 재시작되어 receipt가 무효화된 경우에도 자동 복구/GC는 없다. Markdown Save, Core canonical guard와 opening-snapshot session 계약은 그대로 유지한다.

### Image filenames (#652)

The implementation scope is Host naming, the Figure properties entry into the existing #504
rename operation, session/history integration and focused Host/browser regression checks.
No Core Figure operation changes, CLI command, SVG policy, format conversion, prompt on paste,
or bulk rename is introduced. CLI is omitted because file naming reuses Host orchestration;
Core's existing media-reference operation remains the semantic authority.

Binary upload accepts `name` and `source=paste|drop` query hints (omitted source defaults to paste).
The Host rejects unknown source values before creating assets and checks the name with
`assertUnicode` before asset directory creation. It removes the hint's extension and replaces separators,
Windows-invalid/control characters, repeated dots and encoded-traversal percent prefixes with
hyphens; trims leading dots and trailing dots/spaces; prefixes reserved Windows stems with `_`;
and bounds the stem to 180 UTF-8 bytes without splitting code points. Korean names are retained.
The MIME determines the extension. A named image uses its sanitized stem, then `-2`, `-3`, etc.
on exclusive hard-link EEXIST. For example `회로도.jpeg` with PNG MIME becomes `회로도.png`.
Copied Host images use the same original-basename hint.

Drops always retain the sanitized original name, including `image.png`; Host-selected real files
also keep their names. For paste, an empty/empty-after-cleaning name or exact case-insensitive
`image.png`, `image.jpg`, `image.jpeg`, `image.gif`, `image.webp` uses `<document-stem>-<number>.<mime-extension>`.
Chromium supplies `image.png` for a native clipboard PNG (covered by the real clipboard browser
scenario), so this deliberately narrow generic-name set covers the supported MIME family without
mistaking descriptive `image-architecture.png` or `image1.png` for anonymous images. Thus a
real file copied from Explorer with a descriptive name retains that name on paste. An unusable
empty drop name falls back to document numbering. The document basename excludes `.md` and
uses the same sanitization (empty fallback `document`). The number is the largest existing same-prefix numbered
file in `assets/`, across extensions, plus one; gaps are not reused and directories are ignored.
EEXIST advances the number, preserving the existing no-overwrite hard-link publication.

Receipts remain signed for the exact created path, inode and bytes, including readable names.
After insertion is accepted, the client releases the receipt before subsequent focus/history UI
work; copied-choice receipts are released when Apply transfers ownership. Rename is available
only after this transfer. Receipts are neither persisted nor followed to renamed paths, and
Undo/deletion does not use them. A stale pre-rename receipt cannot delete a replacement at the
old path (identity mismatch); an absent old path is a no-op. Committed renamed files are retained
when their Figures are undone, under the existing orphan policy.

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

- NodePath 옵션 `--path`는 쉼표로 구분한 음이 아닌 정수이며 숫자 주변 공백은 허용한다. 빈 segment(예: `1,,0`, `1, ,0`, `,1,0`, `1,0,`)와 빈 경로는 `--path must be comma-separated non-negative integers` 오류와 exit 1로 거부한다. `apply-batch`의 `path`도 같은 파서를 사용하며, 단건·배치 실패 시 원본 파일 바이트를 보존한다(#345).
- `inspect <file> --format json`은 기존 `ok`, `command`, `nodes`에 `revision`을 추가한다. 파일을 한 번 읽은 동일한 원본 text를 Core parse와 `textRevision(source)`에 사용한다. Revision은 canonical serialization의 hash가 아니며 문서에 기록하지 않는다. Text inspect 출력은 유지한다.
- 공통 `edit()`를 거치는 모든 문서 변경 명령(`format` 포함)은 선택적 `--if-revision <revision>`을 받는다. `create`, `check`, `inspect`, `serve`는 대상이 아니다. 생략하면 기존 명령 형식과 동작을 유지한다.
- Revision 인자는 정확히 64자리 소문자 hex여야 한다. 형식이 잘못되면 `--if-revision must be 64 lowercase hexadecimal characters`를 stderr에 출력하고 exit 1로 종료한다. 값 누락·중복은 기존 공통 옵션 오류(`missing --if-revision`, `duplicate option: --if-revision`)로 거부한다.
- `edit()`는 원본을 읽은 직후 revision을 비교한다. 다르면 Core parse/operation 전에 `revision mismatch; run inspect again; nothing was written`을 stderr에 출력하고 exit 1로 종료하며 파일 바이트를 보존한다. 새 전용 exit code는 없다.
- 사전조건 통과 후에도 위 File commit 계약을 유지한다. `commitFile`의 baseline은 이번 요청이 읽은 원본의 revision이므로 검증부터 커밋 사이 외부 변경도 기존 `FileChangedError` 경계에서 거부한다. 마지막 확인과 rename 사이의 기존 TOCTOU 한계는 그대로다.
- 단건 변경 명령은 실제 쓰기 성공 후 새 revision을 출력하지 않는다. 후속 변경 전 `inspect`를 다시 실행해 새 revision과 경로를 함께 얻는다. [ADR-0003](../adr/0003-document-addressing-identity-boundary.md)에 따라 NodePath는 현재 snapshot의 locator이며, 구조 변경 후 오래된 경로가 다른 유효 블록을 가리켜도 추측으로 재지정하지 않는다.

### CLI batch application (#215)

Stdin verification: 2026-10-28 (#681: actual piped UTF-8/BOM input, file-byte/output equivalence, dry run and failure preservation).

- Insertion options (#280): single commands and batches share `insert-equation --label` and `insert-table --caption|--caption-content --label`. They compose existing Core operations before one file replacement; label validation/duplicate rejection and caption rules remain Core-owned. A table label does not require a caption. Failed properties never leave an inserted block in the file.
- `--at end` (batch JSON `"at": "end"`) is accepted by top-level body insertions: `insert-block`, `insert-heading`, `insert-admonition`, `insert-quote`, `insert-divider`, `insert-equation`, `insert-figure`, `insert-table`, `insert-list`, `insert-code-block`, `insert-target`. CLI calls Core `bodyEndIndex` for the current step's snapshot: before endnote definitions, after the last body block without definitions, or 1 for an empty native document. Table row/column positions, removal positions and move destinations (`--to`) remain numeric. The revision precondition above applies unchanged to all these edits.
- `apply-batch <file> --operations <json-file|-> [--if-revision <revision>] [--format json]`은 한 문서에 기존 Core operation을 순서대로 적용하는 CLI orchestration이다. Core 의미 처리나 Markdown/AST 로직을 별도로 구현하지 않는다. 단건 명령과 같은 옵션 해석·Core operation 생성 함수를 공유한다.
- 입력은 비어 있지 않은 JSON 배열이며 각 원소는 `{ "command": "<변경 명령명>", ...options }`다. 키는 기존 플래그에서 `--`를 뺀 이름이다. 스칼라 옵션은 string/number/boolean만 허용하고 플래그 문자열과 같은 의미로 해석한다. JSON 옵션(`content`, `caption-content`, `cells`, `list`, `insert-table`의 `align`)은 객체/배열을 직접 받거나 기존 JSON 문자열을 받으며 그 외 타입은 거부한다. 모든 옵션의 `null` 값은 거부한다. 필수·허용·상호 배타 옵션 검사는 단건과 같다. `--operations -`는 EOF까지 stdin을 UTF-8로 읽는다. 잘못된 UTF-8, 빈 입력과 잘못된 JSON은 문서를 변경하지 않고 exit 1로 거부한다. Windows PowerShell UTF-8 파이프의 선두 BOM 하나만 stdin에서 제거하며 파일 입력의 BOM 처리 규칙은 바꾸지 않는다.
- `isEditCommand`인 모든 단건 변경 명령(`format` 포함)을 허용한다. `create`, `check`, `inspect`, `serve`, 중첩 `apply-batch`와 operation 내부의 `if-revision` 및 허용되지 않은 키를 거부한다. 배열이 아닌 입력과 빈 배열, 잘못된 JSON도 exit 1로 거부한다.
- 파일 원본을 한 번 읽고, 배치 전체의 `--if-revision`을 그 원본에 대해 위 #214와 같은 규칙으로 Core parse/operation 전에 한 번 확인한다. Revision 불일치는 operation prefix 없이 단건과 같은 `revision mismatch; run inspect again; nothing was written`으로 표시한다.
- 각 단계는 Core operation → `validateStructure` → Core `placeEndnotes`의 canonical 배치와 중간 write 검사 순서다. 후속 NodePath와 인덱스는 **직전 단계의 canonical 배치 snapshot** 기준이며 자동 추적·재지정하지 않는다. #716에 따라 미주 정의·참조의 정리는 단계마다 하지 않고, 전체 batch가 끝난 뒤 Core `reconcileEndnotes`로 한 번 판정하고 최종 native serialize한다. 참조를 잠시 제거했다가 다른 위치에 넣는 이동도 정의를 잃지 않는다. 중간 write 검사는 미주를 완성한 검증용 복사본만 사용하며 그 합성 참조·정의는 결과에 포함하지 않는다. 미주 이외의 write 거부 계약(빈 수식의 고정 번호 등)은 그대로 유지한다. 완성된 단계만으로 구성된 기존 batch는 순차 단건 실행과 같은 파일 바이트를 쓴다.
- 중간 결과는 메모리에만 두고, 실제 쓰기 모드는 마지막에 최초 원본 revision으로 `commitFile`을 한 번 호출한다. 옵션·Core·검증·serialize·revision·커밋 실패 시 배치의 부분 결과를 쓰지 않고 exit 1로 종료한다. 외부 write는 덮어쓰지 않으며 위 File commit의 TOCTOU 한계는 동일하다.
- 각 원소의 입력 검증·옵션 해석·Core operation·validate/serialize·중간 배치 오류에만 stderr에 `operation <1-based index> (<command>): <원래 오류>; nothing was written`을 출력한다. 최초 원본 read/parse·revision 확인과 batch 완료 검증·최종 커밋 오류는 특정 operation에 연결하지 않고 prefix 없이 단건 명령과 동일한 메시지를 출력한다. 커밋 충돌도 기존 `... changed after it was read; nothing was written`을 유지한다. JSON 전체 파싱과 최상위 옵션 오류도 prefix 없이 원래 메시지를 출력한다. 실패 시 stdout은 비어 있다.
- 실제 쓰기 성공 시 text 모드는 출력이 없다. `--format json`은 stdout 한 줄에 `{"ok":true,"command":"apply-batch","applied":N,"revision":"<커밋한 내용의 textRevision>"}`을 출력한다. 단건 변경 명령 출력은 유지한다. 별도 후속 요청 전에는 `inspect`로 새 revision과 경로를 함께 얻는다.

**배치 사용 예제:** 아래 예제는 저장소 밖의 기존 임시 폴더에 아직 없는 `document.md`를 만들고, H1 제목만 추가한 상태에서 시작합니다. 명령은 저장소 루트에서 실행하며, `<임시 폴더>`는 실제 절대 경로로 바꿉니다.

```bash
pnpm ieumdoc create "<임시 폴더>/document.md"
pnpm ieumdoc insert-heading "<임시 폴더>/document.md" --at end --level 1 --text "Example document"
pnpm ieumdoc inspect "<임시 폴더>/document.md" --format json
```

이 상태의 Core snapshot은 metadata가 인덱스 0, H1 제목이 경로 `[1]`이며 다른 본문은 없습니다. 다음 두 작업은 H2를 끝(인덱스 2)에 삽입한 뒤 그 heading을 수정합니다. 제목은 첫 본문 위치에 유지합니다. 같은 임시 폴더의 `operations.json`에 저장합니다.

```json
[
  { "command": "insert-heading", "at": "end", "level": 2, "text": "Method" },
  { "command": "update-heading", "path": "2", "content": [{ "kind": "text", "text": "Verified method" }] }
]
```

```bash
pnpm ieumdoc apply-batch "<임시 폴더>/document.md" --operations "<임시 폴더>/operations.json" --if-revision <위 inspect에서 얻은 revision> --format json
pnpm ieumdoc check "<임시 폴더>/document.md"
```

같은 초기 문서와 revision에서 파일 입력 대신 stdin을 사용할 수 있습니다. 아래 두 예제는 대안이며 연속으로 실행하지 않습니다.

```bash
cat "<임시 폴더>/operations.json" | pnpm ieumdoc apply-batch "<임시 폴더>/document.md" --operations - --if-revision <위 inspect에서 얻은 revision> --format json
```

Windows PowerShell에서는 파이프를 UTF-8로 인코딩합니다. JSON을 만드는 명령의 출력도 같은 방식으로 전달할 수 있습니다.

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Get-Content -Raw -Encoding utf8 "<임시 폴더>/operations.json" | pnpm ieumdoc apply-batch "<임시 폴더>/document.md" --operations - --if-revision <위 inspect에서 얻은 revision> --format json
```

### CLI dry run (#292)

- `apply-batch`와 모든 단건 문서 변경 명령(`format` 포함)은 값 없는 `--dry-run`을 받는다. Core operation, 구조 검증, canonical serialize와 배치 완료 시 미주 정리는 실제 쓰기와 같은 경로다. `--if-revision`도 원본에 대해 동일하게 확인한다. 옵션·operation·round-trip/writeability 실패는 실제 실행과 같은 메시지와 exit 1을 유지하며 stdout은 비어 있다. 배치의 operation prefix 규칙도 동일하다.
- 성공해도 `commitFile`을 호출하지 않으며 target·temporary sibling 생성/쓰기·chmod·rename·삭제를 수행하지 않는다. 결과는 메모리에만 둔다. 실제 쓰기와 같은 `preflightFileCommit`으로 출력 Unicode, symlink 대상의 현재 revision, 파일 쓰기 권한과 mode를 확인한다. 이는 입력과 Core 쓰기 가능성의 사전검증이며, 실제 쓰기를 하지 않고 디렉터리의 생성/rename 권한, 디스크 부족, OS rename 잠금, 이후 권한·파일 변경 등 commit I/O 성공까지 보장할 수는 없다.
- 결과 canonical Markdown을 다시 parse한 문서에 기존 `check` 로직을 적용한다. text stdout은 `dry run; nothing was written`, `revision: <결과 revision>`, 기존 check 요약, `--- markdown ---` 다음에 canonical Markdown을 출력한다. 경고·note는 check와 같이 stderr에 출력한다. Markdown을 포함하므로 별도 쓰기 없이 실제 적용될 문서를 검토할 수 있다. text 출력 전체는 Markdown 파일 자체가 아니며, 정확한 결과 추출에는 JSON의 `markdown`을 사용한다.
- 원본에 literal syntax 진단(정의 없는 각주·명시적 참조식 링크/이미지 또는 닫히지 않은 코드 opener)이 있으면 결과 검사와 별도로, 성공한 dry run도 실제 쓰기와 같은 `warnLiteralSyntax` 경고를 stderr에 출력한다(JSON 모드 포함). `written as literal`은 미리보기의 canonical Markdown 표현을 가리키며 파일을 썼다는 뜻이 아니다. 원본 parse의 진단을 operation 전에 보관하므로 배치도 원본의 각 발생을 한 번씩만 보고한다. 실패한 실행에서는 이 경고를 출력하지 않는다. [공통 literal syntax 진단 계약](footnotes-v1.md#literal-syntax-diagnostics-290-304)을 따른다.
- `--dry-run --format json`은 stdout 한 줄에 `ok`, `command`, `dryRun: true`, `revision`(결과 Markdown의 SHA-256), `markdown`과 check의 `validation`, `writeability`, `references`, `readiness`, `endnotes`를 출력한다. 배치는 `applied`도 포함한다. 단건의 `--format`은 dry run에서만 지원한다. 경고는 실패가 아니며 성공 exit code는 0이다. 실패는 기존 편집 명령처럼 stderr 메시지와 exit 1을 사용한다(JSON 오류 envelope를 새로 도입하지 않음).
- JSON 미리보기는 `originalWarnings` 배열도 포함한다. 원본의 모든 source-only 진단을 Core 형식 그대로 담는다(예: `{"footnote":true,"label":"loss","path":[1],"line":5}`); 없으면 `[]`다. `references.unresolved`는 결과 문서의 진단만 유지하므로 canonical escape 후 해당 항목이 사라져도 원본 경고를 잃지 않는다. `check`와 실제 쓰기 JSON에는 이 필드를 추가하지 않는다.
- `create`는 기존 파일 편집과 별도의 exclusive-create 경로이므로 제외한다. `check`, `inspect`, `serve`도 대상이 아니며 batch operation 안의 `dry-run`/`format` 출력 옵션은 허용하지 않는다. 배치 전체 요청에만 지정한다. 실제 쓰기 모드의 출력 계약은 유지한다. 미리보기 뒤 실제 적용 시 원본 revision을 `--if-revision`으로 전달하고, 실제 쓰기 후에는 `inspect`로 저장된 revision과 경로를 다시 얻는다.

### Folder listing v1 (#112)

사용자가 `Open folder…` 대화상자에서 folder 경로 하나를 고르면 Host가 그 folder를 한 단계씩 list하고, Sidebar는 이를 tree로 보여 주며 문서를 연다. [ADR-0009](../adr/0009-multiple-opened-folders.md)에 따라 Sidebar는 열어 둔 folder 여러 개를 순서대로 각자의 tree로 보여 주며, Open folder…는 포함 관계가 없는 root를 추가한다. #702에 따라 하위 폴더는 기존 상위 tree에서 펼쳐 선택하고, 상위 폴더는 기존 하위 섹션을 첫 흡수 위치에서 대체하며 펼침 상태를 가능한 만큼 옮긴다. 최근 Open과 시작 복원도 같은 포함 관계 규칙을 적용한다. 포함 관계는 기존 Host 정규화 결과의 문자열과 경로 구분자 경계로 비교하며 대소문자·junction·symlink·UNC 정책을 추가하지 않는다(#372 보류). Workspace가 아니다. 열어 둔 folder의 경로 목록과 최근에 성공적으로 연 folder 경로는 Browser preference로만 기억하고 Host나 파일에 저장하지 않는다. 폴더 섹션 접힘은 같은 origin의 Browser preference로 root 경로만 기억한다(#425). 하위 폴더 펼침과 listing은 페이지 상태다.

- `GET /api/folder?root=<선택한 folder>&path=<그 안의 folder, 생략 시 root>`는 `{ root, path, parent?, entries }`를 돌려준다. `entries`는 `{ name, kind: "folder" | "document" | "image" | "file", path, native? }`이고 sub-folder 먼저, 그다음 이름순(숫자 인식)이다. `native`는 문서 항목에만 있으며, 파일 앞부분(최대 4KB)의 leading frontmatter에 native 표식 `ieumdoc: 1`이 있는지를 Core의 `hasNativeMarker`로 판정한 값이다. 파일을 읽을 수 없으면 생략한다. 이는 Sidebar가 열 수 없는 파일을 미리 구분해 보여 주기 위한 표시일 뿐 admission이 아니다. 표식이 있어도 열 때 Core가 metadata와 내용을 검증해 거부할 수 있다. `parent`는 root보다 아래일 때만 있다. 현재 Sidebar tree는 `parent`를 쓰지 않지만 API 계약은 그대로다.

| 범위 | 지원 |
| --- | --- |
| Hierarchical tree UI | 지원. Sidebar가 펼친 folder들의 listing을 page state에 모아 tree로 그린다. |
| Lazy one-level Host listing | 지원. folder를 펼칠 때 그 folder 하나만 위 API로 list한다. |
| Explicit folder refresh (#494) | 기존 API로 열린 root와 도달 가능한 이미 로드된 하위 목록만 다시 읽는다. 접힌 캐시도 포함하며 미로드 폴더는 읽지 않는다. 펼침·문서·탭은 유지한다. Editor가 파일·폴더·asset을 생성하거나 asset을 rollback하면 이미 로드된 부모 목록만 다시 읽는다. Host 상태/API·watcher·주기 작업은 추가하지 않는다. |
| Recursive scan | 트리 탐색에서는 지원하지 않음. 하위 folder를 미리 읽지 않는다. 이미지 이름 변경의 요청별 참조 안전 검사는 아래 File deletion and rename의 한정된 예외다. |
| Watch service | 지원하지 않음. 외부 변경은 다시 펼치거나 문서를 열 때, 또는 폴더 새로고침으로 반영된다 (#494). |
| Opened folder persistence | 경로만. 열어 둔 folder 목록은 시작할 때 Host에 다시 list해 복원하고, 거부되거나 없어진 folder는 조용히 제외한다. 복원 자체는 preference를 다시 쓰지 않는다. 성공한 명시적 사용자 Open/Close는 같은 목록이거나 다른 브라우저 탭이 preference를 바꿨어도 현재 탭의 열린 목록을 기억한다. 복원 중이면 모든 경로의 시도가 끝날 때까지 저장을 미룬다. 같은 Host 정규화 경로의 사용자 Open/Close는 늦은 복원 응답보다 우선한다. 하위 폴더 펼치기·접기·listing 갱신은 preference를 쓰지 않는다. 별도의 섹션 접힘 기억은 origin별 collapsed root 경로만 저장하며, 사용자 Open/Close·섹션 토글·명시적 reveal에서 현재 상태로 쓰고 복원만으로는 쓰지 않는다. Close로 지우며, 유효하지 않은 기록은 다음 사용자 쓰기에서 정리한다. 하위 펼침 상태와 Workspace 파일은 저장하지 않는다. |
- 일반 directory와 모든 확장자의 일반 파일(확장자 없는 파일 포함)을 넣는다. `.md`는 document, 기존 MEDIA_TYPES의 PNG/JPEG/GIF/WebP/SVG는 image, 나머지는 file이다. 확장자는 대소문자를 구분하지 않는다. 폴더 먼저, 파일 종류와 무관하게 숫자를 인식한 이름순으로 정렬한다. `.`으로 시작하는 항목과 symlink(Windows junction 포함), 비정규 파일은 넣지 않는다. 재귀 scan은 하지 않는다.
- Host는 `root`와 `path`를 신뢰 경계 밖 입력으로 다룬다. `path`는 lexical로도, symlink를 해석한 real path로도 `root` 안이어야 한다. directory가 아니거나 없거나 읽을 수 없으면 명시적 오류다. Host는 요청 사이에 아무것도 기억하지 않는다.
- Host가 반환한 정규화 경로로 열린 탭을 식별한다. 요청 경로가 이미 열린 탭 경로와 정확히 같으면 Host GET 없이 그 세션을 활성화하므로, 디스크에서 파일이 사라지거나 읽을 수 없게 되어도 열린 세션을 유지한다. 일치하지 않는 경로·별칭은 기존 `GET /api/document`로 읽고 반환된 정규화 경로를 다시 비교한다. 성공한 새 경로만 탭을 추가하며 기존 경로는 해당 탭을 활성화한다. Open/New는 기존 세션을 버리지 않아 미저장 확인을 하지 않는다. Save / Don't save / Cancel은 단일 탭 닫기에 사용한다([편집 세션 계약](editing-session-save-v1.md#switching-and-recovery)). 진행 중인 Save/Source/asset/Open/New는 전환을 막는다. 문서를 열거나 만들면 그 문서를 담은 각 열린 folder 안의 상위 folder들을 펼치고 다시 list한다. 외부 변경은 watch하지 않는다. 늦은 listing은 더 새 요청을 덮거나 접힌 folder를 다시 펼치지 않는다. Host는 탭이나 영속 세션을 저장하지 않는다.
- `.md` 파일 open 범위는 넓어지지 않는다. Host는 이전부터 임의 `.md` 경로를 열 수 있고, listing은 이름·종류와 native 표식 여부만 보여 준다. 표식 판정 규칙은 Core가 소유하며 Host는 Markdown이나 frontmatter를 따로 해석하지 않는다.
- Git 감지, `.ieumdoc/` 설정, index DB, watch service, 검색 인프라는 포함하지 않는다. CLI 명령도 없다. folder listing은 문서 의미를 바꾸는 operation이 아니라 interface/Host 탐색이며, headless 환경에서는 shell의 파일 목록으로 충분하다. native 표식 여부도 읽기 전용 표시이며, headless에서 문서를 실제로 받아들이는지는 기존 CLI 명령이 같은 Core admission으로 판정한다.

### Read-only folder preview (#217)

- Sidebar의 image/file 선택은 문서 GET, 탭 생성/전환, 이미지 link/copy와 저장을 호출하지 않는다. `.md`는 기존 Core admission과 탭 경로를 유지한다. 기타 파일은 파일명·경로와 편집 불가 안내만 표시하며 내용을 읽거나 실행하지 않는다.
- `GET /api/file-preview?root=<선택한 폴더>&path=<이미지>`와 HEAD는 Vite/Desktop/HTTP 공통 handler를 사용한다. 문서가 없어도 사용할 수 있다. 정규 이미지 파일만, lexical/real path 모두 선택 root 안이어야 하며 root 하위 symlink/junction은 내부를 향해도 거부한다. HTTP는 별도로 모든 경로에 operator RootAccess를 적용한다. 누락/읽기 실패/비정규 파일/범위 밖 요청은 거부한다.
- PNG/JPEG/GIF/WebP는 기존 업로드 container 검사와 10 MiB 제한을 재사용한다. SVG도 같은 크기 제한과 UTF-8/SVG 시작 형식 검사를 거치지만 sanitization을 주장하지 않는다. XML 선언·주석·외부 DOCTYPE이 있는 SVG prolog도 수용한다. 서버는 DTD/entity를 해석하거나 외부 리소스를 조회하지 않으며 internal subset은 이 시작 검사에서 거부한다. 모든 이미지 응답에 `nosniff`, `no-store`, `sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'` CSP를 부여한다. UI는 img로만 표시하므로 SVG script/event/external resource가 앱 권한으로 실행되지 않는다. 직접 URL/HEAD도 같은 검증/헤더를 사용한다.
- 크기는 open 전과 bounded read 중 검사하고 file descriptor의 identity 및 읽은 뒤 경계를 재확인한다. OS 수준의 filesystem transaction/동시 교체 방지 보장은 아니다. 기존 `/document/`의 문서 상대 media 권한, 문서 읽기·쓰기 admission과 asset 권한은 확장하지 않는다.
- 공유 Dialog는 닫기/Escape 시 선택한 행으로 focus를 돌리고, 편집기 instance/selection/history/dirty/draft를 유지한다. modal 동안 Ctrl/Cmd+S는 대기한다. 로드 실패는 대화상자에 한 번 안내하며 늦은 로드는 닫힌 미리보기를 다시 열지 않는다. 이는 UI/Host 탐색이며 새 문서 의미 연산이나 CLI parity가 없다.

### Folder picker v1

- [Folder picker](folder-picker-v1.md)는 앱 안에서 경로를 고른다. OS 선택창, upload, 별도 복사본은 없다. Open을 누르기 전의 탐색은 sidebar와 문서를 바꾸지 않는다.
- `GET /api/folder-browse?path=<folder>`는 `{ path, crumbs, entries }`를 돌려준다. `crumbs`는 filesystem root부터 해당 folder까지의 `{ name, path }` 목록이며 Host가 계산한다. 정렬과 hidden/symlink 제외는 Folder listing v1과 같지만, 폴더 선택은 기존 `.md` 필터, 이미지 선택은 기존 이미지 필터를 유지한다. 선택 전 탐색은 이름과 종류만 돌려주고 파일 내용(`native`)은 읽지 않는다. 선택 전의 탐색은 sidebar의 `root` 제한을 사용하지 않는다.
- `GET /api/folder-places`는 `{ places: [{ kind, name, path }] }`를 돌려준다. Home, 실제 존재하는 Documents, Windows drive roots 또는 `/`가 시작점이다. Host는 탐색 위치나 최근 목록을 저장하지 않는다.
- Recent는 이 Browser의 `ieumdoc.recentFolders` preference다. 성공한 Open만 기록하며, Recent 자체는 복원 목록이 아니다. 별도의 `ieumdoc.openFolders` preference가 위 Folder listing v1과 [ADR-0009](../adr/0009-multiple-opened-folders.md)에 따라 sidebar folder를 복원한다. 문서 내용·의미와 무관하므로 Core operation이나 CLI command를 추가하지 않는다.

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

## File deletion and rename (#505 / #504 PR A)

`DELETE /api/file` accepts `{root, path}`; `PATCH /api/file` additionally accepts a filename
stem `name` and optional `{path, source?}[]` `openDocuments` containing dirty tabs in the
requesting Editor window. `source` contains applied unsaved content when present; a path-only
entry covers property drafts against the saved document's references.
Vite, Desktop and HTTP reuse this stateless handler. The selected root is supplied per request;
HTTP additionally enforces the operator Root allowlist. No open-folder registry is retained.

Only regular files below the chosen root are accepted. Lexical and real paths must stay inside;
symlinks (including junctions and the chosen root itself), directories and missing files are refused.
Rename stays in the same parent, preserving the exact extension. Empty/invalid Unicode names,
path separators, Windows forbidden/control characters and device names, trailing dots/spaces,
hidden names and oversized leaves are refused. An extensionless file stays extensionless.
An exclusive hard-link publication followed by an ownership-checked unlink changes the name
without overwriting a destination. Unsupported hard-link filesystems report an error and retain
the original. A case-only spelling resolving to the same directory entry uses the OS rename;
distinct existing entries (including hard links to the same inode) remain conflicts.
Ownership checks bound accidental replacement; as with existing file commit, validation/use
steps are separate and do not sandbox a hostile concurrent filesystem administrator.

Vite/HTTP deletion is permanent, after the Editor names the file and confirms. Desktop supplies
`shell.trashItem` to the same checked handler; failure never falls back to permanent deletion.
Successful operations return `{path, updatedDocuments?, skippedDocuments?}` and the Editor
refreshes already-loaded parent listings. Updated document locators are absolute; skipped
unreadable/non-native `.md` names are relative to the requested root and shown in a notice.
Asset rollback keeps its signed-receipt API and is not broadened by this user-confirmed file API.

Deletion/rename recovery barriers match path strings. Until [#372](https://github.com/ieumbird/ieumdoc/issues/372)
decides Windows locator identity, case-only aliases (for example, a different spelling in URL
`?path=`) are treated as separate paths. Another window's delayed first recovery write may then
leave an old-path record. There is no data loss; the extra record can be discarded.

Image rename performs a request-local recursive scan of regular `.md` files under the outermost
opened folder containing the image, including hidden files; symlinks are skipped. It admits each
readable native document through Core's existing read model and resolves Figure paths through
`resolveMediaPath`, using the same URL-segment encoding as image requests. Matching compares
filesystem `dev`/`ino` identity, so Windows case variants and hard-link aliases cannot evade the
check; it never equates names by string lowercasing. Unreadable/non-native
documents are skipped and reported. Applied unsaved sources from open sessions supplement the
disk check. A dirty tab matching either the disk references or its applied snapshot refuses the
whole rename with document names and save-first guidance. A draft alone also counts as dirty.
Recursive scan is limited to this requested operation, not a persistent index or watcher.

### Referenced image rename (#504 PR B)

The Host passes the matched Figure source strings to Core's `updateMediaReferences` operation.
It writes a `./`-prefixed document-relative path with `/` separators to the new image. Figure
caption, label and alt text are preserved. Plain text, links and unsupported/remote image
references are not rewritten. A hard-link alias whose new destination would escape the
document's existing media boundary refuses the operation before writing; the media boundary
is not broadened. Core canonical write and loss-prevention guards apply to every target.

The stateless request performs these steps:

1. Read all admitted target documents, calculate/validate all new contents and run the existing
   file-commit revision/write-permission preflight for every document. Any failure writes nothing.
2. Publish the image's new name exclusively as a hard link, retaining the original name.
   Existing destinations and unsupported hard-link filesystems fail before any document write.
3. Replace each document through shared `commitFile`: temporary sibling, revision recheck,
   atomic per-file replacement. Root/symlink policy is rechecked before each commit.
4. Verify image ownership and unlink the original image name only after every document commit.

On failure after publication, restore committed documents in reverse order through `commitFile`
using their newly written revisions. External changes are not overwritten. Remove the new image
link only after successful rollback. Failed rollback retains both image names when possible and
returns an explicit error listing present/absent image paths and documents requiring review;
`updatedDocuments` lists those whose rollback failed so open clean tabs can reload actual disk
content. Case-only spelling changes use the existing OS rename instead of link publication;
rollback reverses that spelling when all document restores succeed.

The Host does not equate a thrown `commitFile` call with an unchanged document: temporary cleanup
can throw after replacement. It retains the in-progress attempt as a rollback candidate unless
the error is the shared `FileChangedError`, which is raised only by pre-replacement revision
checks. Before rollback, an exact byte comparison with the original proves that no content
restoration is needed. Otherwise rollback requires the expected new revision through `commitFile`;
different external content or unreadable/uncertain state retains the new image name and reports
the document in `updatedDocuments`. If rollback's own cleanup throws, the Host checks original
bytes again: verified restoration is reported separately from the cleanup error, not as an
unrestored document. Root/symlink checks apply to these reads too. The shared file-commit API and
other callers remain unchanged; this is request-local Host outcome tracking.

This is best-effort rollback, not a multi-file transaction. Other readers can observe intermediate
states. A process/OS crash can leave two image names and a mixture of old/new document contents;
there is no durable transaction journal or startup repair. A simultaneous external filesystem
change can also prevent rollback; errors describe that remaining state. The existing validation/use
race boundary and #372 path-alias policy remain unchanged.

Sidebar rename keeps the #504 dirty-tab refusal and clean reload policy. Figure-form rename
adds `figureDocument` (path, expected revision, applied canonical source, current image URL
and optional historical source spellings)
to the same request. The Host resolves that URL with the existing media resolver, verifies the
current disk revision before publication, and returns matched old/new sources and the resulting
revision. Historical spellings come from the engine's observed attachment/history state and
are untrusted hints: the Host resolves them with the same media boundary and includes only
paths whose actual device/inode matches the image before rename. This covers history-only
`./assets/a.png` / `assets/a.png` and other equivalent in-scope spellings after Save, without
implementing filesystem equivalence in the Editor. Invalid Unicode/type hints refuse before
publication; remote, missing or out-of-scope spellings do not match. The source is used only to
identify live references, never to save unsaved properties.
Only that initiating session is exempt from the dirty list; other referring dirty tabs still
refuse and affected clean tabs reload. Without an opened folder the document directory is the
scan root; otherwise the outermost opened folder containing the document is used.

Same-window dirty tabs other than the initiating Figure form refuse and clean affected tabs
reload before the operation closes.
Other windows do not share live state: **cross-window protection is Save-time revision conflict**.
Their old content remains local and cannot overwrite rewritten documents without resolving the
existing conflict. See [session behavior](editing-session-save-v1.md#referenced-image-rename-504).

CLI exposes only [one-document media reference replacement](figure-authoring-v1.md#media-reference-replacement-504).
Folder traversal and image-file rename remain Host responsibilities; CLI does not duplicate the
Host's filesystem orchestration or session checks. File delete and ordinary file rename have no
new Core or CLI operation.

## Non-goals

- workspace file 또는 project concept. Sidebar의 열린 folder 목록은 경로만 기억하는 탐색 상태일 뿐 workspace가 아니다([ADR-0009](../adr/0009-multiple-opened-folders.md)).
- Git repository detection, recent workspace, 일반 재귀 filesystem scan, 검색 또는 index (Sidebar의 lazy tree UI는 위 Folder listing v1, 이미지 이름 변경의 요청별 참조 검사는 위 File deletion and rename 범위다)
- `.ieumdoc/`, workspace config 또는 문서 간 탐색 기록. 여러 문서를 탭으로 여는 기능은 [ADR-0007](../adr/0007-editing-session-lifetime.md)과 [편집 세션 계약](editing-session-save-v1.md#switching-and-recovery)의 현재 범위이며, Host는 탭 상태를 소유하지 않는다.
- 특정 HTTP API, localhost server 또는 production backend architecture
- browser file upload 또는 Browser File System Access API를 기본 architecture로 채택하는 결정
- database, remote document service 또는 별도 document storage를 SSOT로 추가하는 결정
- Host sandbox/permission system의 상세 설계
- filesystem watch, sync, collaboration 또는 conflict resolution의 상세 설계
- ADR 추가 또는 기존 ADR 변경

## Native admission

Open, Reload, Save, Source and asset creation share Core's [native contract](document-support-v1.md). New file serializes `createDocument()`. Rejected Open/Reload returns diagnostics without installing a document model or changing existing editor work. `/api/block-source` and source-replacement replay are removed.
