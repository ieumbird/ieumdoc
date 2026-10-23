# Parser security boundary

- Status: Implemented
- Last verified: 2026-10-23 (bounded public API regression, Core tests, typecheck, Editor build and browser admission/Save → Reload; dependency audit snapshot below).
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
  [105e5d7](https://github.com/markdown-it/linkify-it/commit/105e5d7), the fix released in 5.0.2 for
  [GHSA-v245-v573-v5vm](https://github.com/advisories/GHSA-v245-v573-v5vm).
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

## Verification evidence and limits

The pre-fix baseline was `496d800`. The extended `myst-regression.test.ts` failed with a recognized
65-character mailto local-part and 33,024 aggregate HTML-regex suffix characters for only 128
unclosed comment openers through public parsing. This is bounded instrumentation, not a timing
benchmark. The final tests count both HTML regex inputs and terminator-search suffixes, and
exercise all four special HTML construct families through public `parse()` and
`unresolvedReferences()`. Separate controls prove URL diagnostics still run and native HTML
refusal/literal canonical behavior is preserved. Existing semantic/canonical fixtures are reused.

Local verification: MyST regression 10/10, Core suite 244/244, workspace typecheck and Editor build
passed. The initial cold pre-fix run also hit the existing smartquotes child-process 10-second
guard; the unchanged guard passed on the subsequent targeted run and full Core suite. No
performance claim is based on those elapsed times. Editor build retains its existing large-chunk
warning. Packaging/platform and full integration checks remain required CI work.

`pnpm browser:test writeability-preflight reference-save-reload` passed 2/2 against this
worktree's Vite on port 5197 with the persistent browser profile. This verifies Host refusal
state retention and reference Save → Reload integration, not another timing benchmark. The
runner closed its browser context; Vite and its execution session were stopped and the port
and worktree-owned browser processes were checked for cleanup.

`pnpm audit --prod --json` on 2026-10-23 reports **14 advisories: 3 high, 9 moderate, 2 low**.
The registry audit sees the original package versions and does not certify local backports;
the count is unchanged. This work fixes the two demonstrated paths above and retains the prior
smartquotes patch. It does not claim every remaining advisory is fixed or unreachable, nor prove
linear complexity for every possible Markdown input.
