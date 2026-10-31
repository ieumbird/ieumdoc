# Native document boundary implementation

당시 이름: 이음독(IeumDoc), 현재 Litzio

- Status: Historical
- Last verified: 2026-10-14 (implementation and regression verification for #232).
- Authority: evidence only; current rules are [ADR-0006](../adr/0006-native-document-boundary.md) and [Native document support](../design/document-support-v1.md).

The approved scope was native admission and creation across Core, CLI and the shared Host, removal of general Markdown partial compatibility, and the corresponding test reduction. Import, Migration, automatic marker insertion and public release were excluded. Existing user files are never upgraded implicitly; Desktop selects a new sample directory.

## Removed and retained responsibilities

| Former responsibility | Change and verification ownership |
| --- | --- |
| Accept unsupported documents and expose read-only blocks/cells/headings | Removed. Core admission checks the complete document; Host and browser tests cover rejection without replacing local work. |
| Replace arbitrary block MyST source | Removed Core API/parser, CLI command, Host route/replay, Editor form/state and dedicated unit/browser scenarios. Public API tests ensure it is not exported. |
| Preserve original block source/line provenance for fallback display | Removed source registry, read-model fields, fallback views and CSS. Whole-document Source remains covered by its existing scenarios. |
| Count headings/targets hidden inside unsupported nested structures | Removed compatibility projection. Native numbering retains the existing top-level default policy and its MyST parity checks. |
| Accept generic metadata and custom heading enumeration | Replaced by the narrow native YAML contract. YAML errors, duplicate keys and invalid marker versions are Core admission cases. |
| Repeat full-fixture canonical round-trips in CLI/Editor | Removed redundant loops; Core retains semantic round-trip guards. CLI and Host retain actual writes, unchanged-byte refusals, revisions and response contracts. |
| Mix unsupported fixtures with valid editing workflows | Removed compatibility-only fixtures/assertions; supported table formatting, footnotes, history, draft races, section operations and Save → Reload remain tested. |

Core semantic tests use the private MyST parser for internal fragments; public native tests cover admission and creation. Editor/CLI successful fixtures explicitly contain native metadata and supported content. Production never adds a marker to an existing input.

## Regressions found during implementation

Hiding metadata from the body projection exposed lookups that confused body array offsets with Core snapshot paths. Heading updates, heading levels, footnote insertion, section ranges and Host replay now retain snapshot addresses, including metadata at path `[0]`.

The block-boundary guard temporarily completes footnotes with synthetic references. Projecting these temporary nodes as native authoring content masked the final orphan-definition error. The guard now compares parser block types/kinds across its canonical round-trip. A public native regression failed before the correction and passes afterward; the real browser still refuses an orphan definition without writing the file.

The installed `myst-frontmatter@1.10.1` page validator reports `extra key ignored: ieumdoc` and omits the key from its result. This external warning does not define IeumDoc admission; Core owns the native contract.

## Verification measurements

The pre-change baseline was `dd591e9`, measured in a separate checkout with the same lockfile. The final sequential `pnpm test` run passed 515 tests with the same two platform skips. No other build or browser suite ran during this measurement.

| Suite | Before | After |
| --- | ---: | ---: |
| Core | 218 | 201 |
| File commit | 4 | 4 |
| CLI | 48 | 45 |
| Editor | 242 | 229 |
| Desktop | 38 | 38 |
| Total | 550 | 517 |
| Wall time (seconds) | 363.438 | 335.539 |

These are single runs on the same Windows machine. The 33-test reduction describes removed responsibilities and redundant coverage; the observed elapsed-time difference does not establish a repeatable performance improvement. The dedicated block-source browser scenario was removed; 42 native scenarios remain.

Final execution results are recorded with the implementation PR. No release was published and no installer update was triggered.
