import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertDoclingDocument, type Conversion } from "./convert.ts";
import { readSource, type ImageRef } from "./source.ts";
import { sha256 } from "./map.ts";

/** Local file adapter owned by the module. Creates one new output directory; never overwrites. */
export function convertDoclingFile(input: string, output: string): Conversion {
  if (existsSync(output)) throw new Error("Output directory already exists; choose a new directory");
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(input));
  const { source, nodes } = readSource(text);
  const sourceRoot = realpathSync(path.dirname(path.resolve(input)));
  const resources = new Map<string, string | null>();
  const assets = new Map<string, Uint8Array>();
  const imageRefs = [...nodes.values()].flatMap(x => x.image ? [x.image] : [])
    .concat(Object.values(source.pages ?? {}).flatMap(page => page.image ? [page.image] : []));
  function load(image: ImageRef): void {
    if (resources.has(image.uri)) return;
    try {
      let bytes: Uint8Array;
      if (image.uri.startsWith("data:")) {
        const match = /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/=\r\n]+)$/u.exec(image.uri);
        if (!match) throw new Error("Unsupported embedded image");
        bytes = Buffer.from(match[2], "base64");
      } else {
        if (/^[a-z]+:/iu.test(image.uri) && !image.uri.startsWith("file:") && !path.isAbsolute(image.uri)) throw new Error("Only local or embedded images are read");
        const location = image.uri.startsWith("file:") ? fileURLToPath(image.uri) : path.resolve(sourceRoot, image.uri);
        const resolved = realpathSync(location);
        const relative = path.relative(sourceRoot, resolved);
        if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Image must be inside the source directory");
        bytes = readFileSync(resolved);
      }
      const data = Buffer.from(bytes);
      const ext = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? ".png"
        : data[0] === 255 && data[1] === 216 && data[2] === 255 ? ".jpg"
        : data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP" ? ".webp" : undefined;
      if (!ext) throw new Error("Unsupported image bytes");
      const name = `assets/${sha256(bytes)}${ext}`;
      assets.set(name, bytes); resources.set(image.uri, name);
    } catch { resources.set(image.uri, null); }
  }
  imageRefs.forEach(load);
  const result = convertDoclingDocument(text, { images: resources });
  // All interpretation and canonical checks finish before the first filesystem mutation.
  mkdirSync(output); // exclusive directory creation is the no-overwrite boundary, including races
  try {
    if (assets.size) mkdirSync(path.join(output, "assets"));
    for (const [name, bytes] of assets) writeFileSync(path.join(output, name), bytes, { flag: "wx" });
    writeFileSync(path.join(output, "document.md"), result.markdown, { encoding: "utf8", flag: "wx" });
    writeFileSync(path.join(output, "document.docling-map.json"), JSON.stringify(result.map, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  } catch (error) {
    rmSync(output, { recursive: true, force: true });
    throw error;
  }
  return result;
}
