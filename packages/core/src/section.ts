/**
 * Sections are computed from a document's top-level blocks; they have no identity of their own
 * (ADR-0003). This rule is the one Core operations, the CLI and the Editor share.
 */

/** A top-level block as sections see it: a heading's level, a label target, or other content. */
export type SectionMarker = number | "target" | null;

/** Classifies a read-model block (Core's EditableBlock, or an editor block of the same shape). */
export function sectionMarker(block: { block: string; level?: number; original?: { kind: string } }): SectionMarker {
  if (block.block === "heading" && typeof block.level === "number") return block.level;
  return block.block === "unsupported" && block.original?.kind === "mystTarget" ? "target" : null;
}

/**
 * The top-level blocks `[start, end)` of the section a heading opens: from the label targets
 * (`(label)=`) directly before the heading to the next heading of the same or a higher level,
 * whose own targets belong to that next section. Deeper sections are part of it.
 */
export function sectionRange(markers: SectionMarker[], heading: number): { start: number; end: number } {
  const level = markers[heading];
  if (typeof level !== "number") throw new Error(`block ${heading} is not a heading`);
  let start = heading;
  while (start > 0 && markers[start - 1] === "target") start--;
  let end = heading + 1;
  while (end < markers.length && !(typeof markers[end] === "number" && (markers[end] as number) <= level)) end++;
  if (end < markers.length) while (markers[end - 1] === "target") end--;
  return { start, end };
}

/** Positions a section can move to: the start of any section, or the end of the document. */
export function sectionBoundaries(markers: SectionMarker[]): number[] {
  const starts = markers.flatMap((marker, index) => typeof marker === "number" ? [sectionRange(markers, index).start] : []);
  return [...new Set([...starts, markers.length])];
}
