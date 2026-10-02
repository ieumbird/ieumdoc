# IeumDoc Test Guide

이 문서는 현재 구현을 사람이 실제 파일로 확인하는 절차다.

확인 대상:

```
plain-text file
    → ieumdoc CLI
    → packages/core (parse / operation / validateStructure / serialize)
    → canonical plain-text file
```

확인 대상에는 Visual Editor도 포함된다. Editor는 Core read model로 문서를 보여주고, 저장은 Core operation으로 한다.

## 준비

- Node.js 24 LTS (`24.21.0` 이상, 24.x)
- 루트 `package.json`의 `packageManager`에 고정된 pnpm `12.5.1`

저장소 루트에서:

```bash
pnpm install --frozen-lockfile
```

문서 fixture:

`packages/core/test/fixtures/document.md`

처음 내용은 대략 다음과 같다.

```
0 heading            # Converter Control
1 paragraph          The converter regulates voltage.
2 admonition:note
3 paragraph          **DC-link voltage** / *phase current*
4 heading            Control Structure
5 paragraph
6 list
7 heading            Current Reference
8 paragraph
9 math
```

## 1. 자동 테스트

저장소 루트:

```bash
pnpm test
```

통과 기준 — Core, 기술문서, CLI, Editor 테스트가 모두 PASS:

```
✔ Core can parse a real document
✔ Core can replace text
✔ Core can insert a top-level block
✔ Core can remove a top-level block
✔ Core can move a top-level block
✔ Modified document validates
✔ Modified document serializes canonically
✔ Serialized document reparses successfully
✔ Second serialization is stable
✔ technical document parses
✔ admonition content can be modified structurally
✔ figure caption can be modified structurally
✔ table cell can be modified structurally
✔ exact node can be addressed with NodePath
✔ node text mutation is unambiguous
✔ figure/equation/reference semantics remain intact
✔ modified document validates
✔ canonical serialization succeeds
✔ serialized document reparses
✔ second serialization is stable
✔ CLI can check and modify a real file through Core
✔ ieumdoc help exits successfully
✔ inspect prints Core editable targets
✔ technical document exposes an editor read model
✔ heading with supported inline marks is editable
✔ supported formatted captions and table cells are editable; unsupported inline content stays read-only
✔ formatted paragraph projects to editor-neutral inline content
✔ paragraph inline write preserves strong and emphasis
✔ paragraph inline mutation round-trips through parse and serialize
✔ unsupported inline remains read-only
✔ Editor uses the Core read model
✔ one Tiptap editor owns the document
✔ technical document projects to one typed Tiptap document
✔ Core InlineContent converts to and from Tiptap content
✔ formatted paragraph is an editable target
✔ unsupported paragraph stays read-only
✔ paragraph edits are saved through Core operations
✔ rich paragraph saves through updateParagraphInlineContent
✔ heading text edits keep the heading level
✔ supported edits preserve untouched semantics
✔ paragraph split stays in its original snapshot group
✔ document revision changes with the source
✔ stale revision save leaves an externally edited file unchanged
✔ canonical second serialization is stable
✔ saved file matches the Core write path
✔ Editor source does not import MyST packages or AST
✔ Core source does not import Tiptap or ProseMirror
```

하나라도 FAIL이면 현재 write path와 의미 보존 계약을 확인해야 한다.

## 2. 실제 파일로 CLI 확인

원본 fixture를 직접 바꾸지 말고 복사본을 사용한다.

PowerShell:

```powershell
New-Item -ItemType Directory -Force tmp | Out-Null
Copy-Item packages/core/test/fixtures/document.md tmp/document.md
```

### 2-1. check

```powershell
pnpm ieumdoc check tmp/document.md
```

기대 출력 시작:

```
structure valid
0 heading
1 paragraph
2 admonition:note
3 paragraph
4 heading
5 paragraph
6 list
7 heading
8 paragraph
9 math
writeability ok
```

`structure valid`와 마지막 줄 `writeability ok`가 아니면 실패다. `check`의 의미는 아래 "Writeability Preflight v1"에 있다.

### 2-2. replace-text

```powershell
pnpm ieumdoc replace-text tmp/document.md --from "The converter regulates voltage." --to "The converter regulates voltage and current."
```

파일을 열어 `The converter regulates voltage and current.` 가 있는지 확인한다.
원문 `The converter regulates voltage.` 는 없어야 한다.
`packages/core/test/fixtures/document.md` 원본은 그대로여야 한다.

### 2-3. insert-block

```powershell
pnpm ieumdoc insert-block tmp/document.md --at 1 --text "Added by CLI."
```

```powershell
pnpm ieumdoc check tmp/document.md
```

기대 순서:

```
0 heading
1 paragraph          Added by CLI.
2 paragraph          The converter regulates voltage and current.
3 admonition:note
```

### 2-4. move-block

note를 heading 바로 아래로 옮긴다. 현재 note index는 3이다.

```powershell
pnpm ieumdoc move-block tmp/document.md --from 3 --to 1
```

```powershell
pnpm ieumdoc check tmp/document.md
```

기대 순서:

```
0 heading
1 admonition:note
2 paragraph          Added by CLI.
3 paragraph          The converter regulates voltage and current.
4 paragraph          **DC-link voltage** ...
```

파일 내용은 `# Converter Control` 다음에 `:::{note}` 가 와야 한다.

### 2-5. remove-block

bold/italic이 있는 paragraph를 삭제한다. 위 상태에서 index 4.

```powershell
pnpm ieumdoc remove-block tmp/document.md --at 4
```

파일에서 `phase current` 가 없어야 한다.
`Added by CLI.` 와 `The converter regulates voltage and current.` 는 남아 있어야 한다.

### 2-6. format 과 재검증

```powershell
pnpm ieumdoc format tmp/document.md
pnpm ieumdoc check tmp/document.md
```

다시 `structure valid`여야 한다.
`format`을 한 번 더 실행해도 파일 내용이 같아야 한다. 이것이 canonical serialization이다.

끝나면 복사본을 지운다.

```powershell
Remove-Item -Recurse -Force tmp
```

## 2-7. 기술문서 구조 수정

복사본을 새로 만든다.

```powershell
Copy-Item packages/core/test/fixtures/technical-document.md tmp/technical-document.md
pnpm ieumdoc check tmp/technical-document.md
```

출력에 `container:figure` 와 `table` 이 있어야 한다.

admonition / figure caption / table cell 을 구조적으로 수정한다.

```powershell
pnpm ieumdoc update-node-text tmp/technical-document.md --path 4 --from "The current controller parameters must be calibrated before operation." --to "The current controller parameters must be calibrated."
pnpm ieumdoc update-node-text tmp/technical-document.md --path 6,1 --from "Control block diagram of the grid-connected converter." --to "Control block diagram of the grid-tied converter."
pnpm ieumdoc update-node-text tmp/technical-document.md --path 12,1,1 --from "AC" --to "AC-side"
pnpm ieumdoc format tmp/technical-document.md
pnpm ieumdoc check tmp/technical-document.md
```

파일에서 확인할 것:

- `The current controller parameters must be calibrated.` 가 있다. warning 블록은 남아 있다.
- figure caption이 `grid-tied converter` 로 바뀌었다.
- `:name: fig-control` 또는 `fig-control` 과 `./diagram.svg` 가 남아 있다.
- `{math}` 의 `:label: eq-current` 가 남아 있다.
- `[](#fig-control)` link와 `{eq}`eq-current`` reference가 그대로 남아 있다.
- 표의 `AC` 가 `AC-side` 로 바뀌었고 `| Port |` 행은 그대로다.

`format`을 한 번 더 실행해도 파일 내용이 같아야 한다.

## Editor browser regression 실행

`apps/editor/test/*.browser.js`는 실제 브라우저에서 Editor 흐름을 검증한다. 파일을 쓰는 시나리오는 저장소의 무시되는 `tmp/<시나리오>/` scratch 사본에서만 실행하고, 원본(`apps/editor/document/`, `apps/editor/test/browser/fixtures/`)은 읽기만 한다.

```bash
pnpm editor            # 다른 터미널에서 dev server(http://127.0.0.1:5173)를 띄운다
pnpm browser:test      # stable 시나리오 전체: 시나리오마다 scratch를 새로 만들고 실행한다
pnpm browser:test admonition-authoring inline-math-split   # 이름을 준 시나리오만(stable 목록 밖의 것도 가능)
pnpm browser:prepare   # scratch 사본만 다시 만든다(수동으로 run-code를 실행할 때)
```

- `pnpm browser:prepare`는 `tmp/` 아래의 browser scratch 디렉터리만 지우고 원본에서 다시 만든다. 몇 번 실행해도 같은 초기 상태가 된다. 어떤 디렉터리에 어떤 파일을 만드는지는 `apps/editor/test/browser/fixtures.ts`에 있다.
- `pnpm browser:test`는 `@playwright/cli` session 하나(`ieumdoc-browser-regression`)를 열어 시나리오를 차례로 `run-code`로 실행하고 닫는다. 재사용 page가 browser state를 다음 시나리오에 넘기지 않도록 매번 viewport(1280×720), pointer, scroll, focus를 초기화한다. page mock cleanup 이후에도 유지되는 context route가 scratch 밖의 실제 쓰기를 차단한다(시작 시 403 probe). 실행 뒤 원본 fixture가 바뀌었으면 실패하고, 끝나면 scratch를 다시 깨끗하게 만든다. dev server는 직접 띄운다.
- stable 목록은 `apps/editor/test/browser/run.ts`의 `STABLE_SCENARIOS`다. 현재 모든 `*.browser.js` 시나리오가 들어 있다.
- 아래 각 기능 절의 수동 명령도 `pnpm browser:prepare` 뒤에 그대로 쓸 수 있다.

### CI 및 로컬 재현

`.github/workflows/ci.yml`은 모든 pull request에서 Node.js `24.21.0` / pnpm `12.5.1`로 typecheck, Core / CLI / Editor 테스트, Editor production build와 `pnpm browser:test`를 실행한다. Chromium은 저장소가 고정한 `@playwright/cli`에서 설치하고 Linux 의존성은 매 실행에 확인한다. Browser 바이너리 cache key는 `pnpm-lock.yaml`을 사용한다. CI server는 `127.0.0.1:5173`에서 `/api/document`가 응답할 때까지 기다린 뒤 테스트하며, 종료 시 browser session과 Vite process group을 정리한다. 실패 scenario의 Error/Result/Page/Events 출력과 실패 직후 browser state를 step log에 남기고 Vite log를 artifact로 올린다.

로컬에서는 필요하면 `pnpm exec playwright-cli install-browser chromium`을 한 번 실행한 뒤, 기존과 같이 별도 터미널에서 `pnpm editor`, 다른 터미널에서 `pnpm browser:test`를 실행한다. 로컬과 CI는 같은 stable scenario runner와 명령을 사용한다. CI에서만 Chromium의 Linux system dependencies를 설치하며, Vite의 고정 port `5173`은 로컬에서도 비어 있어야 한다.

## Quiet Document visual review

```bash
pnpm browser:test layout-rules quiet-document
pnpm browser:test quiet-document --screenshots   # 수동 시각검토용 촬영
pnpm browser:test figure-authoring figure-draft-race label-authoring source-view
```

