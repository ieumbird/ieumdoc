// Spike probe: current IeumDoc Core behavior for image-less and Mermaid Figures (no Core changes).
import * as core from "../../src/index.ts";
const run = (name: string, f: () => unknown) => { try { console.log(name, "=>", JSON.stringify(f())); } catch (e) { console.log(name, "=> THROWS", (e as Error).message.slice(0, 220)); } };
const empty = ":::{figure}\n:label: fig-pfc-control\n\nPFC control loop.\n:::\n\nSee [](#fig-pfc-control).\n";
const mermaid = ":::{figure}\n:label: fig-flow\n\n```{mermaid}\ngraph LR\n  A-->B\n```\n\nControl flow.\n:::\n\nSee [](#fig-flow).\n";
for (const [name, src] of [["empty", empty], ["mermaid", mermaid]] as const) {
  const doc = core.parse(src);
  run(`${name}: canonicalWriteError`, () => core.canonicalWriteError(doc));
  run(`${name}: figure read model`, () => { const b: any = core.getEditableDocument(doc).blocks[0]; return { block: b.block, label: b.label, imageUrl: b.imageUrl, caption: b.caption.text, editable: b.editable }; });
  run(`${name}: unresolvedReferences`, () => core.unresolvedReferences(doc));
  run(`${name}: blockTargets`, () => core.blockTargets(core.getEditableDocument(doc).blocks[0] as any));
  run(`${name}: serialize`, () => core.serialize(doc));
}
run("insertFigure imageUrl ''", () => core.serialize(core.insertFigure(core.parse("Text.\n"), 1, { imageUrl: "", imageAlt: "", caption: "PFC control loop." })));
run("validateFigure imageUrl ''", () => core.validateFigure({ imageUrl: "", imageAlt: "", caption: "x" }));
