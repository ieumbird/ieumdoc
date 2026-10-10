# Block source editing v1

- Status: Implemented
- Last verified: 2026-10-08 (contract compared with current code and regression coverage).
- Scope: Core block replacement and its Editor/CLI adapters; [Document support](document-support-v1.md).

A read-only block's MyST source can be edited in IeumDoc and applied through Core. MyST directives and roles are an open set, so read-only blocks remain however far visual authoring grows. Introduced in #102, this single-block operation is part of the current [Document support contract](document-support-v1.md); whole-document Source remains read-only. It does not need a new ADR: the change is a Core semantic operation that passes the existing validation and canonical write contract (ADR-0002), and the Editor keeps its single document state (ADR-0001).

## Core

`replaceBlockSource(document, index, source)` replaces one top-level block with the block its source parses as. Core owns the parsing and every check:

- The source is parsed on its own and must be exactly one block. Zero blocks (use `removeBlock`) and several blocks are rejected, so one block keeps one snapshot locator.
- The source must be complete. It is parsed again followed by a paragraph, which must stay a separate block; an unclosed fence, directive or HTML block would take in the blocks after it and is rejected.
- It cannot give a label that names another target in the document. The block may keep its own labels.
- The whole document must still pass canonical write (serializer diagnostics and the full semantic fingerprint). Front matter is accepted only at the start of the document.

A supported result projects as an editable block; anything else stays read-only. Read-only provenance covers applied source: `original` shows the applied text, and `line` is present only for lines of the opened file.

## Editor

A read-only block (an unsupported block, a block with `editable: false`, or a table with a read-only cell) offers Edit source next to its source. Apply sends the source to the local Host, which runs Core on the session's opening snapshot and returns the block's projection, or the reason it was refused. A refusal leaves the document unchanged and shows the reason in the form. Editable blocks do not offer source editing; they are authored visually.

An unapplied source survives selection changes and is covered by the session's work-loss guard. Source Apply refuses while this block has another property draft, after its opening node changed, or if the node/applied sources/input changed during validation. Refusal retains both applied content and the source draft; Cancel or unmount invalidates the outstanding response. Undo of the block's edits restores its eligibility. This is a replacement guard, not durable draft storage.

An applied source replaces the node in one transaction and records `{ source, block }` under the block's snapshot path in a document attribute. Undo and Redo therefore restore both in one step. Save sends each recorded source as a `sources` edit. The Host applies them to the opening snapshot first, so the block keeps its locator, and then validates and applies the session's other edits against the replaced blocks. A block that became editable can be edited further in the same session.

## Scope

- A document Core cannot write still opens entirely read-only and is repaired outside the Editor, then Reloaded. The CLI command can repair it when the replacement makes the document writable.
- Whole-document Source editing (#86) is a separate decision; Source remains a read-only preview.
- Cursor, form and panel behavior is Editor-only and has no CLI parity.

## CLI

`ieumdoc replace-block-source <file> --at <index> (--source <text> | --source-file <path>)` runs the same Core operation and writes nothing when it fails. `inspect` shows the current `source` of each read-only block.

## Verification

Core tests cover the editable and read-only results, provenance, and each refusal without mutating the document. The CLI test covers writing, failures without writes and the option contract. Editor tests cover the save adapter and the Host replay; the browser test covers Apply, refusal, Undo/Redo, further visual editing, and Save → Reload.
