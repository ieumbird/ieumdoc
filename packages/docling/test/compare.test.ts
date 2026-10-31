import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { convertDoclingDocument } from "../src/convert.ts";
import { readDoclingMap } from "../src/map.ts";
import { readComparison } from "../src/compare-host.ts";
import { itemsForTarget, pageRegion, scrollAnchors, scrollPosition, targetKey } from "../src/compare.ts";
import type { MapItem, Target } from "../src/map.ts";

test("page regions transform both origins and independent page dimensions", () => {
  const size = { width: 600, height: 800 };
  const a = pageRegion({ l: 60, r: 300, t: 720, b: 640, coord_origin: "BOTTOMLEFT" }, size);
  assert.deepEqual(a, { left: .1, top: .1, width: .4, height: .1 });
  assert.deepEqual(pageRegion({ l: 300, r: 60, t: 80, b: 160, coord_origin: "TOPLEFT" }, size), a);
  assert.deepEqual(pageRegion({ l: 0, r: 300, t: 400, b: 0, coord_origin: "BOTTOMLEFT" }, { width: 300, height: 400 }),
    { left: 0, top: 0, width: 1, height: 1 });
});
test("scroll anchors reject reversals and duplicates, and interpolate in either direction", () => {
  const points = scrollAnchors([[100, 200], [0, 0], [100, 400], [200, 150], [300, 600]]);
  assert.deepEqual(points, [[0, 0], [100, 200], [300, 600]]);
  assert.equal(scrollPosition(points, 200), 400);
  assert.equal(scrollPosition(points, 400, true), 200);
  assert.equal(targetKey({ path: [4], item: [1, 0] }), "[4]:1.0");
});
test("comparison exposes stale source regions but ordinary map consumers still reject stale targets", () => {
  const result = convertDoclingDocument(readFileSync(new URL("./fixtures/synthetic/document.json", import.meta.url), "utf8"));
  const json = JSON.stringify(result.map);
  assert.equal(readComparison("document.md", result.markdown, json).stale, false);
  assert.equal(readComparison("document.md", `${result.markdown}\nChanged.\n`, json).stale, true);
  assert.throws(() => readDoclingMap(json, `${result.markdown}\nChanged.\n`), /Stale/);
  const malformed = structuredClone(result.map); malformed.pages["1"].size.width = 0;
  assert.throws(() => readComparison("document.md", result.markdown, JSON.stringify(malformed)), /mapping page/);
});

test("reverse selection keeps merged sources and list-item precision without picture descendants", () => {
  const item = (self_ref: string, role: Target["role"], path = [4], indexes?: number[]): MapItem => ({
    self_ref, label: "text", content_layer: "body", parent: null, provenance: [], status: "converted", notes: [],
    targets: [{ path, block: "paragraph", role, ...(indexes ? { item: indexes } : {}) }],
  });
  const a = item("a", "block"), b = item("b", "block");
  const group = item("group", "group"), caption = item("caption", "caption"), pixels = item("pixels", "image-content");
  assert.deepEqual(itemsForTarget([group, pixels, a, caption, b], "[4]"), [a, b]);
  const first = item("first", "list-item", [5], [0]), nested = item("nested", "list-item", [5], [0, 1]);
  assert.deepEqual(itemsForTarget([first, nested], "[5]:0.1"), [nested]);
  assert.deepEqual(itemsForTarget([first, nested], "[5]"), [first, nested]);
  assert.deepEqual(itemsForTarget([first, nested], "[50]"), []);
  assert.deepEqual(itemsForTarget([caption], "[4]"), [caption]);
});
