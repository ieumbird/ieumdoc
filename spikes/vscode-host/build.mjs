// Spike build: the unchanged Editor bundle for the webview, and the extension host bundle.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(`${repo}node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/`);
const esbuild = require("esbuild");

execFileSync("pnpm", ["exec", "vite", "build", "--base", "./", "--outDir", `${here}media/editor`, "--emptyOutDir"],
  { cwd: `${repo}apps/editor`, stdio: "inherit", shell: true });

await esbuild.build({
  entryPoints: [`${here}src/extension.ts`],
  outfile: `${here}dist/extension.cjs`,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["vscode"],
  // document-api.ts locates its default document from import.meta.url.
  define: { "import.meta.url": "__spike_import_meta_url" },
  banner: { js: "const __spike_import_meta_url = require('node:url').pathToFileURL(__filename).href;" },
  logLevel: "warning",
});
console.log("built spikes/vscode-host");
