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
- 공식 write path가 생성하는 문서는 valid하고 안정적으로 다시 처리할 수 있어야 한다.

이 원칙을 이유로 미래 구조나 기능을 선제적으로 구현하지 않는다.

## Layout

- `packages/core` — headless document parse, operations, validate, serialize. No UI.
- `packages/cli` — thin file interface over `@ieumdoc/core`. Do not put document meaning here.
- `spikes/` — exploratory experiments. Do not import spike code into `packages/core` or `packages/cli`.

## Verification

변경한 동작과 직접 관련된 검증을 수행한다.
현재 작업과 관계없는 광범위한 테스트, 리팩터링 또는 구조 변경은 수행하지 않는다.