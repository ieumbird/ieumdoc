# Contributing to IeumDoc

## Project status

IeumDoc은 **초기 Beta** 단계다. Windows x64 unsigned [v0.0.1-beta.2](https://github.com/ieumbird/ieumdoc/releases/tag/v0.0.1-beta.2)이 공개되었고 Stable은 아직 없다. 일반 사용자 설치는 [README](README.md#windows-desktop), 개발자 빌드와 릴리즈는 아래 절차를 따른다. Visual Editor의 Vite 개발 실행도 유지한다. 공개 API와 문서 지원 범위는 바뀔 수 있다.

## Development requirements

- Node.js `>=24.21.0 <25`
- pnpm `12.5.1` (`package.json`의 `packageManager`)

## Setup

저장소 루트에서 실행한다.

```bash
pnpm install --frozen-lockfile
pnpm docs:check
pnpm typecheck
pnpm test
pnpm --filter @ieumdoc/editor build
```

`pnpm editor`로 개발용 Visual Editor를 시작하고 `http://127.0.0.1:5173`을 연다. 별도 터미널의 `pnpm browser:test`가 실행 중인 dev server에 접속한다. 선택 실행과 수동 확인은 [검증 안내](docs/test/README.md), Windows의 profile/session 규칙은 [Windows browser automation](docs/contributing/windows-browser-automation.md)을 따른다. 작업 후 직접 시작한 서버와 세션을 정리한다.

## Before changing code

[AGENTS.md](AGENTS.md), [문서 색인](docs/README.md), 관련 Accepted ADR과 Implemented design contract를 먼저 읽는다. 상태와 충돌 판정은 [문서 거버넌스](docs/contributing/documentation-governance.md)를 따른다.

## Architecture boundaries

- 영속적인 문서 의미 변경은 editor-neutral Core operation이 소유한다. 새로운 주요 operation은 얇은 CLI command로도 제공하며, 생략하면 이유를 기록한다.
- Editor는 Markdown 의미를 따로 구현하지 않고 Core의 read model과 operation을 사용한다. CLI도 얇은 인터페이스로 유지한다.
- Tiptap/ProseMirror 타입과 문서 모델은 `apps/editor` 안에 둔다. 하나의 문서 편집 상태를 사용한다.
- `apps/editor/server`의 stateless 파일 handler는 개발 adapter와 Desktop Host가 공유한다. 제품 backend나 장기 persistence 결정으로 확대하지 않는다.
- 지원하지 않는 의미를 보존할 수 없으면 공식 write path는 fail-closed로 거부한다.

상세 제약은 [AGENTS.md](AGENTS.md#architectural-constraints)와 [ADRs](docs/README.md#architecture-decisions)가 기준이다.

## Contribution workflow

- 하나의 문제에 하나의 응집된 PR을 만든다. 관련 issue가 있으면 연결한다.
- 가장 작고 단순한 변경을 우선하고, 확인되지 않은 필요를 위한 abstraction이나 infrastructure를 추가하지 않는다.
- current behavior를 바꾸면 관련 design document도 같은 PR에서 갱신한다. 새 문서는 [docs index](docs/README.md)에 직접 연결한다.
- historical review의 당시 결과를 현재 계약처럼 고쳐 쓰지 않는다. 상태와 현재 authority를 링크한다.
- 실패 원인을 숨기거나 테스트 기준을 약화해 통과시키지 않는다.

## Verification matrix

변경의 고유한 위험에 맞게 검증한다. 모든 변경에 전체 browser suite를 요구하지 않는다. 아래 최소 검증과 별개로 PR의 필수 CI 검사는 통과해야 한다.

| Change type | Required verification |
| --- | --- |
| Documentation only | `pnpm docs:check`, `git diff --check` |
| Core semantics | Core tests, `pnpm typecheck`, 관련 canonical round-trip/거부 regression |
| CLI | Core/CLI tests, `pnpm typecheck`, 실제 파일 write 및 실패 시 원본 보존 |
| Editor logic | Editor tests, `pnpm typecheck`, `pnpm --filter @ieumdoc/editor build` |
| Host/save behavior | 관련 browser regression과 실제 파일 Save → Reload/충돌 검증 |
| Visual change | `layout-rules` / `quiet-document` 검사와 같은 상태의 Before/After 근거 ([절차](docs/design/editor-visual-language-v1.md#reviewing-a-visual-change)) |
| Dependency change | frozen install, audit/reachability 검토, 영향받는 계층의 전체 관련 regression |
| Desktop/update/release | Desktop tests/typecheck, clean Windows package + artifact verification, packaged regression; updater/installer 변경은 actual install/update regression도 실행 |

문서 checker를 바꾸면 `pnpm exec tsx --test scripts/check-docs.test.ts`도 실행한다. 검증 명령의 자세한 사용법은 [검증 안내](docs/test/README.md)에 있다.

## Windows Desktop builds and releases

Windows에서 아래 명령으로 로컬 개발용 installer를 만든다. 빌드 산출물은 `apps/desktop/build/`와 `apps/desktop/release/`이며 Git에 포함하지 않는다. `package`는 generated release 폴더를 비우고 빌드하며, 항상 `publish: never`다.

```bash
pnpm --filter @ieumdoc/desktop package
pnpm --filter @ieumdoc/desktop exec tsx scripts/verify-release.ts --tag v0.0.1-beta.2
pnpm --filter @ieumdoc/desktop test:packaged
```

`--tag`에는 `apps/desktop/package.json`의 실제 버전을 사용한다. `pnpm --filter @ieumdoc/desktop start`는 먼저 `build`한 staging app을 실행한다. 설치·업데이트 E2E는 [검증 안내](docs/test/README.md#windows-desktop-regression)의 사용 조건을 먼저 확인한다.

공개 버전은 `0.0.1-beta.2`이며 Stable 공개는 보류한다. Beta 설치본의 최초 실행 기본 채널은 Beta, Stable 설치본은 Stable이다. 유효하게 저장된 사용자 선택은 버전이 바뀌어도 유지한다. Beta는 제한된 unsigned 게시 모드를 사용할 수 있으며 Stable은 서명된 릴리즈 절차만 허용한다.

일반 PR/push CI는 unsigned installer를 Artifact로 제공하며 게시 권한이나 release job이 없다. 첫 beta.1은 CI 자산을 별도로 검증하여 수동 공개했다. 다음 Beta부터는 [Desktop release workflow](.github/workflows/desktop-release.yml)를 master에서 수동 실행한다.

| Mode | 동작 |
| --- | --- |
| `verify` (기본) | 태그·빌드·테스트·자산 검증/Artifact만 실행. 게시하지 않음 |
| `unsigned-beta` | 정확한 `vX.Y.Z-beta.N`만 신규 Prerelease로 공개. 인증서 불필요; Stable은 차단 |
| `signed` | 기존 Authenticode 인증서/publisher 검증을 통과한 Stable 또는 Beta만 공개 |

컨트롤러는 dispatch의 master SHA에서 실행하며, tag 코드 실행 전에 기존 tag와 master ancestry·Desktop 버전을 검증한다. 검증한 commit SHA로 빌드하고 게시 직전 remote tag도 재확인한다. Installer/app의 전체 PE FileVersion, metadata 버전·파일명·SHA-512·크기, builder로 재계산한 blockmap을 검증한다. Beta는 `prerelease=true`, `latest=false`, `beta.yml`만 공개한다.

게시 job만 `contents: write`를 가지며 `desktop-release` environment를 사용한다. 2026-10-12 게시 승인 후 실제 저장소 설정에서 required reviewer `SWBaek`와 `master` branch 배포 제한을 설정하고 API로 확인했다. 개인 운영을 위해 self-review는 허용하며 GitHub의 관리자 bypass도 허용된 설정이다. 이번 게시는 required reviewer 승인으로 진행했다. 이름을 YAML에 적는 것만으로 승인이 강제되지는 않으므로, 다음 게시 전에도 실제 보호 규칙을 확인해야 한다. Signed 모드는 이 환경에 `WINDOWS_CSC_LINK`(PFX/인증서 참조), `WINDOWS_CSC_KEY_PASSWORD`도 필요하다. 인증서/키/토큰은 source에 넣지 않는다. 환경·secret 설정과 workflow 실행은 명시적 승인 범위에서 수행한다.

인증된 paginated Release 목록에서 기존 공개 Release와 Draft를 모두 거부한다. 생성 응답의 ID로 새 Draft에 세 자산을 올리고 서버의 정확한 자산 집합·uploaded 상태·size·SHA-256·tag/channel을 확인한 뒤 마지막 요청으로 공개한다. 업로드/검증 실패는 Draft로 남기고 자동 삭제·덮어쓰기·재시도하지 않는다. 마지막 공개 요청의 응답이 소실되면 공개 여부를 확인해야 하므로 `Publication confirmation required`와 ID를 보고한다.

다음 Beta 발행 순서: 버전 변경과 로컬 후보 검증 → 명시적 원격 승인 → 변경 push/CI/master 반영 → 실제 환경 보호 확인 → 검증된 master commit에 해당 버전 tag 게시 → master에서 해당 tag와 `unsigned-beta` 또는 `signed`로 수동 실행 → 모든 빌드·테스트·자산 검증 성공 확인 → 대기 중인 `desktop-release` 게시 job 승인 → 공개 결과와 [실제 GitHub 업데이트 검증](docs/test/README.md#real-github-beta-update) 확인 → README의 공개 버전과 릴리즈 기록 갱신. 게시 모드도 전체 검증을 실행하므로 동일 후보의 `verify`와 게시 빌드를 연속으로 반복할 필요는 없다. 게시 여부를 결정하기 전 산출물만 검토하려면 `verify`를 사용한다. beta.2의 현재 결과는 [릴리즈 기록](docs/releases/v0.0.1-beta.2.md), 동작 계약은 [Desktop contract](docs/design/desktop-distribution-v1.md)를 참고한다. 이미 공개된 tag나 자산은 재작성하지 않는다.

Unsigned Beta의 SHA-512/SHA-256은 무결성 검증이다. 악의적인 게시자가 파일과 manifest를 함께 바꾸는 경우에 대한 게시자 인증이 아니다. Unsigned 경로는 Authenticode 인증을 제공하지 않으며, Signed 경로의 인증서 검증을 해제하지 않는다.

## Issue and PR guidance

[이슈 작성 안내](docs/contributing/issues.md), [issue templates](.github/ISSUE_TEMPLATE/), [PR template](.github/pull_request_template.md)을 사용한다. 실행한 검증과 결과, 실행하지 않은 검증의 이유를 PR에 기록한다.

## AI commit provenance

AI가 주로 구현한 commit은 실제 구현 agent와 실제 model의 canonical identifier를 `AI-Agent`, `AI-Model` trailer에 각각 기록한다. 모델 이름을 추측하거나 이전 commit에서 복사하지 않는다. `Co-authored-by`는 대체물이 아니며, 검토 모델은 구현 모델로 기록하지 않는다. 선택적인 `AI-Reviewed-By`를 포함한 전체 계약은 [AGENTS.md](AGENTS.md#ai-commit-provenance)를 따른다.

## License of contributions

By submitting a contribution, you agree that it may be distributed under the [MIT License](LICENSE) used by this repository.
