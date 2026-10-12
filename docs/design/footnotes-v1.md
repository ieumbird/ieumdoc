# Endnotes (MyST footnotes)

- Status: Implemented
- Last verified: 2026-10-12 (#194 trailing endnotes, explicit source conversion, invoking-reference return, source draft protection and real-file Save → Reload in `pnpm browser:test footnotes`).
- Current contract: v3 (#194) on v2 (#140) and v1 (#119). Historical filename retained for link stability.
- Scope: footnote references, inserting footnotes, in-place editing of one-paragraph definitions, source-edited other definitions and fail-closed writes; [Block source editing](block-source-editing-v1.md).

Issue #119. A footnote reference (`[^label]`) made its whole paragraph read-only, and a definition's source showed a neighbouring block. Footnotes v1 makes paragraphs with footnotes editable. Definitions stay where they are written. Text that MyST would drop is never saved.

Issue #140. A new footnote had to be written as Markdown, and every definition was edited as source. Footnotes v2 inserts a footnote from the Editor or CLI and edits a one-paragraph definition in place.

Issue #194 replaces #185's in-place visual runs with one trailing endnotes region. The stored syntax and labels remain MyST footnotes. Display placement does not silently convert existing source placement.

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
- **Endnotes (v3)**: `endnoteOrder` places body blocks first and definitions in first-reference order. References inside preserved definitions follow body references, discovering further definitions in that order. Unreferenced definitions remain visible; the existing write guard still refuses them. `collectEndnotes(document)` explicitly applies this order to the source, preserving body order, labels and definition contents. It checks complete footnotes and canonical writeability, is idempotent, and never mutates its input. Ordinary `format` keeps written placement.
- **Block boundaries**: operations compare block kinds after a canonical write with the document's footnotes completed, so a save can add a reference before the definition it inserts.
- **Block source**: block source is parsed with the document's footnotes as context. A definition stays a definition, and `[^x]` reads as a reference wherever the document defines `x`. Applying a definition's source unchanged leaves the document unchanged.

## Editor

- A footnote reference is an atomic superscript chip that shows its number. Bold and italic apply to it.
- Clicking a chip selects the definition and scrolls to it. A chip with no definition shows its label and is marked unresolved.
- A definition block shows the same number. Clicking the number returns to the reference that invoked it; the engine maps that position through subsequent edits. If that reference was deleted or no invocation is remembered, it finds the first remaining reference. This navigation state is not persisted.
- A one-paragraph definition is edited in the endnotes region with the inline formatting controls; Enter leaves it into body space before the region and Shift+Enter is a line break. It holds no footnote reference. Other definitions are edited with Edit source.
- `/` in a paragraph offers **Endnote** before reference targets (`/endnote`, `/footnote`, `/미주` aliases). It replaces the query, and a space before `/`, with a reference chip that keeps bold and italic. An empty definition takes the caret in the endnotes region; one Undo removes both. Its number returns to the new reference. Save refuses a definition left empty.
- Selecting a chip and pressing Backspace removes it. If that leaves a definition unreferenced, Save is refused with the reason.

### Endnotes presentation (#194)

All top-level definitions, editable or read-only, follow the body in the one editor state. The first has a subtle 1px rule, a 12/16px muted `미주` label, and 24px space from the body; subsequent definitions have an 8px gap. Text keeps the 16px font and 1.5 line-height (24px), normal document text color and baseline number in a 24px inset. Inline reference chips stay superscript. Preserved definitions retain their own original-source disclosure, Edit source and write restrictions. There is no new heading or Outline entry in Markdown.

Projection keeps opening-snapshot locators while changing display order. Ordinary Save reconstructs existing definition placement using the next surviving body block in the opening snapshot as its source anchor; if that block was deleted, the next survivor is used. Trailing and new definitions stay at the end. Body edits, splits, merges and reordering still use the existing Core save operations. Opening, switching Visual/Source and unchanged Save do not request source conversion or become dirty because of display grouping.

The definition's gutter block menu offers **미주로 모으기** when source is not already collected. This is an explicit, undoable source change; Source preview and Save replay `collectEndnotes` after other edits. Undo can restore the original placement even after Save because the session keeps its opening snapshot. A reload uses the converted source as its new snapshot.

An appended engine transaction keeps the region trailing and ordered after body changes; selection moves with its existing block and this shares the original edit's history event. Reordering waits while a block has a dirty/busy property or source draft and resumes after Apply/Cancel. Editor option identities remain stable during React updates to preserve NodeViews holding drafts. Whole-definition copying keeps the existing lossless-copy restriction; Source remains available for copying actual Markdown, without the decorative heading.

## Scope

- CLI: `insert-footnote <file> --path <indexes> --offset <n> (--text|--content)` and `update-footnote <file> --path <index> (--text|--content)` run the v2 operations. `inspect` lists each definition as `footnote label=… inlineEditable=…`, with its source when it is read-only. References are also written with `--content` `{"kind":"footnote","label":"…"}`, and other definitions with `replace-block-source`. `check` and `format` report a definition MyST would drop and do not write.
- CLI: `collect-endnotes <file>` calls the v3 Core operation through the existing revision-checked file write path. A refusal leaves the original file intact. No new endnote syntax is introduced.
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
- Core tests also cover explicit collection, nested references, content preservation, idempotence and refusals. CLI tests cover insertion/update/collection writes and failures without writes. Editor tests cover trailing projection, ordinary source anchors including body insertion, explicit conversion and refusals.
- `pnpm browser:test footnotes` covers:
  - chip numbers and navigation;
  - unchanged definition Apply;
  - Save → Reload of an edited paragraph;
  - definition editing, `/` Endnote and its Undo, returning from the number, and Save → Reload;
  - the refused Save after removing a footnote's last reference;
  - formerly scattered and preserved definitions at 1440/768/375px, one trailing heading, first-reference order, readable typography and no sideways overflow;
  - Enter/Undo retaining one region, original Source/clipboard and byte-identical ordinary Save → Reload;
  - explicit source collection, dirty state, Undo/Redo and repeated Save → Reload;
  - repeated-reference return after definition/body edits and source draft retention during a pending reorder.

`pnpm browser:test footnotes --screenshots` writes `tmp/visual-refinement/footnotes-*.png` for manual comparison. The [#194 verification](../reviews/endnotes-2026-10-12.md) records real Before/After evidence; [#185](../reviews/footnote-regions-2026-10-12.md) remains historical evidence of the earlier in-place runs.
