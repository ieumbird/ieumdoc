# Editing session and Save v1

- Status: Implemented
- Last verified: 2026-10-08 (contract compared with current code and regression coverage).
- Boundaries: ADR-0001, ADR-0002, ADR-0003. Markdown remains the disk SSOT; Core operations and canonical validation remain the write path.

## Save acknowledgement

Open/New starts a session with the original Markdown, its Core read model and one Tiptap editor. `sourcePath` addresses that **opening snapshot**, not the latest disk positions. A successful Save updates the acknowledged revision and submitted editor snapshot; it does not remount the editor, rewrite its nodes or remap its history. ProseMirror owns selection and Undo/Redo, including edits that predate Save. Save closes the current history group so input typed while the request runs remains a subsequent undo event.

Save requests include the opening Markdown and the last accepted Core edit payload (`base.source`, `base.savedEdits`). The local Host first compares the requested revision with the actual disk. If the opening source differs from disk, replaying the previous edits through Core must reproduce the disk bytes exactly. Only then does it apply the new payload to the opening source through the existing Core operations and canonical writer. This permits saving Undo/Redo of insertions, deletions, splits, merges and table changes without turning snapshot paths into persistent identities. An arbitrary replacement source or stale checkpoint is rejected.

The Host stores no sessions. This request contract is a local adapter detail, not a backend architecture. No new semantic operation is introduced, so no new CLI command is needed. The extra replay costs another Core save evaluation on subsequent saves; it is performed on explicit Save/Source, never per keystroke.

## Applied content and drafts

- Empty newly inserted editor paragraphs and never-applied Equation/Figure placeholders stay in the session but are omitted from canonical output. Filtering is shared by Save collection and dirty comparison. An emptied opening-snapshot paragraph, an empty heading or an invalid table still reports a save error.
- Equation/Figure Apply changes the main editor document. Unapplied form values survive Save and Source switching; neither operation applies them implicitly. Block notices and a standing message explain that only applied content is included. A remaining draft prevents the `Saved` display.
- Save acknowledges precisely the submitted document. Later input or drafts remain dirty. Failure acknowledges nothing. The Host writes a temporary file beside the destination, checks the disk revision again, and renames the completed file into place. A validation, conflict or partial-write failure preserves the original. Content-operation errors carry their block locator so the Editor can show the submitted block number and reason.
- Source renders applied session content through Core. It can be copied after an external conflict: the Host validates the session's acknowledged revision without writing or requiring the latest disk contents to match. It is never a raw Markdown write route.

## Switching and recovery

Open/New refuse while changes or drafts remain, including documents that cannot currently be saved. Reload reads the current file; dirty sessions first offer **Keep editing** or **Discard and reload**. Read failures preserve the old session. Document-switch dialogs remain modal while the request runs. Browser navigation/closing warns through `beforeunload` while work or an operation is pending; force-closing the browser is not durable draft recovery.

External changes retain the existing revision conflict check. The user can copy applied content from Source, keep editing, or explicitly reload from disk. This does not add automatic merging or an OS-level atomic compare-and-swap to the development adapter.

## Save shortcut and work-loss protection (#56)

Ctrl/Cmd+S runs the same Save as the button, with the same status, error and conflict messages, and never the browser's page save. It keeps focus, selection and history in the editor. While Open, New or Reload dialogs are open it does nothing, as the covered Save button would. The top bar's `Unsaved changes` status is the in-session indicator. The Save button shows the shortcut and declares it as `aria-keyshortcuts`.

Decision: no autosave and no local draft recovery for now.

- Autosave would turn every pause into a canonical write of the Git-tracked SSOT. It would also surface Save validation errors for half-typed content (empty blocks, incomplete tables), and conflicts with external edits, while the user is still typing. Writing to the document is an explicit user action in IeumDoc.
- Draft recovery would need durable storage of the editor session: the opening source, the acknowledged revision and edits, and the editor state keyed by snapshot locators. That is persistence, and `apps/editor/server` is a development adapter that must not grow into it. A recovered session would also need its own conflict rules against the current disk.
- `beforeunload` remains the guard against closing or navigating away with unsaved work. Revisit this decision together with the long-term persistence/backend design.

## Evidence

Before the change, an actual browser Save replaced the editor, changed selection from 287 to 1, and changed `can().undo()` from true to false. `save-session.browser.js` exercises real scratch-file persistence across Save/history, transient content, delayed responses, rejection, conflict, draft preservation and reload. Existing Figure, table, Source and delayed-save scenarios cover their distinct integration risks. Run `pnpm browser:test save-session` or the complete CI suite described in [TEST_GUIDE](../test/TEST_GUIDE.md).