- 실제 fixture: `apps/editor/test/browser/fixtures/quiet-document.md`, `quiet-document-long.md`; `browser:prepare`가 `tmp/quiet-document/`에 복사한다. 로컬 Figure는 기존 `diagram.svg`를 재사용한다. 한글/영문 H1–H6, inline formatting/math/reference, Note/Warning, equation, Figure, table을 포함한다.
- `layout-rules`는 1440/1025/1024/768/705/704px, sidebar 펼침/접힘에서 정렬축·gutter·control·computed typography를 검사한다. 필수 DOM 누락은 실패다. 접힌 sidebar의 icon/label 측정만 명시적으로 제외한다.
- 기본 `quiet-document`는 촬영 없이 초안 보존, 한국어 조합 입력과 Undo/Redo, 저장·재열기, 키보드 접근성, 대비, overlay 잘림과 긴 콘텐츠의 스크롤을 검증한다. 반응형 경계·정렬·넘침은 `layout-rules`가 계속 검증한다.
- 수동 시각검토는 `pnpm browser:test quiet-document --screenshots`로 실행한다. 같은 시나리오에 촬영 전용 화면 순회를 추가하여 rest, Figure selected/editing, Equation editing, 좁은 inline form, 긴 파일명/수식/표, Open/New를 27장 캡처한다. 폰트/이미지와 overlay transition이 끝난 후 측정하며, 결과는 `tmp/visual-refinement/after-*.png`에 저장한다. 대표 Before/After와 목업은 [review](../design/editor-visual-refinement-v1-review.md)에 보관한다. CI의 기본 실행에는 촬영이 포함되지 않는다.
- 키보드 Tab 접근, 메뉴 Escape 복귀, Figure selection 밖의 draft, slash focus, overlay 내부 control 경계, contrast, Chromium composition + undo/redo, 실제 block drag + undo도 확인한다. 데스크톱 OS IME 후보창은 별도 수동 검증 대상이다.
- 툴 노출을 검사할 때 먼저 블록을 hover한다. 보이지 않는 버튼에 force click하지 않는다. Form의 유효성/Apply/Cancel/Save/Reload 검사는 그대로 유지한다.
- `title`로 전체 경로를 확인한다. 화면에는 filename만 표시하므로 주소 일치 검사는 `title`을 사용한다. 정상 로드 완료는 표시 문구 대신 status의 `data-operation="Ready"`로 기다린다. Dirty/Saved/Saving/error 문구는 실제 상태 전환과 함께 검사한다.
- Windows에서 전역 pnpm shim이 실패하면 동일 버전의 `corepack pnpm`으로 실행할 수 있다. 작업이 시작한 서버/브라우저만 종료한다.

## Visual Editor

브라우저에서 Core-backed Visual Editor를 확인한다.

작업 파일:

`apps/editor/document/technical-document.md`

이 파일은 Editor 전용 복사본이다. `packages/core/test/fixtures/technical-document.md` 원본은 직접 수정하지 않는다.

시작 전 내용이 바뀌어 있으면 원본에서 다시 복사한다.

```powershell
Copy-Item packages/core/test/fixtures/technical-document.md apps/editor/document/technical-document.md
```

### A. Editor 실행

저장소 루트에서:

```powershell
pnpm --filter @ieumdoc/editor dev
```

브라우저에서 `http://localhost:5173` 을 연다.

성공: 왼쪽 sidebar에 `IeumDoc`, `Open…`, 현재 문서 `technical-document.md` 가 보인다. 상단 top bar 왼쪽에 현재 파일 경로, 오른쪽에 저장 상태와 `Save` 버튼이 있다.

### B. 초기 렌더링 확인

화면에서 다음을 직접 확인한다.

- `Converter Control`, `Control Structure` 같은 제목이 heading으로 보인다.
- 일반 본문 paragraph가 보인다. 예: `The current reference is calculated from the active power command.`
- `warning` 상자가 일반 paragraph와 구분된다. 본문은 `The current controller parameters must be calibrated before operation.`
- Figure에 그림과 caption `Control block diagram of the grid-connected converter.` 가 함께 보인다.
- Ratings가 표 형태로 보인다. `Port`, `Type`, `U`, `AC`, `P`, `DC` 셀이 칸으로 나뉜다.
- 수식 `i^{\ast} = \frac{P^{\ast}}{V_{\mathrm{rms}}}` 가 별도 equation 블록으로 보인다.

성공: `:::{figure}` 나 표 파이프 문법, `{math}` 코드펜스 같은 소스 표기가 화면의 기본 모습이 아니다.

문서 전체는 Tiptap 편집 영역 하나다. 편집 영역이 paragraph마다 따로 있으면 실패다.

화면에서 다음이 서로 구분되어야 한다.

- Heading. 예: `Converter Control`, `Control Structure`
- 편집 가능한 paragraph. 예: `The current reference is calculated from the active power command.`
- bold / italic paragraph. `DC-link voltage` 는 bold, `phase current` 는 italic. `**` 와 `*` 는 보이지 않는다.
- `Read-only` 로 표시된 reference paragraph. 예: `See fig-control and eq-current.`
- Admonition. `Admonition: warning` 과 `The current controller parameters must be calibrated before operation.`
- Figure. 그림, caption `Control block diagram of the grid-connected converter.`, label `fig-control`
- Equation. `Equation · eq-current` 와 LaTeX `i^{\ast} = \frac{P^{\ast}}{V_{\mathrm{rms}}}`
- Table. `Port`, `Type`, `U`, `AC`, `P`, `DC`

고정 서식 toolbar는 없다. paragraph 안에서 텍스트를 선택하면 선택 위에 `B` / `I` selection toolbar가 나타난다.

### C. Paragraph 편집

`The current reference is calculated from the active power command.` 를 수정한다.

`The current reference follows the active power command.`

`Save` 를 누른다. 상태가 `Saved` 가 되어야 한다.

`apps/editor/document/technical-document.md` 에서 확인할 것:

- 바꾼 문장이 있다.
- 원래 문장은 없다.
- figure, equation, table, warning은 그대로다.

### D. Rich paragraph 편집

`The converter regulates the DC-link voltage and phase current.` 에서 `regulates` 를 `controls` 로 바꾼다.

`DC-link voltage` 는 bold, `phase current` 는 italic으로 남는다.

`converter` 를 선택하고 selection toolbar의 `B` 를 누른다. `The` 를 선택하고 `I` 를 누른다.

`Save` 후 파일에 `**DC-link voltage**`, `*phase current*` 와 추가한 strong / emphasis가 있다.

브라우저를 새로고침하면 같은 서식이 다시 보인다.

### E. Heading 편집

`Converter Control` 을 `Converter Controls` 로 바꾼다.

`Save` 후 새로고침한다.

- 텍스트만 바뀐다.
- heading level은 그대로다. 제목 1 수준이 제목 2가 되지 않는다.

### F. 수정하지 않은 의미 보존

Heading과 paragraph만 수정한 뒤 같은 파일에서 다음이 유지되는지 본다.

- warning admonition 본문
- `./diagram.svg`, `fig-control`, figure caption
- equation LaTeX와 `eq-current`
- `fig-control`, `eq-current` 참조
- 표의 행 수와 `Port`, `Type`, `U`, `AC`, `P`, `DC`

Figure와 지원 admonition은 편집할 수 있다. Figure 속성은 Edit에서, 서식 있는 캡션은 문서 안에서 수정한다. Table은 지원되는 인라인 내용의 cell을 편집할 수 있다(아래 "Table cell editing v1"). 이 fixture의 빈 표시 텍스트 link(`[](#fig-control)`)가 있는 reference paragraph는 계속 읽기 전용이며 원본 의미를 보존해야 한다.

Save 후 파일의 `See [](#fig-control) and {eq}`eq-current`.` 줄은 그대로여야 한다. `{eq}` reference가 `[](#eq-current)` link로 바뀌면 실패다.

브라우저 회귀(실제 파일을 쓰므로 무시되는 `tmp/`의 scratch 사본에서 실행한다. 사본은 `pnpm browser:prepare`가 만든다):

```bash
pnpm browser:prepare
pnpm exec playwright-cli -s=ieumdoc-reference open http://127.0.0.1:5173
pnpm exec playwright-cli -s=ieumdoc-reference run-code --filename=apps/editor/test/reference-save-reload.browser.js
pnpm exec playwright-cli -s=ieumdoc-reference close
```

결과의 값은 모두 `true`여야 한다. 다시 실행하려면 `pnpm browser:prepare`를 다시 실행한다.

### G. 구조 편집과 저장 검증

편집 가능한 paragraph 중간에서 Enter를 누른다. 같은 Editor 안에서 두 paragraph로 나뉘어야 한다.

paragraph 맨 앞에서 Backspace를 누른다. 인접한 paragraph/heading은 공백 추가 없이 합쳐진다. Heading과 서식 있는 paragraph를 합치면 paragraph로 바뀌고 서식·수식은 유지된다. Note/표 셀의 경계는 유지된다.

Equation 또는 Figure를 선택하고 Delete 또는 Backspace를 누른다. 블록이 삭제되고 Undo로 복구되어야 한다. handle 메뉴의 `Delete`도 유지된다.

지원되는 구조 변경은 Save 후 Reload해도 유지되어야 한다. 지원하지 않는 구조 변경은 이유를 표시하고 원본 의미를 보존해야 한다.

paragraph의 글을 모두 지우고 `Save` 를 누르면 `Save failed` 가 되고 파일은 저장되지 않아야 한다.

### H. Core write path 확인

저장소 루트에서:

```powershell
pnpm ieumdoc check apps/editor/document/technical-document.md
pnpm ieumdoc format apps/editor/document/technical-document.md
```

확인할 것:

- `structure valid` 가 출력된다.
- `format`을 한 번 더 실행해도 파일이 더 바뀌지 않는다.

```powershell
git diff -- apps/editor/document/technical-document.md
```

확인할 것: heading / paragraph 변경만 보이고 figure, equation, table, admonition, 참조는 유지된다.

원문 공백이나 `:label:` / `:name:` 표기 차이는 실패가 아니다.

### I. 재실행 확인

브라우저를 새로고침한다. 또는 Editor를 끄고 A의 명령으로 다시 연다.

수정한 heading과 paragraph는 남고, read-only 블록도 그대로 보여야 한다.

```
Editor → Core → canonical .md → Core → Editor
```

확인이 끝나면 Editor를 종료하고 작업 파일을 되돌린다.

```powershell
Copy-Item packages/core/test/fixtures/technical-document.md apps/editor/document/technical-document.md
```

## 3. 사람이 특히 볼 것

1. CLI가 Markdown 문자열을 직접 치환하지 않는다. 같은 작업을 Core API로 재현하면 파일 내용이 같아야 한다.
2. block 추가/삭제/이동은 top-level 순서만 바꾼다. 문장 하나를 regex로 잘라 붙인 결과가 아니다.
3. 저장 결과는 다시 `check`가 되고, `format`을 반복해도 내용이 안정적이다.
4. `packages/cli`는 `@ieumdoc/core`를 호출만 한다. 문서 의미를 CLI에 구현하지 않았다.

## 4. 명령 목록

```
pnpm ieumdoc help
pnpm ieumdoc help <command>
pnpm ieumdoc inspect <file>
pnpm ieumdoc check <file>
pnpm ieumdoc format <file>
pnpm ieumdoc replace-text <file> --from <text> --to <text>
pnpm ieumdoc insert-block <file> --at <index> (--text <text> | --content <json>)
pnpm ieumdoc insert-admonition <file> --at <index> --variant <kind> --text <text>
pnpm ieumdoc update-admonition-variant <file> --path <index> --variant <kind>
pnpm ieumdoc insert-quote <file> --at <index> (--text <text> | --content <json>)
pnpm ieumdoc update-quote <file> --path <index> (--text <text> | --content <json>)
pnpm ieumdoc insert-divider <file> --at <index>
pnpm ieumdoc update-heading-level <file> --path <index> --from <1-6> --to <1-6>
pnpm ieumdoc convert-block <file> --path <index> --to <paragraph|heading> [--level <1-6>]
pnpm ieumdoc remove-block <file> --at <index>
pnpm ieumdoc move-block <file> --from <index> --to <index>
pnpm ieumdoc update-node-text <file> --path <indexes> --from <text> --to <text>
pnpm ieumdoc insert-figure <file> --at <index> --image <url> [--alt <text>] [--caption <text>]
pnpm ieumdoc update-figure <file> --path <indexes> [--image <url>] [--alt <text>] [--caption <text>]
pnpm ieumdoc insert-table <file> --at <index> --cells <json>
pnpm ieumdoc insert-table-row <file> --path <table> --at <row>
pnpm ieumdoc insert-table-column <file> --path <table> --at <column>
pnpm ieumdoc update-table-cell <file> --path <table,row,cell> --text <text>
pnpm ieumdoc insert-list <file> --at <index> --list <json>
pnpm ieumdoc update-list <file> --path <index> --list <json>
pnpm ieumdoc insert-code-block <file> --at <index> --code <text> [--language <name>]
pnpm ieumdoc update-code-block <file> --path <index> [--language <name>] [--code <text>]
```

`pnpm ieumdoc help`와 `pnpm ieumdoc <command> --help`는 사용 가능한 명령을 보여 준다.
`inspect`는 Core read model의 block, NodePath, editable target을 보여 준다.
`insert-block`은 Core `insertParagraph`로 paragraph만 넣는다.
index는 `check`가 출력하는 top-level 번호다.
`--path`는 현재 parse snapshot 안의 위치다. `inspect`로 찾는다. 구조를 바꾸면 path도 바뀐다. 예: `4`, `6,1`, `12,1,1`.

