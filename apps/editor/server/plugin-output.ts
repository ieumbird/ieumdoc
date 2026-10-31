import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

export const INCOMPLETE = ".ieumdoc-incomplete";
/** Private work and an exclusively reserved publication directory are never a
 * document surface, even on a local Host or through a symlink alias. */
export function isPrivatePluginPath(value: string): boolean {
  const check = (target: string) => {
    for (let current = path.resolve(target); ; current = path.dirname(current)) {
      if (path.basename(current).startsWith(".ieumdoc-plugin-") || existsSync(path.join(current, INCOMPLETE))) return true;
      if (path.dirname(current) === current) return false;
    }
  };
  if (check(value)) return true;
  for (let current = path.resolve(value); ; current = path.dirname(current)) {
    if (existsSync(current)) return check(realpathSync(current));
    if (path.dirname(current) === current) return false;
  }
}
