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

- Node.js 24 이상
- pnpm 10 이상

저장소 루트에서:

```bash
pnpm install
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
✔ paragraph split is rejected
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
- `#fig-control` 과 `#eq-current` 참조가 남아 있다.
- 표의 `AC` 가 `AC-side` 로 바뀌었고 `| Port |` 행은 그대로다.

`format`을 한 번 더 실행해도 파일 내용이 같아야 한다.

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

성공: 페이지 위에 `IeumDoc` 과 `technical-document.md` 가 보이고 `Save` 버튼이 있다.

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

문서 위쪽에 `B` 와 `I` 버튼이 하나 있다.

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

`converter` 를 선택하고 `B` 를 누른다. `The` 를 선택하고 `I` 를 누른다.

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

Figure, equation, table, admonition, reference paragraph는 클릭해서 고칠 수 없다.

### G. 구조 변경 거부

편집 가능한 paragraph에서 Enter를 누른다. paragraph가 둘로 나뉘지 않아야 한다.

paragraph 맨 앞에서 Backspace를 누른다. 앞 블록과 합쳐지지 않아야 한다.

Equation 또는 Figure를 선택하고 Delete 또는 Backspace를 누른다. 블록이 사라지지 않아야 한다.

화면의 안내 문장이 보일 수 있다. 저장 파일의 블록 구성은 바뀌지 않아야 한다.

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
```

`pnpm ieumdoc help`와 `pnpm ieumdoc <command> --help`는 사용 가능한 명령을 보여 준다.
`inspect`는 Core read model의 block, NodePath, editable target을 보여 준다.
`insert-block`은 Core `insertParagraph`로 paragraph만 넣는다.
index는 `check`가 출력하는 top-level 번호다.
`--path`는 현재 parse snapshot 안의 위치다. `inspect`로 찾는다. 구조를 바꾸면 path도 바뀐다. 예: `4`, `6,1`, `12,1,1`.

## 5. 현재 구현의 한계 (실패로 보지 말 것)

- `replace-text`는 paragraph/heading 텍스트만 바꾼다. admonition/caption/table cell은 `update-node-text --path`를 쓴다.
- `insert-block` / `remove-block` / `move-block`은 top-level만 다룬다.
- `{eq}`eq-current`` 는 serialize 후 `[](#eq-current)` 가 된다. 대상 label은 남는다.
- figure option `:label:` 은 canonical form에서 `:name:` 으로 쓰인다.
- 원본 `-` 리스트는 canonical form에서 `*   ` 가 된다.
- merged cell 전용 시스템은 없다.
- Visual Editor는 지정된 기술문서 하나를 연다. 파일 탐색기는 없다. 그 문서는 Tiptap editor 하나다.
- 화면에서 직접 저장할 수 있는 변경은 plain heading 텍스트와, text / strong / emphasis만 있는 paragraph다.
- link 또는 cross-reference가 있는 paragraph, admonition, figure, equation, table은 보이지만 읽기 전용이다. Figure caption과 table cell도 이번 화면에서는 수정하지 않는다. CLI `update-node-text` 는 그대로다.
- Enter로 paragraph를 나누거나, Backspace로 블록을 합치거나, 블록을 추가·삭제·이동하는 변경은 거부된다.
- 빈 paragraph는 저장되지 않는다. 내용을 모두 지운 뒤 Save하면 실패해야 한다.
- Editor가 연 뒤에 CLI가 같은 파일을 바꾸면 Save는 `Save conflict`로 거부된다. Editor의 저장하지 않은 입력은 자동으로 지워지지 않는다. 파일을 다시 읽으려면 페이지를 새로고침한다.
- 수식은 읽기 전용이다. LaTeX 원문이 equation 블록으로 보인다.

## 6. 실패 시

- `pnpm` 또는 `tsx`를 찾지 못하면 저장소 루트에서 `pnpm install`을 다시 실행한다.
- `replaceText could not find paragraph or heading text`: `--from` 문장이 파일에 있는지 확인한다.
- `fromIndex out of range` / `index out of range`: `check`로 현재 index를 다시 본다. 앞 단계 명령을 건너뛰면 index가 달라진다.
- 두 번째 `format` 후 파일이 바뀌면 Core serialize invariant가 깨진 것이다.
- Editor 페이지가 비어 있으면 `pnpm --filter @ieumdoc/editor dev` 가 저장소 루트에서 실행 중인지, 주소가 `http://localhost:5173` 인지 확인한다.
- Save 후 파일에 반영되지 않으면 heading 또는 지원되는 paragraph를 수정한 뒤 `Save` 를 다시 누른다. warning, figure, equation, table, reference paragraph는 저장 대상이 아니다.
- Enter나 Backspace 뒤 문서 구조가 바뀌면 structural guard가 실패한 것이다.
