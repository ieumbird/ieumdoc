import fs from "node:fs";
import path from "node:path";
import { BIBLIOGRAPHY_LIMITS, type BibliographySource } from "@ieumdoc/core";
import { decodeUtf8, textRevision } from "@ieumdoc/file-commit";
import { RootAccess, type FileAccess } from "./file-access.ts";

/** Read-only dependency I/O shared by CLI and all stateless Hosts. */
export function readBibliographySources(documentPath: string, declarations: readonly string[], access: FileAccess = null, root?: string): BibliographySource[] {
  let boundary: RootAccess;
  try { boundary = access ?? new RootAccess([root ?? path.dirname(path.resolve(documentPath))]); boundary.resolve(documentPath); }
  catch { return declarations.map(source => ({ source, status: "error", code: "bibliography-unreadable" })); }
  let total = 0;
  return declarations.map((source, index): BibliographySource => {
    const error = (code: "bibliography-unreadable" | "bibliography-invalid" | "bibliography-limit" | "bibliography-changed"): BibliographySource => ({ source, status: "error", code });
    if (index >= BIBLIOGRAPHY_LIMITS.files) return error("bibliography-limit");
    // Defense at the I/O boundary as well as Core's declaration admission.
    if (!source.endsWith(".bib") || source.startsWith("/") || /[\\:\u0000-\u001f]/u.test(source)) return error("bibliography-unreadable");
    let fd: number | undefined;
    try {
      const target = boundary.resolve(path.resolve(path.dirname(documentPath), source));
      const real = fs.realpathSync(target);
      fd = fs.openSync(target, "r");
      const before = fs.fstatSync(fd);
      if (!before.isFile()) return error("bibliography-unreadable");
      if (before.size > BIBLIOGRAPHY_LIMITS.fileBytes || total + before.size > BIBLIOGRAPHY_LIMITS.totalBytes) return error("bibliography-limit");
      const buffer = Buffer.alloc(before.size + 1);
      let length = 0;
      while (length < buffer.length) { const n = fs.readSync(fd, buffer, length, buffer.length - length, null); if (!n) break; length += n; }
      const after = fs.fstatSync(fd);
      const current = fs.statSync(boundary.resolve(target));
      if (length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs ||
          current.dev !== before.dev || current.ino !== before.ino || current.size !== after.size || current.mtimeMs !== after.mtimeMs || current.ctimeMs !== after.ctimeMs || fs.realpathSync(target) !== real) return error("bibliography-changed");
      total += length;
      let text: string;
      try { text = decodeUtf8(buffer.subarray(0, length)); } catch { return error("bibliography-invalid"); }
      return { source, status: "ok", text, revision: textRevision(text) };
    } catch { return error("bibliography-unreadable"); }
    finally { if (fd !== undefined) fs.closeSync(fd); }
  });
}
