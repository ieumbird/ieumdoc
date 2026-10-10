# Persistent Figure Draft spike v1

- Status: Historical
- Last verified: 2026-10-10. 이 문서의 결과는 실제 실행 결과다(아래 재현 명령). 제품 동작은 바꾸지 않았다.
- Scope: Technical spike evidence. Figure 계약이나 제품 결정이 아니다.
- Current authority: [Document support](../design/document-support-v1.md), [Continuous document editing](../design/document-editing-v1.md), [Editing session and Save](../design/editing-session-save-v1.md), [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md).

- Date: 2026-10-10
- Baseline: master `252de5c`. 실험 코드는 브랜치 `spike/persistent-figure-draft` (`40b1bfd`)에만 있다. 병합 대상이 아니다.
- Environment: Windows 11, Node 24.21.0. 저장소 MyST 의존성은 `myst-parser` 1.7.4, `myst-transforms` 1.3.51, `myst-to-md` 1.0.17이다. 공식 CLI는 `mystmd` 1.11.0을 저장소 밖 임시 디렉터리에 설치해 사용했다(저장소 의존성 변경 없음).
- Question: 콘텐츠가 없는 Figure를 먼저 배치해 Caption·Label·상호참조를 작성하고, 나중에 Image 또는 Mermaid를 연결하는 워크플로를 MyST 호환성과 IeumDoc 아키텍처를 지키며 구현할 수 있는가.
- Path: 요청 경로는 `docs/spikes/`였다. 저장소 관례상 spike 근거는 `docs/reviews/`에 Historical 상태로 두고 [docs 색인](../README.md)에 연결하므로 이 경로를 썼다.

표기: **[확인]** 코드·문서로 확인한 사실, **[실험]** 실행 결과, **[해석]** 설계 판단, **[미검증]** 확인하지 않은 가정.

## 1. Executive Summary

**판정: CONDITIONAL GO.**

- **실현 가능성:** 높다. 인자 없는 `{figure}` directive에 `:name:`과 caption만 두면 공식 MyST가 Figure container로 읽는다. label, 번호, 상호참조가 모두 유지된다. 공식 `mystmd` 빌드도 "Figure n"으로 출력하고 참조를 해석한다. **[실험]**
- **새 노드나 Markdown 확장은 필요 없다.** 같은 container에 나중에 image나 mermaid 자식을 넣으면 위치, label, caption, 번호, 참조가 그대로다. **[실험]**
- **가장 큰 제약 두 가지:**
  1. 공식 serializer `myst-to-md`는 이미지가 없는 Figure를 쓰지 못한다(`containerValidator` 오류 후 예외). IeumDoc이 이미 table directive에 쓰는 방식대로, 이 경우만 직접 써야 한다. **[확인][실험]**
  2. 공식 MyST는 콘텐츠 없는 Figure에 ERROR 진단("contains no valid content")을 내지만 빌드는 성공한다(exit 0). HTML은 경고 없이 caption만 있는 Figure를 그리고, label만 있으면 보이지 않는 번호 붙은 대상이 된다. 출판 경고는 IeumDoc이 직접 정의해야 한다. **[실험]**
- **Editor 위험:** Editor는 "새 블록 + `imageUrl === ""`"를 "Apply하지 않은 placeholder"로 판단한다. Core만 바꾸면 Apply한 pending Figure가 Save에서 조용히 빠진다. **[실험: E4, figure-authoring browser]**
- **권고:** 네이티브 MyST Figure(방안 A)에 IeumDoc의 최소 규칙을 더한다. 첫 PR은 Core 쓰기 경로와 Editor의 명시적 applied 상태를 함께 바꾼다.

## 2. Current Architecture

### 데이터 흐름 **[확인]**

