import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { toText } from "myst-common";
import {
  getNode,
  parse,
  serialize,
  updateNodeTextAtPath,
  validateStructure,
  type Document,
  type DocumentNode,
  type NodePath,
} from "../src/index.ts";

const ADMONITION_FROM = "The current controller parameters must be calibrated before operation.";
const ADMONITION_TO = "The current controller parameters must be calibrated.";
const CAPTION_FROM = "Control block diagram of the grid-connected converter.";
const CAPTION_TO = "Control block diagram of the grid-tied converter.";
const CELL_FROM = "AC";
const CELL_TO = "AC-side";

const ADMONITION_PATH: NodePath = [4];
const FIGURE_PATH: NodePath = [6];
const CAPTION_PATH: NodePath = [6, 1];
const TABLE_PATH: NodePath = [12];
const CELL_PATH: NodePath = [12, 1, 1];

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
  const changed = updateNodeTextAtPath(document, ADMONITION_PATH, ADMONITION_FROM, ADMONITION_TO);
  const original = getNode(document, ADMONITION_PATH);
  const updated = getNode(changed, ADMONITION_PATH);
  assert.equal(original.kind, "warning");
  assert.equal(toText(original), ADMONITION_FROM);
  assert.equal(updated.kind, "warning");
  assert.equal(updated.type, "admonition");
  assert.equal(toText(updated), ADMONITION_TO);
});

test("figure caption can be modified structurally", () => {
  const document = parse(source);
  const changed = updateNodeTextAtPath(document, CAPTION_PATH, CAPTION_FROM, CAPTION_TO);
  const original = getNode(document, FIGURE_PATH);
  const updated = getNode(changed, FIGURE_PATH);
  assert.equal(getNode(document, CAPTION_PATH).type, "caption");
  assert.equal(original.label ?? original.identifier, "fig-control");
  assert.equal(updated.label ?? updated.identifier, "fig-control");
  assert.equal(updated.kind, "figure");
  assert.ok(updated.children?.some((node) => node.type === "image"));
  assert.ok(updated.children?.some((node) => node.type === "caption"));
  assert.equal(toText(getNode(document, CAPTION_PATH)), CAPTION_FROM);
  assert.equal(toText(getNode(changed, CAPTION_PATH)), CAPTION_TO);
  assert.equal(getNode(changed, [...FIGURE_PATH, 0]).url, "./diagram.svg");
});

test("table cell can be modified structurally", () => {
  const document = parse(source);
  const changed = updateNodeTextAtPath(document, CELL_PATH, CELL_FROM, CELL_TO);
  const originalTable = getNode(document, TABLE_PATH);
  const updatedTable = getNode(changed, TABLE_PATH);
  assert.equal(originalTable.type, "table");
  assert.equal(updatedTable.type, "table");
  assert.equal(originalTable.children?.length, updatedTable.children?.length);
  assert.equal(toText(getNode(document, CELL_PATH)), CELL_FROM);
  assert.equal(toText(getNode(changed, CELL_PATH)), CELL_TO);
  assert.equal(toText(getNode(changed, [...TABLE_PATH, 0, 0])), "Port");
  assert.equal(toText(getNode(changed, [...TABLE_PATH, 1, 0])), "U");
});

test("exact node can be addressed with NodePath", () => {
  const document = parse(source);
  assert.equal(getNode(document, ADMONITION_PATH).type, "admonition");
  assert.equal(getNode(document, CAPTION_PATH).type, "caption");
  assert.equal(getNode(document, CELL_PATH).type, "tableCell");
});

test("node text mutation is unambiguous", () => {
  const document = parse("# Title\n\nSame sentence.\n\nSame sentence.\n");
  const changed = updateNodeTextAtPath(document, [2], "Same sentence.", "Changed.");
  assert.equal(toText(getNode(changed, [1])), "Same sentence.");
  assert.equal(toText(getNode(changed, [2])), "Changed.");
  assert.equal(toText(getNode(document, [1])), "Same sentence.");
  assert.equal(toText(getNode(document, [2])), "Same sentence.");
});

test("figure/equation/reference semantics remain intact", () => {
  const document = modify(parse(source));
  const figure = getNode(document, FIGURE_PATH);
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
  validateStructure(document);
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
  const figure = getNode(reparsed, FIGURE_PATH);
  assert.equal(figure.label ?? figure.identifier, "fig-control");
  assert.ok(figure.children?.some((node) => node.type === "caption"));
  assert.equal(toText(getNode(reparsed, CAPTION_PATH)), CAPTION_TO);
  assert.equal(findNode(reparsed, "math")?.label ?? findNode(reparsed, "math")?.identifier, "eq-current");
  assert.equal(toText(getNode(reparsed, CELL_PATH)), CELL_TO);
  assert.ok(hasReference(reparsed, "fig-control"));
  assert.ok(hasReference(reparsed, "eq-current"));
});

test("second serialization is stable", () => {
  const output1 = serialize(modify(parse(source)));
  const output2 = serialize(parse(output1));
  assert.equal(output1, output2);
});

function modify(document: Document): Document {
  const withAdmonition = updateNodeTextAtPath(document, ADMONITION_PATH, ADMONITION_FROM, ADMONITION_TO);
  const withCaption = updateNodeTextAtPath(withAdmonition, CAPTION_PATH, CAPTION_FROM, CAPTION_TO);
  return updateNodeTextAtPath(withCaption, CELL_PATH, CELL_FROM, CELL_TO);
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
