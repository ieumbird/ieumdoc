import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseDocument, replaceText, serializeDocument } from "./document.ts";

const sampleUrl = new URL("../sample.md", import.meta.url);
const outputUrl = new URL("../output.md", import.meta.url);
const source = readFileSync(sampleUrl, "utf8");
const original = parseDocument(source);

const identity = serializeDocument(original, structuredClone(original.ast));
if (identity !== source) {
  throw new Error("Identity round-trip changed sample.md without any edits.");
}

const edited = structuredClone(original.ast);
const found = replaceText(
  edited,
  "The current reference is calculated from the active power command.",
  "The current reference is calculated from the power command.",
);
if (!found) {
  throw new Error("Could not find the target paragraph in the parsed AST.");
}

const markdown = serializeDocument(original, edited);
writeFileSync(outputUrl, markdown);

console.log("Wrote output.md\n");
try {
  execFileSync("git", ["diff", "--no-index", "--", "sample.md", "output.md"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
} catch (error) {
  const result = error as { stdout?: string; status?: number };
  if (result.status === 1 && result.stdout) {
    process.stdout.write(result.stdout);
  } else {
    throw error;
  }
}
