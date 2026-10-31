# 이슈 작성

- Status: Implemented
- Last verified: 2026-10-12 (공통 정의, 생성 폼·CLI·등록 후 검사 회귀). GitHub 폼과 자동 검사는 default branch 반영 후 활성화된다.
- Authority: [AGENTS.md](../../AGENTS.md). 이 문서가 사람이 읽는 계약이며 [공통 정의](../../scripts/issue-policy.mjs)가 폼·CLI·검사의 실행 기준이다.

## 제목과 분류

제목은 `영역: 구체적인 증상 또는 원하는 결과` 형식으로 쓴다. 영역은
`Editor`, `Desktop`, `Core`, `CLI`, `Host`, `Docs`, `Product` 중 하나다.
담당 영역을 모르는 제보나 아직 영역을 정하지 않은 제품 검토는 `Product`를 쓴다.
한국어를 기본으로 하며 고유명사·오류 원문은 보존한다.

```text
Editor: 문서 끝에서 작성할 때 커서 아래 여백이 부족함
Desktop: 일반 실행 시 샘플 문서가 자동으로 열림
Product: 비개발자용 Git 연동의 지원 여부와 사용자 경험 검토
```

유형·검토 시점은 `[UX]`, `[버그]`, `[향후 검토]` 같은 제목 접두어 대신 라벨로 표현한다.
제목에는 확인되지 않은 원인이나 구현 방식을 사실처럼 넣지 않는다.

| 분류 | 값 | 규칙 |
| --- | --- | --- |
| 유형 | `type:bug`, `type:enhancement`, `type:task`, `type:decision` | 정확히 하나. 사용자 불편 개선은 enhancement이며 계약을 위반한 오류만 bug로 분류한다. |
| 영역 | `area:editor`, `area:desktop`, `area:core`, `area:cli`, `area:host`, `area:docs`, `area:product` | 제목·본문 선택과 같은 영역 하나. 등록 후 검사도 이를 맞춘다. |
| 검토 상태 | `status:needs-decision`, `status:deferred` | decision의 상태가 각각 `결정 필요`, `향후 검토`일 때 적용한다. 등록이나 검사 통과는 구현 착수 승인이 아니다. |
| 보완 상태 | `status:needs-info` | 제목·유형·필수 정보 보완이 필요할 때 검사에서 적용하고 보완 후 제거한다. |

라벨 정의는 공통 정의에 있다. `pnpm issues:labels`로 미리 보고,
명시적으로 적용할 때만 `pnpm issues:labels --apply`를 실행한다. 기존의 다른 라벨은 삭제하지 않는다.

## 유형별 최소 정보

| 유형 | 필수 항목 (JSON fields 키) | 선택 항목 |
| --- | --- | --- |
| 버그 보고 | 문제 (`problem`), 발생 상황 / 근거 (`occurrence`), 기대 동작 (`expected`) | 환경 (`environment`), 근거 / 관련 자료 (`evidence`) |
| 개선·기능 제안 | 문제 (`problem`), 기대하는 사용 경험 (`experience`) | 근거 / 관련 자료 (`evidence`) |
| 개발 작업 | 문제 (`problem`), 목표와 범위 (`scope`), 완료 기준 (`completion`) | 근거 / 관련 자료 (`evidence`) |
| 지원 여부·설계 검토 | 검토 배경 (`background`), 결정할 사항 (`questions`), 검토 상태 (`state`) | 근거 / 관련 자료 (`evidence`) |

- 하나의 문제나 함께 해결해야 하는 범위를 기록한다.
- 알려진 발생 상황이나 사용자 보고는 근거로 쓸 수 있다. 재현하지 않았다면 명시한다. 원인·발생 빈도·환경·측정값을 추정해 채우지 않는다.
- 모르는 환경 정보는 생략한다. 필수 항목을 `미정`, `TODO`, 빈 문자열로 채우지 않고 어떤 사실이 알려졌고 무엇을 확인하지 못했는지 적는다.
- 별도 완료 기준은 범위가 정해진 개발 작업에서 요구한다. 단순 제안의 기대 동작을 체크리스트로 반복하지 않는다.
- 해결안·파일 목록·함수 설계·개발 단계·미래 테스트 계획을 자동으로 추가하지 않는다. 사용자가 명시한 방향과 이미 수행한 검증은 보존한다.
- decision은 구현 요청과 구분한다. 향후 검토라면 `state`를 `향후 검토`로 두고 필요한 분석과 계획을 결정할 사항에 적는다. 결론이 난 뒤 지원 여부와 이유를 기록하고 착수 작업은 별도로 정한다.

