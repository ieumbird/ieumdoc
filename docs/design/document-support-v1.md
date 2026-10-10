# Document support and preservation v1

- Status: Implemented
- Last verified: 2026-10-10 (pending Figure contract and canonical write regression coverage).
- Scope: Core read, visual authoring and canonical write boundaries; [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md).

Issue: #42. Readability, visual authoring, and canonical writeability are separate capabilities.

## Contract

Core owns the verdict for every parsed snapshot. Canonical output still rejects serializer diagnostics and compares the entire reparsed semantic fingerprint, including references and surrounding context. A visually read-only block does not by itself block saving supported edits elsewhere.

IeumDoc canonical Markdown uses LF (`\n`) line endings on every platform, including Windows. CRLF or mixed line endings accepted on input are normalized to LF on canonical write; original line endings are not preserved.

The parse boundary keeps typed text as written, because the canonical write guard compares a parse with the reparse of its own output and cannot see what parse itself changes. Core turns off MyST's typographic quote substitution, so straight quotes stay straight and existing curly quotes stay curly. A UTF-8 BOM at the start of a file is an encoding mark, not content: parse drops it and canonical output never writes it. U+FEFF elsewhere in the document remains content.

The MyST boundary preserves closed leading front matter, column alignment in Markdown tables, ordinary Markdown images, and task list checkboxes. It uses the existing writer, adapts its input shape, and preserves front matter as front matter. It does not introduce opaque placeholders or bypass semantic verification with raw source. Front matter keeps its complete YAML text, including trailing lines whose meaning depends on block-scalar chomping. Unterminated front matter, ambiguous indented closing markers, and changes that relocate metadata into the body must fail closed. Footnote definitions stay where they are written. A definition the parse dropped (unreferenced or repeated) also fails closed ([Footnotes v1](footnotes-v1.md)). Unsupported syntax remains subject to the same whole-document guard. A literal `$` in text is written as `\$`, because MyST would otherwise reload `$...$` as inline math; inline math itself is written as `$...$`. It keeps the `{math}` role only where `$...$` would not reload unchanged: a source holding `$` or ending in a backslash, or math right after a line break, where the writer would turn the line ending into a space.

Core's read model provides the kind, opening source, and source line for content the visual editor cannot author. This is display provenance only, never an alternate write path. A read-only block's source can be edited and applied through the `replaceBlockSource` Core operation ([Block source editing v1](block-source-editing-v1.md)). Table alignment is projected for display. The editor keeps unsupported content read-only while supported content remains editable when the entire document can be serialized safely.

A document Core cannot write opens read-only before any typing. It shows the reason and location, offers the original source for copying, and directs the user to repair the file with an external editor or the existing Core-backed CLI, then Reload. Reload parses the repaired file and reevaluates writeability. No whole-document raw Markdown editing is added; block source editing (#102) replaces one block of a writable document through Core. The existing Save/Source pipeline continues to validate every edited snapshot.

## Interfaces and verification

Pending Figures use the existing MyST container without an image argument. A caption or label is required; alt text is forbidden without an image. A narrow direct directive writer compensates for `myst-to-md`'s inability to write this shape, while the complete semantic fingerprint and diagnostic guards remain. Unsupported Mermaid, legends and subfigures keep their fail-closed boundary. Figure operations may compose temporary empty states, but public canonical write rejects a final all-empty Figure. [Figure authoring](figure-authoring-v1.md) defines the read model, operations, Editor states and CLI warnings. Writeability allows valid pending Figures; it does not certify publication readiness.

No new semantic operation is introduced: existing CLI format and editing commands inherit the corrected Core serializer. CLI format persistence and failure without writes verify that boundary. Core regressions cover preservation, context-sensitive failure, source projection, and determinism. Host checks cover canonical save and preflight consistency. Browser checks cover supported body Save → Reload with preserved content, read-only blocking, original source, and repaired-file Reload.
