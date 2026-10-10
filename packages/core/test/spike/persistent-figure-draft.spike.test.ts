// SPIKE acceptance PoC for a persistent Figure draft (T1-T8). Not part of the Core suite:
// run with `pnpm --filter @ieumdoc/core exec tsx --test test/spike/persistent-figure-draft.spike.test.ts`.
// Numbers and references are compared with official MyST transforms, not only with Core.
import assert from "node:assert/strict";
import test from "node:test";
import { mystParse } from "myst-parser";
import {
  containerChildrenTransform, enumerateTargetsTransform, liftMystDirectivesAndRolesTransform,
  ReferenceState, resolveLinksAndCitationsTransform, resolveReferencesTransform,
} from "myst-transforms";
import { VFile } from "vfile";
import * as core from "../../src/index.ts";

type Official = { figures: Record<string, string | undefined>; references: Record<string, string>; referenceCount: number; unresolved: number; errors: string[] };

/** What official MyST (parser + transforms used by mystmd) makes of canonical Markdown. */
function official(markdown: string): Official {
  const file = new VFile({ path: "doc.md" });
  const tree: any = mystParse(markdown, { extensions: { smartquotes: false }, vfile: file } as never);
  liftMystDirectivesAndRolesTransform(tree);
  containerChildrenTransform(tree, file);
  const state = new ReferenceState("doc.md", { vfile: file });
  enumerateTargetsTransform(tree, { state });
  resolveLinksAndCitationsTransform(tree, { state });
  resolveReferencesTransform(tree, file, { state });
  const all = (node: any, type: string, out: any[] = []): any[] => {
    if (node?.type === type) out.push(node);
    (node?.children ?? []).forEach((child: any) => all(child, type, out));
    return out;
  };
  const text = (node: any): string => (node.value ?? (node.children ?? []).map(text).join("")).replace(/ /g, " ");
  return {
    figures: Object.fromEntries(all(tree, "container").map(node => [node.label, node.enumerator])),
    references: Object.fromEntries(all(tree, "crossReference").map(node => [node.identifier, node.resolved ? text(node) : "UNRESOLVED"])),
    referenceCount: all(tree, "crossReference").length,
    unresolved: all(tree, "crossReference").filter(node => !node.resolved).length,
    errors: file.messages.filter(message => message.fatal).map(message => message.message),
  };
}

const figureBlocks = (document: core.Document) =>
  core.getEditableDocument(document).blocks.flatMap((block, index) => block.block === "figure" ? [{ ...block, index }] : []);
/** Core's own numbers (the rule CLI and Editor share), keyed by label. */
const coreNumbers = (document: core.Document) => {
  const blocks = core.getEditableDocument(document).blocks;
  const numbers = core.targetNumbers(blocks.map(block => core.blockTargets(block as never)));
  return Object.fromEntries(blocks.flatMap((block, index) => block.block === "figure" ? [[block.label, String(numbers[index].figure)]] : []));
};

// Both reference forms: the Markdown link MyST documents, and the {numref} role IeumDoc authors.
const START = "# Converter\n\nIntro.\n\nThe loop in [](#fig-pfc-control) regulates the current ({numref}`fig-pfc-control`).\n";
const PENDING = { imageUrl: "", imageAlt: "", caption: "PFC control loop." };

function draftDocument(): core.Document {
  const inserted = core.insertFigure(core.parse(START), 2, PENDING);
  return core.updateLabel(inserted, [2], "fig-pfc-control");
}

test("T1 a Figure without content, with a caption and a label, is a valid writable document", () => {
  const document = draftDocument();
  assert.equal(core.canonicalWriteError(document), undefined);
  const [figure] = figureBlocks(document);
  assert.deepEqual({ label: figure.label, imageUrl: figure.imageUrl, caption: figure.caption.text, editable: figure.editable },
    { label: "fig-pfc-control", imageUrl: "", caption: "PFC control loop.", editable: true });
  // A label alone (no caption) is also kept.
  const labelOnly = core.updateLabel(core.insertFigure(core.parse("Text.\n"), 1, { ...PENDING, caption: "" }), [1], "fig-only");
  assert.equal(core.serialize(labelOnly), "Text.\n\n:::{figure}\n:name: fig-only\n:::\n");
});

test("T2 the pending Figure is a reference target, in Core and in official MyST", () => {
  const document = draftDocument();
  assert.deepEqual(core.unresolvedReferences(document), []);
  const result = official(core.serialize(document));
  assert.deepEqual(result.references, { "fig-pfc-control": "Figure 1" });
  assert.deepEqual([result.referenceCount, result.unresolved], [2, 0]);
  assert.deepEqual(coreNumbers(document), { "fig-pfc-control": "1" });
  // Official MyST still reports the Figure as having no valid content: Save keeps it, publishing must say so.
  assert.deepEqual(result.errors, ["container of kind figure contains no valid content besides caption"]);
});

test("T3 Save then Reload keeps the Figure, caption, label and reference byte-for-byte", () => {
  const markdown = core.serialize(draftDocument());
  assert.equal(markdown, `# Converter\n\nIntro.\n\n:::{figure}\n:name: fig-pfc-control\n\nPFC control loop.\n:::\n\nThe loop in [](#fig-pfc-control) regulates the current ({numref}\`fig-pfc-control\`).\n`);
  const reloaded = core.parse(markdown);
  assert.equal(core.serialize(reloaded), markdown);
  const [figure] = figureBlocks(reloaded);
  assert.deepEqual({ label: figure.label, imageUrl: figure.imageUrl, caption: figure.caption.text, editable: figure.editable },
    { label: "fig-pfc-control", imageUrl: "", caption: "PFC control loop.", editable: true });
});

