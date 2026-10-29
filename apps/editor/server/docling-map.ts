// SPIKE (docling-compare-1030): read-only Docling conversion map sidecars.
// `<name>.docling-map.json` next to `<name>.md` records which Docling item became which body block.
import fs from "node:fs";
import path from "node:path";
import type { ServerResponse } from "node:http";
import { accessPath, fileErrorStatus, type FileAccess } from "./file-access.ts";

export const DOCLING_MAP_SUFFIX = ".docling-map.json";

function sidecarOf(document: string): string {
  return path.join(path.dirname(document), path.basename(document, path.extname(document)) + DOCLING_MAP_SUFFIX);
}

/** Documents under `root` (three levels deep) that have a sidecar. */
function discover(root: string, access: FileAccess): string[] {
  const found: string[] = [];
  const walk = (folder: string, depth: number) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(accessPath(folder, access), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory() && depth < 3 && !entry.name.startsWith(".") && entry.name !== "node_modules") walk(full, depth + 1);
      else if (entry.isFile() && entry.name.endsWith(DOCLING_MAP_SUFFIX)) {
        const document = full.slice(0, -DOCLING_MAP_SUFFIX.length) + ".md";
        if (fs.existsSync(document)) found.push(document);
      }
    }
  };
  walk(root, 0);
  return found.sort();
}

export function serveDoclingMap(res: ServerResponse, query: URLSearchParams, access: FileAccess): void {
  const send = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(body));
  };
  try {
    const roots = query.getAll("root");
    if (roots.length) { send(200, { documents: roots.flatMap(root => discover(accessPath(root, access), access)) }); return; }
    const locator = query.get("path");
    if (!locator) { send(400, { error: "path or root is required" }); return; }
    const sidecar = accessPath(sidecarOf(accessPath(locator, access)), access);
    if (!fs.existsSync(sidecar)) { send(404, { error: "No Docling map next to this document." }); return; }
    send(200, JSON.parse(fs.readFileSync(sidecar, "utf8")));
  } catch (error) {
    send(fileErrorStatus(error, 500), { error: "Could not read the Docling map." });
  }
}
