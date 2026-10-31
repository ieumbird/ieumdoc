# Docling conversion fixtures

Automated tests read these saved files only. They do not require Docker, OCR,
network access or a Python environment. The source PDFs, service JSON and page
images are evidence for reviewing conversion limits, not corrected OCR truth.

## Structural inventory from the private IEEE input

The local IEEE 1547 Docling output was inspected read-only on 2026-10-30 to
identify these structure kinds. No IEEE text, PDF, images or Docling JSON is
included in this repository:

- Multi-level numbered clause headings and appendix headings.
- Ordered, alphabetical and nested clause markers; separate list groups.
- Rectangular tables, merged cells, multiple column headers, row headers and
  row sections; table captions and table-owned notes.
- Text with provenance spanning multiple pages; reading order across page
  boundaries and independent page-level extraction fragments.
- Footnotes with continuing source numbers and ambiguous inline call sites.
- Display formulas and equation numbers, figure captions and text inside images.
- NOTE paragraphs, literal cross-reference text, page headers/footers and
  furniture-layer items stored under the body root.
- Document-index tables, key/value and form groups, empty groups and source
  heading levels that require inspection rather than inferred hierarchy.

## Public document and rights

`nist-sp1108r4/source.pdf` contains PDF pages **28-38**, printed pages **12-22**,
of *NIST Framework and Roadmap for Smart Grid Interoperability Standards,
Release 4.0* (February 2021), by Avi Gopstein, Cuong Nguyen, Cheyney O'Fallon,
Nelson Hastings and David A. Wollman. The report's author affiliation page names
NIST Engineering Laboratory and Information Technology Laboratory.

