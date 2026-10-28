# Native document support v1

- Status: Implemented
- Feature sample verification: 2026-10-28 (#528 localized folders, Core read-model coverage and canonical CLI check/format; Desktop replacement/preservation unit tests and development browser entry/captures; no local packaged Desktop run).
- Save diagnostics: 2026-10-28 (#578 phase 2; stable Core codes, CLI JSON pass-through and bilingual Editor guidance; [inventory](#save-diagnostic-codes-578-phase-2)).
- Mermaid Figure update: 2026-10-28 (#651 PR 1; Core/CLI source/admission/canonical contract; [Figure authoring](figure-authoring-v1.md#mermaid-figures-651-core-and-cli)).
- Empty structural elements: 2026-10-27 (#574; canonical forms and verification below).
- Documentation verification: 2026-10-26 (Open protection and implemented Editor label rename compared with the session/reference contracts and current code; no new browser execution).
- CLI insertion verification: 2026-10-15 (#280 Core body-end and CLI single/batch insertion tests; one-write and unchanged-file refusal).
- Last verified: 2026-10-24 (#366 citation-only and footnote-only list admission, update and canonical reopen; Core list regressions).
- Previous verification: 2026-10-22 (#332 citation roles and bibliography declarations; Core/CLI/Editor tests and browser Save → Reload, detailed in [Citations](citations-v1.md)).
- Previous verification: 2026-10-20 (#328: literal @ admission, canonical escaping and bracket shorthand refusal; Core/CLI tests and Editor save-path code inspection).
- Previous verification: 2026-10-19 (#255: the leading level-1 heading is the document title and stays first in Core operations; admission and format unchanged).
- Previous verification: 2026-10-17 (UX review: Core `hasNativeMarker` for the sidebar folder listing; Core native tests and the stable browser suite. Admission unchanged).
- Previous verification: 2026-10-15 (#271 strict Unicode/UTF-8 admission and unchanged-file refusal; #266 metadata locator refusal in Core operations and single/batch CLI; #232 native admission; #236 Open refusal Alert).
- Scope: Core, CLI and shared Editor Hosts; [ADR-0006](../adr/0006-native-document-boundary.md) and [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md).

## Contract

Core rejects unpaired UTF-16 surrogates before parsing source and before canonical writing, including string fields such as text, URLs, labels, code, metadata and nested options. Valid Korean, emoji and literal U+FFFD remain supported. CLI document/operations JSON reads and shared Host document/request text reads strictly decode UTF-8; malformed bytes are refused rather than replaced. A leading BOM retains the existing parse normalization rule. Refusal leaves original file bytes unchanged. This validation does not introduce a new semantic operation or CLI command.

Public `parse(source)` accepts an IeumDoc native document. It validates the marker, metadata and complete semantic structure, then performs canonical write preflight. It never returns a partially supported document. Public `serialize(document)` validates native semantics before and after canonical output. Existing serializer diagnostics, complete semantic fingerprints and round-trip guards remain mandatory. MyST fragment parsing is internal to Core operations and serialization.

HTML recognition remains enabled so unsupported HTML is refused instead of silently admitted as literal text. Public source diagnostics reach the URL recognizer even though automatic linkification is off. The [Parser security boundary](parser-security-v1.md) records the pinned URL/inline HTML backports, public API verification and removal conditions.

A native file starts with closed YAML frontmatter containing the numeric marker `ieumdoc: 1`. Missing markers, strings, unsupported versions, duplicate keys and invalid YAML are rejected. Only `ieumdoc`, optional `numbering` and optional `bibliography` are allowed. `numbering` accepts `headings: boolean`, `title: false`, and the [reference templates](heading-numbering-v1.md#reference-templates-445) for `figure`, `table` and `equation` (template string or template-only object); unknown keys and other per-kind options remain rejected. Omitting heading settings disables heading numbering; omitting a reference template uses its MyST default. `bibliography` is a non-empty sequence of relative `.bib` paths under the [citation declaration contract](citations-v1.md#bibliography-declaration-and-readiness); no resource is read. Arbitrary metadata, custom starts and per-level settings are unsupported. Heading prefixes remain unsupported. Accepted YAML comments and spelling survive body edits. Metadata never appears as an editable body block, but remains part of the Core snapshot: the first body block has path `[1]`.

```markdown
---
ieumdoc: 1
---

# My document

Body text.
```

`createDocument()` returns the minimal native document with no body blocks. An empty document, an empty Figure/table/admonition/quote/list item/equation and an unresolved cross-reference are permitted authoring states. Footnotes retain their existing completeness and write rules; see [Endnotes](footnotes-v1.md). A marker alone does not certify that the body is supported.

## Supported meaning

Support is decided from Core semantic structure and existing authoring helpers, not output-string equality or an Editor `editable` flag. Source evidence also enforces explicit syntax restrictions before parser normalization can hide unsupported input, including the table directive and option rules below.

| Content | Native boundary |
| --- | --- |
| Headings | H1–H6, non-empty supported inline content, no line breaks or additional attributes. |
| Paragraphs and inline content | Text, strong/emphasis/delete/code, ordinary links with non-empty content, inline math, supported subscript/superscript, footnote references, `{eq}`, `{numref}`, `{ref}` without custom display text, and explicit `{cite}`, `{cite:t}`, `{cite:p}` keys/groups. Existing inline nesting/round-trip restrictions apply. Distinct adjacent links with identical targets are unsupported. |
| Equation | Display math value (including empty) and optional label; empty equations use dollar fences, filled equations use `{math}`. A label must preserve its identity in the chosen notation. No enumeration overrides or arbitrary attributes. |
| Figure | Empty/pending, one image or one option-free non-empty `mermaid` directive, optional container label and one supported inline caption. Alt text requires an image. Mermaid source is opaque; no syntax validation or image ↔ Mermaid conversion. No legends, subfigures, mixed content or extra directive/image/Mermaid attributes. |
| Table | Rectangular GFM grid with a header row, supported inline cells without line breaks, column alignment; optional supported table caption and label. Only plain GFM and the exact `{table}` directive are accepted. Its options may contain only `name` / `label`, and any MyST VFile diagnostic within the directive's source range causes refusal, including duplicate/unknown options in colon-line or YAML syntax. `{csv-table}`, `{list-table}` and other table directives are refused with or without caption/Label. Every table is numbered and canonically saved as `{table}`, including without caption or label. No merged cells, legends or extra directive attributes. |
| List | Ordered or unordered lists with supported paragraph content and supported nested lists; existing start and nesting rules. A list retains at least one item. Each item may be empty, including a parent with only a nested list, or contain supported inline content such as text, a citation, footnote reference, math, code or semantic reference. This applies at every nesting level. Insert/update operations normalize whitespace-only content to empty content as described below. No tasks or arbitrary nested blocks. |
| Code | Plain fenced code with the existing language contract; no captioned/directive variants. |
| Quote, divider, admonition | An empty quote or one supported paragraph; thematic break; all standard admonition kinds with an empty body or one supported paragraph. No custom titles/options or additional nested blocks. |
| Footnote and target | One non-empty supported paragraph per definition, no footnote references inside definitions; citations and document references are supported. Label targets and semantic references follow their existing contracts. |

Ordinary Markdown images, task lists, unsupported roles/directives, attributes or nesting reject the entire file. Alternative supported Markdown/MyST spellings may be accepted and normalized. No generic Markdown Import, automatic marker insertion, Migration, unsupported read-only opening or block source replacement is provided.

Bare `@name` (including `@kim` and `@param`) is literal text, as is already escaped `\@name`. Core disables MyST's shorthand citation extension at the parse boundary while keeping explicit roles parsed. In accordance with [ADR-0008 decision 3](../adr/0008-citations-and-bibliography.md#3-지원할-인용-형태), unescaped citation-like brackets such as `[@key]`, `[@a; @b]` and `[@key, p. 3]` are refused with `native-content` and guidance to use an explicit citation role or escape the opening bracket or the `@` for literal text. This applies to supported text surfaces including endnote definitions; actual links, code and math retain their syntax. Code or math inside such brackets, as in ``[`@param`]`` or `[$@key$]`, is still refused because default MyST reads the bracket as a citation; `\[` keeps it literal. Explicit `{cite}`, `{cite:t}` and `{cite:p}` roles follow [Citations](citations-v1.md), preserving exact keys, group order and narrative/parenthetical meaning. Prefix/suffix/partial and other unsupported attributes are refused.

## Empty structural elements (#574)

Core admission and existing insert/update operations accept an empty body as an authored
structure. MyST's empty body has no paragraph child; Core creates that exact shape for
empty admonitions, quotes and list items, keeping the complete fingerprint guard intact.
No parse-time content removal or synthetic placeholder text is used.

For admonitions, quotes and list items at every nesting level, Core semantic operations
normalize content with no visible inline content to `[]` (#624). This includes generic
`replaceText` and `updateNodeTextAtPath` edits of the body, its paragraph or a text leaf:
Core removes an emptied paragraph from its supported structural owner. A nested list
survives when its parent item's paragraph becomes empty. All these paths share one inline
normalization function; unsupported structures are never normalized away. The existing visibility
predicate treats spaces, tabs, newlines and other JavaScript `trim()` whitespace, including
whitespace inside formatting-only marks and break-only content, as empty. Links retain
their URL and optional title even when the label contains only whitespace. Citations,
semantic references, footnote references, inline math and inline code also remain meaningful
without a plain-text node and are not removed. The shared `structuralInlineContent` rule
in Core's inline boundary also checks native admission, so a saved whitespace-label link
can reopen without a separate parser policy. No parsed content is removed or normalized.
The pinned writer round-trips space/tab/newline/break link labels with destination data.
If link formatting cannot round-trip (for example a bold whitespace-only label becomes
literal `** **`), the existing lossless-write guard refuses with a reason and corrective
action; file writes leave the original unchanged. If any meaningful content remains, the
existing content normalization and lossless-write rules apply unchanged, including leading
and trailing whitespace handling. Editor and CLI share these operations; neither applies
its own whitespace rule. Heading, footnote and endnote empty-content restrictions are
unchanged. Native structural shape rules and the full canonical round-trip guard are unchanged.

| Element | Canonical empty form | Filled form |
| --- | --- | --- |
| Standard admonition | `:::{note}\n:::` (its selected kind) | Existing standard directive with one paragraph |
| Quote | `>` | Existing Markdown quote |
| Bullet list item | `*` | Existing Markdown list; empty/nested items retain structure |
| Ordered list item | `3.` (its start) | Existing numbered list |
| Equation | `$$\n$$` | Existing fenced `{math}` directive |
| Labeled equation | `$$\n$$ (eq-empty)` | Existing `{math}` with label option |

The pinned MyST parser reads an empty `{math}` directive as `mystDirectiveError`.
Dollar math retains an empty value and an optional label (including Korean). MyST's
derived `html_id` is admitted only when it equals the identifier-derived value; the
existing fingerprint rule ignores only that derived value. Other fields still fail closed.
Some directive labels cannot retain identity in empty dollar math: `A B` changes its
identifier from `a b` to `a-b`, and `a)b` / `a$b` do not parse as that equation.
These writes fail with a located write error instructing the user to enter content,
remove the label, or choose a compatible label. The original file remains unchanged.
All equations retain the existing official number, including when empty.

Existing CLI input paths share Core's rules, including empty `--text`, `--latex` and
list content arrays. No new empty-element commands are added: the existing operations
already express these states. Migration and stored-data compatibility are out of scope.

## Interfaces and errors

- Label rename (#216): `update-label --update-references true` calls Core `updateLabel` with `{ updateReferences: true }` for an existing Equation/Figure/Table/section label. It atomically updates only references previously resolved to that target, preserving display content and refusing conflicts or meaning changes; omission/`false` keeps references untouched. Single edits and `apply-batch` share this option. [Section references](section-references-v1.md#opt-in-label-rename-with-references-216) defines resolution, implicit heading IDs and refusals. The implemented [Editor entry point](section-references-v1.md#editor) uses this Core opt-in for non-empty label renames. Native admission is unchanged.
- Equation authoring: `insert-equation <file> --at <index|end> --latex <latex> [--label <label>]` composes Core `insertEquation` and `updateLabel` in one edit and one file replacement. Empty LaTeX is supported; the shared [label collision rules](section-references-v1.md#core), including implicit heading IDs, apply; failures preserve the original. Single commands and `apply-batch` share this contract (#280).
- Top-level body insertions accept CLI `--at end`, resolved by Core `bodyEndIndex(document)` before trailing endnote definitions. Without endnotes it is after the last body block; a new empty native document returns 1. Numeric positions, including the metadata refusal below, retain their existing rules. The command scope and batch behavior are in [CLI batch application](filesystem-host-boundary-v1.md#cli-batch-application-215).
- The [document title](document-editing-v1.md#document-title-255) is the leading level-1 heading, kept first by Core moves and insertions; admission and the Markdown form are unchanged.
- Body operations reject top-level index `0` and paths starting with `0` at Core operation time: `block 0 is the document metadata; body blocks start at 1`. This includes insertion, movement, removal and section operations. Metadata stays at snapshot index `0`; body indices and paths are not renumbered for interfaces. Single CLI edits and Editor receive the same Core guidance; `apply-batch` wraps it as `operation N (command): <reason>; nothing was written`. Refusal preserves original file bytes and never falls through to marker or round-trip errors.
- Core native errors keep `native-marker`, `native-metadata`, `native-content`. All explicit write validation guards also carry a stable `WriteIssueCode` through `canonicalWriteIssue` / `writeIssueOf`, alongside the original English reason, action and snapshot path/source line where identified. Unknown exceptions have no code. The [diagnostic inventory](#save-diagnostic-codes-578-phase-2) defines the code families.
- CLI `ieumdoc create <file>` exclusively creates a new `.md` file in an existing directory. It never overwrites or creates parent directories. `check` returns a failing exit code for rejected files; JSON failures contain `ok: false`, `validation.valid: false` and `error` diagnostics, without a document model. `inspect`, `format` and editing commands use the same admission and preserve rejected file bytes.
- Shared Host Open/Reload/Save/Source and asset creation use Core admission. Vite, HTTP and Desktop do not implement separate syntax decisions. Failed Open/Reload retains the current document, selection, unsaved content and drafts; startup failure has no document installed. Filesystem permissions and revision conflicts remain independent checks.
- Editor explicit Open (sidebar file selection and the start screen's sample action) shows a modal Alert for Host errors whose code is `native-*`. It names the rejected file, displays Core's reason and corrective action, and states that the current document has not changed (or that no document opened). One OK button or Escape closes it and returns focus to the opening control. The same refusal is not repeated in the top error message. Other Open failures, startup failures and Reload failures retain their existing error presentation. Open/New preserves existing unsaved sessions in tabs; operation guards and Close confirmation follow the [session protection contract](editing-session-save-v1.md#switching-and-recovery).
- Choosing a folder (Open folder…) lists names without reading document contents and has no document-opening or admission Alert behavior. The sidebar folder listing reads only the start of each listed `.md` file and asks Core `hasNativeMarker(source)` whether its leading frontmatter carries `ieumdoc: 1`, so Files can set apart files IeumDoc will refuse. This is a display hint, not admission: a marked file is still validated when opened, and Hosts do not parse frontmatter themselves. The refusal Alert explains the marker in plain words before Core's reason and action.
- Whole-document Source previews the applied native document through Core without writing. It retains visual editor state and unapplied property drafts. `replaceBlockSource`, CLI `replace-block-source`, Host source-apply/replay and Editor Edit source are removed.

## Save diagnostic codes (#578 phase 2)

Codes identify the failing check, independently of UI language, English wording, Editor types,
transport and filesystem. `writeIssueOf` preserves the outer reason and the first structured
Core diagnostic in its cause chain. `DocumentDiagnosticError` supplies a code to guards that
previously threw plain errors; existing actionable `DocumentWriteError` checks retain their
actions and locations. `NativeDocumentError.code` also appears in its `WriteIssue`. No predicate,
support boundary, canonical guard or write order changes.

The pre-implementation refusal inventory covers native admission/metadata, tree shape, operation
input and snapshot guards, inline validation, empty required content, structural block validators,
labels and reference rewriting, Unicode, endnote integrity, writer diagnostics/exceptions and
both whole-document and operation-specific round-trip comparisons:

| Stable code | Existing refusal checks |
| --- | --- |
| `native-marker` | Missing or invalid leading native marker. |
| `native-metadata` | Invalid YAML, unsupported metadata, numbering or reference templates. |
| `native-content` | Unsupported native blocks, attributes, inline nesting and citation shorthand. |
| `invalid-structure` | Invalid root, missing node type, invalid children array. |
| `invalid-operation` | Wrong operation argument/type, path/index/offset, stale value, illegal title/order or structural operation. |
| `unsupported-content` | Unsupported inline kinds/formatting, block shapes, list/code/citation content and writer diagnostics. |
| `empty-content` | Required paragraph/heading/endnote text is empty, or a split would create an empty persistent paragraph. |
| `round-trip-mismatch` | Fingerprint loss, operation content/canonical instability, or changed block boundaries. |
| `serialization-failed` | Writer throws without a specific serialization diagnostic. |
| `invalid-unicode` | Unpaired UTF-16 surrogate, including an unrepresentable text split. |
| `invalid-label` | Invalid/unreferenceable target or endnote label syntax, or an empty equation label that dollar math cannot preserve. |
| `label-conflict` | Label collides with another target, including automatic heading IDs. |
| `invalid-reference` | Unsupported reference/target notation, ambiguous rename or changed reference resolution. |
| `invalid-footnote` | Missing, repeated or unused definition, nested endnote reference or invalid endnote relationships. |
| `line-break` | A heading, table cell or caption contains forbidden line breaks. |
| `table-cell-whitespace` | Leading/trailing cell whitespace. |
| `table-shape` | Missing columns, ragged grid or invalid column alignment. |
| `invalid-figure` | Invalid image/alt/Mermaid/caption property combination. |

Read-model invariant exceptions in `editable.ts` and unexpected upstream/runtime errors remain
uncoded; the existing generic guidance applies. Supported unresolved document references remain
an authoring state, not a save error. File/revision/transport failures retain their own phases.

CLI `check --format json` passes Core `WriteIssue.code` through the existing `error` object,
including non-native serialization refusals; its JSON envelope and exit status are unchanged.
No new command or semantic operation is introduced. Editor collection guards tag the same code
families at their existing checks without inferring codes from prose. Host forwards the code
as `failure.code`, retaining submitted block/cell/path and original diagnostics. The localized
[Save guidance](editing-session-save-v1.md#diagnostic-guidance-578-phase-2) is presentation only.

Multiple refusal collection is **not included**. Editor collection can fail before a replay
payload exists; Host replay performs dependent label clearing/reassignment, merges/splits,
insertions, cell reshaping and ordering. Core's native/serialization checks validate a complete
snapshot and stop at the first failure. Running each edit against the opening snapshot would
reject valid dependent edits and mislocate later blocks; continuing after failure would create
secondary errors. A separate Core validation pass over the proposed final semantic document is
required. No sequential replay continuation or duplicate Editor semantics is added. The existing
list-shaped highlighting/navigation contract is unchanged.

## Canonical output and compatibility

The [v0.1.0-beta.1 candidate release record](../releases/v0.1.0-beta.1.md) summarizes compatibility and behavior changes since beta.4. The native marker remains `ieumdoc: 1`; beta.4 native documents remain supported, while new citation and reference-template metadata is not supported by beta.4.

Files use UTF-8 and canonical LF line endings. CRLF/mixed input is normalized. A leading UTF-8 BOM is removed; U+FEFF elsewhere is content. Straight and curly quotes retain their meaning. Canonical output is semantic preservation, not byte preservation. Literal dollars and context-sensitive math retain the existing MyST boundary corrections.

Inside GFM table cells, inline code and math pipes receive one additional backslash
on write; MyST removes it before inline parsing. Exact authored strings, including
existing backslashes, and column alignment survive reopening and repeated saves.
Outside cells, serialization is unchanged. The [table contract](table-caption-v1.md#cell-code-and-math-preservation-622)
defines the scope; the complete semantic guard remains mandatory.

The canonical writer escapes literal `@` where the pinned MyST citation rule would interpret it as a citation, so external MyST parsers also read the saved text literally. Email text such as `a@b.com`, URL contexts and link display text do not gain unnecessary escapes. Semantic text supplied by Core operations (including CLI and Editor edits) is already literal; bracket-shaped text entered through those operations is escaped on write rather than treated as source citation shorthand. Existing semantic fingerprints and round-trip refusal remain mandatory. No new operation or CLI command is needed.

Desktop supplies localized native sample folders in `sample-native-v1`, replacing a confirmed app-owned folder once when the bundled sample version changes and preserving edits within the same version. Unconfirmed/mixed or linked folders are kept, and sample preparation failures do not prevent ordinary document startup. The [sample distribution contract](desktop-distribution-v1.md#native-sample) defines the owner-authorized replacement and development Editor copy; HTTP Host has no sample offer. The compatibility notice is in the [v0.0.1-beta.4 release record](../releases/v0.0.1-beta.4.md); published beta.3 history is unchanged. The `ieumdoc` key is an IeumDoc marker. The installed `myst-frontmatter@1.10.1` page validator reports `extra key ignored: ieumdoc` and omits it from its validated output; external MyST frontmatter validation is not the native admission authority.

## Verification

Core tests own marker/YAML/support and semantic round-trip rejection. CLI tests own exclusive creation, structured failures and unchanged bytes. Shared Host tests own admission, revision conflicts and atomic file replacement. Browser tests own real Save → Reload, native admission state retention, Source, numbering and independent property drafts. Production HTTP and packaged Desktop tests exercise their deployment boundaries. Parser security and whole-document semantic-loss guards remain in place.
