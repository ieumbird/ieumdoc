# IeumDoc documentation

현재 동작을 확인하려면 Accepted ADR과 Implemented contract를 읽는다. Historical 문서는 당시의 근거이며 현재 요구사항이나 제품 채택 결정이 아니다. 상태의 뜻과 충돌 처리 순서는 [Documentation governance](contributing/documentation-governance.md)에 있다.

이 색인은 자신을 제외한 모든 유지되는 `docs/**/*.md`를 직접 연결한다. `pnpm docs:check`가 누락과 local link/heading anchor를 검사한다. 제품 개요는 [README](../README.md), 개발 시작은 [CONTRIBUTING](../CONTRIBUTING.md)이다.

## Architecture decisions

| Document | Status | Authority / description |
| --- | --- | --- |
| [ADR-0001: Single-document editor](adr/0001-single-document-editor-architecture.md) | Accepted | 현재 architecture 규범. 하나의 Tiptap/ProseMirror state가 문서 편집 세션을 소유한다. |
| [ADR-0002: Persistence and semantic ownership](adr/0002-document-persistence-semantic-ownership.md) | Accepted | 현재 architecture 규범. plain-text SSOT와 Core semantic/write ownership. |
| [ADR-0003: Addressing and identity](adr/0003-document-addressing-identity-boundary.md) | Accepted | 현재 architecture 규범. snapshot locator와 persistent identity의 경계. |

## Current implemented contracts

| Document | Status | Authority / description |
| --- | --- | --- |
| [Document support and preservation](design/document-support-v1.md) | Implemented | 현재 계약. 읽기·visual authoring·canonical writeability와 LF/fail-closed 보존. |
| [Continuous document editing](design/document-editing-v1.md) | Implemented | 현재 계약. 연속 편집, clipboard, table/section 구조 변경의 보존 경계. |
| [Editing session and Save](design/editing-session-save-v1.md) | Implemented | 현재 계약. opening snapshot, Save acknowledgement, draft와 work-loss 보호. |
| [Block source editing](design/block-source-editing-v1.md) | Implemented | 현재 계약. Core를 통한 단일 read-only block source 교체. |
| [Filesystem Host boundary](design/filesystem-host-boundary-v1.md) | Implemented | 개발 Host의 현재 계약. 파일·asset·folder 접근; 제품 Host는 미정. |
| [Folder picker](design/folder-picker-v1.md) | Implemented | 현재 계약. folder 선택, browser preference와 표시 folder에 New file. |
| [Footnotes](design/footnotes-v1.md) | Implemented | 현재 계약. 기존 reference 편집, definition source 편집과 유실 방지. |
| [Heading numbering](design/heading-numbering-v1.md) | Implemented | 현재 계약. Core numbering settings, H2–H6 표시와 CLI. |
| [Section references](design/section-references-v1.md) | Implemented | 현재 계약. 문서 안의 MyST heading label과 reference. |
| [Table caption and label](design/table-caption-v1.md) | Implemented | 현재 계약. table caption/label과 reference target. |
| [Table interaction](design/table-interaction-v1.md) | Implemented | 현재 계약. cell·행·열 handle, menu와 engine history. |
| [Editor UX Shell](design/editor-ux-shell-v1.md) | Implemented | 현재 계약. Sidebar, TopBar, 작성 interaction과 상태 표시. |
| [Editor Layout Rules](design/editor-layout-rules-v1.md) | Implemented | 현재 geometry 규범. 정렬·간격·control 치수와 검증. |
| [Editor Visual Language — Quiet Document](design/editor-visual-language-v1.md) | Implemented | 현재 visual contract는 v3. 링크 안정성을 위해 v1 파일명 유지. |

## Contribution and documentation governance

| Document | Status | Authority / description |
| --- | --- | --- |
| [이슈 작성](contributing/issues.md) | Implemented | 현재 기여 안내. 문제·범위·완료 기준과 CLI/API 등록. |
| [Documentation governance](contributing/documentation-governance.md) | Implemented | 현재 작업 규칙. 문서 authority, status, metadata와 갱신 절차. |
| [Windows browser automation](contributing/windows-browser-automation.md) | Implemented | 현재 실행 규칙. persistent profile, storage 격리와 process cleanup. |

[AGENTS.md](../AGENTS.md)는 저장소 전체 제약, [CONTRIBUTING.md](../CONTRIBUTING.md)는 setup·검증 matrix·PR 절차의 진입점이다.

## Historical reviews and spikes

| Document | Status | Authority / description |
| --- | --- | --- |
| [Single Editor Foundation review](reviews/single-editor-foundation.md) | Historical | 당시 architecture 검토 근거. 현재 authority는 ADR-0001과 design contracts. |
| [MyST security alignment review](reviews/myst-security-alignment-v1.md) | Historical | 당시 security 분석. 현재 후속 작업은 issue #11; 현재 안전성의 영구 보증이 아님. |
| [Desktop shell spike](reviews/desktop-shell-spike-v1.md) | Historical | 실행 가능성과 비용의 실험 근거. 제품 Host·배포 결정이 아님. |
| [VS Code host spike](reviews/vscode-host-spike-v1.md) | Historical | provider와 저장 모델의 실험 근거. 제품 Host 결정이 아님. |
| [Quiet Document v1 visual review](design/editor-visual-refinement-v1-review.md) | Historical | 당시 실제 capture·측정 근거. 현재 규범은 Visual Language와 Layout Rules. |
| [Static UI v3 visual verification](reviews/static-ui-v3-2026-10-08.md) | Historical | 2026-10-08 실제 제품 Before/After, 상태·대비·폰트·회귀 검증 근거. 현재 규범은 Visual Language v3. |

## Verification

| Document | Status | Authority / description |
| --- | --- | --- |
| [Verification entrypoint](test/README.md) | Implemented | 현재 검증 안내. 자동·browser·manual 실행과 fixture 보호. |
| [Test Guide](test/TEST_GUIDE.md) | Implemented | 현재 실행/수동 검토 절차. 테스트 이름·개수의 원본은 runner. |
