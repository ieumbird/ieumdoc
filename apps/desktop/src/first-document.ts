import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { assertUnicode } from "@ieumdoc/file-commit";
import { prepareSampleDocuments } from "../../editor/server/sample-documents.ts";
import type { FirstDocument } from "./host-protocol.ts";

/**
 * A `.md` argument (opening a file with the app) opens. Otherwise nothing opens until the user
 * chooses; a writable copy of the sample document is offered.
 */
export function firstDocument(args: string[], userData: string, appRoot: string, onWarning: (message: string) => void = console.error): FirstDocument {
  const argument = args.find((value) => {
    if (!value.toLowerCase().endsWith(".md")) return false;
    try { assertUnicode(value); }
    catch (error) {
      onWarning(`Ignoring start-up document: ${(error as Error).message}`);
      return false;
    }
    return existsSync(value) && statSync(value).isFile();
  });
  const sampleAvailability = prepareSampleDocuments(path.join(appRoot, "sample"), path.join(userData, "sample-native-v1"), onWarning);
  return { ...(argument ? { document: path.resolve(argument) } : {}), ...sampleAvailability };
}
