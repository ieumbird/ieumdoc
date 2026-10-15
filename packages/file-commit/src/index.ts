import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Strict text decoding preserves a leading BOM for the caller's source/revision. */
export function decodeUtf8(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch (cause) { throw new Error("Invalid UTF-8 input; nothing was written", { cause }); }
}

/** Reject lossy UTF-8 encoding of text or a Host filesystem locator. */
export function assertUnicode(text: string): void {
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)) throw new Error("Invalid Unicode: unpaired surrogate; nothing was written");
}

/** The revision of valid UTF-8 text, identical to the hash of its encoded bytes. */
export function textRevision(text: string): string {
  assertUnicode(text);
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
  assertUnicode(text);
  // Preserve a symlink itself by replacing its resolved target.
  const target = fs.realpathSync(filePath);
  const unchanged = () => createHash("sha256").update(fs.readFileSync(target)).digest("hex") === revision;
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
