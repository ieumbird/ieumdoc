import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import type { GenericParent } from "myst-common";
// Imported by package name, exactly as CLI, Editor Host and other consumers do.
import * as core from "@ieumdoc/core";
import { getEditableDocument, inspectDocument, parse, serialize, type Document } from "@ieumdoc/core";

// The public Document is opaque: its MyST representation is not a consumer contract.
// `pnpm typecheck` fails if any expectation below stops being an error.
function consumerContract(document: Document): void {
  serialize(document);
  getEditableDocument(document);
  inspectDocument(document);
  // @ts-expect-error consumers cannot read the document tree
  void document.children;
  // @ts-expect-error consumers cannot read node types
  void document.type;
  // @ts-expect-error a parsed Document is not a MyST GenericParent
  const tree: GenericParent = document;
  void tree;
  // @ts-expect-error consumers cannot build a document from raw MyST nodes
  serialize({ type: "root", children: [] });
}

// @ts-expect-error the MyST node alias is not public
export type RemovedNode = core.DocumentNode;

test("public Core API exposes semantic operations, not MyST tree access", () => {
  consumerContract(parse("# Title\n"));
  for (const name of ["getNode", "insertBlock", "cloneDocument"]) {
    assert.equal(name in core, false, `${name} must not be public`);
  }
  assert.equal(serialize(parse("# Title\n")), "# Title\n");
});

test("MyST packages are imported only inside Core's MyST boundary", () => {
  const root = new URL("../src/", import.meta.url);
  const files = readdirSync(root, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts"));
  const outside = files.filter((file) => !file.replaceAll("\\", "/").startsWith("myst/") &&
    /from\s+["']myst-/.test(readFileSync(new URL(file, root), "utf8")));
  assert.deepEqual(outside, []);
});
