import { nativeSource } from "../helpers/document.ts";
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
const bibliography = (): string => readFileSync(path.join(REPOSITORY_ROOT, "packages/core/test/fixtures/bibliography-v1.bib"), "utf8") +
  '\n@proceedings{unsupported,title={Unapproved Proceedings},year={2024}}\n' +
  '@online{unsafe,title={<img src=x onerror=alert(1)>},organization={Lab},year={2024},url={javascript:alert(1)},urldate={2024-01-01}}\n';
const technical = [document("technical-document.md"), document("diagram.svg")];

/** Scratch directory under `tmp/` → the files a fresh copy holds, and the scenarios using it. */
export const SCRATCH_DIRS: Record<string, { files: ScratchFile[]; scenarios: string[] }> = {
  "file-preview": { files: [
    { name: "document.md", create: () => nativeSource("# Preview\n\nAlpha.\n\n(section-a)=\n\n## Section\n\nBody.\n") },
    document("diagram.svg"),
    fixture("doctype.svg"),
    { name: "active.svg", create: () => '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg" width="160" height="80" onload="window.__previewExecuted=true"><script>window.__previewExecuted=true</script><image href="https://example.invalid/preview-leak"/><text y="20">Read only</text></svg>' },
    { name: "photo.PNG", create: () => Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") },
    { name: "delayed.png", create: () => Buffer.from("invalid") },
    { name: "broken.png", create: () => Buffer.from("invalid") },
    { name: "notes.txt", create: () => "plain text" },
    { name: "README", create: () => "extensionless" },
    { name: "archive.zip", create: () => Buffer.from([0, 1, 2]) },
  ], scenarios: ["file-preview"] },
  "document-tabs": { files: [
    ...Array.from({ length: 8 }, (_, index) => ({ name: `technical-${index + 1}.md`, create: () => document("technical-document.md").create() })),
    { name: "bulk-1999.md", create: () => document("technical-document.md").create() },
    { name: "foreign.md", create: () => "# Foreign Markdown\n\nNo native marker.\n" },
    { name: "notes.txt", create: () => "Not a document" },
    document("diagram.svg"),
    ...["alpha", "beta"].flatMap(folder => [
      { name: `${folder}/guide.md`, create: () => document("technical-document.md").create() },
      { name: `${folder}/diagram.svg`, create: () => document("diagram.svg").create() },
    ]),
  ], scenarios: ["document-tabs", "recovery", "command-center"] },
  // Preserve the parent directories: the running HTTP Host pins their filesystem identities.
  "http-host-a/fixture": { files: [
    { name: "bibliography.md", create: () => fixture("bibliography.md").create() },
    { name: "a.md", create: () => nativeSource("# HTTP A\n\nAlpha.\n") },
    document("diagram.svg"),
    { name: "unsafe.svg", create: () => '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__ieumdocSVG = true; fetch("/api/folder-places");</script><text y="20">Untrusted media</text></svg>' },
  ], scenarios: ["http-host"] },
  "http-host-b/fixture": { files: [{ name: "b.md", create: () => nativeSource("# HTTP B\n\nBeta.\n") }], scenarios: ["http-host"] },
  "new-document": { files: [], scenarios: ["new-document", "recovery-structure"] },
  "open-files": { files: [
    { name: "ieumdoc-a.md", create: () => nativeSource("# A\n") },
    { name: "ieumdoc-b.md", create: () => nativeSource("# B\n") },
  ], scenarios: ["open-files"] },
  "image-assets": { files: [{ name: "images.md", create: () => nativeSource("# Images\n\nAlpha.\n\nBeta.\n") },
    { name: "figures/diagram.svg", create: () => document("diagram.svg").create() },
    { name: "assets/diagram.svg", create: () => document("diagram.svg").create() },
    { name: "paths.md", create: () => nativeSource("# Image paths\n\n" +
      ":::{figure} ./assets/diagram.svg\n:alt: Explicit relative path\n\nExplicit relative path.\n:::\n\n" +
      ":::{figure} assets/diagram.svg\n:alt: Bare relative path\n\nBare relative path.\n:::\n\n" +
      ":::{figure} assets/missing.png\n:alt: Missing image\n\nMissing image.\n:::\n") }], scenarios: ["image-assets"] },
  // An image outside that document's folder, which choosing copies into its assets/.
  "image-assets-outside": { files: [{ name: "photo.png", create: () =>
    Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64") }], scenarios: ["image-assets"] },
  "external-html-paste": { files: [{ name: "external.md", create: () => nativeSource("# External\n\nAlpha.\n\nOmega.\n") }], scenarios: ["external-html-paste"] },
  "atom-boundaries": { files: [{ name: "boundaries.md", create: () => nativeSource(
    "# Atom boundaries\n\n" + ["equation", "figure", "table", "code", "divider", "admonition"].flatMap((kind, i) =>
      ["heading", "paragraph", "list", "quote"].flatMap((current, j) => ["Backspace", "Delete"].map(key => {
        const id = `${i}-${j}-${key}`;
        const text = `Boundary ${id}`;
        const prose = current === "heading" ? `## ${text}` : current === "list" ? `- ${text}` : current === "quote" ? `> ${text}` : text;
        const block = { equation: "$$\nx+y\n$$", figure: ":::{figure}\n\nCaption.\n:::", table: "| Head |\n| --- |\n| Cell |", code: "```\ncode\n```", divider: "---", admonition: ":::{note}\nNote.\n:::" }[kind]!;
        return `Guard ${id}.\n\n` + (key === "Backspace" ? `${block}\n\n${prose}` : `${prose}\n\n${block}`) + `\n\nTail ${id}.\n\n`;
      }))).join("")
  ) }], scenarios: ["atom-boundaries"] },
  "continuous-editing": { files: [fixture("continuous-editing.md"), document("diagram.svg"),
    { name: "edge-equation.md", create: () => nativeSource("$$\nx\n$$\n") },
    // Every inline kind a heading, Figure caption and table cell hold (#58).
    { name: "formatted-clipboard.md", create: () => nativeSource("## **Bold** *it* {del}`gone` [link](https://example.com) `code` $x$ {eq}`eq-a` {numref}`fig-a`\n\n" +
      ":::{figure} diagram.svg\n:alt: Diagram\n\n**Bold** caption with $y$ and [link](https://example.com).\n:::\n\n" +
      "| **Head** | Plain |\n| --- | --- |\n| *it* `c` $z$ | {eq}`eq-a` |\n\nAfter.\n") },
    ], scenarios: ["continuous-editing"] },
  "save-session": {
    files: [...technical, { name: "session.md", create: () => nativeSource("# Session\n\nAlpha.\n\nBeta.\n") }],
    scenarios: ["save-session"],
  },
  "quiet-document": {
    files: [fixture("quiet-document.md"), fixture("quiet-document-long.md"), document("diagram.svg"),
      { name: "아주-긴-파일명-very-long-technical-document-name-for-visual-review.md", create: () => fixture("quiet-document-long.md").create() }],
    scenarios: ["layout-rules", "quiet-document", "visual-states"],
  },
  "reference-save-reload": { files: technical, scenarios: ["reference-save-reload", "ui-language"] },
  "bibliography": { files: [
    { name: "refs.bib", create: bibliography },
    { name: "chapters/paper.md", create: () => fixture("bibliography.md").create() },
    { name: "chapters/other.md", create: () => '---\nieumdoc: 1\nbibliography: [../refs.bib]\n---\n\n# Other bibliography\n\n{cite}`unicode,unsafe`\n' },
    { name: "chapters/authoring.md", create: () => '---\nieumdoc: 1\nbibliography: [../refs.bib]\n---\n\n# Citation authoring\n\nFirst claim {cite:p}`article`.\n\nWrite here.\n' },
    { name: "chapters/nested.md", create: () => '---\nieumdoc: 1\nbibliography: [../refs.bib]\n---\n\n# Nested inline\n\n(section)=\n\n## Target\n\n## Heading.\n\n- Only citation\n- Item.\n  - Nested item.\n\n> Quote.\n\n:::{note}\nCallout.\n:::\n\nBody[^n].\n\n| Header |\n| --- |\n| Cell. |\n\n:::{figure}\n\nCaption.\n:::\n\n```\nCode.\n```\n\n[^n]: Definition.\n' },
  ], scenarios: ["bibliography", "citation-authoring"] },
  "citations": { files: [fixture("citations.md")], scenarios: ["citations"] },
  "block-move": { files: technical, scenarios: ["block-move"] },
  "document-title": { files: [...technical,
    { name: "untitled.md", create: () => nativeSource("Lead paragraph.\n\n## Part\n\nBody.\n") },
    { name: "untitled-empty.md", create: () => nativeSource("Lead paragraph.\n") }], scenarios: ["document-title"] },
  "table-authoring": { files: [fixture("tables.md")], scenarios: ["table-authoring"] },
  "quote-save-reload": { files: [fixture("quotes.md")], scenarios: ["quote-save-reload"] },
  "section-reference": {
    files: [{ name: "sections.md", create: () => nativeSource("# Guide\n\n## Install\n\nRun the installer.\n\n## Use\n\nSee the install section.\n\n## 개요\n\nKorean heading.\n") }],
    scenarios: ["section-reference"],
  },
  "property-drafts": {
    files: [{ name: "drafts.md", create: () =>
      nativeSource("# Drafts\n\n(section-a)=\n\n## Heading\n\n| Name | Unit |\n| --- | --- |\n| Value | **V** |\n\nBody.\n") },
      { name: "focus.md", create: () => nativeSource("# Properties\n\nBefore.\n\nSee {numref}`fig-a`, {numref}`tbl-a` and {ref}`section-a`.\n\n" +
        ":::{figure}\n:name: fig-a\n\nCaption.\n:::\n\nAfter figure.\n\n" +
        ":::{table} Values\n:name: tbl-a\n\n| Name | Unit |\n| --- | --- |\n| Value | V |\n:::\n\nAfter table.\n\n" +
        "(section-a)=\n\n## Section\n\nAfter section.\n") },
    ],
    scenarios: ["property-drafts"],
  },
  "code-highlighting": {
    files: [{ name: "code.md", create: () => nativeSource("# Code\n\n```js\nconst value = 1;\n```\n\nAfter.\n") }],
    scenarios: ["code-highlighting"],
  },
  "writeability-preflight": {
    files: [fixture("writable.md"), fixture("blocked-markdown.md"),
      { name: "unsupported-syntax.md", create: () => nativeSource("- [ ] Unsupported task\n") }],
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
      nativeSource("# Pending Figures\n\nIntro.\n\nThe controller structure is shown in [Figure](#fig-pfc-control).\n\nStored reference: {numref}`fig-pfc-control`.\n\nAfter.\n") }],
    scenarios: ["pending-figure"],
  },
  "table-cell-editing": { files: [...technical, fixture("mixed-table.md")], scenarios: ["table-cell-editing"] },
  "link-authoring": { files: [fixture("links.md")], scenarios: ["link-authoring"] },
  "inline-math": { files: [fixture("math.md"), fixture("split.md")], scenarios: ["inline-math-authoring", "inline-math-split"] },
  "equation-editing": { files: [fixture("math.md"),
    { name: "middle.md", create: () => `${fixture("math.md").create().toString().trimEnd()}\n\nAfter.\n` },
    { name: "only.md", create: () => nativeSource("```{math}\n:label: eq-a\nx\n```\n") },
  ], scenarios: ["equation-save-during-edit"] },
  "equation-node-selection-typing": {
    files: [{ name: "power.md", create: () => nativeSource(
      "# Power\n\nBefore the equation.\n\n```{math}\n:label: eq-power\nP = VI \\cos \\varphi\n```\n\nAfter the equation.\n") }],
    scenarios: ["equation-node-selection-typing"],
  },
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
      fixture("writable.md"),
    ],
    scenarios: ["source-view", "source-view-pending", "document-session"],
  },
  "label-authoring": { files: technical, scenarios: ["label-authoring"] },
  "cross-reference": { files: [fixture("refs.md"), document("diagram.svg"),
    { name: "delete.md", create: () => nativeSource("# Delete targets\n\nSee {eq}`eq-a`, {numref}`fig-a` and {numref}`tbl-a`.\n\n" +
      "```{math}\n:label: eq-a\na=b\n```\n\n:::{figure} ./diagram.svg\n:name: fig-a\n:::\n\n" +
      ":::{table} Ports\n:name: tbl-a\n\n| a | b |\n| - | - |\n| 1 | 2 |\n:::\n\n```{math}\nx=y\n```\n") },
    // A table caption holding inline math, a resolved and an unresolved reference (#165), canonical.
    { name: "caption.md", create: () => nativeSource("# Caption\n\n:::{figure} ./diagram.svg\n:name: fig-a\n:::\n\n" +
      ":::{table} **Bold** with $x^2$, [link](https://example.com), {numref}`fig-a` and {eq}`eq-gone`\n:name: tbl-a\n\n" +
      "| a | b |\n| - | - |\n| 1 | 2 |\n:::\n") }], scenarios: ["cross-reference"] },
  "footnotes": {
    files: [{ name: "footnotes.md", create: () =>
      nativeSource("# Footnotes\n\nFirst claim[^b] and second[^a].\n\n[^b]: Defined first.\n\nMiddle paragraph.\n\n[^a]: Defined later,\n    on two lines.\n") },
      { name: "regions.md", create: () => nativeSource("# Notes in context\n\nFirst claim[^b], second[^a], long note[^c] and final note[^d].\n\n" +
        "[^c]: 긴 각주도 본문과 구별되면서 읽기 쉬워야 합니다. A longer explanation keeps **bold text**, a [link](https://example.com) and $x^2$ in its original position.\n\n" +
        "Body resumes between the notes.\n\n[^b]: A note beside another definition.\n\n" +
        "[^a]: A short note.\n\n" +
          "Body continues after the group.\n\n[^d]: The final note.\n") },
        { name: "repeat.md", create: () => nativeSource("# Repeated note\n\nFirst[^x].\n\nSecond[^x] and other[^y].\n\n[^y]: Other note.\n\n[^x]: Shared note.\n") },
        { name: "sections.md", create: () => nativeSource("# Document\n\n## Section A\n\nFirst claim[^b] and another[^a].\n\n[^a]: Second note.\n\n" +
          "## Section B\n\nAnother paragraph[^b].\n\n[^b]: First note.\n") }],
    scenarios: ["footnotes", "save-session"],
  },
  "focus-caret": {
    files: [{ name: "focus.md", create: () => nativeSource("# Focus\n\nFirst paragraph.\n\nLast paragraph.\n") }],
    scenarios: ["focus-caret"],
  },
  "desktop-updates": {
    files: [{ name: "updates.md", create: () => nativeSource("# Updates\n\nAlpha.\n\n:::{table} Values\n:name: tbl-a\n\n| A |\n| - |\n| 1 |\n:::\n") }],
    scenarios: ["desktop-updates"],
  },
  "folder-navigation": {
    files: [
      { name: "index.md", create: () => nativeSource("# Index\n\nStart here.\n") },
      { name: "notes.md", create: () => nativeSource("# Notes\n\nNotes body.\n") },
      { name: "guides/install.md", create: () => nativeSource("# Install\n\nInstall body.\n") },
      { name: "자료/메모.md", create: () => nativeSource("# 메모\n\n내용.\n") },
    ],
    scenarios: ["folder-navigation", "folder-memory"],
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
    if (name === "http-host-a/fixture") writeFileSync(path.join(dir, "..", "refs.bib"), bibliography());
    return dir;
  });
}