1. Editor `/figure` 또는 `+`가 `insertFigureAfter()`를 호출한다 (`apps/editor/src/block-commands.ts:331`). 새 블록은 `sourcePath: "new:…"`, `imageUrl: ""`, `editable: true`인 atom이다.
2. `FigureView`가 폼을 연다. `neverApplied = isNewBlockPath(sourcePath) && imageUrl === ""`이다 (`editor-schema.tsx:1137`). Cancel은 이 블록을 지운다.
3. Apply는 `labelError`, `figureContentError`(`packages/core/src/figure.ts`), Host의 `validateFigure`(Core `insertFigure` 왕복)를 차례로 통과해야 node attrs를 바꾼다.
4. Save 수집 `collectSupportedEdits()`(`tiptap-edits.ts`)는 `isSessionPlaceholder()`로 "새 블록이면서 `imageUrl === ""`"인 figure를 뺀다 (`tiptap-edits.ts:275-279`). dirty 비교 `appliedDocument()`도 같은 규칙을 쓴다.
5. Host가 Core `insertFigure`/`updateFigure`/`updateLabel`을 적용하고 `serialize()`로 쓴다. `serialize()`는 `myst-to-md`로 쓴 뒤 재파싱 fingerprint로 의미 손실을 막는다 (`packages/core/src/myst/serialize.ts`).

### 빈 Figure가 영속되지 않는 정확한 원인

| 계층 | 위치 | 동작 | 성격 |
| --- | --- | --- | --- |
| 필드 규칙 | `figure.ts` `figureContentError` | `imageUrl` 빈 값이면 "Figure image URL is required." | IeumDoc 설계 결정. 주석은 "empty URL drops the figure"라는 관찰을 근거로 든다 |
| 편집 모델 | `myst/figure.ts` `supportedFigureContent` | 첫 자식이 `image`가 아니면 편집 불가(`undefined`) | IeumDoc Figure v1 범위 |
| Writer | `myst-to-md` `containerValidator`, `container()` | image 없는 figure는 진단 후 `node.source.label`에서 예외 | **공식 writer 제약** |
| Editor | `isSessionPlaceholder`, `isUnappliedFigureDraft`, `neverApplied` | `imageUrl === ""`를 "한 번도 Apply 안 함" 표시로 사용 | IeumDoc 세션 설계 |

**[실험]** 현재 master Core에서 이미지 없는 Figure나 Mermaid Figure가 있는 문서는 이렇게 된다(`core-current-probe.ts`).
- 읽기와 번호(`blockTargets → {figure:1}`)는 된다.
- 문서 전체 `canonicalWriteError`는 "Figure container must have image node child"이다. 즉 **그 문서 전체를 쓸 수 없다.**

이미지 필수는 MyST 언어의 금지가 아니다. 공식 writer의 한계이고, IeumDoc은 그 위에서 범위를 좁힌 결정이다.

### Placeholder 제외 규칙이 보호하는 불변식 **[확인]**

- 사용자가 Apply하지 않은 새 atom은 문서 의미가 없다. Save, dirty, Source에 나타나지 않는다([Editing session and Save](../design/editing-session-save-v1.md) 17행).
- 이미 저장된 콘텐츠를 사용자가 비운 경우는 placeholder가 아니다. 이 규칙은 snapshot 블록 삭제를 숨기지 않는다.
- 이 불변식은 유지해야 한다. 바꿀 것은 "Apply했는가"를 `imageUrl`로 추론하는 방식뿐이다.

## 3. MyST Compatibility Results

### 3.1 공식 parser와 transform (`test/spike/myst-probe.ts`) **[실험]**

| Case | Source (요약) | AST | 공식 진단 | `myst-to-md` |
| --- | --- | --- | --- | --- |
| C1 | `:::{figure}` + `:label:` + caption | `container:figure` [caption], label/identifier 유지 | ERROR: no valid content besides caption | 예외 |
| C2 | backtick `{figure}` 같은 내용 | C1과 동일 | 동일 | 예외 |
| C3 | label만, body 없음 | `container:figure` [], label 유지 | ERROR: no valid content | 예외 |
| C4 | label·caption 없음 | `container:figure` [] | ERROR | 예외 |
| C5 | 인자 공백 | C1과 동일 | 동일 | 예외 |
| C6 | `{figure} ./pfc.svg` (기준) | [image, caption] | 없음 | `:name:`로 왕복 동일 |
| C7 | 인자 없음 + `{mermaid}` body + caption | [mermaid, caption] | **없음** | 예외 |
| C8 | 인자 없음 + `![](./pfc.svg)` body | C6과 동일 AST | 없음 | 왕복 동일 |

- **[확인]** `myst-transforms` `containers.js`의 `SUBFIGURE_TYPES`에 `mermaid`가 있다. Mermaid는 공식 Figure 콘텐츠다.
- **[확인]** `placeholder`는 MyST에서 "interactive content의 정적 대체 이미지"를 뜻한다. 미완성 콘텐츠 표시가 아니므로 쓰지 않는다.

