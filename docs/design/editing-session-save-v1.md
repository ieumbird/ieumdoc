# Editing session and Save v1

- Status: Implemented
- Last verified: 2026-10-24 (#391 review: nested outside-click dismissal and pending guards, refreshed captures with environment metadata; final validation recorded in the PR).
- Previous verification: 2026-10-24 (#382: explicit record/all-record deletion confirmations; Editor tests, typecheck/build and recovery browser checks including cancellation/focus and Korean/English 1440/375px captures).
- Previous verification: 2026-10-23 (Save shortcut recovery summary reconciled with the Host persistence verification below; documentation comparison only).
- Previous verification: 2026-10-22 (#331: actual engine-created deletion sentinel, structured Vite New/Reload/Restore/Save and Windows production HTTP crash/Restore/Save/Reload/conflict; readable fallback and open-dialog Korean/English reason changes).
- Previous verification: 2026-10-16 (#296 PR3: actual Windows packaged Desktop and production HTTP/Chrome process termination, same-profile restart, restore, Save/Reload and external-conflict preservation; Desktop normal close and pending Figure. Linux HTTP remains a required CI check).
- Previous verification: 2026-10-16 (#296 PR2: client IndexedDB and recovery UI; actual Vite persistence/restore/Save/Reload, multiwindow conflict and failure checks).
- Previous verification: 2026-10-16 (#296 PR1: recovery-capable initialization, Editor snapshot tests and initialization/Save replay browser regression).
- Previous verification: 2026-10-16 (#204: independent tabs, Close and all-tabs guards; see the [review](../reviews/document-tabs-204-2026-10-16.md) for exact validation and approved visuals).
- Previous verification: 2026-10-16 (#204 PR 1: session ownership, stale-completion unit checks, Editor/Desktop tests, typecheck/build and 16 existing browser scenarios for Open/New, Save/Reload, Source, drafts/assets, outline and Desktop guards).
- Previous verification: 2026-10-15 (#275 Equation/Figure/Table/section-label Apply/typing, retained caption/cell caret, history/Source and real Save/Reload browser regressions; ADR-0006 draft contract cleanup by code/test comparison). Previous verification: 2026-10-14 (#220 1차 저장 실패 위치·조치, split 문단·표 셀·저장 불가 문서·응답 확인 불가 안내와 기존 Save 보호 회귀).
- Boundaries: ADR-0001, ADR-0002, ADR-0003. Markdown remains the disk SSOT; Core operations and canonical validation remain the write path.
- Switching verification: 2026-10-15 (#291: Open/New confirmation, Save failure/conflict, draft retention/loss, pending work and focus browser regressions; real Vite New and production HTTP Save/reopen; 1440/375px dialog captures reviewed, final visual approval remains with the user).
- PR #301 review verification: 2026-10-15 (delayed Save with programmatically injected applied edits stops Open/New, retains the session and drafts, shows the existing Unsaved changes status, and allows an explicit retry; original `c8aecd9` failed this regression).
- Encoding verification: 2026-10-15 (#271 Source/Save invalid-Unicode and request UTF-8 refusal; Vite/production HTTP repeated valid Unicode Save → Reload and external-conflict regressions).

## Editor ownership

The Editor-internal [`useDocumentSession`](../../apps/editor/src/useDocumentSession.ts) owns one document's path, opening read model and
source, acknowledged revision and `savedEdits`, Source content/view, status/errors/notices,
draft/asset/dirty flags, heading numbering, outline store and keyed `DocumentEditor` lifetime.
It handles Save, Source, Reload and image selection. Each mounted `DocumentTab` owns one hook
and `DocumentEditor`; only the active tab is visible. `App` owns startup and Open/New requests,
the normalized-path tab list, folder tree, preferences, shared header/outline, Desktop integration
and the shared **Save / Don't save / Cancel** close dialog. A tab is added only after Host success.
Opening a Host-returned path already in the list activates its existing session without replacing it.
The Desktop first document and an explicitly chosen sample enter through this same first-tab flow.

Async completions and editor callbacks belong to the session and editor generation that
started them, using a small per-instance [lifetime guard and request module](../../apps/editor/src/document-session.ts). Replacing the document or disposing the session invalidates old completions;
Save acknowledges its captured editor and opening base only. A superseded Open cannot
replace a newer result. Unused copied images retain their original document's rollback
receipt. This is an Editor lifetime boundary, not a Host session or a new Core operation;
there is no CLI command to add. Every tab retains its own opening snapshot, acknowledged revision,
Source view, editor history and drafts. No tab limit or automatic eviction is imposed.

## Save acknowledgement

Label property Apply (#374) uses Core's [label rename plan](section-references-v1.md#editor)
against the live target/reference context and commits the properties and reference attributes in
one engine transaction. Collection submits those final reference contents alongside label deltas.
Replay assigns labels without another reference rewrite, preserving manual retargeting made after
Apply and avoiding a second rename based on the opening snapshot. Save acknowledgement retains
this history, so Undo/Redo across Save restores the coupled label/reference change.

Open/New starts a session with the original Markdown, its Core read model and one Tiptap editor. Opening projection is initialized lazily once per keyed editor lifetime (StrictMode may verify the initializer twice); Open/New/Reload mount a new editor, while renders and Save retain it. `sourcePath` addresses that **opening snapshot**, not the latest disk positions. A successful Save updates the acknowledged revision and submitted editor snapshot; it does not remount the editor, rewrite its nodes or remap its history. ProseMirror owns selection and Undo/Redo, including edits that predate Save. Save closes the current history group so input typed while the request runs remains a subsequent undo event.

Extension and view option identities also remain stable for this keyed lifetime, preserving NodeViews that hold drafts across React rerenders. [Endnotes](footnotes-v1.md#editor) need no session state of their own: Core's snapshot already places them after the body, the displayed order is the saved order, and canonical write places them again.

Open/New return the source and editable model with canonical writeability and whether the source's endnotes are already in canonical place (`endnotesInPlace`); when not, the first Save moves them and the Editor says so before it. Save returns only the written revision; it does not return or project a replacement display model. Replay produces canonical Markdown through the same Core operations and final serializer used for Source and previously acknowledged edits. The final-state pending Figure rules remain distinct from operations' composable intermediate-state checks. Open/New still run canonical writeability preflight.

The HTTP Save/Source boundary requires a document path, a 64-character SHA-256 revision and `base.source`; `base.savedEdits`, when present, must be an edits object. Missing or malformed session fields and non-array edit collections are rejected with 400. A well-formed stale revision still produces 409. Internal file helpers can replay against a supplied disk snapshot without an HTTP session; this is not an alternate browser write route.

Malformed UTF-8 document files/request bodies and unpaired Unicode surrogates in applied content are rejected without a Save acknowledgement or file replacement. Source uses the same Core Unicode validation as Save. Valid Korean, emoji and literal U+FFFD retain their actual UTF-8 bytes; revisions match those bytes, so a subsequent Save does not create a false external-change conflict.

Save requests include the opening Markdown and the last accepted Core edit payload (`base.source`, `base.savedEdits`). The local Host first compares the requested revision with the actual disk. If the opening source differs from disk, replaying the previous edits through Core must reproduce the disk bytes exactly. Only then does it apply the new payload to the opening source through the existing Core operations and canonical writer. This permits saving Undo/Redo of insertions, deletions, splits, merges and table changes without turning snapshot paths into persistent identities. An arbitrary replacement source or stale checkpoint is rejected.

The Host stores no sessions. This request contract is a local adapter detail, not a backend architecture. Session acknowledgement itself introduces no semantic operation or CLI command. The extra replay costs another Core save evaluation on subsequent saves; it is performed on explicit Save/Source, never per keystroke.

## Recovery snapshot initialization

`DocumentEditor` accepts an optional internal `EditorSnapshot`: current `editorDocument` and
last acknowledged `savedDocument`. Its snapshot handle copies both without exposing mutable
internal state. Normal Open/New is unchanged. The opening read-model projection remains the
structure guard's baseline; restored current content does not become the saved baseline.
The deletion plugin starts with the current snapshot's declared deletions. All three new-block
locator allocators reserve values from both snapshots, including locators found only in the
saved snapshot; existing locators are never renumbered. Reservation validates all paths in both
snapshots before updating any allocator counter, so a rejected restore leaves subsequent allocation
unchanged.

`useDocumentSession` can capture and initialize this state together with the opening source/read
model, path, acknowledged revision, last accepted `savedEdits` and existing endnote-placement
notice. The collector still uses the opening model and current engine JSON. Save acknowledgement
still advances only the submitted snapshot; a snapshot captured during Save contains the previous
acknowledgement until success, and failure changes neither checkpoint. Reload clears the internal
restored initializer only after a successful read.

Initialization accepts the current Editor schema only. It checks schema content, lossless retention
of supplied fields/marks, opening locators and declared deletion metadata; it throws an explicit
`Incompatible editor snapshot` error instead of dropping unsupported content. It does not run the
canonical collector/writer as a restore gate: empty headings, duplicate labels and invalid Unicode
can remain applied editor content and still fail Save. Schema-compatible initialization is not a
claim that arbitrary old/future JSON or inconsistent source/revision/edit checkpoints are recoverable.
One compatibility exception (#331) removes the empty string from `deletedPaths` in both current and
saved snapshots, without mutating the record. Earlier engine normalization recorded its temporary
empty `sourcePath` as a deletion when assigning a new block locator; real title Enter and paragraph
insertion reproduce that record. The empty string addresses no opening block. All other deletion
entries, missing deletions, locators, schema content and supplied fields still receive the same checks.
The producer now excludes this temporary locator from deletion tracking. There is no general
migration or content repair. The existing Host replay and canonical checks still govern Save.

Pending image-less Figures are applied content. Snapshots exclude Undo history, selection/scroll,
unapplied property drafts, in-flight requests and image binary backups. Autosave remains deferred
(#297). No Core/Host semantics change or new CLI operation is needed: this initializes an existing
Editor session and adds client-local persistence, not a new document semantic operation.

## Local recovery records (#296 PR2)

The client records applied dirty work in IndexedDB (`ieumdoc-recovery`) in the current browser/app
profile and origin. The original Markdown remains the SSOT. Records contain a format version,
independent session identifier, Host-normalized path, recording time, independent plaintext recovery copy,
and the PR1 snapshot: current/saved engine documents (including deletion metadata and new locators),
opening source/read model, acknowledged revision and `savedEdits`. Canonical validation is not a
recording gate. Unsaveable applied content and pending Figures remain recoverable.

An applied editor update schedules a write after 500ms; continued typing does not postpone that
first turn indefinitely. Each session serializes writes and captures its **live** snapshot at the
actual IndexedDB write turn, rechecking applied dirtiness then. Save success with newer applied
edits schedules recording against the newly acknowledged revision and saved baseline. A clean Save
deletes only that session's record. Recording failures never block input, Save or closing; a standing
message identifies the failure. Recovery and original Save are separate operations with no atomicity
claim. Input after the last successful record can be lost, including on normal close.
The 500ms interval is scheduling, **not a durability deadline**. The prior final-v3 two-page ticket
measurement (p95 about 2.4s) remains a known limitation, not a guarantee or a new PR3 measurement.

Each update shares its current applied projection/serialization between dirty reporting and applied-change
notification; the saved baseline is still read live, including after Save acknowledgement. Each applied
edit registers its own barrier ticket in a **barriers-only readwrite** transaction. Ticket acquisition is
not coalesced or deferred to the recording timer: the latest edit must be ordered against cross-window
deletion, even when a pre-clear and post-clear edit share a scheduled write.

Records expire **10 days after the last recording**, at the next startup or list/cleanup operation.
Normal browser/Desktop window close keeps existing records and the normal close guards. Tab
**Don't save**, a successful **Reload**, and explicit **Delete record** remove the corresponding
record; failed Reload retains it. A clean tab close also removes any obsolete record for that session.
Deleting, expiring or clearing uses persisted generation barriers in the same IndexedDB transaction as record
removal; a stale queued write cannot resurrect deleted work, even in another window. **Clear all**
removes current records and invalidates scheduled writes. Save, selection, drafts and a timer do not
resume recording; only a subsequent applied edit obtains a new recording ticket. Other open windows'
later applied edits may create new records. Clearing never alters open content or original files.

Tickets have a **10-day wall-clock upper lifetime** from acquisition. A write whose current timestamp
is at least 10 days after acquisition is refused; a backwards correction (negative age) does not reject
an otherwise valid ticket or require another edit for its scheduled recording. Forward corrections can
make expiry due sooner, while backwards corrections can delay it; this is not an elapsed-time guarantee.
For an expired ticket,
only another applied edit acquires fresh permission, not a Save checkpoint. A write requires an existing
stored session nonce that exactly matches its ticket. Deletion removes that nonce atomically with the
record; a later edit registers a fresh nonce. Missing metadata never grants permission, independently of
clock rollback between acquisition and deletion or a suspended writer resuming after GC.
There are no deletion tombstones or expiry watermark. Idle registrations expire on list/cleanup 10 days
after the latest ticket timestamp; a backwards clock cannot shorten their existing expiry. GC removes
expired registrations without advancing the Clear-all generation or invalidating another session's
unexpired pending edit. Never-edited sessions create no metadata on close. Retention is time bounded,
not a fixed byte/count quota; wall-clock adjustments can change when cleanup becomes due.
IndexedDB protocol version 3 preserves record payloads and removes obsolete v1/v2 barrier metadata.
Existing older connections close on version change; their version-pinned reopen is refused, so unsafe
readonly-protocol writers cannot coexist after upgrade. They need a reload to record again.
This is a storage-protocol upgrade, not document snapshot migration.
The prior readwrite-count reduction claim (60 to 10) is withdrawn: every applied edit again uses a
write transaction, limited to barriers. Current-document serialization sharing remains unchanged.

Explicit **Delete record** opens the shared Editor Dialog confirmation, identifying the record's
full document path (or Unknown document for malformed metadata) and warning that deletion cannot
be undone. This applies both from the start screen and when opening a matching document, including
incompatible records. **Cancel**, Escape and outside dismissal preserve the record and return focus
to Delete record. **Settings → Clear all** uses the same confirmation surface, identifies all local
records and warns that deletion cannot be undone; cancellation returns focus to its original button.
Cancel receives initial focus; pending deletion disables actions and dismissal. Save, Don't save,
Reload, expiry and the tab-close deletion-retry notice retain their existing behavior. These are
Editor-local interactions, with no Core semantic operation or CLI parity requirement (#382, #379).

#382 visual evidence uses the same recorded document and viewport before requesting deletion and
with the new confirmation open (the former immediate-delete behavior had no confirmation surface):
[review at 1440px](assets/recovery-382/prompt-1440.png),
[confirmation at 1440px](assets/recovery-382/delete-confirm-1440.png),
[review at 375px](assets/recovery-382/prompt-375.png),
[confirmation at 375px](assets/recovery-382/delete-confirm-375.png),
[Korean confirmation at 375px](assets/recovery-382/delete-confirm-ko-375.png),
[Clear all at 375px](assets/recovery-382/clear-confirm-375.png).
Capture refresh for the #391 review: product/test HEAD
`b46c13d0f85ca4cddc9e4afe361eabc1b7ce61b1` (latest master merged), Windows Chrome,
checkout-owned persistent profile, Vite `http://127.0.0.1:5173`, 1440×900 and 375×900,
DPR 1 / 100% zoom, scroll top, the same recovery record before deletion and with the
confirmation open. Korean capture changes only the UI language while that dialog stays open.
Bundled Pretendard Variable 1.3.9 and the existing product font stack are unchanged;
each capture waits for `document.fonts.ready`. The nested confirmation now has its own
Base UI backdrop, dimming/blurring the parent while keeping only the top dialog interactive.
The pre-existing narrow parent recovery-review clipping is outside this change.

The recovery scenario checks confirmed deletion, Cancel/Escape preservation and focus return,
all-record cancellation, outside-click dismissal of only the top confirmation at both entry points,
pending outside-click refusal at both entry points, live Korean/English target and warning text,
and popup content bounds.

The start screen lists records newest first, with document name/path/time and **Review recovery**.
Opening a matching document proposes the latest record. **Not now** keeps it. **Restore work**
preflights the existing PR1 schema initializer, then moves the selected record transactionally to a
new session identifier before mounting it as unsaved work. A changed/deleted record must be reviewed again;
a dirty or busy open tab cannot be silently replaced. Another live window retains its own session
identity and its next edit may record again. No automatic merge occurs. A Save only deletes its own
session identifier, never another window's record. The restored acknowledged revision still governs Save,
so external edits conflict through the existing Host path.

An incompatible format, malformed checkpoint or unsupported editor schema displays its reason.
Application-owned recovery reasons follow the selected Korean/English UI language, including while
the dialog is open; external engine diagnostics remain literal technical details.
The separately stored plaintext remains available in a selectable text area and **Copy text**;
**Delete record** remains available. There is no migration framework or canonical repair. Clipboard
failure leaves the selectable text intact. The shared Sidebar **Settings → Local recovery** explains
location, retention, deletion, exclusions and guarantee limits, and confirms **Clear all**. Desktop
About/update controls remain Desktop-only.

Newly recorded plaintext copies contain readable text, LaTeX, table cells/captions, Figure captions,
image descriptions/paths and link destinations, without generic internal attribute/mark dumps.
They are content salvage only: no structure, formatting or valid native document is promised, and
they never enter the official Save path automatically. Previously stored plaintext remains verbatim;
no heuristic strips bracketed strings from an old copy, since those may be user text. The snapshot
compatibility exception above can restore affected structured records independently of that old copy.

`recovery-storage` tests real IndexedDB write ordering/barriers, expiry, stale restore and quota
failure; `recovery` exercises the actual UI and real files, normal page/window lifetime, multiwindow
isolation, conflict, failed Reload, unsaveable content, clearing and plaintext fallback. Run
`pnpm browser:test recovery --screenshots` for review captures in `tmp/296/` at 1440×900 and 375×900.
`recovery-structure` starts with New and title/Enter input, inserts Equation/Table/Figure through
production editor commands, then checks recorded structure, Restore/dirty/Save/Reload, refusal of
unknown deletions, readable fallback and live reason-language changes. `--screenshots` captures its
recovery dialog/fallback in `tmp/331-*.png`. The original Linux #331 record was not obtained;
Windows reproduction establishes the current producer defect and an equivalent record, not the
cause of every historical Save-disabled report or a repair of previously flattened disk text.
Those Vite checks are distinct from the Host process-lifetime checks below.

Visual evidence re-captured on 2026-10-22 after review found that the earlier temporary prompt
images preceded the dialog and did **not** prove its state. The following replacements were
inspected with the dialog visible and Restore's enabled/disabled state checked before capture:

- [Prompt before](assets/recovery-331/prompt-before.png): the real New/title/Enter flow generated
  the empty deletion sentinel; Restore is disabled with the deletion-metadata reason.
- [Prompt after](assets/recovery-331/prompt-after.png): the same writing/reopen flow with fixed
  production code offers enabled Restore.
- [Fallback before](assets/recovery-331/fallback-before-en.png) and
  [fallback after](assets/recovery-331/fallback-after-en.png): a test-owned record with unknown
  deletion path `999` is refused in both. The copy shows the old attribute dump versus readable
  math, table cells/caption and Figure caption.
- [Korean fallback](assets/recovery-331/fallback-after-ko.png): the same open refusal dialog after
  switching language, retaining the disabled Restore action and readable copy.

Comparison conditions: Windows Chrome, checkout-owned persistent profile, Vite origin
`http://127.0.0.1:5191`, 1280×1000 viewport, DPR 1, bundled fonts loaded. Product HEAD was
`7e62ee22aba6477a067bef4f42f16309eb0afa73`; the capture-only scenario changes are included with
these images. For prompt-before, only `editor-schema.tsx` and `editor-snapshot.ts` were temporarily
replaced with `811a5662a2c69d804b0d0f419f2d84a4b4df054d` versions; the temporary scenario asserted
disabled Restore and stopped after capture. For fallback-before, only `recovery-storage.ts` used
that older version: **it shows the new guidance with the old producer, not the complete baseline
UI**. Each temporary replacement was restored and `git diff --exit-code -- apps/editor/src`
passed before final regression. Test-created filenames differ between runs; content and steps match.
All fallback images enlarge the textarea to 420px and scroll it to the top **for capture only**;
this is not the product's default control height or a stylesheet change. The after images expose
the complete sample copy; the longer old dump still continues below its viewport. No user records
or user browser profile were accessed. Final `recovery-structure --screenshots` passed; the two
before runs intentionally stopped at the confirmed refusal or internal-attribute regression.

### Host persistence verification (#296 PR3)

On Windows x64, `pnpm browser:test http-host` now also kills the owned Chrome browser process
tree and relaunches a new PID with the same checkout-owned persistent profile and exact HTTP
origin. The production server stays running: this is a client crash, not a server restart or
page reload. The test compares committed IndexedDB records before/after restart, then exercises
the start list, matching-file prompt, user Restore, dirty state, unchanged disk until explicit
Save, actual Save/Reload, and a second crash followed by an external disk change and a 409 with
both external bytes and recovered work preserved.

The packaged Windows Desktop regression uses the real `ieumdoc://app` protocol and verifies
that Electron `userData` and `sessionData` are the same isolated test profile across new app PIDs.
Forced app-tree termination preserves the committed record including an inserted pending Figure;
Restore and Save/Reload use the real packaged Editor and file Host. A subsequent normal window
close exercises the real `beforeunload`/main-process guard with the native dialog's response stubbed
to **Close without saving** (the offered buttons are asserted). Restart retains that record;
external modification before Restore produces 409 on Save without overwriting either side.
The OS-native dialog click itself is not automated. No file API, IndexedDB implementation or
recovery UI is mocked in these Host flows.

Tests wait for the actual expected committed record before forced termination; they establish
last-successful-record recovery, not survival of unrecorded input, power loss or OS cache loss.
Changing HTTP scheme/host/port or browser profile selects different storage; Desktop's stable
origin alone does not share records with HTTP or another profile. Windows observations do not
establish Linux/macOS execution, installed-app upgrade behavior or cross-device recovery.
Required CI must pass before #296 is considered complete. See the [test guide](../test/README.md#local-recovery-regression).

## Applied content and drafts

- Empty newly inserted editor paragraphs and never-applied Equation placeholders stay in the session but are omitted from canonical output. A new Figure is not a placeholder: it is saved from insertion, empty or not. Filtering is shared by Save collection and dirty comparison. An emptied opening-snapshot paragraph, an empty heading or an invalid table still reports a save error.
- Equation/Figure/Table/section-label drafts are aggregated by kind and opening-snapshot locator; form values remain owned by their NodeViews. Changed property drafts protect tab closing and all-tabs beforeunload, including changed Figure values while Apply validation is pending. Closing one draft does not clear another, including two kinds at the same locator.
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

Open from the sidebar and New open a new tab, with no work-loss confirmation because existing
sessions remain. New keeps its filename/location dialog and first-paragraph focus handoff. Failed
Open/New adds no tab and changes no existing editor. The Host-returned normalized path is the
identity; the UI does not guess case folding, aliases or filesystem identity.
An exact request-path match to an open tab's Host-normalized path activates that session without a
Host GET, even if the file has since become unreadable or disappeared. An unmatched spelling still
goes through GET and comparison of the returned normalized path before adding a tab.

Switching tabs never serializes/reparses content or calls `setContent`. The mounted session keeps
content, undo/redo, block property draft values (Equation, Figure, Table and section label), selection,
per-tab window scroll and Visual/Source view. Transient inline link URL and inline-math inputs close
without applying on outside blur, including a tab switch, just as when clicking elsewhere in the
same document. Reopening them starts from the applied URL/LaTeX; they are not block property drafts.
Dirty work alone never blocks switching. Active Save, Open/New/Reload, Source generation and asset
work still block switching. Inactive editors retain values but mount no property portals or block
handles, run no geometry observers/outline measurements and cannot autofocus. Form IDs are unique
per mounted view, including identical document-local `sourcePath` values in different files.

Closing a dirty tab or one with unapplied drafts uses **Save / Don't save / Cancel**, following
[ADR-0007 section 4](../adr/0007-editing-session-lifetime.md#4-미저장-작업-처리는-하나의-확인-대화상자를-재사용한다).
Save uses that tab's existing Save path. Failure/conflict keeps it open; a failed Save while closing an inactive tab also shows a named shell error without changing the active tab. Cancel/Escape/outside dismissal
changes nothing and restores the invoking control. Don't save closes without writing and deletes that session's recovery record. The dialog
explains that Save and Don't save both discard unapplied property drafts, and Save includes applied
content only. Pending Save disables its actions/dismissal and shortcuts cannot bypass it.

After Save succeeds, the live applied-document comparison is checked again. Newer applied edits
keep the tab open with **Unsaved changes**; no retry or discard is automatic. Drafts alone do not
prevent the explicitly agreed close. Closing the active tab selects its right neighbour, otherwise
its left; closing an inactive tab keeps the current active document and scroll. Focus moves to the
active tab after a close. The last close returns to the start screen and its first action, retaining
the folder tree, display preferences and any Host-provided sample/allowed-root information.

Save, Source, Reload and the outline target the active tab. Reload retains **Keep editing / Discard
and reload** and replaces only that tab's editor after a successful read; a failed read retains it.
Browser `beforeunload` checks every tab plus pending Open/New, including hidden dirty tabs. Desktop
window close retains the native confirmation with wording about all documents. Update restart checks
aggregate every session's pending work without adding a dialog to the timed handshake.

External changes retain the existing revision conflict check. The user can copy applied content from Source, keep editing, or explicitly reload from disk. This does not add automatic merging or an OS-level atomic compare-and-swap to the development adapter.

## Save shortcut and work-loss protection (#56)

Ctrl/Cmd+S runs the same Save as the button, with the same status, error and conflict messages, and never the browser's page save. It keeps focus, selection and history in the editor. While Open, New, Reload, recovery or Settings dialogs are open it does nothing, as the covered Save button would. The top bar's `Unsaved changes` status is the in-session indicator. The Save button shows the shortcut and declares it as `aria-keyshortcuts`.

Current behavior: explicit Save and separate local recovery of applied work; no autosave or recovery of unapplied drafts. `beforeunload` remains the guard against closing or navigating away with unsaved work. [ADR-0007](../adr/0007-editing-session-lifetime.md)'s independent tabs, shared tab-close confirmation and client recovery are implemented above. Windows Desktop/HTTP persistence and crash checks, their required CI and remaining platform/guarantee limits are recorded in [Host persistence verification](#host-persistence-verification-296-pr3). Autosave is deferred (#297).

Desktop update restarts additionally ask the live Editor about every tab's unsaved content/drafts and pending Save/Source/assets/Opening/Creating through the typed bridge. Missing answers, renderer failure and timeout refuse. The window closes normally before the installer starts, preserving `beforeunload` as a second guard. Ordinary quit never installs an update. This keeps explicit Save and the separate client recovery boundary; see [Desktop updates](desktop-distribution-v1.md#update-lifecycle-and-work-protection).

The unload guard reads every registered session's latest rendered state and live dirty comparison. A completed Save must not keep blocking close with the previous Saving state while a passive-effect replacement is pending. The browser regression observes the first Saved DOM commit to protect this boundary without timing delays.

## Evidence

Historical #291 evidence (the confirmation now belongs to Close): the unmodified `ae464b7` Editor reproduced the draft information bar plus the red Open refusal, with that refusal still present after cancelling the property draft. At 1440×800 and 375×800 the two header bars were stacked without geometric overlap. The new confirmation does not create this refusal error; Cancel/Escape preserve content, selection, undo availability and drafts. Existing unrelated errors remain until dismissed or resolved. `open-files` covers these transitions, pending Save/Open, Save failure/conflict and the draft-only case; `writeability-preflight` checks that a failed target Open also keeps the old work. `new-document`, `save-session` and `http-host` exercise real creation, content rejection and persisted Save/reopen. Baseline images are `tmp/291-before-*-draft-refusal.png` and `tmp/291-before-*-after-draft-cancel.png`; `pnpm browser:test open-files --screenshots` captures the new dialog in `tmp/291-dialog-{1440,375}-{no-drafts,drafts}.png` (100% zoom, DPR 1, bundled Pretendard, Windows Chrome).

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

The rename-to-missing observation above predates #374. Current non-empty property renames
[update references atomically](section-references-v1.md#editor); they do not trigger #375's
deletion notice. The original reproduction remains historical evidence of the focus bug.

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


### Recovery review layout (#395)

The review prompt wraps full paths with `overflow-wrap: anywhere`, consistently with the deletion
confirmation. This lets the existing grid shrink to the popup width; the existing footer stays stacked
at phone widths and horizontal on desktop. No shared Dialog, spacing token, button size, focus policy,
recovery storage, or Core/CLI operation changes.

The regression was reproduced at product HEAD `c587663d18744d8950859a1ae77fd72ddbc9cb1c`
with only the new browser assertions present. At 375px the popup had `clientWidth=341`,
`scrollWidth=390`, and all three footer buttons exceeded its right boundary. At 1440px it had
`382/390` client/scroll widths. `break-word` did not reduce the path's intrinsic minimum width;
`anywhere` supplies those opportunities during grid sizing, without clipping or a new footer layout.
The early failure also prevented the scenario's later expected 409/400 requests; those missing-request
reports were secondary, not additional product failures.

| Recovery review, same record/state | Before | After |
| --- | --- | --- |
| 1440×900 | [Before](assets/recovery-395/before-1440.png) | [After](assets/recovery-395/after-1440.png) |
| 375×900 | [Before](assets/recovery-395/before-375.png) | [After](assets/recovery-395/after-375.png) |

Capture environment: Windows Chrome, same checkout-owned persistent profile, Vite at
`http://127.0.0.1:5173`, DPR 1, 100% zoom, scroll top, English UI, fonts ready, bundled
Pretendard Variable 1.3.9 and the unchanged product fallback stack. Actual capture HEAD is
`c587663d18744d8950859a1ae77fd72ddbc9cb1c` for both pairs; After includes the one-line
RecoveryPrompt `break-words` to `[overflow-wrap:anywhere]` working-tree change and the extended
recovery scenario. No other product change was present. Historical #382 evidence above is preserved.

The existing recovery scenario now checks path and popup scroll/client widths and footer-button
rectangles at both sizes even without `--screenshots`, plus Playwright actionability trials for enabled
review actions. Its incompatible-record case uses a long unbroken Windows path with Korean text,
expanded plaintext and the clipboard error visible, retaining the disabled Restore assertion.

After visual review: at 375px the path and popup are bounded (`309/309` and `341/341`
client/scroll widths), and at 1440px they are `350/350` and `382/382`. All review actions
remain inside the dialog; enabled actions pass click trials. The desktop footer remains one row.
The [long incompatible-record capture](assets/recovery-395/incompatible-375.png) also keeps its
expanded plaintext, standing clipboard error and all footer buttons visible at 375×900.
