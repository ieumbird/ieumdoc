# Architecture Spike A: Pure Per-block Editor

Branch: `spike/editor-per-block`
Base: `60f3044af25e4c99bc8fa20c809aac56f2d9accb` (`master`, same as `origin/master` at branch creation)

This branch is not a product feature. It asks whether IeumDoc can keep typed blocks and a block-first editing experience when each block is its own editor. `master` is not modified.

Representative document: `apps/editor/document/per-block.md`

```
Heading
Paragraph
Equation
Paragraph
```

## What was exercised in the browser

The running editor was `http://127.0.0.1:5173` (`per-block.md`).

- Bold on "DC-link" survived Save and a full reload (`**DC-link**` in the markdown, `<strong>` after reload). The fixture was then restored to the plain starting text.
- "+" between blocks offers Paragraph, Heading, and Equation. A new paragraph received focus inside its own Tiptap instance. Typing replaced the single-space seed. Delete removed the block through Core and the list returned to the previous shape.
- Paragraphs inserted immediately before and after the equation stayed paragraphs. The equation stayed a non-Tiptap block. At four paragraphs the page held four `.ProseMirror` roots.
- Enter inside a bold word split one paragraph into `regulates the **DC**` and `**-link** voltage.` Enter at the end created another paragraph. Its canonical markdown is `&#x20;`, because an empty paragraph does not survive parse.
- Backspace at the start of a following paragraph merged `-link voltage.` and `Before the equation.` into one paragraph and placed the caret at the join (ProseMirror position 15). Backspace at the start of the paragraph after the equation moved focus to the LaTeX field and did not merge.
- ArrowDown from the heading entered the next paragraph. ArrowDown from that paragraph entered the one after it. ArrowUp and ArrowDown from the equation entered the neighboring paragraphs. The first attempt left focus on the key that was pressed. Moving focus on the next turn, after the keydown handler returns, is what made the move stick.
- " AAA" and " BBB" were typed into two paragraphs. Ctrl+Z in the second removed only " BBB". Ctrl+Z in the first removed only " AAA". Ctrl+Y restored " AAA". Deleting the equation changed the equation count from 1 to 0. Ctrl+Z did not bring it back.
- A drag inside paragraph A selected that paragraph. A drag from paragraph A through the equation to paragraph B stayed inside the first Tiptap instance. Forcing a DOM range from A's text node to B's text node collapsed to `T`. A drag that started on the equation expression (the non-editable `<pre>`) selected `i* = P* / Vrms` plus nearby chrome (`+`, `Delete`, `B`, `I`) and did not include paragraph B's prose. That drag also rewrote the unsaved editor text (paragraph A became `T`, and the rest was appended to paragraph B) without a Core operation. Reload restored the file.
- The same "+" menu inserted heading `Limits` and equation `E = mc^2`. Each new block was focused. The equation seed `x` was selected, so typing replaced it.
- At a 390px width the four blocks and the add menu were still present.

## Coordination that had to be written

1. A focus registry from the current NodePath to a `start` / `end` / `all` / offset callback.
2. A deferred focus call (`setTimeout(0)`). During keydown the browser puts focus back on the element that received the key.
3. Enter handling inside each paragraph editor, plus `splitInlineContent` so bold and italic can be divided at a character offset.
4. A single-space paragraph seed. Canonical MyST drops a truly empty paragraph, and the space round-trips as `&#x20;`.
5. Backspace at the start of a paragraph. Two paragraphs merge by concatenating `InlineContent`, updating the previous paragraph, removing the current one, and restoring the caret at the join. A heading or equation is not a merge target. Focus moves there instead.
6. Arrow routing. Tiptap uses `endOfTextblock`. The heading input leaves on ArrowUp or ArrowDown because it has no internal line. The equation textarea leaves only when the caret is at index 0 or at the end of the value.
7. The add menu and the Delete button. Both call Core, then serialize, then reload.
8. Draft flush before the structural change. NodePath indexes are valid only for the current snapshot, so paragraph, heading, and equation drafts are applied at the old paths and only then is the block inserted or removed.
9. A one-shot focus request after reload, because every structural change remounts every editor.

No command bus, event bus, plugin host, selection engine, or document history stack was added.

## What Tiptap already covered

Inside one paragraph: the caret, a local selection, bold, italic, and undo/redo. Ctrl+Z and Ctrl+Y stayed inside the focused paragraph. Enter and Backspace are ignored while an IME composition is active. A Korean IME session was not run.

ArrowRight does not update ProseMirror's selection inside the keydown event. The view catches up on `selectionchange` (observed: position 5 immediately, position 6 after 100ms). Enter reads the ProseMirror selection. A human pause is enough. A burst of arrows followed immediately by Enter can split at the older caret.

## What stayed outside Tiptap

- Focus between paragraph, heading, and equation.
- Selection across those boundaries. It was not implemented. Mouse drags do not form one semantic selection, and a drag can change paragraph text locally before Save.
- Document history. Structural edits reload the document and discard every paragraph history.
- Split and merge, including the rule that an empty paragraph cannot be stored.
- Navigation into and out of the equation textarea.

## NodePath

Inserting a paragraph before the equation moved the equation path from `[2]` to `[3]`. The editor therefore cannot keep drafts keyed by the old path across a structural change. The tested order is: apply content edits, then insert or remove, then serialize and reparse. After reload, focus is "the index this operation just produced." That index is not an identity. The next insert invalidates it.

## Quantitative notes

Rough production additions, tests excluded: about 970 inserted lines, about 35 deleted lines in the existing production files. About 75 of the insertions are CSS. The new fixture is 10 lines. New test code is about 235 lines.

New or extended coordinator pieces: focus registry, text-field focus helper, inline split/concat, and the flush-then-structure save step.

New dependencies: none.

New Core operations: `insertHeading`, `insertEquation`, `updateHeading`, `updateEquation`. `insertParagraph` and `removeBlock` were already there.

## Checks

`pnpm typecheck` passed.
`pnpm test` passed (core 34, cli 1, editor 24).

## Open costs, without a product decision

A hundred paragraphs would mean a hundred Tiptap editor views. This session reached six views. The UI stayed responsive. The cost that showed up at four to six paragraphs was the per-editor boundary (separate history, separate selection, a focus hop), not a measured slowdown. One hundred views were not loaded.

A new semantic block is a new component plus a Core read/write pair, not a new Tiptap node. The equation editor itself is smaller than a paragraph editor. Each new block still needs its own caret rule in the same keyboard coordinator. That coordinator, not the block renderer, is where the branches accumulated.

The block operations line up with Core: a paragraph is `InlineContent`, a heading is text plus depth, an equation is LaTeX plus an optional label. The mismatches are representational. An empty paragraph disappears on canonical reload. An empty math fence becomes a parse error. A trailing space is stored as `&#x20;`. A structural edit renumbers every following NodePath and throws away local undo.

Selection across blocks and undo across blocks were not given a small patch. The behavior that exists today stops at the editor instance. Covering both, while keeping split, merge, and focus coherent with Core, is a document-level editing model: stable identity or an equivalent locator, one history log, and one selection that is not owned by a single ProseMirror view. This spike did not build that model.
