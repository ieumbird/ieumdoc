import type { EditorView } from "@tiptap/pm/view";
import { canEditEndnoteAt } from "./endnotes.ts";

/** Opening is narrower than authoring: relative links and other schemes stay in the document. */
export function externalLinkUrl(href: string): string | undefined {
  const value = href.trim();
  if (!/^https?:\/\//i.test(value) || /\s/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch { /* Incomplete URL drafts cannot be opened. */ }
  return undefined;
}

export function openExternalLink(href: string): void {
  const url = externalLinkUrl(href);
  if (url) window.open(url, "_blank", "noopener");
}

/** ProseMirror normally finishes composition on mousedown, before handleClick runs. */
export function handleLinkMouseDown(view: EditorView, event: MouseEvent): boolean {
  if (!view.composing || !(event.ctrlKey || event.metaKey) ||
      !(event.target instanceof Element) || !event.target.closest("a[href]")) return false;
  event.preventDefault();
  return true;
}

/** ProseMirror calls handleClick only after a single click, excluding selection drags. */
export function handleLinkClick(view: EditorView, pos: number, event: MouseEvent): boolean {
  if (view.composing || !view.editable || event.button !== 0 || event.detail !== 1 ||
      !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey ||
      !canEditEndnoteAt(view.state, pos)) return false;
  const target = event.target instanceof Element ? event.target : null;
  const anchor = target?.closest("a[href]");
  if (!anchor || !view.dom.contains(anchor) || target?.closest('[contenteditable="false"], [aria-readonly="true"]')) return false;
  // Only ordinary link marks, never anchors rendered by other NodeViews.
  const href = anchor.getAttribute("href")!;
  const mark = view.state.doc.nodeAt(view.posAtDOM(anchor, 0))?.marks.find(mark => mark.type.name === "link" && mark.attrs.href === href);
  if (!mark || !externalLinkUrl(href)) return false;
  event.preventDefault();
  openExternalLink(href);
  return true;
}
