# Figure authoring v1

- Status: Implemented
- Pointer and popover correction: 2026-10-29 (#760; first prose click, quiet fields, aligned controls and metadata clearance).
- Property popover: 2026-10-29 (#757; owner decisions in #740 and implementation handoff).
- Fixed numbering: 2026-10-29 (#720 Core/CLI and Editor property controls/warnings); [shared number contract](heading-numbering-v1.md#fixed-numbers-720).
- Mermaid update: 2026-10-28 (#651: Core/CLI source semantics and Editor in-document authoring/rendering).
- Mermaid image verification: 2026-10-29 (#707: newline label decoding, XML/XHTML serialization, decoder failure notice and recovery in `mermaid-authoring`; unchanged source/disk/history).
- Media reference verification: 2026-10-27 (#504: simultaneous exact source replacement, canonical preservation/refusal, CLI dry-run/batch/revision conflicts, real Host rename and Editor reload).
- Property-entry update: 2026-10-27 (#557: shared selection/Enter/double-click and explicit property drafts; see [Continuous editing](document-editing-v1.md#continuous-editing)).
- Active image preview verification: 2026-10-26 (#480: Figure browser preview/race/focus/overflow checks and [same-state manual captures](folder-picker-v1.md#active-image-preview-480); Editor tests/typecheck/build).
- Double-click verification: 2026-10-26 (#470: figure-authoring checks Image-field focus, Edit-equivalent Cancel/Escape, unchanged document and Undo/Redo, caption word selection, pending entry and preservation of invalid/unapplied drafts; new entry assertions failed before the change).
- Image picker verification: 2026-10-26 (#461: click selection, sibling visibility, editing/Tab filtering, Use and reopening in figure-authoring; image-assets/folder-navigation/layout-rules/quiet-document browser regressions and Editor tests/typecheck/build).
- Caption-label verification: 2026-10-26 (#462 Core template rule, CLI inspect, cross-reference browser immediate update, Undo/Redo, Source and Save → Reload).
- CLI asset verification: 2026-10-15 (#289 document-relative image-file/stat warnings, directory/junction and stat-failure regressions, Host path parity and dry-run result checks; source CLI and targeted tests).
- CLI insertion verification: 2026-10-15 (#280 `--at end` before endnotes; Core/CLI tests).
- Property-focus verification: 2026-10-15 (#275 actual Apply click/Enter/Cancel/Escape reproduction, shared safe caret restoration, unchanged-caption caret/typing and formatted Save/Reload browser regressions).
- Last verified: 2026-10-14 (#212: empty-Figure paste/drop fill, existing-image insertion, single Undo/Redo and real-file Save → Reload in `image-assets`; changed-target cancellation/rollback in Editor tests. #211 / PR #229: normal media separators and standalone dot-segment transport in Editor path-table tests; Host traversal rejection, actual image loading/failure and unchanged Save → Reload paths in Editor tests and `image-assets`; Choose… image selection and existing pending Figure regressions).
- Scope: empty, pending, image and Mermaid Figures in Core/CLI; image and Mermaid authoring in Editor, under [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md), [Document support](document-support-v1.md) and [Editing session and Save](editing-session-save-v1.md).

## Scope and completion

The MVP keeps the existing MyST Figure container and image authoring UI, adding in-document Mermaid source editing. Completion requires real-file Save → Reload with source, caption, label and reference preserved. Core owns persistence validity; CLI and Editor use the same operations. No new Media model, upload workflow, autosave or export pipeline is introduced.

Verification covers Core canonical round-trip and fail-closed cases, CLI writes and failure without writes, Editor session collection/history, and browser insertion, Apply/Cancel, Source, Save acknowledgement and existing image authoring.

## Persistent meaning

The optional outer `{figure}` `:enumerator:` stores a fixed number for image, pending and
Mermaid Figures. Core read models, captions and references use the exact authored string;
moving, relabeling or editing content preserves it. `updateEnumerator` and the thin CLI
`update-enumerator` command set or clear it. Mermaid's inner directive stays option-free.
The [shared fixed-number contract](heading-numbering-v1.md#fixed-numbers-720) defines
warning-only missing/duplicate checks and Editor display. The image/pending and Mermaid
property forms place Number after Label and reuse their existing draft,
validation-busy and Undo contracts. In the Editor, choosing Automatic clears the fixed number;
empty Fixed input blocks completion with a field error (#776). Captions and
references update from Core display functions. Core warnings appear beside this field and
in a document warning Notice without blocking Save.

A Figure owns its caption, label, location and number. Content is optional: `contentKind` in the Core read model is `none`, `image` or `mermaid`. Existing `imageUrl` and `imageAlt` fields remain available. Mermaid Figures additionally expose `mermaidSource`; image fields are empty. Unsupported content, including subfigures, rejects native admission.

The computed caption number follows the document's authored Figure reference template,
with the existing `. ` separator; absent a template, `Figure N. ` stays unchanged.
Block metadata and numbered properties accessible names use the same Core display text.
See [Caption number labels](heading-numbering-v1.md#caption-number-labels-462) for the
intentional MyST difference, spaces, history and CLI inspect contract. Labels are never
written into caption Markdown.

Empty editable image, pending and Mermaid captions show the UI-language
italic `Enter a figure caption…` / `그림 캡션을 입력하세요...` hint while the
ProseMirror selection is outside, in the same minimum 8em inline input area as
table captions (#677). The existing computed prefix leads that area. The shared
`data-placeholder` CSS generates the hint with empty accessibility alternative
text, so the caption's accessible name is announced once. Clicking the hint places
the engine caret in the caption and hides the hint; keyboard and programmatic selection
do the same. Clearing the text and moving selection away restores it. The hint is absent in read-only
mode and is never document text, clipboard content, Source or saved Markdown.
See the [visual verification](../reviews/editor-visual-language-history-2026-10-30.md#empty-caption-hints-698).
Repeated Backspace keeps the caption's editable surface and model synchronized; once empty,
further Backspace does not edit the preceding block. Deletion that empties a caption uses the shared
ProseMirror deletion/history boundary described in [Table caption](table-caption-v1.md).
Replacing an entire caption, including mixed bold/plain text, also keeps the DOM and model
synchronized for image, pending and Mermaid Figures (#750). Cancelable native text replacement
uses the browser's exact target range and a ProseMirror transaction. At composition start, a full
caption selection is deleted through the engine before native composition continues at that caret.
Composition cancellation can also detach the contentDOM. Caption NodeViews report that removal
to ProseMirror instead of ignoring it, so the engine reads the final DOM and rebuilds the editable
surface. Cancelled text is removed from the model and cannot reappear through Save → Reload.
Partial selections and ordinary caret input retain their existing paths. The replacement remains
one Undo step and survives Save → Reload with diagram source, label and surrounding content intact.
The `caption-selection` regression covers real mouse drag, text input, Chromium Korean composition
commit/cancel (including Escape and Backspace), immediate and two-frame DOM/model agreement,
Undo/Redo, and real-file Save → Reload for image, Mermaid, pending and table captions;
Windows OS IME candidate selection remains a manual verification boundary.

Triple-clicking anywhere on an image, pending or Mermaid caption line, including the
generated number and blank space after the text, selects only that caption's inline
content (#724). Subsequent typing or deletion preserves neighboring blocks. The shared
caption mousedown handler prevents native paragraph selection on the editable wrapper
outside contentDOM. Text clicks handled by ProseMirror and ordinary drag selection
retain their existing behavior. This Editor interaction adds no Core or CLI operation.

A pending Figure has no image. Its caption and label are optional: an empty Figure, with no image, caption or label, is a valid place reserved for content to come. Alt text requires an image. An image Figure may have neither caption nor label. Supported captions use the existing InlineContent contract. Connecting or removing an image updates the same container and preserves the label and caption. Removing an image with alt text requires clearing the alt text too.

```markdown
:::{figure}
:name: fig-pfc-control

PFC Current Control Architecture
:::

The controller structure is shown in [](#fig-pfc-control).
```

Label-only pending Figures omit the body. Caption-only Figures omit `:name:`. An empty Figure is written as `:::{figure}` followed by `:::`. No fake asset, sidecar or persistent draft flag is written. Pending Figures, empty ones included, receive normal Figure numbers as MyST numbers them; labeled ones may be reference targets.

Public `serialize` and `canonicalWriteError` validate the final state; an empty Figure is writable. Earlier versions refused a Figure with no image, caption or label; [#171](https://github.com/ieumbird/ieumdoc/issues/171) reversed this so that reserving a place does not require invented caption or label text. The limited pending writer handles a container with no content and at most a caption; existing whole-document semantic fingerprint, reparse and serializer diagnostic guards still apply. Legends, subfigures and unsupported contents keep their existing fail-closed boundary.

Image, pending and Mermaid captions share [scoped Ctrl/Cmd+A](document-editing-v1.md#select-all-within-an-editing-surface-723):
the first press selects only caption content, and a consecutive second press
selects the document. The number, image/source and properties stay outside the
first selection. Empty captions stay local on the first press (#723).

For the shared #751 policy, an already complete nonempty text selection expands
immediately. Disabling `EXPAND_SELECT_ALL_TO_DOCUMENT` keeps Ctrl/Cmd+A local;
node/read-only selections are retained. See the [selection contract](document-editing-v1.md#select-all-within-an-editing-surface-723).

## Mermaid Figures (#651, Core and CLI)

A Figure may contain exactly one option-free MyST `mermaid` directive followed by an optional
supported inline caption. The container owns the label, caption, number and reference target,
just as for an image Figure. Mermaid directive options (including label/name, class and unknown
options), additional content, legends and empty/whitespace-only source are rejected by native
admission. A standalone `{mermaid}` directive is unsupported; ordinary fenced code blocks
remain code blocks. Core treats diagram source as opaque text and does not validate Mermaid
syntax or render it.

`insertFigure(document, index, { imageUrl: "", imageAlt: "", caption, mermaidSource })`
creates a Mermaid Figure. `updateFigure(document, path, { mermaidSource })` replaces source
only on an existing Mermaid Figure; omitted properties retain their values. Caption/label
operations preserve source. Image or alt text on a Mermaid Figure, and adding Mermaid source
to an image or pending Figure, are refused. Image ↔ Mermaid conversion and diagram alt text
are outside this contract.

Canonical output uses an unindented colon Figure container, `:name:` for an optional label,
a blank line before the inner backtick `{mermaid}` directive, and a blank line before an
optional caption. Both fences are at least three characters. The inner fence is longer than
any backtick run in the source, and the outer fence is longer than every leading colon run
in the body. Indentation and interior blank lines in source are preserved. Document output
uses LF and one final newline. Source must survive MyST parsing exactly: operations refuse
boundary blank lines or CR/CRLF source that MyST would trim/normalize, rather than silently
changing it. File parsing follows MyST's existing body and line-ending normalization.
The complete semantic fingerprint (including source), native re-admission and idempotent
second serialization remain mandatory; no fingerprint field is ignored for Mermaid.

````markdown
:::{figure}
:name: fig-flow

```{mermaid}
graph LR
  A --> B
```

신호 흐름
:::
````

This extends the detailed support syntax allowed by ADR-0006 and keeps Core-owned canonical
writes under ADR-0002; it changes neither architectural decision and needs no new ADR.
Editor uses the same Core-backed Figure operations for source, caption and label changes.
Image attachment to Mermaid is refused; the image properties form stays separate.

### Mermaid Editor

The shared block insertion menu offers **Diagram** (Mermaid), with `graph LR` and `  A --> B`
as its initial source, and opens editing immediately. The insertion is one undo step and already
savable; Cancel keeps the inserted Figure. At rest the rendered diagram, number and directly
editable caption use the same placement as image Figures, including Outline and references.

Edit, selected-node Enter and diagram double-click open the shared Figure metadata popover.
Its **Edit source** action applies the metadata draft through Core validation, then closes the
popover and opens the existing full-column code-style textarea,
debounced draft preview, label and shared explicit Apply/Cancel actions. Plain Enter adds a
line; Ctrl/Cmd+Enter applies and Escape cancels. Outside click, blur and selection movement
retain the form. Source/label drag events stay inside native controls. Apply validates through
Core, retains rejected input/reason and preserves the live caption. A rejected Apply restores
keyboard editing after the busy inputs re-enable, unless focus moved outside the form or to
another tab while validation was pending. Apply/Cancel return the block caret; late validation
never steals focus from another location. Read-only views cannot edit.
CRLF/CR input becomes LF in the textarea. Before Apply, Editor removes leading whitespace-only
lines and trims whitespace from the end of the whole source, matching MyST directive reading.
This includes trailing blank lines and the last content line's trailing whitespace. It does not
trim each line: the first non-empty line's indentation, interior blank lines (including their
spaces/tabs), and other lines' trailing whitespace remain literal. Validation/commit use this
normalized candidate; a rejected Apply retains the original draft. Core stays strict and does
not normalize operation input. Whitespace-only source is still rejected. Mermaid syntax errors
affect preview, not document validity: opaque source can still be applied and saved.

Mermaid is lazy-loaded only for a visible Mermaid Figure. Previews debounce for 250ms; stale
results and unmounted/hidden views cannot overwrite current results. Rendering is serialized
around Mermaid's global configuration, with a unique render ID per request. Effective light/dark
theme changes rerender applied and draft previews. Loading/render errors stay inside the block;
source editing, Apply and Save remain available. Rendering uses `securityLevel: "strict"`,
disables automatic/error DOM rendering, and displays the returned SVG as an image data URL.
The sanitized result is parsed in a detached document and XML-serialized, preserving HTML label
line breaks (`\n`, `<br>` and `<br/>`) and XHTML namespaces without changing Mermaid source.
Image decoding completes before publishing a preview; decoding failures use the same block-local
error notice as syntax/render failures instead of leaving a broken image. This conversion runs
with the same strict security settings,
without injecting SVG/HTML or binding diagram callbacks into the Editor DOM. Mermaid's own
temporary measuring container is owned and removed after each request. All renderer code and
diagram chunks ship locally; no diagram service receives source. Ordinary `mermaid` code blocks
remain code blocks. Conversion, alternative formats, alt text and diagram export are excluded.

#707 visual evidence: [before](assets/mermaid-707/before.png) (base `7f6ba127`) and
[after](assets/mermaid-707/after.png), same Korean `\n` label draft, light theme,
1280×720 viewport, DPR 1/default zoom, Windows installed Chrome and bundled Pretendard.
The baseline image failed real decoding; the corrected preview displays both label lines.

## Editor session states

The caption slash menu offers citations, document references and Endnote through the shared
[inline insertion paths](editor-ux-shell-v1.md#nested-inline-slash-menu-377). Existing
`updateFigure` Save replay retains the typed inline caption. Its round-trip count compares the
same completed intermediate footnote snapshot as serialization, allowing a new caption
reference before the session supplies its definition. Final writes still refuse missing
definitions; all caption/property/label and canonical-stability comparisons remain required.

Closing properties retains a text selection inside the caption, otherwise returning
a text/gap caret after the Figure ([Continuous editing](document-editing-v1.md#continuous-editing)).
Apply changes attributes without replacing an unchanged caption, preserving its
caret and formatting. Captions are edited directly in the document, with the shared inline formatting tools.
The image properties popover contains a thumbnail and Replace entry, alt text, label and Number;
Mermaid metadata contains Edit source, label and Number. Diagram alt text remains unsupported.
The source editor retains its existing source, preview, label, Number and Apply/Cancel controls. Completion always validates
and preserves the live caption; it never replaces caption content.
Figure validation that completes after the user moves elsewhere does not take focus back.

| State | Session behavior | Save and Source |
| --- | --- | --- |
| Pending Figure | `/figure` and `+` insert an empty Figure; caption or label may be added later. Shows `No content yet`, normal metadata and caption. | Included from insertion; Reload restores a Figure with no image. |
| Completed image Figure | Valid image attached; existing image behavior. | Included. |

Pending/image Figure insertion is one undo step and opens no form: the caret starts in the new Figure's caption, so a caption can be typed at once or the Figure left empty. Pasting an image with the caret in an image-free Figure's caption, or dropping an image on that Figure, fills its image using the same properties update as Apply, preserving its label, caption and document position. Caption and label may both be empty. Paste/drop on a Figure that already has an image, or on any other block, inserts a new image Figure after the target; it never overwrites an existing image. If the empty target Figure is deleted or changed while upload is pending, including another image being attached, completion cancels without changing the document and rolls back the created asset through the existing upload cancellation path. Read-only and concurrent-upload rejection rules remain in force.

When an image or Mermaid preview is selected as a block outside edit mode, ordinary
character input and IME composition are ignored: the document and caption stay unchanged
and no paragraph is created. Clicking another text surface permits normal input again.
Direct caption editing, explicit property fields, Enter, arrow navigation, deletion and
paste/drop keep their existing behavior; see [Continuous document editing](document-editing-v1.md).

Filling an empty Figure preserves the caret at its current caption position and is one undo step: Undo restores that empty Figure, while Undo removes a newly inserted Figure. Both results persist through Save → Reload. Apply → Save → Undo → Save writes the Figure as it was before Apply, and Redo → Save writes the applied value again. Save preserves this history and the opening-snapshot replay contract. Deleting and undoing a Figure restores its attributes, including after saving the deletion. No new Core operation or CLI command is needed: filling reuses the existing Figure update path, already available as `update-figure --image`.

Edit or Enter on a selected Figure opens its properties (#557). Single-click selects only. Double-clicking its rendered image, pending no-content frame or image-load error uses the same Edit path, including initial Replace-button focus and focus restoration on closing (#470). Caption double-click keeps normal text selection/caret behavior. Opening properties changes neither document nor history; keyboard re-entry while already editing preserves the existing form, draft and validation error; a pointer click outside the popover follows completion. Apply accepts label and image properties through Core validation, all-empty included; the caption remains direct document content. Alt without an image shows a validation error and retains the form. Edit connects or removes the image URL. Save/Source operate on applied content only; keyboard activation and tab focus retain unapplied fields. Pointer dismissal applies through the popover completion path. Save acknowledges only the submitted applied snapshot; later edits remain dirty under the existing session contract.

Replace reveals the existing Image path and explicit Choose… action. Choose… beside that field opens the [folder picker](folder-picker-v1.md#choosing-an-image) to choose an image on the Host, starting in the document's folder ([#208](https://github.com/ieumbird/ieumdoc/issues/208)). The [active image preview](folder-picker-v1.md#active-image-preview-480) shows the keyboard-active or clicked image before choosing it (#480). Clicking an image marks it selected while sibling images remain listed; editing the path resumes filtering (owner decision, 2026-10-26, #461). Use or Enter only fills the Image field; Apply validates and commits it like a typed value. An image inside the document's folder fills its relative path, such as `./figures/diagram.svg`, and nothing is copied. One elsewhere is copied into `assets/` as a pasted image is, and the field gets that copy's path. Cancel, choosing again, or the form going away unapplied (Reload, closing the document, deleting the Figure) removes a copy the form made; a copy Apply put in the Figure stays. Closing the picker without choosing leaves the field unchanged. No CLI command is added: choosing is Host navigation, and `update-figure --image` already sets the path.

Relative image sources remain unchanged in document attributes and Markdown. Both the live NodeView and the editor's HTML serializer resolve document-relative paths through the Host media URL, with or without `./` (`assets/diagram.svg` and `./assets/diagram.svg` display the same image). Sources with a URL scheme, protocol-relative sources (`//host/...`), root-absolute paths and Windows drive/UNC paths retain their existing browser handling. Relative `../` paths still pass through the Host, which rejects access outside the document directory, including encoded traversal and symlink escapes; URL encoding must not let browser dot-segment normalization bypass that check. No path is normalized or prefixed in saved content.

After removing the optional leading `./` for display, ordinary paths use segment-by-segment encoding and keep `/` separators (`/document/assets/diagram.svg`), avoiding encoded-slash rejection by reverse proxies. Only paths with a literal `.` or `..` segment encode the complete path. A standalone dot segment receives a trailing slash in the request before encoding: `.` becomes `/document/.%2F`, while `..` and `./..` become `/document/..%2F`. The Host decodes and resolves these to the same filesystem location as the original path; the Editor makes no access decision. Literal percent escapes are encoded as text, so `%2e%2e/x` becomes `/document/%252e%252e/x` and reaches the existing Host rejection. All examples omit the document locator query. A proxy that blocks encoded slashes can still reject dot-segment requests before forwarding; normal image paths require no such proxy option. Query-based media transport was not added because this display fix can reuse the existing shared Vite/HTTP/Desktop handler unchanged.

If an image cannot load, the Figure shows `Image could not be loaded. Check the image path or URL.` in the existing error Notice, including at rest. The broken image is hidden; caption, numbering and properties remain available. Successful loading or changing the source clears the failed-source display state. This state never changes document attributes, dirty state, Source or Save, and adds no Core asset-existence check. CLI filesystem warnings are described below.

## Anchored Figure properties (#757)

Image, pending and Mermaid metadata use one popover attached to the entire Figure, including
its caption. It opens below and flips above when space is insufficient. It fits the owning
editor group's content viewport, excluding single-group Sidebar/Outline insets and the native
scrollbar, at both 1440px and the supported 640px minimum. Its scrollable height is capped to
the available side, so it does not cover the Figure or caption; following prose may be covered.
Resize, scroll and group changes update placement through the existing Base UI positioner.

There is one **Done** action. Escape cancels, and pointer clicks outside apply via the same
Core validation and asynchronous lifetime guards. Rejection retains draft values and errors;
keyboard focus/selection movement alone does not apply. Pointer completion does not force
focus back to the Figure. A prose click places the native caret at the clicked text position,
including while metadata validation is pending; following input belongs to that paragraph.
The shared preview input guard completes engine focus before enabling native pointer selection,
so the focus transaction cannot re-disable the surface. The image chooser suspends dismissal
until it returns. Save still acknowledges only its submitted applied snapshot; later metadata
completion remains a separate edit. Unapplied properties retain the existing close/unload guard
and remain outside applied-content recovery. Caption editing stays directly in the document.

Image replacement is an explicit disclosure with the existing path/chooser and copied-asset
cleanup. File name lives in **Advanced**, initially collapsed on each entry; a retained filename
draft or error opens it. Only its explicit **Rename** action invokes the Host filesystem rename.
Done/outside completion never renames a file: an unconfirmed filename survives closing and
reopening, remains an unapplied draft, and Escape discards it. Rename retains existing validation,
checkpoint and history contracts. See [filename](document-editing-v1.md#figure-file-name-652).

Number uses Automatic/Fixed segments, with an input only for Fixed. Empty fixed input blocks
completion; choosing Automatic clears the fixed number and shows the automatic number
preview under the [shared number contract](heading-numbering-v1.md#fixed-numbers-720).
Core warning Notices appear only when needed. Fields have transparent
rest borders, a subtle surface fill and empty-value placeholders, with hover/focus boundaries.
The Number track matches the neighboring input height, and visible segment labels share the
hidden width-reserving labels' grid cell. Both media kinds use intrinsic-ratio previews within
adjustable maximum width/height, without a fixed box or letterbox fill. The image itself has
a subtle structural border and content radius; compact actions remain vertically centered. Advanced
uses a native keyboard-accessible disclosure with the shared chevron and compact target.
Its expanded filename row retains the collapsed label-line clearance above Done.
Form rows use the shared 12px gap and equal 16px outer padding; warnings/errors use UI 14/20
type without an extra bottom margin. Number warnings stay in the Number column. Above placement
includes the absolute metadata line in the anchor. There is no repeated title, path summary, caption field
or section heading. Width, thumbnail size and anchor gap are adjustable tokens; other controls reuse shared
spacing and state tokens. Equation, table, endnote and Mermaid source forms retain their UI.
This is Editor interaction only; no Core or CLI operation is added.

### Popover comparison and verification (#757)

Same-state manual captures use Windows installed Chrome, checkout-owned persistent profiles,
English UI, bundled Pretendard, DPR 1 and default zoom, at 1440/640 × 900. Before is clean
`777368e1`; After is this PR. Both use the Mermaid/image fixture with sixteen preceding plain
context paragraphs so each target can be placed near the viewport's top or bottom. The
selected target and its caption remain visible in After; following document content may be covered.
The separate capture traversal waits for real Mermaid image rendering. It is presentation evidence,
not an additional pixel gate. Large traces/build outputs and the temporary capture driver stay
outside Git. The preview-to-prose first-click defect observed here is corrected by #760.

| Target / viewport / placement | Before | After |
| --- | --- | --- |
| image / 1440px / below | [Before](assets/figure-properties-757/before-image-1440-below.png) | [After](assets/figure-properties-757/after-image-1440-below.png) |
| image / 1440px / above | [Before](assets/figure-properties-757/before-image-1440-above.png) | [After](assets/figure-properties-757/after-image-1440-above.png) |
| image / 640px / below | [Before](assets/figure-properties-757/before-image-640-below.png) | [After](assets/figure-properties-757/after-image-640-below.png) |
| image / 640px / above | [Before](assets/figure-properties-757/before-image-640-above.png) | [After](assets/figure-properties-757/after-image-640-above.png) |
| mermaid / 1440px / below | [Before](assets/figure-properties-757/before-mermaid-1440-below.png) | [After](assets/figure-properties-757/after-mermaid-1440-below.png) |
| mermaid / 1440px / above | [Before](assets/figure-properties-757/before-mermaid-1440-above.png) | [After](assets/figure-properties-757/after-mermaid-1440-above.png) |
| mermaid / 640px / below | [Before](assets/figure-properties-757/before-mermaid-640-below.png) | [After](assets/figure-properties-757/after-mermaid-640-below.png) |
| mermaid / 640px / above | [Before](assets/figure-properties-757/before-mermaid-640-above.png) | [After](assets/figure-properties-757/after-mermaid-640-above.png) |

### Pointer and visual correction verification (#760)

The pre-fix physical prose click retained Figure NodeSelection; after metadata completion,
input reached its caption instead of the clicked paragraph. The focused regression now
clicks an exact interior text offset and types immediately, including while Figure validation
is held. Image/Mermaid metadata and typing remain separate Undo/Redo steps and survive real-file
Save → Reload. The same test checks Equation, table and endnote entry: explicit Equation/table
drafts stay open, while body input and endnote exit retain their existing contracts.

The segment defect came from a missing visible-label grid wrapper: the shared hidden
`::before` occupied one grid row and anonymous text flowed into another. Figure Number now
uses the existing segment markup; toolbar Visual/Source CSS is unchanged. Relationship checks
cover text/button centers, Label/Number height/centers, contained image aspect ratio, media-action
alignment, visible empty fields, SVG disclosure, notice typography and metadata clearance.

Initial same-state manual captures use base `b43978ac` and `72041c94`, 1440/640 × 900, Light/Dark,
bundled Pretendard, DPR/zoom 1 and one successful persistent Windows Chrome run. Sixteen
plain context paragraphs before/after the existing Mermaid/image fixture permit controlled
placement. Wide samples open below and narrow samples above; following prose may be covered.
The temporary collector verifies actual final thumbnail markup after switching source versions,
waits for image decoding/fonts and changes Korean through Settings. Earlier development captures
were discarded. Captures are manual evidence, separate from automated assertions.
[State measurements, source hashes and PNG hashes](assets/figure-properties-760/capture-metadata.json).

Owner review replaced the square thumbnail with intrinsic-ratio previews bounded by 10rem × 6rem
tokens. Only the following four files were refreshed in one persistent run, with the same fixture,
fonts, viewport height and theme/language controls. Other captures retain the initial `72041c94`
appearance. Each image now owns its subtle border/content radius; its surrounding area is
transparent and has no fixed height. Mermaid's percentage-width SVG receives a maximum-width
reference while height remains intrinsic. Relationship assertions compare content-box aspect
ratio, maximum bounds and the absence of wrapper letterbox height. Advanced's expanded filename
row also receives the collapsed disclosure's label-line clearance before Done, verified at both widths.

| Current follow-up state | Capture |
| --- | --- |
| Light image / 1440 / detail | [PNG](assets/figure-properties-760/after-light-image-1440-detail.png) |
| Dark image / 1440 / detail | [PNG](assets/figure-properties-760/after-dark-image-1440-detail.png) |
| Light Mermaid / 640 | [PNG](assets/figure-properties-760/after-light-mermaid-640.png) |
| Korean Fixed + warning / 640 | [PNG](assets/figure-properties-760/after-ko-fixed-warning-640.png) |

| State | Before | After |
| --- | --- | --- |
| Light image / 1440 / below | [PNG](assets/figure-properties-760/before-light-image-1440.png) | [PNG](assets/figure-properties-760/after-light-image-1440.png) |
| Light image / 640 / above | [PNG](assets/figure-properties-760/before-light-image-640.png) | [PNG](assets/figure-properties-760/after-light-image-640.png) |
| Light Mermaid / 1440 / below | [PNG](assets/figure-properties-760/before-light-mermaid-1440.png) | [PNG](assets/figure-properties-760/after-light-mermaid-1440.png) |
| Light Mermaid / 640 / above | [PNG](assets/figure-properties-760/before-light-mermaid-640.png) | [PNG](assets/figure-properties-760/after-light-mermaid-640.png) |
| Dark image / 1440 / below | [PNG](assets/figure-properties-760/before-dark-image-1440.png) | [PNG](assets/figure-properties-760/after-dark-image-1440.png) |
| Dark image / 640 / above | [PNG](assets/figure-properties-760/before-dark-image-640.png) | [PNG](assets/figure-properties-760/after-dark-image-640.png) |
| Dark Mermaid / 1440 / below | [PNG](assets/figure-properties-760/before-dark-mermaid-1440.png) | [PNG](assets/figure-properties-760/after-dark-mermaid-1440.png) |
| Dark Mermaid / 640 / above | [PNG](assets/figure-properties-760/before-dark-mermaid-640.png) | [PNG](assets/figure-properties-760/after-dark-mermaid-640.png) |
| Korean image / 640 / Fixed + missing-number warning | [PNG](assets/figure-properties-760/before-ko-fixed-warning-640.png) | [PNG](assets/figure-properties-760/after-ko-fixed-warning-640.png) |
| Advanced / 1440 | [PNG](assets/figure-properties-760/before-advanced-1440.png) | [PNG](assets/figure-properties-760/after-advanced-1440.png) |
| Empty field + segments, detail | [PNG](assets/figure-properties-760/before-light-image-1440-detail.png) | [PNG](assets/figure-properties-760/after-light-image-1440-detail.png) |
| Segment crop | [PNG](assets/figure-properties-760/before-segment.png) | [PNG](assets/figure-properties-760/after-segment.png) |
| Input hover | [PNG](assets/figure-properties-760/before-input-hover.png) | [PNG](assets/figure-properties-760/after-input-hover.png) |
| Input focus | [PNG](assets/figure-properties-760/before-input-focus.png) | [PNG](assets/figure-properties-760/after-input-focus.png) |

## CLI and readiness

### Media reference replacement (#504)

`updateMediaReferences(document, [{from, to}, ...])` replaces every exact matching Figure image
source simultaneously through Core. This is editor-neutral and uses the existing Figure read
model and update operation; no caller parses Markdown. It preserves Figure caption, alt text,
label and position. Plain text, inline links, unrelated images and pending Figures are unchanged.
Duplicate source mappings and empty source/destination strings are rejected. Destinations must
pass existing Figure validity/round-trip rules, and the complete input/output must pass canonical
serialization's loss-prevention guards. Mappings do not cascade (`a → b`, `b → c` changes an
original `a` only to `b`). Core does not decide filesystem identity or existence.

`ieumdoc update-media-references <file> --from ./old.svg --to ./new.svg` is the thin one-document
CLI command. Normal dry-run, JSON output, revision-checked writes and `apply-batch` apply.
Matching is exact, without path/URL normalization. This command does not rename image files or
scan folders. The [Host image rename](filesystem-host-boundary-v1.md#referenced-image-rename-504-pr-b)
uses filesystem identity to supply all matching source spellings and the new relative path to
this same operation, then coordinates the file writes and image rename.

### Figure commands

```bash
pnpm ieumdoc insert-figure doc.md --at 2 --label fig-pfc-control --caption "PFC Current Control Architecture"
pnpm ieumdoc insert-figure doc.md --at 2 --label fig-label-only
pnpm ieumdoc update-figure doc.md --path 2 --image ./pfc-control.svg --alt "PFC current control diagram"
pnpm ieumdoc update-figure doc.md --path 2 --image "" --alt ""
pnpm ieumdoc insert-figure doc.md --at end --mermaid "graph LR; A --> B" --label fig-flow --caption "신호 흐름"
pnpm ieumdoc update-figure doc.md --path 2 --mermaid "graph TD; B --> C"
pnpm ieumdoc inspect doc.md --format json
pnpm ieumdoc check doc.md --format json
```

`--mermaid <source>` follows existing `--latex`/`--code` argument input, including multiline
strings supplied by the shell; no separate file/stdin convention is introduced. `apply-batch`
uses the same `mermaid` string option, and dry-run/revision checks/atomic replacement apply.
CLI only passes source to Core. `inspect` exposes `mermaidSource` in JSON and text.

`insert-figure --image`, `--mermaid`, `--caption` and `--label` are optional; with none of them it inserts an empty Figure. `--label` uses Core label validation in the same edit and single atomic file replacement. `update-figure` preserves omitted fields and the label. Invalid final states and label collisions, including another heading's implicit ID under the shared [label rules](section-references-v1.md#core), fail without writes.

`insert-figure --at end` (#280) uses Core `bodyEndIndex` to insert before endnote definitions, or after the last body block when there are none (1 for an empty native document). `apply-batch` accepts the same options with `"at": "end"` and resolves the position on each canonical snapshot. [Equation insertion](document-support-v1.md#interfaces-and-errors) and [table insertion](table-caption-v1.md) follow the same one-edit/one-replacement pattern for optional labels and captions.

`inspect` adds `contentKind` to Figure JSON and `content=none|image|mermaid|other` to text. Existing fields remain. `check` reports pending Figure paths and labels in `readiness.pendingFigures`, or warnings on stderr in text mode. Existing validation/writeability/reference fields and exit codes stay intact: pending alone is writable and exits 0. This is a warning about incomplete content, not a complete publication certification; exporters and image decoding are not checked. Save and format remain allowed. Official MyST can diagnose pending Figures as errors while its build still exits 0; this MVP does not implement Publish/Export.

CLI `check` also reports each image Figure whose document-relative source is not a regular file or could not be checked in `readiness.missingImageFigures` (`path`, `label` as in `pendingFigures` with an empty string when unlabeled, and `source` as written), or one stderr warning line per Figure in text mode. It shares the Editor source classification/encoding and Host media resolver: bare and `./` paths are equivalent, non-ASCII and literal percent characters retain their filename meaning, and encoded traversal is refused. Sources with a scheme, protocol-relative sources, root-absolute and Windows drive/UNC paths are skipped. Paths the Host refuses, including `../` that escapes the document directory and symlink escapes, are skipped rather than reported as missing; paths containing `..` that resolve inside the boundary are checked. After Host resolution, `stat` follows symlinks and requires a regular file: directories and links to directories warn. All stat failures, including `ENOENT` and `EACCES`, use the same short warning, `is not a file or could not be checked`; they do not claim that an inaccessible target is absent. The existing JSON field name is retained and covers these cases. This checks filesystem file type only, not image loading, readability or decoding. Core remains headless. These warnings leave exit code, `ok`, writeability and all writes unchanged. `--dry-run` uses the same diagnostics on its result document relative to the same target file.

Core and CLI `check` diagnose missing targets for both `[](#label)` links and role references ([#151](https://github.com/ieumbird/ieumdoc/issues/151), implemented in [PR #166](https://github.com/ieumbird/ieumdoc/pull/166)). Unresolved references are warnings, stay as written and do not block a lossless canonical write; [Section references](section-references-v1.md#scope) defines the diagnosis contract. The existing numbered role-reference UI remains. The prior spike remains historical evidence in [PR #150](https://github.com/ieumbird/ieumdoc/pull/150); its experimental code is not merged here.

## Visual verification

The same pending Markdown was opened at master `252de5c` and with this implementation in Chrome (1440×1000, DPR 1, zoom 1, same profile and preferences). Before, canonical preflight made the document read-only; after, the pending Figure is editable and visibly incomplete. Both retain caption and `Figure 1`. The new frame uses existing muted text/surface tokens and a dashed boundary; no global control style or document typography changes.

| Before | After |
| --- | --- |
| ![Pending Figure at master 252de5c](assets/pending-figure-before.png) | ![Editable pending Figure with no-content frame](assets/pending-figure-after.png) |

Screenshots are manual presentation evidence. The `pending-figure` browser regression separately proves actual insertion/Apply/Source/history/Save/Reload and subsequent image connection; `layout-rules` and `quiet-document` check existing geometry and typography.

### Relative paths and load failure (#211)

The same clean `tmp/image-assets/paths.md` was opened before the fix at `2d5b2fb` and after it in this worktree's Vite server on port 5373. Both captures use the same checkout-specific persistent Chrome profile, 1440×1000 viewport, DPR 1, zoom 1, scroll top, no hovered/selected block and loaded Pretendard fonts. The first Figure uses `./assets/diagram.svg`, the second uses `assets/diagram.svg`, and the third uses the missing `assets/missing.png`. Before, the second and third showed broken images without an explanation. After, both valid sources load the same image and only the missing image shows an error Notice, with its caption retained.

| Before | After |
| --- | --- |
| ![Bare relative path and missing image fail silently](assets/relative-image-path-before.png) | ![Both relative paths load and the missing image has an error Notice](assets/relative-image-path-after.png) |

These captures are manual evidence, separate from the automated `image-assets` integration checks. The error Notice uses the existing danger text/surface/border and 14/20px UI type; it is visible at rest and adds no controls. The 375px collapsed-sidebar state was also inspected. The existing `figure-authoring`, `pending-figure`, `layout-rules` and `quiet-document` regressions protect properties, pending content and surrounding presentation.
