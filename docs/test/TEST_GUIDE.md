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
✔ heading with inline marks stays read-only
✔ formatted caption and table cell stay read-only
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

하나라도 FAIL이면 이번 MVP write path가 성립하지 않은 것이다.

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
```

`structure valid`가 아니면 실패다.

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
- `pnpm browser:test`는 `@playwright/cli` session 하나(`ieumdoc-browser-regression`)를 열어 시나리오를 차례로 `run-code`로 실행하고 닫는다. 실행 뒤 원본 fixture가 바뀌었으면 실패하고, 끝나면 scratch를 다시 깨끗하게 만든다. dev server는 직접 띄운다.
- stable 목록은 `apps/editor/test/browser/run.ts`의 `STABLE_SCENARIOS`다. 현재 모든 `*.browser.js` 시나리오가 들어 있다.
- 아래 각 기능 절의 수동 명령도 `pnpm browser:prepare` 뒤에 그대로 쓸 수 있다.

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

### F. Read-only 의미 보존

Heading과 paragraph만 수정한 뒤 같은 파일에서 다음이 유지되는지 본다.

- warning admonition 본문
- `./diagram.svg`, `fig-control`, figure caption
- equation LaTeX와 `eq-current`
- `fig-control`, `eq-current` 참조
- 표의 행 수와 `Port`, `Type`, `U`, `AC`, `P`, `DC`

Figure, admonition, reference paragraph는 클릭해서 고칠 수 없다. Figure를 클릭하면 속성 popover가 보이지만 읽기 전용이다. Table은 plain-text cell만 수정할 수 있다(아래 "Table cell editing v1").

Save 후 파일의 `See [](#fig-control) and {eq}`eq-current`.` 줄은 그대로여야 한다. `{eq}` reference가 `[](#eq-current)` link로 바뀌면 실패다.

브라우저 회귀(실제 파일을 쓰므로 무시되는 `tmp/`의 scratch 사본에서 실행한다. 사본은 `pnpm browser:prepare`가 만든다):

```bash
pnpm browser:prepare
pnpm exec playwright-cli -s=ieumdoc-reference open http://127.0.0.1:5173
pnpm exec playwright-cli -s=ieumdoc-reference run-code --filename=apps/editor/test/reference-save-reload.browser.js
pnpm exec playwright-cli -s=ieumdoc-reference close
```

결과의 값은 모두 `true`여야 한다. 다시 실행하려면 `pnpm browser:prepare`를 다시 실행한다.

### G. 구조 변경 거부

편집 가능한 paragraph 중간에서 Enter를 누른다. 같은 Editor 안에서 두 paragraph로 나뉘어야 한다.

paragraph 맨 앞에서 Backspace를 누른다. 바로 앞 블록이 편집 가능한 paragraph이면 공백 추가 없이 합쳐지고, 그 외 block이면 차단되어야 한다.

Equation 또는 Figure를 선택하고 Delete 또는 Backspace를 누른다. 블록이 사라지지 않아야 한다. block 삭제는 handle 메뉴의 `Delete`로만 한다.

top bar 아래 message area에 안내 문장이 잠시 보였다가 사라질 수 있다. 저장 파일의 블록 구성은 바뀌지 않아야 한다.

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
pnpm ieumdoc insert-block <file> --at <index> --text <text>
pnpm ieumdoc remove-block <file> --at <index>
pnpm ieumdoc move-block <file> --from <index> --to <index>
pnpm ieumdoc update-node-text <file> --path <indexes> --from <text> --to <text>
pnpm ieumdoc insert-figure <file> --at <index> --image <url> [--alt <text>] [--caption <text>]
pnpm ieumdoc update-figure <file> --path <indexes> [--image <url>] [--alt <text>] [--caption <text>]
```

`pnpm ieumdoc help`와 `pnpm ieumdoc <command> --help`는 사용 가능한 명령을 보여 준다.
`inspect`는 Core read model의 block, NodePath, editable target을 보여 준다.
`insert-block`은 Core `insertParagraph`로 paragraph만 넣는다.
index는 `check`가 출력하는 top-level 번호다.
`--path`는 현재 parse snapshot 안의 위치다. `inspect`로 찾는다. 구조를 바꾸면 path도 바뀐다. 예: `4`, `6,1`, `12,1,1`.

## 5. 현재 구현의 한계 (실패로 보지 말 것)

- `replace-text`는 paragraph/heading 텍스트만 바꾼다. admonition/caption은 `update-node-text --path`, table cell은 `update-table-cell --path`를 쓴다.
- `insert-block` / `remove-block` / `move-block`은 top-level만 다룬다.
- `{eq}`/`{numref}`/`{ref}` reference는 같은 role로 저장되고, `(label)=` section target도 남는다. `[](#eq-current)` 같은 fragment link는 일반 link로 남는다. 대상 존재 여부는 검사하지 않는다. `{term}` 등 보존할 수 없는 reference가 있으면 `format`/Save가 실패한다.
- Core canonical serialization은 보존할 수 없는 의미를 성공한 Markdown으로 저장하지 않는다. `format`/Save는 파일을 쓰기 전에 `Document contains semantic content that cannot be preserved in canonical Markdown: <이유>`로 실패하고 파일은 그대로다. 예: `{kbd}`, `{span}`, `{div}`, `{raw}` 등 MyST writer가 쓰지 못하는 node, 두 번째 subfigure, `{embed}` 대상, task list 체크박스(`- [ ]`), `{download}`의 download 표시, 단독 Markdown image(`{image}` directive로 쓰면 `align: center`가 새로 붙는다).
- figure option `:label:` 은 canonical form에서 `:name:` 으로 쓰인다.
- 원본 `-` 리스트는 canonical form에서 `*   ` 가 된다.
- merged cell 전용 시스템은 없다.
- Visual Editor는 sidebar `Open…` dialog에 입력한 `.md` 경로 하나를 연다. 파일 탐색기는 없다. 그 문서는 Tiptap editor 하나다.
- 화면에서 직접 저장할 수 있는 변경은 plain heading 텍스트와, text / strong / emphasis / 일반 link / inline math만 있는 paragraph다.
- `{eq}`/`{numref}` 외의 cross-reference(`{ref}`, 표시 텍스트가 있는 형태 등), 빈 텍스트 link(`[](#x)`), code/image를 감싼 link가 있는 paragraph와 admonition은 보이지만 읽기 전용이다(`{eq}`/`{numref}`는 아래 "Local cross-reference authoring v1"). 일반 link가 있는 paragraph는 수정할 수 있다(아래 "Inline link authoring v1"). Table은 plain-text cell만 수정할 수 있고 행/열 구조와 서식 있는 cell은 읽기 전용이다. Equation은 Equation editor에서 LaTeX와 label을 수정할 수 있다. Figure는 image/alt/caption/label을 Figure editor에서 수정한다(label은 아래 "Equation / Figure label authoring v1"). legend, 서식 있는 caption 등 v1이 지원하지 않는 Figure 구조는 읽기 전용이다. CLI `update-node-text` 는 그대로다.
- Enter는 지원 paragraph를 나눈다. 문단 시작 Backspace는 인접한 편집 가능 paragraph만 합친다. block 추가는 `+` / `/` insert menu(`Paragraph`, `Heading 1`, `Heading 2`, `Heading 3`, `Equation`, `Figure`), 삭제는 block menu `Delete`, 이동은 handle drag로만 한다. 키보드 삭제나 붙여넣기로 생기는 block 추가·삭제는 거부된다.
- 빈 paragraph는 저장되지 않는다. 내용을 모두 지운 뒤 Save하면 실패해야 한다.
- Editor가 연 뒤에 CLI가 같은 파일을 바꾸면 Save는 `Save conflict`로 거부된다. Editor의 저장하지 않은 입력은 자동으로 지워지지 않는다. 파일을 다시 읽으려면 페이지를 새로고침한다.
- 기존 수식은 Equation editor에서 LaTeX를 수정할 수 있고, 새 수식은 insert menu에서 추가할 수 있다.

## 6. 실패 시

- `pnpm` 또는 `tsx`를 찾지 못하면 저장소 루트에서 `pnpm install`을 다시 실행한다.
- `replaceText could not find paragraph or heading text`: `--from` 문장이 파일에 있는지 확인한다.
- `fromIndex out of range` / `index out of range`: `check`로 현재 index를 다시 본다. 앞 단계 명령을 건너뛰면 index가 달라진다.
- 두 번째 `format` 후 파일이 바뀌면 Core serialize invariant가 깨진 것이다.
- Editor 페이지가 비어 있으면 `pnpm --filter @ieumdoc/editor dev` 가 저장소 루트에서 실행 중인지, 주소가 `http://localhost:5173` 인지 확인한다.
- Save 후 파일에 반영되지 않으면 heading 또는 지원되는 paragraph를 수정한 뒤 `Save` 를 다시 누른다. warning, reference paragraph, 서식 있는 table cell은 저장 대상이 아니다.
- Heading Enter 또는 paragraph가 아닌 이전 block과의 Backspace 병합은 차단되어야 한다.

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
- 시작/끝에서 Enter를 눌러 빈 문단을 만든 뒤 Save한다. 파일을 쓰지 않고 실패해야 한다. 빈 문단에 텍스트를 입력하면 다시 저장할 수 있다.
- Heading Enter와 키보드 block 삭제는 계속 차단된다. top-level block 재정렬은 왼쪽 handle을 사용하며, Shift+Enter는 같은 문단 안에 hard break를 만든다.
- 저장 응답을 지연시키고 추가 입력/분할한다. `Saved; newer edits pending` 후 입력이 남아야 하며 다음 Save 및 Reload에서도 유지되어야 한다.
- sourcePath는 현재 저장 snapshot의 locator다. 내용이 있는 분할 조각은 저장 전 원본 path를 공유하고, 끝에서 생긴 빈 split sibling은 `new:*` locator를 사용해 새 block insertion으로 저장한다. 성공 응답 후 새 path를 사용하며 영속 ID를 생성하지 않는다.

## Editor Paragraph Merge v1

- 두 번째 지원 paragraph의 맨 앞에 cursor를 두고 Backspace한다. 이전 paragraph와 공백 추가 없이 합쳐져야 한다.
- Bold/Italic/두 서식 조합과 hard break가 포함된 문단에서도 반복한다. Undo/Redo 후 같은 문단·서식으로 복구되어야 한다.
- Enter로 나눈 직후 Backspace로 다시 합친다. 병합 후 내용을 추가하고 Save → Reload하여 서식과 줄바꿈이 유지되는지 확인한다.
- 이전 block이 Heading/Equation/Figure/Table 또는 read-only paragraph이면 병합되지 않아야 한다. 문단 중간의 Backspace는 일반 문자 삭제다.
- Save 응답을 지연한 동안 추가 입력·병합·분할한다. 응답 후 입력이 남고 다음 Save → Reload에서도 같아야 한다.
- 병합 대상의 snapshot path 목록은 Editor 세션의 출처 정보이며, 파일에 저장되는 ID가 아니다. 서버는 Core merge/update/split operation만 호출한다.

## Editor Top-level Block Reorder v1

- 각 top-level block 왼쪽의 점 6개 handle에 hover/focus한 뒤 드래그한다. Paragraph, Heading, Equation, Figure, Table 및 현재 표시되는 read-only block을 같은 방식으로 이동할 수 있다.
- Paragraph를 Heading 또는 read-only block 앞뒤로 이동하고, Undo/Redo한다. block 내용과 formatting은 바뀌지 않아야 한다.
- 이동된 paragraph에 텍스트, Bold/Italic, Shift+Enter hard break를 추가한 뒤 Save → Reload한다. 순서와 의미가 유지되어야 한다.
- Save 응답을 지연한 상태에서 다시 drag하거나 입력한 뒤 `Saved; newer edits pending`을 확인한다. 다음 Save → Reload에서도 pending 변경이 남아야 한다.
- nested block, multi-select, type conversion은 범위가 아니다. block 추가/삭제는 아래 Editor UX Shell v1을 본다. canonical serializer가 block 경계를 바꾸는 reorder는 파일을 쓰지 않고 실패한다.

## Editor Equation Draft Save Guard v1

- Equation에서 `Edit`를 누르고 LaTeX를 바꾼다. `Apply` 전에는 해당 Equation block 안에 `Unapplied changes. Apply or Cancel before saving.` 가 보이고, top bar `Save`는 비활성화된다(hover 시 `Apply or Cancel the Equation edit before saving.`). 전역 경고는 없고, 편집창과 draft 내용이 그대로 남아야 한다.
- 같은 상태에서 `Apply` → `Save` → Reload한다. 바꾼 LaTeX가 유지된다.
- 다시 LaTeX를 바꿔 `Save`가 비활성화된 것을 확인한 뒤 `Cancel` → `Save` → Reload한다. 원래 LaTeX가 유지되고 파일은 바뀌지 않는다.
- Equation 편집창을 열기만 하고 내용을 바꾸지 않으면 `Save`는 정상 동작한다.
- 이 차단은 파일 write와 API POST를 발생시키지 않는다. paragraph 편집, block reorder, delayed-save pending 동작은 그대로 유지된다.

## Editor UX Shell v1

- 화면은 sidebar, top bar, document column 세 영역이다. sidebar는 `«` / `»`로 접고 편다. sidebar에는 제품명, `Open…`, 현재 문서만 있다.
- `Open…`을 누르면 작은 dialog가 열린다. 경로를 입력하고 `Open`을 누른다. 저장하지 않은 변경이 있으면 dialog 안에 `Save or discard the current changes before opening another file.`가 보이고 현재 문서는 그대로다.
- Error는 top bar 아래 message area에 남고 `×`로 닫는다. Notice는 몇 초 뒤 사라진다. 두 메시지 모두 document column 안에 나타나지 않는다.
- block에 hover하면 왼쪽에 `+`와 `⠿`가 보인다. `+`는 insert menu를, `⠿` click은 block menu를 연다. `⠿` drag는 기존 reorder다.
- paragraph 시작 또는 공백 뒤에서 `/`를 입력하면 `+`와 같은 insert menu가 열린다. 입력한 글자로 걸러지고, ↑/↓/Enter로 고르며 Esc로 닫는다. 선택하면 `/` 입력은 지워진다.
- insert menu에는 현재 Core로 생성·편집·저장할 수 있는 `Paragraph`, `Heading 1`, `Heading 2`, `Heading 3`, `Equation`, `Figure`가 있다(`Figure`는 아래 Figure Authoring v1). 빈 paragraph에서 `Paragraph`를 고르면 그 paragraph를 그대로 쓰고, 아니면 아래에 새 paragraph를 만든다. `Heading`을 고르면 빈 heading이 생기고 caret이 그 안에 놓인다. `Equation`을 고르면 inline Equation editor가 바로 열리고 LaTeX를 입력한 뒤 `Apply`해야 한다. 새 block에 글을 쓰고 Save → Reload하면 paragraph는 Core `insertParagraph`, heading은 Core `insertHeading`, Equation은 Core `insertEquation`으로 저장된다. 빈 paragraph, 빈 heading, Apply하지 않은 빈 Equation을 Save하면 실패한다. 새 Equation을 `Cancel`하면 미완성 block이 남지 않는다. 끝에서 Enter로 생긴 빈 split sibling에서 Heading 또는 Equation을 고르면 원래 paragraph는 유지되고 새 block으로 저장된다.
- block menu에는 Core `removeBlock`으로 저장되는 `Delete`만 있다. 문서에 block이 하나뿐이면 비활성이다. Delete 후 Undo/Redo, Save → Reload를 확인한다. 다른 Equation을 편집 중이어도 draft가 유지되어야 한다.
- 키보드 Delete/Backspace나 붙여넣기로는 block이 추가·삭제되지 않는다. Save adapter는 Delete command로 선언되지 않은 block 소실을 거부한다.

Save 버튼, Open dialog, Open dialog의 경로 입력, Figure properties popover, sidebar/top bar의 아이콘 버튼은 shadcn(Base UI, Nova style, Stone base color) 기반이다. 이 전환은 상호작용을 바꾸지 않는다.

- Save가 Equation draft 때문에 비활성일 때도 hover/focus하면 이유가 tooltip으로 뜬다(네이티브 `disabled`가 아니라 `aria-disabled`를 쓰므로 여전히 hover 가능하다).
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

`editor-shell` 결과의 boolean 값은 모두 `true`, `plusMenuItems`와 `slashMenuItems`는 `["Paragraph", "Heading 1", "Heading 2", "Heading 3", "Equation", "Figure"]`, `blockMenuItems`는 `["Delete"]`, `editorCount`는 `1`이어야 한다. `saveTooltipShown`은 Equation draft로 Save가 막혔을 때 hover하면 tooltip이 뜨는지 확인한다.

## Figure Authoring v1

Core `updateFigure` / `insertFigure`가 Figure의 image URL, alt text, caption을 다룬다. label(`:name:`)은 이 연산들이 보존하고, 편집은 Core `updateLabel`이 맡는다("Equation / Figure label authoring v1"). reference rename, 이미지 업로드·복사·file picker는 범위가 아니다.

유효 조건(Core와 Editor Apply가 같은 규칙을 쓴다. 실제 MyST round-trip에서 확인한 조건이다):

- image URL은 필수다. 앞뒤 공백과 줄바꿈은 안 된다(빈 URL은 Figure가 사라지고, 공백은 저장 후 바뀐다).
- alt text는 비워도 된다(비우면 `:alt:`가 없어진다). 줄바꿈과 앞 공백은 안 된다.
- caption은 plain text이며 비워도 된다(비우면 caption이 없어진다). MyST가 다른 의미로 읽는 caption(예: `cost $5 and $x$`, `% ...`, `+++`)은 Core round-trip에서 거부된다. Editor `Apply`는 Host(`POST /api/figure-validation`)를 통해 같은 Core `validateFigure`를 호출하므로, 이런 값은 Apply 시점에 form이 유지된 채 오류가 보이고 block 값은 바뀌지 않으며 Save도 계속 비활성이다.
- legend, 서식 있는 caption 등 v1이 지원하지 않는 구조의 Figure는 읽기 전용이다(`inspect`의 `figureEditable=false`).

CLI:

```bash
pnpm ieumdoc insert-figure <file> --at 1 --image ./plot.svg --alt "Plot" --caption "Measured plot."
pnpm ieumdoc update-figure <file> --path 6 --caption "New caption."
```

`update-figure`에서 생략한 속성은 바뀌지 않는다. `--path`가 Figure가 아니거나 값이 유효하지 않으면 exit 1이고 파일은 그대로다.

Editor:

- 기존 Figure를 클릭하면 properties popover(Label, Image, Alt text, Caption)가 보이고 editor focus는 유지된다. block의 `Edit`를 누르면 Image / Alt text / Caption / Label 입력이 있는 form이 열린다.
- 값을 바꾸면 block 안에 `Unapplied changes. Apply or Cancel before saving.`이 보이고 Save가 비활성이다(tooltip `Apply or Cancel the Figure edit before saving.`). `Apply`(또는 Enter) 후에만 block의 이미지·caption이 바뀌고 Save할 수 있다. `Cancel`(또는 Esc)은 마지막으로 Apply한 값으로 돌아가고 block은 남는다.
- 상대 경로 이미지(`./`, `../`)는 열린 문서의 폴더 기준으로 보인다. 이미지 preview는 Apply 후 갱신된다.
- `+` 또는 `/figure`로 새 Figure를 넣으면 form이 바로 열리고 Image 입력에 focus가 간다. 빈 새 paragraph에서 `/figure`를 쓰면 그 paragraph가 Figure로 바뀌어 빈 paragraph가 남지 않는다. 한 번도 Apply하지 않고 `Cancel`하면 block이 사라진다(문서의 유일한 block이면 빈 paragraph로 돌아간다). Apply한 뒤 다시 `Edit` → 변경 → `Cancel`하면 block은 남고 Apply한 값으로 돌아간다.
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

## Table cell editing v1

Core `updateTableCell`이 top-level Markdown(GFM) table의 cell 텍스트 전체를 바꾼다. 수정 가능한 cell은 비어 있거나 plain text만 있는 cell이다. 서식(굵게 등), 수식, link, role이 있는 cell은 읽기 전용이다. `{table}`, `{list-table}`, `{csv-table}` directive table은 지원하지 않는 block으로 남는다. 행/열 추가·삭제·이동, 정렬, merged cell은 범위가 아니다.

유효 조건(Core round-trip에서 확인한 조건이다):

- 한 줄 텍스트만 된다. 앞뒤 공백은 안 된다. 비우면 빈 cell이 된다.
- `|`, `*`, `_`, `` ` `` 같은 Markdown 문자는 escape되어 글자 그대로 남는다.
- MyST가 다른 의미로 읽는 텍스트(예: `cost $x$`)는 거부된다.

CLI:

```bash
pnpm ieumdoc update-table-cell <file> --path 12,1,1 --text "AC-side"
pnpm ieumdoc update-table-cell <file> --path 12,2,1 --text ""
```

`--path`는 `table,row,cell`이다(header 행은 row 0). 거부되면 exit 1이고 파일은 그대로다.

Editor:

- Table은 문서 안의 일반 표로 보인다. 수정 가능한 cell을 클릭하고 바로 입력한다. 읽기 전용 cell은 흐린 글자이고 입력해도 바뀌지 않는다.
- Enter, Shift+Enter, cell 시작의 Backspace는 표 구조를 바꾸지 않는다. cell 안에서는 굵게/기울임이 적용되지 않는다. Undo/Redo는 다른 편집과 같다.
- Save → Reload 후 수정한 header/body cell이 canonical Markdown에 남고, 다른 block은 그대로다. 유효하지 않은 cell 텍스트는 `Save failed`로 거부되고 파일은 바뀌지 않는다.

브라우저 회귀(실제 파일을 쓰므로 무시되는 `tmp/`의 scratch 사본에서 실행한다. 사본은 `pnpm browser:prepare`가 만든다):

```bash
pnpm browser:prepare
pnpm exec playwright-cli -s=ieumdoc-table open http://127.0.0.1:5173
pnpm exec playwright-cli -s=ieumdoc-table run-code --filename=apps/editor/test/table-cell-editing.browser.js
pnpm exec playwright-cli -s=ieumdoc-table close
```

결과의 boolean 값은 모두 `true`, `consoleErrors`는 `[]`이어야 한다. 다시 실행하려면 `pnpm browser:prepare`를 다시 실행한다.

## Inline link authoring v1

일반 Markdown link(`[텍스트](URL "선택적 title")`, `<https://...>`)가 있는 paragraph는 일반 paragraph처럼 수정한다. Core `InlineContent`의 `link`로 저장되고 split / merge / hard break도 link를 유지한다. `{eq}` / `{ref}` / `{numref}` 같은 cross-reference는 link가 아니다(`{eq}`/`{numref}` 편집은 "Local cross-reference authoring v1").

읽기 전용으로 남는 link: 표시 텍스트가 빈 link(`[](#x)`), code나 image를 감싼 link, `{download}` link, 같은 대상으로 가는 link 두 개가 붙어 있는 paragraph(`[a](x)[b](x)`; 편집기에서 하나로 합쳐지기 때문).

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
- Apply되지 않은 Equation/Figure draft가 있으면 `Source`는 비활성이고 tooltip으로 이유를 알려 준다.
- Save가 거부할 상태(빈 paragraph, canonical Markdown으로 보존할 수 없는 문서, 외부 변경 conflict 등)면 `Source view unavailable: …` error를 보이고 Visual에 남는다. 파일은 바뀌지 않는다.
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

- Equation: `Edit` 폼의 `Label` 입력. Figure: `Edit figure` 폼의 `Label` 입력. 둘 다 `Apply`해야 반영되고, Apply 전에는 draft로 Save/Source가 막힌다. 새 Equation/Figure에도 label을 지정할 수 있다.
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
