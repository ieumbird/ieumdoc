// Reuse the SVG renderer/ICO encoder already pinned by electron-builder; no image dependencies.
// This internal tool entry point is tied to electron-builder 26.15.3. Recheck on builder upgrades.
import { copyFileSync, mkdirSync } from "node:fs";
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
await runIconsTool({ inputFile: path.resolve(desktop, "../..", brand.icons.svg), outputFormat: "ico", outDir });
copyFileSync(path.join(outDir, "icon.ico"), path.resolve(desktop, "../..", brand.icons.ico));
console.log(`Generated ${brand.icons.ico} from ${brand.icons.svg}`);
