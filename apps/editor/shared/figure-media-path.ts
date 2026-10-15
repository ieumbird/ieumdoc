/** Host media request path for a document-relative Figure source; other sources bypass the Host. */
export function figureMediaPath(imageUrl: string): string | undefined {
  // URL handles schemes (including Windows drive prefixes); slash/backslash roots are absolute.
  if (!imageUrl || imageUrl.startsWith("/") || imageUrl.startsWith("\\") || URL.canParse(imageUrl) ||
    !URL.canParse(imageUrl, "https://ieumdoc.invalid/")) return undefined;
  const relativePath = imageUrl.startsWith("./") ? imageUrl.slice(2) : imageUrl;
  const segments = relativePath.split("/");
  // Keep normal separators proxy-safe; dot segments must reach the Host without URL normalization.
  // A trailing slash also protects a standalone . or .. and preserves its resolved location.
  return segments.some(segment => segment === "." || segment === "..")
    ? encodeURIComponent(segments.length === 1 ? `${relativePath}/` : relativePath)
    : segments.map(encodeURIComponent).join("/");
}
