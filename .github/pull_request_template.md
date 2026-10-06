## 변경 내용

<!-- 무엇을 왜 바꾸는지. 관련 이슈가 있으면 `Closes #번호`. -->

## 검증

<!-- 실행한 명령과 결과(typecheck, test, browser:test 등). 실행하지 못한 검증은 이유와 함께 적습니다. -->

## Editor 화면이 바뀌는 경우

<!-- 해당 없으면 지웁니다. -->

- [ ] [Visual Language](../docs/design/editor-visual-language-v1.md)의 어느 규칙을 따르는지 적었거나, 같은 PR에서 문서를 갱신했다.
- [ ] 새 컨트롤·메타데이터는 평소 숨김 / 상호작용 시 표시 규칙을 따르고, chrome 위치를 움직이지 않는다.
- [ ] 손으로 조절하거나 사용자 취향에 따라 바뀔 값은 `styles/tokens.css`의 Adjustable values에 공용 변수로 두었다(Visual Language "Adjustable values and preferences").
- [ ] 같은 상태의 Before/After 캡처를 첨부했다(`pnpm browser:test quiet-document --screenshots`, 절차는 Visual Language의 "Reviewing a visual change").
