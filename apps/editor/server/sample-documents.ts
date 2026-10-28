import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SampleDocuments } from "../shared/document-protocol.ts";

/** A version changes the whole disposable sample folder once, including edited old copies. */
export function prepareSampleDocuments(source: string, destination: string): SampleDocuments {
  const version = readFileSync(path.join(source, "version"), "utf8");
  const marker = path.join(destination, "version");
  if (!existsSync(marker) || readFileSync(marker, "utf8") !== version) {
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    for (const language of ["ko", "en"]) cpSync(path.join(source, language), path.join(destination, language), { recursive: true });
    // Mark only a complete copy. A failed copy is retried on the next start.
    writeFileSync(marker, version);
  }
  return { ko: path.join(destination, "ko", "converter-control.md"), en: path.join(destination, "en", "converter-control.md") };
}
