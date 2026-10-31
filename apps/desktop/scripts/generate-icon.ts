// Reuse the PNG resizer/ICO encoder already pinned by electron-builder; no image dependencies.
// This internal tool entry point is tied to electron-builder 26.15.3. Recheck on builder upgrades.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brand } from "../../../brand.ts";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve("electron-builder"));
const { runIconsTool } = builderRequire("app-builder-lib/out/toolsets/icons.js") as {
  runIconsTool(options: { inputFile: string; outputFormat: "ico"; outDir: string }): Promise<void>;
};
const outDir = path.join(desktop, "build", "icons");
mkdirSync(outDir, { recursive: true });
for (const [variant, source] of [["base", brand.icons.png], ["small", brand.icons.smallPng]] as const) {
  await runIconsTool({ inputFile: path.resolve(desktop, "../..", source), outputFormat: "ico", outDir: path.join(outDir, variant) });
}
// Keep the tool's encoded PNG frames unchanged; only merge their ICO directory entries.
const base = readFileSync(path.join(outDir, "base/icon.ico"));
const small = readFileSync(path.join(outDir, "small/icon.ico"));
const directory = Buffer.from(base.subarray(0, 6 + base.readUInt16LE(4) * 16));
const frames: Buffer[] = [];
let offset = directory.length;
for (let entry = 6; entry < directory.length; entry += 16) {
  const size = directory[entry] || 256;
  const source = size <= 32 ? small : base;
  const sourceEntry = Array.from({ length: source.readUInt16LE(4) }, (_, index) => 6 + index * 16)
    .find(index => (source[index] || 256) === size);
  if (sourceEntry === undefined) throw new Error(`Missing ${size}px icon frame`);
  const length = source.readUInt32LE(sourceEntry + 8), start = source.readUInt32LE(sourceEntry + 12);
  source.copy(directory, entry, sourceEntry, sourceEntry + 16);
  directory.writeUInt32LE(offset, entry + 12);
  frames.push(source.subarray(start, start + length));
  offset += length;
}
writeFileSync(path.resolve(desktop, "../..", brand.icons.ico), Buffer.concat([directory, ...frames]));
console.log(`Generated ${brand.icons.ico} from configured base/small PNGs`);
