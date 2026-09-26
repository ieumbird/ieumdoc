import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, serialize } from "@ieumdoc/core";

/**
 * Scratch fixtures for the Editor browser regressions (`apps/editor/test/*.browser.js`).
 * Each scenario opens files under the repository's ignored `tmp/<dir>/`; preparing deletes
 * those directories and recreates them from committed sources, so every run starts from the
 * same state. Source files are only read.
 */
export const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const DOCUMENT_DIR = path.join(REPOSITORY_ROOT, "apps", "editor", "document");
const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

/** Committed sources the scratch files are made from. Tests never write these. */
export const SOURCE_DIRS = [DOCUMENT_DIR, FIXTURE_DIR];

type ScratchFile = { name: string; create: () => string | Buffer };

const document = (name: string): ScratchFile => ({ name, create: () => readFileSync(path.join(DOCUMENT_DIR, name)) });
const fixture = (name: string): ScratchFile => ({ name, create: () => readFileSync(path.join(FIXTURE_DIR, name)) });
const technical = [document("technical-document.md"), document("diagram.svg")];

/** Scratch directory under `tmp/` → the files a fresh copy holds, and the scenarios using it. */
export const SCRATCH_DIRS: Record<string, { files: ScratchFile[]; scenarios: string[] }> = {
  "quiet-document": {
    files: [fixture("quiet-document.md"), fixture("quiet-document-long.md"), document("diagram.svg"),
      { name: "아주-긴-파일명-very-long-technical-document-name-for-visual-review.md", create: () => fixture("quiet-document-long.md").create() }],
    scenarios: ["layout-rules", "quiet-document"],
  },
  "reference-save-reload": { files: technical, scenarios: ["reference-save-reload"] },
  "quote-save-reload": { files: [fixture("quotes.md")], scenarios: ["quote-save-reload"] },
  "figure-authoring": {
    files: [
      ...technical,
      // A second, visibly different asset the scenario switches the Figure to.
      { name: "diagram-v2.svg", create: () => readFileSync(path.join(DOCUMENT_DIR, "diagram.svg"), "utf8").replace("<svg ", '<svg data-variant="v2" ') },
    ],
    scenarios: ["figure-authoring", "figure-draft-race"],
  },
  "table-cell-editing": { files: [...technical, fixture("mixed-table.md")], scenarios: ["table-cell-editing"] },
  "link-authoring": { files: [fixture("links.md")], scenarios: ["link-authoring"] },
  "inline-math": { files: [fixture("math.md"), fixture("split.md")], scenarios: ["inline-math-authoring", "inline-math-split"] },
  "admonition-authoring": { files: [fixture("authoring.md")], scenarios: ["admonition-authoring"] },
  "source-view": {
    files: [
      ...technical,
      // Source View must equal the canonical Markdown `ieumdoc format` writes, i.e. Core serialize.
      { name: "expected.md", create: () => serialize(parse(readFileSync(path.join(DOCUMENT_DIR, "technical-document.md"), "utf8"))) },
      fixture("keyboard.md"),
    ],
    scenarios: ["source-view", "source-view-pending"],
  },
  "label-authoring": { files: technical, scenarios: ["label-authoring"] },
  "cross-reference": { files: [fixture("refs.md"), document("diagram.svg")], scenarios: ["cross-reference"] },
};

/** Recreate every scratch directory under `tmpRoot` from its sources. Returns the directories. */
export function prepareBrowserFixtures(tmpRoot = path.join(REPOSITORY_ROOT, "tmp")): string[] {
  return Object.entries(SCRATCH_DIRS).map(([name, { files }]) => {
    const dir = path.join(tmpRoot, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const file of files) writeFileSync(path.join(dir, file.name), file.create());
    return dir;
  });
}
