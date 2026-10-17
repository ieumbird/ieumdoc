import type { TiptapJSON } from "./tiptap-inline.ts";

// Session locators retain their spelling across restore. All three allocation paths share
// reservation so a locator present only in the saved snapshot cannot be reused either.
const counters = { command: 0, engine: 0, split: 0 };
export function allocateBlockPath(kind: keyof typeof counters): string {
  if (counters[kind] >= Number.MAX_SAFE_INTEGER) throw new Error("Editor locator exceeds the supported range");
  return `new:${kind === "command" ? "" : `${kind}:`}${++counters[kind]}`;
}

/** Reserve a whole restore together; a rejected path must not consume any locators. */
export function reserveBlockPaths(...documents: TiptapJSON[]): void {
  const candidates = { ...counters };
  function visit(document: TiptapJSON): void {
    const path = document.attrs?.sourcePath;
    if (typeof path === "string") for (const part of path.split(";")) {
      const match = /^new:(?:(engine|split):)?([1-9]\d*)$/.exec(part);
      if (!match) continue;
      const value = Number(match[2]);
      if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) throw new Error("Editor locator exceeds the supported range");
      const kind = (match[1] ?? "command") as keyof typeof counters;
      candidates[kind] = Math.max(candidates[kind], value);
    }
    document.content?.forEach(visit);
  }
  documents.forEach(visit);
  Object.assign(counters, candidates);
}
