import fs from "node:fs";
import path from "node:path";

/** An explicit local Host policy; only the HTTP Host requires RootAccess. */
export const LOCAL_FILE_ACCESS = null;
export type FileAccess = RootAccess | typeof LOCAL_FILE_ACCESS;

export class FileAccessError extends Error {
  readonly status = 403;
  constructor(message = "Path is outside the allowed folders.") { super(message); }
}

export function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function locator(value: string): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0") ||
      /^\\\\[?.]\\/.test(value) || /^[a-z]:(?![\\/])/i.test(value) ||
      (process.platform === "win32" ? value.replace(/^[a-z]:/i, "").includes(":") : /^[a-z]:|^\\\\/i.test(value))) {
    throw new FileAccessError("Invalid file path.");
  }
  return path.resolve(value.trim());
}

/** Fixed operator roots, not the folder currently selected in the Editor. */
export class RootAccess {
  readonly roots: readonly string[];
  private readonly entries: readonly { path: string; real: string; dev: number; ino: number }[];

  constructor(roots: readonly string[]) {
    if (!roots.length) throw new Error("At least one --root directory is required.");
    const entries: { path: string; real: string; dev: number; ino: number }[] = [];
    for (const value of roots) {
      const folder = locator(value);
      const real = fs.realpathSync(folder);
      const stat = fs.statSync(real);
      if (!stat.isDirectory()) throw new Error(`Root must be an existing directory: ${folder}`);
      if (!entries.some(entry => inside(entry.real, real) && inside(real, entry.real))) {
        entries.push({ path: folder, real, dev: stat.dev, ino: stat.ino });
      }
    }
    this.entries = Object.freeze(entries.map(entry => Object.freeze(entry)));
    this.roots = Object.freeze(entries.map(entry => entry.path));
  }

  /** Recheck even after startup: moving/replacing an allowed root must not grant new access. */
  private currentRoots(): void {
    for (const entry of this.entries) {
      try {
        const real = fs.realpathSync(entry.path);
        const stat = fs.statSync(real);
        if (real !== entry.real || stat.dev !== entry.dev || stat.ino !== entry.ino || !stat.isDirectory()) throw new Error();
      } catch { throw new FileAccessError("An allowed folder changed or is unavailable. Restart the Host after checking its roots."); }
    }
  }

  /** Check before any filesystem I/O; an absent leaf is allowed only beneath an existing parent. */
  resolve(value: string, create = false): string {
    const target = locator(value);
    if (!this.entries.some(entry => inside(entry.path, target) || inside(entry.real, target))) throw new FileAccessError();
    this.currentRoots();
    let real: string;
    try {
      // lstat distinguishes a dangling symlink from a genuinely absent new leaf.
      fs.lstatSync(target);
      real = fs.realpathSync(target);
      const stat = fs.statSync(real);
      if (!stat.isFile() && !stat.isDirectory()) throw new FileAccessError("Only regular files and directories are supported.");
    } catch (error) {
      if (!create || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try { fs.lstatSync(target); throw new FileAccessError("A new file cannot replace a symlink."); }
      catch (leafError) { if ((leafError as NodeJS.ErrnoException).code !== "ENOENT") throw leafError; }
      const parent = fs.realpathSync(path.dirname(target));
      if (!fs.statSync(parent).isDirectory()) throw new FileAccessError("Parent must be an existing directory.");
      real = path.join(parent, path.basename(target));
    }
    if (!this.entries.some(entry => inside(entry.real, real))) throw new FileAccessError();
    // Keep the locator: existing per-document media/asset rules must still see symlinks.
    return target;
  }

  boundary(value: string): string {
    const target = this.resolve(value);
    return this.entries.flatMap(entry => [entry.path, entry.real])
      .filter(root => inside(root, target)).sort((a, b) => b.length - a.length)[0]!;
  }
}

export function accessPath(value: string, access: FileAccess, create = false): string {
  return access ? access.resolve(value, create) : value;
}

/** HTTP errors may describe the request, but must not reveal an out-of-bound resolved path. */
export function fileErrorMessage(error: unknown, access: FileAccess): string {
  if (access && error && typeof error === "object" && "code" in error) return "The file operation failed. Check that the file exists and is accessible.";
  return error instanceof Error ? error.message : String(error);
}

export function fileErrorStatus(error: unknown, fallback = 400): number {
  return error instanceof FileAccessError ? error.status : fallback;
}
