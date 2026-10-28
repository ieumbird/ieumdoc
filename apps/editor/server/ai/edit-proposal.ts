// SPIKE: AI edit proposals as per-block replacements of canonical MyST Markdown, validated by Core.
import { composeBlocks, documentBlocks } from "@ieumdoc/core";

export type BlockChange = { action: "replace" | "insert_after" | "delete"; block: number; markdown: string; reason: string };
export type EditOutput = { summary: string; changes: BlockChange[] };
/** One contiguous change: original blocks [old[0], old[1]) became proposed blocks [new[0], new[1]). */
export type Hunk = { id: number; old: [number, number]; new: [number, number]; reason: string };

/** The `outputSchema` for an edit turn: strict, so every field is required and nothing else is allowed. */
export const EDIT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "changes"],
  properties: {
    summary: { type: "string" },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "block", "markdown", "reason"],
        properties: {
          action: { type: "string", enum: ["replace", "insert_after", "delete"] },
          block: { type: "integer" },
          markdown: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

/** Applies block changes; every index refers to the original blocks. Front matter and endnotes stay. */
export function applyBlockChanges(blocks: readonly string[], types: readonly string[], changes: readonly BlockChange[]): string[] {
  const replaced = new Map<number, string>();
  const inserted = new Map<number, string[]>();
  for (const change of changes) {
    const block = change.block;
    if (!Number.isInteger(block) || block < 0 || block >= blocks.length) throw new Error(`block ${block} does not exist`);
    if (change.action === "insert_after") {
      // Inserting after the endnotes or the front matter-only document still lands in the body.
      const at = types[block] === "endnotes" ? block - 1 : block;
      inserted.set(at, [...inserted.get(at) ?? [], change.markdown]);
      continue;
    }
    if (types[block] === "frontmatter" || types[block] === "endnotes") throw new Error(`block ${block} (${types[block]}) cannot be changed`);
    replaced.set(block, change.action === "delete" ? "" : change.markdown);
  }
  return blocks.flatMap((markdown, index) => [replaced.get(index) ?? markdown, ...inserted.get(index) ?? []]);
}

/** Longest-common-subsequence block diff; each maximal run of differences is one hunk. */
export function diffBlocks(before: readonly string[], after: readonly string[]): Hunk[] {
  const n = before.length, m = after.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const hunks: Hunk[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && before[i] === after[j]) { i++; j++; continue; }
    const start: [number, number] = [i, j];
    while ((i < n || j < m) && !(i < n && j < m && before[i] === after[j])) {
      if (j >= m || (i < n && table[i + 1][j] >= table[i][j + 1])) i++;
      else j++;
    }
    hunks.push({ id: hunks.length, old: [start[0], i], new: [start[1], j], reason: "" });
  }
  return hunks;
}

/** The blocks with only the accepted hunks applied. */
export function composeAccepted(before: readonly string[], after: readonly string[], hunks: readonly Hunk[], accepted: ReadonlySet<number>): string[] {
  const result: string[] = [];
  let cursor = 0;
  for (const hunk of hunks) {
    result.push(...before.slice(cursor, hunk.old[0]));
    result.push(...(accepted.has(hunk.id) ? after.slice(hunk.new[0], hunk.new[1]) : before.slice(hunk.old[0], hunk.old[1])));
    cursor = hunk.old[1];
  }
  result.push(...before.slice(cursor));
  return result;
}

export type Proposal = { summary: string; before: string[]; after: string[]; hunks: Hunk[]; markdown: string };

/** Turns the model's output into a Core-validated, canonical proposal and its block hunks. */
export function buildProposal(source: string, output: EditOutput): Proposal {
  const original = documentBlocks(source);
  const before = original.map(block => block.markdown);
  const changed = applyBlockChanges(before, original.map(block => block.type), output.changes);
  const markdown = composeBlocks(changed); // Core parses and serializes; invalid MyST throws here.
  const after = documentBlocks(markdown).map(block => block.markdown);
  const hunks = diffBlocks(before, after);
  for (const hunk of hunks) {
    hunk.reason = output.changes.filter(change => change.action === "insert_after"
      ? change.block + 1 >= hunk.old[0] && change.block + 1 <= Math.max(hunk.old[0], hunk.old[1])
      : change.block >= hunk.old[0] && change.block < hunk.old[1]).map(change => change.reason.trim()).filter(Boolean).join(" · ");
  }
  return { summary: output.summary, before, after, hunks, markdown };
}
