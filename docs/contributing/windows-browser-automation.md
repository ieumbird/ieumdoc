# Windows browser automation

## 확인된 원인과 적용 범위

일부 Windows 환경에서는 설치형 Chrome을 새 임시 profile로 반복 실행할 때 로그온 실패가 누적되어 계정 잠금 정책에 도달할 수 있다. 프로젝트의 [PR #121](https://github.com/ieumbird/ieumdoc/pull/121)은 Chrome이 빈 암호 로그온으로 계정의 빈 암호 여부를 확인하고 결과를 profile에 캐시하는 경로를 재현했다. 새 profile은 이 확인을 다시 수행했다. 모든 Windows 설정에서 동일하게 잠긴다는 뜻은 아니다.

같은 PR에서 persistent profile을 재사용하면 최초 생성 이후 반복 실행의 실패 카운터가 증가하지 않는 것을 확인했다. 계정 정책 변경이나 비활성화로 우회하지 않고 profile을 재사용한다.

## 실행 규칙

- 프로젝트 검증은 `pnpm browser:test`를 사용한다. 실행 방법과 scratch fixture는 [검증 안내](../test/README.md)에 있다.
- runner는 `playwright-cli open --persistent`로 기존 세션 profile을 재사용한다.
- `playwright-cli`를 직접 사용할 때도 `open --persistent`로 연다. 디버깅 중 다시 접속할 때는 기존 session을 재사용한다.
- 기본 `open`의 새 임시 profile, 임시 `--user-data-dir`, 반복적인 Playwright `launch()`로 설치형 Chrome을 실행하지 않는다. 짧은 간격으로 새 Chrome을 여러 번 띄우지 않는다.
- 같은 checkout의 browser runner를 동시에 여러 개 실행하지 않는다.

## Profile reuse and test isolation

[현재 runner](../../apps/editor/test/browser/run.ts)는 실행 시작 시 cookie와 해당 origin의 `localStorage`/`sessionStorage`를 정리한다. Chrome의 profile 자체는 유지하면서 이전 실행의 문서 폭·최근 folder 같은 browser preference가 다음 실행의 초기 조건에 섞이지 않게 하기 위해서다. 개별 시나리오 안의 Reload와 storage persistence 검증은 유지한다. 테스트 격리를 이유로 매번 profile을 삭제해서는 안 된다.

## Process and session cleanup

runner는 `finally`에서 자신이 연 browser session을 닫는다. `pnpm editor` dev server는 별도로 시작한 프로세스이므로 검증·디버깅을 끝낸 사람이 종료한다. 직접 연 추가 session도 이름과 PID를 확인해 정리한다. profile 재사용과 실행 중인 프로세스 방치는 다른 문제다.

자신이 시작한 프로세스만 종료하며, 같은 이름이나 port의 다른 프로세스를 광범위하게 종료하지 않는다. 정리에 실패하면 남아 있는 process/session/port와 이유를 작업 결과에 기록한다. 전체 규칙은 [AGENTS.md](../../AGENTS.md#process-cleanup)를 따른다.
