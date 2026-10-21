# Citations v1

- Status: Implemented
- Last verified: 2026-10-22 (implementation and verification for #332; execution results recorded below).
- Scope: [ADR-0008](../adr/0008-citations-and-bibliography.md) unit A, under [Native document support](document-support-v1.md). BibTeX reading, bibliography formatting and citation authoring UI are deferred.

## Native meaning and canonical writing

`{cite}`, `{cite:t}` and `{cite:p}` accept one or more exact bibliography keys. Core exposes
`{ kind: "citation", role: "cite" | "cite:t" | "cite:p", keys: string[] }` in supported inline
content. The role preserves narrative versus parenthetical meaning and whether a single key
is a group. Keys retain case and Unicode; they never use the label or endnote namespace.

The pinned MyST parser and writer own role parsing and output. A single narrative cite writes
`{cite}`; a narrative group writes `{cite:t}`; a parenthetical group writes `{cite:p}`. Multiple
keys in `{cite}` therefore canonicalize to `{cite:t}`. Separators become commas, while key order,
repetitions and single-key groups remain. No key sorting, range compression or author generation occurs.

Keys must be non-empty and contain no whitespace, control characters, commas, semicolons,
braces, brackets, backticks or backslashes. Prefix, suffix, partial and unknown attributes are
unsupported. Projection checks every citation/group field and canonical writing retains the full
semantic fingerprint guard. Ambiguous keys or parser/writer meaning changes fail closed.
Citation atoms have Core inline offset length one, regardless of the number of keys. Bold, italic
and deletion marks preserve their meaning; links and subscript/superscript cannot contain citations.

The #328 boundary remains: bare `@name` is literal text, canonical writing escapes it when needed
by default MyST, and unescaped bracket shorthand is rejected. Its `native-content` correction
now offers an explicit citation role as well as escaping for literal text. No shorthand alias is added.

## Bibliography declaration and readiness

Optional frontmatter `bibliography` is a non-empty sequence of relative `.bib` path strings.
`/`, `./` and `..` are allowed. Strings are kept as written and in declaration order. Scalar
coercion, empty values, inline entries, URLs, absolute/drive/UNC paths, backslashes and globs
are refused. Duplicate lexical paths, including equivalent `.`/`..` spellings, are refused;
Core does not case-fold paths or inspect filesystem identities. Metadata errors retain the stable
`native-metadata` code, and unsupported citation meaning retains `native-content`.

No `.bib` is read, searched for, created or modified. Host Root checks and real-path validation
belong to unit B when reads are introduced. A permitted declaration can name a missing resource
or traverse above the document directory; admission alone does not grant permission to read it.

Core `citationReport(document)` returns `bibliography`, ordered `citations`, and
`readiness: { status: "not-evaluated", complete: null, diagnostics: [] }`. Each citation has its
top-level snapshot `path`, canonical `role`, original `keys`, `numbers` and numeric `text`.
There are no fabricated missing-key or resolved diagnostics. Validation and writeability remain
separate from readiness, and `check` exit 0 does not mean bibliography completion.

Numbers follow the first exact key occurrence in reading order, including group order: body
blocks, directive captions before their contents, nested lists, then the canonical endnotes region. The same key
always reuses its number. Core's shared `firstReferenceNumbers` policy serves endnotes and citations
with separate maps. The existing Core `endnoteOrder` also applies before Save, when an operation has
changed footnote reference order but the snapshot's definitions have not yet moved. Report paths
still address that input snapshot. `citationText` produces `[2], [1]` in stored order. Numbers are derived and never
persisted in Markdown. This follows the existing Core/MyST content traversal used for endnotes;
the Editor's existing below-table caption placement does not change the semantic order.

## Operations and CLI

Core owns `updateBibliography(document, paths)` and `insertCitation`, `updateCitation`,
`removeCitation`. An empty `paths` array removes the optional declaration; an empty declaration
in source is invalid. Updates retain unrelated metadata and YAML comments.

Citation operations address an editable paragraph, heading, quote or simple admonition with
`path: [block]`, or a table cell with `[table,row,cell]`, using the existing Core UTF-16 inline
offsets. Endnote definitions also support citations with `[block]`. Insertion accepts offsets from
zero through content length. Update/removal require the start of an existing citation atom and retain
surrounding marks. Other inline surfaces (Figure/table captions and list items) keep the existing
typed content operations; no alternate raw-source write path is added.

| CLI command | Required options |
| --- | --- |
| `update-bibliography <file>` | `--paths <JSON string array>`; `[]` removes |
| `insert-citation <file>` | `--path <indexes> --offset <n> --role <cite\|cite:t\|cite:p> --keys <JSON string array>` |
| `update-citation <file>` | Same options, replacing the existing atom's role and key group |
| `remove-citation <file>` | `--path <indexes> --offset <n>` |

Single commands and `apply-batch` use the same Core operations. Batches accept `keys` and `paths`
as arrays or JSON strings. Existing revision, dry-run, canonical reparse and atomic file replacement
contracts apply; a failure writes no bytes. `--content` also accepts typed citation items.

`check --format json`, `inspect --format json` and edit/format JSON dry runs expose the Core report
under `citations`. Text check/inspect print declarations, roles, keys, numeric groups and
`citation readiness: not-evaluated` when citations or declarations exist. `format` preserves declarations and explicit roles in its
canonical output; ordinary successful file edits retain the existing silent stdout contract.

## Editor

An inline citation is a Tiptap atom in the single document state. Its role and keys map both ways
through the existing inline adapter, and Save replays existing Core content operations. Typing around
it, moving content, Undo/Redo and supported clipboard operations preserve its meaning. Table captions
use the same Core numeric display as the rest of the document. No search, selector, insertion menu,
key editor, bibliography list or resource access is added.

The chip uses the existing reference typography and selected state, with subtle dashed text for
unchecked resources. It shows Core numeric text; its accessible label and tooltip identify exact
keys and state that bibliography has not been checked, in Korean or English. It never has a resolved
flag or a link to a nonexistent bibliography target. Presentation values come from shared tokens.

## Verification

Core tests own role/key/group preservation, exact first-occurrence numbering, all inline surfaces,
metadata path rejection, mark-preserving operations and immutable refusal. Existing literal-`@`,
shorthand, Unicode and semantic-loss tests remain. CLI tests own command/batch/JSON integration,
dry-run and unchanged file bytes. Editor tests own adapter/schema/clipboard and Save integration;
browser checks own actual typing, Undo/Redo, numbers and Save → Reload.

Local verification on Windows, 2026-10-22:

| Check | Result |
| --- | --- |
| Core / CLI / Editor complete unit suites | 233 / 65 / 258 passed |
| Repository `pnpm typecheck` | All five packages passed |
| Editor build / CLI production build | Passed; Vite reports its large-chunk warning |
| `pnpm browser:test citations --screenshots` | Passed: actual typing, cut/paste, history, live numbering, bilingual status and repeated Save → Reload |
| `pnpm browser:test continuous-editing reference-save-reload cross-reference footnotes layout-rules` | All five passed |
| `pnpm browser:test quiet-document --screenshots` | Passed; captures are separate manual review evidence |
| `pnpm browser:test http-host` | Both production Host and browser-crash recovery checks passed |
| `pnpm docs:check` / `git diff --check` | Passed |

The Core numbering regression first reproduced stale numbers after swapping footnote references
(A=1/B=2 before Save, versus B=1/A=2 after Save), then passed using the shared endnote ordering policy.
There is no new numbering implementation in an interface. Remote CI, the full stable browser suite,
Linux execution, Desktop packaging/install/update and real OS IME were not run locally. Packaging
and distribution boundaries are unchanged; those platform checks remain CI/release work. No push or
PR was made for this implementation, so this record does not claim that required CI passed.

Visual captures use actual Chrome on Windows, a checkout-owned persistent profile, Pretendard,
DPR 1 / 100% zoom, height 1000px, scroll top, loaded fonts/images, no hover or selection. The base is
`1b26d33674fe11c234245c3a6fc0f62f3bbd1feb`; the After captures use this feature's implementation. The
quiet-document rest pairs at 1440px and 414px are byte-identical, retaining the original layout and
reference style. The new Korean citation states show the document after the verified move and Save:
numeric text, wrapped groups, table caption and endnote, without clipping at 375px.

| State | Before | After |
| --- | --- | --- |
| Quiet document, 1440px | [Before](assets/citations-332/before-1440-rest.png) | [After](assets/citations-332/after-1440-rest.png) |
| Quiet document, 414px | [Before](assets/citations-332/before-414-rest.png) | [After](assets/citations-332/after-414-rest.png) |
| Citations, Korean UI, 1440px | Not admitted by the base | [Citation display](assets/citations-332/citations-1440.png) |
| Citations, Korean UI, 375px | Not admitted by the base | [Citation display](assets/citations-332/citations-375.png) |

The base screenshot sweep exposed a capture-preparation problem: after the 414px Display capture,
the full-screen sidebar stayed open at 375px and blocked the next hover target. The screenshot-only
loop now closes it before the next narrow viewport. This changes no product behavior or assertions.
The usable base rest captures precede the blocked step; the base sweep was interrupted, not passed.
