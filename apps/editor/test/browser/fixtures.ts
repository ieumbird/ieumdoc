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
  "new-document": { files: [], scenarios: ["new-document"] },
  "image-assets": { files: [{ name: "images.md", create: () => "# Images\n\nAlpha.\n\nBeta.\n" }], scenarios: ["image-assets"] },
  "external-html-paste": { files: [{ name: "external.md", create: () => "# External\n\nAlpha.\n\nOmega.\n" }], scenarios: ["external-html-paste"] },
  "continuous-editing": { files: [fixture("continuous-editing.md"), document("diagram.svg"),
    { name: "edge-equation.md", create: () => "$$\nx\n$$\n" },
    // Every inline kind a heading, Figure caption and table cell hold (#58).
    { name: "formatted-clipboard.md", create: () => "## **Bold** *it* {del}`gone` [link](https://example.com) `code` $x$ {eq}`eq-a` {numref}`fig-a`\n\n" +
      ":::{figure} diagram.svg\n:alt: Diagram\n\n**Bold** caption with $y$ and [link](https://example.com).\n:::\n\n" +
      "| **Head** | Plain |\n| --- | --- |\n| *it* `c` $z$ | {eq}`eq-a` |\n\nAfter.\n" },
    fixture("preserved-markdown.md")], scenarios: ["continuous-editing"] },
  "save-session": {
    files: [...technical, { name: "session.md", create: () => "# Session\n\nAlpha.\n\nBeta.\n" }],
    scenarios: ["save-session"],
  },
  "quiet-document": {
    files: [fixture("quiet-document.md"), fixture("quiet-document-long.md"), document("diagram.svg"),
      { name: "아주-긴-파일명-very-long-technical-document-name-for-visual-review.md", create: () => fixture("quiet-document-long.md").create() }],
    scenarios: ["layout-rules", "quiet-document", "visual-states"],
  },
  "reference-save-reload": { files: technical, scenarios: ["reference-save-reload"] },
  "block-move": { files: technical, scenarios: ["block-move"] },
  "table-authoring": { files: [fixture("tables.md")], scenarios: ["table-authoring"] },
  "quote-save-reload": { files: [fixture("quotes.md")], scenarios: ["quote-save-reload"] },
  "section-reference": {
    files: [{ name: "sections.md", create: () => "# Guide\n\n## Install\n\nRun the installer.\n\n## Use\n\nSee the install section.\n\n## 개요\n\nKorean heading.\n" }],
    scenarios: ["section-reference"],
  },
  "block-source-editing": {
    files: [document("diagram.svg"), { name: "block-source.md", create: () =>
      "# Block source\n\n![Diagram](./diagram.svg)\n\n*   [ ] Draft\n*   [x] Review\n\nBody.\n" }],
    scenarios: ["block-source-editing"],
  },
  "property-drafts": {
    files: [{ name: "drafts.md", create: () =>
      "# Drafts\n\n(section-a)=\n\n## Heading\n\n| Name | Unit |\n| --- | --- |\n| Value | {u}`V` |\n\nBody.\n" }],
    scenarios: ["property-drafts"],
  },
  "writeability-preflight": {
    files: [fixture("front-matter.md"), fixture("preserved-markdown.md"), fixture("blocked-markdown.md"), document("diagram.svg")],
    scenarios: ["writeability-preflight"],
  },
  "figure-authoring": {
    files: [
      ...technical,
      // A second, visibly different asset the scenario switches the Figure to.
      { name: "diagram-v2.svg", create: () => readFileSync(path.join(DOCUMENT_DIR, "diagram.svg"), "utf8").replace("<svg ", '<svg data-variant="v2" ') },
    ],
    scenarios: ["figure-authoring", "figure-draft-race"],
  },
  "pending-figure": {
    files: [document("diagram.svg"), { name: "pending.md", create: () =>
      "# Pending Figures\n\nIntro.\n\nThe controller structure is shown in [](#fig-pfc-control).\n\nStored reference: {numref}`fig-pfc-control`.\n\nAfter.\n" }],
    scenarios: ["pending-figure"],
  },
  "table-cell-editing": { files: [...technical, fixture("mixed-table.md")], scenarios: ["table-cell-editing"] },
  "link-authoring": { files: [fixture("links.md")], scenarios: ["link-authoring"] },
  "inline-math": { files: [fixture("math.md"), fixture("split.md")], scenarios: ["inline-math-authoring", "inline-math-split"] },
  "admonition-authoring": { files: [fixture("authoring.md")], scenarios: ["admonition-authoring"] },
  "list-authoring": { files: [fixture("lists.md")], scenarios: ["list-authoring"] },
  "structural-block-authoring": { files: [fixture("structural-block-authoring.md")], scenarios: ["structural-block-authoring"] },
  "markdown-input": { files: [fixture("markdown-input.md")], scenarios: ["markdown-input"] },
  "basic-blocks": { files: [fixture("basic-blocks.md")], scenarios: ["basic-blocks"] },
  "outline": { files: [fixture("outline.md")], scenarios: ["outline"] },
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
  "footnotes": {
    files: [{ name: "footnotes.md", create: () =>
      "# Footnotes\n\nFirst claim[^b] and second[^a].\n\n[^b]: Defined first.\n\nMiddle paragraph.\n\n[^a]: Defined later,\n    on two lines.\n\n    Second paragraph.\n" }],
    scenarios: ["footnotes"],
  },
  "focus-caret": {
    files: [{ name: "focus.md", create: () => "# Focus\n\nFirst paragraph.\n\nLast paragraph.\n" }],
    scenarios: ["focus-caret"],
  },
  "folder-navigation": {
    files: [
      { name: "index.md", create: () => "# Index\n\nStart here.\n" },
      { name: "notes.md", create: () => "# Notes\n\nNotes body.\n" },
      { name: "guides/install.md", create: () => "# Install\n\nInstall body.\n" },
      { name: "자료/메모.md", create: () => "# 메모\n\n내용.\n" },
    ],
    scenarios: ["folder-navigation"],
  },
};

/** Recreate every scratch directory under `tmpRoot` from its sources. Returns the directories. */
export function prepareBrowserFixtures(tmpRoot = path.join(REPOSITORY_ROOT, "tmp")): string[] {
  return Object.entries(SCRATCH_DIRS).map(([name, { files }]) => {
    const dir = path.join(tmpRoot, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    for (const file of files) {
      mkdirSync(path.dirname(path.join(dir, file.name)), { recursive: true });
      writeFileSync(path.join(dir, file.name), file.create());
    }
    return dir;
  });
}
