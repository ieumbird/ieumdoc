# ADR-0001: 단일 문서 편집 상태 기반 Typed Block Editor

- Status: Accepted
- Decision date: 2026-09-22

## Context

IeumDoc은 사람이 읽을 수 있는 plain-text `.md` 문서를 영속 데이터의 SSOT로 유지하면서, Paragraph, Heading, Equation처럼 의미가 다른 블록을 사용자가 직접 선택해 삽입하고 편집하는 경험을 제공해야 한다. 기존 MVP와 두 spike는 문서 전체를 paragraph별 독립 편집기로 구성하는 방식과 하나의 문서 편집 상태에서 typed block을 다루는 방식을 비교했다.

핵심 쟁점은 typed block을 유지할 수 있는지 여부가 아니라, 문서 전체의 selection, cursor, clipboard, history와 블록 경계 동작을 어느 계층이 소유할지였다.

## Decision

IeumDoc은 **Single Editor + Typed Blocks + Block-first UX**를 채택한다.

- 하나의 열린 문서에는 하나의 주 문서 편집 상태를 사용한다.
- 기본 구현에는 Tiptap/ProseMirror를 사용한다.
- Paragraph, Heading, Equation 등은 명시적인 의미 타입으로 표현한다.
- 사용자가 블록 타입을 선택하여 삽입하는 Block-first UX를 유지한다.
- 블록별 NodeView, 속성 패널, 전용 입력 UI를 허용한다. 전용 UI에서 확정된 문서 변경은 주 문서 편집 상태와 일관되게 연결해야 한다.
- paragraph별 독립 Tiptap 인스턴스를 문서 전체의 기본 아키텍처로 확장하지 않는다. 여러 prose 편집 영역을 분리하는 Hybrid도 기본안으로 채택하지 않는다.

## Rationale and Alternatives

단일 편집 상태를 선택하면 문서 전체의 selection, cursor, history 같은 공통 편집 기반을 편집 엔진에 맡길 수 있다. IeumDoc이 독립 편집기 사이의 focus, selection, clipboard, history를 조율하는 별도 문서 편집 엔진으로 확대되는 것을 피하면서도, typed block과 블록별 전용 UI를 구현할 수 있다.

Per-block 방식은 Core operation과 블록 UI의 대응이 직접적이라는 장점이 있다. 그러나 실험에서는 각 편집기가 소유한 selection과 history의 경계, 블록 간 focus 이동, split/merge 및 구조 변경 후 상태 복원을 IeumDoc이 조율해야 했다. 이는 해당 spike의 모든 문제나 per-block 접근의 모든 구현이 필연적으로 실패한다는 뜻은 아니지만, 연속적인 문서 편집을 중심으로 하는 현재 제품에는 더 큰 기본 비용이다.

여러 prose 영역만 분리하는 Hybrid는 일부 블록 경계를 줄일 수 있으나, 복수 편집 상태 사이의 조율 책임을 기본 구조에 남기므로 채택하지 않는다.

## Consequences

다음 비용을 감수한다.

- Core와 Editor 사이에 명시적인 변환 및 변경 적용 계약이 필요하다.
- 특수 블록별 Tiptap 표현과 NodeView를 유지해야 한다.
- 특수 블록의 선택, 복사, 삭제, 실행 취소를 별도로 검증해야 한다.
- 편집 엔진을 교체하면 Editor와 adapter를 수정해야 한다.

Tiptap이 모든 UX를 자동으로 해결한다고 가정하지 않는다. 단일 편집 상태는 공통 기반을 제공하지만, typed node의 경계 동작과 전용 UI 연결은 IeumDoc이 설계하고 검증해야 한다.

## Constraints

- 저장된 plain-text `.md` 문서가 영속 데이터의 SSOT다.
- Core가 문서 의미, 지원 범위, 변경 검증 및 canonical 저장 계약을 소유한다.
- Tiptap/ProseMirror 타입과 전용 문서 모델은 Editor 영역에 한정한다. Tiptap JSON을 Core 공개 API나 영속 저장 형식으로 사용하지 않는다.
- 미지원 의미를 조용히 제거하거나 평탄화하여 저장하지 않는다. 보존할 수 없는 내용이 있으면 저장을 명확히 거부한다.
- 편집 중의 빈 문단, 미완성 입력, cursor, selection 및 미저장 변경은 편집 세션에 존재할 수 있다.
- Core 중심성을 이유로 매 키 입력이나 구조 변경마다 `serialize → reparse → Editor 재생성`을 강제하지 않는다.

