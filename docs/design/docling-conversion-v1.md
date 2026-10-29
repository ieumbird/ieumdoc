# Docling conversion v1

- Status: Implemented
- Last verified: 2026-10-30 (module/CLI tests, public and synthetic fixtures, canonical reopen, local IEEE conversion and NIST PDF REST conversion).
- Scope: `@ieumdoc/docling` and thin CLI, under [ADR-0011](../adr/0011-code-module-boundary.md).
- Decisions: [#766](https://github.com/ieumbird/ieumdoc/discussions/766), [#767](https://github.com/ieumbird/ieumdoc/discussions/767); implementation [#768](https://github.com/ieumbird/ieumdoc/issues/768), [#780](https://github.com/ieumbird/ieumdoc/issues/780).

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

`--server` takes precedence over `IEUMDOC_DOCLING_SERVER`. The URL can include a
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
[`ieumdoc-pdf-en-v1`](../../packages/docling/profiles/ieumdoc-pdf-en-v1.json).
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

`conversion-record.json` has `format: ieumdoc-docling-conversion`, `version: 1`
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

The #768 saved fixtures retain their historical resized, hash-named images and
manifests. Applying readable names when regenerating those fixtures is follow-up
work; this change does not rewrite their recorded source evidence.

## Correspondence sidecar

Format `ieumdoc-docling-map`, `version: 1` is owned by the module. `source`
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
formatting is reported. Plain formulas use Core Equation operations. Tables with
merged cells, multiple/row/section headers or unsupported cell semantics are
reported instead of flattening their meaning. Rectangular tables retain genuine
empty cells; a headerless table gets an explicitly noted empty native header.
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

Confirmation state, correction records, comparison UI and post-edit relinking
are outside this contract. Public fixture provenance, licenses and reproduction
commands are in the [fixture README](../../packages/docling/test/fixtures/README.md).
