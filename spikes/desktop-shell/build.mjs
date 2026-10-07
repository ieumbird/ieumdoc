// Spike build: the unchanged Editor bundle, a sample document, and the Electron main bundle.
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const esbuild = createRequire(path.join(repo, "node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/"))("esbuild");

execFileSync("pnpm exec vite build --base / --outDir ../../spikes/desktop-shell/app/editor --emptyOutDir",
  { cwd: path.join(repo, "apps/editor"), stdio: ["ignore", "ignore", "inherit"], shell: true });
mkdirSync(path.join(here, "app/sample"), { recursive: true });
for (const file of ["technical-document.md", "diagram.svg"]) {
  cpSync(path.join(repo, "apps/editor/document", file), path.join(here, "app/sample", file));
}
await esbuild.build({
  entryPoints: [path.join(here, "src/main.ts")],
  outfile: path.join(here, "dist/main.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  // document-api.ts locates its dev default document from import.meta.url.
  define: { "import.meta.url": "__spike_import_meta_url" },
  banner: { js: "const __spike_import_meta_url = require('node:url').pathToFileURL(__filename).href;" },
  logLevel: "warning",
});
console.log("built spikes/desktop-shell");
