import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** The revision of file contents read as UTF-8 text. */
export function textRevision(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export class FileChangedError extends Error {
  constructor(filePath: string) {
    super(`${filePath} changed after it was read; nothing was written`);
    this.name = "FileChangedError";
  }
}

/**
 * Replace an existing file with UTF-8 text while it still has the revision the caller read.
 * The text is completed in a temporary sibling, the revision is checked again, and the
 * sibling is renamed over the file. A failure keeps the file and removes the sibling.
 * The last check and the rename are separate steps: this is not an atomic compare-and-swap.
 */
export function commitFile(filePath: string, text: string, revision: string): void {
  // Preserve a symlink itself by replacing its resolved target.
  const target = fs.realpathSync(filePath);
  const unchanged = () => textRevision(fs.readFileSync(target, "utf8")) === revision;
  if (!unchanged()) throw new FileChangedError(filePath);
  // A rename needs only directory permission; still refuse a file that cannot be written.
  fs.accessSync(target, fs.constants.W_OK);
  const { mode } = fs.statSync(target);
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, text, { encoding: "utf8", flag: "wx", mode });
    // The creation mode is reduced by the umask; the replacement keeps the file's own.
    fs.chmodSync(temporary, mode & 0o7777);
    if (!unchanged()) throw new FileChangedError(filePath);
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}
