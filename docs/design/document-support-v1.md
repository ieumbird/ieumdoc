# Native document support v1

- Status: Implemented
- Last verified: 2026-10-14 (#232 native admission and canonical write boundary; #236 explicit Open refusal Alert and state/focus retention).
- Scope: Core, CLI and shared Editor Hosts; [ADR-0006](../adr/0006-native-document-boundary.md) and [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md).

## Contract

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

## Interfaces and errors

- Core native errors have stable codes `native-marker`, `native-metadata`, `native-content`, a reason, corrective action and a snapshot path/source line where identified. `canonicalWriteIssue` and `writeIssueOf` retain write diagnostics separately from native support failures.
- CLI `ieumdoc create <file>` exclusively creates a new `.md` file in an existing directory. It never overwrites or creates parent directories. `check` returns a failing exit code for rejected files; JSON failures contain `ok: false`, `validation.valid: false` and `error` diagnostics, without a document model. `inspect`, `format` and editing commands use the same admission and preserve rejected file bytes.
- Shared Host Open/Reload/Save/Source and asset creation use Core admission. Vite, HTTP and Desktop do not implement separate syntax decisions. Failed Open/Reload retains the current document, selection, unsaved content and drafts; startup failure has no document installed. Filesystem permissions and revision conflicts remain independent checks.
- Editor explicit Open (sidebar file selection and the start screen's sample action) shows a modal Alert for Host errors whose code is `native-*`. It names the rejected file, displays Core's reason and corrective action, and states that the current document has not changed (or that no document opened). One OK button or Escape closes it and returns focus to the opening control. The same refusal is not repeated in the top error message. Other Open failures, startup failures and Reload failures retain their existing error presentation. The existing unsaved-work guard still blocks Open before reading another file.
- Folder browsing lists names without reading or classifying document contents. Open folder remains a folder picker and has no document-opening or admission Alert behavior.
- Whole-document Source previews the applied native document through Core without writing. It retains visual editor state and unapplied property drafts. `replaceBlockSource`, CLI `replace-block-source`, Host source-apply/replay and Editor Edit source are removed.

## Canonical output and compatibility

Files use UTF-8 and canonical LF line endings. CRLF/mixed input is normalized. A leading UTF-8 BOM is removed; U+FEFF elsewhere is content. Straight and curly quotes retain their meaning. Canonical output is semantic preservation, not byte preservation. Literal dollars and context-sensitive math retain the existing MyST boundary corrections.

Desktop supplies its native sample in `sample-native-v1` on first use and uses it as the sample target. Existing `sample` folders and user-modified copies are not overwritten. The next-release compatibility notice is [Native document change](../releases/native-documents-next.md); published beta.3 history is unchanged. The `ieumdoc` key is an IeumDoc marker. The installed `myst-frontmatter@1.10.1` page validator reports `extra key ignored: ieumdoc` and omits it from its validated output; external MyST frontmatter validation is not the native admission authority.

## Verification

Core tests own marker/YAML/support and semantic round-trip rejection. CLI tests own exclusive creation, structured failures and unchanged bytes. Shared Host tests own admission, revision conflicts and atomic file replacement. Browser tests own real Save → Reload, native admission state retention, Source, numbering and independent property drafts. Production HTTP and packaged Desktop tests exercise their deployment boundaries. Parser security and whole-document semantic-loss guards remain in place.
