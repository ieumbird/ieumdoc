# Section references v1

- Status: Implemented
- Reference keyword verification: 2026-10-26 (#458 / #459: Editor unit regressions for kind-specific keywords, generic reference searches, empty queries and unrelated queries).
- Deletion feedback verification: 2026-10-24 (#375; Core/Editor tests, cross-reference including caption-only references and both UI languages, section-reference and table-authoring browser scenarios; [same-state captures](#deletion-feedback-evidence-375)).
- Editor label rename verification: 2026-10-24 (#374; Core plan/Editor collection, replay and atomic Undo/Redo regressions; browser label-authoring, cross-reference, table-authoring, section-reference and property-drafts).
- Nested authoring verification: 2026-10-24 (#377: Editor slash tests and `citation-authoring` insertion/Save → Reload on all supported inline locations, including endnote definitions).
- Label collision verification: 2026-10-15 (#302 Core/CLI tests, Editor save replay/error propagation tests and source CLI before/after).
- Literal syntax verification: 2026-10-15 (#304: discriminated source-only entries, shared location ordering and CLI output; Core/CLI tests and source CLI).
- Label rename verification: 2026-10-15 (#216 Core/CLI tests, canonical round-trip/refusal checks and source CLI before/after run with all four target kinds; Editor entry is deferred).
- MyST lookup parity verification: 2026-10-15 (#308; real link/role transforms with and without targets, Core/CLI regressions and source CLI before/after).
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

- Deleting a labeled target that leaves a previously resolved role reference or fragment link
  unresolved shows the existing five-second informational notice: “Deleting this target broke a
  reference. Press Ctrl+Z to undo.” Apple platforms show `⌘Z`, following the existing TopBar
  shortcut convention; both languages interpolate the shortcut. The document changes immediately
  in its normal engine transaction. References broken by successive deletions are tracked together:
  partial Undo retains the notice while an earlier deletion still leaves a broken reference, and
  complete restoration clears it (the ordinary five-second expiry still applies). Unreferenced
  target deletion keeps its existing flow. Non-empty label renames update references atomically
  as described below and do not show a deletion notice. This is deletion feedback, not the
  general deletion-confirmation policy (#379). Core's shared role/fragment lookup is used by its unresolved diagnostics
  and the live projection; the Editor does not parse source or introduce a new semantic operation.
- An unresolved chip reads `Unresolved reference: label` (`깨진 참조: label` in Korean), with
  its existing dashed treatment and a tooltip explaining that no labeled target exists.
  It never guesses Figure/Table/Equation from a missing target's role. Resolved numbered references use the [document reference templates](heading-numbering-v1.md#reference-templates-445); section displays retain their existing behavior.
- Remaining references in table captions and ordinary fragment links participate in deletion
  feedback too. Removing a reference together with its target shows no reference-loss notice.
  The feedback and text change add no persistent operation, so no new CLI command is needed.

- Applying a change from one non-empty label to another automatically retargets references that resolved to that target in the current document. Equation, Figure, Table and section-label properties share this behavior; it needs no extra toggle. Core `planLabelRename` accepts current target context and role/link attributes and delegates to the existing opt-in `updateLabel` operation. MyST target enumeration, role/fragment lookup, collision checks and canonical reference refusal stay in Core. Editor only projects the live target context and applies the returned attribute changes to reference nodes, link marks and table captions in the same transaction as the properties. One Undo/Redo restores/reapplies the label, properties and references together.
- Conflicting or unpreservable renames retain the property form with Core's error and leave applied content unchanged. Adding a label and clearing Equation/Figure/Table labels retain their existing behavior and do not retarget references; a section target still cannot be emptied. References in other documents and links to other files remain outside this operation.
- A target's `§ label` metadata (source syntax: `(label)=`) is hidden at rest and appears with its heading on hover, focus or selection ([Visual Language v2](editor-visual-language-v1.md)). Clicking it opens Edit, which reports rule or duplicate errors before Save. Deleting the target removes the label.
- The slash menu lists labeled sections and unlabeled headings on all supported inline surfaces, including nested list items and endnote definitions; the [location matrix](editor-ux-shell-v1.md#nested-inline-slash-menu-377) records the existing Core save paths. Picking an unlabeled heading inserts a `sec-<slug>` target and the reference in one transaction, so one Undo step removes both. The slug uses the heading's ASCII letters and digits; otherwise the label is a numbered `sec-n`.
- Reference search (#281) keeps case-insensitive prefix matching for `reference`/`ref`, kind names and labels. Figure/Table captions also match prefixes of the full caption or words separated by whitespace or Unicode punctuation, including Korean (`Port-summary` → `summary`, `PFC/CLLC interface` → `CLLC`, `전압(측정) 결과` → `측정`); full applied captions are searched even when the menu summarizes them. A slash query ends at whitespace, as for other slash commands, except after a display prefix (from the document templates) followed by its number, so `/Figure 2` works but a multi-word caption prefix such as `/Control summary` does not; search by one caption word instead. Sections retain heading-text/word search and unlabeled-heading creation.
- Caption extraction/projection belongs only to slash-menu search/display. Reference resolution and chip selectors read numbers, labels and section titles, without captions; caption-only edits that leave those values unchanged do not change a chip's selector result.
- Generic `ref` / `reference` / `참조` prefix searches include all reference target kinds (Figure, Table, Equation and section), including unlabeled headings. Kind keywords are specific: `figure` / `그림` for Figures, `table` / `표` for Tables; `equation` / `수식` and `section` / `절` / `제목` retain their behavior. Labels, captions and heading words remain independently searchable. An empty query still lists only labeled targets; unrelated queries add no reference choices. Command center's `Insert cross-reference…` opens the existing target form rather than using slash search.
- Numbered targets also match the existing computed number, the reference display prefix (from the document templates) and prefix plus number (`Figure 2`, `(3)`, `Table 1`, or `그림 2` / `식 (3)` with Korean templates). Slash accepts typed normal spaces even when MyST defaults display no-break spaces, and follows Core-rendered templates with repeated placeholders (for example `/Illustration 1 of 1`); ordinary slash commands still end at whitespace. Numbers come from the existing Core-backed numbering path and are display only.
- Figure/Table menu names show the reference display number, then a plain caption summary (whitespace collapsed, at most 80 Unicode characters plus an ellipsis). Only a missing caption falls back to the label. Equations show their template-based text followed by ` · label` (default `(number) · label`), without LaTeX. Section menu names remain `Section reference: heading text`. These names never change the inserted role or label.
- Matching labeled targets keep document order, followed by matching unlabeled headings, in the shared References group. The existing scrollable slash menu and keyboard navigation handle all results; there is no separate ranking or result cap.
- This search/display change is Editor interaction only: it adds no persistent document operation or CLI command.
- A heading's block menu adds a label without a reference.
- A reference chip shows `§` and the heading text, as MyST renders `{ref}`, and goes to the heading.
- Save expresses labels with the existing insert, delete, order and label edits, and reference changes with final inline-content edits. Host replay does not opt into another reference rewrite: a reference edited manually after Apply must retain its final target. Non-section labels are cleared before their final assignment so successive accepted renames (including a temporary label used to exchange labels) can replay from the opening snapshot. A section target is renamed, never cleared first; exchanging its opening label with another block in one Save remains refused.
- Label property Apply and slash-menu insertion retain their existing draft/transaction behavior; document-wide collisions are reported by the existing Save error UI with Core's reason and correction. The `sec-<slug>` generator avoids explicit labels; a collision with another heading's implicit ID is refused on Save. Save replay inserts new targets at their following block (after creating new headings) so the same-heading exception also works in the Editor.

### Deletion feedback evidence (#375)

Rename/deletion integration (2026-10-24, #374/#375): non-empty label Apply rewrites the target
and its resolved references in one transaction and does not trigger deletion feedback. The
combined cross-reference scenario checks this for Equation and Figure caption references,
retains rename Undo/Redo and Save/Reload, then deletes the renamed Equation to check the new
label's unresolved display, deletion notice and Undo restoration. The existing Editor rename
test checks all four target kinds against `referencesBrokenByDeletion`. Existing missing
references retain the kind-neutral unresolved text above; renaming does not create new ones.

Review follow-up (2026-10-24): at `f5d3ee9`, deleting `eq-a`, waiting 650ms for a separate history
group, deleting `fig-a`, then Undo once restored the figure but incorrectly cleared the notice
while `eq-a` remained unresolved. This sequence now lives in the existing browser scenario,
including complete Undo. Tracked references accumulate by role/normalized label instead of
replacing the previous deletion's set. Target enumeration for restoration runs once after a
block type/label layout change, not on ordinary text input; the existing cheap deletion precheck
and early return remain. The browser also checks the existing Apple shortcut convention with
`navigator.platform` emulation in both languages; this is not a native macOS execution.

The extended cross-reference browser scenario failed on the original product code at `a61dff5`:
Equation/Figure/Table deletions showed no notice and retained kind-prefixed broken text, while Undo
already restored each target. The unit regression likewise expected `Unresolved reference: gone`
but received `Eq. gone`. The same assertions pass after this change, including Korean feedback,
caption-only references, the table's Delete button, keyboard Delete/Backspace, no notice for an
unreferenced target or a relabel, and Undo restoration/notice removal. Existing Source/Save/Reload
checks remain in that scenario. Fragment-only feedback and removing link and target together are
covered by the Editor transaction projection test.

The existing MessageArea notice was chosen because it already communicates applied changes
without moving focus or adding a confirmation step; it expires after five seconds and keeps the
normal single engine Undo step. A modal would introduce deletion policy reserved for #379.
Existing reference typography and dashed unresolved treatment are retained; there are no new
controls, layout dimensions or styling tokens.

At 1280×720, Windows Chrome, 100% zoom, bundled fonts, document scroll top and the same deleted
table/engine selection state: [Before](assets/broken-reference-375/before-1280.png),
[After](assets/broken-reference-375/after-1280.png). Both were captured by
`pnpm browser:test cross-reference --screenshots` in this worktree with its fixed persistent
profile. The Before run used the original product files; After used the final implementation.

## Scope

- Core's default `updateLabel` and CLI without `--update-references` leave references untouched. The explicit opt-in below updates only references that resolved to the selected target before the change; Editor properties always use that opt-in for non-empty renames as described above.
- Ordinary `[text](#label)` links stay links; Core does not promote them to references. Empty-text links such as `[](#label)` reject native admission.
- `check` diagnoses references as MyST resolves them on one page. A link whose URL starts with `#` (`[](#label)` or `[text](#label)`) is a reference: one that names no target is reported like an unresolved role reference (`link` instead of `role` in JSON), stays as written and does not fail the check. Targets are labeled blocks, `(label)=` targets and the implicit IDs MyST gives unlabeled headings (`## Install` → `#install`); a heading with a label has no implicit ID. Links without `#`, including external URLs with a fragment, are never reported.
- MyST's target lookup reads a plain object. The shared Core lookup distinguishes registered targets, missing targets and inherited-property failures. Fragment lookup tries the as-written name before its normalized identifier; an inherited value stops fallback because MyST throws before reaching the normalized target. Role lookup uses only the normalized identifier. `unresolvedReferences`/CLI `check` report these failures with an optional `reason` string on the existing role/link entry; text output shows that reason. They remain warning-only (`check` exit 0), preserve the reference as written, and are never reported as resolved.
- Real MyST transforms (`basicTransformations` → `enumerateTargetsTransform` → link/role resolution) throw on `#toString`, `#valueOf` and other as-written Object.prototype names even when the corresponding normalized target exists. Roles naming `toString`/`valueOf` resolve when `tostring`/`valueof` exists and otherwise warn as unresolved. Names whose normalized identifier is inherited (`constructor`, `__proto__`) throw for both links and roles; MyST skips their target registration as a duplicate. All label-setting paths reject such normalized identifiers through the same lookup rule. Labels such as `toString` remain valid for roles and safely spelled fragments such as `#tostring`/`#TOSTRING`.
- A pre-existing user-written `#toString` link already fails MyST without a target. Default label edits and insertions do not rewrite or newly create that link failure; they retain the reference and its diagnostic. General link authoring and legacy links without `#` are outside this fix; no global write gate or dependency patch is introduced.
- The same Core report and CLI `references.unresolved` array include source-only warnings for unescaped `[^label]` text without a definition (`footnote: true` instead of `role`/`link`). The array also carries `syntax: "reference-link" | "reference-image" | "inline-code"` source-only entries for missing explicit link/image definitions and unmatched code openers. The [literal syntax diagnosis contract](footnotes-v1.md#literal-syntax-diagnostics-290-304) defines escape handling, non-text exclusions and canonical-write behavior. Reports use top-level paths and container start lines, ordered by block and line; ties keep role/link diagnostics before source-text diagnostics. These warnings do not block writes or change warning-only exit status.
- References to targets before blocks other than headings, numbered section references (`{numref}` to a section), display text, and links to other documents are not authored.

## CLI

`ieumdoc insert-target <file> --at <index> --label <label>` inserts a target. `update-label` renames a target. `inspect` shows `target label="…"`. References use `--content` with `{"kind":"reference","role":"ref","label":"…"}`.

## Opt-in label rename with references (#216)

`updateLabel(document, path, label, { updateReferences: true })` renames an already labeled top-level Equation, Figure, Table or `(label)=` immediately before a heading. It updates `{eq}`, `{numref}`, `{ref}` and same-document `#fragment` links that resolved to that target in the original snapshot. Core reuses the MyST target enumeration and reference lookup used by `unresolvedReferences`; it does not search/replace source text. Role kinds, custom role display text (where internally supported), link text/formatting/title, code, unrelated text and external/other-document links retain their meaning. Native admission still excludes custom role display text and empty-text links; this operation does not broaden file support.

The operation refuses invalid/unreferenceable labels, new-label conflicts (including implicit heading IDs), ambiguous old targets, unsupported reference notation, inherited-property lookup failures in any original or resulting role/fragment reference, and any change in the resolution of an unrelated or previously unresolved reference. It never silently repairs unsupported notation or preserves such a failing role/fragment reference in an opt-in rename, even when unrelated to the selected target. Failures return a specific reason without mutating the input snapshot; CLI writes no bytes. Canonical serialization and parse → serialize → parse stability remain mandatory.

Fragment lookup does not percent-decode URLs: `#Old%20Label` does not resolve to `Old Label` and stays untouched. If rewriting a resolved fragment would encode/change the new label on reload (for example a label containing spaces), canonical verification refuses the entire rename rather than leaving a broken reference.

Only existing explicit labels can be renamed in this mode: adding/removing a label is refused. A heading with an explicit `(label)=` already has no implicit ID, so renaming that label does not remove an additional implicit target. Adding a heading label suppresses its implicit ID under MyST's existing rule. Default and opt-in edits share the collision rule above: conflicts are checked using the original snapshot, with only the selected target exempted.

CLI uses `update-label <file> --path <index> --label <label> --update-references true`; omission or `false` keeps the default. The value follows the existing `--enabled <true|false>` convention, allowing the same option in `apply-batch`: `{"command":"update-label","path":1,"label":"eq-new","update-references":true}`. Keeping this on `update-label` shares its selection, validation, revision, dry-run and atomic commit paths. No separate command or CLI resolver is introduced.

Verification covers semantic resolution/preservation/refusal and canonical stability in Core; CLI covers strict option parsing, unchanged file bytes on refusal and transactional batch integration. The Editor integration described above adds collection/replay, Undo/Redo, on-screen reference display and real Save/Reload coverage (#374). The Core default and CLI option remain unchanged. The planning API is an interface adapter for this existing semantic operation, so it adds no CLI command.
