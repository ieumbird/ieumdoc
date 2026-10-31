# ADR-0008: 인용·참고문헌 표현 방식 결정안

- Status: Accepted
- Last verified: 2026-10-22 (단위 A·B의 구현 계약·검증은 [Citations](../design/citations-v1.md). 아래 2026-10-20 실험은 당시 근거로 보존).
- Previous verification: 2026-10-20 (master `3417f5ae949506f4d5acf4cb56186e6d219a5dad`의 Host 경계 재대조, BibTeX 유형 변환·MyST role·일반 `@`·CLI 재실행. 서식 후보의 기존 Node 실행·browser bundle 측정은 비교 근거로 유지. 당시 실제 브라우저·제품 통합 검증은 미실행).
- Authority: 승인된 product and architectural decision. 단위 A·B·C는 [Citations](../design/citations-v1.md)에 구현되었으며 단위 D는 각각 별도 결정이다. [AGENTS.md](../../AGENTS.md), [ADR-0002](0002-document-persistence-semantic-ownership.md), [ADR-0006](0006-native-document-boundary.md)가 우선한다. 현재 지원은 [Native document support](../design/document-support-v1.md)를 따른다.
- Decision date: 2026-10-20
- Related: [결정 이슈 #327](https://github.com/ieumbird/ieumdoc/issues/327), [사용자 요구 #265](https://github.com/ieumbird/ieumdoc/issues/265), [일반 `@` 텍스트 결함 #328](https://github.com/ieumbird/ieumdoc/issues/328), [Discussion #154](https://github.com/ieumbird/ieumdoc/discussions/154), [#155](https://github.com/ieumbird/ieumdoc/discussions/155), [#257](https://github.com/ieumbird/ieumdoc/discussions/257), [Filesystem Host boundary](../design/filesystem-host-boundary-v1.md).

Implementation update (2026-10-23): units A, B and C are implemented in [Citations v1](../design/citations-v1.md). The experiments below retain their original historical scope; unit D extensions remain separate decisions.

동결 (2026-10-30, 소유자 결정): 인용·참고문헌은 아직 실제 사용 기능이 아니므로 **동결**한다. 구현된 단위 A·B·C의 동작, 계약과 테스트는 그대로 유지하며 깨뜨리지 않는다. 다만 새 기능·정비 작업은 인용·BibTeX를 범위에 넣지 않는다. 예를 들어 다른 이름으로 저장(#775)의 `.bib` 경로 처리, UI 패턴 후속(#790)의 인용 폼, Docling 변환·대조 흐름(#766)이 그렇다. 동결 해제와 단위 D는 별도 결정한다.

## Context

#265의 문제는 본문 `[1]` 평문과 번호 목록을 사람이 따로 관리해야 한다는 것이다. #154는 CLI, #155는 Visual Editor에서 이 마찰을 보고했고, #257에서도 배치 저작 후 인용 부재가 남았다. #154의 `[@key]` 삽입·읽기 전용 보존 경험은 이전 commit `9545731`의 관찰이다. ADR-0006 이후에는 미지원 내용이 있는 문서 전체를 거부하므로 그 경로를 복원하지 않는다.

2026-10-20 결정 당시 `native.ts`의 메타데이터 검증은 `ieumdoc`, `numbering`만 받는다. `projectInlineContent`가 인용을 지원하지 않아 인용 문단은 `native-content`로 거부된다. 내부 MyST parser/writer의 처리 능력, 네이티브 지원 판정, 외부 파일 접근, 서식 표시를 각각 구분해야 한다.

당시 ADR 작업은 결정 문서와 인덱스만 변경했다. 아래 구현 단위의 현재 API·진단·검증은 상단 Citations 계약이 기록하며, 당시 실험과 구분한다.

## Decision

### 1. 참고문헌 데이터 위치

**허용된 폴더/Root 안의 별도 UTF-8 BibTeX `.bib` 파일을 문서 상대 경로로 참조하고 읽기만 한다.** `chapters/*.md`가 상위의 공용 `refs.bib`를 공유할 수 있다.

| 선택지 | plain-text SSOT·Git diff | MyST·외부 관리 도구 | 파일 접근·비용 | 판단 |
| --- | --- | --- | --- | --- |
| 문서 옆 `.bib` 파일 | 본문 인용 키와 서지 항목 변경이 분리되어 읽기 좋음. 전달 시 `.md`와 `.bib`가 함께 필요 | MyST가 직접 사용하는 형식. Zotero 등의 export와 연결 가능 | Host에 제한된 의존 파일 읽기가 필요 | 권고 |
| Frontmatter 안 서지 항목 목록 | 한 파일로 이동 가능하나 긴 목록과 본문 편집이 섞임 | 자체 YAML 항목 스키마 또는 CSL-JSON 변환이 필요. MyST `bibliography`는 항목 목록 필드가 아님 | 추가 파일 I/O는 없으나 독자 스키마·항목 편집 책임 증가 | 첫 범위에서 기각 |
| 별도 CSL-JSON 파일 | plain text이며 processor 입력과 가까움. JSON diff가 길어질 수 있음 | 여러 관리 도구가 지원하지만 MyST BibTeX 경로와 직접 같지 않음 | `.bib`와 동일한 Host 경계에 다른 입력 형식까지 추가 | 후속 실제 요구가 있을 때 재검토 |
| DOI 목록·원격 URL·Zotero API·DB | 네트워크 응답이나 별도 저장소가 권위가 되면 재현성 저하 | 자동 수집은 편리하나 인증·offline·갱신 시점 계약 필요 | 네트워크·cache·동기화 책임이 추가됨 | 첫 범위에서 기각 |

`.md`는 인용의 키·순서·형태·파일 선언의 SSOT이고 `.bib`는 서지 항목의 외부 plain-text 원본이다. CSL-JSON, 번호, 렌더링 목록은 이 두 원본에서 재생성하며 저장하지 않는다. 같은 서지 항목을 Frontmatter나 Editor 저장소에 중복 보관하지 않는다. 이는 ADR-0002의 `.md` 중심 SSOT에 **명시적 외부 서지 의존성**을 추가하는 결정이다. 인용을 쓰는 문서의 완전한 전달 단위는 `.md`와 선언한 `.bib`이며, 이 범위 밖으로 ADR-0002를 확대하지 않는다.

[Better BibTeX 자동 export 문서](https://retorque.re/zotero-better-bibtex/exporting/auto/)는 Zotero collection/library 변경을 export 파일에 반영하는 경로를 제공한다. 권고하는 연동은 사용자가 문서의 허용 폴더 안으로 export하는 방식이다. IeumDoc은 Zotero DB·API에 쓰거나 export 파일을 재정렬하지 않는다. 실제 Zotero export와 충돌·키 안정성은 이번에 시험하지 않았다.

### 2. 참조 선언과 Host 경계

**문서 Frontmatter의 MyST `bibliography` 문자열 목록을 채택한다.** 별도 설정 파일, 암묵적 `.bib` 검색, project 설정 상속은 도입하지 않는다.

```yaml
---
litzio: 1
bibliography:
  - ../refs.bib
  - ../refs/standards.bib
---
```

- 위 예시는 허용 폴더의 `chapters/paper.md`다. 필드는 생략할 수 있다. 있으면 비어 있지 않은 상대 `.bib` 경로의 목록으로 제한한다. `/` 구분, `./`, `..`를 허용하되 문서 directory를 기준으로 정규화한 경로와 real path가 아래 경계 안이어야 한다. 단일 문자열 coercion, inline 항목, glob, URL, absolute/drive/UNC 경로, 빈 값·중복 선언은 거부한다. YAML 중복 키·표식·Unicode 검증은 유지한다.
- Core는 선언 문자열과 전달받은 리소스의 source/status만 다룬다. Core 안에 `fs`, absolute path, Root, HTTP, Zotero client를 넣지 않는다. Host/CLI가 Core에서 얻은 선언을 읽어 다시 Core에 공급한다. BibTeX 해석·키 연결·완료 진단·서식 계산은 Core가 소유한다.
- **현재 코드의 경계:** [Vite](../../apps/editor/vite.config.ts)와 [Desktop](../../apps/desktop/src/host-protocol.ts)은 `LOCAL_FILE_ACCESS = null`을 선택한다. [HTTP Host](../../apps/editor/server/http-host.ts)만 `RootAccess(options.roots)`의 고정 allowlist를 사용한다. 선택된 sidebar folder는 Browser page state이며 Host에 저장되는 보안 Root가 아니다. [folder listing](../design/filesystem-host-boundary-v1.md#folder-listing-v1-112)의 요청별 `root` 검사와 HTTP Root를 혼동하지 않는다.
- **Vite·Desktop에 제안하는 bibliography 경계:** 문서를 열 때 선택한 폴더를 해당 문서의 의존 파일 읽기 범위로 명시적으로 전달한다. Host는 요청마다 그 폴더의 정규화·real path와 문서/대상의 포함 관계를 검사한다. 선택 폴더 없이 시작 인자로 연 문서 등은 문서 directory가 기본 경계다. 상위 공용 `.bib`를 쓰려면 사용자가 공통 상위 폴더를 열어야 한다. 폴더를 바꿔도 기존 탭의 읽기 경계는 조용히 확대하지 않으며, 재열기로 새 범위를 선택한다. 이 문서별 context 전달은 새 구현 사항이고, 현재 local Host 전체를 sandbox로 바꾼다는 주장은 아니다. Host는 stateless 요청 검사를 유지한다.
- **HTTP:** 기존 고정 Root allowlist의 합집합이 의존 파일 접근 경계다. 선택된 sidebar folder가 하위 폴더여도 `../refs.bib`의 정규화 경로와 real path가 허용 Root 안이면 읽을 수 있다. Browser가 보낸 폴더 값으로 HTTP 권한을 확대하지 않는다. 문서와 대상 모두 기존 `RootAccess` 검사를 통과해야 하며, Root 교체·경계 밖 symlink/junction은 거부한다.
- **Host Root가 없는 CLI:** 기본은 문서 directory다. 상위 공용 파일을 허용하려면 명시적인 `--bibliography-root <directory>` 같은 I/O 옵션으로 공통 상위 폴더를 지정한다(이름은 구현 계약에서 확정). 문서와 대상 모두 그 경계 안이어야 한다. cwd·Git root·상위 폴더를 자동 탐색해 권한을 추론하지 않는다. 옵션은 해당 실행의 check/inspect/편집 등 같은 리소스 분석에 일관되게 적용하고, Core semantic이나 문서 Frontmatter에 OS Root를 저장하지 않는다.
- 모든 경우 `..` 자체가 금지 사유는 아니다. 경로 정규화 후의 경계 이탈, symlink/junction real path 탈출, 금지된 절대·원격 경로를 거부한다. 기존 이미지의 문서 directory 제한은 그대로이며 bibliography 때문에 media 접근을 넓히지 않는다.
- 공유 Host handler를 재사용할 새 읽기 경로가 필요하다. 기존 document endpoint가 `.bib`를 이미 읽는다고 가정하거나, media endpoint로 임의 텍스트를 우회 제공하지 않는다. Browser는 Host가 전달한 text/status를 받는다.
- 한 번의 분석은 선언 순서대로 읽은 불변 source snapshot을 사용한다. 파일마다 읽기 결과·revision을 구분하고, 읽는 도중 변경이 감지되면 재시도 또는 명시적 실패를 반환한다. 여러 외부 writer 사이의 원자 snapshot은 보장하지 않는다.
- Open/Reload와 CLI 실행 때 새 snapshot을 읽는다. 첫 범위에 watcher를 넣지 않는다. 외부 변경 후 화면은 Reload 전까지 이전 snapshot의 표시라는 점을 알린다. `.md` 저장은 `.bib`를 고정하거나 덮어쓰지 않는다.

MyST의 선언 이름과 자료 형식은 재사용하지만, 원격 bibliography와 project 탐색까지 지원한다는 뜻은 아니다. [MyST 안내](https://mystmd.org/guide/citations)의 더 넓은 경로 허용 범위와 구분한다.

### 3. 지원할 인용 형태

**첫 범위 A에서 `{cite}`, `{cite:t}`, `{cite:p}`의 단일·다중 키를 수용·보존한다. canonical write와 공식 저작은 명시적 role만 사용한다.**

| 형태 | 권고 |
| --- | --- |
| `` {cite}`zhang2019` ``, `` {cite:t}`zhang2019` ``, `` {cite:p}`zhang2019` `` | 지원. narrative/parenthetical 의미는 보존하고, 첫 IEEE 표시에서는 모두 `[n]` 사용 |
| 세 role의 다중 키·role 안의 쉼표/세미콜론 구분 | 지원. 키와 그룹 내 순서를 보존하고 쉼표로 정규화 |
| 맨 `@key` | 첫 범위의 인용 입력/저작 문법으로 채택하지 않음. 일반 `@param`·`@username`의 처리는 별도 #328 계약으로 해결 |
| `[@key]`, `[@a; @b]` | 첫 범위의 인용 alias로 채택하지 않음. 인용 의도가 명확한 role로 작성하도록 안내. 기존 MyST shorthand를 일반 텍스트로 자동 변환하지 않음 |
| locator·prefix·suffix, 저자/연도만 표시하는 partial 인용 | 첫 범위에서 보류. 파싱 가능성과 무손실 저장 가능성은 다름 |
| DOI 자동 조회, 그 밖의 role 옵션·속성 | 첫 범위에서 보류 |

canonical 규칙은 단일 narrative `cite`를 `{cite}`, narrative `citeGroup`을 `{cite:t}`, parenthetical group을 `{cite:p}`로 쓰는 것이다. 다중 `{cite}`는 이미 parser에서 narrative group이 되므로 `{cite:t}`로 쓰는 것은 **의미 변경이 아닌 철자 정규화**다. 단일 `{cite:t}`의 group도 임의로 풀지 않는다. narrative를 parenthetical로 바꾸지 않고, 같은 numeric 표시를 갖는다는 이유로 원래 role 의미를 합치지 않는다. 저자명은 작성자가 본문에 쓰며 narrative 저자명 자동 출력은 보류한다.

`@`와 대괄호 shorthand는 role과 구분할 원문/tokenizer 근거가 필요하다. 현재 lifted AST만 넓게 수용하면 `Contact @kim`의 일반 텍스트 의도를 판단하지 못한 채 인용으로 승격할 수 있다. **인용 지원은 [#328](https://github.com/ieumbird/ieumdoc/issues/328)의 해결이 아니다.** 권고는 명시적 role만 인용으로 생성하고, 일반 텍스트 `@`는 canonical writer가 필요한 문맥에서 escape하여 다시 text로 읽히게 하는 것이다. 입력의 맨 `@이름`을 일반 텍스트로 다루는 parser 경계는 #328에서 확정·검증한다. 대괄호 citation-like 입력은 첫 범위에서 자동 해석·평문화하지 않고 지원 role 또는 명시적 literal escape를 안내하며 거부한다.

MyST의 `extensions.citations:false`는 bare·bracket shorthand를 끄고 role을 유지하는 후보지만, 대괄호 locator까지 text가 되는 것도 직접 확인했다. 따라서 옵션 하나만 바꾸고 해결됐다고 하지 않는다. 기존 tokenizer 근거를 이용한 shorthand 안내/거부와 일반 텍스트 escape, 명시적 role의 보존을 함께 검증해야 한다. #328을 독립 작업으로 유지하되 A 배포 전에 이 경계를 맞춘다. 현재 `\@kim`도 writer가 escape를 제거해 재파싱 시 인용이 되므로, escape를 지금 가능한 해결책으로 안내하지 않는다.

Core read model은 인용 그룹과 키를 typed inline 의미로 노출한다. 내부 MyST `cite`/`citeGroup`은 `packages/core/src/myst/` 경계에 둔다. 다른 문서의 label target·미주 identifier와 bibliography key namespace를 섞지 않는다. 키는 원문의 label을 보존하고, 해석 단계에서 임의 lowercase·키 재생성을 하지 않는다. 모호하거나 canonical 재파싱으로 식별자가 변하는 경우 거부한다.

locator가 필요한 사용자는 현재 단계에서는 주변 일반 문장으로 쓸 수 있으나, 이를 구조화 locator 지원이라고 부르지 않는다. prefix/suffix/partial을 가진 미지원 문서는 ADR-0006대로 전체 거부한다. 미지원 노드를 read-only island로 보존하는 경로는 추가하지 않는다.

### 4. 번호·인용·목록 스타일

**첫 스타일은 Core의 제한된 IEEE 번호식 서식 계약 하나이며 사용자 스타일 선택은 보류한다. CSL 엔진·style/locale XML은 배포하지 않는다.**

- Core가 문서 읽기 순서와 그룹 내 키 순서를 순회해 최초 인용 키에 번호를 부여하고 같은 키는 같은 번호를 재사용한다. 그룹은 저장된 순서대로 `[2], [1]`처럼 표시하며 자동 정렬·범위 압축하지 않는다. `.bib` 항목 순서와 role의 narrative/parenthetical 차이는 번호를 바꾸지 않는다.
- 목록에는 인용된 항목만 한 번씩 표시한다. 문서 말미, 기존 미주 구역 뒤의 파생 References 영역을 권고한다. 본문에 일반 heading·번호 목록을 써 넣거나 목록 번호를 영속화하지 않는다. 별도 bibliography directive·여러 목록·수동 위치 선택은 보류한다.
- 이름·항목 종류별 필드 순서·punctuation·날짜·누락 처리와 출력 예제를 Core의 design contract와 테스트로 고정한다. 전역 locale이나 네트워크 최신 스타일에 의존하지 않고 offline으로 계산한다. 아래 결정 5의 지원 항목에만 이 계약을 적용한다.
- author-year 등 스타일 선택이 필요해지면 CSL 엔진 도입을 배포 라이선스 검토와 함께 별도 결정한다. 선택은 문서에 선언되는 지속적 의미로 설계하고 Core/CLI에서 먼저 표현한다.

“IEEE”는 이 제한된 번호식 인용·목록 계약을 뜻한다. 전체 IEEE 항목 유형·투고 양식, 2단 편집, PDF, 수식·그림 표기나 학회별 완전한 규정 준수를 보장하지 않는다. MyST 사이트 기본 표시와 같다는 보장도 없다.

### 5. 서식 처리 의존성

**BibTeX 입력은 MIT인 `@citation-js/core` + `@citation-js/plugin-bibtex`로 CSL-JSON 항목을 얻고, 번호는 Core semantic으로 계산하며 항목 서식은 Core가 IEEE 한정으로 생성한다. citeproc은 첫 범위 의존성으로 채택하지 않는다.**

| 후보 | 역할·장점 | 제한·기각 이유 |
| --- | --- | --- |
| **core + plugin-bibtex** | MIT 입력 parser와 CSL-JSON 변환을 재사용 | **권고.** 신규 설치의 의존 트리에 citeproc/CSL plugin 없음 |
| citeproc 단독 또는 core + BibTeX + citeproc | CSL cluster·번호·목록 엔진 | CPAL/AGPL 배포 조건을 첫 범위에 도입하지 않기로 결정하여 기각 |
| Citation.js 전체·plugin-csl | 여러 입력·서식을 제공 | citeproc을 포함하므로 같은 배포 라이선스 이유로 기각 |
| MyST `citation-js-utils` | 변환·HTML 정리·저자연도 helper | citeproc 포함 wrapper이므로 같은 이유로 기각 |
| citeproc-rs | Rust/WASM CSL 구현 | README가 work-in-progress로 명시. 유지·완성도 불확실성으로 기각. 조회한 repository push는 2024-08-06이고 master 최신 commit은 2021-12-14; push와 기본 branch commit 날짜를 구분 |
| Citum | LICENSE는 MIT, 자체 YAML style 체계와 WASM 경로 제공 | 2026-01 생성 repository의 신생 후보. 성숙도·IEEE 재현성은 직접 검증하지 않았고 별도 style 체계 도입 비용 때문에 첫 범위에서 기각 |
| Hayagriva | Rust bibliography library, manifest는 MIT OR Apache-2.0 | 확인한 배포 경계가 Rust library/CLI이므로 이 Browser/Node Core에 쓰려면 WASM binding/build 유지가 필요하다고 판단. 첫 범위에서 기각하며 WASM 빌드는 미실행 |

다른 엔진의 근거는 [citeproc-rs README](https://github.com/zotero/citeproc-rs), [Citum LICENSE](https://github.com/citum/citum-core/blob/main/LICENSE)·[README](https://github.com/citum/citum-core), [Hayagriva Cargo manifest](https://github.com/typst/hayagriva/blob/main/Cargo.toml)다. repository/manifest/문서 확인만 했으며 대체 엔진을 시험 설치하거나 성능·서식 품질을 비교하지 않았다.

파싱은 검증된 라이브러리를 재사용한다. 최초 인용 순서와 동일 키의 동일 번호는 원래 Core가 소유할 문서 의미다. 자체 구현 범위는 **제한된 IEEE 항목 서식**이며 이유는 배포 라이선스다. 범용 parser·CSL 엔진·style 언어를 새로 만드는 결정이 아니므로 재사용 원칙을 유지한다. Citation.js의 MIT 고지를 배포에 포함하고, citeproc 및 CSL style/locale XML은 도입하지 않는다.

#### 첫 항목·필드 서식 계약

입력 dialect는 고정한 plugin의 기본 `.bib` 경로이며, 관찰된 CSL type만으로 원래 entry 종류를 추정하지 않는다. 같은 library의 `plugins.input.chain(..., {target: "@biblatex/entries+list"})`로 원래 `type/label/properties`도 얻어 변환 누락·미지원 진단에 사용한다. 이 자료는 원본에서 파생되며 `.bib`를 재작성하지 않는다.

| 원래 `.bib` 종류 → CSL type | 첫 범위 출력 필드 순서(대괄호 번호는 Core가 부여) | 완료 판정의 필수 정보 |
| --- | --- | --- |
| `article` → `article-journal` | 저자, “제목,” 저널, vol., no., pp., 연도, DOI/URL | 저자·제목·저널·연도 |
| `inproceedings`/`conference` → `paper-conference` | 저자, “제목,” in 학회/논문집, 연도, pp., DOI/URL | 저자·제목·학회/논문집·연도 |
| `book` → `book` | 저자(없으면 editor + ed./eds.), 서명, 판, 출판지: 출판사, 연도, DOI/URL | 저자 또는 editor·서명·출판사·연도 |
| `techreport`/`report` → `report` | 저자 또는 기관, “제목,” 기관, 보고서 번호, 연도, DOI/URL | 저자 또는 기관·제목·기관·보고서 번호·연도 |
| `standard` → `standard` | 표준명, 규격 번호, 발행 기관, 연도, DOI/URL | 표준명·규격 번호·기관·연도 |
| `online` → `webpage` | 저자 또는 기관, “제목,” 사이트명(있으면), 연도, [Online]. Available: URL, Accessed: 날짜 | 저자 또는 기관·제목·URL·접근일; 연도 없으면 `n.d.` 표시와 경고 |
| `misc` → `document` | 저자/기관(있으면), “제목,” 발행 정보(있으면), 연도, DOI/URL | 제목·연도·출처(DOI/URL 또는 발행 정보) |

`standard.number`는 시험에서 CSL-JSON으로 전달되지 않았지만 library가 파싱한 원래 `properties.number`에는 남았다. 이 한 필드는 Core 입력 adapter가 규격 번호로 명시적으로 보완하도록 권고한다. 같은 key로 대응되는 원래 entry를 확정할 수 없거나 값이 충돌하면 추측하지 않고 진단한다. `@webpage`는 `@online`과 달리 `document`로 변환됐으므로 첫 allowlist에 넣지 않는다. `proceedings → book`, 알 수 없는 종류 → `document`도 원래 종류 검사 없이 `book`/`misc`로 승인하지 않는다.

첫 공통 필드는 `author/editor`의 `given/family/literal`, `title`, `container-title`, `publisher`, `publisher-place`, `issued`, `accessed`, `volume`, `issue`, `page`, `edition`, `number`, `DOI`, `URL`이다. 확인한 표의 필드로만 출력하며 없는 정보를 생성하지 않는다. 개인 저자의 initials·순서와 기관 저자 보존, 영문 약어·월 표기, 따옴표·마침표·이탤릭 구간은 B 구현 계약의 fixture로 고정한다. 이 ADR의 필드 순서는 권고이며 formatter 구현·출력 정확도 검증을 마쳤다는 뜻이 아니다.

- 첫 범위 밖 종류(`chapter`, `thesis`, `patent`, `dataset`, `software`, `proceedings`, 알 수 없는 원래 entry type 등)는 `bibliography-type-unsupported` 경고와 최소 표시를 제공한다. 일부 type이 변환됐다는 사실은 해당 형식 지원이 아니다.
- 인용된 항목의 필수 필드 누락·복잡한 미지원 날짜/이름·서식에 필요한 미지원 필드는 warning, `complete:false`다. `[n] 저자(있으면). 제목(없으면 key). 연도(없으면 n.d.). DOI/URL(있으면)`의 최소 표시와 미완료 상태를 제공하며 전체 IEEE 형식처럼 표시하지 않는다.
- 원본의 서지 의미 필드가 변환/표시에 빠지면 `bibliography-field-unsupported` 진단으로 이름을 알린다. `note`, `series`, 원래 entry의 미지 필드 등은 첫 범위에서 임의로 제목에 합치지 않는다. `abstract`, `keywords`, `file` 같은 알려진 검색·첨부 metadata는 서식 대상이 아님을 계약에 명시하고 완료 여부를 낮추지 않는다.
- `.bib` 원문과 library가 파싱한 필드를 유지하므로 표시 생략은 저장 유실이 아니다. 출력은 Core의 text/typed emphasis/link read model이며 raw HTML을 주입하지 않는다. 이 최소 표시 정책은 유효한 citation의 외부 자료 상태이며, 지원 밖 Markdown 노드를 부분 편집으로 수용하는 예외가 아니다.

### 6. `check` 진단 계약

**네이티브 유효성·무손실 writeability와 참고문헌 작성 완료 상태를 분리한다.** 기존 unresolved reference·pending Figure처럼, 불완전한 인용 자료를 지원 밖 문법으로 바꾸지 않는다.

| 상황 | 제안 판정·CLI 결과 | 표시·보존 |
| --- | --- | --- |
| 잘못된 `bibliography` 타입·금지 경로 형태, 지원 밖 인용 의미 | native error, exit 1 | Open/inspect/write 거부, 원본 불변 |
| canonical 저장에서 의미 손실 | write failure, exit 1 | 저장 거부 |
| 선언 없음 또는 모든 읽기 성공 후 없는 인용 키 | readiness warning, exit 0 | 키를 보여 주고 unresolved임을 표시 |
| 파일 없음·읽기 권한 없음·정규화 후 Root 이탈·Root 밖 symlink/junction·잘못된 UTF-8 | resource warning, exit 0; 완료 여부 false | 해당 파일 읽기를 거부/실패 처리, `../refs.bib` 등 source 선언은 보존 |
| BibTeX parse 실패·중복 키 | resource warning, exit 0; 완료 여부 false | 조용히 첫/마지막 항목을 선택하지 않음 |
| 인용된 항목의 미지원 원래 종류·필드·필수 정보 누락 | warning, exit 0; 완료 여부 false | Core 번호와 key를 유지하고 결정 5의 최소 표시·미완료 안내 |
| 성공적으로 읽었으나 인용되지 않은 항목 | info, exit 0 | 목록에서 제외하고 `.bib`에서는 삭제하지 않음 |

JSON에는 기존 `validation`, `writeability`와 별도로 citation readiness의 `complete` 및 진단 배열을 제안한다. 진단에는 stable code, severity, 원문 선언 경로, citation key, 가능한 문서 path/line과 BibTeX 위치를 포함한다. 예시 code는 `citation-key-unresolved`, `bibliography-unreadable`, `bibliography-invalid`, `bibliography-key-duplicate`, `bibliography-type-unsupported`, `bibliography-field-unsupported`, `bibliography-field-missing`, `bibliography-entry-uncited`이며 최종 이름은 구현 계약에서 확정한다.

파일 하나라도 읽지 못하면 “없는 키”를 확정할 수 없으므로 미해결과 확인 불가를 구분하고 대량의 잘못된 missing-key 경고를 만들지 않는다. 번호는 자료 조회 성공 여부와 무관하게 문서 키 순서로 계산하므로, 항목을 못 읽었다고 뒤 번호를 당기지 않는다. 그런 항목은 `[n] key`와 실패/확인 불가 상태로 표시하고, 필드를 읽은 미지원 항목은 최소 표시를 제공한다. 완성된 참고문헌처럼 숨기지 않으며 typed citation과 일반 본문 편집을 유지한다. 이는 **지원하는 작성 중 의미의 상태 표시**이며, 미지원 문서를 부분 편집하는 예외가 아니다.

`check`의 exit 0은 출판 준비 완료를 뜻하지 않는다. 기존 의미를 유지하면서 machine consumer는 `complete`를 판단한다. 이번 결정에 새 strict mode나 exit-code 체계를 추가하지 않는다. 서식이 계산되지 않아도 `.md`가 무손실이면 Save/format을 막지 않으며 `.bib`를 고치거나 생성하지 않는다.

### 7. Write path 범위

**첫 범위에서 `.bib` 항목 추가·수정·삭제는 외부 도구가 담당한다. IeumDoc은 `.md`의 bibliography 선언과 인용만 쓴다.**

Core에 선언 갱신, 인용 삽입·키/그룹 갱신·제거 연산을 두고, CLI 단일 명령·`apply-batch`는 같은 연산을 호출한다. 그 다음 Editor가 typed inline과 선택 UI로 연결한다. 정확한 함수·명령 이름은 구현 시 정하며 CLI parity는 생략하지 않는다.

보존만 가능한 raw source 교체, Editor만의 키 조작, `.bib` 자동 export/reformat, Zotero 동기화 writer, 여러 파일의 원자 commit은 첫 범위에서 기각한다. 기존 `.md` revision·temporary sibling·rename과 Core round-trip guard를 유지한다. 인용 편집 때문에 외부 `.bib`의 주석·필드 순서·export 형식이 바뀌지 않는다. `.bib`의 외부 변경은 파생 표시만 갱신하며 그 자체를 문서 편집 Undo에 넣지 않는다.

### 8. 첫 착수 범위와 독립 작업 단위

**최초 사용자 제공 단위 A는 세 role의 단일·다중 키 인용 문서를 정상 열기·보존·저장할 수 있는 최소 수직 기능이다. 자료 해석·목록과 삽입 UI를 별도 후속 단위로 나눈다.**

| 단위 | 진행 순서·범위 | 완료 조건 |
| --- | --- | --- |
| A. 네이티브 의미·보존·번호 | Core에 선언·세 role 계약과 typed read/write·최초 인용 순서 번호 → 얇은 CLI 선언/인용 연산·check/inspect/format → Editor inline 연결 | 세 role의 단일·다중 키, kind·순서가 Save → Reload 후 유지. 단순 표시 `[n]`, narrative 저자 자동 출력 없음. #328과 literal/shorthand 경계를 맞추고 미지원 속성·손실 거부 |
| B. 자료 해석·목록 | Core의 MIT BibTeX 변환·제한된 IEEE 서식·readiness → CLI와 공유 Host의 Root 안 상대 읽기 → Editor의 단일 목록·최소 표시 | 동일 snapshot 결과. 표의 항목 종류·필드·누락·미지원·중복/미해결, `chapters/../refs.bib` 성공과 Root/symlink 탈출 거부, 외부 갱신 경계 확인 |
| C. 저작 UI | A의 Core/CLI 연산을 재사용하는 Editor 검색·선택·삽입·갱신·제거 | Apply/Cancel·selection/history·clipboard·Save → Reload가 의미를 보존. 외부 `.bib`는 불변 |
| D. 후속 확장 | narrative 저자 자동 출력, locator/prefix/suffix 보존, style 선택, 항목 종류 확대·항목 편집을 각각 별도 결정·작업으로 평가 | 각 확장의 실제 요구와 무손실 writer·formatter 근거 확보. 다중 style 엔진은 라이선스와 함께 별도 결정 |

A 내부 구현 순서는 Core → CLI → Editor다. Core의 허용 목록만 넓혀 놓고 Editor가 인용을 누락하는 상태를 배포하지 않는다. A의 Editor는 Core 번호와 확인 가능한 key를 보여 주고 일반 본문 편집 중 인용을 보존한다. 자료 해석이 아직 없으면 readiness는 `not-evaluated`이며 “해결됨”을 보고하지 않는다. #328의 일반 텍스트 수정을 이 ADR에서 구현하거나 인용 수용만으로 대체하지 않는다. 이 수직 단위의 지원·표시·literal 경계가 갖춰지기 전까지 기존 admission을 유지한다.

각 단위는 구현과 관련 design contract를 함께 갱신한다. 의미·round-trip은 Core, CLI는 명령/JSON/파일 불변, Host는 접근 경계, 브라우저는 실제 편집·저장·재열기의 고유 위험을 검증한다. 미지원 내용을 불투명 island로 남기거나 테스트 기준을 약화해 A를 완료 처리하지 않는다.

## Evidence — 직접 실행한 사실

### MyST syntax와 현재 Core 경계

Windows PowerShell 7.6, Node `24.21.0`, pnpm `12.5.1`. 저장소 파일을 바꾸지 않기 위해 이 worktree의 Core source를 외부 임시 script directory로 복사했다. 기존 main checkout에 설치된 `myst-parser@1.7.4`, parser가 사용하는 `myst-roles@1.7.4`, `myst-to-md@1.0.17`, `myst-frontmatter@1.10.1`, `myst-transforms@1.3.51`을 경로로 해석했다. 후보 패키지 신규 설치와 실행 script는 별도 directory를 사용했다.

`mystParse(..., {extensions:{smartquotes:false}})` → `liftMystDirectivesAndRolesTransform` → `writeMd` → 재파싱을 수행했다. 위치만 제외한 AST를 object key 순서와 무관하게 비교하고, 두 번째 serialize의 문자열 안정성도 별도로 확인했다. 복사한 실제 Core의 내부 `parse`/`serialize`와 `parseNativeDocument`도 호출했다.

아래에서 `z = zhang2019`, `s = smith2020`이며 “보존”은 최초 AST와 재파싱 AST의 의미 동등성이다. 표 안의 축약 키는 설명용이다.

| 입력 | parser 결과 | upstream canonical 출력 | 의미 보존 |
| --- | --- | --- | --- |
| `` {cite}`z` `` | narrative `cite` | 동일 | 예 |
| `` {cite:p}`z` `` | parenthetical `citeGroup` | 동일 | 예 |
| `` {cite:t}`z` `` | narrative `citeGroup` | 동일 | 예 |
| `` {cite}`z,s` `` | narrative group | `` {cite:t}`z,s` `` | 예, 원문은 달라짐 |
| `` {cite:p}`z,s` `` | 두 cite | 동일 | 예 |
| `` {cite:t}`z, s` `` | 두 cite | `` {cite:t}`z,s` `` | 예, 공백 정규화 |
| `` {cite:p}`z; s` `` | 두 cite | `` {cite:p}`z,s` `` | 예 |
| `` {cite:p}`see [@z, p. 3]` `` | 잘못 의도한 키 두 개 `see [@z`, `p. 3]` | 공백 제거한 동일 role | AST는 보존하나 locator가 아님 |
| `` {cite:p}`{see}z{p. 3}` `` | `prefix: see`, `suffix: p. 3` | `` {cite:p}`z` `` | **아니오** |
| `[@z]` | parenthetical group | `` {cite:p}`z` `` | 예 |
| `[@z; @s]` | parenthetical group | `` {cite:p}`z,s` `` | 예 |
| `[@z, p. 3]` | `suffix: p. 3` | `` {cite:p}`z` `` | **아니오** |
| `[see @z, p. 3; @s, chap. 2]` | 첫 cite prefix/suffix, 둘째 suffix | `` {cite:p}`z,s` `` | **아니오** |
| `@z` | narrative cite | `` {cite}`z` `` | 예 |
| `@z [p. 3]` | narrative cite의 suffix | `` {cite}`z` `` | **아니오** |
| `[-@z]` | `partial: year` | `` {cite:p}`z` `` | **아니오** |
| `@z and [@s]` | narrative cite + text + parenthetical group | `` {cite}`z` and {cite:p}`s` `` | 예 |

17개 모두 upstream writer 메시지는 없었으며 두 번째 출력은 안정적이었다. 그 중 **5개는 첫 직렬화에서 의미를 잃었다**. 따라서 writer 경고 없음 또는 두 번 format의 idempotency만으로 보존을 증명할 수 없다. Core 내부 serializer는 이 5개를 `prefix/suffix/partial ... became (absent)`의 의미 손실로 거부했다. locator는 별도 typed `locator`가 아니라 `suffix` 문자열로 파싱되었다.

현재 공개 네이티브 경계에서는 인용 17개 모두 `native-content: Unsupported native content: paragraph`로 거부됐다. `bibliography: [refs.bib]`와 일반 본문은 `native-metadata: Native frontmatter supports only ieumdoc and numbering`으로 거부됐다. 외부 `validateProjectFrontmatter`와 `validatePageFrontmatter`는 같은 bibliography 목록을 errors/warnings 없이 반환했다. 외부 validator 성공이 IeumDoc admission 성공은 아니다.

**#327 근거와의 차이:** 기본 role·쉼표 다중 키·잘못 중첩한 locator의 관찰은 재현했다. 다만 “같은 원문으로 다시 쓴다”는 모든 형태에 성립하지 않는다. 다중 `{cite}`는 `{cite:t}`가 되고 공백·구분자가 정규화된다. 미확인 상태였던 대괄호 문법과 role의 중괄호 문법은 실제 prefix/suffix를 파싱하지만 writer에서 손실된다. 이는 parser가 locator 주변 문구를 전혀 표현하지 못한다는 주장과 다르다.

근거 코드: [parse.ts](../../packages/core/src/myst/parse.ts), [serialize.ts](../../packages/core/src/myst/serialize.ts), [native.ts](../../packages/core/src/myst/native.ts), [reference.ts](../../packages/core/src/myst/reference.ts), [footnote.ts](../../packages/core/src/myst/footnote.ts). 기존 reference는 role 복원 후 검증, footnote는 정의·배치·유실 방지를 소유한다. citation을 이들 중 하나로 가장하지 않고 같은 Core 보존 경계를 적용한다.

재실행의 최소 핵심은 다음과 같다. `require`의 기준을 확인할 설치의 Core `package.json`으로 두고, 외부 `.mjs` script에 입력 표의 문법을 반복 공급한다. 다운로드한 패키지 directory 안에 script를 두거나 그 안에서 실행하지 않는다.

```js
// node syntax.mjs <installed-core-directory>
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
const req = createRequire(`${process.argv[2]}/package.json`);
const load = name => import(pathToFileURL(req.resolve(name)));
const { mystParse } = await load("myst-parser");
const { liftMystDirectivesAndRolesTransform: lift } = await load("myst-transforms");
const { writeMd } = await load("myst-to-md");
const { VFile } = await load("vfile");
const parse = source => {
  const tree = mystParse(source, { extensions: { smartquotes: false } });
  lift(tree);
  return tree;
};
const clean = tree => JSON.parse(JSON.stringify(tree,
  (key, value) => key === "position" ? undefined : value));
const source = "[@zhang2019, p. 3]";
const tree = parse(source), file = new VFile();
writeMd(file, structuredClone(tree));
console.log(file.result, file.messages,
  isDeepStrictEqual(clean(tree), clean(parse(String(file.result)))));
// {cite:p}`zhang2019`, [], false
```

### 서식 라이브러리·크기·유지 상태

새 빈 외부 directory의 `deps/`에 아래 명령으로 설치했고, 별도 `scripts/`의 Node script가 `deps` 경로를 인자로 받아 import했다. 저장소의 manifest/lockfile은 건드리지 않았고 lifecycle script도 실행하지 않았다.

```text
npm install --prefix <temp>/deps --ignore-scripts --no-audit --no-fund --save-exact @citation-js/core@0.9.0 @citation-js/plugin-bibtex@0.9.0 @citation-js/plugin-csl@0.9.0 citation-js@0.9.0 citeproc@2.4.63 citation-js-utils@1.2.9 esbuild@0.25.12
node <temp>/scripts/libraries.mjs <temp>/deps
```

크기는 esbuild `0.25.12`, `bundle:true`, `minify:true`, `platform:browser`, `format:iife`, `target:es2022`, sourcemap 없음으로 측정했다. entry가 각 라이브러리를 import하고 `globalThis.probe`에 남겨 제거를 방지했다. gzip은 Node zlib level 9다. **제품 전체 증가량이나 tree-shaking 최적화 한계값이 아닌, 해당 import 조합의 비교용 크기**다.

| import 조합 | minified bytes | gzip bytes | Node 실행 / browser 결과 |
| --- | ---: | ---: | --- |
| **core + plugin-bibtex 0.9.0 (권고 의존성)** | **124,193** | **39,441** | BibTeX 두 항목 → CSL-JSON 성공 / bundle 성공. 새 Core formatter 크기는 미측정 |
| core + plugin-bibtex + plugin-csl 0.9.0 | 713,597 | 167,547 | IEEE bibliography 생성 성공 / bundle 성공 |
| citation-js 0.9.0 전체 | 1,950,868 | 446,763 | 전체 wrapper 별도 기능 시험 없음 / bundle 성공 |
| citeproc 2.4.63 단독 | 379,052 | 97,319 | numeric cluster·목록·재정렬 성공 / bundle 성공 |
| core + plugin-bibtex + citeproc (기각) | 502,911 | 136,434 | 서식·번호 시험 성공 / bundle 성공. 배포 라이선스로 미채택 |
| citation-js-utils 1.2.9 | 955,849 | 261,901 | APA 항목·inline 출력 성공 / bundle 성공 |

이 표는 기각 후보를 포함한 비교 근거다. citeproc 후보 숫자에는 별도로 공급했던 IEEE CSL 17,587 bytes와 `en-US` locale 32,649 bytes가 빠져 있다(합계 gzip 8,238 bytes). 이 XML은 권고 조합에 필요 없으며 배포하지 않는다. Citation.js CSL plugin이 이미 포함하는 기본 styles/locales는 해당 bundle에 포함된다. MyST wrapper는 자체 dependency 범위에 따라 Citation.js `0.7.21`이 설치되었으므로 `0.9.0` 조합과 동일 버전 비교는 아니다. [Citation.js 공식 안내](https://citation.js.org/)는 Node와 browser를 지원한다고 명시한다. **실제 브라우저에서의 실행·CSP·성능은 이번에 검증하지 않았다.** browser bundle 성공을 제품 동작 확인으로 대체하지 않는다.

Node 실행 입력은 가상의 article `zhang2019`(Wei Zhang, Control Study, Test Journal, 2019)와 book `smith2020`(Jane Smith, Systems, 2020) 두 항목이다. citeproc의 `rebuildProcessorState`에 `z → s → [z,s]` cluster를 공급하니 `[1]`, `[2]`, `[1], [2]`가 나왔고 `makeBibliography()`도 같은 대응이었다. `s → z`로 전체 cluster를 재구성하니 Smith가 `[1]`, Zhang이 `[2]`로 바뀌었다. 이는 두 항목 smoke proof이며 모든 항목 종류·중첩·편집 시나리오 검증은 아니다.

같은 IEEE CSL에서 cluster `properties.mode = "composite"`와 `infix = " "`를 사용한 narrative 시험은 `[NO_PRINTED_FORM]   [1]`을 출력했다. 이는 기각 후보의 저자 자동 출력 시험 실패이며, narrative role 자체의 보존 실패는 아니다. 현재 권고는 세 role 모두 Core의 `[n]` 표시를 사용하므로 이 엔진 동작에 의존하지 않는다.

조회일의 유지 상태는 다음과 같다. npm publish 시점과 GitHub repository push는 관찰값이며 미래 유지보수 보장은 아니다.

| 패키지·소스 | license 관찰 | release·repository 관찰 |
| --- | --- | --- |
| Citation.js 0.9.0 및 scoped plugin | MIT, CSL 경로에 citeproc의 별도 조건 존재 | npm 2026-09-18, [repository](https://github.com/citation-js/citation-js) archived=false, pushed 2026-10-11 |
| citeproc 2.4.63 | npm metadata는 CPAL-1.0 OR AGPL-1.0, 배포 LICENSE는 CPAL 1 이상 또는 AGPL 3 이상. 첫 범위 미채택 | npm 2023-04-17, [repository](https://github.com/Juris-M/citeproc-js) archived=false, pushed 2026-07-05. 오래된 npm 버전을 곧바로 유지 중단으로 단정하지 않음 |
| citation-js-utils 1.2.9 | MIT wrapper, Citation.js·citeproc 포함 | npm 2026-09-21, [MyST repository](https://github.com/jupyter-book/mystmd) archived=false, pushed 2026-10-15 |

`npm view myst-cli@1.11.0 dependencies`는 `citation-js-utils:^1.2.9`를 가리켰다. 설치한 wrapper source는 `@citation-js/core`, BibTeX/CSL plugin, `sanitize-html`, `he`, `doi-utils`를 사용하며 APA/Vancouver/Harvard helper를 제공했다. 따라서 MyST 전체 CLI를 Core 의존성으로 가져오거나 wrapper를 독립적 numeric 엔진이라고 가정하지 않는다.

기각 후보 실험에만 쓴 XML의 근거는 [IEEE CSL commit 1ccf469](https://github.com/citation-style-language/styles/blob/1ccf4696be22ea0b55f83cc9163bde3061fddb0a/ieee.csl)와 [en-US locale commit 938c09c](https://github.com/citation-style-language/locales/blob/938c09c164a60b3cfeabe61089f1bf4c3ea6a4ed/locales-en-US.xml)이다. 내려받은 파일 SHA-256은 각각 `b4c7619fc16c45a31e4cc3271eab94ffe83192d3b4c7fc729470a3b459448de3`, `ac864c7c21166b4390d82c31792cdc509400727fa0060b43d8aa17e07f9cb079`였다. 두 파일 모두 CC-BY-SA-3.0 rights를 기재하며 제품 채택 대상이 아니다.

### BibTeX 유형·필드 재확인

새 빈 임시 directory의 `deps/`에 `@citation-js/core@0.9.0`와 `@citation-js/plugin-bibtex@0.9.0`만 `npm install --prefix <temp>/deps --ignore-scripts --no-audit --no-fund --save-exact ...`로 설치했다. 별도 `scripts/probe.mjs`가 `deps` 경로를 인자로 받아 `new Cite(bib).data`를 실행했다. 아래 18개 원래 종류 각각에 key·저자·제목·연도 등을 둔 합성 입력을 공급했다.

| `.bib` entry 종류 | 실제 CSL-JSON `type` |
| --- | --- |
| `article` | `article-journal` |
| `inproceedings`, `conference` | `paper-conference` |
| `book`, `proceedings` | `book` |
| `techreport`, `report` | `report` (`techreport`에는 `genre: techreport`도 존재) |
| `standard` | `standard` |
| `online` | `webpage` |
| `misc`, `webpage`, `unknownkind` | `document` |
| `incollection`, `inbook` | `chapter` |
| `phdthesis` | `thesis` |
| `patent` | `patent` |
| `dataset` | `dataset` |
| `software` | `software` |

유형당 필요한 필드만 넣은 후속 7개 입력도 별도로 실행했다. article의 `journal → container-title`, `number → issue`, `pages 4--9 → page 4-9`, inproceedings의 `booktitle → container-title`, techreport의 `institution → publisher`, `number → number`를 확인했다. `misc.howpublished`는 `publisher`로 갔다. 한 입력에 journal/booktitle 등 서로 다른 종류의 필드를 모두 넣은 첫 탐색을 실제 export의 우선순위 계약으로 삼지 않는다.

다음 standard 입력은 CSL-JSON에서 `type: standard`, `publisher: Standards Body`, `title`, `issued`를 얻었으나 `number`와 `customfield`는 없었다. 같은 library의 중간 entry에는 두 필드가 모두 남았다. 따라서 원래 종류/필드를 같이 확인하는 adapter가 필요하다. 이는 파서를 새로 작성해야 한다는 근거가 아니다.

```js
// 외부 scripts/details.mjs; node details.mjs <absolute-temp-deps>
import { createRequire } from "node:module";
const req = createRequire(`${process.argv[2]}/package.json`);
const { Cite, plugins } = req("@citation-js/core");
req("@citation-js/plugin-bibtex");
const bib = "@standard{std, title={Safety Standard}, organization={Standards Body}, number={STD-42}, year={2024}, customfield={opaque}}";
console.log(new Cite(bib).data);
console.log(plugins.input.chain(bib, { target: "@biblatex/entries+list" }));
// 두 번째 결과: type=standard, label=std,
// properties.number=STD-42, properties.customfield=opaque
```

`npm ls --all`에서 citeproc·plugin-csl은 없었다. 설치된 7개 패키지의 manifest license는 Core/BibTeX/date/name/sync-fetch-undici/whatwg-mimetype가 MIT, `moo@0.5.3`가 BSD-3-Clause였다. 현재 권고 입력 경로의 의존 트리 확인이며 향후 버전의 영구 보증은 아니다. 새 Core numbering·IEEE formatter는 이번에 구현하거나 시험하지 않았다.

### 일반 `@`와 CLI 재확인

고정 MyST 버전으로 parser → lift → writer → 재파싱을 다시 실행하고, `check --format json`과 `insert-block --at end --text <literal>`를 실제 CLI로 실행했다. 실행 코드가 있는 main checkout의 HEAD는 같은 `3417f5a`이고 worktree와 Core/CLI source 36개 파일의 SHA-256이 모두 같았다. fixture와 script만 외부 임시 directory에 썼으며 저장소 파일은 수정하지 않았다.

| 일반 본문 | parser·upstream writer 관찰 | 현재 CLI `check` / literal `insert-block` |
| --- | --- | --- |
| `Contact @kim for details.` | `kim`을 narrative cite로 파싱. writer는 `` Contact {cite}`kim` for details. `` | 둘 다 exit 1; check는 `native-content`, insert는 paragraph round-trip 손실 |
| `Contact \@kim for details.` | 첫 parse는 text, writer는 `Contact @kim for details.`로 escape 제거, 재파싱은 cite | 둘 다 exit 1; 의미 손실. CLI text의 backslash는 source escape가 아니라 literal 입력임 |
| `Use @param and @username.` | 두 narrative cite로 파싱하고 두 `{cite}` role로 출력 | 둘 다 exit 1 |
| `mail me at a@b.com` | text 유지, writer 결과도 동일 | 둘 다 exit 0 |

실패한 CLI 쓰기는 모두 fixture의 SHA-256이 그대로였다. check는 모든 입력에서 파일을 바꾸지 않았다. `a@b.com`의 성공한 삽입만 파일이 바뀌었다. 이 결과는 [#328](https://github.com/ieumbird/ieumdoc/issues/328)의 재현이며 Visual Editor 재현·수정 완료 근거는 아니다.

세 role 각각의 단일·다중 키 6개를 다시 실행했을 때 위치를 제외한 AST가 모두 보존됐다. 다중 `{cite}`는 `{cite:t}`로 정규화됐고 kind·키·순서에는 차이가 없었다. bare `@key`와 `[@key]`도 기본 MyST에서는 인용으로 파싱되고 role로 직렬화됐다. 이 사실은 shorthand를 첫 네이티브 인용 계약으로 채택했다는 뜻이 아니다.

추가 메모리 내 옵션 시험 `extensions: {smartquotes:false, citations:false}`에서는 `@kim`, `@param`, `@username`, `@key`, `[@key]`, `[@key, p. 3]`가 모두 text가 되었고 여섯 role 입력은 기존 의미로 유지됐다. 실제 Core의 parse 옵션이나 writer는 변경하지 않았다. 이 옵션은 구분 가능한 기능 경계의 근거일 뿐, 대괄호 입력의 의미를 보호하는 admission과 일반 텍스트 writer까지 검증한 #328 해결책은 아니다.

## Consequences

기대 효과는 키 기반 인용과 외부 BibTeX를 연결하여 번호를 손으로 맞추는 비용을 없애고, 동일 Core 계산을 CLI와 Editor가 공유하는 것이다. 결정 당시 기대 효과이며 사용자 작업 시간 개선을 측정한 결과는 아니다. 현재 구현 검증은 Citations 계약을 따른다.

비용은 함께 전달할 `.bib`, 문서별 읽기 경계의 명시적 전달, 외부 변경 snapshot과 제한된 IEEE formatter의 유지·검증이다. 공용 상위 `.bib`는 허용하지만 무제한 파일 접근으로 확대하지 않는다. 세 role은 보존하되 모두 번호로 표시하고, author-year·locator·prefix/suffix/partial은 보류한다. 제한 밖 서지 항목은 최소 표시와 진단을 제공하며 출판 준비 완료로 보이지 않게 한다. 일반 `@` 결함 #328의 해결과 인용 표현의 경계는 Citations 계약을 따른다. 현재 `.md`의 표식·지원 판정·의미 손실 방지를 완화하여 비용을 숨기지 않는다.

## Open questions and adoption gates

citeproc 미채택·상위 상대 경로·세 role 수용을 포함한 위 결정은 2026-10-20에 승인되었다. 아래 항목은 결정을 뒤집는 미결 사항이 아니라 각 구현 단위의 착수·완료 조건이다.

배포 라이선스 쟁점은 **citeproc 미채택으로 해소하고 Citation.js MIT 및 전이 의존성의 일반 고지만 남긴다.** 실제 트리에는 `moo`의 BSD-3-Clause도 있다. CSL style/locale XML의 채택·고지는 필요 없다. 이 항목을 미해결 엔진 채택 승인으로 남기지 않는다.

1. **제한 서식의 정확한 fixture:** 결정 5의 항목 종류·필드 순서에 맞춰 initials·기관 저자·판·날짜·punctuation·최소 표시를 고정해야 한다. 실제 Zotero/Better BibTeX export, TeX 문자열·한글·crossref·중복 키도 검증한다. parser 유형 변환 성공을 formatter 완성으로 간주하지 않는다.
2. **#328과 shorthand 경계:** 일반 텍스트 `@`의 parse/write, 대괄호 citation-like 입력의 명시적 안내/거부, role의 의미 보존을 함께 확인해야 한다. 이 ADR에서 #328을 해결했다고 하지 않는다.
3. **Host context·리소스 한도:** local Host의 문서별 읽기 폴더 전달과 재열기 UX, CLI 옵션명, 파일 수·바이트·항목 수 한도·오류 위치·읽는 중 변경 검출은 B 구현 계약에서 구체화한다. HTTP의 고정 Root 정책을 변경하지 않는다.
4. **후속 의미 확장:** narrative 저자 자동 출력·locator/prefix/suffix/partial·스타일 선택은 별도 요구와 보존 근거가 필요하다. style 엔진은 라이선스와 함께 별도 결정한다.
5. **실제 제품 검증:** Browser/Node 동일 출력, 접근성·큰 bibliography 성능, HTTP/Windows Desktop의 상위 파일 성공·Root 탈출 거부, Save → Reload·복사/붙여넣기는 미검증이다. 당시 A/B/C의 완료 조건이다. 현재 A·B 실행 결과와 미검증 플랫폼은 Citations 계약을 따른다.
