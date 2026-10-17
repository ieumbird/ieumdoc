# Editor UX review and improvements (2026-10-17)

- Status: Historical
- Last verified: 2026-10-17 (implementation and verification recorded below; visual approval is pending with the user).
- Authority: evidence for one UX review of the running Editor and the changes made from it, not a separate behavior contract. Current contracts: [UX shell](../design/editor-ux-shell-v1.md), [layout](../design/editor-layout-rules-v1.md), [visual language v4.7](../design/editor-visual-language-v1.md), [Filesystem Host boundary](../design/filesystem-host-boundary-v1.md#folder-listing-v1-112), [Native document support](../design/document-support-v1.md), [Table caption](../design/table-caption-v1.md).
- Base: `e50502f` (master). Target: `feat/editor-ux-review-improvements`.

## Review method

The Editor was run with the Vite Host against a scratch folder under `tmp/ux-review/` (copies of the
sample and browser fixtures, a non-native empty file and a new document) and driven in a persistent
Chrome session at 1440, 1024 and 375px: Open folder, the tree, tabs, slash menu, selection toolbar,
tables, equations, figures, Source, Save, closing a dirty tab and the narrow layouts. Secondary text
contrast measured at least 6.3:1 and was left unchanged.

## Findings and changes

| Finding | Change |
| --- | --- |
| Same-named tabs both read `technical-document.md — d…`: the distinguishing folder was ellipsized first. | The folder is a separate 12px subtle label after the name and keeps its width; the name ellipsizes first. Accessible names are unchanged. |
| Wide tables and formulas were clipped at the paper edge with no sign of more content (overlay scrollbars stay hidden). | A scroll-driven edge fade (`--size-overflow-fade`) on the side with more content, absent without overflow, and a thin scrollbar where the platform draws one. |
| At 375px the expanded sidebar left the document about 90px, breaking headings mid-word. | Below 640px the sidebar starts collapsed to its rail and, opened, overlays the document; Escape or opening a document collapses it. 640px keeps the existing 704–768px tablet contracts. |
| Every `.md` file looked openable; a non-native file failed only after a click, with `ieumdoc: 1` jargon. | The sidebar listing marks files without the native marker (Core `hasNativeMarker`, first 4KB) with a subtle row, crossed-file icon and description. The refusal explains it in plain words, then shows Core's reason and action as details. |
| Hidden block chrome reserved space: about 90px above a plain table, 60px above equations, and tables sat 32px right of the text axis. | Figure/Equation/Table metadata moved out of flow into the gap above the block. Tables start on the text axis; row handles and Append row live in a layer outside the horizontal scroller, left of the axis. Table Edit (caption and label) joined Table actions and Delete in the action bar below the table. |
| Four different controls (sidebar tool, Visual/Source, document tab, Outline) shared one blue underline. | The marker means "current place" only (document tabs, sidebar tool). Visual/Source is a segmented control; an on Outline is a pressed toggle with the selected face. |
| The TopBar repeated the tab's filename. | The TopBar shows the document's location (folders from the chosen sidebar folder, else its own folder) before the name. |
| Selection toolbar icons had no tooltips; `#` for Cross-reference read as Heading. | Tooltips name each action with its shortcut; Cross-reference and slash reference choices use a bookmark icon. |
| In the slash menu the Quote shortcut `>` looked like a submenu chevron; Endnote had no icon (id mismatch). | Shortcuts are key chips; Endnote shows its icon. |
| Properties forms read Apply, Cancel while dialogs read Cancel … primary. | Properties forms read Cancel, Apply. |
| After a reload, reopening the previous folder took three steps in the Open folder dialog. | Without a chosen folder the sidebar lists recent folders; one click lists one. Automatic restoration was not added: the current contract keeps recent folders from restoring the sidebar on reload, and browser tests rely on that isolation. |
| File actions contained only Reload. | Copy path joins Reload. |
| Source soft-wrapped long lines, so table rows read as two. | One numbered line per Markdown line (numbers are generated content and never copied), scrolling sideways. |
| `IeumDoc` read as "leumDoc" in Pretendard. | UI and document text use Pretendard `cv08` (serifed capital I) through `--font-feature-sans`. |
| At 1024px the folder heading actions pushed even `docs` onto a second line. | The action group has no inner gaps and the narrow sidebar is 200px. |
| Favicon 404; native Location select; light dialog titles. | The product SVG mark is the tab icon; the select uses the field box with a chevron; dialog titles are semibold. |

The large blank above the sample Figure is whitespace inside the fixture SVG (`diagram.svg`), not
Editor layout, and was not changed.

## Review response (PR #322)

- A table wider than about twice the column could place the centered action bar, and so Edit, outside the first visible area. The bar now starts at the table's start beside Append row; `quiet-document` checks Edit, Table actions and Delete inside the scroller at `scrollLeft=0` on the overflowing long-content table at 1440/1024/768px.
- Copy path called `navigator.clipboard.writeText` directly, which throws synchronously where the API is absent (non-HTTPS remote HTTP Host pages). It now checks the API and explains the limitation; `editor-shell` removes the API and checks the message.
- The branch was merged with `master` (#296 local recovery) and verified again as below.

## Boundaries and parity

No document meaning, Save API, Tiptap state or persistence changed. `hasNativeMarker` is a read-only
Core helper so the Host does not interpret frontmatter itself; it is not admission. No CLI command is
added: the marker hint only decorates a sidebar listing, and headless admission is already decided by
the existing CLI commands through the same Core `parse`. Copy path, the overlay sidebar, tooltips and
Source numbering are Editor-only interactions outside CLI parity.

## Tests changed

- Core `native.test.ts`: marker detection from leading frontmatter, BOM/CRLF, non-leading and invalid markers.
- Editor `editor.test.ts`: the sidebar listing's `native` flag; folder browsing still returns names only.
- Editor `shell.test.tsx`: tab label parts, TopBar location, non-native tree rows and the recent-folder list.
- `layout-rules`: phone widths start collapsed, the opened sidebar overlays beside the rail, Escape collapses it; Visual/Source is measured as one control.
- `visual-states`: pressed Outline face and segmented view states replace the former marker checks.
- `table-authoring`: Edit sits below the table, which starts on the text axis with row handles left of it and clear of the gutter handle.
- `editor-shell`: hover the table beside the open, right-aligned Equation properties, which now cover its middle in the more compact layout.
- `footnotes`, `folder-navigation`, `quiet-document --screenshots`: phone widths start with the rail; the sidebar is opened before use, and the opened overlay is captured instead of a collapse.

## Verification

All on Windows with installed Chrome, persistent profiles, against the branch's Vite Host:

- After merging `master` and the review fixes: `pnpm typecheck`, `pnpm test` (Core 225, file-commit 4, CLI 64, Editor 252, Desktop 39 passing), `pnpm --filter @ieumdoc/editor build`, `pnpm docs:check`, `git diff --check`.
- `pnpm browser:test`: all 47 stable scenarios passed (7.1 min), including the new wide-table and Copy path checks. Before the merge the branch alone passed all 44.
- `pnpm --filter @ieumdoc/cli build` and `pnpm browser:test http-host`: http-host and http-recovery passed (the HTTP Host shares the folder listing handler).
- Same-state Before/After after the master merge: `pnpm browser:test quiet-document --screenshots` in a detached worktree of `b1395b1` (current master, dev server on 5174) and in this branch, 1440/1024/768/705/704/414/375px, 100% zoom, Pretendard loaded; plus a fresh 375px load and the overflowing long-content table hovered at 1024px, taken with the same Playwright script on both. Representative pairs:

| State | Before (`b1395b1`) | After |
| --- | --- | --- |
| 1440px rest | [before](../design/assets/editor-ux-review-2026-10-17/before-1440-rest.png) | [after](../design/assets/editor-ux-review-2026-10-17/after-1440-rest.png) |
| 375px fresh load | [before](../design/assets/editor-ux-review-2026-10-17/before-375-fresh.png) | [after](../design/assets/editor-ux-review-2026-10-17/after-375-fresh.png) |
| 1024px long content at rest | [before](../design/assets/editor-ux-review-2026-10-17/before-1024-long-content.png) | [after](../design/assets/editor-ux-review-2026-10-17/after-1024-long-content.png) |
| 1024px wide table hovered | [before](../design/assets/editor-ux-review-2026-10-17/before-1024-wide-table-hover.png) | [after](../design/assets/editor-ux-review-2026-10-17/after-1024-wide-table-hover.png) |

  At 1440px the table enters the first screen on the text axis and the Equation and Figure start 24–48px higher. At 375px the document keeps a readable width beside the rail instead of breaking the title mid-word. On the wide table, master shows Edit above the table and only `⋯` at the right edge with Delete cut off; the branch keeps Append row, Edit, Table actions and Delete together at the table's start. The full capture set stays in the ignored `tmp/ux-review/compare/`.

Earlier runs in this work found two real defects before they shipped: the first table alignment widened the horizontal scroller into the gutter, where it intercepted the block handle's clicks (fixed by moving row handles to a non-scrolling layer), and a 768px overlay threshold changed the tablet-width (704–768px) sidebar contract (lowered to 640px). Visual approval of v4.7 remains with the user.
