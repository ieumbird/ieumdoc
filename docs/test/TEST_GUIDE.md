# Slice 1 Test Guide

이 문서는 현재 구현된 **headless document core** (`packages/core`)를 사람이 직접 확인하는 절차다.

UI, CLI, Editor는 아직 없다. 확인 대상은 다음 한 흐름이다.

```
plain-text → parse → semantic operation → validate → serialize → reparse
```

## 준비

- Node.js 24 이상
- pnpm 10 이상
- 저장소 루트: `C:\Projects\ieumdoc` 또는 clone한 경로

```bash
pnpm install
```

## 무엇이 구현되어 있는가

`@ieumdoc/core` public API:

| 함수 | 하는 일 |
| --- | --- |
| `parse(source)` | MyST source → 구조화 document |
| `replaceText(doc, from, to)` | paragraph/heading 텍스트를 AST에서 변경 |
| `moveBlock(doc, fromIndex, toIndex)` | top-level block 하나를 다른 위치로 이동 |
| `validate(doc)` | root와 children 구조가 깨지지 않았는지 확인. 실패 시 throw |
| `serialize(doc)` | canonical MyST source로 저장 |

테스트 fixture: `packages/core/test/fixtures/document.md`

포함 내용: heading, paragraph, bold/italic, list, `note` admonition, `{math}` equation.

## 1. 자동 테스트

저장소 루트에서:

```bash
pnpm test
```

통과 기준 — 7개 모두 PASS:

```
✔ parse document
✔ mutate text through Core operation
✔ move block through Core operation
✔ validate modified document
✔ canonical serialize
✔ reparse serialized document
✔ stable second serialization
```

하나라도 FAIL이면 Slice 1 write path가 성립하지 않은 것이다.

## 2. 수동 사이클

자동 테스트와 같은 경로를 사람이 출력으로 확인한다.

저장소 루트에서 아래 파일을 임시로 만든다. 경로: `packages/core/manual-cycle.ts`

```ts
import { readFileSync } from "node:fs";
import { parse, replaceText, moveBlock, validate, serialize } from "./src/index.ts";

const source = readFileSync(new URL("./test/fixtures/document.md", import.meta.url), "utf8");

const doc = parse(source);
console.log("1 parse");
console.log(doc.children.map((node, i) => `${i} ${node.type}${node.kind ? `:${node.kind}` : ""}`).join("\n"));

const changedText = replaceText(
  doc,
  "The converter regulates voltage.",
  "The converter regulates voltage and current.",
);
const noteIndex = changedText.children.findIndex((node) => node.type === "admonition");
const changed = moveBlock(changedText, noteIndex, 1);

console.log("\n2 after replaceText + moveBlock");
console.log(changed.children.map((node, i) => `${i} ${node.type}${node.kind ? `:${node.kind}` : ""}`).join("\n"));

validate(changed);
console.log("\n3 validate: ok");

const output1 = serialize(changed);
console.log("\n4 serialize");
console.log(output1);

const output2 = serialize(parse(output1));
console.log("5 reparse + second serialize identical:", output1 === output2);
console.log("6 original source unchanged:", source.includes("The converter regulates voltage."));
console.log("7 original AST unchanged:", doc.children[1]?.type === "paragraph");
```

실행:

```bash
pnpm --filter @ieumdoc/core exec tsx manual-cycle.ts
```

확인이 끝나면 `packages/core/manual-cycle.ts`를 삭제한다.

### 기대 결과

**1 parse** 직후 top-level 순서:

```
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

**2 변경 후** top-level 순서:

```
0 heading
1 admonition:note
2 paragraph
3 paragraph
...
```

note가 heading 바로 아래로 이동했고, 원래 1번 paragraph는 2번으로 밀린다.

**4 serialize** 출력은 다음으로 시작한다:

```md
# Converter Control

:::{note}
The current controller parameters must be calibrated before operation.
:::

The converter regulates voltage and current.
```

문장 `The converter regulates voltage and current.` 가 보여야 한다.
원문 `The converter regulates voltage.` 는 출력에 없어야 한다.

**5** `true` — 두 번째 serialize가 byte-identical.
**6** `true` — 원본 fixture 파일 문자열이 바뀌지 않았다.
**7** `true` — 원본 document 객체가 바뀌지 않았다. operation은 clone 위에서 동작한다.

## 3. 사람이 특히 볼 것

1. 문서 처리가 UI 없이 동작하는가. `pnpm test`와 수동 사이클은 Node.js만 사용한다.
2. 텍스트 변경이 Markdown 문자열 치환이 아닌가. 수동 사이클의 6·7이 true여야 하고, 변경은 `replaceText` 이후 AST paragraph에서만 나타난다.
3. block 이동이 source를 잘라 붙인 결과가 아닌가. serialize 결과에서 note 블록 전체가 heading 아래로 내려와야 한다.
4. 공식 write path 출력이 다시 parse되고, 두 번째 serialize가 첫 번째와 같아야 한다.

## 4. 현재 구현의 한계 (실패로 보지 말 것)

- Editor, CLI, 브라우저 화면은 없다.
- `replaceText`는 paragraph/heading 텍스트만 바꾼다. list item이나 admonition 본문을 바꾸는 API는 없다.
- `moveBlock`은 top-level index만 받는다. nested drag/drop은 없다.
- 원본 Markdown의 `-` 리스트는 canonical form에서 `*   ` 로 바뀐다. 이번 fixture는 이미 canonical form이다.
- `$$...$$` display math는 serialize 시 `{math}` directive가 된다.
- 표, figure, include, GitHub, AI 연동은 이 Slice 범위가 아니다.

## 5. 실패 시

- `pnpm` 또는 `tsx`를 찾지 못하면: 저장소 루트에서 `pnpm install`을 다시 실행한다.
- `replaceText could not find paragraph or heading text`: fixture 문장이 바뀌었는지 `packages/core/test/fixtures/document.md`를 확인한다.
- serialize 두 번째 결과가 다르면: Core write path invariant가 깨진 것이다. `packages/core`의 parse/serialize/operations를 의심한다.
