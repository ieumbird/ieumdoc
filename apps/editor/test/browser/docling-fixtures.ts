import { readFileSync } from "node:fs";
import { convertDoclingDocument } from "@ieumdoc/docling";
import type { SourceDocument, SourceItem } from "../../../../packages/docling/src/source.ts";

/** Public fixtures, with a declared synthetic supplement for unsupported/TOPLEFT/endnote UI. */
export function comparisonFiles() {
  return ["nist-sp1108r4", "synthetic"].flatMap(name => {
    const root = new URL(`../../../../packages/docling/test/fixtures/${name}/`, import.meta.url);
    const source = JSON.parse(readFileSync(new URL("document.json", root), "utf8")) as SourceDocument;
    if (name === "synthetic") {
      const add = (label: string, text: string, top: number) => {
        const self_ref = `#/texts/${source.texts!.length}`;
        source.texts!.push({ self_ref, label, text, orig: text, parent: { $ref: "#/body" }, children: [], content_layer: "body",
          prov: [{ page_no: 1, bbox: { l: 48, r: 300, t: top, b: top + 12, coord_origin: "TOPLEFT" }, charspan: [0, text.length] }] } as SourceItem & { orig: string });
        source.body!.children!.push({ $ref: self_ref }); return { $ref: self_ref };
      };
      source.tables![0].footnotes = [add("footnote", "1 Synthetic explicit table endnote.", 620)];
      add("text", "", 650);
    }
    const record = JSON.parse(readFileSync(new URL("conversion-record.json", root), "utf8")) as { images: { path: string }[] };
    const images = record.images.map(image => image.path);
    const result = convertDoclingDocument(JSON.stringify(source), { images: new Map(images.map(file => [file, file])) });
    const files = [
      { name: `${name}/document.md`, bytes: Buffer.from(result.markdown) },
      { name: `${name}/document.docling-map.json`, bytes: Buffer.from(JSON.stringify(result.map)) },
      ...images.map(file => ({ name: `${name}/${file}`, bytes: readFileSync(new URL(file, root)) })),
    ];
    if (name === "synthetic") files.push(
      { name: "stale/document.md", bytes: Buffer.from(`${result.markdown}\nExternally changed.\n`) },
      { name: "stale/document.docling-map.json", bytes: Buffer.from(JSON.stringify(result.map)) },
      ...images.map(file => ({ name: `stale/${file}`, bytes: readFileSync(new URL(file, root)) })),
    );
    return files;
  });
}
