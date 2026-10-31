# ADR-0006: 이음독 네이티브 문서 지원 경계

- Status: Accepted
- Last verified: 2026-10-14 (post-#234 implementation status and current design contract/supersession links checked).
- Authority: product and architectural decision under [AGENTS.md](../../AGENTS.md). Related: [#232](https://github.com/ieumbird/ieumdoc/issues/232) · [ADR-0001](0001-single-document-editor-architecture.md) · [ADR-0002](0002-document-persistence-semantic-ownership.md) · [ADR-0004](0004-desktop-host-distribution.md)
- Decision date: 2026-10-14

이 문서는 승인된 지원 경계를 기록한다. 네이티브 문서 경계는 [#234](https://github.com/ieumbird/ieumdoc/pull/234)에서 구현되었으며, 현재 동작은 [Native document support](../design/document-support-v1.md)의 Implemented 계약을 따른다. [Block source editing](../design/block-source-editing-v1.md)은 Superseded 상태로 당시 계약을 보존한다. 아래 Context와 Evidence는 결정 당시의 계약과 관찰 기록이다.

## Amendment: separate text editing (#817, 2026-10-31)

[#817](https://github.com/ieumbird/ieumdoc/issues/817)의 소유자 결정에 따라 미호환 `.md`와
`.txt`는 Editor에서 별도의 텍스트 종류로 자동으로 연다. 이는 아래 네이티브 수용 거부를
부분 편집이나 Source 교체로 완화하는 것이 아니다. 네이티브 판정·의미·쓰기는 Core가
계속 소유하며, 텍스트 저장은 현재 파일이 네이티브가 아님을 확인한 뒤 공용 File commit으로
입력 문자열만 쓴다. 서식·블록·미리보기·변환은 제공하지 않는다. 작업 보호와 로컬 복구는
종류를 분리해 공용 정책을 적용한다. 의미 연산이 아니므로 CLI command는 추가하지 않는다.
현재 세부 계약은 [Text files](../design/document-support-v1.md#text-files-in-the-editor-817)를 따른다.
아래 Context와 원래 결정은 당시 근거를 보존하며, Editor의 무조건 열기 거부 조항만 이
명시적 예외로 대체한다. CLI 거부와 네이티브 Source 읽기 전용 계약은 유지한다.

## Context

IeumDoc은 사람이 읽고 Git에서 변경을 검토하기 좋은 영속 표현으로 Markdown/MyST를 선택했다. 현재 계약은 미지원 내용을 읽기 전용 블록으로 보존하면서 다른 부분을 편집하고, 블록별 원문을 교체하여 저장하는 경로까지 포함한다. #232는 이 호환성 범위를 줄이고 이음독이 책임지는 구조화 기술문서 저작에 집중하려는 제품 결정이다.

결정 시점에 보호해야 할 실사용자 문서가 없다는 것은 사용자의 제품 판단이다. 이를 근거로 이번 전환에서 기존 문서 Migration을 제공하지 않는다. 이는 사용량을 계측한 결과나 공개 배포가 없다는 주장이 아니다. [0.0.1-beta.3은 이미 공개 배포](../releases/v0.0.1-beta.3.md)되었으므로 이전 버전 문서와의 호환성 변경을 알릴 책임은 남는다.

## Decision

IeumDoc은 **Markdown을 영속 형식으로 쓰는 구조화 기술문서 에디터**이며, 범용 Markdown 에디터가 아니다.

### Native document contract

- Frontmatter에 이음독 식별 표식이 있고, 실제 내용이 네이티브 계약을 만족하는 문서만 지원한다. 표식이 없거나 확인되지 않으면 지원하지 않으며, 표식을 자동으로 추가하여 받아들이지 않는다. `.md` 확장자나 MyST 파싱 성공만으로 지원을 약속하지 않는다.
- 네이티브 계약은 이음독이 저작 대상으로 채택한 문서 의미 구조와 메타데이터로 정의한다. Core의 문서 생성과 지원 연산으로 **성공적으로 저장한 결과**는 항상 이 계약을 만족해야 한다. 편집 초안이나 연산 조합의 중간 상태를 모두 완성된 저장 문서로 요구하지 않는다.
- 판정은 의미 기준이다. 입력이 serializer 출력 문자열과 일치하는지, 현재 read model의 `editable` 값이 무엇인지로 판정하지 않는다. 허용 속성과 중첩 형태는 design 계약에 명시한다. 기존 범용 소스 교체나 보존 경로가 출력할 수 있다는 이유만으로 구조를 네이티브에 포함하지 않는다.
- 식별 표식과 제목 번호용 frontmatter, `(label)=` 대상 등 저작에 필요한 메타데이터도 계약에 포함한다. 본문에서 직접 타이핑하는 블록인지 여부로 지원 범위를 정하지 않는다.
- 문서 유효성과 작성 완료 상태를 구분한다. 빈 Figure, 대상이 아직 없는 교차 참조 등 지원되는 작성 중 상태를 허용한다. 작성 완료 경고를 미지원 문서 판정으로 바꾸지 않는다.

### Admission and Core ownership

- 지원하지 않는 문서는 Editor에서 이유만 안내하고 열기를 거부한다. 읽기 전용 화면이나 미지원 블록을 섞은 부분 편집 문서로 수용하지 않는다.
- CLI `check`는 미지원 문서에 실패 결과와 이유를 반환한다. `inspect`와 편집·쓰기 명령은 미지원 문서를 거부한다. 거부 과정에서 원본을 수정하지 않는다.
- 지원 판정은 Core가 소유하며, Vite 개발 adapter, HTTP Host, Desktop, CLI와 Core를 직접 사용하는 자동화의 모든 공식 문서 진입·쓰기 경로에 일관되게 적용한다. 인터페이스별로 별도의 지원 규칙을 구현하지 않는다.
- 구문 해석 성공은 네이티브 지원을 의미하지 않는다. 내부 문서 조각의 해석과 검증은 외부 파일의 지원 계약과 구분한다.
- 표식 검증을 canonical 저장 검사에 맡기지 않는다. YAML 파싱 오류, 중복 키와 표식 값 형식을 명시적으로 검사한다.
- 네이티브 문서 생성은 Core가 소유하고 Editor와 CLI가 같은 생성 연산을 사용한다. CLI에서도 처음부터 네이티브 문서를 생성할 수 있어야 한다. 파일 경로 선택과 기존 파일 덮어쓰기 방지는 Host와 CLI의 책임이다.

### Authoring and preservation

- 미지원 내용을 포함한 부분 편집, 미지원 블록의 원문 보존·표시를 위한 호환성 기능, 범용 블록 소스 교체([#102](https://github.com/ieumbird/ieumdoc/issues/102))를 폐지한다. Editor의 Edit source, Core의 `replaceBlockSource`, CLI의 `replace-block-source`를 모두 포함한다.
- 제목 번호 메타데이터, 라벨 편집, 수식과 코드 블록 편집, 이 기능들이 공유하는 초안 보호는 유지한다. 미지원 내용의 보존 기능 폐지를 이유로 네이티브 저작 기능을 제거하지 않는다.
- 문서 전체 Source 보기는 유지한다. 열린 네이티브 문서의 적용된 내용을 Core를 통해 읽기 전용 Markdown으로 확인·복사하는 기능이며, 열기를 거부한 문서를 보여 주는 용도로 확장하지 않는다.

### Marker and transition scope

- 표식은 유효한 YAML의 명시적인 메타데이터로 기록하고 Git에서 읽고 검토하기 쉬운 형태를 유지한다. MyST 기존 필드의 의미와 충돌하지 않아야 한다. 선택한 표식의 외부 검증 호환성과 알려진 경고를 확인하여 문서화한다.
- 이번 전환에서는 기존 이음독 문서 Migration, 일반 Markdown 자동 변환과 범용 Import를 제공하지 않는다. 표식만 자동으로 추가하는 전환 경로도 제공하지 않는다.
- 이 결정은 향후 실사용 문서의 버전 전환 정책을 영구적으로 금지하지 않는다. 범용 호환성과 Import도 별도의 후속 결정으로 남기며, 제공 시점을 약속하지 않는다.

## Rationale

지원하는 문서에서 일관된 생성·편집·저장·재열기를 보장하는 데 제품의 책임을 집중한다. 미지원 문서의 부분 편집과 읽기 전용 표시를 계속 제공하면 해당 구조의 보존, 표시 모델과 소스 교체 경로에 대한 책임도 남는다. 식별자 검사만 추가하고 이러한 기능을 모두 유지하는 방안은 채택하지 않는다.

표식은 지원 판정의 필요조건이며 내용 검증을 대신하지 않는다. 외부 수정이나 구현 결함으로 표식이 있는 문서에도 지원 밖 내용이 들어올 수 있다. 내부 parser가 문서 조각을 해석하는 능력과 제품이 외부 파일을 지원하는 약속을 구분하면, 기존 parser와 검증 기반을 재사용하면서 제품 경계를 Core에서 일관되게 적용할 수 있다.

호환성 경로를 정리하여 유지 부담을 줄이고 개발 속도를 높이는 것은 기대 효과다. 절감된 코드 규모나 개발 시간을 계측한 성과로 주장하지 않는다.

## Constraints

- [ADR-0002](0002-document-persistence-semantic-ownership.md)의 plain-text Markdown SSOT, Git diff 가독성, Core 의미 소유권, Editor·CLI 공통 계약, 의미 손실 없는 canonical write와 fail-closed 저장을 유지한다.
- 공식 생성물은 지원 연산과 저장·재열기 후에도 식별 표식과 문서 유효성을 유지해야 한다. 지원 범위 축소를 이유로 의미 손실 검사나 저장 안전성을 약화하지 않는다.
- [ADR-0001](0001-single-document-editor-architecture.md)의 단일 Tiptap/ProseMirror 편집 상태와 Core·Editor 경계를 유지한다. 새 parser, 영속 형식이나 편집 엔진을 도입하는 결정이 아니다.

## Consequences

- #234 구현에서 미지원 블록을 보존하면서 나머지를 편집하는 조항과 저장 불가 문서를 읽기 전용으로 여는 조항, 인터페이스·검증의 읽기 전용 수용 전제를 [Native document support의 Contract](../design/document-support-v1.md#contract)로 대체했다. [Block source editing](../design/block-source-editing-v1.md)의 Core·Editor·CLI 범용 교체 계약은 폐지되어 Superseded 상태다. 문서 전체 Source 확인과 공유 초안 보호는 유지한다.
- 이 ADR의 승인만으로 구현 완료나 당시 design 문서 전체의 폐기를 선언한 것은 아니다. 이후 #234에서 동작 변경과 함께 관련 계약과 검증을 갱신했다.
- 이 정책이 적용된 버전으로 업데이트하면 이전 버전이 만든 문서라도 식별 표식이 없으면 거부되며, 이번 전환에는 Migration이 없다는 점을 릴리스 노트에 명시한다. 공개 beta.3가 있다는 사실과 실사용 문서에 대한 사용자의 판단을 구분한다.
- [ADR-0004](0004-desktop-host-distribution.md)의 사용자 승인 기반 업데이트를 유지한다. 현재 `autoDownload=false`, `autoInstallOnAppQuit=false`이며 다운로드와 설치는 사용자가 승인한다. 자동 업데이트 확인이나 일반 종료를 설치 승인으로 해석하지 않는다.
- 배포 샘플은 네이티브 계약을 만족해야 한다. 사용자 폴더에 이미 복사된 기존 샘플을 조용히 덮어쓰거나 표식을 자동 추가하지 않는다. 기존 복사본의 구체적인 안내·제공 방식은 [현재 호환성 계약](../design/document-support-v1.md#canonical-output-and-compatibility)에 기록되어 있다.

## Evidence

2026-10-14, 기준 commit `2c05b52172e1871b00980b5db5931f0b6d0771a7`의 코드·계약을 읽고 메모리 내 검사를 수행했다. 아래는 현재 구현에 대한 관찰이며 새 지원 경계의 구현 완료 근거가 아니다.

- [문서 생성 Host](../../apps/editor/server/document-api.ts)는 `serialize(parse(""))` 결과를 새 파일에 쓰며, [현재 CLI](../../packages/cli/src/cli.ts)에는 문서 생성 명령이 없다. 네이티브 생성의 Core 소유권과 CLI 생성 경로를 구현해야 하는 근거다.
- 현재 의존성 `myst-parser 1.7.4`, `myst-frontmatter 1.10.1`, `myst-to-md 1.0.17`에서 시험용 `litzio: 1` frontmatter는 canonical 직렬화·재파싱과 제목 번호 변경 후에도 유지되었다. `validatePageFrontmatter`를 별도로 호출하면 알 수 없는 키 경고를 내고 검증 결과에서 제외했지만, 현재 [Core 저장 경로](../../packages/core/src/myst/serialize.ts)는 전체 frontmatter 스키마 검증을 호출하지 않으므로 저장은 성공했다. 외부 frontmatter 검증과 canonical writer 진단은 같은 경로가 아니다. 이는 표식 형식 채택이나 전체 외부 MyST 빌드 호환성을 보증하지 않는다.
- 같은 frontmatter에 `litzio: 1`과 `litzio: 2`를 함께 둔 입력도 현재 `canonicalWriteIssue`는 문제없음으로 판정했다. 동일 YAML에 대한 `yaml.parseDocument`는 중복 키 오류를 반환했다. 따라서 표식의 유효성은 별도로 검사해야 한다.
- [현재 Desktop 코드](../../apps/desktop/src/main.ts)는 사용자 데이터에 샘플 파일이 없을 때만 복사한다. [업데이트 설정](../../apps/desktop/src/update-policy.ts)은 자동 다운로드와 종료 시 자동 설치를 비활성화한다. beta.3 공개 배포와 당시 업데이트 실행 근거는 [릴리스 기록](../releases/v0.0.1-beta.3.md)에 있다.

## Non-decisions

다음은 design 계약과 구현에서 정하며 이 ADR에서 고정하지 않는다.

- 표식의 정확한 키·값·버전 표현
- 상세 지원 문법, 허용 속성과 중첩 형태
- API 배치, 공개 parser의 구체적인 역할, 함수명과 CLI 생성 명령 이름
- 오류 문구와 표시 형태
- 삭제할 파일·내부 helper 목록과 구현 순서
- 기존 샘플 복사본의 구체적인 안내·제공 방식

## Revisit Conditions

- 실사용 문서가 생긴 뒤 문서 계약 버전 전환과 Migration이 필요해지는 경우
- 외부 Markdown 반입에 대한 구체적인 제품 수요가 확인되는 경우
- 네이티브 기술문서 저작 요구를 현재 지원 구조로 표현할 수 없는 경우
- 선택한 식별 표식이 필요한 외부 MyST 도구와 충돌한다는 구체적인 근거가 생기는 경우

재검토 전까지 미지원 문서를 부분 편집으로 수용하거나 조용히 변환하는 경로를 추가하지 않는다.
