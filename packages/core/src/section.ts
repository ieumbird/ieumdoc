/**
 * Sections are computed from a document's top-level blocks; they have no identity of their own
 * (ADR-0003). This rule is the one Core operations, the CLI and the Editor share.
 *
 * Endnote definitions belong to the document, not to a section: the definitions that follow the
 * body are in no section's range, and the end of the body is the end a section reaches.
 */

/** A top-level block as sections see it: a heading's level, a label target, an endnote
 * (footnote definition), or other content. */
export type SectionMarker = number | "target" | "endnote" | null;

/** Classifies a read-model block (Core's EditableBlock, or an editor block of the same shape). */
export function sectionMarker(block: { block: string; level?: number; original?: { kind: string } }): SectionMarker {
  if (block.block === "heading" && typeof block.level === "number") return block.level;
  if (block.block === "footnote") return "endnote";
  return block.block === "target" || (block.block === "unsupported" && block.original?.kind === "mystTarget") ? "target" : null;
}

/** Where the body ends: the endnotes after it are in no section. */
function bodyEnd(markers: SectionMarker[]): number {
  let end = markers.length;
  while (end > 0 && markers[end - 1] === "endnote") end--;
  return end;
}

/**
 * The top-level blocks `[start, end)` of the section a heading opens: from the label targets
 * (`(label)=`) directly before the heading to the next heading of the same or a higher level,
 * whose own targets belong to that next section, or to the end of the body. Deeper sections are
 * part of it. A definition still inside the body (before canonical placement) is not section
 * content: moving or removing the section leaves it to the endnotes.
 */
export function sectionRange(markers: SectionMarker[], heading: number): { start: number; end: number } {
  const level = markers[heading];
  if (typeof level !== "number") throw new Error(`block ${heading} is not a heading`);
  const last = bodyEnd(markers);
  let start = heading;
  while (start > 0 && markers[start - 1] === "target") start--;
  let end = heading + 1;
  while (end < last && !(typeof markers[end] === "number" && (markers[end] as number) <= level)) end++;
  if (end < last) while (markers[end - 1] === "target") end--;
  return { start, end };
}

/** Positions a section can move to: the start of any section, or the end of the body. The block
 * count is the end too: canonical write puts the endnotes after the section moved there. */
export function sectionBoundaries(markers: SectionMarker[]): number[] {
  const starts = markers.flatMap((marker, index) => typeof marker === "number" ? [sectionRange(markers, index).start] : []);
  return [...new Set([...starts, bodyEnd(markers), markers.length])];
}