`Interfaces replaceable`은 교체 비용이 0이라는 뜻이 아니다. 교체 비용이 Editor와 연결부에 집중되고 Core, 파일 형식, CLI로 불필요하게 전파되지 않도록 한다는 뜻이다.

## Non-decisions

이 ADR은 다음 구현을 승인하거나 고정하지 않는다.

- B spike의 `replaceEditableBlocks()`
- 현재 `EquationNode` 구현
- 현재 adapter 파일 구성
- 현재 HTTP Save API 및 Vite 개발 서버 저장 방식
- NodePath의 장기 전략
- 구체적인 transaction mapping 또는 snapshot 저장 알고리즘
- 현재 패키지의 특정 patch version

정보가 생략된 표시용 모델로 원본 문서를 덮어쓰는 것은 허용하지 않는다. 그러나 whole-document snapshot 방식 자체를 영구 금지하는 것은 아니다. 구체적인 의미 보존 저장 전략은 정식 구현에서 검증한다.

## Evidence

두 실험은 공통 기준 commit `60f3044af25e4c99bc8fa20c809aac56f2d9accb`에서 갈라졌다.

### A: Per-block Editor

- 검토 commit: `4d25f459f97973de59de496736f52de6947133cd`
- 보고서: `apps/editor/PER_BLOCK_SPIKE.md`
- 보존 태그: `archive/editor-per-block-spike`
- 실제 브라우저 관찰: paragraph별 selection과 undo/redo가 분리되었고, 블록 간 focus 이동에는 별도 routing이 필요했다. prose를 equation 너머까지 drag한 경우 하나의 의미 있는 cross-block selection을 만들지 못했다. 구조 변경은 editor를 다시 만들며 local history를 잃었다.
- 소스 및 자동 테스트 확인: focus registry, 지연 focus, paragraph split/merge, draft flush 후 구조 변경, Core operation 및 canonical round-trip 검증이 추가되었다.
- 미실행: 한국어 IME와 100개 editor 규모는 직접 실행하지 않았다. 관찰된 문제 전체를 per-block 아키텍처의 필연으로 일반화하지 않는다.

### B: Single Document Editor

- 검토 commit: `5c0ad21c9145a3ef4bc014197991628b34208dd3`
- 보고서: `docs/spikes/editor-single.md`
- 보존 태그: `archive/editor-single-spike`
- 소스 및 자동 테스트 확인: 하나의 `useEditor`가 Heading, Paragraph, Equation을 포함하는 문서를 소유했고, Equation은 typed atomic node로 표현되었다. Editor 내부 양방향 adapter는 지원하지 않는 block과 mark를 거부했으며, Core와 저장 bridge에는 Tiptap/ProseMirror 타입을 노출하지 않았다. semantic save와 canonical reparse도 자동 검증했다.
- 실제 브라우저 관찰: 주요 키보드·마우스 interaction 결과는 기록되지 않았다.
- 미실행: Enter, Backspace, Arrow navigation, 문서 전체 undo/redo, cross-block drag 및 clipboard 동작을 실제 브라우저에서 직접 검증하지 않았다. 따라서 엔진에 위임된 구조를 완성된 UX로 간주하지 않는다.

LOC나 테스트 개수는 선택 기준이 아니다. 실험은 단일 편집 상태에서도 typed block과 Block-first UX가 가능하며, 공통 selection/history의 소유권을 편집 엔진에 둘 수 있음을 보여 준 근거로 사용했다.

## Revisit Conditions

다음처럼 제품 요구나 구체적인 기술 근거가 바뀌는 경우에만 이 결정을 재검토한다.

- 제품의 중심이 연속적인 문서 작성에서 독립 레코드의 개별 편집·승인으로 바뀐다.
- 실제 목표 규모나 필수 블록에서 단일 편집 상태의 중대한 한계가 재현된다.
- Core의 의미 보존 계약을 유지하는 비용이 대안보다 크다는 구체적인 증거가 나온다.

NodeView나 adapter가 필요하다는 사실 자체는 재검토 사유가 아니다. 이는 이 결정에서 이미 감수한 비용이다.
