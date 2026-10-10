// Spike probe: raw official MyST behavior for a Figure without an image. Not part of the Core suite.
import { mystParse } from "myst-parser";
import { liftMystDirectivesAndRolesTransform, containerChildrenTransform } from "myst-transforms";
import { writeMd } from "myst-to-md";
import { VFile } from "vfile";

const strip = (n: any): any => {
  if (Array.isArray(n)) return n.map(strip);
  if (n && typeof n === "object") {
    const o: any = {};
    for (const [k, v] of Object.entries(n)) if (!["position", "key"].includes(k)) o[k] = strip(v);
    return o;
  }
  return n;
};
const parseRaw = (src: string) => {
  const file = new VFile();
  const tree: any = mystParse(src, { extensions: { smartquotes: false }, vfile: file } as any);
  liftMystDirectivesAndRolesTransform(tree);
  containerChildrenTransform(tree, file);
  return { tree, messages: file.messages.map(m => `${m.fatal ? "ERROR" : "warn"}: ${m.message}`) };
};
const write = (tree: any) => { const f = new VFile(); try { writeMd(f, structuredClone(tree)); } catch (e) { return { md: "", messages: [`THROWS: ${(e as Error).message}`] }; } return { md: String(f.result), messages: f.messages.map(m => m.message) }; };

const cases: Record<string, string> = {
  "C1 colon, no arg, label + caption": ":::{figure}\n:label: fig-pfc-control\n\nPFC control loop.\n:::\n",
  "C2 backtick, no arg, label + caption": "```{figure}\n:label: fig-pfc-control\n\nPFC control loop.\n```\n",
  "C3 no arg, label only": ":::{figure}\n:label: fig-pfc-control\n:::\n",
  "C4 no arg, empty body": ":::{figure}\n:::\n",
  "C5 empty-string arg": ":::{figure} \n:label: fig-pfc-control\n\nPFC control loop.\n:::\n",
  "C6 image arg (baseline)": ":::{figure} ./pfc.svg\n:label: fig-pfc-control\n\nPFC control loop.\n:::\n",
  "C7 no arg, mermaid body + caption": ":::{figure}\n:label: fig-pfc-control\n\n```{mermaid}\ngraph LR\n  A-->B\n```\n\nPFC control loop.\n:::\n",
  "C8 no arg, image in body + caption": ":::{figure}\n:label: fig-pfc-control\n\n![](./pfc.svg)\n\nPFC control loop.\n:::\n",
};
for (const [name, src] of Object.entries(cases)) {
  const first = parseRaw(src);
  const out = write(first.tree);
  const second = out.md ? parseRaw(out.md) : { tree: { children: [] } };
  const sameAst = JSON.stringify(strip(first.tree)) === JSON.stringify(strip(second.tree));
  console.log(`\n### ${name}\n--- source\n${src}--- parse messages: ${JSON.stringify(first.messages)}`);
  console.log(`--- AST\n${JSON.stringify(strip(first.tree.children), null, 1).replace(/\n\s*/g, " ")}`);
  console.log(`--- myst-to-md (${JSON.stringify(out.messages)})\n${out.md}--- reparse equal: ${sameAst}${sameAst ? "" : "\n" + JSON.stringify(strip(second.tree.children)).slice(0, 600)}`);
}