### 3.2 공식 번호와 상호참조 (`test/spike/myst-numbering-probe.ts`) **[실험]**

`enumerateTargetsTransform` → `resolveLinksAndCitationsTransform` → `resolveReferencesTransform`(mystmd와 같은 transform) 결과:

```
fig-grid        enumerator=1  [image,caption]    "Figure 1:"
fig-pfc-control enumerator=2  [caption]          "Figure 2:"   ← 콘텐츠 없음
fig-flow        enumerator=3  [mermaid,caption]  "Figure 3:"
fig-label-only  enumerator=4  []                 (caption 없음)
fig-last        enumerator=5  [image,caption]    "Figure 5:"
[](#…) 5개 모두 kind=figure, resolved, "Figure 1".."Figure 5"
```

콘텐츠 없는 Figure도 정식 Figure 대상이다. 번호는 문서 순서대로 이어지고, 비어 있다고 해서 건너뛰지 않는다.

### 3.3 공식 `mystmd` 1.11.0 빌드 **[실험]**

- `myst build doc.md --jats`, `myst build --html`(book-theme)는 모두 exit 0이다. 콘솔에 ⛔ "container of kind figure contains no valid content [besides caption]"가 출력된다.
- JATS: `<fig id="figure-2"><label>Figure 2:</label><caption><p>PFC control loop.</p></caption></fig>`, `<xref ref-type="fig" rid="figure-2">Figure 2</xref>`. label만 있는 Figure는 `<fig id="figure-4"/>`이다. Mermaid는 "Unhandled JATS conversion for node of mermaid"(JATS exporter 제약).
- HTML: `<figure id="fig-pfc-control"><figcaption>Figure 2: PFC control loop.</figcaption></figure>`. 콘텐츠 자리는 비어 있고 **독자에게 보이는 경고는 없다.** `fig-label-only`는 빈 `<figure>`인데 본문 참조는 "Figure 4"로 그곳을 가리킨다. Mermaid Figure는 "Figure 3"으로 번호가 붙는다.
- IeumDoc spike가 쓴 canonical 출력(`:name:` 형식, `{numref}` 참조)을 그대로 빌드해도 "Figure 1"과 `<xref>`로 해석됐다.

### 3.4 대안 표현과 Mermaid의 두 의미 (`myst-numbering-probe.ts alternatives`, `mermaid-probe.ts`) **[실험]**

| 표현 | 참조 결과 | Figure 번호 |
| --- | --- | --- |
| `(fig-x)=` + 문단 | **No target found** | 없음. 뒤 Figure 번호가 당겨짐 |
| label 있는 `{note}` | "Note" | 없음 |
| label 있는 단독 `{mermaid}` | "Mermaid" | 없음 |
| `{figure}` 안의 `{mermaid}` | "Figure n" | 있음 |

Mermaid를 그리는 것과 Mermaid에 Figure 번호·참조 의미를 주는 것은 다르다. **Figure 의미는 container가 준다.** 덧붙여 현재 Core는 단독 `{mermaid}`의 label을 쓰지 못해 그런 문서를 쓰기 불가로 판정한다(기존 제약, 이 spike 범위 밖).

### 지원되는 동작과 지원되지 않는 동작

| 지원 (공식 MyST) | 지원 안 됨 / 주의 |
| --- | --- |
| 인자 없는 `{figure}` 파싱, label·caption 유지 | `myst-to-md`로 쓰기 |
| 번호와 `[](#)`·`{numref}` 해석 | ERROR 진단 없이 콘텐츠 없는 Figure 두기 |
| Mermaid를 Figure 콘텐츠로 사용 | 렌더러의 화면 경고 (HTML에 없음) |
| 같은 container에 콘텐츠를 나중에 추가 | label만 있는 Figure의 가시성 (빈 출력) |

## 4. Architecture Options

### A. Native MyST Figure 확장 (권장 기반)

