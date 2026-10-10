/** Editable Figure v1 properties. The label is preserved, never authored here. */
export type FigureContent = {
  /** Empty means the Figure has no content yet (a pending Figure): no image is written. */
  imageUrl: string;
  /** Empty means no alt text. */
  imageAlt: string;
  /** Plain text or supported inline content; empty means no caption. */
  caption: string | InlineContent[];
};

/** Normalize the text convenience input to the editor-neutral inline contract. */
export function figureCaptionContent(caption: FigureContent["caption"]): InlineContent[] {
  return typeof caption === "string" ? (caption ? [{ kind: "text", text: caption }] : []) : caption;
}

/**
 * Field rules observed in canonical MyST round-trips: surrounding URL whitespace
 * and leading alt whitespace are trimmed, and line breaks leak into other directive
 * fields. An empty URL is a pending Figure, written without an image; alt text then
 * has nothing to describe and no place in the directive. Captions are checked by the
 * Core round-trip itself. This module has no MyST dependency so the Editor can apply
 * the same rules before Save.
 */
export function figureContentError(figure: FigureContent): string | undefined {
  if (typeof figure?.imageUrl !== "string" || typeof figure.imageAlt !== "string" ||
      (typeof figure.caption !== "string" && !Array.isArray(figure.caption))) {
    return "Figure image URL and alt text must be strings; caption must be text or InlineContent.";
  }
  if (figure.imageUrl.length === 0) {
    return figure.imageAlt.length > 0 ? "A Figure without an image cannot have alt text." : undefined;
  }
  if (/[\r\n]/.test(figure.imageUrl) || figure.imageUrl.trim() !== figure.imageUrl) {
    return "Figure image URL cannot contain line breaks or leading/trailing spaces.";
  }
  if (/[\r\n]/.test(figure.imageAlt) || figure.imageAlt.trimStart() !== figure.imageAlt) {
    return "Figure alt text cannot contain line breaks or start with a space.";
  }
  return undefined;
}
import type { InlineContent } from "./inline.ts";

/**
 * A Figure a document may persist has an image, a caption or a label: a pending Figure
 * without content is kept for its caption and the references its label receives. One with
 * none of them has no meaning, so canonical write rejects it. A label is set by its own
 * operation, so this holds for a document's final state, not between Core operations.
 */
export function figurePersistenceError(figure: FigureContent, label: string): string | undefined {
  return figure.imageUrl.length === 0 && figureCaptionContent(figure.caption).length === 0 && label.length === 0
    ? "A Figure needs an image, a caption or a label." : undefined;
}
