# 패키저용 브랜드 설정

- Status: Implemented
- Last verified: 2026-10-31 (#859; 로컬 타입·단위·Editor 빌드와 persistent Chrome의 한국어/영어 640px·1440px. 실제 두 브랜드 설치·플러그인 실행은 Windows CI 검사).
- Repository verification: 2026-10-31 (#860; `litzio/litzio` 기본값, 업데이트·릴리스 단위 검사와 전체 typecheck. 실제 패키징·업데이트는 필수 CI).
- Authority: [Discussion #856](https://github.com/litzio/litzio/discussions/856), [AGENTS.md](../../AGENTS.md), [Desktop 계약](../design/desktop-distribution-v1.md), [ADR-0012](../adr/0012-plugin-runtime-and-ui-contributions.md).

## 설정과 빌드

저장소 루트의 [brand.ts](../../brand.ts) 한 파일이 배포 제품의 이름과 식별자를 소유한다.
설정을 바꾼 뒤 CLI 또는 Desktop을 다시 빌드한다. 런타임 환경 변수로 브랜드를 전환하지 않는다.
공식 기본값은 한국어·영어 모두 **Litzio**다. 과거 Beta의 데이터·설정·복구 기록·플러그인 설치·업데이트 경로를 이전하거나 옛 이름을 alias로 제공하지 않는다.

| 설정 키 | 공식 기본값 / 용도 |
| --- | --- |
| `name.en`, `name.ko` | `Litzio`; 창·페이지 제목, 시작 화면, Sidebar와 번역 문구 |
| `icons.svg`, `icons.ico` | 저장소 루트 기준 원본/Windows 아이콘 경로; Editor와 패키저가 함께 사용 |
| `appId` | `io.github.litzio.litzio`; Windows 앱·NSIS 설치 식별자·CLI 소유권 |
| `appName` | `litzio`; 배포 manifest 이름, `%LOCALAPPDATA%\Programs\litzio` 기본 설치 폴더와 `litzio-updater` 캐시, 관리되는 sample 표식 |
| `executableName` | `Litzio`; EXE, uninstaller와 `Litzio-Setup-<version>.exe` |
| `protocol` | `litzio`; Desktop의 `litzio://app` origin |
| `folders.desktopData` | `litzio`; `%APPDATA%\litzio`의 설정·sample·로그·Chromium 저장소 |
| `folders.cli` | `litzio`; `%LOCALAPPDATA%\litzio\bin`의 opt-in CLI와 제거 진단 |
| `folders.shared`, `folders.plugins` | `.litzio`, `plugins`; 모든 같은 브랜드 Host의 `~/.litzio/plugins`, Docling 설정은 `~/.litzio/docling.json` |
| `cliCommand` | `litzio`; 생성 npm manifest의 bin, Desktop shim·충돌 탐지·도움말·버전 출력 |
| `storagePrefix` | `litzio`; localStorage 키와 `litzio-recovery` IndexedDB |
| `updates.repository` | 현재 `litzio/litzio`; 배포와 업데이트를 받는 GitHub 저장소 |
| `updates.channels.stable`, `.beta` | `latest`, `beta`; 업데이트 메타데이터 파일명. Stable/Beta의 semver 선택·다운그레이드 거부 정책은 고정 |
| `officialPluginsUrl` | `null`; 공식 목록이 아직 게시되지 않았음을 뜻함. 주소와 설치 UI는 후속 플러그인 설치 작업에서 사용 |

```powershell
pnpm install --frozen-lockfile
pnpm --filter @litzio/cli package
pnpm --filter @litzio/desktop package
```

이미지를 교체할 때 두 아이콘 경로를 설정하고 `pnpm --filter @litzio/desktop icons`로 설정된 SVG에서 ICO를 재생성할 수 있다.
SVG의 접근성 제목에도 해당 브랜드를 쓴다. 기본 SVG 제목은 Litzio다.
소스 개발용 `pnpm cli`는 고정 개발 도구 진입점이며, 배포 CLI 이름은 생성 manifest에서 정한다.

## 다른 브랜드와 함께 설치

별도 빌드는 표시 이름만 바꾸지 말고 `appId`, `appName`, `executableName`, `protocol`,
`folders.desktopData`, `folders.cli`, `folders.shared`, `cliCommand`, `storagePrefix`를 모두 별도로 지정한다.
플러그인 하위 폴더 이름이 같아도 공용 상위 폴더가 달라야 한다. 설치/폴더/명령 이름에는
경로 구분자나 shell·NSIS 구문을 넣지 않고, 앱 이름·명령·프로토콜에는 단순한 ASCII 식별자를 권장한다.
지원되는 Windows 파일명과 유효한 reverse-DNS 앱 ID를 사용한다.

`updates.repository`도 자신의 배포 저장소로 바꾼다. 공식판 주소를 그대로 사용하면
업데이트가 공식 설치 프로그램을 받을 수 있다. `latest`/`beta` 메타데이터 이름은 별도
저장소에서는 공유해도 되며, 바꾼 경우 빌드·게시·읽기가 같은 설정을 사용한다.
서명된 빌드는 자신의 인증서/게시자 설정과 기존 릴리스 검증 절차도 따라야 한다.
공식판의 배포·업데이트 저장소 기본값은 `litzio/litzio`다(#860). 과거 Beta의 업데이트 경로를 이전하거나 호환 alias를 제공하지 않는다.

기존 `LITZIO_PLUGINS_DIR`, `LITZIO_DOCLING_SETTINGS_FILE`, `--user-data-dir` 같은 명시적 운영자/테스트 경로는
기본값보다 우선한다. 두 브랜드를 의도적으로 같은 경로로 덮어쓰면 격리를 보장하지 않는다.

## 고정 내부 계약과 검증

`@litzio/*`, native `litzio: 1`, `@litzio/plugin-api`, worker API 1, UI API 1/React 19,
manifest 필드·route·bridge는 제품 브랜드로 바꾸지 않는다. 문서 Root에 생기는 비공개 staging `.litzio-plugin-*`와 미완료 표식 `.litzio-incomplete`도 고정 내부 식별자다. 공용 설치 폴더가 다른 브랜드라도 같은 문서 Root를 열 수 있으므로 서로의 미완료 산출물을 모두 차단한다. Core는 브랜드 설정을 import하지 않으며
사용자 진단도 제품명을 요구하지 않는 중립 문구를 사용한다. 문서 의미는 패키저 설정의 영향을 받지 않는다.
같은 공식 Docling worker/UI 번들이 다른 브랜드에도 설치·등록되어 실행된다.

필수 Windows CI는 `scripts/check-brand-build.ts`로 **brand.ts만** 대체한 테스트 제품을 빌드한다.
공식판과 대체판을 기본 경로에 실제로 함께 설치하고 두 프로세스를 동시에 실행하여 origin·데이터
분리, 한국어/영어 이름·CLI 명령, 아이콘·업데이트 설정과 공식 플러그인의 worker/UI 실행을 검사한다.
대체 설정에서도 기존 Stable/Beta 설치·업데이트, 전체 packaged 검사와 제거 회귀를 그대로 실행한다. 등록 조회는 표시 이름 prefix 대신 설정의 앱 ID에서 도출한 NSIS key를 사용한다. 두 설치를 제거하고 시작한 프로세스를 종료한다. `brand-config` artifact에는 작은 검증 JSON과 한국어
640px 캡처만 남긴다. 공개 GitHub 업데이트·서명 인증·사용자 PC의 수동 Windows 수용 검증을 대신하지 않는다.

릴리스 artifact는 최종 해시·버전·서명 검증을 마친 `verify-release.ts`의 파일 목록을 그대로 전달한다. 설치 프로그램·blockmap·설정된 현재 채널 manifest와 `win-unpacked/`만 포함하며 `latest.yml`/`beta.yml` 고정 glob을 쓰지 않는다.
