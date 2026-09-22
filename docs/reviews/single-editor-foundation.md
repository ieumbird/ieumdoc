# Single Editor Foundation architecture review

- Reviewed baseline: `bc5dae2ef1faf745627a890a5a582882f1eeb29f` (`origin/master`, fetched 2026-09-22).
- History: foundation `4700785`, stale save `e101d57`, CLI help/inspect `c495687`, inspect labels `bc5dae2`.
- Decision: **PASS WITH FIXES** for this reviewed foundation and the fixes described below, including the follow-up guard coverage for `replaceText` and `insertParagraph`.
- Authority: Accepted ADR-0001 and AGENTS.md. A/B selection is not reopened.
- `feat/paragraph-semantics-v1` is not in the reviewed master and was not merged or reviewed here.

## Responsibility boundaries

| Area | Assessment |
| --- | --- |
| Single Editor | `DocumentEditor` owns one `useEditor` and one document state. NodeViews are read-only representations, not independent prose editors. Browser verification also found one editing surface. |
| Typed Blocks | `editor-schema.tsx` defines DOM representation, atom/selectability and available interactions. Core read models determine block meaning and editability. No canonical MyST model is created in the schema. |
| Core-owned semantics | Paragraph replacement uses `updateParagraphInlineContent`; plain heading replacement uses `updateNodeTextAtPath`. The repaired persistence check stays in Core's MyST boundary. |
| Editor/Core boundary | Tiptap JSON and engine positions stay in `apps/editor`. Runtime Editor code neither imports MyST nor mutates document AST nodes. Tests inspect AST as an oracle. |
| Fail-closed | Unknown Editor nodes/marks and structural changes are rejected. Unsupported Core blocks are immutable projections; save reparses the original source and applies only supported edits. Lossy supported text writes through `updateNodeTextAtPath`, `updateParagraphInlineContent`, `replaceText` and `insertParagraph` fail before persistence. |
| `.md` SSOT | Original Markdown remains authoritative. Display projections are never reconstructed into a replacement document. Save responses now describe reparsed canonical bytes. |
| CLI/Core | CLI delegates operations and read models to Core; help/inspect only format output. No CLI position/selection API is needed. Legacy rich inline replacement has a Core API but no dedicated CLI surface; it predates the CLI-first rule (`8886e23`). |

## Findings and actions

### F1 — Category 1, P1: supported inline save could silently change semantics (fixed)

- Files/symbols: `packages/core/src/operations.ts` (`updateParagraphInlineContent`, `updateNodeTextAtPath`, `replaceText`, `insertParagraph`), `apps/editor/server/document-api.ts` (`saveEdits`).
- Evidence: strong text `AB ` saved as `**AB **` and reloaded as literal text; one paragraph containing `A\n\nB` reloaded as two paragraphs. `validateStructure` only checked node shape. The returned read model described the pre-serialization tree rather than the stored bytes.
- Impact: a successful save could violate mark/block preservation and make the Editor baseline disagree with the file, contrary to ADR-0001's canonical write and fail-closed contract.
- Action: `updateParagraphInlineContent`, supported paragraph/heading targets in `updateNodeTextAtPath` and `replaceText`, and new paragraphs in `insertParagraph` check text, mark coverage, block type/heading depth and second serialization at the Core MyST boundary. Lossy requests fail before file writes. Save returns the read model of the actual canonical Markdown.
- Counterevidence/scope: technical fixtures already preserved unsupported Figure/Equation/Table/Admonition/reference semantics. This was not whole-document reconstruction or a Tiptap type leak. Equivalent nesting order and adjacent text fragments remain supported. The new check is bounded to supported inline paragraph/heading targets, not a validator for all MyST constructs, arbitrary `insertBlock` nodes or every Core operation. The follow-up closes the two identified bypasses; Core rejection preserves the original Document and CLI rejection preserves file bytes.

### F2 — Category 2, P1: successful delayed save discarded newer input (fixed)

- File/symbol: `apps/editor/src/App.tsx`, `save`.
- Evidence: with a mocked delayed POST, `PENDING_INPUT` existed before response and disappeared afterward. Every success incremented `editorGeneration`, even if the live document differed from the submitted snapshot.
- Impact: unsaved input was silently discarded despite a valid source revision. This is Editor session state, not Core document semantics.
- Action: retain the mounted Editor when its current snapshot differs from the submitted snapshot, update the source revision/baseline, and show `Saved; newer edits pending`. Subsequent Save includes pending input. No transaction/history framework was introduced.
- Verification: real-browser delayed success, subsequent request revision/payload, conflict retention and single editing surface; optional reproducible script in `apps/editor/test/save-during-edit.browser.js`.

### Category 2 — remaining bounded debt

- Rich inline formatting has a Core API but no dedicated CLI command. This predates the CLI-first rule and was not introduced by Single Editor Foundation. Adding a command would be a new capability, so this review records the gap instead of adding it.
- Source-string tests for `useEditor`, save ordering and import boundaries are supplementary evidence only. Existing schema/ProseMirror transaction, real-file stale-save and semantic preservation tests provide stronger evidence; nested round-trip and pre-write failure tests plus an optional browser regression were added. No test framework replacement.

### Category 3 — future concerns only

- Future Equation/Figure/Table/Requirement editing must add Core semantic operations and CLI surfaces before enabling Editor interaction. NodeView attributes remain projections, not the canonical model.
- Current successful saves without intervening edits remount the Editor and reset its local selection/history. This is explicit-save behavior, not per-keystroke serialize/reparse. Revisit when continuous editing/history requirements are specified.
- Revision hashing rejects changes observed at the persistence boundary and rejects shifted stale paths. It is not an OS-level atomic compare-and-swap against uncooperative external processes between read and write. Do not treat the local development adapter as a concurrent production backend.

## Verification and limits

- `pnpm typecheck`: passed.
- `pnpm test`: passed (Core 29, CLI 8, Editor 35).
- `pnpm --filter @ieumdoc/editor exec vite build`: passed; bundle exceeds Vite's 500 kB advisory threshold. No splitting/refactoring was performed for this unrelated advisory.
- Browser regression: pending input retained, next save uses updated revision, 409 retains input, one editing surface. POSTs mocked; fixture bytes unchanged.
- Static collector: Git inventory succeeded, default dependency/build/sensitive exclusions applied, no hash changes during collection. Markdown anchor handling is unsupported; collector signals were not treated as architecture conclusions.
- No new dependency, typed block, keyboard editing feature, generic schema/plugin framework or backend infrastructure.
- Native IME/device behavior, production persistence, CI enforcement and broad repository quality outside this requested architecture scope were not evaluated.

## Next recommended vertical slice

Expose the existing rich paragraph inline replacement capability through one thin CLI surface, with Core-owned validation and real-file round-trip tests. The API already exists, so the missing work is headless discoverability and use rather than another semantic implementation. This closes the specific legacy CLI parity gap before adding new typed-block editing. Do not add Editor keyboard UX or a general JSON command framework to that slice.
