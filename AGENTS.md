# AGENTS.md

> Document first. Semantics in Core. Interfaces replaceable.

## Working principles

- 현재 요청을 해결하는 가장 작고 단순한 변경을 우선한다.
- 기존 코드와 검증된 라이브러리를 재사용하고, 필요성이 확인되지 않은 abstraction이나 infrastructure를 추가하지 않는다.
- 정상 동작하는 주변 코드를 현재 작업과 무관하게 재설계하거나 리팩터링하지 않는다.
- 기존 기술로 해결 가능한 parser, AST, document format, editor engine 등을 불필요하게 재구현하지 않는다.
- 기술적 제약이나 실패를 숨기기 위해 테스트 기준을 약화하거나 동작을 우회하지 않는다.
- 개발 단계이므로 소유자가 Migration을 명시적으로 지시하지 않는 한, 이미 저장된 이음독 문서·복구 기록·설정 등 과거 데이터의 하위 호환성을 설계 판단이나 구현 범위에 포함하지 않는다. 사람·AI·CLI가 앞으로 작성하는 입력의 처리는 이 규칙과 별개다.

## Architectural constraints

- 사람이 읽을 수 있는 plain-text document를 SSOT로 유지한다.
- 문서의 핵심 처리 로직은 특정 UI에 종속되지 않아야 한다.
- Editor, CLI, AI 등 서로 다른 인터페이스가 문서 의미를 각각 별도로 구현하지 않도록 한다.
- 영속적인 문서 의미 변경은 Editor에만 구현하지 않으며, 먼저 또는 동시에 Core의 editor-neutral semantic operation으로 표현한다.
- 새로운 주요 semantic document operation은 CLI에서도 headless하게 사용할 수 있도록 얇은 command surface를 제공한다. CLI 지원을 의도적으로 생략하면 그 이유를 작업 기록에 명시한다.
- CLI는 Core operation을 호출하는 얇은 인터페이스로 유지하며, 문서 의미나 Markdown/AST를 별도로 구현하지 않는다.
- cursor, focus, selection, toolbar, hover 등 Editor 전용 interaction은 CLI parity 대상이 아니다.
- 공식 write path가 생성하는 문서는 valid하고 안정적으로 다시 처리할 수 있어야 한다.
- Visual Editor는 ADR-0001에 따라 Tiptap/ProseMirror 기반의 single-document editor state를 사용한다. IeumDoc이 selection, history, cursor, clipboard 등을 포함한 자체 rich-text editor engine을 재구현하지 않는다.
- Editor-engine-specific types and document models stay inside `apps/editor`. Core exposes editor-neutral document semantics.
- Editor는 ADR-0010에 따라 최소 640px의 데스크톱급 창과 키보드·포인터 입력을 지원 대상으로 한다. 휴대폰 폭·터치 전용 레이아웃이나 검증은 실제 사용자가 확인되어 별도 결정이 나기 전까지 계획하지 않는다.
- `apps/editor/server`의 stateless 파일 Host handler는 Vite 개발 adapter, ADR-0004의 Desktop Host, ADR-0005의 HTTP Host가 재사용한다. 이를 장기 persistence/backend architecture로 전제하여 확장하지 않는다.

이 원칙을 이유로 미래 구조나 기능을 선제적으로 구현하지 않는다.

## Repository map

