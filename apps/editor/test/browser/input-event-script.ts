import { build } from "vite";
import { fileURLToPath } from "node:url";

/** One in-memory test bundle per worker, also usable against the production HTTP Host. */
export async function inputEventScript(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: "error",
    build: {
      write: false,
      minify: true,
      lib: { entry: fileURLToPath(new URL("./input-events.ts", import.meta.url)), formats: ["iife"], name: "InputEventDiagnostics" },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  return outputs.map(output => {
    if (!("output" in output)) throw new Error("Expected an input event diagnostic bundle");
    return output.output.filter(chunk => chunk.type === "chunk").map(chunk => chunk.code).join("\n");
  }).join("\n");
}
