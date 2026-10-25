# Heading numbering v1

- Status: Implemented
- Last verified: 2026-10-25 (#445 reference-template Core/CLI/Editor tests and cross-reference browser Save → Reload).
- Previous verification: 2026-10-14 (#232 native metadata contract).
- Scope: Core-owned settings and Editor/CLI projection; [Native document support](document-support-v1.md).

Core persists `numbering.headings: boolean` and `numbering.title: false` alongside the mandatory `ieumdoc: 1` marker. Omitted numbering means off. H1 remains a document title (the leading one is [the document title](document-editing-v1.md#document-title-255), which stays first); H2–H6 use the default section counter policy. Heading text never contains generated numbers. Custom heading starts, prefixes and per-level settings are rejected at admission. Numbered reference templates follow the separate contract below.

`updateHeadingNumbering(document, enabled)` updates only heading settings in native frontmatter with the existing YAML library, preserving reference templates and other admitted metadata. `HeadingNumbering` and `headingNumbers` expose the editor-neutral display rule. Editor headings and Outline call the same rule; one ProseMirror document attribute participates in Undo/Redo. Save applies the Core operation without changing snapshot paths. Metadata is hidden from the body, never inserted as an editor block.

In the sidebar's Display panel, Number headings belongs to Saved in document. It is disabled without a document, during pending work and in Source. Wide document is a local preference with a separate scope. Source is read-only. Supported top-level headings advance counters; unsupported nested structures never enter a native document.

CLI: `ieumdoc update-heading-numbering <file> --enabled true|false`. `inspect --format json` reports computed `headingNumber` values. Figure/equation numbering is independent.

Verification covers Core default-policy equivalence to MyST, native metadata writes, CLI edits, Editor path retention, Outline agreement, Undo/Redo and Save → Reload.

## Reference templates (#445)

Core owns document reference text through `referenceNumberText(kind, number, templates)`.
Absent settings use MyST defaults: `Figure %s`, `Table %s`, `(%s)`. Only in-text
references use these templates; the equation number on the right remains `(N)`.
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
form `{ template: "…" }`, preserve other admitted frontmatter and YAML comments, and pass
the existing canonical round-trip guard. An empty numbering map is removed. Heading and
reference edits preserve one another.

Display's Saved in document section offers **Reference style** beside Number headings,
with the same unavailable states. Each choice is one undoable document attribute change;
Save replays the Core operation. The file stores templates, never a choice name. Effective
values matching a choice select it (including explicitly authored default values); unmatched
values show **Custom**, preserved until the user chooses another style.

| Choice (English / Korean) | Figure | Table | In-text equation |
| --- | --- | --- | --- |
| Default / 기본 | Figure %s | Table %s | (%s) |
| Concise / 간결형 | Fig. %s | Table %s | (%s) |
| Formal / 정석형 | Figure %s | Table %s | Equation (%s) |
| Korean / 한국형 | 그림 %s | 표 %s | 식 (%s) |

Default removes all three settings. Other choices write the three templates. Choice labels
follow UI language; authored reference text follows the document regardless of UI language.
Reference chips (including table captions), their accessible names, target picker labels and
slash-menu labels/search share Core display text. Existing Korean kind keywords remain.

CLI: `ieumdoc update-reference-templates <file> --figure "그림 %s" --table "표 %s" --equation "식 (%s)"`.
Omitted kinds are unchanged. `--reset figure|table|equation|all` removes settings; setting
and resetting the same kind together is refused. `inspect --format json` adds `referenceText`
to labeled numbered target nodes, computed by the same Core rule. Single commands and
`apply-batch` use the existing command/write path; failures leave original bytes unchanged.

Roman numerals, chapter hierarchy, caption substitution and Korean particles remain out of scope.

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
layout-rules and quiet-document browser scenarios. Browser runs used this worktree's
persistent profile, sequentially; their servers and sessions were closed after each run.