## 웹에서 등록

[템플릿 선택](https://github.com/litzio/litzio/issues/new/choose)에서 유형을 선택하고 영역과 최소 정보를 입력한다.
제목의 영역과 폼에서 고른 영역은 같아야 한다. 일반 사용자에게 빈 이슈 선택은 숨긴다.
GitHub 정책상 write 이상 권한 사용자는 빈 이슈를 만들 수 있으므로 이것만으로 모든 경로가 강제되지는 않는다.

[웹 폼](../../.github/ISSUE_TEMPLATE/)은 공통 정의에서 `pnpm issues:forms`로 생성한다.
폼을 직접 고치지 않는다. `pnpm issues:forms --check`가 정의와 폼의 drift를 검사한다.
GitHub 폼은 `###`, CLI는 `##` 제목을 출력하며 같은 필드 계약으로 검사된다.

## CLI / Agent에서 등록

제공받은 정보로 구조화된 JSON을 준비한다. `fields`의 키와 의미는 위 표를 따른다.
단순 개선 예:

```json
{
  "type": "enhancement",
  "area": "Editor",
  "summary": "입력 필드의 상태 표현을 명확히 개선",
  "fields": {
    "problem": "회색 입력란이 비활성 상태처럼 보인다는 사용자 보고가 있다.",
    "experience": "입력 가능한 필드를 읽기 전용·비활성 상태와 쉽게 구별할 수 있기를 원한다.",
    "evidence": "사용자 보고이며 실제 화면을 직접 재현하지 않았다."
  }
}
```

```powershell
pnpm issue:create --input issue.json
pnpm issue:create --input issue.json --publish
```

첫 명령은 네트워크 요청 없이 생성될 제목·본문·라벨을 출력한다.
`--publish`를 붙인 명령만 필수 정보 검사 후 `gh issue create`로 게시하고 실제 등록 결과를 확인한다.
대상 기본값은 `litzio/litzio`이며 다른 대상은 `--repo owner/repo`로 명시한다.
게시 성공 URL 이후 검증 오류가 나면 이미 생성된 이슈를 확인하고 중복 등록하지 않는다.

기존 이슈나 직접 만든 본문은 `{ "title": "...", "body": "...", "labels": ["type:enhancement"] }` JSON으로
`pnpm issues:check --input issue.json`에서 검사할 수 있다. 유형별 필수 제목과 정보는 동일해야 한다.
추가적인 근거·경계 섹션은 허용한다. CLI/API에서 직접 등록할 때도 유형·영역·검토 상태 라벨을 명시한다.
일반적인 이슈 작성 스킬보다 저장소의 제목·분류·최소 정보 규칙을 먼저 적용한다.

## GitHub 등록 후 검사

[Issue policy workflow](../../.github/workflows/issue-policy.yml)는 이슈 생성·제목/본문 편집·재열기·라벨 변경 후
현재 이슈를 다시 읽고 같은 공통 검사로 검증한다. 제목·본문·담당자·마일스톤을 자동으로 변경하지 않는다.
영역과 decision 상태 라벨을 맞추고 누락은 `status:needs-info`와 수정 안내로 표시한다.
안내는 이슈당 하나의 bot comment를 갱신하며 수정 후 검사 통과를 표시한다. 닫힌 이슈와 PR은 처리하지 않는다.
모든 GitHub 등록 경로에서 사전에 등록을 차단하는 기능은 아니다.

신규 이슈와 현재 열린 이슈부터 적용한다. 닫힌 과거 이슈의 형식을 일괄 변경하지 않는다.
기존 제보를 정리할 때 관찰 사실·미확인 사항·사용자의 범위와 관련 링크를 보존한다.

## 검증

```powershell
pnpm issues:forms --check
pnpm issues:test
pnpm docs:check
git diff --check
```

CI도 폼 drift와 필수 정보·미확인 근거·검토 상태·CLI 게시 전 거부·등록 후 안내/복구 동작을 검사한다.
이 검사는 이슈 내용의 진실성이나 사용자 경험의 타당성을 자동 판정하지 않는다.
