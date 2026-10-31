# Windows browser automation

## 확인된 원인과 적용 범위

일부 Windows 환경에서는 설치형 Chrome을 새 임시 profile로 반복 실행할 때 로그온 실패가 누적되어 계정 잠금 정책에 도달할 수 있다. 프로젝트의 [PR #121](https://github.com/ieumbird/ieumdoc/pull/121)은 Chrome이 빈 암호 로그온으로 계정의 빈 암호 여부를 확인하고 결과를 profile에 캐시하는 경로를 재현했다. 새 profile은 이 확인을 다시 수행했다. 모든 Windows 설정에서 동일하게 잠긴다는 뜻은 아니다.

같은 PR에서 persistent profile을 재사용하면 최초 생성 이후 반복 실행의 실패 카운터가 증가하지 않는 것을 확인했다. 계정 정책 변경이나 비활성화로 우회하지 않고 profile을 재사용한다.

## 실행 규칙

- 프로젝트 검증은 `pnpm browser:test`를 사용한다. 실행 방법과 scratch fixture는 [검증 안내](../test/README.md)에 있다.
- runner는 Playwright Test의 worker fixture에서 `chromium.launchPersistentContext`로 checkout별 고정 profile을 재사용한다. Windows에서는 설치형 Chrome을 사용하며 worker는 하나씩 실행한다. `LITZIO_BROWSER_CHANNEL=msedge`는 설치형 Edge를 선택하고 같은 checkout hash에 `-edge`를 붙인 고정 profile 하나를 재사용한다. 채널은 순차 실행한다.
- `playwright-cli`를 직접 사용할 때도 `open --persistent`로 연다. 디버깅 중 다시 접속할 때는 기존 session을 재사용한다.
- 기본 `open`의 새 임시 profile, 임시 `--user-data-dir`, 반복적인 Playwright `launch()`로 설치형 Chrome을 실행하지 않는다. 짧은 간격으로 새 Chrome을 여러 번 띄우지 않는다.
- 같은 checkout의 browser runner를 동시에 여러 개 실행하지 않는다.

## Profile reuse and test isolation

공통 `scenarios.spec.ts` persistent context는 `extraHTTPHeaders: { Connection: "close" }`를 사용한다.
Playwright의 Node 측 `page.request.*`와 `route.fetch()`가 Vite의 만료 직전 유휴 keep-alive
소켓을 재사용하는 경합을 피하기 위한 테스트 하네스 설정이다([#658](https://github.com/ieumbird/ieumdoc/issues/658)).
제품 Host와 Vite 서버 설정은 바꾸지 않으며 재시도·timeout 증가·HTTP 오류 단언 완화로 대신하지 않는다.
context 전체에 적용되므로 변경 시 실제 서버가 받은 두 Node 경로의 헤더, Chromium의 문서·asset·fetch
요청과 전체 suite의 shard별 실행 시간을 함께 확인한다. 고정 profile과 storage 격리는 그대로 유지한다.

[현재 browser fixture](../../apps/editor/test/browser/scenarios.spec.ts)는 worker 시작 시 cookie와 해당 origin의 `localStorage`/`sessionStorage`를 정리한다. Chrome의 profile 자체는 유지하면서 이전 실행의 문서 폭·최근 folder 같은 browser preference가 다음 실행의 초기 조건에 섞이지 않게 하기 위해서다. 각 시나리오 시작 시 열린 폴더·섹션 접힘·탭 환경설정을 지우고 복구 IndexedDB도 삭제한 뒤 다시 로드하여 이전 시나리오의 탐색 상태·복구 제안을 격리한다. HTTP/packaged Desktop 복구 검사도 최초 초기화에서만 탭 환경설정과 복구 DB를 정리하고, 같은 검사의 crash/restart에서는 보존한다. 개별 시나리오 안의 Reload와 storage persistence 검증은 유지한다. 테스트 격리를 이유로 매번 profile을 삭제해서는 안 된다.

시나리오 간 초기화는 같은 origin의 일회성 빈 페이지에서 수행한 뒤 실제 Editor를 로드한다. 이전 시나리오의 scratch 파일이 이미 지워졌어도 App이 이전 탭 경로를 읽기 전에 환경설정을 비울 수 있다. 실제 Editor 시작과 시나리오 내부 Reload의 콘솔·Host 응답 검사는 그대로 수행한다.

## Process and session cleanup

The production HTTP recovery test deliberately terminates its own browser process and launches a
new PID with the **same** checkout-owned profile and exact origin. It obtains that PID from its
own browser CDP session; Windows termination targets only that PID's tree. It does not clear storage
between crash/restart steps or restart the HTTP server. The normal fixture still isolates separate
tests. Packaged Desktop has its own fixed Electron test profiles and resets recovery only on a
test's first launch, preserving the record on subsequent launches within that test.

worker fixture는 `finally`에서 자신이 연 persistent context를 닫는다. Playwright의 `webServer`는 기본 URL에 서버가 없으면 직접 시작하고 종료한다. 로컬에 이미 실행 중인 `pnpm editor` 서버와 명시적으로 지정한 `LITZIO_BROWSER_URL` 서버는 caller 소유이므로 runner가 종료하지 않는다. CI는 기존 서버를 재사용하지 않는다. 직접 시작한 서버와 추가 CLI session은 이름과 PID를 확인해 정리한다. profile 재사용과 실행 중인 프로세스 방치는 다른 문제다.

자신이 시작한 프로세스만 종료하며, 같은 이름이나 port의 다른 프로세스를 광범위하게 종료하지 않는다. 정리에 실패하면 남아 있는 process/session/port와 이유를 작업 결과에 기록한다. 전체 규칙은 [AGENTS.md](../../AGENTS.md#process-cleanup)를 따른다.
