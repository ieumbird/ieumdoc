# Parser security boundary

- Status: Implemented
- Last verified: 2026-10-29 (CI probe selection tests and targeted MyST/quote-boundary/standalone smartquotes regressions; full public API/Core/typecheck/build/browser evidence and audit snapshot below remain dated 2026-10-23).
- Scope: Core's pinned MyST parser and source diagnostics, under [Native document support](document-support-v1.md) and [ADR-0002](../adr/0002-document-persistence-semantic-ownership.md).
- Related: immediate bug [#346](https://github.com/ieumbird/ieumdoc/issues/346); long-term upstream migration and patch removal [#11](https://github.com/ieumbird/ieumdoc/issues/11).

## Current boundary

Automatic linkification remains disabled, but this does **not** make linkify-it unreachable.
Public `parse()` checks citation shorthand through source diagnostics; public
`unresolvedReferences()` uses the same tokenizer to distinguish literal syntax from URL text.
`literal-syntax.ts` therefore calls the installed tokenizer's `linkify.match()`.
The raw internal parser alone does not exercise this path.

MyST's HTML recognition stays enabled. Disabling it would turn unsupported HTML into literal
text and change native admission. Recognized HTML remains refused, including a valid construct
after a different unterminated construct. Escapes, code and malformed literal text retain their
canonical round-trip contract. This is a dependency security correction, not a new semantic
operation; existing CLI and Host callers use the same Core API without a new command.

## Pinned backports

MyST uses markdown-it 13.x and its linkify-it 4.x dependency. Keep these API/peer versions rather
than forcing a new major into the parser/plugins. The following local patches are applied by
`pnpm-workspace.yaml` and hashed in the lockfile:

- `patches/linkify-it@4.0.1.patch`: backports upstream
  [6be6d15](https://github.com/markdown-it/linkify-it/commit/6be6d15), released in 5.0.1 for
  [GHSA-22p9-wv53-3rq4](https://github.com/advisories/GHSA-22p9-wv53-3rq4), and
  [105e5d7](https://github.com/markdown-it/linkify-it/commit/105e5d7), released in 5.0.2 for
  [GHSA-v245-v573-v5vm](https://github.com/advisories/GHSA-v245-v573-v5vm).
  The first fix scans schemed links, fuzzy emails and fuzzy links independently with global
  regex cursors, then merges their ordered matches. It removes repeated tail slicing/searches
  and the old internal scan cache. The upstream functions are retained in the 4.x CommonJS
  entry point; no new Core URL parser or registry is introduced.
  Email local-parts are bounded at 64 characters and URL credential recognition at 50, matching
  upstream. These are recognizer grammar limits, not a document input limit; text and explicit
  Markdown links are not truncated. Exceptionally long credentials/local-parts may no longer
  suppress source diagnostics as a recognized bare URL.
- `patches/markdown-it@13.0.2.patch`: retains the prior smartquotes backport and adds an adaptation
  of upstream [d99f488](https://github.com/markdown-it/markdown-it/commit/d99f488) for
  [GHSA-vfgh-jcmw-g37q](https://github.com/advisories/GHSA-vfgh-jcmw-g37q), fixed upstream in 14.3.3/15.0.3.
  It caches terminator searches before the unchanged 13.x HTML regex. Unlike the upstream single
  skip flag, separate terminator entries preserve recognition of a valid different construct
  after an unclosed one. Successful search intervals are cached too, because the older comment
  grammar can reject an opener before a distant terminator. Backward inline lookahead only
  reuses a search when its covered interval includes the requested start.

The adaptation deliberately retains 13.x comment/declaration grammar: for example `<!-->`,
`<!--->` and `<!A>` remain literal text. No new HTML parser, broad registry, diagnostics bypass,
timeout relaxation or document-length cutoff is introduced.

Remove these patches only when compatible supported upstream dependencies contain all relevant
fixes and public admission/diagnostic, HTML refusal, canonical, Core/CLI/Editor and browser
regressions pass without them. Reassess the audit and reachability at that time. #346 does not
close #11. The [original security review](../reviews/myst-security-alignment-v1.md) retains its
historical findings; it is not the current reachability contract.

## Source compatibility of the URL recognizer

The `6be6d15` backport adopts upstream 5.0.1 recognition behavior, not behavioral equivalence
with 4.0.1. Independent global scans can select different URL ranges for adjacent or concatenated
URL/email combinations. Source diagnostics use those ranges to suppress bracket diagnostics
inside URLs, so handwritten noncanonical source can receive different reference warnings or
be refused where it previously opened. The observed admission changes below are fail-closed;
this is not a claim about every possible input combination.

With the same native marker and Core code, changing only the recognizer produced these public
API results (small read-only checks, 2026-10-23):

| Body source | Previous recognizer | Backported recognizer |
| --- | --- | --- |
| `b@c.org//h.com/[@x]` | Admitted, no reference diagnostics | `parse()` refuses with `native-content` |
| `u:p@h.net//h.com/[@x]` | Admitted, no reference diagnostics | `parse()` refuses with `native-content` |
| `mailto:u@d.net"<ftp://mailto:http://x.io/[@x]` | Admitted, no reference diagnostics | `parse()` refuses with `native-content` |
| `b@c.org//h.com/[a][b]` | Admitted; `unresolvedReferences()` returns `[]` | Admitted; diagnostics include label `b` |

Canonical escaping and the write contract are unchanged. The previous canonical outputs for
all four examples are admitted by both recognizers and serialize identically on round-trip.
For example, `b@c.org//h.com/\[\@x]` and `b@c.org//h.com/\[a]\[b]` retain their literal meaning.
These changes affect interpretation of handwritten, unescaped noncanonical source, rather than
the canonical escaped output generated by IeumDoc. They are an accepted compatibility consequence
of the upstream security fix; the source diagnostics themselves have not been removed.

## Dependency patch probe execution

The large smartquotes child-process probe remains unchanged (160,000 quotes and the
10-second hang guard), in `packages/core/test/smartquotes-patch.test.ts`. It is outside
the default Core suite and runs via `pnpm --filter @ieumdoc/core test:smartquotes`.
CI selects it for root/Core package manifests, lockfile/workspace dependency configuration,
`patches/**`, the parser/tokenizer settings in `packages/core/src/myst/` (`parse.ts`,
`serialize.ts`, `footnote.ts`, `literal-syntax.ts`) and the probe itself. New tokenizer
configuration files must be added to that selection list. An unavailable event diff
or unverified master-push reuse falls back to full CI including this probe. This retains
#11's installed-dependency patch verification while public quote-preservation, URL and
HTML security regressions remain in the default Core suite. The exact execution policy
is in [CONTRIBUTING](../../CONTRIBUTING.md#verification-matrix).

## Verification evidence and limits

The pre-fix baseline was `496d800`. The extended `myst-regression.test.ts` failed with a recognized
65-character mailto local-part and 33,024 aggregate HTML-regex suffix characters for only 128
unclosed comment openers through public parsing. This is bounded instrumentation, not a timing
benchmark. The final tests count both HTML regex inputs and terminator-search suffixes, and
exercise all four special HTML construct families through public `parse()` and
`unresolvedReferences()`. Separate controls prove URL diagnostics still run and native HTML
refusal/literal canonical behavior is preserved. Existing semantic/canonical fixtures are reused.

The follow-up baseline `a9e4f8f` still had the separate fuzzy-email/link tail scan vulnerability.
The new public API regression failed with 136,153 searched characters for a 1,048-character
paragraph containing 128 emails. After the `6be6d15` backport it bounds consumed regex search
spans on both public admission and reference diagnostics for repeated emails and fuzzy links;
every expected URL must still be recognized. It uses small inputs, not timing thresholds.
The earlier 512-case, space-separated email/link/text sample missed adjacent/concatenated URL
changes. Its zero differences do not establish recognizer equivalence. The
[independent review](https://github.com/ieumbird/ieumdoc/pull/357#issuecomment-6359189380)
identified those changes; the public API examples above were then reproduced locally. Existing
canonical fixtures and the explicit escaped-output checks support canonical preservation, not
unchanged admission or diagnostics for all handwritten source.

After integrating master `ec1e35b` (citation structure, CLI locator and current contracts), local
verification passed: Core 247/247 (including MyST regression 11/11), CLI 67/67, Editor 271/271,
workspace typecheck, Editor build, frozen-lockfile installation and docs/diff checks.
The initial cold pre-fix run also hit the existing smartquotes child-process 10-second
guard; the unchanged guard passed on the subsequent targeted run and full Core suite. No
performance claim is based on those elapsed times. Editor build retains its existing large-chunk
warning. Packaging/platform and full integration checks remain required CI work.

After integrating master `8b3ea92354f86ef282bfd2a0f73c55ac29c1d29c` without conflicts,
`pnpm browser:test writeability-preflight reference-save-reload` passed 2/2 at source head
`d5fd9198f73e620a8a4499f369a4c15fada48c70`, against this worktree's Vite on port 5197 with
its persistent browser profile. Both URL backports and the HTML patch were present. This
verifies Host refusal state retention and reference Save → Reload integration, not a timing
benchmark. The runner closed its browser context; owned Vite PID 39548 and its execution session
were stopped, with no listener on 5197 or remaining worktree-owned browser process.
That master update changed only two unrelated browser scenarios and their test documentation;
the Core/CLI/Editor suites above were not redundantly rerun. The subsequent evidence update is
documentation-only. Required CI and independent approval must still match the final PR head.

## Production audit and reachability

`pnpm audit --prod --json` on 2026-10-23 reports **14 advisories: 3 high, 9 moderate, 2 low**.
The registry audit sees the original package versions and does not certify local backports.
The count is unchanged; a patched reachable path and a configuration-disabled path are different
claims. The table covers all 14 reported advisories, rather than treating automatic linkify being
off as evidence about the manually called recognizer.

| Advisory | Installed dependency | Current Core/Editor path and treatment |
| --- | --- | --- |
| [GHSA-22p9-wv53-3rq4](https://github.com/advisories/GHSA-22p9-wv53-3rq4) | linkify-it 4.0.1 | Public parse/diagnostics reach `match`; fuzzy-link/email scan loop fixed by the `6be6d15` backport. |
| [GHSA-v245-v573-v5vm](https://github.com/advisories/GHSA-v245-v573-v5vm) | linkify-it 4.0.1 | Same reachable recognizer; mailto/credential scans bounded by the `105e5d7` backport. |
| [GHSA-vfgh-jcmw-g37q](https://github.com/advisories/GHSA-vfgh-jcmw-g37q) | markdown-it 13.0.2 | HTML inline rule is reachable; terminator search backport preserves 13.x grammar and native refusal. |
| [GHSA-38c4-r59v-3vqw](https://github.com/advisories/GHSA-38c4-r59v-3vqw) | markdown-it 13.0.2 | Automatic linkify rule is disabled. Manual URL diagnostics do not run markdown-it's linkify rule. No advisory-specific backport. |
| [GHSA-253c-mchw-3w2r](https://github.com/advisories/GHSA-253c-mchw-3w2r) | markdown-it 13.0.2 | Automatic linkify rule is disabled; its token rewrite/asterisk scans are not the direct recognizer call. No advisory-specific backport. |
| [GHSA-6v5v-wf23-fmfq](https://github.com/advisories/GHSA-6v5v-wf23-fmfq) | markdown-it 13.0.2 | Smartquotes is disabled at the shared Core options boundary; the existing replacement-batching backport is also retained. |
| [GHSA-r7fv-28h4-cvq7](https://github.com/advisories/GHSA-r7fv-28h4-cvq7) | markdown-it 13.0.2 | Smartquotes rule is disabled in Core parsing and diagnostic tokenizers. The retained patch is not a claim that every default-tokenizer smartquotes case is fixed. |
| [GHSA-8cw4-87c7-c6xx](https://github.com/advisories/GHSA-8cw4-87c7-c6xx) | csv-parse 5.6.0 via myst-directives | CSV-table parsing is reachable, but its options do not enable `columns` or `group_columns_by_name`; vulnerable object-column construction is not used. No patch. |
| [GHSA-3wc5-fcw2-2329](https://github.com/advisories/GHSA-3wc5-fcw2-2329) | KaTeX 0.15.6 via myst-transforms | Legacy renderer is not called by Core. Editor uses its separate 0.18.7 dependency. No legacy patch. |
| [GHSA-f98w-7cxr-ff2h](https://github.com/advisories/GHSA-f98w-7cxr-ff2h) | KaTeX 0.15.6 via myst-transforms | Same unused legacy renderer; Editor uses 0.18.7 with `trust:false`. No legacy patch. |
| [GHSA-cvr6-37gx-v8wc](https://github.com/advisories/GHSA-cvr6-37gx-v8wc) | KaTeX 0.15.6 via myst-transforms | Same unused legacy renderer; Editor uses 0.18.7. No legacy patch. |
| [GHSA-cg87-wmx4-v546](https://github.com/advisories/GHSA-cg87-wmx4-v546) | KaTeX 0.15.6 via myst-transforms | Same unused legacy renderer; Editor uses 0.18.7 with `trust:false`. No legacy patch. |
| [GHSA-64fm-8hw2-v72w](https://github.com/advisories/GHSA-64fm-8hw2-v72w) | KaTeX 0.15.6 via myst-transforms | Same unused legacy renderer; Editor uses 0.18.7. No legacy patch. |
| [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7) | KaTeX 0.15.6 via myst-transforms | Same unused legacy renderer; Editor uses 0.18.7. No legacy patch. |

Evidence boundaries: the MyST regression instruments public URL/HTML calls, asserts raw parsing
does not call linkify, rejects legacy KaTeX renderer calls, and checks prototype-like CSV headers
as ordinary cells. Installed `myst-directives/dist/table.js` supplies only CSV text-format options;
Core imports only selected transforms. [Editor equation rendering](../../apps/editor/src/equation-render.ts)
uses the separately pinned renderer. Reassess this table if parser options, transforms or CSV
options change. These are current execution-path conclusions, not universal safety guarantees
for the installed packages or a proof of linear complexity for every Markdown input.