- `docs/README.md` — central documentation index, including each document's status and authority.
- `docs/adr/` — accepted architectural decisions and their rationale.
- `docs/design/` — Implemented behavior contracts alongside Historical and Superseded documents; check each document's Status and current authority in the docs index.
- `docs/reviews/` — historical reviews and spike evidence, not current requirements.
- `docs/contributing/` — contributor guidance and documentation governance.
- `.github/` — CI and contribution templates.
- `patches/` — pinned local dependency patches with documented removal conditions. [Dependency patch register](docs/contributing/dependency-patches.md).
- `packages/core/` — IeumDoc의 headless document engine. 문서의 parse, semantic operations, structural validation, canonical serialization을 소유한다.
- `packages/core/src/myst/` — MyST integration boundary. MyST-specific parsing/serialization logic은 이 경계 안에 둔다.
- `packages/core/test/` — Core의 document semantics와 canonical round-trip 계약을 검증한다.
- `packages/cli/` — `@ieumdoc/core`의 얇은 명령줄 인터페이스. 문서 의미나 AST 처리 로직을 구현하지 않는다.
- `packages/file-commit/` — CLI와 Editor Host가 공유하는 Node 전용 파일 교체(revision 확인, temporary sibling, rename). 문서 의미를 알지 않는다.
- `apps/editor/` — Core-backed Visual Editor. MyST AST를 직접 다루지 않고 Core read model과 Core operations만 사용한다.
- `apps/desktop/` — Electron Windows Host, NSIS 패키징과 Stable/Beta 업데이트. 기존 파일 Host handler를 재사용하며 문서 의미를 구현하지 않는다.
- `docs/design/editor-layout-rules-v1.md` — Editor UI 변경 시 정렬, 간격 및 control 치수 기준으로 참고한다.
- `docs/design/editor-visual-language-v1.md` — Editor typography, surface, 상태 및 overlay 표현 기준.
- `docs/test/` — 자동 검증 실행 방법과 자동화가 판정하지 않는 수동 확인 항목.
- `.githooks/` — optional shared Git hooks, including commit-msg AI provenance checks.
- `.agents/skills/` — project-only agent skills shared by Codex and Claude Code (`.claude/skills/` holds thin entry points). `ieumdoc-orchestrator` runs multi-issue orchestration only on explicit invocation.
- `README.md` — 제품 목적과 장기적인 아키텍처 방향.

## Documentation authority and lifecycle

- 적용 순서는 이 문서의 repository-wide 제약 → Accepted ADR → Implemented design contract → 코드·테스트의 실행 근거 → historical review/spike → README 개요다. 충돌 시 실제 동작과 Accepted decision을 대조해 버그인지 문서 drift인지 판정한다. 코드를 무조건 정답으로 삼지 않는다.
- 변경 전에 [docs index](docs/README.md)에서 관련 Accepted ADR과 Implemented design contract를 확인하고, current behavior를 변경하면 관련 design document도 같은 PR에서 갱신한다.
- review/spike를 current contract처럼 사용하지 않는다. 당시 근거는 보존하고 현재 authority로 연결한다.
- stale link와 conflicting contract를 발견하면 숨기지 않고 수정한다.
- 모든 유지되는 `docs/**/*.md` 문서는 [docs index](docs/README.md)에 직접 연결되어야 한다.
- 상태·metadata·충돌 처리의 상세 규칙은 [Documentation governance](docs/contributing/documentation-governance.md)를 따른다.

## Issue 작성

- 이슈 생성·수정 시 [이슈 작성 규칙](docs/contributing/issues.md)을 먼저 따른다. 웹·CLI·Agent 모두 같은 제목·유형·최소 정보 규칙을 적용한다. 일반 작성 스킬이 저장소 분류나 검토 상태를 임의로 바꾸지 않도록 한다.

## Verification

