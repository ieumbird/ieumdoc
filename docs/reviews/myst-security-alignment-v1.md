# MyST dependency alignment and security remediation v1

Checked 2026-09-23 against master `b290d29` (after PR #8).
The persistent SSOT remains plain-text Markdown. No Core operation, parser
configuration, serializer policy, CLI mutation, or Editor behavior is changed.

## Package alignment

| Core direct dependency | Before | After | Decision |
| --- | --- | --- | --- |
| myst-common | 1.10.0 | 1.10.1 | Latest stable |
| myst-parser | 1.7.3 | 1.7.4 | Latest stable |
| myst-to-md | 1.0.16 | 1.0.17 | Latest stable |
| myst-transforms | 1.3.50 | 1.3.51 | Latest stable |
| vfile | 5.3.7 | 5.3.7 | All four MyST packages still require compatible 5.x ranges |

Versions and dependency/peer ranges were checked using the official npm registry:
[common](https://registry.npmjs.org/myst-common/1.10.1),
[parser](https://registry.npmjs.org/myst-parser/1.7.4),
[to-md](https://registry.npmjs.org/myst-to-md/1.0.17), and
[transforms](https://registry.npmjs.org/myst-transforms/1.3.51).
They belong to the [MyST 1.11.0 release](https://github.com/jupyter-book/mystmd/releases/tag/mystmd%401.11.0).
The parser now uses markdown-it-myst 1.0.18, which incorporates myst-extras;
MyST's related common/frontmatter/spec packages follow their published ranges.
Vfile's latest stable is 6.0.3, but changing its major is unnecessary and outside
the version family used by this MyST combination. Unrelated direct versions stay fixed.

## Audit before and after

`pnpm audit --json` reports **10 advisories (2 high, 8 moderate)** before alignment,
after the stable MyST update, and after remediation. These are distinct advisories,
not a count of dependency paths. All affected packages below are transitive.
The scanner uses package versions and does not recognize the local smartquotes
backport. No advisory is suppressed or excluded from the audit.

### Dependency paths and actual execution

- **P:** Core → myst-parser → markdown-it 13.0.2. The same version is a peer of
  markdown-it-amsmath, markdown-it-dollarmath, and markdown-it-myst. Before alignment,
  markdown-it-myst-extras was another peer consumer. Core → myst-transforms →
  myst-to-html → markdown-it is an additional installed path.
- **L:** Each P path → linkify-it 4.0.1.
- **K:** Core → myst-transforms → katex 0.15.6. Editor separately uses katex 0.18.7.
- **C:** Core → myst-parser → myst-directives → csv-parse 5.6.0.

The following table lists every advisory returned by the baseline and final audits.
"Fixed upstream" is the first fixed release in the advisory, not a proposed override.

| Package / path | Advisory / CVE | Severity | Fixed upstream | IeumDoc status |
| --- | --- | --- | --- | --- |
| markdown-it 13.0.2 / P | [GHSA-6v5v-wf23-fmfq](https://github.com/advisories/GHSA-6v5v-wf23-fmfq), CVE-2026-48988 | Moderate | 14.2.0 | **Reachable; mitigated by exact-version upstream backport** |
| markdown-it 13.0.2 / P | [GHSA-38c4-r59v-3vqw](https://github.com/advisories/GHSA-38c4-r59v-3vqw), CVE-2026-2327 | Moderate | 14.1.1 | Linkify rule is off; vulnerable regex is not reached |
| linkify-it 4.0.1 / L | [GHSA-22p9-wv53-3rq4](https://github.com/advisories/GHSA-22p9-wv53-3rq4), CVE-2026-48801 | High | 5.0.1 | Automatic linkification is off; scan loop is not reached |
| linkify-it 4.0.1 / L | [GHSA-v245-v573-v5vm](https://github.com/advisories/GHSA-v245-v573-v5vm), CVE-2026-59887 | High | 5.0.2 | Automatic linkification is off; mailto validator scan is not reached |
| katex 0.15.6 / K | [GHSA-3wc5-fcw2-2329](https://github.com/advisories/GHSA-3wc5-fcw2-2329), CVE-2024-28246 | Moderate | 0.16.10 | Legacy renderer is not invoked by Core |
| katex 0.15.6 / K | [GHSA-f98w-7cxr-ff2h](https://github.com/advisories/GHSA-f98w-7cxr-ff2h), CVE-2024-28245 | Moderate | 0.16.10 | Legacy renderer is not invoked by Core |
| katex 0.15.6 / K | [GHSA-cvr6-37gx-v8wc](https://github.com/advisories/GHSA-cvr6-37gx-v8wc), CVE-2024-28244 | Moderate | 0.16.10 | Legacy renderer is not invoked by Core |
| katex 0.15.6 / K | [GHSA-64fm-8hw2-v72w](https://github.com/advisories/GHSA-64fm-8hw2-v72w), CVE-2024-28243 | Moderate | 0.16.10 | Legacy renderer is not invoked by Core |
| katex 0.15.6 / K | [GHSA-cg87-wmx4-v546](https://github.com/advisories/GHSA-cg87-wmx4-v546), CVE-2025-23207 | Moderate | 0.16.21 | Legacy renderer is not invoked by Core |
| csv-parse 5.6.0 / C | [GHSA-8cw4-87c7-c6xx](https://github.com/advisories/GHSA-8cw4-87c7-c6xx), CVE-2026-85063 | Moderate | 7.0.2 | CSV parsing is reachable; vulnerable object/duplicate-column options are not enabled |

Evidence for these reachability decisions:

- `packages/core/src/myst/parse.ts` calls `mystParse(source)` with defaults.
  MyST's `dist/myst.js` enables `extensions.smartquotes` and `typographer`; its
  `dist/config.js` leaves `linkify: false`. Smartquotes therefore runs for CLI and
  local Host parsing of untrusted Markdown. Disabling it would change existing text
  semantics and is not an acceptable mitigation. An instrumented regression checks
  that automatic linkify scanning functions are not called with IeumDoc's defaults.
- Core invokes only `liftMystDirectivesAndRolesTransform` and
  `containerChildrenTransform`. It does not call MyST's `mathTransform`,
  `renderEquation`, or HTML renderer. Importing the transforms package can load
  legacy KaTeX, but does not render user math. A regression installs throwing
  tripwires on that dependency's rendering functions while Core parses and serializes
  inline/display math. Editor's `src/equation-render.ts` renders with its separate
  fixed KaTeX 0.18.7 and `trust: false`.
- `myst-directives/dist/table.js` calls `csv-parse/browser/esm/sync` with only
  delimiter, ltrim, escape, and quote. It returns row arrays and never enables
  `columns` or `group_columns_by_name`; document directive options cannot turn them
  on. The advisory requires both options. A CSV-table regression includes duplicate
  `__proto__` header cells and checks semantic/canonical round-trip preservation.

These are bounded claims about current execution paths, not declarations that the
installed legacy libraries are universally safe. Reassess before enabling linkify,
MyST HTML/math rendering, or CSV object-column parsing.

## Minimal reachable-path remediation

The latest stable MyST packages still require markdown-it `^13.0.0`, KaTeX
`^0.15.2`, and csv-parse `^5.5.5`. Their updates cannot naturally install the fixed
majors. In particular markdown-it-myst 1.0.18 still declares a markdown-it
`^13.0.1` peer. Forcing markdown-it 14/15 would violate that peer contract and also
bring unrelated parsing changes.

`pnpm-workspace.yaml` instead registers an exact `markdown-it@13.0.2` patch:
`patches/markdown-it@13.0.2.patch`. It backports only the buffered quote-replacement
algorithm from upstream commit
[`9ce2087`](https://github.com/markdown-it/markdown-it/commit/9ce2087562c45d1e5ddd9f76b990f4b3fbe040e5).
Adaptations are limited to the 13.x CommonJS/var syntax; its existing punctuation
helpers and all parser options remain intact. No dependency version override,
peer-range bypass, custom parser, or audit-ignore setting is added.
The patch is locked by hash; `.gitattributes` keeps patch files LF on Windows too.

The patch addresses only GHSA-6v5v-wf23-fmfq in the CommonJS library entry used by
MyST and Vite. The unused prebundled markdown-it `dist/` assets are not patched and
must not be introduced as an alternative runtime entry without reassessment.
Unreachable advisories do not justify forcing the other legacy libraries across
major versions in this change.

**Removal condition:** remove the patch and its lockfile registration when stable
MyST/parser plugins support a markdown-it version containing the upstream fix (or
an official 13.x backport). Re-run the semantic and browser regressions before
accepting the new dependency combination.

## Semantic and integration evidence

- Before any update: frozen install, typecheck, all 174 tests, and Editor build pass.
- For `document.md`, `technical-document.md`, and an inline specimen covering hard
  breaks, nested marks, inline math, links, and typography, capture original parse
  trees, EditableDocument values, block inspection/NodePaths, canonical Markdown,
  and reparsed results. Every captured value is identical after both alignment and
  the security patch. The three baseline canonical outputs are checked in as
  `packages/core/test/fixtures/*.canonical.md` and are asserted byte-for-byte after
  normalizing checkout CRLF only.
- The existing `{eq}` role serializes as a fragment link. This already happened on
  master; the new test explicitly checks the unchanged target and NodePath on both
  sides rather than treating the internal AST node spelling as newly equivalent.
- Differential checks compare patched vs original smartquotes tokens for all 19
  upstream 13.0.2 smartquotes fixture cases and 5,000 deterministic generated inputs:
  identical. The upstream 160,000-quote input completes in approximately 37 ms in
  the tokenizer on this machine. A permanent Core regression runs that input in a
  child process with a generous 10-second hang guard and checks exact quote output.
- Final clean-copy install with no node_modules applies the patch with
  `pnpm install --frozen-lockfile`, without changing the lockfile hash. Typecheck,
  all 181 tests (Core 71, CLI 17, Editor 93), and Editor production build pass.
  The pre-existing bundle-size advisory remains; no new build warning is introduced.
- All seven existing browser scenarios pass with the project-local Playwright CLI:
  editor-shell, new-document, equation-insertion, open-files, layout-rules,
  save-during-edit, and equation-save-during-edit. No assertion is weakened.
- A separate real Editor check opens a temporary copy of the technical fixture,
  edits a paragraph, saves through the real Host API, reloads and reopens it, and
  compares every EditableDocument block and the saved file. Disk output equals
  the old canonical fixture plus exactly the intended edit; figure media loads.
  No console warning/error occurs in this real flow. Existing mocked 400/409 and
  nonexistent mocked-path media 404s in the scenario suite remain expected.

Validation environment: Windows, Node 24.21.0, pnpm 12.5.1, Chrome. Other operating
systems/browsers were not run. Finite regression coverage is not a proof for every
possible Markdown input; no intentional semantic or canonical-output change was made.

## Addendum: Canonical Input Safety v1

Core parse now calls `mystParse` with `extensions.smartquotes: false` so typed straight
quotes are kept as written (see `docs/test/TEST_GUIDE.md`, "Canonical Input Safety v1").
Typographic substitution had made every edit containing `'` or `"` fail the canonical
round-trip check. The reachability evidence above ("Smartquotes therefore runs for CLI
and local Host parsing") no longer holds: Core does not reach the smartquotes rule. This
is a text-preservation decision, not the DoS mitigation the evidence rejected. The patch
and its removal condition are unchanged; the dependency is still installed, and the
160,000-quote regression now drives MyST's default tokenizer directly, plus Core parse.

## Follow-up

- Track upstream MyST support for fixed markdown-it, KaTeX, and csv-parse families;
  remove the smartquotes patch when that support lands and revisit every row above.
- Keep the PR #8 release-age exceptions unchanged: cn 0.4.0 was published at
  2026-09-22 10:43 UTC and fs-extra 11.4.1 at 16:20 UTC. Neither had reached pnpm's
  built-in 24-hour threshold during this work. Remove those exact exceptions in a
  later change after a frozen install succeeds without them. No new exception is added.
