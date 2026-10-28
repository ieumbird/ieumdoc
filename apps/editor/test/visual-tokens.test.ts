import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import * as ts from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";
import { fileURLToPath } from "node:url";
import { ACCENT_COLORS } from "../src/preferences.ts";

function definitions(source: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const [, name, value] of source.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    assert.ok(!values.has(name), `duplicate token definition in scope: ${name}`);
    values.set(name, value.trim());
  }
  return values;
}

function accentPalettes(tokens: string): Map<string, Map<string, string>> {
  const scopes = new Map<string, Map<string, string>>();
  for (const [, selector, body] of tokens.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const key = selector!.trim();
    assert.match(key, /^:root(?:\[data-theme="dark"\])?(?:\[data-accent="[\w-]+"\])?(?:\[data-page="flat"\])?$/, `unexpected product-token scope: ${key}`);
    assert.ok(!scopes.has(key), `duplicate scope: ${key}`);
    const values = definitions(body!);
    if (key.includes("data-accent")) {
      const preset = key.match(/data-accent="([\w-]+)"/)![1];
      assert.ok(ACCENT_COLORS.some(color => color === preset), `unknown accent scope: ${key}`);
      assert.deepEqual([...values.keys()].sort(), ["--id-color-interaction", "--id-color-accent-hover", "--id-color-surface-selected", "--id-color-surface-selected-hover"].sort());
    }
    scopes.set(key, values);
  }
  const palettes = new Map<string, Map<string, string>>();
  for (const theme of ["light", "dark"]) for (const preset of ACCENT_COLORS) {
    const themeScope = theme === "dark" ? ':root[data-theme="dark"]' : ":root";
    assert.ok(scopes.has(themeScope), `missing ${theme} roles`);
    const accentScope = `${themeScope}[data-accent="${preset}"]`;
    if (preset !== "blue") assert.ok(scopes.has(accentScope), `missing ${theme}/${preset}`);
    palettes.set(`${theme}-${preset}`, new Map([...scopes.get(":root")!,
      ...(scopes.get(`:root[data-accent="${preset}"]`) ?? []),
      ...scopes.get(themeScope)!, ...(scopes.get(accentScope) ?? [])]));
  }
  for (const [name, values] of [...palettes]) {
    palettes.set(`${name}-flat`, new Map([...values, ...scopes.get(':root[data-page="flat"]')!]));
  }
  return palettes;
}

