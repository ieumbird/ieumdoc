import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { toText } from "myst-common";
import {
  parse,
  serialize,
  updateNodeText,
  validate,
  type Document,
  type DocumentNode,
} from "../src/index.ts";

const ADMONITION_FROM = "The current controller parameters must be calibrated before operation.";
const ADMONITION_TO = "The current controller parameters must be calibrated.";
const CAPTION_FROM = "Control block diagram of the grid-connected converter.";
const CAPTION_TO = "Control block diagram of the grid-tied converter.";
const CELL_FROM = "AC";
const CELL_TO = "AC-side";

const source = readFileSync(new URL("./fixtures/technical-document.md", import.meta.url), "utf8");

test("technical document parses", () => {
  const document = parse(source);
  const types = collectTypes(document);
  assert.equal(document.type, "root");
  assert.ok(types.has("heading"));
  assert.ok(types.has("paragraph"));
  assert.ok(types.has("admonition"));
  assert.ok(types.has("container"));
  assert.ok(types.has("image"));
  assert.ok(types.has("caption"));
  assert.ok(types.has("math"));
  assert.ok(types.has("table"));
  assert.ok(types.has("tableCell"));
  assert.ok(hasReference(document, "fig-control"));
  assert.ok(hasReference(document, "eq-current"));
});

test("admonition content can be modified structurally", () => {
  const document = parse(source);
  const changed = updateNodeText(document, "admonition", ADMONITION_FROM, ADMONITION_TO);
  const original = findNode(document, "admonition");
  const updated = findNode(changed, "admonition");
  assert.equal(original?.kind, "warning");
  assert.equal(toText(original!), ADMONITION_FROM);
  assert.equal(updated?.kind, "warning");
  assert.equal(updated?.type, "admonition");
  assert.equal(toText(updated!), ADMONITION_TO);
  assert.equal(toText(original!), ADMONITION_FROM);
});

test("figure caption can be modified structurally", () => {
  const document = parse(source);
  const changed = updateNodeText(document, "caption", CAPTION_FROM, CAPTION_TO);
  const original = figureOf(document);
  const updated = figureOf(changed);
  assert.equal(original.label ?? original.identifier, "fig-control");
  assert.equal(updated.label ?? updated.identifier, "fig-control");
  assert.equal(updated.kind, "figure");
  assert.ok(updated.children?.some((node) => node.type === "image"));
  assert.ok(updated.children?.some((node) => node.type === "caption"));
  assert.equal(toText(findNode(original, "caption")!), CAPTION_FROM);
  assert.equal(toText(findNode(updated, "caption")!), CAPTION_TO);
  assert.equal(findNode(updated, "image")?.url, "./diagram.svg");
});

test("table cell can be modified structurally", () => {
  const document = parse(source);
  const changed = updateNodeText(document, "tableCell", CELL_FROM, CELL_TO);
  const originalTable = findNode(document, "table");
  const updatedTable = findNode(changed, "table");
  assert.ok(originalTable);
  assert.ok(updatedTable);
  assert.equal(originalTable.children?.length, updatedTable.children?.length);
  assert.equal(cellText(originalTable, 1, 1), CELL_FROM);
  assert.equal(cellText(updatedTable, 1, 1), CELL_TO);
  assert.equal(cellText(updatedTable, 0, 0), "Port");
  assert.equal(cellText(updatedTable, 1, 0), "U");
});

test("figure/equation/reference semantics remain intact", () => {
  const document = modify(parse(source));
  const figure = figureOf(document);
  const math = findNode(document, "math");
  assert.equal(figure.kind, "figure");
  assert.equal(figure.label ?? figure.identifier, "fig-control");
  assert.ok(figure.children?.some((node) => node.type === "image"));
  assert.ok(figure.children?.some((node) => node.type === "caption"));
  assert.equal(math?.label ?? math?.identifier, "eq-current");
  assert.equal(typeof math?.value, "string");
  assert.ok(hasReference(document, "fig-control"));
  assert.ok(hasReference(document, "eq-current"));
});

test("modified document validates", () => {
  const document = modify(parse(source));
  validate(document);
  assert.equal(document.type, "root");
});

test("canonical serialization succeeds", () => {
  const output = serialize(modify(parse(source)));
  assert.equal(output.includes(ADMONITION_TO), true);
  assert.equal(output.includes(CAPTION_TO), true);
  assert.equal(output.includes(CELL_TO), true);
  assert.equal(output.includes("fig-control"), true);
  assert.equal(output.includes("eq-current"), true);
  assert.equal(output.includes(CAPTION_FROM), false);
  assert.equal(output.endsWith("\n"), true);
});

test("serialized document reparses", () => {
  const output = serialize(modify(parse(source)));
  const reparsed = parse(output);
  assert.equal(reparsed.type, "root");
  const figure = figureOf(reparsed);
  assert.equal(figure.label ?? figure.identifier, "fig-control");
  assert.ok(figure.children?.some((node) => node.type === "caption"));
  assert.equal(toText(findNode(reparsed, "caption")!), CAPTION_TO);
  assert.equal(findNode(reparsed, "math")?.label ?? findNode(reparsed, "math")?.identifier, "eq-current");
  assert.equal(cellText(findNode(reparsed, "table")!, 1, 1), CELL_TO);
  assert.ok(hasReference(reparsed, "fig-control"));
  assert.ok(hasReference(reparsed, "eq-current"));
});

test("second serialization is stable", () => {
  const output1 = serialize(modify(parse(source)));
  const output2 = serialize(parse(output1));
  assert.equal(output1, output2);
});

function modify(document: Document): Document {
  const withAdmonition = updateNodeText(document, "admonition", ADMONITION_FROM, ADMONITION_TO);
  const withCaption = updateNodeText(withAdmonition, "caption", CAPTION_FROM, CAPTION_TO);
  return updateNodeText(withCaption, "tableCell", CELL_FROM, CELL_TO);
}

function figureOf(document: DocumentNode): DocumentNode {
  const figure = findNode(
    document,
    "container",
    (node) => node.kind === "figure",
  );
  assert.ok(figure, "missing figure container");
  return figure;
}

function cellText(table: DocumentNode, row: number, column: number): string {
  const cell = table.children?.[row]?.children?.[column];
  assert.ok(cell, `missing table cell ${row},${column}`);
  return toText(cell);
}

function hasReference(node: DocumentNode, target: string): boolean {
  if (node.type === "link" && String(node.url ?? "") === `#${target}`) return true;
  if (
    node.type === "crossReference" &&
    (node.identifier === target || node.label === target)
  ) {
    return true;
  }
  return (node.children ?? []).some((child) => hasReference(child, target));
}

function findNode(
  node: DocumentNode,
  type: string,
  predicate?: (node: DocumentNode) => boolean,
): DocumentNode | undefined {
  if (node.type === type && (!predicate || predicate(node))) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, type, predicate);
    if (found) return found;
  }
  return undefined;
}

function collectTypes(node: DocumentNode, types = new Set<string>()): Set<string> {
  types.add(node.type);
  for (const child of node.children ?? []) collectTypes(child, types);
  return types;
}
