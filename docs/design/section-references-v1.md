# Section references v1

- Status: Implemented
- Label collision verification: 2026-10-15 (#302 Core/CLI tests, Editor save replay/error propagation tests and source CLI before/after).
- Label rename verification: 2026-10-15 (#216 Core/CLI tests, canonical round-trip/refusal checks and source CLI before/after run with all four target kinds; Editor entry is deferred).
- Registered-target guard verification: 2026-10-15 (PR #300 review; Core rename and unresolved-reference regressions for inherited-property names).
- Last verified: 2026-10-15 (#281 / PR #286: Editor unit tests cover caption-free chip selectors and punctuation-separated caption words; cross-reference/section-reference browser scenarios verify caption and display-number search, menu names, unchanged reference identity and Save/Reload. Previous `check` link-reference diagnostics verification: 2026-10-11, #151).
- Scope: In-document MyST heading labels and references, not cross-document identity; [ADR-0003](../adr/0003-document-addressing-identity-boundary.md).

Equations, Figures and Tables could be referenced; sections could not. A `{ref}` reference or a `(label)=` target kept its paragraph or block read-only, so authors had to write both by hand. Section references close that gap with MyST's own syntax.

## Representation

MyST labels a section with a `(label)=` target line directly before its heading and references it with `{ref}`label``. myst-parser 1.7.4 has no in-heading label syntax (`# Title {#id}` stays text). So a section label is its own top-level block, and Core projects it as `{ block: "target", label }`.

Core's section rule already counts targets before a heading as part of that section. Moving or deleting a section therefore carries its label. No persistent identity is introduced (ADR-0003): a label is document text, as for Equations, Figures and Tables.

## Core

- `insertTarget(document, index, label)` inserts a target.
- `updateLabel` renames one. A target cannot be emptied; remove it with `removeBlock`. Its optional `{ updateReferences: true }` performs the atomic rename described below; omitting it keeps references untouched.
- Labels follow the existing rules: `labelError`, a MyST identifier, addressable by `{ref}`, and not taken by another target. All label-setting paths (labeled Equation/Figure/Table insertion, default and opt-in `updateLabel`, and `insertTarget`) share MyST target enumeration for collision checks, including implicit heading IDs. A conflict returns `label "…" already names another target (including implicit heading IDs)` without changing the input snapshot.
- A target inserted immediately before a heading may use that same heading's implicit ID: `(install)=` before `## Install` keeps references resolving to that heading. The exemption uses the heading's snapshot location, not its title; another target with that identifier still causes refusal. Explicit labels, including unattached targets, remain reserved.
- MyST reads a target line only for 1-100 of `[a-zA-Z0-9|@<>*./_\-+:]`. Other labels, Korean included, would reload as a paragraph. `targetLabelError` restates that rule without the MyST dependency so the Editor can apply it before Save; a Core test pins it to the parser.
- `{ref}` without display text joins `{eq}` and `{numref}` as editable inline content. Display-text forms (`{ref}`Text <label>``) reject native admission.

## Editor

- The opt-in label rename entry point ("also update references" in label properties) is a follow-up to #216. This change provides Core and CLI only; existing Editor behavior is unchanged.
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
- Label property Apply and slash-menu insertion retain their existing draft/transaction behavior; document-wide collisions are reported by the existing Save error UI with Core's reason and correction. The `sec-<slug>` generator avoids explicit labels; a collision with another heading's implicit ID is refused on Save. Save replay inserts new targets at their following block (after creating new headings) so the same-heading exception also works in the Editor.

## Scope

- Renaming a label leaves references untouched by default. The explicit opt-in below updates only references that resolved to the selected target before the change.
- Ordinary `[text](#label)` links stay links; Core does not promote them to references. Empty-text links such as `[](#label)` reject native admission.
- `check` diagnoses references as MyST resolves them on one page. A link whose URL starts with `#` (`[](#label)` or `[text](#label)`) is a reference: one that names no target is reported like an unresolved role reference (`link` instead of `role` in JSON), stays as written and does not fail the check. Targets are labeled blocks, `(label)=` targets and the implicit IDs MyST gives unlabeled headings (`## Install` → `#install`); a heading with a label has no implicit ID. Links without `#`, including external URLs with a fragment, are never reported.
- Core deliberately guards MyST's inherited-property lookup: `ReferenceState.getTarget` reads a plain object, so names such as `constructor` and `__proto__` can return inherited values rather than targets. The shared lookup accepts only own entries actually registered by MyST. Those names are unresolved when not registered, are reported by `unresolvedReferences`/CLI `check`, and remain as written without blocking an unrelated opt-in rename. Fragment lookup still tries the raw name, then its normalized identifier; inherited values do not prevent that fallback.
- The same Core report and CLI `references.unresolved` array include source-only warnings for unescaped `[^label]` text without a definition (`footnote: true` instead of `role`/`link`). The [footnote diagnosis contract](footnotes-v1.md#undefined-reference-diagnostics-290) defines escape handling, non-text exclusions and canonical-write behavior. Reports use top-level paths and container start lines, ordered by block and line; ties keep role/link diagnostics before source-text footnote diagnostics. These warnings do not block writes or change warning-only exit status.
- References to targets before blocks other than headings, numbered section references (`{numref}` to a section), display text, and links to other documents are not authored.

## CLI

`ieumdoc insert-target <file> --at <index> --label <label>` inserts a target. `update-label` renames a target. `inspect` shows `target label="…"`. References use `--content` with `{"kind":"reference","role":"ref","label":"…"}`.

## Opt-in label rename with references (#216)

`updateLabel(document, path, label, { updateReferences: true })` renames an already labeled top-level Equation, Figure, Table or `(label)=` immediately before a heading. It updates `{eq}`, `{numref}`, `{ref}` and same-document `#fragment` links that resolved to that target in the original snapshot. Core reuses the MyST target enumeration and reference lookup used by `unresolvedReferences`; it does not search/replace source text. Role kinds, custom role display text (where internally supported), link text/formatting/title, code, unrelated text and external/other-document links retain their meaning. Native admission still excludes custom role display text and empty-text links; this operation does not broaden file support.

The operation refuses invalid/unreferenceable labels, new-label conflicts (including implicit heading IDs), ambiguous old targets, unsupported reference notation, and any change in the resolution of an unrelated or previously unresolved reference. It never silently repairs unsupported notation. Failures return a specific reason without mutating the input snapshot; CLI writes no bytes. Canonical serialization and parse → serialize → parse stability remain mandatory.

Fragment lookup does not percent-decode URLs: `#Old%20Label` does not resolve to `Old Label` and stays untouched. If rewriting a resolved fragment would encode/change the new label on reload (for example a label containing spaces), canonical verification refuses the entire rename rather than leaving a broken reference.

Only existing explicit labels can be renamed in this mode: adding/removing a label is refused. A heading with an explicit `(label)=` already has no implicit ID, so renaming that label does not remove an additional implicit target. Adding a heading label suppresses its implicit ID under MyST's existing rule. Default and opt-in edits share the collision rule above: conflicts are checked using the original snapshot, with only the selected target exempted.

CLI uses `update-label <file> --path <index> --label <label> --update-references true`; omission or `false` keeps the default. The value follows the existing `--enabled <true|false>` convention, allowing the same option in `apply-batch`: `{"command":"update-label","path":1,"label":"eq-new","update-references":true}`. Keeping this on `update-label` shares its selection, validation, revision, dry-run and atomic commit paths. No separate command or CLI resolver is introduced.

Verification covers semantic resolution/preservation/refusal and canonical stability in Core; CLI covers strict option parsing, unchanged file bytes on refusal and transactional batch integration. Editor entry, Undo/Redo and browser Save/Reload are deferred with the Editor follow-up.
