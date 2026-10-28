import assert from "node:assert/strict";
import path from "node:path";
import type { Page } from "@playwright/test";
import { build } from "vite";
import { PAGE_BACKGROUNDS, THEMES } from "../../src/preferences.ts";
import { REPOSITORY_ROOT } from "./fixtures.ts";

type AppearanceWindow = Window & {
  theme: typeof import("../../src/theme.ts");
  appearances: string[][];
};

/** Execute the real renderer bridge producer with production-minified CSS, without Electron. */
export async function verifyBuiltAppearance(parent: Page): Promise<void> {
  const result = await build({
    configFile: false, logLevel: "error", root: path.join(REPOSITORY_ROOT, "apps/editor"),
    build: { write: false, minify: true, cssMinify: true,
      lib: { entry: "src/theme.ts", formats: ["es"], fileName: "theme" } },
  });
  const bundle = Array.isArray(result) ? result[0]! : result;
  assert.ok("output" in bundle);
  const js = bundle.output.find(item => item.type === "chunk")!;
  const css = bundle.output.find(item => item.type === "asset" && item.fileName.endsWith(".css"))!;
  assert.ok(js.type === "chunk" && css.type === "asset");
  assert.match(String(css.source), /--id-color-paper:\s*#fff[;}]/, "exercise the actual short-hex production token");
  const page = await parent.context().newPage();
  try {
    await page.route("**/__appearance/*", route => {
      const name = new URL(route.request().url()).pathname.split("/").at(-1);
      return route.fulfill(name === "theme.js" ? { contentType: "text/javascript", body: js.code }
        : name === "theme.css" ? { contentType: "text/css", body: String(css.source) }
        : { contentType: "text/html", body: `<!doctype html><link rel="stylesheet" href="theme.css"><script type="module">
          window.appearances = [];
          window.ieumdocDesktop = {
            setTheme: async theme => theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches),
            setWindowBackground: async (color, overlay) => { window.appearances.push([color, overlay.color, overlay.symbolColor]); }
          };
          const theme = await import('./theme.js');
          await theme.themeReady;
          window.theme = theme;
        </script>` });
    });
    await page.goto(new URL("/__appearance/index.html", parent.url()).href);
    await page.waitForFunction(() => !!(window as unknown as AppearanceWindow).theme);
    // visual-tokens.test.ts checks that all accents resolve the same native roles.
    const accent = "blue";
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      for (const theme of THEMES) for (const background of PAGE_BACKGROUNDS) {
        const actual = await page.evaluate(async ({ theme, background, accent }) => {
          const state = window as unknown as AppearanceWindow;
          document.documentElement.dataset.accent = accent;
          await state.theme.applyTheme(theme);
          state.theme.applyPageBackground(background);
          const sent = state.appearances.at(-1)!;
          // Compare displayed CSS colors independently of hex spelling.
          const probe = document.createElement("span");
          document.body.append(probe);
          const resolves = (color: string) => { probe.style.color = color; return getComputedStyle(probe).color; };
          const roles = ["canvas", "surface-subtle", "text"];
          const matches = roles.map((role, index) => resolves(sent[index]!) === resolves(`var(--id-color-${role})`));
          probe.remove();
          return { sent, matches };
        }, { theme, background, accent });
        const context = JSON.stringify({ colorScheme, theme, background, accent, ...actual });
        assert.ok(actual.sent.every(color => /^#[\da-f]{6}$/i.test(color)), `main rejects window appearance: ${context}`);
        assert.ok(actual.matches.every(Boolean), `native colors must match rendered roles: ${context}`);
      }
    }
  } finally {
    await page.close();
  }
}
