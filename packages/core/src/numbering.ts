/**
 * Numbered reference targets are computed from a document's top-level blocks, like sections:
 * MyST numbers display equations, figures and captioned tables in document order, and the
 * numbers are never written to the document (ADR-0002) nor used as identity (ADR-0003). This
 * rule is the one Core's read model, the CLI and the Editor share. It has no MyST dependency.
 */

export type NumberedKind = "equation" | "figure" | "table";

/** How many numbered targets of each kind a block holds; or, from `targetNumbers`, the
 * number of the block's first target of each kind. */
export type NumberedTargets = Partial<Record<NumberedKind, number>>;

export const NUMBERED_KINDS: readonly NumberedKind[] = ["equation", "figure", "table"];

/** Editor-neutral heading counter settings projected from MyST front matter. */
export type HeadingNumbering = {
  enabled: boolean[];
  counts: (number | null)[];
  offset: number;
  enumerators: (string | null)[];
};

/** Default authoring policy: H1 is a title; H2–H6 are numbered sections. */
export function defaultHeadingNumbering(enabled: boolean): HeadingNumbering | null {
  return enabled ? { enabled: [false, true, true, true, true, true], counts: [0, 0, 0, 0, 0, 0], offset: -1,
    enumerators: [null, null, null, null, null, null] } : null;
}

/** Computed heading numbers in the current block order; no number is authored as text. */
export function headingNumbers(blocks: { block: string; level?: number }[], settings?: HeadingNumbering | null): (string | undefined)[] {
  let counts = [...(settings?.counts ?? [])];
  return blocks.map(block => {
    const level = block.level ?? 1;
    if (block.block !== "heading" || !settings?.enabled[level - 1]) return undefined;
    const depth = level + settings.offset;
    counts = counts.map((count, index) => count === null || index < depth - 1 ? count : index === depth - 1 ? count + 1 : 0);
    const parts = counts.filter(count => count !== null);
    while (parts.at(-1) === 0) parts.pop();
    const number = parts.join(".");
    return settings.enumerators[level - 1]?.replace(/%s/g, number) ?? number;
  });
}

/**
 * The numbered targets a read-model block (Core's EditableBlock, or an editor block of the same
 * shape) holds. Core sets `numbered` only where a block differs from its kind's default: one
 * equation per equation block, one figure per figure block, none otherwise. Blocks an interface
 * adds through Core's insert operations have that default.
 */
export function blockTargets(block: { block: string; numbered?: NumberedTargets | null; label?: string; caption?: unknown }): NumberedTargets {
  if (block.numbered) return block.numbered;
  if (block.block === "equation") return { equation: 1 };
  if (block.block === "figure") return { figure: 1 };
  if (block.block === "table" && (block.label || (Array.isArray(block.caption) && block.caption.length > 0))) return { table: 1 };
  return {};
}

/** For each block, the number of its first target of each kind it holds, counting from 1. */
export function targetNumbers(blocks: NumberedTargets[]): NumberedTargets[] {
  const next: Record<NumberedKind, number> = { equation: 1, figure: 1, table: 1 };
  return blocks.map((targets) => {
    const first: NumberedTargets = {};
    for (const kind of NUMBERED_KINDS) {
      const count = targets[kind] ?? 0;
      if (count > 0) {
        first[kind] = next[kind];
        next[kind] += count;
      }
    }
    return first;
  });
}