- **저장 형식:** `:::{figure}` 인자 없음, `:name: <label>`, 빈 줄, caption. 콘텐츠를 연결하면 `:::{figure} ./x.svg`(기존 형식) 또는 body에 `{mermaid}`.
- **데이터 모델:** MyST `container(kind=figure)`가 label, identifier, caption, 번호 위치를 가진다. 콘텐츠 자식은 0개, image 1개, mermaid 1개 중 하나다.
- **장점:**
  - 공식 MyST가 그대로 Figure로 번호를 매기고 참조한다.
  - 새 노드나 문법이 없다.
  - 기존 문서와 기존 Figure 출력(`{figure} url`)이 바이트 단위로 같다(Core 기존 suite 통과).
  - 콘텐츠 교체가 같은 container 안에서 일어나므로 식별자가 이동하지 않는다.
- **위험:**
  - 공식 도구가 ERROR 진단을 낸다. 이것은 의도한 "미완성" 신호로 해석한다. **[해석]**
  - writer를 IeumDoc이 직접 가져야 한다(약 20줄, fingerprint guard가 검증).
  - label만 있는 Figure는 출판물에서 보이지 않는다.

### B. 제한적 Persistent Draft 표현

- A와 같은 MyST 구조에 미완성 표시를 덧붙이는 변형이다. 검토한 표시는 `:class: ieumdoc-pending`, 주석 `% pending`, 가짜 경로다.
- 기각 근거 **[해석]:**
  - 미완성 여부는 "콘텐츠 자식 없음"이라는 구조만으로 이미 결정된다. 추가 표시는 구조와 어긋날 수 있는 두 번째 진실이 된다.
  - 가짜 이미지 경로는 깨진 링크를 출판한다.
  - 주석은 숨은 의미를 만든다.
  - `placeholder`는 MyST에서 다른 뜻이다.
- 따라서 B는 A의 규칙(아래 6장)으로만 남기고 추가 마커는 두지 않는다.

### C. 기존 Figure 유지 + 별도 Placeholder 요소

- **저장 형식 후보:** `(label)=` target + 문단, label 있는 admonition.
- **기각 근거 [실험]:**
  - 참조가 해석되지 않거나 "Note"로 해석된다. Figure 번호가 없다.
  - 뒤 Figure들의 번호가 초안 기간 동안 틀리고, 전환 순간 모두 바뀐다.
  - 전환 시 label 소유권을 옮기는 별도 연산과 참조 kind 변경이 필요하다.
- T2, T6, T8을 만족하지 못한다.

### 비교

| 기준 | A | B | C |
| --- | --- | --- | --- |
| MyST 문법·공식 도구 | 정식 구조, ERROR 진단 | A와 같고 비표준 마커 추가 | 정식 구조지만 의미가 다름 |
| 상호참조·번호 | 공식과 Core 일치 | A와 같음 | 실패 |
| Save/Reload 무손실 | 바이트 동일 (T3) | A와 같음 | 가능 |
| Core/CLI/Editor 범위 | writer + Figure 규칙 + Editor applied 상태 | A + 마커 동기화 | 새 블록 + 전환 연산 |
| 하위 호환 | 기존 출력 불변 | 같음 | 같음 |
| 유지보수 | 낮음 | 중간 (이중 진실) | 높음 |
| 사용자 예외 | 출판 시 미완성 경고 | 같음 | 번호 변동, 참조 깨짐 |

### Approach 1(통합 모델) vs Approach 2(공통 UX + 유형별 문서 모델)

- **저장:** Approach 2를 따른다. Image와 Mermaid는 각자의 공식 MyST 구조(`{figure} url`, body `{mermaid}`)를 유지한다. IeumDoc 전용 "type/state" 필드는 저장하지 않는다.
- **Core 읽기 모델:** 가벼운 통합이 맞다. `figure` 블록에 `content: { kind: "none" } | { kind: "image", url, alt } | { kind: "mermaid", … }`를 두고, label과 caption은 container 소유로 둔다. 이 통합은 MyST container 구조를 그대로 비춘 것이다. 별도 도메인 모델을 새로 만드는 것이 아니다. **[해석]**
- **비용:** Approach 1(저장까지 통합)은 MyST 밖의 필드를 만들게 된다. Approach 2만 하고 읽기 모델을 통합하지 않으면 지금처럼 `imageUrl === ""` sentinel이 여러 계층에 퍼진다.

## 5. Proof of Concept

브랜치 `spike/persistent-figure-draft` (`40b1bfd`). 기존 suite에 넣지 않은 별도 실행 파일이다.

### 변경 (PoC 전용)

