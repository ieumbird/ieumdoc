# Citations v1

- Status: Implemented
- Nested authoring verification: 2026-10-24 (#377: Editor slash tests and `citation-authoring` menu/insertion/Save → Reload on lists, quotes, simple admonitions, endnote definitions, cells, Figure captions and headings, including a citation-only list item).
- Last verified: 2026-10-25 (#438: Editor bibliography connections apply on Save; verification below).
- Previous verification: 2026-10-23 (units A, B and C; execution results recorded below).
- Scope: [ADR-0008](../adr/0008-citations-and-bibliography.md) units A, B and C, under [Native document support](document-support-v1.md). Unit D extensions remain separate decisions.

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
Citation-only content is a non-empty persistent paragraph, including after paragraph split/merge
or heading-to-paragraph conversion. The shared inline semantic comparison verifies canonical
round-trip preservation of roles, ordered keys and marks; whitespace-only results remain refused.

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

Only saved, declared `.bib` files are read on Open/Reload and after saving a changed declaration. They are never created or modified. A permitted
declaration can name a missing resource or traverse above the document directory; admission alone
does not grant permission to read it. The read boundary is specified below.

Core `citationReport(document)` returns `bibliography`, ordered `citations`, and
`readiness: { status: "not-evaluated", complete: null, diagnostics: [] }`. Each citation has its
top-level snapshot `path`, canonical `role`, original `keys`, `numbers` and numeric `text`.
Without source snapshots there are no fabricated missing-key or resolved diagnostics. Validation and writeability remain
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
under `citations`. Once resources are evaluated, `citations.entries` lists every readable key once,
in source order, with its source, `complete`/`incomplete`/`duplicate` status and display text
(the key for a duplicate). Formatting an uncited entry never changes readiness. Text check/inspect print declarations, roles, keys, numeric groups and
`citation readiness: evaluated; complete: true/false` when citations or declarations exist. `format` preserves declarations and explicit roles in its
canonical output. Ordinary successful file edits retain their existing stdout contract and send
resource warnings to stderr; resource warnings do not change successful exit 0. Text check/inspect
and text dry-run diagnostics appear on stdout; JSON output embeds them under `citations`.
Document check/inspect/edit commands accept optional `--bibliography-root <directory>`; default
is the document directory, independent of process cwd. This is not a `serve` option.

## Editor

An inline citation is a Tiptap atom in the single document state. Its role and keys map both ways
through the existing inline adapter, and Save replays existing Core content operations. Typing around
it, moving content, Undo/Redo and supported clipboard operations preserve its meaning. Table captions
use the same Core numeric display as the rest of the document.

Authoring uses the command center’s `Insert citation…` at a retained caret without requiring
whitespace, or the slash menu on supported inline surfaces: paragraphs, list items (including
nested lists), quotes, simple admonitions, endnote definitions, table cells, Figure captions and
headings. Only top-level paragraphs also offer block commands; the [location matrix](editor-ux-shell-v1.md#nested-inline-slash-menu-377)
records the existing Core save paths. **Citation…** opens a form at the caret. `/Citation`,
`/cite` and `/인용` select this item first in either UI language, including in an empty paragraph;
applying the form inserts an inline citation and keeps the paragraph. These queries do not offer
Quote; use `/quote`, `/blockquote` or `/인용문` for that block. A query
also lists up to 20 readable entries whose key or display words start with it, inserted directly as
`cite:p`. A citation chip's edit button opens the same form with its stored role and keys. The form
chooses `cite:p` (default), `cite:t` or `cite`, keeps an ordered key group, and searches every readable
entry through the browser's own list suggestion. Typed keys absent from the bibliography remain citable
and show as unresolved; keys Core refuses are rejected in the form. Apply uses Core's canonical
citation (multi-key `cite` becomes `cite:t`); Escape or leaving the form cancels; Remove deletes the
atom and keeps the surrounding text. Entries follow the tab's last loaded resource snapshot (Open/Reload or Save of a changed declaration), so a tab whose
folder cannot read the declared file offers typed keys only. The Editor never writes `.bib` files.

The chip uses shared reference typography and selection tokens. It shows Core numbers and the
same readiness as the derived list, including caption citations. English/Korean accessible labels
identify keys and status. Incomplete states retain dashed text; no active bibliography URL is emitted.
A single derived References section follows canonical endnotes, outside the ProseMirror document.
It contains only cited keys in current number order, including missing/duplicate/unverified keys.
Moving citations and Undo/Redo recompute numbers; Save never inserts this section into `.md`.

### Connect and disconnect bibliography files (#438)

Owner decision (2026-10-25): connections apply on Save. The existing Host read contract
continues to accept only declarations from an admitted, saved document; the Editor cannot
ask it to read arbitrary resource targets. No Host read capability or persistence is added.

The trailing References area offers **Connect bibliography…**, including when the document has
no declaration or citations. The existing folder listing offers `.bib` files in the document's
own folder. Candidates use the same browser-safe Core `bibliographyError` validation and lexical
normalization as admission and `updateBibliography`: adding the candidate must leave the full
staged declaration valid. Equivalent existing paths (including `./` and cancellable `..` segments)
and filenames Core rejects are hidden. No declaration/path rules are duplicated in the Editor.
Long candidate names ellipsize inside compact buttons, keeping the full name in their title and
accessible name. Existing declarations, including parent/subfolder paths, remain visible and can be
disconnected. Paths remain document-relative; the existing pinned local folder context or HTTP
Root union and real-path checks still govern reads. Files outside the reading boundary remain
unverified. IeumDoc never writes `.bib` files.

Connect/Disconnect changes one ProseMirror document attribute in one isolated Undo step, using
the same dirty, recovery, Source and Save pipeline as other document edits. Save replay calls
Core `updateBibliography(document, paths)`; the Editor does not edit frontmatter. CLI parity
already exists as `update-bibliography` and is unchanged. Until Save, existing references and
search choices retain their last loaded data, and the UI says “Save this document to load the
connected bibliography files.” The declaration list reflects staged changes immediately.

After a successful Save whose submitted declaration differs from the loaded snapshot, the
session requests only `/api/bibliography` for that Save's revision and pinned folder context.
It replaces only `DocumentFileResponse.bibliography`; the editor body, history, selection,
property drafts and edits made after the submitted snapshot are retained. Save remains busy
until this bounded read settles. A read failure yields existing unverified resource states
without turning the successful document write into a failed Save. Failed Save never refreshes.
Undo/Redo after Save can stage a different declaration again and require another Save.

External `.bib` edits still require Reload; no watcher or automatic refresh on ordinary Save
is added. The notice reads: “If you edit a .bib file in another app, save your document, then
choose Reload to update its references.” English and Korean explain both lifecycles.

## Bibliography snapshots and limited formatting (unit B)

`citationReport(document, sources)` and the browser-safe `evaluateBibliography` accept relative
source labels with text or stable read-error codes. They return typed text/emphasis parts and
`readiness: { status: "evaluated", complete: boolean, diagnostics }`. Core has no filesystem,
Root, absolute path or network lookup. The installed Citation.js BibLaTeX parser retains raw
entry types and fields before conversion; only `standard.number` is explicitly supplemented.
There is no citeproc, CSL style, automatic export, watcher, or bibliography writer.

| Original types | Limited complete output |
| --- | --- |
| `article` | Author initials, quoted title, journal, volume/issue/pages, year, DOI or URL |
| `inproceedings`, `conference` | Author, quoted title, conference, year, pages, locator |
| `book` | Author or editors, title, edition, place/publisher, year, locator |
| `techreport`, `report` | Author or institution, title, institution, report number, year, locator |
| `standard` | Title, original standard number, institution, year, locator |
| `online` | Author or organization, title, optional site, year, URL and full access date |
| `misc` | Available author, title, source, year, locator |

Exact punctuation is protected by `packages/core/test/bibliography.test.ts`. Unsupported original
types (including `proceedings` even when converted to book), unknown semantic fields, conversion
loss, complex names/dates and missing required fields receive minimal text plus diagnostics.
Each minimal part ends with exactly one period (`Title. n.d.`, never `n.d..`).
`abstract`, `keywords`, `file` are intentionally ignored. Converted markup is rendered as literal
text and diagnosed; URLs are text only. DOI takes precedence over URL. Publication year is required.
Every rendered scalar and name component is checked for converted markup or residual TeX,
including volume/issue/pages and the original `standard.number` supplement. Distinct supported
original values mapping to one scalar (such as publisher/howpublished or organization/institution)
are ambiguous and diagnosed; identical original values are accepted. No metadata is silently
repaired and `.bib` bytes remain external source authority.

Stable diagnostics include `bibliography-type-unsupported`, `bibliography-field-unsupported`,
`bibliography-field-missing`, `bibliography-key-duplicate`, `bibliography-entry-uncited` (info),
`bibliography-unreadable`, `bibliography-invalid`, `bibliography-limit`, `bibliography-changed`,
`citation-key-unresolved` and `citation-key-unverified`. Diagnostics carry source/key/field and
citation path when applicable; parser line/column is included when the library reports it.
Duplicate keys never pick an entry. If any declared resource fails, even keys in readable files
are unverified because unseen duplicates remain possible. Unresolved means all resources were
read but the key was absent. Resource failures never affect native admission or lossless Save.

The shared stateless `/api/bibliography?path=…&revision=…` handler derives declarations from the
admitted document, checks its revision, and cannot accept arbitrary resource targets. Local Vite/
Desktop reads pin the folder context on document Open: the outermost opened sidebar folder containing
the document ([ADR-0009](../adr/0009-multiple-opened-folders.md)); absent context means document
directory. Sidebar folder changes and Reload retain that tab boundary; explicit close/reopen uses
the new context. HTTP always uses the startup Root union and ignores local folder context. CLI
uses its explicit root or document directory. Lexical/real paths, symlinks and Root identity are
checked through the existing RootAccess helper. Document/media admission and folder filtering
are unchanged.

Limits are **16 files, 1 MiB per file, 4 MiB combined UTF-8 bytes, 5,000 parsed entries**. Node
reads are bounded and compare descriptor/path identity, size and timestamps before/after; malformed
UTF-8, changed/replaced files and limit errors become resource warnings. Core independently applies
snapshot limits. No read-in-progress check guarantees observation of every future external change.

Each tab owns its loaded resource snapshot and displays an external-change notice. Ordinary Save
retains it; Save of a changed declaration refreshes only that snapshot, and Reload replaces it only
in that tab. Removing the last declaration clears the snapshot without a resource read. Recovery
stores declarations/context, never bibliography text: restored sources are unverified until Reload
or Save of a changed declaration. Old recovery records without resource context retain
unchecked chips. The References section reuses document spacing, color and type tokens, wraps at
375px, and renders strings with typed React nodes rather than HTML injection.

## Dependency and fixture provenance

Installed direct packages are `@citation-js/core@0.9.0` and `@citation-js/plugin-bibtex@0.9.0`.
Their seven-package graph also includes `@citation-js/date@0.5.1`, `@citation-js/name@0.4.2`,
`sync-fetch-undici@0.7.1`, `whatwg-mimetype@5.0.0` (MIT) and `moo@0.5.3` (BSD-3-Clause).
The [distribution notice](../../apps/editor/public/licenses/Bibliography-THIRD-PARTY.txt) includes
license text and the date/name upstream license-file absence; it is copied into Editor/HTTP assets
and Desktop assets. The CLI build also collects bundled dependency notices. No CSL/citeproc entered
the installed graph. Frozen installation passed. Production audit reported 14 existing advisories
(3 high, 9 moderate, 2 low) in the MyST dependency tree (`katex`, `markdown-it`, `linkify-it`,
`csv-parse`); none belongs to the added Citation.js graph. This is not a clean security audit.

The synthetic IEEE fixtures are accompanied by an unchanged real Better BibTeX regression export:
[upstream fixture at 83e7f67](https://github.com/retorquere/zotero-better-bibtex/blob/83e7f67ff859e4c057b1754d5a0ad648a16da151/test/fixtures/export/Author%20multi-character%20initial%20gets%20shortened%20%232419.bibtex).
Local `packages/core/test/fixtures/better-bibtex-2419.bib` SHA-256 is
`bc6a45b4cd2b9d6e39add2ec0c58305dd5d07faf54dc2fd161642f0b3d2a0afd`;
the adjacent `better-bibtex-LICENSE.txt` preserves upstream MIT terms. Its unsupported metadata is
explicitly diagnosed. Zotero itself was not run or connected.

## Verification

### Citation paragraph stabilization plan (2026-10-23)

Scope: preserve citation-only content through existing paragraph split, merge and heading
conversion, and reuse the shared inline semantic comparison. Completion requires exact role,
key order and marks after canonical round-trip, Host replay and representative browser
split/merge Save → Reload. Existing empty/whitespace, UTF-16 and unsupported-content refusals
remain required. No new operation, CLI surface, parser or Editor schema change is needed;
existing CLI commands already call these Core operations. Verification uses Core tests,
targeted Editor replay tests, repository typecheck/docs checks and the `citations` browser scenario.

Results for [#351](https://github.com/ieumbird/ieumdoc/issues/351): the new split and conversion
regressions failed on base `496d800` with the non-empty error before the fix. After the fix,
Core 243 tests, Editor `editor.test.ts` 89 tests, repository typecheck, Editor build,
`pnpm docs:check` and `git diff --check` passed. The `citations` browser scenario passed against
this checkout's Vite server on port 5272: actual Enter split left a bold citation-only paragraph,
Save → Reload retained its semantics, and Backspace merge plus Save → Reload restored the
pre-split canonical bytes. The Host regression additionally checks opening-snapshot offsets
through Tiptap edit collection and replay. No new CLI operation is introduced and Core cases
are not repeated in CLI/browser. Full browser, HTTP and packaged Desktop suites remain CI checks.
Vite's existing large-chunk warning remains. The caller-owned Vite process and runner-owned
persistent browser context were closed after verification.

### Unit A historical evidence (#332)

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


### Unit B verification (#265)

On Windows, 2026-10-22, Core 240, CLI 66, Editor 263 and Desktop 39 unit tests passed.
`pnpm typecheck` passed all packages. The Editor and production CLI builds passed with the
existing Vite large-chunk warning and Node punycode deprecation warning. Frozen installation
and license review are recorded above. A focused Core rerun includes exact 5,000-entry and
4 MiB boundary acceptance plus over-limit refusal.

`pnpm browser:test bibliography --screenshots` passed with real clipboard movement, Undo/Redo,
Save, document-specific root retention/reopen, per-tab source snapshots, delayed Reload isolation,
invalid bibliography recovery, caption/endnote status, malicious strings, Korean and 375px output.
Browser text/status was compared against Node evaluation of the same Markdown and BibTeX snapshot.
The existing `citations --screenshots`, `quiet-document --screenshots`, `layout-rules`,
`continuous-editing` and `footnotes` scenarios also passed. Production `pnpm browser:test http-host`
passed both HTTP and process-crash recovery checks, including actual References parity, external
change/Reload and unchanged BibTeX through Save. The fixture preparation suite passed after its fix.

New exact fixtures first exposed Citation.js dropping `online.journaltitle`; the adapter now
reports conversion loss instead of approving the entry. Ordinal edition fixtures cover 11/21/22/23.
The HTTP fixture setup initially replaced the pinned Root directory, correctly causing Host refusal;
the setup now preserves Roots and refreshes only their test contents. No product Root check was weakened.

Visual evidence was explicitly awaited and directly inspected. Quiet-document Before is HEAD
`811a5662a2c69d804b0d0f419f2d84a4b4df054d`; After is this B implementation. Chrome on Windows,
checkout-owned persistent profile, DPR 1, Pretendard, 100% zoom, height 1000px, fonts loaded,
no dialogs/selection/hover. Quiet-document pairs use the same rest state and scroll top and are
byte-identical. New References captures scroll to the trailing region after the verified move/Save.

| State | Before | After |
| --- | --- | --- |
| Quiet document, 1440px | [Before](assets/bibliography-265/before-1440-rest.png) | [After](assets/bibliography-265/after-1440-rest.png) |
| Quiet document, 414px | [Before](assets/bibliography-265/before-414-rest.png) | [After](assets/bibliography-265/after-414-rest.png) |
| Unreadable parent source, 1440px | No References region | [Unverified references](assets/bibliography-265/unverified-1440.png) |
| Korean References, 1440px | No References region | [References](assets/bibliography-265/references-ko-1440.png) |
| Korean References, 375px | No References region | [Wrapped references](assets/bibliography-265/references-ko-375.png) |

Remote CI, the full stable browser suite, Linux, packaged Desktop/install/update and a live Zotero
export were not run. Shared Desktop route wiring and unit tests passed; packaged OS validation
remains CI/release work. Unit C and #265 umbrella completion remain outstanding.


Review corrections (2026-10-22): on base `cb975a14e51be6b748cde4e28ca153d4c0264ab6`,
six regression inputs (formatted corporate author, volume, pages, standard number, competing
publisher/howpublished and organization/institution) all incorrectly returned `complete`.
After the guard corrections all six return `incomplete` with `bibliography-field-unsupported`;
identical-value collision controls and existing exact IEEE fixtures still pass. The focused Core
suite (7 tests), CLI suite (66), repository typecheck and actual `bibliography` browser scenario
passed. CLI help now describes bounded reads rather than promising unevaluated resources.

The extended browser scenario records an actual dirty bibliography document through the production
recovery producer, verifies its fixed folder context and absence of bibliography source text,
restarts the page, opens from the narrower chapter folder and restores. Dirty edits and numbers
survive, References remain unverified through Save, explicit Reload uses the stored common-folder
context and agrees with Node, and the BibTeX hash remains unchanged. No recovery producer change
or test-seeded record is involved. Existing PNGs were captured from implementation commit
`cb975a14e51be6b748cde4e28ca153d4c0264ab6`; their fixture rendering is unchanged by these guards,
and no new screenshot claims are made for recovery.

### Unit C verification (#265)

On Windows, 2026-10-23, Core 241, CLI 66, Editor 268, file-commit 4 and Desktop 40 unit tests and
`pnpm typecheck` passed. A new Core test fixes `entries`: every readable key once in source order,
uncited incomplete entries without readiness warnings, one `duplicate` item per repeated key,
readable sources kept when another fails, and no list before evaluation. The CLI JSON parity test
compares `check`/`inspect` output with the Core report, including `entries`.

`pnpm browser:test citation-authoring` opens a chapter from the common folder and checks: slash
search and Enter insertion as `cite:p` with the next number; the form's refusal of an invalid key,
a pending typed key joining the group, an unresolved typed key, and multi-key `cite` applied as
`cite:t`; Escape without change; role/key replacement; Remove; Undo/Redo; Save writing explicit
roles and groups; Save → Reload; and an unchanged BibTeX hash. Writing it exposed two form defects,
both fixed: clicking a key's remove icon handed the click to ProseMirror and dismissed the form, and
a removed focused button would have dismissed it for keyboard users. `citations`, `bibliography`,
`cross-reference`, `footnotes`, `structural-block-authoring`, `basic-blocks`, `link-authoring` and
`section-reference` also passed.

The form reuses the reference form surface, select, input and button styles; key chips use existing
border, radius, spacing and type tokens, with no new adjustable value. These 1280px captures were
taken once by temporary local instrumentation for manual review, not by an automated assertion:

| State | Capture |
| --- | --- |
| Slash search for a bibliography word | [Slash search](assets/citation-authoring-265/slash-search-1280.png) |
| Insert form with a typed missing key and a pending key | [Insert form](assets/citation-authoring-265/insert-form-1280.png) |
| Edit form opened from an existing citation | [Edit form](assets/citation-authoring-265/edit-form-1280.png) |

### Bibliography connection verification (#438)

On Windows, 2026-10-25, the new `bibliography-connection` browser scenario failed on base
`33cef1d22f1e1a075d1703230d400a258eea6dd1` because **Connect bibliography…** did not exist.
It now passes: same-folder `refs.bib` discovery, staged notice without an early file write,
isolated Undo/Redo preserving earlier typing, English/Korean notices and phone controls,
Source preview, successful Save resolving an existing citation, slash and form key discovery,
insertion, Save → Reload, and disconnect → Save → Reload. The first Save response is held
after disk commit while typing more body text; only the submitted declaration's resource
snapshot refreshes and the later text stays dirty. The BibTeX SHA-256 remains unchanged.

Editor tests passed (283), including recovery/checkpoint replay and failed/stale resource
read guards. Repository typecheck, Editor production build, documentation checks and
`git diff --check` passed. Existing `citations`, `bibliography`, `citation-authoring`,
`save-during-edit`, `document-session`, `source-view`, `recovery-structure`, `layout-rules`,
`focus-caret` and `quiet-document --screenshots` passed. Core semantic tests were reused;
no new Core rule or CLI command was needed. Packaged Desktop and other OS checks remain CI work.

The real product captures below were inspected directly. Quiet-document Before is base
`33cef1d22f1e1a075d1703230d400a258eea6dd1`, After is this implementation. Chrome on Windows,
checkout-owned persistent profile, DPR 1, 100% zoom, bundled Pretendard loaded, scroll top,
no selection/hover/focus; the rest pairs at 1440×1000 and 375×1000 are byte-identical.
The new connection captures use the verified staged declaration and preserved unsaved text:
English at 1280×720 and Korean at 375×812, full-page capture, sidebar closed on phone.

| State | Before | After |
| --- | --- | --- |
| Quiet document, 1440px | [Before](assets/bibliography-438/before-1440-rest.png) | [After](assets/bibliography-438/after-1440-rest.png) |
| Quiet document, 375px | [Before](assets/bibliography-438/before-375-rest.png) | [After](assets/bibliography-438/after-375-rest.png) |
| Staged connection, 1280px | Connection unavailable | [Save notice](assets/bibliography-438/pending-1280.png) |
| Korean connection, 375px | Connection unavailable | [Wrapped notices and controls](assets/bibliography-438/pending-ko-375.png) |


Review corrections (#444, 2026-10-25): the extended `bibliography-connection` scenario first
failed on `50979d58dccb5b16bf35defecc81913b6cf28920` for both findings in the same run:
`./refs.bib` and `sub/../refs.bib` offered `refs.bib` again, `References [2024].bib` was offered
despite Core refusal, and the open candidate list at 375px had document `scrollWidth` 1306px.
The existing pure `bibliographyError` implementation moved unchanged to Core's browser-safe
citation surface; admission, `updateBibliography` and Editor candidates now call that same
validator and lexical duplicate check. There is no new declaration rule or Editor path parser.
Invalid/equivalent candidates are hidden. Candidate buttons keep their compact height, constrain
their width to the choices panel and ellipsize a child text span; full filenames remain in `title`
and their localized accessible name. The document itself does not clip overflow.

The extended browser scenario passes both exclusions, open-list panel/button and page-width
bounds at 375px, the full-name tooltip and accessible name, and connecting a long valid filename
through Save → Reload. Core tests (255), Editor tests (283), repository typecheck and Editor build
passed. Existing Core metadata/duplicate-path tests protect the unchanged declaration rules.
The `layout-rules` and `quiet-document --screenshots` regressions, documentation and diff checks
also passed; 1440px/375px quiet rest captures remain byte-identical to the original implementation.
The following full-page captures were directly inspected, on Chrome/Windows, DPR 1, 100% zoom,
375×812 viewport, Pretendard loaded, the same saved body and open choices, sidebar closed,
no text selection/hover/focus. The Before image extends horizontally because of the reproduced bug.

| Open candidate list, 375px | Before | After |
| --- | --- | --- |
| Valid long name and Core-rejected name | [Overflow and invalid choice](assets/bibliography-438/candidates-before-375.png) | [Contained choices](assets/bibliography-438/candidates-after-375.png) |
