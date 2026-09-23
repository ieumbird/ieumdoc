# ADR-0003: Document Addressing & Identity Boundary

- Status: Accepted
- Decision date: 2026-09-23

## Context

Core와 Editor는 현재 문서 snapshot 안의 블록과 하위 노드를 가리켜야 한다. 동시에 insert, remove, split, merge 및 reorder 같은 구조 변경은 같은 의미의 노드에 새로운 위치를 부여할 수 있다. snapshot 위치를 영속 identity처럼 사용하면 stale locator가 다른 대상을 가리키거나, 향후 reference와 transclusion의 설계가 현재 구현에 묶인다.

ADR-0001은 Editor의 single-document state와 typed block UX를 결정한다. 이 ADR은 그 편집 상태 안팎에서 주소가 의미하는 범위와 persistent identity와의 경계만 결정한다.

## Decision

IeumDoc은 다음을 채택한다.

- Core의 `NodePath`와 Editor의 `sourcePath`는 현재 document snapshot에 유효한 locator다.
- insert, remove, split, merge 또는 reorder 후에는 locator가 변경될 수 있으며, 필요한 경우 현재 snapshot에서 다시 계산한다.
- `NodePath`와 `sourcePath`를 persistent semantic identity로 사용하지 않는다. Editor의 `sourcePath`는 저장 bridge와 pending edit mapping을 위한 snapshot locator일 뿐이다.
- reference, transclusion, requirement identity 등 persistent identity가 필요한 기능은 별도의 identity 전략 결정으로 남긴다.
- 이번 ADR에서는 UUID, label, stable ID 또는 그 밖의 구체적인 identity 방식을 결정하지 않는다.

## Rationale

snapshot locator와 persistent identity를 분리하면 현재 parsed tree와 Editor projection 사이의 주소 계약을 단순하게 유지하면서도, 구조 변경이 주소를 바꿀 수 있다는 사실을 명확히 표현할 수 있다. 이를 통해 stale path를 장기 링크나 의미적 참조로 오용하는 것을 막고, 미래의 identity 전략이 현재 NodePath 형식에 선제적으로 종속되지 않게 한다.

## Consequences

- 구조 변경 뒤에 locator를 보관하는 호출자는 새 snapshot을 기준으로 locator를 갱신해야 한다.
- NodePath나 sourcePath를 외부 참조, 영속 링크 또는 문서 간 관계의 identity로 저장해서는 안 된다.
- persistent reference가 필요한 기능은 stable identity 전략이 결정될 때까지 별도 계약 없이 구현하지 않는다.
- 현재 Editor의 pending edit mapping과 Core operation은 snapshot 기반 주소의 수명과 stale path 실패를 명확히 처리해야 한다.

## Non-decisions

이 ADR은 다음을 결정하지 않는다.

- UUID, label, stable ID 또는 기타 persistent identity 방식
- reference, transclusion 및 requirement identity의 의미와 lifecycle
- identity를 문서에 저장하는 위치, 형식 또는 migration 전략
- transaction mapping, collaboration, conflict resolution 또는 session architecture
- ADR-0001에서 결정한 Editor state, typed block 및 NodeView 구조

## Revisit Conditions

Reference, transclusion 또는 requirement identity가 필요해지면 별도 ADR에서 identity model을 결정한다. 그 사실만으로 `NodePath` 또는 `sourcePath`를 persistent identity로 승격하지 않는다.

- `NodePath` 또는 `sourcePath` 자체가 durable identity여야 한다는 강한 제품 또는 기술적 근거가 생기는 경우
- snapshot locator 모델 자체가 실제 Core/Editor operation을 감당하지 못한다는 재현 가능한 한계가 확인되는 경우

The introduction of persistent identity features alone is not a reason to revisit this ADR.
