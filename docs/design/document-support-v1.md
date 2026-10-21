# Native document support v1

- Status: Implemented
- CLI insertion verification: 2026-10-15 (#280 Core body-end and CLI single/batch insertion tests; one-write and unchanged-file refusal).
- Last verified: 2026-10-20 (#328: literal @ admission, canonical escaping and bracket shorthand refusal; Core/CLI tests and Editor save-path code inspection).
- Previous verification: 2026-10-19 (#255: the leading level-1 heading is the document title and stays first in Core operations; admission and format unchanged).
- Previous verification: 2026-10-17 (UX review: Core `hasNativeMarker` for the sidebar folder listing; Core native tests and the stable browser suite. Admission unchanged).
- Previous verification: 2026-10-15 (#271 strict Unicode/UTF-8 admission and unchanged-file refusal; #266 metadata locator refusal in Core operations and single/batch CLI; #232 native admission; #236 Open refusal Alert).
- Scope: Core, CLI and shared Editor Hosts; [ADR-0006](../adr/0006-native-document-boundary.md) and [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md).

## Contract

Core rejects unpaired UTF-16 surrogates before parsing source and before canonical writing, including string fields such as text, URLs, labels, code, metadata and nested options. Valid Korean, emoji and literal U+FFFD remain supported. CLI document/operations JSON reads and shared Host document/request text reads strictly decode UTF-8; malformed bytes are refused rather than replaced. A leading BOM retains the existing parse normalization rule. Refusal leaves original file bytes unchanged. This validation does not introduce a new semantic operation or CLI command.

Public `parse(source)` accepts an IeumDoc native document. It validates the marker, metadata and complete semantic structure, then performs canonical write preflight. It never returns a partially supported document. Public `serialize(document)` validates native semantics before and after canonical output. Existing serializer diagnostics, complete semantic fingerprints and round-trip guards remain mandatory. MyST fragment parsing is internal to Core operations and serialization.

A native file starts with closed YAML frontmatter containing the numeric marker `ieumdoc: 1`. Missing markers, strings, unsupported versions, duplicate keys and invalid YAML are rejected. Only `ieumdoc` and optional `numbering` are allowed. `numbering` accepts only `headings: boolean` and `title: false`; omitting it disables heading numbering. Arbitrary metadata, custom starts, prefixes and per-level settings are unsupported. Accepted YAML comments and spelling survive body edits. Metadata never appears as an editable body block, but remains part of the Core snapshot: the first body block has path `[1]`.

```markdown
---
ieumdoc: 1
---

# My document

Body text.
```

`createDocument()` returns the minimal native document with no body blocks. An empty document, an empty Figure and an unresolved cross-reference are permitted authoring states. Footnotes retain their existing completeness and write rules; see [Endnotes](footnotes-v1.md). A marker alone does not certify that the body is supported.

## Supported meaning

Support is decided from Core semantic structure and existing authoring helpers, not source spelling, output-string equality or an Editor `editable` flag.

| Content | Native boundary |
| --- | --- |
| Headings | H1–H6, non-empty supported inline content, no line breaks or additional attributes. |
| Paragraphs and inline content | Text, strong/emphasis/delete/code, ordinary links with non-empty content, inline math, supported subscript/superscript, footnote references and `{eq}`, `{numref}`, `{ref}` without custom display text. Existing inline nesting/round-trip restrictions apply. Distinct adjacent links with identical targets are unsupported. |
| Equation | Display math value and optional label; no enumeration overrides or arbitrary attributes. |
| Figure | Empty/pending or one image, optional alt text, label and one supported inline caption. Alt text requires an image. No legends, subfigures, Mermaid or extra directive/image attributes. |
| Table | Rectangular GFM table with a header row, supported inline cells without line breaks, column alignment; optional supported table caption and label. No merged cells, legends or extra directive attributes. |
| List | Ordered or unordered lists with supported paragraph content and supported nested lists; existing start and nesting rules. No tasks or arbitrary nested blocks. |
| Code | Plain fenced code with the existing language contract; no captioned/directive variants. |
| Quote, divider, admonition | One supported paragraph in a quote; thematic break; standard admonition kinds with one supported paragraph. No custom titles/options or additional nested blocks. |
| Footnote and target | One non-empty supported paragraph per definition, no references inside definitions; label targets and semantic references under their existing contracts. |

Ordinary Markdown images, task lists, unsupported roles/directives, attributes or nesting reject the entire file. Alternative supported Markdown/MyST spellings may be accepted and normalized. No generic Markdown Import, automatic marker insertion, Migration, unsupported read-only opening or block source replacement is provided.

Bare `@name` (including `@kim` and `@param`) is literal text, as is already escaped `\@name`. Core disables MyST's shorthand citation extension at the parse boundary while keeping explicit roles parsed. In accordance with [ADR-0008 decision 3](../adr/0008-citations-and-bibliography.md#3-지원할-인용-형태), unescaped citation-like brackets such as `[@key]`, `[@a; @b]` and `[@key, p. 3]` are refused with `native-content` and guidance to escape the opening bracket or the `@` for literal text. This applies to supported text surfaces including endnote definitions; actual links, code and math retain their syntax. Code or math inside such brackets, as in ``[`@param`]`` or `[$@key$]`, is still refused because default MyST reads the bracket as a citation; `\[` keeps it literal. Explicit `{cite}`, `{cite:t}` and `{cite:p}` roles remain unsupported: this fix does not implement citation authoring.

## Interfaces and errors

- Label rename (#216): `update-label --update-references true` calls Core `updateLabel` with `{ updateReferences: true }` for an existing Equation/Figure/Table/section label. It atomically updates only references previously resolved to that target, preserving display content and refusing conflicts or meaning changes; omission/`false` keeps references untouched. Single edits and `apply-batch` share this option. [Section references](section-references-v1.md#opt-in-label-rename-with-references-216) defines resolution, implicit heading IDs, refusals and the deferred Editor entry point. Native admission is unchanged.
- Equation authoring: `insert-equation <file> --at <index|end> --latex <latex> [--label <label>]` composes Core `insertEquation` and `updateLabel` in one edit and one file replacement. Non-empty LaTeX and the shared [label collision rules](section-references-v1.md#core), including implicit heading IDs, apply; failures preserve the original. Single commands and `apply-batch` share this contract (#280).
- Top-level body insertions accept CLI `--at end`, resolved by Core `bodyEndIndex(document)` before trailing endnote definitions. Without endnotes it is after the last body block; a new empty native document returns 1. Numeric positions, including the metadata refusal below, retain their existing rules. The command scope and batch behavior are in [CLI batch application](filesystem-host-boundary-v1.md#cli-batch-application-215).
- The [document title](document-editing-v1.md#document-title-255) is the leading level-1 heading, kept first by Core moves and insertions; admission and the Markdown form are unchanged.
- Body operations reject top-level index `0` and paths starting with `0` at Core operation time: `block 0 is the document metadata; body blocks start at 1`. This includes insertion, movement, removal and section operations. Metadata stays at snapshot index `0`; body indices and paths are not renumbered for interfaces. Single CLI edits and Editor receive the same Core guidance; `apply-batch` wraps it as `operation N (command): <reason>; nothing was written`. Refusal preserves original file bytes and never falls through to marker or round-trip errors.
- Core native errors have stable codes `native-marker`, `native-metadata`, `native-content`, a reason, corrective action and a snapshot path/source line where identified. `canonicalWriteIssue` and `writeIssueOf` retain write diagnostics separately from native support failures.
- CLI `ieumdoc create <file>` exclusively creates a new `.md` file in an existing directory. It never overwrites or creates parent directories. `check` returns a failing exit code for rejected files; JSON failures contain `ok: false`, `validation.valid: false` and `error` diagnostics, without a document model. `inspect`, `format` and editing commands use the same admission and preserve rejected file bytes.
- Shared Host Open/Reload/Save/Source and asset creation use Core admission. Vite, HTTP and Desktop do not implement separate syntax decisions. Failed Open/Reload retains the current document, selection, unsaved content and drafts; startup failure has no document installed. Filesystem permissions and revision conflicts remain independent checks.
- Editor explicit Open (sidebar file selection and the start screen's sample action) shows a modal Alert for Host errors whose code is `native-*`. It names the rejected file, displays Core's reason and corrective action, and states that the current document has not changed (or that no document opened). One OK button or Escape closes it and returns focus to the opening control. The same refusal is not repeated in the top error message. Other Open failures, startup failures and Reload failures retain their existing error presentation. The existing unsaved-work guard still blocks Open before reading another file.
- Choosing a folder (Open folder…) lists names without reading document contents and has no document-opening or admission Alert behavior. The sidebar folder listing reads only the start of each listed `.md` file and asks Core `hasNativeMarker(source)` whether its leading frontmatter carries `ieumdoc: 1`, so Files can set apart files IeumDoc will refuse. This is a display hint, not admission: a marked file is still validated when opened, and Hosts do not parse frontmatter themselves. The refusal Alert explains the marker in plain words before Core's reason and action.
- Whole-document Source previews the applied native document through Core without writing. It retains visual editor state and unapplied property drafts. `replaceBlockSource`, CLI `replace-block-source`, Host source-apply/replay and Editor Edit source are removed.

## Canonical output and compatibility

Files use UTF-8 and canonical LF line endings. CRLF/mixed input is normalized. A leading UTF-8 BOM is removed; U+FEFF elsewhere is content. Straight and curly quotes retain their meaning. Canonical output is semantic preservation, not byte preservation. Literal dollars and context-sensitive math retain the existing MyST boundary corrections.

The canonical writer escapes literal `@` where the pinned MyST citation rule would interpret it as a citation, so external MyST parsers also read the saved text literally. Email text such as `a@b.com`, URL contexts and link display text do not gain unnecessary escapes. Semantic text supplied by Core operations (including CLI and Editor edits) is already literal; bracket-shaped text entered through those operations is escaped on write rather than treated as source citation shorthand. Existing semantic fingerprints and round-trip refusal remain mandatory. No new operation or CLI command is needed.

Desktop supplies its native sample in `sample-native-v1` on first use and uses it as the sample target. Existing `sample` folders and user-modified copies are not overwritten. The compatibility notice is in the [v0.0.1-beta.4 release record](../releases/v0.0.1-beta.4.md); published beta.3 history is unchanged. The `ieumdoc` key is an IeumDoc marker. The installed `myst-frontmatter@1.10.1` page validator reports `extra key ignored: ieumdoc` and omits it from its validated output; external MyST frontmatter validation is not the native admission authority.

## Verification

Core tests own marker/YAML/support and semantic round-trip rejection. CLI tests own exclusive creation, structured failures and unchanged bytes. Shared Host tests own admission, revision conflicts and atomic file replacement. Browser tests own real Save → Reload, native admission state retention, Source, numbering and independent property drafts. Production HTTP and packaged Desktop tests exercise their deployment boundaries. Parser security and whole-document semantic-loss guards remain in place.