- `packages/core/src/myst/serialize.ts`: 콘텐츠 없는 Figure나 Mermaid 하나만 가진 Figure를 인자 없는 `{figure}` directive로 직접 쓴다. 콘텐츠, caption 순서로 쓰고 `:name:` 별칭을 쓴다(기존 image Figure와 같음). 재파싱 fingerprint guard는 그대로다.
- `packages/core/src/figure.ts`: 빈 `imageUrl`을 pending으로 허용하고, 그때 alt가 있으면 거부한다.
- `packages/core/src/myst/figure.ts`: caption만 있거나 비어 있는 Figure를 편집 가능한 pending으로 읽는다. `setFigureContent`는 pending이면 image 노드를 두지 않고, 콘텐츠를 연결할 때 같은 container를 유지한다.

### 재현

```bash
git checkout spike/persistent-figure-draft
pnpm --filter @ieumdoc/core exec tsx test/spike/myst-probe.ts
pnpm --filter @ieumdoc/core exec tsx test/spike/myst-numbering-probe.ts [alternatives]
pnpm --filter @ieumdoc/core exec tsx test/spike/core-current-probe.ts   # master Core에서 실행하면 현재 동작
pnpm --filter @ieumdoc/core exec tsx test/spike/mermaid-probe.ts
pnpm --filter @ieumdoc/core exec tsx --test test/spike/persistent-figure-draft.spike.test.ts
pnpm --filter @ieumdoc/editor exec tsx --test test/spike/persistent-figure-draft.spike.test.ts
# 공식 CLI (저장소 밖): npm i --ignore-scripts mystmd@1.11.0; myst build doc.md --jats; myst build --html
```

### 결과 **[실험]**

| ID | 시나리오 | 결과 | 근거 |
| --- | --- | --- | --- |
| T1 | 빈 Figure + Label + Caption | **통과.** `canonicalWriteError` 없음, 편집 가능. label만 있는 경우 `:::{figure}\n:name: fig-only\n:::` | Core T1 |
| T2 | 본문 참조 | **통과.** Core 미해결 참조 없음. 공식: `[](#)`와 `{numref}` 2개 모두 "Figure 1". 공식 ERROR 진단 1개 | Core T2 |
| T3 | Save → Reload | **통과.** 바이트 동일, 재직렬화 idempotent, read model 동일 | Core T3, Editor E1 |
| T4 | Reload 후 이미지 연결 | **통과.** 위치(2), label, caption 유지. 공식 진단 0개. 연결 해제 시 원래 pending 형식으로 복귀 | Core T4, Editor E2 |
| T5 | Mermaid 연결 | **부분.** block source 교체로 저장·왕복·공식 "Figure 1" 해석 가능. Figure v1 authoring은 Mermaid를 다루지 않아 읽기 전용 블록이 됨 | Core T5 |
| T6 | 혼합 번호 | **통과.** image/pending/mermaid/label-only/image 5개에서 Core `targetNumbers`와 공식 enumerator가 1..5로 같음 | Core T6 |
| T7 | 이동·삭제·Undo/Redo | **통과.** Core move/remove 후 쓰기 가능. 삭제하면 `{numref}`가 미해결로 보고됨. Editor 연결 Undo/Redo, Editor 삭제 명령 Save, 삭제 Undo 복원 | Core T7, Editor E3 |
| T8 | 출력 | **정책 없음.** 공식 MyST는 ERROR 진단만 내고 빌드 성공. HTML은 화면 경고 없음. Core `validateStructure`는 통과시킴 | Core T8, 3.3 |
| E4 | 새 pending Figure Apply 후 Save | **실패(GAP).** label·caption을 Apply해도 `isSessionPlaceholder`가 true여서 Save에서 빠짐 | Editor E4 |

### 통과하지 못한 기존 검증 (PoC가 의도적으로 바꾼 계약)

- Core 2개: "Figure validity rules reject…", "validateFigure is the persistent validity…". "image URL is required"를 기대한다.
- CLI 1개: "CLI insert-figure persists a Core Figure". `--image ""` 실패를 기대한다.
- Editor 3개: "Figure validity is enforced before Save…", "new Figure inserts save and reload…", "the Host Figure validation endpoint…".
- Browser `figure-authoring`: 빈 URL Apply가 거부되길 기대한다. PoC에서는 Apply가 통과해 폼이 닫히고, 그 Figure는 E4 때문에 Save에서 빠진다. **Editor 변경 없이 Core만 바꾸면 데이터 유실 경로가 생긴다는 실제 증거다.**
- 그 밖의 결과: Core 205/207, CLI 44/45, Editor 219/222, file-commit 2/2, typecheck 통과. `figure-draft-race`, `image-assets`, `cross-reference` browser 통과.
- 범위를 넓게 잡은 첫 PoC writer는 현재 의도적으로 실패시키는 subfigure 문서까지 무손실로 써서 serialize-guard "손실 사례" 테스트를 깨뜨렸다. 그래서 범위를 "콘텐츠 없음 또는 Mermaid 1개"로 좁혔다. subfigure 지원은 별도 결정이다.

