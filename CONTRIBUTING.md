# Contributing to IeumDoc

## Project status

IeumDoc은 **Pre-alpha**다. 공식 release와 installer는 없으며, 현재 Visual Editor는 local development host로 실행한다. 공개 API, 문서 지원 범위와 배포 형태는 바뀔 수 있다.

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
- `apps/editor/server`는 개발 adapter다. 제품 backend나 장기 persistence 결정으로 확대하지 않는다.
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

문서 checker를 바꾸면 `pnpm exec tsx --test scripts/check-docs.test.ts`도 실행한다. 검증 명령의 자세한 사용법은 [검증 안내](docs/test/README.md)에 있다.

## Issue and PR guidance

[이슈 작성 안내](docs/contributing/issues.md), [issue templates](.github/ISSUE_TEMPLATE/), [PR template](.github/pull_request_template.md)을 사용한다. 실행한 검증과 결과, 실행하지 않은 검증의 이유를 PR에 기록한다.

## AI commit provenance

AI가 주로 구현한 commit은 실제 구현 agent와 실제 model의 canonical identifier를 `AI-Agent`, `AI-Model` trailer에 각각 기록한다. 모델 이름을 추측하거나 이전 commit에서 복사하지 않는다. `Co-authored-by`는 대체물이 아니며, 검토 모델은 구현 모델로 기록하지 않는다. 선택적인 `AI-Reviewed-By`를 포함한 전체 계약은 [AGENTS.md](AGENTS.md#ai-commit-provenance)를 따른다.

## License of contributions

By submitting a contribution, you agree that it may be distributed under the [MIT License](LICENSE) used by this repository.
