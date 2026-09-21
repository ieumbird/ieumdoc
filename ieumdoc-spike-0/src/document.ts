import { mystParse } from "myst-parser";
import { writeMd } from "myst-to-md";
import {
  containerChildrenTransform,
  htmlTransform,
  liftMystDirectivesAndRolesTransform,
  reconstructHtmlTransform,
} from "myst-transforms";
import { toText } from "myst-common";
import { select, selectAll } from "unist-util-select";
import { VFile } from "vfile";

export type MystNode = {
  type: string;
  children?: MystNode[];
  value?: string;
  [key: string]: unknown;
};

export function parseDocument(source: string): MystNode {
  const ast = mystParse(source) as MystNode;
  const file = new VFile();
  reconstructHtmlTransform(ast as never);
  htmlTransform(ast as never);
  liftMystDirectivesAndRolesTransform(ast as never);
  containerChildrenTransform(ast as never, file);
  return ast;
}

export function serializeDocument(ast: MystNode): string {
  const tree = encodeSpannedTables(structuredClone(ast));
  const file = new VFile();
  writeMd(file, tree as never);
  const markdown = String(file.result ?? "").trimEnd();
  return `${markdown}\n`;
}

function encodeSpannedTables(ast: MystNode): MystNode {
  for (const container of selectAll("container", ast) as MystNode[]) {
    if (container.kind !== "table") continue;
    const table = select("table", container) as MystNode | undefined;
    if (!tableHasSpans(table)) continue;
    const caption = select("caption", container) as MystNode | undefined;
    const args = caption ? toText(caption as never) : "";
    const lines = [`:::{table}${args ? ` ${args}` : ""}`];
    if (typeof container.label === "string" && container.label) {
      lines.push(`:name: ${container.label}`);
    }
    lines.push("", serializeHtmlTable(table as MystNode), ":::");
    container.type = "html";
    container.value = lines.join("\n");
    delete container.children;
    delete container.kind;
    delete container.label;
    delete container.identifier;
  }
  return ast;
}

function tableHasSpans(table: MystNode | undefined): boolean {
  return (selectAll("tableCell", table ?? { type: "table" }) as MystNode[]).some(
    (cell) => Number(cell.rowspan ?? 1) > 1 || Number(cell.colspan ?? 1) > 1,
  );
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function serializeHtmlTable(table: MystNode): string {
  const rows = (table.children ?? []).map((row) => {
    const cells = (row.children ?? []).map((cell) => {
      const tag = cell.header ? "th" : "td";
      const attrs: string[] = [];
      if (Number(cell.rowspan) > 1) attrs.push(`rowspan="${cell.rowspan}"`);
      if (Number(cell.colspan) > 1) attrs.push(`colspan="${cell.colspan}"`);
      const attr = attrs.length ? ` ${attrs.join(" ")}` : "";
      return `<${tag}${attr}>${escapeHtml(toText(cell as never))}</${tag}>`;
    });
    return `  <tr>${cells.join("")}</tr>`;
  });
  return `<table>\n${rows.join("\n")}\n</table>`;
}

export function replaceText(node: MystNode, from: string, to: string): boolean {
  let found = false;
  if (typeof node.value === "string" && node.value.includes(from)) {
    node.value = node.value.replaceAll(from, to);
    found = true;
  }
  for (const child of node.children ?? []) {
    if (replaceText(child, from, to)) found = true;
  }
  return found;
}

export function replaceNodeText(ast: MystNode, type: string, from: string, to: string): boolean {
  const nodes = selectAll(type, ast) as MystNode[];
  for (const node of nodes) {
    if (toText(node as never).includes(from)) {
      return replaceText(node, from, to);
    }
  }
  return false;
}

export function collectTypes(ast: MystNode): Map<string, number> {
  const counts = new Map<string, number>();
  const walk = (node: MystNode) => {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
    for (const child of node.children ?? []) walk(child);
  };
  walk(ast);
  return counts;
}

export function summarize(ast: MystNode): Record<string, unknown>[] {
  return (selectAll("*", ast) as MystNode[]).map((node) => {
    const summary: Record<string, unknown> = { type: node.type };
    for (const key of [
      "name",
      "kind",
      "label",
      "identifier",
      "depth",
      "url",
      "file",
      "alt",
      "header",
      "rowspan",
      "colspan",
      "value",
    ]) {
      if (node[key] != null) summary[key] = node[key];
    }
    return summary;
  });
}
