# Heading numbering v1

- Status: Implemented
- Fixed numbering: 2026-10-29 (#720 Core/CLI and Editor property entry, warning display and Save/Reload).
- Document settings verification: 2026-10-27 (#580: inline settings, per-tab expansion, notation previews and existing document operations; [integration, checks and captures](editor-ux-shell-v1.md#document-settings-placement-554)).
- Accent verification: 2026-10-27 (#559: generated heading/Outline numbers share the local accent; all presets checked by the token contrast and existing Outline browser tests).
- Body-heading authoring verification: 2026-10-26 (#472 Editor unit/browser checks; Core/CLI and numbering behavior unchanged). [Verification details](document-editing-v1.md).
- Last verified: 2026-10-26 (#511 generated-number color: Editor tests, typecheck/build, Outline/layout-rules/quiet-document/visual-states browser checks and 1440px manual comparison).
- Previous verification: 2026-10-26 (#462 caption-template Core/CLI/Editor tests and cross-reference browser Undo/Redo, Source and Save → Reload).
- Reference-template verification: 2026-10-25 (#445 Core/CLI/Editor tests and cross-reference browser Save → Reload).
- Previous verification: 2026-10-14 (#232 native metadata contract).
- Scope: Core-owned settings and Editor/CLI projection; [Native document support](document-support-v1.md).

Core persists `numbering.headings: boolean` and `numbering.title: false` alongside the mandatory `ieumdoc: 1` marker. Omitted numbering means off. H1 is unnumbered (the leading one is [the document title](document-editing-v1.md#document-title-255), which stays first); H2–H6 use the default section counter policy. Heading text never contains generated numbers. Custom heading starts, prefixes and per-level settings are rejected at admission. Numbered reference templates follow the separate contract below.

The Editor offers only H2–H6 for body heading insertion/conversion and stops
Shift+Tab promotion at H2 (#472). This authoring choice leaves numbering, the
title flow, existing body H1 content and Core/CLI's valid H1 support unchanged;
see [document title and body authoring](document-editing-v1.md#document-title-255).

`updateHeadingNumbering(document, enabled)` updates only heading settings in native frontmatter with the existing YAML library, preserving reference templates and other admitted metadata. `HeadingNumbering` and `headingNumbers` expose the editor-neutral display rule. Editor headings and Outline call the same rule; one ProseMirror document attribute participates in Undo/Redo. Save applies the Core operation without changing snapshot paths. Metadata is hidden from the body, never inserted as an editor block.

In the inline Document settings block above the title (#580), Number headings belongs to Saved in this document. The block starts collapsed; the command center or Settings link expands and focuses it. It is disabled without a document, during pending work and in Source. Wide document is a separate TopBar toggle and device preference. Source is read-only. Supported top-level headings advance counters; unsupported nested structures never enter a native document.

CLI: `ieumdoc update-heading-numbering <file> --enabled true|false`. `inspect --format json` reports computed `headingNumber` values. Figure/equation numbering is independent.

Verification covers Core default-policy equivalence to MyST, native metadata writes, CLI edits, Editor path retention, Outline agreement, Undo/Redo and Save → Reload.

## Fixed numbers (#720)

Figures (image, Mermaid and pending), tables and display equations support automatic or fixed
numbering. Fixed numbers are authored non-empty single-line strings such as `17`, `A.3` or
`4-2`, stored only in the MyST directive's `:enumerator:` option. Mermaid uses the outer
`{figure}` option; the inner directive remains option-free. Code blocks and heading numbering
are outside this feature. `:enumerated: false` is unsupported. No document-mode frontmatter
or private number format is introduced.

`EditableBlock.enumerator` exposes the authored string. `blockTargets` / `targetNumbers`
return that string unchanged; automatic targets still return numeric counters. A fixed
target does not advance the automatic counter, matching MyST. Caption and reference display
substitute the exact string into the existing templates. Moving or editing content, caption
or label retains it. Labels remain target identity; duplicate numbers do not merge targets.
The complete semantic fingerprint includes enumerator, and canonical writing/reopening
preserves it. The Core writer adds the option to its existing table/Mermaid/pending writers
and the upstream image/math directive output; no dependency patch is needed.

`numberingReport(blocks)` infers `mode: "fixed"` if any numbered target has an enumerator,
otherwise `"automatic"`. It returns numbered `targets` and warning `diagnostics` with stable
codes, `severity: "warning"`, kind and snapshot path. In fixed mode, each missing enumerator
reports `numbering-missing`; every target sharing an exact string within its own kind reports
`numbering-duplicate`. Different kinds have separate namespaces. Missing targets retain
MyST's automatic fallback display until authored. These warnings identify a document that
mixes modes or duplicates numbers; they never prevent Save, format or CLI edits.

`updateEnumerator(document, [index], string)` sets or changes a fixed number; `""` clears it.
The operation returns a new snapshot and preserves the input. Core operations allow an empty
equation with a fixed number as an intermediate state. Operation checks validate a disposable
copy of that empty equation without its enumerator, keeping the actual result unchanged.
Final canonical write refuses the state with `fixed-number-unrepresentable` and guidance to
enter equation content or clear the fixed number. MyST 1.7.4 requires a non-empty `{math}`
body and `$$` cannot carry options; no dummy content or parser extension is used. An empty
equation without a fixed number is savable and merely warns in fixed mode.

CLI: `ieumdoc update-enumerator <file> --path <index> --enumerator "A.3"`; an empty value
clears it. Existing revision, dry-run and atomic file replacement rules apply. `inspect`
reports authored enumerators and computed numbers/display text; both `inspect` and `check`
include `numbering` with the complete Core report in JSON and mode/warnings in text.
`apply-batch` accepts the same command. Its existing contract serializes and reparses each
step, with one final file replacement; an unsavable intermediate step therefore refuses
the batch without writing. This PR preserves that contract rather than changing batch paths.
For an initially empty equation, fill its content before setting its number (reorder the batch operations): the reverse order has no MyST representation for the intermediate step.

Editor projects the authored attribute through its real schema, uses Core numbers for display,
and preserves it through existing Core save operations. New locators from typed Cut/Paste,
drop/copy or duplicate normalization carry the enumerator in `InsertEdit`; Host replay calls
Core `updateEnumerator` after insertion, including image/pending/Mermaid Figures, tables and
equations. Image/pending Figure, Mermaid Figure, table and equation property forms expose
**Number** after Label, with **Automatic** as the empty placeholder and a short explanation.
Input is a string draft, included in existing dirty/work-loss protection; only Apply changes
the engine attribute, in the same Undo step as the other properties. Cancel/Escape keeps the
applied value. Empty input clears the fixed number. Save collects snapshot-relative changes
and Host replay calls Core `updateEnumerator`; no numbering semantics are implemented in UI.

The Editor adapts the live applied blocks (including inserted ones) to Core `numberingReport`.
An existing warning Notice above the document body reports the warning count, and Number in
the affected block's properties explains Core's missing or duplicate diagnostic. Both say
that saving is allowed; neither gates Save. Unapplied number drafts do not alter the report.
Automatic documents show no warning Notice. Empty fixed equations can Apply, but the existing
located Save error explains that the author must enter equation content or clear the number,
in English and Korean. The original file and applied work are retained on refusal.

Verification covers Core exact-string round-trips, moves, content/label
edits, MyST enumeration/reference resolution, warnings and intermediate/final-write boundaries;
CLI covers revision/dry-run/batch and report output; Editor covers schema/save-replay setting, clearing and preservation.
The `reference-save-reload` browser regression opens a real fixed-number document, checks
caption/equation/reference display, edits prose, saves and reloads, then checks all four
enumerators on disk and in the reopened display. Browser navigation waits for the exact
active file and ready state, retaining immediate value assertions afterward. The same scenario
uses all four property forms for number-only drafts, Cancel, Apply, Undo/Redo and real Save →
Reload, saves missing/duplicate warnings, clears all numbers back to automatic, and verifies
Korean empty-fixed-equation refusal and recovery by clearing the number. These interface checks
do not repeat the Core numbering policy tests.

Manual image-property captures use master base `7ee58e9e`, the same scratch
`tmp/mermaid-authoring/diagram.md`, checkout-owned persistent Chrome, dedicated origin
`http://127.0.0.1:5720`, 1440×1000 / 640×1000, DPR 1, zoom 1, English UI and loaded fonts.
Only the Number field and its hint are added to this automatic document's form. Small review
pairs: [before 1440px](assets/fixed-numbering-720/before-1440.png) /
[after 1440px](assets/fixed-numbering-720/after-1440.png),
[before 640px](assets/fixed-numbering-720/before-640.png) /
[after 640px](assets/fixed-numbering-720/after-640.png). Full generated diagnostics remain
under ignored `tmp/`. The lazy Mermaid preview finishes between the narrow captures;
these review the form and viewport fit, not pixel equivalence. Captures are manual evidence,
separate from behavioral assertions. The [Korean warning at 640px](assets/fixed-numbering-720/warning-ko-640.png)
shows the same shared Notice in the document and the affected Mermaid properties.

## Generated number color (#511 / #503)

When Number headings is on, H2–H6 generated numbers and non-current Outline numbers
use `--id-color-document-heading-number`, an alias of the user's chosen interaction
accent (#559 supersedes #511's separate teal). Its values and derivatives live only
in the Adjustable values of `styles/tokens.css`. All six validated presets exceed
4.5:1 on white, panel and selected surfaces, including H4–H6 at 18px, 16px and 14px.
Heading text retains the normal text color. The current Outline row, including its
number, uses the chosen preset's selected text color; hover and focus retain their rules.
See [accent settings and contrast results](editor-visual-language-v1.md#single-accent-presets-559).

The heading's existing `::before` supplies the number; Outline wraps only the
Core-computed number in an inline span, retaining its full text/accessibility label.
No punctuation, number/title spacing, font size/weight, editor selection/copy behavior,
file content or section-reference display (`2절` / `Section 2`) changes. No gap styling
is introduced: both surfaces retain their existing single U+0020 space. This is an
IeumDoc display rule, like other Editor presentation rules: MyST renderers show the
numbers without this color. Core and CLI are unchanged; no semantic operation or CLI
command is needed.

### Original #511 verification (Historical)

The following records the former teal decision, before #559 unified accent colors.
The existing Outline browser flow checked computed number/title colors, current-row
selection, unchanged accessible names and a root-variable override reaching both
surfaces. The existing token test checks the default once; browser assertions resolve
the variable instead of repeating the hex value.

Before the style change, the new assertions failed: the variable was absent, then
with the token alone the heading number remained `rgb(32, 36, 44)` instead of the
variable's `rgb(14, 124, 134)`. The default-token assertion also failed before the token
was added. The contrast calculated from sRGB relative luminance is 4.9458556:1 on white.

Manual visual comparison, [before](assets/heading-number-color-511/before-1440.png) /
[after](assets/heading-number-color-511/after-1440.png): same scratch document after
the Outline scenario's section edits, Number headings on, Display open, first numbered
section current, scroll (0, 0), no hover or focused control; 1440×1000, DPR 1, zoom 1,
Windows headless Chrome with bundled Pretendard loaded. The clean base is
`1dc1e2d235019ec73b6ad986b62b8964a36e32be`; the after image uses this change. Both
were captured through `pnpm browser:test outline` with a temporary capture at the same
scenario state, using this worktree's persistent profile and its Vite server on port
5391. Only generated number colors change; the selected Outline number remains blue,
and title positions, spacing and typography stay aligned. These images are manual
review evidence, not pixel assertions or user visual approval.

## Reference templates (#445)

Core owns document reference text through `referenceNumberText(kind, number, templates)`.
Absent settings use MyST defaults: `Figure %s`, `Table %s`, `(%s)`. Figure/Table defaults use U+00A0 (no-break space) exactly as MyST; defaults are display-only and are never written. In-text
references use these templates; Figure/Table caption labels follow the rule below. The equation number on the right remains `(N)`.
Section references and target identities are unchanged.

`EditableDocument.referenceTemplates` projects authored values. MyST frontmatter accepts
`numbering.figure`, `numbering.table` and `numbering.equation` as a template string or
an object containing only `template`. Templates must be non-empty strings with `%s`,
MyST's `{number}` or `{subEnumerator}` numeric substitution; every occurrence is replaced.
Native flat counters give the same number for these numeric forms. `{name}` (caption
substitution) is unsupported. Unknown numbering keys and other per-kind options remain
rejected; this does not admit arbitrary MyST numbering metadata.

`updateReferenceTemplates(document, { figure?, table?, equation? })` leaves omitted keys
unchanged and removes keys given `null`, restoring their defaults. Writes use the object
form `{ template: "…" }`, edit existing template scalars in place to retain mapping/value comments, preserve other admitted frontmatter, and pass
the existing canonical round-trip guard. A numbering map emptied by removal is removed. Heading and
reference edits preserve one another. Setting an existing object-form template to the same value leaves source metadata untouched; shorthand is converted to object form with its comments retained.

The expanded Document settings block offers **Reference style** beside Number headings, with actual notation previews in every menu choice,
with the same unavailable states. Each choice is one undoable document attribute change;
Save replays the Core operation. The file stores templates, never a choice name. Effective
values matching a choice select it (including explicitly authored default values); unmatched
values show **Custom**, preserved until the user chooses another style.

| Choice (English / Korean) | Figure | Table | In-text equation |
| --- | --- | --- | --- |
| Default / 기본 | Figure %s | Table %s | (%s) |
| Concise / 간결형 | Fig. %s | Table %s | (%s) |
| Formal / 정석형 | Figure %s | Table %s | Equation (%s) |
| Korean / 한국형 | 그림 %s | 표 %s | 식 (%s) |

Default removes all three settings. Other choices write the three templates. Choice labels
follow UI language; authored reference text follows the document regardless of UI language.
Reference chips (including table captions), their accessible names, target picker labels and
slash-menu labels/search share Core display text. Search treats normal spaces and no-break spaces equally; slash recognition follows prefixes of Core-rendered numeric templates, including repeated placeholders such as `/Illustration 1 of 1`. Existing Korean kind keywords remain.

Only Default uses MyST no-break spaces. The authored Concise/Formal/Korean values above retain their normal U+0020 spaces. Choice matching compares actual template values; explicitly authored `Figure %s` with a normal space is not the MyST default.

CLI: `ieumdoc update-reference-templates <file> --figure "그림 %s" --table "표 %s" --equation "식 (%s)"`.
Omitted kinds are unchanged. `--reset figure|table|equation|all` removes settings; setting
and resetting the same kind together is refused. `inspect --format json` adds `referenceText`
to labeled numbered target nodes, computed by the same Core rule. Single commands and
`apply-batch` use the existing command/write path; failures leave original bytes unchanged.

Generated Roman numerals, chapter hierarchy, caption substitution and Korean particles remain out of scope. Authored fixed strings follow the separate contract below.

### Caption number labels (#462)

Owner decision (2026-10-26): Figure and Table caption numbers follow authored
`numbering.figure.template` / `numbering.table.template`, matching in-text references.
Core's `captionNumberText(kind, number, templates)` calls the reference display rule when
that kind has a template, including repeated numeric placeholders and custom text/spaces.
Without a template for that kind it preserves the existing caption text exactly: `Figure N`
or `Table N` with U+0020, rather than the reference default's U+00A0. An explicitly authored
template retains its actual spaces, including U+00A0. The existing caption separator `. `
still follows the computed text, even if a custom template contains its own punctuation.
Korean captions therefore start `그림 1. ` / `표 1. `; Table captions remain below the grid.
Every table now receives an official Core number (#584), including a table with no
caption or Label. Its empty caption surface displays that number; adding/removing
caption or Label does not renumber this table or later tables. The [table format
contract](table-caption-v1.md) defines GFM input normalization to numbered directives.

This intentionally differs from MyST: installed `myst-transforms` 1.3.51 `getCaptionLabel`
uses `getDefaultNumberedReferenceTemplate(kind)` (for example `Figure %s:`), ignoring the
document's reference template. IeumDoc follows the document template and retains its own
existing separator. Equation right-side numbers remain `(N)`.
MyST assigns an enumerator to an empty-caption `{table}` container but only inserts a
visible caption-number node when caption content exists. IeumDoc's always available
caption surface displays the official number in either state, as for empty Figures.

Implementation scope: Editor caption prefixes, block metadata and numbered properties
accessible names project this Core text. CLI `inspect --format json` exposes the same
`captionNumberText` (before the separator) on numbered Figure/Table nodes, including
unlabeled ones. No new semantic operation or CLI edit command is needed: reference style
already changes one document attribute through `updateReferenceTemplates`. Captions update
immediately with that attribute, share its single Undo/Redo step and survive Save → Reload.
Labels are computed; no generated caption labels are written to Markdown. Source remains
the canonical Markdown preview, containing authored templates and caption content only.

Verification: Core covers unchanged defaults and Korean/custom/repeated templates. The
existing reference-template browser flow asserts caption CSS prefixes immediately, single
Undo/Redo, Source and saved body preservation, Save → Reload and numbered properties
accessible names. Before implementation its new Korean assertion failed with
`Figure 1. ` / `Table 1. ` instead of `그림 1. ` / `표 1. `.

Same document, Korean selection and 1280×720 viewport, DPR 1, zoom 1, scroll top,
no selected/hovered block, loaded Pretendard, through this worktree's persistent Chrome
profile and Vite server on port 5376:
[before](assets/caption-label-templates-462/before-1280.png) /
[after](assets/caption-label-templates-462/after-1280.png).
The before image is the failed assertion's diagnostic at base `c73b912`; the after image
is captured at the matching successful assertion. These are manual presentation evidence;
automated assertions determine behavior. The existing caption typography and `. ` CSS
separator are unchanged, following the Visual Language's document/metadata separation.
No new controls, adjustable visual values, numbering policy or persistence format are added.

Local checks for #462: Core suite (260), targeted CLI reference-template test (1), related
Editor cross-reference/Figure/Table tests (39), full typecheck, Editor production build,
docs and diff checks; cross-reference, layout-rules and quiet-document browser scenarios.
Browser runs were sequential with this worktree's persistent profile. No independent review
or other-platform product execution is claimed by these local results.

### Verification and visual evidence

Core tests cover both source forms, validation/refusal, defaults, partial reset, canonical
round-trip, unchanged snapshots and coexistence with heading numbering/bibliography/comments.
The CLI command test covers computed `inspect` text, partial/all reset and unchanged-file
refusal. Editor tests cover choice matching (including Custom), unavailable controls and
Core-backed save replay. The cross-reference scenario checks default text, Korean choice,
one-step Undo/Redo, unchanged right-hand equation numbering, MyST templates on disk and Reload.
The new menu-name assertion failed on the original code (`Figure 1` still read `Fig. 1`);
the Display control assertion also failed on the original code (expected one selector, got zero).

Same document and Display panel at 1280×720 and 375×720, taken through `pnpm browser:test cross-reference --screenshots`:
[desktop before](assets/reference-templates-445/before-1280.png) /
[desktop after](assets/reference-templates-445/after-1280.png),
[phone before](assets/reference-templates-445/before-375.png) /
[phone after](assets/reference-templates-445/after-375.png).
The selector reuses the existing native select field, control-size and typography tokens.
Screenshots are visual review evidence; automated assertions decide behavior. User visual
approval and independent review are not claimed here.

Local checks for #445: `pnpm test` (Core 257, file-commit 4 passed/2 platform skips,
CLI 68, Editor 284, Desktop 40), `pnpm typecheck`, Editor build, `pnpm docs:check`,
`git diff --check`, plus cross-reference, outline, pending-figure, editor-shell,
layout-rules, quiet-document and section-reference browser scenarios. Browser runs used this worktree's
persistent profile, sequentially; their servers and sessions were closed after each run.

### PR #446 review regressions

Each review defect was reproduced before its fix: same-value object updates removed YAML
comments, `/Illustration 1 of 1` returned no slash query at its final character, and default
Figure/Table reference text used U+0020 instead of U+00A0. A normal-space query also failed
to find a reference rendered with an explicitly authored no-break space.

Core now preserves mapping/value/shorthand comments and leaves unchanged object-form metadata
untouched; tests verify changed values, same values, source immutability and native reopen.
The existing slash scenario tests every keystroke of repeated `%s` and numeric alias templates.
Core and CLI assert exact no-break-space defaults, while Editor tests and the cross-reference
browser scenario keep typed normal spaces and assert the actual U+00A0 display text.

Post-review local validation: `pnpm test` (Core 259, file-commit 4 passed/2 platform skips,
CLI 68, Editor 284, Desktop 40), typecheck, Editor build, docs check and diff check;
cross-reference, pending-figure, layout-rules and quiet-document browser regressions.
