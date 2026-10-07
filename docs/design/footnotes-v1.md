# Footnotes v1

- Status: Implemented
- Last verified: 2026-10-08 (contract compared with current code and regression coverage).
- Scope: Existing footnote references, source-edited definitions and fail-closed writes; [Block source editing](block-source-editing-v1.md).

Issue #119. A footnote reference (`[^label]`) made its whole paragraph read-only, and a definition's source showed a neighbouring block. Footnotes v1 makes paragraphs with footnotes editable. Definitions stay where they are written. Text that MyST would drop is never saved.

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
  - A definition is an `unsupported` block with `footnote: label` and its own `original` source and line.
  - Read-only blocks list the footnote references they hold in `footnotes`, so numbering can count them.
  - `footnoteNumbers` gives the numbers in first-reference order.
- **Block source**: block source is parsed with the document's footnotes as context. A definition stays a definition, and `[^x]` reads as a reference wherever the document defines `x`. Applying a definition's source unchanged leaves the document unchanged.

## Editor

- A footnote reference is an atomic superscript chip that shows its number. Bold and italic apply to it.
- Clicking a chip selects the definition and scrolls to it. A chip with no definition shows its label and is marked unresolved.
- A definition block shows the same number and is edited with Edit source.
- Selecting a chip and pressing Backspace removes it. If that leaves a definition unreferenced, Save is refused with the reason.

## Scope

- Inserting a new footnote and visual editing of definition text are not part of v1. Definitions are edited through block source. Inline footnotes (`^[...]`) are not enabled in myst-parser.
- No new semantic operation is added. The CLI can already write footnote references with `--content` `{"kind":"footnote","label":"…"}`, and definitions with `replace-block-source`. `inspect` shows `[^label]` in text and each definition's source. `check` and `format` report a definition MyST would drop and do not write.

## Verification

- Core tests cover:
  - projection and in-place round trip;
  - definition source and numbering;
  - moves and inserts around definitions;
  - write refusals, including intermediate states;
  - label rules;
  - block source with footnote context.
- `pnpm browser:test footnotes` covers:
  - chip numbers and navigation;
  - unchanged definition Apply;
  - Save → Reload of an edited paragraph;
  - the refused Save after removing a footnote's last reference.
