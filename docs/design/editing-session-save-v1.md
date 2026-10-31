# Editing session and Save v1

- Status: Implemented
- Editor groups verification: 2026-10-29 (#488 phase 1; one mounted session per document across group moves, group actions/focused shortcuts, dirty-close and navigation-only reload; [contract and evidence](editor-ux-shell-v1.md#two-editor-groups-488-phase-1)).
- Recovery support verification: 2026-10-29 (#705: current-schema validation and stored plaintext refusal path; Editor tests and typecheck).
- Pre-save comparison verification: 2026-10-28 (#655 stage 2: Save parity, read-only state, external revisions, refusal locations and missing files; [visual evidence](../reviews/editor-visual-language-history-2026-10-30.md#pre-save-comparison-655)).
- Save refusal verification: 2026-10-28 (#578 phase 2: structured Core codes and bilingual cause/action in the alert and badge; [diagnostic guidance](#diagnostic-guidance-578-phase-2). Phase 1: localized summaries and collapsed original details, block/cell highlighting and keyboard reveal, list-shaped state with conservative submitted-snapshot invalidation; no Host/Core validation policy change).
- Image rename verification: 2026-10-27 (#504: file-actions browser checks inactive dirty/property-draft refusal, clean active/inactive tabs, Source-to-Visual reload, subsequent Save and other-window revision conflict).
- File operations verification: 2026-10-27 (#505 / #504 PR A: Editor/Host/Desktop unit tests, workspace typecheck, production Editor build and targeted persistent-Chrome browser checks; packaged Desktop is CI-only).
- Property Apply verification: 2026-10-27 (#576: shared Ctrl/Cmd+Enter submission, validation/busy guards, IME/modifier exclusions and prose hard-break isolation; Editor tests and targeted Windows Chrome browser regressions, with Apple platform emulation rather than native macOS).

- Last verified: 2026-10-27 (#557 Editor tests/typecheck/build and inline-math property draft regressions: outside focus, independent instances, applied-only Save/Source, tab switching and discard/close guards).

- Boundaries: ADR-0001, ADR-0002, ADR-0003. Markdown remains the disk SSOT; Core operations and canonical validation remain the write path.

Brand defaults and packager overrides follow [the branding guide](../guides/branding.md) (#859). Product identity is separate from the fixed internal Host API; earlier verification records do not establish a migration from old Beta builds.

## Text editing sessions (#817)

[Text documents](document-support-v1.md#text-files-in-the-editor-817) share tab identity,
explicit Save/shortcut, dirty indication, Save/Don't save/Cancel on close, all-tab
beforeunload and Desktop restart protection with native documents. A plain textarea
uses browser editing/selection/history. There is no formatting, block UI, preview,
Source toggle or native pre-save comparison. A short permanent text-mode explanation
sits above the input, below the shared tab/Save row. Text has no unapplied properties.

Save captures a string and acknowledges only that submitted string plus its returned
revision. It keeps the mounted input, selection and native history. Input typed while
Save waits remains dirty and recoverable. Failure/conflict keeps local text; external
bytes remain untouched. Reload uses the shared discard confirmation and asks Host to
classify the file again, replacing the editor only after a successful read. Unedited
source preserves BOM, CRLF and trailing whitespace. Once edited, the submitted text
is the textarea value (browser line breaks are LF); Host performs no normalization.

The existing IndexedDB recorder, barriers, retention, deletion and path changes also
serve text sessions. A text snapshot carries `kind: text`, a text file descriptor,
current text, acknowledged saved source and revision. It carries no native read model,
Tiptap snapshot or semantic edits. Restore validates this shape and mounts only the
text editor; native recovery cannot consume text snapshots. Restore does not write or
reclassify a file, and retains the old revision so an external change still conflicts.
Comparison reads current disk text without Core replay; the recovery copy is the exact
recorded string. Native recovery and canonical replay remain unchanged.

`pnpm browser:test text-mode` covers exact Save/Reload, retained input during delayed
acknowledgement, close cancellation/Save/discard, unload protection, text recovery and
external conflict, and Reload across native/text admission. Host tests cover raw-request
schema isolation, native-write refusal, file commit failure/cleanup and unchanged bytes.

Text editing has no CLI command because it adds no document semantic operation.
The shared Host remains stateless, using existing revision checks, temporary sibling
and rename in `packages/file-commit`; no daemon, backend state or autosave is added.

## File deletion and rename (#505 / #504 PR A)

Confirmed file deletion closes its open tab, discards applied edits/property drafts and deletes
all recovery records matching its path. Dirty work requires the explicit Delete and discard changes
confirmation instead of the ordinary tab Save/Don't save prompt. The file tree receives focus.

Renaming a document file in the same folder keeps the mounted editor, history, selection and drafts. It changes the live
session locator and tab navigation, then moves matching recovery record paths and snapshot file
paths in one IndexedDB transaction. Each applied edit registers the live locator in its existing
session barrier without capturing the document snapshot. File operations revoke every barrier
registered to the old path in the record-move/delete transaction, including another window's ticket
before its first record. Queued local recording is also cancelled during the Host operation;
subsequent dirty recording uses the new locator and a fresh nonce. Other paths and later edits
keep their permissions. No new store or path tombstone is added. No file reread or semantic rewrite
occurs. Storage failure after disk success is visible and does not pretend the disk operation failed.

Deletion/rename recovery barriers match path strings. Until [#372](https://github.com/ieumbird/ieumdoc/issues/372)
decides Windows locator identity, case-only aliases (for example, a different spelling in URL
`?path=`) are treated as separate paths. Another window's delayed first recovery write may then
leave an old-path record. There is no data loss; the extra record can be discarded.

[Shell](editor-ux-shell-v1.md#file-context-menu-505--504-pr-a) and
[Host](filesystem-host-boundary-v1.md#file-deletion-and-rename-505--504-pr-a) specify entry/validation.

### Referenced image rename (#504)

Renaming an image updates its references in saved native documents under the selected opened
folder through Core and the shared Host. For Sidebar rename, every dirty referring document tab in the requesting
Editor window blocks the operation, including inactive tabs and unapplied property drafts. The
dialog names the documents and asks to save first; neither image nor documents are written.
Applied snapshots supplement saved references, so adding a reference only in unsaved work also
blocks. Removing a saved reference in unsaved work still blocks until saved.

The rename dialog remains modal through the operation and subsequent reads. All affected clean
tabs use the existing load/accept path to install their new source, revision and Core read model
before the dialog closes. They return to Visual view and start a new editor/history checkpoint;
old undo history cannot silently restore obsolete image paths. Tab order and active tab stay the
same. A read failure names the affected tab and remains visible; its old revision still prevents
overwriting the changed disk file. On incomplete Host rollback, affected clean tabs likewise
reload actual remaining disk contents. Skipped unreadable/non-native files appear in a notice.

Only tabs in the same Editor window participate in the dirty check. No other-window/browser-tab
or cross-Host live-state communication is introduced. **Cross-window protection is Save-time
revision conflict**: another window retains its local edits, but its next Save against the old
revision is refused after reference rewriting. The current #372 locator-alias limitation remains.
Image/document commit order and best-effort rollback limits are specified by the
[Host contract](filesystem-host-boundary-v1.md#referenced-image-rename-504-pr-b).


### Figure-form image rename (#652)

The explicit Rename action in Figure Advanced (#757), separate from Done/outside metadata
completion, validates image/alt/label and preflights the existing Core-backed label/reference
transaction before requesting the #504 Host rename. While the request and clean-tab reloads run,
a modal busy surface blocks new document input and cancellation. Host refusal leaves every form
field intact and applies no Alt/Label edits. On success, the initiating session stays mounted:
only its matching image paths and acknowledged saved-snapshot paths change, with the new Host
revision. The original opening source/model stays the replay baseline; `base.savedEdits` advances
to the path-adjusted saved snapshot when the disk revision changed, without acknowledging local
unsaved content. Other sessions retain #504 protection and reload behavior.

Path retargeting is an `addToHistory: false` engine transaction. A session-local alias map also
retargets Figures restored from old undo/redo/deletion steps, including successive renames.
It keys aliases by Figure locator and an Editor-only attachment identity, renewed when the user
attaches a different image. This prevents a fresh upload/choice reusing an old filename from
being mistaken for the renamed image. Identity is not Markdown/Core semantics and is excluded
from applied-content dirty comparison. Host-confirmed historical equivalent spellings are
included even when they exist only in history after Save. Retired aliases remain scoped to
their attachment so reusing an old filename for a different file does not retarget that history.

Other open Figure forms follow applied path retargeting only when their Image draft still
equals the previous applied URL. Their Alt/Label drafts remain intact. An unchanged filename
input follows the new stem; a custom filename draft remains user input. A directly changed
Image draft is retained and uses the existing Core Figure validation on Apply (including the
existing missing-image display if a user explicitly chooses a missing path). It is not silently
replaced: that draft can intentionally select a different file, so matching the old applied
string is the boundary for automatic propagation.
Alt/Label Apply remains a normal independent Undo event. Undo cannot rename the file or resurrect
an obsolete path. Recovery snapshots contain the current/saved paths; recovery does not persist
engine history. An incomplete Host rollback follows #504's explicit reload/error handling;
transport loss can leave an uncertain disk outcome and must be reported, not silently retried.
No new Core semantic operation or CLI surface is added: #504 owns the file/reference operation.


## Editor ownership

The Editor-internal [`useDocumentSession`](../../apps/editor/src/useDocumentSession.ts) owns one document's path, opening read model and
source, acknowledged revision and `savedEdits`, Source content/view, status/errors/notices,
draft/asset/dirty flags, heading numbering, outline store and keyed `DocumentEditor` lifetime.
It handles Save, Source, Reload and image selection. Each mounted `DocumentTab` owns one hook
and `DocumentEditor`; each [editor group](editor-ux-shell-v1.md#two-editor-groups-488-phase-1)
shows its active tab. `App` owns startup and Open/New requests,
the normalized-path tab list, folder tree, preferences, shared header/outline, Desktop integration
and the shared **Save / Don't save / Cancel** close dialog. A tab is added only after Host success.
Opening a Host-returned path already in the list activates its existing session without replacing it,
moving that tab into the requested group when needed.
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

Historical Save replay and nested-parser verification: [Save, switching and property interaction evidence](#save-switching-and-property-interaction-evidence).

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
The producer excludes temporary empty locators from deletion tracking. The existing Host replay
and canonical checks still govern Save.

Owner decision (2026-10-29, [#705](https://github.com/ieumbird/ieumdoc/issues/705)) ends
the #331 and pre-#577 recovery exceptions under [AGENTS.md](../../AGENTS.md)'s rule
excluding historical-data compatibility unless migration is explicitly requested.
Empty deletion sentinels, missing table-caption children and former `attrs.caption`
records are rejected by the common validation path, without repairing either checkpoint.
The rejection is caught by the recovery review before session or storage replacement;
other records and open documents remain available. The separately stored plaintext
copy remains selectable and copyable, verbatim. No old caption-attribute extraction
or structured migration is provided.

Pending image-less Figures are applied content. Snapshots exclude Undo history, selection/scroll,
unapplied property drafts, in-flight requests and image binary backups. Autosave remains deferred
(#297). No Core/Host semantics change or new CLI operation is needed: this initializes an existing
Editor session and adds client-local persistence, not a new document semantic operation.

## Local recovery records (#296 PR2)

The client records applied dirty work in IndexedDB (`litzio-recovery`) in the current browser/app
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

An applied update that returns to the acknowledged saved snapshot, including Undo, synchronously
acknowledges that session as clean in origin-local `localStorage` (#409). It reuses the editor's
existing applied-content dirty comparison, including the submitted snapshot acknowledged by Save,
rather than comparing recovery text with the current disk file. Each `litzio.recoveryClean.v1.<id>`
entry contains only that session's nonnegative recording generation counter: no path, content, revision, cursor
or history. New v1 records carry the optional `recordingGeneration` field; existing v1 records
without it remain readable and are never deleted by a clean acknowledgement. Restore starts the
moved record at generation zero of the new session. Redo or new applied input removes the acknowledgement
**before** obtaining a recording ticket and advances the generation after clean state. A dirty
IndexedDB write also removes the acknowledgement and advances if needed before putting its live
snapshot, including when Save changed the acknowledged baseline. A stale clean entry that reappears
after a process crash cannot match a newer committed dirty generation: localStorage and IndexedDB
are not assumed to flush atomically.

Listing recovery consumes these acknowledgements in the IndexedDB transaction that deletes
only the corresponding obsolete records at or before the acknowledged generation. This includes
older committed work when rapid Undo/Redo/Undo never committed the intervening dirty generation.
Like a clean recorder snapshot, this retains the live
ticket so a later Save acknowledgement can record newer dirty work without a further edit;
explicit deletion/expiry still invalidates tickets. Listing removes the matching
generation only after commit, including orphan entries; a newer dirty/clean generation survives an older
cleanup completion. Thus immediate Reload and normal browser/Desktop close do not offer the old
record while the 500ms write is still pending. Partial Undo with applied changes retains recovery;
another window's distinct session identifier is unaffected, even for the same path. This is recovery
metadata, not navigation memory or an additional document write path. The optional record field
requires no DB version change or migration; 10-day expiry, restored revision and external-conflict
checks are unchanged.

If acknowledgements cannot be read, listing keeps the records. If an applied edit cannot update its
acknowledgement, recording is cancelled and the existing persistent recovery warning is shown;
new dirty work is never committed behind an uncleared clean marker. A later successful applied edit
can resume recording. IndexedDB delete failure keeps the acknowledgement for a later attempt.
As with existing recovery, storage failure, process crash and OS cache loss are outside an immediate
durability guarantee; normal close guards and last-successful-record limits remain in force.

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

Historical deletion captures and nested-dialog evidence: [Recovery deletion evidence](#recovery-deletion-evidence-382).

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
no heuristic strips bracketed strings from an old copy, since those may be user text.
Unsupported snapshots do not regenerate missing text from obsolete attributes; only the
separately recorded copy and readable current-schema content are covered.

### Recovery review layout contract

The review prompt wraps full paths with `overflow-wrap: anywhere`, consistently with the deletion
confirmation. The shared Dialog and compact footer controls remain available while comparison loads
or fails. Supported review widths start at 640px (ADR-0010).

**Compare (#655, stage 1)** lazily loads a read-only unified source diff: the current disk bytes
against the canonical Markdown Save would write after restoring the record. The existing Host
Save/Source replay validates the acknowledged revision from the opening source and `savedEdits`,
then applies the same collected edits through Core. Comparison neither restores the record nor
changes its snapshot, acknowledged revision, local storage or any file. An external disk revision
change is reported; comparison still uses the current disk, and does not merge or bypass Save's
existing conflict protection. Canonical formatting differences are shown with a short notice.

The diff uses jsdiff (`diff`, BSD-3-Clause), with line numbers for disk/recovery, −/+ signs,
word changes, contiguous change-region counts and keyboard-operable Previous/Next buttons.
Navigation focuses and scrolls to the region and wraps at either end. Long lines wrap while the
source pane scrolls vertically; the review grows to at most 72rem and fits the 640px viewport.
Long unchanged ranges are currently retained. CRLF and missing final newlines remain observable.

When restoration/collection or canonical preview is rejected, its reason accompanies a **plaintext
comparison**. The disk's existing Core read model is projected with `toTiptapDocument`, then passed
through the exact same `recoveryText` traversal used when recording. Thus both sides use the same
salvage rules (text, atoms, captions, link destinations), rather than comparing Markdown to salvage
text. If the disk cannot supply that read model, the comparison reports its error and retains the
independent plaintext recovery copy. An absent disk file is explicitly identified and the recoverable
side is all additions. Requests show loading and error states, time out after 15 seconds, can be
retried, and are cancelled on closing the view. Restore/Delete/Not now do not wait for comparison.
Diff calculation runs in one request-owned Web Worker, never in a render or `useMemo`. A complete
line diff is computed first. Each removed/added line pair has at most one word-diff call, projected
onto both sides. Optional word highlighting stops for the rest of the comparison when its **total**
100ms budget, 64Ki UTF-16 code-unit allowance, or 8Ki combined code units for one line pair is exceeded.
The library timeout for a word call is at most 10ms and uses the remaining shared word budget.
The UI explicitly says that word highlighting was omitted; line contents, signs, numbers, counts
and navigation remain complete. These text-size guards also bound tokenization before jsdiff can
check its own timeout: the reviewer's 1000-word old/new pair is about 13.8Ki code units and immediately
falls back to line highlighting rather than repeatedly attempting quadratic word matching.

The **whole worker calculation** has a 500ms elapsed budget, including line diff, projection and
word work. Combined input is limited to 1,000,000 UTF-16 code units and 10,000 lines to bound transfer,
allocation and rendered output, while admitting the reviewer's roughly 337KiB per-side document.
Exceeding these limits or the line-diff budget rejects the whole comparison, with a reason rather
than partial line results. An independent **2-second watchdog** terminates the worker even if library
tokenization/search fails to return; this allows four times the compute budget for module startup
and message transfer. The 100ms optional-word allowance is one fifth of the calculation budget, so
word detail cannot consume all the time needed for the complete source comparison.

Reading and calculation have separate loading states. Close, record replacement, retry, completion
and failure all terminate their worker and clear its watchdog. The existing request is aborted too;
a disposed request cannot publish a late result. Buttons/Escape remain on the main thread, including
during calculation or a budget error; the independent plaintext copy remains available. Recovery
format, restoration/Save behavior, Core semantics and CLI are unchanged; this is interface-only work.

Performance regression (#672 review, 2026-10-28): a native `text` code block has 50 lines,
each `Array.from({length:1000}, (_,i) => 'old'+i).join(' ')`, changed from `old` to `new`.
Both sides are about 337KiB. The same controlled Host response and real RecoveryPrompt failed on
`6277ecd`: 10ms heartbeat maximum gap **20,299.8ms**, result ready at **20,299ms**. With the worker,
maximum gap was **59ms**, ready at **107.6ms**, and the omission notice was present. Unit calculation
took about **9ms** and retained both complete sources. These are observed local values, not a speed SLA.
The browser regression requires a maximum gap below **500ms** and a complete result below **2s**;
the former allows scheduler/layout variance while rejecting the reproduced 20-second lock-up, and
the latter matches the total worker watchdog. It uses a fixed 2-second observation window and direct
DOM/timing assertions, without a readiness poll or reload. A held genuine worker module separately
checks Delete/Escape within 1s, closing/cancellation, and that its late result cannot replace the next
comparison. Oversized input checks retain the plaintext copy and all recovery actions. Production HTTP
recovery also loads the built worker under the Host's existing self-only CSP, without changing headers.
The development adapter explicitly prebundles the lazy worker's `diff` dependency, as it already does
for Mermaid, while leaving browser loading lazy. Cold CI initially exposed Vite discovering `diff`
on the first comparison and reloading the page; its artifact showed the optimizer reload rather than
a performance-budget failure. The existing recovery regression also runs after a forced cold start
to ensure opening Compare preserves the review and applied work without that reload.

Historical layout comparisons: [Recovery review layout (#395)](#recovery-review-layout-395).

Verification (2026-10-28, #655 stage 1): the persistent-Chrome `recovery` scenario checks
mixed edits, displayed region count and wrapping keyboard navigation, unchanged records on review,
loading/failure with available recovery actions, external revision warning, same-rule plaintext fallback,
missing file, restore and byte-identical actual Save. The Host test checks bytes/mtime/revision and
acknowledgement preservation, checkpoint replay and refusal reasons; HTTP tests check existing/absent
paths outside allowed Roots. The pre-existing recovery tab assertion was scoped to the Documents
tablist (including hidden document tabs under the modal), excluding Sidebar tabs.

Captures use the same mixed-edit record and selected region, 900px height, DPR 1, zoom 1,
Pretendard UI and Consolas source. Collapsed prompt Before/After uses the same visible path/review
state (record text is collapsed). The four
comparison captures are the same state across viewport/theme. The browser also asserts horizontal
content bounds and footer button bounds at both supported widths.

| Review | 640px | 1440px |
| --- | --- | --- |
| Former prompt (baseline `23d178a`) | [Before](../reviews/assets/recovery-source-diff-655/prompt-640.png) | [Before](../reviews/assets/recovery-source-diff-655/prompt-1440.png) |
| Collapsed prompt, with Compare | [After](../reviews/assets/recovery-source-diff-655/review-after-640.png) | [After](../reviews/assets/recovery-source-diff-655/review-after-1440.png) |
| Source comparison, light | [Capture](../reviews/assets/recovery-source-diff-655/comparison-640-light.png) | [Capture](../reviews/assets/recovery-source-diff-655/comparison-1440-light.png) |
| Source comparison, dark | [Capture](../reviews/assets/recovery-source-diff-655/comparison-640-dark.png) | [Capture](../reviews/assets/recovery-source-diff-655/comparison-1440-dark.png) |


### Recovery regression coverage

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

Historical structured-recovery captures: [Structured recovery evidence](#structured-recovery-evidence-331).

### Host persistence verification (#296 PR3)

The Vite [`recovery` scenario](../../apps/editor/test/recovery.browser.js) covers the start-screen
**Review recovery → Restore work** entry point after a page reload. The production HTTP scenario
does not check that start-list entry point.

Tests wait for the actual expected committed record before forced termination; they establish
last-successful-record recovery, not survival of unrecorded input, power loss or OS cache loss.
Changing HTTP scheme/host/port or browser profile selects different storage; Desktop's stable
origin alone does not share records with HTTP or another profile. Windows observations do not
establish Linux/macOS execution, installed-app upgrade behavior or cross-device recovery.
Required CI must pass before #296 is considered complete. See the [test guide](../test/README.md#local-recovery-regression).

HTTP/Desktop execution details and native-dialog automation limits: [Host persistence evidence](#host-persistence-evidence-296-pr3).

## Applied content and drafts

Read (#849) is a per-tab, nonpersistent view of applied content. Entering it keeps
unapplied drafts registered and retained by their mounted owners while hiding their
forms; returning to Edit restores them. No content, saved checkpoint, undo event,
revision, dirty state or recovery record is changed by the switch. The existing
tab-row draft status remains. Read cannot Save through the tab button, shortcut,
Command Center or close confirmation; the confirmation retains Don't save/Cancel
and explains that saving requires Edit. Close/Reload/beforeunload still protect
both applied changes and retained drafts. Source keeps its existing applied-only
preview and Save behavior. [Shell](editor-ux-shell-v1.md#read--edit--source-849) owns
the Read interaction boundary.


Undo/Redo from nonediting shell focus (#772) uses only the active editor's applied
history. It neither applies nor discards unrelated drafts; input/textarea/contenteditable
fields retain native Undo, and existing target-change/draft lifecycle rules remain in force.

An open modal isolates native Undo/Redo from outside form drafts (#831), even when
the modal input has exhausted its own native history. Escape dismisses only the
active modal; unapplied source and other outside form drafts remain mounted and
unchanged. See [modal history boundaries](document-editing-v1.md#shared-history-and-editing-boundaries).

Mermaid source and label forms register Figure drafts through the same NodeView draft lifecycle.
Save, Source and tab changes preserve unapplied input and include only applied source; closing
or reloading uses the existing work-loss guards. Preview loading, syntax errors and theme changes
do not change document content or history. Applied source is replayed through Core `updateFigure`
and canonical writing, including caption-only edits, Undo/Redo and reopened documents.

- Empty newly inserted editor paragraphs stay in the session but are omitted from canonical output. New Figures, structurally valid Tables, admonitions, quotes, lists and Equations are saved from insertion, empty or not (#574). Equation Cancel/Escape discards only property drafts and keeps the inserted structure; empty Apply is supported. Empty tables retain their structure, caption and label through Save/Reload, just like existing tables. Filtering is shared by Save collection and dirty comparison. An emptied opening-snapshot paragraph, an empty heading or an invalid table still reports a save error.
- Equation/Figure/Table/section-label/inline-math/link/cross-reference drafts are aggregated by kind and opening-snapshot locator (inline forms also have a stable per-mounted-form identity, so two drafts in one block stay independent); form values remain owned by their mounted forms. Changed property drafts protect tab closing and all-tabs beforeunload, including changed Figure values while Apply validation is pending. Closing one draft does not clear another, including two kinds at the same locator.
- Property Apply (button or Ctrl+Enter on Windows/Linux, Cmd+Enter on macOS within the shared properties form) changes the main editor document. Both use the same validation/error path and ignore submission while busy; composition and Shift/Alt-modified shortcuts do not Apply. Unapplied form values survive keyboard Save and Source switching; neither operation applies them implicitly. Figure/Table/Equation/section-label metadata uses Done or a valid outside pointer click to apply (#791, #788); Escape cancels. Clicking Save outside those forms may complete metadata first, while Save still acknowledges only its submitted applied snapshot. Block notices and a standing message explain that only applied content is included. A remaining draft prevents the `Saved` display.
- Link and cross-reference forms (#790) show Apply/Cancel and cancel with Escape within the form. Outside clicks and keyboard focus changes neither apply nor discard their values. Changed URLs/targets use the same standing draft notice and work-loss protection above; unchanged forms alone do not mark a document dirty. Re-entry keeps an existing draft, and a chosen target removed by outside editing stays visible as unresolved. The editor maps the retained link/new-reference range through outside document transactions before Apply. Forms inside endnotes retain their values when that endnote leaves edit mode; input/Apply/Remove wait until its existing Edit action resumes editing, while Cancel remains available, like inline-math properties. Citation forms retain their existing dismissal behavior under the ADR-0008 freeze. These are Editor interactions using existing semantic write paths; no new Core operation or CLI command is needed.
- Explicitly completing or cancelling Equation/Figure/Table/section-label/inline-math properties retains a text selection inside the block, otherwise returning an engine caret after it. Outside pointer completion of Figure/Table/Equation/section-label metadata preserves the clicked focus instead. Typing immediately after Apply preserves the block and its references. Focus restoration itself adds no content or history; see [Continuous editing](document-editing-v1.md#continuous-editing).
- If outside editing splits or deletes a new cross-reference's retained selection so insertion is refused, Apply keeps the form, target choice and registered draft without changing the document. A short error below the target uses the shared field-error/ARIA pattern; Undo or merging can restore the range for a later Apply. Link and new-reference drafts keep their last valid document/range together: valid mappings refresh it, collapsed/invalid mappings preserve it, and an equal document (`doc.eq`, including exact Undo after whole-paragraph deletion) restores that range. The existing bilingual draft notice refers to edit drafts generally, including inline forms.
- A pending Figure, with or without caption or label, is included in Save/Source and restored on Reload. Apply → Undo → Redo restores both the Figure and collected payload. Insertion, Apply and subsequent image connection follow [Figure authoring](figure-authoring-v1.md). Save acknowledgement still covers only the submitted applied snapshot, including when an image is connected while a Save is in flight.
- Save acknowledges precisely the submitted document. Later input or drafts remain dirty. Failure acknowledges nothing. The Host replaces the file through the [File commit](filesystem-host-boundary-v1.md#file-commit-v1) shared with the CLI: it writes a temporary file beside the destination, checks the disk revision again, and renames the completed file into place. A validation, conflict, partial-write or rename failure preserves the original. A file without write permission is refused. Content-operation errors carry their block locator so the Editor can show the submitted block number and reason.
- Source renders applied session content through Core. It can be copied after an external conflict: the Host validates the session's acknowledged revision without writing or requiring the latest disk contents to match. It is never a raw Markdown write route.

Historical property-close and caret evidence: [Save, switching and property interaction evidence](#save-switching-and-property-interaction-evidence).

## Save failure guidance (#220, #578 phase 1)

Save reports the first encountered failure in the window [notification center](ui-patterns-v1.md#p07-입력-오류와-알림-센터) (#792). Its short summary shows
the submitted block number/kind (Korean names under Korean UI) and phase-specific guidance.
The original Core/Host reason and correction/recovery action remain verbatim inside keyboard-accessible,
initially collapsed **Technical details**, in both UI languages. The reason identifies the cause;
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

### Refused-block highlighting and navigation (#578 phase 1)

The Editor accepts a **list** of submitted problem locations. Located blocks have a danger-token
red inset stroke with exactly the #469 selection/hover rectangle, thickness and radius, plus a
visible **Cannot save** badge (**저장 불가** in Korean). A located table cell also has a danger
inset stroke covering the current-cell outline, clipped to its table's horizontal scroll viewport. These overlays live outside
the engine content and do not change document geometry, source, selection, history or dirty state.
The error stroke paints above selection and hover: a refused Save needs to remain discoverable
even when the user selects or points at the same block. See [visual contract](editor-visual-language-v1.md#state-rules).

**Go to problem** uses the same block-reveal path as Outline/Tables/Figures: it selects text or an
atomic block using ProseMirror, focuses the editor and scrolls below the measured sticky header.
A located cell receives the caret. Multiple locations expose keyboard-accessible previous/next
buttons and a current/total count. Document-wide/file/transport failures without a block location
have no document highlight or navigation action. Merely displaying errors does not move selection.

Every Save attempt clears the previous highlight list before collection. A failed attempt installs
its submitted locations only if the engine document is still the exact submitted snapshot. Any
document-changing transaction (including another block's typing, insertion, deletion, move,
split/merge, draft attributes, Undo/Redo) clears the whole list and its navigation actions. This
conservative invalidation avoids treating snapshot indices as identity, including edits made while
the Host response is pending. Selection, focus, hover, language or theme changes keep the list.
The alert keeps its submitted location and original diagnostic and asks for another Save to locate
the problem again. Editing a problem therefore clears its stale highlight; the next Save either
locates the remaining failure or clears the alert on success. Dismissing the notification alone does not
acknowledge Save or clear the block highlights. Its hidden state belongs only to this window;
other open tabs keep their failures registered and Go to problem activates the owning tab.
A new failure expands the list without taking focus. Successful Save removes the failure.
The former shell message banner is not also displayed.

Host still stops at its **first** failure. Replay is sequential: label clearing/reassignment,
paragraph merging/splitting, insertion and ordering can depend on earlier results. Continuing
after a failed operation could produce secondary failures or invalid locators; final structure
validation/serialization is document-wide. Collecting independent errors would require a separate
Core-backed validation pass, rather than a small safe continuation of this replay. That Host/Core
aggregation is deferred to a separate step; the Editor does not duplicate Core validation rules.
Phase 2 adds the structured diagnostic guidance below. No new document semantic operation is
introduced, so no new Core/CLI command surface applies.

The reported empty-table case is not currently reproducible (owner confirmation, 2026-10-28).
This phase does not change empty-table admission or saving policy. `save-error` browser verification
instead uses a real empty-heading collection refusal and unpreservable table-cell inline math
rejected by Core/Host, including correction → Save → Reload, cell navigation, and invalidation after
typing/insertion/deletion/move or input during a pending response. Multiple-location controls and
snapshot locator resolution are also covered by Editor tests.

### Diagnostic guidance (#578 phase 2)

For known Core codes the short alert identifies the cause and a user correction in the current
Korean/English UI language. The problem badge shows a compact cause/action in that language;
it stays outside editable content, wraps within the block width and sits above the refusal
stroke so it does not cover the table controls. Stroke/cell geometry, pointer transparency,
reveal/navigation and submitted-snapshot invalidation keep phase 1 behavior. Language changes
reformat both alert and badge without changing document state. Full original English reason
and action remain unchanged in initially collapsed Technical details. No English reason parsing
selects guidance. Unknown/missing codes use the existing phase-specific generic guidance and
Cannot save badge. For `empty-content` on a submitted `footnoteDefinition`, the alert and badge
say to enter text or remove its references and definition together; deleting only the definition
still fails the existing endnote relationship checks. This distinction uses structured block kind,
never English prose. File/revision/transport guidance takes precedence over any content code.

Core owns the [code inventory and collection decision](document-support-v1.md#save-diagnostic-codes-578-phase-2).
Host still reports its first failure. Captures for real empty-heading collection and table-cell
round-trip refusals cover 640/1440px, Korean/English and light/dark in the
[visual evidence](../reviews/editor-visual-language-history-2026-10-30.md#diagnostic-guidance-captures-578-phase-2).

## Switching and recovery

Open from the sidebar and New open a new tab, with no work-loss confirmation because existing
sessions remain. New keeps its filename/location dialog and first-paragraph focus handoff. Failed
Open/New adds no tab and changes no existing editor. The Host-returned normalized path is the
identity; the UI does not guess case folding, aliases or filesystem identity.
An exact request-path match to an open tab's Host-normalized path activates that session without a
Host GET, even if the file has since become unreadable or disappeared. An unmatched spelling still
goes through GET and comparison of the returned normalized path before adding a tab.

Switching tabs never serializes/reparses content or calls `setContent`. The mounted session keeps
content, undo/redo, property draft values (Equation, Figure, Table, section label, inline math, link and cross-reference),
selection, per-tab document-viewport scroll and Visual/Source view. Inline math follows the same explicit
Apply/Cancel/Escape boundary as block properties (#557); outside focus does not dismiss its form.
Hidden tabs and Source hide property portals without discarding their input or stealing focus when
shown again. Link and cross-reference forms follow the same retained draft boundary (#790).
Dirty work alone never blocks Open/New or switching. Open/New and tab switching wait while the
target group's active session is saving, reloading, generating Source or handling assets, while startup/Open/New is
pending, or while the tab-close confirmation is active. Focus can move to the other visible document
while an independent session is busy. These operation guards prevent competing
requests; they are separate from the work-loss confirmation on Close. Inactive editors retain
values but mount no property portals or block
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
prevent the explicitly agreed close. Closing a group's active tab selects its right neighbour, otherwise
its left within that group; closing an inactive tab keeps the current active document and scroll.
An empty group closes and focus uses the remaining group. Focus moves to the active tab after a
close. The last document close returns to the start screen and its first action, retaining
the folder tree, display preferences and any Host-provided sample/allowed-root information.

Each group's Save, Source and Reload target its own active tab; Outline and shortcuts target the
focused group's active tab. Reload retains **Keep editing / Discard
and reload** and replaces only that tab's editor after a successful read; a failed read retains it.
Browser `beforeunload` checks every tab plus pending Open/New, including hidden dirty tabs. Desktop
window close retains the native **Close without saving / Keep editing** confirmation for unsaved or
pending work across all documents. Keep editing leaves every session intact; native close adds no
Save all and keeps existing recovery records. Its warning explains that unapplied drafts and changes
after the last successful recovery record may be lost. This differs from the single-tab Close dialog
and its explicit record deletion. Update restart checks aggregate every session's pending work
without adding a dialog to the timed handshake.

External changes retain the existing revision conflict check. The user can copy applied content from Source, keep editing, or explicitly reload from disk. This does not add automatic merging or an OS-level atomic compare-and-swap to the development adapter.

Historical switching, dismissal and retained-error evidence: [Save, switching and property interaction evidence](#save-switching-and-property-interaction-evidence).

## Tab navigation memory (#383)

Under [ADR-0007 decision 3](../adr/0007-editing-session-lifetime.md#3-여러-문서를-탭으로-열어-두고-탭마다-독립된-세션을-가진다)
and the owner-approved [#380 decision](https://github.com/ieumbird/ieumdoc/issues/380),
`litzio.openTabs` in origin-local `localStorage` holds only `{ paths, activePath }`:
Host-normalized document paths in flattened left-to-right group/tab order and the focused active
document path (or null). Editor groups themselves are page memory; Reload restores one group.
It stores no content, selection, cursor, undo, session snapshot, Host state or file. This is UI
navigation, not a Core semantic operation; no CLI parity command is needed. Vite, Desktop and HTTP
origins do not share preferences. Disabled/malformed preference storage does not block navigation.

Nonempty remembered tab lists wait for opened folders to finish their existing restoration, so tab
opens use their outermost containing folder for bibliography context. Without remembered tabs, the
existing start/default document remains usable while folders restore independently. Tab restoration keeps the existing loading/operation guard until every
remembered path has been attempted sequentially, then publishes one final tab list. Open/New,
Close and switching cannot compete with pending restoration responses. Cancelled startup sends no
further requests after the current request settles. The Host still validates every read; moved,
missing and Host-refused paths are quietly omitted; `.txt` and Core-incompatible `.md` restore as text tabs (#817). Equal Host-normalized paths get one tab.
The remembered active path is selected when it survives; otherwise the first surviving tab is active.

Restoration alone never writes preferences, including excluded paths and active-path fallback.
Successful user Open/New, Close, recovery Restore and explicit tab selection remember the current
live paths/active path. Even a selection or Open of the already-active tab writes the current list,
so another browser tab's saved preference cannot defeat a later explicit action here. Save, editor
reports, typing and folder-only actions never write tab preferences. There is no storage-event
synchronization or saved-value cache. Closing all tabs remembers an empty list and retains the start
screen on Reload rather than reopening the development sample.

Startup document selection follows the order below. Recovery is a protection check within these
routes, not an instruction to open a recovery record automatically. The Host's pathless response
and the Editor's final visible tabs are separate: HTTP supplies start/allowed-root information;
Desktop supplies its accepted launch document or start/sample information; Vite supplies the
development default. The Editor then applies explicit routing, navigation memory and recovery.

| Startup route | Precedence and result |
| --- | --- |
| Non-empty page `?path=…` | Opens only that explicit path through the Host, ahead of navigation memory. This page query is now consumed by the Editor; previously only the Host API accepted a path query. Failure shows the existing startup error, with no remembered fallback. |
| Desktop `.md` launch argument | The existing first Host response contains that file. Opens only it ahead of memory; a matching recovery record is offered through the existing dialog. A URL path, if present, is explicit in the request and takes precedence over the Host default. |
| Valid tab navigation preference, without an explicit URL/launch document | Restores its list instead of opening a default, after the recovery check below. An intentionally empty or entirely excluded list leaves the start screen with any Host-supplied sample/allowed-root information; it does not fall back to the Vite default. |
| Remembered path has a recovery record | Does not automatically open its disk version, even if the record is incompatible. With no clean tabs, the existing start-screen recovery list is visible. If clean tabs restore and hide that list, the newest matching record is offered in the existing review dialog. Not now retains it. Restore uses the existing explicit flow and creates one unsaved tab. Other records remain available on the start screen. |
| Recovery storage cannot be read | Automatic remembered-tab restoration is deferred for this startup, preserving the existing recovery-unavailable message. Explicit opens remain available. This avoids treating unknown recovery state as clean work. |
| No usable tab navigation preference and no explicit URL/launch document | Uses the Host fallback: HTTP/Desktop have no default document and show the start screen; Vite opens `apps/editor/document/technical-document.md`. This includes first run and missing, malformed or unavailable navigation storage. A matching recovery record is offered for an opened default, just as for an explicit URL/launch document; it does not suppress that document's opening. |

The pathless Host read retains sample/allowed-root metadata when supplied and identifies a Desktop
launch document. Its failure does not prevent an explicit URL request, or browser remembered-tab
restoration (including an intentionally empty list): the unused development default is not a
prerequisite. Those document requests still go through the Host independently. If the default is
actually needed because no usable preference or URL exists, its failure keeps the existing startup
error. Without a URL, Desktop still requires its first response: a failing launch document must not
silently fall back to remembered tabs. Metadata cannot be invented when that read fails; the
Desktop bridge and every Host request's access validation remain unchanged.

Automatic startup (including an explicit URL/launch argument) leaves navigation memory unchanged
until the next successful user action. Neither navigation restoration nor exclusions write/delete
recovery records. Explicit Open may still open the disk version and offer recovery as before; Restore
replaces a clean matching tab rather than adding a duplicate and refuses to replace dirty/busy work.
The separate record's revision and existing Save conflict checks remain authoritative.

`document-tabs` checks actual Reload order/active identity, empty memory, exclusions, held startup
responses, aliases, cross-tab preference writes, URL/Desktop launch precedence and disabled storage.
`recovery` checks clean-tab restoration alongside an unchanged dirty record and one explicit restored
tab; `recovery-structure` retains generated structured-record Restore/Save/Reload coverage.
These browser Desktop checks use the bridge/first-response contract; actual Electron restart and
packaged-platform coverage remain the required Desktop CI boundary.

## Changes before saving (#655, stage 2)

With unsaved applied content or property drafts, **File actions → Changes before saving** and the same Command
center command open a read-only source comparison. The existing TopBar keeps its geometry;
no permanent button is added. Clean documents and pending document operations disable the command.

The command captures the current applied Editor snapshot and acknowledged revision/checkpoint,
using `collectSupportedEdits` exactly as Save does, without `beginSave`, history transactions or
acknowledgement. The existing `document-source?recovery=1` request reads the current disk bytes
and runs `previewSession → saveCurrentDocument → saveEdits` without a file commit. It includes
canonical formatting, CRLF and final-newline changes. Unapplied property drafts are excluded,
just as with Save; the dialog says so. A new Core operation or CLI surface is unnecessary because
this is an Editor review interface to the existing dry run, with no semantic change.

Recovery and pre-save review share `SourceCompare`: unified line diff, word highlights, −/+ cues,
line numbers, change count and cyclic Previous/Next navigation with focus. Both use the same
request-owned Worker, 500ms total/100ms optional word budget, input limits, 2-second watchdog,
word-omission notice and cleanup on completion/failure/close/retry. Pre-save budget refusal asks
the user to narrow the changes rather than pointing at a nonexistent recovery-copy control.

The dialog compares the captured applied state with disk at request time. An external revision
mismatch is explicitly reported; it never acknowledges the new disk version, and Save still
conflicts. An absent file is always reported; the notice says all content is shown as additions only
after a successful diff. Pending calculation or preview/comparison failure retains only the missing-file
fact alongside any failure reason. Preview refusal
shows the original reason and existing Save location/guidance via `SaveDisplayError`; structured
Host failure metadata is preserved by the existing preview response. No empty successful diff
or alternate serialization is shown on refusal. The read-only dialog contains navigation,
retry for read/calculation errors and Close, with no Save or revert action. Close/Escape restores
the invoking focus target. Ctrl/Cmd+S is blocked while the dialog is open.

Visual evidence and capture conditions are recorded in
[the Historical comparison record](../reviews/editor-visual-language-history-2026-10-30.md#pre-save-comparison-655).

## Save shortcut and work-loss protection (#56)

Ctrl/Cmd+S runs the same Save as the button, with the same status, error and conflict messages, and never the browser's page save. It keeps focus, selection and history in the editor. While Open, New, Reload or recovery dialogs or the dedicated Settings screen are open it does nothing, as the covered Save button would. The top bar's `Unsaved changes` status is the in-session indicator. The Save button shows the shortcut and declares it as `aria-keyshortcuts`.

Current behavior: explicit Save and separate local recovery of applied work; no autosave or recovery of unapplied drafts. `beforeunload` remains the guard against closing or navigating away with unsaved work. [ADR-0007](../adr/0007-editing-session-lifetime.md)'s independent tabs, shared tab-close confirmation and client recovery are implemented above. Windows Desktop/HTTP persistence and crash checks, their required CI and remaining platform/guarantee limits are recorded in [Host persistence verification](#host-persistence-verification-296-pr3). Autosave is deferred (#297).

Desktop update restarts additionally ask the live Editor about every tab's unsaved content/drafts and pending Save/Source/assets/Opening/Creating through the typed bridge. Missing answers, renderer failure and timeout refuse. The window closes normally before the installer starts, preserving `beforeunload` as a second guard. Ordinary quit never installs an update. This keeps explicit Save and the separate client recovery boundary; see [Desktop updates](desktop-distribution-v1.md#update-lifecycle-and-work-protection).

The unload guard reads every registered session's latest rendered state and live dirty comparison. A completed Save must not keep blocking close with the previous Saving state while a passive-effect replacement is pending. The browser regression observes the first Saved DOM commit to protect this boundary without timing delays.

## Evidence

### Verification record

- Documentation verification: 2026-10-26 (startup priority and Open/New/close protection compared with ADR-0007/0009, App.tsx, Host handlers and existing regression code; no new Editor/browser/Desktop execution).
- Last verified: 2026-10-24 (#409: synchronous clean acknowledgement on return to the saved snapshot; same-turn Undo/Reload, browser-tab close, partial Undo and queued-cleanup/new-input regressions; staged Electron close/restart observation).
- Previous verification: 2026-10-24 (#383 review follow-up: unused default read failure does not block remembered tabs or explicit URL startup; actual fallback failure remains visible; document-tabs regression).
- Documentation verification: 2026-10-24 (#417 review: current production HTTP explicit-path recovery coverage and Vite start-list coverage compared with test code; no new browser execution).
- Previous verification: 2026-10-24 (#383: tab navigation memory, startup precedence, missing/refused/non-native exclusions and recovery priority; document-tabs/recovery/recovery-structure browser regressions and Editor checks).
- Previous verification: 2026-10-24 (#391 review: nested outside-click dismissal and pending guards, refreshed captures with environment metadata; final validation recorded in the PR).
- Previous verification: 2026-10-24 (#382: explicit record/all-record deletion confirmations; Editor tests, typecheck/build and recovery browser checks including cancellation/focus and Korean/English 1440/375px captures).
- Previous verification: 2026-10-23 (Save shortcut recovery summary reconciled with the Host persistence verification below; documentation comparison only).
- Previous verification: 2026-10-22 (#331: actual engine-created deletion sentinel, structured Vite New/Reload/Restore/Save and Windows production HTTP crash/Restore/Save/Reload/conflict; readable fallback and open-dialog Korean/English reason changes).
- Previous verification: 2026-10-16 (#296 PR3: actual Windows packaged Desktop and production HTTP/Chrome process termination, same-profile restart, restore, Save/Reload and external-conflict preservation; Desktop normal close and pending Figure. Linux HTTP remains a required CI check).
- Previous verification: 2026-10-16 (#296 PR2: client IndexedDB and recovery UI; actual Vite persistence/restore/Save/Reload, multiwindow conflict and failure checks).
- Previous verification: 2026-10-16 (#296 PR1: recovery-capable initialization, Editor snapshot tests and initialization/Save replay browser regression).
- Previous verification: 2026-10-16 (#204: independent tabs, Close and all-tabs guards; see the [review](../reviews/document-tabs-204-2026-10-16.md) for exact validation and approved visuals).
- Previous verification: 2026-10-16 (#204 PR 1: session ownership, stale-completion unit checks, Editor/Desktop tests, typecheck/build and 16 existing browser scenarios for Open/New, Save/Reload, Source, drafts/assets, outline and Desktop guards).
- Previous verification: 2026-10-15 (#275 Equation/Figure/Table/section-label Apply/typing, retained caption/cell caret, history/Source and real Save/Reload browser regressions; ADR-0006 draft contract cleanup by code/test comparison). Previous verification: 2026-10-14 (#220 1차 저장 실패 위치·조치, split 문단·표 셀·저장 불가 문서·응답 확인 불가 안내와 기존 Save 보호 회귀).

- Switching verification: 2026-10-15 (#291: Open/New confirmation, Save failure/conflict, draft retention/loss, pending work and focus browser regressions; real Vite New and production HTTP Save/reopen; 1440/375px dialog captures reviewed, final visual approval remains with the user).
- PR #301 review verification: 2026-10-15 (delayed Save with programmatically injected applied edits stops Open/New, retains the session and drafts, shows the existing Unsaved changes status, and allows an explicit retry; original `c8aecd9` failed this regression).
- Encoding verification: 2026-10-15 (#271 Source/Save invalid-Unicode and request UTF-8 refusal; Vite/production HTTP repeated valid Unicode Save → Reload and external-conflict regressions).

### Recovery deletion evidence (#382)

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

### Structured recovery evidence (#331)

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

### Host persistence evidence (#296 PR3)

On Windows x64, `pnpm browser:test http-host` now also kills the owned Chrome browser process
tree and relaunches a new PID with the same checkout-owned persistent profile and exact HTTP
origin. The production server stays running: this is a client crash, not a server restart or
page reload. Both restarts explicitly request `?path=…` under the
[startup precedence contract](#tab-navigation-memory-383). The test compares committed IndexedDB
records before/after restart, then exercises the matching-file recovery review dialog, user
Restore, dirty state, unchanged disk until explicit Save, actual Save/Reload, and a second crash
followed by an external disk change and a 409 with both external bytes and recovered work preserved.

The packaged Windows Desktop regression uses the real `litzio://app` protocol and verifies
that Electron `userData` and `sessionData` are the same isolated test profile across new app PIDs.
Forced app-tree termination preserves the committed record including an inserted pending Figure;
Restore and Save/Reload use the real packaged Editor and file Host. A subsequent normal window
close exercises the real `beforeunload`/main-process guard with the native dialog's response stubbed
to **Close without saving** (the offered buttons are asserted). Restart retains that record;
external modification before Restore produces 409 on Save without overwriting either side.
The OS-native dialog click itself is not automated. No file API, IndexedDB implementation or
recovery UI is mocked in these Host flows.

### Save, switching and property interaction evidence

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
