# Architecture Spike B: Single Document Editor + Typed Blocks

## 1. Branch / 기준 master commit

- Branch: `spike/editor-single`
- 기준: `origin/master` / `master` at `60f3044af25e4c99bc8fa20c809aac56f2d9accb`
- `spike/editor-per-block`의 commit이나 구현은 사용하지 않았다.
- 이 문서는 제품 migration이나 adoption 결정을 위한 문서가 아니라 disposable spike의 관찰 기록이다.

## 2. 변경한 파일

- `apps/editor/src/SingleDocumentEditor.tsx`: 문서 전체를 소유하는 유일한 `useEditor`와 block toolbar
- `apps/editor/src/EquationNode.ts`: atomic `equation` node
- `apps/editor/src/single-editor-adapter.ts`: Core read model ↔ Tiptap JSON 변환
- `apps/editor/src/App.tsx`: semantic whole-document draft/save 흐름
- `apps/editor/server/document-api.ts`: semantic save bridge와 Core round-trip
- `packages/core/src/operations.ts`, `packages/core/src/index.ts`: `replaceEditableBlocks` 한 가지 spike operation
- `apps/editor/document/technical-document.md`: 제한된 대표 fixture
- `apps/editor/src/styles.css`: 최소한의 single-editor/Equation 표시
- `apps/editor/test/editor.test.ts`: adapter, typed node, save/reload, boundary 검증
- 기존 paragraph별 구현(`DocumentView`, `ParagraphEditor`, `EditableText`, `edits`, `tiptap-inline`)은 single-editor branch에서 제거했다.
- `apps/editor/package.json`, `pnpm-lock.yaml`: `@tiptap/core` 직접 dependency 추가

## 3. Single Editor 구조 설명

실행 구조는 다음과 같다.

```text
Core EditableDocument
        ↓ toTiptapDocument
Tiptap/ProseMirror Editor #1
  doc(heading, paragraph, equation, paragraph)
        ↓ fromTiptapDocument onUpdate
editor-neutral EditableDocument draft
        ↓ POST /api/document
Core replaceEditableBlocks
        ↓ validateStructure → serialize → parse/validate
canonical .md SSOT
```

`SingleDocumentEditor.tsx`에 `useEditor` 호출은 하나뿐이다. block마다 Editor를 만들지 않는다.

## 4. 구현한 typed block types

대표 fixture는 다음 네 block이다.

1. Heading — `heading`, level 1
2. Paragraph A — `paragraph`, text/strong/emphasis inline content
3. Equation — `equation`, `latex`와 `label` attributes
4. Paragraph B — `paragraph`

기존 Core fixture의 Figure/Table/Admonition/unsupported block은 이 spike schema에서 의도적으로 거부한다.

## 5. Block-first insertion UX

`+ Add Block` 아래에 `Paragraph`, `Heading`, `Equation` 버튼을 둔다. 현재 selection이 속한 top-level block 뒤에 Tiptap command로 typed node를 삽입한다. 기본 내용은 관찰 가능한 placeholder이며, 추가 후 문서 전체는 같은 editor state에 남는다.

선택 block 삭제는 `deleteRange`로 수행하며, 마지막 block 하나는 남긴다. 이 삭제 command는 save 시 semantic projection으로 변환된다.

## 6. Equation custom node 구현 방식

`EquationNode`는 Tiptap `Node.create`로 만든 `group: "block"`, `atom: true`, `selectable: true`, `isolating: true` node다. `latex`와 `label`을 attributes로 보관하고 `[Equation]` label과 LaTeX text를 `renderHTML`에서 별도 표시한다. Equation은 paragraph + CSS가 아니며, editor schema에서 실제 `equation` node다.

KaTeX, equation editor, toolbar, resize, menu는 추가하지 않았다.

## 7. Enter behavior

`handleKeyDown`으로 Enter를 가로채지 않았다. Paragraph 끝에서 Enter는 StarterKit/ProseMirror의 기본 split behavior에 맡긴다. adapter는 결과의 여러 paragraph를 top-level semantic blocks로 읽는다.

수동 키 입력 결과는 이 실행 surface에서 브라우저 input API를 호출할 수 없어 직접 관찰하지 못했다. 따라서 “자연스럽게 동작한다”는 수동 확인 주장은 하지 않는다. 구현상 custom Enter interception은 없으며, unit test는 이 사실을 고정한다.

## 8. Backspace behavior

Paragraph 시작의 Backspace도 intercept하지 않았다. 같은 prose block 경계의 merge는 Tiptap 기본 behavior에 맡긴다. Equation은 atomic/isolating node이므로 prose ↔ equation 경계가 일반 paragraph merge와 같지 않을 가능성이 핵심 관찰 포인트다.

