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
service package versions and submitted options are in its `manifest.json`.

Downloaded full-PDF SHA-256:
`c1e6193af8f94b3f4fc48725a2e3c6eea497d9999cb968ecec2cb6be5d429c86`.

Saved dataset sizes (PDF, JSON/manifests and PNGs; helper scripts/README excluded):

| Dataset | Pages | PNGs | Bytes |
| --- | ---: | ---: | ---: |
| NIST SP 1108r4 | 11 | 19 (11 pages and 8 pictures) | 9,833,096 |
| Synthetic supplement | 1 | 1 page | 142,147 |
| Total | 12 | 20 | 9,975,243 (9.51 MiB) |

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
two header rows, and the converter reports that table as unsupported. It flattens
the visually nested clauses into one mixed-marker group and omits the displayed
equation number. These extraction limitations remain visible in the PDF/JSON pair.

## Reproduction

For new source bundles, the Node-only `ieumdoc docling convert-pdf` command uses
the fixed `ieumdoc-pdf-en-v1` profile and readable image names without resizing.
See the [service/bundle contract](../../../../docs/design/docling-conversion-v1.md#external-pdf-service-and-source-bundle).
The saved #768 fixtures below keep their original hashes, normalization and
manifests; adopting readable names on fixture regeneration is follow-up work.

Requires Python via `uv`, Docker Desktop with the local NVIDIA GPU and the
existing `C:\Projects\docling-local\compose.yaml` pinned to
`ghcr.io/docling-project/docling-serve-cu128:v1.32.0`. No files in that project
are changed. Commands below run from the IeumDoc checkout in PowerShell:

```powershell
New-Item -ItemType Directory -Force tmp/768 | Out-Null
Invoke-WebRequest https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.1108r4.pdf -OutFile tmp/768/nist-full.pdf
uv run --with pypdf==6.21.4 --with reportlab==5.1.0 python packages/docling/test/fixtures/generate.py tmp/768/nist-full.pdf
docker compose -f C:/Projects/docling-local/compose.yaml up -d
# Wait until GET http://127.0.0.1:8001/ready succeeds.
# The official image lacks CodeFormulaV2. Download only into this disposable container:
docker compose -f C:/Projects/docling-local/compose.yaml exec -T docling docling-tools models download-hf-repo docling-project/CodeFormulaV2 --quiet
try {
  uv run --with httpx==0.28.1 --with pillow==12.0.0 python packages/docling/test/fixtures/convert.py
} finally {
  docker compose -f C:/Projects/docling-local/compose.yaml down
}
docker compose -f C:/Projects/docling-local/compose.yaml ps --all
```

The HTTP endpoint is `/v1/convert/file/async`; results are obtained from the
returned task ID. Options match the private conversion manifest except that
only JSON export is requested (Markdown/HTML exports are unnecessary fixtures).
The exact running versions are captured in both manifests: docling-serve 1.32.0,
Docling 2.124.0, docling-core 2.93.0 (document schema 1.10.0).
Code/formula enrichment and picture classification are on; chart extraction is
off as in the private baseline. No browser prints a PDF.

The original embedded raster images are externalized as PNG with a maximum
dimension of 1000 px to keep the fixture manageable. Only image URI, raster size
and effective DPI change; document text, group structure and original PDF-point
provenance are untouched. PNG hashes name the images. Page coordinates and their
`BOTTOMLEFT`/`TOPLEFT` origins therefore stay directly comparable after scaling.
The generator uses pypdf 6.21.4 and ReportLab 5.1.0; image normalization uses
Pillow 12.0.0. The conversion helper accepts `synthetic` to regenerate just that
supplement.

## Verification boundary

`pnpm --filter @ieumdoc/docling test` verifies mapping coverage, genuine target
blocks/items/endnotes, separate decoration/unsupported states, source graph
refusal, stale-map detection and Core canonical reopening. It does not certify
visual or semantic fidelity to the source PDF. CLI tests cover delegation and
file-boundary refusal; native semantics are not reimplemented in the CLI.
