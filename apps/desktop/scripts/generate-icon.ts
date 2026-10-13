// Reuse the SVG renderer/ICO encoder already pinned by electron-builder; no image dependencies.
// This internal tool entry point is tied to electron-builder 26.15.3. Recheck on builder upgrades.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve("electron-builder"));
const { runIconsTool } = builderRequire("app-builder-lib/out/toolsets/icons.js") as {
  runIconsTool(options: { inputFile: string; outputFormat: "ico"; outDir: string }): Promise<void>;
};
const outDir = path.join(desktop, "build", "icons");
mkdirSync(outDir, { recursive: true });
await runIconsTool({ inputFile: path.join(desktop, "assets", "icon.svg"), outputFormat: "ico", outDir });
copyFileSync(path.join(outDir, "icon.ico"), path.join(desktop, "assets", "icon.ico"));
console.log("Generated apps/desktop/assets/icon.ico from icon.svg");
