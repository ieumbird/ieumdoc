# Docling conversion v1

- Status: Implemented
- Worker boundary verified: 2026-10-31 (#853 synthetic REST/shared Host tests; real service and packaged checks follow the plugin contract).
- Last verified: 2026-10-30 (module/CLI tests, public and synthetic fixtures, canonical reopen, local IEEE conversion and NIST PDF REST conversion).
- Scope: `@litzio/docling` and thin CLI, under [ADR-0011](../adr/0011-code-module-boundary.md).
- Decisions: [#766](https://github.com/ieumbird/ieumdoc/discussions/766), [#767](https://github.com/ieumbird/ieumdoc/discussions/767), table flattening [#778](https://github.com/ieumbird/ieumdoc/issues/778); implementation [#768](https://github.com/ieumbird/ieumdoc/issues/768), [#780](https://github.com/ieumbird/ieumdoc/issues/780).

## Input and output

`ieumdoc docling convert <document.json> --output <new-folder>` converts the
**whole** DoclingDocument 1.10.0. There is no chapter/range option. The destination
must not exist. It contains `document.md`, `document.docling-map.json` and copied
image assets. Input files remain unchanged. Automatic heading numbers are off;
original heading numbers remain literal heading text. PDF extraction and OCR
run in an external Docling service. Automated tests use saved data or a fake HTTP
server and never launch Docling.

Conversion uses only public Core creation, semantic operations and read models.
All output passes Core serialization and byte-stable parse/serialize reopening.
Failures to preserve an individual source structure are recorded in the map;
invalid source schema/graph or an invalid final native document refuses output.

## External PDF service and source bundle

```sh
ieumdoc docling convert-pdf source.pdf --server http://127.0.0.1:8001 --output new-folder
```

`--server` takes precedence over `LITZIO_DOCLING_SERVER`. The URL can include a
reverse-proxy base path; credentials, query strings and fragments are refused.
`--timeout <seconds>` sets the overall deadline (default 1800 seconds), including
preflight, upload, polling and result download. The destination must not exist;
its parent must exist. An existing destination is never overwritten. Processing
uses an OS temporary directory and publishes files only after validation succeeds;
failure removes temporary files and any destination created by this invocation.

The module checks `GET /version` for docling-serve **1.32.0**, requires a successful
`GET /ready`, and fetches `/openapi.json`. The specification version must also be
1.32.0. Its exact byte SHA-256 and its comparison with the profile's reference
specification hash are recorded; a different hash alone is not a refusal.
Submission uses multipart `POST /v1/convert/file/async` with one PDF, then
`GET /v1/status/poll/{task_id}` (one-second intervals), then
`GET /v1/result/{task_id}`. Only complete `success` is accepted; partial success,
failure, skipped/unknown states, mismatched task IDs, result errors, invalid
schema/graph and any DoclingDocument version other than **1.10.0** refuse output.
Errors after submission include the task ID. Submission is never automatically
retried, including after a timeout: an upload can have reached the server even
when the client has no task ID. This command does not cancel or resume server jobs.

The sole fixed profile is
[`litzio-pdf-en-v1`](../../packages/docling/profiles/litzio-pdf-en-v1.json).
There is no profile selector or individual conversion-option flag. Its request
values are copied verbatim from the owner's `crd-engine` profile
`profiles/crd-pdf-rest-v1.json`, under that project's ADR-0003. The copied source
file hash and reference OpenAPI hash are in `provenance`; that project's profile
name is not an IeumDoc profile. The independent local copy avoids a runtime
dependency on another checkout.

| Request group | Fixed values |
| --- | --- |
| Input/output | PDF → JSON, `target_type: inbody`, `image_export_mode: embedded` |
| PDF pipeline | `standard`, `threaded_docling_parse`, `layout_preset: default` |
| OCR | on, force off, `rapidocr`, language `en` |
| Tables | structure on, `tableformer_v1_accurate`, mode `accurate`, cell matching on |
| Heading hierarchy | on; bookmarks, numbering, style and font style on; size tolerance 0.05, max level 6, bookmark threshold 0.8 |
| Images | pictures and pages included, scale 2 |
| Enrichment | code and formula on with `codeformulav2`; picture classification on with `document_figure_classifier_v2` |
| Other | chart extraction off, picture description off, abort on error off |

No `page_range` is sent: the official API default processes the entire PDF.
Unlike crd-engine's dynamic page-count parameter, this needs no local PDF parser.
Server model caches and deployment remain external responsibilities; version and
readiness checks do not certify model-cache identity or source fidelity.

The server operator must prepare the models used by the profile: RapidOCR,
default layout, accurate TableFormer, **CodeFormulaV2** for
code/formula enrichment and **DocumentFigureClassifier-v2.5** for picture
classification. The tested official CUDA 1.32.0 image lacks CodeFormulaV2;
the fixture procedure downloads it into the disposable container. See the
[Korean server administration guide](../guides/docling-server.md) for pinned
images, startup, persistent model cache and troubleshooting.
The 1.32.0 OpenAPI has no profile/model-cache readiness endpoint. `/ready`
reports service readiness, not availability of every model requested by a
conversion. A successful connection check must disclose that limit.

The destination contains the source bundle and the native conversion together:

```text
document.json                 DoclingDocument; only image URI values change
pages/page-063.png             page_no, starting at 1
pictures/picture-012.png       Docling pictures array index, starting at 0
tables/table-000.png           table images, when present
images/image-001.png           other nested ImageRefs, traversal order
conversion-record.json        provenance and byte/content checks
document.md                   generated through the existing converter/Core
document.docling-map.json      bound to document.json and document.md hashes
```

Names use at least three digits and retain PNG/JPEG/WebP encoding (`.png`, `.jpg`,
`.webp`). Text images use `texts/text-000.*`; no UUID/hash names are generated.
Embedded image bytes are decoded without resizing or re-encoding. MIME, magic
bytes and base64 are checked, and each written file is compared byte-for-byte
with its decoded source. Image dimensions, DPI, labels, coordinates and all other
JSON fields are preserved. Unknown remote/file image URIs are refused rather than
fetched. The saved JSON is schema/graph validated and its content hash, masking
only ImageRef URI values, must equal the source's hash. Native Markdown and map
reuse these same image files; there is no duplicate hashed asset directory.
Node's native JSON reviver source/`rawJSON` preserves integers outside JavaScript's
safe numeric range (including Docling's uint64 `origin.binary_hash`).

`conversion-record.json` has `format: litzio-docling-conversion`, `version: 1`
and `status: success`. It records source PDF absolute path, SHA-256 and byte size;
server URL and reported package versions; fetched OpenAPI SHA-256 and reference
match; the full profile/request and its provenance; task ID; timestamps/elapsed
milliseconds; exact HTTP result-body SHA-256 and byte size; saved document hash,
schema version and page count; each image's JSON pointer, relative path, SHA-256
and size; and `verification.imageBytesMatchEmbedded` /
`verification.jsonExceptImageUrisMatches`. A second PDF hash check rejects input
changes during conversion. These checks establish extraction integrity, not OCR
or semantic accuracy.

The PDF is not copied. The result response is streamed to a temporary file while
hashing, parsed once with Node's JSON parser, then deleted. The parse briefly
requires a complete JSON string/object in memory; there is no new streaming
parser dependency. Embedded strings are released as images are externalized and
no raw response is retained. The existing `docling convert` path remains intact.

The public NIST excerpt and synthetic fixtures were regenerated in #784 through
`convert-pdf` with this fixed profile. They contain unresized images with readable
names, `conversion-record.json` and the native Markdown/map, alongside unchanged
source PDFs. The old #768 resized, hash-named images and manifests are replaced;
the [fixture README](../../packages/docling/test/fixtures/README.md) records rights,
sizes and reproduction steps. Saved JSON and conversion records are unedited CLI
output; integrity checks do not certify OCR or semantic fidelity.

## App PDF conversion (#797)

Settings has a Docling category with the server address (default
`http://127.0.0.1:8001`) and Check connection beside it. A valid address is saved
on field exit or Enter/check; there is no document Save/Apply action. Errors
preserve the input, with an associated field message. The setting is the Host
user's `~/.ieumdoc/docling.json`, shared by Desktop, HTTP Host and Vite running
as that OS user. `LITZIO_DOCLING_SETTINGS_FILE` overrides that file for an
isolated Host/test installation. It is outside documents, Root folders and
browser storage: HTTP clients configure the Host's external service, not their
own localhost. Settings links to the administration guide through the existing
external-link opener; the link remains available after a failed check.

The module's same preflight supplies both conversion and connection checking:
response/readiness, reported server version, compatibility with 1.32.0 and exact
OpenAPI-reference match. Same-version spec differences remain visible but do not
refuse conversion, matching CLI policy. Invalid URLs are refused before storage. Serial address
writes compare against the saved value after earlier writes settle, so reverting
A → pending B → A stores and checks A. Older field-write errors cannot override
the latest edit/check result.

Explorer PDF file menus and Command Center's **Convert with Docling** enter the
same explicit conversion dialog. Command Center first uses the existing Host
file picker filtered to PDFs. Results go beside the PDF in `<stem>.docling`,
then `<stem>.docling-2`, `-3`, etc. Existing files/folders are never overwritten;
exclusive module publication also refuses a name claimed after the initial
choice. PDF read and output checks use the Host's existing Root/real-path policy,
including a recheck before publication. No browser request goes directly to
Docling. The native document is created by the existing converter/Core.

Each Host admits one conversion at a time. Its UI snapshot remains process-local;
execution uses a separate installed worker with shared UUID request receipts under
[Host worker plugins](plugin-runtime-v1.md). Interrupted outcomes become uncertain
and are never automatically replayed. The browser polls the Host once a second while work is active;
the module polls Docling. Progress shows checking/upload/queue/processing/download/
bundle stages, elapsed seconds, task ID once known and the result folder, without
invented page percentages. Closing the progress dialog leaves work running;
Command Center opens it again. **Stop waiting** aborts IeumDoc requests/waiting,
waits for local cleanup and explicitly says the server task may continue. There
is no API cancellation call, retry, persisted queue or resume service. The CLI
still has no interactive cancellation UI. Completed jobs/tabs are not restored
on page startup. A page may observe a still-running Host job. The UI and hook refuse Start until the first successful Host status snapshot
(including a known null/no-job snapshot). Failed status reads are retried as GETs,
so an unavailable initial read cannot leave Start permanently disabled. If a start response is lost, the UI re-reads the Host's
current snapshot before allowing another start; it never automatically repeats
the POST. This can recover a newly accepted job, including one already completed,
while ignoring an older completed snapshot. Reading that same older success
does not clear the new request's rejection/transport error; read failures and
action failures have separate lifetimes. A delayed comparison response may
change tabs/dialogs/notifications only while its conversion is still current;
it cannot clear or replace a newer task's failure.

Success opens the existing Docling comparison tab. Failure uses the same single
window NotificationCenter as stale comparison maps, with Go to problem opening
the conversion dialog. Retry removes that cause; new failures can appear again.
This adopts P07 only for Docling; aggregation of existing shell/document errors
remains [#792](https://github.com/ieumbird/ieumdoc/issues/792).

Public `failure.message`, `error_message` and result `errors[].error_message`
are interpreted in the module, with short translated cause/action text and task
ID in the UI. Explicit missing-model/capacity/source/timeout causes are retained;
raw traces are not displayed. The tested missing-CodeFormulaV2 case returns only
`Internal processing error.` and `failure: null` (the result endpoint returns
404). IeumDoc cannot recover that hidden cause: it asks the operator to check
server logs and profile models using the task ID, rather than asserting a model
is missing. The existing CLI diagnostic retains its error/context.

This is Host/UI access to the already headless `docling convert-pdf` operation;
no new Core semantics or CLI command is needed. Connection checks, REST conversion and module UI stay in `@litzio/docling`;
the Host owns worker admission, lifetime, request receipts and result publication; Editor provides shared controls, translation,
file picker, shell dialogs/tabs and external-link handling under ADR-0011.

## Correspondence sidecar

Format `litzio-docling-map`, `version: 1` is owned by the module. `source`
identifies the Docling name/schema/version and SHA-256 of the exact input UTF-8
text; `document.sha256` binds the map to the exact generated Markdown bytes.
`pages` records original page numbers, page sizes and image references. Coordinates
are never rescaled or inverted: each `provenance` entry preserves `page_no`,
`bbox` including `coord_origin`, and `charspan`. Missing provenance is an empty
array, never an invented position. An omitted coordinate origin is made explicit
as Docling's `TOPLEFT` default. Every source item/group, including roots and
unreachable items, has one `items` entry with `self_ref`, label, layer, parent,
provenance, status, targets and conversion `notes`.

| Status | Meaning |
| --- | --- |
| `converted` | Has at least one target in the reopened native document. Notes disclose any representation change. |
| `decoration` | Furniture layer, page header or footer. No document target. |
| `unsupported` | No document target; `reason` explains the unsupported, empty or unreachable source. |

Targets are snapshot-relative public Core block `path` plus `block` kind and
`role`. A list item uses the parent list block path and an `item` index path into
the public recursive `ListContent`; an endnote target uses its final definition
path and label. A group may target multiple blocks; several elements may target
one block (for example Figure and captions). `notes` always exists, leaving room
for conversion observations such as two groups contributing to one target.
The module's map check verifies format, document hash and targets before a
consumer uses the correspondence. It rejects a stale map even if old paths still
exist. It establishes correspondence integrity, not fidelity to PDF pixels.

## Representation policy

The source reading order follows root/group `children`, with associated captions
owned by their Figure/Table. Furniture is classified from both label and layer,
including furniture stored under the body root. Unknown or unreachable content
is reported. Paragraph boundaries, original numbering and cross-reference text
are retained; no semantic cross-reference or cross-page join is guessed.
Text whitespace is normalized to one line with a per-item note when it changes.

Headings require H1-H6. Text formatting uses Core inline content; unsupported
formatting is reported. Plain formulas use Core Equation operations.

Tables use one native `{table}` directive with a rectangular GFM table. Merged
cells repeat their text in every covered grid position. Consecutive leading
column-header rows become one header: each column joins its nonempty labels
from top to bottom with ` / `, suppressing consecutive identical labels. All
text in a partial header row is retained in that header. Nonleading column
headers remain at their source row positions as ordinary body cells; they are
not moved across intervening body content. Row headers and row sections become
ordinary cells, including text repetition for merged sections. Per-table map
`notes` disclose merged source-cell and covered-position counts, combined header
row counts, and any header/section role changes. This preserves cell text while
explicitly giving up native merged-cell and hierarchical-header semantics;
Core's table model is unchanged.

Rectangular tables retain genuine empty cells and uncovered grid positions;
a table without leading column headers gets an explicitly noted empty native
header. Fillable form cells remain `unsupported` because a text-only table cannot
preserve their input semantics. Empty tables, tables exceeding the 100,000-cell
limit, invalid/out-of-bounds coordinates, inconsistent spans and overlapping
source cells also remain unsupported with a reason; conversion cannot assign
their contents to a valid, unambiguous grid.

Pictures use their source image and caption, with child text represented by the
image and noted in the map. Missing images are unsupported. List markers that
the Core list model cannot express are retained as literal prose with notes.

Docling does not encode an inline footnote call site. A numeric token alone is
insufficient evidence: standalone footnotes retain their full original text as
paragraphs, with a note explaining that no endnote link was inferred. Explicit
owner `footnotes` relationships attach endnote calls to that owner's supported
inline surface, with notes explaining the insertion point. Original footnote
display numbers are not a new Core feature in this issue. Conversion never
silently treats an unrelated occurrence of the same number as an endnote call.

Read-only comparison is defined by [Docling comparison](docling-compare-v1.md).
Confirmation state, correction records and post-edit relinking remain outside
this contract. Public fixture provenance, licenses and reproduction
commands are in the [fixture README](../../packages/docling/test/fixtures/README.md).

## App verification on 2026-10-30

Fake HTTP service tests cover connection success/unreachable/not-ready/version
mismatch, Host configuration persistence, Root denial, one active task,
no-overwrite naming, completion, explicit/redacted failures and cancellation with
no server cancel request. The Desktop protocol test covers the new routes.
The `docling-server` persistent-browser scenario exercises Settings, PDF context
menu and Command Center picker, stopped waiting, failure notification/reveal and
automatic comparison. It passes against Vite and the built production HTTP Host.
The same run verifies address/check-button alignment, delayed A→B→A settings,
initial GET failure and loss of an accepted POST response with GET-only recovery,
and a delayed comparison response returning after a newer task fails. Other browser regressions
are left to required CI as requested by the owner.

The real pinned CUDA server required a disposable-container CodeFormulaV2
download before conversion could succeed. NIST's committed 11-page PDF then
completed through the app in 46,570ms (warm server, one observation), with 19
images and both bundle-integrity checks true; the comparison tab opened
automatically. Task ID: `851907ac-82e9-4924-be68-db5f868cc357`. The fetched OpenAPI
matched the profile reference. This is execution/integrity proof, not OCR QA or
CPU/large-document capacity evidence.

Manual review captures live in [assets/docling-server-797](assets/docling-server-797/):
[Settings 1440 Light](assets/docling-server-797/settings-success-en-1440.png),
[failed check 640 Korean](assets/docling-server-797/settings-failure-ko-640.png),
[Settings 640 Dark](assets/docling-server-797/settings-dark-ko-640.png),
[PDF menu](assets/docling-server-797/pdf-menu-en-1440.png),
[progress 640 Korean](assets/docling-server-797/progress-ko-640.png),
[real NIST comparison Light](assets/docling-server-797/real-completed-en-1440.png),
[real NIST comparison Dark](assets/docling-server-797/real-completed-dark-ko-1440.png).
Settings and progress were checked for alignment, readable wrapping, clipping,
occlusion and translation against the existing Appearance/recovery/FolderDialog
patterns. The comparison's existing 640px usability exception remains; its
640px capture is observation, not a new support guarantee.