### 실험 중 발견한 기존 제약 (pending과 무관)

- Core `unresolvedReferences`는 role 참조(`{numref}` 등)만 검사하고 `[](#label)` 링크 참조는 검사하지 않는다. image Figure를 지워도 같다. **[실험]**
- label 있는 단독 `{mermaid}`가 있는 문서는 쓸 수 없다(label 손실). **[실험]**

## 6. Recommended Architecture

- **Figure:** MyST `container(kind=figure)`이다. label, identifier, caption, 문서 위치, 번호를 소유하는 유일한 주체다. 콘텐츠를 교체해도 container는 바뀌지 않는다.
- **콘텐츠:** container의 자식 0개 또는 1개다.
  - `none` (pending): 자식 없음.
  - `image`: 기존 `{figure} url` 형식.
  - `mermaid`: body `{mermaid}`. 1단계에서는 보존·읽기 전용, 편집은 후속이다.
- **미완성 상태:** 저장하는 플래그가 아니다. "콘텐츠 자식 없음"에서 구조적으로 도출한다. Core 읽기 모델은 `content.kind === "none"`으로 명시하고 `imageUrl === ""` sentinel을 대체한다. 기존 필드는 호환을 위해 당분간 유지한다. **[해석]**
- **규칙:**
  - pending Figure는 caption이나 label 중 하나 이상을 가져야 한다(문서 수준 검증). 둘 다 없는 Figure는 의미 없는 보이지 않는 번호 대상이므로 거부한다.
  - pending에는 alt를 둘 수 없다.
  - 기존 Figure v1 필드 규칙은 그대로다.
- **식별자 보존:** 콘텐츠 연결은 `updateFigure`(image)나 후속 content 연산이 같은 container의 자식만 바꾸는 방식이다. label 변경은 `updateLabel` 하나로만 한다. T4와 E2가 증거다.
- **Editor:** "Apply했는가"를 `imageUrl`로 추론하지 않는다. 명시적 세션 상태(예: node attr `applied`)를 둔다. Apply하지 않은 새 Figure는 계속 placeholder로 빼고, Apply한 pending Figure는 Save 대상으로 넣는다.
- **Save와 Export의 역할:**
  - Save: pending을 무손실로 보존한다. 쓰기 가능성(`canonicalWriteError`)에 영향을 주지 않는다.
  - Publish readiness: IeumDoc 규칙으로 따로 둔다. Core `figureReadiness`(가칭)가 pending Figure를 위치와 label과 함께 보고한다. CLI `check`는 이를 경고로 출력하고, 출판용 옵션(가칭 `--publish`)에서는 실패(non-zero) 처리한다. Editor는 pending Figure를 "No content yet" 틀로 분명히 표시한다.
  - IeumDoc 밖의 공식 빌드에서는 MyST의 ⛔ 진단이 같은 신호다. **경고 없이 사라지는 출력은 IeumDoc 경로에서 허용하지 않는다.**

## 7. Implementation Plan

1. **PR 1 — Pending Figure 영속화 (Core + CLI + Editor 동시, 필수 묶음)**
   - Core:
     - writer 확장(콘텐츠 없음만. Mermaid writer는 PR 3)
     - `supportedFigureContent`/`setFigureContent`/`figureContentError`의 pending 허용
     - 읽기 모델 `content.kind`
     - "caption 또는 label 필요" 규칙
   - CLI: `insert-figure`의 `--image`를 선택 인자로, `inspect`에 `content=none` 표시.
   - Editor:
     - 명시적 `applied` 세션 상태
     - `isSessionPlaceholder`/`isUnappliedFigureDraft`/`neverApplied` 갱신
     - Apply 시 빈 URL 허용
     - pending 표시 최소 UI(빈 이미지 대신 "No content yet")
   - 테스트:
     - 위 6개 계약 테스트를 새 계약으로 교체한다. 거부 사례는 "alt without image", "no caption and no label"로 옮긴다.
     - T1–T4, T6, T7, E1–E4를 정식 suite로 옮기고, E4가 저장되는지 검사로 뒤집는다.
     - browser `figure-authoring`: Apply한 pending Figure가 Save → Reload 후 남는지.
     - 공식 MyST transform 대조는 Core 테스트에 하나만 둔다.
   - 문서: Document support, Continuous editing, Editing session and Save, UX Shell의 Figure 문장을 갱신한다.
