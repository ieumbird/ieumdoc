# Section references v1

- Status: Implemented
- Last verified: 2026-10-15 (#281 / PR #286: Editor unit tests cover caption-free chip selectors and punctuation-separated caption words; cross-reference/section-reference browser scenarios verify caption and display-number search, menu names, unchanged reference identity and Save/Reload. Previous `check` link-reference diagnostics verification: 2026-10-11, #151).
- Scope: In-document MyST heading labels and references, not cross-document identity; [ADR-0003](../adr/0003-document-addressing-identity-boundary.md).

Equations, Figures and Tables could be referenced; sections could not. A `{ref}` reference or a `(label)=` target kept its paragraph or block read-only, so authors had to write both by hand. Section references close that gap with MyST's own syntax.

## Representation

MyST labels a section with a `(label)=` target line directly before its heading and references it with `{ref}`label``. myst-parser 1.7.4 has no in-heading label syntax (`# Title {#id}` stays text). So a section label is its own top-level block, and Core projects it as `{ block: "target", label }`.

Core's section rule already counts targets before a heading as part of that section. Moving or deleting a section therefore carries its label. No persistent identity is introduced (ADR-0003): a label is document text, as for Equations, Figures and Tables.

## Core

- `insertTarget(document, index, label)` inserts a target.
- `updateLabel` renames one. A target cannot be emptied; remove it with `removeBlock`.
- Labels follow the existing rules: `labelError`, a MyST identifier, addressable by `{ref}`, and not taken by another target.
- MyST reads a target line only for 1-100 of `[a-zA-Z0-9|@<>*./_\-+:]`. Other labels, Korean included, would reload as a paragraph. `targetLabelError` restates that rule without the MyST dependency so the Editor can apply it before Save; a Core test pins it to the parser.
- `{ref}` without display text joins `{eq}` and `{numref}` as editable inline content. Display-text forms (`{ref}`Text <label>``) reject native admission.

## Editor

- A target's `§ label` metadata (source syntax: `(label)=`) is hidden at rest and appears with its heading on hover, focus or selection ([Visual Language v2](editor-visual-language-v1.md)). Clicking it opens Edit, which reports rule or duplicate errors before Save. Deleting the target removes the label.
- The slash menu lists labeled sections and unlabeled headings. Picking an unlabeled heading inserts a `sec-<slug>` target and the reference in one transaction, so one Undo step removes both. The slug uses the heading's ASCII letters and digits; otherwise the label is a numbered `sec-n`.
- Reference search (#281) keeps case-insensitive prefix matching for `reference`/`ref`, kind names and labels. Figure/Table captions also match prefixes of the full caption or words separated by whitespace or Unicode punctuation, including Korean (`Port-summary` → `summary`, `PFC/CLLC interface` → `CLLC`, `전압(측정) 결과` → `측정`); full applied captions are searched even when the menu summarizes them. A slash query ends at whitespace, as for other slash commands, except after a display prefix (`Fig.`, `Eq.`, `Table`) followed by its number, so `/Fig. 2` works but a multi-word caption prefix such as `/Control summary` does not; search by one caption word instead. Sections retain heading-text/word search and unlabeled-heading creation.
- Caption extraction/projection belongs only to slash-menu search/display. Reference resolution and chip selectors read numbers, labels and section titles, without captions; caption-only edits that leave those values unchanged do not change a chip's selector result.
- Numbered targets also match the existing computed number, the reference display prefix (`Fig.`, `Eq.`, `Table`) and prefix plus number (`Fig. 2`, `Eq. 3`, `Eq. (3)`, `Table 1`). Slash accepts the space while typing these numbered forms; ordinary slash commands still end at whitespace. Numbers come from the existing Core-backed numbering path and are display only.
- Figure/Table menu names show the reference display number, then a plain caption summary (whitespace collapsed, at most 80 Unicode characters plus an ellipsis). Only a missing caption falls back to the label. Equations show `Eq. (number) · label`, without LaTeX. Section menu names remain `Section reference: heading text`. These names never change the inserted role or label.
- Matching labeled targets keep document order, followed by matching unlabeled headings, in the shared References group. The existing scrollable slash menu and keyboard navigation handle all results; there is no separate ranking or result cap.
- This search/display change is Editor interaction only: it adds no persistent document operation or CLI command.
- A heading's block menu adds a label without a reference.
- A reference chip shows `§` and the heading text, as MyST renders `{ref}`, and goes to the heading.
- Save expresses labels with the existing insert, delete, order and label edits. A target is renamed, never cleared first, so one Save cannot swap a target's label with another block's.

## Scope

- Renaming a label does not rename its references, as for other labels.
- Ordinary `[text](#label)` links stay links; Core does not promote them to references. Empty-text links such as `[](#label)` reject native admission.
- `check` diagnoses references as MyST resolves them on one page. A link whose URL starts with `#` (`[](#label)` or `[text](#label)`) is a reference: one that names no target is reported like an unresolved role reference (`link` instead of `role` in JSON), stays as written and does not fail the check. Targets are labeled blocks, `(label)=` targets and the implicit IDs MyST gives unlabeled headings (`## Install` → `#install`); a heading with a label has no implicit ID. Links without `#`, including external URLs with a fragment, are never reported.
- The same Core report and CLI `references.unresolved` array include source-only warnings for unescaped `[^label]` text without a definition (`footnote: true` instead of `role`/`link`). The [footnote diagnosis contract](footnotes-v1.md#undefined-reference-diagnostics-290) defines escape handling, non-text exclusions and canonical-write behavior. Reports use top-level paths and container start lines, ordered by block and line; ties keep role/link diagnostics before source-text footnote diagnostics. These warnings do not block writes or change warning-only exit status.
- References to targets before blocks other than headings, numbered section references (`{numref}` to a section), display text, and links to other documents are not authored.

## CLI

`ieumdoc insert-target <file> --at <index> --label <label>` inserts a target. `update-label` renames a target. `inspect` shows `target label="…"`. References use `--content` with `{"kind":"reference","role":"ref","label":"…"}`.
