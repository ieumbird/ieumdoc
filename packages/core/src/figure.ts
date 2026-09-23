/** Editable Figure v1 properties. The label is preserved, never authored here. */
export type FigureContent = {
  imageUrl: string;
  /** Empty means no alt text. */
  imageAlt: string;
  /** Plain text; empty means no caption. */
  caption: string;
};

/**
 * Field rules observed in canonical MyST round-trips: an empty URL drops the
 * figure, surrounding URL whitespace and leading alt whitespace are trimmed,
 * and line breaks leak into other directive fields. Captions are checked by
 * the Core round-trip itself. This module has no MyST dependency so the
 * Editor can apply the same rules before Save.
 */
export function figureContentError(figure: FigureContent): string | undefined {
  if (typeof figure?.imageUrl !== "string" || typeof figure.imageAlt !== "string" ||
      typeof figure.caption !== "string") {
    return "Figure image URL, alt text, and caption must be strings.";
  }
  if (figure.imageUrl.length === 0) return "Figure image URL is required.";
  if (/[\r\n]/.test(figure.imageUrl) || figure.imageUrl.trim() !== figure.imageUrl) {
    return "Figure image URL cannot contain line breaks or leading/trailing spaces.";
  }
  if (/[\r\n]/.test(figure.imageAlt) || figure.imageAlt.trimStart() !== figure.imageAlt) {
    return "Figure alt text cannot contain line breaks or start with a space.";
  }
  return undefined;
}
