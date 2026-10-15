# Editing session and Save v1

- Status: Implemented
- Last verified: 2026-10-15 (#275 Equation/Figure/Table/section-label Apply/typing, retained caption/cell caret, history/Source and real Save/Reload browser regressions; ADR-0006 draft contract cleanup by code/test comparison). Previous verification: 2026-10-14 (#220 1차 저장 실패 위치·조치, split 문단·표 셀·저장 불가 문서·응답 확인 불가 안내와 기존 Save 보호 회귀).
- Boundaries: ADR-0001, ADR-0002, ADR-0003. Markdown remains the disk SSOT; Core operations and canonical validation remain the write path.
- Switching verification: 2026-10-15 (#291: Open/New confirmation, Save failure/conflict, draft retention/loss, pending work and focus browser regressions; real Vite New and production HTTP Save/reopen; 1440/375px dialog captures reviewed, final visual approval remains with the user).
- Encoding verification: 2026-10-15 (#271 Source/Save invalid-Unicode and request UTF-8 refusal; Vite/production HTTP repeated valid Unicode Save → Reload and external-conflict regressions).

## Save acknowledgement

Open/New starts a session with the original Markdown, its Core read model and one Tiptap editor. Opening projection is initialized lazily once per keyed editor lifetime (StrictMode may verify the initializer twice); Open/New/Reload mount a new editor, while renders and Save retain it. `sourcePath` addresses that **opening snapshot**, not the latest disk positions. A successful Save updates the acknowledged revision and submitted editor snapshot; it does not remount the editor, rewrite its nodes or remap its history. ProseMirror owns selection and Undo/Redo, including edits that predate Save. Save closes the current history group so input typed while the request runs remains a subsequent undo event.

Extension and view option identities also remain stable for this keyed lifetime, preserving NodeViews that hold drafts across React rerenders. [Endnotes](footnotes-v1.md#editor) need no session state of their own: Core's snapshot already places them after the body, the displayed order is the saved order, and canonical write places them again.

Open/New return the source and editable model with canonical writeability and whether the source's endnotes are already in canonical place (`endnotesInPlace`); when not, the first Save moves them and the Editor says so before it. Save returns only the written revision; it does not return or project a replacement display model. Replay produces canonical Markdown through the same Core operations and final serializer used for Source and previously acknowledged edits. The final-state pending Figure rules remain distinct from operations' composable intermediate-state checks. Open/New still run canonical writeability preflight.

The HTTP Save/Source boundary requires a document path, a 64-character SHA-256 revision and `base.source`; `base.savedEdits`, when present, must be an edits object. Missing or malformed session fields and non-array edit collections are rejected with 400. A well-formed stale revision still produces 409. Internal file helpers can replay against a supplied disk snapshot without an HTTP session; this is not an alternate browser write route.

Malformed UTF-8 document files/request bodies and unpaired Unicode surrogates in applied content are rejected without a Save acknowledgement or file replacement. Source uses the same Core Unicode validation as Save. Valid Korean, emoji and literal U+FFFD retain their actual UTF-8 bytes; revisions match those bytes, so a subsequent Save does not create a false external-change conflict.

Save requests include the opening Markdown and the last accepted Core edit payload (`base.source`, `base.savedEdits`). The local Host first compares the requested revision with the actual disk. If the opening source differs from disk, replaying the previous edits through Core must reproduce the disk bytes exactly. Only then does it apply the new payload to the opening source through the existing Core operations and canonical writer. This permits saving Undo/Redo of insertions, deletions, splits, merges and table changes without turning snapshot paths into persistent identities. An arbitrary replacement source or stale checkpoint is rejected.

The Host stores no sessions. This request contract is a local adapter detail, not a backend architecture. Session acknowledgement itself introduces no semantic operation or CLI command. The extra replay costs another Core save evaluation on subsequent saves; it is performed on explicit Save/Source, never per keystroke.

## Applied content and drafts

- Empty newly inserted editor paragraphs and never-applied Equation placeholders stay in the session but are omitted from canonical output. A new Figure is not a placeholder: it is saved from insertion, empty or not. Filtering is shared by Save collection and dirty comparison. An emptied opening-snapshot paragraph, an empty heading or an invalid table still reports a save error.
- Equation/Figure/Table/section-label drafts are aggregated by kind and opening-snapshot locator; form values remain owned by their NodeViews. Changed property drafts protect switching and beforeunload, including changed Figure values while Apply validation is pending. Closing one draft does not clear another, including two kinds at the same locator.
- Equation/Figure Apply changes the main editor document. Unapplied form values survive Save and Source switching; neither operation applies them implicitly. Block notices and a standing message explain that only applied content is included. A remaining draft prevents the `Saved` display.
- Closing Equation/Figure/Table/section-label properties retains a text selection inside the block, otherwise returning an engine caret after it. Typing immediately after Apply preserves the block and its references. Focus restoration itself adds no content or history; see [Continuous editing](document-editing-v1.md#continuous-editing).
- A pending Figure, with or without caption or label, is included in Save/Source and restored on Reload. Apply → Undo → Redo restores both the Figure and collected payload. Insertion, Apply and subsequent image connection follow [Figure authoring](figure-authoring-v1.md). Save acknowledgement still covers only the submitted applied snapshot, including when an image is connected while a Save is in flight.
- Save acknowledges precisely the submitted document. Later input or drafts remain dirty. Failure acknowledges nothing. The Host replaces the file through the [File commit](filesystem-host-boundary-v1.md#file-commit-v1) shared with the CLI: it writes a temporary file beside the destination, checks the disk revision again, and renames the completed file into place. A validation, conflict, partial-write or rename failure preserves the original. A file without write permission is refused. Content-operation errors carry their block locator so the Editor can show the submitted block number and reason.
- Source renders applied session content through Core. It can be copied after an external conflict: the Host validates the session's acknowledged revision without writing or requiring the latest disk contents to match. It is never a raw Markdown write route.

## Save failure guidance (#220, phase 1)

Save reports the first encountered failure in the existing message area: the submitted block
number/kind, the reason and a correction or recovery action. The reason identifies the cause;
the separate action supplies the correction without repeating it in the reason. Core-provided
source line numbers survive Host replay and final serialization failures and appear alongside
the submitted block location; they refer to source positions, not current rendered lines.
Editor collection preserves block and, when identified, table row/column coordinates even when
it fails before sending a request.
Host replay carries opening-snapshot locators; the Editor resolves them against the submitted
snapshot, including split paragraphs, inserted blocks and moved table cells. A final Core write
issue refers to the replayed document and is mapped back to that submitted snapshot. Later input
never changes the reported location. Document-wide failures remain document-wide when no
specific location was identified; unknown exceptions offer inspection/reporting guidance rather
than asserting a user-content cause.

The Host returns additive `failure` information (phase/action/location) alongside the existing
`error`/`target` fields. Revision conflicts, file access/write failures and request failures are
distinct from content failures. A missing/unreadable response or invalid acknowledgement leaves
Save unacknowledged and says that the file may already have been saved; inspect the disk version
before deciding to save again or discard/reload. Failures keep local edits, drafts and history.
This phase adds no persistent logs, diagnostics history, report export or automatic retry.

## Switching and recovery

Opening another sidebar document or choosing the folder's New file (`+`) with unsaved changes or unapplied drafts offers one **Save / Don't save / Cancel** dialog, following [ADR-0007 section 4](../adr/0007-editing-session-lifetime.md#4-미저장-작업-처리는-하나의-확인-대화상자를-재사용한다). Save uses the existing Save path and continues only after success. A content rejection, conflict or other Save failure closes the confirmation, keeps the session and shows the existing Save error/conflict UI. Don't save continues without writing the current file. Cancel, Escape and outside dismissal leave the session unchanged and return focus to the invoking control. A draft notice explicitly says that both Save and Don't save lose unapplied property drafts; Save includes applied content only.

New continues to the existing filename/location dialog after confirmation. Cancelling that dialog or failing to create a file retains the current session (a successful Save is still saved). The current session and drafts are replaced only after the chosen document opens or creation succeeds. Busy, Source-pending and asset-pending operations still refuse switching. The confirmation stays modal with disabled actions during Save/Open; shortcuts cannot bypass it. Successful Open focuses the document, and New retains its existing successful focus handoff.

Reload reads the current file; dirty sessions still offer **Keep editing** or **Discard and reload**. Read failures preserve the old session. Document-switch dialogs remain modal while the request runs. Browser navigation/closing warns through `beforeunload` while work or an operation is pending; force-closing the browser is not durable draft recovery. Tabs, Desktop close/update behavior and recovery are outside #291; the confirmation component is reusable without owning those actions or document semantics, so this Editor interaction adds no Core operation or CLI command.

External changes retain the existing revision conflict check. The user can copy applied content from Source, keep editing, or explicitly reload from disk. This does not add automatic merging or an OS-level atomic compare-and-swap to the development adapter.

## Save shortcut and work-loss protection (#56)

Ctrl/Cmd+S runs the same Save as the button, with the same status, error and conflict messages, and never the browser's page save. It keeps focus, selection and history in the editor. While Open, New or Reload dialogs are open it does nothing, as the covered Save button would. The top bar's `Unsaved changes` status is the in-session indicator. The Save button shows the shortcut and declares it as `aria-keyshortcuts`.

Current behavior: no autosave and no local draft recovery. `beforeunload` is the guard against closing or navigating away with unsaved work. [ADR-0007](../adr/0007-editing-session-lifetime.md)'s shared Save / Don't save / Cancel confirmation is implemented for Open/New above. Its remaining direction is an opt-in autosave setting (off by default) through the same Save path, local work recovery kept apart from the file and from `apps/editor/server`, and multi-document tabs with independent sessions. This contract changes as each follow-up is implemented.

Desktop update restarts additionally ask the live Editor about unsaved content/drafts and pending Save/Source/assets/switching through the typed bridge. Missing answers, renderer failure and timeout refuse. The window closes normally before the installer starts, preserving `beforeunload` as a second guard. Ordinary quit never installs an update. This does not add autosave or recovery; see [Desktop updates](desktop-distribution-v1.md#update-lifecycle-and-work-protection).

The unload guard reads the latest rendered busy state. A completed Save must not keep blocking close with the previous Saving state while a passive-effect replacement is pending. The browser regression observes the first Saved DOM commit to protect this boundary without timing delays.

## Evidence

For #291, the unmodified `ae464b7` Editor reproduced the draft information bar plus the red Open refusal, with that refusal still present after cancelling the property draft. At 1440×800 and 375×800 the two header bars were stacked without geometric overlap. The new confirmation does not create this refusal error; Cancel/Escape preserve content, selection, undo availability and drafts. Existing unrelated errors remain until dismissed or resolved. `open-files` covers these transitions, pending Save/Open, Save failure/conflict and the draft-only case; `writeability-preflight` checks that a failed target Open also keeps the old work. `new-document`, `save-session` and `http-host` exercise real creation, content rejection and persisted Save/reopen. Baseline images are `tmp/291-before-*-draft-refusal.png` and `tmp/291-before-*-after-draft-cancel.png`; `pnpm browser:test open-files --screenshots` captures the new dialog in `tmp/291-dialog-{1440,375}-{no-drafts,drafts}.png` (100% zoom, DPR 1, bundled Pretendard, Windows Chrome).

For #275, the unmodified `5594143` Editor was reproduced with `math.md`: Edit the
labeled `eq-a` Equation, change `x` to `x + 1`, Apply, then type `Typed275` without
another click. Apply left `{type: "node", anchor: 102}` focused in the document;
typing replaced the Equation with a paragraph. Source lost the math directive but
retained `{eq}` pointing to `eq-a`, and its chip changed from resolved to unresolved.
Apply click, Enter on Apply and Enter in Label all reproduced it, with and without
renaming the label. A different label deliberately leaves the old reference
unresolved already at Apply; this is distinct from the subsequent node loss.
Ctrl+Enter in LaTeX did not submit the form. The existing `focusBlock` selected the
atom on form close; restoring an engine text/gap caret fixes that interaction
without changing Core semantics or adding a CLI operation. The
`equation-save-during-edit` browser regression failed on the original code and now
covers immediate typing at middle/end/sole Equations, a reference-preserving label
case change, Undo/Redo before and after Save, Source equality with disk and Reload.

Review follow-up on `1b76abb` reproduced the same loss for Figure, Table and section
label properties. With a caret in unrelated prose, Edit → Apply click or Enter →
typing left a whole-block NodeSelection, replaced that target with prose, and
made its `{numref}`/`{ref}` unresolved. Cancel and Escape had the same result.
Table-cell selections survived all three closing paths; Figure-caption selections
survived Cancel/Escape, but Apply replaced even an unchanged caption and mapped
its caret out of the Figure. The shared close rule now retains only an internal
text selection, otherwise returning a text/gap caret after the block. Figure
Apply uses the existing attribute-only transaction when its caption is unchanged.
`property-drafts` covers both Apply methods with Figure caption, Table grid/cell
and section-label/heading/reference checks; its Cancel/Escape cases retain the
unchanged document. `figure-authoring` covers formatted caption caret/typing and
Save/Reload, as well as validation finishing after focus has moved elsewhere.
This is still Editor interaction only, with no new Core operation or CLI command.

Before the change, an actual browser Save replaced the editor, changed selection from 287 to 1, and changed `can().undo()` from true to false. `save-session.browser.js` exercises real scratch-file persistence across Save/history, transient content, delayed responses, rejection, conflict, draft preservation and reload. Its composed Endnote/Figure case retains the scattered opening source through normalization, successive saves and Undo/Redo, changes reference order and a Figure's caption, and edits a definition while a real Save response is held. It compares complete Markdown, SHA-256 revisions, the previous accepted `savedEdits`, Source previews and unchanged Editor/selection across Save; Reload retains the empty Figure and the later definition edit. Core's existing footnote source and write-refusal tests also run after Figure caption parsing: nested MyST parsing must not leave the cached source tokenizer's tail rule enabled, losing definition provenance and dropped-definition checks. Existing Figure, table, Source and delayed-save scenarios cover their distinct integration risks. Run `pnpm browser:test save-session` or the complete CI suite described in [TEST_GUIDE](../test/TEST_GUIDE.md).
