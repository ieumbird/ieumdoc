# ADR-0009: 사이드바에 여러 폴더 열기

- Status: Accepted
- Non-overlapping roots verification: 2026-10-29 (#702: Editor 338 unit tests, typecheck/build; persistent Chrome folder-navigation/memory, layout-rules, quiet-document, document-tabs, editor-shell and reveal-folder; [behavior and captures](../design/editor-ux-shell-v1.md#non-overlapping-opened-folders-702)).
- Last verified: 2026-10-25 (#425 owner persistence decision: Editor tests/typecheck/build, folder-memory/navigation/command-center/document-tabs/editor-shell/quiet-document; [restoration evidence](../design/editor-ux-shell-v1.md#section-persistence-decision-and-verification-2026-10-25)).
- Previous verification: 2026-10-25 (#425: collapsible folder sections; Editor tests/typecheck/build, folder-navigation/folder-memory/command-center/editor-shell/layout-rules/ui-language/quiet-document and [desktop/phone captures](../design/editor-ux-shell-v1.md#section-disclosure-verification-and-captures)).
- Previous verification: 2026-10-24 (#385: Sidebar header entry, Close-only folder menus; folder-navigation browser check, Editor tests/typecheck/build and same-state desktop/phone captures; [evidence](../design/editor-ux-shell-v1.md#sidebar-open-folder-entry-385)).
- Previous verification: 2026-10-23 (implemented with this decision; [Editor UX shell](../design/editor-ux-shell-v1.md), [Folder listing](../design/filesystem-host-boundary-v1.md#folder-listing-v1-112) and [Folder picker](../design/folder-picker-v1.md) contracts updated in the same change).
- Authority: product and architectural decision under [AGENTS.md](../../AGENTS.md). Related: [#235](https://github.com/ieumbird/ieumdoc/issues/235), [ADR-0005](0005-http-host.md) (#186).
- Decision date: 2026-10-23

## Context

결정 시점의 사이드바는 `Open folder…`로 고른 폴더 하나만 보여 준다. 다른 위치의 문서를 함께 다루려면 폴더를 번갈아 다시 열어야 하고, 새로고침하면 그 폴더도 사라진다(#235).

기존 계약은 이 폴더를 "Browser 페이지 상태일 뿐 Workspace가 아니다"라고 정하고, Workspace persistence·project concept·`.ieumdoc/` 설정을 non-goal로 두었다. ADR-0005는 HTTP Root가 접근 경계일 뿐 사이드바 폴더나 Workspace가 아니며, Open Folder가 한 번에 허용 Root나 그 하위 하나를 고른다고 정했다.

사이드바 폴더 목록은 Host가 기억하지 않는다. Editor가 매 요청에 `root`를 보내고 Host가 매번 검증한다. 따라서 여러 폴더를 동시에 여는 것은 Host 상태나 문서 의미 없이 Editor 상태만으로 표현할 수 있다. 바뀌는 것은 "폴더 하나"를 전제로 한 Editor의 문서별 폴더 맥락과 기존 문서의 non-goal 경계다.

## Decision

The overlapping-root and unconditional append decisions in section 1 are superseded by the
[2026-10-29 amendment](#amendment-2026-10-29-non-overlapping-roots-702).
The original 2026-10-23 decision below is retained. The folder-menu Open folder entry in section 1 is superseded by the [2026-10-24 amendment](#amendment-2026-10-24-open-folder-entry-385).
Section 2's no-expansion-persistence rule is narrowed only for opened-root section collapse by the
[2026-10-25 persistence amendment](#amendment-2026-10-25-remember-collapsed-folder-sections-425);
child-folder expansion and listings remain unremembered. The original decisions below are retained.

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

## Amendment 2026-10-24: Open folder entry (#385)

Entry placement is superseded by the [2026-10-27 explorer amendment](#amendment-2026-10-27-explorer-sidebar-582); the historical decision below is retained.

- Status: Accepted. Repository owner approved [#380 decision 3](https://github.com/ieumbird/ieumdoc/issues/380); implemented by [#385](https://github.com/ieumbird/ieumdoc/issues/385).
- The expanded Sidebar header has one always-visible `Open folder…` entry in the same position with zero, one or several opened folders, including while Display is selected. The collapsed rail retains its existing expand/tool controls.
- Each folder's `⋯` contains only actions on that folder (`Close folder`). Remove the repeated `Open folder…` and the duplicate empty-Files entry. Keep the start-screen entry and command-center command.
- This supersedes only section 1's folder-menu entry placement. Existing picker/handler, append/relist behavior, opened/recent folder preferences, Host authorization and all other decisions remain unchanged.
- This is a refinement of this ADR's existing interface composition, with explicit owner approval, rather than a new architecture decision. Under [documentation governance](../contributing/documentation-governance.md#update-rules), retain the original decision/date and add this dated amendment; update the current [shell](../design/editor-ux-shell-v1.md) and [picker](../design/folder-picker-v1.md) contracts in the same PR. Previous verification records are historical evidence and are not rewritten. This interface-only navigation has no Core operation or CLI parity command.

## Amendment 2026-10-25: Collapsible folder sections (#425)

- Status: Accepted. Repository owner requested collapsible opened-folder sections in
  [#425](https://github.com/ieumbird/ieumdoc/issues/425).
- The no-section-persistence portion of this initial implementation decision is superseded by
  the owner's later same-day [persistence decision](#amendment-2026-10-25-remember-collapsed-folder-sections-425).
- Each opened folder's heading has a disclosure button hiding/showing its entire tree; its
  New file, New folder and Close folder actions remain available. New sections start expanded.
- Section expansion, like child-folder expansion, is page state only and is never stored.
  Relisting an existing root or opening/closing other roots retains its section state; closing
  that root discards it. Reload and reopening a closed root start expanded. Cached listings and
  child expansion survive section collapse. Existing document/folder reveal also expands the
  containing sections; manual collapse of the active document is allowed until that reveal runs.
- This adds section disclosure to section 1's existing interface composition and clarifies
  section 2's unchanged no-expansion-persistence boundary. It does not supersede the 2026-10-24
  entry-placement amendment or change Host/Core/CLI/Workspace boundaries. Under
  [documentation governance](../contributing/documentation-governance.md#update-rules), retain
  the original decision/date and verification records, and update the current
  [shell contract](../design/editor-ux-shell-v1.md#collapsible-folder-sections-425) in the same PR;
  this interface refinement does not require a separate architecture ADR.

## Amendment 2026-10-25: Remember collapsed folder sections (#425)

- Status: Accepted. The repository owner explicitly changed the decision on 2026-10-25 for
  [#425](https://github.com/ieumbird/ieumdoc/issues/425): remember collapsed opened-folder sections
  across page Reload and Desktop restart, within the same origin/browser preference boundary as
  the opened-folder list. This narrows section 2's original prohibition and supersedes only the
  initial section-disclosure amendment's no-section-persistence rule. Keep both earlier decisions,
  dates and verification records under [documentation governance](../contributing/documentation-governance.md#update-rules).
- Store only collapsed section root paths (`litzio.collapsedFolderSections` by the [official brand default](../guides/branding.md), JSON string array).
  Never store child-folder expansion/listings, grant access, change Host state or write documents.
  Restore roots through Host authorization/listing, then initialize their section visibility from
  remembered collapse. Startup document restoration respects it; explicit document/folder reveal
  expands containing sections and remembers that expansion so navigation survives restart.
- Relisting an already-open root preserves its section state. Close removes its collapse record;
  Open after Close starts expanded. The general Open folder entry and 2026-10-24 amendment remain.
- Restoration alone never writes preferences (#370). Ignore missing/refused/unopened collapse
  records and remove them at the next explicit write. User Open/Close, section toggle and explicit
  navigation reveal write the current reduced list, deferring until pending restoration settles.
  Never suppress an action by comparing a cached last-written value: another tab may have changed
  storage. Tabs retain independent live views; the latest action remembers its current roots.
- This changes interface navigation memory only. Core/CLI operations, subfolder expansion,
  Host authorization and the no-Workspace boundary remain unchanged. The current
  [shell contract](../design/editor-ux-shell-v1.md#collapsible-folder-sections-425) records the
  detailed reveal/startup distinction, write boundary and regression evidence.

## Amendment 2026-10-27: Explorer sidebar (#582)

- Status: Accepted. The owner selected proposal A in [#582](https://github.com/ieumbird/ieumdoc/issues/582).
- Sidebar header contains Files and Collapse only. Each opened folder shows New document…
  and More actions (New folder…, Open folder…, Refresh, Close folder, in that order). Remove the separate New
  document row when folders are open; use one New document… / 새 문서… action name.
- Owner refinement: present each root as a depth-zero folder row matching child-folder chevrons,
  typography and height, with root-only actions always visible on the right of that row. Folder
  rows have no folder icon; file type icons remain. New folder is in More actions, and creation
  or cancellation returns focus to that menu trigger. Long names ellipsize;
  full path/name remain available. Preserve section/tree roles, keyboard navigation and #425
  collapse memory; only the visual indentation of children gains the root step.
- Empty Files retains Open folder… and New document…; New first chooses a folder through the
  existing picker. Start-screen and command-center entries remain. This supersedes only #385's
  entry placement; folder access, add/relist, persistence and creation semantics are unchanged.
- This is interface composition, with no new Core operation or CLI command. The current
  [shell contract](../design/editor-ux-shell-v1.md#sidebar-and-native-title-bar-582--605) defines
  focus return and the related #605 native title-bar integration.

## Amendment 2026-10-28: Shared brand title strip (#647)

- Status: Accepted. The owner approved the composition in [#647](https://github.com/ieumbird/ieumdoc/issues/647) (2026-10-28).
- Refine the #582/#605 shell composition: the first row spans all columns, with the existing
  configured product SVG icon and name (official default `Litzio` since #859) at the left, existing TopBar controls in the remaining width,
  and Desktop-only native caption reservation at the right. HTTP Host shares the arrangement.
- Files / Collapse and Outline / Tables / Figures move to the document-tab row, with aligned
  boundaries. The separate visible Outline title row is replaced by its existing accessible
  heading. Collapsing Files leaves the icon and the existing Expand action in the second-row
  rail; brand is not an additional action. Preserve tree/actions, focus, panel widths/docking,
  title-strip drag/double-click, no-drag controls/portals, open-menu exclusion and continuous
  separator through the native reservation.
- This supersedes only the title-bar composition described with the explorer amendment.
  It changes interface layout, with no Core semantic operation, CLI command, Host or persistence
  change; no new architecture decision is needed. Current geometry and focus rules are in the
  [shell contract](../design/editor-ux-shell-v1.md#sidebar-and-native-title-bar-582--605) and
  [Layout Rules](../design/editor-layout-rules-v1.md#alignment-and-ownership).

## Amendment 2026-10-29: Non-overlapping roots (#702)

- Status: Accepted. The [owner decision on #702](https://github.com/ieumbird/ieumdoc/issues/702#issuecomment-6482705677)
  replaces section 1's rule that nested/overlapping folders each have their own section, and narrows
  its unconditional append rule. Retain the original decision, date and historical verification
  under [documentation governance](../contributing/documentation-governance.md#update-rules).
- Opened roots must not contain one another. Opening a descendant adds no section: expand its
  existing ancestor section and the path through the requested folder, select that row and scroll
  it into view. Explain in Korean/English that it is already inside the named opened folder.
- Opening an ancestor absorbs all descendant sections at the first absorbed section's position.
  Transfer loaded listings and child expansion where possible; a previously expanded section
  becomes an expanded child folder, a collapsed one stays collapsed. Fill missing intermediate
  folders through existing one-level listings. Unrelated sections retain their order. Path-based tabs, edits and history survive.
- Recent-folder Open and saved-root restoration apply the same containment reduction. Startup
  restoration stays quiet, retains the surviving root's remembered section visibility and does
  not rewrite preferences; the next explicit navigation writes the reduced current roots.
- Compare Host-normalized path strings with separator boundaries, using the existing identity
  policy. Do not fold case or introduce realpath resolution in the Editor: Windows case identity
  remains deferred in [#372](https://github.com/ieumbird/ieumdoc/issues/372); junction, symlink and
  UNC handling follow existing Host results and access checks.
- Reason: duplicate files in separate trees make active-document indication, file operations,
  New destinations ([#367](https://github.com/ieumbird/ieumdoc/issues/367)), future AI reference
  scope and the tab's folder context ambiguous. A later need for deep-folder shortcuts should
  be considered separately, rather than reopening nested sections.
- This changes Editor navigation state only. No Workspace, Core semantic operation, CLI surface
  or Host normalization change. Sidebar renaming belongs to #703. Current behavior and evidence
  are in [the shell contract](../design/editor-ux-shell-v1.md#non-overlapping-opened-folders-702).
