// Spike probe: is a labeled standalone {mermaid} a numbered Figure target in official MyST?
import { mystParse } from "myst-parser";
import { containerChildrenTransform, enumerateTargetsTransform, liftMystDirectivesAndRolesTransform,
  ReferenceState, resolveLinksAndCitationsTransform, resolveReferencesTransform } from "myst-transforms";
import { VFile } from "vfile";
import * as core from "../../src/index.ts";
const src = "```{mermaid}\n:label: m-standalone\ngraph LR\n  A-->B\n```\n\n:::{figure}\n:name: m-figure\n\n```{mermaid}\ngraph LR\n  A-->B\n```\n\nFlow.\n:::\n\nSee [](#m-standalone) and [](#m-figure).\n";
const file = new VFile({ path: "doc.md" });
const tree: any = mystParse(src, { vfile: file } as never);
liftMystDirectivesAndRolesTransform(tree); containerChildrenTransform(tree, file);
const state = new ReferenceState("doc.md", { vfile: file });
enumerateTargetsTransform(tree, { state }); resolveLinksAndCitationsTransform(tree, { state }); resolveReferencesTransform(tree, file, { state });
const all = (n: any, t: string, o: any[] = []): any[] => { if (n?.type === t) o.push(n); (n?.children ?? []).forEach((c: any) => all(c, t, o)); return o; };
const text = (n: any): string => (n.value ?? (n.children ?? []).map(text).join("")).replace(/ /g, " ");
console.log("top-level:", tree.children.map((n: any) => `${n.type}${n.kind ? ":" + n.kind : ""}${n.label ? "#" + n.label : ""}${n.enumerator ? " enum=" + n.enumerator : ""}`));
console.log("refs:", all(tree, "crossReference").map(r => `${r.identifier} kind=${r.kind} -> ${JSON.stringify(text(r))}`));
console.log("messages:", file.messages.map(m => m.message));
const doc = core.parse(src);
console.log("core blocks:", core.getEditableDocument(doc).blocks.map((b: any) => `${b.block}${b.label ? "#" + b.label : ""}`), "writeError:", core.canonicalWriteError(doc));
