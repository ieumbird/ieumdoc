# Desktop shell spike v1

- Date: 2026-10-07
- Baseline: `7779f61` (master). 보존 태그: `archive/desktop-shell-spike` (`spikes/desktop-shell/`, 실험 브랜치 `spike/desktop-shell`). 제품 구현 또는 release가 아니다.
- Environment: Windows 11, Electron 44.5.1, electron-builder 26.15.3 (`portable` target, x64).
- Question: 현재 Vite Editor와 local Host를 새 애플리케이션 아키텍처가 아니라 얇은 Electron shell로 감싸, 설치 없이 실행되는 exe 하나로 배포할 수 있는가. 포트를 열지 않고 기존 Host 경계를 그대로 쓸 수 있는가.
- Status: 판정 입력. 배포 Host 결정이나 ADR이 아니다. [VS Code host spike](vscode-host-spike-v1.md)와 함께 본다.

## Shape

- Editor: 변경 없음. `vite build --base /` 결과를 그대로 싣는다. Open, Open folder, New, folder sidebar도 그대로 쓴다.
- Host: 변경 없음. Electron main이 custom protocol `ieumdoc://app`을 등록하고, `/api/*`와 `/document/*` 요청을 기존 `handleDocumentRequest`와 `handleAssetRequest`에 넘긴다. fetch `Request`를 handler가 읽는 Node request/response 모양으로 바꾸는 adapter만 있다. TCP 포트가 없다.
- Shell(`src/main.ts`, 약 150줄): `contextIsolation`, `sandbox`, preload 없음. 다른 origin으로의 navigation과 새 창을 막고 http(s) 링크는 시스템 브라우저로 연다. Reload/DevTools 단축키가 있는 기본 메뉴를 없앤다. 첫 문서는 `.md` 인자, 없으면 profile의 sample 사본이다.
- 미저장 보호: Editor의 `beforeunload`를 Electron이 대화상자 없이 막기 때문에, shell이 `will-prevent-unload`에서 확인 창을 띄운다.

## Result

`release/win-unpacked`를 Playwright로 실행한 시나리오는 모두 통과했다.

| Scenario | Result |
| --- | --- |
| Sample 열기 | 열림. 상대 경로 Figure 이미지(`./diagram.svg`) 표시 |
| Open으로 다른 `.md` 열기, 편집, Ctrl+S | 디스크에 저장. Figure 표시 |
| PNG 붙여넣기 | 문서 옆 `assets/`에 PNG 생성, 이미지 표시 |
| 미저장 상태로 창 닫기 | shell이 확인(자동화에서는 "머무름" 응답), 창 유지 |
| Save 후 New로 새 파일 만들기 | 저장된 문서에 `./assets/image-…` 경로, 새 파일 생성 |
| Open folder | 폴더 목록에 문서 표시 |

## Measurements

| Item | Value |
| --- | --- |
| 단일 exe | 101 MB, 서명 없음(`NotSigned`) |
| 단일 exe 실행부터 창 표시까지 | 약 5.7–6.0초, 매 실행 |
| 실행마다 `%TEMP%` 사용 | 약 840 MB(풀린 앱 371 MB + NSIS 작업 파일 468 MB). 정상 종료 시 삭제 |
| 미리 풀어 둔 폴더(`win-unpacked`) | 372 MB, 73 files. 창 표시까지 0.2–0.3초 |
| 열린 TCP 포트(직접 실행) | 0 |
| 프로세스 | 5 (main, GPU, network, renderer 등) |
| 패키징 시간 | 약 110초 |

Playwright로 실행할 때 보이는 `127.0.0.1` listening socket 2개는 자동화가 붙이는 `--inspect=0`, `--remote-debugging-port=0` 때문이며, 직접 실행에서는 없다.

## Findings

### 1. 코드 측면의 "얇은 shell"은 성립한다

- Editor와 Host 코드를 고치지 않았다. 새로 쓴 것은 protocol 등록, request adapter, 창·탐색 정책, 미저장 확인뿐이다.
- VS Code spike와 비교하면, VS Code는 Host client 정리, 저장 진입점 통일, 미저장 상태 protocol, media URI, 겹치는 shell 제거가 필요했다. Desktop shell은 현재 Editor의 shell과 Host 계약을 그대로 쓴다.
- custom protocol은 이 앱의 창 안에서만 보이므로 localhost HTTP의 노출(다른 로컬 프로세스, DNS rebinding, DLP/EDR의 localhost 차단)이 없다. Host가 받는 경로 검증은 현재 dev server와 같다.

### 2. 단일 exe의 비용은 시작 시간과 임시 디스크다

- `portable` target은 실행할 때마다 앱 전체를 `%TEMP%`에 풀고 시작한다. 매번 약 6초와 약 840 MB를 쓴다. 비정상 종료 시 잔여물이 남는지는 확인하지 않았다.
- 같은 앱을 한 번 풀어 둔 폴더로 배포하면 0.2–0.3초에 뜬다. 단일 파일이 아니라는 점과 시작 시간을 맞바꾸는 선택이다(zip 배포 또는 관리자 권한이 필요 없는 per-user 설치).
- 회사 PC의 백신이 매 실행마다 풀린 371 MB를 검사하면 시작 시간은 더 늘 수 있다. 측정하지 않았다.

### 3. 남은 결정은 코드가 아니라 배포·운영이다

- 서명: exe는 서명되지 않았다. 인터넷에서 받은 파일(Mark-of-the-Web)의 SmartScreen 경고와 회사 정책의 차단 여부는 확인하지 않았다. 회사 PC에서 확인이 필요하다.
- 업데이트: portable exe에는 자동 업데이트가 없다. 사용자가 파일을 바꿔야 한다.
- Electron 추적: Chromium 보안 업데이트를 따라 주기적으로 다시 빌드·배포해야 한다. sdoc ADR-0014가 Desktop을 중단한 반복 비용과 같은 성격이다.
- 아키텍처: 채택하면 `apps/editor/server`가 dev adapter에서 제품 Host가 된다. AGENTS.md와 `filesystem-host-boundary-v1.md`의 현재 전제를 바꾸므로 ADR이 필요하다. dev server의 Vite 결합(`configureServer`, `ssrLoadModule`)은 spike처럼 handler를 직접 부르는 진입점으로 대체된다.

### Not verified

- 실제 확인 창의 모양과 문구(자동화는 환경 변수로 응답했다).
- `.md`를 exe에 끌어다 놓아 여는 경로. 인자를 넘긴 실행에서 창이 뜨는 것만 확인했다.
- 고해상도 화면, 여러 창, 같은 파일을 두 창에서 여는 경우, 비정상 종료 뒤 `%TEMP%` 정리.
- npm install에서 Electron postinstall이 실행되지 않아 `node node_modules/electron/install.js`를 직접 실행했다.

## Reproduce

`archive/desktop-shell-spike`를 checkout하고 `pnpm install --frozen-lockfile` 뒤에 실행한다.

```bash
cd spikes/desktop-shell
npm install
node node_modules/electron/install.js   # postinstall이 실행되지 않은 경우
node build.mjs
npx electron-builder --win portable --x64
node drive.mjs                          # release/win-unpacked을 Playwright로 실행
```

단일 exe는 `release/IeumDoc-Spike-portable.exe`다. 기본 profile은 `%APPDATA%\IeumDoc Spike`이며 sample 문서가 그 아래에 복사된다. `--user-data-dir=<folder>`로 다른 위치를 쓸 수 있다.
