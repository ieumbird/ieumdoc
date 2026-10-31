import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// Reuse the CLI build's existing esbuild dependency; the installed worker needs no node_modules.
const { build } = createRequire(new URL("../packages/cli/package.json", import.meta.url))("esbuild");

const directory = path.resolve("tmp/docling-module");
mkdirSync(directory, { recursive: true });
await build({ entryPoints: ["packages/docling/src/worker.ts"], outfile: path.join(directory, "worker.cjs"),
  bundle: true, platform: "node", format: "cjs", target: "node24", logLevel: "warning" });
writeFileSync(path.join(directory, "manifest.json"), JSON.stringify({ id: "docling", version: "0.0.0-spike", hostApiVersion: 1,
  entrypoint: "worker.cjs", permissions: ["read-input", "write-staging", "network-docling"] }, null, 2) + "\n");
console.log(path.join(directory, "manifest.json"));
