# Documentation governance

이 문서는 현재 계약과 과거 근거를 구분하고, 구현과 문서를 함께 유지하는 규칙이다.

## Document authority order

1. [AGENTS.md](../../AGENTS.md): 저장소 전체의 작업·구현 제약.
2. Accepted ADRs: 승인된 아키텍처 결정.
3. Implemented design documents: 현재 master의 동작·인터페이스 계약.
4. Code and tests: 실행 가능한 구현과 회귀 근거.
5. Reviews and spikes: 당시 조사·검토·실험의 역사적 근거. 현재 요구사항이 아니다.
6. [README](../../README.md): 제품 개요와 진입점.

이 순서는 충돌을 숨기거나 코드가 무조건 옳다고 판정하는 규칙이 아니다. 충돌을 발견하면 실제 current behavior와 Accepted decision을 확인하고, 버그인지 stale 문서인지 판정한다. 같은 PR에서 코드 또는 문서를 수정하고 판정 근거를 남긴다. issue 번호만으로 문서 권위나 architecture 승인을 부여하지 않는다.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Draft | 논의 중이며 현재 구현 계약이 아님 |
| Accepted | 승인된 architecture decision |
| Implemented | 현재 master behavior를 설명하는 계약 |
| Historical | 당시 조사·검토·실험 기록이며 현재 요구사항이 아님 |
| Superseded | 다른 문서로 대체됨. 후속 문서를 반드시 링크 |

Status 값은 위 단어를 사용한다. `Scope`나 `Authority`로 개발 Host에 한정되는지, historical security review인지 등을 덧붙인다. Implemented는 모든 플랫폼의 수동 검증 완료나 제품 release를 뜻하지 않는다.

## Required metadata

ADR/design/review 상단에는 상태와 권위를 판단하는 데 필요한 최소 metadata를 둔다.

- `Status`
- `Last verified`: 확인 날짜와 범위. 문서·코드 대조와 실제 실행을 구분한다.
- `Scope` 또는 `Authority`: 적용 경계나 현재 authority 링크.
- 관련 issue/ADR/document: 관계가 있을 때 연결한다. 빈 template field는 만들지 않는다.

Decision date와 historical measurement의 날짜는 Last verified로 덮어쓰지 않는다. Historical 문서의 Last verified는 상태·후속 링크를 점검한 날짜일 수 있으며, 당시 실험을 다시 실행했다는 뜻이 아니다. 이번 상태 정리의 코드 대조 기준은 master `8fee65e` (2026-10-08)다. 이후 동작이 바뀌면 해당 문서의 검증 범위를 갱신한다.

## Update rules

- current behavior contract를 바꾸는 구현은 같은 PR에서 관련 design document를 갱신한다.
- 새로운 주요 architecture decision은 ADR로 남긴다. 단순 구현 상세마다 ADR을 만들지 않는다.
- historical review를 현재 계약으로 계속 덧붙이지 않는다. 오래된 기록은 Historical/Superseded 상태와 현재 authority를 연결하고 당시 측정값·commit·결과를 보존한다.
- 현재 계약과 구현 연대기가 함께 있으면 현재 계약을 앞에, history/evidence를 뒤에 둔다.
- 삭제보다 연결과 상태 표시를 우선한다. 경로 변경 시 들어오는 링크와 자동 검사도 함께 갱신한다.
- 모든 유지되는 `docs/**/*.md`는 [중앙 색인](../README.md)에 직접 링크한다. 색인 자체만 제외하며, 추가 예외가 필요하면 검사 코드의 명시적인 exclusion 목록에 이유를 적는다.

## Automated checks

`pnpm docs:check`는 루트 진입 문서, `docs/**/*.md`, `.github/**/*.md`의 local link/image 경로, Markdown heading anchor, docs index 직접 색인과 루트 연결성을 검사한다. 외부 URL의 HTTP 상태는 검사하지 않는다. 경로의 대소문자는 Windows에서도 정확히 일치해야 한다.

지원하는 Markdown 범위와 제한은 [checker](../../scripts/check-docs.ts)의 주석에 둔다. checker 회귀 검증은 `pnpm exec tsx --test scripts/check-docs.test.ts`이며 같은 CI quality step에서 실행한다. 자동 검사가 current/historical 판정, 기능 주장, 이미지의 적합성이나 Mermaid 렌더링까지 보증하지는 않는다.