- [NIST publication record](https://www.nist.gov/publications/nist-framework-and-roadmap-smart-grid-interoperability-standards-release-40)
- DOI: <https://doi.org/10.6028/NIST.SP.1108r4>
- [Original PDF](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.1108r4.pdf)
- [NIST Technical Series copyright, use and licensing](https://www.nist.gov/nist-research-library/nist-publications#copyright-use-and-licensing)
- [NIST Library reprint guidance](https://www.nist.gov/nist-research-library/library-faqs)

NIST's policy puts employee-authored works outside US copyright protection and
grants worldwide reproduction and derivative-work rights where it can assert
foreign rights. Third-party material can have separate rights. The selected
pages cover NIST's own conceptual model and communication-pathway diagrams;
inspection of those pages found no third-party copyright or reprint credit.
This permits bundling the excerpt and its extracted JSON/images alongside the
MIT repository. These NIST materials retain their NIST rights basis; they are
**not relicensed as MIT**.

Gopstein et al. (2021), NIST SP 1108r4, doi:10.6028/NIST.SP.1108r4.
Republished courtesy of the National Institute of Standards and Technology.
Reprinted courtesy of the National Institute of Standards and Technology,
U.S. Department of Commerce. Not copyrightable in the United States.

The segment was selected for power-system relevance and concentrated numbered
headings, domain/application tables, bullet lists, continuing footnotes,
cross-page prose, captions, diagrams with internal text and repeated furniture.
The complete downloaded PDF is not stored; `generate.py` extracts the unchanged
page contents. Full-PDF SHA-256 is recorded below; each excerpt's hash, exact
service package versions and submitted profile are in its `conversion-record.json`.

Downloaded full-PDF SHA-256:
`c1e6193af8f94b3f4fc48725a2e3c6eea497d9999cb968ecec2cb6be5d429c86`.

Saved dataset sizes (PDF, source JSON, conversion record, native Markdown/map
and PNGs; helper script/README excluded):

| Dataset | Pages | PNGs | Bytes |
| --- | ---: | ---: | ---: |
| NIST SP 1108r4 | 11 | 19 (11 pages and 8 pictures) | 14,810,200 |
| Synthetic supplement | 1 | 1 page | 272,528 |
| Total | 12 | 20 | 15,082,728 (14.38 MiB) |

The #784 regeneration replaces the #768 resized, hash-named images and manifests
with complete CLI bundles. Dataset growth over the previous Git snapshot
(9,975,131 bytes) is 5,107,597 bytes (4.87 MiB), primarily
from preserving the original embedded raster bytes instead of reducing images
to 1000 px. The source PDFs are unchanged. No raw embedded HTTP response or
duplicate image asset directory is retained.

## Synthetic supplement and limitations

`synthetic/source.pdf` and `generate.py` are original test material under the
repository MIT license. One page supplements structures absent from the selected
public segment: a merged multi-level table header, table NOTE, display expression
with a source number, nested alphabetical/decimal clauses and an Annex heading.

The captured JSON remains Docling's output. It may lose distinctions visible in
the PDF (for example a formula number or nested-list hierarchy). No semantic JSON
edits are made to manufacture coverage. Focused API tests additionally create
small schema-valid cases for explicit footnote ownership, nested list targets,
merged tables, unsupported formatting and malformed references. Those tests
exercise converter behavior, without claiming that OCR recovered each structure.
In the saved supplement, Docling does retain a three-column merged header and
two header rows. The converter repeats the merged text across all three columns,
joins each column's two header labels, and records both changes in the table's
map notes. Focused API cases also cover merged body cells across both axes,
repeated header labels, row headers/sections, empty cells and invalid spans.
Docling flattens the visually nested clauses into one mixed-marker group and omits the displayed
equation number. These extraction limitations remain visible in the PDF/JSON pair.

## Reproduction

The saved bundles are generated by the Node-only `ieumdoc docling convert-pdf`
command using the fixed `litzio-pdf-en-v1` profile and readable image names
without resizing or re-encoding.
See the [service/bundle contract](../../../../docs/design/docling-conversion-v1.md#external-pdf-service-and-source-bundle).
Each dataset contains the unchanged `source.pdf` alongside the CLI output:
`document.json`, `conversion-record.json`, `document.md`,
`document.docling-map.json`, `pages/page-NNN.png` (one-based page number) and,
for NIST, `pictures/picture-NNN.png` (zero-based picture array index).

Normal regeneration uses the committed PDFs and needs Node/pnpm and the external
Docling service, **not Python on the host**. Commands run from the IeumDoc checkout
in PowerShell. The local GPU setup uses the existing
`C:\Projects\docling-local\compose.yaml` with
`ghcr.io/docling-project/docling-serve-cu128:v1.32.0`; do not edit that project.
See the [server guide](../../../../docs/guides/docling-server.md) for model and
deployment details. First inspect `docker ps`. If Docker Desktop is off, start it
and remember to stop it afterward. Reuse an already running service; only stop a
container started for this regeneration.

```powershell
docker ps
$startedHere = -not (docker compose -f C:/Projects/docling-local/compose.yaml ps --status running -q docling)
try {
  if ($startedHere) {
    docker compose -f C:/Projects/docling-local/compose.yaml up -d
    if ($LASTEXITCODE) { throw 'Docling startup failed' }
    # The official image lacks CodeFormulaV2; prepare this disposable container.
    docker compose -f C:/Projects/docling-local/compose.yaml exec -T docling docling-tools models download-hf-repo docling-project/CodeFormulaV2 --quiet
    if ($LASTEXITCODE) { throw 'Model preparation failed' }
  }
  # Wait for /ready to return 200 before submitting either PDF.
  Invoke-RestMethod http://127.0.0.1:8001/ready
  New-Item -ItemType Directory -Force tmp/784 | Out-Null
  pnpm ieumdoc docling convert-pdf packages/docling/test/fixtures/nist-sp1108r4/source.pdf --server http://127.0.0.1:8001 --output tmp/784/nist-sp1108r4
  if ($LASTEXITCODE) { throw 'NIST conversion failed' }
  pnpm ieumdoc docling convert-pdf packages/docling/test/fixtures/synthetic/source.pdf --server http://127.0.0.1:8001 --output tmp/784/synthetic
  if ($LASTEXITCODE) { throw 'Synthetic conversion failed' }
} finally {
  if ($startedHere) { docker compose -f C:/Projects/docling-local/compose.yaml down }
}
docker compose -f C:/Projects/docling-local/compose.yaml ps --all
```

The output directories must not already exist; use a fresh staging directory for
another capture. If Docker Desktop was started for this task, run
`docker desktop stop` after checking no other session has started containers.
The service's `/ready` response does not verify all profile models.

Review staged bundle sizes and extraction differences before replacing the saved
data. Stop if repository growth is substantial; do not resize images or disable
profile options to conceal it. After review, replace only generated files,
preserving `source.pdf`:

```powershell
$fixtures = (Resolve-Path packages/docling/test/fixtures).Path
foreach ($name in @('nist-sp1108r4', 'synthetic')) {
  $target = (Resolve-Path (Join-Path $fixtures $name)).Path
  if (-not $target.StartsWith($fixtures + [IO.Path]::DirectorySeparatorChar)) { throw 'Unexpected fixture path' }
  Get-ChildItem -LiteralPath $target -Exclude source.pdf | Remove-Item -Recurse
  Get-ChildItem -LiteralPath (Join-Path 'tmp/784' $name) | Copy-Item -Destination $target -Recurse
}
pnpm --filter @litzio/docling test
pnpm --filter @litzio/cli test
pnpm browser:test docling-compare docling-server
git diff --check
```

The HTTP endpoint is `/v1/convert/file/async`; the CLI polls the returned task ID
and requires complete success. Both records capture the exact fixed profile,
source PDF hash, server/OpenAPI versions, task and response hashes, image paths
and byte hashes, and URI-only JSON integrity checks. The captured versions are
docling-serve 1.32.0, Docling 2.124.0 and docling-core 2.93.0 (schema 1.10.0).
Code/formula enrichment and picture classification are on; chart extraction is
off. These records are unedited CLI output, including machine-specific source
paths, task IDs and timestamps; regeneration need not reproduce those values.
Text, correspondence counts and conversion-limit notes match the previous
capture. The committed JSON/Markdown use LF so recorded hashes survive Windows
checkouts with `core.autocrlf` enabled.

To rebuild the input PDFs themselves, an optional, isolated Python invocation
uses pypdf 6.21.4 and ReportLab 5.1.0. This is test-source preparation, not an
IeumDoc runtime dependency. Verify the full PDF against the SHA-256 above first:

```powershell
Invoke-WebRequest https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.1108r4.pdf -OutFile tmp/784/nist-full.pdf
Get-FileHash tmp/784/nist-full.pdf -Algorithm SHA256
uv run --with pypdf==6.21.4 --with reportlab==5.1.0 python packages/docling/test/fixtures/generate.py tmp/784/nist-full.pdf
```

No browser prints a PDF, and no semantic JSON edits manufacture extraction
coverage. Original PDF-point provenance and coordinate origins remain intact;
page PNGs are now 1224 × 1584 at the profile's image scale of 2.

## Verification boundary

`pnpm --filter @litzio/docling test` verifies mapping coverage, genuine target
blocks/items/endnotes, separate decoration/unsupported states, source graph
refusal, stale-map detection and Core canonical reopening. It does not certify
visual or semantic fidelity to the source PDF. CLI tests cover delegation and
file-boundary refusal; native semantics are not reimplemented in the CLI.

## Internal identifier normalization (#858)

The native marker, map/conversion format and profile ID use `litzio`. The committed
Markdown and map document hashes were updated together. Original PDF, Docling JSON,
page/picture bytes, source hashes, server/task/timing records and conversion policy
are unchanged; this is not a new external-service conversion.
