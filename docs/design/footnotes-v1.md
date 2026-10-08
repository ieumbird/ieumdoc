# Footnotes

- Status: Implemented
- Last verified: 2026-10-09 (Core, CLI and Editor tests and `pnpm browser:test footnotes`).
- Current contract: v2 (#140) on v1 (#119). Historical filename retained for link stability.
- Scope: footnote references, inserting footnotes, in-place editing of one-paragraph definitions, source-edited other definitions and fail-closed writes; [Block source editing](block-source-editing-v1.md).

Issue #119. A footnote reference (`[^label]`) made its whole paragraph read-only, and a definition's source showed a neighbouring block. Footnotes v1 makes paragraphs with footnotes editable. Definitions stay where they are written. Text that MyST would drop is never saved.

Issue #140. A new footnote had to be written as Markdown, and every definition was edited as source. Footnotes v2 inserts a footnote from the Editor or CLI and edits a one-paragraph definition in place.

## How MyST reads footnotes

myst-parser 1.7.4 uses markdown-it-footnote, which:

- reads every `[^label]: ...` definition first;
- keeps only the last definition of each label, and only when the text references it;
- moves the kept definitions to the end of the tree;
- gives definitions no source position, so myst-parser copies a neighbouring block's position.

A `[^label]` with no definition is plain text, even when escaped as `\[^label]`. MyST numbers footnotes 1, 2, ... in the order of their first reference.

## Core

- **Parse boundary** (`myst/footnote.ts`): the text is tokenized once more without the rule that moves definitions. This gives each definition's lines, so a kept definition goes back to where it is written. Canonical write then keeps definitions in place: `format` does not move them, and the reload order is the written order.
- **Dropped definitions**: an unreferenced or repeated definition that the parse dropped is recorded on the document. Canonical write refuses that document and names the footnote. Before v1, `format` and Save deleted such a definition silently.
- **Write rule**: on write, each definition must be referenced and each reference must have a definition, once per label. Otherwise the reload would drop or reread them. The guard names the footnote. Example: removing the last reference to `[^n]` makes Save fail with `footnote [^n] has no reference, and MyST drops an unreferenced definition`.
- **Operation checks**: an operation's round-trip check covers its own blocks. It completes the footnotes on a copy, so a paragraph with a footnote can be checked on its own and a session can pass through an intermediate state. `replaceBlockSource` is the exception: a block it writes can define or reference footnotes, so the whole document must stay complete when Apply runs.
- **Inline content**: `{ kind: "footnote", label }` joins the inline content contract. The label is kept as written and matched exactly, as markdown-it-footnote matches it. Links cannot contain footnotes.
- **Read model**:
  - A definition is a `footnote` block with its `label`. It is `editable`, with its inline content, when it holds one paragraph of supported inline content and no footnote reference. Otherwise it is read-only, with its own `original` source and line.
  - Read-only blocks list the footnote references they hold in `footnotes`, so numbering can count them.
  - `footnoteNumbers` gives the numbers in first-reference order.
- **Operations** (v2):
  - `insertFootnote(document, path, offset, content)` puts a reference at a Core inline offset in an editable paragraph, heading, quote, simple admonition or table cell, and its definition at the end of the document.
  - `insertFootnoteDefinition(document, index, label, content)` and `updateFootnoteDefinition(document, path, content)` write a one-paragraph definition. Its text must be non-empty and hold no footnote reference. The label must be unused and stays when the text changes.
  - A new label is `nextFootnoteLabel`: the smallest positive number no footnote uses. Shown numbers still follow reference order, so a new footnote before others can show a number different from its label.
  - `[^1]:` with no text is not a definition in MyST, so an empty definition is refused.
- **Block boundaries**: operations compare block kinds after a canonical write with the document's footnotes completed, so a save can add a reference before the definition it inserts.
- **Block source**: block source is parsed with the document's footnotes as context. A definition stays a definition, and `[^x]` reads as a reference wherever the document defines `x`. Applying a definition's source unchanged leaves the document unchanged.

## Editor

- A footnote reference is an atomic superscript chip that shows its number. Bold and italic apply to it.
- Clicking a chip selects the definition and scrolls to it. A chip with no definition shows its label and is marked unresolved.
- A definition block shows the same number. Clicking the number goes back to the first reference.
- A one-paragraph definition is edited in place with the inline formatting controls; Enter leaves it and Shift+Enter is a line break. It holds no footnote reference. Other definitions are edited with Edit source.
- `/` in a paragraph offers **Footnote** before reference targets. It replaces the query, and a space before `/`, with a reference chip that keeps bold and italic. An empty definition is added at the end of the document and takes the caret; one Undo removes both. Save refuses a definition left empty.
- Selecting a chip and pressing Backspace removes it. If that leaves a definition unreferenced, Save is refused with the reason.

## Scope

- CLI: `insert-footnote <file> --path <indexes> --offset <n> (--text|--content)` and `update-footnote <file> --path <index> (--text|--content)` run the v2 operations. `inspect` lists each definition as `footnote label=… inlineEditable=…`, with its source when it is read-only. References are also written with `--content` `{"kind":"footnote","label":"…"}`, and other definitions with `replace-block-source`. `check` and `format` report a definition MyST would drop and do not write.
- The Editor inserts footnotes from `/`, which opens only in paragraphs. The CLI also inserts them in headings, quotes, simple admonitions and table cells (`--path table,row,cell`). A new reference in a Figure caption is inserted by neither; existing ones are kept and edited.
- Not included: removing a definition together with its last reference (cutting and pasting a paragraph would lose its definitions; Save names the definition instead), renaming labels, a shortcut or toolbar button. Inline footnotes (`^[...]`) are not enabled in myst-parser.

## Verification

- Core tests cover:
  - projection and in-place round trip;
  - definition source and numbering;
  - moves and inserts around definitions;
  - write refusals, including intermediate states;
  - label rules;
  - block source with footnote context;
  - editable definitions, inserts and updates, labels and their refusals.
- CLI tests cover `insert-footnote`/`update-footnote` writes and failures without writes. Editor tests cover the projection, collection and refusals.
- `pnpm browser:test footnotes` covers:
  - chip numbers and navigation;
  - unchanged definition Apply;
  - Save → Reload of an edited paragraph;
  - in-place definition editing, `/` Footnote and its Undo, going back from the number, and Save → Reload;
  - the refused Save after removing a footnote's last reference.
