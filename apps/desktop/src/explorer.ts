import { realpathSync, statSync } from "node:fs";
import path from "node:path";
import { RootAccess } from "../../editor/server/file-access.ts";
import { assertUnicode } from "@ieumdoc/file-commit";

function localDirectory(value: unknown): string {
  if (typeof value !== "string" || !value || value !== value.trim() || !path.isAbsolute(value) ||
      /^[\\/]{2}/.test(value) || value.includes("\0") ||
      (process.platform === "win32" && value.replace(/^[a-z]:/i, "").includes(":"))) {
    throw new Error("Invalid local folder path.");
  }
  assertUnicode(value);
  const real = realpathSync(value);
  if (/^[\\/]{2}/.test(real) || !statSync(real).isDirectory()) throw new Error("Not a local directory.");
  return real;
}

/** Only roots successfully listed by this Desktop Host can become opened roots. */
export class ExplorerFolders {
  private readonly listed = new Map<string, RootAccess | null>();
  private opened: RootAccess[] = [];

  listedRoot(root: string): void {
    // A successfully browsed UNC/unavailable root stays browseable but cannot launch the OS.
    try {
      localDirectory(root);
      this.listed.set(root, new RootAccess([root]));
    } catch { this.listed.set(root, null); }
  }

  setOpened(roots: unknown): void {
    if (!Array.isArray(roots) || !roots.every(root => typeof root === "string" && this.listed.has(root))) {
      throw new Error("Unknown opened folders.");
    }
    this.opened = roots.map(root => this.listed.get(root)!).filter((root): root is RootAccess => root !== null);
  }

  async open(value: unknown, openPath: (folder: string) => Promise<string>): Promise<void> {
    // Validate syntax before doing filesystem I/O, then enforce pinned lexical and real boundaries.
    const real = localDirectory(value);
    const allowed = this.opened.some(root => {
      try { root.resolve(value as string); root.resolve(real); return true; } catch { return false; }
    });
    if (!allowed) throw new Error("Folder is outside the opened folders.");
    const error = await openPath(real);
    if (error) throw new Error(error);
  }
}
