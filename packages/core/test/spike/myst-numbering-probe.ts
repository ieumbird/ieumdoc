// Spike probe: official MyST numbering and cross-reference resolution with an image-less Figure.
import { mystParse } from "myst-parser";
import { liftMystDirectivesAndRolesTransform, containerChildrenTransform, enumerateTargetsTransform,
  resolveLinksAndCitationsTransform, resolveReferencesTransform, ReferenceState } from "myst-transforms";
import { VFile } from "vfile";

const src = process.argv[2] === 'alternatives' ? `# Converter

:::{figure} ./grid.svg
:label: fig-grid

Grid connection.
:::

(fig-pfc-control)=
PFC control loop (target + paragraph).

:::{note}
:label: fig-note-draft
PFC control loop (labeled admonition).
:::

:::{figure} ./last.svg
:label: fig-last

Last figure.
:::

See [](#fig-grid), [](#fig-pfc-control), [](#fig-note-draft) and [](#fig-last).
` : `# Converter

:::{figure} ./grid.svg
:label: fig-grid

Grid connection.
:::

:::{figure}
:label: fig-pfc-control

PFC control loop.
:::

:::{figure}
:label: fig-flow

\`\`\`{mermaid}
graph LR
  A-->B
\`\`\`

Control flow.
:::

:::{figure}
:label: fig-label-only
:::

:::{figure} ./last.svg
:label: fig-last

Last figure.
:::

See [](#fig-grid), [](#fig-pfc-control), [](#fig-flow), [](#fig-label-only) and [](#fig-last).
`;
const all = (n: any, type: string, out: any[] = []): any[] => { if (n?.type === type) out.push(n); (n?.children ?? []).forEach((c: any) => all(c, type, out)); return out; };
const select = (type: string, n: any) => all(n, type)[0];
const selectAll = (type: string, n: any) => all(n, type);
const file = new VFile({ path: "doc.md" });
const tree: any = mystParse(src, { extensions: { smartquotes: false }, vfile: file } as any);
liftMystDirectivesAndRolesTransform(tree);
containerChildrenTransform(tree, file);
const state = new ReferenceState("doc.md", { vfile: file });
enumerateTargetsTransform(tree, { state });
resolveLinksAndCitationsTransform(tree, { state });
resolveReferencesTransform(tree, file, { state });
for (const fig of selectAll("container", tree) as any[]) {
  const caption = select("caption", fig) as any;
  const captionNumber = caption && select("captionNumber", caption) as any;
  console.log(`${fig.label}: enumerator=${fig.enumerator} children=[${fig.children.map((c: any) => c.type)}] captionNumber=${captionNumber ? JSON.stringify((captionNumber.children ?? []).map((c: any) => c.value).join("")) : "none"}`);
}
for (const ref of selectAll("crossReference", tree) as any[]) {
  console.log(`ref #${ref.identifier}: kind=${ref.kind} resolved=${ref.resolved} text=${JSON.stringify((ref.children ?? []).map((c: any) => c.value ?? (c.children ?? []).map((x: any) => x.value).join("")).join(""))}`);
}
console.log("messages:", file.messages.map(m => `${m.fatal ? "ERROR" : "warn"}: ${m.message}`));
