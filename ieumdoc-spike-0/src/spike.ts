import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { toText } from "myst-common";
import { selectAll } from "unist-util-select";
import {
  collectTypes,
  parseDocument,
  replaceNodeText,
  replaceText,
  serializeDocument,
  summarize,
  type MystNode,
} from "./document.ts";

const root = path.dirname(fileURLToPath(new URL(".", import.meta.url)));
const fixturePath = path.join(root, "fixture.md");
const outputDir = path.join(root, "out");
const outputPath = path.join(outputDir, "output.md");
const astPath = path.join(outputDir, "ast.json");

type Check = { name: string; pass: boolean; detail: string };

const checks: Check[] = [];

function check(name: string, pass: boolean, detail: string) {
  checks.push({ name, pass, detail });
}

function has(ast: MystNode, predicate: (node: MystNode) => boolean): boolean {
  return (selectAll("*", ast) as MystNode[]).some(predicate);
}

function find(ast: MystNode, predicate: (node: MystNode) => boolean): MystNode | undefined {
  return (selectAll("*", ast) as MystNode[]).find(predicate);
}

const source = readFileSync(fixturePath, "utf8");
const document = parseDocument(source);
mkdirSync(outputDir, { recursive: true });
writeFileSync(astPath, JSON.stringify(document, null, 2));

check("Parse", document.type === "root" && (document.children?.length ?? 0) > 0, `root children=${document.children?.length ?? 0}`);

check(
  "Heading/paragraph/inline",
  has(document, (n) => n.type === "heading") &&
    has(document, (n) => n.type === "paragraph") &&
    has(document, (n) => n.type === "strong") &&
    has(document, (n) => n.type === "emphasis") &&
    has(document, (n) => n.type === "list"),
  "heading, paragraph, strong, emphasis, list present",
);

check(
  "Warning directive",
  has(document, (n) => n.type === "admonition" && n.kind === "warning"),
  "admonition.kind=warning",
);

const figure = find(document, (n) => n.type === "container" && n.kind === "figure");
const figureCaption = figure
  ? (selectAll("caption", figure) as MystNode[])
      .map((node) => toText(node as never))
      .join(" ")
  : "";
check(
  "Figure",
  Boolean(figure?.label || figure?.identifier) &&
    has(document, (n) => n.type === "image") &&
    figureCaption.includes("Control block diagram"),
  `label=${String(figure?.label ?? figure?.identifier ?? "missing")} caption=${figureCaption || "missing"}`,
);

const math = find(document, (n) => n.type === "math");
check(
  "Equation",
  Boolean(math) && Boolean(math?.label || math?.identifier || math?.value),
  `label=${String(math?.label ?? math?.identifier ?? "none")} value=${String(math?.value ?? "").slice(0, 40)}`,
);

check(
  "Cross-reference",
  has(document, (n) => n.type === "crossReference" || (n.type === "link" && String(n.url ?? "").startsWith("#"))),
  "crossReference or #link present",
);

check(
  "Include",
  has(document, (n) => n.type === "include" || (n.type === "mystDirective" && n.name === "include")),
  "include node present",
);

const tables = selectAll("table", document) as MystNode[];
const spanned = (selectAll("tableCell", document) as MystNode[]).filter(
  (cell) => Number(cell.rowspan ?? 1) > 1 || Number(cell.colspan ?? 1) > 1,
);
check("Table", tables.length > 0, `table count=${tables.length}`);
check(
  "Merged cells in AST",
  spanned.length > 0,
  spanned.length > 0
    ? spanned.map((cell) => `rowspan=${cell.rowspan ?? 1} colspan=${cell.colspan ?? 1}`).join(", ")
    : "no tableCell rowspan/colspan after parse+html transform",
);

const htmlBlobs = (selectAll("html", document) as MystNode[]).filter((n) => typeof n.value === "string");
check(
  "No leftover HTML blob for merged table",
  htmlBlobs.length === 0,
  htmlBlobs.length === 0 ? "html nodes lifted into table AST" : `remaining html nodes=${htmlBlobs.length}`,
);

const changed = structuredClone(document);
const paragraphChanged = replaceNodeText(
  changed,
  "paragraph",
  "The current reference is calculated from the active power command.",
  "The current reference is calculated from the power command.",
);
const warningChanged = replaceNodeText(
  changed,
  "admonition",
  "The current controller parameters must be calibrated before operation.",
  "The current controller parameters must be calibrated.",
);
const tableChanged = replaceNodeText(changed, "tableCell", "12 A", "12.5 A");
const captionChanged = replaceText(changed, "grid-connected converter", "grid-tied converter");
const mergedChanged = replaceNodeText(changed, "tableCell", "800 V", "820 V");

