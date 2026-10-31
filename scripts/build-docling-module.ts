import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Reuse the CLI build's existing esbuild dependency; the installed worker needs no node_modules.
const { build } = createRequire(new URL("../packages/cli/package.json", import.meta.url))("esbuild");

const directory = path.resolve("tmp/docling-module");
mkdirSync(directory, { recursive: true });
await build({ entryPoints: ["packages/docling/src/worker.ts"], outfile: path.join(directory, "worker.cjs"),
  bundle: true, platform: "node", format: "cjs", target: "node24", logLevel: "warning" });
const ui = await build({ entryPoints: ["packages/docling/src/ui-plugin.tsx"], outfile: path.join(directory, "ui.js"),
  bundle: true, platform: "browser", format: "cjs", target: "es2022", jsx: "automatic", write: false, metafile: true,
  external: ["react", "react/jsx-runtime"], logLevel: "warning" });
for (const [input, details] of Object.entries(ui.metafile.inputs) as [string, { imports: { external?: boolean; path: string }[] }][]) {
  if (/(?:apps\/editor|@tiptap|prosemirror|node_modules)/u.test(input.replaceAll("\\", "/"))
    || details.imports.some(entry => entry.external && !["react", "react/jsx-runtime"].includes(entry.path))) {
    throw new Error(`UI bundle crossed its Host API boundary: ${input}`);
  }
}
// No global bridge, eval or second React. The ESM factory binds existing CJS external imports
// to the renderer instance supplied in API 1. Unexpected runtime imports fail closed.
const code = ui.outputFiles.find((file: { path: string }) => file.path.endsWith(".js"))!.text;
writeFileSync(path.join(directory, "ui.mjs"), `export function activate(host) {
  const require = name => {
    if (name === "react") return host.React;
    if (name === "react/jsx-runtime") return host.jsxRuntime;
    throw new Error("Unsupported UI dependency: " + name);
  };
  const module = { exports: {} };
  ${code}
  return module.exports.activate(host);
}\n`);
writeFileSync(path.join(directory, "ui.css"), ui.outputFiles.find((file: { path: string }) => file.path.endsWith(".css"))!.text);
writeFileSync(path.join(directory, "ui-metafile.json"), JSON.stringify(ui.metafile, null, 2) + "\n");
writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({ id: "docling", version: "0.0.0-spike", hostApiVersion: 1,
  entrypoint: "worker.cjs", permissions: ["read-input", "write-staging", "network-docling"],
  ui: { hostApiVersion: 1, entrypoint: "ui.mjs", stylesheet: "ui.css" } }, null, 2) + "\n");
console.log(path.join(directory, "manifest.json"));
