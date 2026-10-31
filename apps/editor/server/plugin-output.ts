import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

export const INCOMPLETE = ".ieumdoc-incomplete";
function directoryStat(folder: string) {
  try { const stat = statSync(folder, { bigint: true }); return stat.isDirectory() ? stat : undefined; }
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
      const stat = directoryStat(current), parent = path.dirname(current);
      if (stat) {
        if (existsSync(path.join(current, INCOMPLETE))) return true;
        // realpath on Windows can preserve the requested case, and 8.3 names
        // need not contain our prefix at all. Match the actual directory entry
        // by filesystem identity rather than normalizing the requested spelling.
        if (parent !== current) for (const entry of readdirSync(parent, { withFileTypes: true })) {
          if (!entry.isDirectory() || !entry.name.startsWith(".ieumdoc-plugin-")) continue;
          const candidate = directoryStat(path.join(parent, entry.name));
          if (candidate && candidate.dev === stat.dev && candidate.ino === stat.ino) return true;
        }
      }
      if (path.dirname(current) === current) return false;
    }
  };
  if (check(value)) return true;
  for (let current = path.resolve(value); ; current = path.dirname(current)) {
    if (existsSync(current)) return check(realpathSync(current));
    if (path.dirname(current) === current) return false;
  }
}
