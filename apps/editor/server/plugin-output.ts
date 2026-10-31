import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

// Internal publication barriers must be understood by every brand sharing a document Root.
export const INCOMPLETE = ".litzio-incomplete";
export const STAGING_PREFIX = ".litzio-plugin-";
function directoryStat(folder: string) {
  try { const stat = statSync(folder); return stat.isDirectory() ? stat : undefined; }
  catch (error) {
    if (["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return undefined;
    throw error;
  }
}
/** Private work and an exclusively reserved publication directory are never a
 * document surface, even on a local Host or through a symlink alias. */
export function isPrivatePluginPath(value: string): boolean {
  const check = (target: string) => {
    for (let current = path.resolve(target); ; current = path.dirname(current)) {
      if (existsSync(path.join(current, INCOMPLETE))) return true;
      if (path.basename(current).startsWith(STAGING_PREFIX) && directoryStat(current)) {
        // A reserved spelling may itself be a symlink to an ordinary directory.
        if (path.basename(realpathSync.native(current)).startsWith(STAGING_PREFIX)) return true;
      }
      if (path.dirname(current) === current) return false;
    }
  };
  if (check(value)) return true;
  for (let current = path.resolve(value); ; current = path.dirname(current)) {
    try {
      // The native OS resolution expands Windows case/8.3/junction aliases;
      // JS realpath can retain their spelling. No ancestor directory listing
      // or metadata read of an unrelated normal ancestor is required.
      return check(realpathSync.native(current));
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
    }
    if (path.dirname(current) === current) return false;
  }
}
