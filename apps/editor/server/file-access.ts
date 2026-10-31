import fs from "node:fs";
import path from "node:path";
import { isPrivatePluginPath } from "./plugin-output.ts";
import { assertUnicode } from "@ieumdoc/file-commit";

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
  assertUnicode(value);
  return path.resolve(value.trim());
}

/** The real path of the nearest existing ancestor. */
function realParent(target: string): string {
  for (let folder = path.dirname(target); ; folder = path.dirname(folder)) {
    try { return fs.realpathSync(folder); }
    catch (error) { if (path.dirname(folder) === folder) throw error; }
  }
}

type RootEntry = { path: string; real: string; dev: number; ino: number };

/**
 * `target` is `root` or beneath it, and the prefix matching `root` is the pinned root directory.
 * Windows path comparison lowercases in JavaScript, which equates names NTFS keeps distinct
 * (KELVIN SIGN and "k"), so the matching prefix is also compared by filesystem identity.
 */
function within(entry: RootEntry, root: string, target: string): boolean {
  if (!inside(root, target)) return false;
  let folder = target;
  while (path.relative(root, folder) && path.dirname(folder) !== folder) folder = path.dirname(folder);
  try {
    const stat = fs.statSync(folder);
    return stat.dev === entry.dev && stat.ino === entry.ino;
  } catch { return false; } // A missing look-alike prefix is outside, not a file error.
}

/** Fixed operator roots, not the folder currently selected in the Editor. */
export class RootAccess {
  readonly roots: readonly string[];
  private readonly entries: readonly RootEntry[];

  constructor(roots: readonly string[]) {
    if (!roots.length) throw new Error("At least one --root directory is required.");
    const entries: RootEntry[] = [];
    for (const value of roots) {
      const folder = locator(value);
      const real = fs.realpathSync(folder);
      const stat = fs.statSync(real);
      if (!stat.isDirectory()) throw new Error(`Root must be an existing directory: ${folder}`);
      if (!entries.some(entry => inside(real, entry.real) && within(entry, entry.real, real))) {
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

  private contains(real: string): boolean {
    return this.entries.some(entry => within(entry, entry.real, real));
  }

  /** Check before any filesystem I/O; an absent leaf is allowed only beneath an existing parent. */
  resolve(value: string, create = false): string {
    const target = locator(value);
    if (!this.entries.some(entry => inside(entry.path, target) || inside(entry.real, target))) throw new FileAccessError();
    this.currentRoots();
    if (!this.entries.some(entry => within(entry, entry.path, target) || within(entry, entry.real, target))) throw new FileAccessError();
    let real: string;
    try {
      // lstat distinguishes a dangling symlink from a genuinely absent new leaf.
      fs.lstatSync(target);
      real = fs.realpathSync(target);
      const stat = fs.statSync(real);
      if (!stat.isFile() && !stat.isDirectory()) throw new FileAccessError("Only regular files and directories are supported.");
    } catch (error) {
      // Even whether a name exists behind an outside link is not revealed.
      if (!this.contains(realParent(target))) throw new FileAccessError();
      if (!create || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try { fs.lstatSync(target); throw new FileAccessError("A new file cannot replace a symlink."); }
      catch (leafError) { if ((leafError as NodeJS.ErrnoException).code !== "ENOENT") throw leafError; }
      const parent = fs.realpathSync(path.dirname(target));
      if (!fs.statSync(parent).isDirectory()) throw new FileAccessError("Parent must be an existing directory.");
      real = path.join(parent, path.basename(target));
    }
    if (!this.contains(real)) throw new FileAccessError();
    if (isPrivatePluginPath(target)) throw new FileAccessError("Plugin work is not published.");
    // Keep the locator: existing per-document media/asset rules must still see symlinks.
    return target;
  }

  boundary(value: string): string {
    const target = this.resolve(value);
    return this.entries.flatMap(entry => [entry.path, entry.real].filter(root => within(entry, root, target)))
      .sort((a, b) => b.length - a.length)[0]!;
  }
}

export function accessPath(value: string, access: FileAccess, create = false): string {
  if (access) return access.resolve(value, create);
  assertUnicode(value);
  if (isPrivatePluginPath(value)) throw new FileAccessError("Plugin work is not published.");
  return value;
}

/** HTTP errors may describe the request, but must not reveal an out-of-bound resolved path. */
export function fileErrorMessage(error: unknown, access: FileAccess): string {
  if (access && error && typeof error === "object" && "code" in error) return "The file operation failed. Check that the file exists and is accessible.";
  return error instanceof Error ? error.message : String(error);
}

export function fileErrorStatus(error: unknown, fallback = 400): number {
  return error instanceof FileAccessError ? error.status : fallback;
}