수동 경계 결과는 미실행으로 표시한다. 삭제 UI 자체와 semantic block delete/save/reload는 자동 검증했다.

## 9. Arrow navigation

별도 focus router를 만들지 않았다. Heading/Paragraph/Equation 사이의 cursor/node selection 이동은 하나의 ProseMirror document와 기본 selection behavior에 맡긴다. Equation은 selectable atom이라 prose cursor와는 다른 node selection을 가질 수 있다.

수동 ArrowUp/ArrowDown 관찰은 미실행이다.

## 10. Undo/Redo behavior

수정, typed node 삭제, 다른 block 수정이 하나의 `useEditor` history에 들어가도록 별도 history coordinator를 추가하지 않았다. 따라서 Ctrl+Z/Ctrl+Y는 document 전체 transaction history를 사용한다.

수동 Ctrl+Z/Ctrl+Y 실행은 미실행이다. 자동 검증은 여러 block의 semantic 변경이 하나의 save/reload projection으로 왕복하는지에 집중한다.

## 11. Cross-block selection 관찰 결과

문서 전체가 하나의 ProseMirror doc이므로 구조상 Paragraph A부터 Paragraph B까지 연속 selection 범위를 만들 수 있고, equation atom도 그 범위에 포함될 수 있다. clipboard conversion을 별도 구현하지 않았다.

마우스 drag와 copy/paste 수동 관찰은 미실행이다. 따라서 custom Equation node가 실제 clipboard에서 어떤 표현을 만드는지는 아직 증거가 없다.

## 12. Tiptap이 자동으로 해결한 interaction

코드 구조상 다음은 단일 editor의 기본 transaction/selection/history에 위임했다.

- paragraph split(Enter)
- prose merge/backspace의 기본 behavior
- cross-block selection의 단일 document 범위
- cursor/node navigation의 단일 selection state
- document-wide undo/redo history
- 기본 copy/paste transaction

이 중 실제 Windows/browser key/mouse 결과는 본 실행에서 수동 확인하지 않았으므로, 위 목록은 “위임한 범위”이지 완전한 UX PASS 목록이 아니다.

## 13. IeumDoc이 직접 구현해야 했던 코드

- typed block schema: Heading/Paragraph/Equation에 대한 Tiptap node 구성
- Equation custom node와 표시
- Core read model에서 Tiptap JSON으로의 projection
- Tiptap JSON에서 editor-neutral `EditableDocument`로의 conversion과 unsupported-node validation
- `+ Add Block` 및 selected-block delete UI
- semantic whole-document save bridge
- narrow fixture와 unsupported existing block 정책

## 14. Core ↔ Tiptap conversion 구조

Tiptap JSON은 `apps/editor/src/single-editor-adapter.ts` 내부에만 존재한다. adapter는 다음을 수행한다.

- Core `EditableDocument` → Tiptap `doc/heading/paragraph/equation`
- Tiptap `doc` → Core의 editor-neutral `EditableDocument`
- paragraph의 text/strong/emphasis mark 변환
- Equation attributes(`latex`, `label`) 검증
- Equation, unsupported block, unsupported mark 거부

서버 POST는 Tiptap JSON을 받지 않고 `EditableDocument`를 받는다. Core는 `replaceEditableBlocks`로 top-level semantic block을 MyST AST node로 materialize한 뒤 `validateStructure`, `serialize`, reparse/validate를 실행한다. Markdown serializer는 공식 write path로 유지된다.

NodePath는 adapter가 새 snapshot의 `[index]`로 다시 만들며, ProseMirror position과 Core NodePath를 통합하지 않았다. 이 구조에서는 structural edit 뒤 path 안정성을 유지하는 대신 whole-document replacement가 자연스럽다.

## 15. Tiptap coupling 정도

1. Typed Block이 늘어나면 adapter branch와 Tiptap extension/node가 대체로 1:1로 늘어날 가능성이 높다. Equation 하나만으로도 extension, projection, reverse conversion, UI 표시가 필요했다.
2. Core block schema 변경이 editor에서 표현되어야 하면 Tiptap schema/adapter 변경도 요구된다. 현재 fixture 밖의 Figure/Table/Admonition은 바로 그 경계에서 거부된다.
3. Editor engine을 교체하면 `SingleDocumentEditor`, `EquationNode`, Tiptap JSON adapter, Tiptap command 사용부와 관련 tests가 폐기/교체 대상이다. Core `EditableDocument`, `InlineContent`, Core operation과 Markdown path는 유지 대상이다.
4. Tiptap document model이 IeumDoc model을 완전히 대체하지는 않았지만, Heading/Paragraph/Equation 세 종류만으로도 block schema와 conversion code를 부분 복제했다. 이중 모델 비용이 실제로 드러났다.

