# ADR-0008: 인용·참고문헌 표현 방식 결정안

- Status: Draft
- Last verified: 2026-10-20 (master `3417f5ae949506f4d5acf4cb56186e6d219a5dad`의 계약·코드 대조, 고정 MyST 패키지 실행, 서식 후보의 Node 실행·browser bundle 측정. 실제 브라우저·제품 통합 검증은 미실행).
- Authority: 사람의 승인을 기다리는 권고안이며 현재 구현 계약이 아니다. [AGENTS.md](../../AGENTS.md), [ADR-0002](0002-document-persistence-semantic-ownership.md), [ADR-0006](0006-native-document-boundary.md)가 우선한다. 현재 지원은 [Native document support](../design/document-support-v1.md)를 따른다.
- Related: [결정 이슈 #327](https://github.com/ieumbird/ieumdoc/issues/327), [사용자 요구 #265](https://github.com/ieumbird/ieumdoc/issues/265), [Discussion #154](https://github.com/ieumbird/ieumdoc/discussions/154), [#155](https://github.com/ieumbird/ieumdoc/discussions/155), [#257](https://github.com/ieumbird/ieumdoc/discussions/257), [Filesystem Host boundary](../design/filesystem-host-boundary-v1.md).

## Context

#265의 문제는 본문 `[1]` 평문과 번호 목록을 사람이 따로 관리해야 한다는 것이다. #154는 CLI, #155는 Visual Editor에서 이 마찰을 보고했고, #257에서도 배치 저작 후 인용 부재가 남았다. #154의 `[@key]` 삽입·읽기 전용 보존 경험은 이전 commit `9545731`의 관찰이다. ADR-0006 이후에는 미지원 내용이 있는 문서 전체를 거부하므로 그 경로를 복원하지 않는다.

현재 `native.ts`의 메타데이터 검증은 `ieumdoc`, `numbering`만 받는다. `projectInlineContent`가 인용을 지원하지 않아 인용 문단은 `native-content`로 거부된다. 내부 MyST parser/writer의 처리 능력, 네이티브 지원 판정, 외부 파일 접근, 서식 표시를 각각 구분해야 한다.

이 작업은 결정 문서와 인덱스만 변경한다. 구현·테스트·의존성·현재 design contract는 변경하지 않으며, 아래 API와 진단 이름은 제안이다.

## Decision — 권고안

### 1. 참고문헌 데이터 위치

**문서 directory 안의 별도 UTF-8 BibTeX `.bib` 파일을 명시적으로 참조하고 읽기만 한다.**

| 선택지 | plain-text SSOT·Git diff | MyST·외부 관리 도구 | 파일 접근·비용 | 판단 |
| --- | --- | --- | --- | --- |
| 문서 옆 `.bib` 파일 | 본문 인용 키와 서지 항목 변경이 분리되어 읽기 좋음. 전달 시 `.md`와 `.bib`가 함께 필요 | MyST가 직접 사용하는 형식. Zotero 등의 export와 연결 가능 | Host에 제한된 의존 파일 읽기가 필요 | 권고 |
| Frontmatter 안 서지 항목 목록 | 한 파일로 이동 가능하나 긴 목록과 본문 편집이 섞임 | 자체 YAML 항목 스키마 또는 CSL-JSON 변환이 필요. MyST `bibliography`는 항목 목록 필드가 아님 | 추가 파일 I/O는 없으나 독자 스키마·항목 편집 책임 증가 | 첫 범위에서 기각 |
| 별도 CSL-JSON 파일 | plain text이며 processor 입력과 가까움. JSON diff가 길어질 수 있음 | 여러 관리 도구가 지원하지만 MyST BibTeX 경로와 직접 같지 않음 | `.bib`와 동일한 Host 경계에 다른 입력 형식까지 추가 | 후속 실제 요구가 있을 때 재검토 |
| DOI 목록·원격 URL·Zotero API·DB | 네트워크 응답이나 별도 저장소가 권위가 되면 재현성 저하 | 자동 수집은 편리하나 인증·offline·갱신 시점 계약 필요 | 네트워크·cache·동기화 책임이 추가됨 | 첫 범위에서 기각 |

`.md`는 인용의 키·순서·형태·파일 선언의 SSOT이고 `.bib`는 서지 항목의 외부 plain-text 원본이다. CSL-JSON, 번호, 렌더링 목록은 이 두 원본에서 재생성하며 저장하지 않는다. 같은 서지 항목을 Frontmatter나 Editor 저장소에 중복 보관하지 않는다. 이는 ADR-0002의 `.md` 중심 SSOT에 **명시적 외부 서지 의존성**을 추가하는 제안이다. 완전한 문서 전달 단위가 `.md` 하나를 넘는다는 점도 사람이 승인해야 하며, Draft만으로 기존 결정을 확대하지 않는다.

[Better BibTeX 자동 export 문서](https://retorque.re/zotero-better-bibtex/exporting/auto/)는 Zotero collection/library 변경을 export 파일에 반영하는 경로를 제공한다. 권고하는 연동은 사용자가 문서 directory로 export하는 방식이다. IeumDoc은 Zotero DB·API에 쓰거나 export 파일을 재정렬하지 않는다. 실제 Zotero export와 충돌·키 안정성은 이번에 시험하지 않았다.

### 2. 참조 선언과 Host 경계

**문서 Frontmatter의 MyST `bibliography` 문자열 목록을 채택한다.** 별도 설정 파일, 암묵적 `.bib` 검색, project 설정 상속은 도입하지 않는다.

```yaml
---
ieumdoc: 1
bibliography:
  - references.bib
  - refs/standards.bib
---
```

- 필드는 생략할 수 있다. 있으면 비어 있지 않은 상대 `.bib` 경로의 목록으로 제한한다. 단일 문자열 coercion, inline 항목, glob, URL, absolute/drive/UNC 경로는 첫 범위에서 받지 않는다. `/` 구분과 선택적 `./`를 쓰며 빈 값·중복 선언·`..` segment를 거부한다. YAML 중복 키·표식·Unicode 검증은 유지한다.
- Core는 선언 문자열과 전달받은 리소스의 source/status만 다룬다. Core 안에 `fs`, absolute path, Root, HTTP, Zotero client를 넣지 않는다. Host/CLI가 Core에서 얻은 선언을 읽어 다시 Core에 공급한다. BibTeX 해석·키 연결·완료 진단·서식 계산은 Core가 소유한다.
- Vite 개발 Host와 Desktop은 현재 local 파일 접근 정책을 유지하되, 새 bibliography 읽기는 열린 `.md`의 실제 directory와 그 하위로 제한한다. HTTP Host는 여기에 **기존 고정 Root allowlist 검사도 함께** 적용한다. 화면에서 선택한 folder를 권한 Root로 삼지 않는다.
- lexical 경로와 real path를 모두 확인하고, symlink/junction을 통한 경계 밖 접근도 거부한다. HTTP가 여러 Root를 허용해도 다른 Root나 문서 상위 directory의 `.bib`를 직접 읽도록 확장하지 않는다. CLI도 같은 문서 상대 의존 파일 범위를 따른다.
- 공유 Host handler를 재사용할 새 읽기 경로가 필요하다. 기존 document endpoint가 `.bib`를 이미 읽는다고 가정하거나, media endpoint로 임의 텍스트를 우회 제공하지 않는다. Browser는 Host가 전달한 text/status를 받는다.
- 한 번의 분석은 선언 순서대로 읽은 불변 source snapshot을 사용한다. 파일마다 읽기 결과·revision을 구분하고, 읽는 도중 변경이 감지되면 재시도 또는 명시적 실패를 반환한다. 여러 외부 writer 사이의 원자 snapshot은 보장하지 않는다.
- Open/Reload와 CLI 실행 때 새 snapshot을 읽는다. 첫 범위에 watcher를 넣지 않는다. 외부 변경 후 화면은 Reload 전까지 이전 snapshot의 표시라는 점을 알린다. `.md` 저장은 `.bib`를 고정하거나 덮어쓰지 않는다.

MyST의 선언 이름과 자료 형식은 재사용하지만, 원격 bibliography와 project 탐색까지 지원한다는 뜻은 아니다. [MyST 안내](https://mystmd.org/guide/citations)의 더 넓은 경로 허용 범위와 구분한다.

### 3. 지원할 인용 형태

**첫 제품 범위는 parenthetical 단일·다중 키 인용으로 제한하고, canonical 표현은 쉼표로 묶은 `{cite:p}` role로 한다.**

| 형태 | 권고 |
| --- | --- |
| `` {cite:p}`zhang2019` ``, `` {cite:p}`zhang2019,smith2020` `` | 지원. 키와 그룹 내 순서를 Core 의미로 보존 |
| `[@zhang2019]`, `[@zhang2019; @smith2020]`, role의 세미콜론 구분 | 같은 지원 의미로 파싱되는 대체 철자는 수용하고 canonical role로 정규화 |
| `` {cite}`zhang2019` ``, `` {cite:t}`zhang2019` ``, `@zhang2019` | narrative 의미이므로 첫 범위에서 보류. parenthetical로 조용히 바꾸지 않음 |
| locator·prefix·suffix, 저자/연도만 표시하는 partial 인용 | 첫 범위에서 보류. 파싱 가능성과 무손실 저장 가능성은 다름 |
| DOI 자동 조회, 그 밖의 role 옵션·속성 | 첫 범위에서 보류 |

고정 버전에서 단순 narrative 인용의 round-trip은 가능하다. 보류 이유는 파서 부재가 아니라 아래 IEEE 서술형 표시 실험의 실패와 첫 제품 범위다. 문법을 근거 없이 재구현하거나 문자열 치환으로 `{cite}`를 `{cite:p}`처럼 취급하지 않는다. 네이티브 판정은 허용한 노드 의미·속성·중첩을 기준으로 하며, 같은 의미인 다른 철자를 단순 문자열 whitelist로 배제하지 않는다.

Core read model은 인용 그룹과 키를 typed inline 의미로 노출한다. 내부 MyST `cite`/`citeGroup`은 `packages/core/src/myst/` 경계에 둔다. 다른 문서의 label target·미주 identifier와 bibliography key namespace를 섞지 않는다. 키는 원문의 label을 보존하고, 해석 단계에서 임의 lowercase·키 재생성을 하지 않는다. 모호하거나 canonical 재파싱으로 식별자가 변하는 경우 거부한다.

locator가 필요한 사용자는 현재 단계에서는 주변 일반 문장으로 쓸 수 있으나, 이를 구조화 locator 지원이라고 부르지 않는다. prefix/suffix/partial을 가진 미지원 문서는 ADR-0006대로 전체 거부한다. 미지원 노드를 read-only island로 보존하는 경로는 추가하지 않는다.

### 4. 번호·인용·목록 스타일

**첫 스타일은 고정된 IEEE numeric CSL과 `en-US` locale 하나로 제공하고 사용자 스타일 선택은 보류한다.**

- Core가 문서 읽기 순서와 그룹 내 키 순서로 citation cluster를 processor에 전달한다. 최초 인용 순서로 번호를 계산하며 같은 키는 같은 번호를 재사용한다. `.bib`에 적힌 항목 순서가 인용 번호를 정하지 않는다.
- 목록에는 인용된 항목만 한 번씩 표시한다. 문서 말미, 기존 미주 구역 뒤의 파생 References 영역을 권고한다. 본문에 일반 heading·번호 목록을 써 넣거나 목록 번호를 영속화하지 않는다. 별도 bibliography directive·여러 목록·수동 위치 선택은 보류한다.
- IEEE 파일과 locale의 정확한 revision을 고정하고 배포물에 포함하여 offline으로 계산한다. 전역 사용자 설정이나 네트워크에서 받은 최신 스타일에 따라 같은 문서의 표시가 바뀌지 않게 한다.
- author-year와 임의 CSL 업로드는 후속 결정이다. 스타일 선택을 추가할 때는 문서에 선언되는 지속적 의미로 설계하고 Core/CLI에서 먼저 표현한다.

“IEEE”는 선택한 CSL의 인용·목록 출력 범위다. IEEE 투고 양식, 2단 편집, PDF, 수식·그림 표기나 학회별 완전한 규정 준수를 보장하지 않는다. MyST 사이트 기본 표시와 IeumDoc의 numeric 표시가 같다는 보장도 없다.

### 5. 서식 처리 의존성

**BibTeX 입력은 `@citation-js/core` + `@citation-js/plugin-bibtex`, 문서 전체 cluster와 서식은 `citeproc`를 직접 사용하는 조합을 권고한다.** 직접 numbering·BibTeX parser·CSL 엔진을 만들지 않는다. 실제 도입 버전 고정과 라이선스 고지 방법은 구현 착수 조건이다.

| 후보 | 역할·장점 | 제한·기각 이유 |
| --- | --- | --- |
| Citation.js 전체 `citation-js` | 여러 입력과 CSL을 한 번에 제공 | 사용하지 않는 입력 plugin까지 포함. 첫 범위에서는 큰 비용 |
| core + BibTeX + CSL plugin | 작은 공개 API, 서식·locale 관리 편리 | 기본 styles/locales를 포함. 문서 전체 cluster 관리에는 직접 processor 사용이 더 명시적 |
| **core + BibTeX + citeproc** | 입력 변환과 문서 processor 역할 분리. 필요한 style/locale만 공급 | adapter와 resource 고지 필요. 권고 조합 |
| citeproc 단독 | CSL cluster·번호·목록 엔진 | BibTeX parser가 아니므로 단독 채택으로 입력 문제가 해결되지 않음 |
| MyST `citation-js-utils` | MyST가 사용하는 변환·HTML 정리·저자연도 helper | 내부적으로 Citation.js/CSL을 사용. IeumDoc이 원하지 않는 renderer 관례·sanitizer도 포함하며 독립 엔진이 아님 |
| 직접 `[n]` 및 참고문헌 문자열 생성 | 작은 시작 코드 | 저자·연도·항목 종류·punctuation 규칙을 자체 유지하게 됨. 검증된 라이브러리 재사용 원칙에 맞지 않음 |

Citation.js와 MyST wrapper의 MIT 표기만 보고 의존 체인을 MIT로 판단하지 않는다. 실제 `citeproc@2.4.63`의 npm metadata는 `CPAL-1.0 OR AGPL-1.0`이지만, 배포된 `LICENSE`와 [upstream LICENSE](https://github.com/Juris-M/citeproc-js/blob/master/LICENSE)는 CPAL 1 이상 또는 AGPL 3 이상을 기재한다. **메타데이터 불일치를 기록하고, 도입 전에 배포에 적용할 선택 조건과 고지 방법을 확인한다.** 이 ADR은 법률 검토나 배포 적합성 확인을 대신하지 않는다. IEEE CSL과 locale도 별도의 CC-BY-SA-3.0 표시를 유지해야 한다.

### 6. `check` 진단 계약

**네이티브 유효성·무손실 writeability와 참고문헌 작성 완료 상태를 분리한다.** 기존 unresolved reference·pending Figure처럼, 불완전한 인용 자료를 지원 밖 문법으로 바꾸지 않는다.

| 상황 | 제안 판정·CLI 결과 | 표시·보존 |
| --- | --- | --- |
| 잘못된 `bibliography` 타입·금지 경로 형태, 지원 밖 인용 의미 | native error, exit 1 | Open/inspect/write 거부, 원본 불변 |
| canonical 저장에서 의미 손실 | write failure, exit 1 | 저장 거부 |
| 선언 없음 또는 모든 읽기 성공 후 없는 인용 키 | readiness warning, exit 0 | 키를 보여 주고 unresolved임을 표시 |
| 파일 없음·읽기 권한 없음·Root 밖 symlink·잘못된 UTF-8 | resource warning, exit 0; 완료 여부 false | 해당 파일 읽기를 거부/실패 처리, source 선언은 보존 |
| BibTeX parse 실패·중복 키·지원하지 못하는 항목 데이터 | resource warning, exit 0; 완료 여부 false | 조용히 첫/마지막 항목을 선택하지 않음 |
| 성공적으로 읽었으나 인용되지 않은 항목 | info, exit 0 | 목록에서 제외하고 `.bib`에서는 삭제하지 않음 |

JSON에는 기존 `validation`, `writeability`와 별도로 citation readiness의 `complete` 및 진단 배열을 제안한다. 진단에는 stable code, severity, 원문 선언 경로, citation key, 가능한 문서 path/line과 BibTeX 위치를 포함한다. 예시 code는 `citation-key-unresolved`, `bibliography-unreadable`, `bibliography-invalid`, `bibliography-key-duplicate`, `bibliography-entry-uncited`이며 최종 이름은 구현 계약에서 확정한다.

파일 하나라도 읽지 못하면 “없는 키”를 확정할 수 없으므로 미해결과 확인 불가를 구분하고 대량의 잘못된 missing-key 경고를 만들지 않는다. 리소스 해석이 불완전하면 완성된 참고문헌인 것처럼 부분 번호 목록을 표시하지 않는다. typed citation 자체와 일반 본문 편집은 유지하고, 계산 결과 대신 키와 실패 상태를 보여 준다. 이는 **지원하는 작성 중 의미의 상태 표시**이며, 미지원 문서를 부분 편집하는 예외가 아니다.

`check`의 exit 0은 출판 준비 완료를 뜻하지 않는다. 기존 의미를 유지하면서 machine consumer는 `complete`를 판단한다. 이번 결정에 새 strict mode나 exit-code 체계를 추가하지 않는다. 서식이 계산되지 않아도 `.md`가 무손실이면 Save/format을 막지 않으며 `.bib`를 고치거나 생성하지 않는다.

### 7. Write path 범위

**첫 범위에서 `.bib` 항목 추가·수정·삭제는 외부 도구가 담당한다. IeumDoc은 `.md`의 bibliography 선언과 인용만 쓴다.**

Core에 선언 갱신, 인용 삽입·키/그룹 갱신·제거 연산을 두고, CLI 단일 명령·`apply-batch`는 같은 연산을 호출한다. 그 다음 Editor가 typed inline과 선택 UI로 연결한다. 정확한 함수·명령 이름은 구현 시 정하며 CLI parity는 생략하지 않는다.

보존만 가능한 raw source 교체, Editor만의 키 조작, `.bib` 자동 export/reformat, Zotero 동기화 writer, 여러 파일의 원자 commit은 첫 범위에서 기각한다. 기존 `.md` revision·temporary sibling·rename과 Core round-trip guard를 유지한다. 인용 편집 때문에 외부 `.bib`의 주석·필드 순서·export 형식이 바뀌지 않는다. `.bib`의 외부 변경은 파생 표시만 갱신하며 그 자체를 문서 편집 Undo에 넣지 않는다.

### 8. 첫 착수 범위와 독립 작업 단위

**최초 사용자 제공 단위는 제한된 parenthetical 인용 문서를 정상 열기·보존·저장할 수 있는 최소 수직 기능이다. 목록과 삽입 UI를 별도 후속 단위로 나눈다.**

| 단위 | 진행 순서·범위 | 완료 조건 |
| --- | --- | --- |
| A. 네이티브 의미·보존 | Core에 선언·parenthetical citation 계약과 typed read/write → 얇은 CLI 선언/인용 연산·check/inspect/format → Editor의 최소 inline 표현·보존 연결 | 지원 의미만 수용. 선언/키/그룹 순서가 편집·Save → Reload 후 유지. 미지원 속성·손실 입력은 실패하고 원본 불변 |
| B. 자료 해석·번호·목록 | Core의 BibTeX snapshot 해석·CSL·readiness → CLI와 공유 Host의 제한된 읽기 → Editor의 본문 번호·단일 목록 | CLI/Editor 동일 snapshot 결과. 재인용·그룹·순서 변경과 중복/미해결을 검증. 경로·Root·symlink·읽기 실패 및 외부 갱신 경계 확인 |
| C. 저작 UI | A의 Core/CLI 연산을 재사용하는 Editor 검색·선택·삽입·갱신·제거 | Apply/Cancel·selection/history·clipboard·Save → Reload가 의미를 보존. 외부 `.bib`는 불변 |
| D. 후속 확장 | narrative 표시, locator/prefix/suffix 보존, style 선택, 항목 편집을 각각 별도 결정·작업으로 평가 | 각 확장의 실제 요구와 무손실 writer·formatter 근거 확보 |

A 내부 구현 순서는 Core → CLI → Editor다. Core의 허용 목록만 넓혀 놓고 Editor가 인용을 누락하는 상태를 배포하지 않는다. A의 최소 Editor는 지원하는 typed citation을 키로 명시적으로 표시하며 일반 본문 편집 중 보존한다. 자료 해석이 아직 없으면 readiness는 `not-evaluated`이며 “해결됨”을 보고하지 않는다. 이 수직 단위의 지원·표시가 갖춰지기 전까지 기존 admission을 유지한다.

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
| core + plugin-bibtex 0.9.0 | 124,193 | 39,441 | BibTeX 두 항목 → CSL-JSON 성공 / bundle 성공 |
| core + plugin-bibtex + plugin-csl 0.9.0 | 713,597 | 167,547 | IEEE bibliography 생성 성공 / bundle 성공 |
| citation-js 0.9.0 전체 | 1,950,868 | 446,763 | 전체 wrapper 별도 기능 시험 없음 / bundle 성공 |
| citeproc 2.4.63 단독 | 379,052 | 97,319 | numeric cluster·목록·재정렬 성공 / bundle 성공 |
| **core + plugin-bibtex + citeproc** | **502,911** | **136,434** | 권고 처리 경로 실행 성공 / bundle 성공 |
| citation-js-utils 1.2.9 | 955,849 | 261,901 | APA 항목·inline 출력 성공 / bundle 성공 |

숫자에는 별도로 공급하는 IEEE CSL 17,587 bytes와 `en-US` locale 32,649 bytes가 빠져 있다. 두 XML을 합쳐 gzip하면 8,238 bytes다. Citation.js CSL plugin이 이미 포함하는 기본 styles/locales는 해당 bundle에 포함된다. MyST wrapper는 자체 dependency 범위에 따라 Citation.js `0.7.21`이 설치되었으므로 `0.9.0` 조합과 동일 버전 비교는 아니다. [Citation.js 공식 안내](https://citation.js.org/)는 Node와 browser를 지원한다고 명시한다. **실제 브라우저에서의 실행·CSP·성능은 이번에 검증하지 않았다.** browser bundle 성공을 제품 동작 확인으로 대체하지 않는다.

Node 실행 입력은 가상의 article `zhang2019`(Wei Zhang, Control Study, Test Journal, 2019)와 book `smith2020`(Jane Smith, Systems, 2020) 두 항목이다. citeproc의 `rebuildProcessorState`에 `z → s → [z,s]` cluster를 공급하니 `[1]`, `[2]`, `[1], [2]`가 나왔고 `makeBibliography()`도 같은 대응이었다. `s → z`로 전체 cluster를 재구성하니 Smith가 `[1]`, Zhang이 `[2]`로 바뀌었다. 이는 두 항목 smoke proof이며 모든 항목 종류·중첩·편집 시나리오 검증은 아니다.

같은 IEEE CSL에서 cluster `properties.mode = "composite"`와 `infix = " "`를 사용한 narrative 시험은 `[NO_PRINTED_FORM]   [1]`을 출력했다. **서술형 지원 성공으로 판단하지 않는다.** Core에서 독자 저자명 formatter를 급히 만들기보다 첫 범위를 parenthetical로 제한하고 narrative에 맞는 CSL 사용법·계약을 후속 검증한다.

조회일의 유지 상태는 다음과 같다. npm publish 시점과 GitHub repository push는 관찰값이며 미래 유지보수 보장은 아니다.

| 패키지·소스 | license 관찰 | release·repository 관찰 |
| --- | --- | --- |
| Citation.js 0.9.0 및 scoped plugin | MIT, CSL 경로에 citeproc의 별도 조건 존재 | npm 2026-09-18, [repository](https://github.com/citation-js/citation-js) archived=false, pushed 2026-10-11 |
| citeproc 2.4.63 | npm metadata와 LICENSE의 AGPL 버전 불일치, 위 결정 5 참조 | npm 2023-04-17, [repository](https://github.com/Juris-M/citeproc-js) archived=false, pushed 2026-07-05. 오래된 npm 버전을 곧바로 유지 중단으로 단정하지 않음 |
| citation-js-utils 1.2.9 | MIT wrapper, Citation.js·citeproc 포함 | npm 2026-09-21, [MyST repository](https://github.com/jupyter-book/mystmd) archived=false, pushed 2026-10-15 |

`npm view myst-cli@1.11.0 dependencies`는 `citation-js-utils:^1.2.9`를 가리켰다. 설치한 wrapper source는 `@citation-js/core`, BibTeX/CSL plugin, `sanitize-html`, `he`, `doi-utils`를 사용하며 APA/Vancouver/Harvard helper를 제공했다. 따라서 MyST 전체 CLI를 Core 의존성으로 가져오거나 wrapper를 독립적 numeric 엔진이라고 가정하지 않는다.

실험 XML의 고정 근거는 [IEEE CSL commit 1ccf469](https://github.com/citation-style-language/styles/blob/1ccf4696be22ea0b55f83cc9163bde3061fddb0a/ieee.csl)와 [en-US locale commit 938c09c](https://github.com/citation-style-language/locales/blob/938c09c164a60b3cfeabe61089f1bf4c3ea6a4ed/locales-en-US.xml)이다. 내려받은 파일 SHA-256은 각각 `b4c7619fc16c45a31e4cc3271eab94ffe83192d3b4c7fc729470a3b459448de3`, `ac864c7c21166b4390d82c31792cdc509400727fa0060b43d8aa17e07f9cb079`였다. 두 파일 모두 CC-BY-SA-3.0 rights를 기재한다.

## Consequences

기대 효과는 키 기반 인용과 외부 BibTeX를 연결하여 번호를 손으로 맞추는 비용을 없애고, 동일 Core 계산을 CLI와 Editor가 공유하는 것이다. 실제 제품 구현이나 사용자 작업 시간 개선을 측정한 결과는 아니다.

비용은 문서와 함께 전달할 `.bib`, 제한된 Host 읽기 경로, 외부 변경 snapshot, formatter 배포 크기와 별도 라이선스 처리다. 첫 범위가 parenthetical·고정 IEEE이므로 narrative/author-year/locator를 쓰는 외부 MyST 문서는 계속 거부된다. 현재 `.md`의 표식·지원 판정·의미 손실 방지를 완화하여 이 비용을 숨기지 않는다.

## Open questions and adoption gates

아래는 권고안과 구분되는 미해결 항목이다. 사람의 ADR 승인이 먼저이며, 이 문서를 Accepted로 자동 변경하지 않는다.

1. **제품 범위 승인:** 외부 `.bib`를 포함한 전달 단위, parenthetical 우선·고정 IEEE와 파생 목록의 말미 배치를 첫 범위로 받아들일 것인가? `.md` 단일 파일 자급성이 필수라면 결정 1부터 다시 비교해야 한다.
2. **배포 라이선스:** citeproc metadata/배포 LICENSE 불일치를 확인하고 적용할 조건·고지 위치, CSL/locale attribution 방식을 확정해야 한다. 해결 전 제품 의존성 채택·배포 완료로 보지 않는다.
3. **입력 데이터 경계:** Zotero/Better BibTeX 실제 export의 BibTeX/BibLaTeX 차이, TeX 문자열·한글·법인 저자·crossref·중복 키와 정규화 충돌을 시험해 지원 범위를 design에 명시해야 한다. 두 항목 smoke test만으로 전체 BibTeX 지원을 약속하지 않는다.
4. **리소스 한도와 표시 안전성:** 파일 수·바이트·항목 수 한도, 오류 위치, 읽는 중 변경 검출을 B 착수 때 정한다. 서식 HTML을 사용할 경우 허용 출력과 안전한 projection을 검증한다. Core에 DOM을 넣거나 raw HTML을 그대로 주입하지 않는다.
5. **서술형·locator 확장:** IEEE narrative 실패를 해결할 CSL 경로와 prefix/suffix/partial을 보존하는 MyST writer 경로를 각각 증명해야 한다. 라이브러리 upgrade 또는 좁은 MyST adapter 보완은 별도 구현 검토이며 이번 ADR이 변경을 승인하지 않는다.
6. **실제 제품 검증:** browser bundle 크기는 확인했지만 런타임·접근성·큰 bibliography 성능, HTTP/Windows Desktop Root 정책, Save → Reload·복사/붙여넣기는 미검증이다. A/B/C의 각 완료 조건으로 남긴다.
