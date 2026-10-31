import { assertUnicode } from "@litzio/file-commit";

/** Decode the raw target once, before URLSearchParams can replace malformed UTF-8. */
export function requestQuery(target: string): URLSearchParams {
  const query = new URLSearchParams();
  const start = target.indexOf("?");
  if (start < 0) return query;
  const raw = target.slice(start + 1).split("#", 1)[0]!;
  const decode = (value: string) => decodeURIComponent(value.replace(/\+/g, " "));
  try {
    assertUnicode(raw);
    for (const field of raw.split("&")) {
      if (!field) continue;
      const separator = field.indexOf("=");
      const name = separator < 0 ? field : field.slice(0, separator);
      const value = separator < 0 ? "" : field.slice(separator + 1);
      query.append(decode(name), decode(value));
    }
  } catch (cause) {
    throw new Error("Invalid request query encoding.", { cause });
  }
  return query;
}