## 16. 추가 dependency

- `@tiptap/core@3.31.3` 직접 dependency 1개 추가
- 기존 `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`은 master에서 재사용
- KaTeX 등 추가 dependency 없음

## 17. Core 변경 사항

새 public operation은 `replaceEditableBlocks(document, editable)` 하나다. 이 operation은 spike가 지원하는 Heading/Paragraph/Equation만 AST로 변환하며, Tiptap/ProseMirror를 import하지 않는다. generic transaction engine, node registry, persistent ID는 만들지 않았다.

## 18. 정량 자료

- branch 변경 path: 18개(문서/lockfile 포함, 기존 per-block source 5개 삭제, 새 single-editor source 3개 추가)
- 추가/변경 production code: 대략 510 LOC; 기존 per-block source 약 550 LOC 삭제. 수치는 whitespace와 파일 교체를 포함한 근사치이며 승패 기준이 아니다.
- 추가 Tiptap extension/custom node: 1개(`EquationNode`)
- 추가 adapter/converter module: 1개(`single-editor-adapter.ts`, 양방향 변환)
- 추가 save bridge: 1개(`saveEditorDocument`)
- 추가 Core operation: 1개(`replaceEditableBlocks`)
- 별도 coordinator/helper: 0개
- 추가 dependency: 1개 직접 dependency

## 19. `pnpm typecheck`

PASS. Core, CLI, Editor 모두 통과했다.

## 20. `pnpm test`

PASS. Core 26 tests, CLI 1 test, Editor spike 8 tests가 통과했다.

추가로 `pnpm --filter @ieumdoc/editor exec vite build`도 PASS했다. Vite가 chunk size warning을 출력했지만 build 실패는 아니며, 제품 최적화 작업은 이 spike 범위에 포함하지 않았다.

## 21. 사람이 직접 사용한 결과

이 실행에서는 native browser input surface를 호출할 수 없어 사람이 직접 수행한 시나리오 1–8의 최종 PASS/FAIL을 기록하지 않았다. 대신 실행 가능한 Vite build, GET fixture 확인, semantic adapter/save/reparse tests로 구현 경계를 검증했다. 이 항목은 완료된 사람 평가를 의미하지 않으며, 후속 비교 시 반드시 실제 브라우저에서 재실행할 관찰 항목이다.

## 22. Single Editor 구조의 장점

- 하나의 selection/history/document state로 전체 문서를 표현한다.
- block 간 selection과 interaction을 editor engine의 기본 모델에 맡길 수 있다.
- Enter/Backspace/undo/redo를 block별 coordinator 없이 같은 transaction history로 처리할 수 있는 구조다.
- save 직전 전체 semantic snapshot을 만들 수 있어 여러 paragraph draft를 별도로 추적하지 않아도 된다.

## 23. Single Editor 구조에서 실제로 확인된 유지보수 비용

- typed block 하나를 추가하는 일이 node/schema, 양방향 adapter, validation, UI insertion, Core write materialization까지 번진다.
- Core read model과 Tiptap document model이 각각 존재하며, 두 locator(ProseMirror position/Core NodePath)도 남는다.
- unsupported block을 보존할지 거부할지 결정해야 한다. 이 spike는 좁은 fixture를 선택하고 기존 Figure/Table/Admonition을 거부했다.
- whole-document replacement는 단순하지만, 변경 이력/unsupported semantics/기존 node metadata를 보존하는 일반 해법은 아니다.
- Equation atom은 prose와 다른 selection/clipboard/boundary semantics를 갖기 때문에 기본 interaction을 그대로 두어도 별도 관찰 비용이 생긴다.

## 24. Production에 채택할 경우 추가로 필요한 infrastructure

- 지원 block 전체에 대한 명시적 schema와 lossless editor-neutral projection 정책
- Tiptap position과 Core structural target 사이의 안정적인 mapping 또는 whole-document conflict policy
- Equation을 포함한 typed node의 paste/import/export 및 accessibility 정책
- unsupported block을 보존하는 read-only/round-trip 전략
- transaction validation, concurrent save/conflict handling, autosave/persistence 정책
- browser-level interaction/clipboard/accessibility regression suite

이 문서는 위 infrastructure를 구현하지 않으며, architecture를 채택하거나 폐기하라는 결론도 내리지 않는다.
