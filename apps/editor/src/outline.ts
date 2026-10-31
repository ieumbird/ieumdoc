import { captionNumberText, headingNumbers, type HeadingNumbering } from "@litzio/core/numbering";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { blockNumbers, captionPrefixText } from "./cross-reference.tsx";

// The document outline is Editor navigation derived from the engine document. It is never
// written to the document and has no Core or CLI counterpart (the CLI inspect command lists headings and
// their section ranges).

export type OutlineItem = {
  kind?: "table" | "figure";
  /** Top-level block index of the navigation target. */
  index: number;
  /** Engine position before the target. */
  pos: number;
  level: number;
  /** Generated prefix only; text retains the full navigation/accessibility label. */
  number?: string;
  text: string;
};

/** Top-level native headings in document order. */
export function documentOutline(doc: ProseMirrorNode): OutlineItem[] {
  const items: OutlineItem[] = [];
  const blocks: { block: string; level: number }[] = [];
  doc.forEach(node => blocks.push({ block: node.type.name, level: Number(node.attrs.level) }));
  const numbers = headingNumbers(blocks, doc.attrs.headingNumbering as HeadingNumbering | null);
  doc.forEach((node, pos, index) => {
    if (node.type.name === "heading") {
      items.push({ index, pos, level: Number(node.attrs.level) || 1, number: numbers[index], text: `${numbers[index] ? `${numbers[index]} ` : ""}${node.textContent}` });
    }
  });
  return items;
}

/** Caption text is already projected by Core into the native engine caption nodes. Reuse
 * the very same Core counters/templates as the document's caption NodeViews. */
export function documentTargets(doc: ProseMirrorNode, kind: "table" | "figure"): OutlineItem[] {
  const numbers = blockNumbers(doc);
  const items: OutlineItem[] = [];
  doc.forEach((node, pos, index) => {
    if (node.type.name !== kind) return;
    const number = captionNumberText(kind, numbers[index][kind]!, doc.attrs.referenceTemplates);
    const caption = kind === "figure" ? node.textContent : node.lastChild?.textContent ?? "";
    items.push({ kind, index, pos, level: 1, number, text: caption ? `${captionPrefixText(number)}${caption}` : number });
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

export type NavigationList = { items: OutlineItem[]; current: number };
export type DocumentOutline = NavigationList & { tables: NavigationList; figures: NavigationList };

/**
 * Outline state outside React's App state. Scrolling changes the current section often; only its
 * subscribers (the sidebar) re-render, never the editor, whose re-render resets engine props and
 * can race a pending native caret move.
 */
export function createOutlineStore() {
  let outline: DocumentOutline = { items: [], current: -1, tables: { items: [], current: -1 }, figures: { items: [], current: -1 } };
  const listeners = new Set<() => void>();
  return {
    get: () => outline,
    set(next: DocumentOutline) {
      outline = next;
      listeners.forEach(listener => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

export type OutlineStore = ReturnType<typeof createOutlineStore>;

export function sameOutline(left: OutlineItem[], right: OutlineItem[]): boolean {
  return left.length === right.length && left.every((item, index) => {
    const other = right[index];
    return item.kind === other.kind && item.index === other.index && item.pos === other.pos && item.level === other.level && item.number === other.number && item.text === other.text;
  });
}
