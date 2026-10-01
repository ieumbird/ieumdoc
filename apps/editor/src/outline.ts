import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

// The document outline is Editor navigation derived from the engine document. It is never
// written to the document and has no Core or CLI counterpart (`ieumdoc inspect` lists headings).

export type OutlineItem = {
  /** Top-level block index of the heading. */
  index: number;
  /** Engine position before the heading. */
  pos: number;
  level: number;
  text: string;
};

/** Top-level headings in document order, editable or read-only. */
export function documentOutline(doc: ProseMirrorNode): OutlineItem[] {
  const items: OutlineItem[] = [];
  doc.forEach((node, pos, index) => {
    if (node.type.name === "heading") {
      items.push({ index, pos, level: Number(node.attrs.level) || 1, text: node.textContent });
    } else if (node.type.name === "readonlyHeading") {
      items.push({ index, pos, level: Number(node.attrs.level) || 1, text: String(node.attrs.text ?? "") });
    }
  });
  return items;
}

/**
 * The section being read: the last heading whose top is above `line` (a viewport y below the
 * sticky header), or the first heading while the reader is above all of them. At the end of the
 * page, headings that can never scroll up to `line` count once they are in view (`bottom`).
 * -1 without headings.
 */
export function currentOutlineItem(headingTops: number[], line: number, bottom?: number): number {
  if (headingTops.length === 0) return -1;
  let current = 0;
  headingTops.forEach((top, index) => { if (top <= (bottom ?? line)) current = index; });
  return current;
}

export function sameOutline(left: OutlineItem[], right: OutlineItem[]): boolean {
  return left.length === right.length && left.every((item, index) => {
    const other = right[index];
    return item.index === other.index && item.pos === other.pos && item.level === other.level && item.text === other.text;
  });
}
