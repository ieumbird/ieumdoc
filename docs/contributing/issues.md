# 이슈 작성

[새 이슈 작성](https://github.com/ieumbird/ieumdoc/issues/new/choose)에서
버그 보고, 기능 제안, 개발 작업 중 하나를 선택한다. 맞는 유형이 없으면 빈 이슈를 사용한다.

## 작성 원칙

- 하나의 문제나 함께 해결해야 하는 작업 범위를 기록한다.
- 문제 → 목표와 범위(또는 정리 방향) → 완료 기준 → 근거 흐름으로 간결하게 적는다.
- 초기 제보는 문제와 관측 근거만으로 등록할 수 있다. 해당하지 않거나 아직 판단할 수 없는 항목은 생략한다.
- 완료 기준은 구체적인 동작과 기대 결과로 적는다. 검증 방법과 지켜야 할 경계는 필요한 경우에만 덧붙인다.
- 코드 점검이나 재현 근거에는 확인한 commit과 코드·로그·화면 등의 자료를 남긴다.
  확인된 사실, 원인 가설, 미검증 사항을 구분하며 예상 개선을 측정 결과처럼 쓰지 않는다.
- 구현 방식은 조사 전에 확정하지 않는다. 관련 이슈와 선행 작업을 연결하고 범위가 겹치면 경계를 설명한다.

작성 예: [기능 개선 #40](https://github.com/ieumbird/ieumdoc/issues/40),
[유지보수 #45](https://github.com/ieumbird/ieumdoc/issues/45),
[원인 조사 #21](https://github.com/ieumbird/ieumdoc/issues/21).
제목의 분류 접두어, 체크리스트, 모든 항목의 작성을 강제하지 않는다.

## CLI / API에서 등록

`.github/ISSUE_TEMPLATE/`에서 해당 Markdown 템플릿의 YAML front matter를 제외한
본문을 사용한다. 안내 주석을 실제 내용으로 바꾸고 불필요한 항목을 제거한 뒤,
이슈 생성 도구에 `title`과 `body`를 전달한다. 라벨·담당자는 필요한 경우에만 지정한다.

GitHub CLI:

```powershell
gh issue create --repo ieumbird/ieumdoc --title "구체적인 작업 제목" --body-file issue-body.md
```

GitHub REST: `POST /repos/ieumbird/ieumdoc/issues`.
등록 성공 시 반환된 이슈 URL을 확인한다.
