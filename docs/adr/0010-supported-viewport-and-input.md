# ADR-0010: 지원 화면 폭과 입력 방식

- Status: Accepted
- Last verified: 2026-10-27 (decision record only; code and contract alignment is tracked in [#602](https://github.com/ieumbird/ieumdoc/issues/602)).
- Authority: product decision under [AGENTS.md](../../AGENTS.md). Related: [#602](https://github.com/ieumbird/ieumdoc/issues/602), [#321](https://github.com/ieumbird/ieumdoc/issues/321), [#223](https://github.com/ieumbird/ieumdoc/issues/223), [Editor Layout Rules](../design/editor-layout-rules-v1.md).
- Decision date: 2026-10-27

## Context

Editor의 계약·테스트·코드는 휴대폰 폭(375·390·360px)과 터치 입력을 전제로 한 부분을 포함한다. 640px 미만에서 레일 없이 전체 화면을 덮는 사이드바(#321), 좁은 TopBar 행 배치, 브라우저 시나리오의 휴대폰 폭 검사, 작업 근거의 390px 캡처 요구, Desktop 창 최소 폭 360px가 그 예다.

소유자는 이음독을 휴대폰에서 사용할 계획이 없다. 대신 16:9 모니터의 절반이나 1/3처럼 좁은 데스크톱 창에서 쓸 가능성은 있다. 휴대폰 폭 지원은 UI 변경마다 추가 검증을 요구하고 간헐 실패의 원인이 되었다(예: PR #600 CI의 휴대폰 폭 인용 후보 목록 검사).

## Decision

1. **지원 대상은 데스크톱급 창이다.** 지원 최소 폭은 **640px**(1920×1080 모니터의 1/3)이다. 640px 이상에서는 모든 기능이 잘리지 않고 동작해야 한다. 640–960px 범위에서 의미 있는 기존 규칙(Outline 도킹, 좁은 사이드바, TopBar 두 줄 전환 등)은 유지한다.
2. **640px 미만은 지원하지 않는다.** 전용 레이아웃·계약·검증을 두지 않는다. 웹 Host에서 창이 더 좁아져도 화면이 깨질 수는 있지만 문서 데이터 손실은 없어야 한다. Desktop은 창 최소 폭으로 640px를 강제한다.
3. **입력은 키보드와 포인터(마우스·트랙패드)를 기준으로 한다.** 터치 전용 진입(길게 누르기 등)은 요구하거나 검증하지 않는다. 라이브러리 기본 동작을 일부러 막지는 않는다. 키보드 접근성은 계속 필수다.
4. **작업 근거의 좁은 폭 기준은 640px이다.** 시각 변경의 전후 근거는 1440px와 640px를 기본으로 한다.
5. **모바일은 실제 사용자가 확인될 때 별도 결정으로 시작한다.** 그때는 데스크톱 화면의 축소판이 아니라 읽기·가벼운 편집 등 모바일 사용 패턴에 맞는 별도 UX를 전제로 검토한다. 그 전에는 모바일 대비 작업을 계획하지 않는다.

## Consequences

- 휴대폰 폭 전용 코드 분기, 검사, 계약 문장, 390px 캡처 요구는 정리 대상이 된다(#602). 과거 검증 기록은 이력으로 남긴다.
- 문서 의미와 저장 형식은 Core에 있고 Editor는 웹 기술이므로, 이후 모바일 화면을 따로 만들더라도 Core·CLI·문서 형식은 그대로 재사용할 수 있다.
- 정리로 제거되는 휴대폰 전용 구현과 근거는 git 이력과 과거 캡처로 남아, 모바일을 다시 검토할 때 참고할 수 있다.
