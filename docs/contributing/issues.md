# 이슈 작성

[새 이슈 작성](https://github.com/ieumbird/ieumdoc/issues/new/choose)에서
버그 보고, 기능 제안, 개발 작업 중 하나를 선택한다.
한 이슈에는 하나의 문제나 작업을 기록하고, 범위와 완료 조건을 구체적으로 적는다.
템플릿이 맞지 않는 경우에는 빈 이슈도 사용할 수 있다.

## ChatGPT / API에서 등록

저장소 이름은 `ieumbird/ieumdoc`이다. `.github/ISSUE_TEMPLATE/`의 해당 Markdown
템플릿에서 YAML front matter를 제외한 본문을 작성한 뒤, 연결된 도구의 이슈 생성
기능에 `title`과 `body`를 전달한다. 라벨, 담당자, milestone은 필요한 경우만 지정한다.
등록 성공 시 반환된 이슈 URL을 보고한다. 실제 생성 호출이 실패했으면 오류를
그대로 구분해 보고하고 등록 완료로 표현하지 않는다.

GitHub REST 경로:

```text
POST /repos/ieumbird/ieumdoc/issues
```

로컬 GitHub CLI를 사용하는 경우:

```powershell
gh issue create --repo ieumbird/ieumdoc --title "구체적인 작업 제목" --body-file issue-body.md
```

## 연결 확인

이슈 템플릿은 작성 양식이며 외부 앱의 인증이나 쓰기 권한을 부여하지 않는다.

1. 외부 ChatGPT에 **이슈 생성 도구**가 제공되는지 확인한다. 검색/읽기 도구만
   제공되는 연결에서는 저장소 설정만으로 쓰기 기능을 추가할 수 없다.
2. GitHub App 방식이면 개인 계정과 조직 설치를 구분한다.
   [ieumbird 조직의 설치 설정](https://github.com/organizations/ieumbird/settings/installations)에서
   사용하는 앱이 `ieumdoc`에 접근할 수 있어야 한다.
3. GitHub App 또는 fine-grained token은 대상 저장소의 `Issues: write` 권한이 필요하다.
   조직 승인이나 SSO 승인이 필요한 연결이면 해당 절차도 완료한다.
4. 연결 변경 후 ChatGPT에서 사용 가능한 도구와 저장소 접근을 다시 확인한다.

`403 Resource not accessible by integration`이면 앱이 선언한 권한, 해당 조직에서
실제로 승인한 설치 권한, 요청에 쓰인 토큰의 권한을 구분해서 확인한다. ChatGPT의
`Allow all actions`는 GitHub에 없는 권한을 추가하지 않는다. 공개 저장소의 읽기
성공만으로 조직 설치나 `Issues: write` 승인이 확인된 것은 아니다.

토큰을 이슈 본문이나 저장소에 넣지 않는다. 연결 문제가 계속되면 사용한 앱/도구 이름,
대상 저장소, 오류 메시지와 HTTP 상태 코드를 확인한다. 이 저장소의 로컬 CLI로
등록할 수 있다는 사실만으로 별도 ChatGPT 세션의 권한까지 확인된 것은 아니다.

참고: [GitHub 이슈 생성 API와 필요한 권한](https://docs.github.com/en/rest/issues/issues#create-an-issue),
[이슈 템플릿 설정](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository).
