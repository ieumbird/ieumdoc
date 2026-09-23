# ADR-0002: Document Persistence & Semantic Ownership

- Status: Accepted
- Decision date: 2026-09-23

## Context

IeumDoc은 Editor, CLI, AI 및 자동화 도구가 같은 문서를 서로 다른 방식으로 다룬다. 이 인터페이스들이 각자의 표시 모델이나 저장소를 문서의 기준으로 삼으면 문서 의미와 변경 규칙이 분기되고, 인터페이스 교체 또는 drift를 되돌리는 비용이 커진다.

ADR-0001은 열린 문서의 편집 상태와 typed block UX를 결정한다. 이 ADR은 편집 상태의 구현 방식이 아니라 영속 문서, 의미 처리, 저장 책임의 경계를 결정한다.

## Decision

IeumDoc은 다음을 채택한다.

- 사람이 읽을 수 있는 plain-text `.md` 문서를 영속 데이터의 단일 진실 공급원(SSOT)으로 유지한다.
- Core가 document semantics, editor-neutral semantic operations, structural validation 및 canonical write contract를 소유한다.
- Editor, CLI, AI 및 자동화 도구는 같은 Core를 사용하는 교체 가능한 interface다.
- Tiptap JSON, 데이터베이스 레코드, Editor projection 또는 기타 파생 표현을 별도의 SSOT나 영속 저장 형식으로 사용하지 않는다.
- 영속적인 semantic change는 interface가 독자적으로 구현하지 않는다. 해당 변경은 Core operation으로 표현되고 Core의 검증 및 저장 계약을 통과해야 한다.
- 보존할 수 없는 의미를 조용히 flatten하거나 drop하여 저장하지 않는다. 의미를 보존할 수 없으면 write를 fail-closed 방식으로 거부한다.
- MyST는 현재 parser/serializer 구현 기반이며, IeumDoc의 영구 domain model로 고정하지 않는다. MyST별 처리는 Core 내부의 경계에 둔다.
- canonical write는 Git에서 검토 가능한 사람이 읽을 수 있는 plain-text 결과를 유지한다.

## Rationale

plain-text 문서를 SSOT로 두면 Git diff, review, history 및 다른 도구와의 상호 운용이 문서 자체를 기준으로 동작한다. Core가 의미와 write contract를 소유하면 Editor, CLI, AI가 같은 규칙을 사용하고, 특정 UI나 저장 인프라가 문서 의미를 독점하는 것을 막을 수 있다.

파생된 Editor projection이나 데이터베이스는 성능·조회·편집을 위해 존재할 수 있지만, 문서에서 재생성 가능해야 하며 원본 의미의 권위가 될 수 없다. 보존할 수 없는 내용을 거부하는 것은 조용한 손실보다 명시적인 실패를 선택하는 계약이다.

## Consequences

- Core operation과 canonical serialization이 모든 공식 semantic write path의 공통 계약이 된다.
- 인터페이스는 Core read model과 operation을 연결하는 adapter를 유지해야 한다.
- 지원하지 않는 의미나 손실성 변경은 저장 전에 사용자에게 명확히 실패를 알리고, 부분 write를 남기지 않아야 한다.
- 향후 저장소, cache 또는 index를 추가하더라도 plain-text 문서에서 파생되고 복구 가능해야 한다.
- MyST parser/serializer를 교체할 수 있도록 IeumDoc의 공개 의미 계약과 MyST 구현 세부사항을 분리해야 한다.

## Non-decisions

이 ADR은 다음을 결정하지 않는다.

- 특정 database, remote backend, file synchronization 또는 persistence infrastructure의 채택 여부
- 특정 Markdown/MyST 버전, AST 타입 또는 canonical serialization 알고리즘의 세부사항
- Editor의 편집 엔진과 single-document state 구조. 이는 ADR-0001의 범위다.
- 구체적인 Core operation API, CLI command 목록 또는 AI integration protocol
- collaboration, session, conflict resolution 및 access control architecture
- reference, transclusion 또는 requirement의 persistent identity 전략. 이는 별도 결정의 범위다.

## Revisit Conditions

plain-text `.md` SSOT와 Core의 semantic ownership을 유지하는 한 MyST/parser/serializer 구현은 교체할 수 있으며, 이는 이 ADR의 결정을 바꾸지 않는다.

다음과 같은 핵심 결정의 변경을 요구하는 구체적인 요구나 증거가 생기는 경우에만 이 결정을 재검토한다.

- 제품이 Git 검토 가능한 plain-text 문서를 영속 데이터의 중심으로 더 이상 요구하지 않는 경우
- 실제 문서 의미를 보존하면서 Core 중심 semantic operation을 유지할 수 없다는 명확한 요구나 증거가 생기는 경우
- 파생 저장소가 원본 문서와 독립적인 권위가 되어야 한다는 요구가 생기는 경우
- Parser/serializer implementation replacement alone is not a reason to revisit this ADR.
