# IeumDoc documentation

현재 동작을 확인하려면 Accepted ADR과 Implemented contract를 읽는다. Historical 문서는 당시의 근거이며 현재 요구사항이나 제품 채택 결정이 아니다. 상태의 뜻과 충돌 처리 순서는 [Documentation governance](contributing/documentation-governance.md)에 있다.

이 색인은 자신을 제외한 모든 유지되는 `docs/**/*.md`를 직접 연결한다. `pnpm docs:check`가 누락과 local link/heading anchor를 검사한다. 제품 개요는 [README](../README.md), 개발 시작은 [CONTRIBUTING](../CONTRIBUTING.md)이다.

## Architecture decisions

| Document | Status | Authority / description |
| --- | --- | --- |
| [ADR-0001: Single-document editor](adr/0001-single-document-editor-architecture.md) | Accepted | 현재 architecture 규범. 하나의 Tiptap/ProseMirror state가 문서 편집 세션을 소유한다. |
| [ADR-0002: Persistence and semantic ownership](adr/0002-document-persistence-semantic-ownership.md) | Accepted | 현재 architecture 규범. plain-text SSOT와 Core semantic/write ownership. |
| [ADR-0003: Addressing and identity](adr/0003-document-addressing-identity-boundary.md) | Accepted | 현재 architecture 규범. snapshot locator와 persistent identity의 경계. |
| [ADR-0004: Desktop Host and distribution](adr/0004-desktop-host-distribution.md) | Accepted | Windows Electron/NSIS Host, 기존 handler 재사용과 사용자 승인 기반 업데이트/배포. |
| [ADR-0005: Standalone HTTP Host](adr/0005-http-host.md) | Accepted | 복수 허용 Root와 Node 배포물, 기존 handler를 재사용하는 단일 운영자용 HTTP Host. |
| [ADR-0006: Native document boundary](adr/0006-native-document-boundary.md) | Accepted | 승인된 제품·문서 지원 경계. 표식과 Core 검증을 통한 네이티브 문서 수용, 범용 부분 편집·소스 교체 폐지. 구현 계약은 아래 Native document support를 따른다. |
| [ADR-0007: Editing session lifetime](adr/0007-editing-session-lifetime.md) | Accepted | 승인된 방향. 명시적 저장(자동 저장은 보류, #297), 원본과 분리된 미저장 작업 복구, 탭별 독립 세션, 경로·순서·활성 탭만 기억하는 탐색 복원(#380), 공용 저장/저장하지 않음/취소 확인. 현재 시작 우선순위·닫기·클라이언트 복구와 실제 Host 검증의 경계는 Editing session and Save를 따른다. |
| [ADR-0008: Citations and bibliography](adr/0008-citations-and-bibliography.md) | Accepted | #327의 승인된 방향. 단위 A·B·C는 Citations 계약으로 구현. MIT BibTeX 입력·Core 제한 IEEE·Root 경계 포함. 단위 D 확장은 각각 별도 결정. #328과의 경계·실행 근거 포함. |
| [ADR-0009: Multiple opened folders](adr/0009-multiple-opened-folders.md) | Accepted | #235 / #385 / #425. origin별 폴더 섹션 접힘 기억과 사이드바 머리글의 단일 Open folder 진입점과 순서 있는 여러 폴더, 경로만 브라우저 환경설정으로 복원, 문서 폴더 맥락은 가장 바깥쪽 열린 폴더. Workspace 파일·Host 상태 없음. |

## Current implemented contracts

Implementation record: [UI language #256 plan and verification](design/ui-language-256-plan.md) (Historical; current behavior is defined by Editor UX Shell).

| Document | Status | Authority / description |
| --- | --- | --- |
| [Native document support](design/document-support-v1.md) | Implemented | 현재 계약. 표식·지원 의미·Core 진입/생성/쓰기 경계와 LF/fail-closed 보존. |
| [Parser security boundary](design/parser-security-v1.md) | Implemented | 공개 parse/참조 진단 도달성, URL·inline HTML backport와 patch 제거 조건. |
| [Continuous document editing](design/document-editing-v1.md) | Implemented | 현재 계약. 연속 편집, clipboard, table/section 구조 변경의 보존 경계. |
| [Editing session and Save](design/editing-session-save-v1.md) | Implemented | 현재 계약. opening snapshot, Save acknowledgement, draft/work-loss 보호와 로컬 복구. |
| [Filesystem Host boundary](design/filesystem-host-boundary-v1.md) | Implemented | 파일·asset·folder 계약. Vite, Desktop, HTTP Host가 같은 handler를 재사용. |
| [HTTP Host](design/http-host-v1.md) | Implemented | CLI 배포/실행, 복수 허용 Root, HTTP·프록시 경계와 검증. |
| [Desktop distribution and updates](design/desktop-distribution-v1.md) | Implemented | Windows Host, NSIS, Stable/Beta, signing 및 manual release 계약. 공개 0.1.0-beta.1과 실제 GitHub beta.4→0.1.0-beta.1 업데이트 검증. |
| [Desktop app icon](design/app-icon-v1.md) | Implemented | #170 B안의 SVG/ICO, 출처, 재생성 및 Windows 패키징·표시 검증. |
| [Folder picker](design/folder-picker-v1.md) | Implemented | 현재 계약. folder 선택, browser preference와 표시 folder에 New file·New folder. |
| [Endnotes (MyST footnotes)](design/footnotes-v1.md) | Implemented | 현재 계약. 모든 쓰기에서 미주 정의를 본문 뒤 첫 참조 순서로 배치, 단일 미주 구역, Section과 분리, 실제 참조로 복귀와 기존 삽입·편집·유실 방지. |
| [Citations](design/citations-v1.md) | Implemented | ADR-0008 단위 A·B·C. role·선언 보존, Core 번호·제한 IEEE·readiness, CLI/Host 자료 읽기와 파생 References. 슬래시 검색·인용 폼 저작 UI. |
| [Heading numbering](design/heading-numbering-v1.md) | Implemented | 현재 계약. Core heading/reference-template settings, H2–H6 표시와 CLI. |
| [Section references](design/section-references-v1.md) | Implemented | 현재 계약. 문서 안의 MyST heading label과 reference. |
| [Table caption and label](design/table-caption-v1.md) | Implemented | 현재 계약. table caption/label과 reference target. |
| [Table interaction](design/table-interaction-v1.md) | Implemented | 현재 계약. cell·행·열 handle, menu와 engine history. |
| [Figure authoring](design/figure-authoring-v1.md) | Implemented | 현재 계약. pending/image Figure, Apply 상태, canonical Save와 CLI readiness 경고. |
| [Editor UX Shell](design/editor-ux-shell-v1.md) | Implemented | 현재 계약. Sidebar, TopBar, 작성 interaction과 상태 표시. |
| [Editor Layout Rules](design/editor-layout-rules-v1.md) | Implemented | 현재 geometry 규범. 정렬·간격·control 치수와 검증. |
| [Editor Visual Language — Quiet Document](design/editor-visual-language-v1.md) | Implemented | 현재 visual contract. 버전과 세부 규범은 링크한 문서를 따른다. 링크 안정성을 위해 v1 파일명 유지. |

## Contribution and documentation governance

| Document | Status | Authority / description |
| --- | --- | --- |
| [이슈 작성](contributing/issues.md) | Implemented | 제목·유형·최소 정보 규칙, 공통 정의에서 생성하는 웹 폼, CLI 사전 검사와 GitHub 등록 후 검사. |
| [Documentation governance](contributing/documentation-governance.md) | Implemented | 현재 작업 규칙. 문서 authority, status, metadata와 갱신 절차. |
| [Windows browser automation](contributing/windows-browser-automation.md) | Implemented | 현재 실행 규칙. persistent profile, storage 격리와 process cleanup. |

[AGENTS.md](../AGENTS.md)는 저장소 전체 제약, [CONTRIBUTING.md](../CONTRIBUTING.md)는 setup·검증 matrix·PR 절차의 진입점이다.

## Historical reviews and spikes

[#204 document tabs implementation and review](reviews/document-tabs-204-2026-10-16.md) records the final tab step's scope, visual evidence, measurements and verification.

- [Block source editing](design/block-source-editing-v1.md) — Superseded by Native document support; former contract retained as history.

| Document | Status | Authority / description |
| --- | --- | --- |
| [Editor UX review and improvements](reviews/editor-ux-review-2026-10-17.md) | Historical | 2026-10-17 실제 Editor UX 평가 결과와 v4.7 변경(위치 표시, 표·메타데이터 배치, 좁은 화면 사이드바, 비네이티브 파일 표시 등), 테스트 변경과 검증. |
| [Editor guard performance](reviews/editor-guard-performance-2026-10-23.md) | Historical | Snapshot lookup CPU comparison, actual UI latency and large-document Save/Reload evidence; provisional responsiveness targets remain unmet. |
| [Mixed document input performance](reviews/editor-input-performance-2026-10-25.md) | Historical | #362 bounded Windows profiling, input measurements and canonical preservation evidence. |
| [Editor shell #176 plan and verification](reviews/editor-shell-176-2026-10-13.md) | Historical | #176 Files/Display sidebar and File actions: approved scope, state preservation, actual Before/After and verification limits. |
| [Desktop app icon selection](design/app-icon-v1-plan.md) | Historical | #170 GitHub 브랜드 확인과 B안(날개와 문서) 선택 기록. 현재 계약은 Desktop app icon. |
| [IeumDoc reduction verification](reviews/reduction-2026-10-10.md) | Historical | C01–C15 감량 판단, 변경 단위와 실제 검증·측정 근거. |
| [Native document boundary implementation](reviews/native-boundary-2026-10-14.md) | Historical | #232 제거 범위, 유지한 검증 책임, 구현 중 회귀와 테스트 계측. |
| [Worker model comparison on #216](reviews/worker-model-comparison-2026-10-15.md) | Historical | #216을 Codex 작업자 8개 설정으로 재구현한 1회 비교와 발견한 결함(#308). 모델 배정 규칙이 아님. |
| [Open File removal verification](reviews/open-file-removal-2026-10-12.md) | Historical | #190 시작 화면·폴더 메뉴 Before/After와 파일 탐색·작업 보호 검증 경계. |
| [Footnote region verification](reviews/footnote-regions-2026-10-12.md) | Historical | #185 원문 위치의 각주 구역 Before/After, 좁은 화면과 원문·편집·복사·저장 보존 검증. |
| [Endnotes verification](reviews/endnotes-2026-10-12.md) | Historical | #194 단일 미주 구역 Before/After, 원문 보존·명시적 변환·참조 복귀·초안 보호 검증. |
| [Single Editor Foundation review](reviews/single-editor-foundation.md) | Historical | 당시 architecture 검토 근거. 현재 authority는 ADR-0001과 design contracts. |
| [MyST security alignment review](reviews/myst-security-alignment-v1.md) | Historical | 당시 security 분석. 현재 후속 작업은 issue #11; 현재 안전성의 영구 보증이 아님. |
| [Desktop shell spike](reviews/desktop-shell-spike-v1.md) | Historical | 실행 가능성과 비용의 실험 근거. 제품 Host·배포 결정이 아님. |
| [VS Code host spike](reviews/vscode-host-spike-v1.md) | Historical | provider와 저장 모델의 실험 근거. 제품 Host 결정이 아님. |
| [Quiet Document v1 visual review](design/editor-visual-refinement-v1-review.md) | Historical | 당시 실제 capture·측정 근거. 현재 규범은 Visual Language와 Layout Rules. |
| [Static UI v3 visual verification](reviews/static-ui-v3-2026-10-08.md) | Historical | 2026-10-08 실제 제품 Before/After, 상태·대비·폰트·회귀 검증 근거. 현재 규범은 [Visual Language](design/editor-visual-language-v1.md). |
| [Pretendard self-hosting verification](reviews/pretendard-2026-10-09.md) | Historical | 자체 호스팅 폰트의 실제 사용, production 자산과 본문·UI 줄바꿈 비교. 현재 규범은 Visual Language. |
| [Inline math size verification](reviews/inline-math-size-2026-10-09.md) | Historical | 인라인 수식 크기 후보 비교, 실제 Before/After와 테스트 클릭 지점. 현재 규범은 Visual Language. |
| [ProseMirror focus restore and caret keys](reviews/prosemirror-focus-caret-2026-10-09.md) | Historical | 포커스 직후 caret 키가 되돌려지던 원인, `prosemirror-view@1.42.4` 패치의 적용 버전·전후 검증·제거 조건. 현재 계약은 Continuous editing. |
| [Persistent Figure Draft spike](reviews/persistent-figure-draft-spike-v1.md) | Historical | 콘텐츠 없는 Figure의 MyST 표현·공식 번호/참조·Core/Editor PoC 근거와 CONDITIONAL GO 권고. 현재 Figure 계약은 Document support와 Editing session. |

## Verification

- [v0.1.0-beta.1 release and verification record](releases/v0.1.0-beta.1.md) — Historical; unsigned Windows Beta 공개 자산, CI, 실제 GitHub 0.0.1-beta.4→0.1.0-beta.1 업데이트, 하네스 수정 후 검증과 알려진 제한.
- [v0.0.1-beta.4 release and verification record](releases/v0.0.1-beta.4.md) — Historical; 네이티브 문서 전환 호환성 안내, 공개 자산, CI, 실제 GitHub beta.3→beta.4 업데이트와 알려진 제한.
- [v0.0.1-beta.3 release and verification record](releases/v0.0.1-beta.3.md) — Historical; 공개 자산, CI, 실제 GitHub beta.2→beta.3 업데이트와 알려진 제한.
- [v0.0.1-beta.2 release and verification record](releases/v0.0.1-beta.2.md) — Historical; 공개 자산, CI와 실제 GitHub 업데이트 검증 근거.

| Document | Status | Authority / description |
| --- | --- | --- |
| [Verification entrypoint](test/README.md) | Implemented | 현재 검증 안내. 자동·browser·manual 실행과 fixture 보호. |
| [Test Guide](test/TEST_GUIDE.md) | Implemented | 현재 실행/수동 검토 절차. 테스트 이름·개수의 원본은 runner. |
