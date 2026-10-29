import { figureMediaPath } from "../shared/figure-media-path.ts";

/** The Figure Host's image formats, restricted to document-relative destinations. */
export function isRelativeImageLink(href: string): boolean {
  return !href.startsWith("#") && /\.(png|jpe?g|gif|webp|svg)$/i.test(href) && figureMediaPath(href) !== undefined;
}
