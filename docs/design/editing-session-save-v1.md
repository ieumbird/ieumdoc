# Editing session and Save v1

- Status: Implemented for #40, 2026-09-28.
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

## Evidence

Before the change, an actual browser Save replaced the editor, changed selection from 287 to 1, and changed `can().undo()` from true to false. `save-session.browser.js` exercises real scratch-file persistence across Save/history, transient content, delayed responses, rejection, conflict, draft preservation and reload. Existing Figure, table, Source and delayed-save scenarios cover their distinct integration risks. Run `pnpm browser:test save-session` or the complete CI suite described in [TEST_GUIDE](../test/TEST_GUIDE.md).
