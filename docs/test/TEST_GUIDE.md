# MVP 1 Alpha Test Guide

이 문서는 현재 구현을 사람이 실제 파일로 확인하는 절차다.

확인 대상:

```
plain-text file
    → ieumdoc CLI
    → packages/core (parse / operation / validate / serialize)
    → canonical plain-text file
```

Editor, 서버, 브라우저 화면은 없다.

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

통과 기준:

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
✔ CLI can check and modify a real file through Core
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
valid
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

`valid`가 아니면 실패다.

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

다시 `valid`여야 한다.
`format`을 한 번 더 실행해도 파일 내용이 같아야 한다. 이것이 canonical serialization이다.

끝나면 복사본을 지운다.

```powershell
Remove-Item -Recurse -Force tmp
```

## 3. 사람이 특히 볼 것

1. CLI가 Markdown 문자열을 직접 치환하지 않는다. 같은 작업을 Core API로 재현하면 파일 내용이 같아야 한다.
2. block 추가/삭제/이동은 top-level 순서만 바꾼다. 문장 하나를 regex로 잘라 붙인 결과가 아니다.
3. 저장 결과는 다시 `check`가 되고, `format`을 반복해도 내용이 안정적이다.
4. `packages/cli`는 `@ieumdoc/core`를 호출만 한다. 문서 의미를 CLI에 구현하지 않았다.

## 4. 명령 목록

```
pnpm ieumdoc check <file>
pnpm ieumdoc format <file>
pnpm ieumdoc replace-text <file> --from <text> --to <text>
pnpm ieumdoc insert-block <file> --at <index> --text <text>
pnpm ieumdoc remove-block <file> --at <index>
pnpm ieumdoc move-block <file> --from <index> --to <index>
```

`insert-block`은 paragraph를 넣는다.
index는 `check`가 출력하는 top-level 번호다.

## 5. 현재 구현의 한계 (실패로 보지 말 것)

- `replace-text`는 paragraph/heading 텍스트만 바꾼다.
- `insert-block` / `remove-block` / `move-block`은 top-level만 다룬다.
- 원본 `-` 리스트는 canonical form에서 `*   ` 가 된다. 이번 fixture는 이미 canonical form이다.
- Editor, GitHub, AI, 표/figure 전용 명령은 없다.

## 6. 실패 시

- `pnpm` 또는 `tsx`를 찾지 못하면 저장소 루트에서 `pnpm install`을 다시 실행한다.
- `replaceText could not find paragraph or heading text`: `--from` 문장이 파일에 있는지 확인한다.
- `fromIndex out of range` / `index out of range`: `check`로 현재 index를 다시 본다. 앞 단계 명령을 건너뛰면 index가 달라진다.
- 두 번째 `format` 후 파일이 바뀌면 Core serialize invariant가 깨진 것이다.