check(
  "Programmatic modification",
  paragraphChanged && warningChanged && tableChanged,
  `paragraph=${paragraphChanged} warning=${warningChanged} tableCell=${tableChanged} caption=${captionChanged} mergedCell=${mergedChanged}`,
);

const output1 = serializeDocument(changed);
writeFileSync(outputPath, output1);
check(
  "Canonical serialize",
  output1.includes("power command") &&
    output1.includes("grid-tied converter") &&
    output1.includes("12.5 A") &&
    output1.trim().length > 0,
  `bytes=${output1.length}`,
);
check(
  "Serialized merged table keeps HTML spans",
  output1.includes("rowspan=") && output1.includes("colspan="),
  output1.includes("rowspan=") ? "html rowspan/colspan written" : "spans not in output.md",
);

const reparsed = parseDocument(output1);
check("Reparse", reparsed.type === "root" && (reparsed.children?.length ?? 0) > 0, `root children=${reparsed.children?.length ?? 0}`);

const output2 = serializeDocument(reparsed);
const stable = output1 === output2;
writeFileSync(path.join(outputDir, "output2.md"), output2);
check("Stable second serialization", stable, stable ? "byte-identical" : diffPreview(output1, output2));

check(
  "Semantic: warning",
  has(reparsed, (n) => n.type === "admonition" && n.kind === "warning"),
  "warning kind preserved",
);
check(
  "Semantic: figure label",
  has(reparsed, (n) => n.type === "container" && n.kind === "figure" && String(n.label ?? n.identifier ?? "").includes("fig-control")),
  "fig-control preserved",
);
check(
  "Semantic: equation",
  has(reparsed, (n) => n.type === "math"),
  "math node preserved",
);
check(
  "Semantic: include",
  has(reparsed, (n) => n.type === "include" || String(n.file ?? "").includes("included.md")),
  "include preserved",
);
check(
  "Semantic: merged cell spans",
  (selectAll("tableCell", reparsed) as MystNode[]).some(
    (cell) => Number(cell.rowspan ?? 1) > 1 || Number(cell.colspan ?? 1) > 1,
  ),
  "rowspan/colspan after reparse",
);

const types = [...collectTypes(document).entries()]
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([type, count]) => `${type}:${count}`)
  .join(", ");

console.log("IeumDoc Spike 0: Technical Document Round-trip\n");
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"}  ${item.name.padEnd(34)} ${item.detail}`);
}

console.log("\nParse                         " + status("Parse"));
console.log("Programmatic modification     " + status("Programmatic modification"));
console.log("Canonical serialize           " + status("Canonical serialize"));
console.log("Reparse                       " + status("Reparse"));
console.log("Stable second serialization   " + status("Stable second serialization"));

console.log("\nAST node types:");
console.log(types);

console.log("\nKey nodes:");
for (const node of summarize(document).filter((n) =>
  [
    "heading",
    "admonition",
    "container",
    "image",
    "caption",
    "math",
    "crossReference",
    "link",
    "include",
    "table",
    "tableCell",
    "mystDirective",
    "html",
  ].includes(String(n.type)),
)) {
  const compact = { ...node };
  if (typeof compact.value === "string" && compact.value.length > 60) {
    compact.value = `${compact.value.slice(0, 60)}…`;
  }
  console.log(JSON.stringify(compact));
}

console.log(`\nWrote ${path.relative(root, outputPath)}`);
console.log(`Wrote ${path.relative(root, astPath)}`);

function status(name: string): string {
  return checks.find((item) => item.name === name)?.pass ? "PASS" : "FAIL";
}

function diffPreview(a: string, b: string): string {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const max = Math.max(aLines.length, bLines.length);
  const diffs: string[] = [];
  for (let i = 0; i < max && diffs.length < 8; i += 1) {
    if (aLines[i] !== bLines[i]) {
      diffs.push(`L${i + 1}: ${JSON.stringify(aLines[i])} != ${JSON.stringify(bLines[i])}`);
    }
  }
  return diffs.join(" | ") || `length ${a.length} vs ${b.length}`;
}
