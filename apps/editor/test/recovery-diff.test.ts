import assert from "node:assert/strict";
import test from "node:test";
import { DiffBudgetError, recoveryDiff } from "../src/recovery-diff.ts";

test("unified line and word changes retain both exact sources, numbering and region counts", () => {
  const before = "old title\r\n\r\nremoved\r\n\r\nkept\r\n";
  const after = "new title\r\n\r\n\r\nkept\r\n\r\nadded";
  const diff = recoveryDiff(before, after);
  const rows = diff.groups.flatMap(group => group.rows);
  assert.equal(rows.filter(row => row.old !== undefined).map(row => row.line).join(""), before);
  assert.equal(rows.filter(row => row.next !== undefined).map(row => row.line).join(""), after);
  assert.deepEqual(rows.filter(row => row.old !== undefined).map(row => row.old), [1, 2, 3, 4, 5]);
  assert.deepEqual(rows.filter(row => row.next !== undefined).map(row => row.next), [1, 2, 3, 4, 5, 6]);
  assert.equal(diff.count, 3);
  assert.equal(diff.wordsOmitted, false);
  const pair = diff.groups.filter(group => group.change === 1);
  assert.equal(pair.length, 2);
  for (const group of pair) {
    const row = group.rows[0];
    assert.equal(row.words?.map(word => word.value).join(""), row.line);
    assert.ok(row.words?.some(word => word.added || word.removed));
  }
});

test("the reviewer's 50 × 1000-word input retains every line within 500ms and omits word highlighting", () => {
  const source = (word: string) => "---\nlitzio: 1\n---\n\n```text\n" +
    Array(50).fill(Array.from({ length: 1000 }, (_, i) => word + i).join(" ")).join("\n") + "\n```\n";
  const before = source("old"), after = source("new");
  assert.ok(Buffer.byteLength(before) > 344_000 && Buffer.byteLength(before) < 345_000);
  const start = performance.now();
  const diff = recoveryDiff(before, after);
  assert.ok(performance.now() - start < 500, "whole diff exceeded the computation budget");
  assert.equal(diff.wordsOmitted, true);
  assert.equal(diff.count, 1);
  assert.equal(diff.groups.flatMap(group => group.rows).filter(row => row.old !== undefined).map(row => row.line).join(""), before);
  assert.equal(diff.groups.flatMap(group => group.rows).filter(row => row.next !== undefined).map(row => row.line).join(""), after);
});

test("extreme character or line counts reject the whole comparison instead of returning partial lines", () => {
  assert.throws(() => recoveryDiff("a".repeat(1_000_001), ""), DiffBudgetError);
  assert.throws(() => recoveryDiff("\n".repeat(6000), "\n".repeat(6000)), DiffBudgetError);
});
