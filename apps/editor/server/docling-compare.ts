import fs from "node:fs";
import path from "node:path";
import { readComparison } from "@litzio/docling/compare-host";
import { decodeUtf8 } from "@litzio/file-commit";
import { readModel } from "./document-replay.ts";
import { resolveDocumentPath, resolveMediaPath } from "./document-path.ts";
import { accessPath, type FileAccess } from "./file-access.ts";

/** Same Root/media boundary as ordinary documents; JSON is interpreted only by the module. */
export function loadDoclingComparison(requestedPath: string | undefined, access: FileAccess) {
  if (!requestedPath?.trim()) throw new Error("Choose a Docling conversion folder.");
  const file = resolveDocumentPath(requestedPath, access);
  const source = decodeUtf8(fs.readFileSync(accessPath(file, access)));
  readModel(source); // Native admission remains the ordinary Host/Core contract.
  const sidecar = resolveMediaPath(`${path.basename(file, ".md")}.docling-map.json`, file, access);
  const snapshot = readComparison(file, source, decodeUtf8(fs.readFileSync(accessPath(sidecar, access))));
  // A map may contain untrusted URIs. Refuse remote/data/absolute references and path escapes
  // before returning any URLs. Pixels are served lazily by the existing media route.
  for (const page of Object.values(snapshot.map.pages)) {
    if (!page.image) continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(page.image.uri)) throw new Error("Page images must be local to the conversion folder.");
    resolveMediaPath(page.image.uri, file, access);
  }
  return snapshot;
}
