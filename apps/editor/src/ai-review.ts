// SPIKE: pure helpers for reviewing AI edit proposals as track changes.

export type ProposalHunk = { id: number; old: [number, number]; new: [number, number]; reason: string };
export type Decision = "pending" | "accepted" | "rejected";
export type TextPiece = { kind: "same" | "ins" | "del"; text: string };

const TOKEN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;

/** A word-level LCS diff; adjacent pieces of one kind are merged. */
export function diffText(before: string, after: string): TextPiece[] {
  const a = before.match(TOKEN) ?? [], b = after.match(TOKEN) ?? [];
  const n = a.length, m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const pieces: TextPiece[] = [];
  const push = (kind: TextPiece["kind"], text: string) => {
    const last = pieces.at(-1);
    if (last?.kind === kind) last.text += text;
    else pieces.push({ kind, text });
  };
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { push("same", a[i]); i++; j++; }
    else if (j >= m || (i < n && table[i + 1][j] >= table[i][j + 1])) push("del", a[i++]);
    else push("ins", b[j++]);
  }
  return reorder(pieces);
}

/** Within a run of changes, deletions come before insertions so the reader sees old → new. */
function reorder(pieces: TextPiece[]): TextPiece[] {
  const result: TextPiece[] = [];
  for (let index = 0; index < pieces.length;) {
    if (pieces[index].kind === "same") { result.push(pieces[index++]); continue; }
    let del = "", ins = "";
    while (index < pieces.length && pieces[index].kind !== "same") {
      // A lone space between two changes belongs to both sides.
      if (pieces[index].kind === "del") del += pieces[index].text; else ins += pieces[index].text;
      index++;
      if (index + 1 < pieces.length && pieces[index].kind === "same" && /^\s+$/.test(pieces[index].text) && pieces[index + 1].kind !== "same") {
        del += pieces[index].text; ins += pieces[index].text; index++;
      }
    }
    if (del) result.push({ kind: "del", text: del });
    if (ins) result.push({ kind: "ins", text: ins });
  }
  return result;
}

/** Accepted hunk ids; every hunk must be decided before the result is applied. */
export function acceptedHunks(hunks: readonly ProposalHunk[], decisions: Readonly<Record<number, Decision>>): number[] | null {
  if (hunks.some(hunk => (decisions[hunk.id] ?? "pending") === "pending")) return null;
  return hunks.filter(hunk => decisions[hunk.id] === "accepted").map(hunk => hunk.id);
}
