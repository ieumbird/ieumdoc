import { diffLines, diffWordsWithSpace, type Change } from "diff";

// Whole-request limits, not allowances renewed for every changed line. The worker client
// also has a 2s watchdog covering startup, tokenization and result transfer.
export const DIFF_BUDGET_MS = 500;
export const WORD_BUDGET_MS = 100;
export const MAX_DIFF_CHARACTERS = 1_000_000;
const MAX_DIFF_LINES = 10_000;
const MAX_WORD_CHARACTERS = 64 * 1024;
const MAX_WORD_PAIR_CHARACTERS = 8 * 1024;

type Row = { line: string; old?: number; next?: number; words?: Change[] };
export type RecoveryDiff = {
  groups: { rows: Row[]; kind: "added" | "removed" | "same"; change: number; start: boolean }[];
  count: number;
  wordsOmitted: boolean;
};
export type RecoveryDiffReply = { diff: RecoveryDiff } | { error: "budget" | "failed" };

export class DiffBudgetError extends Error {}
// Keep line endings significant, including CRLF and missing final LF.
const lines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

/** Runs only in a dedicated worker in the product. A failure never returns partial line changes. */
export function recoveryDiff(before: string, after: string): RecoveryDiff {
  const deadline = performance.now() + DIFF_BUDGET_MS;
  const checkBudget = () => { if (performance.now() >= deadline) throw new DiffBudgetError(); };
  if (before.length + after.length > MAX_DIFF_CHARACTERS ||
      lines(before).length + lines(after).length > MAX_DIFF_LINES) throw new DiffBudgetError();
  checkBudget();
  const parts = diffLines(before, after, { timeout: Math.max(1, deadline - performance.now()) });
  if (!parts) throw new DiffBudgetError();
  checkBudget();
  let oldLine = 1, newLine = 1, count = 0;
  const groups: RecoveryDiff["groups"] = parts.map((part, index) => {
    checkBudget();
    const changed = Boolean(part.added || part.removed);
    const start = changed && (index === 0 || !(parts[index - 1].added || parts[index - 1].removed));
    if (start) count++;
    return { kind: part.added ? "added" : part.removed ? "removed" : "same", change: changed ? count : 0, start,
      rows: lines(part.value).map(line => ({ line, old: part.added ? undefined : oldLine++, next: part.removed ? undefined : newLine++ })) };
  });
  let wordsOmitted = false, wordCharacters = 0;
  const wordDeadline = Math.min(deadline, performance.now() + WORD_BUDGET_MS);
  // Visit each removal/addition pair once, then project the one result onto its two sides.
  for (let g = 0; g + 1 < groups.length; g++) {
    checkBudget();
    const removed = groups[g], added = groups[g + 1];
    if (removed.kind !== "removed" || added.kind !== "added") continue;
    for (let r = 0; r < Math.min(removed.rows.length, added.rows.length); r++) {
      const left = removed.rows[r], right = added.rows[r];
      const size = left.line.length + right.line.length;
      if (wordsOmitted || size > MAX_WORD_PAIR_CHARACTERS || wordCharacters + size > MAX_WORD_CHARACTERS || performance.now() >= wordDeadline) {
        wordsOmitted = true;
        break;
      }
      wordCharacters += size;
      const words = diffWordsWithSpace(left.line, right.line, { timeout: Math.max(1, Math.min(10, wordDeadline - performance.now())) });
      if (!words) { wordsOmitted = true; break; }
      left.words = words.filter(word => !word.added);
      right.words = words.filter(word => !word.removed);
    }
  }
  checkBudget();
  return { groups, count, wordsOmitted };
}
