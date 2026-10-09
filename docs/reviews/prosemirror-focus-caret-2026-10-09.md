# ProseMirror focus restore and caret keys

- Status: Historical
- Last verified: 2026-10-09 (Windows Chrome and Linux Chrome 155 in the Playwright `v1.63.0-noble` image; before/after runs of the same scenarios).
- Scope: the pinned `prosemirror-view@1.42.4` patch and its evidence ([issue #144](https://github.com/ieumbird/ieumdoc/issues/144)). No Core, CLI or Markdown change.
- Current authority: [Continuous document editing](../design/document-editing-v1.md) for the caret contract; the applied version and removal condition below remain applicable while the patch exists.

## Symptom

`continuous-editing` failed intermittently on CI: 3 of the 59 runs from 2026-10-06 to 2026-10-09, always the first scenario of browser shard 1. Each time its `end()` helper pressed `Control+End` and waited 30s for the caret to reach the document end. The caret never moved. Twice the select-all made by `Control+A` was still in place, and once the caret was still where `Control+X` had cut. Every failure came right after the editor regained focus, through Save (`view.focus()`) or opening a file. The same scenario passed every time on Windows. On Linux it also passed when the browser profile and Vite cache were reused (25 of 25). With a fresh profile and Vite cache for each run, as on CI, it failed 1 of 8.

## Cause

`prosemirror-view` restores its own selection after the editor gains focus, in two places:

1. **20ms check.** The `focus` handler schedules a check 20ms later. If the DOM selection then differs from the last one ProseMirror read, it writes its selection back (`selectionToDOM`).
2. **Start-of-document heuristic.** Within 200ms of focus, `DOMObserver.flush` takes a collapsed DOM caret at the document start for a browser reset and writes the old selection back.

Both exist so that focus through Tab or a DOM `focus()` call keeps the existing caret when Chrome resets it on focus. Neither checks whether the user moved the caret with a key since focus.

An event log from a failing Linux run showed the race in check 1:

1. `keydown End` moved the DOM caret to the document end.
2. Before Chrome dispatched the `selectionchange`, the delayed 20ms check ran (`docView.setSelection` with the old position) and put the DOM caret back.
3. The `selectionchange` then found the DOM equal to ProseMirror's last read, so the key had no effect.

A first run on a fresh renderer is slow enough for the check to land after the key. Heuristic 2 needs no timing at all: `Control+Home` pressed within 200ms of focus is undone every time. A real user meets these when a key follows focus closely, which is likelier on a slow or busy machine.

`prosemirror-view` 1.42.6, the latest release on 2026-10-09, has the same code.

## Patch

`patches/prosemirror-view@1.42.4.patch`, registered under `patchedDependencies` in `pnpm-workspace.yaml`. It patches both runtime entries, `dist/index.js` (ESM, used by Vite) and `dist/index.cjs`.

- `keydown` counts keys other than a modifier alone: Shift, Control, Alt, CapsLock, Meta/OS and AltGr.
- The `focus` handler records the count.
- The 20ms check and the start-of-document heuristic apply only while the count is unchanged.

A count is used rather than a time comparison. A Tab keydown that moved focus can share a millisecond with the focus event, and it must not cancel the restore. Keys pressed in another element (the Tab before focus) never reach the editor's `keydown` handler.

Focus without a key, or with a modifier alone, behaves exactly as before. Composition keydowns return before the count, as they already return before `lastKeyCode` is recorded. TypeScript sources and declaration files are not patched, because the added fields are internal.

## Verification

`focus-caret` uses real keyboard input in Chrome and checks where typed characters land. It holds ProseMirror's 20ms check (the only 20ms timer set while focus is dispatched) and runs it at the key's keyup, the order recorded on CI. That makes race 1 deterministic. If ProseMirror stops scheduling that check, the scenario fails, which prompts a review of this patch.

| Case | Before patch | After patch |
| --- | --- | --- |
| 1. `Control+End` with the 20ms check after the key | Fails: caret stays at `First paragraph.@0` | Caret at the end; `!` lands there |
| 2. `Control+Home` within 200ms of focus | Fails: `^` lands at the old caret (`First^ paragraph.`) | `^` lands at the start |
| 3. Tab from Save after the selection left the editor; the browser puts the DOM caret at the document start (asserted) | Old caret restored | Old caret restored |
| 4. As 3, then Shift alone | Old caret restored | Old caret restored |
| 5. 20ms check over a DOM caret moved without a key, with and without Shift alone | Old caret restored | Old caret restored |

Same Linux container and fresh-environment loop (new browser profile and Vite cache each run, as on CI):

| Build | `continuous-editing` | `focus-caret` |
| --- | --- | --- |
| Without the patch | 7 of 24 fail (the CI timeout in `end()`) | 24 of 24 fail (case 1) |
| With the patch | 24 of 24 pass | 24 of 24 pass |

The table above was run on Windows Chrome, the before column by removing the patch registration and reinstalling. The full browser suite passes with the patch: 39 of 39 on Windows and on Linux. The Linux runs used `focus-caret` before cases 3 and 4 asserted the browser's reset; CI runs the final scenario on Linux. `continuous-editing` is unchanged.

## Removal condition

Remove the patch file and its `pnpm-workspace.yaml`/lockfile registration when a `prosemirror-view` release keeps a selection made by a key after focus through both restores. Check by removing the patch and running `pnpm browser:test focus-caret`: cases 1 and 2 must pass, and the controls 3 to 5 must still pass.

A `prosemirror-view` upgrade that leaves the patch unapplied makes pnpm fail the install (unused patch). Then either port the patch to the new version and rerun `focus-caret` and the full browser suite, or remove it under the condition above. An upstream report is outside this change.
