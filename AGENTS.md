# AGENTS.md

> Document first. Semantics in Core. Interfaces replaceable.

## Working principles

- 현재 요청을 해결하는 가장 작고 단순한 변경을 우선한다.
- 기존 코드와 검증된 라이브러리를 재사용하고, 필요성이 확인되지 않은 abstraction이나 infrastructure를 추가하지 않는다.
- 정상 동작하는 주변 코드를 현재 작업과 무관하게 재설계하거나 리팩터링하지 않는다.
- 기존 기술로 해결 가능한 parser, AST, document format, editor engine 등을 불필요하게 재구현하지 않는다.
- 기술적 제약이나 실패를 숨기기 위해 테스트 기준을 약화하거나 동작을 우회하지 않는다.

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
- `apps/editor/server`는 현재 local development adapter다. 이를 장기 persistence/backend architecture로 전제하여 확장하지 않는다.

이 원칙을 이유로 미래 구조나 기능을 선제적으로 구현하지 않는다.

## Repository map

- `docs/adr/` — accepted architectural decisions and their rationale.
- `packages/core/` — IeumDoc의 headless document engine. 문서의 parse, semantic operations, structural validation, canonical serialization을 소유한다.
- `packages/core/src/myst/` — MyST integration boundary. MyST-specific parsing/serialization logic은 이 경계 안에 둔다.
- `packages/core/test/` — Core의 document semantics와 canonical round-trip 계약을 검증한다.
- `packages/cli/` — `@ieumdoc/core`의 얇은 명령줄 인터페이스. 문서 의미나 AST 처리 로직을 구현하지 않는다.
- `apps/editor/` — Core-backed Visual Editor. MyST AST를 직접 다루지 않고 Core read model과 Core operations만 사용한다.
- `docs/design/editor-layout-rules-v1.md` — Editor UI 변경 시 정렬, 간격 및 control 치수 기준으로 참고한다.
- `docs/test/` — 사람이 현재 구현을 직접 검증하기 위한 절차.
- `.githooks/` — optional shared Git hooks, including commit-msg AI provenance checks.
- `README.md` — 제품 목적과 장기적인 아키텍처 방향.

## Verification

변경한 동작과 직접 관련된 검증을 수행한다.
현재 작업과 관계없는 광범위한 테스트, 리팩터링 또는 구조 변경은 수행하지 않는다.

## Process cleanup

작업 완료를 보고하기 전에 이번 작업에서 직접 시작한 임시 프로세스와 세션을 종료한다.
대상은 dev server(Vite 등), browser automation session(Playwright 등), watcher, 임시 local/test server, 기타 검증용 background process다.

- 이번 작업에서 직접 시작한 프로세스만 종료한다. 사용자가 원래 실행 중이던 프로세스는 종료하지 않는다.
- 프로세스 이름이나 포트 번호가 같다는 이유만으로 다른 프로세스를 광범위하게 종료하지 않는다.
- 가능하면 PID, session name 등으로 자신이 시작한 것인지 확인한 뒤 정리한다.
- 완료 보고 전에 자신이 시작한 background process가 남아 있지 않은지 확인한다.
- 정리에 실패하면 완료된 것처럼 보고하지 않고, 남아 있는 process/session/port와 그 이유를 명시한다.

## AI Commit Provenance

Every commit created primarily by an AI coding agent MUST include
machine-readable provenance trailers.

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
- Never copy the previous commit's model metadata without verifying
  which model actually performed the current work.
- Do not add duplicate provenance trailers.

`AI-Agent` / `AI-Model` name the agent and model that performed the
implementation. A model that only reviewed the work is not the
implementation model. If review provenance is needed later, use a
separate trailer, for example:

```
AI-Reviewed-By: openai/gpt-5.6-sol
```

Review trailers are optional and are not required by this policy.

### Canonical model identifiers

Use a single analyzable identifier, not a display name:

```
<provider>/<model>
```

Examples:

```
xai/grok-4.6
openai/gpt-5.6-luna
openai/gpt-5.6-terra
openai/gpt-6-astra
```

If a vendor's official identifier differs from this repository's
identifier, use the repository canonical form above and keep it stable.

This repository's canonical identifier for Grok 4.6 is `xai/grok-4.6`.

### Commit-msg hook

`.githooks/commit-msg` detects incomplete or duplicate AI provenance
trailers. It does not insert a model name. Human commits that omit
both trailers are allowed. Enable the shared hooks in a local clone
with:

```
git config core.hooksPath .githooks
```