2. **PR 2 — Publish readiness:** Core 보고 함수, CLI `check` 경고와 출판 옵션, Editor 문서 단위 표시. 테스트는 pending이 있으면 non-zero이고, 콘텐츠를 연결하면 통과하는지 본다.
3. **PR 3 — Mermaid Figure 보존:** writer의 Mermaid 경로, 읽기 모델 `content.kind = "mermaid"`(읽기 전용). Mermaid Figure가 있는 기존 문서를 쓸 수 있게 되는 하위 호환 개선이다. T5와 공식 번호 대조로 검증한다.
4. **PR 4 — Mermaid 콘텐츠 연결 (후속):** Core content 연산과 CLI 명령, Editor 최소 입력. 렌더링 엔진 도입은 별도 결정이다.
5. **별도 이슈:** `[](#label)` 링크 참조의 미해결 검사, 단독 label `{mermaid}` 쓰기 불가.

회귀 검증: 각 PR은 Core/CLI/Editor 전체 suite, `pnpm browser:test` stable 전체, 기존 Figure 문서 바이트 불변(serialize 회귀)을 실행한다.

## 핵심 질문에 대한 답

1. **콘텐츠 없는 Figure를 MyST 원본에 안정적으로 저장할 수 있는가?** 그렇다. 인자 없는 `{figure}` + `:name:` + caption이 바이트 단위로 왕복한다. 단 공식 writer가 아니라 IeumDoc writer가 써야 하고, 공식 MyST는 이를 "콘텐츠 없음" ERROR로 진단한다.
2. **정식 그림 상호참조 대상이 되는가?** 그렇다. 공식 transform과 `mystmd` 빌드 모두 "Figure n"으로 번호를 매기고 `[](#)`와 `{numref}`를 해석한다. Core의 번호 규칙과도 같다.
3. **나중에 Image/Mermaid를 연결해도 참조와 캡션이 보존되는가?** Image는 그렇다(T4, E2). Mermaid는 저장 표현과 공식 의미는 보존되지만(T5), Editor 편집 경로는 후속 PR이 필요하다.
4. **Core 최소 변경은?** 콘텐츠 없는 Figure의 writer, Figure v1의 pending 허용, 읽기 모델 `content.kind`, "caption 또는 label" 규칙. 새 노드와 Markdown 확장은 없다. Editor의 명시적 applied 상태를 같은 PR에 넣어야 한다.
5. **UI만 통합할 것인가, 도메인도 통합할 것인가?** 저장은 유형별 MyST 구조를 유지한다. Core 읽기 모델만 container 중심으로 가볍게 통합한다(`content.kind`). Figure 의미는 MyST container가 이미 주므로 별도 통합 도메인 모델은 만들지 않는다.

## 판정과 권고

**CONDITIONAL GO.** 정식 구현에 착수해도 된다. 조건은 다음과 같다.

1. Core pending 허용은 Editor 명시적 applied 상태와 **같은 PR**로만 병합한다(E4 데이터 유실 방지).
2. pending Figure에는 caption 또는 label이 필요하다.
3. 출판 경고(PR 2)가 나오기 전에는 pending Figure를 출판 가능한 상태로 안내하지 않는다.
4. 공식 MyST의 ERROR 진단을 숨기거나 우회하는 표현(가짜 경로, placeholder 오용, 숨은 마커)은 쓰지 않는다.

**[미검증]**
- 다른 MyST 버전(예: 향후 `myst-to-md`가 image 없는 Figure를 쓰게 되는 경우)과의 출력 차이
- Typst/LaTeX/PDF export에서 pending Figure의 출력
- Mermaid 렌더링의 실제 시각 결과(HTML은 클라이언트 렌더링)
