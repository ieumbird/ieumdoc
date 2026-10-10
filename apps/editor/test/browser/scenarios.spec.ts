import { test as base, expect, chromium, type BrowserContext, type ConsoleMessage, type Page } from "@playwright/test";
import type { Editor } from "@tiptap/core";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { classifyConsoleErrors } from "./console-errors.ts";
import { prepareBrowserFixtures, REPOSITORY_ROOT, SOURCE_DIRS } from "./fixtures.ts";
import { STABLE_SCENARIOS } from "./scenarios.ts";

const url = process.env.IEUMDOC_BROWSER_URL ?? "http://127.0.0.1:5173";
const scenarios: string[] = process.env.IEUMDOC_BROWSER_SCENARIOS ? JSON.parse(process.env.IEUMDOC_BROWSER_SCENARIOS) : [...STABLE_SCENARIOS];
const screenshots = process.env.IEUMDOC_BROWSER_SCREENSHOTS === "true";
const profile = path.join(tmpdir(), "ieumdoc-browser-profile", createHash("sha256").update(REPOSITORY_ROOT).digest("hex").slice(0, 16));

function sourceDigest(): string {
  const hash = createHash("sha256");
  for (const directory of SOURCE_DIRS) {
    for (const name of readdirSync(directory, { recursive: true, encoding: "utf8" }).sort()) {
      const file = path.join(directory, name);
      if (statSync(file).isFile()) hash.update(name).update(readFileSync(file));
    }
  }
  return hash.digest("hex");
}

const test = base.extend<{}, { session: BrowserContext }>({
  session: [async ({}, use) => {
    const before = sourceDigest();
    const context = await chromium.launchPersistentContext(profile, {
      ...(process.platform === "win32" ? { channel: "chrome" } : {}),
      headless: true,
      viewport: { width: 1280, height: 720 },
    });
    try {
      await context.clearCookies();
      const scratch = path.join(REPOSITORY_ROOT, "tmp").replaceAll("\\", "/") + "/";
      await context.route("**/api/document**", route => {
        if (route.request().method() === "GET") return route.continue();
        const file = String(route.request().postDataJSON()?.path ?? "").replaceAll("\\", "/");
        if (!file.startsWith(scratch) || file.split("/").includes("..")) {
          return route.fulfill({ status: 403, json: { error: "Browser tests may write scratch files only." } });
        }
        return route.continue();
      });
      const initial = await context.newPage();
      await initial.goto(url);
      await initial.locator('[data-testid="status"][data-operation="Ready"]').waitFor({ state: "attached" });
      await initial.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      const rejected = await initial.evaluate(async file => {
        const response = await fetch("/api/document", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: file, revision: "invalid-guard-probe" }) });
        return response.status;
      }, path.join(REPOSITORY_ROOT, "apps/editor/document/technical-document.md"));
      expect(rejected).toBe(403);
      await initial.close();
      await use(context);
    } finally {
      try {
        await context.close();
      } finally {
        try {
          expect(sourceDigest(), "Committed source fixtures changed").toBe(before);
        } finally {
          prepareBrowserFixtures();
        }
      }
    }
  }, { scope: "worker" }],
  page: async ({ session }, use, testInfo) => {
    prepareBrowserFixtures();
    const page = await session.newPage();
    const errors: string[] = [];
    const consoleListener = (message: ConsoleMessage) => {
      if (message.type() === "error") {
        const location = message.location();
        errors.push(message.text() + (location.url ? " @ " + location.url : ""));
      }
    };
    const pageErrorListener = (error: Error) => errors.push("Uncaught page error: " + error.message);
    page.on("console", consoleListener);
    page.on("pageerror", pageErrorListener);
    try {
      await page.goto(url);
      await page.locator('[data-testid="status"][data-operation="Ready"]').waitFor({ state: "attached" });
      await page.mouse.move(0, 0);
      await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement instanceof HTMLElement && document.activeElement.blur(); });
      await use(page);
    } finally {
      const classification = classifyConsoleErrors(testInfo.title, errors);
      try {
        if (testInfo.status !== testInfo.expectedStatus || classification.unexpected.length || classification.missing.length) {
          const diagnostic = await page.evaluate(() => {
            const visible = (element: Element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
            const editor = document.querySelector<HTMLElement & { editor?: Editor }>(".document-editor");
            const instance = editor?.editor;
            const selection = instance?.state.selection;
            const active = document.activeElement;
            return {
              url: location.href,
              viewport: [innerWidth, innerHeight],
              activeElement: active ? { tag: active.tagName, testId: active.getAttribute("data-testid"), role: active.getAttribute("role"), label: active.getAttribute("aria-label"), className: typeof active.className === "string" ? active.className : "" } : null,
              editorFocused: instance?.view.hasFocus() ?? false,
              selection: selection ? { type: selection.constructor.name, empty: selection.empty, from: selection.from, to: selection.to, parent: selection.$from.parent.type.name, text: instance!.state.doc.textBetween(selection.from, selection.to, " ") } : null,
              visibleMenus: [...document.querySelectorAll<HTMLElement>('[role="menu"]')].filter(visible).map(element => ({ label: element.getAttribute("aria-label"), text: element.innerText })),
              visibleMenuItems: [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter(visible).map(element => element.innerText),
              visibleDialogs: [...document.querySelectorAll('[role="dialog"]')].filter(visible).map(element => ({ label: element.getAttribute("aria-label"), testId: element.getAttribute("data-testid") })),
              status: document.querySelector<HTMLElement>('[data-testid="status"]')?.innerText ?? null,
              editorTextLength: editor?.innerText.length ?? 0,
            };
          }).catch(error => ({ diagnosticError: String(error) }));
          await testInfo.attach("browser-state", { body: JSON.stringify(diagnostic), contentType: "application/json" });
        }
      } finally {
        page.off("console", consoleListener);
        page.off("pageerror", pageErrorListener);
        // Closing the scenario's page removes its routes without waiting on a failed delayed mock.
        await page.close();
      }
      await testInfo.attach("console-errors", { body: JSON.stringify({ errors, ...classification }), contentType: "application/json" });
      expect(classification.unexpected, "Unexpected console/page errors").toEqual([]);
      expect(classification.missing, "Missing expected HTTP failures").toEqual([]);
    }
  },
});

for (const name of scenarios) {
  test(name, async ({ page }) => {
    const source = readFileSync(path.join(REPOSITORY_ROOT, "apps/editor/test", `${name}.browser.js`), "utf8");
    const scenario = runInNewContext(`(${source})`) as (page: Page, options: { screenshots: boolean }) => Promise<unknown>;
    await scenario(page, { screenshots });
  });
}
