import { citationReport, parse } from "@ieumdoc/core";
import { test as base, expect, chromium, type BrowserContext, type ConsoleMessage, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { classifyConsoleErrors } from "./console-errors.ts";
import { finishScenarioDiagnostics, savedSourceAssertion } from "./diagnostics.ts";
import { prepareBrowserFixtures, REPOSITORY_ROOT, SOURCE_DIRS } from "./fixtures.ts";
import { STABLE_SCENARIOS } from "./scenarios.ts";
import { activeDocument, openDocument, reloadDocument } from "./navigation.ts";
import { withBlockHover } from "./hover.ts";
import { recoveryRecords } from "./recovery-records.ts";

const url = process.env.IEUMDOC_BROWSER_URL ?? (process.env.IEUMDOC_BROWSER_HOST === "http" ? "http://127.0.0.1:5181" : "http://127.0.0.1:5173");
const scenarios: string[] = process.env.IEUMDOC_BROWSER_SCENARIOS ? JSON.parse(process.env.IEUMDOC_BROWSER_SCENARIOS) : [...STABLE_SCENARIOS];
const screenshots = process.env.IEUMDOC_BROWSER_SCREENSHOTS === "true";
const channel = process.env.IEUMDOC_BROWSER_CHANNEL ?? (process.platform === "win32" ? "chrome" : undefined);
if (channel && channel !== "chrome" && channel !== "msedge") throw new Error("Unsupported browser channel");
const profile = path.join(tmpdir(), "ieumdoc-browser-profile", createHash("sha256").update(REPOSITORY_ROOT).digest("hex").slice(0, 16) + (channel === "msedge" ? "-edge" : ""));

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
      ...(channel ? { channel } : {}),
      headless: true,
      locale: "en-US",
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
      await initial.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" });
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
    await session.tracing.start({ screenshots: true, snapshots: true, sources: true });
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
      // Establish this origin without mounting App against the previous scenario's paths.
      // Scratch preparation may already have removed those files. The route is consumed once;
      // the real startup below, and all reloads inside the scenario, use the actual Editor.
      await page.route("**/*", route => route.fulfill({ contentType: "text/html", body: "<!doctype html>" }), { times: 1 });
      await page.goto(url);
      // Keep the persistent browser profile, but isolate recovery records and opened folders between
      // scenarios. Reloads inside a scenario deliberately retain both for persistence checks.
      await page.evaluate(() => {
        localStorage.removeItem("ieumdoc.openFolders");
        localStorage.removeItem("ieumdoc.openTabs");
      });
      await page.evaluate(() => new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase("ieumdoc-recovery");
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }));
      await page.reload();
      await page.locator('[data-testid="status"][data-operation="ready"]').waitFor({ state: "attached" });
      await page.mouse.move(0, 0);
      await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement instanceof HTMLElement && document.activeElement.blur(); });
      await use(page);
    } finally {
      const classification = classifyConsoleErrors(testInfo.title, errors);
      try {
        await finishScenarioDiagnostics(session, page, testInfo, { errors, ...classification });
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
    const scenario = runInNewContext(`(${source})`) as (page: Page, options: { assertSavedSource: ReturnType<typeof savedSourceAssertion>; screenshots: boolean; expect: typeof expect; recoveryRecords: typeof recoveryRecords; openDocument: typeof openDocument; reloadDocument: typeof reloadDocument; activeDocument: typeof activeDocument; withBlockHover: typeof withBlockHover; removeTabFixture: () => void; bibliographyFixture: unknown }) => Promise<unknown>;
    const bibliographyPath = path.join(REPOSITORY_ROOT, "tmp", name === "http-host" ? "http-host-a" : "bibliography", "refs.bib");
    const initialBibliography = ["bibliography", "http-host"].includes(name) ? readFileSync(bibliographyPath, "utf8") : "";
    const bibliographyFixture = {
      read: () => readFileSync(bibliographyPath, "utf8"),
      hash: () => createHash("sha256").update(readFileSync(bibliographyPath)).digest("hex"),
      change: (mode: "updated" | "invalid" | "restore") => writeFileSync(bibliographyPath,
        mode === "updated" ? initialBibliography.replace("Control Study", "Updated Study") : mode === "invalid" ? "@article{broken" : initialBibliography),
      report: (markdown: string, text: string) => citationReport(parse(markdown), [{ source: "../refs.bib", status: "ok", text }]),
    };
    const result = await scenario(page, { assertSavedSource: savedSourceAssertion(test.info()), screenshots, expect, recoveryRecords, openDocument, reloadDocument, activeDocument, withBlockHover, bibliographyFixture,
      // Simulate an external deletion of this one disposable file. The fixture resets it afterward.
      removeTabFixture: () => unlinkSync(path.join(REPOSITORY_ROOT, "tmp/document-tabs/technical-1.md")),
    });
    if (result !== undefined) {
      const resultPath = test.info().outputPath("scenario-result.json");
      writeFileSync(resultPath, JSON.stringify(result, null, 2));
      await test.info().attach("scenario-result", { path: resultPath, contentType: "application/json" });
    }
  });
}