test("product tokens and Tailwind adapters have unique, acyclic definitions in every preset", () => {
  const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
  const adapters = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  const adapterValues = definitions(adapters);
  const palettes = accentPalettes(tokens);
  for (const palette of palettes.values()) {
    assert.equal(decodeURIComponent(palette.get("--id-image-select-chevron")!.match(/%23[\da-f]{6}/i)![0]),
      palette.get("--id-color-text-muted"), "select chevron follows the theme's readable secondary text");
    for (const name of adapterValues.keys()) assert.ok(!palette.has(name), `adapter overwrites product token: ${name}`);
    const values = new Map([...palette, ...adapterValues]);
    for (const name of values.keys()) {
      const visit = (current: string, path: string[]): void => {
        assert.ok(!path.includes(current), `token cycle: ${[...path, current].join(" → ")}`);
        const value = values.get(current);
        assert.ok(value, `undefined token ${current}`);
        for (const [, reference] of value.matchAll(/var\((--[\w-]+)/g)) visit(reference, [...path, current]);
      };
      visit(name, []);
    }
  }
  const values = new Map([...palettes.get("light-blue")!, ...adapterValues]);
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
  // Primary actions, heading numbers and selection share the chosen accent.
  assert.equal(values.get("--id-color-accent"), "var(--id-color-interaction)");
  assert.equal(values.get("--id-color-document-heading-number"), "var(--id-color-interaction)");
  assert.equal(values.get("--id-color-text-selected"), "var(--id-color-accent-hover)");
  assert.equal(values.get("--id-color-info"), "var(--id-color-text-muted)");
  assert.notEqual(values.get("--id-color-danger"), values.get("--id-color-interaction"));
  for (const name of ["--font-family-document", "--id-color-document-heading-number"]) {
    assert.ok(values.has(name), `missing document token: ${name}`);
  }
  assert.equal(values.get("--color-primary"), "var(--primary)");
  assert.doesNotMatch(tokens + adapters, /!important/);
});

test("every accent preset meets text, primary-action, focus and control contrast requirements", () => {
  const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
  for (const [preset, values] of accentPalettes(tokens)) {
    const resolve = (name: string): string => {
      const value = values.get(`--id-color-${name}`);
      assert.ok(value, `${preset}: missing ${name}`);
      const reference = /^var\(--id-color-([\w-]+)\)$/.exec(value);
      return reference ? resolve(reference[1]!) : value;
    };
    const luminance = (color: string) => {
      assert.match(color, /^#[\da-f]{6}$/i);
      return [1, 3, 5].map(offset => {
        const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index]!, 0);
    };
    const check = (fg: string, bg: string, minimum: number) => {
      const a = luminance(resolve(fg)), b = luminance(resolve(bg));
      const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      assert.ok(ratio >= minimum, `${preset}: ${fg} / ${bg} = ${ratio.toFixed(3)} < ${minimum}`);
    };
    for (const bg of ["paper", "surface", "surface-subtle", "surface-selected", "surface-selected-hover"]) {
      check("document-heading-number", bg, 4.5);
      check("text-selected", bg, 4.5);
    }
    for (const bg of ["accent", "accent-hover"]) check("text-on-accent", bg, 4.5);
    for (const bg of ["canvas", "paper", "surface", "surface-subtle", "surface-hover", "surface-pressed", "surface-selected", "surface-selected-hover"]) {
      check("border-focus", bg, 3);
      check("border-control", bg, 3);
    }
    for (const role of ["info", "danger", "warning"]) check(role, `surface-${role}`, 4.5);
    for (const bg of ["paper", "canvas", "surface", "surface-subtle", "surface-muted", "surface-hover", "surface-pressed"])
      for (const fg of ["text", "text-muted", "text-subtle"]) check(fg, bg, 4.5);
    for (const fg of ["info", "warning", "danger"]) check(fg, "surface-muted", 4.5);
    if (preset.startsWith("dark-")) for (const bg of ["paper", "surface-subtle"]) check("border", bg, 3);
  }
});

// These are interaction owners/content affordances, not a file-wide permission to add actions.
// Keep the reasons aligned with Visual Language's B1 exceptions.
const nativeButtons = new Map([
  ["CommandMenu.tsx:command-menu-item", "Menu keyboard/selection owner; #516 owns its row treatment."],
  ["DocumentEditor.tsx:document-title-slot", "Document-sized title placeholder."],
  ["editor-schema.tsx:label-target-edit", "Content-sized monospace section metadata."],
  ["cross-reference.tsx:cross-reference-edit", "Tiny inline corner target must not cover adjacent text."],
  ["citation.tsx:cross-reference-edit", "Same inline corner exception for citations."],
  ["citation.tsx:citation-key-remove", "Chip-sized remove target preserves line height and neighboring keys."],
  ["shell/DocumentTabs.tsx:role=tab", "Roving tab keyboard owner in its 40px navigation row."],
  ["shell/DocumentTabs.tsx:document-tab-close", "28px close slot retains square tab-row geometry pending #515."],
  ["shell/DocumentPanel.tsx:document-outline-item", "Outline list navigation and independent focus owner."],
  ["shell/DocumentStart.tsx:document-start-folder", "Wrapping recent-folder list row, not a fixed action."],
  ["shell/FolderDialog.tsx:folder-picker-option", "Recent-folder list option retains picker navigation."],
  ["shell/Sidebar.tsx:sidebar-tree-item", "Recent-folder tree row retains navigation geometry."],
  ["shell/AiPanel.tsx:ai-panel-mode", "SPIKE: segmented radio for the AI panel question/edit mode."],
]);

test("UI consumers use shared colors, control geometry and reasoned native-button exceptions", () => {
  const root = new URL("../src/", import.meta.url);
  const failures: string[] = [];
  const seenNative = new Set<string>();
  const controlClasses = new Set<string>();
  const api = new API();
  try {
    using snapshot = api.updateSnapshot({ openProjects: [fileURLToPath(new URL("../tsconfig.json", import.meta.url))] });
    const project = snapshot.getProjects().find(p => p.configFileName.endsWith("/editor/tsconfig.json"));
    assert.ok(project, "Editor TypeScript project is required for JSX inspection");
    const color = /#[\da-f]{3,8}\b|%23[\da-f]{6}\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|color)\([^)]*\)|\b(?:bg|text|border|ring)-(?:blue|red|gray|slate|zinc|neutral|stone|green|amber)-\d+/gi;
    const checkColors = (file: string, value: string, mechanism = "") => {
      for (const [literal] of value.matchAll(color)) {
        // Mask alpha and transparent ring bookkeeping paint no UI color.
        if (file === "styles.css" && ((mechanism === "mask-image" && literal === "#000") ||
          (mechanism === "--tw-ring-shadow" && literal === "#0000"))) continue;
        failures.push(`${file}: literal UI color ${literal}`);
      }
    };
    const cssExceptions = new Map([
      [".equation-input|min-height|5rem", "Multiline LaTeX field minimum, not a single-line control."],
      [".selection-toolbar.cross-reference-form|width|22rem", "Overlay width, not action geometry."],
      [".message-dismiss|min-width|1.5rem", "Existing 24px floor beneath the shared Button's actual 28px target."],
      [".message-dismiss|min-height|1.5rem", "Existing 24px floor beneath the shared Button's actual 28px target."],
    ]);
    // Gather actual JSX control classes before scanning CSS, including names without "button".
    const files = readdirSync(root, { recursive: true, encoding: "utf8" }).sort((a, b) =>
      Number(a.endsWith(".css")) - Number(b.endsWith(".css")) || a.localeCompare(b));
    for (const name of files) {
      const file = name.replaceAll("\\", "/");
      if (!/\.(css|tsx?)$/.test(file) || file === "styles/tokens.css") continue;
      const source = readFileSync(new URL(file, root), "utf8");
      if (file.endsWith(".css")) {
        const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
        for (const [, selectorText, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
          const selector = selectorText.trim().replace(/\s+/g, " ");
          for (const [, property, raw] of body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/g)) {
            const value = raw.trim();
            checkColors(file, value, property);
            // Only control consumers; document/layout dimensions and multiline surfaces have other contracts.
            const hasControlClass = [...selector.matchAll(/\.([\w-]+)/g)].some(([, name]) => controlClasses.has(name));
            if ((!hasControlClass && !/button|input|select|\.form-|\.folder-picker-field/.test(selector)) ||
              !/^(?:(?:min-|max-)?(?:height|width)|border-radius)$/.test(property)) continue;
            if (/(?<![\w-])(?:[1-9]\d*(?:\.\d+)?|0?\.\d+)(?:px|rem)\b/.test(value) &&
              !cssExceptions.has(`${selector}|${property}|${value}`)) failures.push(`${file}: literal control size ${selector} { ${property}: ${value} }`);
          }
        }
        continue;
      }
      const ast = project.program.getSourceFile(fileURLToPath(new URL(file, root)));
      assert.ok(ast, `TypeScript did not inspect ${file}`);
      const visit = (node: ts.Node): void => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) checkColors(file, node.text);
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(ast);
          const attribute = (key: string) => {
            const attr = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(ast) === key);
            if (!attr || !ts.isJsxAttribute(attr)) return "";
            const init = attr.initializer;
            if (init && ts.isStringLiteral(init)) return init.text;
            if (init && ts.isJsxExpression(init) && init.expression && ts.isTemplateExpression(init.expression)) return init.expression.head.text;
            return "";
          };
          if (tag === "button") {
            const identity = attribute("className").split(/\s/)[0] || `role=${attribute("role")}`;
            const key = `${file}:${identity}`;
            if (!nativeButtons.has(key)) failures.push(`${file}: native action button outside allowlist (${identity})`);
            seenNative.add(key);
          }
          if (["button", "Button", "input", "Input", "select"].includes(tag)) {
            for (const name of attribute("className").split(/\s+/)) if (/^[\w-]+$/.test(name)) controlClasses.add(name);
            // Check inline numeric geometry as well as arbitrary/fixed Tailwind control dimensions.
            for (const attr of node.attributes.properties) {
              if (!ts.isJsxAttribute(attr)) continue;
              const key = attr.name.getText(ast), text = attr.initializer?.getText(ast) ?? "";
              if (key === "style" && /\b(?:height|minHeight|maxHeight|width|minWidth|maxWidth|borderRadius)\s*:\s*(?:\d|["'`]\d+(?:px|rem))/.test(text)) failures.push(`${file}: literal inline control size ${text}`);
              if (key === "className" && /\b(?:h|min-h|max-h|size|rounded)-(?:\d+(?:\.\d+)?\b|\[[^\]]*\d+(?:px|rem)\b)/.test(text)) failures.push(`${file}: literal Tailwind control size ${text}`);
            }
          }
        }
        node.forEachChild(visit);
      };
      visit(ast);
    }
    for (const key of nativeButtons.keys()) assert.ok(seenNative.has(key), `remove stale native-button exception ${key}`);
    assert.deepEqual(failures, []);
  } finally {
    api.close();
  }
});