- 로컬에서는 변경 영역의 대상 검사를 우선하고, PR의 필수 CI 검사는 모두 통과해야 한다. 문서 전용 변경, 전체 suite와 패키징·플랫폼별 검증의 로컬 실행 기준은 [CONTRIBUTING matrix](CONTRIBUTING.md#verification-matrix)를 따른다. 무관한 테스트 확장·리팩터링은 하지 않는다.
- 테스트 추가 전 기존 보호 범위와 새로 잡을 결함을 확인한다. 기존 테스트 보완을 우선하며, 고유한 보호 가치가 없으면 추가하지 않는다.
- 사용자 동작·공개 계약을 검증하고, 변수명·우연한 마크업 형태·임의의 개수를 고정하지 않는다. 명시적인 의존성 경계는 검증한다.
- 의미 규칙은 Core에서, CLI·브라우저는 각 인터페이스의 고유한 위험과 통합 동작을 검증한다. 같은 결함을 잡는 사례를 계층마다 반복하지 않는다.
- 동일 실행 결과로 필요한 검사를 함께 수행한다. 자동 판정에 쓰이지 않는 촬영·촬영 전용 순회는 수동 검토로 분리한다.

## Browser automation

- 브라우저 검증은 `pnpm browser:test`를 사용한다.
- Windows에서는 재사용 persistent browser profile을 사용하고 디버깅은 기존 session을 재사용한다.
- 설치형 Chrome을 임시 profile, 임시 `--user-data-dir`, 반복 `launch()`로 짧은 간격에 새로 실행하지 않는다.
- 원인, 실행 간 storage 정리와 상세 규칙은 [Windows browser automation](docs/contributing/windows-browser-automation.md)을 따른다.

## Process cleanup

- 작업 완료를 보고하기 전에 이번 작업에서 직접 시작한 임시 프로세스와 세션을 종료하고, background process가 남아 있지 않은지 확인한다. dev server, browser automation session, watcher, 임시 local/test server 등 모든 검증용 프로세스가 대상이다.
- 가능하면 PID, session name 등으로 자신이 시작한 것인지 확인한다. 사용자가 원래 실행 중이던 프로세스는 종료하지 않으며, 이름이나 포트가 같다는 이유로 다른 프로세스를 광범위하게 종료하지 않는다.
- 정리에 실패하면 완료된 것처럼 보고하지 않고, 남아 있는 process/session/port와 이유를 명시한다. 브라우저 runner의 소유권·종료 절차는 [Process and session cleanup](docs/contributing/windows-browser-automation.md#process-and-session-cleanup)을 따른다.

## AI Commit Provenance

Every commit created primarily by an AI coding agent MUST include
machine-readable provenance trailers.

Exception: merge commits created by GitHub's merge queue are platform-generated
and carry no AI trailers. Provenance stays in the PR's own commits, which the
validator checks on `pull_request`. Manually authored merges by an AI agent
(for example, merging master into a PR branch) still require the trailers below.

Required:

```
AI-Agent: <agent>
AI-Model: <provider>/<model>
```

Example:

```
AI-Agent: Grok
AI-Model: xai/grok-4.6
```

Rules:

- Record the AI agent that performed the implementation.
- Record the actual model used for the implementation.
- Use a stable canonical model identifier.
- Keep AI attribution out of the commit subject.
- Do not use `Co-authored-by` as a substitute for AI provenance.
- Never invent the model name.
- Never copy model metadata from previous commits. Verify the actual
  model used for the current implementation.
- Do not add duplicate provenance trailers.
- Put both required trailers exactly once in the final contiguous trailer
  block, separated from the body by one blank line. Never put a blank line
  between trailers. Text that looks like metadata but is outside Git's parsed
  trailer block does not satisfy this policy.
- Write multi-line commit messages through a UTF-8 message file (`git commit
  --file <file>`); do not pass each trailer as a separate `-m` paragraph.
- Immediately after every commit and before push, inspect
  `git log -1 --format='%H%n%(trailers:only)'` and verify Git reads exactly
  one `AI-Agent` and one `AI-Model` with the actual implementation values.
  A visual inspection of the raw message or a successful optional hook is
  insufficient.
- Before approval, reviewers must inspect the final PR commit range with
  Git's parsed-trailer check in CONTRIBUTING, including authored merge commits,
  and confirm the provenance CI check passed for the reviewed head SHA.

`AI-Agent` / `AI-Model` name the agent and model that performed the
implementation. A model that only reviewed the work is not the
implementation model. Review provenance uses a separate, optional
`AI-Reviewed-By` trailer; it is not required by this policy.

Canonical model identifiers, review trailer examples and commit-msg hook
setup are in [CONTRIBUTING](CONTRIBUTING.md#ai-commit-provenance).