test("T4 connecting an image after Reload keeps position, caption, label and the reference", () => {
  const reloaded = core.parse(core.serialize(draftDocument()));
  const connected = core.updateFigure(reloaded, [2], { imageUrl: "./pfc-control.svg", imageAlt: "PFC control block diagram" });
  const markdown = core.serialize(connected);
  assert.match(markdown, /\n:::\{figure\} \.\/pfc-control\.svg\n:name: fig-pfc-control\n:alt: PFC control block diagram\n\nPFC control loop\.\n:::\n/);
  const [figure] = figureBlocks(core.parse(markdown));
  assert.deepEqual([figure.index, figure.label, figure.caption.text], [2, "fig-pfc-control", "PFC control loop."]);
  const result = official(markdown);
  assert.deepEqual(result.references, { "fig-pfc-control": "Figure 1" });
  assert.deepEqual(result.errors, []);
  // Disconnecting goes back to the pending form without losing the label.
  const pending = core.updateFigure(core.parse(markdown), [2], { imageUrl: "", imageAlt: "" });
  assert.equal(core.serialize(pending), core.serialize(draftDocument()));
});

test("T5 a Mermaid diagram can become the Figure's content through block source; the Figure stays read-only", () => {
  const reloaded = core.parse(core.serialize(draftDocument()));
  const source = ":::{figure}\n:name: fig-pfc-control\n\n```{mermaid}\ngraph LR\n  Vin --> PFC --> Vout\n```\n\nPFC control loop.\n:::";
  const mermaid = core.replaceBlockSource(reloaded, 2, source);
  const markdown = core.serialize(mermaid);
  assert.equal(core.serialize(core.parse(markdown)), markdown);
  assert.match(markdown, /:::\{figure\}\n:name: fig-pfc-control\n\n```\{mermaid\}\ngraph LR\n  Vin --> PFC --> Vout\n```\n\nPFC control loop\.\n:::/);
  const [figure] = figureBlocks(core.parse(markdown));
  // Figure v1 authoring has no Mermaid content; the read model keeps label and caption text.
  assert.deepEqual([figure.label, figure.caption.text, figure.editable], ["fig-pfc-control", "PFC control loop.", false]);
  const result = official(markdown);
  assert.deepEqual(result.references, { "fig-pfc-control": "Figure 1" });
  assert.deepEqual(result.errors, []);
});

test("T6 pending, image and Mermaid Figures share one numbering in Core and official MyST", () => {
  const source = [
    ":::{figure} ./grid.svg\n:name: fig-grid\n\nGrid.\n:::",
    ":::{figure}\n:name: fig-pfc-control\n\nPFC control loop.\n:::",
    ":::{figure}\n:name: fig-flow\n\n```{mermaid}\ngraph LR\n  A-->B\n```\n\nFlow.\n:::",
    ":::{figure}\n:name: fig-label-only\n:::",
    ":::{figure} ./last.svg\n:name: fig-last\n\nLast.\n:::",
    "See [](#fig-grid), [](#fig-pfc-control), [](#fig-flow), [](#fig-label-only), [](#fig-last).",
  ].join("\n\n") + "\n";
  const document = core.parse(source);
  assert.equal(core.serialize(document), source);
  const result = official(source);
  const expected = { "fig-grid": "1", "fig-pfc-control": "2", "fig-flow": "3", "fig-label-only": "4", "fig-last": "5" };
  assert.deepEqual(coreNumbers(document), expected);
  assert.deepEqual(Object.fromEntries(Object.entries(result.figures).map(([label, number]) => [label, String(number)])), expected);
  assert.deepEqual(Object.values(result.references), ["Figure 1", "Figure 2", "Figure 3", "Figure 4", "Figure 5"]);
});

test("T7 moving and removing a pending Figure keeps the document writable; removal leaves the role reference unresolved", () => {
  const document = draftDocument();
  const moved = core.moveBlock(document, 2, 3);
  assert.equal(core.canonicalWriteError(moved), undefined);
  assert.equal(figureBlocks(moved)[0].index, 3);
  assert.equal(core.serialize(core.parse(core.serialize(moved))), core.serialize(moved));
  const removed = core.removeBlock(document, 2);
  assert.equal(core.canonicalWriteError(removed), undefined);
  // Core reports the {numref} role; as for image Figures today, it does not check `[](#label)` links.
  assert.deepEqual(core.unresolvedReferences(removed).map(reference => `${reference.role}:${reference.label}`), ["numref:fig-pfc-control"]);
});

test("T8 nothing marks a pending Figure for publishing yet: official MyST reports it, Core does not", () => {
  const document = draftDocument();
  // Official MyST builds it (mystmd exits 0) as a numbered, caption-only Figure with an error diagnostic.
  assert.equal(official(core.serialize(document)).errors.length, 1);
  // Core's structural validation accepts the pending Figure; a publish check is a new rule (not implemented).
  assert.doesNotThrow(() => core.validateStructure(document));
});
