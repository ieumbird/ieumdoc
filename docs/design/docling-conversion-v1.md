# Docling conversion v1

- Status: Implemented
- Last verified: 2026-10-30 (module/CLI tests, public and synthetic fixtures, canonical reopen and local IEEE conversion).
- Scope: `@ieumdoc/docling` and thin CLI, under [ADR-0011](../adr/0011-code-module-boundary.md).
- Decisions: [#766](https://github.com/ieumbird/ieumdoc/discussions/766), [#767](https://github.com/ieumbird/ieumdoc/discussions/767); implementation [#768](https://github.com/ieumbird/ieumdoc/issues/768).

## Input and output

`ieumdoc docling convert <document.json> --output <new-folder>` converts the
**whole** DoclingDocument 1.10.0. There is no chapter/range option. The destination
must not exist. It contains `document.md`, `document.docling-map.json` and copied
image assets. Input files remain unchanged. Automatic heading numbers are off;
original heading numbers remain literal heading text. PDF extraction and OCR
are external to IeumDoc; tests use checked-in data and never launch Docling.

Conversion uses only public Core creation, semantic operations and read models.
All output passes Core serialization and byte-stable parse/serialize reopening.
Failures to preserve an individual source structure are recorded in the map;
invalid source schema/graph or an invalid final native document refuses output.

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
