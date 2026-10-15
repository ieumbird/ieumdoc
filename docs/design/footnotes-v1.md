# Endnotes (MyST footnotes)

- Status: Implemented
- Diagnostic verification: 2026-10-15 (#290: source-aware undefined-reference warnings; Core semantics and CLI text/JSON integration).
- Body-end verification: 2026-10-15 (#280 Core insertion index with/without endnotes and empty native documents; CLI single/batch insertion before definitions).
- Last verified: 2026-10-15 (ADR-0006 native definition boundary and retained test coverage compared with code/tests; no runtime regressions rerun). Previous verification: 2026-10-13 (endnotes v4: canonical placement in Core, CLI and Editor; `pnpm test`, `pnpm browser:test footnotes`).
- Current contract: v4 on v2 (#140) and v1 (#119); v3 (#194) source-anchor placement is replaced. Historical filename retained for link stability.
- Scope: footnote references, endnote placement and numbering, inserting footnotes, in-place editing of supported one-paragraph definitions, sections and fail-closed writes; [Native document support](document-support-v1.md).

Issue #119 made paragraphs with footnotes editable and stopped silent loss of definitions MyST would drop. Issue #140 added inserting footnotes and in-place editing of one-paragraph definitions. Issue #194 showed definitions as one endnotes region. Endnotes v4 makes that region the document's placement: every IeumDoc write puts the definitions after the body, in first-reference order.

## Product contract

- An endnote is a MyST footnote: a reference `[^label]` in the body and a definition `[^label]: ...`. The syntax, the labels and the MyST node names (`footnoteReference`, `footnoteDefinition`, inline `{ kind: "footnote" }`) are unchanged. No new syntax or metadata is written.
- A definition belongs to the document, not to the block or section it is written after. Several references can share one definition.
- **Definition content**: a native document permits one non-empty paragraph of supported inline content per definition, without footnote references. Multiple paragraphs, other nested blocks or unsupported inline content reject the entire document at admission; there is no source-editing fallback.
- **Endnote order**: the body's blocks first, then the definitions in the order of the first reference to each. Numbers 1, 2, 3, ... follow the same reading order; a repeated reference shows the same number. Labels are identifiers, independent of numbers. During editing, a definition with no reference comes last in its current order, but Save refuses it.
- Canonical Markdown writes the definitions after the body in endnote order, wherever the source or an operation placed them. Non-endnote blocks keep their order and content. Writing the result again gives the same bytes.

## How MyST reads footnotes

myst-parser 1.7.4 uses markdown-it-footnote, which:

- reads every `[^label]: ...` definition first;
- keeps only the last definition of each label, and only when the text references it;
- moves the kept definitions to the end of the tree;
- gives definitions no source position, so myst-parser copies a neighbouring block's position.

A `[^label]` with no definition and an escaped `\[^label]` both become plain text in the AST. Canonical write escapes that text as `\[^label]`; this preserves its parsed meaning.

## Undefined-reference diagnostics (#290)

- Core `unresolvedReferences(document)` also reports unescaped body-text `[^label]` syntax without a matching definition. Labels match exactly, including case, as markdown-it-footnote does. The label must be nonempty and contain no space, newline or closing `]`; this uses the parser's label grammar rather than the narrower authoring-operation label policy.
- The warning names the label, top-level block path and 1-based source start line of its containing inline element (paragraph, table row, etc.), following [Section references](section-references-v1.md#scope). Repeated occurrences are reported separately, including those in headings, formatting, quotes, lists, table cells and captions. Definitions themselves are outside this body-text diagnosis.
- Escaped `\[^label]` is intentional literal text and never warns. Backslash pairs follow the tokenizer's ordinary escape rules. Inline code, code blocks, math, image alt text, link URLs/titles, reference-role targets and other non-text content do not warn. Actual links such as `[^label](url)` remain links; a defined footnote reference does not warn.
- AST inline positions do not retain character offsets or escapes. Core retains the parsed source outside the semantic AST in a `WeakMap`, then uses the existing MyST tokenizer with a diagnostic fallback after its normal inline rules. Escape, code, math, link and valid-footnote rules consume their own syntax first. Token container lines map back only to actual body text in the parsed snapshot. The AST, read model, semantic fingerprint and canonical writer are unchanged. This is source evidence for parsed snapshots; text supplied through Core operations is already literal text, not Markdown syntax to reinterpret.
- CLI `check` exposes these warnings in the existing JSON `references.unresolved` array as `{ "footnote": true, "label": "loss", "path": [1], "line": 5 }`, or on stderr as `warning: footnote [^loss] (block 1, line 5) has no definition in this document`. Warnings alone leave `ok: true`, writeability and exit status 0 unchanged. `check` never writes. Save/`format` remain allowed and escape the literal text; checking the canonical output then produces no warning. Add the definition before writing to retain footnote intent, or escape the source explicitly to mark literal text.

## Core

- **One placement rule**: `endnoteOrder` (`@ieumdoc/core/numbering`, no MyST dependency) is the only ordering policy. `endnotePlacement` applies it to a MyST tree at the two boundaries:
  - **Parse** gives each kept definition its own source lines (the text is tokenized once more without the rule that moves definitions) and places the definitions after the body. A parsed document, its read model and its block indexes therefore have canonical order, whatever the source placement.
  - **Canonical write** (`serialize`, used by Save, Source, `format` and every CLI write) places the definitions again before writing and verifying. Operations need not keep definitions in place.
- **Source placement**: `endnotesInPlace(document)` reports whether a parsed snapshot's definitions are already where canonical write puts them. When false, the first write moves them; nothing is written by reading.
- **Body end** (#280): public `bodyEndIndex(document)` returns the top-level insertion index before trailing endnote definitions. Without definitions it returns the block count, including metadata; an empty native document returns 1. CLI top-level insertions use it for `--at end`, including `"at": "end"` in batches. Row/column indexes and move destinations remain numeric.
- **Dropped definitions**: an unreferenced or repeated definition that the parse dropped is recorded on the document. Canonical write refuses that document and names the footnote.
- **Write rule**: each definition must be referenced and each reference must have a definition, once per label; otherwise the reload would drop or reread them. Example: removing the last reference to `[^n]` makes Save fail with `footnote [^n] has no reference, and MyST drops an unreferenced definition`.
- **Operation checks**: an operation's round-trip check covers its own blocks. It completes the footnotes on a copy, so a paragraph with a footnote can be checked on its own and a session can pass through an intermediate state. Checks find a body block at its canonical index (`bodyIndex`) and a definition by its label, so a block inserted after the endnotes or a reordered reference does not fail the check.
- **Inline content**: `{ kind: "footnote", label }` is inline content. The label is kept as written and matched exactly, as markdown-it-footnote matches it. Links cannot contain footnotes.
- **Read model**: a definition is an editable `footnote` block with its `label` and one paragraph of supported inline content, without footnote references. Unsupported definitions reject native admission. `footnoteNumbers` gives numbers in first-reference order.
- **Operations**:
  - `insertFootnote(document, path, offset, content)` puts a reference at a Core inline offset in an editable paragraph, heading, quote, simple admonition or table cell, and its definition with the endnotes; canonical write places it by its reference.
  - `insertFootnoteDefinition(document, index, label, content)` and `updateFootnoteDefinition(document, path, content)` write a one-paragraph definition. Its text must be non-empty and hold no footnote reference. The label must be unused and stays when the text changes. `[^1]:` with no text is not a definition in MyST, so an empty definition is refused.
  - A new label is `nextFootnoteLabel`: the smallest positive number no footnote uses. Shown numbers follow reference order, so a new footnote before others can show a number different from its label.
- **Sections**: `sectionMarker` classifies a definition as `endnote`. Definitions after the body are in no section's range, and the end of the body is a section's end. `moveSection` and `removeSection` never move or remove a definition. `removeSection` refuses, before changing anything, a removal that would leave a definition with no reference (`orphanedEndnotes`), naming it.

## Editor

The Editor presents the Core order; it does not keep a source order of its own.

- The engine document is Core's read model block for block: the endnotes region follows the body because Core's snapshot does. There is no display-only reordering, no source anchor and no conversion state; Save sends the displayed order, and canonical write places the endnotes regardless.
- **Placement while editing** (`apps/editor/src/endnotes.ts`): after each document change an appended transaction applies `endnoteOrder` to the top-level blocks, so a reference moved, added or removed moves its definition in the same history event, and selection moves with its block. A document without endnotes is not read further. Each block's references are read once and reused while the block is unchanged; numbers are computed once per engine document. Placement waits while a block holds a dirty/busy property draft whose view it would rebuild, and runs after Apply/Cancel.
- A reference is an atomic superscript chip that shows its number. Bold and italic apply to it. Clicking it selects the definition and scrolls to it. A chip with no definition shows its label and is marked unresolved.
- A definition shows the same number. Clicking the number returns to the reference that invoked it; the engine maps that position through later edits and placement. If that reference was deleted or none is remembered, it goes to the first remaining reference. This navigation state is not persisted.
- A supported one-paragraph definition is edited in the region with the inline formatting controls; Enter leaves it into body space before the region and Shift+Enter is a line break. It holds no footnote reference. Unsupported definitions are rejected at admission under the native contract above.
- `/` in a paragraph offers **Endnote** before reference targets (`/endnote`, `/footnote`, `/미주` aliases). It replaces the query, and a space before `/`, with a reference chip that keeps bold and italic, and an empty definition in its endnote place that takes the caret; one Undo removes both. Save refuses a definition left empty.
- Selecting a chip and pressing Backspace removes it. If that leaves a definition unreferenced, Save is refused with the reason.
- **Gutter controls**: an endnote has no `+` (nothing is inserted after it) and its handle does not drag; the handle opens block actions (Delete). A dragged body block lands in the body, never among the endnotes. A block added after the region (for example by clicking below the document) joins the body end.
- **Sections**: a heading's section never includes the endnotes. Delete section keeps them, and is refused with a notice naming the endnote when the section holds its last reference; the reader deletes that endnote first. Move section leaves them after the body.
- **Opening a file written otherwise**: the Host reports `endnotesInPlace`. When false, a notice says that Save writes the endnotes after the body in first-reference order, keeping labels and text. Opening writes nothing and the document is not dirty; Save stays available, Source shows the Markdown Save writes, and the notice ends with the first successful Save.

### Endnotes presentation

All top-level definitions follow the body in the one editor state. The first has a subtle 1px rule, a 12/16px muted `미주` label, and 24px space from the body; subsequent definitions have an 8px gap. Text keeps the 16px font and 1.5 line-height (24px), normal document text color and baseline number in a 24px inset. Inline reference chips stay superscript. The `미주` label is display only: it is not a heading, an Outline entry, selected text or Markdown. Whole-definition copying keeps the existing lossless-copy restriction; Source remains available for copying actual Markdown.

## Scope

- CLI: `insert-footnote <file> --path <indexes> --offset <n> (--text|--content)` and `update-footnote <file> --path <index> (--text|--content)` run the operations. `inspect` lists each definition as `footnote label=… inlineEditable=…`. References are also written with `--content` `{"kind":"footnote","label":"…"}`. Every write, including `format`, places the endnotes. `check` notes a document whose definitions a write would move (JSON `endnotes.inPlace`) and reports a definition MyST would drop; `check` and `format` do not write a refused document.
- CLI sections: `move-section` and `remove-section` follow the section rule above; `--to` accepts the end of the body or the block count.
- The Editor inserts footnotes from `/`, which opens only in paragraphs. The CLI also inserts them in headings, quotes, simple admonitions and table cells (`--path table,row,cell`). A new reference in a Figure caption is inserted by neither; existing ones are kept and edited.
- Not included: removing a definition together with its last reference (cutting and pasting a paragraph would lose its definitions; Save names the definition instead), renaming labels, a shortcut or toolbar button, keyboard navigation between a reference and its definition beyond the caret. Inline footnotes (`^[...]`) are not enabled in myst-parser.

## Changes from v3 (#194)

- v3 kept each definition where the source wrote it: Save rebuilt that placement from opening-snapshot anchors, and an explicit **미주로 모으기** command (Editor) or `collect-endnotes` (CLI, never released) moved definitions. v4 removes the anchors, the command, the `collectEndnotes` save field and the `endnotesInSource` state: the placement is canonical and applies on every write.
- A file with definitions within the body is rewritten on its first Save (or `format`), as the Open notice and Source say.
- In v3 the last section included the trailing definitions, so moving or deleting it moved or deleted them. Sections now exclude them.

## Verification

- Core tests (`footnote.test.ts`, `endnote.test.ts`, `section.test.ts`) cover projection and placement of supported definitions, scattered source placement, idempotence, reference order changes, references within body formatting and repeated body references, rich one-paragraph definition edits, insertion and labels, empty/reference-containing definition edit refusals, duplicate/unreferenced definitions and incomplete write refusals, and sections that hold no endnotes. `native.test.ts` covers public admission of supported footnotes and rejection of multiple-paragraph definitions.
- `footnote.test.ts` also covers source-only missing-reference warnings, escaped/canonical literal text, exact label matching, body/container locations with BOM and LF/CRLF, non-text exclusions, unchanged AST and allowed idempotent writes. CLI tests cover only the diagnostic's text/JSON integration, successful exit and unchanged file bytes.
- CLI tests cover writes through `format` and section commands with endnotes, `check` placement notes, and refused writes that leave the file's bytes intact.
- Editor tests cover the Core-order projection, unchanged Save matching Core and the CLI, placement with one Undo step, a block appended after the region, waiting for drafts, sections, insertion and refusals.
- `pnpm browser:test footnotes` covers Open without writes or dirty state and its notice, Source matching Save, the first Save and repeated Save → Reload, chip numbers and navigation, in-place definition editing, `/` Endnote with Undo/Redo, the refused save after removing a last reference, one trailing region at 1440/768/375px with Outline and selection excluding its label, endnote handles and drops, reference order Undo/Redo, sections, returning to a repeated reference.

`pnpm browser:test footnotes --screenshots` writes `tmp/visual-refinement/footnotes-*.png` for manual comparison. The [#194 verification](../reviews/endnotes-2026-10-12.md) and [#185](../reviews/footnote-regions-2026-10-12.md) remain historical evidence of the earlier contracts.
