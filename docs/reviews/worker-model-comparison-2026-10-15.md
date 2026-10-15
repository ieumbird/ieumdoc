# Worker model comparison on #216

- Status: Historical
- Last verified: 2026-10-15 (one-time comparison; the comparison branches were not merged and have been deleted).
- Authority: evidence only. It is not a contract or a model-assignment rule. The defect found is tracked in #308.

The comparison checked whether Codex worker settings differ on the same Core/CLI task. #216 (opt-in label rename with same-document reference updates) was implemented again from `f18ef53`, the commit before #300 was merged. All eight settings ran at the same time with the same prompt. Each prompt included the issue text and told the worker not to consult GitHub or later history.

## Method

- Each worker made one commit with no push. The commits were then checked against the same probe document, using each branch's source CLI.
- The probe covered:
  - renaming each of the four target kinds (Equation, Figure, Table, Section);
  - display text, code, other-document links and unresolved references staying unchanged;
  - default `update-label`;
  - conflicts with explicit and implicit heading IDs;
  - invalid labels;
  - `apply-batch`;
  - `constructor` and `toString` as new labels.
- Core and CLI tests, `pnpm typecheck` and `pnpm docs:check` were rerun independently in each worktree.

## Result

All eight passed the common checks. They also left `apps/editor` unchanged and documented the Editor entry point as a follow-up.

They differed on renaming to `toString`. The rewritten `[fig](#toString)` link makes MyST's own link resolution throw a `TypeError`: the as-written lookup finds the inherited `Object.prototype.toString`. Refusing the rename is therefore correct. #300, as merged, accepts it, and #308 tracks this.

| Setting | Time | Commit | `toString` | Other observations |
| --- | --- | --- | --- | --- |
| gpt-6.1-sol low | 4.6 min | `d7e3460` | Refused | Fastest. Its `constructor` refusal message names the wrong cause. |
| gpt-6.1-sol medium | 6.6 min | `d7224b8` | Accepted | Valueless `--update-references` flag instead of the `<true\|false>` convention. |
| gpt-6.1-sol high | 10 min | `9c5b87a` | Accepted | Same structure and same defect as #300 (also sol high). Valueless flag. |
| gpt-6.1-sol xhigh | 10 min | `2577355` | Refused | |
| gpt-6-astra low | 8 min | `5c1d41f` | Refused | Followed the option convention. |
| gpt-6-astra medium | 9 min | `257ebbc` | Refused | Separate `rename-target` command. A blank line split its provenance trailer block. |
| gpt-6-astra high | 16 min | `e6bf318` | Refused | Separate `rename-target` command. Correctly diagnosed `constructor` as MyST's inherited lookup. |
| gpt-6-astra xhigh | 18 min | `e01c4a4` | Refused | Most tests (Core +148 and CLI +69 lines). Valueless flag. |

## Limits

This is one task with one discriminating case, so it does not rank the settings in general. Timings come from eight concurrent runs on one machine. Only the commit hashes are preserved.
