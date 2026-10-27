# Contributing to IeumDoc

## Project status

IeumDoc은 **초기 Beta** 단계다. Windows x64 unsigned [v0.1.0-beta.1](https://github.com/ieumbird/ieumdoc/releases/tag/v0.1.0-beta.1)가 공개되었고 Stable은 아직 없다. 일반 사용자 설치는 [README](README.md#windows-desktop), 개발자 빌드와 릴리즈는 아래 절차를 따른다. Visual Editor의 Vite 개발 실행도 유지한다. 공개 API와 문서 지원 범위는 바뀔 수 있다.

## Development requirements

- Node.js `>=24.21.0 <25`
- pnpm `12.5.1` (`package.json`의 `packageManager`)

## Setup

저장소 루트에서 실행한다. 아래는 전체 확인 명령이며, 작업별 로컬 필수 검증은 [Verification matrix](#verification-matrix)를 따른다.

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
- `apps/editor/server`의 stateless 파일 handler는 Vite, Desktop, HTTP Host가 공유한다. 제품 backend나 장기 persistence 결정으로 확대하지 않는다.
- 지원하지 않는 의미를 보존할 수 없으면 공식 write path는 fail-closed로 거부한다.

상세 제약은 [AGENTS.md](AGENTS.md#architectural-constraints)와 [ADRs](docs/README.md#architecture-decisions)가 기준이다.

## Contribution workflow

- 하나의 문제에 하나의 응집된 PR을 만든다. 관련 issue가 있으면 연결한다.
- `master`는 repository ruleset `Protect master` (ID `24910269`)로 보호한다. 2026-10-26에 읽기 전용 API로 확인한 설정은 active, bypass 대상 없음, GitHub required approval count 0, `required_review_thread_resolution=true`다. 직접 push, force push, 삭제는 거부되고 PR은 아래 merge queue 절차로 병합한다. Queue와 필수 검사 설정은 [Enqueue](#enqueue)를 따른다. 규칙을 바꿀 때는 API로 확인하고 이 설정 기록도 함께 갱신한다.
- 가장 작고 단순한 변경을 우선하고, 확인되지 않은 필요를 위한 abstraction이나 infrastructure를 추가하지 않는다.
- current behavior를 바꾸면 관련 design document도 같은 PR에서 갱신한다. 새 문서는 [docs index](docs/README.md)에 직접 연결한다.
- historical review의 당시 결과를 현재 계약처럼 고쳐 쓰지 않는다. 상태와 현재 authority를 링크한다.
- 실패 원인을 숨기거나 테스트 기준을 약화해 통과시키지 않는다.

### Review and sequential merge

모든 PR은 다음 순서를 따른다. 구현은 독립 worktree에서 병렬로 진행할 수 있으며, 통합 담당자가 승인된 PR을 GitHub merge queue에 넣는다. Queue가 최신 master와 앞선 PR을 합친 결과를 검증하고 순서대로 병합한다. Queue는 2026-10-26부터 활성화되어 있다([#537 검증 기록](https://github.com/ieumbird/ieumdoc/issues/537)).

1. PR의 정확한 현재 head에서 필수 CI 검사가 모두 통과해야 한다. 이전 head의 성공으로 대신하지 않는다. master가 이동했다는 이유만으로 최신 master를 PR branch에 직접 merge하거나 다시 검토받을 필요는 없다.
2. 구현에 참여하지 않은 별도 agent가 최종 diff, 관련 계약과 검증 근거를 독립 검토한다. PR 댓글에 reviewer agent 식별자, `APPROVE` verdict와 검토한 정확한 전체 head SHA를 기록한다. 구현자 자신의 판단은 이 승인을 대신하지 않는다.
   승인 전에 [Git parsed-trailer 검사](#ai-commit-provenance)로 PR 고유 commit 전체(작성된 merge 포함)의 provenance와 같은 head의 CI 검사 통과를 확인한다.
3. GitHub required approval count 0은 GitHub 서버의 승인 수 설정이며, 별도 agent 승인을 생략한다는 뜻이 아니다. 같은 GitHub 계정을 사용하는 agent는 PR 작성자 자신의 PR에 GitHub approve review를 제출할 수 없다. PR 댓글의 독립 승인 기록은 운영상 승인 근거이며 GitHub의 approved review로 계산되지 않는다.
4. 통합 담당자는 enqueue 직전에 PR head가 독립 승인 SHA와 같은지, 해당 head의 필수 CI가 모두 통과했는지, review thread가 모두 해결되었는지 확인한다. 하나라도 충족하지 않으면 queue에 넣지 않는다. Queue는 최신 master와 합친 결과에서 전체 CI와 필수 aggregate 검사를 실행한다.
5. 수정 commit, 수동 conflict 해결, queue가 보고한 충돌 때문에 필요한 master merge 등으로 PR head SHA가 달라지면 기존 승인은 재사용하지 않는다. 새 head에서 필수 CI와 별도 agent의 새 `APPROVE`를 받은 뒤 통합 담당자가 다시 enqueue한다. Queue 실패도 일반 CI 실패처럼 artifact부터 확인하여 원인을 조사한다. PR head가 그대로라면 master 이동이나 queue 재구성만으로 독립 재승인을 요구하지 않는다.

### Enqueue

Ruleset `Protect master`의 `merge_queue` 설정은 merge method `MERGE`, build concurrency 1, group size 최소/최대 1/1, `ALLGREEN`, check timeout 60분이다. 필수 검사는 `Core, CLI, Editor, and browser regressions`이며, queue가 켜져 있는 동안 strict up-to-date (`strict_required_status_checks_policy`)는 OFF다. Queue를 비활성화할 때는 strict를 다시 ON으로 설정한다.

위 2단계의 독립 승인 PR 댓글은 다음 형식으로 남긴다.

```text
Reviewer agent: <reviewer-agent-id>
Verdict: APPROVE
Head SHA: <full-approved-head-sha>
Required CI: PASSED
Unresolved review threads: NONE
```

위 4단계 확인 후 저장소 루트에서 아래 Bash 명령의 `<N>`과 `<approved-sha>`를 PR 번호와 승인된 전체 head SHA로 바꿔 실행한다. `expectedHeadOid`가 승인 이후 head 변경을 거부한다. `gh pr merge`는 이 저장소에서 허용하지 않는 auto-merge (`enablePullRequestAutoMerge`)를 시도하므로 사용하지 않는다.

```bash
id=$(gh pr view <N> --json id --jq .id)
gh api graphql -f query='mutation($id:ID!,$oid:GitObjectID!){enqueuePullRequest(input:{pullRequestId:$id,expectedHeadOid:$oid}){mergeQueueEntry{position state}}}' -f id="$id" -f oid=<approved-sha>
```

Queue의 PR 번호·순서·상태·검증 head와 `merge_group` 실행은 다음 읽기 전용 명령으로 확인한다. Queue의 `headCommit.oid`와 run의 `headSha`를 대조하고 해당 실행의 결과·artifact를 확인한다.

```bash
gh api graphql -f query='query{repository(owner:"ieumbird",name:"ieumdoc"){mergeQueue(branch:"master"){entries(first:100){nodes{position state pullRequest{number} headCommit{oid}}}}}}'
gh run list --event merge_group --json databaseId,headSha,status,conclusion,url
```

충돌이나 CI 실패로 PR이 queue에서 제거되면 해당 실행의 로그·artifact부터 조사한다(`gh run view <run-id>`, `gh run download <run-id>`). 재등록은 위 4–5단계를 따른다. Head를 수정해야 하면 새 head의 필수 CI와 새 `APPROVE`를 받은 뒤 다시 enqueue한다.

## Verification matrix

로컬에서는 변경의 고유한 위험에 맞는 관련 패키지 테스트·browser 시나리오를 지정해 실행한다. 영향 범위가 여러 계층에 걸치는 경우가 아니면 전체 `pnpm test`와 전체 `pnpm browser:test`는 로컬 필수가 아니다. 아래 표는 로컬 최소 검증이며, PR의 필수 CI 검사는 모두 통과해야 한다.

CLI/Desktop `package`, `test:packaged`, release/artifact 검증, 설치·업데이트 회귀와 다른 OS 검증은 해당 패키징·설치/업데이트·배포 경계를 변경한 경우가 아니면 필수 CI에 맡긴다. [CI](.github/workflows/ci.yml)는 항상 quality를 실행한다. 문서 전용 PR에서는 문서 검사·checker 테스트, diff/whitespace, issue forms·등록 정책, AI provenance 회귀·실제 PR commit 검사와 CI 경로 분류 테스트만 실행한다. 나머지 PR과 `master` push, `merge_group`에서는 전체 제품 테스트·typecheck·Editor build도 실행한다. `merge_group`은 paths-filter 없이 browser 4개 shard, HTTP 양쪽 OS, Desktop package·설치/업데이트를 모두 실행한다. PR의 추가 job은 아래 경로 요약으로 선택한다. 실제 GitHub 업데이트·서명·수동 확인은 이 CI의 보장 범위가 아니므로 해당 변경·릴리즈의 별도 절차를 유지한다.

| Change type | Required verification |
| --- | --- |
| Documentation only | `pnpm docs:check`, `git diff --check` |
| Issue forms / registration tooling | `pnpm issues:forms --check`, `pnpm issues:test`, `pnpm docs:check`, `git diff --check` |
| Commit provenance tooling / policy | `node --test scripts/commit-provenance.test.mjs`, `pnpm docs:check`, `git diff --check`; 실제 commit의 Git parsed trailers 확인 |
| CI quality 경로 / browser shard 설정 | `node --test scripts/ci-quality-mode.test.mjs`, `pnpm --filter @ieumdoc/editor exec tsx --test test/browser-fixtures.test.ts`, `pnpm docs:check`, `git diff --check`; PR의 실제 shard CI 결과 확인 |
| Core semantics | Core tests, `pnpm typecheck`, 관련 canonical round-trip/거부 regression |
| CLI | Core/CLI tests, `pnpm typecheck`, 실제 파일 write 및 실패 시 원본 보존 |
| Editor logic | Editor tests, `pnpm typecheck`, `pnpm --filter @ieumdoc/editor build` |
| Host/save behavior | 관련 browser regression과 실제 파일 Save → Reload/충돌 검증 |
| HTTP Host / CLI distribution | 관련 HTTP boundary tests와 production `pnpm browser:test http-host` (실제 Save → Reload/충돌). 공유 handler 변경은 관련 handler tests와 Vite browser 회귀도 로컬 실행하며 Desktop packaged 회귀는 CI에 맡김. CLI 배포 경계 변경 시 CLI package + offline `test:packaged`도 로컬 실행; Windows/Linux 검증은 CI |
| Visual change | `layout-rules` / `quiet-document` 검사와 같은 상태의 Before/After 근거 ([절차](docs/design/editor-visual-language-v1.md#reviewing-a-visual-change)) |
| Dependency change | frozen install, audit/reachability 검토, 영향받는 계층의 전체 관련 regression |
| Desktop/update/release | 관련 Desktop tests/typecheck·browser 회귀. 패키징·배포 경계 변경 시 clean Windows package + artifact verification·`test:packaged`도 로컬 실행; updater/installer 변경 시 actual install/update regression도 실행. 해당 경계 변경이 없으면 패키징·설치/업데이트 회귀는 CI |

문서 checker를 바꾸면 `pnpm exec tsx --test scripts/check-docs.test.ts`도 실행한다. 검증 명령의 자세한 사용법은 [검증 안내](docs/test/README.md)에 있다.

quality의 문서 전용 판정은 [ci-quality-mode.mjs](scripts/ci-quality-mode.mjs)의 보수적인 allowlist다. 루트 `*.md`, `.github` 바로 아래 `*.md`, `docs/**`의 `md/png/jpg/jpeg/gif/svg/webp/ico/pdf/json`만 허용한다. 제품 fixture일 수 있는 `apps/**`·`packages/**` Markdown, tooling·설정, issue form, 미분류 경로가 하나라도 섞이면 전체 quality를 실행한다. 삭제도 변경 경로에 포함하고 rename의 이전·이후 경로를 모두 검사한다. PR merge-base diff로 판정하며 `master` push에는 문서 전용 생략을 적용하지 않는다.

CI 경로 규칙의 기준은 [ci.yml의 changes job](.github/workflows/ci.yml)이며, 다음 표는 요약이다. 여러 경로를 바꾸면 필요한 job의 합집합을 실행한다. `master` push와 PR 이외 이벤트는 경로와 무관하게 전체 job과 `test:update`를 실행한다. **미분류 경로가 하나라도 있으면 전체 실행**한다.

| PR 변경 경로 요약 | quality 외 추가 검증 |
| --- | --- |
| `docs/**`, 루트·하위 `*.md`, `.github/ISSUE_TEMPLATE/**`만 변경 | 없음 (아래 패키지·공용 경로에 속하는 Markdown은 해당 경로 규칙 우선) |
| `packages/cli/**` | http, desktop (Desktop bundles the CLI) |
| `apps/editor/**`, `packages/core/**`, `packages/file-commit/**` | browser, http, desktop |
| `apps/desktop/**`, Editor의 업데이트 화면(`apps/editor/shared/desktop-bridge.ts`, `apps/editor/src/shell/SettingsDialog.tsx`, `apps/editor/src/shell/MessageArea.tsx`) | desktop + `test:update` (Editor 파일은 Editor 규칙도 함께 적용) |
| 공용 설정·도구 (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `patches/**`, 루트 `tsconfig*`, `.github/workflows/**`, `scripts/**`) 또는 미분류 경로 | browser, http, desktop + `test:update` |

패키지 내부 Markdown은 fixture나 배포 입력일 수 있어 패키지 경로 규칙을 적용한다. browser는 Editor 4개 shard로 stable 시나리오를 정확히 한 번씩 실행한다. 목록 순서의 순환 분배를 사용하며 각 shard의 배정은 CI 로그에 출력한다. http는 Windows/Linux CLI package·`test:packaged`·HTTP browser 회귀를 실행한다. desktop이 선택되면 clean package·release 자산 검증·`test:packaged`는 항상 실행하고, 로컬 feed 설치·업데이트 단계만 `update` 출력으로 선택한다. 이 설치·업데이트 e2e는 Editor의 Settings·업데이트 알림·Desktop bridge를 직접 조작하므로 해당 파일도 `update` 대상이다. `App.tsx`의 재시작 거부 판단처럼 그 밖의 Editor 변경은 browser `desktop-updates`(mock bridge)와 Desktop packaged 회귀로 검증하고, 실제 설치·업데이트는 `master` push와 `merge_group`의 전체 실행에서 확인한다. Editor와 CLI는 Core/File commit을 공유하고, Desktop은 Editor 코드와 Host를 직접 사용하며 HTTP용 CLI package도 Editor를 빌드하므로 이 의존 경로를 함께 검증한다.

필수 aggregate 검사 `Core, CLI, Editor, and browser regressions`는 changes와 quality의 성공을 요구하고, 경로 규칙이 선택한 browser/http/desktop은 반드시 성공해야 하고, 선택하지 않은 job만 skipped여야 한다. 실패·취소는 통과하지 않는다. Queue에서도 정확히 같은 검사 이름을 보고한다. 같은 PR에 새 커밋을 push하면 이전 CI 실행을 취소하며, `master` push와 `merge_group` 실행은 이벤트·head SHA별로 유지하고 서로 취소하지 않는다.

Linux Editor 4개 shard와 HTTP browser job은 공식 `mcr.microsoft.com/playwright:v1.64.0-noble` 컨테이너를 **OS 의존성 제공용**으로 사용한다. 이미지의 CJK/Korean 글꼴을 포함한 의존성을 재사용하며 CI에서 apt를 실행하지 않는다. `@playwright/cli`의 transitive 버전과 맞춘 `1.64.0-alpha-1789764292000` 고정은 유지한다([채택 근거](docs/reviews/reduction-2026-10-10.md#단위-6-runner-채택-근거)). 해당 alpha 이미지가 없으므로 이미지에 포함된 stable 브라우저(`/ms-playwright`)는 사용하지 않는다. `PLAYWRIGHT_BROWSERS_PATH=/github/home/.cache/ms-playwright`로 분리하고 lockfile 키의 캐시를 복원한 뒤 `pnpm exec playwright install chromium`만 실행한다. 이 설치는 2분 제한이며 `--with-deps`를 사용하지 않는다. 기존 CI 경로 테스트가 lockfile의 prerelease 꼬리를 제외한 base 버전과 두 Linux 이미지 태그의 일치를 검사한다.

컨테이너는 기본 root 사용자와 `--ipc=host --init`를 사용한다. checkout action의 기본 safe.directory 설정을 유지하고, Node.js `24.21.0`과 pnpm `12.5.1`을 기존 action으로 설정한다. GitHub가 매핑한 HOME과 workspace/temp 경로를 사용하므로 기존 artifact 경로를 유지한다. runner는 headless Chromium이며 xvfb 실행은 필요 없다. Windows job은 기존 설치형 Chrome과 persistent profile을 사용한다. 이 선택은 테스트 판정·재시도·timeout·4개 shard 배정과 docs-only/merge queue 동작을 바꾸지 않는다.

## HTTP Host builds

`pnpm --filter @ieumdoc/cli package`는 Node CLI 번들과 production Editor를 `packages/cli/dist/*.tgz`로 만든다. `pnpm --filter @ieumdoc/cli test:packaged`는 checkout 밖에 offline 설치해 Node만으로 실행·저장·종료를 검사한다. 이어 `pnpm browser:test http-host`가 production Host를 직접 시작하고 정리한다. Vite 시나리오와 한 호출에 섞지 않는다.

Windows/Linux CI는 이 세 검사를 수행하고 tarball을 Artifact로 제공한다. 로컬에서는 관련 boundary tests와 HTTP browser 회귀를 실행한다 (`pnpm --filter @ieumdoc/cli build` 선행). `package`·`test:packaged`는 CLI 패키징·배포 경계를 변경할 때 실행한다. 공개 registry 게시·버전 release는 수행하지 않는다. 설치/실행과 원격 프록시 전제는 [HTTP Host contract](docs/design/http-host-v1.md)를 따른다.

## Windows Desktop builds and releases

Windows에서 아래 명령으로 로컬 개발용 installer를 만든다. 패키징·설치/업데이트·배포 경계를 변경하지 않은 작업에서는 아래 package·자산 검증·packaged 회귀와 install/update 회귀를 필수 Windows Desktop CI에 맡기고, 관련 tests/typecheck·browser 회귀를 로컬 실행한다. 빌드 산출물은 `apps/desktop/build/`와 `apps/desktop/release/`이며 Git에 포함하지 않는다. `package`는 generated release 폴더를 비우고 빌드하며, 항상 `publish: never`다.

```bash
pnpm --filter @ieumdoc/desktop package
pnpm --filter @ieumdoc/desktop exec tsx scripts/verify-release.ts --tag v0.1.0-beta.2
pnpm --filter @ieumdoc/desktop test:packaged
```

`--tag`에는 `apps/desktop/package.json`의 실제 버전을 사용한다. `pnpm --filter @ieumdoc/desktop start`는 먼저 `build`한 staging app을 실행한다. 설치·업데이트 E2E는 [검증 안내](docs/test/README.md#windows-desktop-regression)의 사용 조건을 먼저 확인한다.

공개 버전은 `0.1.0-beta.1`이며 Stable 공개는 보류한다. Beta 설치본의 최초 실행 기본 채널은 Beta, Stable 설치본은 Stable이다. 유효하게 저장된 사용자 선택은 버전이 바뀌어도 유지한다. Beta는 제한된 unsigned 게시 모드를 사용할 수 있으며 Stable은 서명된 릴리즈 절차만 허용한다.

일반 PR/push CI는 unsigned installer를 Artifact로 제공하며 게시 권한이나 release job이 없다. 첫 beta.1은 CI 자산을 별도로 검증하여 수동 공개했다. 다음 Beta부터는 [Desktop release workflow](.github/workflows/desktop-release.yml)를 master에서 수동 실행한다.

| Mode | 동작 |
| --- | --- |
| `verify` (기본) | 태그·빌드·테스트·자산 검증/Artifact만 실행. 게시하지 않음 |
| `unsigned-beta` | 정확한 `vX.Y.Z-beta.N`만 신규 Prerelease로 공개. 인증서 불필요; Stable은 차단 |
| `signed` | 기존 Authenticode 인증서/publisher 검증을 통과한 Stable 또는 Beta만 공개 |

컨트롤러는 dispatch의 master SHA에서 실행하며, tag 코드 실행 전에 기존 tag와 master ancestry·Desktop 버전을 검증한다. 검증한 commit SHA로 빌드하고 게시 직전 remote tag도 재확인한다. Installer/app의 전체 PE FileVersion, metadata 버전·파일명·SHA-512·크기, builder로 재계산한 blockmap을 검증한다. Beta는 `prerelease=true`, `latest=false`, `beta.yml`만 공개한다.

게시 job만 `contents: write`를 가지며 `desktop-release` environment를 사용한다. 2026-10-12 게시 승인 후 실제 저장소 설정에서 required reviewer `SWBaek`와 `master` branch 배포 제한을 설정하고 API로 확인했다. 개인 운영을 위해 self-review는 허용하며 GitHub의 관리자 bypass도 허용된 설정이다. 이번 게시는 required reviewer 승인으로 진행했다. 이름을 YAML에 적는 것만으로 승인이 강제되지는 않으므로, 다음 게시 전에도 실제 보호 규칙을 확인해야 한다. Signed 모드는 이 환경에 `WINDOWS_CSC_LINK`(PFX/인증서 참조), `WINDOWS_CSC_KEY_PASSWORD`도 필요하다. 인증서/키/토큰은 source에 넣지 않는다. 환경·secret 설정과 workflow 실행은 명시적 승인 범위에서 수행한다.

인증된 paginated Release 목록에서 기존 공개 Release와 Draft를 모두 거부한다. 생성 응답의 ID로 새 Draft에 세 자산을 올리고 서버의 정확한 자산 집합·uploaded 상태·size·SHA-256·tag/channel을 확인한 뒤 마지막 요청으로 공개한다. 업로드/검증 실패는 Draft로 남기고 자동 삭제·덮어쓰기·재시도하지 않는다. 마지막 공개 요청의 응답이 소실되면 공개 여부를 확인해야 하므로 `Publication confirmation required`와 ID를 보고한다.

다음 Beta 발행 순서: 버전 변경과 로컬 후보 검증 → 명시적 원격 승인 → 변경 push/CI/master 반영 → 실제 환경 보호 확인 → 검증된 master commit에 해당 버전 tag 게시 → master에서 해당 tag와 `unsigned-beta` 또는 `signed`로 수동 실행 → 모든 빌드·테스트·자산 검증 성공 확인 → 대기 중인 `desktop-release` 게시 job 승인 → 공개 결과와 [실제 GitHub 업데이트 검증](docs/test/README.md#real-github-beta-update) 확인 → README의 공개 버전과 릴리즈 기록 갱신. 게시 모드도 전체 검증을 실행하므로 동일 후보의 `verify`와 게시 빌드를 연속으로 반복할 필요는 없다. 게시 여부를 결정하기 전 산출물만 검토하려면 `verify`를 사용한다. 0.1.0-beta.1의 현재 결과는 [릴리즈 기록](docs/releases/v0.1.0-beta.1.md), 동작 계약은 [Desktop contract](docs/design/desktop-distribution-v1.md)를 참고한다. 이미 공개된 tag나 자산은 재작성하지 않는다.

Unsigned Beta의 SHA-512/SHA-256은 무결성 검증이다. 악의적인 게시자가 파일과 manifest를 함께 바꾸는 경우에 대한 게시자 인증이 아니다. Unsigned 경로는 Authenticode 인증을 제공하지 않으며, Signed 경로의 인증서 검증을 해제하지 않는다.

## Issue and PR guidance

[이슈 작성 안내](docs/contributing/issues.md), [issue templates](.github/ISSUE_TEMPLATE/), [PR template](.github/pull_request_template.md)을 사용한다. 실행한 검증과 결과, 실행하지 않은 검증의 이유를 PR에 기록한다.

## AI commit provenance

필수 trailer 형식과 구현자 기록 의무는 [AGENTS.md](AGENTS.md#ai-commit-provenance)를 따른다. 두 필수 키는 **최종 연속 trailer 블록에 각각 정확히 한 번** 있어야 한다. 본문과 블록 사이에는 빈 줄을 두고, trailer 사이에는 빈 줄을 넣지 않는다. 행이 본문에 보이는 것만으로는 충분하지 않다. Git이 실제로 두 값을 읽어야 한다.

예외: GitHub merge queue가 생성한 merge commit은 플랫폼 생성 commit이며 AI trailer를 넣지 않는다. Provenance는 validator가 검사하는 PR 고유 commit에 남는다. Agent가 수동 작성한 merge commit(예: PR branch에 master merge)은 여전히 필수 trailer 대상이다.

```text
fix: preserve machine-readable provenance

Describe the change here.

AI-Agent: Codex
AI-Model: openai/gpt-6.1-sol
```

이 모델 값은 예시다. 현재 구현에 실제 사용한 agent/model을 확인한 뒤 기록하며, 검증기는 값을 생성하거나 진실성을 추정하지 않는다.

Use a single analyzable identifier, not a display name: `<provider>/<model>`.

Examples:

```
xai/grok-4.6
openai/gpt-6.1-sol
openai/gpt-5.6-luna
openai/gpt-5.6-terra
openai/gpt-6-astra
```

If a vendor's official identifier differs from this repository's
identifier, use the repository canonical form above and keep it stable.
This repository's canonical identifier for Grok 4.6 is `xai/grok-4.6`.

If review provenance is needed, use a separate, optional trailer, for example:

```
AI-Reviewed-By: openai/gpt-5.6-sol
```

PowerShell에서는 메시지를 UTF-8 파일로 작성한다. 각 trailer를 별도의 `git commit -m` 인자로 넘기면 Git이 빈 줄로 구분된 문단을 만들므로 금지한다. 다른 shell에서도 메시지 파일을 사용한다.

```powershell
@'
fix: describe the change

Describe the change here.

AI-Agent: Codex
AI-Model: openai/gpt-6.1-sol
'@ | Set-Content -LiteralPath commit-message.txt -Encoding utf8
node scripts/commit-provenance.mjs message commit-message.txt
git commit --file commit-message.txt
git log -1 --format='%H%n%(trailers:only)'
```

메시지 파일은 staging하지 않고 작업 후 삭제한다. **매 commit 생성 직후와 push 전에** 마지막 명령 결과에서 `AI-Agent`와 `AI-Model`이 각각 정확히 한 번, 실제 구현 값으로 출력되는지 확인한다. raw `%B` 출력, 정규식 검색, hook 통과만으로 대체하지 않는다. 문제가 있으면 push/승인을 중단하고 수정한다. 공유된 과거 이력을 이 검사 때문에 임의로 다시 쓰지 않는다.

**검토자는 승인 전에** 최신 base를 fetch한 뒤 다음 명령으로 PR 고유 commit 전체의 SHA와 Git parsed trailers를 확인한다. 작성된 merge commit도 확인한다. AI metadata가 있는 각 commit에 필수 키가 정확히 한 번씩 읽히는지, 값이 구현자·실제 모델인지 확인하고 검토 head의 CI 성공을 확인한다.

```powershell
git fetch origin master
git log origin/master..HEAD --format='%H%n%(trailers:only)'
```

`.githooks/commit-msg`와 CI quality는 같은 [validator](scripts/commit-provenance.mjs)의 `git interpret-trailers --parse` 결과로 누락·중복·빈 값·모델 형식·블록 밖 metadata를 검사한다. Git의 [trailer 형식](https://git-scm.com/docs/git-interpret-trailers)을 재구현하지 않는다. AI provenance가 전혀 없는 사람 commit과 선택적인 `AI-Reviewed-By`, 다른 정상 trailer는 허용한다. 검증기는 사람이 작성한 commit인지 또는 모델 기록이 사실인지 자동 판별하지 않는다.

CI는 `event <event-name> <event.json>`으로 PR event의 `pull_request.base.sha..pull_request.head.sha`를 검사한다. base에서 이미 도달 가능한 기존 이력과 GitHub의 synthetic merge는 제외하지만 PR에서 작성된 merge commit은 포함한다. `merge_group`에서는 enqueue 전에 PR 고유 commit이 검증되었으므로 provenance 범위 검사를 명시적으로 건너뛴다. GitHub 생성 queue merge commit에 AI trailer를 요구하지 않는다. event JSON은 파일로 읽으며 shell 명령에 값을 삽입하지 않는다. push event에는 과거 master 이력의 provenance 감사를 추가하지 않는다.

Hook은 선택 설치이며 CI 검사의 대체물이 아니다. Node.js와 Git이 필요하다. Enable the shared hooks in a local clone with:

```
git config core.hooksPath .githooks
```

## License of contributions

By submitting a contribution, you agree that it may be distributed under the [MIT License](LICENSE) used by this repository.
