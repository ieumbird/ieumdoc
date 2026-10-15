import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { assertUnicode } from "@ieumdoc/file-commit";
import type { FirstDocument } from "./host-protocol.ts";

/**
 * A `.md` argument (opening a file with the app) opens. Otherwise nothing opens until the user
 * chooses; a writable copy of the sample document is offered.
 */
export function firstDocument(args: string[], userData: string, appRoot: string): FirstDocument {
  const argument = args.find((value) => {
    if (!value.toLowerCase().endsWith(".md")) return false;
    try { assertUnicode(value); }
    catch (error) {
      console.error(`Ignoring start-up document: ${(error as Error).message}`);
      return false;
    }
    return existsSync(value) && statSync(value).isFile();
  });
  if (argument) return { document: path.resolve(argument) };
  const sampleDir = path.join(userData, "sample-native-v1");
  const sample = path.join(sampleDir, "technical-document.md");
  if (!existsSync(sample)) {
    mkdirSync(sampleDir, { recursive: true });
    for (const file of ["technical-document.md", "diagram.svg"]) copyFileSync(path.join(appRoot, "sample", file), path.join(sampleDir, file));
  }
  return { sample };
}

