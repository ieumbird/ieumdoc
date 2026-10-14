# Editing session and Save v1

- Status: Implemented
- Last verified: 2026-10-14 (#220 1차 저장 실패 위치·조치, split 문단·표 셀·저장 불가 문서·응답 확인 불가 안내와 기존 Save 보호 회귀).
- Boundaries: ADR-0001, ADR-0002, ADR-0003. Markdown remains the disk SSOT; Core operations and canonical validation remain the write path.

## Save acknowledgement

Open/New starts a session with the original Markdown, its Core read model and one Tiptap editor. Opening projection is initialized lazily once per keyed editor lifetime (StrictMode may verify the initializer twice); Open/New/Reload mount a new editor, while renders and Save retain it. `sourcePath` addresses that **opening snapshot**, not the latest disk positions. A successful Save updates the acknowledged revision and submitted editor snapshot; it does not remount the editor, rewrite its nodes or remap its history. ProseMirror owns selection and Undo/Redo, including edits that predate Save. Save closes the current history group so input typed while the request runs remains a subsequent undo event.

Extension and view option identities also remain stable for this keyed lifetime, preserving NodeViews that hold drafts across React rerenders. [Endnotes](footnotes-v1.md#editor) need no session state of their own: Core's snapshot already places them after the body, the displayed order is the saved order, and canonical write places them again.

Open/New return the source and editable model with canonical writeability and whether the source's endnotes are already in canonical place (`endnotesInPlace`); when not, the first Save moves them and the Editor says so before it. Save returns only the written revision; it does not return or project a replacement display model. Replay produces canonical Markdown through the same Core operations and final serializer used for Source and previously acknowledged edits. The final-state pending Figure rules remain distinct from operations' composable intermediate-state checks. Open/New still run canonical writeability preflight.

The HTTP Save/Source boundary requires a document path, a 64-character SHA-256 revision and `base.source`; `base.savedEdits`, when present, must be an edits object. Missing or malformed session fields and non-array edit collections are rejected with 400. A well-formed stale revision still produces 409. Internal file helpers can replay against a supplied disk snapshot without an HTTP session; this is not an alternate browser write route.

Save requests include the opening Markdown and the last accepted Core edit payload (`base.source`, `base.savedEdits`). The local Host first compares the requested revision with the actual disk. If the opening source differs from disk, replaying the previous edits through Core must reproduce the disk bytes exactly. Only then does it apply the new payload to the opening source through the existing Core operations and canonical writer. This permits saving Undo/Redo of insertions, deletions, splits, merges and table changes without turning snapshot paths into persistent identities. An arbitrary replacement source or stale checkpoint is rejected.

The Host stores no sessions. This request contract is a local adapter detail, not a backend architecture. Session acknowledgement itself introduces no semantic operation or CLI command. The extra replay costs another Core save evaluation on subsequent saves; it is performed on explicit Save/Source, never per keystroke.

## Applied content and drafts

- Empty newly inserted editor paragraphs and never-applied Equation placeholders stay in the session but are omitted from canonical output. A new Figure is not a placeholder: it is saved from insertion, empty or not. Filtering is shared by Save collection and dirty comparison. An emptied opening-snapshot paragraph, an empty heading or an invalid table still reports a save error.
- Equation/Figure/Table/section-label and block-source drafts are aggregated by kind and opening-snapshot locator; form values remain owned by their NodeViews. Changed drafts and pending source validation protect switching and beforeunload. Closing one draft does not clear another, including two kinds at the same locator.
- Equation/Figure Apply changes the main editor document. Unapplied form values survive Save and Source switching; neither operation applies them implicitly. Block notices and a standing message explain that only applied content is included. A remaining draft prevents the `Saved` display.
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

Open/New refuse while changes or drafts remain, including documents that cannot currently be saved. Reload reads the current file; dirty sessions first offer **Keep editing** or **Discard and reload**. Read failures preserve the old session. Document-switch dialogs remain modal while the request runs. Browser navigation/closing warns through `beforeunload` while work or an operation is pending; force-closing the browser is not durable draft recovery.

External changes retain the existing revision conflict check. The user can copy applied content from Source, keep editing, or explicitly reload from disk. This does not add automatic merging or an OS-level atomic compare-and-swap to the development adapter.

## Save shortcut and work-loss protection (#56)

Ctrl/Cmd+S runs the same Save as the button, with the same status, error and conflict messages, and never the browser's page save. It keeps focus, selection and history in the editor. While Open, New or Reload dialogs are open it does nothing, as the covered Save button would. The top bar's `Unsaved changes` status is the in-session indicator. The Save button shows the shortcut and declares it as `aria-keyshortcuts`.

Decision: no autosave and no local draft recovery for now.

- Autosave would turn every pause into a canonical write of the Git-tracked SSOT. It would also surface Save validation errors for half-typed content (empty blocks, incomplete tables), and conflicts with external edits, while the user is still typing. Writing to the document is an explicit user action in IeumDoc.
- Draft recovery would need durable storage of the editor session: the opening source, the acknowledged revision and edits, and the editor state keyed by snapshot locators. That is persistence, and `apps/editor/server` is a development adapter that must not grow into it. A recovered session would also need its own conflict rules against the current disk.
- `beforeunload` remains the guard against closing or navigating away with unsaved work. Revisit this decision together with the long-term persistence/backend design.

Desktop update restarts additionally ask the live Editor about unsaved content/drafts and pending Save/Source/assets/switching through the typed bridge. Missing answers, renderer failure and timeout refuse. The window closes normally before the installer starts, preserving `beforeunload` as a second guard. Ordinary quit never installs an update. This does not add autosave or recovery; see [Desktop updates](desktop-distribution-v1.md#update-lifecycle-and-work-protection).

The unload guard reads the latest rendered busy state. A completed Save must not keep blocking close with the previous Saving state while a passive-effect replacement is pending. The browser regression observes the first Saved DOM commit to protect this boundary without timing delays.

## Evidence

Before the change, an actual browser Save replaced the editor, changed selection from 287 to 1, and changed `can().undo()` from true to false. `save-session.browser.js` exercises real scratch-file persistence across Save/history, transient content, delayed responses, rejection, conflict, draft preservation and reload. Its composed Endnote/Figure case retains the scattered opening source through normalization, successive saves and Undo/Redo, changes reference order and a Figure's caption, and edits a definition while a real Save response is held. It compares complete Markdown, SHA-256 revisions, the previous accepted `savedEdits`, Source previews and unchanged Editor/selection across Save; Reload retains the empty Figure and the later definition edit. Core's existing footnote source and write-refusal tests also run after Figure caption parsing: nested MyST parsing must not leave the cached source tokenizer's tail rule enabled, losing definition provenance and dropped-definition checks. Existing Figure, table, Source and delayed-save scenarios cover their distinct integration risks. Run `pnpm browser:test save-session` or the complete CI suite described in [TEST_GUIDE](../test/TEST_GUIDE.md).
