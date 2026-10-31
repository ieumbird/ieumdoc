import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

/** A self-contained trusted worker, also shipped beside the relocatable CLI. */
export async function buildDoclingWorker(destination: string) {
  mkdirSync(destination, { recursive: true });
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../../docling/src/worker.ts", import.meta.url))],
    bundle: true, platform: "node", format: "cjs", target: "node24", write: false,
    legalComments: "inline", logLevel: "warning",
  });
  const bytes = result.outputFiles[0].contents;
  writeFileSync(path.join(destination, "worker.cjs"), bytes);
  writeFileSync(path.join(destination, "manifest.json"), JSON.stringify({
    id: "docling", version: createHash("sha256").update(bytes).digest("hex"),
    workerApi: 1, entry: "worker.cjs",
  }, null, 2) + "\n");
}
