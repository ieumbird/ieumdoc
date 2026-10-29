import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { convertDoclingDocument } from "./convert.ts";
import { sha256 } from "./map.ts";

type JsonObject = Record<string, any>;
export type BundleImage = { pointer: string; path: string; sha256: string; bytes: number };
const isImage = (value: any): value is JsonObject => value !== null && typeof value === "object"
  && typeof value.uri === "string" && typeof value.mimetype === "string" && value.size !== undefined && value.dpi !== undefined;

/** Node 24's native reviver source/rawJSON keeps uint64 origin hashes exact. */
export function parseJsonPreservingIntegers(text: string): any {
  // The package's ES2022 type library predates these Node 24 built-ins.
  const nativeJSON = JSON as typeof JSON & { rawJSON(source: string): { readonly rawJSON: string } };
  return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) => typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)
    ? nativeJSON.rawJSON(context!.source!) : value);
}

// Mask images before serialization, so this check never duplicates base64 strings.
// JSON formatting is normalized; all source fields and their order are retained.
function contentHash(value: unknown): string {
  return sha256(JSON.stringify(value, (_key, item) => isImage(item) ? { ...item, uri: "<externalized-image>" } : item));
}

/** Externalize without re-encoding; the only permitted source mutation is ImageRef.uri. */
export function writeBundleDocument(document: JsonObject, output: string): {
  images: BundleImage[]; documentSha256: string; contentSha256: string; pages: number;
} {
  if (document.schema_name !== "DoclingDocument" || document.version !== "1.10.0") throw new Error("Expected DoclingDocument 1.10.0");
  const before = contentHash(document);
  const images: BundleImage[] = [], resources = new Map<string, string>();
  function walk(value: any, parts: string[]): void {
    if (value === null || typeof value !== "object") return;
    if (isImage(value)) {
      const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(value.uri);
      if (!match) throw new Error(`Expected embedded PNG/JPEG/WebP at /${parts.join("/")}`);
      const bytes = Buffer.from(match[2], "base64");
      if (!bytes.length || bytes.toString("base64") !== match[2]) throw new Error("Invalid image base64");
      const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp = bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
      if (!(match[1] === "png" ? png : match[1] === "jpeg" ? jpeg : webp) || value.mimetype !== `image/${match[1]}`) throw new Error("Image MIME/bytes mismatch");
      let stem = `images/image-${String(images.length + 1).padStart(3, "0")}`;
      if (parts.length === 3 && parts[0] === "pages" && parts[2] === "image") {
        const page = document.pages[parts[1]].page_no;
        if (!Number.isSafeInteger(page) || page < 1) throw new Error("Invalid page number");
        stem = `pages/page-${String(page).padStart(3, "0")}`;
      } else if (parts.length === 3 && ["pictures", "tables", "texts"].includes(parts[0]) && /^(0|[1-9][0-9]*)$/u.test(parts[1]) && parts[2] === "image") {
        const singular = { pictures: "picture", tables: "table", texts: "text" }[parts[0]];
        stem = `${parts[0]}/${singular}-${String(parts[1]).padStart(3, "0")}`;
      }
      const name = `${stem}.${match[1] === "jpeg" ? "jpg" : match[1]}`;
      mkdirSync(path.dirname(path.join(output, name)), { recursive: true });
      writeFileSync(path.join(output, name), bytes, { flag: "wx" });
      if (!readFileSync(path.join(output, name)).equals(bytes)) throw new Error("Saved image bytes differ from embedded image");
      images.push({ pointer: "/" + parts.map(p => p.replaceAll("~", "~0").replaceAll("/", "~1")).join("/") + "/uri",
        path: name, sha256: sha256(bytes), bytes: bytes.length });
      value.uri = name;
      resources.set(name, name);
    }
    for (const [key, child] of Object.entries(value)) walk(child, [...parts, key]);
  }
  walk(document, []);
  const text = JSON.stringify(document) + "\n";
  writeFileSync(path.join(output, "document.json"), text, { encoding: "utf8", flag: "wx" });
  const saved = readFileSync(path.join(output, "document.json"), "utf8");
  if (contentHash(parseJsonPreservingIntegers(saved)) !== before) throw new Error("Non-image-URI JSON content changed");
  // The converter validates a parsed copy; its defaults never alter saved source.
  const conversion = convertDoclingDocument(saved, { images: resources });
  writeFileSync(path.join(output, "document.md"), conversion.markdown, { encoding: "utf8", flag: "wx" });
  writeFileSync(path.join(output, "document.docling-map.json"), JSON.stringify(conversion.map, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  return { images, documentSha256: sha256(saved), contentSha256: before, pages: Object.keys(document.pages ?? {}).length };
}
