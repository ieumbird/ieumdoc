import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("product tokens and Tailwind adapters have unique, acyclic definitions", () => {
  const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
  const adapters = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  const definitions = [...(tokens + adapters).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)];
  const values = new Map<string, string>();
  for (const [, name, value] of definitions) {
    assert.ok(!values.has(name), `duplicate token definition: ${name}`);
    values.set(name, value);
  }
  for (const name of values.keys()) {
    const visit = (current: string, path: string[]): void => {
      assert.ok(!path.includes(current), `token cycle: ${[...path, current].join(" → ")}`);
      const value = values.get(current);
      assert.ok(value, `undefined token ${current}`);
      for (const [, reference] of value.matchAll(/var\((--[\w-]+)/g)) visit(reference, [...path, current]);
    };
    visit(name, []);
  }
  const productDefinitions = [...tokens.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)];
  const productNames = new Set(productDefinitions.map(([, name]) => name));
  for (const [, , value] of productDefinitions) {
    for (const [, reference] of value.matchAll(/var\((--[\w-]+)/g)) {
      // Check actual ownership: the product's --border-width is not the --border adapter.
      assert.ok(productNames.has(reference), `product values cannot depend on adapters: ${reference}`);
    }
  }
  assert.equal(values.get("--primary"), "var(--id-color-accent)");
  assert.equal(values.get("--id-color-border-focus"), "var(--id-color-interaction)");
  assert.equal(values.get("--ring"), "var(--id-color-border-focus)");
  assert.equal(values.get("--destructive"), "var(--id-color-danger)");
  // Primary actions share the interaction blue; red stays distinct for danger.
  assert.equal(values.get("--id-color-accent"), "var(--id-color-interaction)");
  assert.notEqual(values.get("--id-color-danger"), values.get("--id-color-interaction"));
  assert.equal(values.get("--font-family-document"), "var(--font-family-sans)");
  assert.equal(values.get("--id-color-document-heading-number"), "#0e7c86");
  assert.equal(values.get("--color-primary"), "var(--primary)");
  assert.doesNotMatch(tokens + adapters, /!important/);
});
