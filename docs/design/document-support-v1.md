# Document support and preservation v1

Issue: #42. Readability, visual authoring, and canonical writeability are separate capabilities.

## Contract

Core owns the verdict for every parsed snapshot. Canonical output still rejects serializer diagnostics and compares the entire reparsed semantic fingerprint, including references and surrounding context. A visually read-only block does not by itself block saving supported edits elsewhere.

The MyST boundary preserves closed leading front matter, column alignment in Markdown tables, and ordinary Markdown images. It uses the existing writer, adapts its input shape, and preserves front matter as front matter. It does not introduce opaque placeholders or bypass semantic verification with raw source. Front matter keeps its complete YAML text, including trailing lines whose meaning depends on block-scalar chomping. Unterminated front matter, ambiguous indented closing markers, and changes that relocate metadata into the body must fail closed. Unsupported syntax remains subject to the same whole-document guard.

Core's read model provides the kind, opening source, and source line for content the visual editor cannot author. This is display provenance only, never an alternate write path. Table alignment is projected for display. The editor keeps unsupported content read-only while supported content remains editable when the entire document can be serialized safely.

A document Core cannot write opens read-only before any typing. It shows the reason and location, offers the original source for copying, and directs the user to repair the file with an external editor or the existing Core-backed CLI, then Reload. Reload parses the repaired file and reevaluates writeability. No raw Markdown editing or repair API is added. The existing Save/Source pipeline continues to validate every edited snapshot.

## Interfaces and verification

No new semantic operation is introduced: existing CLI format and editing commands inherit the corrected Core serializer. CLI format persistence and failure without writes verify that boundary. Core regressions cover preservation, context-sensitive failure, source projection, and determinism. Host checks cover canonical save and preflight consistency. Browser checks cover supported body Save → Reload with preserved content, read-only blocking, original source, and repaired-file Reload.
