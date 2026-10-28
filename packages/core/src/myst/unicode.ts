import { DocumentWriteError } from "../write-error.ts";

/** Check every string field, including labels, URLs, options and metadata, before writing. */
export function assertUnicode(value: unknown, path: number[] = []): void {
  if (typeof value === "string") {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw new DocumentWriteError("Invalid Unicode: unpaired surrogate", { code: "invalid-unicode",
      action: "Replace the unpaired surrogate with a valid Unicode character before saving.",
      ...(path.length ? { path } : {}),
    });
  } else if (Array.isArray(value)) {
    value.forEach(field => assertUnicode(field, path));
  } else if (value && typeof value === "object") {
    for (const [key, field] of Object.entries(value)) {
      assertUnicode(key, path);
      if (key === "children" && Array.isArray(field)) {
        field.forEach((child, index) => assertUnicode(child, [...path, index]));
      } else assertUnicode(field, path);
    }
  }
}