## 5. 현재 구현의 한계 (실패로 보지 말 것)

- `replace-text`는 paragraph/heading 텍스트만 바꾼다. admonition은 `update-node-text --path`, caption은 `update-figure --path --caption` 또는 `--caption-content`, table cell은 `update-table-cell --path`를 쓴다.
- `insert-block` / `remove-block` / `move-block`은 top-level만 다룬다.
- `{eq}`/`{numref}`/`{ref}` reference는 같은 role로 저장되고, `(label)=` section target도 남는다. `[](#eq-current)` 같은 fragment link는 일반 link로 남는다. 대상 존재 여부는 검사하지 않는다. `{term}` 등 보존할 수 없는 reference가 있으면 `format`/Save가 실패한다.
- Core canonical serialization은 보존할 수 없는 의미를 성공한 Markdown으로 저장하지 않는다. `format`/Save는 파일을 쓰기 전에 `Document contains semantic content that cannot be preserved in canonical Markdown: <이유>`로 실패하고 파일은 그대로다. 예: `{kbd}`, `{span}`, `{div}`, `{raw}` 등 MyST writer가 쓰지 못하는 node, 두 번째 subfigure, `{embed}` 대상, task list 체크박스(`- [ ]`), `{download}`의 download 표시, 단독 Markdown image(`{image}` directive로 쓰면 `align: center`가 새로 붙는다).
- figure option `:label:` 은 canonical form에서 `:name:` 으로 쓰인다.
- 닫힌 front matter는 시각 편집 없이 보존한다. 지원 본문을 편집하고 Save/Reload해도 메타데이터가 유지된다. 상세 범위는 [Document support v1](../design/document-support-v1.md)을 따른다.
- 원본 `-` 리스트는 canonical form에서 `*   ` 가 된다.
- merged cell 전용 시스템은 없다.
- Visual Editor는 sidebar `Open…` dialog에 입력한 `.md` 경로 하나를 연다. 파일 탐색기는 없다. 그 문서는 Tiptap editor 하나다.
- 화면에서 직접 저장할 수 있는 변경은 heading(줄바꿈 없는 지원 inline: 서식·link·inline code·inline math·reference)과 level, 단순 admonition(MyST 표준 종류) 본문과 종류, 문단 하나인 인용문, 구분선, text / strong / emphasis / 취소선 / 일반 link / inline code / inline math만 있는 paragraph다.
- `{eq}`/`{numref}` 외의 cross-reference(`{ref}`, 표시 텍스트가 있는 형태 등), 빈 텍스트 link(`[](#x)`), image를 감싼 link가 있는 paragraph와 admonition은 보이지만 읽기 전용이다(`{eq}`/`{numref}`는 아래 "Local cross-reference authoring v1"). 일반 link가 있는 paragraph는 수정할 수 있다(아래 "Inline link authoring v1"). Table은 지원되는 인라인 내용의 cell을 수정하고 행/열을 추가할 수 있다(아래 "Table authoring v1"). 행/열 삭제·이동과 지원되지 않는 인라인 요소가 있는 cell은 읽기 전용이다. 글머리표·번호 목록은 항목을 편집할 수 있다(아래 "List authoring v1"). task list와 복합 항목 목록은 읽기 전용이다. Equation은 Equation editor에서 LaTeX와 label을 수정할 수 있다. Figure는 image/alt/label과 일반 텍스트 caption을 Figure editor에서, 서식 있는 caption을 문서 안에서 수정한다(label은 아래 "Equation / Figure label authoring v1"). legend, 지원되지 않는 인라인 요소 등 표현할 수 없는 Figure 구조는 읽기 전용이다. CLI `update-node-text` 는 그대로다.
- Enter는 paragraph와 heading을 나누고 heading 끝에서는 paragraph로 이어 쓴다. Backspace/Delete, 여러 블록 선택·클립보드·Undo/Redo를 지원한다. `+` / `/` insert menu, handle 메뉴의 문단↔제목 변환·Heading level 변경·삭제와 handle drag도 유지된다. 문단을 제목으로 바꾸면 서식·link·inline math·reference가 유지된다. 줄바꿈이 있는 문단은 제목으로 바꿀 수 없고 이유가 표시된다(#58). 자세한 경계는 아래 Continuous document editing을 따른다.
- 빈 paragraph는 저장되지 않는다. 내용을 모두 지운 뒤 Save하면 실패해야 한다.
- Editor가 연 뒤에 CLI가 같은 파일을 바꾸면 Save는 `Save conflict`로 거부된다. Editor의 저장하지 않은 입력은 자동으로 지워지지 않는다. 파일을 다시 읽으려면 페이지를 새로고침한다.
- 기존 수식은 Equation editor에서 LaTeX를 수정할 수 있고, 새 수식은 insert menu에서 추가할 수 있다.

## 6. 실패 시

- `pnpm` 또는 `tsx`를 찾지 못하면 저장소 루트에서 `pnpm install`을 다시 실행한다.
- `replaceText could not find paragraph or heading text`: `--from` 문장이 파일에 있는지 확인한다.
- `fromIndex out of range` / `index out of range`: `check`로 현재 index를 다시 본다. 앞 단계 명령을 건너뛰면 index가 달라진다.
- 두 번째 `format` 후 파일이 바뀌면 Core serialize invariant가 깨진 것이다.
- Editor 페이지가 비어 있으면 `pnpm --filter @ieumdoc/editor dev` 가 저장소 루트에서 실행 중인지, 주소가 `http://localhost:5173` 인지 확인한다.
- Save 후 파일에 반영되지 않으면 heading level/text, Note/Warning 본문 또는 지원되는 paragraph를 수정한 뒤 `Save` 를 다시 누른다. 지원되지 않는 admonition 구조와 인라인 요소가 있는 paragraph/table cell은 저장 대상이 아니다.
- Heading Enter가 새 블록으로 이어지는지 확인한다. Note와 표 셀은 일반 paragraph로 합쳐지지 않아야 한다.

## Single Editor 저장 경계 회귀 확인

- 문단의 bold 또는 italic 범위 끝에 공백을 포함해 저장한다. MyST가 그 서식을 유지할 수 없으면 `Save failed`로 거부하고 파일은 변경하지 않아야 한다. 공백을 서식 범위 밖으로 옮기면 저장할 수 있다.
- `**A*B*C**`, `*A**B**C*`, `***AB***` 같은 중첩 서식은 저장·재로드 후 같은 텍스트와 mark 범위를 유지해야 한다. AST nesting이나 text node 분할이 같을 필요는 없다.
- Save 응답을 지연한 상태에서 추가 입력한다. 응답 뒤 입력이 남고 `Saved; newer edits pending`이 표시되어야 한다. 다음 Save는 갱신된 revision을 사용하며 추가 입력을 포함한다.
- 409 충돌에서는 현재 입력과 Editor가 유지되어야 한다.

선택적 브라우저 회귀 스크립트(루트 개발 의존성에 고정된 `@playwright/cli` 사용):

```powershell
# 첫 터미널
pnpm --filter @ieumdoc/editor dev
# 다른 터미널
pnpm exec playwright-cli -s=ieumdoc-save-review open http://127.0.0.1:5173
pnpm exec playwright-cli -s=ieumdoc-save-review run-code --filename=apps/editor/test/save-during-edit.browser.js
pnpm exec playwright-cli -s=ieumdoc-save-review close
```

스크립트는 GET으로 현재 technical-document fixture를 읽고 모든 POST를 mock한다. 원본 파일은 쓰지 않는다.
결과의 `before`, `after`, `retained`, `conflictRetained`는 `true`, `editorCount`는 `1`이어야 한다.
이 검사는 `pnpm test`에 포함된 headless Core/adapter 테스트와 별도로 실행한다.

## Paragraph Editing Semantics v1 (Core + CLI)

새 복사본에서 실행한다. 원본 fixture는 수정하지 않는다.

```powershell
New-Item -ItemType Directory -Force tmp | Out-Null
Copy-Item packages/core/test/fixtures/document.md tmp/paragraph.md
pnpm ieumdoc help split-paragraph
pnpm ieumdoc help insert-hard-break
pnpm ieumdoc help merge-paragraph
pnpm ieumdoc inspect tmp/paragraph.md
pnpm ieumdoc split-paragraph tmp/paragraph.md --path 1 --offset 3
pnpm ieumdoc inspect tmp/paragraph.md
pnpm ieumdoc check tmp/paragraph.md
pnpm ieumdoc insert-hard-break tmp/paragraph.md --path 2 --offset 5
pnpm ieumdoc inspect tmp/paragraph.md
pnpm ieumdoc check tmp/paragraph.md
pnpm ieumdoc merge-paragraph tmp/paragraph.md --path 2
pnpm ieumdoc inspect tmp/paragraph.md
pnpm ieumdoc check tmp/paragraph.md
pnpm ieumdoc format tmp/paragraph.md
$first = Get-Content -Raw tmp/paragraph.md
pnpm ieumdoc format tmp/paragraph.md
$first -ceq (Get-Content -Raw tmp/paragraph.md)
```

마지막 결과는 `True`여야 한다. inspect는 Hard Break를 한 줄의 JSON 문자열 안에서 `\n`으로 표시한다.
Core representation은 `{ kind: "break" }`, MyST node는 `break`이며 canonical Markdown은 backslash 뒤의 개행이다.
Offset은 rendered UTF-16 code unit 기준이다. Hard Break는 1, mark는 children 길이만 센다.
Split과 merge는 top-level paragraph만 지원하고, merge는 공백을 자동 추가하지 않는다.
Split과 Hard Break 삽입 offset은 양 끝을 제외한다. 빈 문단이나 공백만 있는 결과는 저장하지 않는다.
UTF-16 surrogate pair 중간에서 잘라 UTF-8 파일에 저장할 수 없는 결과도 거부한다.
MyST가 의미를 유지할 수 없는 경계(예: split 후 trailing break, mark 내부 끝 공백)는 명시적으로 거부한다.
구조 변경 후에는 inspect로 path를 다시 찾는다. path는 영속 ID가 아니다.

Editor의 Enter split과 편집 가능한 인접 paragraph 사이의 Backspace merge를 지원한다.
Hard Break가 있는 지원 paragraph는 편집 가능하며 Shift+Enter로 줄바꿈을 추가한다.

## Editor Hard Break v1

- 지원 paragraph에서 Bold 또는 Italic을 켜고 `AB`를 입력한다. Shift+Enter를 누르고 `CD`를 입력한다.
- 같은 paragraph 안에서 줄바꿈과 서식이 유지되는지 확인한다. Bold + Italic 조합도 반복한다.
- Save 후 Reload하여 줄바꿈과 양쪽 서식이 유지되는지 확인한다. Markdown은 backslash + 개행으로 저장된다.
- 문단 끝에 줄바꿈만 추가한 상태의 Save는 Core에서 거부될 수 있다. 뒤에 텍스트를 입력한 뒤 저장한다.
- read-only reference paragraph와의 병합 및 내용 변경은 계속 차단되어야 한다.

## Editor Paragraph Split v1

- 지원 paragraph의 `AB|CD` 위치에서 Enter를 누른다. 두 문단 `AB` / `CD`가 되어야 한다. Bold, Italic, 두 서식 조합 및 hard break가 포함된 문단에서도 반복한다.
- 양쪽 문단에 텍스트를 추가하고 Undo/Redo한다. 하나의 Editor 안에서 분할과 입력이 복구되어야 한다.
- Save 후 Reload한다. 두 문단과 서식이 유지되고, 주변 Heading/Equation/Figure/Table/reference 내용이 같아야 한다.
- 시작/끝에서 Enter로 만든 새 빈 문단은 화면과 커서 위치를 유지하며 저장을 막지 않는다. 파일에는 빈 문단을 쓰지 않는다. 기존 문단의 내용을 모두 지우면 해당 block과 이유를 알리고 입력을 유지한다.
- Heading의 Enter는 제목을 나누고 끝에서는 paragraph로 나온다. Equation/Figure 등 선택한 block은 Delete/Backspace로 삭제하고 Undo로 복구할 수 있다. top-level block 재정렬은 왼쪽 handle을 사용하며, Shift+Enter는 같은 문단 안에 hard break를 만든다.
- 저장 응답을 지연시키고 추가 입력/분할한다. `Saved; newer edits pending` 후 입력이 남아야 하며 다음 Save 및 Reload에서도 유지되어야 한다.
- sourcePath는 이 세션에서 Open/New한 snapshot의 locator다. 분할 조각은 원본 path를 공유하며 새 빈 문단은 `new:*` locator를 사용한다. Save 후에도 locator와 편집 이력을 유지하고, 다시 열 때 새 snapshot path를 받는다. 영속 ID는 생성하지 않는다.

## Editor Paragraph Merge v1

- 두 번째 지원 paragraph의 맨 앞에 cursor를 두고 Backspace한다. 이전 paragraph와 공백 추가 없이 합쳐져야 한다.
- Bold/Italic/두 서식 조합과 hard break가 포함된 문단에서도 반복한다. Undo/Redo 후 같은 문단·서식으로 복구되어야 한다.
- Enter로 나눈 직후 Backspace로 다시 합친다. 병합 후 내용을 추가하고 Save → Reload하여 서식과 줄바꿈이 유지되는지 확인한다.
- 편집 가능한 Heading과도 공백 추가 없이 합쳐지고 지원 서식이 유지되어야 한다. 이전 block이 Equation/Figure/Table 또는 read-only paragraph이면 병합되지 않아야 한다. 문단 중간의 Backspace는 일반 문자 삭제다.
- Save 응답을 지연한 동안 추가 입력·병합·분할한다. 응답 후 입력이 남고 다음 Save → Reload에서도 같아야 한다.
- 병합 대상의 snapshot path 목록은 Editor 세션의 출처 정보이며, 파일에 저장되는 ID가 아니다. 서버는 Core merge/update/split operation만 호출한다.

## Editor Top-level Block Reorder v1

- 각 top-level block 왼쪽의 점 6개 handle에 hover/focus한 뒤 드래그한다. Paragraph, Heading, Equation, Figure, Table 및 현재 표시되는 read-only block을 같은 방식으로 이동할 수 있다.
- Paragraph를 Heading 또는 read-only block 앞뒤로 이동하고, Undo/Redo한다. block 내용과 formatting은 바뀌지 않아야 한다.
- 이동된 paragraph에 텍스트, Bold/Italic, Shift+Enter hard break를 추가한 뒤 Save → Reload한다. 순서와 의미가 유지되어야 한다.
- Save 응답을 지연한 상태에서 다시 drag하거나 입력한 뒤 `Saved; newer edits pending`을 확인한다. 다음 Save → Reload에서도 pending 변경이 남아야 한다.
- nested block, multi-select, type conversion은 범위가 아니다. block 추가/삭제는 아래 Editor UX Shell v1을 본다. canonical serializer가 block 경계를 바꾸는 reorder는 파일을 쓰지 않고 실패한다.
- 드래그하는 동안 옮기는 block은 옅은 파란색으로 칠해지고, 놓을 위치는 두 block 사이 간격 가운데의 선(왼쪽 끝에 작은 원)으로 표시된다. 제자리(바로 위·아래 간격)에서는 선이 보이지 않으며, 거기서 놓으면 아무 변화가 없다.
- 이동한 Equation은 편집창이 열리지 않고, 이동한 Figure는 선택되지 않아 properties가 뜨지 않는다. 옮기기 전에 그 block을 선택하고 있었다면 선택은 그대로 따라간다. paragraph/heading은 이전처럼 caret이 이동한 block으로 간다. Undo/Redo도 편집창을 열지 않는다.
- 한 block을 놓은 직후 곧바로 다른 block을 드래그할 수 있다(이전에는 놓은 직후의 드래그가 시작되지 않을 수 있었다). 놓은 뒤 editor focus가 유지되어 Ctrl+Z가 바로 동작한다.
- Apply하지 않은 Equation/Figure draft가 있는 block은 옮길 수 없다. handle에 hover하면 `Apply or Cancel the Equation edit before moving it.`(Figure는 `… Figure edit …`)이 보이고, 드래그가 시작되지 않으며 draft는 그대로다. Apply 또는 Cancel 뒤에는 다시 옮길 수 있다. 다른 block을 옮기는 것은 draft와 관계없이 가능하다.

브라우저 회귀: `pnpm browser:test block-move`는 scratch `tmp/block-move/technical-document.md`에서 실제 handle을 드래그해 위 표시·제자리·선택·연속 드래그·Undo/Redo·draft 차단을 확인한다. 저장하지 않으며 파일이 그대로인지도 확인한다.

## Editor Equation Draft Save v1

- Equation에서 `Edit`를 누르고 LaTeX를 바꾼다. Apply 전 입력은 초안으로 남고, Save/Source에는 마지막 Apply 값만 포함된다. block 안과 top bar 아래에 초안은 저장되지 않는다는 안내가 보인다. Save 후에도 초안과 편집창이 그대로 남고 상태는 `Unsaved changes`다.
- 같은 상태에서 `Apply` → `Save` → Reload한다. 바꾼 LaTeX가 유지된다.
- 다시 LaTeX를 바꾼 뒤 `Cancel` → `Save` → Reload한다. 마지막 Apply 값이 유지된다.
- Equation 편집창을 열기만 하고 내용을 바꾸지 않으면 `Save`는 정상 동작한다.
- Save가 확정 내용을 쓰더라도 초안은 Apply/Cancel 전까지 남는다. paragraph 편집, block reorder, delayed-save pending 동작은 그대로 유지된다.

## Editor UX Shell v1

- 화면은 sidebar, top bar, document column 세 영역이다. sidebar는 `«` / `»`로 접고 편다. sidebar에는 제품명, `Open…`, 현재 문서만 있다.
- `Open…`을 누르면 작은 dialog가 열린다. 경로를 입력하고 `Open`을 누른다. 저장하지 않은 변경이 있으면 dialog 안에 `Save or discard the current changes before opening another file.`가 보이고 현재 문서는 그대로다.
- Error는 top bar 아래 message area에 남고 `×`로 닫는다. Notice는 몇 초 뒤 사라진다. 두 메시지 모두 document column 안에 나타나지 않는다.
- block에 hover하면 왼쪽에 `+`와 `⠿`가 보인다. `+`는 insert menu를, `⠿` click은 block menu를 연다. `⠿` drag는 기존 reorder다.
- paragraph 시작 또는 공백 뒤에서 `/`를 입력하면 `+`와 같은 insert menu가 열린다. 입력한 글자로 걸러지고, ↑/↓/Enter로 고르며 Esc로 닫는다. 선택하면 `/` 입력은 지워진다.
- insert menu에는 현재 Core로 생성·편집·저장할 수 있는 `Paragraph`, `Heading 1`, `Heading 2`, `Heading 3`, `Equation`, `Figure`, `Table`이 있다(`Figure`는 아래 Figure Authoring v1, `Table`은 아래 Table authoring v1). 빈 paragraph에서 `Paragraph`를 고르면 그 paragraph를 그대로 쓰고, 아니면 아래에 새 paragraph를 만든다. `Heading`을 고르면 빈 heading이 생기고 caret이 그 안에 놓인다. `Equation`을 고르면 inline Equation editor가 바로 열리고 LaTeX를 입력한 뒤 `Apply`해야 한다. 새 block에 글을 쓰고 Save → Reload하면 paragraph는 Core `insertParagraph`, heading은 Core `insertHeading`, Equation은 Core `insertEquation`으로 저장된다. 새 빈 paragraph와 미적용 Equation은 세션에 남으며 확정 내용만 저장된다. 빈 heading은 위치·이유를 알리고 저장을 거부한다. 새 Equation을 `Cancel`하면 미완성 block이 남지 않는다. 끝에서 Enter로 생긴 빈 split sibling에서 Heading 또는 Equation을 고르면 원래 paragraph는 유지되고 새 block으로 저장된다.
- block menu에는 Core `removeBlock`으로 저장되는 `Delete`가 있다(Table에는 그 위에 `Add row below`, `Add column right`가 더 있다. 아래 Table authoring v1). 문서에 block이 하나뿐이면 비활성이다. Delete 후 Undo/Redo, Save → Reload를 확인한다. 다른 Equation을 편집 중이어도 draft가 유지되어야 한다.
- 키보드 Delete/Backspace와 지원 콘텐츠 붙여넣기로 block을 추가·삭제할 수 있다. Adapter가 승인한 엔진 변경의 삭제 경로를 기록하고 Core 연산으로 저장한다. 읽기 전용 survivor 변경과 표현할 수 없는 구조는 계속 거부한다.

Save 버튼, Open dialog, Open dialog의 경로 입력, Figure properties popover, sidebar/top bar의 아이콘 버튼은 shadcn(Base UI, Nova style, Stone base color) 기반이다. 이 전환은 상호작용을 바꾸지 않는다.

- 미적용 Equation/Figure 초안이 있어도 Save는 확정 내용을 저장할 수 있다. 저장 불가 문서의 비활성 Save는 hover/focus tooltip으로 이유를 안내한다.
- Figure를 선택하면 properties popover가 뜨지만 editor focus는 그대로 유지된다. popover가 열린 상태에서도 Delete 등 키보드 상호작용이 그대로 동작해야 한다.
- Open dialog는 Escape나 바깥 클릭으로도 닫힌다(이전 임시 구현에는 없던, 표준 dialog의 기본 동작).

선택적 브라우저 회귀 스크립트(POST는 모두 mock):

```powershell
pnpm exec playwright-cli -s=ieumdoc-shell open http://127.0.0.1:5173
pnpm exec playwright-cli -s=ieumdoc-shell run-code --filename=apps/editor/test/editor-shell.browser.js
pnpm exec playwright-cli -s=ieumdoc-equation open http://127.0.0.1:5173
pnpm exec playwright-cli -s=ieumdoc-equation run-code --filename=apps/editor/test/equation-insertion.browser.js
pnpm exec playwright-cli -s=ieumdoc-shell run-code --filename=apps/editor/test/open-files.browser.js
pnpm exec playwright-cli -s=ieumdoc-shell close
pnpm exec playwright-cli -s=ieumdoc-equation close
```

`editor-shell` 결과의 boolean 값은 모두 `true`, `plusMenuItems`와 `slashMenuItems`는 `["Paragraph", "Heading 1", "Heading 2", "Heading 3", "Equation", "Figure"]`, `blockMenuItems`는 `["Delete"]`, `editorCount`는 `1`이어야 한다. `draftScopeExplained`는 초안과 확정 내용의 저장 범위 안내를 확인한다.

## Figure Authoring v1

Core `updateFigure` / `insertFigure`가 Figure의 image URL, alt text, caption을 다룬다. label(`:name:`)은 이 연산들이 보존하고, 편집은 Core `updateLabel`이 맡는다("Equation / Figure label authoring v1"). reference rename, 이미지 업로드·복사·file picker는 범위가 아니다.

유효 조건(Core와 Editor Apply가 같은 규칙을 쓴다. 실제 MyST round-trip에서 확인한 조건이다):

- image URL은 필수다. 앞뒤 공백과 줄바꿈은 안 된다(빈 URL은 Figure가 사라지고, 공백은 저장 후 바뀐다).
- alt text는 비워도 된다(비우면 `:alt:`가 없어진다). 줄바꿈과 앞 공백은 안 된다.
- caption은 지원되는 인라인 내용이며 비워도 된다(비우면 caption이 없어진다). 일반 텍스트 입력은 문자열, 서식 있는 입력은 `InlineContent[]`로 Core에 전달한다. MyST가 다른 의미로 읽는 caption(예: `cost $5 and $x$`, `% ...`, `+++`)은 Core round-trip에서 거부된다. Editor `Apply`는 Host(`POST /api/figure-validation`)를 통해 같은 Core `validateFigure`를 호출하므로, 이런 값은 Apply 시점에 form이 유지된 채 오류가 보이고 block 값은 바뀌지 않는다. Save는 마지막 Apply 값과 다른 확정 내용을 저장한다.
- legend, 지원되지 않는 인라인 요소(예: `{sub}`) 등 표현할 수 없는 구조의 Figure는 읽기 전용이다(`inspect`의 `figureEditable=false`).

CLI:

```bash
pnpm ieumdoc insert-figure <file> --at 1 --image ./plot.svg --alt "Plot" --caption "Measured plot."
pnpm ieumdoc update-figure <file> --path 6 --caption "New caption."
pnpm ieumdoc update-figure <file> --path 6 --caption-content '[{"kind":"strong","children":[{"kind":"text","text":"Bold caption"}]}]'
```

`--caption`과 `--caption-content`는 함께 쓸 수 없다. `insert-figure`에서도 같은 두 옵션을 쓸 수 있다. `update-figure`에서 생략한 속성은 바뀌지 않는다. `--path`가 Figure가 아니거나 값이 유효하지 않으면 exit 1이고 파일은 그대로다.

Editor:

- 기존 Figure를 클릭하면 properties popover(Label, Image, Alt text, Caption)가 보이고 editor focus는 유지된다. block의 `Edit`를 누르면 Image / Alt text / Caption / Label 입력이 있는 form이 열린다.
- Figure form 값을 바꾸면 block 안에 `Unapplied changes are not saved. Apply to include them, or Cancel.`이 보인다. Save/Source는 form의 마지막 Apply 값과 문서에서 직접 편집한 caption을 포함하며 form 초안은 유지한다. Apply 후 새 값이 저장 대상이 되고 Cancel은 마지막 Apply 값으로 돌아간다.
- 상대 경로 이미지(`./`, `../`)는 열린 문서의 폴더 기준으로 보인다. 이미지 preview는 Apply 후 갱신된다.
- `+` 또는 `/figure`로 새 Figure를 넣으면 form이 바로 열리고 Image 입력에 focus가 간다. 빈 새 paragraph에서 `/figure`를 쓰면 그 paragraph가 Figure로 바뀌어 빈 paragraph가 남지 않는다. 한 번도 Apply하지 않고 `Cancel`하면 block이 사라진다(문서의 유일한 block이면 빈 paragraph로 돌아간다). Apply한 뒤 다시 `Edit` → 변경 → `Cancel`하면 block은 남고 Apply한 값으로 돌아간다.
- caption은 그림 아래 문서 안에서 직접 편집한다. 선택 서식 툴바·단축키, 서식 있는 붙여넣기, Undo/Redo가 문단처럼 작동한다. Enter는 그림 다음 문단으로 이동한다. 기존 일반 텍스트 caption은 Figure form의 Caption 입력도 사용할 수 있다. 서식 있는 caption의 form은 본문에서 편집하라는 안내를 보이며 image/alt/label Apply가 caption 서식을 보존한다.
- Save → Reload 후 image/alt/caption이 유지되고 기존 label은 그대로다. Delete, reorder, Undo/Redo, Save 지연 중 입력한 Figure draft도 기존 block과 같이 동작한다.

브라우저 회귀(실제 파일을 쓰므로 무시되는 `tmp/`의 scratch 사본에서 실행한다. 사본은 `pnpm browser:prepare`가 만든다):

```bash
pnpm browser:prepare
pnpm exec playwright-cli -s=ieumdoc-figure open http://127.0.0.1:5173
pnpm exec playwright-cli -s=ieumdoc-figure run-code --filename=apps/editor/test/figure-authoring.browser.js
pnpm exec playwright-cli -s=ieumdoc-figure run-code --filename=apps/editor/test/figure-draft-race.browser.js
pnpm exec playwright-cli -s=ieumdoc-figure close
```

결과의 boolean 값은 모두 `true`, `consoleProblems`는 `[]`이어야 한다. Focused regression은 editor selection이 Figure 밖으로 이동해도 Apply 또는 Cancel 전까지 form과 draft가 유지되고, Apply → Save → Reload 후 caption이 보존되는지 확인한다. 다시 실행하려면 `pnpm browser:prepare`를 다시 실행한다.

## PNG paste / file drop (#59)

개발 Host를 실행한 뒤 `pnpm browser:test image-assets`로 clipboard·drop·실제 PNG 로딩·Save → Reload·rollback을 함께 검증한다.

1. 저장 가능한 문서의 본문에 커서를 두고 스크린샷 PNG를 붙여넣는다. 선택한 블록 뒤에 Figure가 생기고 이미지가 표시되어야 한다. 원본 filename 대신 `./assets/image-<UUID>.png`를 사용한다.
2. 로컬 PNG 하나를 다른 본문 위치로 drop한다. 포인터가 가리킨 블록 뒤에 Figure가 생긴다. caption·alt·label은 기존 Figure 편집 UI로 수정한다. Undo 한 번은 Figure 삽입만 되돌린다.
3. Save → Reload 후 Figure 경로와 실제 이미지를 확인한다. 문서와 `assets/`를 함께 이동한 뒤 다시 열어도 이미지가 표시된다.
4. 내부 IeumDoc rich clipboard는 기존 typed paste를 우선한다. 외부 text/HTML과 PNG file이 함께 있으면 PNG만 삽입한다. 파일이 없는 text/rich paste와 top-level block drag reorder는 기존 흐름을 유지한다.
5. 빈 파일, 지원하지 않는 MIME, 크기 초과, read-only 문서, symlink `assets/`를 거부하고 문서를 그대로 유지해야 한다. 크기 상한은 [asset-policy.ts](../../apps/editor/shared/asset-policy.ts)가 기준이다. 업로드 중에는 `Adding image…`가 표시되며 Save와 문서 전환이 잠시 비활성화된다.

Host 실패는 Figure를 삽입하지 않는다. 파일 생성 뒤 삽입이 거부되면 해당 파일만 rollback하며, rollback 실패는 지울 파일 경로와 오류를 계속 표시한다. 정상 삽입 뒤 Undo·삭제·미저장 종료의 orphan은 v1에서 자동 정리하지 않는다. 응답 유실/Host 재시작의 제한은 [Host design](../design/filesystem-host-boundary-v1.md#asset-host-contract-v1-59)을 따른다.

## Table cell editing v1

Core `updateTableCell`이 top-level Markdown(GFM) table의 cell 인라인 내용 전체를 바꾼다. 빈 cell과 문단에서 지원하는 서식·link·인라인 수식·교차 참조를 편집할 수 있다. 지원되지 않는 인라인 요소(예: `{ref}`, `{sub}`)가 있는 cell은 읽기 전용이다. `{table}`, `{list-table}`, `{csv-table}` directive table은 지원하지 않는 block으로 남는다. 행/열 추가는 아래 "Table authoring v1"을 본다. 행/열 삭제·이동, 정렬 변경, merged cell은 범위가 아니다. 기존 열 정렬은 표시·저장한다.

유효 조건(Core round-trip에서 확인한 조건이다):

- 한 줄 텍스트만 된다. 앞뒤 공백은 안 된다. 비우면 빈 cell이 된다.
- `|`, `*`, `_`, `` ` `` 같은 Markdown 문자는 escape되어 글자 그대로 남는다.
- MyST가 다른 의미로 읽는 텍스트(예: `cost $x$`)는 거부된다.

CLI:

```bash
pnpm ieumdoc update-table-cell <file> --path 12,1,1 --text "AC-side"
pnpm ieumdoc update-table-cell <file> --path 12,1,1 --content '[{"kind":"strong","children":[{"kind":"text","text":"AC-side"}]}]'
pnpm ieumdoc update-table-cell <file> --path 12,2,1 --text ""
```

`--path`는 `table,row,cell`이다(header 행은 row 0). 거부되면 exit 1이고 파일은 그대로다.

Editor:

- Table은 문서 안의 일반 표로 보인다. 수정 가능한 cell을 클릭하고 바로 입력한다. 읽기 전용 cell은 흐린 글자이고 입력해도 바뀌지 않는다.
- Enter는 표 다음 문단으로 이동한다. Shift+Enter와 cell 시작의 Backspace는 표 구조를 바꾸지 않는다. cell 안에서 서식 툴바·단축키로 굵게/기울임/링크/인라인 수식/교차 참조 등을 적용·해제하고 서식 있는 내용을 붙여넣을 수 있다. 줄바꿈은 거부한다. Undo/Redo는 다른 편집과 같다.
- Save → Reload 후 수정한 header/body cell이 canonical Markdown에 남고, 다른 block은 그대로다. 유효하지 않은 cell 텍스트는 `Save failed`로 거부되고 파일은 바뀌지 않는다.

브라우저 회귀(실제 파일을 쓰므로 무시되는 `tmp/`의 scratch 사본에서 실행한다. 사본은 `pnpm browser:prepare`가 만든다):

```bash
pnpm browser:prepare
pnpm exec playwright-cli -s=ieumdoc-table open http://127.0.0.1:5173
pnpm exec playwright-cli -s=ieumdoc-table run-code --filename=apps/editor/test/table-cell-editing.browser.js
pnpm exec playwright-cli -s=ieumdoc-table close
```

결과의 boolean 값은 모두 `true`, `consoleErrors`는 `[]`이어야 한다. 다시 실행하려면 `pnpm browser:prepare`를 다시 실행한다.

## Table authoring v1

Core가 새 table, 기존 table의 행과 열을 만든다. 모두 canonical Markdown으로 다시 읽어 같은 표가 되는지 확인하고, 아니면 파일을 쓰지 않고 실패한다.

- `insertTable`: 선택적 열 정렬(left/center/right/null, CLI `--align`)과 함께 top-level 위치에 일반 텍스트 또는 `InlineContent[]` cell의 Markdown table을 넣는다. 첫 행이 header 행이고, 모든 행의 cell 수가 같아야 한다. cell 조건은 위 Table cell editing v1과 같다(빈 cell 가능).
- `insertTableRow`: 빈 body 행을 넣는다. header 행 위(row 0)에는 넣을 수 없다.
- `insertTableColumn`: header cell을 포함한 빈 열을 아무 위치에나 넣는다. 지원되지 않는 인라인 요소가 있는 읽기 전용 cell의 표에도 넣을 수 있다.
- 기존 열 정렬(`:--`, `:-:`, `--:`)은 셀 편집과 저장 뒤에도 유지된다. 새 행은 기존 열의 정렬을 따르고, 새 열은 정렬을 지정하지 않는다. 행/열 삭제·이동은 범위가 아니다.

CLI:

```bash
pnpm ieumdoc insert-table <file> --at 1 --cells '[["Port","Type"],["U","AC"]]'
pnpm ieumdoc insert-table-row <file> --path 1 --at 2      # 1..행 수(끝)
pnpm ieumdoc insert-table-column <file> --path 1 --at 1   # 0..열 수(끝)
pnpm ieumdoc update-table-cell <file> --path 1,2,0 --text "P"
```

`--cells`는 행 배열의 JSON이다(첫 행이 header). 거부되면 exit 1이고 파일은 그대로다.

Editor:

- `+` 또는 `/` insert menu의 `Table`은 header 행과 body 2행, 3열의 빈 표를 만들고 caret을 첫 header cell에 둔다. 빈 transient paragraph에서 고르면 그 자리를 대신한다. 모든 cell이 빈 새 표는 저장되지 않는다(`empty table cannot be saved`).
- 표의 `⠿`를 click하면 block menu에 `Add row below`, `Add column right`, `Delete`가 있다. caret이 그 표의 cell에 있으면 그 행 아래 / 그 열 오른쪽에, 아니면 마지막 행 아래 / 마지막 열 오른쪽에 빈 행/열이 생기고 caret이 새 cell로 간다. 다른 block의 menu에는 두 항목이 없다.
- 새 cell은 편집 가능한 빈 cell이다(새 열의 header 행 cell은 header). 행/열 추가는 각각 Undo 한 번으로 되돌아가고, 되돌린 뒤에는 저장할 변경이 없다.
- Save → Reload 후 새 표와 새 행/열, 입력한 텍스트가 canonical Markdown에 남는다. 저장한 뒤에 추가한 행/열도 다음 Save에서 저장된다. 기존 cell의 수정은 같은 Save에서 함께 저장된다.

브라우저 회귀: `pnpm browser:test table-authoring`은 scratch `tmp/table-authoring/tables.md`에서 insert menu로 표를 만들고, 기존 표의 block menu로 행과 열을 추가해 입력한 뒤 Save하고, 저장 후 행을 하나 더 추가해 다시 Save한다. 두 번의 파일 내용과 다시 연 화면을 확인한다.

## List authoring v1 (#52)

Core가 top-level 글머리표·번호 목록을 만들고(`insertList`), 편집 가능한 목록의 종류·시작 번호·항목·중첩을 통째로 바꾼다(`updateList`). 모두 canonical Markdown으로 다시 읽어 같은 목록이 되는지 확인하고, 아니면 파일을 쓰지 않고 실패한다.

- 편집 가능한 목록: 각 항목이 지원 inline(text, strong, emphasis, 일반 link, inline code, inline math, `{eq}`/`{numref}`)만 있는 문단 하나와, 선택적으로 중첩 목록 하나를 가진다. 여러 단계 중첩과 글머리표/번호 혼합이 가능하다.
- 읽기 전용으로 남는 목록: task list(`- [ ]`), 한 항목에 문단이 여럿이거나 코드·표 등 다른 블록이 있는 목록, 지원하지 않는 inline이 있는 목록.
- 빈 항목은 저장되지 않는다(`empty list item cannot be saved`). 같은 종류의 목록이 바로 이어지면 다시 읽을 때 하나로 합쳐지므로 거부된다.
- 목록을 만드는 Markdown 입력 단축(`- `, `1. `)은 아래 Markdown input shortcuts(#55)를 따른다.

CLI:

```bash
pnpm ieumdoc insert-list <file> --at 1 --list '{"ordered":false,"items":[{"content":[{"kind":"text","text":"First"}]}]}'
pnpm ieumdoc inspect <file> --format json      # 목록 node의 ordered/start/items가 update-list 입력과 같은 형태
pnpm ieumdoc update-list <file> --path 1 --list '{"ordered":true,"start":3,"items":[{"content":[{"kind":"text","text":"Step"}]}]}'
```

항목은 `{"content": InlineContent[], "list"?: ListContent}`이다. 거부되면 exit 1이고 파일은 그대로다. text `inspect`는 목록 아래에 항목을 `- text=...`/`1. text=...`로 들여 써서 보여 준다.

Editor:

- `+` 또는 `/` insert menu의 `Bulleted list`, `Numbered list`는 빈 항목 하나인 목록을 만들고 caret을 그 항목에 둔다. 아무것도 입력하지 않은 새 목록은 저장되지 않고 변경으로 보지 않는다.
- 항목 끝의 Enter는 새 항목을 만들고, 마지막 빈 항목의 Enter는 목록을 빠져나가 paragraph가 된다. Tab은 항목을 앞 항목 아래로 들여 쓰고 Shift+Tab은 내어 쓴다. Shift+Enter는 항목 안 줄바꿈이다. Bold/Italic/Link 툴바와 inline math·reference도 항목 안에서 쓸 수 있다.
- 목록은 handle로 이동·삭제할 수 있고, Save → Reload 후 편집 가능한 목록으로 다시 열린다.

브라우저 회귀: `pnpm browser:test list-authoring`은 scratch `tmp/list-authoring/lists.md`에서 Enter·Tab·빈 항목 Enter를 실제 키로 입력하고, `/numbered`로 번호 목록을 넣은 뒤 Save해 파일 내용과 다시 연 화면을 확인한다.

## Code block and inline code authoring v1 (#53)

Core가 fenced code block을 만들고(`insertCodeBlock`), 편집 가능한 code block의 언어와 내용을 바꾼다(`updateCodeBlock`). 인라인 코드는 Core `InlineContent`의 `code`로 저장된다. 모두 canonical Markdown으로 다시 읽어 같은 내용이 되는지 확인하고, 아니면 파일을 쓰지 않고 실패한다.

- 편집 가능한 code block: 언어(한 단어, 없어도 됨)와 코드만 있는 일반 fenced 또는 indented code. 공백·탭·들여쓰기·빈 줄이 보존된다.
- 읽기 전용으로 남는 것: caption·label 등 option이 있는 ````{code-block}` directive, `{code-cell}` 등 실행형 directive, front matter.
- 언어는 공백·backtick 없는 한 단어이고 `{`로 시작하지 않는다. 코드 줄바꿈은 `\n`이다. 인라인 코드는 비어 있지 않은 한 줄 텍스트다.
- 인라인 코드는 text, strong, emphasis, 일반 link, inline math, `{eq}`/`{numref}`와 함께 지원 inline이다. inline code를 감싼 link도 지원된다. split / merge / hard break에서 inline code는 그 문자 수만큼 센다.
- 구문 강조는 Editor 표시에만 있는 decoration이며 문서에 기록되지 않는다. 등록되지 않은 언어는 평문으로 보인다.
- 코드 fence(```` ``` ````)와 인라인 코드(`` ` ``) 입력 단축은 아래 Markdown input shortcuts(#55)를 따른다.

CLI:

```bash
pnpm ieumdoc insert-code-block <file> --at 1 --language python --code "def f():`n    return 1"
pnpm ieumdoc update-code-block <file> --path 1 --language py
pnpm ieumdoc update-code-block <file> --path 1 --code "print(1)"
```

`update-code-block`에서 생략한 속성은 바뀌지 않는다. `--language ""`는 언어를 지운다. 두 flag가 모두 없거나, 언어·코드가 유효하지 않거나, 대상이 편집 가능한 code block이 아니면 exit 1이고 파일은 그대로다. text `inspect`는 `code language="py" code="..."`로 보여 주고, `--format json`은 `language`/`code`를 그대로 준다.

Editor:

- `+` 또는 `/` insert menu의 `Code block`은 빈 code block을 만들고 caret을 그 안에 둔다. 아무것도 입력하지 않은 새 code block은 저장되지 않고 변경으로 보지 않는다.
- code block 안에서 Enter는 새 코드 줄이고 Tab은 4칸 들여쓰기다(Shift+Tab은 내어 쓰기). 빈 줄에서 Enter 세 번 또는 마지막 줄 끝의 ArrowDown은 block을 빠져나간다. block 위의 Language 입력이 fence 언어다(공백·backtick은 지워진다).
- 기존 fenced code block은 언어와 함께 편집 가능한 상태로 열리고, 언어가 있으면 구문 강조가 표시된다.
- 텍스트를 선택하고 selection toolbar의 `Inline code`를 누르면 inline code가 적용·해제된다. inline code는 bold/italic/link와 함께 쓸 수 있고, Shift+Enter 줄바꿈은 inline code를 끝낸다.
- Save → Reload 후 내용·들여쓰기·빈 줄·언어가 그대로다.

브라우저 회귀는 없다. #53은 작업 범위 조정으로 자동 browser scenario를 추가하지 않았으므로, 위 Editor 항목(실제 키 Enter/Tab 동작과 구문 강조 표시 포함)을 수동으로 확인한다.

## Markdown input shortcuts (#55)

Editor 전용 입력 상호작용이다(CLI parity 대상 아님). 각 단축은 같은 insert/변환 명령과 같은 editor 문서를 만들고, Save는 같은 Core operation(`removeBlock`, `insertHeading`, `insertList`, `insertCodeBlock`, 문단 inline 변경)으로 저장한다.

- 최상위 문단 맨 앞에서: `#`–`######` + 공백 → 제목 1–6, `- `/`* `/`+ ` → 글머리표 목록, `3. ` → 3부터 시작하는 번호 목록, ```` ```js ```` + 공백 또는 Enter → 언어가 `js`인 code block. 문단의 나머지 내용은 새 블록으로 옮겨진다.
- 줄바꿈이 있는 문단은 제목으로, 서식·link·inline math·reference·줄바꿈이 있는 문단은 code block으로 바뀌지 않는다(입력한 문자가 그대로 남는다). 제목 단축은 서식을 유지한다. 목록은 서식을 그대로 담는다. 목록 항목·Note/Warning·표 cell 안에서는 블록 단축이 적용되지 않는다.
- 인라인: `**굵게**`/`__굵게__`, `*기울임*`/`_기울임_`, `` `코드` ``(앞이 줄 시작이나 공백일 때). 제목·표 cell·그림 caption에서도 지원되는 인라인 서식 단축이 적용된다. code block 안에서는 어떤 단축도 적용되지 않는다.
- 단축 직후 Ctrl/Cmd+Z 또는 Backspace는 입력한 문자 그대로(예: `## `) 되돌리고 caret을 그 뒤에 둔다. Enter로 적용한 code fence는 Enter 없이 ```` ```js ````로 되돌아간다.
- 인용문(`> `), 구분선(빈 문단에서 `---`), 취소선(`~~취소~~`)은 아래 Basic blocks(#57)를 따른다.

브라우저 회귀: `pnpm browser:test markdown-input`은 scratch `tmp/markdown-input/markdown-input.md`에서 위 단축을 실제 키로 입력하고, Undo로 `## `가 돌아오는지, code block에서는 문자가 그대로 남고 표 cell·제목에는 서식이 적용되는지 확인한 뒤 Save해 파일 내용과 다시 연 화면을 확인한다.

## Formatted headings (#58, 제목)

Core 제목 read model은 `content`(InlineContent)를 갖는다. 줄바꿈 없는 지원 inline(굵게·기울임·취소선·inline code·일반 link·inline math·`{eq}`/`{numref}`)만 있는 제목은 편집 가능하고, `{ref}` 등 지원하지 않는 inline이나 줄바꿈(Setext 제목 안의 `\`)이 있는 제목은 읽기 전용이다. `updateHeadingInlineContent`와 `insertHeading`(InlineContent 허용)은 canonical round-trip을 확인하고, 아니면 파일을 쓰지 않는다.

CLI:

```bash
pnpm ieumdoc insert-heading <file> --at 1 --level 2 --content '[{"kind":"strong","children":[{"kind":"text","text":"Limits"}]}]'
pnpm ieumdoc update-heading <file> --path 1 --text "Revised limits"
```

Editor:

- 서식 있는 기존 제목이 편집 가능한 제목으로 열린다. 제목 안에서 selection toolbar(굵게·기울임·취소선·inline code·link·inline math·cross-reference)와 `**`·`*`·`~~`·` ` ` 입력 단축이 동작한다. Shift+Enter 줄바꿈은 제목에 들어가지 않는다.
- 줄바꿈이 있는 내용을 제목에 붙여넣으면 이유가 표시되고 아무것도 바뀌지 않는다. 줄바꿈이 있는 문단을 제목 뒤에서 Backspace로 합치면 문단이 되고, 줄바꿈 없는 서식 문단은 제목에 그대로 합쳐진다.
- 표 셀과 그림 캡션도 지원되는 서식을 편집한다(위 Table cell editing / Figure authoring 참조).

브라우저 회귀: `structural-block-authoring`은 서식 있는 문단을 제목으로 바꾸고 제목 안에서 기울임을 적용해 저장·다시 열기를 확인하고, 줄바꿈이 있는 문단의 변환 거부를 확인한다. `markdown-input`은 제목 안의 `**` 단축을 확인한다.

## Document outline (#61)

Editor 전용 탐색이다(CLI parity 대상 아님, 구조는 `ieumdoc inspect`가 보여 준다). 개요는 Editor 문서에서 파생하며 문서에 기록하지 않는다.

- 사이드바를 펼치면 문서 아래에 `Outline`이 있고 최상위 제목(서식 있는 읽기 전용 제목 포함)이 순서대로 레벨별 들여쓰기로 보인다. 제목이 없으면 `No headings`.
- 항목을 누르면 그 제목이 상단 헤더 바로 아래로 스크롤되고 caret이 제목 맨 앞에 놓여 바로 입력할 수 있다. Source 보기에서 누르면 Visual로 돌아와 이동한다.
- 키보드: Tab으로 항목에 들어가 ↑/↓/Home/End로 이동하고 Enter 또는 Space로 이동한다. 이 Enter는 문서에 입력되지 않는다.
- 현재 읽는 절이 강조된다(화면 위 30% 지점을 지난 마지막 제목, 문서 끝에서는 화면에 보이는 마지막 제목). 개요로 고른 제목은 스크롤하기 전까지 현재 절로 남는다.
- 제목을 고치거나 `## `·메뉴로 추가하거나 삭제하면 개요가 즉시 바뀐다.

브라우저 회귀: `pnpm browser:test outline`은 scratch `tmp/outline/outline.md`에서 클릭·키보드 이동, 스크롤에 따른 현재 절, 편집 반영, Source에서의 이동을 확인한다. 저장하지 않는다.

## Basic blocks (#57)

Core가 인용문(`insertQuote`/`updateQuoteInlineContent`), 구분선(`insertDivider`), admonition 종류 변경(`updateAdmonitionVariant`), 취소선 InlineContent(`delete`)를 제공한다. 모두 canonical Markdown으로 다시 읽어 같은 내용이 되는지 확인하고, 아니면 파일을 쓰지 않고 실패한다.

- 인용문 v1: 문단 하나(지원 inline과 Shift+Enter 줄바꿈)를 담는 `> ` 인용문. 문단이 여럿이거나 목록·코드 등 다른 블록이 든 인용문은 읽기 전용이다.
- 구분선: Markdown thematic break(`---`). `***`, `___`로 쓴 구분선도 편집 가능한 구분선으로 열리고 `---`로 저장된다.
- 취소선: MyST `{del}` role로 저장된다. 굵게·기울임·link·inline math와 함께 쓸 수 있다. GFM `~~취소~~` 문법은 MyST가 읽지 않으므로 파일에 있으면 글자 그대로다.
- admonition 종류: note, tip, hint, important, seealso, attention, caution, warning, danger, error. 제목이 필요한 일반 `{admonition}`은 읽기 전용이다.
- 제목 H4–H6을 insert menu와 `/h4`–`/h6`으로 넣는다.

CLI:

```bash
pnpm ieumdoc insert-quote <file> --at 1 --text "Quoted."
pnpm ieumdoc update-quote <file> --path 1 --content '[{"kind":"delete","children":[{"kind":"text","text":"Old"}]}]'
pnpm ieumdoc insert-divider <file> --at 2
pnpm ieumdoc update-admonition-variant <file> --path 3 --variant tip
```

거부되면 exit 1이고 파일은 그대로다. text `inspect`는 `quote inlineEditable=... text=...`, `divider`로 보여 준다.

Editor:

- insert menu의 `Quote`는 빈 인용문을 만들고 caret을 그 안에 둔다. 인용문 안의 Enter는 인용문을 빠져나가 아래 paragraph로 가고, Shift+Enter는 줄바꿈이다. 빈 인용문은 저장되지 않는다(Save 오류).
- insert menu의 `Divider`는 구분선과 그 아래 빈 paragraph를 만들고 caret을 paragraph에 둔다. 구분선은 handle로 이동·삭제한다.
- selection toolbar의 `Strikethrough`(또는 Ctrl/Cmd+Shift+S)가 취소선을 적용·해제한다.
- admonition의 handle 메뉴에서 `Change to Tip` 등으로 종류를 바꾼다. 색상은 정보(note·tip·hint·important·see also), 주의(attention·caution·warning), 위험(danger·error) 세 가지다.
- Markdown 단축: 최상위 문단 맨 앞의 `> `는 인용문(나머지 내용 유지), 빈 문단의 `---`는 구분선, `~~취소~~`는 취소선이 된다. 단축 직후 Undo는 입력한 문자로 되돌린다.

브라우저 회귀: `pnpm browser:test basic-blocks`는 scratch `tmp/basic-blocks/basic-blocks.md`에서 위 Editor 동작을 실제 메뉴·키로 수행하고 Save해 파일 내용과 다시 연 화면을 확인한다.

## Inline link authoring v1

일반 Markdown link(`[텍스트](URL "선택적 title")`, `<https://...>`)가 있는 paragraph는 일반 paragraph처럼 수정한다. Core `InlineContent`의 `link`로 저장되고 split / merge / hard break도 link를 유지한다. `{eq}` / `{ref}` / `{numref}` 같은 cross-reference는 link가 아니다(`{eq}`/`{numref}` 편집은 "Local cross-reference authoring v1").

읽기 전용으로 남는 link: 표시 텍스트가 빈 link(`[](#x)`), image를 감싼 link, `{download}` link, 같은 대상으로 가는 link 두 개가 붙어 있는 paragraph(`[a](x)[b](x)`; 편집기에서 하나로 합쳐지기 때문).

Editor:

- link 텍스트를 선택하면 selection toolbar에 `Link` 버튼이 있다. 누르면 URL 입력이 뜬다. 기존 link면 현재 URL이 채워져 있다.
- `Apply`(또는 Enter)로 link를 추가하거나 URL을 바꾼다. 기존 title은 유지된다. `Remove`는 link만 없애고 텍스트와 굵게/기울임은 남긴다. Esc는 취소한다.
- 표시 텍스트는 일반 텍스트처럼 고친다. link 안쪽에서 입력하면 link가 유지된다. link 맨 앞/맨 끝에서 입력하거나 link 텍스트 전체를 덮어 쓰면 새 텍스트는 link 밖이다(일반적인 편집기 동작).
- 굵게/기울임과 link를 함께 써도 Save → Reload 후 같은 의미로 남는다.
- 공백이 있는 URL은 form에서 거부된다. 한글처럼 parser가 인코딩하는 URL은 `Save failed`로 거부되고 파일은 바뀌지 않는다. 인코딩된 URL(`%ED%95%9C…`)을 쓰면 된다.
- 수정하지 않은 link paragraph는 Save해도 다시 쓰이지 않는다.

CLI: 전용 명령은 없다. 기존 `split-paragraph`, `merge-paragraph`, `insert-hard-break`, `replace-text`가 link paragraph에서도 link를 유지한다.

브라우저 회귀(실제 파일을 쓰므로 무시되는 `tmp/`의 scratch 사본에서 실행한다. 사본은 `pnpm browser:prepare`가 만든다):

```bash
pnpm browser:prepare
pnpm exec playwright-cli -s=ieumdoc-links open http://127.0.0.1:5173
pnpm exec playwright-cli -s=ieumdoc-links run-code --filename=apps/editor/test/link-authoring.browser.js
pnpm exec playwright-cli -s=ieumdoc-links close
```

결과의 boolean 값은 모두 `true`, `consoleErrors`는 `[]`이어야 한다. 다시 실행하려면 `pnpm browser:prepare`를 다시 실행한다.

## Inline math authoring v1

paragraph 안의 inline math(`$x$`, `{math}`x``)가 있는 paragraph는 일반 paragraph처럼 수정한다. Core `InlineContent`의 `math`(LaTeX source)로 저장되고 canonical 형태는 `{math}`x``다(`$x$`도 저장하면 이 형태가 된다). display Equation block(`{math}` directive, `$$`)과 cross-reference는 바뀌지 않는다.

- inline math는 KaTeX로 보인다. 클릭하면 아래에 source 입력이 뜬다. `Apply`(또는 Enter)로 source를 바꾸고, `Remove`로 math를 source 텍스트로 되돌린다(굵게/기울임/link는 남는다). Esc는 취소다.
- 텍스트를 선택하고 selection toolbar의 `Inline math`(Σ)를 누르면 선택한 텍스트가 source인 inline math가 된다. 줄바꿈이나 다른 inline math가 섞인 선택은 거부된다.
- inline math가 선택된 상태의 Enter / Shift+Enter는 문단을 나누거나 math를 지우지 않는다. 글자를 입력하면 선택한 math를 대체한다(일반 선택 동작, Undo 가능).
- 굵게/기울임/link 안의 inline math는 Save → Reload 후 같은 의미로 남는다.
- source는 한 줄이어야 하고 비어 있으면 안 된다. 맨 앞/맨 끝이 backtick인 source처럼 canonical role로 그대로 쓸 수 없는 값은 `Save failed`로 거부되고 파일은 바뀌지 않는다.
- CLI의 paragraph offset에서 inline math는 hard break처럼 한 글자로 센다(`pnpm ieumdoc help split-paragraph`).

브라우저 회귀(실제 파일을 쓰므로 무시되는 `tmp/`의 scratch 사본에서 실행한다. 사본은 `pnpm browser:prepare`가 만든다):

```bash
pnpm browser:prepare
pnpm exec playwright-cli -s=ieumdoc-math open http://127.0.0.1:5173
pnpm exec playwright-cli -s=ieumdoc-math run-code --filename=apps/editor/test/inline-math-authoring.browser.js
pnpm browser:prepare
pnpm exec playwright-cli -s=ieumdoc-math run-code --filename=apps/editor/test/inline-math-split.browser.js
pnpm exec playwright-cli -s=ieumdoc-math close
```

결과의 boolean 값은 모두 `true`, `consoleErrors`는 `[]`이어야 한다. 다시 실행하려면 `pnpm browser:prepare`를 다시 실행한다.

## Read-only Source View v1

Top bar 오른쪽의 `Visual | Source`는 같은 문서의 두 view다. `Source`는 지금 Save하면 쓰일 canonical Markdown을 읽기 전용으로 보여 준다. Apply된 미저장 Visual 변경도 포함되며, 파일은 쓰지 않는다(Host가 Save와 같은 Core 경로를 실행하고 결과만 돌려준다).

- `Source`를 누를 때마다 현재 editor 상태로 다시 만든다. 편집, 선택, syntax highlighting, line number는 없다.
- `Visual`로 돌아오면 미저장 편집과 Undo/Redo가 그대로 남는다(Editor는 숨겨질 뿐 다시 만들어지지 않는다).
- Save와 save status는 두 view에서 같다. Source에서 Save하면 보이던 Markdown이 그대로 저장된다. 다른 파일을 Open/New하면 Visual로 돌아간다.
- Apply되지 않은 Equation/Figure draft는 Source에 포함되지 않는다. 안내 문구가 보이며 Visual로 돌아오면 입력 중이던 값이 그대로 남는다.
- 비워진 기존 paragraph 등 실제 저장 불가 내용은 `Source view unavailable: …`로 알리고 Visual에 남는다. 새 빈 편집용 paragraph는 제외한다. 외부 변경 충돌 뒤에도 현재 세션의 확정 내용을 Source로 확인·복사할 수 있으며 파일은 쓰지 않는다. 열 때부터 canonical write가 불가능한 문서는 읽기 전용이며, Source는 `Original Markdown · read-only`로 원본을 보여 준다.
- CLI에는 미저장 editor 상태가 없으므로 별도 command가 없다. 저장된 파일의 canonical 형태는 `pnpm ieumdoc format <file>`로 만든다.

브라우저 회귀(실제 파일을 쓰므로 무시되는 `tmp/`의 scratch 사본에서 실행한다. 사본과 canonical 기준값 `expected.md`는 `pnpm browser:prepare`가 만든다):

```bash
pnpm browser:prepare
pnpm exec playwright-cli -s=ieumdoc-source open http://127.0.0.1:5173
pnpm exec playwright-cli -s=ieumdoc-source run-code --filename=apps/editor/test/source-view.browser.js
# Source 요청이 끝나기 전에는 Open/New로 문서를 바꿀 수 없다(파일을 쓰지 않는다).
pnpm exec playwright-cli -s=ieumdoc-source run-code --filename=apps/editor/test/source-view-pending.browser.js
pnpm exec playwright-cli -s=ieumdoc-source close
```

결과의 boolean 값은 모두 `true`, `consoleErrors`는 `[]`이어야 한다(거부된 Source 요청의 400은 `onlyRejectedPreviewLogged`로 따로 확인한다). 다시 실행하려면 `pnpm browser:prepare`를 다시 실행한다.

## Equation / Figure label authoring v1

Equation과 Figure의 label(reference target 이름)을 Visual Editor에서 추가 / 수정 / 제거한다. label은 NodePath나 block identity가 아니다. 저장은 Core `updateLabel`을 거친다(CLI: `pnpm ieumdoc update-label <file> --path <index> --label <label>`, 빈 `--label ""`은 제거).

- Equation: `Edit` 폼의 `Label` 입력. Figure: `Edit figure` 폼의 `Label` 입력. 둘 다 `Apply`해야 Save/Source에 반영되며, Apply 전 입력은 별도의 미저장 초안으로 유지된다. 새 Equation/Figure에도 label을 지정할 수 있다.
- canonical 표현: Equation은 `:label:`, Figure는 `:name:`(`:label:`로 쓴 Figure도 저장하면 `:name:`이 된다). Source View에 미저장 label 변경도 보인다.
- label은 한 줄이고 앞뒤 공백이 없어야 한다(Apply에서 거부). MyST target이 되지 않는 값(예: `""`), `{eq}`/`{numref}`로 참조할 수 없는 값(예: `eq<a>`)은 Save/Source에서 거부된다.
- 같은 문서의 다른 target(Equation, Figure, `(label)=` target 등)과 MyST identifier가 같으면(대소문자 무시) 중복으로 거부된다. 파일은 바뀌지 않는다. 한 번의 Save 안에서 두 block의 label을 서로 바꾸는 것은 된다.
- 기존 reference(`{eq}`, `{numref}`, `[](#...)`)는 자동으로 바뀌지 않는다. label을 바꾸거나 지우면 reference가 끊어질 수 있다.
- 구조가 read-only인 Figure의 label은 바꿀 수 없다.

브라우저 회귀(실제 파일을 쓰므로 무시되는 `tmp/`의 scratch 사본에서 실행한다. 사본은 `pnpm browser:prepare`가 만든다):

```bash
pnpm browser:prepare
pnpm exec playwright-cli -s=ieumdoc-label open http://127.0.0.1:5173
pnpm exec playwright-cli -s=ieumdoc-label run-code --filename=apps/editor/test/label-authoring.browser.js
pnpm exec playwright-cli -s=ieumdoc-label close
```

결과의 boolean 값은 모두 `true`, `consoleErrors`는 `[]`이어야 한다(거부된 Save/Source 요청의 400은 `duplicateRequestsLogged`로 따로 확인한다). 다시 실행하려면 `pnpm browser:prepare`를 다시 실행한다.

## Local cross-reference authoring v1

현재 문서의 label이 있는 Equation(`{eq}`)과 Figure(`{numref}`)를 paragraph 안에서 참조한다. reference는 Core `InlineContent`의 `reference`(role + label)로 저장되고 canonical 형태는 `{eq}`label`` / `{numref}`label``다. `[text](#label)` 같은 일반 fragment link와는 서로 바뀌지 않는다.

- 편집 대상은 표시 텍스트가 없는 `{eq}`label``, `{numref}`label``뿐이다. `{numref}`Figure %s <label>`` 같은 표시 텍스트, `{ref}`, link 안의 reference가 있는 paragraph는 계속 읽기 전용이다.
- 삽입: 텍스트를 선택하고 selection toolbar의 `Cross-reference`(#)를 누르면 target을 고르는 작은 form이 열린다(선택한 텍스트와 같은 label이 있으면 미리 선택된다). caret 위치에서는 `/`를 입력하고 `Equation reference: …` / `Figure reference: …`를 고른다.
- reference를 클릭하면 target을 바꾸거나 `Remove`로 label 텍스트로 되돌릴 수 있다. 굵게/기울임은 reference에도 적용되고, link는 적용되지 않는다. split / merge / hard break에서 reference는 한 글자로 센다.
- 문서 안에 같은 종류의 target이 있으면(MyST처럼 대소문자 무시) 보통 표시, 없으면 흐린 점선으로 표시되고 tooltip에 `Unresolved`가 나온다. label을 바꾸면 바로 반영된다. 끊어진 reference도 그대로 저장된다.
- target 목록은 현재 문서의 Equation/Figure label(Apply한 미저장 label 포함)이다. `{numref}`가 Equation이나 table을 가리키면 v1에서는 unresolved로 보인다.

브라우저 회귀(실제 파일을 쓰므로 무시되는 `tmp/`의 scratch 사본에서 실행한다. 사본은 `pnpm browser:prepare`가 만든다):

```bash
pnpm browser:prepare
pnpm exec playwright-cli -s=ieumdoc-xref open http://127.0.0.1:5173
pnpm exec playwright-cli -s=ieumdoc-xref run-code --filename=apps/editor/test/cross-reference.browser.js
pnpm exec playwright-cli -s=ieumdoc-xref close
```

결과의 boolean 값은 모두 `true`, `consoleErrors`는 `[]`이어야 한다. 다시 실행하려면 `pnpm browser:prepare`를 다시 실행한다.

## Canonical Input Safety v1

Core parse 경계(`packages/core/src/myst/parse.ts`)의 계약이다. canonical write guard는 parse 결과와 그 canonical Markdown을 다시 parse한 결과를 비교하므로, parse 자체가 바꾸는 것은 보지 못한다. 그래서 parse 경계에서 다음을 지킨다.

- 입력한 텍스트는 그대로다. MyST 기본값인 typographic quote 치환(markdown-it `typographer` + `smartquotes`)을 끈다. `Don't panic.`, `The state is "READY".`는 Editor Save / CLI 쓰기 / Reload 뒤에도 곧은 따옴표로 남는다. 문서에 이미 있는 `“ ” ‘ ’`도 쓴 그대로 남는다.
- 파일 맨 앞의 UTF-8 BOM은 인코딩 표시일 뿐 내용이 아니다. parse 전에 한 번 제거하므로 `<BOM># Heading`은 heading이다. Save / `format` 결과에는 BOM을 쓰지 않는다. 문서 중간의 U+FEFF는 내용으로 남는다.
- 닫힌 front matter는 문서 맨 앞의 메타데이터로 보존한다. 일반 YAML code fence와 구분하며, 닫히지 않았거나 지원하지 않는 delimiter를 쓴 front matter, 메타데이터를 본문으로 이동시키는 쓰기는 거부한다. 표 열 정렬과 일반 Markdown 이미지도 문서 전체의 canonical round-trip 검사를 통과한 경우 보존한다.

수동 확인:

```bash
printf '\xef\xbb\xbf# Heading\n\nBody.\n' > /tmp/bom.md && pnpm ieumdoc format /tmp/bom.md && head -c 12 /tmp/bom.md | od -c   # BOM 없이 "# Heading"
printf -- '---\ntitle: Example\n---\n\n# Heading\n' > /tmp/fm.md && pnpm ieumdoc format /tmp/fm.md; cat /tmp/fm.md   # 성공, front matter 유지
```

브라우저 회귀: `pnpm browser:test quote-save-reload`는 scratch 파일 `tmp/quote-save-reload/quotes.md`의 문단에 `Don't panic.`과 `The state is "READY".`를 입력하고 Save → Reload → 다시 열기 뒤 파일과 Editor가 입력 그대로인지 확인한다.

## Writeability Preflight v1

문서를 고치기 전에, IeumDoc이 그 문서를 canonical Markdown으로 의미를 잃지 않고 다시 쓸 수 있는지(canonical writeability) 알려 준다. 판단은 Core `canonicalWriteError(document)` 하나다. 이 함수는 `serialize`를 그대로 실행하므로 `format`과 Editor Save가 같은 snapshot에 내리는 판단·이유와 같다. 파일을 쓰지 않고 문서를 바꾸지 않는다.

`pnpm ieumdoc check <file>`이 보장하는 것:

- 파일을 읽어 parse할 수 있고 구조 검사(`structure valid`)를 통과한다.
- 지금 이 파일에 `format`(또는 Editor Save)을 실행하면 의미를 보존한 canonical Markdown을 쓸 수 있다(`writeability ok`). 쓸 수 없으면 block 목록 뒤에 stderr로 `writeability failed: <이유>`를 출력하고 exit code 1로 끝난다. `--format json`은 `"writeability": {"writable": false, "error": "…"}`와 `"ok": false`를 준다.
- `check`는 파일을 절대 쓰지 않는다.

보장하지 않는 것: 이미지 등 asset 파일의 존재, reference target의 존재, 아직 IeumDoc이 지원하지 않는 구문의 편집 가능 여부.

저장할 수 없는 예(현재 canonical writer가 의미를 보존하지 못해 거부하는 것): 닫히지 않은 front matter, task list(`- [ ]`), `{kbd}` 같은 writer가 쓰지 못하는 node, `{term}` 같은 보존할 수 없는 reference.

```bash
printf -- '---\ntitle: Example\n---\n\n# Heading\n' > /tmp/fm.md
pnpm ieumdoc check /tmp/fm.md; echo "exit=$?"   # structure valid, writeability ok, exit=0
```

Editor:

- 문서 전체를 Core가 보존할 수 있으면 지원 본문을 편집할 수 있다. front matter·일반 이미지 등 시각 편집 미지원 콘텐츠는 읽기 전용이며 종류와 원본 위치·내용을 펼쳐 볼 수 있다.
- 실제 저장 불가 문서는 입력 전에 읽기 전용으로 열린다. `Read-only: IeumDoc cannot save this document safely.` 경고에 이유와 위치를 표시하고 Save를 비활성화한다. 블록 조작과 수식·이미지 속성 편집으로 이 상태를 우회할 수 없다.
- 이때 Source는 저장 후보가 아닌 `Original Markdown · read-only`를 보여 준다. 원문을 복사하거나 외부 편집기/기존 CLI에서 문제를 고친 뒤 Reload한다. Host는 수정한 파일을 다시 parse하여 저장 가능 여부를 Core로 재판정한다.
- 저장 가능한 편집 세션은 매 Save/Source 요청에서 현재 적용 내용을 Core로 검증한다. 실패하면 파일을 쓰지 않고 세션을 보존한다.

브라우저 회귀: `pnpm browser:test writeability-preflight`는 scratch 문서의 front matter·정렬 표·일반/인라인 이미지가 본문·셀 편집 → Save → Reload 뒤 보존되는지 확인한다. task list가 있는 문서에서는 입력·Save 차단과 원문 열람을 확인한 뒤, 다른 Core-backed client가 문제 블록을 제거하고 Reload했을 때 편집·저장이 복구되는지 확인한다.

## Editing session and Save (#40)

설계와 책임 경계는 [Editing session and Save v1](../design/editing-session-save-v1.md)을 따른다.

- 저장 전 선택과 Undo/Redo가 저장 후에도 유지된다. 되돌린 내용을 다시 Save하면 실제 파일에도 반영된다.
- 새 빈 문단은 저장을 막지 않고 화면에 남는다. Equation/Figure 초안은 Save/Source에 포함되지 않으며 Apply/Cancel까지 유지된다.
- 저장 중 추가 입력은 다음 Save 대상으로 남는다. 실패 후 재시도하며, 외부 변경 충돌이면 원본 파일과 로컬 작업을 모두 보존한다.
- 충돌 시 Source에서 확정 내용을 복사할 수 있다. Reload는 미저장 변경·초안을 버릴지 묻고, Keep editing은 세션을 보존한다. 브라우저 이탈은 native 경고로 보호한다.
- Open/New는 저장 불가 문서의 미저장 작업도 보호한다. 새 문서 읽기가 실패하면 기존 작업은 남는다.
- Ctrl/Cmd+S(#56)는 Save 버튼과 같은 저장이다. 브라우저의 페이지 저장 창은 뜨지 않고, caret·선택·Undo 이력과 편집기 focus가 그대로다. 실패·충돌 안내도 버튼과 같다. Open/New/Reload dialog가 열려 있으면 저장하지 않는다. 자동 저장과 로컬 초안 복구는 채택하지 않았다(이유는 설계 문서).

`pnpm browser:test save-session`은 실제 scratch 파일에 Ctrl+S와 버튼으로 반복 저장·Undo/Redo·삭제 복구·지연 저장·실패/충돌·초안·Reload를 검증한다. 브라우저 이탈 경고는 OS별 수동 확인도 가능하다: 초안을 입력하고 새로고침을 시도한 뒤 취소하면 입력이 남아야 한다.

## Continuous document editing (#41)

설계는 [Continuous document editing v1](../design/document-editing-v1.md)을 따른다.

- Heading 시작의 Enter는 앞에 빈 paragraph를 만들고, 중간은 heading을 나누며, 끝은 뒤 paragraph로 이어진다. Note/표에서 Enter는 블록 뒤 paragraph로 나간다.
- 수식·그림 앞뒤에 엔진 gap cursor로 들어가서 입력한다. Tab/Shift+Tab은 표의 편집 가능한 cell을 이동하며 양끝에서 주변 본문으로 나간다.
- 지원 블록을 여러 개 선택해 삭제·잘라내기·복사·붙여넣고 Undo/Redo한다. 서식, inline math, Figure caption/alt, Equation source, Note body, 표 정렬을 Save → Reload로 확인한다.
- 읽기 전용 콘텐츠의 copy/cut, 외부 미지원 HTML, 라벨 중복 paste는 이유를 표시하고 문서·clipboard를 유지한다. 필요한 경우 사용자가 명시적으로 plain-text paste를 선택할 수 있다.
- Core `insertParagraph`는 문자열 또는 `InlineContent[]`를 받는다. CLI `insert-block --content`로 rich 문단을 삽입하며 `--text`와 동시에 주면 쓰기 전에 거부한다.

`pnpm browser:test continuous-editing`은 실제 시스템 clipboard, native keys, 저장을 사이에 둔 Undo/Redo, 수식 라벨의 복사 제한·이동, 블록 양끝 입력, Chromium 조합 입력의 Save/Reload를 검증한다. OS 한국어 IME는 별도로 직접 확인한다: 문단에서 한글을 조합·확정하고 Backspace·문단 경계 이동 뒤 Save → Reload해 누락·중복이 없는지 본다.
